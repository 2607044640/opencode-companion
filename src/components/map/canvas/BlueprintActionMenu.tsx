import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { Search, GitBranch, PlusCircle, X, Plus } from "lucide-react"
import type { ViewState } from "./map-interactions"
import type { TalkMapClient } from "../opencode/client"
import type { TalkMap } from "../schema/talk-map"
import {
  filterCategorizedSessions,
  executeBranchAction,
  executeNewSessionAction,
  executeConnectAction,
  sessionIdFromNodeData,
  type ProjectSessionItem,
  type BlueprintMenuState,
} from "./blueprint-action-helpers"
import { HighlightedText } from "./HighlightedText"
import { useI18n } from "../../../utils/i18n"

export type { BlueprintMenuState }

export type BlueprintActionMenuProps = {
  readonly menu: BlueprintMenuState
  readonly view: ViewState
  readonly client: TalkMapClient
  readonly newCardId: () => string
  readonly persistMap: (map: TalkMap) => void
  readonly setView: React.Dispatch<React.SetStateAction<ViewState>>
  readonly setToast: React.Dispatch<React.SetStateAction<string | undefined>>
  readonly onClose: () => void
  readonly onSelectSession?: (sessionId: string) => void
  readonly onLocateCard?: (cardId: string, position?: { readonly x: number; readonly y: number }) => void
}

type CategoryFilter = "all" | "existing" | "unowned"

type QuickActionItem =
  | { readonly kind: "branch"; readonly title: string; readonly subtitle: string }
  | { readonly kind: "new_session"; readonly title: string; readonly subtitle: string }

type ConnectSessionItem = { readonly kind: "connect_session"; readonly session: ProjectSessionItem }

type MenuItem = QuickActionItem | ConnectSessionItem

export function BlueprintActionMenu(props: BlueprintActionMenuProps) {
  const { menu, view, client, newCardId, persistMap, setView, setToast, onClose, onSelectSession } = props
  const { isZh } = useI18n()
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all")
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const timer = setTimeout(() => {
      inputRef.current?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const handleMenuGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }

      // If user types printable characters when menu is open, ensure input receives focus
      if (
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        document.activeElement !== inputRef.current
      ) {
        inputRef.current?.focus()
      }
    }

    window.addEventListener("keydown", handleMenuGlobalKeyDown, { capture: true })
    return () => window.removeEventListener("keydown", handleMenuGlobalKeyDown, { capture: true })
  }, [onClose])

  const directory = view.kind === "ready" ? (view.directory ?? "all") : undefined

  const { existingSessions, unownedSessions } = useMemo(() => {
    if (view.kind !== "ready") {
      return { existingSessions: [], unownedSessions: [] }
    }
    return filterCategorizedSessions({
      cards: view.map.cards,
      titles: view.titles,
      sessions: view.sessions,
      directory: directory ?? "all",
      query,
      excludeCardId: menu.fromNode?.id,
      projects: view.projects,
    })
  }, [directory, menu.fromNode?.id, query, view])

  const displayedExisting = useMemo(() => {
    if (categoryFilter === "unowned") return []
    return existingSessions
  }, [categoryFilter, existingSessions])

  const displayedUnowned = useMemo(() => {
    if (categoryFilter === "existing") return []
    return unownedSessions
  }, [categoryFilter, unownedSessions])

  const quickActions: QuickActionItem[] = useMemo(() => {
    if (categoryFilter === "unowned") {
      return []
    }
    const list: QuickActionItem[] = []
    const q = query.trim().toLowerCase()
    const sourceCard =
      menu.fromNode !== null && view.kind === "ready"
        ? view.map.cards[menu.fromNode.id]
        : undefined
    const canBranch =
      menu.fromNode !== null &&
      (sessionIdFromNodeData(menu.fromNode.data) !== undefined || sourceCard?.sessionId !== undefined)

    if (canBranch) {
      if (!q || (isZh ? "新建分支会话" : "branch session").toLowerCase().includes(q) || "branch".includes(q) || "分支".includes(q)) {
        list.push({
          kind: "branch",
          title: isZh ? "新建分支会话" : "Branch Session",
          subtitle: isZh ? "派生上下文并从当前引脚连接" : "Branch context and connect from current pin",
        })
      }
    }

    if (!q || (isZh ? "新建独立会话" : "new session").toLowerCase().includes(q) || "session".includes(q) || "独立".includes(q)) {
      list.push({
        kind: "new_session",
        title: isZh ? "新建独立会话" : "New Session",
        subtitle: isZh ? "在此位置创建全新的独立对话" : "Create a new independent session at this position",
      })
    }

    return list
  }, [categoryFilter, isZh, menu.fromNode, query, view])

  const allItems: MenuItem[] = useMemo(() => {
    const existingItems: MenuItem[] = displayedExisting.map((session) => ({
      kind: "connect_session",
      session,
    }))
    const unownedItems: MenuItem[] = displayedUnowned.map((session) => ({
      kind: "connect_session",
      session,
    }))
    return [...quickActions, ...existingItems, ...unownedItems]
  }, [quickActions, displayedExisting, displayedUnowned])

  const activeIndex = selectedIndex >= allItems.length ? Math.max(0, allItems.length - 1) : selectedIndex

  function executeItem(item: MenuItem | undefined) {
    if (!item) return

    if (item.kind === "branch") {
      void executeBranchAction({
        client,
        directory,
        view,
        menu,
        newCardId,
        persistMap,
        setView,
        setToast,
        isZh,
      })
      onClose()
      return
    }

    if (item.kind === "new_session") {
      void executeNewSessionAction({
        client,
        directory,
        view,
        menu,
        newCardId,
        persistMap,
        setView,
        setToast,
        isZh,
      })
      onClose()
      return
    }

    if (item.kind === "connect_session") {
      executeConnectAction({
        menu,
        view,
        session: item.session,
        persistMap,
        setView,
        setToast,
        onSelectSession,
        onLocateCard: props.onLocateCard,
        newCardId,
        isZh,
      })
      onClose()
      return
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    event.stopPropagation()

    if (event.key === "Escape") {
      event.preventDefault()
      onClose()
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setSelectedIndex((prev) => (allItems.length > 0 ? (prev + 1) % allItems.length : 0))
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      setSelectedIndex((prev) => (allItems.length > 0 ? (prev - 1 + allItems.length) % allItems.length : 0))
      return
    }

    if (event.key === "Enter") {
      event.preventDefault()
      executeItem(allItems[activeIndex])
      return
    }
  }

  const menuWidth = 420
  const menuHeight = 440
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1200
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800

  const left = Math.max(16, Math.min(menu.clientPoint.x, viewportWidth - menuWidth - 16))
  const top = Math.max(16, Math.min(menu.clientPoint.y, viewportHeight - menuHeight - 16))

  const totalSessionCount = existingSessions.length + unownedSessions.length

  return (
    <div
      className="fixed inset-0 z-50 select-none"
      onPointerDown={onClose}
      data-testid="blueprint-action-menu-backdrop"
    >
      <div
        className="absolute flex flex-col w-[420px] max-h-[460px] bg-[#14171f]/95 backdrop-blur-md border border-[#2d3342] rounded-lg shadow-2xl overflow-hidden text-zinc-200 z-51 font-sans"
        style={{ left, top }}
        onPointerDown={(e) => {
          e.stopPropagation()
          if (document.activeElement !== inputRef.current && (e.target as HTMLElement).tagName !== "BUTTON") {
            inputRef.current?.focus()
          }
        }}
        data-testid="blueprint-action-menu"
      >
        {/* Search Input Row */}
        <div className="flex items-center px-3 py-2 border-b border-[#272b38] gap-2 bg-[#1a1e29]/70">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder={isZh ? "搜索操作或会话..." : "Search actions or sessions..."}
            className="bg-transparent text-xs text-zinc-100 placeholder-zinc-500 outline-none w-full"
            data-testid="blueprint-action-search-input"
          />
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 p-0.5"
            title={isZh ? "关闭菜单 (Esc)" : "Close menu (Esc)"}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Category Filter Tabs Bar (Default: All Categories) */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[#242835] bg-[#11141c] text-[11px]">
          <button
            type="button"
            onClick={() => {
              setCategoryFilter("all")
              setSelectedIndex(0)
            }}
            className={`px-2 py-0.5 rounded transition-colors font-medium ${
              categoryFilter === "all"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1e2a]"
            }`}
            data-testid="category-filter-all"
          >
            {isZh ? "全部分类" : "All Categories"} ({totalSessionCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setCategoryFilter("existing")
              setSelectedIndex(0)
            }}
            className={`px-2 py-0.5 rounded transition-colors font-medium ${
              categoryFilter === "existing"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1e2a]"
            }`}
            data-testid="category-filter-existing"
          >
            {isZh ? "现有会话" : "Existing Sessions"} ({existingSessions.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setCategoryFilter("unowned")
              setSelectedIndex(0)
            }}
            className={`px-2 py-0.5 rounded transition-colors font-medium ${
              categoryFilter === "unowned"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1e2a]"
            }`}
            data-testid="category-filter-unowned"
          >
            {isZh ? "未拥有对话" : "Unowned Sessions"} ({unownedSessions.length})
          </button>
        </div>

        {/* Items List */}
        <div ref={listRef} className="overflow-y-auto flex-1 p-1.5 space-y-1">
          {/* Quick Actions */}
          {quickActions.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-2 py-1">
                {isZh ? "快捷动作" : "Actions"}
              </div>
              {quickActions.map((item, idx) => {
                const isSelected = idx === activeIndex
                return (
                  <button
                    key={item.title}
                    type="button"
                    className={`w-full text-left px-2.5 py-1.5 rounded flex items-center gap-2.5 transition-colors ${
                      isSelected ? "bg-[#2563eb] text-white" : "hover:bg-[#1e2330] text-zinc-200"
                    }`}
                    onClick={() => executeItem(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    data-testid={`action-item-${item.kind}`}
                  >
                    {item.kind === "branch" ? (
                      <GitBranch className="w-4 h-4 text-orange-400 shrink-0" />
                    ) : (
                      <PlusCircle className="w-4 h-4 text-sky-400 shrink-0" />
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium leading-tight truncate">{item.title}</span>
                      <span
                        className={`text-[10px] leading-tight truncate ${
                          isSelected ? "text-blue-100" : "text-zinc-400"
                        }`}
                      >
                        {item.subtitle}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Existing Sessions */}
          {displayedExisting.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-2 py-1">
                {isZh ? "现有会话" : "Existing Sessions"}
              </div>
              {displayedExisting.map((session, sIdx) => {
                const globalIdx = quickActions.length + sIdx
                const isSelected = globalIdx === activeIndex
                const projectColor =
                  session.projectColorClass || "bg-blue-950/60 text-blue-300 border-blue-700/50"
                const projectPill = session.projectBadge || `[${session.projectName || "APISpace"}]`

                return (
                  <button
                    key={session.cardId || session.sessionId || sIdx}
                    type="button"
                    className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between gap-2.5 transition-all border ${
                      isSelected
                        ? "bg-[#181c24] border-blue-500/60 text-white shadow-sm"
                        : "bg-transparent border-transparent hover:bg-[#15181f] text-zinc-200"
                    }`}
                    onClick={() => executeItem({ kind: "connect_session", session })}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                    data-testid={`session-item-${session.cardId || session.sessionId}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${projectColor}`}
                        title={session.projectName ? (isZh ? `工程: ${session.projectName}` : `Project: ${session.projectName}`) : undefined}
                      >
                        {projectPill}
                      </span>
                      <span className="text-xs font-medium leading-tight truncate flex-1">
                        <HighlightedText text={session.title} query={query} />
                      </span>
                    </div>

                    {isSelected && (
                      <span className="flex items-center gap-0.5 text-[9px] font-mono text-blue-300 bg-blue-950/50 border border-blue-800/60 px-1.5 py-0.5 rounded shrink-0">
                        <span>Enter ↵</span>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Unowned Sessions */}
          {displayedUnowned.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] font-semibold text-emerald-500/90 uppercase tracking-wider px-2 py-1 flex items-center justify-between">
                <span>{isZh ? "未拥有对话" : "Unowned Sessions"}</span>
                <span className="text-[9px] lowercase font-normal text-zinc-500">
                  {isZh ? "点击添加至地图" : "click to add to map"}
                </span>
              </div>
              {displayedUnowned.map((session, uIdx) => {
                const globalIdx = quickActions.length + displayedExisting.length + uIdx
                const isSelected = globalIdx === activeIndex
                const projectColor =
                  session.projectColorClass || "bg-zinc-800/60 text-zinc-300 border-zinc-700/50"
                const projectPill = session.projectBadge || `[${session.projectName || "APISpace"}]`

                return (
                  <button
                    key={session.sessionId || uIdx}
                    type="button"
                    className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between gap-2.5 transition-all border ${
                      isSelected
                        ? "bg-[#16201a] border-emerald-500/60 text-white shadow-sm"
                        : "bg-transparent border-transparent hover:bg-[#141a16] text-zinc-200"
                    }`}
                    onClick={() => executeItem({ kind: "connect_session", session })}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                    data-testid={`unowned-session-item-${session.sessionId}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${projectColor}`}
                        title={session.projectName ? (isZh ? `工程: ${session.projectName}` : `Project: ${session.projectName}`) : undefined}
                      >
                        {projectPill}
                      </span>
                      <span className="text-xs font-medium leading-tight truncate flex-1">
                        <HighlightedText text={session.title} query={query} />
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono border border-emerald-800/50 bg-emerald-950/30 text-emerald-300">
                        <Plus className="w-2.5 h-2.5" />
                        <span>{isZh ? "添加" : "Add"}</span>
                      </span>
                      {isSelected && (
                        <span className="flex items-center gap-0.5 text-[9px] font-mono text-emerald-300 bg-emerald-950/50 border border-emerald-800/60 px-1.5 py-0.5 rounded shrink-0">
                          <span>Enter ↵</span>
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {allItems.length === 0 && (
            <div className="py-6 text-center text-xs text-zinc-500">
              {isZh ? "无匹配的操作或会话" : "No matching actions or sessions"}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
