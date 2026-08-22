import { copyFile, rename, unlink } from 'node:fs/promises'

export async function renameAcrossDevices(from: string, to: string): Promise<void> {
  try {
    await rename(from, to)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    await copyFile(from, to)
    await unlink(from)
  }
}
