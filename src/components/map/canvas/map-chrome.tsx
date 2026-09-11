import { UNREACHABLE_BANNER, type ListedProject } from "../opencode/client"
import type { ViewState } from "./map-interactions"
import { Wand2 } from "lucide-react"

export function MapChrome(props: {
  readonly view: ViewState
  readonly toast: string | undefined
  readonly onRetry: () => void
  readonly onDirectory: (directory: string) => void
  readonly onAutoLayout?: () => void
}) {
  return (
    <>
      {props.view.kind === "unreachable" ? (
        <p className="talk-map__banner" role="alert">
          {UNREACHABLE_BANNER}
          <button type="button" onClick={props.onRetry}>
            Retry
          </button>
        </p>
      ) : (
        <DirectoryToolbar
          view={props.view}
          onDirectory={props.onDirectory}
          onAutoLayout={props.onAutoLayout}
        />
      )}
      {props.toast !== undefined ? (
        <p className="talk-map__toast" role="status" data-testid="talk-map-toast">
          {props.toast}
        </p>
      ) : null}
    </>
  )
}

function DirectoryToolbar(props: {
  readonly view: ViewState
  readonly onDirectory: (directory: string) => void
  readonly onAutoLayout?: () => void
}) {
  const { view } = props
  const projects: readonly ListedProject[] = view.kind === "ready" ? view.projects : []
  return (
    <div className="talk-map__toolbar">
      <label>
        Directory
        <select
          value={view.kind === "ready" ? (view.directory ?? "") : ""}
          disabled={view.kind !== "ready" || projects.length === 0}
          onChange={(event) => {
            const next = event.target.value
            if (next.length === 0) {
              return
            }
            props.onDirectory(next)
          }}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.worktree}>
              {project.name ?? project.worktree}
            </option>
          ))}
        </select>
      </label>
      {props.onAutoLayout && (
        <button
          type="button"
          onClick={props.onAutoLayout}
          className="talk-map__toolbar-btn"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginLeft: "auto",
            padding: "4px 8px",
            fontSize: "12px",
            background: "#161a22",
            border: "1px solid #2d333f",
            borderRadius: "6px",
            color: "#c9d1d9",
            cursor: "pointer",
          }}
          title="自动整理蓝图 (Dagre Auto-Layout)"
        >
          <Wand2 style={{ width: "13px", height: "13px", color: "#38bdf8" }} />
          <span>整理蓝图</span>
        </button>
      )}
    </div>
  )
}
