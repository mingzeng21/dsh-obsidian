import { FsAccess } from './fs-access.js'
import { run } from './spawn.js'
import { guardPath } from './vault-path.js'
import type { FrontmatterData } from './access.js'
import type { JsonValue } from './json-value.js'

function cliValue(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

export class CliAccess extends FsAccess {
  async setProperty(notePath: string, key: string, value: JsonValue): Promise<FrontmatterData> {
    guardPath(this.vaultRoot, notePath)
    try {
      await run('obsidian', ['property:set', `name=${key}`, `value=${cliValue(value)}`, `path=${notePath}`], { cwd: this.vaultRoot })
      return this.frontmatter(notePath)
    } catch {
      return super.setProperty(notePath, key, value)
    }
  }

  async deleteProperty(notePath: string, key: string): Promise<FrontmatterData> {
    guardPath(this.vaultRoot, notePath)
    try {
      await run('obsidian', ['property:remove', `name=${key}`, `path=${notePath}`], { cwd: this.vaultRoot })
      return this.frontmatter(notePath)
    } catch {
      return super.deleteProperty(notePath, key)
    }
  }
}
