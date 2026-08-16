import path from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
import { run, binaryAvailable } from './spawn.js'
import type { SearchHit } from './access.js'

export interface SearchOptions { dir?: string; context?: number; limit?: number }
interface RawMatch { file: string; line: number }

export async function searchVault(
  vaultRoot: string,
  excludeDirs: string[],
  query: string,
  opts: SearchOptions = {},
): Promise<SearchHit[]> {
  const context = opts.context ?? 1
  const limit = opts.limit ?? 50
  const base = opts.dir ? path.join(vaultRoot, opts.dir) : vaultRoot
  const matches = await rawMatches(base, excludeDirs, query)
  matches.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1))
  const hits: SearchHit[] = []
  const cache = new Map<string, string[]>()
  for (const { file, line } of matches) {
    if (hits.length >= limit) break
    let lines = cache.get(file)
    if (!lines) {
      lines = (await readFile(file, 'utf8')).split('\n')
      cache.set(file, lines)
    }
    const idx = line - 1
    hits.push({
      path: path.relative(vaultRoot, file),
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
    else if (e.name.endsWith('.md')) files.push(full)
  }
  return files
}

async function rawMatches(base: string, excludeDirs: string[], query: string): Promise<RawMatch[]> {
  if (await binaryAvailable('rg')) {
    try {
      return await rgMatches(base, excludeDirs, query)
    } catch {
      // fall through to the JS scan
    }
  }
  return jsMatches(base, excludeDirs, query)
}

async function rgMatches(base: string, excludeDirs: string[], query: string): Promise<RawMatch[]> {
  const args = ['-n', '-i', '-F', '--no-heading', '--with-filename', '-e', query]
  for (const d of excludeDirs) args.push('-g', `!**/${d}/**`)
  args.push(base)
  const { stdout } = await run('rg', args)
  const out: RawMatch[] = []
  for (const line of stdout.split('\n')) {
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const file = line.slice(0, idx)
    const rest = line.slice(idx + 1)
    const idx2 = rest.indexOf(':')
    if (idx2 < 0) continue
    const lineNo = Number(rest.slice(0, idx2))
    if (Number.isInteger(lineNo)) out.push({ file, line: lineNo })
  }
  return out.filter((m) => m.file.endsWith('.md'))
}

async function jsMatches(base: string, excludeDirs: string[], query: string): Promise<RawMatch[]> {
  const needle = query.toLowerCase()
  const out: RawMatch[] = []
  for (const file of await walkMarkdownFiles(base, excludeDirs)) {
    const lines = (await readFile(file, 'utf8')).split('\n')
    lines.forEach((text, i) => {
      if (text.toLowerCase().includes(needle)) out.push({ file, line: i + 1 })
    })
  }
  return out
}
