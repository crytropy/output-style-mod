import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const DEFAULT = 'default'
const BUILT_IN = [DEFAULT, 'Explanatory', 'Learning'] as const

const current = atom({ plugin: 'style', key: 'current' } as const, DEFAULT)

type Engine = EngineInterface

/** The style names found in one `output-styles` folder (frontmatter `name:` or the file name). */
async function stylesIn($: Engine, dir: string): Promise<string[]> {
  try {
    if (!(await $.fs.exists(dir))) return []
    const entries = await $.fs.list(dir)
    const names: string[] = []
    for (const entry of entries) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue
      let name = entry.name.slice(0, -3)
      try {
        const text = await $.fs.read(`${dir}/${entry.name}`)
        const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ''
        const named = front.match(/^name:\s*(.+?)\s*$/m)?.[1]
        if (named) name = named.replace(/^["']|["']$/g, '')
      } catch {
        // unreadable file: keep the file name
      }
      names.push(name)
    }
    return names
  } catch {
    return []
  }
}

/** Built-in styles first, then the user's and the project's custom ones. */
async function listStyles($: Engine): Promise<string[]> {
  const names: string[] = [...BUILT_IN]
  let home: string | undefined
  let root: string | undefined
  try {
    home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  } catch {
    home = undefined
  }
  try {
    root = await $.session.root()
  } catch {
    root = undefined
  }
  const dirs = [home, root]
    .filter((base): base is string => typeof base === 'string' && base.length > 0)
    .map(base => `${base.replace(/[\\/]+$/, '')}/.claude/output-styles`)
  for (const dir of dirs) {
    for (const name of await stylesIn($, dir)) {
      if (!names.some(known => known.toLowerCase() === name.toLowerCase())) names.push(name)
    }
  }
  return names
}

/** Switches the engine's output style: `/output-style` when it exists, else the project's local settings. */
async function switchStyle($: Engine, name: string): Promise<'command' | 'settings'> {
  let hasCommand = false
  try {
    hasCommand = (await $.command.list()).some(c => c.name === 'output-style')
  } catch {
    hasCommand = false
  }
  if (hasCommand) {
    try {
      await $.command.run({ command: 'output-style', args: name })
      return 'command'
    } catch {
      // fall through to the settings file
    }
  }
  const root = await $.session.root()
  const path = `${root.replace(/[\\/]+$/, '')}/.claude/settings.local.json`
  let settings: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(await $.fs.read(path))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      settings = parsed as Record<string, unknown>
    }
  } catch {
    settings = {}
  }
  if (name === DEFAULT) delete settings.outputStyle
  else settings.outputStyle = name
  await $.fs.write(path, JSON.stringify(settings, null, 2) + '\n')
  return 'settings'
}

/** Remembers the style and pins it as this plugin's status line under the prompt. */
async function show($: Engine, name: string): Promise<void> {
  await update($, current, () => name)
  $.ui.status(name)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'style',
      description: 'Show or switch the output style',
      argumentHint: '[name]',
    })
    try {
      const settings = await $.settings.read()
      const fromSettings = settings.outputStyle
      const name = typeof fromSettings === 'string' && fromSettings ? fromSettings : DEFAULT
      await show($, name)
    } catch {
      // no settings beneath (a test): keep what the state holds
      $.ui.status(await read($, current))
    }
    return next(e)
  })

  // Keep the shown name in step with what the engine really composes with.
  on('prompt.compose', async ($, e, next) => {
    const name = e.outputStyle?.name ?? DEFAULT
    if ((await read($, current)) !== name) {
      await show($, name)
    }
    return next(e)
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const name = await read($, current)
    const label = name
    const columns = e.viewport?.columns
    if (columns === undefined || columns < label.length + 4) {
      return next({ ...e, props: { ...e.props, tail: label } })
    }
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box width={columns} justifyContent="space-between">
        <Text dimColor>{e.props.hint}</Text>
        <Text dimColor>{label}</Text>
      </Box>
    )
  })

  on('command.run', { command: 'style' }, async ($, e) => {
    const styles = await listStyles($)
    const now = await read($, current)
    const wanted = e.args.trim()

    if (wanted === '') {
      const rows = styles.map(name => (name === now ? `* ${name}` : `  ${name}`))
      return {
        text: ['Output styles (* = current):', ...rows, '', 'Switch with /style <name>'].join('\n'),
      }
    }

    const match = styles.find(name => name.toLowerCase() === wanted.toLowerCase())
    if (match === undefined) {
      return { text: `Unknown style "${wanted}". Available: ${styles.join(', ')}` }
    }
    if (match === now) {
      return { text: `Output style is already ${match}.` }
    }

    await show($, match)
    try {
      const how = await switchStyle($, match)
      const note = how === 'settings' ? ' (written to .claude/settings.local.json)' : ''
      return { text: `Output style: ${now} -> ${match}${note}` }
    } catch (error) {
      await show($, now)
      const reason = error instanceof Error ? error.message : String(error)
      return { text: `Could not switch to ${match}: ${reason}` }
    }
  })
}
