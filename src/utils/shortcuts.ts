// Zero-dependency configurable keyboard shortcuts service with localStorage persistence

export interface ShortcutItem {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  description: string
  label: string
  category?: 'general' | 'map'
}

export interface ShortcutsMap {
  zenMode: ShortcutItem
  toggleSidebar: ShortcutItem
  newSession: ShortcutItem
  focusSearch: ShortcutItem
  sendMessage: ShortcutItem
  newLine: ShortcutItem
  toggleMap: ShortcutItem
  openSettings: ShortcutItem
  mapUndo: ShortcutItem
  mapRedo: ShortcutItem
  mapFocus: ShortcutItem
  mapCommentGroup: ShortcutItem
  mapSelectAll: ShortcutItem
  mapHome: ShortcutItem
  mapRearrange: ShortcutItem
}

export const DEFAULT_SHORTCUTS: ShortcutsMap = {
  zenMode: {
    key: 'F11',
    description: '沉浸全屏阅读',
    label: 'F11',
    category: 'general',
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
    category: 'general',
  },
  focusSearch: {
    key: 'k',
    ctrlKey: true,
    description: '搜索对话会话 (Search Sessions)',
    label: 'Ctrl + K',
    category: 'general',
  },
  sendMessage: {
    key: 'Enter',
    description: '发送提示词 (Send Message)',
    label: 'Enter',
    category: 'general',
  },
  newLine: {
    key: 'Enter',
    shiftKey: true,
    description: '输入框换行 (Insert Newline)',
    label: 'Shift + Enter',
    category: 'general',
  },
  toggleMap: {
    key: 'm',
    ctrlKey: true,
    description: '打开/关闭对话蓝图地图 (Toggle Map)',
    label: 'Ctrl + M',
    category: 'general',
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

const STORAGE_KEY = 'opencode_companion_shortcuts'

export function getShortcuts(): ShortcutsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const merged: ShortcutsMap = { ...DEFAULT_SHORTCUTS, ...parsed }
      // Ensure all required default shortcuts exist and have valid keys
      for (const k of Object.keys(DEFAULT_SHORTCUTS) as (keyof ShortcutsMap)[]) {
        if (!merged[k] || !merged[k].key) {
          merged[k] = DEFAULT_SHORTCUTS[k]
        }
      }
      return merged
    }
  } catch (err) {
    console.warn('Failed to read shortcuts from localStorage:', err)
  }
  return DEFAULT_SHORTCUTS
}

export function saveShortcuts(shortcuts: ShortcutsMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts))
    window.dispatchEvent(new CustomEvent('shortcuts-updated', { detail: shortcuts }))
  } catch (err) {
    console.warn('Failed to save shortcuts to localStorage:', err)
  }
}

export function resetShortcuts(): ShortcutsMap {
  try {
    localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new CustomEvent('shortcuts-updated', { detail: DEFAULT_SHORTCUTS }))
  } catch (err) {
    console.warn('Failed to reset shortcuts in localStorage:', err)
  }
  return DEFAULT_SHORTCUTS
}

export function matchesShortcut(
  e: KeyboardEvent | React.KeyboardEvent,
  shortcut?: ShortcutItem | null
): boolean {
  if (!shortcut || !shortcut.key || !e.key) return false
  const matchCtrl = shortcut.ctrlKey ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey)
  const matchShift = shortcut.shiftKey ? e.shiftKey : !e.shiftKey
  const matchAlt = shortcut.altKey ? e.altKey : !e.altKey
  const matchKey = e.key.toLowerCase() === shortcut.key.toLowerCase()

  return matchKey && matchCtrl && matchShift && matchAlt
}
