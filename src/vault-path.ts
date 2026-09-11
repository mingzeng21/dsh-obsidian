import { homedir } from 'node:os'
import path from 'node:path'
import { readFile } from 'node:fs/promises'

interface ObsidianVaultEntry { path?: string; open?: boolean }
interface ObsidianAppConfig { vaults?: Record<string, ObsidianVaultEntry> }

export function appConfigCandidates(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const home = homedir()
  const mac = path.join(home, 'Library', 'Application Support', 'obsidian', 'obsidian.json')
  const linux = path.join(home, '.config', 'obsidian', 'obsidian.json')
  const appData = env.APPDATA ? path.join(env.APPDATA, 'obsidian', 'obsidian.json') : undefined
  const ordered = platform === 'win32'
    ? [appData, linux, mac]
    : platform === 'darwin'
      ? [mac, appData, linux]
      : [linux, appData, mac]
  return [...new Set(ordered.filter((candidate): candidate is string => Boolean(candidate)))]
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

export function normalizeVaultPath(p: string): string {
  return p.replace(/\\/g, '/')
}

export function guardPath(vaultRoot: string, rel: string): string {
  if (typeof rel !== 'string' || rel.trim() === '') throw new Error('path must be a non-empty string')
  const normalized = normalizeVaultPath(rel)
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`path escapes vault root: ${rel}`)
  }
  const root = path.resolve(vaultRoot)
  const abs = path.resolve(root, normalized)
  const relative = path.relative(root, abs)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`path escapes vault root: ${rel}`)
  }
  return abs
}
