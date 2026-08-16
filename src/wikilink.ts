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

export function linkTargetMatchesNote(target: string, notePath: string): boolean {
  const t = target.replace(/\.md$/i, '')
  const n = notePath.replace(/\.md$/i, '')
  const nBase = noteTitleFromPath(n)
  return t === n || t === nBase || t.endsWith('/' + nBase)
}
