import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { toWindowsPath, toLinuxPath } from '../../utils/path-resolver'

describe('FileActionMenu integration helpers', () => {
  it('correctly maps Linux jail path to Windows backslash path', () => {
    const raw = '/home/developer/projects/AICore/global/rules/AGENTS_Antigravity.md'
    const win = toWindowsPath(raw)
    assert.equal(win, 'C:\\AICore\\global\\rules\\AGENTS_Antigravity.md')
  })

  it('correctly preserves Linux jail path for Linux copy', () => {
    const raw = '/home/developer/projects/AICore/global/rules/AGENTS_Antigravity.md'
    const linux = toLinuxPath(raw)
    assert.equal(linux, '/home/developer/projects/AICore/global/rules/AGENTS_Antigravity.md')
  })

  it('parses line number correctly from ranges', () => {
    const parseLine = (line?: number | string) =>
      typeof line === 'number'
        ? line
        : typeof line === 'string'
          ? parseInt(line.split('-')[0].replace(/\D/g, ''), 10) || undefined
          : undefined

    assert.equal(parseLine(42), 42)
    assert.equal(parseLine('12-45'), 12)
    assert.equal(parseLine('#L100'), 100)
    assert.equal(parseLine(undefined), undefined)
  })
})
