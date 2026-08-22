import { describe, it, expect } from 'vitest'
import { extractLinkTargets, noteTitleFromPath, resolveLinkTarget } from '../src/wikilink.js'

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
})
