import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useReactFlow } from "@xyflow/react"
import type { TalkMap } from "../schema/talk-map"
import { OPENCODE_BASE_URL, createOpencodeClient } from "../opencode/client"
import { loadTalkMapFromApi, saveTalkMapToApi } from "../opencode/persist"
import { subscribeOpenCodeEvents } from "../opencode/sse"
import { newCardId as defaultNewCardId, newGroupId as defaultNewGroupId } from "./card-id"
import { createDebounced, POSITION_SAVE_MS } from "./debounce"
import { loadTalkBoard, subscribeTalkBoard } from "./map-board"
import {
  buildTalkMapEdges,
  buildTalkMapNodes,
  layoutTalkMap,
  matchedCardsFromView,
  mergeFlowPositions,
  rawSessionNodesFromView,
} from "./map-graph"
import {
  bindBlueprintHotkeys,
  bindGroupHotkeys,
  createMapFlowHandlers,
  createSessionNodeHandlers,
} from "./map-canvas-handlers"
import {
  INITIAL_MAP_HISTORY,
  recordHistorySnapshot,
  undoHistory,
  redoHistory,
  type MapHistory,
} from "./map-history"
import type { RubberBand } from "./rubber-band"
import { COMMENT_GROUP_TYPE, type TalkMapFlowNode } from "./flow-nodes"
import { MapFlow } from "./MapFlow"
import type { HotkeyMenu } from "./MapOverlays"
import type { ViewState } from "./map-interactions"
import { normalizeSearchQuery } from "./session-search"
import type { MapAppProps } from "./map-app-types"
import type { BlueprintMenuState } from "./BlueprintActionMenu"

export function MapCanvas(props: MapAppProps) {
  const {
    deps,
    onSelectSession,
    searchQuery,
    activeIndex,
    onMatchedSessionsChange,
    hideChrome,
    selectedDirectory,
    onDirectoryChange,
    autoSyncEnabled = true,
    onProjectsLoaded,
    onBlueprintMenuOpenChange,
  } = props
  const client = useMemo(
    () => deps?.client ?? createOpencodeClient({ baseUrl: OPENCODE_BASE_URL }),
    [deps?.client],
  )
  const loadMap = deps?.loadMap ?? loadTalkMapFromApi
  const saveMap = deps?.saveMap ?? saveTalkMapToApi
  const subscribe = deps?.subscribe ?? subscribeOpenCodeEvents
  const newCardId = deps?.newCardId ?? defaultNewCardId
  const [view, setView] = useState<ViewState>({ kind: "loading" })
  const [toast, setToast] = useState<string | undefined>(undefined)
  const [band, setBand] = useState<RubberBand | undefined>(undefined)
  const [hotkeyMenu, setHotkeyMenu] = useState<HotkeyMenu | undefined>(undefined)
  const [blueprintMenu, setBlueprintMenu] = useState<BlueprintMenuState | undefined>(undefined)

  useEffect(() => {
    onBlueprintMenuOpenChange?.(blueprintMenu !== undefined)
  }, [blueprintMenu, onBlueprintMenuOpenChange])
  const [isLayoutAnimating, setIsLayoutAnimating] = useState(false)
  const mapRef = useRef<TalkMap | undefined>(undefined)
  const historyRef = useRef<MapHistory>(INITIAL_MAP_HISTORY)
  const selectedRef = useRef<readonly string[]>([])
  const hoveredNodeRef = useRef<{ readonly id: string; readonly type?: string } | null>(null)
  const sseConnectedRef = useRef(false)
  const isDraggingRef = useRef(false)
  const flow = useReactFlow()
  const persist = useMemo(
    () => createDebounced(POSITION_SAVE_MS, (map: TalkMap) => { void saveMap(map) }),
    [saveMap],
  )
  // Direct persist without recording to user undo stack (for background SSE sync events)
  const persistMap = useCallback((next: TalkMap) => {
    mapRef.current = next
    persist.schedule(next)
  }, [persist])

  // Record user mutation into undo history stack, then persist
  const recordUserMutation = useCallback((next: TalkMap) => {
    const current = mapRef.current ?? (view.kind === "ready" ? view.map : undefined)
    if (current && current !== next) {
      historyRef.current = recordHistorySnapshot(historyRef.current, current)
    }
    persistMap(next)
  }, [persistMap, view])

  const handleUndo = useCallback(() => {
    const current = mapRef.current ?? (view.kind === "ready" ? view.map : undefined)
    if (!current || view.kind !== "ready") return
    const res = undoHistory(historyRef.current, current)
    if (res.map) {
      historyRef.current = res.history
      mapRef.current = res.map
      persist.schedule(res.map)
      setView((prev) => (prev.kind === "ready" ? { ...prev, map: res.map! } : prev))
      setToast("已撤销 (Undo)")
    } else {
      setToast("没有更早的历史记录")
    }
  }, [persist, setToast, view])

  const handleRedo = useCallback(() => {
    const current = mapRef.current ?? (view.kind === "ready" ? view.map : undefined)
    if (!current || view.kind !== "ready") return
    const res = redoHistory(historyRef.current, current)
    if (res.map) {
      historyRef.current = res.history
      mapRef.current = res.map
      persist.schedule(res.map)
      setView((prev) => (prev.kind === "ready" ? { ...prev, map: res.map! } : prev))
      setToast("已重做 (Redo)")
    } else {
      setToast("已是最新状态")
    }
  }, [persist, setToast, view])

  const loadBoard = useCallback(async (directory?: string) => {
    setView((prev) => (prev.kind === "loading" ? prev : { kind: "loading" }))
    const target = directory ?? selectedDirectory
    setView(await loadTalkBoard({
      client,
      loadMap,
      saveMap,
      newCardId,
      mapRef,
      onProjectsLoaded,
      ...(target === undefined ? {} : { directory: target }),
    }))
  }, [client, loadMap, newCardId, onProjectsLoaded, selectedDirectory, saveMap])

  useEffect(() => {
    void loadBoard()
    return () => persist.cancel()
  }, [loadBoard, persist])

  useEffect(() => {
    const handleCardAdded = () => {
      void loadBoard()
    }
    window.addEventListener("opencode:map-card-added", handleCardAdded)
    return () => window.removeEventListener("opencode:map-card-added", handleCardAdded)
  }, [loadBoard])

  const viewDirectory = view.kind === "ready" ? view.directory : undefined
  useEffect(() => {
    if (selectedDirectory !== undefined && selectedDirectory !== viewDirectory) {
      void loadBoard(selectedDirectory)
    }
  }, [selectedDirectory, viewDirectory, loadBoard])

  useEffect(() => {
    if (view.kind !== "ready" || viewDirectory === undefined) {
      return
    }
    return subscribeTalkBoard({
      directory: viewDirectory,
      subscribe,
      client,
      newCardId,
      persist,
      persistMap,
      setView,
      autoSyncEnabled,
      sseConnectedRef,
      mapRef,
    })
  }, [autoSyncEnabled, client, newCardId, persist, persistMap, subscribe, view.kind, viewDirectory])

  const handlers = useMemo(
    () => createSessionNodeHandlers({
      view,
      client,
      persistMap: recordUserMutation,
      saveMap,
      mapRef,
      sseConnectedRef,
      autoSyncEnabled,
      setView,
      setToast,
      setHotkeyMenu,
      onSelectSession,
      openWindow: deps?.openWindow,
      copyText: deps?.copyText,
    }),
    [autoSyncEnabled, client, deps?.copyText, deps?.openWindow, onSelectSession, recordUserMutation, saveMap, view],
  )

  useEffect(() => bindGroupHotkeys(recordUserMutation, setView, selectedRef), [recordUserMutation])

  const query = normalizeSearchQuery(searchQuery)
  const rawSessionNodes = useMemo(() => rawSessionNodesFromView(view), [view])
  const matchedCards = useMemo(
    () => matchedCardsFromView(view, rawSessionNodes, query),
    [query, rawSessionNodes, view],
  )
  useEffect(() => {
    onMatchedSessionsChange?.(matchedCards)
  }, [matchedCards, onMatchedSessionsChange])

  const nodes = useMemo(
    () => buildTalkMapNodes({ view, rawSessionNodes, query, activeIndex, matchedCards, handlers }),
    [activeIndex, handlers, matchedCards, query, rawSessionNodes, view],
  )
  const edges = useMemo(() => buildTalkMapEdges(view, recordUserMutation, setView, setToast), [recordUserMutation, setToast, view])
  const [flowNodes, setFlowNodes] = useState<TalkMapFlowNode[]>(nodes)
  const [prevNodes, setPrevNodes] = useState(nodes)
  if (nodes !== prevNodes) {
    setPrevNodes(nodes)
    setFlowNodes((prev) => mergeFlowPositions(prev, nodes, isDraggingRef.current))
  }

  const handleDeleteHoveredNode = useCallback(
    (target: { readonly id: string; readonly type?: string }) => {
      if (view.kind !== "ready") return
      if (target.type === COMMENT_GROUP_TYPE || (view.map.groups && view.map.groups[target.id])) {
        handlers.onDeleteGroup?.(target.id)
        setToast("已从蓝图移除注释组")
      } else {
        handlers.onRemoveCard(target.id)
        setToast("已从蓝图移除会话卡片")
      }
      hoveredNodeRef.current = null
    },
    [handlers, setToast, view],
  )

  const executeAutoLayout = useCallback(() => {
    if (view.kind !== "ready" || flowNodes.length === 0) {
      return
    }
    const currentMap = mapRef.current ?? view.map
    const layouted = layoutTalkMap({ map: currentMap, nodes: flowNodes, edges })
    setIsLayoutAnimating(true)
    setFlowNodes(layouted.nodes)
    if (layouted.map !== currentMap) {
      recordUserMutation(layouted.map)
      setView((curr) => (curr.kind === "ready" ? { ...curr, map: layouted.map } : curr))
    }
    window.setTimeout(() => flow.fitView({ padding: 0.15, duration: 400 }), 50)
    window.setTimeout(() => setIsLayoutAnimating(false), 450)
  }, [edges, flow, flowNodes, recordUserMutation, view])

  const layoutTrigger = props.layoutTrigger
  const prevLayoutTriggerRef = useRef(layoutTrigger)
  useEffect(() => {
    if (layoutTrigger !== undefined && layoutTrigger !== prevLayoutTriggerRef.current) {
      prevLayoutTriggerRef.current = layoutTrigger
      executeAutoLayout()
    }
  }, [executeAutoLayout, layoutTrigger])

  useEffect(() => {
    return bindBlueprintHotkeys({
      persistMap: recordUserMutation,
      setView,
      selectedRef,
      setFlowNodes,
      fitView: flow.fitView,
      newGroupId: defaultNewGroupId,
      hoveredNodeRef,
      onDeleteHoveredNode: handleDeleteHoveredNode,
      onUndo: handleUndo,
      onRedo: handleRedo,
      onAutoLayout: executeAutoLayout,
    })
  }, [flow.fitView, handleDeleteHoveredNode, handleRedo, handleUndo, recordUserMutation, setView, executeAutoLayout])

  const flowHandlers = useMemo(
    () => createMapFlowHandlers({
      view,
      client,
      newCardId,
      newGroupId: defaultNewGroupId,
      persistMap: recordUserMutation,
      persistDirectMap: persistMap,
      saveMap,
      mapRef,
      selectedRef,
      isDraggingRef,
      band,
      setBand,
      setView,
      setToast,
      setFlowNodes,
      screenToFlowPosition: flow.screenToFlowPosition,
      onAutoLayout: executeAutoLayout,
      hoveredNodeRef,
      setBlueprintMenu,
    }),
    [band, client, executeAutoLayout, flow.screenToFlowPosition, newCardId, persistMap, recordUserMutation, saveMap, view, setBlueprintMenu],
  )

  return (
    <MapFlow
      nodes={flowNodes}
      edges={edges}
      isLayoutAnimating={isLayoutAnimating}
      handlers={flowHandlers}
      screenToFlowPosition={flow.screenToFlowPosition}
      chrome={{
        hideChrome,
        view,
        toast,
        band,
        hotkeyMenu,
        blueprintMenu,
        client,
        newCardId,
        onRetry: () => void loadBoard(),
        onDirectory: (directory) => {
          onDirectoryChange?.(directory)
          void loadBoard(directory)
        },
        persistMap: recordUserMutation,
        setView,
        setToast,
        setHotkeyMenu,
        setBlueprintMenu,
        onSelectSession,
      }}
    />
  )
}
