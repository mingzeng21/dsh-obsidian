import path from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
import { run, binaryAvailable } from './spawn.js'
import { guardPath, normalizeVaultPath } from './vault-path.js'
import { includesFolded } from './case-fold.js'
import type { SearchHit } from './access.js'

export interface SearchOptions { dir?: string; context?: number; limit?: number }
interface RawMatch { file: string; line: number }

interface RgMatchEvent {
  type?: string
  data?: {
    path?: { text?: string }
    line_number?: number
  }
}

export async function searchVault(
  vaultRoot: string,
  excludeDirs: string[],
  query: string,
  opts: SearchOptions = {},
): Promise<SearchHit[]> {
  const context = opts.context ?? 1
  const limit = opts.limit ?? 50
  const base = opts.dir ? guardPath(vaultRoot, opts.dir) : vaultRoot
  const matches = await rawMatches(base, excludeDirs, query)
  matches.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1))
  const hits: SearchHit[] = []
  const cache = new Map<string, string[]>()
  for (const { file, line } of matches) {
    if (hits.length >= limit) break
    let lines = cache.get(file)
    if (!lines) {
      lines = (await readFile(file, 'utf8')).split(/\r?\n/)
      cache.set(file, lines)
    }
    const idx = line - 1
    if (!includesFolded(lines[idx] ?? '', query)) continue
    hits.push({
      path: normalizeVaultPath(path.relative(vaultRoot, file)),
      line,
      lineText: lines[idx] ?? '',
      contextBefore: lines.slice(Math.max(0, idx - context), idx),
      contextAfter: lines.slice(idx + 1, idx + 1 + context),
    })
  }
  return hits
}

export async function walkMarkdownFiles(dir: string, excludeDirs: string[]): Promise<string[]> {
  const files: string[] = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return files
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || excludeDirs.includes(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) files.push(...(await walkMarkdownFiles(full, excludeDirs)))
    else if (isMarkdownFile(e.name)) files.push(full)
  }
  return files
}

async function rawMatches(base: string, excludeDirs: string[], query: string): Promise<RawMatch[]> {
  try {
    if (await binaryAvailable('rg')) {
      return await rgMatches(base, excludeDirs, query)
    }
  } catch {
    // fall through to the JS scan
  }
  return jsMatches(base, excludeDirs, query)
}

export function rgArgs(query: string, excludeDirs: string[]): string[] {
  const args = ['--json', '-n', '-i', '-F', '--no-heading', '--with-filename', '--no-ignore', '-e', query]
  for (const d of excludeDirs) args.push('-g', `!**/${d}/**`)
  return args
}

async function rgMatches(base: string, excludeDirs: string[], query: string): Promise<RawMatch[]> {
  const args = rgArgs(query, excludeDirs)
  args.push(base)
  const { stdout } = await run('rg', args)
  const out: RawMatch[] = []
  for (const line of stdout.split('\n')) {
    if (!line) continue
    let event: RgMatchEvent
    try {
      event = JSON.parse(line) as RgMatchEvent
    } catch {
      continue
    }
    if (event.type !== 'match') continue
    const file = event.data?.path?.text
    const lineNo = event.data?.line_number
    if (file && typeof lineNo === 'number' && Number.isInteger(lineNo)) out.push({ file, line: lineNo })
  }
  return out.filter((m) => isMarkdownFile(m.file))
}

async function jsMatches(base: string, excludeDirs: string[], query: string): Promise<RawMatch[]> {
  const needle = query
  const out: RawMatch[] = []
  for (const file of await walkMarkdownFiles(base, excludeDirs)) {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/)
    lines.forEach((text, i) => {
      if (includesFolded(text, needle)) out.push({ file, line: i + 1 })
    })
  }
  return out
}

function isMarkdownFile(filePath: string): boolean {
  const normalized = normalizeVaultPath(filePath)
  return process.platform === 'win32' ? normalized.toLowerCase().endsWith('.md') : normalized.endsWith('.md')
}
