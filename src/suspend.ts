import { join } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'
import { writeFile, unlink } from 'fs/promises'

export const SUSPEND_FILE = join(homedir(), '.claude', 'toolgate-suspended')
const PERMISSION_LOG = join(homedir(), '.claude', 'permission-requests.jsonl')

export function isSuspended(): boolean {
  return existsSync(SUSPEND_FILE)
}

function formatLogLine(line: string): string | null {
  try {
    const entry = JSON.parse(line)
    const tool = entry.tool_name ?? '?'
    const args = entry.tool_input ?? {}
    switch (tool) {
      case 'Bash':
        return `Bash: ${args.command ?? '(no command)'}`
      case 'Read':
        return `Read: ${args.file_path ?? '(no path)'}`
      case 'Write':
        return `Write: ${args.file_path ?? '(no path)'}`
      case 'Edit':
        return `Edit: ${args.file_path ?? '(no path)'}`
      case 'Glob':
        return `Glob: ${args.pattern ?? '(no pattern)'}`
      case 'Grep':
        return `Grep: ${args.pattern ?? '(no pattern)'}`
      case 'WebFetch':
        return `WebFetch: ${args.url ?? '(no url)'}`
      case 'Agent':
        return `Agent: ${args.description ?? args.subagent_type ?? '(no description)'}`
      case 'Skill':
        return `Skill: ${args.skill ?? '(no skill)'}`
      default:
        return `${tool}: ${JSON.stringify(args).slice(0, 120)}`
    }
  } catch {
    return null
  }
}

export async function suspend(): Promise<void> {
  if (isSuspended()) {
    console.log('⚠ Stale suspend file found — overwriting (previous process may have crashed)')
  }

  await writeFile(SUSPEND_FILE, String(process.pid), 'utf-8')

  console.log('Toolgate policies suspended — all tool calls will prompt normally.')
  console.log('Press Ctrl+C to resume policy enforcement.\n')

  // Tail the permission log, formatting each line
  const tail = Bun.spawn(['tail', '-f', '-n', '0', PERMISSION_LOG], {
    stdout: 'pipe',
    stderr: 'inherit',
  })

  const reader = tail.stdout.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const readLoop = async () => {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()!
      for (const line of lines) {
        const formatted = formatLogLine(line)
        if (formatted) console.log(formatted)
      }
    }
  }
  readLoop().catch(() => {})

  const cleanup = async () => {
    tail.kill()
    try { await unlink(SUSPEND_FILE) } catch {}
    console.log('\nPolicies resumed.')
    process.exit(0)
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  await new Promise(() => {})
}
