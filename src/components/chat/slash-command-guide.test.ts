import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  ANTIGRAVITY_SLASH_COMMANDS,
  findSlashCommand,
  parseSlashCommandInput,
  formatSlashCommandPrompt,
} from '../../utils/slash-commands'
import { mergeBuiltinCommands } from './prompt-input-helpers'

describe('Slash Command Guide & Palette Integration', () => {
  it('every Antigravity command has a non-empty category, description, and icon', () => {
    for (const cmd of ANTIGRAVITY_SLASH_COMMANDS) {
      assert.ok(cmd.name, 'Command has name')
      assert.ok(cmd.category, `Command ${cmd.name} has category`)
      assert.ok(cmd.description, `Command ${cmd.name} has description`)
      assert.ok(cmd.descriptionZh, `Command ${cmd.name} has descriptionZh`)
      assert.ok(cmd.icon, `Command ${cmd.name} has icon`)
    }
  })

  it('mergeBuiltinCommands successfully includes all 13 Antigravity slash commands', () => {
    const merged = mergeBuiltinCommands([])
    assert.strictEqual(merged.length, 13)
    const names = merged.map((c) => c.name)
    assert.ok(names.includes('plan'))
    assert.ok(names.includes('goal'))
    assert.ok(names.includes('schedule'))
    assert.ok(names.includes('compact'))
    assert.ok(names.includes('browser'))
    assert.ok(names.includes('grill-me'))
    assert.ok(names.includes('teamwork'))
    assert.ok(names.includes('learn'))
    assert.ok(names.includes('boost'))
    assert.ok(names.includes('btw'))
    assert.ok(names.includes('summary'))
    assert.ok(names.includes('title'))
    assert.ok(names.includes('undo'))
  })

  it('preserves existing custom commands when merging', () => {
    const custom = [{ name: 'my-custom-tool', description: 'Custom' }]
    const merged = mergeBuiltinCommands(custom)
    assert.strictEqual(merged.length, 14)
    assert.strictEqual(merged[0].name, 'my-custom-tool')
  })

  it('preset values for /schedule contain valid cron or duration prefixes', () => {
    const sched = findSlashCommand('schedule')
    assert.ok(sched?.presets && sched.presets.length >= 3)
    for (const p of sched?.presets || []) {
      assert.ok(p.value.includes('*') || p.value.includes('s'), `Preset value ${p.value} has cron or seconds`)
    }
  })

  it('directiveTemplate for /grill-me and /boost generate targeted steering text', () => {
    const grill = formatSlashCommandPrompt('/grill-me Database migration strategy')
    assert.ok(grill.formattedText.includes('[Workflow Directive: /grill-me]'))
    assert.ok(grill.formattedText.includes('Database migration strategy'))
    assert.ok(grill.formattedText.includes('3-5 targeted, critical design questions'))

    const boost = formatSlashCommandPrompt('/boost Memory leak in WebSocket pool')
    assert.ok(boost.formattedText.includes('[Workflow Directive: /boost]'))
    assert.ok(boost.formattedText.includes('Memory leak in WebSocket pool'))
  })
})
