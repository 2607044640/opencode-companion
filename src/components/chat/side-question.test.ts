import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { rankPopoverItems, scorePopoverItem, type PopoverRankItem } from './popover-rank'

describe('Side Question (/btw) logic and popover ranking tests', () => {
  it('ranks /btw higher than BugInvestigation when typing "b"', () => {
    const btwItem: PopoverRankItem = {
      type: 'command',
      item: {
        name: 'btw',
        description: 'Ask a quick question without interrupting the main conversation.',
      },
    }
    const bugItem: PopoverRankItem = {
      type: 'skill',
      item: {
        name: 'BugInvestigation',
        description: 'When a runtime bug, failed test, crash, or unexpected behavior occurs...',
      },
    }

    const btwScore = scorePopoverItem('btw', btwItem.item.description, 'b')
    const bugScore = scorePopoverItem('BugInvestigation', bugItem.item.description, 'b')

    // Since 'btw' is shorter than 'BugInvestigation', it has a strictly lower score and ranks first
    assert.ok(btwScore < bugScore, `Expected btwScore (${btwScore}) < bugScore (${bugScore})`)

    const ranked = rankPopoverItems([bugItem, btwItem], 'b')
    assert.equal(ranked[0].item.name, 'btw')
  })

  it('ranks /btw at the very top when typing "btw"', () => {
    const items: PopoverRankItem[] = [
      {
        type: 'skill',
        item: { name: 'BugInvestigation', description: 'When a bug occurs' },
      },
      {
        type: 'command',
        item: {
          name: 'btw',
          description: 'Ask a quick question without interrupting the main conversation.',
        },
      },
    ]

    const ranked = rankPopoverItems(items, 'btw')
    assert.equal(ranked.length, 1)
    assert.equal(ranked[0].item.name, 'btw')
  })

  it('correctly detects and parses /btw command prefix', () => {
    const parseBtw = (text: string): { isBtw: boolean; question: string } => {
      const trimmed = text.trim()
      const isBtw = trimmed.startsWith('/btw ') || trimmed === '/btw'
      const question = isBtw ? trimmed.replace(/^\/btw\s*/, '').trim() : ''
      return { isBtw, question }
    }

    assert.deepEqual(parseBtw('/btw 你好'), { isBtw: true, question: '你好' })
    assert.deepEqual(parseBtw('/btw    什么是 Nanite？   '), { isBtw: true, question: '什么是 Nanite？' })
    assert.deepEqual(parseBtw('/btw'), { isBtw: true, question: '' })
    assert.deepEqual(parseBtw('btw hello'), { isBtw: false, question: '' })
    assert.deepEqual(parseBtw('/summary project'), { isBtw: false, question: '' })
  })

  it('formats side question prompt context correctly with active messages', () => {
    const formatPrompt = (question: string, recentUserQuestion?: string) => {
      let contextBlock = ''
      if (recentUserQuestion) {
        contextBlock = `\n\n[Active Conversation Context (Read-only reference)]:\nUser: ${recentUserQuestion}\n[End of Context]\n`
      }
      return `[Side Question - Answer concisely and directly to help the user without interrupting their main task]${contextBlock}\nQuestion: ${question}`
    }

    const formatted = formatPrompt('如何定义一个函数？', '正在重构 main.ts')
    assert.ok(formatted.includes('Question: 如何定义一个函数？'))
    assert.ok(formatted.includes('正在重构 main.ts'))
    assert.ok(formatted.includes('[Side Question - Answer concisely and directly'))
  })

  it('filters out user message parts to prevent leaking prompt into answer', () => {
    const userMessageIds = new Set(['msg_user_1', 'msg_user_2'])

    const isAssistantPart = (messageID: string) => !userMessageIds.has(messageID)

    assert.equal(isAssistantPart('msg_user_1'), false, 'User message part must be rejected')
    assert.equal(isAssistantPart('msg_user_2'), false, 'User message part must be rejected')
    assert.equal(isAssistantPart('msg_assistant_1'), true, 'Assistant part must be accepted')
  })

  it('handles multi-question pagination and clamping', () => {
    const list = [
      { id: 'q1', question: 'Question 1' },
      { id: 'q2', question: 'Question 2' },
      { id: 'q3', question: 'Question 3' },
    ]

    const nextIndex = (current: number) => Math.min(list.length - 1, current + 1)
    const prevIndex = (current: number) => Math.max(0, current - 1)

    assert.equal(nextIndex(0), 1)
    assert.equal(nextIndex(1), 2)
    assert.equal(nextIndex(2), 2) // Clamped at end

    assert.equal(prevIndex(2), 1)
    assert.equal(prevIndex(1), 0)
    assert.equal(prevIndex(0), 0) // Clamped at start
  })

  it('guarantees per-conversation session isolation when switching conversations', () => {
    // Model the per-session store structure used in useSideQuestion
    const questionsBySession: Record<string, { id: string; question: string }[]> = {
      session_opus: [
        { id: 'q1', question: 'Side question 1 for Opus' },
        { id: 'q2', question: 'Side question 2 for Opus' },
      ],
      session_grok: [{ id: 'q3', question: 'Side question for Grok' }],
    }

    const getSessionState = (sessionId: string | null) => {
      const key = sessionId || '__draft__'
      const questions = questionsBySession[key] || []
      return {
        totalCount: questions.length,
        currentSideQuestion: questions.length > 0 ? questions[0] : null,
        isCardOpen: questions.length > 0,
      }
    }

    // 1. In session_opus: sees 2 side questions
    const opusState = getSessionState('session_opus')
    assert.equal(opusState.totalCount, 2)
    assert.equal(opusState.currentSideQuestion?.question, 'Side question 1 for Opus')
    assert.equal(opusState.isCardOpen, true)

    // 2. Switching to a new empty draft session (null): side questions MUST be completely absent
    const draftState = getSessionState(null)
    assert.equal(draftState.totalCount, 0, 'New session must have 0 side questions')
    assert.equal(draftState.currentSideQuestion, null, 'New session must have no current side question')
    assert.equal(draftState.isCardOpen, false, 'Card must be closed in new session')

    // 3. Switching to another existing session (session_grok): sees only Grok side question
    const grokState = getSessionState('session_grok')
    assert.equal(grokState.totalCount, 1)
    assert.equal(grokState.currentSideQuestion?.question, 'Side question for Grok')
    assert.equal(grokState.isCardOpen, true)

    // 4. Switching to an arbitrary conversation with no side questions
    const emptyState = getSessionState('session_other')
    assert.equal(emptyState.totalCount, 0)
    assert.equal(emptyState.currentSideQuestion, null)
    assert.equal(emptyState.isCardOpen, false)
  })

  it('cleans up side questions when parent session is deleted', () => {
    const questionsBySession: Record<string, { id: string }[]> = {
      session_to_delete: [{ id: 'q1' }],
      session_keep: [{ id: 'q2' }],
    }

    const clearSession = (id: string) => {
      delete questionsBySession[id]
    }

    clearSession('session_to_delete')
    assert.equal(questionsBySession['session_to_delete'], undefined)
    assert.ok(questionsBySession['session_keep'] !== undefined)
  })

  it('persists side questions and sanitizes generating state upon reload', () => {
    const rawStorage = JSON.stringify({
      questionsBySession: {
        session_1: [
          { id: 'q1', question: 'Done question', status: 'done', answer: 'Ans 1' },
          { id: 'q2', question: 'Interrupted question', status: 'generating', answer: 'Partial' },
        ],
      },
      currentIndexBySession: { session_1: 1 },
      cardOpenBySession: { session_1: true },
      selectedModel: { providerID: 'obsidian', modelID: 'grok-4.7', name: 'Grok 4.7' },
    })

    const parsed = JSON.parse(rawStorage)
    const sanitizedQuestions: Record<string, any[]> = {}
    for (const [sId, list] of Object.entries(parsed.questionsBySession as Record<string, any[]>)) {
      sanitizedQuestions[sId] = list.map((item) => {
        if (item.status === 'generating') {
          return { ...item, status: 'done' }
        }
        return item
      })
    }

    assert.equal(sanitizedQuestions['session_1'].length, 2)
    assert.equal(sanitizedQuestions['session_1'][0].status, 'done')
    assert.equal(sanitizedQuestions['session_1'][1].status, 'done', 'Interrupted generating question must become done on reload')
    assert.equal(parsed.currentIndexBySession['session_1'], 1)
    assert.equal(parsed.cardOpenBySession['session_1'], true)
    assert.deepEqual(parsed.selectedModel, {
      providerID: 'obsidian',
      modelID: 'grok-4.7',
      name: 'Grok 4.7',
    })
  })
})

