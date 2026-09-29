import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import z from '@deepseek-ai/schemastery'
import { isWorkspaceInVault } from './workspace.js'
import { setupAccess } from './detect.js'
import { registerTools } from './tools.js'

export const name = 'dsh-obsidian'
export const inject = ['tools', 'agents']

export const Config = z.object({
  vaultPath: z.string().description('Absolute path to the Obsidian vault; leave empty to auto-detect from obsidian.json'),
  useCli: z.boolean().default(false).description('Delegate set/delete property to the obsidian CLI when available'),
  vaultWorkspaceOnly: z.boolean().default(false).description('Expose Obsidian tools only to agents whose session working directory is inside the vault'),
  excludeDirs: z.array(z.string()).default(['.obsidian', '.git', '.trash']).description('Directories excluded from search and list'),
})

type Cfg = { vaultPath?: string; useCli: boolean; vaultWorkspaceOnly?: boolean; excludeDirs: string[] }

export async function apply(ctx: Context, config: Cfg): Promise<void> {
  const { vaultRoot, access } = await setupAccess(config)
  if (!config.vaultWorkspaceOnly) {
    registerTools(ctx, access)
    return
  }

  ctx.effect(() => {
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
  })
}
