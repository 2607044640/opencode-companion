import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { MessagePart, MessageInfo } from '../types/opencode'
import {
  classifyTool,
  formatWorkedLabel,
  countDiffLines,
  normalizePath,
  partitionAssistantTurn,
} from './worked-summary'

describe('WorkedSummary Unit Tests (Prometheus T0 Specification)', () => {
  test('classifyTool categorizes tools accurately', () => {
    assert.equal(classifyTool('read'), 'explore')
    assert.equal(classifyTool('view_file'), 'explore')
    assert.equal(classifyTool('grep'), 'explore')
    assert.equal(classifyTool('glob'), 'explore')
    assert.equal(classifyTool('edit'), 'edit')
    assert.equal(classifyTool('write'), 'edit')
    assert.equal(classifyTool('replace_file_content'), 'edit')
    assert.equal(classifyTool('bash'), 'command')
    assert.equal(classifyTool('shell'), 'command')
    assert.equal(classifyTool('unknown_custom_tool'), 'other')
  })

  test('formatWorkedLabel formats seconds, minutes and live state', () => {
    assert.equal(formatWorkedLabel(32000, false), 'Worked for 32s')
    assert.equal(formatWorkedLabel(240000, false), 'Worked for 4m')
    assert.equal(formatWorkedLabel(134000, false), 'Worked for 2m 14s')
    assert.equal(formatWorkedLabel(12000, true), 'Working for 12s')
    assert.equal(formatWorkedLabel(180000, true), 'Working for 3m')
  })

  test('countDiffLines parses additions and deletions ignoring headers', () => {
    const unified = [
      '--- a/src/index.ts',
      '+++ b/src/index.ts',
      '@@ -1,5 +1,6 @@',
      ' context line',
      '-deleted line 1',
      '-deleted line 2',
      '+added line 1',
      '+added line 2',
      '+added line 3',
      ' context line',
    ].join('\n')

    const counts = countDiffLines(unified)
    assert.equal(counts.additions, 3)
    assert.equal(counts.deletions, 2)
  })

  test('normalizePath extracts filename and parent directory', () => {
    const res = normalizePath('src/components/chat/MessageBubble.tsx')
    assert.equal(res.fileName, 'MessageBubble.tsx')
    assert.equal(res.relativeDir, 'components/chat')
    assert.equal(res.filePath, 'src/components/chat/MessageBubble.tsx')
  })

  test('(a) text-only assistant turn results in hasWork=false', () => {
    const parts: MessagePart[] = [
      {
        id: 'p1',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'text',
        text: 'Hello world! I am here to help.',
      },
    ]

    const turn = partitionAssistantTurn(parts)
    assert.equal(turn.hasWork, false)
    assert.equal(turn.groups.length, 0)
    assert.equal(turn.answerParts.length, 1)
    assert.equal(turn.answerParts[0].text, 'Hello world! I am here to help.')
  })

  test('(b) reasoning + 3 reads + 1 edit + 1 bash + final text creates correct groups', () => {
    const parts: MessagePart[] = [
      {
        id: 'r1',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'reasoning',
        text: 'Thinking about the architecture...',
        time: { start: 1000, end: 3000 },
      },
      {
        id: 't_read1',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'tool',
        tool: 'read',
        state: { status: 'completed', input: { path: 'src/App.tsx' } },
      },
      {
        id: 't_read2',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'tool',
        tool: 'read',
        state: { status: 'completed', input: { path: 'src/index.css' } },
      },
      {
        id: 't_read3',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'tool',
        tool: 'grep',
        state: { status: 'completed', input: { query: 'diff' } },
      },
      {
        id: 't_edit',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'tool',
        tool: 'edit',
        state: {
          status: 'completed',
          input: {
            path: 'src/App.tsx',
            additions: 15,
            deletions: 3,
            diff: '@@ -1,3 +1,4 @@\n-old\n+new1\n+new2',
          },
        },
      },
      {
        id: 't_bash',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'tool',
        tool: 'bash',
        state: { status: 'completed', input: { command: 'pnpm test' } },
      },
      {
        id: 'txt_final',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'text',
        text: 'Everything has been implemented and tested successfully.',
      },
    ]

    const info: MessageInfo = {
      id: 'msg_1',
      sessionID: 'ses_1',
      role: 'assistant',
      time: { created: 1000, completed: 33000 },
    }

    const turn = partitionAssistantTurn(parts, info)
    assert.equal(turn.hasWork, true)
    assert.equal(turn.durationMs, 32000)
    assert.equal(turn.isLive, false)
    assert.equal(turn.answerParts.length, 1)
    assert.equal(turn.answerParts[0].text, 'Everything has been implemented and tested successfully.')

    // Expected groups: [thought, explore, edit, command]
    assert.equal(turn.groups.length, 4)
    assert.equal(turn.groups[0].kind, 'thought')
    assert.equal(turn.groups[1].kind, 'explore')
    assert.equal(turn.groups[2].kind, 'edit')
    assert.equal(turn.groups[3].kind, 'command')

    // Explore group merged the 3 reads/greps
    if (turn.groups[1].kind === 'explore') {
      assert.equal(turn.groups[1].items.length, 3)
    }

    // Edit group has line counts
    if (turn.groups[2].kind === 'edit') {
      assert.equal(turn.groups[2].item.fileName, 'App.tsx')
      assert.equal(turn.groups[2].item.additions, 2)
      assert.equal(turn.groups[2].item.deletions, 1)
    }
  })

  test('(c) consecutive reads merge, but reads after an edit start a new explore group', () => {
    const parts: MessagePart[] = [
      {
        id: 'r1',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'tool',
        tool: 'read',
        state: { status: 'completed', input: { path: 'a.ts' } },
      },
      {
        id: 'e1',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'tool',
        tool: 'edit',
        state: { status: 'completed', input: { path: 'a.ts' } },
      },
      {
        id: 'r2',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'tool',
        tool: 'read',
        state: { status: 'completed', input: { path: 'b.ts' } },
      },
    ]

    const turn = partitionAssistantTurn(parts)
    assert.equal(turn.groups.length, 3)
    assert.equal(turn.groups[0].kind, 'explore')
    assert.equal(turn.groups[1].kind, 'edit')
    assert.equal(turn.groups[2].kind, 'explore')
  })

  test('(d) <think> inside text becomes thought group + remaining answer', () => {
    const parts: MessagePart[] = [
      {
        id: 'txt_think',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'text',
        text: '<think>\nHere is my internal reasoning\n</think>\nHere is the real answer.',
      },
    ]

    const turn = partitionAssistantTurn(parts)
    assert.equal(turn.hasWork, true)
    assert.equal(turn.groups.length, 1)
    assert.equal(turn.groups[0].kind, 'thought')
    if (turn.groups[0].kind === 'thought') {
      assert.equal(turn.groups[0].items[0].text, 'Here is my internal reasoning')
    }
    assert.equal(turn.answerParts.length, 1)
    assert.equal(turn.answerParts[0].text, 'Here is the real answer.')
  })
})
