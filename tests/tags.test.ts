import { describe, it, expect } from 'vitest'
import { extractTags } from '../src/tags.js'

describe('extractTags', () => {
  it('extracts frontmatter tags as a list', () => {
    expect([...extractTags('---\ntags: [a, b]\n---\nBody')].sort()).toEqual(['a', 'b'])
  })

  it('extracts frontmatter tags as a single string', () => {
    expect([...extractTags('---\ntags: solo\n---\nBody')]).toEqual(['solo'])
  })

  it('extracts inline #tags', () => {
    expect([...extractTags('# Heading\n\nnote about #ai and #machine-learning')].sort()).toEqual(['ai', 'machine-learning'])
  })

  it('ignores tags inside fenced code blocks', () => {
    expect([...extractTags('before\n```js\nconst x = "#notatag"\n```\nafter #real')]).toEqual(['real'])
  })

  it('returns an empty set when no tags', () => {
    expect([...extractTags('plain text')]).toEqual([])
  })
})
