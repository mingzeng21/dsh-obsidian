import { describe, it, expect } from 'vitest'
import { setupAccess } from '../src/detect.js'
import { FsAccess } from '../src/fs-access.js'
import { CliAccess } from '../src/cli-access.js'

describe('setupAccess', () => {
  it('resolves an explicit vault path with fs access when the CLI is unavailable', async () => {
    const setup = await setupAccess(
      { vaultPath: '/tmp/vault', useCli: true, excludeDirs: [] },
      { detectVaultRoot: async () => null, cliAvailable: async () => false },
    )
    expect(setup.vaultRoot).toBe('/tmp/vault')
    expect(setup.access).toBeInstanceOf(FsAccess)
  })

  it('uses CliAccess when the CLI is available', async () => {
    const setup = await setupAccess(
      { vaultPath: '/tmp/vault', useCli: true, excludeDirs: [] },
      { detectVaultRoot: async () => null, cliAvailable: async () => true },
    )
    expect(setup.access).toBeInstanceOf(CliAccess)
  })

  it('does not use the CLI when useCli is false', async () => {
    const setup = await setupAccess(
      { vaultPath: '/tmp/vault', useCli: false, excludeDirs: [] },
      { detectVaultRoot: async () => null, cliAvailable: async () => true },
    )
    expect(setup.access).toBeInstanceOf(FsAccess)
  })

  it('auto-detects the vault when no explicit path is given', async () => {
    const setup = await setupAccess(
      { useCli: false, excludeDirs: [] },
      { detectVaultRoot: async () => '/detected/vault', cliAvailable: async () => false },
    )
    expect(setup.vaultRoot).toBe('/detected/vault')
  })
})
