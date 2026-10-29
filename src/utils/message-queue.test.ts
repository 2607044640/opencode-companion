import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  canAutoDrainQueue,
  createQueuedMessage,
  dequeueFirst,
  enqueueMessage,
  loadPersistedQueue,
  migrateSessionQueue,
  queuedImageAttachments,
  removeQueuedMessage,
  savePersistedQueue,
  shouldAutoDispatchQueue,
  shouldEnqueueSubmission,
  shouldPauseQueueOnTurnEnd,
  type QueuedMessage,
} from './message-queue'

describe('message queue', () => {
  it('appends without a length cap', () => {
    let queue: QueuedMessage[] = []
    for (let i = 0; i < 50; i++) {
      queue = enqueueMessage(queue, createQueuedMessage(`msg-${i}`, undefined, i))
    }
    assert.equal(queue.length, 50)
    assert.equal(queue[0].text, 'msg-0')
    assert.equal(queue[49].text, 'msg-49')
  })

  it('removes one item and keeps order', () => {
    const a = createQueuedMessage('a', undefined, 1)
    const b = createQueuedMessage('b', undefined, 2)
    const c = createQueuedMessage('c', undefined, 3)
    const next = removeQueuedMessage([a, b, c], b.id)
    assert.deepEqual(next.map((item) => item.text), ['a', 'c'])
  })

  it('dequeues FIFO', () => {
    const a = createQueuedMessage('a', undefined, 1)
    const b = createQueuedMessage('b', undefined, 2)
    const first = dequeueFirst([a, b])
    assert.equal(first.item?.text, 'a')
    assert.deepEqual(first.rest.map((item) => item.text), ['b'])
    assert.equal(dequeueFirst([]).item, null)
  })

  it('shouldEnqueueSubmission enforces FIFO: enqueues when busy OR when queue already has items (Bug 2 fix)', () => {
    // Model is idle and queue is empty -> send directly
    assert.equal(shouldEnqueueSubmission(false, 0), false)
    // Model is busy and queue is empty -> enqueue
    assert.equal(shouldEnqueueSubmission(true, 0), true)
    // Model is busy and queue is non-empty -> enqueue
    assert.equal(shouldEnqueueSubmission(true, 2), true)
    // Model is IDLE (e.g. paused or between turns) but queue has items -> MUST enqueue, never cut in line!
    assert.equal(shouldEnqueueSubmission(false, 1), true)
  })

  it('canAutoDrainQueue uses level-triggered readiness to avoid turnEpoch race conditions (Bug 1 fix)', () => {
    // 1. Stream finished (isBusy=false via isSending=false), but SSE status is still busy -> wait
    assert.equal(
      canAutoDrainQueue({
        isBusy: true,
        runKnown: true,
        statusType: 'busy',
        queueLength: 1,
        isPaused: false,
        isDispatching: false,
      }),
      false
    )

    // 2. Moments later, SSE status transitions to idle -> immediately drains without needing a new epoch!
    assert.equal(
      canAutoDrainQueue({
        isBusy: false,
        runKnown: true,
        statusType: 'idle',
        queueLength: 1,
        isPaused: false,
        isDispatching: false,
      }),
      true
    )

    // 3. Blocked when paused (after error or user Stop)
    assert.equal(
      canAutoDrainQueue({
        isBusy: false,
        runKnown: true,
        statusType: 'idle',
        queueLength: 1,
        isPaused: true,
        isDispatching: false,
      }),
      false
    )

    // 4. Blocked while another dispatch is already in flight
    assert.equal(
      canAutoDrainQueue({
        isBusy: false,
        runKnown: true,
        statusType: 'idle',
        queueLength: 1,
        isPaused: false,
        isDispatching: true,
      }),
      false
    )
  })

  it('auto-sends only on a clean finish and pauses on error or user stop', () => {
    assert.equal(
      shouldAutoDispatchQueue({ assistantHasError: false, streamError: null, userAborted: false }),
      true
    )
    assert.equal(
      shouldPauseQueueOnTurnEnd({ assistantHasError: false, streamError: null, userAborted: false }),
      false
    )
    assert.equal(
      shouldPauseQueueOnTurnEnd({ assistantHasError: true, streamError: null, userAborted: false }),
      true
    )
    assert.equal(
      shouldPauseQueueOnTurnEnd({
        assistantHasError: false,
        streamError: 'Session error occurred',
        userAborted: false,
      }),
      true
    )
    assert.equal(
      shouldPauseQueueOnTurnEnd({ assistantHasError: false, streamError: null, userAborted: true }),
      true
    )
  })

  it('migrates draft session queue items to newly created session ID preserving FIFO order', () => {
    const m1 = createQueuedMessage('first', undefined, 1)
    const m2 = createQueuedMessage('second', undefined, 2)
    const initial = {
      __draft__: [m1, m2],
      ses_other: [createQueuedMessage('other', undefined, 3)],
    }
    const migrated = migrateSessionQueue(initial, '__draft__', 'ses_new')
    assert.equal(migrated.__draft__, undefined)
    assert.deepEqual(
      migrated.ses_new.map((x) => x.text),
      ['first', 'second']
    )
    assert.equal(migrated.ses_other.length, 1)
  })

  it('keeps only image attachments that have a url', () => {
    const item = createQueuedMessage(
      'look',
      {
        attachments: [
          { mime: 'image/png', url: 'data:image/png;base64,aaa', name: 'a.png' },
          { mime: 'image/jpeg', url: '', name: 'empty.jpg' },
          { mime: 'text/plain', url: 'data:text/plain,hi', name: 'note.txt' },
        ],
      },
      1
    )
    const images = queuedImageAttachments(item)
    assert.equal(images.length, 1)
    assert.equal(images[0].name, 'a.png')
  })

  it('returns no thumbnails when the queue item has no attachments', () => {
    assert.deepEqual(queuedImageAttachments(createQueuedMessage('text only', undefined, 1)), [])
  })

  it('round-trips the queue through session storage and keeps image urls', () => {
    const memory = new Map<string, string>()
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value)
      },
      removeItem: (key: string) => {
        memory.delete(key)
      },
    }
    const item = createQueuedMessage(
      'with image',
      {
        agent: 'build',
        model: { providerID: 'obsidian', modelID: 'gpt-6.1-sol' },
        attachments: [{ mime: 'image/png', url: 'data:image/png;base64,aaa', name: 'a.png' }],
      },
      1
    )
    savePersistedQueue(storage, { ses_1: [item] })
    const loaded = loadPersistedQueue(storage)
    assert.equal(loaded.ses_1[0].text, 'with image')
    assert.equal(loaded.ses_1[0].options?.attachments?.[0].url, 'data:image/png;base64,aaa')
    savePersistedQueue(storage, {})
    assert.equal(loadPersistedQueue(storage).ses_1, undefined)
  })

  it('ignores corrupt queue storage', () => {
    const storage = { getItem: () => '{', setItem: () => {}, removeItem: () => {} }
    assert.deepEqual(loadPersistedQueue(storage), {})
  })

  it('does not throw when session storage rejects the write', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {},
    }
    const item = createQueuedMessage('keep in memory', undefined, 1)
    assert.doesNotThrow(() => savePersistedQueue(storage, { ses_1: [item] }))
  })
})
