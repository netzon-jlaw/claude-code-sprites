import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'sprite-party',
  component: 'Pane' as const,
  requestId: 'sprite-party',
  props: { title: 'Party', isFocused: false, bodyColumns: 80, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} },
}

test('a spawned subagent joins the party, then finishes its quest', async ($, on) => {
  mock.store(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'agent-1' }))
  on('turn.complete', () => ({ text: '' }))
  on('session.messages', () => ({ value: [] }))

  const ran = await $.agent.spawn({
    tool_use_id: 'tool-1',
    prompt: 'Find every usage of AuthService.',
    description: 'Find all usages of AuthService',
    subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-fable-5-1',
    background: false,
    fork: false,
  })
  expect(ran.agentId).toBe('agent-1')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: 'Pip' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Data Engineering · Explore \(Sonnet 5\.5\)/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Find all usages of AuthService' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Running 1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Pondering/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Context: 200k left of 200k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Moves: 0 of 100 used/ })).toBeDefined()
    expect(await ui.find({ type: surface === 'terminal' ? 'Raster' : 'Svg' })).toBeDefined()
    await ui.unmount()
  }

  await $.turn.complete({ answer: 'Done.', durationMs: 4000, isAborted: false, turnId: 'turn-1', agentId: 'agent-1', reason: 'answer' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Running 0/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /resting/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Quest complete/ })).toBeUndefined()
  await ui.press({ key: 'toggle-finished' })
  expect(await ui.find({ type: 'Text', text: /Quest complete/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Guild · Lv 1 · 10 XP · 1 quests · 0 KO/ })).toBeDefined()
  await ui.press({ key: 'view-agent-1' })
  expect(await ui.find({ type: 'Text', text: /Task/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Find every usage of AuthService.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Recent moves/ })).toBeDefined()
  await ui.press({ key: 'back' })
  expect(await ui.find({ type: 'Button', text: /Finished 1/ })).toBeDefined()
  await ui.press({ key: 'clear-finished' })
  expect(await ui.find({ type: 'Button', text: /Finished 0/ })).toBeDefined()
  await ui.unmount()
})
