import test from 'node:test'
import assert from 'node:assert/strict'
import { exportSessionToMarkdown, extractSessionPrompts } from './export-markdown'
import type { Message, Session } from '../types/opencode'

test('exportSessionToMarkdown formats title, metadata and dialogue turns cleanly', () => {
  const session: Session = {
    id: 'ses_test_123',
    slug: 'ses-test',
    projectID: 'proj_api',
    directory: '/workspace/projects/AISpace',
    title: '优化代码生成算法',
    agent: 'build',
    model: { id: 'gpt-6.1-sol', providerID: 'obsidian' },
    tokens: { input: 100, output: 200, reasoning: 50, cache: { read: 0, write: 0 } },
    cost: 0.05,
    time: { created: 1794135000000, updated: 1794136000000 },
  }

  const messages: Message[] = [
    {
      info: {
        id: 'msg_u1',
        sessionID: 'ses_test_123',
        role: 'user',
        time: { created: 1794135000000 },
      },
      parts: [
        {
          id: 'p1',
          sessionID: 'ses_test_123',
          messageID: 'msg_u1',
          type: 'text',
          text: '请帮我优化代码性能，减少不必要的重绘。',
        },
      ],
    },
    {
      info: {
        id: 'msg_a1',
        sessionID: 'ses_test_123',
        role: 'assistant',
        agent: 'build',
        modelID: 'gpt-6.1-sol',
        time: { created: 1794135005000 },
      },
      parts: [
        {
          id: 'p2',
          sessionID: 'ses_test_123',
          messageID: 'msg_a1',
          type: 'text',
          text: '好的，以下是具体的优化步骤与对比代码：\n\n```ts\nconst memoized = useMemo(() => calc(), [])\n```',
        },
      ],
    },
  ]

  const md = exportSessionToMarkdown(session, messages)

  assert.ok(md.includes('# 优化代码生成算法'), 'Has session title')
  assert.ok(md.includes('`ses_test_123`'), 'Includes session ID')
  assert.ok(md.includes('### 👤 User'), 'Includes user header')
  assert.ok(md.includes('请帮我优化代码性能'), 'Includes user message text')
  assert.ok(md.includes('### 🤖 build · gpt-6.1-sol'), 'Includes assistant header with author and model')
  assert.ok(md.includes('const memoized = useMemo'), 'Includes code block')
})

test('extractSessionPrompts extracts only user prompt texts in order', () => {
  const messages: Message[] = [
    {
      info: { id: 'm1', sessionID: 's1', role: 'user', time: { created: 1 } },
      parts: [{ id: 'p1', sessionID: 's1', messageID: 'm1', type: 'text', text: 'Prompt 1' }],
    },
    {
      info: { id: 'm2', sessionID: 's1', role: 'assistant', time: { created: 2 } },
      parts: [{ id: 'p2', sessionID: 's1', messageID: 'm2', type: 'text', text: 'Answer 1' }],
    },
    {
      info: { id: 'm3', sessionID: 's1', role: 'user', time: { created: 3 } },
      parts: [{ id: 'p3', sessionID: 's1', messageID: 'm3', type: 'text', text: 'Prompt 2' }],
    },
  ]

  const prompts = extractSessionPrompts(messages)
  assert.deepEqual(prompts, ['Prompt 1', 'Prompt 2'])
})
