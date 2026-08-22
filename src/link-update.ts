import { noteTitleFromPath, resolveLinkTarget, stripMd } from './wikilink.js'

const WIKILINK_RE = /\[\[([^\[\]\n|#]+)(#[^\[\]\n|]*)?(\|[^\[\]\n]*)?\]\]/g

export interface LinkRewriteResult {
  content: string
  changed: boolean
}

export function rewriteNoteLinks(content: string, from: string, to: string, notePaths: string[]): LinkRewriteResult {
  const fromBase = noteTitleFromPath(from)
  const toBase = noteTitleFromPath(to)
  const fromPath = stripMd(from)
  const toPath = stripMd(to)
  let changed = false
  const out = content.replace(WIKILINK_RE, (match, target: string, heading?: string, alias?: string) => {
    if (resolveLinkTarget(target, notePaths) !== fromPath) return match
    const newTarget = stripMd(target) === fromBase ? toBase : toPath
    const replacement = `[[${newTarget}${heading ?? ''}${alias ?? ''}]]`
    if (replacement !== match) changed = true
    return replacement
  })
  return { content: out, changed }
}
