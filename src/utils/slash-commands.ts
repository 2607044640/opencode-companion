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
  // Group 1: Workflow & Planning
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
        label: '3-Phase Plan',
        value: 'Please provide a 3-phase (Investigation / Implementation / Verification) plan for: ',
        description: 'Investigation -> Implementation -> Verification',
      },
      {
        label: 'Bottom-Up Breakdown',
        value: 'Break down modular architecture bottom-up with key boundaries: ',
        description: 'Bottom-up modular architecture and error boundaries',
      },
      {
        label: 'TDD Specification',
        value: 'Follow TDD specification, define assertions and failure cases first: ',
        description: 'Test-Driven Development with failure cases first',
      },
    ],
    directiveTemplate: (args) =>
      `[Workflow Directive: /plan]\nTask: ${args || 'Plan next technical objective'}\nPlease provide a comprehensive, step-by-step implementation plan before modifying any code. Break down requirements, technical design, risks, and verification steps.`,
  },
  {
    name: 'grill-me',
    aliases: ['interview', 'align'],
    category: 'Workflow & Planning',
    argumentHint: '<topic to resolve>',
    description: 'Interactive interview to resolve design decisions and align trade-offs',
    descriptionZh: '方案拷问：通过多轮结构化提问与互动访谈，敲定关键技术设计决策',
    icon: 'HelpCircle',
    presets: [
      {
        label: 'Architecture Decisions',
        value: 'Ask me 3-5 critical architectural trade-off questions to align design for: ',
        description: 'Structured technical interview on key trade-offs',
      },
      {
        label: 'Edge Cases & Security',
        value: 'Examine failure modes, performance limits, and security boundaries: ',
        description: 'Resilience, rate limits, and security boundary review',
      },
    ],
    directiveTemplate: (args) =>
      `[Workflow Directive: /grill-me]\nTopic: ${args || 'Design decisions and architecture trade-offs'}\nPlease conduct a rigorous interactive interview with me. Ask 3-5 targeted, critical design questions (with recommended options) before settling on an implementation plan.`,
  },
  {
    name: 'boost',
    aliases: ['deep-think', 'reason'],
    category: 'Workflow & Planning',
    argumentHint: '<complex challenge>',
    description: 'Deep thinking, strategic planning, multiple perspectives, and rigorous verification',
    descriptionZh: '深度超频：开启深度思考、多视角推演、严格证伪与严谨验证流程',
    icon: 'Zap',
    presets: [
      {
        label: 'Dual-Perspective Proof',
        value: 'Rigorously verify feasibility and formulate counter-arguments for: ',
        description: 'Bidirectional proof and falsification analysis',
      },
      {
        label: 'First-Principles Diagnosis',
        value: 'Trace root cause from first principles and runtime evidence for: ',
        description: 'Evidence-based deep root cause tracing',
      },
    ],
    directiveTemplate: (args) =>
      `[Workflow Directive: /boost]\nChallenge: ${args || 'Complex technical problem'}\nPlease engage in deep, strategic deliberation. Analyze edge cases, explore alternative perspectives, strictly verify all load-bearing claims, and document trade-offs.`,
  },

  // Group 2: Autonomous & Swarm
  {
    name: 'goal',
    aliases: ['autonomous', 'run-until-done'],
    category: 'Autonomous & Goals',
    argumentHint: '<autonomous objective>',
    description: 'Long-running autonomous goal execution until objective is fully achieved',
    descriptionZh: '自主目标：长任务自主迭代推进，直至目标彻底达成，不提前中断',
    icon: 'Target',
    suggestedAgent: 'build',
    presets: [
      {
        label: 'Until All Tests Pass',
        value: 'Autonomously fix all issues until all tests pass with zero build errors: ',
        description: 'Automated regression loop until 100% test & build pass',
      },
      {
        label: 'Root Cause Self-Healing',
        value: 'Investigate root cause and close feedback loop without superficial workarounds: ',
        description: 'Thorough root cause repair with self-healing feedback loop',
      },
      {
        label: 'End-to-End Delivery',
        value: 'Execute end-to-end autonomous workflow and deliver verified outcome: ',
        description: 'Full automated workflow to verified completion',
      },
    ],
    directiveTemplate: (args) =>
      `[Workflow Directive: /goal]\nObjective: ${args || 'Execute until fully completed'}\nPlease operate autonomously in an execution loop. Continue diagnosing, implementing, and verifying until the goal is 100% achieved. Do not stop early or ask for unnecessary confirmation on safe actions.`,
  },
  {
    name: 'teamwork',
    aliases: ['swarm', 'multi-agent'],
    category: 'Autonomous & Goals',
    argumentHint: '<project mission>',
    description: 'Coordinate multi-agent team (Planner, Researcher, Coder, Tester) in swarm',
    descriptionZh: '团队协作：协调 Planner、Researcher、Coder、Tester 多子智能体协同作业',
    icon: 'Users',
    presets: [
      {
        label: 'Full Pipeline Swarm',
        value: 'Coordinate Planner, Coder, and Tester in an autonomous pipeline for: ',
        description: 'Multi-role collaborative pipeline',
      },
      {
        label: 'Parallel Investigations',
        value: 'Spawn concurrent subagents to investigate independent root causes for: ',
        description: 'Concurrent exploration of alternative failure modes',
      },
    ],
    directiveTemplate: (args) =>
      `[Workflow Directive: /teamwork]\nMission: ${args || 'Multi-agent collaborative task'}\nPlease organize and coordinate specialized subagents (Planner, Researcher, Coder, Tester) to tackle this project cooperatively with clean responsibility boundaries.`,
  },

  // Group 3: Execution & Tools
  {
    name: 'browser',
    aliases: ['web', 'browse'],
    category: 'Execution & Automation',
    argumentHint: '<url or query>',
    description: 'Web browsing, documentation research, and web application interaction',
    descriptionZh: '网页浏览：执行深度网络调研、检索官方文档或网页交互',
    icon: 'Globe',
    presets: [
      {
        label: 'Official Documentation',
        value: 'Inspect latest official documentation and extract API specifications for: ',
        description: 'Authoritative documentation and code standards',
      },
      {
        label: 'Ecosystem Comparison',
        value: 'Compare mainstream open-source alternatives and production best practices for: ',
        description: 'Multi-dimensional trade-off and benchmark comparison',
      },
    ],
    directiveTemplate: (args) =>
      `[Workflow Directive: /browser]\nTarget: ${args || 'Research external documentation'}\nPlease browse web sources or official documentation, verify claims directly from primary sources, and link authoritative references.`,
  },
  {
    name: 'schedule',
    aliases: ['cron', 'timer'],
    category: 'Execution & Automation',
    argumentHint: '<cron or seconds> <instruction>',
    description: 'Schedule a recurring cron job or one-shot timer for background execution',
    descriptionZh: '定时任务：配置一次性倒计时定时器或周期性 Cron 自动化调度',
    icon: 'Clock',
    presets: [
      { label: 'Every 5 min', value: '*/5 * * * * ', description: 'Recurring trigger every 5 minutes' },
      { label: 'Every 10 min', value: '*/10 * * * * ', description: 'Recurring trigger every 10 minutes' },
      { label: 'Every hour', value: '0 * * * * ', description: 'Recurring trigger at top of every hour' },
      { label: 'In 30 min', value: '1800s ', description: 'One-shot timer after 30 minutes' },
      { label: 'In 1 hour', value: '3600s ', description: 'One-shot timer after 1 hour' },
    ],
    directiveTemplate: (args) =>
      `[Workflow Directive: /schedule]\nInstruction: ${args || 'Run scheduled background automation'}\nPlease schedule and execute this automation instruction.`,
  },

  // Group 4: Context & Memory
  {
    name: 'compact',
    aliases: ['summarize-session', 'compaction'],
    category: 'Context & Memory',
    argumentHint: '[optional focus]',
    description: 'Summarize conversation context to free up token window',
    descriptionZh: '压缩上下文：调用官方原版后端压缩历史对话，释放上下文窗口 Token',
    icon: 'Minimize2',
    presets: [
      { label: 'Full Compaction', value: '', description: 'Compress and summarize entire session history' },
      { label: 'Focus on Decisions', value: 'Retain core architectural decisions and pending tasks', description: 'Retain key architectural conclusions' },
      { label: 'Refine Debug Logs', value: 'Condense debug details, retain only root cause and resolution', description: 'Eliminate transient verbose logs' },
    ],
  },
  {
    name: 'learn',
    aliases: ['remember', 'rules'],
    category: 'Context & Memory',
    argumentHint: '<rule or correction>',
    description: 'Extract and persist behavioral lessons, rules, or environment guidelines',
    descriptionZh: '沉淀规则：将本次对话中的关键修正、经验或环境配置沉淀为持久化准则',
    icon: 'BookOpen',
    presets: [
      {
        label: 'Persist System Rule',
        value: 'Formulate lessons learned into unambiguous system guidelines: ',
        description: 'Durable system-level behavioral invariant',
      },
      {
        label: 'Workspace Boundaries',
        value: 'Record workspace physical constraints and environment quirks: ',
        description: 'Workspace-specific configuration and constraints',
      },
    ],
    directiveTemplate: (args) =>
      `[Workflow Directive: /learn]\nLesson/Correction: ${args || 'Persist learned rule'}\nPlease extract and formulate this behavioral guideline or environment quirk into a durable, unambiguous instruction following InstructionDesignPrinciples.`,
  },

  // Group 5: Session & Utilities
  {
    name: 'undo',
    aliases: ['revert'],
    category: 'Utilities',
    argumentHint: '',
    description: 'Revert last exchange, tool action, or code changes',
    descriptionZh: '回退会话：撤销最近一次交互或工具调用',
    icon: 'Undo2',
  },
  {
    name: 'summary',
    aliases: ['digest'],
    category: 'Utilities',
    argumentHint: '',
    description: 'Generate structured summary of deliverables and progress',
    descriptionZh: '生成总结：输出当前会话的结构化总结与成果交付清单',
    icon: 'FileText',
    presets: [
      { label: 'Progress Summary', value: 'Please summarize progress, completed milestones, and pending actions', description: 'Progress summary' },
    ],
    directiveTemplate: () =>
      `[Workflow Directive: /summary]\nPlease generate a comprehensive summary of the conversation so far, highlighting completed achievements, technical decisions, modified files, and pending next actions.`,
  },
  {
    name: 'title',
    aliases: ['rename'],
    category: 'Utilities',
    argumentHint: '',
    description: 'Auto-generate a concise and descriptive session title from transcript',
    descriptionZh: '生成标题：根据会话内容自动生成准确精炼的会话标题',
    icon: 'Heading',
  },
  {
    name: 'btw',
    aliases: ['side-question'],
    category: 'Utilities',
    argumentHint: '<question>',
    description: 'Ask a quick side question without interrupting main turn or queue',
    descriptionZh: '副问题（旁白）：平行提问，不阻塞主任务，不打乱对话排队',
    icon: 'MessageSquareQuote',
    presets: [
      { label: 'Explain Code', value: 'Explain the purpose and potential risks of this code: ', description: 'In-depth code explanation' },
      { label: 'Query API', value: 'What are the parameters and best practices for this API? ', description: 'Rapid API signature lookup' },
    ],
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
