import { spawn } from 'node:child_process'

export interface RunResult { stdout: string; stderr: string }

export function run(cmd: string, args: string[], opts: { cwd?: string } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'] })
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
  const available = await new Promise<boolean>((resolve) => {
    const child = spawn(cmd, ['--version'], { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
  availabilityCache.set(cmd, available)
  return available
}
