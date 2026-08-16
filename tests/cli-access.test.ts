import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CliAccess } from '../src/cli-access.js'

vi.mock('../src/spawn.js', () => ({
  run: vi.fn(),
  binaryAvailable: vi.fn(),
}))

import { run } from '../src/spawn.js'
const runMock = run as unknown as ReturnType<typeof vi.fn>

beforeEach(() => { runMock.mockReset() })

describe('CliAccess.backlinks', () => {
  it('maps CLI JSON when the CLI succeeds', async () => {
    runMock.mockResolvedValue({ stdout: JSON.stringify([{ path: 'x.md', snippet: 'see [[y]]' }]), stderr: '' })
    const a = new CliAccess('/tmp/vault', [])
    const backlinks = await a.backlinks('y.md')
    expect(backlinks).toEqual([{ path: 'x.md', title: 'x', snippet: 'see [[y]]' }])
    expect(runMock).toHaveBeenCalledWith('obsidian', ['backlinks', 'path=y.md', 'format=json'], { cwd: '/tmp/vault' })
  })

  it('falls back to the fs scan when the CLI fails', async () => {
    runMock.mockRejectedValue(new Error('no cli'))
    const a = new CliAccess('/tmp/nonexistent-vault-xyz', [])
    await expect(a.backlinks('y.md')).resolves.toEqual([])
  })
})

describe('CliAccess.move', () => {
  it('reports linksUpdated when the CLI move succeeds', async () => {
    runMock.mockResolvedValue({ stdout: '', stderr: '' })
    const a = new CliAccess('/tmp/vault', [])
    const m = await a.move('a.md', 'b.md')
    expect(m).toEqual({ from: 'a.md', to: 'b.md', linksUpdated: true })
    expect(runMock).toHaveBeenCalledWith('obsidian', ['move', 'path=a.md', 'to=b.md'], { cwd: '/tmp/vault' })
  })
})
