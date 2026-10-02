import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { api } from './api'

describe('api.sendPrompt multimodal & attachment handling', () => {
  test('converts string input and attachments into file parts and text part', async () => {
    const originalFetch = globalThis.fetch
    const calls: Array<{ url: string; body: any }> = []

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })
      return new Response(null, { status: 204 })
    }) as any

    try {
      const sessionID = 'ses_test123'
      const text = '你能看到图片内容吗'
      const attachments = [
        {
          id: 'att_1',
          name: 'screenshot.png',
          mime: 'image/png',
          url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        },
      ]

      await api.sendPrompt(sessionID, text, { attachments })

      const promptCall = calls.find((c) => c.url.includes(`/session/${sessionID}/prompt_async`))
      assert.ok(promptCall, 'prompt_async was called')
      assert.equal(promptCall.body.parts.length, 2)
      assert.deepEqual(promptCall.body.parts[0], {
        type: 'file',
        mime: 'image/png',
        filename: 'screenshot.png',
        url: attachments[0].url,
      })
      assert.deepEqual(promptCall.body.parts[1], {
        type: 'text',
        text: '你能看到图片内容吗',
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('handles image-only input with empty text', async () => {
    const originalFetch = globalThis.fetch
    const calls: Array<{ url: string; body: any }> = []

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })
      return new Response(null, { status: 204 })
    }) as any

    try {
      const sessionID = 'ses_image_only'
      const attachments = [
        {
          name: 'diagram.jpg',
          mime: 'image/jpeg',
          url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
        },
      ]

      await api.sendPrompt(sessionID, '', { attachments })

      const promptCall = calls.find((c) => c.url.includes(`/session/${sessionID}/prompt_async`))
      assert.ok(promptCall, 'prompt_async was called')
      assert.equal(promptCall.body.parts.length, 1)
      assert.deepEqual(promptCall.body.parts[0], {
        type: 'file',
        mime: 'image/jpeg',
        filename: 'diagram.jpg',
        url: attachments[0].url,
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('handles plain text input with no attachments', async () => {
    const originalFetch = globalThis.fetch
    const calls: Array<{ url: string; body: any }> = []

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })
      return new Response(null, { status: 204 })
    }) as any

    try {
      const sessionID = 'ses_plain_text'
      const text = 'Hello world'

      await api.sendPrompt(sessionID, text)

      const promptCall = calls.find((c) => c.url.includes(`/session/${sessionID}/prompt_async`))
      assert.ok(promptCall, 'prompt_async was called')
      assert.deepEqual(promptCall.body.parts, [{ type: 'text', text: 'Hello world' }])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('passes MessagePartInput[] array directly without alteration', async () => {
    const originalFetch = globalThis.fetch
    const calls: Array<{ url: string; body: any }> = []

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })
      return new Response(null, { status: 204 })
    }) as any

    try {
      const sessionID = 'ses_parts_array'
      const rawParts = [
        { type: 'file' as const, mime: 'image/png', url: 'data:image/png;base64,123', filename: 'foo.png' },
        { type: 'text' as const, text: 'Custom parts' },
      ]

      await api.sendPrompt(sessionID, rawParts)

      const promptCall = calls.find((c) => c.url.includes(`/session/${sessionID}/prompt_async`))
      assert.ok(promptCall, 'prompt_async was called')
      assert.deepEqual(promptCall.body.parts, rawParts)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('passes agent and model options correctly', async () => {
    const originalFetch = globalThis.fetch
    const calls: Array<{ url: string; body: any }> = []

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })
      return new Response(null, { status: 204 })
    }) as any

    try {
      const sessionID = 'ses_agent_model'
      await api.sendPrompt(sessionID, 'test prompt', {
        agent: 'build',
        model: { providerID: 'obsidian', modelID: 'grok-4.7' },
      })

      const promptCall = calls.find((c) => c.url.includes(`/session/${sessionID}/prompt_async`))
      assert.ok(promptCall, 'prompt_async was called')
      assert.equal(promptCall.body.agent, 'build')
      assert.deepEqual(promptCall.body.model, { providerID: 'obsidian', modelID: 'grok-4.7' })
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
