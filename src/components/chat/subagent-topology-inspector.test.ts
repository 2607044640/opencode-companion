import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractSubagentTopology,
  resolveSubagentRole,
  formatTopologyDuration,
} from '../../utils/subagent-topology'
import type { Message, Session } from '../../types/opencode'

test('SubagentTopologyInspector data flows and communication lifecycle', () => {
  const activeSession: Session = {
    id: 'ses_root',
    slug: 'root',
    projectID: 'p1',
    directory: '/projects/APISpace',
    title: 'Distributed Subagent Execution',
    agent: 'Sisyphus',
    model: { id: 'obsidian/gpt-6.1-sol', providerID: 'obsidian', modelID: 'gpt-6.1-sol' },
    tokens: { input: 1500, output: 800, reasoning: 200, cache: { read: 0, write: 0 } },
    cost: 0,
    time: { created: 10000, updated: 25000 },
  }

  const messages: Message[] = [
    {
      info: {
        id: 'msg_root_1',
        sessionID: 'ses_root',
        role: 'assistant',
        time: { created: 10000 },
      },
      parts: [
        {
          id: 'p_planner',
          sessionID: 'ses_root',
          messageID: 'msg_root_1',
          type: 'tool',
          tool: 'task',
          state: {
            status: 'completed',
            input: {
              subagent_type: 'planner',
              description: 'Formulate decomposition plan',
              prompt: 'Break task down into researcher and coder workflows',
            },
            output: '<task id="sub_plan_1"><task_result>Decomposition plan complete</task_result></task>',
            time: { start: 10000, end: 18000 },
          },
        },
        {
          id: 'p_researcher',
          sessionID: 'ses_root',
          messageID: 'msg_root_1',
          type: 'tool',
          tool: 'task',
          state: {
            status: 'completed',
            input: {
              subagent_type: 'explore',
              description: 'Survey prior art',
              prompt: 'Search existing topology implementations',
            },
            output: '<task_result>Found Antigravity topology tree pattern</task_result>',
            time: { start: 18500, end: 24000 },
          },
        },
        {
          id: 'p_coder',
          sessionID: 'ses_root',
          messageID: 'msg_root_1',
          type: 'tool',
          tool: 'task',
          state: {
            status: 'running',
            input: {
              subagent_type: 'deepcode',
              description: 'Build SubagentTopologyInspector component',
              prompt: 'Render tree view and dispatch communication packet stream',
            },
            time: { start: 24500 },
          },
        },
      ],
    },
  ]

  const topology = extractSubagentTopology(messages, activeSession, [], 30000)

  // 1. Verify Topology Tree hierarchy
  assert.equal(topology.totalCount, 3)
  assert.equal(topology.runningCount, 1)
  assert.equal(topology.completedCount, 2)
  assert.equal(topology.errorCount, 0)

  assert.equal(topology.rootNode.name, 'Sisyphus')
  assert.equal(topology.rootNode.status, 'running')
  assert.equal(topology.rootNode.children.length, 3)

  const [plannerNode, researcherNode, coderNode] = topology.rootNode.children
  assert.equal(plannerNode.name, 'Planner')
  assert.equal(plannerNode.status, 'completed')
  assert.equal(plannerNode.cleanResult, 'Decomposition plan complete')
  assert.equal(formatTopologyDuration(plannerNode.durationMs), '8.0s')

  assert.equal(researcherNode.name, 'Researcher')
  assert.equal(researcherNode.status, 'completed')
  assert.equal(researcherNode.cleanResult, 'Found Antigravity topology tree pattern')
  assert.equal(formatTopologyDuration(researcherNode.durationMs), '5.5s')

  assert.equal(coderNode.name, 'Coder')
  assert.equal(coderNode.status, 'running')
  assert.equal(formatTopologyDuration(coderNode.durationMs), '5.5s') // 30000 - 24500

  // 2. Verify Communications Stream
  // Planner: 2 packets (dispatch + report)
  // Researcher: 2 packets (dispatch + report)
  // Coder: 1 packet (dispatch only, since running without result)
  assert.equal(topology.communications.length, 5)

  // First packet: Master -> Planner dispatch
  assert.equal(topology.communications[0].direction, 'dispatch')
  assert.equal(topology.communications[0].sourceName, 'Sisyphus')
  assert.equal(topology.communications[0].targetName, 'Planner')

  // Second packet: Planner -> Master report
  assert.equal(topology.communications[1].direction, 'report')
  assert.equal(topology.communications[1].sourceName, 'Planner')
  assert.equal(topology.communications[1].targetName, 'Sisyphus')

  // Last packet: Master -> Coder dispatch
  const lastPacket = topology.communications[4]
  assert.equal(lastPacket.direction, 'dispatch')
  assert.equal(lastPacket.targetName, 'Coder')
  assert.equal(lastPacket.status, 'running')
})
