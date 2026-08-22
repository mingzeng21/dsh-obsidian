import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it, expect } from 'vitest'
import { FsAccess } from '../src/fs-access.js'

let tmp: string
afterEach(async () => { if (tmp) await rm(tmp, { recursive: true, force: true }) })

async function makeVault(): Promise<string> {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'vault-'))
  await mkdir(path.join(tmp, 'notes'), { recursive: true })
  await writeFile(path.join(tmp, 'notes', 'one.md'), '---\ntitle: One\n---\nBody one\n\nSee [[two]].\n')
  await writeFile(path.join(tmp, 'notes', 'two.md'), '# Two\n\nLinks to [[one]].\n')
  return tmp
}

describe('FsAccess', () => {
  it('lists notes sorted by path', async () => {
    const a = new FsAccess(await makeVault(), ['.obsidian', '.git', '.trash'])
    expect(await a.list()).toEqual([
      { path: 'notes/one.md', title: 'one' },
      { path: 'notes/two.md', title: 'two' },
    ])
  })

  it('reads a note with parsed frontmatter', async () => {
    const a = new FsAccess(await makeVault(), [])
    const r = await a.read('notes/one.md')
    expect(r.title).toBe('one')
    expect(r.frontmatter).toEqual({ title: 'One' })
    expect(r.content).toContain('Body one')
  })

  it('finds backlinks', async () => {
    const a = new FsAccess(await makeVault(), [])
    const backlinks = await a.backlinks('notes/one.md')
    expect(backlinks).toHaveLength(1)
    expect(backlinks[0].path).toBe('notes/two.md')
  })

  it('writes a new note and reports created', async () => {
    const a = new FsAccess(await makeVault(), [])
    const w = await a.write('notes/three.md', 'hello')
    expect(w.created).toBe(true)
    expect(await readFile(path.join(tmp, 'notes', 'three.md'), 'utf8')).toBe('hello')
  })

  it('appends to an existing note', async () => {
    const a = new FsAccess(await makeVault(), [])
    await a.append('notes/two.md', 'appended')
    expect(await readFile(path.join(tmp, 'notes', 'two.md'), 'utf8')).toContain('appended')
  })

  it('leaves no temp files behind after write', async () => {
    const a = new FsAccess(await makeVault(), [])
    await a.write('notes/new.md', 'hello')
    const entries = await readdir(path.join(tmp, 'notes'))
    expect(entries).toContain('new.md')
    expect(entries.filter((e) => e.includes('.tmp'))).toHaveLength(0)
  })

  it('moves a note without updating links', async () => {
    const a = new FsAccess(await makeVault(), [])
    const m = await a.move('notes/two.md', 'archive/two.md')
    expect(m.linksUpdated).toBe(false)
    expect(await readFile(path.join(tmp, 'archive', 'two.md'), 'utf8')).toContain('# Two')
  })

  it('moves a note and updates links when the basename changes', async () => {
    const a = new FsAccess(await makeVault(), [])
    const m = await a.move('notes/two.md', 'notes/renamed.md')
    expect(m.linksUpdated).toBe(true)
    expect(await readFile(path.join(tmp, 'notes', 'one.md'), 'utf8')).toContain('[[renamed]]')
  })

  it('leaves no temp files behind after a link-updating move', async () => {
    const a = new FsAccess(await makeVault(), [])
    const m = await a.move('notes/two.md', 'notes/renamed.md')
    expect(m.linksUpdated).toBe(true)
    const entries = await readdir(path.join(tmp, 'notes'))
    expect(entries.filter((e) => e.includes('.tmp'))).toHaveLength(0)
  })

  it('moves a note into .trash on delete', async () => {
    const a = new FsAccess(await makeVault(), [])
    const d = await a.delete('notes/two.md')
    expect(d.trashedTo).toBe('.trash/notes/two.md')
    expect(await readFile(path.join(tmp, '.trash', 'notes', 'two.md'), 'utf8')).toContain('# Two')
  })

  it('does not overwrite an existing trash entry', async () => {
    const a = new FsAccess(await makeVault(), [])
    const d1 = await a.delete('notes/two.md')
    await a.write('notes/two.md', 'new content')
    const d2 = await a.delete('notes/two.md')
    expect(d2.trashedTo).not.toBe(d1.trashedTo)
  })

  it('rejects a path escaping the vault', async () => {
    const a = new FsAccess(await makeVault(), [])
    await expect(a.read('../secret.md')).rejects.toThrow(/escapes/)
  })

  it('sets and deletes a frontmatter property', async () => {
    const a = new FsAccess(await makeVault(), [])
    await a.setProperty('notes/one.md', 'status', 'done')
    const after = await a.read('notes/one.md')
    expect(after.frontmatter).toMatchObject({ title: 'One', status: 'done' })
    await a.deleteProperty('notes/one.md', 'status')
    const afterDel = await a.read('notes/one.md')
    expect(afterDel.frontmatter).toEqual({ title: 'One' })
  })

  it('lists tags with counts', async () => {
    const a = new FsAccess(await makeVault(), [])
    await a.write('notes/tagged.md', '---\ntags: [a, b]\n---\nsee #a')
    await a.write('notes/tagged2.md', '---\ntags: a\n---\nbody')
    const tags = await a.listTags()
    expect(tags).toEqual(expect.arrayContaining([{ tag: '#a', count: 2 }, { tag: '#b', count: 1 }]))
  })
})
