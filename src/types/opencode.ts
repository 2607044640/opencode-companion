// OpenCode OpenAPI 3.1 Data Contracts & Schema Types

export interface ProjectIcon {
  color?: string
}

export interface ProjectTime {
  created: number
  updated: number
}

export interface Project {
  id: string
  worktree: string
  name?: string
  vcs?: string
  icon?: ProjectIcon
  time: ProjectTime
  associatedIds?: string[]
}

export interface SessionTokenUsage {
  input: number
  output: number
  reasoning: number
  cache: {
    read: number
    write: number
  }
}

export interface SessionModel {
  id: string
  providerID: string
  variant?: string
}

export interface SessionTime {
  created: number
  updated: number
}

export interface SessionSummary {
  additions: number
  deletions: number
  files: number
}

export interface SessionRevert {
  messageID: string
  partID?: string
  snapshot?: string
  diff?: string
}

export interface RevertSessionOptions {
  partID?: string
  files?: boolean
}

export interface Session {
  id: string
  slug: string
  projectID: string
  directory: string
  title: string
  agent: string
  model: SessionModel
  tokens: SessionTokenUsage
  cost: number
  summary?: SessionSummary
  time: SessionTime
  version?: string
  revert?: SessionRevert
}

export interface MessageModel {
  providerID: string
  modelID: string
}

export interface MessageInfo {
  id: string
  sessionID: string
  role: 'user' | 'assistant' | 'system'
  time: {
    created: number
    completed?: number
  }
  summary?: {
    diffs?: unknown[]
  }
  agent?: string
  mode?: string
  modelID?: string
  providerID?: string
  model?: MessageModel
  tokens?: SessionTokenUsage
  cost?: number
  finish?: string
  path?: {
    cwd?: string
    root?: string
  }
  error?: {
    name?: string
    message?: string
    statusCode?: number
    data?: {
      message?: string
      statusCode?: number
      responseBody?: string
      isRetryable?: boolean
      [key: string]: any
    }
    [key: string]: any
  }
}

export interface BasePart {
  id: string
  sessionID: string
  messageID: string
  type: string
}

export interface TextPart extends BasePart {
  type: 'text'
  text: string
}

export interface ReasoningPart extends BasePart {
  type: 'reasoning'
  text: string
  time?: {
    start?: number
    end?: number
  }
}

export interface ToolPartState {
  status: 'pending' | 'running' | 'completed' | 'error'
  input?: Record<string, any>
  output?: string
  error?: string
  title?: string
  metadata?: Record<string, any>
  time?: {
    start?: number
    end?: number
  }
}

export interface ToolPart extends BasePart {
  type: 'tool'
  tool: string
  callID?: string
  state: ToolPartState
}

export interface StepStartPart extends BasePart {
  type: 'step-start'
}

export interface StepFinishPart extends BasePart {
  type: 'step-finish'
  reason?: string
}

export interface FilePart extends BasePart {
  type: 'file'
  mime: string
  filename?: string
  url: string
}

export type MessagePart = TextPart | ReasoningPart | ToolPart | StepStartPart | StepFinishPart | FilePart | BasePart

export interface Message {
  info: MessageInfo
  parts: MessagePart[]
}

export interface TodoItem {
  id?: string
  content?: string
  title?: string
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  completed?: boolean
}

export interface TodoData {
  todos?: TodoItem[]
  progress?: {
    completed: number
    total: number
  }
}

export interface AgentInfo {
  name: string
  description?: string
  mode?: string
  native?: boolean
}

export interface ProviderModelInfo {
  id: string
  name?: string
  displayName?: string
}

export interface ProviderInfo {
  id: string
  name: string
  models: Record<string, ProviderModelInfo>
}

export type SessionStatusType = 'idle' | 'busy' | 'retry'

export interface SessionStatusPayload {
  type: SessionStatusType
  attempt?: number
  message?: string
  action?: {
    reason: string
    provider: string
    title: string
    message: string
    label: string
    link?: string
  }
  next?: number
}

// SSE Event payload schemas
export interface SSEEventMessagePartDelta {
  sessionID: string
  messageID: string
  partID: string
  field: string
  delta: string
}

export interface SSEEventMessagePartUpdated {
  sessionID: string
  part: MessagePart
  time: number
}

export interface SSEEventMessageUpdated {
  sessionID: string
  info: MessageInfo
}

export interface SSEEventSessionStatus {
  sessionID: string
  status: SessionStatusPayload
}

export interface SSEEventSessionError {
  sessionID: string
  error?: any
}

export interface SSEEventSessionIdle {
  sessionID: string
}

export interface SSEPayload {
  id: string
  type: string
  properties: any
}

export interface SSEMessageEvent {
  payload: SSEPayload
}

// Prompt input parts for sendPrompt
export interface TextPartInput {
  type: 'text'
  text: string
}

export interface FilePartInput {
  type: 'file'
  mime: string
  url: string
  filename?: string
}

export type MessagePartInput = TextPartInput | FilePartInput

// Daemon configuration
export interface DaemonConfig {
  default_agent?: string
  model?: string
  [key: string]: any
}

// Commands from /command
export interface CommandItem {
  name: string
  description?: string
  [key: string]: any
}

// Snapshot diff for message revert preview
export interface SnapshotFileDiff {
  file: string
  patch?: string
  additions: number
  deletions: number
  status?: 'added' | 'deleted' | 'modified'
}

