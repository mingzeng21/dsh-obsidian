import { describe, it, expect } from 'vitest'
import {
  parseFrontmatter,
  setFrontmatterProperty,
  deleteFrontmatterProperty,
} from '../src/frontmatter.js'

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

describe('setFrontmatterProperty / deleteFrontmatterProperty', () => {
  it('sets a property preserving existing ones', () => {
    const out = setFrontmatterProperty('---\ntitle: Hi\ntags: [a, b]\n---\nBody', 'status', 'done')
    const { data, body } = parseFrontmatter(out)
    expect(data).toMatchObject({ title: 'Hi', tags: ['a', 'b'], status: 'done' })
    expect(body).toBe('Body')
  })

  it('creates frontmatter when none exists', () => {
    const out = setFrontmatterProperty('# Heading\n\nBody', 'title', 'New')
    expect(out.startsWith('---\n')).toBe(true)
    const { data } = parseFrontmatter(out)
    expect(data).toEqual({ title: 'New' })
  })

  it('deletes a property', () => {
    const out = deleteFrontmatterProperty('---\ntitle: Hi\nstatus: done\n---\nBody', 'status')
    expect(parseFrontmatter(out).data).toEqual({ title: 'Hi' })
  })

  it('drops frontmatter when the last property is removed', () => {
    const out = deleteFrontmatterProperty('---\ntitle: Hi\n---\nBody', 'title')
    expect(out).toBe('Body')
    expect(parseFrontmatter(out).data).toBeNull()
  })

  it('throws when modifying a note with invalid frontmatter', () => {
    expect(() => setFrontmatterProperty('---\n: not: valid\n---\nbody', 'x', 'y')).toThrow(/frontmatter/)
    expect(() => deleteFrontmatterProperty('---\n: not: valid\n---\nbody', 'x')).toThrow(/frontmatter/)
  })
})
