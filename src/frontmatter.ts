import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

export interface ParsedNote {
  data: JsonValue | null
  raw: string | null
  body: string
}

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

export function parseFrontmatter(content: string): ParsedNote {
  const match = FRONTMATTER_RE.exec(content)
  if (!match) return { data: null, raw: null, body: content }
  const raw = match[1]
  let data: JsonValue | null = null
  try {
    const parsed = parseYaml(raw)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed as JsonValue
    }
  } catch {
    data = null
  }
  return { data, raw, body: content.slice(match[0].length) }
}

export function setFrontmatterProperty(content: string, key: string, value: JsonValue): string {
  const { data, raw, body } = parseFrontmatter(content)
  assertEditableFrontmatter(data, raw)
  const base = asRecord(data)
  base[key] = value
  return renderFrontmatter(base, body)
}

export function deleteFrontmatterProperty(content: string, key: string): string {
  const { data, raw, body } = parseFrontmatter(content)
  assertEditableFrontmatter(data, raw)
  const base = asRecord(data)
  delete base[key]
  return renderFrontmatter(base, body)
}

function assertEditableFrontmatter(data: JsonValue | null, raw: string | null): void {
  if (data === null && raw !== null) {
    throw new Error('cannot modify a note whose frontmatter is not a YAML object')
  }
}

function asRecord(data: JsonValue | null): Record<string, JsonValue> {
  if (data && typeof data === 'object' && !Array.isArray(data)) return { ...data } as Record<string, JsonValue>
  return {}
}

function renderFrontmatter(data: Record<string, JsonValue>, body: string): string {
  if (Object.keys(data).length === 0) return body
  return `---\n${stringifyYaml(data)}---\n${body}`
}
