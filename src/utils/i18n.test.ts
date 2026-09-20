import test, { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  getTranslations,
  tr,
  type SupportedLanguage,
  type TranslationDictionary,
} from './i18n'
import { resolveLanguage, resolveSystemLanguage } from './preferences'

describe('i18n and Multilingual Translation System', () => {
  const originalNavigator = globalThis.navigator

  afterEach(() => {
    // Restore global navigator
    if (originalNavigator !== undefined) {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      })
    } else {
      delete (globalThis as any).navigator
    }
  })

  function mockNavigatorLanguage(lang: string) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: lang },
      configurable: true,
      writable: true,
    })
  }

  describe('Language Resolution and System Detection', () => {
    it('detects German when system language starts with de', () => {
      mockNavigatorLanguage('de-DE')
      assert.equal(resolveSystemLanguage(), 'de-DE')
      mockNavigatorLanguage('de-AT')
      assert.equal(resolveSystemLanguage(), 'de-DE')
    })

    it('detects Chinese when system language starts with zh', () => {
      mockNavigatorLanguage('zh-CN')
      assert.equal(resolveSystemLanguage(), 'zh-CN')
      mockNavigatorLanguage('zh-TW')
      assert.equal(resolveSystemLanguage(), 'zh-CN')
    })

    it('defaults to English when system language is other (e.g. French, Japanese)', () => {
      mockNavigatorLanguage('fr-FR')
      assert.equal(resolveSystemLanguage(), 'en-US')
      mockNavigatorLanguage('ja-JP')
      assert.equal(resolveSystemLanguage(), 'en-US')
    })

    it('resolves explicit preferences directly', () => {
      assert.equal(resolveLanguage('zh-CN'), 'zh-CN')
      assert.equal(resolveLanguage('en-US'), 'en-US')
      assert.equal(resolveLanguage('de-DE'), 'de-DE')
    })

    it('resolves "system" preference using navigator', () => {
      mockNavigatorLanguage('de-DE')
      assert.equal(resolveLanguage('system'), 'de-DE')
      mockNavigatorLanguage('zh-CN')
      assert.equal(resolveLanguage('system'), 'zh-CN')
      mockNavigatorLanguage('en-GB')
      assert.equal(resolveLanguage('system'), 'en-US')
    })

    it('falls back safely for unknown inputs and undefined', () => {
      mockNavigatorLanguage('zh-CN')
      assert.equal(resolveLanguage(undefined), 'zh-CN')
      assert.equal(resolveLanguage('unknown-lang' as any), 'zh-CN')
    })
  })

  describe('Translation Dictionaries Completeness', () => {
    it('provides valid dictionaries for zh-CN, en-US, and de-DE', () => {
      const zh = getTranslations('zh-CN')
      const en = getTranslations('en-US')
      const de = getTranslations('de-DE')

      assert.ok(zh)
      assert.ok(en)
      assert.ok(de)
    })

    it('contains all required new chat keys in all dictionaries', () => {
      const requiredChatKeys: Array<keyof TranslationDictionary['chat']> = [
        'modelReportTitle',
        'expandReport',
        'collapseReport',
        'expandFullReport',
        'collapseFullReport',
        'clickToExpandReport',
        'expandPrompt',
        'collapsePrompt',
        'copyPrompt',
        'copyPromptSuccess',
        'expandFullPrompt',
        'collapseFullPrompt',
        'clickToExpandPrompt',
        'thinkingProcess',
        'switchSessionTitle',
      ]

      for (const lang of ['zh-CN', 'en-US', 'de-DE'] as SupportedLanguage[]) {
        const dict = getTranslations(lang)
        for (const key of requiredChatKeys) {
          const val = dict.chat[key]
          assert.ok(val, `Missing key "${key}" in language "${lang}"`)
          assert.equal(typeof val, 'string', `Key "${key}" must be string in "${lang}"`)
        }
      }
    })

    it('contains German translations matching core settings and navigation', () => {
      const de = getTranslations('de-DE')
      assert.equal(de.common.cancel, 'Abbrechen')
      assert.equal(de.common.confirm, 'Bestätigen')
      assert.equal(de.common.close, 'Schließen')
      assert.equal(de.settings.title, 'Einstellungen')
      assert.ok(de.settings.floatingDiffViewLabel)
      assert.ok(getTranslations('zh-CN').settings.floatingDiffViewLabel)
      assert.ok(getTranslations('en-US').settings.floatingDiffViewLabel)
      assert.equal(de.chat.modelReportTitle, 'Modellantwort / Bericht')
      assert.equal(de.chat.expandReport, 'Ausklappen')
      assert.equal(de.chat.collapseReport, 'Einklappen')
    })
  })

  describe('Universal tr(...) Translation Helper', () => {
    it('translates correctly with object input { zh, en, de }', () => {
      const text = {
        zh: '模型回答 / 汇报',
        en: 'Model Response / Report',
        de: 'Modellantwort / Bericht',
      }

      assert.equal(tr(text, 'zh-CN'), '模型回答 / 汇报')
      assert.equal(tr(text, 'en-US'), 'Model Response / Report')
      assert.equal(tr(text, 'de-DE'), 'Modellantwort / Bericht')
    })

    it('translates correctly with positional parameters tr(zh, en, de)', () => {
      assert.equal(tr('展开', 'Expand', 'Ausklappen', 'zh-CN'), '展开')
      assert.equal(tr('展开', 'Expand', 'Ausklappen', 'en-US'), 'Expand')
      assert.equal(tr('展开', 'Expand', 'Ausklappen', 'de-DE'), 'Ausklappen')
    })

    it('falls back German to English when German is omitted in object format', () => {
      const text = {
        zh: '快捷跳转',
        en: 'Quick Jump',
      }

      assert.equal(tr(text, 'zh-CN'), '快捷跳转')
      assert.equal(tr(text, 'en-US'), 'Quick Jump')
      assert.equal(tr(text, 'de-DE'), 'Quick Jump')
    })

    it('falls back German to English when German is omitted in positional format', () => {
      assert.equal(tr('收起', 'Collapse', undefined, 'de-DE'), 'Collapse')
    })

    it('falls back to Chinese when English is empty', () => {
      assert.equal(tr({ zh: '独有词汇', en: '' }, 'en-US'), '独有词汇')
      assert.equal(tr({ zh: '独有词汇', en: '' }, 'de-DE'), '独有词汇')
    })
  })
})
