import { existsSync } from 'fs'
import { join } from 'path'
import type { Policy } from './types'
import { builtinPolicies } from '../policies'

const CONFIG_FILENAME = 'toolgate.config.ts'

export async function findProjectConfig(cwd: string): Promise<string | null> {
  const rootConfig = join(cwd, CONFIG_FILENAME)
  if (existsSync(rootConfig)) return rootConfig

  const claudeConfig = join(cwd, '.claude', CONFIG_FILENAME)
  if (existsSync(claudeConfig)) return claudeConfig

  return null
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

  const projectPath = await findProjectConfig(cwd)
  if (projectPath) {
    policies.push(...await loadConfigFile(projectPath))
  }

  policies.push(...builtinPolicies)

  return policies
}
