import { mkdtemp, mkdir, writeFile, chmod, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { searchVault, rgArgs } from '../src/search.js'

let tmp: string
afterEach(async () => { if (tmp) await rm(tmp, { recursive: true, force: true }) })

async function makeVault(): Promise<string> {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'vault-'))
  await mkdir(path.join(tmp, 'notes'), { recursive: true })
  await mkdir(path.join(tmp, '.obsidian'), { recursive: true })
  await writeFile(path.join(tmp, 'a.md'), 'alpha line\nbeta alpha\n')
  await writeFile(path.join(tmp, 'notes', 'b.md'), 'alpha here\nnothing\n')
  await writeFile(path.join(tmp, '.obsidian', 'app.json'), 'alpha hidden')
  return tmp
}

describe('searchVault', () => {
  it('finds matches from rg JSON output with a Windows drive-letter path', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'vault-'))
    const bin = path.join(tmp, 'bin')
    const vault = path.join(tmp, 'vault')
    const file = process.platform === 'win32'
      ? path.join(vault, 'notes', 'match.md')
      : path.join(vault, 'D:', 'notes', 'match.md')
    await mkdir(bin, { recursive: true })
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, 'keyword')

    const rgEvent = JSON.stringify({ type: 'match', data: { path: { text: file }, line_number: 1 } })
    await writeFile(path.join(bin, 'rg'), `#!/bin/sh\nif [ "$1" = "--version" ]; then exit 0; fi\nprintf '%s\\n' '${rgEvent}'\n`)
    await writeFile(path.join(bin, 'rg.cmd'), `@echo off\r\nif "%1"=="--version" exit /b 0\r\necho ${rgEvent}\r\n`)

    if (process.platform !== 'win32') {
      await chmod(path.join(bin, 'rg'), 0o755)
    }

    const previousPath = process.env.PATH
    process.env.PATH = bin + path.delimiter + previousPath
    try {
      vi.resetModules()
      const { searchVault: searchWithFakeRg } = await import('../src/search.js')
      const hits = await searchWithFakeRg(vault, [], 'keyword')
      expect(hits).toEqual([{
        path: path.relative(vault, file).replaceAll('\\', '/'),
        line: 1,
        lineText: 'keyword',
        contextBefore: [],
        contextAfter: [],
      }])
    } finally {
      process.env.PATH = previousPath
    }
  })

  it('falls back to the JS scanner when ripgrep is unavailable', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'vault-'))
    const bin = path.join(tmp, 'bin')
    const vault = path.join(tmp, 'vault')
    await mkdir(bin, { recursive: true })
    await mkdir(vault, { recursive: true })
    await writeFile(path.join(vault, 'fallback.md'), 'fallback keyword')
    await writeFile(path.join(bin, 'rg'), '#!/bin/sh\nif [ "$1" = "--version" ]; then exit 1; fi\nexit 2\n')
    await writeFile(path.join(bin, 'rg.cmd'), '@echo off\r\nif "%1"=="--version" exit /b 1\r\nexit /b 2\r\n')
    if (process.platform !== 'win32') await chmod(path.join(bin, 'rg'), 0o755)

    const previousPath = process.env.PATH
    process.env.PATH = bin + path.delimiter + previousPath
    try {
      vi.resetModules()
      const { searchVault: searchWithoutRg } = await import('../src/search.js')
      await expect(searchWithoutRg(vault, [], 'keyword')).resolves.toMatchObject([
        { path: 'fallback.md', line: 1, lineText: 'fallback keyword' },
      ])
    } finally {
      process.env.PATH = previousPath
    }
  })

  it('finds matches with line numbers and context, sorted', async () => {
    const v = await makeVault()
    const hits = await searchVault(v, ['.obsidian', '.git', '.trash'], 'alpha')
    expect(hits.map((h) => `${h.path}:${h.line}`)).toEqual(['a.md:1', 'a.md:2', 'notes/b.md:1'])
    expect(hits[0].contextAfter).toEqual(['beta alpha'])
  })

  it('returns slash-separated paths and strips CR from CRLF lines', async () => {
    const v = await makeVault()
    await writeFile(path.join(v, 'notes', 'crlf.md'), 'before\r\nneedle here\r\nafter\r\n')
    const hits = await searchVault(v, [], 'needle', { context: 1 })
    expect(hits).toEqual([{
      path: 'notes/crlf.md',
      line: 2,
      lineText: 'needle here',
      contextBefore: ['before'],
      contextAfter: ['after'],
    }])
  })

  it('recognizes mixed-case Markdown extensions only on Windows', async () => {
    const v = await makeVault()
    await writeFile(path.join(v, 'notes', 'upper.MD'), 'upper extension keyword')
    const hits = await searchVault(v, [], 'extension')
    if (process.platform === 'win32') expect(hits.map((h) => h.path)).toEqual(['notes/upper.MD'])
    else expect(hits).toEqual([])
  })

  it('uses Unicode case folding consistently for the search backends', async () => {
    const v = await makeVault()
    await writeFile(path.join(v, 'sigma.md'), 'ς final sigma')
    await writeFile(path.join(v, 'symbol-beta.md'), 'ϐ symbol beta')
    await writeFile(path.join(v, 'dotted-i.md'), 'İ')
    await writeFile(path.join(v, 'cherokee.md'), 'Ꭰ')
    const hits = await searchVault(v, [], 'σ')
    expect(hits.map((h) => h.path)).toContain('sigma.md')
    expect((await searchVault(v, [], 'β')).map((h) => h.path)).toContain('symbol-beta.md')
    expect((await searchVault(v, [], 'i')).map((h) => h.path)).not.toContain('dotted-i.md')
    expect((await searchVault(v, [], 'ꭰ')).map((h) => h.path)).toContain('cherokee.md')
  })

  it('excludes hidden dirs and configured excludeDirs', async () => {
    const v = await makeVault()
    const hits = await searchVault(v, ['.obsidian'], 'hidden')
    expect(hits).toEqual([])
  })

  it('limits the number of results', async () => {
    const v = await makeVault()
    const hits = await searchVault(v, [], 'alpha', { limit: 1 })
    expect(hits.length).toBe(1)
  })

  it('is case-insensitive', async () => {
    const v = await makeVault()
    const hits = await searchVault(v, [], 'ALPHA')
    expect(hits.length).toBe(3)
  })

  it('excludes non-markdown files', async () => {
    const v = await makeVault()
    await writeFile(path.join(v, 'notes', 'data.json'), 'alpha json')
    const hits = await searchVault(v, [], 'json')
    expect(hits).toEqual([])
  })

  it('treats the query as a literal substring, not a regex', async () => {
    const v = await makeVault()
    await writeFile(path.join(v, 'regex.md'), 'literal a.b here\nregex axb here\n')
    const hits = await searchVault(v, [], 'a.b')
    expect(hits.map((h) => h.lineText)).toEqual(['literal a.b here'])
  })

  it('rejects a dir escaping the vault', async () => {
    const v = await makeVault()
    await expect(searchVault(v, [], 'x', { dir: '../secret' })).rejects.toThrow(/escapes/)
  })

  it('does not respect .gitignore (matches the JS scanner)', async () => {
    const v = await makeVault()
    await writeFile(path.join(v, '.gitignore'), 'ignored/\n')
    await mkdir(path.join(v, 'ignored'), { recursive: true })
    await writeFile(path.join(v, 'ignored', 'c.md'), 'secret needle here')
    const hits = await searchVault(v, [], 'needle')
    expect(hits.map((h) => h.path)).toContain('ignored/c.md')
  })
})

describe('rgArgs', () => {
  it('disables ignore files so results match the JS scanner', () => {
    const args = rgArgs('alpha', ['.obsidian', '.git', '.trash'])
    expect(args).toContain('--json')
    expect(args).toContain('--no-ignore')
    expect(args).toContain('!**/.obsidian/**')
  })
})
