import { usePreferences } from './preferences'

export type SupportedLanguage = 'zh-CN' | 'en-US'

export interface TranslationDictionary {
  common: {
    cancel: string
    confirm: string
    close: string
    save: string
    delete: string
    reset: string
    search: string
    loading: string
    all: string
    error: string
    retry: string
    success: string
  }
  header: {
    hideSidebar: string
    showSidebar: string
    copyJson: string
    revert: string
    revertTitle: string
    idle: string
    generating: string
    retrying: (attempt: number) => string
    newTab: string
    closeTab: string
    tokensIn: string
    tokensOut: string
    tokensReasoning: string
    tokensCache: string
    securityBoundary: string
    tokenBreakdownTitle: string
    tokenTotal: string
    tokenPrompt: string
    tokenCompletion: string
    tokenHoverTooltip: string
    workspaceDir: string
    backendReady: string
    copyJsonTooltip: string
    copyJsonSuccess: string
    exportSuccess: string
    noActiveSession: string
  }
  zen: {
    exitZenTitle: (shortcut?: string) => string
    exitZenLabel: string
  }
  search: {
    placeholder: string
    clearInput: string
    filterByProject: string
    allProjects: string
    close: string
    noSessionsFound: string
    noSessionsHint: string
    searchNoResults: (query: string) => string
    searchTryOther: string
    timeJustNow: string
    timeMinutesAgo: (n: number) => string
    timeHoursAgo: (n: number) => string
    timeYesterday: string
    timeDaysAgo: (n: number) => string
  }
  settings: {
    title: string
    desktopSection: string
    serverSection: string
    generalTab: string
    shortcutsTab: string
    daemonTab: string
    modelsTab: string
    languageLabel: string
    languageDesc: string
    autoAcceptLabel: string
    autoAcceptDesc: string
    showReasoningLabel: string
    showReasoningDesc: string
    autoCollapsePromptLabel: string
    autoCollapsePromptDesc: string
    collapseToolBatchLabel: string
    collapseToolBatchDesc: string
    expandShellLabel: string
    expandShellDesc: string
    expandEditLabel: string
    expandEditDesc: string
    showModelSelectorLabel: string
    showModelSelectorDesc: string
    showTimelineQuickJumpLabel: string
    showTimelineQuickJumpDesc: string
    quickJumpUpTooltip: string
    quickJumpDownTooltip: string
    shortcutsTitle: string
    shortcutsDesc: string
    resetShortcutsBtn: string
    categoryAll: string
    categoryGeneral: string
    categoryMap: string
    searchShortcutsPlaceholder: string
    pressKeyPrompt: string
    clickToRebind: string
    daemonTitle: string
    targetEndpoint: string
    locked127: string
    daemonLoopbackDesc: string
    testHealth: string
    onlineReady: string
    unreachable: string
    threatWarningTitle: string
    threatWarningDesc: string
    proxyTokenTitle: string
    proxyTokenDesc: string
    proxyTokenPlaceholder: string
    modelsTitle: string
    modelsDesc: string
    resetModalTitle: string
    resetModalDesc1: string
    resetModalDesc2: string
    resetModalConfirm: string
    tagGlobal: string
    tagMap: string
  }
  chat: {
    undoUpToThisPoint: string
    revertedBadge: string
    revertDivider: string
    revertBannerTitle: (time?: string) => string
    revertBannerDesc: string
    unrevertBtn: string
    reverting: string
    unreverting: string
    hideModelUI: string
    showModelUI: string
    confirmUndoTitle: string
    confirmUndoBtn: string
    loadingDiff: string
    noFilesAffected: string
    rolledBackCount: (count: number) => string
    restoreMessage: string
    restoringMessage: string
    expandRolledBack: string
    collapseRolledBack: string
    revertModeBothTitle: string
    revertModeBothDesc: string
    revertModeConvOnlyTitle: string
    revertModeConvOnlyDesc: string
    revertModeCodeOnlyTitle: string
    revertModeCodeOnlyDesc: string
    revertModeSummarizeTitle: string
    revertModeSummarizeDesc: string
    noFilesModifiedBadge: string
  }
  models: {
    manageTitle: string
    manageSubtitle: string
    searchPlaceholder: string
    connectProvider: string
    noModelsFound: string
    manageBtn: string
  }
}

export const translations: Record<SupportedLanguage, TranslationDictionary> = {
  'zh-CN': {
    common: {
      cancel: '取消',
      confirm: '确认',
      close: '关闭',
      save: '保存',
      delete: '删除',
      reset: '重置',
      search: '搜索',
      loading: '加载中...',
      all: '全部',
      error: '错误',
      retry: '重试',
      success: '成功',
    },
    header: {
      hideSidebar: '收起侧边栏 (Ctrl+B)',
      showSidebar: '展开侧边栏 (Ctrl+B)',
      copyJson: '复制全部 JSON',
      revert: '撤回',
      revertTitle: '撤回最后一轮对话 (Revert last exchange)',
      idle: '空闲就绪',
      generating: '生成中...',
      retrying: (attempt: number) => `重试中 (${attempt})`,
      newTab: '新建会话标签',
      closeTab: '关闭标签',
      tokensIn: '提示词输入 Token',
      tokensOut: '生成输出 Token',
      tokensReasoning: '思考推理 Token',
      tokensCache: '缓存命中 Token',
      securityBoundary: '物理安全边界: 严格锁定至 127.0.0.1 (WSL2 零认证物理保护)',
      tokenBreakdownTitle: 'Token 消耗明细',
      tokenTotal: '总计',
      tokenPrompt: '📥 输入 (Prompt)',
      tokenCompletion: '📤 输出 (Completion)',
      tokenHoverTooltip: '悬停查看完整 Token 消耗与工作区明细',
      workspaceDir: '工作区',
      backendReady: '后端服务就绪',
      copyJsonTooltip: '复制会话全部 JSON (单击复制 · 长按 500ms 导出)',
      copyJsonSuccess: '已复制会话 JSON 到剪贴板！',
      exportSuccess: '已保存会话 JSON 到桌面！',
      noActiveSession: '无活跃会话',
    },
    zen: {
      exitZenTitle: (shortcut?: string) => `退出沉浸阅读模式 (按 ${shortcut || 'F11'} 或 Esc)`,
      exitZenLabel: '退出沉浸阅读',
    },
    search: {
      placeholder: '搜索会话 (按 ↑↓ 选择, Enter 打开, Esc 退出)...',
      clearInput: '清除输入',
      filterByProject: '按工程筛选',
      allProjects: '全部工程',
      close: '关闭 (Esc)',
      noSessionsFound: '暂无会话记录',
      noSessionsHint: '开启新会话以在此处检索历史记录',
      searchNoResults: (query: string) => `未找到与 "${query}" 匹配的会话`,
      searchTryOther: '尝试更换关键词或切换工程筛选',
      timeJustNow: '刚刚',
      timeMinutesAgo: (n: number) => `${n} 分钟前`,
      timeHoursAgo: (n: number) => `${n} 小时前`,
      timeYesterday: '昨天',
      timeDaysAgo: (n: number) => `${n} 天前`,
    },
    settings: {
      title: '设置',
      desktopSection: '桌面端',
      serverSection: '服务端',
      generalTab: '通用设置',
      shortcutsTab: '快捷键',
      daemonTab: '后端链接与安全',
      modelsTab: '模型',
      languageLabel: '界面语言',
      languageDesc: '切换 OpenCode Companion 的显示语言',
      autoAcceptLabel: '自动同意执行权限',
      autoAcceptDesc: '权限与工具调用请求将自动批准',
      showReasoningLabel: '显示模型思考过程',
      showReasoningDesc: '在时间线中以折叠卡片形式显示 DeepSeek / Grok 等模型的思考推理',
      autoCollapsePromptLabel: '自动收起过长的用户提示词',
      autoCollapsePromptDesc: '提示词超过 240 字或 4 行时自动收起并附带渐变遮罩，方便滑轮速读',
      collapseToolBatchLabel: '工具执行批次自动归拢',
      collapseToolBatchDesc: '连续 3 个及以上工具调用自动归拢为紧凑单行条，点击可随时展开',
      expandShellLabel: '默认展开 Shell 工具详情',
      expandShellDesc: '在时间线中默认展开终端命令输出详情',
      expandEditLabel: '默认展开文件修改详情',
      expandEditDesc: '在时间线中默认展开代码编辑与改动详情',
      showModelSelectorLabel: '显示底部提示词栏模型选择器',
      showModelSelectorDesc: '在底栏展示当前模型药丸胶囊与切换弹窗，关闭或按 Alt+M 可隐藏保持极简纯净',
      showTimelineQuickJumpLabel: '显示时间线快捷跳转悬浮按钮',
      showTimelineQuickJumpDesc: '在对话时间线右上角显示快捷跳转胶囊（支持点击与长按 1 秒极速跳转）',
      quickJumpUpTooltip: '点击：向上浏览对话 | 长按 1 秒：跳转到最顶部 (快捷键: ↑ / 双击 ↑)',
      quickJumpDownTooltip: '点击：向下浏览对话 | 长按 1 秒：直达最底部 (快捷键: ↓ / 双击 ↓)',
      shortcutsTitle: '键盘快捷键',
      shortcutsDesc: '查看并自定义全局与对话蓝图快捷键绑定',
      resetShortcutsBtn: '恢复默认值',
      categoryAll: '全部',
      categoryGeneral: '全局与对话',
      categoryMap: '蓝图地图',
      searchShortcutsPlaceholder: '搜索快捷键或功能...',
      pressKeyPrompt: '请按下按键组合... (Esc 取消)',
      clickToRebind: '点击重新绑定快捷键',
      daemonTitle: '后端链接与物理安全',
      targetEndpoint: '目标后端接口',
      locked127: '127.0.0.1 物理绑定',
      daemonLoopbackDesc: '直连 WSL2 (opencode-jail) 内部运行的 5001 端口 OpenCode daemon 服务。',
      testHealth: '测试连通性',
      onlineReady: '服务在线并就绪',
      unreachable: '无法连接',
      threatWarningTitle: '零认证物理威胁模型警示',
      threatWarningDesc: 'OpenCode daemon 无内置认证，提供 Bash 终端完全控制权 (/pty)、文件读取与修改能力。服务端与伴侣端均严格物理锁死至 127.0.0.1。切勿将 5001 或 5173 端口直接暴露至局域网或公网。',
      proxyTokenTitle: '反向代理认证 Token（可选）',
      proxyTokenDesc: '如果通过带身份认证的反向代理（如 Nginx Basic Auth 或 Tailscale funnel）访问，在此输入凭证：',
      proxyTokenPlaceholder: 'Bearer token / API key',
      modelsTitle: '可用模型提供方',
      modelsDesc: '已通过 OpenCode Daemon 连接至本地 New API / One API 网关。',
      resetModalTitle: '重置快捷键设置',
      resetModalDesc1: '确定要将所有键盘快捷键重置为系统默认值吗？',
      resetModalDesc2: '此操作将清除所有自定义绑定的全局和蓝图地图快捷键，恢复初始预设。',
      resetModalConfirm: '确定重置',
      tagGlobal: '全局',
      tagMap: '蓝图',
    },
    chat: {
      undoUpToThisPoint: '回退此点之后的所有改动 (Undo changes up to this point)',
      revertedBadge: '已回退',
      revertDivider: '已回退至此检查点',
      revertBannerTitle: (time?: string) => `会话已回退至 ${time || '选定消息'}，代码快照已恢复`,
      revertBannerDesc: '后续改动已原子撤销。如需恢复，可随时撤销回退。',
      unrevertBtn: '撤销回退 (Restore)',
      reverting: '正在回退...',
      unreverting: '正在恢复...',
      hideModelUI: '隐藏模型选择器 (Alt+M)',
      showModelUI: '显示模型选择器 (Alt+M)',
      confirmUndoTitle: 'Confirm Undo',
      confirmUndoBtn: 'Confirm',
      loadingDiff: '正在检查受影响文件...',
      noFilesAffected: '撤回此轮对话不会影响任何本地文件。',
      rolledBackCount: (count: number) => `${count} 条已回退消息`,
      restoreMessage: '恢复消息',
      restoringMessage: '正在恢复...',
      expandRolledBack: '展开已回退消息',
      collapseRolledBack: '折叠已回退消息',
      revertModeBothTitle: '回滚代码与对话 (默认)',
      revertModeBothDesc: '将磁盘代码恢复至该检查点快照，并将对话提示词还原至输入框。',
      revertModeConvOnlyTitle: '仅回滚对话 (保留本地代码)',
      revertModeConvOnlyDesc: '本地文件保持原样，仅将对话时间线回退，并将该轮提示词还原至输入框。',
      revertModeCodeOnlyTitle: '仅回滚代码 (保留对话)',
      revertModeCodeOnlyDesc: '将磁盘文件回滚至该检查点快照，但完整保留对话聊天记录。',
      revertModeSummarizeTitle: '压缩/总结上下文',
      revertModeSummarizeDesc: '调用 AI 对此检查点之前的对话进行摘要提炼，节省 Token，不改动代码。',
      noFilesModifiedBadge: '此模式不会修改任何本地磁盘文件。',
    },
    models: {
      manageTitle: '管理模型',
      manageSubtitle: '自定义模型选择器中显示的模型。',
      searchPlaceholder: '搜索模型',
      connectProvider: '连接提供商',
      noModelsFound: '未找到匹配的模型',
      manageBtn: '管理模型',
    },
  },
  'en-US': {
    common: {
      cancel: 'Cancel',
      confirm: 'Confirm',
      close: 'Close',
      save: 'Save',
      delete: 'Delete',
      reset: 'Reset',
      search: 'Search',
      loading: 'Loading...',
      all: 'All',
      error: 'Error',
      retry: 'Retry',
      success: 'Success',
    },
    header: {
      hideSidebar: 'Hide sidebar (Ctrl+B)',
      showSidebar: 'Show sidebar (Ctrl+B)',
      copyJson: 'Copy All JSON',
      revert: 'Revert',
      revertTitle: 'Revert last exchange',
      idle: 'Idle',
      generating: 'Generating...',
      retrying: (attempt: number) => `Retrying (${attempt})`,
      newTab: 'Open new tab session',
      closeTab: 'Close tab',
      tokensIn: 'Prompt input tokens',
      tokensOut: 'Generated output tokens',
      tokensReasoning: 'Reasoning tokens',
      tokensCache: 'Cache read tokens',
      securityBoundary: 'Security Boundary: Strictly bound to 127.0.0.1 (WSL2 daemon zero-auth protected)',
      tokenBreakdownTitle: 'Token Usage Breakdown',
      tokenTotal: 'Total',
      tokenPrompt: '📥 Prompt (Input)',
      tokenCompletion: '📤 Completion (Output)',
      tokenHoverTooltip: 'Hover to view full token & workspace details',
      workspaceDir: 'Workspace',
      backendReady: 'Backend daemon ready',
      copyJsonTooltip: 'Copy full session JSON (Click copy · Long-press export)',
      copyJsonSuccess: 'Session JSON copied to clipboard!',
      exportSuccess: 'Session JSON saved to desktop!',
      noActiveSession: 'No active session',
    },
    zen: {
      exitZenTitle: (shortcut?: string) => `Exit zen reading mode (Press ${shortcut || 'F11'} or Esc)`,
      exitZenLabel: 'Exit Zen Mode',
    },
    search: {
      placeholder: 'Search sessions (↑↓ navigate, Enter open, Esc exit)...',
      clearInput: 'Clear query',
      filterByProject: 'Filter by project',
      allProjects: 'All Projects',
      close: 'Close (Esc)',
      noSessionsFound: 'No sessions found',
      noSessionsHint: 'Start a new session to search past conversations',
      searchNoResults: (query: string) => `No sessions found matching "${query}"`,
      searchTryOther: 'Try different keywords or switch project filter',
      timeJustNow: 'Just now',
      timeMinutesAgo: (n: number) => `${n}m ago`,
      timeHoursAgo: (n: number) => `${n}h ago`,
      timeYesterday: 'Yesterday',
      timeDaysAgo: (n: number) => `${n}d ago`,
    },
    settings: {
      title: 'Settings',
      desktopSection: 'Desktop',
      serverSection: 'Server',
      generalTab: 'General',
      shortcutsTab: 'Shortcuts',
      daemonTab: 'Daemon Link',
      modelsTab: 'Models',
      languageLabel: 'Language',
      languageDesc: 'Change the display language for OpenCode Companion',
      autoAcceptLabel: 'Auto-accept permissions',
      autoAcceptDesc: 'Permission requests will be automatically approved',
      showReasoningLabel: 'Show reasoning process',
      showReasoningDesc: 'Display reasoning chains from DeepSeek / Grok models as collapsible cards',
      autoCollapsePromptLabel: 'Auto-collapse long prompts',
      autoCollapsePromptDesc: 'Automatically collapse user prompts exceeding 240 characters or 4 lines',
      collapseToolBatchLabel: 'Auto-collapse tool batches',
      collapseToolBatchDesc: 'Automatically group 3 or more consecutive tool calls into a single compact bar',
      expandShellLabel: 'Expand Shell tool output by default',
      expandShellDesc: 'Always expand terminal command output in the timeline',
      expandEditLabel: 'Expand file edit details by default',
      expandEditDesc: 'Always expand file edit and diff details in the timeline',
      showModelSelectorLabel: 'Show model selector in prompt bar',
      showModelSelectorDesc: 'Display the model selector pill and popup in prompt bar, toggle off or press Alt+M to hide',
      showTimelineQuickJumpLabel: 'Show timeline quick-jump floating buttons',
      showTimelineQuickJumpDesc: 'Display floating jump pill at top-right (supports click and 1s long-press)',
      quickJumpUpTooltip: 'Click: Jump to previous dialogue | Hold 1s: Jump to top (Shortcut: ↑ / Double-tap ↑)',
      quickJumpDownTooltip: 'Click: Jump to next dialogue | Hold 1s: Jump to bottom (Shortcut: ↓ / Double-tap ↓)',
      shortcutsTitle: 'Keyboard Shortcuts',
      shortcutsDesc: 'View and customize global and blueprint keyboard shortcuts',
      resetShortcutsBtn: 'Reset to Defaults',
      categoryAll: 'All',
      categoryGeneral: 'General & Chat',
      categoryMap: 'Blueprint Map',
      searchShortcutsPlaceholder: 'Search shortcuts or actions...',
      pressKeyPrompt: 'Press keys... (Esc to cancel)',
      clickToRebind: 'Click to rebind shortcut',
      daemonTitle: 'Daemon Link & Security',
      targetEndpoint: 'Target Endpoint',
      locked127: '127.0.0.1 Locked',
      daemonLoopbackDesc: 'Direct loopback to OpenCode daemon running in WSL2 (opencode-jail) on port 5001.',
      testHealth: 'Test Healthcheck',
      onlineReady: 'Online & Ready',
      unreachable: 'Unreachable',
      threatWarningTitle: 'Zero-Auth Threat Model Warning',
      threatWarningDesc: 'OpenCode daemon has no built-in authentication. It provides full control over bash execution (/pty), file reading, and file modification. Both the daemon and this companion server are strictly locked to 127.0.0.1. NEVER expose port 5001 or 5173 to 0.0.0.0 or LAN without a reverse-proxy authentication layer.',
      proxyTokenTitle: 'Proxy Ingress Token (Optional)',
      proxyTokenDesc: 'If accessing through an authenticated reverse proxy (e.g., Nginx Basic Auth or Tailscale funnel), enter the bearer token here:',
      proxyTokenPlaceholder: 'Bearer token / API key',
      modelsTitle: 'Available Providers',
      modelsDesc: 'Connected to local New API / One API Gateway via OpenCode Daemon.',
      resetModalTitle: 'Reset Shortcuts',
      resetModalDesc1: 'Are you sure you want to reset all keyboard shortcuts to default values?',
      resetModalDesc2: 'This will clear all custom shortcut bindings and restore factory defaults.',
      resetModalConfirm: 'Reset Now',
      tagGlobal: 'Global',
      tagMap: 'Blueprint',
    },
    chat: {
      undoUpToThisPoint: 'Undo changes up to this point',
      revertedBadge: 'Reverted',
      revertDivider: 'Reverted up to this checkpoint',
      revertBannerTitle: (time?: string) => `Session reverted up to ${time || 'selected message'}, files restored`,
      revertBannerDesc: 'Subsequent changes have been atomically undone. You can restore them at any time.',
      unrevertBtn: 'Restore all reverted changes',
      reverting: 'Reverting...',
      unreverting: 'Restoring...',
      hideModelUI: 'Hide model selector (Alt+M)',
      showModelUI: 'Show model selector (Alt+M)',
      confirmUndoTitle: 'Confirm Undo',
      confirmUndoBtn: 'Confirm',
      loadingDiff: 'Checking affected files...',
      noFilesAffected: 'No local files will be affected by this undo.',
      rolledBackCount: (count: number) => `${count} rolled back messages`,
      restoreMessage: 'Restore message',
      restoringMessage: 'Restoring...',
      expandRolledBack: 'Expand rolled back messages',
      collapseRolledBack: 'Collapse rolled back messages',
      revertModeBothTitle: 'Revert Code & Conversation (Default)',
      revertModeBothDesc: 'Restores files to snapshot and rolls back conversation timeline to input.',
      revertModeConvOnlyTitle: 'Revert Conversation Only (Keep Code)',
      revertModeConvOnlyDesc: 'Leaves local files untouched. Rolls back timeline and populates prompt.',
      revertModeCodeOnlyTitle: 'Revert Code Only (Keep Conversation)',
      revertModeCodeOnlyDesc: 'Restores disk files to snapshot while preserving full conversation history.',
      revertModeSummarizeTitle: 'Summarize Context',
      revertModeSummarizeDesc: 'Compacts context tokens up to this checkpoint without touching code.',
      noFilesModifiedBadge: 'No local files will be modified in this mode.',
    },
    models: {
      manageTitle: 'Manage models',
      manageSubtitle: 'Customize which models appear in the model selector.',
      searchPlaceholder: 'Search models',
      connectProvider: 'Connect provider',
      noModelsFound: 'No models found',
      manageBtn: 'Manage models',
    },
  },
}

export function getTranslations(lang: SupportedLanguage = 'zh-CN'): TranslationDictionary {
  return translations[lang] || translations['zh-CN']
}

export function useI18n() {
  const { prefs, updatePreferences } = usePreferences()
  const lang: SupportedLanguage = prefs.language || 'zh-CN'
  const t = getTranslations(lang)

  const setLanguage = (nextLang: SupportedLanguage) => {
    updatePreferences({ language: nextLang })
  }

  return {
    lang,
    setLanguage,
    t,
  }
}
