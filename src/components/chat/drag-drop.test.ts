import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  categorizeDroppedFiles,
  formatFileMentions,
  hasFilePayload,
} from './drag-drop'

describe('drag-drop utilities', () => {
  describe('hasFilePayload', () => {
    it('returns false for null dataTransfer', () => {
      assert.equal(hasFilePayload(null), false)
    })

    it('returns false when types does not include Files', () => {
      const mockDT = { types: ['text/plain'] } as unknown as DataTransfer
      assert.equal(hasFilePayload(mockDT), false)
    })

    it('returns true when types includes Files', () => {
      const mockDT = { types: ['Files', 'text/plain'] } as unknown as DataTransfer
      assert.equal(hasFilePayload(mockDT), true)
    })
  })

  describe('categorizeDroppedFiles', () => {
    it('separates image files from other files by mime type or extension', () => {
      const img1 = new File([''], 'screenshot.png', { type: 'image/png' })
      const img2 = new File([''], 'photo.jpg', { type: '' }) // ext fallback
      const logFile = new File([''], 'debug.log', { type: 'text/plain' })
      const codeFile = new File([''], 'App.tsx', { type: '' })

      const result = categorizeDroppedFiles([img1, img2, logFile, codeFile])

      assert.equal(result.imageFiles.length, 2)
      assert.equal(result.imageFiles[0].name, 'screenshot.png')
      assert.equal(result.imageFiles[1].name, 'photo.jpg')

      assert.equal(result.otherFiles.length, 2)
      assert.equal(result.otherFiles[0].name, 'debug.log')
      assert.equal(result.otherFiles[1].name, 'App.tsx')
    })
  })

  describe('formatFileMentions', () => {
    it('returns original text if file list is empty', () => {
      const res = formatFileMentions([], 'Hello world', 5)
      assert.equal(res.newText, 'Hello world')
      assert.equal(res.newCursorPosition, 5)
    })

    it('inserts single file mention into empty text', () => {
      const file = new File([''], 'error.log')
      const res = formatFileMentions([file], '', 0)
      assert.equal(res.newText, '@error.log ')
      assert.equal(res.newCursorPosition, 11)
    })

    it('inserts single file mention at end of text with space padding', () => {
      const file = new File([''], 'config.json')
      const res = formatFileMentions([file], 'Check this', 10)
      assert.equal(res.newText, 'Check this @config.json ')
      assert.equal(res.newCursorPosition, 24)
    })

    it('inserts multiple file mentions', () => {
      const f1 = new File([''], 'a.ts')
      const f2 = new File([''], 'b.ts')
      const res = formatFileMentions([f1, f2], 'Look at: ', 9)
      assert.equal(res.newText, 'Look at: @a.ts @b.ts ')
      assert.equal(res.newCursorPosition, 21)
    })

    it('inserts in the middle of text preserving boundary spaces', () => {
      const file = new File([''], 'main.rs')
      const res = formatFileMentions([file], 'Compare with target', 12)
      // "Compare with" (len 12), cursor at 12
      // Should result in "Compare with @main.rs target"
      assert.equal(res.newText, 'Compare with @main.rs target')
      assert.equal(res.newCursorPosition, 21)
    })
  })
})
