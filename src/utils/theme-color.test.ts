import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveTitlebarColor,
  syncTitlebarThemeColor,
  DEFAULT_LIGHT_TITLEBAR_COLOR,
  DARK_TITLEBAR_COLOR,
  TRANSLUCENT_TITLEBAR_COLOR,
} from './theme-color'

describe('theme-color titlebar utilities', () => {
  it('resolves light titlebar by default', () => {
    assert.equal(resolveTitlebarColor(), DEFAULT_LIGHT_TITLEBAR_COLOR)
    assert.equal(resolveTitlebarColor({ lightTitlebar: true }), DEFAULT_LIGHT_TITLEBAR_COLOR)
  })

  it('resolves dark titlebar when lightTitlebar is explicitly false', () => {
    assert.equal(resolveTitlebarColor({ lightTitlebar: false }), DARK_TITLEBAR_COLOR)
  })

  it('resolves translucent titlebar color when translucentUiChrome is enabled', () => {
    assert.equal(
      resolveTitlebarColor({ translucentUiChrome: true }),
      TRANSLUCENT_TITLEBAR_COLOR
    )
  })

  it('updates meta tag content cleanly with mock document', () => {
    const metaElement = {
      content: '',
      setAttribute(k: string, v: string) {
        if (k === 'content') this.content = v
      },
    }
    const mockDoc = {
      querySelector: (selector: string) => {
        if (selector === 'meta[name="theme-color"]') return metaElement
        return null
      },
      createElement: () => metaElement,
      head: {
        appendChild: () => {},
      },
    }

    syncTitlebarThemeColor('#252936', mockDoc as any)
    assert.equal(metaElement.content, '#252936')
  })
})
