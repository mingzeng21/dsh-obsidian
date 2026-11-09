import { normalizeVaultPath } from './vault-path.js'
import { foldCase } from './case-fold.js'

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
  const base = filePath.split(/[\\/]/).pop() ?? filePath
  return base.replace(/\.md$/i, '')
}

export function normalizeNotePath(p: string): string {
  return normalizeVaultPath(p)
}

export function stripMd(p: string): string {
  return normalizeNotePath(p).replace(/\.md$/i, '')
}

export function sameNotePath(a: string, b: string): boolean {
  return notePathKey(normalizeNotePath(a)) === notePathKey(normalizeNotePath(b))
}

function notePathKey(p: string): string {
  return process.platform === 'win32' ? foldCase(p) : p
}

export type LinkResolver = (target: string) => string | null

export function createLinkResolver(notePaths: string[]): LinkResolver {
  const pathsBySuffix = new Map<string, string | null>()
  for (const notePath of notePaths) {
    const candidate = stripMd(notePath)
    const key = notePathKey(candidate)
    // Full paths and shorter suffixes share the same ambiguity rules.
    for (let start = 0; ; ) {
      const suffix = key.slice(start)
      pathsBySuffix.set(suffix, pathsBySuffix.has(suffix) ? null : candidate)
      const slash = key.indexOf('/', start)
      if (slash === -1) break
      start = slash + 1
    }
  }
  return (target) => pathsBySuffix.get(notePathKey(stripMd(target))) ?? null
}
