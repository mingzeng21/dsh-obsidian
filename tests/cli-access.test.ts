import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { CliAccess } from '../src/cli-access.js'

vi.mock('../src/spawn.js', () => ({ run: vi.fn(), binaryAvailable: vi.fn().mockResolvedValue(true) }))
import { run } from '../src/spawn.js'

let tmp: string
afterEach(async () => { vi.clearAllMocks(); if (tmp) await rm(tmp, { recursive: true, force: true }) })

async function makeVault(): Promise<string> {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'vault-'))
  await mkdir(path.join(tmp, 'notes'), { recursive: true })
  await writeFile(path.join(tmp, 'notes', 'one.md'), '---\ntitle: One\n---\nBody\n')
  return tmp
}

describe('CliAccess', () => {
  it('delegates setProperty to the obsidian CLI', async () => {
    vi.mocked(run).mockResolvedValue({ stdout: '', stderr: '' })
    const a = new CliAccess(await makeVault(), ['.obsidian', '.git', '.trash'])
    await a.setProperty('notes/one.md', 'status', 'done')
    expect(run).toHaveBeenCalledWith('obsidian', ['property:set', 'name=status', 'value=done', 'path=notes/one.md'], { cwd: a.vaultRoot })
  })

  it('falls back to fs when the CLI fails', async () => {
    vi.mocked(run).mockRejectedValue(new Error('no obsidian'))
    const a = new CliAccess(await makeVault(), ['.obsidian', '.git', '.trash'])
    const r = await a.setProperty('notes/one.md', 'status', 'done')
    expect(r.data).toMatchObject({ title: 'One', status: 'done' })
  })

  it('move does not invoke the CLI', async () => {
    const a = new CliAccess(await makeVault(), ['.obsidian', '.git', '.trash'])
    const m = await a.move('notes/one.md', 'notes/two.md')
    expect(run).not.toHaveBeenCalled()
    expect(m.linksUpdated).toBe(false)
  })
})
