import { FsAccess } from './fs-access.js'
import { run } from './spawn.js'
import { guardPath, normalizeVaultPath } from './vault-path.js'
import type { FrontmatterData } from './access.js'
import type { JsonValue } from './json-value.js'

function cliValue(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

export class CliAccess extends FsAccess {
  async setProperty(notePath: string, key: string, value: JsonValue): Promise<FrontmatterData> {
    const normalizedPath = normalizeVaultPath(notePath)
    guardPath(this.vaultRoot, normalizedPath)
    try {
      await run('obsidian', ['property:set', `name=${key}`, `value=${cliValue(value)}`, `path=${normalizedPath}`], { cwd: this.vaultRoot })
      return this.frontmatter(normalizedPath)
    } catch {
      return super.setProperty(normalizedPath, key, value)
    }
  }

  async deleteProperty(notePath: string, key: string): Promise<FrontmatterData> {
    const normalizedPath = normalizeVaultPath(notePath)
    guardPath(this.vaultRoot, normalizedPath)
    try {
      await run('obsidian', ['property:remove', `name=${key}`, `path=${normalizedPath}`], { cwd: this.vaultRoot })
      return this.frontmatter(normalizedPath)
    } catch {
      return super.deleteProperty(normalizedPath, key)
    }
  }
}
