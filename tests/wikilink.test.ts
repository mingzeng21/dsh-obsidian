import { describe, it, expect } from 'vitest'
import { extractLinkTargets, normalizeNotePath, noteTitleFromPath, resolveLinkTarget } from '../src/wikilink.js'

describe('extractLinkTargets', () => {
  it('extracts simple, aliased, and heading links', () => {
    const content = 'see [[Note A]], [[Note B|alias]], [[Folder/Note C#heading]]'
    expect(extractLinkTargets(content)).toEqual(['Note A', 'Note B', 'Folder/Note C'])
  })

  it('dedupes and ignores empty targets', () => {
    expect(extractLinkTargets('[[X]] and [[X]] and [[]]')).toEqual(['X'])
  })
})

describe('noteTitleFromPath', () => {
  it('strips directory and .md extension', () => {
    expect(noteTitleFromPath('Folder/My Note.md')).toBe('My Note')
    expect(noteTitleFromPath('Root.md')).toBe('Root')
  })
})

describe('normalizeNotePath', () => {
  it('converts Windows separators to vault-relative separators', () => {
    expect(normalizeNotePath('书籍笔记\\01-创伤与解离\\00-全书概览.md'))
      .toBe('书籍笔记/01-创伤与解离/00-全书概览.md')
  })
})

describe('resolveLinkTarget', () => {
  it('resolves a bare name to the unique matching note', () => {
    expect(resolveLinkTarget('My Note', ['Folder/My Note.md'])).toBe('Folder/My Note')
  })

  it('resolves a full path to the exact note', () => {
    expect(resolveLinkTarget('Folder/My Note', ['Folder/My Note.md'])).toBe('Folder/My Note')
  })

  it('resolves a shorter path by suffix', () => {
    expect(resolveLinkTarget('Sub/Note', ['Folder/Sub/Note.md'])).toBe('Folder/Sub/Note')
  })

  it('returns null when the target has no match', () => {
    expect(resolveLinkTarget('Other', ['Folder/My Note.md'])).toBeNull()
  })

  it('returns null when the basename is ambiguous', () => {
    expect(resolveLinkTarget('Foo', ['a/Foo.md', 'b/Foo.md'])).toBeNull()
  })

  it('resolves a forward-slash wikilink against a normalized Windows-style note path', () => {
    const target = '书籍笔记/01-创伤与解离/创伤心理学-拆解/00-全书概览'
    const windowsPath = target.replaceAll('/', '\\') + '.md'
    expect(resolveLinkTarget(target, [normalizeNotePath(windowsPath)])).toBe(target)
  })

  it('resolves Windows separators without requiring callers to normalize first', () => {
    expect(resolveLinkTarget('Folder\\My Note', ['Folder\\My Note.md'])).toBe('Folder/My Note')
  })

  it('uses case-insensitive note identity on Windows', () => {
    const resolved = resolveLinkTarget('folder/note', ['Folder/Note.md'])
    if (process.platform === 'win32') expect(resolved).toBe('Folder/Note')
    else expect(resolved).toBeNull()
  })
})
