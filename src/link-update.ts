import { noteTitleFromPath, resolveLinkTarget, sameNotePath, stripMd } from './wikilink.js'
import { normalizeVaultPath } from './vault-path.js'

const WIKILINK_RE = /\[\[([^\[\]\n|#]+)(#[^\[\]\n|]*)?(\|[^\[\]\n]*)?\]\]/g

export interface LinkRewriteResult {
  content: string
  changed: boolean
}

export function rewriteNoteLinks(content: string, from: string, to: string, notePaths: string[]): LinkRewriteResult {
  const normalizedFrom = normalizeVaultPath(from)
  const normalizedTo = normalizeVaultPath(to)
  const fromBase = noteTitleFromPath(normalizedFrom)
  const toBase = noteTitleFromPath(normalizedTo)
  const fromPath = stripMd(normalizedFrom)
  const toPath = stripMd(normalizedTo)
  let changed = false
  const out = content.replace(WIKILINK_RE, (match, target: string, heading?: string, alias?: string) => {
    const resolved = resolveLinkTarget(target, notePaths)
    if (!resolved || !sameNotePath(resolved, fromPath)) return match
    const newTarget = sameNotePath(stripMd(target), fromBase) ? toBase : toPath
    const replacement = `[[${newTarget}${heading ?? ''}${alias ?? ''}]]`
    if (replacement !== match) changed = true
    return replacement
  })
  return { content: out, changed }
}
