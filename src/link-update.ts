import { noteTitleFromPath, linkTargetMatchesNote } from './wikilink.js'

const WIKILINK_RE = /\[\[([^\[\]\n|#]+)(#[^\[\]\n|]*)?(\|[^\[\]\n]*)?\]\]/g

function stripMd(p: string): string {
  return p.replace(/\.md$/i, '')
}

export interface LinkRewriteResult {
  content: string
  changed: boolean
}

export function rewriteNoteLinks(content: string, from: string, to: string): LinkRewriteResult {
  const fromBase = noteTitleFromPath(from)
  const toBase = noteTitleFromPath(to)
  const toPath = stripMd(to)
  let changed = false
  const out = content.replace(WIKILINK_RE, (match, target: string, heading?: string, alias?: string) => {
    if (!linkTargetMatchesNote(target, from)) return match
    const newTarget = stripMd(target) === fromBase ? toBase : toPath
    const replacement = `[[${newTarget}${heading ?? ''}${alias ?? ''}]]`
    if (replacement !== match) changed = true
    return replacement
  })
  return { content: out, changed }
}
