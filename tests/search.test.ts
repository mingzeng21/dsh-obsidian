import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it, expect } from 'vitest'
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
  it('finds matches with line numbers and context, sorted', async () => {
    const v = await makeVault()
    const hits = await searchVault(v, ['.obsidian', '.git', '.trash'], 'alpha')
    expect(hits.map((h) => `${h.path}:${h.line}`)).toEqual(['a.md:1', 'a.md:2', 'notes/b.md:1'])
    expect(hits[0].contextAfter).toEqual(['beta alpha'])
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
    expect(args).toContain('--no-ignore')
    expect(args).toContain('!**/.obsidian/**')
  })
})
