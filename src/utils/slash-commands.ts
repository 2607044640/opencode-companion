export interface SlashCommandPreset {
  label: string
  value: string
  description?: string
}

export type SlashCategory =
  | 'Workflow & Planning'
  | 'Autonomous & Goals'
  | 'Execution & Automation'
  | 'Context & Memory'
  | 'Utilities'

export interface SlashCommandDefinition {
  name: string
  aliases?: string[]
  category: SlashCategory
  argumentHint?: string
  description: string
  descriptionZh: string
  icon: string
  presets?: SlashCommandPreset[]
  /** Suggested agent name to switch to automatically when command is executed */
  suggestedAgent?: string
  /** Directive injection template when prompt is submitted to model */
  directiveTemplate?: (args: string) => string
}

export const ANTIGRAVITY_SLASH_COMMANDS: readonly SlashCommandDefinition[] = [
  {
    name: 'plan',
    aliases: ['planning', 'p'],
    category: 'Workflow & Planning',
    argumentHint: '<task description>',
    description: 'Step-by-step planning and architecture breakdown before code execution',
    descriptionZh: '任务规划：在正式编码前制定分步计划与架构设计方案',
    icon: 'ListTodo',
    suggestedAgent: 'plan',
    presets: [
      {
        label: '三阶段规划',
        value: '请对以下任务进行三阶段（调研诊断 / 核心实现 / 回归验证）递进规划：',
        description: '调研诊断 -> 核心实现 -> 回归验证',
      },
      {
        label: '自底向上分解',
        value: '请进行自底向上的模块化架构分解并列出关键边界条件：',
        description: '从底层物理边界到上层 UI/API 分解',
      },
      {
        label: '测试驱动规范',
        value: '请按 TDD 规范制定方案，先明确测试用例与验证契约：',
        description: 'TDD 规范，先列断言与失败用例',
      },
    ],
    directiveTemplate: (args) =>
      `[Workflow Directive: /plan]\nTask: ${args || 'Plan next technical objective'}\nPlease provide a comprehensive, step-by-step implementation plan before modifying any code. Break down requirements, technical design, risks, and verification steps.`,
  },
  {
    name: 'goal',
    aliases: ['autonomous', 'run-until-done'],
    category: 'Autonomous & Goals',
    argumentHint: '<autonomous objective>',
    description: 'Long-running autonomous goal execution, thorough loop until fully achieved',
    descriptionZh: '自主目标：长任务自主迭代推进，直至目标彻底达成，不提前中断',
    icon: 'Target',
    suggestedAgent: 'build',
    presets: [
      {
        label: '直至全量测试通过',
        value: '自主排查并修复所有错误，直至所有测试 100% 通过且 build 零报错：',
        description: '自动化回归直到 npm test 与 build 均为 0 错误',
      },
      {
        label: '自愈闭环实现',
        value: '深入分析当前缺陷原因，实现自愈闭环，不要停留在表面修补：',
        description: '查清根因并修复，不脑补不敷衍',
      },
      {
        label: '端到端验收交付',
        value: '端到端自主完成完整工作流，并输出可验证的交付报告：',
        description: '全流程自动化交付与终态报告',
      },
    ],
    directiveTemplate: (args) =>
      `[Workflow Directive: /goal]\nObjective: ${args || 'Execute until fully completed'}\nPlease operate autonomously in an execution loop. Continue diagnosing, implementing, and verifying until the goal is 100% achieved. Do not stop early or ask for unnecessary confirmation on safe actions.`,
  },
  {
    name: 'schedule',
    aliases: ['cron', 'timer'],
    category: 'Execution & Automation',
    argumentHint: '<cron or seconds> <instruction>',
    description: 'Schedule a recurring cron job or one-shot timer for automated background execution',
    descriptionZh: '定时任务：配置一次性倒计时定时器或周期性 Cron 自动化调度',
    icon: 'Clock',
    presets: [
      { label: '每 5 分钟', value: '*/5 * * * * ', description: '每 5 分钟触发一次' },
      { label: '每 10 分钟', value: '*/10 * * * * ', description: '每 10 分钟触发一次' },
      { label: '每小时整点', value: '0 * * * * ', description: '每小时整点触发' },
      { label: '30 分钟后一次性', value: '1800s ', description: '一次性 30 分钟倒计时' },
      { label: '1 小时后一次性', value: '3600s ', description: '一次性 1 小时倒计时' },
    ],
    directiveTemplate: (args) =>
      `[Workflow Directive: /schedule]\nInstruction: ${args || 'Run scheduled background automation'}\nPlease schedule and execute this automation instruction.`,
  },
  {
    name: 'compact',
    aliases: ['summarize-session', 'compaction'],
    category: 'Context & Memory',
    argumentHint: '[optional focus]',
    description: 'Compact and summarize conversation context to free up tokens (Official OpenCode)',
    descriptionZh: '压缩上下文：调用官方原版后端压缩历史对话，释放上下文窗口 Token',
    icon: 'Minimize2',
    presets: [
      { label: '全量压缩会话', value: '', description: '压缩全部历史上下文' },
      { label: '聚焦关键决议', value: '重点保留核心架构决议与未完成事项', description: '保留关键结论' },
      { label: '精炼调试日志', value: '精炼历史排查细节，仅保留最终解法', description: '剔除冗余日志' },
    ],
  },
  {
    name: 'browser',
    aliases: ['web', 'browse'],
    category: 'Execution & Automation',
    argumentHint: '<url or query>',
    description: 'Web browsing, official documentation research, or web application interaction',
    descriptionZh: '网页浏览：执行深度网络调研、检索官方文档或网页交互',
    icon: 'Globe',
    presets: [
      {
        label: '查阅官方最新文档',
        value: '查阅最新官方文档并提取标准 API 规范：',
        description: '检索权威文档与代码规范',
      },
      {
        label: '技术方案生态比对',
        value: '检索当前主流开源库的优缺点对比与生产最佳实践：',
        description: '多维度方案评估',
      },
    ],
    directiveTemplate: (args) =>
      `[Workflow Directive: /browser]\nTarget: ${args || 'Research external documentation'}\nPlease browse web sources or official documentation, verify claims directly from primary sources, and link authoritative references.`,
  },
  {
    name: 'grill-me',
    aliases: ['interview', 'align'],
    category: 'Workflow & Planning',
    argumentHint: '<topic to resolve>',
    description: 'Interactive interview to resolve design decisions and align on trade-offs',
    descriptionZh: '方案拷问：通过多轮结构化提问与互动访谈，敲定关键技术设计决策',
    icon: 'HelpCircle',
    presets: [
      {
        label: '架构设计对齐',
        value: '针对以下系统设计，向我提出 3-5 个最关键的架构抉择问题以完成对齐：',
        description: '结构化技术面试',
      },
      {
        label: '异常与边界审查',
        value: '审查以下方案的容错、性能与安全性边界，逐项向我提问确认：',
        description: '边界排查提问',
      },
    ],
    directiveTemplate: (args) =>
      `[Workflow Directive: /grill-me]\nTopic: ${args || 'Design decisions and architecture trade-offs'}\nPlease conduct a rigorous interactive interview with me. Ask 3-5 targeted, critical design questions (with recommended options) before settling on an implementation plan.`,
  },
  {
    name: 'teamwork',
    aliases: ['swarm', 'multi-agent'],
    category: 'Autonomous & Goals',
    argumentHint: '<project mission>',
    description: 'Multi-agent collaborative execution with specialized subagent topology',
    descriptionZh: '团队协作：协调 Planner、Researcher、Coder、Tester 多子智能体协同作业',
    icon: 'Users',
    presets: [
      {
        label: '研产测全链路协同',
        value: '协调 Planner 规划、Coder 编码与 Tester 验收，全链路分工执行：',
        description: '多角色流水线协同',
      },
      {
        label: '并发多分支排查',
        value: '派出并发子智能体分别排查多个独立可能原因并汇总结论：',
        description: '并发探索分支',
      },
    ],
    directiveTemplate: (args) =>
      `[Workflow Directive: /teamwork]\nMission: ${args || 'Multi-agent collaborative task'}\nPlease organize and coordinate specialized subagents (Planner, Researcher, Coder, Tester) to tackle this project cooperatively with clean responsibility boundaries.`,
  },
  {
    name: 'learn',
    aliases: ['remember', 'rules'],
    category: 'Context & Memory',
    argumentHint: '<rule or correction>',
    description: 'Persist behavioral lessons learned, rules, or environment quirks for future sessions',
    descriptionZh: '沉淀规则：将本次对话中的关键修正、经验或环境配置沉淀为持久化准则',
    icon: 'BookOpen',
    presets: [
      {
        label: '沉淀全局准则',
        value: '请将本次排查中的教训与结论整理为严密的不可违背规则：',
        description: '通用系统规则沉淀',
      },
      {
        label: '工作区环境约束',
        value: '记录当前工作区的特殊物理边界与环境约束，防止未来踩坑：',
        description: '工作区专用配置与技巧',
      },
    ],
    directiveTemplate: (args) =>
      `[Workflow Directive: /learn]\nLesson/Correction: ${args || 'Persist learned rule'}\nPlease extract and formulate this behavioral guideline or environment quirk into a durable, unambiguous instruction following InstructionDesignPrinciples.`,
  },
  {
    name: 'boost',
    aliases: ['deep-think', 'reason'],
    category: 'Workflow & Planning',
    argumentHint: '<complex challenge>',
    description: 'Deep thinking, strategic planning, multiple perspectives, rigorous verification',
    descriptionZh: '深度超频：开启深度思考、多视角推演、严格证伪与严谨验证流程',
    icon: 'Zap',
    presets: [
      {
        label: '严密双向论证',
        value: '从正向可行性与反向证伪两个视角对以下任务进行深度论证：',
        description: '双向论证与证伪',
      },
      {
        label: '高难根因溯源',
        value: '不依赖猜测，基于第一性原理与运行时证据进行深度溯源分析：',
        description: '基于代码与日志的深度溯源',
      },
    ],
    directiveTemplate: (args) =>
      `[Workflow Directive: /boost]\nChallenge: ${args || 'Complex technical problem'}\nPlease engage in deep, strategic deliberation. Analyze edge cases, explore alternative perspectives, strictly verify all load-bearing claims, and document trade-offs.`,
  },
  {
    name: 'btw',
    aliases: ['side-question'],
    category: 'Utilities',
    argumentHint: '<question>',
    description: 'Ask a quick side question without interrupting main turn or blocking queue',
    descriptionZh: '副问题（旁白）：平行提问，不阻塞主任务，不打乱对话排队',
    icon: 'MessageSquareQuote',
    presets: [
      { label: '解释代码作用', value: '解释这行代码的作用与潜在风险：', description: '代码深度解读' },
      { label: '查询接口说明', value: '这个 API 的参数说明与最佳实践是什么？', description: 'API 快速查询' },
    ],
  },
  {
    name: 'summary',
    aliases: ['digest'],
    category: 'Utilities',
    argumentHint: '',
    description: 'Generate structured conversation summary and key deliverables report',
    descriptionZh: '生成总结：输出当前会话的结构化总结与成果交付清单',
    icon: 'FileText',
    presets: [
      { label: '阶段性进展总结', value: '请对当前会话的上下文进展进行清晰精炼的阶段性总结', description: '总结进展' },
    ],
    directiveTemplate: () =>
      `[Workflow Directive: /summary]\nPlease generate a comprehensive summary of the conversation so far, highlighting completed achievements, technical decisions, modified files, and pending next actions.`,
  },
  {
    name: 'title',
    aliases: ['rename'],
    category: 'Utilities',
    argumentHint: '',
    description: 'Auto-generate clean and descriptive session title from transcript',
    descriptionZh: '生成标题：根据会话内容自动生成准确精炼的会话标题',
    icon: 'Heading',
  },
  {
    name: 'undo',
    aliases: ['revert'],
    category: 'Utilities',
    argumentHint: '',
    description: 'Revert last exchange or tool invocation',
    descriptionZh: '回退会话：撤销最近一次交互或工具调用',
    icon: 'Undo2',
  },
]

/** Map command name and aliases to command definition */
const COMMANDS_MAP = new Map<string, SlashCommandDefinition>()
for (const cmd of ANTIGRAVITY_SLASH_COMMANDS) {
  COMMANDS_MAP.set(cmd.name.toLowerCase(), cmd)
  if (cmd.aliases) {
    for (const alias of cmd.aliases) {
      COMMANDS_MAP.set(alias.toLowerCase(), cmd)
    }
  }
}

/** Find command definition by exact name or alias */
export function findSlashCommand(name: string): SlashCommandDefinition | undefined {
  if (!name) return undefined
  return COMMANDS_MAP.get(name.trim().toLowerCase())
}

export interface ParsedSlashCommandInput {
  commandName: string
  definition?: SlashCommandDefinition
  args: string
  raw: string
}

/**
 * Parses user input to check if it begins with a slash command (e.g. `/plan my task`).
 * Handles leading whitespace and returns command metadata and arguments.
 */
export function parseSlashCommandInput(text: string): ParsedSlashCommandInput | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null

  const match = trimmed.match(/^\/([a-zA-Z0-9_\-]+)(?:\s+([\s\S]*))?$/)
  if (!match) return null

  const commandName = match[1].toLowerCase()
  const args = (match[2] || '').trim()
  const definition = findSlashCommand(commandName)

  return {
    commandName,
    definition,
    args,
    raw: trimmed,
  }
}

/**
 * Formats a slash command prompt with directive injection if applicable.
 */
export function formatSlashCommandPrompt(
  text: string
): { formattedText: string; suggestedAgent?: string; isSpecialExecution: boolean; specialKind?: string } {
  const parsed = parseSlashCommandInput(text)
  if (!parsed || !parsed.definition) {
    return { formattedText: text, isSpecialExecution: false }
  }

  const def = parsed.definition
  if (def.name === 'compact') {
    return { formattedText: text, isSpecialExecution: true, specialKind: 'compact' }
  }
  if (def.name === 'btw') {
    return { formattedText: parsed.args, isSpecialExecution: true, specialKind: 'btw' }
  }
  if (def.name === 'undo') {
    return { formattedText: text, isSpecialExecution: true, specialKind: 'undo' }
  }

  if (def.directiveTemplate) {
    const formatted = def.directiveTemplate(parsed.args)
    return {
      formattedText: formatted,
      suggestedAgent: def.suggestedAgent,
      isSpecialExecution: false,
    }
  }

  return {
    formattedText: text,
    suggestedAgent: def.suggestedAgent,
    isSpecialExecution: false,
  }
}
