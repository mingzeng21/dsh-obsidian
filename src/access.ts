import type { JsonValue } from '@deepseek-ai/dsh-tools'

export interface NoteRef { path: string; title: string }

export interface SearchHit {
  path: string
  line: number
  lineText: string
  contextBefore: string[]
  contextAfter: string[]
}

export interface Backlink { path: string; title: string; snippet: string }

export interface ReadResult {
  path: string
  title: string
  frontmatter: JsonValue | null
  content: string
}

export interface FrontmatterData {
  path: string
  data: JsonValue | null
  raw: string | null
}

export interface TagRef { tag: string; count: number }

export interface WriteResult { path: string; created: boolean }
export interface AppendResult { path: string }
export interface MoveResult { from: string; to: string; linksUpdated: boolean }
export interface DeleteResult { path: string; trashedTo: string }

export interface VaultAccess {
  readonly vaultRoot: string
  list(dir?: string, limit?: number): Promise<NoteRef[]>
  search(query: string, opts?: { dir?: string; context?: number; limit?: number }): Promise<SearchHit[]>
  read(path: string): Promise<ReadResult>
  frontmatter(path: string): Promise<FrontmatterData>
  backlinks(path: string): Promise<Backlink[]>
  write(path: string, content: string): Promise<WriteResult>
  append(path: string, content: string): Promise<AppendResult>
  move(from: string, to: string): Promise<MoveResult>
  delete(path: string): Promise<DeleteResult>
  setProperty(path: string, key: string, value: JsonValue): Promise<FrontmatterData>
  deleteProperty(path: string, key: string): Promise<FrontmatterData>
  listTags(opts?: { dir?: string }): Promise<TagRef[]>
}
