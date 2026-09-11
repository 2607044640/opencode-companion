import { useState } from "react"
import { NodeResizer, type NodeProps, type OnResizeEnd } from "@xyflow/react"
import { Trash2 } from "lucide-react"
import type { GroupFlowNode } from "../canvas/flow-nodes"

export function CommentGroup(props: NodeProps<GroupFlowNode>) {
  const [isHovered, setIsHovered] = useState(false)
  const isSelected = props.selected === true

  const handleResizeEnd: OnResizeEnd = (_event, params) => {
    props.data.onResizeGroup?.({
      groupId: props.id,
      x: Math.round(params.x),
      y: Math.round(params.y),
      w: Math.round(params.width),
      h: Math.round(params.height),
    })
  }

  return (
    <div
      className={`comment-group ${isSelected ? "comment-group--selected" : ""} ${isHovered ? "comment-group--hovered" : ""}`}
      data-testid="comment-group"
      style={{
        width: props.data.w,
        height: props.data.h,
        borderColor: props.data.color,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        props.data.onBindHotkey?.({
          groupId: props.id,
          clientX: event.clientX,
          clientY: event.clientY,
        })
      }}
    >
      <NodeResizer
        isVisible={isSelected || isHovered}
        minWidth={140}
        minHeight={80}
        color={props.data.color || "#38bdf8"}
        onResizeEnd={handleResizeEnd}
      />
      <div className="comment-group__header" data-testid="comment-group-header">
        <div className="comment-group__title" data-testid="comment-group-title">
          {props.data.title}
        </div>
        {props.data.onDeleteGroup && (
          <button
            type="button"
            className="comment-group__delete-btn"
            data-testid="comment-group-delete"
            title="删除注释组 (Delete Group)"
            onClick={(event) => {
              event.stopPropagation()
              props.data.onDeleteGroup?.(props.id)
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
