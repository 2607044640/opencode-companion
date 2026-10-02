import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { ToolPart } from '../../types/opencode'
import { isWebSearchTool, parseWebSearchData } from './WebSearchToolCard'

describe('WebSearchToolCard & websearch parser tests', () => {
  it('accurately identifies web search and web fetch tools', () => {
    // 1. webfetch tool with URL
    const fetchPart: ToolPart = {
      id: 'p_fetch',
      sessionID: 'ses_1',
      messageID: 'msg_1',
      type: 'tool',
      tool: 'webfetch',
      state: {
        status: 'completed',
        input: { url: 'https://docs.opencode.ai/guide' },
      },
    }
    assert.equal(isWebSearchTool(fetchPart), true)

    // 2. search_web tool with query
    const searchPart: ToolPart = {
      id: 'p_search',
      sessionID: 'ses_1',
      messageID: 'msg_1',
      type: 'tool',
      tool: 'search_web',
      state: {
        status: 'completed',
        input: { query: 'antigravity agent workflow' },
      },
    }
    assert.equal(isWebSearchTool(searchPart), true)

    // 3. read_url_content tool
    const readUrlPart: ToolPart = {
      id: 'p_read_url',
      sessionID: 'ses_1',
      messageID: 'msg_1',
      type: 'tool',
      tool: 'read_url_content',
      state: {
        status: 'completed',
        input: { Url: 'https://github.com/opencode-ai' },
      },
    }
    assert.equal(isWebSearchTool(readUrlPart), true)

    // 4. Custom tool with HTTP/HTTPS URL
    const customUrlPart: ToolPart = {
      id: 'p_custom',
      sessionID: 'ses_1',
      messageID: 'msg_1',
      type: 'tool',
      tool: 'custom_downloader',
      state: {
        status: 'completed',
        input: { url: 'http://example.com/data.json' },
      },
    }
    assert.equal(isWebSearchTool(customUrlPart), true)

    // 5. Standard non-web tools return false
    const fileReadPart: ToolPart = {
      id: 'p_read',
      sessionID: 'ses_1',
      messageID: 'msg_1',
      type: 'tool',
      tool: 'read',
      state: { status: 'completed', input: { path: 'src/index.ts' } },
    }
    assert.equal(isWebSearchTool(fileReadPart), false)

    const bashPart: ToolPart = {
      id: 'p_bash',
      sessionID: 'ses_1',
      messageID: 'msg_1',
      type: 'tool',
      tool: 'bash',
      state: { status: 'completed', input: { command: 'git status' } },
    }
    assert.equal(isWebSearchTool(bashPart), false)

    const editPart: ToolPart = {
      id: 'p_edit',
      sessionID: 'ses_1',
      messageID: 'msg_1',
      type: 'tool',
      tool: 'edit',
      state: { status: 'completed', input: { path: 'src/App.tsx' } },
    }
    assert.equal(isWebSearchTool(editPart), false)

    const taskPart: ToolPart = {
      id: 'p_task',
      sessionID: 'ses_1',
      messageID: 'msg_1',
      type: 'tool',
      tool: 'task',
      state: { status: 'completed', input: { prompt: 'Subagent' } },
    }
    assert.equal(isWebSearchTool(taskPart), false)
  })

  it('correctly parses URL, domain and cleans MIME artifacts from output', () => {
    const rawWithMimeHeader = [
      'html; charset=utf-8)',
      '# Welcome to OpenCode',
      '',
      'OpenCode is an open-source AI agent system.',
    ].join('\n')

    const part: ToolPart = {
      id: 'p_test_fetch',
      sessionID: 'ses_1',
      messageID: 'msg_1',
      type: 'tool',
      tool: 'webfetch',
      state: {
        status: 'completed',
        input: { url: 'https://docs.opencode.ai/introduction' },
        title: 'html; charset=utf-8)',
        output: rawWithMimeHeader,
      },
    }

    const data = parseWebSearchData(part)
    assert.equal(data.isFetch, true)
    assert.equal(data.target, 'https://docs.opencode.ai/introduction')
    assert.equal(data.domain, 'docs.opencode.ai')
    assert.equal(data.cleanOutput.startsWith('html; charset='), false)
    assert.equal(data.cleanOutput.includes('# Welcome to OpenCode'), true)
    assert.equal(data.lineCount, 3)
    assert.ok(data.charCount > 0)
    assert.ok(data.byteSizeStr.includes('B'))
  })

  it('correctly parses search queries and assigns Web Search domain', () => {
    const part: ToolPart = {
      id: 'p_test_search',
      sessionID: 'ses_1',
      messageID: 'msg_1',
      type: 'tool',
      tool: 'search_web',
      state: {
        status: 'completed',
        input: { query: 'antigravity companion features' },
        output: 'Result 1: ...\nResult 2: ...',
      },
    }

    const data = parseWebSearchData(part)
    assert.equal(data.isFetch, false)
    assert.equal(data.target, 'antigravity companion features')
    assert.equal(data.domain, 'Web Search')
    assert.equal(data.lineCount, 2)
  })
})
