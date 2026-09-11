import path from 'node:path'
import { homedir } from 'node:os'
import { describe, it, expect } from 'vitest'
import { resolveVaultRoot, guardPath, detectVaultRootFromAppConfig, appConfigCandidates } from '../src/vault-path.js'

describe('resolveVaultRoot', () => {
  it('prefers the explicit config path', () => {
    expect(resolveVaultRoot('/tmp/vault', '/detected')).toBe(path.resolve('/tmp/vault'))
  })
  it('falls back to the detected path', () => {
    expect(resolveVaultRoot(undefined, '/detected')).toBe('/detected')
  })
  it('throws when neither is present', () => {
    expect(() => resolveVaultRoot(undefined, null)).toThrow(/not configured/)
  })
})

describe('guardPath', () => {
  it('resolves a path inside the vault', () => {
    const vaultRoot = path.resolve('vault')
    expect(guardPath(vaultRoot, 'notes/a.md')).toBe(path.resolve(vaultRoot, 'notes/a.md'))
  })
  it('accepts Windows separators and returns a native filesystem path', () => {
    const vaultRoot = path.resolve('vault')
    expect(guardPath(vaultRoot, 'notes\\a.md')).toBe(path.resolve(vaultRoot, 'notes', 'a.md'))
  })
  it('rejects traversal escaping the vault', () => {
    const vaultRoot = path.resolve('vault')
    expect(() => guardPath(vaultRoot, '../secret.md')).toThrow(/escapes/)
    expect(() => guardPath(vaultRoot, '/etc/passwd')).toThrow(/escapes/)
  })
  it('rejects Windows drive-letter and UNC absolute paths on every host', () => {
    const vaultRoot = path.resolve('vault')
    expect(() => guardPath(vaultRoot, 'C:\\outside\\secret.md')).toThrow(/escapes/)
    expect(() => guardPath(vaultRoot, '\\\\server\\share\\secret.md')).toThrow(/escapes/)
  })
  it('allows the vault root itself', () => {
    const vaultRoot = path.resolve('vault')
    expect(guardPath(vaultRoot, '.')).toBe(path.resolve(vaultRoot))
  })
  it('rejects an empty path', () => {
    expect(() => guardPath('/vault', '')).toThrow(/non-empty/)
  })
})

describe('detectVaultRootFromAppConfig', () => {
  it('returns the open vault path', async () => {
    const read = async () => JSON.stringify({ vaults: { a: { path: '/v1', open: false }, b: { path: '/v2', open: true } } })
    expect(await detectVaultRootFromAppConfig(read)).toBe('/v2')
  })
  it('falls back to the first vault when none is open', async () => {
    const read = async () => JSON.stringify({ vaults: { a: { path: '/v1' } } })
    expect(await detectVaultRootFromAppConfig(read)).toBe('/v1')
  })
  it('returns null when the config is unreadable', async () => {
    const read = async () => { throw new Error('no file') }
    expect(await detectVaultRootFromAppConfig(read)).toBeNull()
  })
})

describe('appConfigCandidates', () => {
  it('prefers APPDATA on Windows', () => {
    const candidates = appConfigCandidates('win32', { APPDATA: 'C:\\Users\\alice\\AppData\\Roaming' })
    expect(candidates[0]).toBe(path.join('C:\\Users\\alice\\AppData\\Roaming', 'obsidian', 'obsidian.json'))
  })

  it('prefers the Library location on macOS', () => {
    const candidates = appConfigCandidates('darwin', {})
    expect(candidates[0]).toBe(path.join(homedir(), 'Library', 'Application Support', 'obsidian', 'obsidian.json'))
  })

  it('prefers the XDG location on Linux', () => {
    const candidates = appConfigCandidates('linux', {})
    expect(candidates[0]).toBe(path.join(homedir(), '.config', 'obsidian', 'obsidian.json'))
  })
})
