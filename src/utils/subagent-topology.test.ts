import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveSubagentRole,
  formatTopologyDuration,
  extractSubagentTopology,
} from './subagent-topology'
import type { Message, Session } from '../types/opencode'

test('resolveSubagentRole maps raw agent types to display titles and roles', () => {
  assert.deepEqual(resolveSubagentRole('planner'), {
    name: 'Planner',
    role: 'Strategic Planning',
    roleZh: '架构规划',
  })
  assert.deepEqual(resolveSubagentRole('explore'), {
    name: 'Researcher',
    role: 'Codebase Research',
    roleZh: '深度调研',
  })
  assert.deepEqual(resolveSubagentRole('deepcode'), {
    name: 'Coder',
    role: 'Implementation',
    roleZh: '代码编写',
  })
  assert.deepEqual(resolveSubagentRole('tester'), {
    name: 'Tester',
    role: 'Testing & Verification',
    roleZh: '测试验证',
  })
  assert.deepEqual(resolveSubagentRole('reviewer'), {
    name: 'Reviewer',
    role: 'Code Review',
    roleZh: '代码审查',
  })
})

test('formatTopologyDuration formats durations nicely', () => {
  assert.equal(formatTopologyDuration(500), '0.5s')
  assert.equal(formatTopologyDuration(12500), '12.5s')
  assert.equal(formatTopologyDuration(65000), '1m 5s')
  assert.equal(formatTopologyDuration(undefined), '0s')
})

test('extractSubagentTopology extracts subagent nodes and communications cleanly', () => {
  const activeSession: Session = {
    id: 'ses_main',
    slug: 'main',
    projectID: 'p1',
    directory: '/projects/APISpace',
    title: 'Multi-agent Refactoring Session',
    agent: 'Sisyphus',
    model: { id: 'obsidian/gpt-6.1-sol', providerID: 'obsidian', modelID: 'gpt-6.1-sol' },
    tokens: { input: 1000, output: 500, reasoning: 100, cache: { read: 0, write: 0 } },
    cost: 0,
    time: { created: 1000, updated: 2000 },
  }

  const messages: Message[] = [
    {
      info: {
        id: 'msg_1',
        sessionID: 'ses_main',
        role: 'assistant',
        time: { created: 1000 },
      },
      parts: [
        {
          id: 'part_tool_planner',
          sessionID: 'ses_main',
          messageID: 'msg_1',
          type: 'tool',
          tool: 'task',
          state: {
            status: 'completed',
            input: {
              subagent_type: 'planner',
              description: 'Analyze component hierarchy',
              prompt: 'Plan the architecture for subagents inspector',
            },
            output: '<task id="ses_sub_1"><task_result>Architecture plan approved.</task_result></task>',
            time: { start: 1000, end: 15000 },
          },
        },
        {
          id: 'part_tool_coder',
          sessionID: 'ses_main',
          messageID: 'msg_1',
          type: 'tool',
          tool: 'task',
          state: {
            status: 'running',
            input: {
              subagent_type: 'deepcode',
              description: 'Implement topology tree drawer',
              prompt: 'Write SubagentTopologyInspector.tsx',
            },
            time: { start: 16000 },
          },
        },
      ],
    },
  ]

  const data = extractSubagentTopology(messages, activeSession, [], 20000)

  // Verify Counts
  assert.equal(data.totalCount, 2)
  assert.equal(data.completedCount, 1)
  assert.equal(data.runningCount, 1)
  assert.equal(data.errorCount, 0)

  // Verify Root
  assert.equal(data.rootNode.id, 'ses_main')
  assert.equal(data.rootNode.name, 'Sisyphus')
  assert.equal(data.rootNode.status, 'running') // running because one child is running
  assert.equal(data.rootNode.children.length, 2)

  // Verify Planner node
  const planner = data.rootNode.children[0]
  assert.equal(planner.name, 'Planner')
  assert.equal(planner.status, 'completed')
  assert.equal(planner.cleanResult, 'Architecture plan approved.')
  assert.equal(planner.durationMs, 14000)
  assert.equal(planner.sessionId, 'ses_sub_1')

  // Verify Coder node
  const coder = data.rootNode.children[1]
  assert.equal(coder.name, 'Coder')
  assert.equal(coder.status, 'running')
  assert.equal(coder.durationMs, 4000) // 20000 - 16000

  // Verify Communications:
  // Planner dispatch + Planner report + Coder dispatch = 3
  assert.equal(data.communications.length, 3)
  assert.equal(data.communications[0].direction, 'dispatch')
  assert.equal(data.communications[0].targetName, 'Planner')
  assert.equal(data.communications[1].direction, 'report')
  assert.equal(data.communications[1].sourceName, 'Planner')
  assert.equal(data.communications[2].direction, 'dispatch')
  assert.equal(data.communications[2].targetName, 'Coder')
})

test('extractSubagentTopology supports standalone child sessions via parentID', () => {
  const activeSession: Session = {
    id: 'ses_parent',
    slug: 'parent',
    projectID: 'p1',
    directory: '/projects/APISpace',
    title: 'Parent Session',
    agent: 'Atlas',
    model: { id: 'obsidian/gpt-6.1-sol', providerID: 'obsidian', modelID: 'gpt-6.1-sol' },
    tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } },
    cost: 0,
    time: { created: 100, updated: 200 },
  }

  const childSession: Session = {
    id: 'ses_child_async',
    parentID: 'ses_parent',
    slug: 'child',
    projectID: 'p1',
    directory: '/projects/APISpace',
    title: 'Background Verification Subagent',
    agent: 'tester',
    model: { id: 'obsidian/gpt-6.1-sol', providerID: 'obsidian', modelID: 'gpt-6.1-sol' },
    tokens: { input: 200, output: 100, reasoning: 0, cache: { read: 0, write: 0 } },
    cost: 0,
    time: { created: 150, updated: 350 },
    summary: { additions: 10, deletions: 2, files: 1 },
  }

  const data = extractSubagentTopology([], activeSession, [childSession], 500)
  assert.equal(data.totalCount, 1)
  assert.equal(data.completedCount, 1)
  assert.equal(data.rootNode.children[0].name, 'Background Verification Subagent')
  assert.equal(data.rootNode.children[0].subagentType, 'tester')
  assert.equal(data.rootNode.children[0].durationMs, 200)
})
