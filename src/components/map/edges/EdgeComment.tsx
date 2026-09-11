import { useState, type KeyboardEvent } from "react"
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react"

export type TalkMapEdgeData = {
  readonly kind: "native" | "inject" | "link"
  readonly comment: string
  readonly autoSync: boolean
  readonly onComment?: (comment: string) => void
  readonly onAutoSync?: (autoSync: boolean) => void
  readonly onBreakEdge?: (edgeId: string) => void
}

export function TalkMapEdge(props: EdgeProps) {
  const data = (props.data ?? {}) as TalkMapEdgeData
  const [path, labelX, labelY] = getBezierPath(props)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.comment)
  const dashed = data.kind === "native"
  const isAnimated = props.animated || data.kind === "inject"

  function commit() {
    setEditing(false)
    data.onComment?.(draft)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      commit()
    }
    if (event.key === "Escape") {
      event.preventDefault()
      setDraft(data.comment)
      setEditing(false)
    }
  }

  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        className={isAnimated ? "talk-map-edge--animated" : undefined}
        style={{
          stroke: dashed ? "#64748b" : (data.kind === "inject" ? "#38bdf8" : "#38bdf8"),
          strokeDasharray: dashed ? "6 4" : (isAnimated ? "6 3" : undefined),
          strokeWidth: 2,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="talk-map-edge-label nodrag nopan"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onClick={(event) => {
            if (event.altKey && event.button === 0) {
              event.stopPropagation()
              event.preventDefault()
              data.onBreakEdge?.(props.id)
            }
          }}
          onDoubleClick={() => {
            if (dashed) {
              return
            }
            setDraft(data.comment)
            setEditing(true)
          }}
        >
          {editing ? (
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={onKeyDown}
              data-testid="edge-comment-input"
            />
          ) : (
            <span data-testid="edge-comment">{data.comment}</span>
          )}
          {dashed ? null : (
            <label>
              <input
                type="checkbox"
                data-testid="edge-autosync"
                checked={data.autoSync}
                onChange={(event) => data.onAutoSync?.(event.target.checked)}
              />
              autoSync
            </label>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
