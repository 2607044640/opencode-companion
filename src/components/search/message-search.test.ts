import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractMatchSnippet,
  searchSessionDocs,
  queryAllCachedMessages,
} from './message-search'
import {
  extractSearchableDocs,
  MessageCache,
} from './message-cache'
import type { Message } from '../../types/opencode'
import type { CachedMessageDoc } from './search-types'

describe('extractMatchSnippet', () => {
  it('handles empty text and empty query gracefully', () => {
    assert.equal(extractMatchSnippet('', 'test'), '')
    assert.equal(extractMatchSnippet('Hello world', ''), 'Hello world')
  })

  it('extracts prefix ellipsis when match is in middle or end', () => {
    const longText = 'A'.repeat(100) + ' TARGET_KEYWORD ' + 'B'.repeat(100)
    const snippet = extractMatchSnippet(longText, 'TARGET_KEYWORD', 20)
    assert.ok(snippet.startsWith('...'))
    assert.ok(snippet.endsWith('...'))
    assert.ok(snippet.includes('TARGET_KEYWORD'))
  })

  it('omits prefix ellipsis when match is at the beginning', () => {
    const text = 'START_KEYWORD followed by some other trailing context ' + 'C'.repeat(100)
    const snippet = extractMatchSnippet(text, 'START_KEYWORD', 30)
    assert.ok(!snippet.startsWith('...'))
    assert.ok(snippet.endsWith('...'))
    assert.ok(snippet.includes('START_KEYWORD'))
  })

  it('omits suffix ellipsis when match is at the end', () => {
    const text = 'D'.repeat(100) + ' and finally END_KEYWORD'
    const snippet = extractMatchSnippet(text, 'END_KEYWORD', 30)
    assert.ok(snippet.startsWith('...'))
    assert.ok(!snippet.endsWith('...'))
    assert.ok(snippet.includes('END_KEYWORD'))
  })

  it('handles Chinese and mixed CJK text correctly', () => {
    const text = '在深度学习与分布式架构中，关于会话消息全文检索的实现应当采用轻量索引与LRU缓存'
    const snippet = extractMatchSnippet(text, '全文检索', 15)
    assert.ok(snippet.includes('全文检索'))
  })

  it('normalizes internal multiple line breaks into spaces', () => {
    const text = 'Line 1\n\n\nLine 2\r\n\r\nTARGET_BLOCK\n\nLine 3'
    const snippet = extractMatchSnippet(text, 'TARGET_BLOCK', 40)
    assert.ok(!snippet.includes('\n\n\n'))
    assert.ok(snippet.includes('TARGET_BLOCK'))
  })

  it('finds the earliest match among multiple query terms', () => {
    const text = 'First word apple appears before second word banana in this document.'
    const snippet = extractMatchSnippet(text, 'banana apple', 20)
    assert.ok(snippet.includes('apple'))
  })
})

describe('extractSearchableDocs', () => {
  it('extracts only text parts and ignores reasoning and tool parts', () => {
    const mockMessages: Message[] = [
      {
        info: {
          id: 'msg-1',
          sessionID: 'ses-1',
          role: 'user',
          time: { created: 1000 },
        },
        parts: [
          { type: 'text', text: 'Hello, I have a question about SQLite.' },
        ],
      },
      {
        info: {
          id: 'msg-2',
          sessionID: 'ses-1',
          role: 'assistant',
          time: { created: 2000, completed: 3000 },
        },
        parts: [
          { type: 'reasoning', text: 'Let me think about SQLite locking...' } as any,
          { type: 'tool', tool: 'bash', state: { status: 'completed', output: 'ok' } } as any,
          { type: 'text', text: 'SQLite supports WAL mode for concurrency.' },
        ],
      },
      {
        info: {
          id: 'msg-3',
          sessionID: 'ses-1',
          role: 'assistant',
          time: { created: 4000 },
        },
        parts: [
          // Tool only, no text
          { type: 'tool', tool: 'read', state: { status: 'completed' } } as any,
        ],
      },
    ]

    const docs = extractSearchableDocs(mockMessages)
    assert.equal(docs.length, 2)
    assert.equal(docs[0].id, 'msg-1')
    assert.equal(docs[0].role, 'user')
    assert.equal(docs[0].text, 'Hello, I have a question about SQLite.')
    assert.equal(docs[1].id, 'msg-2')
    assert.equal(docs[1].role, 'assistant')
    assert.equal(docs[1].text, 'SQLite supports WAL mode for concurrency.')
  })

  it('skips empty or whitespace-only messages', () => {
    const mockMessages: Message[] = [
      {
        info: { id: 'msg-empty', sessionID: 'ses-1', role: 'user', time: {} },
        parts: [{ type: 'text', text: '   \n\t   ' }],
      },
    ]
    const docs = extractSearchableDocs(mockMessages)
    assert.equal(docs.length, 0)
  })
})

describe('searchSessionDocs', () => {
  const sampleDocs: CachedMessageDoc[] = [
    {
      id: 'doc-1',
      role: 'user',
      text: 'How do I configure Redis connection pool in Node.js?',
      time: { created: 1000 },
    },
    {
      id: 'doc-2',
      role: 'assistant',
      text: 'You can use ioredis with Redis cluster or single node connection pool options.',
      time: { created: 2000 },
    },
    {
      id: 'doc-3',
      role: 'user',
      text: 'Can you show an example of Redis pipeline and transaction?',
      time: { created: 3000 },
    },
    {
      id: 'doc-4',
      role: 'assistant',
      text: 'Here is how you use multi() and exec() in Redis.',
      time: { created: 4000 },
    },
  ]

  it('returns empty array when query is empty', () => {
    const hits = searchSessionDocs('ses-1', 'Session Title', sampleDocs, '   ')
    assert.equal(hits.length, 0)
  })

  it('performs case-insensitive multi-term substring AND matching', () => {
    const hits = searchSessionDocs('ses-1', 'Redis Guide', sampleDocs, 'REDIS POOL')
    assert.equal(hits.length, 2)
    assert.equal(hits[0].messageId, 'doc-1')
    assert.equal(hits[0].role, 'user')
    assert.equal(hits[0].turnIndex, 1)
    assert.equal(hits[1].messageId, 'doc-2')
    assert.equal(hits[1].role, 'assistant')
    assert.equal(hits[1].turnIndex, 2)
  })

  it('enforces maximum hits per session cap', () => {
    const hits = searchSessionDocs('ses-1', 'Redis Guide', sampleDocs, 'redis', undefined, 2)
    assert.equal(hits.length, 2)
  })

  it('attaches project metadata correctly', () => {
    const meta = {
      projectId: 'proj-1',
      projectName: 'Backend',
      projectColorClass: 'text-amber-300',
    }
    const hits = searchSessionDocs('ses-1', 'Redis Guide', sampleDocs, 'pipeline', meta)
    assert.equal(hits.length, 1)
    assert.equal(hits[0].projectName, 'Backend')
    assert.equal(hits[0].projectColorClass, 'text-amber-300')
  })
})

describe('MessageCache', () => {
  it('stores and retrieves cached docs', () => {
    const cache = new MessageCache(5)
    const docs: CachedMessageDoc[] = [
      { id: '1', role: 'user', text: 'hi' },
    ]
    cache.set('ses-1', 1000, docs)
    assert.ok(cache.has('ses-1'))
    const retrieved = cache.get('ses-1', 1000)
    assert.deepEqual(retrieved, docs)
  })

  it('invalidates cache when session updatedAt is newer than cached timestamp', () => {
    const cache = new MessageCache(5)
    const docs: CachedMessageDoc[] = [
      { id: '1', role: 'user', text: 'hi' },
    ]
    cache.set('ses-1', 1000, docs)

    // Query with newer updatedAt
    const result = cache.get('ses-1', 2000)
    assert.equal(result, undefined)
    assert.ok(!cache.has('ses-1'))
  })

  it('evicts least recently accessed items when maxEntries is reached', () => {
    const cache = new MessageCache(2)
    cache.set('ses-1', 100, [{ id: '1', role: 'user', text: 'one' }])
    cache.set('ses-2', 200, [{ id: '2', role: 'user', text: 'two' }])

    // Touch ses-1 so ses-2 becomes the oldest accessed
    cache.get('ses-1')

    // Add third entry -> should evict ses-2
    cache.set('ses-3', 300, [{ id: '3', role: 'user', text: 'three' }])

    assert.ok(cache.has('ses-1'))
    assert.ok(!cache.has('ses-2'))
    assert.ok(cache.has('ses-3'))
    assert.equal(cache.size(), 2)
  })
})

describe('queryAllCachedMessages', () => {
  it('aggregates hits across targets and sorts by timestamp descending', () => {
    const targets = [
      {
        sessionId: 'ses-old',
        sessionTitle: 'Old Session',
        docs: [
          { id: 'm1', role: 'user' as const, text: 'database query', time: { created: 1000 } },
        ],
      },
      {
        sessionId: 'ses-new',
        sessionTitle: 'New Session',
        docs: [
          { id: 'm2', role: 'assistant' as const, text: 'database migration', time: { created: 5000 } },
        ],
      },
    ]

    const results = queryAllCachedMessages(targets, 'database', 10)
    assert.equal(results.length, 2)
    // Newest first
    assert.equal(results[0].sessionId, 'ses-new')
    assert.equal(results[1].sessionId, 'ses-old')
  })
})
