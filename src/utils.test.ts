import { describe, expect, it } from 'bun:test'
import { findGitRoot } from './utils'

describe('findGitRoot', () => {
  it('returns a path for a directory inside a git repo', () => {
    const root = findGitRoot(process.cwd())
    expect(root).not.toBeNull()
  })

  it('returns null for /tmp', () => {
    const root = findGitRoot('/tmp')
    expect(root).toBeNull()
  })
})
