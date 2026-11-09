import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import z from '@deepseek-ai/schemastery'
import { isWorkspaceInVault } from './workspace.js'
import { setupAccess, type AccessSetup } from './detect.js'
import { registerTools } from './tools.js'
import { VaultNotConfiguredError } from './vault-path.js'

export const name = 'dsh-obsidian'
export const inject = ['tools', 'agents']

const schema = z.object({
  vaultPath: z.string().default('').description('Absolute path to the Obsidian vault; leave empty to auto-detect from obsidian.json'),
  useCli: z.boolean().default(false).description('Delegate set/delete property to the obsidian CLI when available'),
  vaultWorkspaceOnly: z.boolean().default(false).description('Expose Obsidian tools only to agents whose session working directory is inside the vault'),
  excludeDirs: z.array(z.string()).default(['.obsidian', '.git', '.trash']).description('Directories excluded from search and list'),
})

type Cfg = { vaultPath?: string; useCli: boolean; vaultWorkspaceOnly?: boolean; excludeDirs: readonly string[] }
type LiveCfg = { get(): Cfg }

// Older DSH releases pass a plain config and still load the host plugin.
export const Config = 'volatile' in schema && typeof schema.volatile === 'function'
  ? schema.volatile() as z<Schemastery.TypeS<typeof schema>, LiveCfg>
  : schema

declare module '@deepseek-ai/cordis' {
  interface Events {
    'loader/volatile-update'(paths: readonly (readonly string[])[]): void
  }
}

function registerVaultTools(ctx: Context, { vaultRoot, access }: AccessSetup, workspaceOnly?: boolean): () => void {
  if (!workspaceOnly) return registerTools(ctx, access)

  const registrations = new Map<Agent, () => void>()
  const registerForAgent = (agent: Agent) => {
    if (registrations.has(agent) || !isWorkspaceInVault(vaultRoot, agent.session.header.cwd)) return
    registrations.set(agent, registerTools(agent.ctx, access))
  }
  const onCreated = ctx.on('agent/created', ({ agent }) => registerForAgent(agent))
  const onDisposed = ctx.on('agent/disposed', ({ agent }) => { registrations.delete(agent) })
  for (const agent of ctx.agents.list()) registerForAgent(agent)
  return () => {
    onCreated()
    onDisposed()
    for (const unregister of registrations.values()) unregister()
  }
}

export async function apply(ctx: Context, source: Cfg | LiveCfg): Promise<void> {
  const live = 'get' in source
  let unregister: (() => void) | undefined
  let generation = 0

  const refresh = async () => {
    const request = ++generation
    unregister?.()
    unregister = undefined
    const config = live ? source.get() : source
    try {
      const setup = await setupAccess({ ...config, excludeDirs: [...config.excludeDirs] })
      if (request !== generation) return
      unregister = registerVaultTools(ctx, setup, config.vaultWorkspaceOnly)
      ctx.logger.info('Using Obsidian vault %s', setup.vaultRoot)
    } catch (error) {
      if (request !== generation) return
      if (!live || !(error instanceof VaultNotConfiguredError)) throw error
      ctx.logger.warn(error.message)
    }
  }

  ctx.effect(() => () => {
    ++generation
    unregister?.()
  })
  if (live) ctx.on('loader/volatile-update', () => {
    void refresh().catch(error => ctx.logger.error(error))
  })
  await refresh()
}
