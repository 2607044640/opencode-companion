import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { ToolPart } from '../../types/opencode'
import { isSubagentTool, parseSubagentResult, extractModelString } from './SubagentToolCard'

describe('SubagentToolCard logic & output parser', () => {
  it('detects subagent tool invocations correctly', () => {
    // 1. Tool name is 'task' (standard OpenCode daemon subagent caller)
    const taskPart: ToolPart = {
      id: 'p1',
      sessionID: 'ses_1',
      messageID: 'msg_1',
      type: 'tool',
      tool: 'task',
      state: {
        status: 'completed',
        input: { description: 'Survey desktop', prompt: 'List files', subagent_type: 'explore' },
      },
    }
    assert.equal(isSubagentTool(taskPart), true)

    // 2. Tool name is 'subagent'
    const subagentPart: ToolPart = {
      id: 'p2',
      sessionID: 'ses_1',
      messageID: 'msg_1',
      type: 'tool',
      tool: 'subagent',
      state: {
        status: 'running',
        input: { prompt: 'Research' },
      },
    }
    assert.equal(isSubagentTool(subagentPart), true)

    // 3. Custom tool name with subagent_type in input
    const customWithSubagentType: ToolPart = {
      id: 'p3',
      sessionID: 'ses_1',
      messageID: 'msg_1',
      type: 'tool',
      tool: 'custom_orchestrator',
      state: {
        status: 'completed',
        input: { subagent_type: 'researcher', prompt: 'Find docs' },
      },
    }
    assert.equal(isSubagentTool(customWithSubagentType), true)

    // 4. Standard tools are NOT subagents
    const bashPart: ToolPart = {
      id: 'p4',
      sessionID: 'ses_1',
      messageID: 'msg_1',
      type: 'tool',
      tool: 'bash',
      state: { status: 'completed', input: { command: 'ls -la' } },
    }
    assert.equal(isSubagentTool(bashPart), false)

    const readPart: ToolPart = {
      id: 'p5',
      sessionID: 'ses_1',
      messageID: 'msg_1',
      type: 'tool',
      tool: 'read',
      state: { status: 'completed', input: { filePath: 'foo.txt' } },
    }
    assert.equal(isSubagentTool(readPart), false)

    const editPart: ToolPart = {
      id: 'p6',
      sessionID: 'ses_1',
      messageID: 'msg_1',
      type: 'tool',
      tool: 'edit',
      state: { status: 'completed', input: { path: 'bar.ts' } },
    }
    assert.equal(isSubagentTool(editPart), false)
  })

  it('parses structured subagent output and extracts clean task results', () => {
    const rawDaemonOutput = `GROK_TOOL_RESULT status=OK tool=task call_id=call-9ec4af0f-b8f6-4b48-a479-38068776ae57-0
No disk change.
NOTE: Native xAI tokens are void. Invented tools (write_and_sync) are void. Success exists only as GROK_TOOL_RESULT status=OK.
<task id="ses_f30fe9eadffeQYuoAKR7GlYWQY" state="completed">
<task_result>
1. **Exists and readable:** yes. \`/mnt/desktop\` is a directory and listed successfully.

2. **Top-level names (first 20 of 29):**
   - AI/
   - AIBook/
   - desktop.ini
</task_result>
</task>`

    const parsed = parseSubagentResult(rawDaemonOutput)
    assert.equal(parsed.taskId, 'ses_f30fe9eadffeQYuoAKR7GlYWQY')
    assert.equal(parsed.taskState, 'completed')
    assert.equal(parsed.hasStructuredResult, true)
    assert.ok(parsed.cleanResult.startsWith('1. **Exists and readable:** yes.'))
    assert.ok(parsed.cleanResult.includes('desktop.ini'))
    assert.ok(!parsed.cleanResult.includes('GROK_TOOL_RESULT'))
    assert.ok(!parsed.cleanResult.includes('No disk change.'))
    assert.ok(!parsed.cleanResult.includes('<task id='))
    assert.ok(!parsed.cleanResult.includes('</task_result>'))
    assert.ok(parsed.lineCount >= 5)
    assert.ok(parsed.charCount > 50)
  })

  it('handles unstructured or plain text output by stripping protocol markers', () => {
    const rawPlainOutput = `GROK_TOOL_RESULT status=OK tool=task call_id=call-1234
No disk change.
NOTE: Native tokens void.
Found 29 files on desktop including desktop.ini and Godots.exe.`

    const parsed = parseSubagentResult(rawPlainOutput)
    assert.equal(parsed.cleanResult, 'Found 29 files on desktop including desktop.ini and Godots.exe.')
    assert.equal(parsed.hasStructuredResult, false)
    assert.equal(parsed.lineCount, 1)
  })

  it('handles empty or blank output gracefully', () => {
    const parsedEmpty = parseSubagentResult('')
    assert.equal(parsedEmpty.cleanResult, '')
    assert.equal(parsedEmpty.lineCount, 0)
    assert.equal(parsedEmpty.charCount, 0)

    const parsedWhitespace = parseSubagentResult('   \n\t  ')
    assert.equal(parsedWhitespace.cleanResult, '')
    assert.equal(parsedWhitespace.lineCount, 0)
  })

  it('safely extracts model strings and prevents [object Object]', () => {
    // 1. Real-world daemon metadata format: object with providerID & modelID
    const daemonObj = { providerID: 'obsidian', modelID: 'grok-4.7' }
    assert.equal(extractModelString(daemonObj), 'obsidian/grok-4.7')

    // 2. Object with id
    assert.equal(extractModelString({ id: 'obsidian/grok-4.7' }), 'obsidian/grok-4.7')

    // 3. Object with modelID only
    assert.equal(extractModelString({ modelID: 'grok-4.7' }), 'grok-4.7')

    // 4. Object with targetModelId
    assert.equal(extractModelString({ targetModelId: 'obsidian/grok-4.7' }), 'obsidian/grok-4.7')

    // 5. String model
    assert.equal(extractModelString('obsidian/grok-4.7'), 'obsidian/grok-4.7')
    assert.equal(extractModelString('grok-4.7'), 'grok-4.7')

    // 6. Accidental stringified '[object Object]' or invalid strings
    assert.equal(extractModelString('[object Object]'), '')
    assert.equal(extractModelString('undefined'), '')
    assert.equal(extractModelString('null'), '')

    // 7. Null/undefined/empty
    assert.equal(extractModelString(null), '')
    assert.equal(extractModelString(undefined), '')
    assert.equal(extractModelString(''), '')
  })
})
