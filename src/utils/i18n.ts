import { usePreferences, getPreferences, resolveLanguage, type LanguagePreference } from './preferences'

export type SupportedLanguage = 'zh-CN' | 'en-US' | 'de-DE'
export type { LanguagePreference }

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
    modeTitles: string
    modeMessages: string
    placeholderTitles: string
    placeholderMessages: string
    searchingMessages: string
    noMessageHits: (query: string) => string
    noMessageHitsHint: string
    userRole: string
    assistantRole: string
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
    collapseSidebarOnStartupLabel: string
    collapseSidebarOnStartupDesc: string
    collapseToolBatchLabel: string
    collapseToolBatchDesc: string
    floatingDiffViewLabel: string
    floatingDiffViewDesc: string
    autoGitCheckpointLabel: string
    autoGitCheckpointDesc: string
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
    modelReportTitle: string
    expandReport: string
    collapseReport: string
    expandFullReport: string
    collapseFullReport: string
    clickToExpandReport: string
    expandPrompt: string
    collapsePrompt: string
    copyPrompt: string
    copyPromptSuccess: string
    expandFullPrompt: string
    collapseFullPrompt: string
    clickToExpandPrompt: string
    thinkingProcess: string
    switchSessionTitle: string
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
      placeholder: '搜索会话标题 (按 ↑↓ 选择, Enter 打开, Esc 退出)...',
      modeTitles: '搜会话标题',
      modeMessages: '搜消息内容',
      placeholderTitles: '搜索会话标题 (按 ↑↓ 选择, Enter 打开, Esc 退出)...',
      placeholderMessages: '全文字段搜索：输入消息内容、代码片段或错误词...',
      searchingMessages: '正在检索会话消息正文...',
      noMessageHits: (query: string) => `未在任何消息中找到匹配 “${query}” 的内容`,
      noMessageHitsHint: '尝试缩短关键词，或在右上角切换至“全部工程”',
      userRole: '用户',
      assistantRole: '助手',
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
      collapseSidebarOnStartupLabel: '启动时默认收起左侧侧边栏',
      collapseSidebarOnStartupDesc: '打开应用或刷新页面时，默认不展开左侧会话历史栏（按 Ctrl+B 可随时展开）',
      collapseToolBatchLabel: '工具执行批次自动归拢',
      collapseToolBatchDesc: '连续 3 个及以上工具调用自动归拢为紧凑单行条，点击可随时展开',
      floatingDiffViewLabel: '以悬浮窗口打开文件差异',
      floatingDiffViewDesc: '打开文件 diff 时使用居中悬浮面板，而不是右侧侧栏。关闭后恢复右侧抽屉。',
      autoGitCheckpointLabel: '对话结束后自动 Git Checkpoint',
      autoGitCheckpointDesc: '本轮有工作区改动时本地提交（不推送）；空 diff / 纯问答跳过。密钥与 .env 永不入库。设置仅保存在本机。',
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
      modelReportTitle: '模型回答 / 汇报',
      expandReport: '展开',
      collapseReport: '收起',
      expandFullReport: '展开完整回答',
      collapseFullReport: '收起完整回答',
      clickToExpandReport: '点击展开完整回答',
      expandPrompt: '展开提问内容',
      collapsePrompt: '收起提问内容',
      copyPrompt: '复制提示词',
      copyPromptSuccess: '已复制',
      expandFullPrompt: '展开完整提示词',
      collapseFullPrompt: '收起完整提示词',
      clickToExpandPrompt: '点击展开完整提示词',
      thinkingProcess: '模型思考过程 (Thinking)',
      switchSessionTitle: '点击立即切换至该会话',
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
      placeholder: 'Search session titles (↑↓ navigate, Enter open, Esc exit)...',
      modeTitles: 'Search Titles',
      modeMessages: 'Search Messages',
      placeholderTitles: 'Search session titles (↑↓ navigate, Enter open, Esc exit)...',
      placeholderMessages: 'Full-text message search: type keywords, code, or errors...',
      searchingMessages: 'Searching message content across sessions...',
      noMessageHits: (query: string) => `No message content found matching "${query}"`,
      noMessageHitsHint: 'Try shorter keywords or switch to "All Projects"',
      userRole: 'User',
      assistantRole: 'Assistant',
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
      collapseSidebarOnStartupLabel: 'Collapse left sidebar on startup',
      collapseSidebarOnStartupDesc: 'Keep the left sidebar collapsed by default when opening or reloading the app (press Ctrl+B to toggle)',
      collapseToolBatchLabel: 'Auto-collapse tool batches',
      collapseToolBatchDesc: 'Automatically group 3 or more consecutive tool calls into a single compact bar',
      floatingDiffViewLabel: 'Open file diffs in a floating panel',
      floatingDiffViewDesc: 'Show file diffs in a centered floating UI instead of the right sidebar. Turn off to restore the drawer.',
      autoGitCheckpointLabel: 'Auto Git checkpoint after each turn',
      autoGitCheckpointDesc: 'When a turn changes workspace files, create a local commit (never push). Skip empty diffs. Secrets and .env are never staged. This toggle stays in local preferences.',
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
      modelReportTitle: 'Model Response / Report',
      expandReport: 'Expand',
      collapseReport: 'Collapse',
      expandFullReport: 'Expand full response',
      collapseFullReport: 'Collapse full response',
      clickToExpandReport: 'Click to expand full response',
      expandPrompt: 'Expand prompt',
      collapsePrompt: 'Collapse prompt',
      copyPrompt: 'Copy prompt',
      copyPromptSuccess: 'Copied',
      expandFullPrompt: 'Expand full prompt',
      collapseFullPrompt: 'Collapse full prompt',
      clickToExpandPrompt: 'Click to expand full prompt',
      thinkingProcess: 'Model Thinking Process (Thinking)',
      switchSessionTitle: 'Click to switch to this session',
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
  'de-DE': {
    common: {
      cancel: 'Abbrechen',
      confirm: 'Bestätigen',
      close: 'Schließen',
      save: 'Speichern',
      delete: 'Löschen',
      reset: 'Zurücksetzen',
      search: 'Suchen',
      loading: 'Wird geladen...',
      all: 'Alle',
      error: 'Fehler',
      retry: 'Wiederholen',
      success: 'Erfolgreich',
    },
    header: {
      hideSidebar: 'Seitenleiste ausblenden (Strg+B)',
      showSidebar: 'Seitenleiste einblenden (Strg+B)',
      copyJson: 'Alle JSON kopieren',
      revert: 'Rückgängig machen',
      revertTitle: 'Letzte Runde rückgängig machen (Revert last exchange)',
      idle: 'Bereit',
      generating: 'Generierung läuft...',
      retrying: (attempt: number) => `Wiederhole (${attempt})`,
      newTab: 'Neuer Chat-Tab',
      closeTab: 'Tab schließen',
      tokensIn: 'Prompt-Eingabetoken',
      tokensOut: 'Generierungs-Ausgabetoken',
      tokensReasoning: 'Denk- / Reasoning-Token',
      tokensCache: 'Cache-Treffertoken',
      securityBoundary: 'Physische Sicherheitsgrenze: Streng an 127.0.0.1 gebunden (WSL2)',
      tokenBreakdownTitle: 'Token-Verbrauch Aufschlüsselung',
      tokenTotal: 'Gesamt',
      tokenPrompt: '📥 Eingabe (Prompt)',
      tokenCompletion: '📤 Ausgabe (Completion)',
      tokenHoverTooltip: 'Zeigen für vollständigen Token-Verbrauch & Workspace-Details',
      workspaceDir: 'Arbeitsbereich',
      backendReady: 'Backend-Dienst bereit',
      copyJsonTooltip: 'Sitzungs-JSON kopieren (Klick zum Kopieren · 500ms halten zum Exportieren)',
      copyJsonSuccess: 'Sitzungs-JSON in die Zwischenablage kopiert!',
      exportSuccess: 'Sitzungs-JSON auf dem Desktop gespeichert!',
      noActiveSession: 'Keine aktive Sitzung',
    },
    zen: {
      exitZenTitle: (shortcut?: string) => `Fokusmodus beenden (${shortcut || 'F11'} oder Esc)`,
      exitZenLabel: 'Fokusmodus beenden',
    },
    search: {
      placeholder: 'Sitzungstitel suchen (↑↓ zum Navigieren, Enter zum Öffnen, Esc zum Schließen)...',
      modeTitles: 'Titel durchsuchen',
      modeMessages: 'Nachrichten durchsuchen',
      placeholderTitles: 'Sitzungstitel suchen (↑↓ zum Navigieren, Enter zum Öffnen, Esc zum Schließen)...',
      placeholderMessages: 'Volltextsuche: Nachrichteninhalte, Code oder Fehlermeldungen eingeben...',
      searchingMessages: 'Nachrichten werden durchsucht...',
      noMessageHits: (query: string) => `Keine Treffer für „${query}“ in den Nachrichten gefunden`,
      noMessageHitsHint: 'Versuchen Sie kürzere Suchbegriffe oder wechseln Sie oben rechts auf „Alle Projekte“',
      userRole: 'Benutzer',
      assistantRole: 'Assistent',
      clearInput: 'Eingabe löschen',
      filterByProject: 'Nach Projekt filtern',
      allProjects: 'Alle Projekte',
      close: 'Schließen (Esc)',
      noSessionsFound: 'Keine Sitzungen gefunden',
      noSessionsHint: 'Starten Sie eine neue Sitzung, um den Verlauf zu durchsuchen',
      searchNoResults: (query: string) => `Keine Sitzungen für „${query}“ gefunden`,
      searchTryOther: 'Versuchen Sie andere Suchbegriffe oder Projektfilter',
      timeJustNow: 'Gerade eben',
      timeMinutesAgo: (n: number) => `vor ${n} Min.`,
      timeHoursAgo: (n: number) => `vor ${n} Std.`,
      timeYesterday: 'Gestern',
      timeDaysAgo: (n: number) => `vor ${n} Tagen`,
    },
    settings: {
      title: 'Einstellungen',
      desktopSection: 'Desktop',
      serverSection: 'Server',
      generalTab: 'Allgemein',
      shortcutsTab: 'Tastaturkürzel',
      daemonTab: 'Backend & Sicherheit',
      modelsTab: 'Modelle',
      languageLabel: 'Sprache',
      languageDesc: 'Oberflächensprache für OpenCode Companion auswählen',
      autoAcceptLabel: 'Ausführungsberechtigungen automatisch akzeptieren',
      autoAcceptDesc: 'Berechtigungen und Tool-Ausführungsanfragen werden automatisch genehmigt',
      showReasoningLabel: 'Denkprozesse des Modells anzeigen',
      showReasoningDesc: 'Zeigt Reasoning von Modellen (DeepSeek, Grok etc.) als einklappbare Karten an',
      autoCollapsePromptLabel: 'Lange Benutzer-Prompts automatisch einklappen',
      autoCollapsePromptDesc: 'Prompts mit mehr als 240 Zeichen oder 4 Zeilen automatisch mit Verlaufseffekt einklappen',
      collapseSidebarOnStartupLabel: 'Seitenleiste beim Start standardmäßig einklappen',
      collapseSidebarOnStartupDesc: 'Die linke Seitenleiste beim Öffnen der App standardmäßig einklappen (Strg+B zum Umschalten)',
      collapseToolBatchLabel: 'Aufeinanderfolgende Tool-Aufrufe zusammenfassen',
      collapseToolBatchDesc: 'Fasst 3 oder mehr aufeinanderfolgende Tool-Aufrufe kompakt zusammen',
      floatingDiffViewLabel: 'Dateidiffs in einem schwebenden Fenster öffnen',
      floatingDiffViewDesc: 'Zeigt Dateidiffs in einem zentrierten Overlay statt in der rechten Seitenleiste. Deaktivieren, um die Schublade zu behalten.',
      autoGitCheckpointLabel: 'Nach jeder Runde automatisch Git-Checkpoint',
      autoGitCheckpointDesc: 'Bei Arbeitskopie-Änderungen lokalen Commit erstellen (kein Push). Leere Diffs überspringen. Geheimnisse und .env werden nie gestaged. Einstellung bleibt lokal.',
      expandShellLabel: 'Shell-Tool-Details standardmäßig ausklappen',
      expandShellDesc: 'Befehlsausgaben im Chat standardmäßig ausgeklappt anzeigen',
      expandEditLabel: 'Dateibearbeitungs-Details standardmäßig ausklappen',
      expandEditDesc: 'Codeänderungen und Diffs im Chat standardmäßig ausgeklappt anzeigen',
      showModelSelectorLabel: 'Modellauswahl in der Eingabeleiste anzeigen',
      showModelSelectorDesc: 'Modellauswahl-Pille und Popup unten anzeigen (Alt+M zum Ein-/Ausblenden)',
      showTimelineQuickJumpLabel: 'Schnellnavigations-Schaltflächen anzeigen',
      showTimelineQuickJumpDesc: 'Schaltflächen zum schnellen Springen oben/unten im Chatverlauf anzeigen',
      quickJumpUpTooltip: 'Klick: Nach oben scrollen | 1 Sek. halten: Ganz nach oben springen (↑ / Doppelklick ↑)',
      quickJumpDownTooltip: 'Klick: Nach unten scrollen | 1 Sek. halten: Ganz nach unten springen (↓ / Doppelklick ↓)',
      shortcutsTitle: 'Tastenkombinationen',
      shortcutsDesc: 'Tastenkombinationen anzeigen und anpassen',
      resetShortcutsBtn: 'Auf Standard zurücksetzen',
      categoryAll: 'Alle',
      categoryGeneral: 'Allgemein & Chat',
      categoryMap: 'Blueprint-Karte',
      searchShortcutsPlaceholder: 'Kürzel oder Funktionen suchen...',
      pressKeyPrompt: 'Tastenkombination drücken... (Esc zum Abbrechen)',
      clickToRebind: 'Klicken, um Kürzel neu zuzuweisen',
      daemonTitle: 'Backend-Verbindung & Physische Sicherheit',
      targetEndpoint: 'Ziel-Backend-Endpunkt',
      locked127: '127.0.0.1 Physische Bindung',
      daemonLoopbackDesc: 'Direkte Verbindung zum OpenCode-Daemon auf Port 5001 innerhalb von WSL2 (opencode-jail).',
      testHealth: 'Verbindung testen',
      onlineReady: 'Dienst online und bereit',
      unreachable: 'Nicht erreichbar',
      threatWarningTitle: 'Physische Sicherheitswarnung (Zero-Auth)',
      threatWarningDesc: 'Der OpenCode-Daemon besitzt keine integrierte Authentifizierung und gewährt vollen Bash-Zugriff (/pty) sowie Dateizugriff. Server und Companion sind strikt an 127.0.0.1 gebunden.',
      proxyTokenTitle: 'Reverse-Proxy-Authentifizierungstoken (Optional)',
      proxyTokenDesc: 'Geben Sie Anmeldedaten ein, wenn Sie über einen Reverse-Proxy zugreifen:',
      proxyTokenPlaceholder: 'Bearer-Token / API-Schlüssel',
      modelsTitle: 'Verfügbare Modellanbieter',
      modelsDesc: 'Über den OpenCode-Daemon mit dem lokalen New API / One API Gateway verbunden.',
      resetModalTitle: 'Tastenkombinationen zurücksetzen',
      resetModalDesc1: 'Möchten Sie wirklich alle Tastenkombinationen auf die Standardwerte zurücksetzen?',
      resetModalDesc2: 'Dadurch werden alle benutzerdefinierten Tastenbelegungen gelöscht.',
      resetModalConfirm: 'Zurücksetzen bestätigen',
      tagGlobal: 'Global',
      tagMap: 'Karte',
    },
    chat: {
      undoUpToThisPoint: 'Änderungen bis zu diesem Punkt rückgängig machen (Undo changes up to this point)',
      revertedBadge: 'Rückgängig gemacht',
      revertDivider: 'Bis zu diesem Checkpoint zurückgesetzt',
      revertBannerTitle: (time?: string) => `Sitzung auf ${time || 'gewählte Nachricht'} zurückgesetzt, Code-Snapshot wiederhergestellt`,
      revertBannerDesc: 'Nachfolgende Änderungen wurden atomar rückgängig gemacht.',
      unrevertBtn: 'Wiederherstellen (Restore)',
      reverting: 'Wird rückgängig gemacht...',
      unreverting: 'Wird wiederhergestellt...',
      hideModelUI: 'Modellauswahl ausblenden (Alt+M)',
      showModelUI: 'Modellauswahl anzeigen (Alt+M)',
      confirmUndoTitle: 'Rückgängigmachen bestätigen',
      confirmUndoBtn: 'Bestätigen',
      loadingDiff: 'Betroffene Dateien werden überprüft...',
      noFilesAffected: 'Das Rückgängigmachen dieser Runde betrifft keine lokalen Dateien.',
      rolledBackCount: (count: number) => `${count} zurückgesetzte Nachrichten`,
      restoreMessage: 'Nachricht wiederherstellen',
      restoringMessage: 'Wiederherstellung läuft...',
      expandRolledBack: 'Zurückgesetzte Nachrichten anzeigen',
      collapseRolledBack: 'Zurückgesetzte Nachrichten einklappen',
      revertModeBothTitle: 'Code & Chat zurücksetzen (Standard)',
      revertModeBothDesc: 'Stellt Dateien auf den Snapshot zurück und setzt den Chat-Verlauf zurück.',
      revertModeConvOnlyTitle: 'Nur Chat zurücksetzen (Code behalten)',
      revertModeConvOnlyDesc: 'Lokale Dateien bleiben unverändert. Setzt nur den Chat-Verlauf zurück.',
      revertModeCodeOnlyTitle: 'Nur Code zurücksetzen (Chat behalten)',
      revertModeCodeOnlyDesc: 'Stellt lokale Dateien auf den Snapshot zurück, behält aber den Chat-Verlauf bei.',
      revertModeSummarizeTitle: 'Kontext zusammenfassen',
      revertModeSummarizeDesc: 'Fasst den Kontext vor diesem Checkpoint mit KI zusammen, ohne Code zu verändern.',
      noFilesModifiedBadge: 'In diesem Modus werden keine lokalen Dateien geändert.',
      modelReportTitle: 'Modellantwort / Bericht',
      expandReport: 'Ausklappen',
      collapseReport: 'Einklappen',
      expandFullReport: 'Vollständige Antwort anzeigen',
      collapseFullReport: 'Vollständige Antwort einklappen',
      clickToExpandReport: 'Klicken, um vollständige Antwort anzuzeigen',
      expandPrompt: 'Prompt ausklappen',
      collapsePrompt: 'Prompt einklappen',
      copyPrompt: 'Prompt kopieren',
      copyPromptSuccess: 'Kopiert!',
      expandFullPrompt: 'Vollständigen Prompt anzeigen',
      collapseFullPrompt: 'Vollständigen Prompt einklappen',
      clickToExpandPrompt: 'Klicken, um vollständigen Prompt anzuzeigen',
      thinkingProcess: 'Denkprozess des Modells (Thinking)',
      switchSessionTitle: 'Klicken, um zu dieser Sitzung zu wechseln',
    },
    models: {
      manageTitle: 'Modelle verwalten',
      manageSubtitle: 'Auswählen, welche Modelle in der Modellauswahl erscheinen.',
      searchPlaceholder: 'Modelle suchen',
      connectProvider: 'Anbieter verbinden',
      noModelsFound: 'Keine passenden Modelle gefunden',
      manageBtn: 'Modelle verwalten',
    },
  },
}

export function getTranslations(lang: SupportedLanguage | string = 'zh-CN'): TranslationDictionary {
  const resolved = resolveLanguage(lang)
  return translations[resolved] || translations['zh-CN']
}

export interface MultilingualInput {
  zh: string
  en: string
  de?: string
}

/**
 * Universal bilingual / multilingual translation helper.
 * Enforces both `zh` and `en` to be provided. German (`de`) is optional and falls back to `en` -> `zh`.
 *
 * Examples:
 *   tr({ zh: '展开', en: 'Expand', de: 'Ausklappen' })
 *   tr('展开', 'Expand', 'Ausklappen')
 */
export function tr(input: MultilingualInput, overrideLang?: SupportedLanguage): string
export function tr(zh: string, en: string, de?: string, overrideLang?: SupportedLanguage): string
export function tr(
  first: MultilingualInput | string,
  second?: string | SupportedLanguage,
  third?: string,
  fourth?: SupportedLanguage
): string {
  let zh = ''
  let en = ''
  let de: string | undefined
  let targetLang: SupportedLanguage | undefined

  if (typeof first === 'object' && first !== null) {
    zh = first.zh
    en = first.en
    de = first.de
    targetLang = second as SupportedLanguage | undefined
  } else {
    zh = first || ''
    en = typeof second === 'string' ? second : ''
    de = third
    targetLang = fourth
  }

  const activeLang = targetLang || resolveLanguage(getPreferences().language)

  if (activeLang === 'zh-CN') {
    return zh
  }
  if (activeLang === 'de-DE') {
    return de || en || zh
  }
  return en || zh
}

export function useI18n() {
  const { prefs, updatePreferences } = usePreferences()
  const preferenceLang = prefs.language || 'zh-CN'
  const activeLang = resolveLanguage(preferenceLang)
  const t = getTranslations(activeLang)

  const boundTr = (
    first: MultilingualInput | string,
    second?: string,
    third?: string
  ) => {
    if (typeof first === 'object' && first !== null) {
      return tr(first, activeLang)
    }
    return tr(first, second as string, third, activeLang)
  }

  const setLanguage = (nextLang: LanguagePreference) => {
    updatePreferences({ language: nextLang })
  }

  return {
    lang: activeLang,
    preferenceLang,
    activeLang,
    isZh: activeLang === 'zh-CN',
    isEn: activeLang === 'en-US',
    isDe: activeLang === 'de-DE',
    setLanguage,
    t,
    tr: boundTr,
  }
}

