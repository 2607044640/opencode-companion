import type { TalkMap } from "../schema/talk-map"
import type { TalkMapClient } from "../opencode/client"
import type { SubscribeEventsInput } from "../opencode/sse"
import type { MatchedSessionCard } from "./session-search"

export type MapAppDeps = {
  readonly client?: TalkMapClient
  readonly loadMap?: () => Promise<TalkMap>
  readonly saveMap?: (map: TalkMap) => Promise<void>
  readonly subscribe?: (input: SubscribeEventsInput) => Promise<void>
  readonly newCardId?: () => string
  readonly openWindow?: (url: string) => Window | null
  readonly copyText?: (text: string) => Promise<void>
}

export type MapAppProps = {
  readonly deps?: MapAppDeps
  readonly onSelectSession?: (sessionId: string) => void
  readonly searchQuery?: string
  readonly activeIndex?: number
  readonly onMatchedSessionsChange?: (sessions: readonly MatchedSessionCard[]) => void
  readonly hideChrome?: boolean
  readonly selectedDirectory?: string
  readonly onDirectoryChange?: (directory: string) => void
  readonly autoSyncEnabled?: boolean
  readonly onProjectsLoaded?: (projects: readonly { id: string; worktree: string; name?: string }[]) => void
  readonly layoutTrigger?: number
  readonly onAutoLayout?: () => void
  readonly onBlueprintMenuOpenChange?: (isOpen: boolean) => void
}

export type { MatchedSessionCard }
