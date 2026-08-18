# dsh-obsidian 0.2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `move` reliably rewrite wikilinks in pure fs, add frontmatter property management and tag listing, harden correctness (atomic writes, mount race, delete collision), and remove the broken CLI backlinks/move integration.

**Architecture:** FsAccess becomes the only required path for all operations; CliAccess remains an optional enhancement that only overrides `setProperty`/`deleteProperty` via the verified `property:set`/`property:remove` commands. `useCli` defaults to `false`.

**Tech Stack:** TypeScript (strict, ESM), node:fs/promises, `yaml`, vitest, tsdown, @deepseek-ai/cordis + dsh-tools + schemastery.

**Spec:** `docs/superpowers/specs/2026-08-18-dsh-obsidian-0.2.0.md`

## Global Constraints

- Node `>= 22.12.0`; ESM (`"type": "module"`); TypeScript `strict`.
- All tool path parameters are relative to the vault root and MUST pass `guardPath` (no escape).
- Never touch `.obsidian/`; default `excludeDirs` = `['.obsidian', '.git', '.trash']`.
- Delete only moves into `.trash/` (reversible), never permanent.
- Tool names are prefixed `obsidian_`.
- No default export: named exports `name` / `inject` / `Config` / `apply`.
- Tests use vitest with a temp-dir fixture pattern (see `tests/fs-access.test.ts`).
- CLI values observed on Obsidian 1.13.7: `property:set name=… value=… path=…` rewrites YAML correctly; `tags format=json` returns `[{ "tag": "#…" }]` (tag includes `#`, no `count` by default).

---

### Task 1: `rewriteNoteLinks` pure function

**Files:**
- Create: `src/link-update.ts`
- Test: `tests/link-update.test.ts`

**Interfaces:**
- Consumes: `noteTitleFromPath`, `linkTargetMatchesNote` from `src/wikilink.ts`.
- Produces: `rewriteNoteLinks(content: string, from: string, to: string): LinkRewriteResult` where `LinkRewriteResult = { content: string; changed: boolean }`.

- [ ] **Step 1: Write the failing test**

Create `tests/link-update.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rewriteNoteLinks } from '../src/link-update.js'

describe('rewriteNoteLinks', () => {
  it('rewrites a basename link', () => {
    const r = rewriteNoteLinks('see [[A]] here', 'A.md', 'B.md')
    expect(r.content).toBe('see [[B]] here')
    expect(r.changed).toBe(true)
  })

  it('rewrites a full-path link preserving the directory', () => {
    const r = rewriteNoteLinks('see [[Folder/A]]', 'Folder/A.md', 'Folder/B.md')
    expect(r.content).toBe('see [[Folder/B]]')
  })

  it('rewrites a cross-directory path link to the new path', () => {
    const r = rewriteNoteLinks('see [[Folder/A]]', 'Folder/A.md', 'Other/B.md')
    expect(r.content).toBe('see [[Other/B]]')
  })

  it('preserves alias and heading', () => {
    const r = rewriteNoteLinks('[[A|alias]] and [[A#sec]]', 'A.md', 'B.md')
    expect(r.content).toBe('[[B|alias]] and [[B#sec]]')
  })

  it('does not touch unrelated links', () => {
    const r = rewriteNoteLinks('[[Other]] and [[A]]', 'A.md', 'B.md')
    expect(r.content).toBe('[[Other]] and [[B]]')
  })

  it('reports changed=false when nothing matches', () => {
    const r = rewriteNoteLinks('[[Other]]', 'A.md', 'B.md')
    expect(r.changed).toBe(false)
    expect(r.content).toBe('[[Other]]')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/link-update.test.ts`
Expected: FAIL with "Cannot find module '../src/link-update.js'".

- [ ] **Step 3: Write minimal implementation**

Create `src/link-update.ts`:

```ts
import { noteTitleFromPath, linkTargetMatchesNote } from './wikilink.js'

const WIKILINK_RE = /\[\[([^\[\]\n|#]+)(#[^\[\]\n|]*)?(\|[^\[\]\n]*)?\]\]/g

function stripMd(p: string): string {
  return p.replace(/\.md$/i, '')
}

export interface LinkRewriteResult {
  content: string
  changed: boolean
}

export function rewriteNoteLinks(content: string, from: string, to: string): LinkRewriteResult {
  const fromBase = noteTitleFromPath(from)
  const toBase = noteTitleFromPath(to)
  const toPath = stripMd(to)
  let changed = false
  const out = content.replace(WIKILINK_RE, (match, target: string, heading?: string, alias?: string) => {
    if (!linkTargetMatchesNote(target, from)) return match
    const newTarget = stripMd(target) === fromBase ? toBase : toPath
    changed = true
    return `[[${newTarget}${heading ?? ''}${alias ?? ''}]]`
  })
  return { content: out, changed }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/link-update.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/link-update.ts tests/link-update.test.ts
git commit -m "feat: add pure-fs wikilink rewrite for move"
```

---

### Task 2: Integrate link rewrite into `FsAccess.move`

**Files:**
- Modify: `src/fs-access.ts` (the `move` method)
- Test: `tests/fs-access.test.ts`

**Interfaces:**
- Consumes: `rewriteNoteLinks` from Task 1.
- Produces: `FsAccess.move` returns `linksUpdated: true` when any note's links changed.

- [ ] **Step 1: Write the failing test**

In `tests/fs-access.test.ts`, add:

```ts
it('moves a note and updates links when the basename changes', async () => {
  const a = new FsAccess(await makeVault(), [])
  const m = await a.move('notes/two.md', 'notes/renamed.md')
  expect(m.linksUpdated).toBe(true)
  expect(await readFile(path.join(tmp, 'notes', 'one.md'), 'utf8')).toContain('[[renamed]]')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fs-access.test.ts`
Expected: FAIL — `linksUpdated` is `false` and `one.md` still contains `[[two]]`.

- [ ] **Step 3: Write minimal implementation**

In `src/fs-access.ts`, import the rewrite helper (add to the existing imports):

```ts
import { rewriteNoteLinks } from './link-update.js'
```

Replace the `move` method body:

```ts
  async move(from: string, to: string): Promise<MoveResult> {
    const fromAbs = guardPath(this.vaultRoot, from)
    const toAbs = guardPath(this.vaultRoot, to)
    await mkdir(path.dirname(toAbs), { recursive: true })
    await rename(fromAbs, toAbs)
    let linksUpdated = false
    for (const file of await walkMarkdownFiles(this.vaultRoot, this.excludeDirs)) {
      const content = await readFile(file, 'utf8')
      const { content: next, changed } = rewriteNoteLinks(content, from, to)
      if (changed) {
        await writeFile(file, next, 'utf8')
        linksUpdated = true
      }
    }
    return { from: from.replace(/\\/g, '/'), to: to.replace(/\\/g, '/'), linksUpdated }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fs-access.test.ts`
Expected: PASS (existing tests + new test; note the existing `moves a note without updating links` test still passes because it renames `two.md` → `archive/two.md`, basename unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/fs-access.ts tests/fs-access.test.ts
git commit -m "feat: update wikilinks on move in FsAccess"
```

---

### Task 3: Atomic write/append

**Files:**
- Modify: `src/fs-access.ts` (add `atomicWrite`, use in `write` and `append`)
- Test: `tests/fs-access.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/fs-access.test.ts`, add (import `readdir` from `node:fs/promises`):

```ts
it('leaves no temp files behind after write', async () => {
  const a = new FsAccess(await makeVault(), [])
  await a.write('notes/new.md', 'hello')
  const entries = await readdir(path.join(tmp, 'notes'))
  expect(entries).toContain('new.md')
  expect(entries.filter((e) => e.includes('.tmp'))).toHaveLength(0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fs-access.test.ts`
Expected: FAIL if the current direct `writeFile` leaves no temp file — the assertion is a guard; if it already passes, proceed (the test is a regression guard, not red-first in the strict sense). If it passes, note it and continue to Step 3.

- [ ] **Step 3: Write minimal implementation**

Add a private helper to `FsAccess` (near `exists`):

```ts
  private async atomicWrite(abs: string, content: string): Promise<void> {
    await mkdir(path.dirname(abs), { recursive: true })
    const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.${process.pid}.${Date.now()}.tmp`)
    await writeFile(tmp, content, 'utf8')
    await rename(tmp, abs)
  }
```

Change `write` to use it:

```ts
    await this.atomicWrite(abs, content)
```

Change `append` to build the combined content then call `atomicWrite` instead of the final `writeFile`:

```ts
    await this.atomicWrite(abs, existing + separator + content)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fs-access.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fs-access.ts tests/fs-access.test.ts
git commit -m "fix: write and append atomically via temp file + rename"
```

---

### Task 4: `delete` name-collision guard

**Files:**
- Modify: `src/fs-access.ts` (add counter to `delete`)
- Test: `tests/fs-access.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/fs-access.test.ts`, add:

```ts
it('does not overwrite an existing trash entry', async () => {
  const a = new FsAccess(await makeVault(), [])
  const d1 = await a.delete('notes/two.md')
  await a.write('notes/two.md', 'new content')
  const d2 = await a.delete('notes/two.md')
  expect(d2.trashedTo).not.toBe(d1.trashedTo)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fs-access.test.ts`
Expected: FAIL if the `Date.now()`-only suffix collides; with the current code the two deletes happen in different milliseconds and may pass. If it passes, proceed (it is a regression guard).

- [ ] **Step 3: Write minimal implementation**

Add a field `private deleteCounter = 0` to the `FsAccess` class and update the collision branch in `delete`:

```ts
    if (await this.exists(target)) {
      const ext = path.extname(rel)
      const stem = ext ? rel.slice(0, -ext.length) : rel
      target = path.join(trashDir, `${stem}.${Date.now()}.${++this.deleteCounter}${ext}`)
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fs-access.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fs-access.ts tests/fs-access.test.ts
git commit -m "fix: avoid trash name collision with a per-instance counter"
```

---

### Task 5: Frontmatter property set/delete

**Files:**
- Modify: `src/frontmatter.ts`
- Test: `tests/frontmatter.test.ts`

**Interfaces:**
- Consumes: existing `parseFrontmatter`, `JsonValue` from `@deepseek-ai/dsh-tools`, `yaml` `stringify`.
- Produces: `setFrontmatterProperty(content, key, value): string` and `deleteFrontmatterProperty(content, key): string`.

- [ ] **Step 1: Write the failing test**

In `tests/frontmatter.test.ts`, add (import the two functions):

```ts
it('sets a property preserving existing ones', () => {
  const out = setFrontmatterProperty('---\ntitle: Hi\ntags: [a, b]\n---\nBody', 'status', 'done')
  const { data, body } = parseFrontmatter(out)
  expect(data).toMatchObject({ title: 'Hi', tags: ['a', 'b'], status: 'done' })
  expect(body).toBe('Body')
})

it('creates frontmatter when none exists', () => {
  const out = setFrontmatterProperty('# Heading\n\nBody', 'title', 'New')
  expect(out.startsWith('---\n')).toBe(true)
  const { data } = parseFrontmatter(out)
  expect(data).toEqual({ title: 'New' })
})

it('deletes a property', () => {
  const out = deleteFrontmatterProperty('---\ntitle: Hi\nstatus: done\n---\nBody', 'status')
  expect(parseFrontmatter(out).data).toEqual({ title: 'Hi' })
})

it('drops frontmatter when the last property is removed', () => {
  const out = deleteFrontmatterProperty('---\ntitle: Hi\n---\nBody', 'title')
  expect(out).toBe('Body')
  expect(parseFrontmatter(out).data).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/frontmatter.test.ts`
Expected: FAIL — `setFrontmatterProperty` / `deleteFrontmatterProperty` not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/frontmatter.ts`, change the `yaml` import to include `stringify` and add:

```ts
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
```

Add these functions after `parseFrontmatter`:

```ts
export function setFrontmatterProperty(content: string, key: string, value: JsonValue): string {
  const { data, body } = parseFrontmatter(content)
  const base = asRecord(data)
  base[key] = value
  return renderFrontmatter(base, body)
}

export function deleteFrontmatterProperty(content: string, key: string): string {
  const { data, body } = parseFrontmatter(content)
  const base = asRecord(data)
  delete base[key]
  return renderFrontmatter(base, body)
}

function asRecord(data: JsonValue | null): Record<string, JsonValue> {
  if (data && typeof data === 'object' && !Array.isArray(data)) return { ...data } as Record<string, JsonValue>
  return {}
}

function renderFrontmatter(data: Record<string, JsonValue>, body: string): string {
  if (Object.keys(data).length === 0) return body
  return `---\n${stringifyYaml(data)}---\n${body}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/frontmatter.test.ts`
Expected: PASS (existing 4 + new 4).

- [ ] **Step 5: Commit**

```bash
git add src/frontmatter.ts tests/frontmatter.test.ts
git commit -m "feat: add frontmatter set/delete property helpers"
```

---

### Task 6: Tag extraction

**Files:**
- Create: `src/tags.ts`
- Test: `tests/tags.test.ts`

**Interfaces:**
- Consumes: `parseFrontmatter` from `src/frontmatter.ts`.
- Produces: `extractTags(content: string): Set<string>` (bare tag names, no `#`).

- [ ] **Step 1: Write the failing test**

Create `tests/tags.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractTags } from '../src/tags.js'

describe('extractTags', () => {
  it('extracts frontmatter tags as a list', () => {
    expect([...extractTags('---\ntags: [a, b]\n---\nBody')].sort()).toEqual(['a', 'b'])
  })

  it('extracts frontmatter tags as a single string', () => {
    expect([...extractTags('---\ntags: solo\n---\nBody')]).toEqual(['solo'])
  })

  it('extracts inline #tags', () => {
    expect([...extractTags('# Heading\n\nnote about #ai and #machine-learning')].sort()).toEqual(['ai', 'machine-learning'])
  })

  it('ignores tags inside fenced code blocks', () => {
    expect([...extractTags('before\n```js\nconst x = "#notatag"\n```\nafter #real')]).toEqual(['real'])
  })

  it('returns an empty set when no tags', () => {
    expect([...extractTags('plain text')]).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tags.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/tags.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tags.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tags.ts tests/tags.test.ts
git commit -m "feat: add tag extraction (frontmatter + inline)"
```

---

### Task 7: Wire `setProperty` / `deleteProperty` / `listTags` into the access layer and tools

**Files:**
- Modify: `src/access.ts`, `src/fs-access.ts`, `src/tools.ts`
- Test: `tests/fs-access.test.ts`, `tests/tools.test.ts`

**Interfaces:**
- Consumes: `setFrontmatterProperty` / `deleteFrontmatterProperty` (Task 5), `extractTags` (Task 6), existing `FrontmatterData` type.
- Produces: `VaultAccess.setProperty(path, key, value): Promise<FrontmatterData>`, `VaultAccess.deleteProperty(path, key): Promise<FrontmatterData>`, `VaultAccess.listTags(opts?): Promise<TagRef[]>` where `TagRef = { tag: string; count: number }`.

- [ ] **Step 1: Extend the interface and types**

In `src/access.ts`, add after `FrontmatterData`:

```ts
export interface TagRef { tag: string; count: number }
```

Add three methods to `VaultAccess` (after `delete`):

```ts
  setProperty(path: string, key: string, value: JsonValue): Promise<FrontmatterData>
  deleteProperty(path: string, key: string): Promise<FrontmatterData>
  listTags(opts?: { dir?: string }): Promise<TagRef[]>
```

- [ ] **Step 2: Implement in FsAccess**

In `src/fs-access.ts`, add imports:

```ts
import { setFrontmatterProperty, deleteFrontmatterProperty } from './frontmatter.js'
import { extractTags } from './tags.js'
```

Add `TagRef` and `JsonValue` to the type imports from `./access.js` / `@deepseek-ai/dsh-tools`:

```ts
import type { VaultAccess, NoteRef, SearchHit, Backlink, ReadResult, FrontmatterData, WriteResult, AppendResult, MoveResult, DeleteResult, TagRef } from './access.js'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
```

Add methods to `FsAccess` (after `delete`):

```ts
  async setProperty(filePath: string, key: string, value: JsonValue): Promise<FrontmatterData> {
    const abs = guardPath(this.vaultRoot, filePath)
    const content = await readFile(abs, 'utf8')
    await this.atomicWrite(abs, setFrontmatterProperty(content, key, value))
    return this.frontmatter(filePath)
  }

  async deleteProperty(filePath: string, key: string): Promise<FrontmatterData> {
    const abs = guardPath(this.vaultRoot, filePath)
    const content = await readFile(abs, 'utf8')
    await this.atomicWrite(abs, deleteFrontmatterProperty(content, key))
    return this.frontmatter(filePath)
  }

  async listTags(opts?: { dir?: string }): Promise<TagRef[]> {
    const base = opts?.dir ? guardPath(this.vaultRoot, opts.dir) : this.vaultRoot
    const files = await walkMarkdownFiles(base, this.excludeDirs)
    const counts = new Map<string, number>()
    for (const file of files) {
      const content = await readFile(file, 'utf8')
      for (const tag of extractTags(content)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag: `#${tag}`, count }))
      .sort((a, b) => a.tag.localeCompare(b.tag))
  }
```

- [ ] **Step 3: Register the three tools**

In `src/tools.ts`, append before the closing `}` of `registerTools`:

```ts
  ctx.tools.register(defineTool({
    name: 'obsidian_set_property',
    description: 'Set or update a single frontmatter property (YAML) on a note.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path relative to the vault root.' },
      key: { type: 'string', required: true, description: 'Property name.' },
      value: { type: 'json', required: true, description: 'Property value (string, number, boolean, or list).' },
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
    execute: (args) => access.setProperty(args.path, args.key, args.value),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_delete_property',
    description: 'Remove a frontmatter property from a note.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path relative to the vault root.' },
      key: { type: 'string', required: true, description: 'Property name.' },
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
    execute: (args) => access.deleteProperty(args.path, args.key),
  }))

  ctx.tools.register(defineTool({
    name: 'obsidian_tags',
    description: 'List all tags in the vault with usage counts.',
    parameters: {
      dir: { type: 'string', description: 'Subdirectory relative to the vault root.' },
    },
    output: {
      schema: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            tag: { type: 'string', required: true },
            count: { type: 'integer', required: true },
          },
        },
      },
      render: (_args: any, value: any) => value.length === 0
        ? [{ type: 'text', text: 'No tags found.' }]
        : [{ type: 'text', text: value.map((t: any) => `${t.tag} (${t.count})`).join('\n') }],
    },
    execute: (args) => access.listTags({ dir: args.dir }),
  }))
```

- [ ] **Step 4: Update the tools test fixture**

In `tests/tools.test.ts`, add to `fakeAccess`:

```ts
  setProperty: async () => ({ path: 'a.md', data: { title: 'a' }, raw: 'title: a' }),
  deleteProperty: async () => ({ path: 'a.md', data: {}, raw: null }),
  listTags: async () => [{ tag: '#a', count: 1 }],
```

Update the expected tool-name list to:

```ts
    expect(registered.map((d) => d.name)).toEqual([
      'obsidian_list', 'obsidian_search', 'obsidian_read', 'obsidian_frontmatter',
      'obsidian_backlinks', 'obsidian_write', 'obsidian_append', 'obsidian_move', 'obsidian_delete',
      'obsidian_set_property', 'obsidian_delete_property', 'obsidian_tags',
    ])
```

- [ ] **Step 5: Add FsAccess tests**

In `tests/fs-access.test.ts`, add:

```ts
it('sets and deletes a frontmatter property', async () => {
  const a = new FsAccess(await makeVault(), [])
  await a.setProperty('notes/one.md', 'status', 'done')
  const after = await a.read('notes/one.md')
  expect(after.frontmatter).toMatchObject({ title: 'One', status: 'done' })
  await a.deleteProperty('notes/one.md', 'status')
  const afterDel = await a.read('notes/one.md')
  expect(afterDel.frontmatter).toEqual({ title: 'One' })
})

it('lists tags with counts', async () => {
  const a = new FsAccess(await makeVault(), [])
  await a.write('notes/tagged.md', '---\ntags: [a, b]\n---\nsee #a')
  const tags = await a.listTags()
  expect(tags).toEqual(expect.arrayContaining([{ tag: '#a', count: 2 }, { tag: '#b', count: 1 }]))
})
```

- [ ] **Step 6: Run tests to verify**

Run: `npx vitest run tests/fs-access.test.ts tests/tools.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/access.ts src/fs-access.ts src/tools.ts tests/fs-access.test.ts tests/tools.test.ts
git commit -m "feat: add set_property, delete_property, and tags tools"
```

---

### Task 8: Make `apply` await setup (fix mount race)

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Change `apply` to async**

Replace the current `apply` (lines 17-23 of `src/index.ts`):

```ts
export function apply(ctx: Context, config: Cfg): void {
  void (async () => {
    const { access } = await setupAccess(config)
    registerTools(ctx, access)
  })().catch((err) => {
    console.error('[dsh-obsidian] failed to mount:', err)
  })
}
```

with:

```ts
export async function apply(ctx: Context, config: Cfg): Promise<void> {
  const { access } = await setupAccess(config)
  registerTools(ctx, access)
}
```

- [ ] **Step 2: Run typecheck and tests to verify**

Run: `npm run typecheck && npm test`
Expected: PASS. (cordis's `_execute` awaits a thenable returned from `apply`, so tools are registered before the plugin finishes loading; setup errors now propagate to cordis's logger.)

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "fix: await vault setup in apply to avoid tool mount race"
```

---

### Task 9: Re-point CliAccess to property commands; default `useCli` off

**Files:**
- Modify: `src/cli-access.ts`, `src/index.ts`, `src/detect.ts` (no change needed if `setupAccess` already passes `config.useCli`), `src/access.ts` (no change)
- Test: `tests/cli-access.test.ts`

**Interfaces:**
- Consumes: `setProperty` / `deleteProperty` from `FsAccess` (Task 7), `run` from `src/spawn.ts`, `guardPath`.
- Produces: `CliAccess` overrides only `setProperty` / `deleteProperty`; `backlinks` / `move` are removed.

- [ ] **Step 1: Rewrite `src/cli-access.ts`**

Replace the entire file with:

```ts
import { FsAccess } from './fs-access.js'
import { run } from './spawn.js'
import { guardPath } from './vault-path.js'
import type { FrontmatterData } from './access.js'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

function cliValue(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

export class CliAccess extends FsAccess {
  async setProperty(notePath: string, key: string, value: JsonValue): Promise<FrontmatterData> {
    guardPath(this.vaultRoot, notePath)
    try {
      await run('obsidian', ['property:set', `name=${key}`, `value=${cliValue(value)}`, `path=${notePath}`], { cwd: this.vaultRoot })
      return this.frontmatter(notePath)
    } catch {
      return super.setProperty(notePath, key, value)
    }
  }

  async deleteProperty(notePath: string, key: string): Promise<FrontmatterData> {
    guardPath(this.vaultRoot, notePath)
    try {
      await run('obsidian', ['property:remove', `name=${key}`, `path=${notePath}`], { cwd: this.vaultRoot })
      return this.frontmatter(notePath)
    } catch {
      return super.deleteProperty(notePath, key)
    }
  }
}
```

- [ ] **Step 2: Default `useCli` to false**

In `src/index.ts`, change the `Config` `useCli` line to:

```ts
  useCli: z.boolean().default(false).description('Delegate set/delete property to the obsidian CLI when available'),
```

- [ ] **Step 3: Rewrite the CLI test**

Replace `tests/cli-access.test.ts` with tests that stub `run` (mock `src/spawn.js`) and assert delegation + fallback:

```ts
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { CliAccess } from '../src/cli-access.js'

vi.mock('../src/spawn.js', () => ({ run: vi.fn(), binaryAvailable: vi.fn().mockResolvedValue(true) }))
import { run } from '../src/spawn.js'

let tmp: string
afterEach(async () => { vi.clearAllMocks(); if (tmp) await rm(tmp, { recursive: true, force: true }) })

async function makeVault(): Promise<string> {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'vault-'))
  await mkdir(path.join(tmp, 'notes'), { recursive: true })
  await writeFile(path.join(tmp, 'notes', 'one.md'), '---\ntitle: One\n---\nBody\n')
  return tmp
}

describe('CliAccess', () => {
  it('delegates setProperty to the obsidian CLI', async () => {
    vi.mocked(run).mockResolvedValue({ stdout: '', stderr: '' })
    const a = new CliAccess(await makeVault(), ['.obsidian', '.git', '.trash'])
    await a.setProperty('notes/one.md', 'status', 'done')
    expect(run).toHaveBeenCalledWith('obsidian', ['property:set', 'name=status', 'value=done', 'path=notes/one.md'], { cwd: a.vaultRoot })
  })

  it('falls back to fs when the CLI fails', async () => {
    vi.mocked(run).mockRejectedValue(new Error('no obsidian'))
    const a = new CliAccess(await makeVault(), ['.obsidian', '.git', '.trash'])
    const r = await a.setProperty('notes/one.md', 'status', 'done')
    expect(r.data).toMatchObject({ title: 'One', status: 'done' })
  })

  it('move does not invoke the CLI', async () => {
    const a = new CliAccess(await makeVault(), ['.obsidian', '.git', '.trash'])
    const m = await a.move('notes/one.md', 'notes/two.md')
    expect(run).not.toHaveBeenCalled()
    expect(m.linksUpdated).toBe(false)
  })
})
```

- [ ] **Step 4: Run tests to verify**

Run: `npx vitest run tests/cli-access.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli-access.ts src/index.ts tests/cli-access.test.ts
git commit -m "refactor: re-point CLI to property:set/remove and disable useCli by default"
```

---

### Task 10: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: Verify locally**

Run: `npm ci && npm run typecheck && npm test && npm run build`
Expected: all succeed.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add typecheck/test/build workflow"
```

---

### Task 11: Package metadata, cleanup, and README

**Files:**
- Modify: `package.json`, `.gitignore`, `README.md`, `README.en.md`

- [ ] **Step 1: Add repository metadata to `package.json`**

Add (alongside `"license": "MIT"`):

```json
  "repository": { "type": "git", "url": "https://github.com/mingzeng21/dsh-obsidian.git" },
  "homepage": "https://github.com/mingzeng21/dsh-obsidian#readme",
  "bugs": { "url": "https://github.com/mingzeng21/dsh-obsidian/issues" },
```

- [ ] **Step 2: Ensure `.gitignore` covers the tarball**

Read `.gitignore`; if `*.tgz` and `node_modules` are missing, add them. Then remove the stray `dsh-obsidian-0.1.0.tgz` from the repo root with `rm dsh-obsidian-0.1.0.tgz`.

- [ ] **Step 3: Update README (Chinese + English)**

In `README.md` and `README.en.md`:
- Remove the "可选 Obsidian 原生能力" bullet and any claim that `backlinks`/`move` delegate to the CLI, and the "环境要求 → Obsidian CLI（可选）" line.
- Update the "工作原理" diagram: remove the `CliAccess` branch (fs-only by default; `useCli` optionally uses `property:set`/`property:remove`).
- Change the `useCli` config row default to `false` and its description to "property:set/remove 委托给 CLI".
- Add three tool rows: `obsidian_set_property`, `obsidian_delete_property`, `obsidian_tags`.
- Update the `obsidian_move` row to say links are updated in pure fs (no CLI needed).

- [ ] **Step 4: Verify docs consistency**

Run: `npm run typecheck` (no effect on md) and `git status` to confirm only intended files changed.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore README.md README.en.md
git commit -m "docs: document 0.2.0 tools and remove CLI-dependent claims"
```

---

## Self-Review

- **Spec coverage:** §3 (architecture) → Tasks 2/7/9; §4 (new tools) → Task 7; §5 (hardening) → Tasks 1-4, 8; §6 (publish) → Tasks 10-11. Deferred items (§7) are intentionally out of scope.
- **Placeholder scan:** No TBD/TODO. The CLI test uses real assertions.
- **Type consistency:** `LinkRewriteResult` (Task 1) → used in Task 2; `setFrontmatterProperty`/`deleteFrontmatterProperty` (Task 5) → Task 7; `extractTags` (Task 6) → Task 7; `TagRef` (Task 7) → CLI test; `VaultAccess.setProperty/deleteProperty/listTags` signatures are consistent across Tasks 7 and 9.
