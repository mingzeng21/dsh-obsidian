import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isWorkspaceInVault } from '../src/workspace.js'

describe('isWorkspaceInVault', () => {
  const vault = path.resolve('/tmp/notes')

  it('accepts the vault root and a nested working directory', () => {
    expect(isWorkspaceInVault(vault, vault)).toBe(true)
    expect(isWorkspaceInVault(vault, path.join(vault, 'project'))).toBe(true)
  })

  it('rejects a sibling, ancestor, or missing working directory', () => {
    expect(isWorkspaceInVault(vault, path.resolve('/tmp/notes-other'))).toBe(false)
    expect(isWorkspaceInVault(vault, path.resolve('/tmp'))).toBe(false)
    expect(isWorkspaceInVault(vault, undefined)).toBe(false)
    expect(isWorkspaceInVault(vault, 'relative/path')).toBe(false)
  })
})
