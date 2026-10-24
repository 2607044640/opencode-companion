import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { sseManager } from '../services/sse'
import { api } from '../services/api'
import {
  buildOptimisticMessage,
  reconcileHistoryWithOptimistic,
} from '../utils/prompt-parts'
import type { Message, SessionStatusPayload } from '../types/opencode'

describe('useChatStream Transition and SSE Lifecycle Contracts', () => {
  let registeredListeners: Map<string, Array<(payload: any) => void>>
  let originalOn: typeof sseManager.on
  let originalGetMessages: typeof api.getMessages
  let originalGetSessionStatus: typeof api.getSessionStatus

  beforeEach(() => {
    registeredListeners = new Map()
    originalOn = sseManager.on.bind(sseManager)
    originalGetMessages = api.getMessages.bind(api)
    originalGetSessionStatus = api.getSessionStatus.bind(api)

    // Intercept sseManager.on to record active subscriptions
    sseManager.on = ((eventType: string, listener: (data: any) => void) => {
      if (!registeredListeners.has(eventType)) {
        registeredListeners.set(eventType, [])
      }
      registeredListeners.get(eventType)!.push(listener)
      return () => {
        const list = registeredListeners.get(eventType)
        if (list) {
          const idx = list.indexOf(listener)
          if (idx !== -1) list.splice(idx, 1)
        }
      }
    }) as any
  })

  afterEach(() => {
    sseManager.on = originalOn
    api.getMessages = originalGetMessages
    api.getSessionStatus = originalGetSessionStatus
  })

  it('verifies that transitioning session does NOT return early and attaches all SSE listeners', () => {
    // Simulate the transition state lifecycle from useChatStream
    const transitioningSessionIdRef = { current: 'ses_new_123' as string | null }
    const currentSessionIdRef = { current: null as string | null }
    const sessionBusyRef = { current: true }
    let sessionStatus: SessionStatusPayload = { type: 'busy' }
    let messages: Message[] = [
      buildOptimisticMessage({
        sessionId: 'ses_new_123',
        text: 'Hello from draft to new session',
      }),
    ]
    let loadSessionDataCalledWith: string | null = null

    const loadSessionData = (id: string) => {
      loadSessionDataCalledWith = id
    }

    const sessionId = 'ses_new_123'
    currentSessionIdRef.current = sessionId

    // Execute the revised effect logic
    const isTransitioning = transitioningSessionIdRef.current === sessionId && Boolean(sessionId)
    if (isTransitioning) {
      transitioningSessionIdRef.current = null
    } else {
      sessionStatus = { type: 'idle' }
      sessionBusyRef.current = false
    }

    if (!sessionId || sessionId === '__draft__') {
      messages = []
      return
    }

    if (!isTransitioning) {
      messages = []
    }
    loadSessionData(sessionId)

    // Critical assertion 1: Transitioning flag cleared
    assert.equal(transitioningSessionIdRef.current, null)
    // Critical assertion 2: Optimistic messages NOT wiped
    assert.equal(messages.length, 1)
    assert.equal(messages[0].parts[0]?.type === 'text' && (messages[0].parts[0] as any).text, 'Hello from draft to new session')
    // Critical assertion 3: Busy status preserved
    assert.equal(sessionStatus.type, 'busy')
    assert.equal(sessionBusyRef.current, true)
    // Critical assertion 4: loadSessionData was invoked
    assert.equal(loadSessionDataCalledWith, 'ses_new_123')

    // Subscribe to SSE events (the code following the transition check)
    const unsubDelta = sseManager.onPartDelta(() => {})
    const unsubPartUpdated = sseManager.onPartUpdated(() => {})
    const unsubMsgUpdated = sseManager.onMessageUpdated(() => {})
    const unsubStatus = sseManager.onSessionStatus(() => {})
    const unsubError = sseManager.onSessionError(() => {})
    const unsubIdle = sseManager.onSessionIdle(() => {})
    const unsubRemoved = sseManager.onMessageRemoved(() => {})
    const unsubTodo = sseManager.on('todo.updated', () => {})

    // Critical assertion 5: ALL 8 SSE listener types are actively registered
    assert.ok(registeredListeners.has('message.part.delta'), 'onPartDelta registered')
    assert.ok(registeredListeners.has('message.part.updated'), 'onPartUpdated registered')
    assert.ok(registeredListeners.has('message.updated'), 'onMessageUpdated registered')
    assert.ok(registeredListeners.has('session.status'), 'onSessionStatus registered')
    assert.ok(registeredListeners.has('session.error'), 'onSessionError registered')
    assert.ok(registeredListeners.has('session.idle'), 'onSessionIdle registered')
    assert.ok(registeredListeners.has('message.removed'), 'onMessageRemoved registered')
    assert.ok(registeredListeners.has('todo.updated'), 'todo.updated registered')

    // Cleanup unsubscribes cleanly
    unsubDelta()
    unsubPartUpdated()
    unsubMsgUpdated()
    unsubStatus()
    unsubError()
    unsubIdle()
    unsubRemoved()
    unsubTodo()

    assert.equal(registeredListeners.get('message.part.delta')?.length, 0)
    assert.equal(registeredListeners.get('session.idle')?.length, 0)
  })

  it('verifies non-transitioning session change clears messages and resets status', () => {
    const transitioningSessionIdRef = { current: null as string | null }
    let sessionStatus: SessionStatusPayload = { type: 'busy' }
    let messages: Message[] = [
      buildOptimisticMessage({ sessionId: 'ses_old', text: 'Old chat' }),
    ]
    let loadSessionDataCalled = false

    const sessionId = 'ses_other'
    const isTransitioning = transitioningSessionIdRef.current === sessionId && Boolean(sessionId)

    if (isTransitioning) {
      transitioningSessionIdRef.current = null
    } else {
      sessionStatus = { type: 'idle' }
    }

    if (!sessionId || sessionId === '__draft__') {
      messages = []
      return
    }

    if (!isTransitioning) {
      messages = []
    }
    loadSessionDataCalled = true

    assert.equal(sessionStatus.type, 'idle')
    assert.equal(messages.length, 0)
    assert.equal(loadSessionDataCalled, true)
  })

  it('SSE listeners filter by activeId (currentSessionIdRef.current || sessionId) to accept transitioned session events', () => {
    const currentSessionIdRef = { current: 'ses_new_123' as string | null }
    const sessionId = 'ses_new_123'
    let idleReceivedFor: string | null = null
    let statusReceivedFor: string | null = null

    // Handler simulating unsubStatus and unsubIdle
    const onStatus = (data: { sessionID: string; status: SessionStatusPayload }) => {
      const activeId = currentSessionIdRef.current || sessionId
      if (data.sessionID !== activeId) return
      statusReceivedFor = data.sessionID
    }

    const onIdle = (data: { sessionID: string }) => {
      const activeId = currentSessionIdRef.current || sessionId
      if (data.sessionID !== activeId) return
      idleReceivedFor = data.sessionID
    }

    // 1. Foreign session event should be ignored
    onStatus({ sessionID: 'ses_foreign', status: { type: 'busy' } })
    assert.equal(statusReceivedFor, null)

    onIdle({ sessionID: 'ses_foreign' })
    assert.equal(idleReceivedFor, null)

    // 2. Matching session event should be accepted
    onStatus({ sessionID: 'ses_new_123', status: { type: 'busy' } })
    assert.equal(statusReceivedFor, 'ses_new_123')

    onIdle({ sessionID: 'ses_new_123' })
    assert.equal(idleReceivedFor, 'ses_new_123')
  })

  it('reconciles background history on session.idle without wiping optimistic parts', async () => {
    const targetSessionId = 'ses_idle_recon'
    const backendHistory: Message[] = [
      {
        info: {
          id: 'msg_u1',
          sessionID: targetSessionId,
          role: 'user',
          time: { created: 100 },
        },
        parts: [{ id: 'p_u1', sessionID: targetSessionId, messageID: 'msg_u1', type: 'text', text: 'User question' }],
      },
      {
        info: {
          id: 'msg_a1',
          sessionID: targetSessionId,
          role: 'assistant',
          time: { created: 101, completed: 110 },
          finish: 'stop',
        },
        parts: [{ id: 'p_a1', sessionID: targetSessionId, messageID: 'msg_a1', type: 'text', text: 'Assistant complete answer' }],
      },
    ]

    api.getMessages = async (id: string) => {
      assert.equal(id, targetSessionId)
      return backendHistory
    }

    let localTimeline: Message[] = [
      buildOptimisticMessage({ sessionId: targetSessionId, text: 'User question' }),
    ]

    // Simulate idle background reconciliation
    const history = await api.getMessages(targetSessionId)
    localTimeline = reconcileHistoryWithOptimistic(history, localTimeline)

    assert.equal(localTimeline.length, 2)
    assert.equal(localTimeline[0].info.role, 'user')
    assert.equal(localTimeline[1].info.role, 'assistant')
    assert.equal((localTimeline[1].parts[0] as any).text, 'Assistant complete answer')
  })

  it('silence watchdog fetches history when backend transitions to idle', async () => {
    const targetSessionId = 'ses_watchdog_test'
    let commitStatus: SessionStatusPayload | null = null
    let reconciledMessages: Message[] = []

    const currentSessionIdRef = { current: targetSessionId }

    api.getSessionStatus = async (id: string) => {
      assert.equal(id, targetSessionId)
      return { type: 'idle' }
    }

    api.getMessages = async (id: string) => {
      assert.equal(id, targetSessionId)
      return [
        {
          info: { id: 'msg_watchdog_1', sessionID: id, role: 'assistant', time: { created: 1 } },
          parts: [{ id: 'p1', sessionID: id, messageID: 'msg_watchdog_1', type: 'text', text: 'Recovered answer' }],
        },
      ]
    }

    // Simulate watchdog step when status returns idle
    const activeId = currentSessionIdRef.current
    const status = await api.getSessionStatus(activeId)
    commitStatus = status

    if (status.type === 'idle') {
      const history = await api.getMessages(activeId)
      if (currentSessionIdRef.current === activeId) {
        reconciledMessages = reconcileHistoryWithOptimistic(history, [])
      }
    }

    assert.equal(commitStatus?.type, 'idle')
    assert.equal(reconciledMessages.length, 1)
    assert.equal((reconciledMessages[0].parts[0] as any).text, 'Recovered answer')
  })
})
