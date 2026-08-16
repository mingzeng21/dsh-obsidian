import { parse as parseYaml } from 'yaml'

export interface ParsedNote {
  data: Record<string, unknown> | null
  raw: string | null
  body: string
}

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

export function parseFrontmatter(content: string): ParsedNote {
  const match = FRONTMATTER_RE.exec(content)
  if (!match) return { data: null, raw: null, body: content }
  const raw = match[1]
  let data: Record<string, unknown> | null = null
  try {
    const parsed = parseYaml(raw)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>
    }
  } catch {
    data = null
  }
  return { data, raw, body: content.slice(match[0].length) }
}
