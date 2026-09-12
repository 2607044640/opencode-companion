export type SearchMode = 'titles' | 'messages'

export interface CachedMessageDoc {
  id: string
  role: 'user' | 'assistant'
  text: string
  time?: {
    created?: number
    completed?: number
  }
}

export interface MessageSearchHit {
  sessionId: string
  sessionTitle: string
  messageId: string
  role: 'user' | 'assistant'
  snippet: string
  matchWords: string[]
  timestamp?: number
  turnIndex: number
  projectId?: string
  projectName?: string
  projectColorClass?: string
  directory?: string
}
