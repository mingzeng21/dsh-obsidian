import { describe, it, expect } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { registerTools } from '../src/tools.js'
import type { VaultAccess } from '../src/access.js'
import { FsAccess } from '../src/fs-access.js'

function fakeCtx() {
  const registered: any[] = []
  const ctx = { tools: { register: (def: any) => { registered.push(def); return () => {} } } } as unknown as Context
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
  setProperty: async () => ({ path: 'a.md', data: { title: 'a' }, raw: 'title: a' }),
  deleteProperty: async () => ({ path: 'a.md', data: {}, raw: null }),
  listTags: async () => [{ tag: '#a', count: 1 }],
} as unknown as VaultAccess

describe('registerTools', () => {
  it('registers the expected 12 obsidian tools', () => {
    const { ctx, registered } = fakeCtx()
    registerTools(ctx, fakeAccess)
    expect(registered.map((d) => d.name)).toEqual([
      'obsidian_list', 'obsidian_search', 'obsidian_read', 'obsidian_frontmatter',
      'obsidian_backlinks', 'obsidian_write', 'obsidian_append', 'obsidian_move', 'obsidian_delete',
      'obsidian_set_property', 'obsidian_delete_property', 'obsidian_tags',
    ])
  })

  it('obsidian_read delegates to access.read and returns the canonical value', async () => {
    const { ctx, registered } = fakeCtx()
    registerTools(ctx, fakeAccess)
    const readTool = registered.find((d) => d.name === 'obsidian_read')
    const value = await readTool.execute({ path: 'a.md' }, { signal: new AbortController().signal } as any)
    expect(value).toEqual({ path: 'a.md', title: 'a', frontmatter: null, content: 'body' })
  })

  it.each([
    { name: 'obsidian_backlinks', args: { path: 'a.md' } },
    { name: 'obsidian_search', args: { query: 'body' } },
    { name: 'obsidian_tags', args: {} },
  ])('$name honors cancellation from the host', async ({ name, args }) => {
    const vault = await mkdtemp(path.join(os.tmpdir(), 'vault-'))
    try {
      await writeFile(path.join(vault, 'a.md'), 'body #tag')
      const { ctx, registered } = fakeCtx()
      registerTools(ctx, new FsAccess(vault, []))
      const tool = registered.find((d) => d.name === name)
      const controller = new AbortController()
      const result = tool.execute(args, { signal: controller.signal })
      controller.abort()
      await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    } finally {
      await rm(vault, { recursive: true, force: true })
    }
  })
})
