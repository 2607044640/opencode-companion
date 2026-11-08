import test from 'node:test'
import assert from 'node:assert/strict'
import { formatUserMessageTime, formatAbsoluteUserTime } from './MessageBubble'

test('formatUserMessageTime formats timestamps within 48 hours as relative (e.g. 2m ago, 2h ago, 27h ago)', () => {
  // Invalid or missing inputs
  assert.equal(formatUserMessageTime(undefined), '')
  assert.equal(formatUserMessageTime(0), '')
  assert.equal(formatUserMessageTime(NaN), '')

  const now = 1794144000000 // Fixed reference time

  // 1. Within 1 minute (< 60s): 'just now'
  const justNowTime = now - 25 * 1000
  assert.equal(formatUserMessageTime(justNowTime, now), 'just now')

  // 2. 2 minutes ago: '2m ago'
  const twoMinsTime = now - 2 * 60 * 1000
  assert.equal(formatUserMessageTime(twoMinsTime, now), '2m ago')

  // 3. 2 hours ago: '2h ago' (Matches user screenshot 2)
  const twoHoursTime = now - 2 * 3600 * 1000
  assert.equal(formatUserMessageTime(twoHoursTime, now), '2h ago')

  // 4. 27 hours ago: '27h ago' (Matches user prompt example)
  const twentySevenHoursTime = now - 27 * 3600 * 1000
  assert.equal(formatUserMessageTime(twentySevenHoursTime, now), '27h ago')

  // 5. 47 hours ago: '47h ago'
  const fortySevenHoursTime = now - 47 * 3600 * 1000
  assert.equal(formatUserMessageTime(fortySevenHoursTime, now), '47h ago')

  // 6. Beyond 48 hours: falls back to absolute 26.MM.DD HH:mm format
  const fortyNineHoursTime = now - 49 * 3600 * 1000
  const formattedOlder = formatUserMessageTime(fortyNineHoursTime, now)
  assert.equal(formattedOlder, formatAbsoluteUserTime(fortyNineHoursTime))
  assert.ok(/^\d{2}\.\d{2}\.\d{2} \d{2}:\d{2}$/.test(formattedOlder))

  // 7. Seconds-based timestamps support (< 1e11)
  const secondsTimestamp = Math.floor((now - 2 * 3600 * 1000) / 1000)
  assert.equal(formatUserMessageTime(secondsTimestamp, now), '2h ago')
})

test('formatAbsoluteUserTime formats timestamps in 26.MM.DD HH:mm 24-hour format', () => {
  assert.equal(formatAbsoluteUserTime(undefined), '')
  assert.equal(formatAbsoluteUserTime(0), '')

  const testDate = new Date(2026, 10, 8, 23, 11, 45) // 2026-11-08 23:11
  assert.equal(formatAbsoluteUserTime(testDate.getTime()), '26.11.08 23:11')

  const morningDate = new Date(2026, 0, 5, 9, 5, 0) // 2026-01-05 09:05
  assert.equal(formatAbsoluteUserTime(morningDate.getTime()), '26.01.05 09:05')
})
