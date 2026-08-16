import { describe, it, expect } from 'vitest'
import { run, binaryAvailable } from '../src/spawn.js'

describe('run', () => {
  it('captures stdout of a successful command', async () => {
    const { stdout, stderr } = await run('node', ['-e', 'console.log("hi")'])
    expect(stdout.trim()).toBe('hi')
    expect(stderr).toBe('')
  })

  it('rejects on non-zero exit', async () => {
    await expect(run('node', ['-e', 'process.exit(3)'])).rejects.toThrow(/exited with code 3/)
  })
})

describe('binaryAvailable', () => {
  it('detects node as available', async () => {
    expect(await binaryAvailable('node')).toBe(true)
  })

  it('detects a missing binary as unavailable', async () => {
    expect(await binaryAvailable('definitely-not-a-real-binary-xyz')).toBe(false)
  })
})
