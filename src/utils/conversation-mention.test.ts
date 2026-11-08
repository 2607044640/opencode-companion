import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  formatSessionRelativeTime,
  extractConversationMentions,
  formatConversationTranscript,
  wrapReferencedConversation,
  parseReferencedConversationsFromText,
  resolvePromptWithConversationMentions,
} from './conversation-mention'
import type { Message, Session } from '../types/opencode'

describe('conversation-mention utilities', () => {
  it('formats relative session times correctly', () => {
    const now = Date.now()
    assert.strictEqual(formatSessionRelativeTime(now - 10 * 1000, true), '刚刚')
    assert.strictEqual(formatSessionRelativeTime(now - 5 * 60 * 1000, true), '5分钟前')
    assert.strictEqual(formatSessionRelativeTime(now - 2 * 3600 * 1000, true), '2小时前')
    assert.strictEqual(formatSessionRelativeTime(now - 48 * 3600 * 1000, true), '2天前')
  })

  it('extracts unique @conversation mentions from prompt text', () => {
    const text = 'Compare @conversation:ses_abc with @conversation:ses_xyz and also duplicate @conversation:ses_abc'
    const mentions = extractConversationMentions(text)
    assert.strictEqual(mentions.length, 2)
    assert.strictEqual(mentions[0].sessionId, 'ses_abc')
    assert.strictEqual(mentions[1].sessionId, 'ses_xyz')
  })

  it('supports slash format @conversation/ses_123', () => {
    const text = 'Look at @conversation/ses_999'
    const mentions = extractConversationMentions(text)
    assert.strictEqual(mentions.length, 1)
    assert.strictEqual(mentions[0].sessionId, 'ses_999')
  })

  it('returns empty when no @conversation mention exists', () => {
    assert.deepStrictEqual(extractConversationMentions('Hello world @build @file.txt'), [])
  })

  it('formats conversation transcript cleanly with user and assistant turns', () => {
    const mockMessages: Message[] = [
      {
        info: { id: 'm1', sessionID: 's1', role: 'user', time: { created: 1000 } },
        parts: [{ id: 'p1', sessionID: 's1', messageID: 'm1', type: 'text', text: 'How do I optimize DB query?' }],
      },
      {
        info: { id: 'm2', sessionID: 's1', role: 'assistant', time: { created: 1001 } },
        parts: [
          { id: 'p2', sessionID: 's1', messageID: 'm2', type: 'text', text: 'You should add an index on user_id.' },
          { id: 'p3', sessionID: 's1', messageID: 'm2', type: 'tool', tool: 'run_sql', state: { status: 'completed' } } as any,
        ],
      },
    ]

    const transcript = formatConversationTranscript(mockMessages)
    assert.ok(transcript.includes('[User]:\nHow do I optimize DB query?'))
    assert.ok(transcript.includes('[Assistant]:\nYou should add an index on user_id.'))
    assert.ok(transcript.includes('[Tool: run_sql (completed)]'))
  })

  it('wraps conversation into XML structure with safe escaping', () => {
    const block = wrapReferencedConversation(
      { id: 'ses_123', title: 'DB "Optimization" & Queries', directory: '/home/user/project' },
      '[User]: test'
    )
    assert.ok(block.includes('<referenced_conversation id="ses_123" title="DB  Optimization  & Queries" directory="/home/user/project">'))
    assert.ok(block.includes('</referenced_conversation>'))
  })

  it('parses referenced conversations from message text', () => {
    const text = `<referenced_conversation id="ses_123" title="Past Chat" directory="/proj">
[User]: Help me fix bug
[Assistant]: Fixed.
</referenced_conversation>

Now rewrite this in TypeScript @conversation:ses_123`

    const { cleanText, references } = parseReferencedConversationsFromText(text)
    assert.strictEqual(cleanText, 'Now rewrite this in TypeScript @conversation:ses_123')
    assert.strictEqual(references.length, 1)
    assert.strictEqual(references[0].sessionId, 'ses_123')
    assert.strictEqual(references[0].title, 'Past Chat')
    assert.ok(references[0].content.includes('Help me fix bug'))
  })

  it('resolves prompt with conversation mentions and prepends mounted transcript', async () => {
    const mockSessions: Partial<Session>[] = [
      { id: 'ses_target', title: 'Architecture Discussion' } as Session,
    ]

    const fetchMessages = async (id: string): Promise<Message[]> => {
      if (id === 'ses_target') {
        return [
          {
            info: { id: 'm1', sessionID: id, role: 'user', time: { created: 1000 } },
            parts: [{ id: 'p1', sessionID: id, messageID: 'm1', type: 'text', text: 'Let us use microservices' }],
          },
        ]
      }
      return []
    }

    const { resolvedText, mountedCount } = await resolvePromptWithConversationMentions(
      'Based on @conversation:ses_target, let us implement service A',
      mockSessions as Session[],
      fetchMessages
    )

    assert.strictEqual(mountedCount, 1)
    assert.ok(resolvedText.startsWith('<referenced_conversation id="ses_target" title="Architecture Discussion">'))
    assert.ok(resolvedText.includes('[User]:\nLet us use microservices'))
    assert.ok(resolvedText.endsWith('Based on @conversation:ses_target, let us implement service A'))
  })
})
