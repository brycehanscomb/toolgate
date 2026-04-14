import { describe, expect, it } from 'bun:test'
import { updateConfigSource, wrapText } from './disable-cmd'

describe('wrapText', () => {
  it('wraps words onto multiple lines', () => {
    expect(wrapText('hello world foo', 11)).toEqual(['hello world', 'foo'])
  })

  it('hard-breaks words longer than width', () => {
    expect(wrapText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
  })

  it('returns empty array for empty text', () => {
    expect(wrapText('', 20)).toEqual([])
  })

  it('keeps a single short line intact', () => {
    expect(wrapText('hello', 20)).toEqual(['hello'])
  })
})

describe('updateConfigSource', () => {
  it('appends a disable export when none exists', () => {
    const src = `import foo from './foo'\nexport default [foo]\n`
    const out = updateConfigSource(src, ['Deny bash grep'])
    expect(out).toContain(`export const disable = [`)
    expect(out).toContain(`"Deny bash grep"`)
    expect(out.startsWith(src.trim())).toBe(true)
  })

  it('replaces an existing disable export', () => {
    const src = `export default []\nexport const disable = ['old']\n`
    const out = updateConfigSource(src, ['Allow git log/show'])
    expect(out).toContain(`"Allow git log/show"`)
    expect(out).not.toContain(`'old'`)
  })

  it('replaces a typed empty disable export', () => {
    const src = `export default []\nexport const disable: string[] = []\n`
    const out = updateConfigSource(src, ['X'])
    expect(out).toContain(`"X"`)
    expect(out).not.toMatch(/disable: string\[\] = \[\]/)
  })

  it('writes a typed empty array when disabling nothing', () => {
    const src = `export default []\nexport const disable = ['x']\n`
    const out = updateConfigSource(src, [])
    expect(out).toContain(`export const disable: string[] = []`)
    expect(out).not.toContain(`'x'`)
  })

  it('preserves the rest of the file', () => {
    const src = `import foo from './foo'\nexport default [foo]\nexport const disable = ['a']\n`
    const out = updateConfigSource(src, ['b'])
    expect(out).toContain(`import foo from './foo'`)
    expect(out).toContain(`export default [foo]`)
  })

  it('handles multi-line existing disable arrays', () => {
    const src = `export default []\nexport const disable = [\n  'a',\n  'b',\n]\n`
    const out = updateConfigSource(src, ['c'])
    expect(out).toContain(`"c"`)
    expect(out).not.toContain(`'a'`)
    expect(out).not.toContain(`'b'`)
  })
})
