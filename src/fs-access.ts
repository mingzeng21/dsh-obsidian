import path from 'node:path'
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises'
import { parseFrontmatter } from './frontmatter.js'
import { extractLinkTargets, noteTitleFromPath, linkTargetMatchesNote } from './wikilink.js'
import { rewriteNoteLinks } from './link-update.js'
import { searchVault, walkMarkdownFiles } from './search.js'
import { guardPath } from './vault-path.js'
import type {
  VaultAccess, NoteRef, SearchHit, Backlink, ReadResult,
  FrontmatterData, WriteResult, AppendResult, MoveResult, DeleteResult,
} from './access.js'

export class FsAccess implements VaultAccess {
  constructor(readonly vaultRoot: string, readonly excludeDirs: string[]) {}

  async list(dir?: string, limit = 200): Promise<NoteRef[]> {
    const base = dir ? guardPath(this.vaultRoot, dir) : this.vaultRoot
    const files = await walkMarkdownFiles(base, this.excludeDirs)
    files.sort()
    return files.slice(0, limit).map((file) => ({
      path: path.relative(this.vaultRoot, file),
      title: noteTitleFromPath(file),
    }))
  }

  search(query: string, opts?: { dir?: string; context?: number; limit?: number }): Promise<SearchHit[]> {
    return searchVault(this.vaultRoot, this.excludeDirs, query, opts)
  }

  async read(filePath: string): Promise<ReadResult> {
    const abs = guardPath(this.vaultRoot, filePath)
    const content = await readFile(abs, 'utf8')
    const { data } = parseFrontmatter(content)
    return {
      path: filePath.replace(/\\/g, '/'),
      title: noteTitleFromPath(filePath),
      frontmatter: data,
      content,
    }
  }

  async frontmatter(filePath: string): Promise<FrontmatterData> {
    const abs = guardPath(this.vaultRoot, filePath)
    const content = await readFile(abs, 'utf8')
    const { data, raw } = parseFrontmatter(content)
    return { path: filePath.replace(/\\/g, '/'), data, raw }
  }

  async backlinks(notePath: string): Promise<Backlink[]> {
    const files = await walkMarkdownFiles(this.vaultRoot, this.excludeDirs)
    const out: Backlink[] = []
    for (const file of files) {
      const content = await readFile(file, 'utf8')
      const targets = extractLinkTargets(content)
      if (!targets.some((t) => linkTargetMatchesNote(t, notePath))) continue
      out.push({
        path: path.relative(this.vaultRoot, file),
        title: noteTitleFromPath(file),
        snippet: this.snippetFor(content, notePath),
      })
    }
    return out
  }

  async write(filePath: string, content: string): Promise<WriteResult> {
    const abs = guardPath(this.vaultRoot, filePath)
    const existed = await this.exists(abs)
    await this.atomicWrite(abs, content)
    return { path: filePath.replace(/\\/g, '/'), created: !existed }
  }

  async append(filePath: string, content: string): Promise<AppendResult> {
    const abs = guardPath(this.vaultRoot, filePath)
    const existing = (await this.exists(abs)) ? await readFile(abs, 'utf8') : ''
    const separator = existing && !existing.endsWith('\n') ? '\n' : ''
    await this.atomicWrite(abs, existing + separator + content)
    return { path: filePath.replace(/\\/g, '/') }
  }

  async move(from: string, to: string): Promise<MoveResult> {
    const fromAbs = guardPath(this.vaultRoot, from)
    const toAbs = guardPath(this.vaultRoot, to)
    await mkdir(path.dirname(toAbs), { recursive: true })
    await rename(fromAbs, toAbs)
    let linksUpdated = false
    for (const file of await walkMarkdownFiles(this.vaultRoot, this.excludeDirs)) {
      const content = await readFile(file, 'utf8')
      const { content: next, changed } = rewriteNoteLinks(content, from, to)
      if (changed) {
        await writeFile(file, next, 'utf8')
        linksUpdated = true
      }
    }
    return { from: from.replace(/\\/g, '/'), to: to.replace(/\\/g, '/'), linksUpdated }
  }

  async delete(filePath: string): Promise<DeleteResult> {
    const abs = guardPath(this.vaultRoot, filePath)
    const rel = path.relative(this.vaultRoot, abs)
    const trashDir = path.join(this.vaultRoot, '.trash')
    await mkdir(trashDir, { recursive: true })
    let target = path.join(trashDir, rel)
    if (await this.exists(target)) {
      target = path.join(trashDir, `${rel}.${Date.now()}`)
    }
    await mkdir(path.dirname(target), { recursive: true })
    await rename(abs, target)
    return { path: filePath.replace(/\\/g, '/'), trashedTo: path.relative(this.vaultRoot, target) }
  }

  private async exists(p: string): Promise<boolean> {
    try { await stat(p); return true } catch { return false }
  }

  private async atomicWrite(abs: string, content: string): Promise<void> {
    await mkdir(path.dirname(abs), { recursive: true })
    const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.${process.pid}.${Date.now()}.tmp`)
    await writeFile(tmp, content, 'utf8')
    await rename(tmp, abs)
  }

  private snippetFor(content: string, notePath: string): string {
    const title = noteTitleFromPath(notePath)
    for (const line of content.split('\n')) {
      if (line.includes(title)) return line.trim()
    }
    return ''
  }
}
