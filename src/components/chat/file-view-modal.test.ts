import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseExploreFileContent } from './FileViewModal'
import type { ExploreItem } from '../../utils/worked-summary'

describe('FileViewModal Parsing Logic', () => {
  it('parses standard unnumbered plain text file content', () => {
    const item: ExploreItem = {
      partId: 'p_1',
      tool: 'read',
      pathOrQuery: 'hello.py',
      fullPath: '/path/to/hello.py',
      kind: 'file',
      status: 'completed',
      output: 'import sys\nprint("hello")\n',
    }

    const res = parseExploreFileContent(item)
    assert.equal(res.fileName, 'hello.py')
    assert.equal(res.filePath, '/path/to/hello.py')
    assert.equal(res.lines.length, 3)
    assert.equal(res.lines[0].lineNo, '1')
    assert.equal(res.lines[0].text, 'import sys')
    assert.equal(res.lines[1].lineNo, '2')
    assert.equal(res.lines[1].text, 'print("hello")')
    assert.equal(res.cleanText, 'import sys\nprint("hello")\n')
  })

  it('parses Grok <content> and <path> wrapped outputs', () => {
    const rawGrokOutput = `GROK_TOOL_RESULT status=OK tool=read
<path>/home/developer/projects/AISpace/config.json</path>
<type>file</type>
<content>
1: {
2:   "key": "value"
3: }
</content>`

    const item: ExploreItem = {
      partId: 'p_2',
      tool: 'read',
      pathOrQuery: 'config.json',
      kind: 'file',
      status: 'completed',
      output: rawGrokOutput,
    }

    const res = parseExploreFileContent(item)
    assert.equal(res.filePath, '/home/developer/projects/AISpace/config.json')
    assert.equal(res.fileName, 'config.json')
    assert.equal(res.lines.length, 3)
    assert.equal(res.lines[0].lineNo, '1')
    assert.equal(res.lines[0].text, '{')
    assert.equal(res.lines[1].lineNo, '2')
    assert.equal(res.lines[1].text, '  "key": "value"')
    assert.equal(res.lines[2].lineNo, '3')
    assert.equal(res.lines[2].text, '}')
    assert.equal(res.cleanText, '{\n  "key": "value"\n}')
  })

  it('preserves lineRange from ExploreItem', () => {
    const item: ExploreItem = {
      partId: 'p_3',
      tool: 'view_file',
      pathOrQuery: 'SKILL.md',
      fullPath: 'C:/AICore/skills/AICtl/SKILL.md',
      lineRange: 'L1-60',
      kind: 'file',
      status: 'completed',
      output: 'line 1\nline 2',
    }

    const res = parseExploreFileContent(item)
    assert.equal(res.lineRange, 'L1-60')
    assert.equal(res.fileName, 'SKILL.md')
    assert.equal(res.lines.length, 2)
  })

  it('handles empty or error output gracefully without crashing', () => {
    const item: ExploreItem = {
      partId: 'p_4',
      tool: 'read',
      pathOrQuery: 'missing.txt',
      kind: 'file',
      status: 'error',
      error: 'File not found (ENOENT)',
    }

    const res = parseExploreFileContent(item)
    assert.equal(res.fileName, 'missing.txt')
    assert.equal(res.cleanText, 'File not found (ENOENT)')
    assert.equal(res.lines.length, 1)
    assert.equal(res.lines[0].text, 'File not found (ENOENT)')
  })
})
