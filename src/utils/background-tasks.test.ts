import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractCommandString,
  extractBackgroundTasks,
  formatTaskDuration,
} from './background-tasks'
import type { Message } from '../types/opencode'

test('extractCommandString extracts command, cmd, script or fallback', () => {
  assert.equal(extractCommandString('bash', { command: 'npm test --prefix app' }), 'npm test --prefix app')
  assert.equal(extractCommandString('run_command', { cmd: 'cargo build --release' }), 'cargo build --release')
  assert.equal(extractCommandString('python', { script: 'test.py --verbose' }), 'test.py --verbose')
  assert.equal(extractCommandString('read_file', { path: 'src/App.tsx' }), 'read_file src/App.tsx')
  assert.equal(extractCommandString('bash', undefined), 'bash')
})

test('formatTaskDuration formats seconds, minutes and hours', () => {
  assert.equal(formatTaskDuration(0), '0s')
  assert.equal(formatTaskDuration(1400), '1.4s')
  assert.equal(formatTaskDuration(45000), '45.0s')
  assert.equal(formatTaskDuration(75000), '1m 15s')
  assert.equal(formatTaskDuration(3665000), '1h 1m')
})

test('extractBackgroundTasks accurately normalizes tool parts from messages', () => {
  const messages: Message[] = [
    {
      info: {
        id: 'msg_1',
        sessionID: 'ses_1',
        role: 'assistant',
        time: { created: 1794135000000, completed: 1794135005000 },
      },
      parts: [
        {
          id: 'part_tool_1',
          sessionID: 'ses_1',
          messageID: 'msg_1',
          type: 'tool',
          tool: 'bash',
          callID: 'call_1',
          state: {
            status: 'completed',
            input: { command: 'npm run build' },
            output: 'Built in 700ms\nDone.',
            time: { start: 1794135000000, end: 1794135005000 },
          },
        },
        {
          id: 'part_tool_2',
          sessionID: 'ses_1',
          messageID: 'msg_1',
          type: 'tool',
          tool: 'bash',
          callID: 'call_2',
          state: {
            status: 'running',
            input: { command: 'python -m http.server 8080' },
            output: 'Serving HTTP on 0.0.0.0 port 8080...',
            time: { start: 1794135006000 },
          },
        },
      ],
    },
  ]

  const tasks = extractBackgroundTasks(messages, 'ses_1', 'Dev Workspace')
  assert.equal(tasks.length, 2)

  // Newest first
  const runningTask = tasks[0]
  assert.equal(runningTask.command, 'python -m http.server 8080')
  assert.equal(runningTask.status, 'running')
  assert.ok(runningTask.output.includes('Serving HTTP'))

  const completedTask = tasks[1]
  assert.equal(completedTask.command, 'npm run build')
  assert.equal(completedTask.status, 'completed')
  assert.equal(completedTask.durationMs, 5000)
})
