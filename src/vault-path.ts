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
