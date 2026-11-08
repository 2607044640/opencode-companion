import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  ANTIGRAVITY_SLASH_COMMANDS,
  findSlashCommand,
  parseSlashCommandInput,
  formatSlashCommandPrompt,
} from './slash-commands'

describe('slash-commands utilities', () => {
  it('contains all core Antigravity slash commands', () => {
    const names = ANTIGRAVITY_SLASH_COMMANDS.map((c) => c.name)
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

  it('finds slash command by name and alias', () => {
    assert.strictEqual(findSlashCommand('plan')?.name, 'plan')
    assert.strictEqual(findSlashCommand('p')?.name, 'plan')
    assert.strictEqual(findSlashCommand('planning')?.name, 'plan')
    assert.strictEqual(findSlashCommand('cron')?.name, 'schedule')
    assert.strictEqual(findSlashCommand('autonomous')?.name, 'goal')
  })

  it('parses slash command input correctly', () => {
    const res = parseSlashCommandInput('/plan build a compiler')
    assert.ok(res)
    assert.strictEqual(res?.commandName, 'plan')
    assert.strictEqual(res?.args, 'build a compiler')
    assert.strictEqual(res?.definition?.name, 'plan')
  })

  it('parses slash command without arguments', () => {
    const res = parseSlashCommandInput('/compact')
    assert.ok(res)
    assert.strictEqual(res?.commandName, 'compact')
    assert.strictEqual(res?.args, '')
  })

  it('returns null for non-slash input', () => {
    assert.strictEqual(parseSlashCommandInput('hello world'), null)
    assert.strictEqual(parseSlashCommandInput(''), null)
  })

  it('formats /plan into structured directive with suggested plan agent', () => {
    const res = formatSlashCommandPrompt('/plan Add OAuth authentication')
    assert.strictEqual(res.isSpecialExecution, false)
    assert.strictEqual(res.suggestedAgent, 'plan')
    assert.ok(res.formattedText.includes('[Workflow Directive: /plan]'))
    assert.ok(res.formattedText.includes('Add OAuth authentication'))
  })

  it('formats /goal into autonomous loop directive', () => {
    const res = formatSlashCommandPrompt('/goal Fix all flaky tests')
    assert.strictEqual(res.suggestedAgent, 'build')
    assert.ok(res.formattedText.includes('[Workflow Directive: /goal]'))
    assert.ok(res.formattedText.includes('Fix all flaky tests'))
  })

  it('identifies special execution commands like /compact and /btw', () => {
    const compactRes = formatSlashCommandPrompt('/compact')
    assert.strictEqual(compactRes.isSpecialExecution, true)
    assert.strictEqual(compactRes.specialKind, 'compact')

    const btwRes = formatSlashCommandPrompt('/btw what is this function?')
    assert.strictEqual(btwRes.isSpecialExecution, true)
    assert.strictEqual(btwRes.specialKind, 'btw')
    assert.strictEqual(btwRes.formattedText, 'what is this function?')
  })
})
