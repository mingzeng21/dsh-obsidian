import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { setupAccess } from './detect.js'
import { registerTools } from './tools.js'

export const name = 'dsh-obsidian'
export const inject = ['tools']

export const Config = z.object({
  vaultPath: z.string().description('Absolute path to the Obsidian vault; leave empty to auto-detect from obsidian.json'),
  useCli: z.boolean().default(true).description('Delegate backlinks/move to the obsidian CLI when available'),
  excludeDirs: z.array(z.string()).default(['.obsidian', '.git', '.trash']).description('Directories excluded from search and list'),
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
