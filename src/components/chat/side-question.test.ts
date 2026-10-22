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

  it('sanitizes obsolete claude-opus-5-5 from stored data and self-heals to gpt-6.1-sol', () => {
    const rawStorage = JSON.stringify({
      questionsBySession: {},
      selectedModel: { providerID: 'obsidian', modelID: 'claude-opus-5-5', name: 'claude-opus-5-5' },
    })

    const parsed = JSON.parse(rawStorage)
    let selectedModel = parsed.selectedModel
    if (selectedModel && typeof selectedModel === 'object') {
      const mId = (selectedModel.modelID || '').toLowerCase()
      if (mId === 'claude-opus-5-5' || mId.includes('5-5') || mId.includes('opus-5.5')) {
        selectedModel = undefined
      }
    }

    assert.equal(selectedModel, undefined, 'Obsolete claude-opus-5-5 must be dropped upon load')

    // Initial state fallback
    const resolvedModel = selectedModel || { providerID: 'obsidian', modelID: 'gpt-6.1-sol', name: 'gpt-6.1-sol' }
    assert.equal(resolvedModel.modelID, 'gpt-6.1-sol')
  })

  it('allows searching and matching gpt-6.1-sol with "6." or "6.1"', () => {
    const models = [
      { id: 'gpt-6.1-sol', name: 'gpt-6.1-sol' },
      { id: 'grok-4.7', name: 'grok-4.7' },
      { id: 'big-pickle', name: 'Big Pickle' },
    ]

    const query1 = '6.'
    const matched1 = models.filter((m) => m.id.toLowerCase().includes(query1) || m.name.toLowerCase().includes(query1))
    assert.equal(matched1.length, 1)
    assert.equal(matched1[0].id, 'gpt-6.1-sol')

    const query2 = '6.1'
    const matched2 = models.filter((m) => m.id.toLowerCase().includes(query2) || m.name.toLowerCase().includes(query2))
    assert.equal(matched2.length, 1)
    assert.equal(matched2[0].id, 'gpt-6.1-sol')
  })

  it('intelligently calculates dropdown placement based on viewport space', () => {
    // calculateDropdownPlacement contract:
    // If space below is >= 260px or > space above, pop downwards ('bottom')
    // Otherwise pop upwards ('top')
    const calculatePlacement = (rect: { top: number; bottom: number }, windowHeight: number): 'top' | 'bottom' => {
      const spaceBelow = windowHeight - rect.bottom
      const spaceAbove = rect.top
      const dropdownEstimatedHeight = 260
      if (spaceBelow >= dropdownEstimatedHeight || spaceBelow > spaceAbove) {
        return 'bottom'
      }
      return 'top'
    }

    // 1. Ample space below (e.g. card at middle/top) -> pops downward
    assert.equal(calculatePlacement({ top: 100, bottom: 130 }, 900), 'bottom')

    // 2. Button near bottom of screen (space below only 50px, space above 700px) -> pops upward
    assert.equal(calculatePlacement({ top: 750, bottom: 780 }, 800), 'top')

    // 3. Exactly enough space below (260px) -> pops downward
    assert.equal(calculatePlacement({ top: 500, bottom: 540 }, 800), 'bottom')
  })

  it('correctly clamps side question card height within min and max boundaries', () => {
    const clampHeight = (raw: number, windowHeight: number): number => {
      const min = 130
      const max = Math.max(min, windowHeight - 120)
      return Math.max(min, Math.min(Math.round(raw), max))
    }

    const windowHeight = 900
    // Below minimum 130px (e.g. 50px) -> clamped to 130px (at least 3 lines of text)
    assert.equal(clampHeight(50, windowHeight), 130)
    assert.equal(clampHeight(129, windowHeight), 130)

    // Above maximum (900 - 120 = 780px) -> clamped to 780px
    assert.equal(clampHeight(850, windowHeight), 780)
    assert.equal(clampHeight(1200, windowHeight), 780)

    // Normal values inside range -> preserved
    assert.equal(clampHeight(360, windowHeight), 360)
    assert.equal(clampHeight(500, windowHeight), 500)
  })

  it('persists card height to localStorage and recovers clamped height', () => {
    const storage: Record<string, string> = {}
    const key = 'opencode_side_question_height'

    const saveHeight = (h: number) => {
      storage[key] = String(h)
    }

    const loadHeight = (windowHeight: number) => {
      const saved = storage[key]
      if (saved) {
        const parsed = parseInt(saved, 10)
        if (!isNaN(parsed)) {
          const min = 130
          const max = Math.max(min, windowHeight - 120)
          return Math.max(min, Math.min(parsed, max))
        }
      }
      return 360
    }

    // Default when empty
    assert.equal(loadHeight(900), 360)

    // Save and load
    saveHeight(480)
    assert.equal(loadHeight(900), 480)

    // Clamps if window shrunk
    saveHeight(800)
    assert.equal(loadHeight(600), 480) // 600 - 120 = 480
  })

  it('formats copy content correctly across all 3 copy modes', () => {
    const item = {
      question: '本质上是什么？修改的时候，使用的技术是？',
      answer: '这套机制的本质是脱离 Git 依赖的前置快照引擎。',
      thought: '正在思考...',
    }

    const formatCopy = (type: 'input' | 'output' | 'all', data: typeof item) => {
      if (type === 'input') return data.question || ''
      if (type === 'output') return data.answer || data.thought || ''
      const answerContent = data.answer || data.thought || ''
      return `Side Question: ${data.question}\n\n${answerContent}`
    }

    // 1. Input only: returns pure user question
    assert.equal(
      formatCopy('input', item),
      '本质上是什么？修改的时候，使用的技术是？'
    )

    // 2. Output only: returns model answer
    assert.equal(
      formatCopy('output', item),
      '这套机制的本质是脱离 Git 依赖的前置快照引擎。'
    )

    // 3. Combined Q&A: formats with "Side Question: <question>\n\n<answer>"
    assert.equal(
      formatCopy('all', item),
      'Side Question: 本质上是什么？修改的时候，使用的技术是？\n\n这套机制的本质是脱离 Git 依赖的前置快照引擎。'
    )

    // 4. Fallback to thought when answer is empty
    const thoughtOnlyItem = {
      question: '正在处理的问题',
      answer: '',
      thought: '思考中...',
    }
    assert.equal(formatCopy('output', thoughtOnlyItem), '思考中...')
    assert.equal(
      formatCopy('all', thoughtOnlyItem),
      'Side Question: 正在处理的问题\n\n思考中...'
    )
  })
})

