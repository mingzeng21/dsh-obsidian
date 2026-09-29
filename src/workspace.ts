import path from 'node:path'

export function isWorkspaceInVault(vaultRoot: string, cwd: string | undefined): boolean {
  if (!cwd || !path.isAbsolute(cwd)) return false
  const relative = path.relative(path.resolve(vaultRoot), path.resolve(cwd))
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}
