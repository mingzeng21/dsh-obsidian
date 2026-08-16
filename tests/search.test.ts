import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it, expect } from 'vitest'
import { searchVault } from '../src/search.js'

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
})
