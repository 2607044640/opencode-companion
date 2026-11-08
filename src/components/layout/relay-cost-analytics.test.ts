import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateSmoothSvgPath,
  getProviderColor,
  PROVIDER_PALETTE,
} from './RelayCostAnalyticsModal'

describe('RelayCostAnalyticsModal helpers', () => {
  it('generates correct SVG smooth path for varying point counts', () => {
    assert.equal(generateSmoothSvgPath([]), '')
    assert.equal(generateSmoothSvgPath([{ x: 10, y: 20 }]), 'M 10 20')
    assert.equal(
      generateSmoothSvgPath([
        { x: 10, y: 20 },
        { x: 50, y: 80 },
      ]),
      'M 10 20 L 50 80'
    )

    const threePoints = [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 100 },
    ]
    const path3 = generateSmoothSvgPath(threePoints)
    assert.ok(path3.startsWith('M 0.0 0.0'))
    assert.ok(path3.includes('C'))
  })

  it('cycles colors from PROVIDER_PALETTE safely', () => {
    assert.equal(getProviderColor(0), PROVIDER_PALETTE[0])
    assert.equal(getProviderColor(1), PROVIDER_PALETTE[1])
    assert.equal(
      getProviderColor(PROVIDER_PALETTE.length),
      PROVIDER_PALETTE[0]
    )
  })
})
