import { describe, it, expect } from 'vitest'
import { rewriteNoteLinks } from '../src/link-update.js'

describe('rewriteNoteLinks', () => {
  it('rewrites a basename link', () => {
    const r = rewriteNoteLinks('see [[A]] here', 'A.md', 'B.md')
    expect(r.content).toBe('see [[B]] here')
    expect(r.changed).toBe(true)
  })

  it('rewrites a full-path link preserving the directory', () => {
    const r = rewriteNoteLinks('see [[Folder/A]]', 'Folder/A.md', 'Folder/B.md')
    expect(r.content).toBe('see [[Folder/B]]')
  })

  it('rewrites a cross-directory path link to the new path', () => {
    const r = rewriteNoteLinks('see [[Folder/A]]', 'Folder/A.md', 'Other/B.md')
    expect(r.content).toBe('see [[Other/B]]')
  })

  it('preserves alias and heading', () => {
    const r = rewriteNoteLinks('[[A|alias]] and [[A#sec]]', 'A.md', 'B.md')
    expect(r.content).toBe('[[B|alias]] and [[B#sec]]')
  })

  it('does not touch unrelated links', () => {
    const r = rewriteNoteLinks('[[Other]] and [[A]]', 'A.md', 'B.md')
    expect(r.content).toBe('[[Other]] and [[B]]')
  })

  it('reports changed=false when nothing matches', () => {
    const r = rewriteNoteLinks('[[Other]]', 'A.md', 'B.md')
    expect(r.changed).toBe(false)
    expect(r.content).toBe('[[Other]]')
  })
})
