import { parse as parseYaml, parseDocument, isMap } from 'yaml'
import type { Document } from 'yaml'
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
  const doc = parseDocument(raw ?? '')
  doc.set(key, value)
  return renderDocument(doc, body)
}

export function deleteFrontmatterProperty(content: string, key: string): string {
  const { data, raw, body } = parseFrontmatter(content)
  assertEditableFrontmatter(data, raw)
  if (raw === null) return content
  const doc = parseDocument(raw)
  doc.delete(key)
  return renderDocument(doc, body)
}

function assertEditableFrontmatter(data: JsonValue | null, raw: string | null): void {
  if (data === null && raw !== null) {
    throw new Error('cannot modify a note whose frontmatter is not a YAML object')
  }
}

function renderDocument(doc: Document, body: string): string {
  const contents = doc.contents
  if (contents === null || (isMap(contents) && contents.items.length === 0)) return body
  return `---\n${doc.toString().replace(/\n$/, '')}\n---\n${body}`
}
