import { beforeEach, describe, it, expect, vi } from 'vitest'

vi.mock('node:fs/promises', () => ({
  rename: vi.fn(),
  copyFile: vi.fn(),
  unlink: vi.fn(),
}))

import { rename, copyFile, unlink } from 'node:fs/promises'
import { renameAcrossDevices } from '../src/rename.js'

beforeEach(() => { vi.clearAllMocks() })

describe('renameAcrossDevices', () => {
  it('renames directly on the same filesystem', async () => {
    vi.mocked(rename).mockResolvedValue(undefined)
    await renameAcrossDevices('a.md', 'b.md')
    expect(rename).toHaveBeenCalledWith('a.md', 'b.md')
    expect(copyFile).not.toHaveBeenCalled()
    expect(unlink).not.toHaveBeenCalled()
  })

  it('falls back to copy + unlink when rename fails with EXDEV', async () => {
    vi.mocked(rename).mockRejectedValue(Object.assign(new Error('cross-device link'), { code: 'EXDEV' }))
    vi.mocked(copyFile).mockResolvedValue(undefined)
    vi.mocked(unlink).mockResolvedValue(undefined)
    await renameAcrossDevices('a.md', 'b.md')
    expect(copyFile).toHaveBeenCalledWith('a.md', 'b.md')
    expect(unlink).toHaveBeenCalledWith('a.md')
  })

  it('rethrows non-EXDEV errors without copying', async () => {
    vi.mocked(rename).mockRejectedValue(new Error('EACCES: permission denied'))
    await expect(renameAcrossDevices('a.md', 'b.md')).rejects.toThrow('EACCES')
    expect(copyFile).not.toHaveBeenCalled()
    expect(unlink).not.toHaveBeenCalled()
  })
})
