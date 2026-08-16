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
