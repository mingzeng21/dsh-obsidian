import { describe, it, expect } from 'vitest'
import { extractLinkTargets, noteTitleFromPath, linkTargetMatchesNote } from '../src/wikilink.js'

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

describe('linkTargetMatchesNote', () => {
  it('matches by basename or full path', () => {
    expect(linkTargetMatchesNote('My Note', 'Folder/My Note.md')).toBe(true)
    expect(linkTargetMatchesNote('Folder/My Note', 'Folder/My Note.md')).toBe(true)
    expect(linkTargetMatchesNote('Other', 'Folder/My Note.md')).toBe(false)
  })
})
