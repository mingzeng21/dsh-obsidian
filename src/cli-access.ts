import path from 'node:path'
import { FsAccess } from './fs-access.js'
import { run } from './spawn.js'
import { guardPath } from './vault-path.js'
import type { Backlink, MoveResult } from './access.js'

export class CliAccess extends FsAccess {
  async backlinks(notePath: string): Promise<Backlink[]> {
    guardPath(this.vaultRoot, notePath)
    try {
      const { stdout } = await run('obsidian', ['backlinks', `path=${notePath}`, 'format=json'], { cwd: this.vaultRoot })
      const parsed = JSON.parse(stdout) as unknown
      if (Array.isArray(parsed)) {
        return parsed.map((entry: any) => ({
          path: String(entry.path ?? ''),
          title: String(entry.title ?? path.basename(String(entry.path ?? ''), '.md')),
          snippet: String(entry.snippet ?? ''),
        }))
      }
    } catch {
      // fall through to the fs implementation
    }
    return super.backlinks(notePath)
  }

  async move(from: string, to: string): Promise<MoveResult> {
    guardPath(this.vaultRoot, from)
    guardPath(this.vaultRoot, to)
    try {
      await run('obsidian', ['move', `path=${from}`, `to=${to}`], { cwd: this.vaultRoot })
      return { from: from.replace(/\\/g, '/'), to: to.replace(/\\/g, '/'), linksUpdated: true }
    } catch {
      return super.move(from, to)
    }
  }
}
