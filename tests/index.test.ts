import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/index.js'

vi.mock('../src/detect.js', () => ({
  setupAccess: async () => ({ vaultRoot: path.resolve('/tmp/vault'), access: {} }),
}))

function toolScope() {
  const tools = new Set<string>()
  return {
    tools,
    ctx: { tools: { register: (definition: { name: string }) => {
      tools.add(definition.name)
      return () => { tools.delete(definition.name) }
    } } } as Context,
  }
}

function fakeAgent(cwd?: string) {
  const scope = toolScope()
  return { ...scope, agent: { ctx: scope.ctx, session: { header: { cwd } } } }
}

function host(existing: ReturnType<typeof fakeAgent>[] = []) {
  const global = toolScope()
  const listeners = new Map<string, (payload: { agent: any }) => void>()
  let cleanup: (() => void) | undefined
  const ctx = {
    tools: global.ctx.tools,
    agents: { list: () => existing.map(({ agent }) => agent) },
    on: (event: string, listener: (payload: { agent: any }) => void) => {
      listeners.set(event, listener)
      return () => { listeners.delete(event); return true }
    },
    effect: (run: () => () => void) => { cleanup = run() },
  } as unknown as Context
  return { ctx, global: global.tools, emit: (event: string, agent: any) => listeners.get(event)?.({ agent }), dispose: () => cleanup?.() }
}

describe('vaultWorkspaceOnly', () => {
  const config = { vaultPath: '/tmp/vault', useCli: false, excludeDirs: [] }

  it('keeps tools globally available by default', async () => {
    const h = host()
    await apply(h.ctx, config)
    expect(h.global.size).toBe(12)
  })

  it('registers tools only for agents inside the vault, including existing agents', async () => {
    const existing = fakeAgent(path.resolve('/tmp/vault'))
    const h = host([existing])
    await apply(h.ctx, { ...config, vaultWorkspaceOnly: true })
    expect(h.global.size).toBe(0)
    expect(existing.tools.size).toBe(12)

    const nested = fakeAgent(path.resolve('/tmp/vault/subdir'))
    const sibling = fakeAgent(path.resolve('/tmp/vault-other'))
    const unknown = fakeAgent()
    h.emit('agent/created', nested.agent)
    h.emit('agent/created', sibling.agent)
    h.emit('agent/created', unknown.agent)
    expect(nested.tools.size).toBe(12)
    expect(sibling.tools.size).toBe(0)
    expect(unknown.tools.size).toBe(0)

    h.dispose()
    expect(existing.tools.size).toBe(0)
    expect(nested.tools.size).toBe(0)
  })
})
