# dsh-obsidian Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `dsh-obsidian`, a DeepSeek Harness (dsh) bundle plugin that lets the agent search, read, write, move, and trash notes in a local Obsidian vault (Markdown files + `.obsidian/`).

**Architecture:** A Cordis namespace plugin (`name`/`inject`/`Config`/`apply`, no default export) registers 9 typed tools on `ctx.tools`. Tool logic delegates to a `VaultAccess` interface with two implementations: `FsAccess` (pure `node:fs` + hand-written frontmatter/wikilink parsing — always works) and `CliAccess` (extends `FsAccess`, delegates `backlinks`/`move` to the `obsidian` CLI when it is available). A `setupAccess` factory picks the right one.

**Tech Stack:** TypeScript (ESM), `tsdown` (build), `vitest` (test), Cordis `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` + `@deepseek-ai/schemastery` (peer deps), `yaml` (frontmatter parsing).

**Spec:** `docs/superpowers/specs/2026-08-16-dsh-obsidian-design.md`

## Global Constraints

- Node `>=22.12.0`; package name `dsh-obsidian`; `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`.
- Plugin exports **named** `name` / `inject` / `Config` / `apply` — **no default export** (a default export drops `inject`).
- `@deepseek-ai/*` packages are `peerDependencies` (never `dependencies`); `yaml` is the only runtime `dependency`.
- `inject: ['tools']`.
- All tool path parameters are **relative to the vault root**; `guardPath` must reject any path that resolves outside the vault.
- `obsidian_delete` moves a note into `.trash/` (reversible); it must never permanently delete.
- Every `object` node in a `defineTool` schema MUST declare `additionalProperties: true|false` explicitly.
- Deviations from the spec: `obsidian_list` drops the `glob` filter (YAGNI — `dir` + `limit` suffice; the agent filters titles itself).

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsdown.config.ts`, `vitest.config.ts`, `cordis.patch.yml`, `.gitignore`, `LICENSE`

**Interfaces:**
- Produces: a working empty build (`npm run build`, `npm run typecheck`, `npm test` all pass with no `src/` yet).

- [ ] **Step 1: Write the config files**

`package.json`:
```json
{
  "name": "dsh-obsidian",
  "version": "0.1.0",
  "description": "Connect DeepSeek Harness (dsh) to a local Obsidian vault: search, read, write, move, and trash notes.",
  "engines": { "node": ">=22.12.0" },
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/index.d.ts",
  "exports": { ".": { "types": "./lib/index.d.ts", "default": "./lib/index.js" } },
  "files": ["lib", "cordis.patch.yml", "README.md"],
  "scripts": {
    "build": "tsdown",
    "prepare": "tsdown",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "peerDependencies": {
    "@deepseek-ai/cordis": "*",
    "@deepseek-ai/dsh-tools": "*",
    "@deepseek-ai/schemastery": "*"
  },
  "dependencies": { "yaml": "^2.7.0" },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsdown": "^0.13.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  },
  "license": "MIT",
  "keywords": ["dsh", "dsh-plugin", "obsidian", "deepseek-harness"]
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "declaration": true,
    "outDir": "lib",
    "types": ["node"]
  },
  "include": ["src"]
}
```

`tsdown.config.ts`:
```ts
import { defineConfig } from 'tsdown'
export default defineConfig({ entry: ['src/index.ts'], format: ['esm'], dts: true, clean: true, outDir: 'lib', hash: false })
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node' } })
```

`cordis.patch.yml`:
```yaml
- insert:
    - id: obsidian
      name: dsh-obsidian
```

`.gitignore`:
```
node_modules/
lib/
*.tsbuildinfo
```

`LICENSE` (MIT, replace the copyright holder with your name):
```
MIT License

Copyright (c) 2026 <your name>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: installs devDependencies and auto-installs the `@deepseek-ai/*` peer deps (npm 7+ does this automatically).

- [ ] **Step 3: Verify the empty build passes**

Run: `npm run typecheck` (expected: passes with an empty `src/` — create a placeholder `src/index.ts` containing `export {}` first), then `npm run build` (expected: emits `lib/`), then `npm test` (expected: "No test files found" is fine, or 0 tests).

- [ ] **Step 4: Initialize git and commit**

```bash
git init
git add package.json tsconfig.json tsdown.config.ts vitest.config.ts cordis.patch.yml .gitignore LICENSE src/index.ts
git commit -m "chore: scaffold dsh-obsidian bundle plugin"
```

Note: do NOT push — the GitHub remote will be created later, together with the user.

---

### Task 2: `spawn.ts` — process helpers

**Files:**
- Create: `src/spawn.ts`
- Test: `tests/spawn.test.ts`

**Interfaces:**
- Produces: `run(cmd: string, args: string[], opts?: { cwd?: string }): Promise<{ stdout: string; stderr: string }>` and `binaryAvailable(cmd: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing test**

`tests/spawn.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { run, binaryAvailable } from '../src/spawn.js'

describe('run', () => {
  it('captures stdout of a successful command', async () => {
    const { stdout, stderr } = await run('node', ['-e', 'console.log("hi")'])
    expect(stdout.trim()).toBe('hi')
    expect(stderr).toBe('')
  })

  it('rejects on non-zero exit', async () => {
    await expect(run('node', ['-e', 'process.exit(3)'])).rejects.toThrow(/exited with code 3/)
  })
})

describe('binaryAvailable', () => {
  it('detects node as available', async () => {
    expect(await binaryAvailable('node')).toBe(true)
  })

  it('detects a missing binary as unavailable', async () => {
    expect(await binaryAvailable('definitely-not-a-real-binary-xyz')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- spawn.test.ts`
Expected: FAIL — `../src/spawn.js` does not exist.

- [ ] **Step 3: Write the implementation**

`src/spawn.ts`:
```ts
import { spawn } from 'node:child_process'

export interface RunResult { stdout: string; stderr: string }

export function run(cmd: string, args: string[], opts: { cwd?: string } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim()}`))
    })
  })
}

const availabilityCache = new Map<string, boolean>()

export async function binaryAvailable(cmd: string): Promise<boolean> {
  const cached = availabilityCache.get(cmd)
  if (cached !== undefined) return cached
  const available = await new Promise<boolean>((resolve) => {
    const child = spawn(cmd, ['--version'], { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
  availabilityCache.set(cmd, available)
  return available
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- spawn.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/spawn.ts tests/spawn.test.ts
git commit -m "feat: add spawn helpers run() and binaryAvailable()"
```

---

### Task 3: `access.ts` (types) + `frontmatter.ts`

**Files:**
- Create: `src/access.ts`, `src/frontmatter.ts`
- Test: `tests/frontmatter.test.ts`

**Interfaces:**
- Produces: `parseFrontmatter(content: string): { data: Record<string, unknown> | null; raw: string | null; body: string }`, and the shared `VaultAccess` interface + result types in `access.ts`.

- [ ] **Step 1: Write the failing test**

`tests/frontmatter.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseFrontmatter } from '../src/frontmatter.js'

describe('parseFrontmatter', () => {
  it('returns null data/raw when there is no frontmatter', () => {
    const { data, raw, body } = parseFrontmatter('# Hello\n\nBody')
    expect(data).toBeNull()
    expect(raw).toBeNull()
    expect(body).toBe('# Hello\n\nBody')
  })

  it('parses YAML frontmatter and strips it from the body', () => {
    const { data, raw, body } = parseFrontmatter('---\ntitle: Hi\ntags: [a, b]\n---\nBody text')
    expect(data).toEqual({ title: 'Hi', tags: ['a', 'b'] })
    expect(raw).toBe('title: Hi\ntags: [a, b]')
    expect(body).toBe('Body text')
  })

  it('tolerates invalid YAML by returning null data but keeping raw', () => {
    const { data, raw } = parseFrontmatter('---\n: not: valid: yaml\n---\nbody')
    expect(data).toBeNull()
    expect(raw).toBe(': not: valid: yaml')
  })

  it('does not treat a mid-body --- line as frontmatter', () => {
    const { data } = parseFrontmatter('no frontmatter\n---\nnot yaml')
    expect(data).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- frontmatter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/frontmatter.ts`**

```ts
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
```

- [ ] **Step 4: Write `src/access.ts` (shared types)**

```ts
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
  frontmatter: Record<string, unknown> | null
  content: string
}

export interface FrontmatterData {
  path: string
  data: Record<string, unknown> | null
  raw: string | null
}

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
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- frontmatter.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS (verifies `access.ts` compiles).

- [ ] **Step 7: Commit**

```bash
git add src/frontmatter.ts src/access.ts tests/frontmatter.test.ts
git commit -m "feat: add frontmatter parser and VaultAccess contract"
```

---

### Task 4: `wikilink.ts`

**Files:**
- Create: `src/wikilink.ts`
- Test: `tests/wikilink.test.ts`

**Interfaces:**
- Produces: `extractLinkTargets(content: string): string[]`, `noteTitleFromPath(path: string): string`, `linkTargetMatchesNote(target: string, notePath: string): boolean`.

- [ ] **Step 1: Write the failing test**

`tests/wikilink.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { extractLinkTargets, noteTitleFromPath, linkTargetMatchesNote } from '../src/wikilink.js'

describe('extractLinkTargets', () => {
  it('extracts simple, aliased, and heading links', () => {
    const content = 'see [[Note A]], [[Note B|alias]], [[Folder/Note C#heading]]'
    expect(extractLinkTargets(content)).toEqual(['Note A', 'Note B', 'Folder/Note C'])
  })

  it('dedupes and ignores empty targets', () => {
    expect(extractLinkTargets('[[X]] and [[X]] and [[]]')).toEqual(['X'])
  })
})

describe('noteTitleFromPath', () => {
  it('strips directory and .md extension', () => {
    expect(noteTitleFromPath('Folder/My Note.md')).toBe('My Note')
    expect(noteTitleFromPath('Root.md')).toBe('Root')
  })
})

describe('linkTargetMatchesNote', () => {
  it('matches by basename or full path', () => {
    expect(linkTargetMatchesNote('My Note', 'Folder/My Note.md')).toBe(true)
    expect(linkTargetMatchesNote('Folder/My Note', 'Folder/My Note.md')).toBe(true)
    expect(linkTargetMatchesNote('Other', 'Folder/My Note.md')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- wikilink.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/wikilink.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- wikilink.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/wikilink.ts tests/wikilink.test.ts
git commit -m "feat: add wikilink parsing helpers"
```

---

### Task 5: `vault-path.ts`

**Files:**
- Create: `src/vault-path.ts`
- Test: `tests/vault-path.test.ts`

**Interfaces:**
- Produces: `detectVaultRootFromAppConfig(read = readFile): Promise<string | null>`, `resolveVaultRoot(configVaultPath: string | undefined, detected: string | null): string`, `guardPath(vaultRoot: string, rel: string): string`.

- [ ] **Step 1: Write the failing test**

`tests/vault-path.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { resolveVaultRoot, guardPath, detectVaultRootFromAppConfig } from '../src/vault-path.js'

describe('resolveVaultRoot', () => {
  it('prefers the explicit config path', () => {
    expect(resolveVaultRoot('/tmp/vault', '/detected')).toBe('/tmp/vault')
  })
  it('falls back to the detected path', () => {
    expect(resolveVaultRoot(undefined, '/detected')).toBe('/detected')
  })
  it('throws when neither is present', () => {
    expect(() => resolveVaultRoot(undefined, null)).toThrow(/not configured/)
  })
})

describe('guardPath', () => {
  it('resolves a path inside the vault', () => {
    expect(guardPath('/vault', 'notes/a.md')).toBe('/vault/notes/a.md')
  })
  it('rejects traversal escaping the vault', () => {
    expect(() => guardPath('/vault', '../secret.md')).toThrow(/escapes/)
    expect(() => guardPath('/vault', '/etc/passwd')).toThrow(/escapes/)
  })
  it('allows the vault root itself', () => {
    expect(guardPath('/vault', '.')).toBe('/vault')
  })
  it('rejects an empty path', () => {
    expect(() => guardPath('/vault', '')).toThrow(/non-empty/)
  })
})

describe('detectVaultRootFromAppConfig', () => {
  it('returns the open vault path', async () => {
    const read = async () => JSON.stringify({ vaults: { a: { path: '/v1', open: false }, b: { path: '/v2', open: true } } })
    expect(await detectVaultRootFromAppConfig(read)).toBe('/v2')
  })
  it('falls back to the first vault when none is open', async () => {
    const read = async () => JSON.stringify({ vaults: { a: { path: '/v1' } } })
    expect(await detectVaultRootFromAppConfig(read)).toBe('/v1')
  })
  it('returns null when the config is unreadable', async () => {
    const read = async () => { throw new Error('no file') }
    expect(await detectVaultRootFromAppConfig(read)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- vault-path.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/vault-path.ts`:
```ts
import { homedir } from 'node:os'
import path from 'node:path'
import { readFile } from 'node:fs/promises'

interface ObsidianVaultEntry { path?: string; open?: boolean }
interface ObsidianAppConfig { vaults?: Record<string, ObsidianVaultEntry> }

export function appConfigCandidates(): string[] {
  const candidates = [path.join(homedir(), 'Library', 'Application Support', 'obsidian', 'obsidian.json')]
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'obsidian', 'obsidian.json'))
  candidates.push(path.join(homedir(), '.config', 'obsidian', 'obsidian.json'))
  return candidates
}

export async function detectVaultRootFromAppConfig(
  read: (p: string, enc: string) => Promise<string> = readFile as any,
): Promise<string | null> {
  for (const file of appConfigCandidates()) {
    try {
      const raw = await read(file, 'utf8')
      const cfg = JSON.parse(raw) as ObsidianAppConfig
      const entries = Object.values(cfg.vaults ?? {})
      const found = entries.find((v) => v.open) ?? entries[0]
      if (found?.path) return found.path
    } catch {
      // try the next candidate
    }
  }
  return null
}

export function resolveVaultRoot(configVaultPath: string | undefined, detected: string | null): string {
  if (configVaultPath) return path.resolve(configVaultPath)
  if (detected) return detected
  throw new Error('Obsidian vault not configured: set `vaultPath` in plugin config, or open a vault in Obsidian')
}

export function guardPath(vaultRoot: string, rel: string): string {
  if (typeof rel !== 'string' || rel.trim() === '') throw new Error('path must be a non-empty string')
  const abs = path.resolve(vaultRoot, rel)
  const root = path.resolve(vaultRoot) + path.sep
  if (abs !== path.resolve(vaultRoot) && !abs.startsWith(root)) {
    throw new Error(`path escapes vault root: ${rel}`)
  }
  return abs
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- vault-path.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vault-path.ts tests/vault-path.test.ts
git commit -m "feat: add vault path resolution and traversal guard"
```

---

### Task 6: `search.ts`

**Files:**
- Create: `src/search.ts`
- Test: `tests/search.test.ts`

**Interfaces:**
- Consumes: `run`, `binaryAvailable` from `spawn.ts`; `SearchHit` from `access.ts`.
- Produces: `searchVault(vaultRoot: string, excludeDirs: string[], query: string, opts?: { dir?: string; context?: number; limit?: number }): Promise<SearchHit[]>` and `walkMarkdownFiles(dir: string, excludeDirs: string[]): Promise<string[]>`.

- [ ] **Step 1: Write the failing test**

`tests/search.test.ts`:
```ts
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it, expect } from 'vitest'
import { searchVault } from '../src/search.js'

let tmp: string
afterEach(async () => { if (tmp) await rm(tmp, { recursive: true, force: true }) })

async function makeVault(): Promise<string> {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'vault-'))
  await mkdir(path.join(tmp, 'notes'), { recursive: true })
  await mkdir(path.join(tmp, '.obsidian'), { recursive: true })
  await writeFile(path.join(tmp, 'a.md'), 'alpha line\nbeta alpha\n')
  await writeFile(path.join(tmp, 'notes', 'b.md'), 'alpha here\nnothing\n')
  await writeFile(path.join(tmp, '.obsidian', 'app.json'), 'alpha hidden')
  return tmp
}

describe('searchVault', () => {
  it('finds matches with line numbers and context, sorted', async () => {
    const v = await makeVault()
    const hits = await searchVault(v, ['.obsidian', '.git', '.trash'], 'alpha')
    expect(hits.map((h) => `${h.path}:${h.line}`)).toEqual(['a.md:1', 'a.md:2', 'notes/b.md:1'])
    expect(hits[0].contextAfter).toEqual(['beta alpha'])
  })

  it('excludes hidden dirs and configured excludeDirs', async () => {
    const v = await makeVault()
    const hits = await searchVault(v, ['.obsidian'], 'hidden')
    expect(hits).toEqual([])
  })

  it('limits the number of results', async () => {
    const v = await makeVault()
    const hits = await searchVault(v, [], 'alpha', { limit: 1 })
    expect(hits.length).toBe(1)
  })

  it('is case-insensitive', async () => {
    const v = await makeVault()
    const hits = await searchVault(v, [], 'ALPHA')
    expect(hits.length).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- search.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/search.ts`:
```ts
import path from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
import { run, binaryAvailable } from './spawn.js'
import type { SearchHit } from './access.js'

export interface SearchOptions { dir?: string; context?: number; limit?: number }
interface RawMatch { file: string; line: number }

export async function searchVault(
  vaultRoot: string,
  excludeDirs: string[],
  query: string,
  opts: SearchOptions = {},
): Promise<SearchHit[]> {
  const context = opts.context ?? 1
  const limit = opts.limit ?? 50
  const base = opts.dir ? path.join(vaultRoot, opts.dir) : vaultRoot
  const matches = await rawMatches(base, excludeDirs, query)
  matches.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1))
  const hits: SearchHit[] = []
  const cache = new Map<string, string[]>()
  for (const { file, line } of matches) {
    if (hits.length >= limit) break
    let lines = cache.get(file)
    if (!lines) {
      lines = (await readFile(file, 'utf8')).split('\n')
      cache.set(file, lines)
    }
    const idx = line - 1
    hits.push({
      path: path.relative(vaultRoot, file),
      line,
      lineText: lines[idx] ?? '',
      contextBefore: lines.slice(Math.max(0, idx - context), idx),
      contextAfter: lines.slice(idx + 1, idx + 1 + context),
    })
  }
  return hits
}

export async function walkMarkdownFiles(dir: string, excludeDirs: string[]): Promise<string[]> {
  const files: string[] = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return files
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || excludeDirs.includes(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) files.push(...(await walkMarkdownFiles(full, excludeDirs)))
    else if (e.name.endsWith('.md')) files.push(full)
  }
  return files
}

async function rawMatches(base: string, excludeDirs: string[], query: string): Promise<RawMatch[]> {
  if (await binaryAvailable('rg')) {
    try {
      return await rgMatches(base, excludeDirs, query)
    } catch {
      // fall through to the JS scan
    }
  }
  return jsMatches(base, excludeDirs, query)
}

async function rgMatches(base: string, excludeDirs: string[], query: string): Promise<RawMatch[]> {
  const args = ['-n', '--no-heading', '--with-filename', '-e', query]
  for (const d of excludeDirs) args.push('-g', `!**/${d}/**`)
  args.push(base)
  const { stdout } = await run('rg', args)
  const out: RawMatch[] = []
  for (const line of stdout.split('\n')) {
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const file = line.slice(0, idx)
    const rest = line.slice(idx + 1)
    const idx2 = rest.indexOf(':')
    if (idx2 < 0) continue
    const lineNo = Number(rest.slice(0, idx2))
    if (Number.isInteger(lineNo)) out.push({ file, line: lineNo })
  }
  return out
}

async function jsMatches(base: string, excludeDirs: string[], query: string): Promise<RawMatch[]> {
  const needle = query.toLowerCase()
  const out: RawMatch[] = []
  for (const file of await walkMarkdownFiles(base, excludeDirs)) {
    const lines = (await readFile(file, 'utf8')).split('\n')
    lines.forEach((text, i) => {
      if (text.toLowerCase().includes(needle)) out.push({ file, line: i + 1 })
    })
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- search.test.ts`
Expected: PASS (passes whether or not `rg` is installed, because both code paths return the same sorted result).

- [ ] **Step 5: Commit**

```bash
git add src/search.ts tests/search.test.ts
git commit -m "feat: add full-text search with ripgrep fast path and JS fallback"
```

---

### Task 7: `fs-access.ts`

**Files:**
- Create: `src/fs-access.ts`
- Test: `tests/fs-access.test.ts`

**Interfaces:**
- Consumes: `VaultAccess` + result types from `access.ts`; `parseFrontmatter`; `extractLinkTargets`, `noteTitleFromPath`, `linkTargetMatchesNote`; `searchVault`, `walkMarkdownFiles`; `guardPath`.
- Produces: `class FsAccess implements VaultAccess` (constructor `(vaultRoot: string, excludeDirs: string[])`).

- [ ] **Step 1: Write the failing test**

`tests/fs-access.test.ts`:
```ts
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it, expect } from 'vitest'
import { FsAccess } from '../src/fs-access.js'

let tmp: string
afterEach(async () => { if (tmp) await rm(tmp, { recursive: true, force: true }) })

async function makeVault(): Promise<string> {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'vault-'))
  await mkdir(path.join(tmp, 'notes'), { recursive: true })
  await writeFile(path.join(tmp, 'notes', 'one.md'), '---\ntitle: One\n---\nBody one\n\nSee [[two]].\n')
  await writeFile(path.join(tmp, 'notes', 'two.md'), '# Two\n\nLinks to [[one]].\n')
  return tmp
}

describe('FsAccess', () => {
  it('lists notes sorted by path', async () => {
    const a = new FsAccess(await makeVault(), ['.obsidian', '.git', '.trash'])
    expect(await a.list()).toEqual([
      { path: 'notes/one.md', title: 'one' },
      { path: 'notes/two.md', title: 'two' },
    ])
  })

  it('reads a note with parsed frontmatter', async () => {
    const a = new FsAccess(await makeVault(), [])
    const r = await a.read('notes/one.md')
    expect(r.title).toBe('one')
    expect(r.frontmatter).toEqual({ title: 'One' })
    expect(r.content).toContain('Body one')
  })

  it('finds backlinks', async () => {
    const a = new FsAccess(await makeVault(), [])
    const backlinks = await a.backlinks('notes/one.md')
    expect(backlinks).toHaveLength(1)
    expect(backlinks[0].path).toBe('notes/two.md')
  })

  it('writes a new note and reports created', async () => {
    const a = new FsAccess(await makeVault(), [])
    const w = await a.write('notes/three.md', 'hello')
    expect(w.created).toBe(true)
    expect(await readFile(path.join(tmp, 'notes', 'three.md'), 'utf8')).toBe('hello')
  })

  it('appends to an existing note', async () => {
    const a = new FsAccess(await makeVault(), [])
    await a.append('notes/two.md', 'appended')
    expect(await readFile(path.join(tmp, 'notes', 'two.md'), 'utf8')).toContain('appended')
  })

  it('moves a note without updating links', async () => {
    const a = new FsAccess(await makeVault(), [])
    const m = await a.move('notes/two.md', 'archive/two.md')
    expect(m.linksUpdated).toBe(false)
    expect(await readFile(path.join(tmp, 'archive', 'two.md'), 'utf8')).toContain('# Two')
  })

  it('moves a note into .trash on delete', async () => {
    const a = new FsAccess(await makeVault(), [])
    const d = await a.delete('notes/two.md')
    expect(d.trashedTo).toBe('.trash/notes/two.md')
    expect(await readFile(path.join(tmp, '.trash', 'notes', 'two.md'), 'utf8')).toContain('# Two')
  })

  it('rejects a path escaping the vault', async () => {
    const a = new FsAccess(await makeVault(), [])
    await expect(a.read('../secret.md')).rejects.toThrow(/escapes/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fs-access.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/fs-access.ts`:
```ts
import path from 'node:path'
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises'
import { parseFrontmatter } from './frontmatter.js'
import { extractLinkTargets, noteTitleFromPath, linkTargetMatchesNote } from './wikilink.js'
import { searchVault, walkMarkdownFiles } from './search.js'
import { guardPath } from './vault-path.js'
import type {
  VaultAccess, NoteRef, SearchHit, Backlink, ReadResult,
  FrontmatterData, WriteResult, AppendResult, MoveResult, DeleteResult,
} from './access.js'

export class FsAccess implements VaultAccess {
  constructor(readonly vaultRoot: string, readonly excludeDirs: string[]) {}

  async list(dir?: string, limit = 200): Promise<NoteRef[]> {
    const base = dir ? guardPath(this.vaultRoot, dir) : this.vaultRoot
    const files = await walkMarkdownFiles(base, this.excludeDirs)
    files.sort()
    return files.slice(0, limit).map((file) => ({
      path: path.relative(this.vaultRoot, file),
      title: noteTitleFromPath(file),
    }))
  }

  search(query: string, opts?: { dir?: string; context?: number; limit?: number }): Promise<SearchHit[]> {
    return searchVault(this.vaultRoot, this.excludeDirs, query, opts)
  }

  async read(filePath: string): Promise<ReadResult> {
    const abs = guardPath(this.vaultRoot, filePath)
    const content = await readFile(abs, 'utf8')
    const { data } = parseFrontmatter(content)
    return {
      path: filePath.replace(/\\/g, '/'),
      title: noteTitleFromPath(filePath),
      frontmatter: data,
      content,
    }
  }

  async frontmatter(filePath: string): Promise<FrontmatterData> {
    const abs = guardPath(this.vaultRoot, filePath)
    const content = await readFile(abs, 'utf8')
    const { data, raw } = parseFrontmatter(content)
    return { path: filePath.replace(/\\/g, '/'), data, raw }
  }

  async backlinks(notePath: string): Promise<Backlink[]> {
    const files = await walkMarkdownFiles(this.vaultRoot, this.excludeDirs)
    const out: Backlink[] = []
    for (const file of files) {
      const content = await readFile(file, 'utf8')
      const targets = extractLinkTargets(content)
      if (!targets.some((t) => linkTargetMatchesNote(t, notePath))) continue
      out.push({
        path: path.relative(this.vaultRoot, file),
        title: noteTitleFromPath(file),
        snippet: this.snippetFor(content, notePath),
      })
    }
    return out
  }

  async write(filePath: string, content: string): Promise<WriteResult> {
    const abs = guardPath(this.vaultRoot, filePath)
    const existed = await this.exists(abs)
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, content, 'utf8')
    return { path: filePath.replace(/\\/g, '/'), created: !existed }
  }

  async append(filePath: string, content: string): Promise<AppendResult> {
    const abs = guardPath(this.vaultRoot, filePath)
    const existing = (await this.exists(abs)) ? await readFile(abs, 'utf8') : ''
    const separator = existing && !existing.endsWith('\n') ? '\n' : ''
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, existing + separator + content, 'utf8')
    return { path: filePath.replace(/\\/g, '/') }
  }

  async move(from: string, to: string): Promise<MoveResult> {
    const fromAbs = guardPath(this.vaultRoot, from)
    const toAbs = guardPath(this.vaultRoot, to)
    await mkdir(path.dirname(toAbs), { recursive: true })
    await rename(fromAbs, toAbs)
    return { from: from.replace(/\\/g, '/'), to: to.replace(/\\/g, '/'), linksUpdated: false }
  }

  async delete(filePath: string): Promise<DeleteResult> {
    const abs = guardPath(this.vaultRoot, filePath)
    const rel = path.relative(this.vaultRoot, abs)
    const trashDir = path.join(this.vaultRoot, '.trash')
    await mkdir(trashDir, { recursive: true })
    let target = path.join(trashDir, rel)
    if (await this.exists(target)) {
      target = path.join(trashDir, `${rel}.${Date.now()}`)
    }
    await mkdir(path.dirname(target), { recursive: true })
    await rename(abs, target)
    return { path: filePath.replace(/\\/g, '/'), trashedTo: path.relative(this.vaultRoot, target) }
  }

  private async exists(p: string): Promise<boolean> {
    try { await stat(p); return true } catch { return false }
  }

  private snippetFor(content: string, notePath: string): string {
    const title = noteTitleFromPath(notePath)
    for (const line of content.split('\n')) {
      if (line.includes(title)) return line.trim()
    }
    return ''
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fs-access.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fs-access.ts tests/fs-access.test.ts
git commit -m "feat: add filesystem VaultAccess implementation"
```

---

### Task 8: `cli-access.ts`

**Files:**
- Create: `src/cli-access.ts`
- Test: `tests/cli-access.test.ts`

**Interfaces:**
- Consumes: `FsAccess`; `run` from `spawn.ts`; `Backlink`, `MoveResult` from `access.ts`.
- Produces: `class CliAccess extends FsAccess` — overrides `backlinks` and `move` to prefer the `obsidian` CLI, falling back to the fs implementation on any error.

- [ ] **Step 1: Write the failing test**

`tests/cli-access.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CliAccess } from '../src/cli-access.js'

vi.mock('../src/spawn.js', () => ({
  run: vi.fn(),
  binaryAvailable: vi.fn(),
}))

import { run } from '../src/spawn.js'
const runMock = run as unknown as ReturnType<typeof vi.fn>

beforeEach(() => { runMock.mockReset() })

describe('CliAccess.backlinks', () => {
  it('maps CLI JSON when the CLI succeeds', async () => {
    runMock.mockResolvedValue({ stdout: JSON.stringify([{ path: 'x.md', snippet: 'see [[y]]' }]), stderr: '' })
    const a = new CliAccess('/tmp/vault', [])
    const backlinks = await a.backlinks('y.md')
    expect(backlinks).toEqual([{ path: 'x.md', title: 'x', snippet: 'see [[y]]' }])
    expect(runMock).toHaveBeenCalledWith('obsidian', ['backlinks', 'path=y.md', 'format=json'], { cwd: '/tmp/vault' })
  })

  it('falls back to the fs scan when the CLI fails', async () => {
    runMock.mockRejectedValue(new Error('no cli'))
    const a = new CliAccess('/tmp/nonexistent-vault-xyz', [])
    await expect(a.backlinks('y.md')).resolves.toEqual([])
  })
})

describe('CliAccess.move', () => {
  it('reports linksUpdated when the CLI move succeeds', async () => {
    runMock.mockResolvedValue({ stdout: '', stderr: '' })
    const a = new CliAccess('/tmp/vault', [])
    const m = await a.move('a.md', 'b.md')
    expect(m).toEqual({ from: 'a.md', to: 'b.md', linksUpdated: true })
    expect(runMock).toHaveBeenCalledWith('obsidian', ['move', 'path=a.md', 'to=b.md'], { cwd: '/tmp/vault' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- cli-access.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/cli-access.ts`:
```ts
import path from 'node:path'
import { FsAccess } from './fs-access.js'
import { run } from './spawn.js'
import type { Backlink, MoveResult } from './access.js'

export class CliAccess extends FsAccess {
  async backlinks(notePath: string): Promise<Backlink[]> {
    try {
      const { stdout } = await run('obsidian', ['backlinks', `path=${notePath}`, 'format=json'], { cwd: this.vaultRoot })
      const parsed = JSON.parse(stdout) as unknown
      if (Array.isArray(parsed)) {
        return parsed.map((entry: any) => ({
          path: String(entry.path ?? ''),
          title: String(entry.title ?? path.basename(String(entry.path ?? ''), '.md')),
          snippet: String(entry.snippet ?? ''),
        }))
      }
    } catch {
      // fall through to the fs implementation
    }
    return super.backlinks(notePath)
  }

  async move(from: string, to: string): Promise<MoveResult> {
    try {
      await run('obsidian', ['move', `path=${from}`, `to=${to}`], { cwd: this.vaultRoot })
      return { from: from.replace(/\\/g, '/'), to: to.replace(/\\/g, '/'), linksUpdated: true }
    } catch {
      return super.move(from, to)
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- cli-access.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli-access.ts tests/cli-access.test.ts
git commit -m "feat: add obsidian CLI access for backlinks and move"
```

---

### Task 9: `detect.ts`

**Files:**
- Create: `src/detect.ts`
- Test: `tests/detect.test.ts`

**Interfaces:**
- Consumes: `detectVaultRootFromAppConfig`, `resolveVaultRoot` from `vault-path.ts`; `binaryAvailable` from `spawn.ts`; `FsAccess`, `CliAccess`; `VaultAccess` from `access.ts`.
- Produces: `setupAccess(config: AccessConfig, deps?: SetupDeps): Promise<AccessSetup>` where `AccessSetup = { vaultRoot: string; access: VaultAccess }`.

- [ ] **Step 1: Write the failing test**

`tests/detect.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { setupAccess } from '../src/detect.js'
import { FsAccess } from '../src/fs-access.js'
import { CliAccess } from '../src/cli-access.js'

describe('setupAccess', () => {
  it('resolves an explicit vault path with fs access when the CLI is unavailable', async () => {
    const setup = await setupAccess(
      { vaultPath: '/tmp/vault', useCli: true, excludeDirs: [] },
      { detectVaultRoot: async () => null, cliAvailable: async () => false },
    )
    expect(setup.vaultRoot).toBe('/tmp/vault')
    expect(setup.access).toBeInstanceOf(FsAccess)
  })

  it('uses CliAccess when the CLI is available', async () => {
    const setup = await setupAccess(
      { vaultPath: '/tmp/vault', useCli: true, excludeDirs: [] },
      { detectVaultRoot: async () => null, cliAvailable: async () => true },
    )
    expect(setup.access).toBeInstanceOf(CliAccess)
  })

  it('does not use the CLI when useCli is false', async () => {
    const setup = await setupAccess(
      { vaultPath: '/tmp/vault', useCli: false, excludeDirs: [] },
      { detectVaultRoot: async () => null, cliAvailable: async () => true },
    )
    expect(setup.access).toBeInstanceOf(FsAccess)
  })

  it('auto-detects the vault when no explicit path is given', async () => {
    const setup = await setupAccess(
      { useCli: false, excludeDirs: [] },
      { detectVaultRoot: async () => '/detected/vault', cliAvailable: async () => false },
    )
    expect(setup.vaultRoot).toBe('/detected/vault')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- detect.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/detect.ts`:
```ts
import { detectVaultRootFromAppConfig, resolveVaultRoot } from './vault-path.js'
import { binaryAvailable } from './spawn.js'
import { FsAccess } from './fs-access.js'
import { CliAccess } from './cli-access.js'
import type { VaultAccess } from './access.js'

export interface AccessConfig {
  vaultPath?: string
  useCli: boolean
  excludeDirs: string[]
}

export interface AccessSetup {
  vaultRoot: string
  access: VaultAccess
}

export interface SetupDeps {
  detectVaultRoot: () => Promise<string | null>
  cliAvailable: () => Promise<boolean>
}

export async function setupAccess(
  config: AccessConfig,
  deps: SetupDeps = { detectVaultRoot: detectVaultRootFromAppConfig, cliAvailable: () => binaryAvailable('obsidian') },
): Promise<AccessSetup> {
  const detected = await deps.detectVaultRoot()
  const vaultRoot = resolveVaultRoot(config.vaultPath, detected)
  const useCli = config.useCli && (await deps.cliAvailable())
  const access = useCli ? new CliAccess(vaultRoot, config.excludeDirs) : new FsAccess(vaultRoot, config.excludeDirs)
  return { vaultRoot, access }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- detect.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/detect.ts tests/detect.test.ts
git commit -m "feat: add access setup with vault detection and CLI detection"
```

---

### Task 10: `tools.ts`

**Files:**
- Create: `src/tools.ts`
- Test: `tests/tools.test.ts`

**Interfaces:**
- Consumes: `defineTool` from `@deepseek-ai/dsh-tools`; `Context` from `@deepseek-ai/cordis`; `VaultAccess` from `access.ts`.
- Produces: `registerTools(ctx: Context, access: VaultAccess): void` — registers the 9 `obsidian_*` tools.

- [ ] **Step 1: Write the failing test**

`tests/tools.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { registerTools } from '../src/tools.js'
import type { VaultAccess } from '../src/access.js'

function fakeCtx() {
  const registered: any[] = []
  const ctx = { tools: { register: (def: any) => { registered.push(def) } } } as unknown as Context
  return { ctx, registered }
}

const fakeAccess = {
  vaultRoot: '/tmp/vault',
  list: async () => [{ path: 'a.md', title: 'a' }],
  search: async () => [],
  read: async () => ({ path: 'a.md', title: 'a', frontmatter: null, content: 'body' }),
  frontmatter: async () => ({ path: 'a.md', data: null, raw: null }),
  backlinks: async () => [],
  write: async () => ({ path: 'a.md', created: true }),
  append: async () => ({ path: 'a.md' }),
  move: async () => ({ from: 'a.md', to: 'b.md', linksUpdated: false }),
  delete: async () => ({ path: 'a.md', trashedTo: '.trash/a.md' }),
} as unknown as VaultAccess

describe('registerTools', () => {
  it('registers the expected 9 obsidian tools', () => {
    const { ctx, registered } = fakeCtx()
    registerTools(ctx, fakeAccess)
    expect(registered.map((d) => d.name)).toEqual([
      'obsidian_list', 'obsidian_search', 'obsidian_read', 'obsidian_frontmatter',
      'obsidian_backlinks', 'obsidian_write', 'obsidian_append', 'obsidian_move', 'obsidian_delete',
    ])
  })

  it('obsidian_read delegates to access.read and returns the canonical value', async () => {
    const { ctx, registered } = fakeCtx()
    registerTools(ctx, fakeAccess)
    const readTool = registered.find((d) => d.name === 'obsidian_read')
    const value = await readTool.execute({ path: 'a.md' }, { signal: new AbortController().signal } as any)
    expect(value).toEqual({ path: 'a.md', title: 'a', frontmatter: null, content: 'body' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tools.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/tools.ts`:
```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { VaultAccess } from './access.js'

export function registerTools(ctx: Context, access: VaultAccess): void {
  ctx.tools.register(defineTool({
    name: 'obsidian_list',
    description: 'List notes in the Obsidian vault, optionally under a subdirectory.',
    parameters: {
      dir: { type: 'string', description: 'Subdirectory relative to the vault root.' },
      limit: { type: 'integer', description: 'Maximum notes to return (default 200).' },
    },
    output: {
      schema: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            path: { type: 'string', required: true },
            title: { type: 'string', required: true },
          },
        },
      },
      render: (_args: any, value: any) => value.length === 0
        ? [{ type: 'text', text: 'No notes found.' }]
        : [{ type: 'text', text: value.map((n: any) => `${n.path} (${n.title})`).join('\n') }],
    },
    execute: (args) => access.list(args.dir, args.limit),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_search',
    description: 'Full-text search the Obsidian vault. Returns matching lines with surrounding context.',
    parameters: {
      query: { type: 'string', required: true, description: 'Case-insensitive substring to search for.' },
      dir: { type: 'string', description: 'Subdirectory to limit the search to.' },
      context: { type: 'integer', description: 'Lines of context before/after each match (default 1).' },
      limit: { type: 'integer', description: 'Maximum matches to return (default 50).' },
    },
    output: {
      schema: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            path: { type: 'string', required: true },
            line: { type: 'integer', required: true },
            lineText: { type: 'string', required: true },
            contextBefore: { type: 'array', required: true, items: { type: 'string' } },
            contextAfter: { type: 'array', required: true, items: { type: 'string' } },
          },
        },
      },
      render: (_args: any, value: any) => value.length === 0
        ? [{ type: 'text', text: 'No matches.' }]
        : [{ type: 'text', text: value.map((h: any) => `${h.path}:${h.line}: ${h.lineText}`).join('\n') }],
    },
    execute: (args) => access.search(args.query, { dir: args.dir, context: args.context, limit: args.limit }),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_read',
    description: 'Read a note by its path relative to the vault root (e.g. "Folder/Note.md").',
    parameters: {
      path: { type: 'string', required: true, description: 'Path relative to the vault root.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          title: { type: 'string', required: true },
          frontmatter: { type: 'json', required: true },
          content: { type: 'string', required: true },
        },
      },
      render: (_args: any, value: any) => [{ type: 'text', text: value.content }],
    },
    execute: (args) => access.read(args.path),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_frontmatter',
    description: 'Read only the YAML frontmatter (properties) of a note.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path relative to the vault root.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          data: { type: 'json', required: true },
          raw: { type: 'json', required: true },
        },
      },
      render: (_args: any, value: any) => [{ type: 'text', text: typeof value.raw === 'string' ? value.raw : JSON.stringify(value.raw) }],
    },
    execute: (args) => access.frontmatter(args.path),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_backlinks',
    description: 'Find notes that link to the given note via [[wikilinks]].',
    parameters: {
      path: { type: 'string', required: true, description: 'Path relative to the vault root.' },
    },
    output: {
      schema: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            path: { type: 'string', required: true },
            title: { type: 'string', required: true },
            snippet: { type: 'string', required: true },
          },
        },
      },
      render: (_args: any, value: any) => value.length === 0
        ? [{ type: 'text', text: 'No backlinks.' }]
        : [{ type: 'text', text: value.map((b: any) => `${b.path}: ${b.snippet}`).join('\n') }],
    },
    execute: (args) => access.backlinks(args.path),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_write',
    description: 'Create or overwrite a note at the given path. Parent directories are created as needed.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path relative to the vault root, ending in .md.' },
      content: { type: 'string', required: true, description: 'Full Markdown content to write.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          created: { type: 'boolean', required: true },
        },
      },
      render: (_args: any, value: any) => [{ type: 'text', text: `${value.created ? 'Created' : 'Updated'} ${value.path}` }],
    },
    execute: (args) => access.write(args.path, args.content),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_append',
    description: 'Append text to the end of a note, creating it if it does not exist.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path relative to the vault root.' },
      content: { type: 'string', required: true, description: 'Text to append.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
        },
      },
      render: (_args: any, value: any) => [{ type: 'text', text: `Appended to ${value.path}` }],
    },
    execute: (args) => access.append(args.path, args.content),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_move',
    description: 'Move or rename a note. When the Obsidian CLI is available, backlinks are updated automatically.',
    parameters: {
      from: { type: 'string', required: true, description: 'Current path relative to the vault root.' },
      to: { type: 'string', required: true, description: 'Destination path relative to the vault root.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          from: { type: 'string', required: true },
          to: { type: 'string', required: true },
          linksUpdated: { type: 'boolean', required: true },
        },
      },
      render: (_args: any, value: any) => [{ type: 'text', text: `Moved ${value.from} to ${value.to}${value.linksUpdated ? ' (links updated)' : ''}` }],
    },
    execute: (args) => access.move(args.from, args.to),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_delete',
    description: 'Move a note to the vault trash (.trash/). Reversible; never permanently deletes.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path relative to the vault root.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          trashedTo: { type: 'string', required: true },
        },
      },
      render: (_args: any, value: any) => [{ type: 'text', text: `Trashed ${value.path} to ${value.trashedTo}` }],
    },
    execute: (args) => access.delete(args.path),
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tools.test.ts`
Expected: PASS. (This also validates that every `defineTool` schema is well-formed — an invalid schema throws at registration time.)

- [ ] **Step 5: Commit**

```bash
git add src/tools.ts tests/tools.test.ts
git commit -m "feat: register 9 obsidian tools via defineTool"
```

---

### Task 11: `index.ts` — plugin entry + Config

**Files:**
- Create: `src/index.ts`

**Interfaces:**
- Consumes: `setupAccess` from `detect.ts`; `registerTools` from `tools.ts`; `Context` from `@deepseek-ai/cordis`; `z` from `@deepseek-ai/schemastery`.
- Produces: the plugin's public named exports `name`, `inject`, `Config`, `apply`.

- [ ] **Step 1: Write the entry module**

`src/index.ts`:
```ts
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { setupAccess } from './detect.js'
import { registerTools } from './tools.js'

export const name = 'dsh-obsidian'
export const inject = ['tools']

export const Config = z.object({
  vaultPath: z.string().optional().describe('Absolute path to the Obsidian vault; leave empty to auto-detect from obsidian.json'),
  useCli: z.boolean().default(true).describe('Delegate backlinks/move to the obsidian CLI when available'),
  excludeDirs: z.array(z.string()).default(['.obsidian', '.git', '.trash']).describe('Directories excluded from search and list'),
})

type Cfg = { vaultPath?: string; useCli: boolean; excludeDirs: string[] }

export function apply(ctx: Context, config: Cfg): void {
  void (async () => {
    const { access } = await setupAccess(config)
    registerTools(ctx, access)
  })().catch((err) => {
    console.error('[dsh-obsidian] failed to mount:', err)
  })
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run build`
Expected: emits `lib/index.js` and `lib/index.d.ts` (plus the bundled deps if tsdown inlines them).

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tasks' tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add plugin entry with Config and apply"
```

---

### Task 12: Manual smoke test, README, and publish prep

**Files:**
- Create: `README.md`
- Modify: none

**Interfaces:**
- Produces: an installable bundle verified end-to-end against a real dsh instance.

- [ ] **Step 1: Write the README**

`README.md` (English; the awesome-dsh-plugin PR needs the description in the README too):
```markdown
# dsh-obsidian

Connect [DeepSeek Harness](https://github.com/deepseek-ai/dsh) (`dsh`) to a local [Obsidian](https://obsidian.md) vault. Your `dsh` agent can search, read, write, move, and trash notes directly — no MCP server, no OAuth, because an Obsidian vault is just Markdown files on disk.

## Features

- **Zero server** — reads/writes the vault filesystem directly; no Local REST API plugin, no MCP server.
- **Optional Obsidian-aware ops** — when the `obsidian` CLI is available, `backlinks` and `move` delegate to it (link-aware moves); otherwise everything runs on the filesystem.
- **Safe by default** — deletes move notes into `.trash/` (reversible), paths can't escape the vault, and `.obsidian/` is never touched.

## Install

```sh
dsh plugin --profile web add dsh-obsidian
```

## Configure

In your profile's plugin config, set the vault path (optional — auto-detected from `obsidian.json` if left empty):

```yaml
dsh-obsidian:
  vaultPath: /Users/you/MyVault   # optional
  useCli: true                    # optional, default true
  excludeDirs: [".obsidian", ".git", ".trash"]
```

## Tools

- `obsidian_list` — list notes under a directory
- `obsidian_search` — full-text search with context
- `obsidian_read` — read a note (body + parsed frontmatter)
- `obsidian_frontmatter` — read only a note's YAML properties
- `obsidian_backlinks` — find notes linking to a note
- `obsidian_write` — create or overwrite a note
- `obsidian_append` — append text to a note
- `obsidian_move` — move/rename a note
- `obsidian_delete` — trash a note (reversible)

## Requirements

- Node >= 22.12.0
- Obsidian CLI (optional, for link-aware moves and CLI backlinks)

## License

MIT
```

- [ ] **Step 2: Package the bundle and install into a dsh profile**

Run:
```bash
npm run build
npm pack
# produces dsh-obsidian-0.1.0.tgz
```

Then, with the harness available:
```sh
cd /Users/admin/Mingdom/deepseek-harness
pnpm dsh plugin --profile web add /Users/admin/Mingdom/dsh-obsidian/dsh-obsidian-0.1.0.tgz
pnpm dsh web
```

Expected: the plugin loads; on startup you see no `[dsh-obsidian] failed to mount` error (with `obsidian` CLI absent, it silently uses fs access).

- [ ] **Step 3: Exercise the tools in the Web UI**

Open `http://127.0.0.1:3080` and ask the agent to:
1. `Use obsidian_list to list the notes in my vault.`
2. `Use obsidian_read to read the note <some real path>.`
3. `Use obsidian_search to find "<a term that appears in a note>".`

Expected: each tool returns the correct result. If the vault was auto-detected, confirm it points at `/Users/admin/Mingdom/Obsidian/Mingdom` (or set `vaultPath` explicitly).

- [ ] **Step 4: Commit the README**

```bash
git add README.md
git commit -m "docs: add README"
```

- [ ] **Step 5: Publish and contribute (do these WITH the user — the GitHub remote is created together)**

- Add the `dsh-plugin` topic to the GitHub repo.
- `npm publish` (prebuilt — avoids the `allowBuilds` approval step).
- Open a PR to `awesome-dsh-plugin` adding one line to `README.md` and `README.zh.md` under **Tools & Capabilities**:
  ```
  - [owner/dsh-obsidian](https://github.com/owner/dsh-obsidian) - Connect DeepSeek Harness to a local Obsidian vault: search, read, write, move, and trash notes.
  ```

---

## Self-Review Notes (already applied)

- **Spec coverage:** every spec section maps to a task — package shape (1), Config (11), tools (10), access layer A+B (7/8), safety (5 guard, 7 delete-to-trash), testing (each task), distribution (12). `frontmatter`/`backlinks`/`search` cover the read tools; `write`/`append`/`move`/`delete` cover the write tools.
- **Type consistency:** `VaultAccess` method signatures in `access.ts` (Task 3) match `FsAccess`/`CliAccess` (Tasks 7/8) and the `access.*` calls in `tools.ts` (Task 10). `setupAccess`'s `AccessConfig` shape matches `index.ts`'s `Cfg`.
- **Deviation (intentional):** `obsidian_list` has no `glob` filter — `dir` + `limit` suffice for v1.
