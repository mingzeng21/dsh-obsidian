import { detectVaultRootFromAppConfig, resolveVaultRoot } from './vault-path.js'
import { binaryAvailable } from './spawn.js'
import { FsAccess } from './fs-access.js'
import { CliAccess } from './cli-access.js'
import type { VaultAccess } from './access.js'

export interface AccessConfig {
  vaultPath?: string
  useCli: boolean
  excludeDirs: string[]
}

export interface AccessSetup {
  vaultRoot: string
  access: VaultAccess
}

export interface SetupDeps {
  detectVaultRoot: () => Promise<string | null>
  cliAvailable: () => Promise<boolean>
}

export async function setupAccess(
  config: AccessConfig,
  deps: SetupDeps = { detectVaultRoot: detectVaultRootFromAppConfig, cliAvailable: () => binaryAvailable('obsidian') },
): Promise<AccessSetup> {
  const detected = await deps.detectVaultRoot()
  const vaultRoot = resolveVaultRoot(config.vaultPath, detected)
  const useCli = config.useCli && (await deps.cliAvailable())
  const access = useCli ? new CliAccess(vaultRoot, config.excludeDirs) : new FsAccess(vaultRoot, config.excludeDirs)
  return { vaultRoot, access }
}
