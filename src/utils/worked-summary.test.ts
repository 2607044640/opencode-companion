import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { MessagePart, MessageInfo } from '../types/opencode'
import {
  classifyTool,
  formatWorkedLabel,
  countDiffLines,
  normalizePath,
  partitionAssistantTurn,
  classifyExploreIssue,
  extractEditItem,
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
    assert.equal(classifyTool('multi_replace_file_content'), 'edit')
    assert.equal(classifyTool('create_file'), 'edit')
    assert.equal(classifyTool('edit_file'), 'edit')
    assert.equal(classifyTool('bash'), 'command')
    assert.equal(classifyTool('shell'), 'command')
    assert.equal(classifyTool('unknown_custom_tool'), 'other')
  })

  test('extractEditItem parses metadata.filediff correctly', () => {
    const part = {
      id: 'p_edit_1',
      sessionID: 'ses_1',
      messageID: 'msg_1',
      type: 'tool' as const,
      tool: 'edit',
      state: {
        status: 'completed' as const,
        input: {
          path: '/home/developer/AGENTS.md',
        },
        metadata: {
          filediff: {
            file: '/home/developer/AGENTS.md',
            patch: '--- a/AGENTS.md\n+++ b/AGENTS.md\n@@ -1,3 +1,4 @@\n-line1\n+line1_mod\n+line2_new',
            additions: 2,
            deletions: 1,
          },
        },
      },
    }
    const item = extractEditItem(part)
    assert.equal(item.filePath, '/home/developer/AGENTS.md')
    assert.equal(item.fileName, 'AGENTS.md')
    assert.equal(item.additions, 2)
    assert.equal(item.deletions, 1)
    assert.equal(item.source, 'metadata')
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

  test('(e) intermediate text before/between tools becomes thought, only post-tool text is answer', () => {
    const parts: MessagePart[] = [
      {
        id: 't_read',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'tool',
        tool: 'read',
        state: { status: 'completed', input: { path: 'src/config.ts' } },
      },
      {
        id: 'txt_mid',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'text',
        text: 'Docs must match live APIs, not the old README. Reading the six module surfaces next.',
      },
      {
        id: 't_bash',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'tool',
        tool: 'bash',
        state: { status: 'completed', input: { command: 'npm test' } },
      },
      {
        id: 'txt_final',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'text',
        text: 'Final executive report: All 282 tests passed.',
      },
    ]

    const turn = partitionAssistantTurn(parts)
    assert.equal(turn.hasWork, true)
    // Groups: [explore, thought, command]
    assert.equal(turn.groups.length, 3)
    assert.equal(turn.groups[0].kind, 'explore')
    assert.equal(turn.groups[1].kind, 'thought')
    if (turn.groups[1].kind === 'thought') {
      assert.equal(
        turn.groups[1].items[0].text,
        'Docs must match live APIs, not the old README. Reading the six module surfaces next.'
      )
    }
    assert.equal(turn.groups[2].kind, 'command')

    // Only txt_final is in answerParts! txt_mid was properly placed in thought!
    assert.equal(turn.answerParts.length, 1)
    assert.equal(turn.answerParts[0].text, 'Final executive report: All 282 tests passed.')
  })

  test('(f) thoughts are chronologically interleaved between commands and tools', () => {
    const parts: MessagePart[] = [
      {
        id: 'c1',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'tool',
        tool: 'bash',
        state: { status: 'completed', input: { command: 'git status' } },
      },
      {
        id: 'r1',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'reasoning',
        text: 'Analyzing git status output...',
        time: { start: 1000, end: 3000 },
      },
      {
        id: 'c2',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'tool',
        tool: 'bash',
        state: { status: 'completed', input: { command: 'npm run build' } },
      },
    ]

    const turn = partitionAssistantTurn(parts)
    assert.equal(turn.groups.length, 3)
    assert.equal(turn.groups[0].kind, 'command')
    assert.equal(turn.groups[1].kind, 'thought')
    assert.equal(turn.groups[2].kind, 'command')
  })

  test('(g) trailing text is kept in thought stream when any tool is running or pending', () => {
    const parts: MessagePart[] = [
      {
        id: 't1',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'tool',
        tool: 'bash',
        state: { status: 'running', input: { command: 'cargo build' } },
      },
      {
        id: 'txt1',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'text',
        text: 'Waiting for build to complete before testing...',
      },
    ]

    const turn = partitionAssistantTurn(parts)
    // Even though txt1 is after t1, t1 is 'running', so txt1 is classified as thought, NOT final answer!
    assert.equal(turn.hasWork, true)
    assert.equal(turn.answerParts.length, 0)
    assert.equal(turn.groups.length, 2)
    assert.equal(turn.groups[0].kind, 'command')
    assert.equal(turn.groups[1].kind, 'thought')
    if (turn.groups[1].kind === 'thought') {
      assert.equal(turn.groups[1].items[0].text, 'Waiting for build to complete before testing...')
    }
  })

  test('(h) aborted turns with finish=abort are NOT marked isLive and duration uses part timestamps', () => {
    const created = 1000000
    const parts: MessagePart[] = [
      {
        id: 't1',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'tool',
        tool: 'bash',
        state: {
          status: 'error',
          input: { command: 'npm test' },
          error: 'Tool execution aborted',
          time: { start: 1000500, end: 1007000 }, // 7s after created
        },
      },
    ]

    const info: MessageInfo = {
      id: 'msg_1',
      sessionID: 'ses_1',
      role: 'assistant',
      time: { created }, // completed is missing!
      finish: 'abort',
      error: { name: 'MessageAbortedError', message: 'Aborted' },
    }

    const now = created + 1000 * 60 * 97 // 97 minutes later!
    const turn = partitionAssistantTurn(parts, info, now)

    assert.equal(turn.isLive, false) // MUST NOT be live!
    assert.equal(turn.isAborted, true)
    // Duration must be 7s (from part timestamps), NOT 97 minutes!
    assert.equal(turn.durationMs, 7000)
    assert.equal(formatWorkedLabel(turn.durationMs, turn.isLive, turn.finish, turn.isAborted), 'Worked for 7s (Aborted)')
  })

  test('(i) orphaned turn in idle session is NOT marked isLive even if completed is missing', () => {
    const created = 1000000
    const parts: MessagePart[] = [
      {
        id: 'r1',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'reasoning',
        text: 'Thinking...',
        time: { start: 1000000, end: 1005000 },
      },
    ]

    const info: MessageInfo = {
      id: 'msg_1',
      sessionID: 'ses_1',
      role: 'assistant',
      time: { created }, // completed is missing, no finish
    }

    const now = created + 1000 * 60 * 60 // 1 hour later
    // isSessionBusy = false (session is idle)
    const turn = partitionAssistantTurn(parts, info, now, false)

    assert.equal(turn.isLive, false) // MUST NOT be live in an idle session!
    assert.equal(turn.durationMs, 5000) // 5s from reasoning part
  })

  test('(j) actively generating turn with isSessionBusy=true IS marked isLive', () => {
    const created = 1000000
    const parts: MessagePart[] = [
      {
        id: 't1',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'tool',
        tool: 'bash',
        state: { status: 'running', input: { command: 'cargo test' } },
      },
    ]

    const info: MessageInfo = {
      id: 'msg_1',
      sessionID: 'ses_1',
      role: 'assistant',
      time: { created },
    }

    const now = created + 12000
    const turn = partitionAssistantTurn(parts, info, now, true)

    assert.equal(turn.isLive, true)
    assert.equal(turn.durationMs, 12000)
    assert.equal(formatWorkedLabel(turn.durationMs, turn.isLive), 'Working for 12s')
  })

  test('(k) brand-new turn with empty parts in a busy session is marked isLive (Fixes Figure 2 bug)', () => {
    const created = 2000000
    const parts: MessagePart[] = []
    const info: MessageInfo = {
      id: 'msg_new',
      sessionID: 'ses_1',
      role: 'assistant',
      time: { created },
    }
    const now = created + 1500
    const turn = partitionAssistantTurn(parts, info, now, true)

    assert.equal(turn.isLive, true)
    assert.equal(turn.hasWork, false)
    assert.equal(turn.durationMs, 1500)
  })

  test('(l) turn with empty parts in an idle session with completion timestamp is NOT live', () => {
    const created = 2000000
    const completed = 2005000
    const parts: MessagePart[] = []
    const info: MessageInfo = {
      id: 'msg_aborted',
      sessionID: 'ses_1',
      role: 'assistant',
      time: { created, completed },
      finish: 'abort',
    }
    const now = completed + 1000
    const turn = partitionAssistantTurn(parts, info, now, false)

    assert.equal(turn.isLive, false)
    assert.equal(turn.hasWork, false)
    assert.equal(turn.durationMs, 0)
  })

  test('(m) turn with empty parts in an idle session without completion timestamp is NOT live', () => {
    const created = 2000000
    const parts: MessagePart[] = []
    const info: MessageInfo = {
      id: 'msg_crashed_before_token',
      sessionID: 'ses_crashed',
      role: 'assistant',
      time: { created },
    }
    const now = created + 5000
    const turn = partitionAssistantTurn(parts, info, now, false)

    assert.equal(turn.isLive, false)
    assert.equal(turn.hasWork, false)
    assert.equal(turn.durationMs, 0)
  })

  test('(o) reasoning part with open end in idle session IS live and reports thinking phase', () => {
    const created = 1000000
    const parts: MessagePart[] = [
      {
        id: 'r1',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'reasoning',
        text: 'Thinking deeply...',
        time: { start: 1000000 }, // No end!
      },
    ]
    const info: MessageInfo = {
      id: 'msg_1',
      sessionID: 'ses_1',
      role: 'assistant',
      time: { created }, // completed is missing
    }
    const now = created + 30000
    const turn = partitionAssistantTurn(parts, info, now, false)

    assert.equal(turn.isLive, true)
    assert.equal(turn.durationMs, 30000)
    assert.equal(
      formatWorkedLabel(turn.durationMs, turn.isLive, turn.finish, turn.isAborted, 'thinking'),
      'Thinking for 30s'
    )
  })

  test('(p) reasoning part with completed end in idle session is NOT live and calculates elapsed duration', () => {
    const created = 1000000
    const parts: MessagePart[] = [
      {
        id: 'r1',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'reasoning',
        text: 'Finished thinking',
        time: { start: 1000000, end: 1004000 },
      },
    ]
    const info: MessageInfo = {
      id: 'msg_1',
      sessionID: 'ses_1',
      role: 'assistant',
      time: { created },
    }
    const now = created + 30000
    const turn = partitionAssistantTurn(parts, info, now, false)

    assert.equal(turn.isLive, false)
    assert.equal(turn.durationMs, 4000)
    assert.equal(formatWorkedLabel(turn.durationMs, turn.isLive, turn.finish, turn.isAborted), 'Worked for 4s')
  })

  test('(q) reasoning part without end but message has time.completed is NOT live', () => {
    const created = 1000000
    const completed = 1005000
    const parts: MessagePart[] = [
      {
        id: 'r1',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'reasoning',
        text: 'Thought',
        time: { start: 1000000 },
      },
    ]
    const info: MessageInfo = {
      id: 'msg_1',
      sessionID: 'ses_1',
      role: 'assistant',
      time: { created, completed },
    }
    const now = created + 30000
    const turn = partitionAssistantTurn(parts, info, now, false)

    assert.equal(turn.isLive, false)
    assert.equal(turn.durationMs, 5000)
    assert.equal(formatWorkedLabel(turn.durationMs, turn.isLive, turn.finish, turn.isAborted), 'Worked for 5s')
  })

  test('(r) reasoning part without end but message is aborted is NOT live and does not stretch duration', () => {
    const created = 1000000
    const parts: MessagePart[] = [
      {
        id: 'r1',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'reasoning',
        text: 'Thinking when aborted',
        time: { start: 1000000 },
      },
    ]
    const info: MessageInfo = {
      id: 'msg_1',
      sessionID: 'ses_1',
      role: 'assistant',
      time: { created },
      finish: 'abort',
      error: { name: 'MessageAbortedError', message: 'Aborted' },
    }
    const now = created + 1000 * 60 * 60 // 1 hour later
    const turn = partitionAssistantTurn(parts, info, now, false)

    assert.equal(turn.isLive, false)
    assert.equal(turn.isAborted, true)
    assert.ok(turn.durationMs < 60000)
  })

  test('(n) classifyExploreIssue correctly detects missing files, search misses, and blocked actions', () => {
    // 1. Missing file
    const res1 = classifyExploreIssue({
      tool: 'read',
      kind: 'file',
      status: 'error',
      error: "ENOENT: no such file or directory, open 'opencode_ctl.py'",
    })
    assert.equal(res1.warningKind, 'not_found')
    assert.equal(res1.warningTooltip, 'File not found')

    // 2. Search miss (0 matches)
    const res2 = classifyExploreIssue({
      tool: 'glob',
      kind: 'search',
      status: 'error',
      output: 'No files found matching pattern',
    })
    assert.equal(res2.warningKind, 'no_match')
    assert.equal(res2.warningTooltip, 'No matches found')

    // 3. Blocked / permission denied
    const res3 = classifyExploreIssue({
      tool: 'read',
      kind: 'file',
      status: 'error',
      error: 'Action Blocked: [Hook J: IDE Tool Interceptor] Banned python script',
    })
    assert.equal(res3.warningKind, 'blocked')
    assert.equal(res3.warningTooltip, 'Action blocked or permission denied')

    // 4. Completed with no issues
    const res4 = classifyExploreIssue({
      tool: 'read',
      kind: 'file',
      status: 'completed',
      output: 'content here',
    })
    assert.equal(res4.warningKind, undefined)
  })

  test('(o) turn with only exploration misses has hasWarnings=true but hasRealError=false', () => {
    const parts: MessagePart[] = [
      {
        id: 't_read_miss',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'tool',
        tool: 'read',
        state: {
          status: 'error',
          error: "ENOENT: no such file or directory, open 'missing.ts'",
          input: { path: 'missing.ts' },
        },
      },
      {
        id: 't_glob_miss',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'tool',
        tool: 'glob',
        state: {
          status: 'error',
          output: 'No files found',
          input: { pattern: '**/*.xyz' },
        },
      },
      {
        id: 't_edit_ok',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'tool',
        tool: 'write',
        state: {
          status: 'completed',
          input: { path: 'src/index.ts', content: 'console.log("hello")' },
        },
      },
    ]

    const turn = partitionAssistantTurn(parts)
    assert.equal(turn.hasWork, true)
    assert.equal(turn.hasWarnings, true)
    assert.equal(turn.hasRealError, false)
    assert.equal(turn.hasError, false) // Legacy hasError should follow hasRealError

    const exploreGroup = turn.groups.find((g) => g.kind === 'explore')
    assert.ok(exploreGroup && exploreGroup.kind === 'explore')
    assert.equal(exploreGroup.items.length, 2)
    assert.equal(exploreGroup.items[0].warningKind, 'not_found')
    assert.equal(exploreGroup.items[0].warningTooltip, 'File not found')
    assert.equal(exploreGroup.items[1].warningKind, 'no_match')
    assert.equal(exploreGroup.items[1].warningTooltip, 'No matches found')
  })

  test('(p) turn with failed command has hasRealError=true and hasError=true', () => {
    const parts: MessagePart[] = [
      {
        id: 't_cmd_fail',
        sessionID: 'ses_1',
        messageID: 'msg_1',
        type: 'tool',
        tool: 'bash',
        state: {
          status: 'error',
          error: 'Process exited with code 1',
          input: { command: 'npm test' },
        },
      },
    ]

    const turn = partitionAssistantTurn(parts)
    assert.equal(turn.hasWork, true)
    assert.equal(turn.hasRealError, true)
    assert.equal(turn.hasError, true)

    const cmdGroup = turn.groups.find((g) => g.kind === 'command')
    assert.ok(cmdGroup && cmdGroup.kind === 'command')
    assert.equal(cmdGroup.items[0].status, 'error')
  })
})
