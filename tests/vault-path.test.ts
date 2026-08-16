import { describe, it, expect } from 'vitest'
import { resolveVaultRoot, guardPath, detectVaultRootFromAppConfig } from '../src/vault-path.js'

describe('resolveVaultRoot', () => {
  it('prefers the explicit config path', () => {
    expect(resolveVaultRoot('/tmp/vault', '/detected')).toBe('/tmp/vault')
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
    expect(guardPath('/vault', 'notes/a.md')).toBe('/vault/notes/a.md')
  })
  it('rejects traversal escaping the vault', () => {
    expect(() => guardPath('/vault', '../secret.md')).toThrow(/escapes/)
    expect(() => guardPath('/vault', '/etc/passwd')).toThrow(/escapes/)
  })
  it('allows the vault root itself', () => {
    expect(guardPath('/vault', '.')).toBe('/vault')
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
