import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectRollbackActions } from './revert-rollback'

test('legacy edit snippets must never be offered as complete restore bytes', () => {
  const messages: any = [{ info: { id: 'msg_1' }, parts: [{ type: 'tool', tool: 'edit', state: { status: 'completed', input: { filePath: '/home/developer/projects/AISpace/a.txt', oldString: 'middle', newString: 'changed' } } }] }]
  assert.throws(() => collectRollbackActions(messages, 'msg_1'), /snapshot/i)
})
