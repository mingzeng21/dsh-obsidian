import { describe, it, expect } from 'vitest'
import { parseFrontmatter } from '../src/frontmatter.js'

describe('parseFrontmatter', () => {
  it('returns null data/raw when there is no frontmatter', () => {
    const { data, raw, body } = parseFrontmatter('# Hello\n\nBody')
    expect(data).toBeNull()
    expect(raw).toBeNull()
    expect(body).toBe('# Hello\n\nBody')
  })

  it('parses YAML frontmatter and strips it from the body', () => {
    const { data, raw, body } = parseFrontmatter('---\ntitle: Hi\ntags: [a, b]\n---\nBody text')
    expect(data).toEqual({ title: 'Hi', tags: ['a', 'b'] })
    expect(raw).toBe('title: Hi\ntags: [a, b]')
    expect(body).toBe('Body text')
  })

  it('tolerates invalid YAML by returning null data but keeping raw', () => {
    const { data, raw } = parseFrontmatter('---\n: not: valid: yaml\n---\nbody')
    expect(data).toBeNull()
    expect(raw).toBe(': not: valid: yaml')
  })

  it('does not treat a mid-body --- line as frontmatter', () => {
    const { data } = parseFrontmatter('no frontmatter\n---\nnot yaml')
    expect(data).toBeNull()
  })
})
