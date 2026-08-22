const WIKILINK_RE = /\[\[([^\[\]\n|#]+)(?:#[^\[\]\n|]*)?(?:\|[^\[\]\n]*)?\]\]/g

export function extractLinkTargets(content: string): string[] {
  const targets = new Set<string>()
  for (const match of content.matchAll(WIKILINK_RE)) {
    const target = match[1].trim()
    if (target) targets.add(target)
  }
  return [...targets]
}

export function noteTitleFromPath(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath
  return base.replace(/\.md$/i, '')
}

export function stripMd(p: string): string {
  return p.replace(/\.md$/i, '')
}

export function resolveLinkTarget(target: string, notePaths: string[]): string | null {
  const t = stripMd(target)
  const matches = notePaths.map(stripMd).filter((p) => p === t || p.endsWith('/' + t))
  return matches.length === 1 ? matches[0] : null
}
