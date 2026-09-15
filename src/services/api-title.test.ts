import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeSessionTitle, normalizeSession, extractRelayErrorMessage, normalizeMessageInfo } from './api'

describe('Session Title Sanitization & Normalization', () => {
  it('sanitizes whitespace-only titles to default fallback', () => {
    assert.equal(sanitizeSessionTitle(' '), 'Untitled Session')
    assert.equal(sanitizeSessionTitle('   '), 'Untitled Session')
    assert.equal(sanitizeSessionTitle('\t'), 'Untitled Session')
    assert.equal(sanitizeSessionTitle('\n\r'), 'Untitled Session')
    assert.equal(sanitizeSessionTitle('\u00a0'), 'Untitled Session')
  })

  it('preserves valid titles and trims surrounding whitespace', () => {
    assert.equal(sanitizeSessionTitle('  Hello World  '), 'Hello World')
    assert.equal(sanitizeSessionTitle('Code Audit [APISpace]'), 'Code Audit [APISpace]')
  })

  it('handles non-string or falsy values safely', () => {
    assert.equal(sanitizeSessionTitle(null), 'Untitled Session')
    assert.equal(sanitizeSessionTitle(undefined), 'Untitled Session')
    assert.equal(sanitizeSessionTitle(0), '0')
    assert.equal(sanitizeSessionTitle(false), 'false')
    assert.equal(sanitizeSessionTitle('', 'Custom Fallback'), 'Custom Fallback')
  })

  it('normalizes session title without leaking whitespace', () => {
    const s1 = normalizeSession({ id: 's1', title: ' ' })
    assert.equal(s1.title, 'Untitled Session')

    const s2 = normalizeSession({ id: 's2', title: '\t' })
    assert.equal(s2.title, 'Untitled Session')

    const s3 = normalizeSession({ id: 's3', title: '  Real Coding Task  ' })
    assert.equal(s3.title, 'Real Coding Task')

    const s4 = normalizeSession({ id: 's4', title: '', slug: 'ses_abc' })
    assert.equal(s4.title, 'Untitled Session')
  })
})

describe('Relay Error Extraction and Normalization', () => {
  it('extracts nested error message from relay JSON responseBody', () => {
    const error = {
      name: 'APIError',
      data: {
        statusCode: 429,
        responseBody: JSON.stringify({
          error: {
            message: 'You exceeded your current quota, please check your plan and billing details.',
            type: 'insufficient_quota',
          },
        }),
      },
    }
    const msg = extractRelayErrorMessage(error)
    assert.equal(
      msg,
      '[HTTP 429] You exceeded your current quota, please check your plan and billing details.'
    )
  })

  it('extracts top-level message from relay JSON responseBody', () => {
    const error = {
      name: 'APIError',
      data: {
        statusCode: 502,
        responseBody: JSON.stringify({
          message: 'Bad gateway: upstream LLM provider timed out after 60s',
        }),
      },
    }
    const msg = extractRelayErrorMessage(error)
    assert.equal(msg, '[HTTP 502] Bad gateway: upstream LLM provider timed out after 60s')
  })

  it('handles plain text responseBody safely', () => {
    const error = {
      name: 'APIError',
      data: {
        statusCode: 503,
        responseBody: 'Service Temporarily Unavailable',
      },
    }
    const msg = extractRelayErrorMessage(error)
    assert.equal(msg, '[HTTP 503] Service Temporarily Unavailable')
  })

  it('extracts data.message when responseBody is absent', () => {
    const error = {
      name: 'ProviderAuthError',
      data: {
        providerID: 'tokenshop',
        message: 'Invalid API Key provided',
      },
    }
    const msg = extractRelayErrorMessage(error)
    assert.equal(msg, 'Invalid API Key provided')
  })

  it('handles plain string error', () => {
    assert.equal(extractRelayErrorMessage('Network connection dropped'), 'Network connection dropped')
  })

  it('handles null or undefined error safely', () => {
    assert.equal(extractRelayErrorMessage(null), '')
    assert.equal(extractRelayErrorMessage(undefined), '')
  })

  it('normalizeMessageInfo preserves error structure', () => {
    const raw = {
      id: 'msg_test_1',
      sessionID: 'ses_1',
      role: 'assistant',
      error: {
        name: 'APIError',
        message: 'Relay timeout',
        statusCode: 504,
        data: {
          statusCode: 504,
          responseBody: 'Gateway Timeout',
        },
      },
    }

    const normalized = normalizeMessageInfo(raw)
    assert.ok(normalized.error)
    assert.equal(normalized.error.name, 'APIError')
    assert.equal(normalized.error.statusCode, 504)
    assert.equal(normalized.error.data?.responseBody, 'Gateway Timeout')
  })

  it('normalizeMessageInfo leaves error undefined when raw has no error', () => {
    const raw = {
      id: 'msg_test_2',
      sessionID: 'ses_2',
      role: 'assistant',
    }

    const normalized = normalizeMessageInfo(raw)
    assert.equal(normalized.error, undefined)
  })
})
