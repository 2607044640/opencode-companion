// Zero-dependency configurable keyboard shortcuts service with localStorage persistence

export type ShortcutKind = 'combo' | 'double-press'

export type ShortcutCategory = 'map' | 'dialogue' | 'workspace' | 'general'
export type ShortcutFilterCategory = 'all' | ShortcutCategory

export interface ShortcutCategoryMeta {
  id: ShortcutFilterCategory
  labelZh: string
  labelEn: string
}

export const SHORTCUT_CATEGORIES: ShortcutCategoryMeta[] = [
  { id: 'all', labelZh: '全部 (All)', labelEn: 'All' },
  { id: 'map', labelZh: '地图 (Map)', labelEn: 'Map' },
  { id: 'dialogue', labelZh: '对话 (Dialogue)', labelEn: 'Dialogue' },
  { id: 'workspace', labelZh: '标签与会话 (Tabs)', labelEn: 'Tabs' },
  { id: 'general', labelZh: '通用 (General)', labelEn: 'General' },
]

export interface ShortcutItem {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  description: string
  label: string
  category?: ShortcutCategory
  kind?: ShortcutKind
  tapCount?: number
  intervalMs?: number
}

export interface ShortcutsMap {
  zenMode: ShortcutItem
  toggleSidebar: ShortcutItem
  newSession: ShortcutItem
  nextTab: ShortcutItem
  prevTab: ShortcutItem
  closeActiveTab: ShortcutItem
  reopenClosedTab: ShortcutItem
  focusSearch: ShortcutItem
  sendMessage: ShortcutItem
  newLine: ShortcutItem
  toggleMap: ShortcutItem
  addSessionToMap: ShortcutItem
  openSettings: ShortcutItem
  prevDialogue: ShortcutItem
  nextDialogue: ShortcutItem
  jumpToTop: ShortcutItem
  jumpToBottom: ShortcutItem
  mapUndo: ShortcutItem
  mapRedo: ShortcutItem
  mapFocus: ShortcutItem
  mapCommentGroup: ShortcutItem
  mapSelectAll: ShortcutItem
  mapHome: ShortcutItem
  mapRearrange: ShortcutItem
  findInPage: ShortcutItem
}

export const DEFAULT_SHORTCUTS: ShortcutsMap = {
  zenMode: {
    key: 'F11',
    description: '沉浸全屏阅读',
    label: 'F11',
    category: 'general',
  },
  prevDialogue: {
    key: 'ArrowUp',
    description: '向上浏览对话 (Jump to Previous Dialogue)',
    label: '↑',
    category: 'dialogue',
  },
  nextDialogue: {
    key: 'ArrowDown',
    description: '向下浏览对话 (Jump to Next Dialogue)',
    label: '↓',
    category: 'dialogue',
  },
  jumpToTop: {
    key: 'ArrowUp',
    description: '快速按两下 ↑ 跳转至最顶部 (Double-Tap to Top)',
    label: '双击 ↑',
    category: 'dialogue',
    kind: 'double-press',
    tapCount: 2,
    intervalMs: 350,
  },
  jumpToBottom: {
    key: 'ArrowDown',
    description: '快速按两下 ↓ 跳转至最底部 (Double-Tap to Bottom)',
    label: '双击 ↓',
    category: 'dialogue',
    kind: 'double-press',
    tapCount: 2,
    intervalMs: 350,
  },
  toggleSidebar: {
    key: 'b',
    ctrlKey: true,
    description: '切换侧边栏 (Toggle Sidebar)',
    label: 'Ctrl + B',
    category: 'general',
  },
  newSession: {
    key: 'n',
    ctrlKey: true,
    description: '新建当前工程会话 (New Session)',
    label: 'Ctrl + N',
    category: 'workspace',
  },
  nextTab: {
    key: 'Tab',
    ctrlKey: true,
    description: '切换至下一个会话标签 (Next Tab)',
    label: 'Ctrl + Tab',
    category: 'workspace',
  },
  prevTab: {
    key: 'Tab',
    ctrlKey: true,
    shiftKey: true,
    description: '切换至上一个会话标签 (Previous Tab)',
    label: 'Ctrl + Shift + Tab',
    category: 'workspace',
  },
  closeActiveTab: {
    key: 'w',
    ctrlKey: true,
    description: '关闭当前会话标签 (Close Tab)',
    label: 'Ctrl + W',
    category: 'workspace',
  },
  reopenClosedTab: {
    key: 't',
    ctrlKey: true,
    shiftKey: true,
    description: '重新打开刚刚关闭的标签 (Reopen Closed Tab)',
    label: 'Ctrl + Shift + T',
    category: 'workspace',
  },
  focusSearch: {
    key: 'k',
    ctrlKey: true,
    description: '搜索对话会话 (Search Sessions)',
    label: 'Ctrl + K',
    category: 'workspace',
  },
  findInPage: {
    key: 'f',
    ctrlKey: true,
    description: '在当前对话中查找 (Find in Page)',
    label: 'Ctrl + F',
    category: 'dialogue',
  },
  sendMessage: {
    key: 'Enter',
    description: '发送提示词 (Send Message)',
    label: 'Enter',
    category: 'dialogue',
  },
  newLine: {
    key: 'Enter',
    shiftKey: true,
    description: '输入框换行 (Insert Newline)',
    label: 'Shift + Enter',
    category: 'dialogue',
  },
  toggleMap: {
    key: 'm',
    ctrlKey: true,
    description: '在蓝图地图中定位当前会话 (Open & Locate in Map)',
    label: 'Ctrl + M',
    category: 'map',
  },
  addSessionToMap: {
    key: 'm',
    altKey: true,
    description: '放入蓝图地图 (不打开地图) (Add to Map)',
    label: 'Alt + M',
    category: 'map',
  },
  openSettings: {
    key: ',',
    ctrlKey: true,
    description: '打开设置面板 (Open Settings)',
    label: 'Ctrl + ,',
    category: 'general',
  },
  mapUndo: {
    key: 'z',
    ctrlKey: true,
    description: '撤销地图操作 (Map Undo)',
    label: 'Ctrl + Z',
    category: 'map',
  },
  mapRedo: {
    key: 'y',
    ctrlKey: true,
    description: '重做地图操作 (Map Redo)',
    label: 'Ctrl + Y',
    category: 'map',
  },
  mapFocus: {
    key: 'f',
    description: '聚焦选中节点 / 适应视野 (Focus/Fit)',
    label: 'F',
    category: 'map',
  },
  mapCommentGroup: {
    key: 'c',
    description: '创建蓝图注释组 (Comment Box)',
    label: 'C',
    category: 'map',
  },
  mapSelectAll: {
    key: 'a',
    ctrlKey: true,
    description: '全选地图卡片 (Select All Cards)',
    label: 'Ctrl + A',
    category: 'map',
  },
  mapHome: {
    key: 'Home',
    description: '回到蓝图原点概览 (Overview)',
    label: 'Home',
    category: 'map',
  },
  mapRearrange: {
    key: 'r',
    altKey: true,
    description: '整理蓝图拓扑 (Rearrange Graph)',
    label: 'Alt + R',
    category: 'map',
  },
}

export function filterShortcutKeys(
  shortcuts: ShortcutsMap,
  category: ShortcutFilterCategory = 'all',
  searchQuery = ''
): Array<keyof ShortcutsMap> {
  const q = searchQuery.trim().toLowerCase()
  return (Object.keys(shortcuts) as Array<keyof ShortcutsMap>).filter((k) => {
    const item = shortcuts[k]
    const itemCategory: ShortcutCategory = item.category || DEFAULT_SHORTCUTS[k]?.category || 'general'
    if (category !== 'all' && itemCategory !== category) {
      return false
    }
    if (!q) return true
    return (
      item.description.toLowerCase().includes(q) ||
      item.label.toLowerCase().includes(q) ||
      k.toLowerCase().includes(q)
    )
  })
}

const STORAGE_KEY = 'opencode_companion_shortcuts'

export function getShortcuts(): ShortcutsMap {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        const merged: ShortcutsMap = { ...DEFAULT_SHORTCUTS, ...parsed }
        // Ensure all required default shortcuts exist, have valid keys, and preserve canonical category
        for (const k of Object.keys(DEFAULT_SHORTCUTS) as (keyof ShortcutsMap)[]) {
          if (!merged[k] || !merged[k].key) {
            merged[k] = DEFAULT_SHORTCUTS[k]
          } else {
            merged[k] = {
              ...DEFAULT_SHORTCUTS[k],
              ...merged[k],
              category: DEFAULT_SHORTCUTS[k].category,
            }
          }
        }
        return merged
      }
    }
  } catch (err) {
    console.warn('Failed to read shortcuts from localStorage:', err)
  }
  return DEFAULT_SHORTCUTS
}

export function saveShortcuts(shortcuts: ShortcutsMap): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts))
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shortcuts-updated', { detail: shortcuts }))
    }
  } catch (err) {
    console.warn('Failed to save shortcuts to localStorage:', err)
  }
}

export function resetShortcuts(): ShortcutsMap {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shortcuts-updated', { detail: DEFAULT_SHORTCUTS }))
    }
  } catch (err) {
    console.warn('Failed to reset shortcuts in localStorage:', err)
  }
  return DEFAULT_SHORTCUTS
}

/**
 * Detects whether an IME composition is active or within the post-composition confirmation cooldown.
 * Shields against Windows Chromium/Electron emitting keydown(Enter) immediately after compositionend.
 */
export function isIMEActive(
  e: KeyboardEvent | React.KeyboardEvent,
  isComposingRef = false,
  lastCompositionEndTime = 0,
  cooldownMs = 60
): boolean {
  const isComp = 'nativeEvent' in e ? (e.nativeEvent as any).isComposing : (e as any).isComposing
  return (
    isComposingRef ||
    Boolean(isComp) ||
    e.keyCode === 229 ||
    e.key === 'Process' ||
    (lastCompositionEndTime > 0 && Date.now() - lastCompositionEndTime < cooldownMs)
  )
}

export function matchesShortcut(
  e: KeyboardEvent | React.KeyboardEvent,
  shortcut?: ShortcutItem | null
): boolean {
  if (!shortcut || !shortcut.key) return false

  // Reject shortcut match during IME composition (Windows/macOS IME Process key / composition state)
  const isComp = 'nativeEvent' in e ? (e.nativeEvent as any).isComposing : (e as any).isComposing
  if (Boolean(isComp) || e.keyCode === 229 || e.key === 'Process') {
    return false
  }

  const matchCtrl = shortcut.ctrlKey ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey)
  const matchShift = shortcut.shiftKey ? e.shiftKey : !e.shiftKey
  const matchAlt = shortcut.altKey ? e.altKey : !e.altKey

  const targetKey = shortcut.key.toLowerCase()
  const eventKey = (e.key || '').toLowerCase()
  const eventCode = (e.code || '').toLowerCase()

  const matchKey =
    eventKey === targetKey ||
    eventCode === `key${targetKey}` ||
    eventCode === targetKey ||
    (targetKey.length === 1 && typeof e.keyCode === 'number' && e.keyCode === targetKey.toUpperCase().charCodeAt(0))

  return Boolean(matchKey && matchCtrl && matchShift && matchAlt)
}

/**
 * Checks if the target element is an editable input or textarea.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target) return false
  const el = target as Partial<HTMLElement>
  const tagName = typeof el.tagName === 'string' ? el.tagName.toLowerCase() : ''
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return true
  if (Boolean(el.isContentEditable)) return true
  return false
}

/**
 * Creates an isolated tracker for multi-tap / double-press shortcut events.
 */
export function createDoubleTapTracker() {
  let lastKey: string | null = null
  let lastTime = 0

  return {
    check(
      e: KeyboardEvent | React.KeyboardEvent,
      shortcut?: ShortcutItem | null
    ): boolean {
      if (!shortcut || shortcut.kind !== 'double-press') return false
      if (e.repeat) return false

      const matchCtrl = shortcut.ctrlKey ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey)
      const matchShift = shortcut.shiftKey ? e.shiftKey : !e.shiftKey
      const matchAlt = shortcut.altKey ? e.altKey : !e.altKey
      if (!matchCtrl || !matchShift || !matchAlt) {
        lastKey = null
        lastTime = 0
        return false
      }

      const targetKey = shortcut.key.toLowerCase()
      const eventKey = (e.key || '').toLowerCase()
      if (eventKey !== targetKey) {
        return false
      }

      const now = Date.now()
      const interval = shortcut.intervalMs || 350
      if (lastKey === targetKey && now - lastTime <= interval) {
        lastKey = null
        lastTime = 0
        return true
      }

      lastKey = targetKey
      lastTime = now
      return false
    },
    reset() {
      lastKey = null
      lastTime = 0
    },
  }
}

/**
 * Checks if any modal, overlay, dialog, drawer, or dropdown is currently active in the DOM.
 * Used by timeline navigation and other background handlers to avoid hijacking keys.
 */
export function hasActiveOverlay(customDoc?: Document): boolean {
  const doc = customDoc || (typeof document !== 'undefined' ? document : undefined)
  if (!doc) return false

  return Boolean(
    doc.querySelector('[role="dialog"]') ||
    doc.querySelector('[aria-modal="true"]') ||
    doc.querySelector('.fixed.inset-0') ||
    doc.querySelector('[data-modal]') ||
    doc.querySelector('[data-floating-modal]') ||
    doc.querySelector('.modal-backdrop') ||
    doc.querySelector('[data-context-menu]') ||
    doc.querySelector('[data-model-menu]') ||
    doc.querySelector('[data-popover]')
  )
}

