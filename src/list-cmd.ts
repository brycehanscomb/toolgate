import { existsSync } from 'fs'
import { findProjectConfig, findGlobalConfig, loadConfigFile } from './config'
import type { Policy } from './types'

function printPolicies(policies: Policy[]): void {
  for (const policy of policies) {
    console.log(`  ${policy.name}`)
    console.log(`    ${policy.description}`)
  }
}

export async function listPolicies(): Promise<void> {
  const cwd = process.cwd()
  let total = 0

  const projectPath = await findProjectConfig(cwd)
  if (projectPath) {
    const policies = await loadConfigFile(projectPath)
    console.log(`Project (${projectPath}):`)
    if (policies.length === 0) {
      console.log('  (none)')
    } else {
      printPolicies(policies)
    }
    total += policies.length
    console.log()
  }

  const globalPath = findGlobalConfig()
  if (existsSync(globalPath)) {
    const policies = await loadConfigFile(globalPath)
    console.log(`Global (${globalPath}):`)
    if (policies.length === 0) {
      console.log('  (none)')
    } else {
      printPolicies(policies)
    }
    total += policies.length
    console.log()
  }

  if (total === 0) {
    console.log('No policies loaded. Configure toolgate.config.ts first.')
    process.exit(1)
  }

  console.log(`${total} policies loaded.`)
}
