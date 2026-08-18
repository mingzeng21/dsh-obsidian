import { parseFrontmatter } from './frontmatter.js'

const FENCED_CODE_RE = /```[\s\S]*?```/g
const INLINE_TAG_RE = /(?:^|\s)#([A-Za-z0-9_/-]+)/g

export function extractTags(content: string): Set<string> {
  const tags = new Set<string>()
  const { data } = parseFrontmatter(content)
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const t = (data as Record<string, unknown>).tags
    if (typeof t === 'string') tags.add(t)
    else if (Array.isArray(t)) for (const x of t) if (typeof x === 'string') tags.add(x)
  }
  const withoutCode = content.replace(FENCED_CODE_RE, '')
  for (const m of withoutCode.matchAll(INLINE_TAG_RE)) {
    const tag = m[1]
    if (tag && !/^\d+$/.test(tag)) tags.add(tag)
  }
  return tags
}
