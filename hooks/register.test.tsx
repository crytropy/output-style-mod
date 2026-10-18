import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PLUGIN = 'style'
const SURFACES = ['terminal', 'desktop'] as const
const HINT = { isDraft: false, isWorking: false, hint: '? for shortcuts' }
const START = { cwd: '/project', surface: 'terminal', isInteractive: true } as const
const RUN = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

/** The engine beneath the plugin: what a session answers at start, and a bare file system. */
function world(on: On, outputStyle?: string) {
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('settings.read', () => ({ value: outputStyle === undefined ? {} : { outputStyle } }))
  on('session.root', () => ({ value: '/project' }))
  on('fs.exists', () => ({ value: false }))
  mock.env(on, {})
}

test('the hint line shows the current style on the right', async ($, on) => {
  world(on, 'ELI5')
  await $.session.start(START)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'PromptHint',
      props: HINT,
      viewport: { columns: 100, rows: 40 },
    })
    expect(await ui.find({ text: /ELI5/ })).toBeDefined()
    expect(await ui.find({ text: '? for shortcuts' })).toBeDefined()
    await ui.unmount()
  }
})

test('a narrow line falls back to a tail on the engine hint', async ($, on) => {
  world(on, 'ELI5')
  // The engine's own line: the hint, the tail dim after it.
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return (
      <Text>
        {e.props.hint} <Text dimColor>{e.props.tail ?? ''}</Text>
      </Text>
    )
  })
  await $.session.start(START)

  const ui = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal',
    component: 'PromptHint',
    props: HINT,
    viewport: { columns: 10, rows: 24 },
  })
  const drawn = await ui.drawn()
  expect(JSON.stringify(drawn)).toContain('ELI5')
  await ui.unmount()
})

test('prompt.compose keeps the shown style in step with the engine', async ($, on) => {
  on('prompt.compose', () => ({ sections: [] }))
  await $.prompt.compose({
    model: 'claude-fable-5-1',
    promptModel: 'claude-fable-5-1',
    surfaces: ['terminal'],
    tools: [],
    traits: [],
    outputStyle: { name: 'Learning', isKeepingCodingInstructions: true },
  })

  const ui = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal',
    component: 'PromptHint',
    props: HINT,
    viewport: { columns: 80, rows: 24 },
  })
  expect(await ui.find({ text: /Learning/ })).toBeDefined()
  await ui.unmount()
})

test('/style with no name lists the built-in styles and marks the current one', async ($, on) => {
  world(on, 'Learning')
  await $.session.start(START)

  const { text } = await $.command.run({ command: 'style', args: '', ...RUN })
  expect(text).toContain('  default')
  expect(text).toContain('  Explanatory')
  expect(text).toContain('* Learning')
})

test('/style with an unknown name refuses', async ($, on) => {
  world(on)
  await $.session.start(START)

  const { text } = await $.command.run({ command: 'style', args: 'nope', ...RUN })
  expect(text).toContain('Unknown style "nope"')
})
