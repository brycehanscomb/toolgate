import { readFile, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { relative } from 'path'
import { findAllConfigs } from './config'
import { builtinPolicies } from '../policies'
import type { Policy } from './types'

type PolicyEntry = { policy: Policy; source: string }

/**
 * Format a config path for display: `./relative/path` when under cwd,
 * `~/relative/path` when under $HOME, else the absolute path.
 */
export function formatSource(path: string, cwd: string): string {
  const rel = relative(cwd, path)
  if (rel && !rel.startsWith('..')) return `./${rel}`
  const home = homedir()
  const hrel = relative(home, path)
  if (hrel && !hrel.startsWith('..')) return `~/${hrel}`
  return path
}

/**
 * Serialize and replace (or append) the `export const disable = [...]`
 * declaration in a config source file.
 */
export function updateConfigSource(source: string, disabled: string[]): string {
  const body =
    disabled.length === 0
      ? `export const disable: string[] = []`
      : `export const disable = [\n${disabled
          .map((n) => `  ${JSON.stringify(n)},`)
          .join('\n')}\n]`

  const re = /export\s+const\s+disable(?:\s*:\s*[^=]+)?\s*=\s*\[[\s\S]*?\]/
  if (re.test(source)) return source.replace(re, body)

  const trimmed = source.endsWith('\n') ? source : source + '\n'
  return trimmed + '\n' + body + '\n'
}

async function gatherPolicies(cwd: string): Promise<PolicyEntry[]> {
  const entries: PolicyEntry[] = []
  for (const configPath of findAllConfigs(cwd)) {
    try {
      const mod = await import(configPath)
      if (Array.isArray(mod.default)) {
        const src = formatSource(configPath, cwd)
        for (const policy of mod.default) entries.push({ policy, source: src })
      }
    } catch (err) {
      console.error(
        `toolgate: failed to load config ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
  for (const policy of builtinPolicies) entries.push({ policy, source: 'builtin' })

  // dedupe by name — first occurrence wins (innermost)
  const seen = new Set<string>()
  return entries.filter((e) => {
    if (seen.has(e.policy.name)) return false
    seen.add(e.policy.name)
    return true
  })
}

async function readDisabledFromConfig(configPath: string): Promise<Set<string>> {
  try {
    const mod = await import(configPath)
    if (Array.isArray(mod.disable)) return new Set(mod.disable)
  } catch {}
  return new Set()
}

function truncate(s: string, max: number): string {
  if (max <= 0) return ''
  // use character length; adequate for ASCII + a few unicode arrows/em-dash
  if ([...s].length <= max) return s
  const chars = [...s]
  return chars.slice(0, Math.max(0, max - 1)).join('') + '…'
}

/**
 * Word-wrap text into lines of up to `width` chars. Words longer than
 * `width` are hard-broken across lines.
 */
export function wrapText(text: string, width: number): string[] {
  if (width <= 0 || !text) return []
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    if (w.length > width) {
      if (line) { lines.push(line); line = '' }
      for (let i = 0; i < w.length; i += width) lines.push(w.slice(i, i + width))
      continue
    }
    if (!line) { line = w; continue }
    if (line.length + 1 + w.length <= width) { line += ' ' + w; continue }
    lines.push(line); line = w
  }
  if (line) lines.push(line)
  return lines
}

async function runPicker(
  policies: PolicyEntry[],
  initial: Set<string>,
  targetPath: string,
): Promise<string[] | null> {
  return new Promise((resolve) => {
    const ticked = new Set(initial)
    let idx = 0
    const stdin = process.stdin
    const stdout = process.stdout

    if (!stdin.isTTY) {
      console.error('toolgate: disable requires an interactive terminal')
      resolve(null)
      return
    }

    // alternate screen buffer: preserves the user's scrollback
    stdout.write('\x1b[?1049h\x1b[?25l')

    // columns that stay constant across renders
    const maxNameLen = policies.reduce((m, e) => Math.max(m, e.policy.name.length), 0)
    // prefix: "> [x] name   " — everything before the description column
    // suffix (right-aligned): " (source)"

    let scrollStart = 0

    /**
     * Build the multi-line block for one policy row.
     * Line 1:  > [x] name   desc...          (source)
     * Line 2+:              desc continued...
     */
    function buildBlock(i: number, cols: number): string[] {
      const { policy: p, source } = policies[i]
      const cursor = i === idx ? '>' : ' '
      const mark = ticked.has(p.name) ? '[x]' : '[ ]'
      const name = p.name.padEnd(maxNameLen)
      const prefix = `${cursor} ${mark} ${name}   `
      const contPrefix = ' '.repeat(prefix.length)
      const srcTag = `(${source})`

      // reserve space for source tag on first line (+ 2 for gap)
      const descWidthFirstLine = Math.max(10, cols - prefix.length - srcTag.length - 2)
      const descWidthCont = Math.max(10, cols - contPrefix.length)
      const descLines = p.description
        ? wrapText(p.description, descWidthFirstLine)
        : []

      // if description overflows the tighter first-line width, re-wrap to full continuation width
      // keeping the first line at the tighter width so source tag fits
      let firstLineDesc = ''
      let restDescLines: string[] = []
      if (descLines.length > 0) {
        firstLineDesc = descLines[0]
        if (descLines.length > 1) {
          // re-wrap the remaining text at the wider continuation width
          const remaining = descLines.slice(1).join(' ')
          restDescLines = wrapText(remaining, descWidthCont)
        }
      }

      const lines: string[] = []

      // first line: prefix + desc + right-aligned source
      const firstContent = firstLineDesc
        ? `${prefix}${firstLineDesc}`
        : prefix.trimEnd()
      const pad = Math.max(1, cols - firstContent.length - srcTag.length)
      lines.push(`${firstContent}${' '.repeat(pad)}${srcTag}`.slice(0, cols))

      // continuation lines (description only, indented to desc column)
      for (const dl of restDescLines) {
        const line = `${contPrefix}${dl}`
        lines.push(line.length > cols ? line.slice(0, cols) : line)
      }

      return lines
    }

    const render = () => {
      const rows = stdout.rows || 24
      const cols = stdout.columns || 80
      const header = [
        truncate(`Editing: ${targetPath}`, cols),
        truncate(`Space toggle · ↑↓ move · Enter save · Esc cancel`, cols),
        '',
      ]
      const footerLineCount = 2 // blank + status
      const available = Math.max(1, rows - header.length - footerLineCount)

      // ensure scrollStart keeps idx visible
      if (scrollStart > idx) scrollStart = idx

      // advance scrollStart forward until the selected block fits
      while (scrollStart < idx) {
        let h = 0
        for (let i = scrollStart; i <= idx; i++) h += buildBlock(i, cols).length
        if (h <= available) break
        scrollStart++
      }

      // build visible blocks starting from scrollStart
      const bodyLines: string[] = []
      for (let i = scrollStart; i < policies.length; i++) {
        const block = buildBlock(i, cols)
        if (bodyLines.length + block.length > available && i > idx) break
        for (const line of block) {
          if (bodyLines.length >= available) break
          bodyLines.push(line)
        }
      }

      const lines = [
        ...header,
        ...bodyLines,
        '',
        truncate(`(${idx + 1}/${policies.length}, ${ticked.size} disabled)`, cols),
      ]

      // move cursor home, clear screen, paint
      stdout.write('\x1b[H\x1b[2J')
      stdout.write(lines.join('\n'))
    }

    const cleanup = () => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.removeListener('data', onData)
      stdout.off('resize', render)
      // restore normal screen + cursor
      stdout.write('\x1b[?25h\x1b[?1049l')
    }

    const onData = (buf: Buffer) => {
      const key = buf.toString('utf8')
      if (key === '\x03' || key === '\x1b' || key === 'q') {
        cleanup()
        resolve(null)
        return
      }
      if (key === '\r' || key === '\n') {
        cleanup()
        resolve([...ticked].sort())
        return
      }
      if (key === ' ') {
        const name = policies[idx].policy.name
        if (ticked.has(name)) ticked.delete(name)
        else ticked.add(name)
        render()
        return
      }
      if (key === '\x1b[A' || key === 'k') {
        idx = Math.max(0, idx - 1)
        render()
        return
      }
      if (key === '\x1b[B' || key === 'j') {
        idx = Math.min(policies.length - 1, idx + 1)
        render()
        return
      }
      if (key === '\x1b[H' || key === 'g') {
        idx = 0
        render()
        return
      }
      if (key === '\x1b[F' || key === 'G') {
        idx = policies.length - 1
        render()
        return
      }
    }

    stdin.setRawMode(true)
    stdin.resume()
    stdin.on('data', onData)
    stdout.on('resize', render)
    render()
  })
}

/**
 * Pick which config file to edit. Precedence:
 *   --file=<path>  : use that exact path (created if missing)
 *   --local        : nearest toolgate.config.local.ts (cwd first, else created in cwd)
 *   --shared       : nearest toolgate.config.ts (cwd first, else created in cwd)
 *   (default)      : innermost existing config; error if none
 */
async function resolveTarget(cwd: string, opts: { file?: string; local?: boolean; shared?: boolean }): Promise<string> {
  const { existsSync } = await import('fs')
  const { join, isAbsolute, resolve } = await import('path')
  const { writeFile } = await import('fs/promises')

  const ensure = async (path: string) => {
    if (!existsSync(path)) await writeFile(path, 'export default []\n')
    return path
  }

  if (opts.file) {
    return ensure(isAbsolute(opts.file) ? opts.file : resolve(cwd, opts.file))
  }

  const filename = opts.local ? 'toolgate.config.local.ts' : opts.shared ? 'toolgate.config.ts' : null
  if (filename) {
    const configs = findAllConfigs(cwd).filter((p) => p.endsWith(filename))
    if (configs[0]) return configs[0]
    return ensure(join(cwd, filename))
  }

  const configs = findAllConfigs(cwd)
  if (!configs[0]) {
    console.error(
      'toolgate: no toolgate.config.ts found in cwd or parents. Use --shared or --local to create one, or run `toolgate init --project`.',
    )
    process.exit(1)
  }
  return configs[0]
}

async function collectDisableState(cwd: string) {
  const configs = findAllConfigs(cwd)

  // collect all disable sets per config
  const disabledByConfig = new Map<string, Set<string>>()
  for (const configPath of configs) {
    const d = await readDisabledFromConfig(configPath)
    if (d.size > 0) disabledByConfig.set(configPath, d)
  }
  const allDisabled = new Set<string>()
  for (const s of disabledByConfig.values()) for (const n of s) allDisabled.add(n)

  const policies = await gatherPolicies(cwd)
  return { configs, disabledByConfig, allDisabled, policies }
}

async function printJson(cwd: string) {
  const { configs, disabledByConfig, allDisabled, policies } = await collectDisableState(cwd)

  const output = {
    cwd,
    configs: configs.map((c) => ({
      path: c,
      disables: disabledByConfig.has(c) ? [...disabledByConfig.get(c)!].sort() : [],
    })),
    policies: policies.map((e) => ({
      name: e.policy.name,
      description: e.policy.description,
      source: e.source,
      disabled: allDisabled.has(e.policy.name),
      disabledBy: [...disabledByConfig.entries()]
        .filter(([, s]) => s.has(e.policy.name))
        .map(([path]) => formatSource(path, cwd)),
    })),
    summary: {
      total: policies.length,
      active: policies.filter((e) => !allDisabled.has(e.policy.name)).length,
      disabled: policies.filter((e) => allDisabled.has(e.policy.name)).length,
      unknownDisables: [...allDisabled].filter(
        (n) => !policies.some((e) => e.policy.name === n),
      ),
    },
  }

  console.log(JSON.stringify(output, null, 2))
}

export async function disableCmd(argv: string[] = []) {
  const cwd = process.cwd()

  if (argv.includes('--json')) {
    await printJson(cwd)
    return
  }

  const fileArg = argv.find((a) => a.startsWith('--file='))?.slice('--file='.length)
  const opts = {
    file: fileArg,
    local: argv.includes('--local'),
    shared: argv.includes('--shared'),
  }
  if ([opts.file, opts.local, opts.shared].filter(Boolean).length > 1) {
    console.error('toolgate: --file, --local, and --shared are mutually exclusive')
    process.exit(1)
  }
  const target = await resolveTarget(cwd, opts)

  const policies = await gatherPolicies(cwd)
  if (policies.length === 0) {
    console.error('toolgate: no policies loaded')
    process.exit(1)
  }

  const currentDisabled = await readDisabledFromConfig(target)
  const result = await runPicker(policies, currentDisabled, target)
  if (!result) {
    console.log('toolgate: cancelled, no changes written')
    return
  }

  const source = await readFile(target, 'utf8')
  const updated = updateConfigSource(source, result)
  if (updated === source) {
    console.log('toolgate: no changes')
    return
  }
  await writeFile(target, updated)
  console.log(`toolgate: updated ${target} (${result.length} disabled)`)
}
