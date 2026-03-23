import { findProjectConfig, loadConfigFile } from './config'
import { builtinPolicies } from '../policies'
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

  console.log('Built-in:')
  if (builtinPolicies.length === 0) {
    console.log('  (none)')
  } else {
    printPolicies(builtinPolicies)
  }
  total += builtinPolicies.length
  console.log()

  console.log(`${total} policies loaded.`)
}
