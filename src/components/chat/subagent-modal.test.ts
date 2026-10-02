import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Message, TextPart, ReasoningPart, ToolPart } from '../../types/opencode'
import { parseSubagentMessages, formatSubagentTranscript } from './SubagentSessionModal'

describe('SubagentSessionModal message parser and transcript formatter', () => {
  it('handles empty message list gracefully', () => {
    const steps = parseSubagentMessages([])
    assert.deepEqual(steps, [])
  })

  it('partitions full subagent lifecycle into structured steps', () => {
    const mockMessages: Message[] = [
      {
        info: {
          id: 'msg_0',
          sessionID: 'ses_sub123',
          role: 'user',
          time: { created: 1000 },
        },
        parts: [
          {
            id: 'p0',
            sessionID: 'ses_sub123',
            messageID: 'msg_0',
            type: 'text',
            text: 'Read-only survey. List top-level files in /mnt/desktop.',
          } as TextPart,
        ],
      },
      {
        info: {
          id: 'msg_1',
          sessionID: 'ses_sub123',
          role: 'assistant',
          time: { created: 1010 },
        },
        parts: [
          {
            id: 'p1_reason',
            sessionID: 'ses_sub123',
            messageID: 'msg_1',
            type: 'reasoning',
            text: 'The user requested a read-only survey of /mnt/desktop. I will use the read tool.',
            time: { start: 1010000, end: 1012500 },
          } as ReasoningPart,
          {
            id: 'p1_tool',
            sessionID: 'ses_sub123',
            messageID: 'msg_1',
            type: 'tool',
            tool: 'read',
            state: {
              status: 'completed',
              input: { path: '/mnt/desktop' },
              output: 'desktop.ini\nGodots.exe\nmsedge.png',
              time: { start: 1012500, end: 1013100 },
            },
          } as ToolPart,
          {
            id: 'p1_text',
            sessionID: 'ses_sub123',
            messageID: 'msg_1',
            type: 'text',
            text: 'Found 3 files in desktop directory:\n1. desktop.ini\n2. Godots.exe\n3. msedge.png',
          } as TextPart,
        ],
      },
    ]

    const steps = parseSubagentMessages(mockMessages)
    assert.equal(steps.length, 4)

    // Step 1: Prompt
    assert.equal(steps[0].type, 'prompt')
    assert.equal(steps[0].role, 'user')
    assert.match(steps[0].title, /子代理任务提示词/)
    assert.match(steps[0].content || '', /Read-only survey/)

    // Step 2: Thought
    assert.equal(steps[1].type, 'thought')
    assert.equal(steps[1].role, 'assistant')
    assert.match(steps[1].title, /思考推演/)
    assert.equal(steps[1].duration, '2.5s')
    assert.match(steps[1].content || '', /read-only survey/)

    // Step 3: Tool
    assert.equal(steps[2].type, 'tool')
    assert.equal(steps[2].role, 'assistant')
    assert.equal(steps[2].title, '工具执行: read')
    assert.equal(steps[2].status, 'completed')
    assert.equal(steps[2].toolData?.tool, 'read')
    assert.deepEqual(steps[2].toolData?.input, { path: '/mnt/desktop' })
    assert.match(steps[2].toolData?.output || '', /desktop\.ini/)

    // Step 4: Final response
    assert.equal(steps[3].type, 'response')
    assert.equal(steps[3].role, 'assistant')
    assert.match(steps[3].title, /子代理回传回复/)
    assert.match(steps[3].content || '', /Found 3 files/)
  })

  it('formats clean Markdown transcript for clipboard export', () => {
    const mockMessages: Message[] = [
      {
        info: {
          id: 'msg_0',
          sessionID: 'ses_test',
          role: 'user',
          time: { created: 1000 },
        },
        parts: [
          {
            id: 'p0',
            sessionID: 'ses_test',
            messageID: 'msg_0',
            type: 'text',
            text: 'Search for README.md',
          } as TextPart,
        ],
      },
      {
        info: {
          id: 'msg_1',
          sessionID: 'ses_test',
          role: 'assistant',
          time: { created: 1010 },
        },
        parts: [
          {
            id: 'p1_tool',
            sessionID: 'ses_test',
            messageID: 'msg_1',
            type: 'tool',
            tool: 'glob',
            state: {
              status: 'completed',
              input: { pattern: '**/README.md' },
              output: 'README.md',
            },
          } as ToolPart,
          {
            id: 'p1_text',
            sessionID: 'ses_test',
            messageID: 'msg_1',
            type: 'text',
            text: 'Found README.md in root directory.',
          } as TextPart,
        ],
      },
    ]

    const steps = parseSubagentMessages(mockMessages)
    const transcript = formatSubagentTranscript(steps, {
      sessionId: 'ses_test',
      subagentType: 'explore',
      modelLabel: 'grok-4.7 (obsidian)',
      taskDescription: 'Search for README',
    })

    assert.match(transcript, /# Subagent Execution Transcript/)
    assert.match(transcript, /Session ID:\*\* `ses_test`/)
    assert.match(transcript, /Subagent Type:\*\* `explore`/)
    assert.match(transcript, /Model:\*\* `grok-4.7 \(obsidian\)`/)
    assert.match(transcript, /Total Steps:\*\* 3/)
    assert.match(transcript, /### Step 1: 子代理任务提示词/)
    assert.match(transcript, /Search for README\.md/)
    assert.match(transcript, /### Step 2: 工具执行: glob/)
    assert.match(transcript, /"pattern": "\*\*\/README\.md"/)
    assert.match(transcript, /### Step 3: 子代理回传回复/)
    assert.match(transcript, /Found README\.md in root directory\./)
  })
})
