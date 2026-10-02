import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createQueuedMessage,
  dequeueFirst,
  enqueueMessage,
  queuedImageAttachments,
  removeQueuedMessage,
  shouldAutoDispatchQueue,
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

  it('auto-sends only on a clean finish', () => {
    assert.equal(
      shouldAutoDispatchQueue({ assistantHasError: false, streamError: null, userAborted: false }),
      true
    )
  })

  it('pauses when the assistant message has an error', () => {
    assert.equal(
      shouldAutoDispatchQueue({ assistantHasError: true, streamError: null, userAborted: false }),
      false
    )
  })

  it('pauses when the stream reports an API or fuse error', () => {
    assert.equal(
      shouldAutoDispatchQueue({
        assistantHasError: false,
        streamError: 'Session error occurred',
        userAborted: false,
      }),
      false
    )
  })

  it('does not auto-send after the user stops generation', () => {
    assert.equal(
      shouldAutoDispatchQueue({ assistantHasError: false, streamError: null, userAborted: true }),
      false
    )
  })

  it('keeps only image attachments that have a url', () => {
    const item = createQueuedMessage('look', {
      attachments: [
        { mime: 'image/png', url: 'data:image/png;base64,aaa', name: 'a.png' },
        { mime: 'image/jpeg', url: '', name: 'empty.jpg' },
        { mime: 'text/plain', url: 'data:text/plain,hi', name: 'note.txt' },
      ],
    }, 1)
    const images = queuedImageAttachments(item)
    assert.equal(images.length, 1)
    assert.equal(images[0].name, 'a.png')
  })

  it('returns no thumbnails when the queue item has no attachments', () => {
    assert.deepEqual(queuedImageAttachments(createQueuedMessage('text only', undefined, 1)), [])
  })
})
