import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { findConfigInDir, findAllConfigs, loadConfigs } from './config'
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

describe('findConfigInDir', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'toolgate-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true })
  })

  it('finds toolgate.config.ts in dir', async () => {
    const configPath = join(tempDir, 'toolgate.config.ts')
    await writeFile(configPath, 'export default []')
    expect(findConfigInDir(tempDir)).toBe(configPath)
  })

  it('finds .claude/toolgate.config.ts in dir', async () => {
    await mkdir(join(tempDir, '.claude'), { recursive: true })
    const configPath = join(tempDir, '.claude', 'toolgate.config.ts')
    await writeFile(configPath, 'export default []')
    expect(findConfigInDir(tempDir)).toBe(configPath)
  })

  it('prefers root config over .claude/ config', async () => {
    const rootConfig = join(tempDir, 'toolgate.config.ts')
    await mkdir(join(tempDir, '.claude'), { recursive: true })
    const claudeConfig = join(tempDir, '.claude', 'toolgate.config.ts')
    await writeFile(rootConfig, 'export default []')
    await writeFile(claudeConfig, 'export default []')
    expect(findConfigInDir(tempDir)).toBe(rootConfig)
  })

  it('returns null when no config found', () => {
    expect(findConfigInDir(tempDir)).toBeNull()
  })
})

describe('findAllConfigs', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'toolgate-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true })
  })

  it('returns empty array when no configs exist', () => {
    expect(findAllConfigs(tempDir)).toEqual([])
  })

  it('finds config in cwd', async () => {
    const configPath = join(tempDir, 'toolgate.config.ts')
    await writeFile(configPath, 'export default []')
    expect(findAllConfigs(tempDir)).toEqual([configPath])
  })

  it('finds configs in cwd and parent, innermost first', async () => {
    const parentConfig = join(tempDir, '.claude', 'toolgate.config.ts')
    await mkdir(join(tempDir, '.claude'), { recursive: true })
    await writeFile(parentConfig, 'export default []')

    const child = join(tempDir, 'child')
    await mkdir(child)
    const childConfig = join(child, 'toolgate.config.ts')
    await writeFile(childConfig, 'export default []')

    expect(findAllConfigs(child)).toEqual([childConfig, parentConfig])
  })

  it('skips directories without configs', async () => {
    const parentConfig = join(tempDir, 'toolgate.config.ts')
    await writeFile(parentConfig, 'export default []')

    const child = join(tempDir, 'a', 'b')
    await mkdir(child, { recursive: true })

    expect(findAllConfigs(child)).toEqual([parentConfig])
  })
})

describe('loadConfigs', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'toolgate-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true })
  })

  it('continues loading when a config file has errors', async () => {
    // Parent with broken config
    await writeFile(join(tempDir, 'toolgate.config.ts'), 'import "nonexistent-package"; export default []')

    // Child with valid config
    const child = join(tempDir, 'child')
    await mkdir(child)
    await writeFile(join(child, 'toolgate.config.ts'), 'export default []')

    // Should not throw — broken parent is skipped, builtin policies still load
    const policies = await loadConfigs(child)
    expect(policies.length).toBeGreaterThan(0)
  })

  it('includes builtin policies even when no configs exist', async () => {
    const policies = await loadConfigs(tempDir)
    expect(policies.length).toBeGreaterThan(0)
  })
})
