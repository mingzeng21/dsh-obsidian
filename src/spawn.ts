import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'

export interface RunResult { stdout: string; stderr: string }

export async function run(cmd: string, args: string[], opts: { cwd?: string } = {}): Promise<RunResult> {
  const executable = await resolveCommand(cmd)
  return new Promise((resolve, reject) => {
    const child = spawnCommand(executable, args, opts.cwd, 'pipe')
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim()}`))
    })
  })
}

const availabilityCache = new Map<string, boolean>()

export async function binaryAvailable(cmd: string): Promise<boolean> {
  const cached = availabilityCache.get(cmd)
  if (cached !== undefined) return cached
  const executable = await resolveCommand(cmd)
  let available = false
  try {
    available = await new Promise<boolean>((resolve) => {
      const child = spawnCommand(executable, ['--version'], undefined, 'ignore')
      child.on('error', () => resolve(false))
      child.on('exit', (code) => resolve(code === 0))
    })
  } catch {
    available = false
  }
  availabilityCache.set(cmd, available)
  return available
}

async function resolveCommand(cmd: string): Promise<string> {
  if (process.platform !== 'win32') return cmd
  const hasPath = cmd.includes('\\') || cmd.includes('/') || path.win32.isAbsolute(cmd)
  const hasExecutableExtension = /\.(?:com|exe|bat|cmd)$/i.test(cmd)
  const suffixes = hasExecutableExtension ? [''] : windowsPathExtensions()
  const names = [...new Set(suffixes.map((suffix) => `${cmd}${suffix}`))]
  const candidates = hasPath
    ? names
    : (process.env.PATH ?? '').split(path.delimiter).filter(Boolean).flatMap((dir) =>
        names.map((name) => path.win32.join(dir.replace(/^"|"$/g, ''), name)))
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the next PATHEXT candidate.
    }
  }
  return cmd
}

function windowsPathExtensions(): string[] {
  return (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .filter(Boolean)
    .map((ext) => ext.toLowerCase())
}

function spawnCommand(cmd: string, args: string[], cwd: string | undefined, stdio: 'pipe'): ChildProcessWithoutNullStreams
function spawnCommand(cmd: string, args: string[], cwd: string | undefined, stdio: 'ignore'): ChildProcess
function spawnCommand(cmd: string, args: string[], cwd?: string, stdio: 'pipe' | 'ignore' = 'pipe') {
  const isWindowsScript = process.platform === 'win32' && /\.(?:bat|cmd)$/i.test(cmd)
  if (!isWindowsScript) {
    return stdio === 'pipe'
      ? spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
      : spawn(cmd, args, { cwd, stdio: 'ignore' })
  }
  if ([cmd, ...args].some((value) => /[%!&|<>^"();\r\n]/.test(value))) {
    throw new Error('refusing unsafe arguments for a Windows command script')
  }
  const comspec = process.env.ComSpec ?? process.env.COMSPEC ?? 'cmd.exe'
  const commandLine = [quoteWindowsArg(cmd), ...args.map(quoteWindowsArg)].join(' ')
  const shellCommand = commandLine.startsWith('"') ? `"${commandLine}"` : commandLine
  return spawn(comspec, ['/d', '/s', '/c', shellCommand], {
    cwd,
    stdio: stdio === 'pipe' ? ['ignore', 'pipe', 'pipe'] : 'ignore',
    windowsVerbatimArguments: true,
  })
}

function quoteWindowsArg(value: string): string {
  if (value !== '' && !/\s/.test(value)) return value
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')}"`
}
