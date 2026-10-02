import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { LightboxImage } from './ImageLightboxModal'

describe('ImageLightbox & Thumbnail Data Structures', () => {
  it('validates lightbox image items and indexing', () => {
    const images: LightboxImage[] = [
      { id: 'img1', url: 'data:image/png;base64,aaa', filename: 'photo1.png' },
      { id: 'img2', url: 'https://example.com/img2.jpg', filename: 'screenshot.jpg' },
      { id: 'img3', url: 'https://example.com/img3.webp' },
    ]

    assert.equal(images.length, 3)
    assert.equal(images[0].filename, 'photo1.png')
    assert.equal(images[1].filename, 'screenshot.jpg')
    assert.equal(images[2].filename, undefined)

    // Index wrapping logic
    const nextIndex = (idx: number) => (idx + 1) % images.length
    const prevIndex = (idx: number) => (idx - 1 + images.length) % images.length

    assert.equal(nextIndex(0), 1)
    assert.equal(nextIndex(2), 0)
    assert.equal(prevIndex(0), 2)
    assert.equal(prevIndex(1), 0)
  })

  it('handles single-image array without wrapping navigation errors', () => {
    const single: LightboxImage[] = [
      { id: 'single_1', url: 'data:image/png;base64,123', filename: 'only.png' },
    ]

    const nextIndex = (idx: number) => (idx + 1) % single.length
    assert.equal(nextIndex(0), 0)
  })
})
