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
  const left = normalizeNotePath(a)
  const right = normalizeNotePath(b)
  return process.platform === 'win32' ? foldCase(left) === foldCase(right) : left === right
}

export function resolveLinkTarget(target: string, notePaths: string[]): string | null {
  const t = stripMd(target)
  const candidates = notePaths.map((p) => stripMd(p))
  const targetKey = process.platform === 'win32' ? foldCase(t) : t
  const matches = candidates.filter((p) => {
    const candidateKey = process.platform === 'win32' ? foldCase(p) : p
    return candidateKey === targetKey || candidateKey.endsWith('/' + targetKey)
  })
  return matches.length === 1 ? matches[0] : null
}
