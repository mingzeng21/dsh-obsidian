import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it, expect } from 'vitest'
import { run, binaryAvailable } from '../src/spawn.js'

let tmp: string | undefined

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true })
  tmp = undefined
})

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

  it('resolves a Windows .cmd command when invoked without its extension', async () => {
    if (process.platform !== 'win32') return
    tmp = await mkdtemp(path.join(os.tmpdir(), 'spawn-'))
    const command = path.join(tmp, 'fixture.cmd')
    await writeFile(command, '@echo off\r\nif "%1"=="--version" exit /b 0\r\necho cmd-ok\r\n')
    const bareCommand = command.slice(0, -4)
    expect(await binaryAvailable(bareCommand)).toBe(true)
    expect((await run(bareCommand, [])).stdout.trim()).toBe('cmd-ok')
  })

  it('preserves safe spaces and Unicode for a Windows script path and arguments', async () => {
    if (process.platform !== 'win32') return
    tmp = await mkdtemp(path.join(os.tmpdir(), 'spawn dir-'))
    const command = path.join(tmp, 'fixture.cmd')
    await writeFile(command, '@echo off\r\necho arg1=[%~1]\r\necho arg2=[%~2]\r\n')
    const result = await run(command, ['hello world', '你好'])
    expect(result.stdout).toContain('arg1=[hello world]')
    expect(result.stdout).toContain('arg2=[你好]')
  })

  it('falls back instead of passing shell-sensitive arguments to a Windows script', async () => {
    if (process.platform !== 'win32') return
    tmp = await mkdtemp(path.join(os.tmpdir(), 'spawn-'))
    const command = path.join(tmp, 'fixture.cmd')
    await writeFile(command, '@echo off\r\necho should-not-run\r\n')
    await expect(run(command, ['100% unsafe & argument'])).rejects.toThrow(/unsafe arguments/)
  })
})
