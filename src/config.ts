import { existsSync } from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'
import type { Policy } from './types'
import { builtinPolicies } from '../policies'

const CONFIG_FILENAME = 'toolgate.config.ts'

export function findConfigInDir(dir: string): string | null {
  const rootConfig = join(dir, CONFIG_FILENAME)
  if (existsSync(rootConfig)) return rootConfig

  const claudeConfig = join(dir, '.claude', CONFIG_FILENAME)
  if (existsSync(claudeConfig)) return claudeConfig

  return null
}

/**
 * Walk from cwd up to $HOME, collecting all toolgate configs.
 * Returns innermost first (most specific takes priority).
 */
export function findAllConfigs(cwd: string): string[] {
  const home = homedir()
  const configs: string[] = []
  let dir = cwd

  while (true) {
    const config = findConfigInDir(dir)
    if (config) configs.push(config)

    if (dir === home || dir === '/') break
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return configs
}

export async function loadConfigFile(path: string): Promise<Policy[]> {
  const mod = await import(path)
  const policies = mod.default
  if (!Array.isArray(policies)) {
    throw new Error(`toolgate: config at ${path} must export a default array of policies`)
  }
  return policies
}

export async function loadConfigs(cwd: string): Promise<Policy[]> {
  const policies: Policy[] = []

  for (const configPath of findAllConfigs(cwd)) {
    try {
      policies.push(...await loadConfigFile(configPath))
    } catch (err) {
      console.error(`toolgate: failed to load config ${configPath}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  policies.push(...builtinPolicies)

  return policies
}
