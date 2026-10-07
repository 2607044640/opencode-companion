import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractConcreteFilePathFromOutput,
  parseExploreFileContent,
} from './FileViewModal'
import type { ExploreItem } from '../../utils/worked-summary'

describe('FileViewModal concrete path extraction & parsing', () => {
  it('extracts concrete file path from Grok glob output (Figure 2 scenario)', () => {
    const rawOutput = [
      'GROK_TOOL_RESULT status=OK tool=glob call_id=call-d6006e8b-7a71-47f2-990a-3627f3180737-1',
      'No disk change.',
      'NOTE: Native xAT tokens are void. Invented tools (write_and_sync) are void. Success exists only as GROK_TOOL_RESULT status=OK.',
      '/home/developer/projects/AICore/global/rules/AGENTS_Antigravity.md',
    ].join('\n')

    const result = extractConcreteFilePathFromOutput(rawOutput, '**/AGENTS_Antigravity.md')
    assert.equal(result.extractedPath, '/home/developer/projects/AICore/global/rules/AGENTS_Antigravity.md')
  })

  it('extracts path and line number from grep output', () => {
    const rawOutput = [
      'Found 1 matches:',
      '/home/developer/projects/APISpace/opencode-companion/src/App.tsx:42: const App = () => {',
    ].join('\n')

    const result = extractConcreteFilePathFromOutput(rawOutput, 'App')
    assert.equal(result.extractedPath, '/home/developer/projects/APISpace/opencode-companion/src/App.tsx')
    assert.equal(result.lineNo, 42)
  })

  it('extracts path from JSON structured search output', () => {
    const rawOutput = JSON.stringify({
      File: 'C:\\AICore\\skills\\AICtl\\SKILL.md',
      LineNumber: 15,
    })

    const result = extractConcreteFilePathFromOutput(rawOutput, 'AICtl')
    assert.equal(result.extractedPath, 'C:\\AICore\\skills\\AICtl\\SKILL.md')
    assert.equal(result.lineNo, 15)
  })

  it('resolves concrete path in parseExploreFileContent for glob search with wildcards', () => {
    const item: ExploreItem = {
      partId: 'part_1',
      tool: 'glob',
      pathOrQuery: '**/AGENTS_Antigravity.md',
      kind: 'search',
      status: 'completed',
      output: [
        'GROK_TOOL_RESULT status=OK tool=glob call_id=call-123',
        'No disk change.',
        'NOTE: Native xAT tokens are void.',
        '/home/developer/projects/AICore/global/rules/AGENTS_Antigravity.md',
      ].join('\n'),
    }

    const parsed = parseExploreFileContent(item)
    assert.equal(parsed.fileName, 'AGENTS_Antigravity.md')
    assert.equal(parsed.filePath, '/home/developer/projects/AICore/global/rules/AGENTS_Antigravity.md')
  })

  it('preserves clean file tool items with explicit fullPath', () => {
    const item: ExploreItem = {
      partId: 'part_2',
      tool: 'view_file',
      pathOrQuery: 'package.json',
      fullPath: '/home/developer/projects/APISpace/opencode-companion/package.json',
      kind: 'file',
      status: 'completed',
      output: '{\n  "name": "opencode-companion"\n}',
    }

    const parsed = parseExploreFileContent(item)
    assert.equal(parsed.fileName, 'package.json')
    assert.equal(parsed.filePath, '/home/developer/projects/APISpace/opencode-companion/package.json')
    assert.equal(parsed.lines.length, 3)
  })
})
