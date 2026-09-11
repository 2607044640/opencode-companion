import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Trash2 } from "lucide-react"
import { COLOR_PALETTE } from "./card-meta"
import type { SessionFlowNode, SkeletonFlowNode } from "./flow-nodes"

export function SessionCard(props: NodeProps<SessionFlowNode>) {
  const sessionId = props.data.sessionId
  const onOpen = props.data.onOpen
  const onCommitTitle = props.data.onCommitTitle
  const onColorTag = props.data.onColorTag
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(props.data.title)
  const [menu, setMenu] = useState<{ readonly x: number; readonly y: number } | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function startEdit(event: MouseEvent) {
    event.stopPropagation()
    event.preventDefault()
    setDraft(props.data.title)
    setEditing(true)
  }

  function revert() {
    setDraft(props.data.title)
    setEditing(false)
  }

  function commit() {
    const next = draft.trim()
    setEditing(false)
    if (next.length === 0 || next === props.data.title) {
      setDraft(props.data.title)
      return
    }
    if (sessionId === undefined || onCommitTitle === undefined) {
      setDraft(props.data.title)
      return
    }
    onCommitTitle({
      cardId: props.id,
      sessionId,
      ghost: props.data.ghost,
      title: next,
    })
  }

  function onTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      commit()
    }
    if (event.key === "Escape") {
      event.preventDefault()
      revert()
    }
  }

  function handlePointerDown(event: PointerEvent) {
    const target = event.target as HTMLElement | null
    if (target?.closest(".react-flow__handle")) {
      return
    }
    pointerDownPos.current = { x: event.clientX, y: event.clientY }
  }

  function handleClick(event: MouseEvent) {
    if (editing || event.button !== 0) {
      return
    }
    const target = event.target as HTMLElement | null
    if (target?.closest(".react-flow__handle")) {
      return
    }
    if (pointerDownPos.current) {
      const dx = Math.abs(event.clientX - pointerDownPos.current.x)
      const dy = Math.abs(event.clientY - pointerDownPos.current.y)
      if (dx > 5 || dy > 5) {
        // Dragging operation - do not open
        return
      }
    }
    if (sessionId === undefined || onOpen === undefined) {
      return
    }
    onOpen(sessionId)
  }

  return (
    <article
      className={`session-card ${props.data.isDimmed ? "session-card--dimmed" : ""} ${
        props.data.isSelected ? "session-card--selected" : ""
      } ${props.data.isHighlighted ? "session-card--highlighted" : ""}`}
      data-testid="session-card"
      data-card-id={props.id}
      data-ghost={props.data.ghost ? "true" : "false"}
      data-running={props.data.running ? "true" : "false"}
      style={
        props.data.colorTag === undefined
          ? undefined
          : { borderColor: props.data.colorTag }
      }
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setMenu({ x: event.clientX, y: event.clientY })
      }}
      onDoubleClick={(event) => {
        event.stopPropagation()
        if (editing) {
          return
        }
        if (sessionId === undefined || onOpen === undefined) {
          return
        }
        onOpen(sessionId)
      }}
    >
      {props.data.onRemoveCard && (
        <button
          type="button"
          className="session-card__quick-delete"
          data-testid="session-card-quick-delete"
          title="从地图中移除蓝图卡片"
          onClick={(event) => {
            event.stopPropagation()
            props.data.onRemoveCard?.(props.id)
          }}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
      {editing ? (
        <input
          ref={inputRef}
          className="session-card__title-input"
          data-testid="session-card-title-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={onTitleKeyDown}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        />
      ) : (
        <div
          className="session-card__title"
          data-testid="session-card-title"
          onDoubleClick={startEdit}
          title="双击重命名标题"
        >
          {props.data.title}
        </div>
      )}
      {props.data.nextStep !== undefined ? (
        <p className="session-card__next" data-testid="session-card-next">
          {props.data.nextStep}
        </p>
      ) : null}
      <div className="session-card__footer">
        {props.data.relativeTime !== undefined ? (
          <span className="session-card__time" data-testid="session-card-time">
            {props.data.relativeTime}
          </span>
        ) : <span />}
        <div className="session-card__actions">
          {props.data.running ? (
            <span className="session-card__badge" data-testid="running-badge">
              running
            </span>
          ) : null}
          {props.data.ghost ? (
            <span className="session-card__ghost" data-testid="ghost-badge">
              ghost
            </span>
          ) : null}
          {sessionId !== undefined ? (
            <button
              type="button"
              className="session-card__refresh"
              data-testid="digest-refresh"
              title="重新生成总结摘要"
              onClick={(event) => {
                event.stopPropagation()
                props.data.onRefreshDigest?.(sessionId)
              }}
            >
              ⟳
            </button>
          ) : null}
        </div>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        onPointerDownCapture={(event) => {
          if (event.altKey) {
            event.stopPropagation()
            event.preventDefault()
            if (event.button === 0) {
              props.data.onBreakPinConnections?.({ cardId: props.id, type: "target" })
            }
          }
        }}
        onMouseDownCapture={(event) => {
          if (event.altKey) {
            event.stopPropagation()
            event.preventDefault()
          }
        }}
        onClickCapture={(event) => {
          if (event.altKey) {
            event.stopPropagation()
            event.preventDefault()
          }
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        onPointerDownCapture={(event) => {
          if (event.altKey) {
            event.stopPropagation()
            event.preventDefault()
            if (event.button === 0) {
              props.data.onBreakPinConnections?.({ cardId: props.id, type: "source" })
            }
          }
        }}
        onMouseDownCapture={(event) => {
          if (event.altKey) {
            event.stopPropagation()
            event.preventDefault()
          }
        }}
        onClickCapture={(event) => {
          if (event.altKey) {
            event.stopPropagation()
            event.preventDefault()
          }
        }}
      />
      {menu !== undefined ? (
        <div
          className="session-card__palette"
          data-testid="session-card-palette"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {COLOR_PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              className="session-card__swatch"
              data-testid={`color-swatch-${color}`}
              style={{ background: color }}
              aria-label={color}
              onClick={(event) => {
                event.stopPropagation()
                setMenu(undefined)
                onColorTag?.({ cardId: props.id, colorTag: color })
              }}
            />
          ))}
          <div className="session-card__group-menu">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                setMenu(undefined)
                setEditing(true)
              }}
            >
              Rename title
            </button>
            {(props.data.groups ?? []).map((group) => (
              <button
                key={group.groupId}
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  setMenu(undefined)
                  props.data.onAssignGroup?.({ cardId: props.id, groupId: group.groupId })
                }}
              >
                Move to {group.title}
              </button>
            ))}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                setMenu(undefined)
                props.data.onAssignGroup?.({ cardId: props.id, groupId: null })
              }}
            >
              Remove from group
            </button>
            <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.08)', margin: '4px 0' }} />
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                setMenu(undefined)
                props.data.onRemoveCard?.(props.id)
              }}
            >
              从地图移除卡片
            </button>
            {sessionId && (
              <button
                type="button"
                style={{ color: '#f87171' }}
                onClick={(event) => {
                  event.stopPropagation()
                  setMenu(undefined)
                  if (window.confirm(`确定要彻底删除会话 "${props.data.title}" 吗？此操作不可逆。`)) {
                    props.data.onDeleteSession?.(sessionId, props.id)
                  }
                }}
              >
                删除对话会话
              </button>
            )}
          </div>
        </div>
      ) : null}
    </article>
  )
}

export function SkeletonCard(_props: NodeProps<SkeletonFlowNode>) {
  return <div className="session-card session-card--skeleton" data-testid="skeleton-card" />
}
