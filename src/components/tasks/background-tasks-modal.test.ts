import test from 'node:test'
import assert from 'node:assert/strict'
import { extractBackgroundTasks, formatTaskDuration } from '../../utils/background-tasks'
import type { Message } from '../../types/opencode'

test('BackgroundTasksModal data lifecycle and task transitions', () => {
  const messages: Message[] = [
    {
      info: {
        id: 'msg_test_1',
        sessionID: 'ses_test',
        role: 'assistant',
        time: { created: 1794135000000 },
      },
      parts: [
        {
          id: 'p_tool_1',
          sessionID: 'ses_test',
          messageID: 'msg_test_1',
          type: 'tool',
          tool: 'bash',
          callID: 'call_bash_1',
          state: {
            status: 'running',
            input: { command: 'cargo test --workspace' },
            output: 'Compiling opencode v0.4.0...\nRunning unittests...',
            time: { start: 1794135000000 },
          },
        },
      ],
    },
  ]

  const tasks = extractBackgroundTasks(messages, 'ses_test', 'Backend Rust Workspace')
  assert.equal(tasks.length, 1)

  const task = tasks[0]
  assert.equal(task.command, 'cargo test --workspace')
  assert.equal(task.status, 'running')
  assert.ok(task.output.includes('Compiling opencode'))
  assert.equal(task.sessionTitle, 'Backend Rust Workspace')

  // When task completes
  task.status = 'completed'
  task.endTime = task.startTime + 12500
  task.durationMs = 12500

  assert.equal(formatTaskDuration(task.durationMs), '12.5s')
})

test('Filters tasks cleanly by status and search terms', () => {
  const messages: Message[] = [
    {
      info: { id: 'm1', sessionID: 's1', role: 'assistant', time: { created: 1000 } },
      parts: [
        {
          id: 'p1',
          sessionID: 's1',
          messageID: 'm1',
          type: 'tool',
          tool: 'bash',
          state: { status: 'running', input: { command: 'npm run dev' }, output: 'ready' },
        },
        {
          id: 'p2',
          sessionID: 's1',
          messageID: 'm1',
          type: 'tool',
          tool: 'bash',
          state: { status: 'completed', input: { command: 'git status' }, output: 'clean' },
        },
      ],
    },
  ]

  const tasks = extractBackgroundTasks(messages, 's1', 'Web')
  assert.equal(tasks.length, 2)

  const runningTasks = tasks.filter((t) => t.status === 'running')
  assert.equal(runningTasks.length, 1)
  assert.equal(runningTasks[0].command, 'npm run dev')

  const gitTasks = tasks.filter((t) => t.command.includes('git'))
  assert.equal(gitTasks.length, 1)
  assert.equal(gitTasks[0].command, 'git status')
})
