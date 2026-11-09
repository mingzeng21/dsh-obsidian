import { describe, it, expect } from 'vitest'
import { createLinkResolver, extractLinkTargets, normalizeNotePath, noteTitleFromPath } from '../src/wikilink.js'

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

describe('createLinkResolver', () => {
  it('resolves a bare name to the unique matching note', () => {
    const resolveLink = createLinkResolver(['Folder/My Note.md'])
    expect(resolveLink('My Note')).toBe('Folder/My Note')
  })

  it('resolves a full path to the exact note', () => {
    const resolveLink = createLinkResolver(['Folder/My Note.md'])
    expect(resolveLink('Folder/My Note')).toBe('Folder/My Note')
  })

  it('resolves a shorter path by suffix', () => {
    const resolveLink = createLinkResolver(['Folder/Sub/Note.md'])
    expect(resolveLink('Sub/Note')).toBe('Folder/Sub/Note')
  })

  it('returns null when the target has no match', () => {
    const resolveLink = createLinkResolver(['Folder/My Note.md'])
    expect(resolveLink('Other')).toBeNull()
  })

  it('returns null when the basename is ambiguous', () => {
    const resolveLink = createLinkResolver(['a/Foo.md', 'b/Foo.md'])
    expect(resolveLink('Foo')).toBeNull()
  })

  it('resolves a forward-slash wikilink against a normalized Windows-style note path', () => {
    const target = '书籍笔记/01-创伤与解离/创伤心理学-拆解/00-全书概览'
    const windowsPath = target.replaceAll('/', '\\') + '.md'
    const resolveLink = createLinkResolver([normalizeNotePath(windowsPath)])
    expect(resolveLink(target)).toBe(target)
  })

  it('resolves Windows separators without requiring callers to normalize first', () => {
    const resolveLink = createLinkResolver(['Folder\\My Note.md'])
    expect(resolveLink('Folder\\My Note')).toBe('Folder/My Note')
  })

  it('uses case-insensitive note identity on Windows', () => {
    const resolveLink = createLinkResolver(['Folder/Note.md'])
    const resolved = resolveLink('folder/note')
    if (process.platform === 'win32') expect(resolved).toBe('Folder/Note')
    else expect(resolved).toBeNull()
  })
})
