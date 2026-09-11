# OpenCode Web Companion Architecture & Internal Design

## 1. System Topology & Data Flow

```text
[ Windows Host: Chrome / Edge (localhost:5173) ]
      |
      |-- 1. HTTP REST (GET/POST/DELETE) --> [ WSL2 Port 5001: OpenCode Daemon ]
      |                                              |
      |-- 2. SSE Stream (GET /global/event) <-------+ (message.part.delta, session.status)
      |
      +-- 3. TUI Session Switch (POST /tui/select-session) --> [ OpenCode Desktop App ]
```

### Data Movement Sequence
1. **Intake**: On mount, `useSessions` queries `GET /project` and `GET /session` from `http://127.0.0.1:5001`.
2. **Stream Subscription**: `sseManager` establishes persistent EventSource connection to `GET /global/event`.
3. **Prompt Dispatch**: When user sends a message, `useChatStream` optimistically appends the user bubble, sets status to `busy`, and calls `POST /session/{sessionID}/prompt_async` (204 No Content).
4. **Streaming Concatenation**: Backend streams `message.part.delta` events. `useChatStream` locates the target message and part by ID, appending delta chunks without reloading the entire timeline.
5. **Tool Finalization**: `message.part.updated` arrives with complete tool inputs/outputs, updating the `ToolCard` state to `completed` or `error`.

---

## 2. Dialogue Map Architecture (`src/components/map/`)

```text
[ MapCanvas ]
      |
      +-- [ MapFlow (@xyflow/react) ]
      |         |-- ViewportPortal: CuttingWireOverlay (Laser beam)
      |         |-- Background (Dots) + Controls + MiniMap
      |         +-- Custom Nodes: SessionCard, CommentGroup
      |
      +-- [ Pure Geometry Engines ]
      |         |-- cutting-wire.ts (Cubic Bézier discretization, AABB, 2D CCW straddle)
      |         |-- lazy-connect.ts (DOM + geometric hit-testing, polarity resolution)
      |         +-- layout-dagre.ts (Hierarchical LR tree layout)
      |
      +-- [ Interaction & Safety Controllers ]
                |-- map-history.ts (50-step undo/redo, isolated from SSE sync)
                +-- BlueprintActionMenu.tsx (Empty-space in-place search menu)
```

### Key Architectural Invariants
1. **Event Phase Decoupling**:
   - React Flow natively listens to pointer and mouse events in the bubble phase.
   - Laser cutting (`Alt + Middle Mouse`) and pin breaking (`Alt + Left Click`) attach listeners in the **Capture Phase** (`onPointerDownCapture`, `onMouseDownCapture`).
   - Calling `stopPropagation()` and `preventDefault()` in capture phase physically prevents React Flow from initiating unwanted canvas panning or wire creation.
2. **Pure Geometry Wire Cutting Engine**:
   - Replicates `@xyflow/system`'s exact cubic Bézier formula including backward-looping negative span offset (`curvature * 25 * Math.sqrt(-distance)`).
   - Uses Level 1 AABB bounding box fast rejection, followed by Level 2 2D CCW line segment cross-product straddle testing.
   - Slices intersecting non-native wires in real-time during mouse movement, consolidating a continuous stroke into a single transactional Undo step.
3. **Dual Coordinate Space Isolation**:
   - `screenPos` (`clientX`, `clientY`) governs CSS fixed/absolute positioning of floating menus (`BlueprintActionMenu`, `FloatingMapModal`, `FloatingSearchModal`).
   - `flowPos` (projected via `flow.screenToFlowPosition`) governs node and edge positions in the infinite canvas coordinate space.
   - Never conflate screen coordinates with canvas world coordinates.
4. **Undo Stack & SSE Stream Separation**:
   - User actions (drag, resize, wire cut, auto-layout) pass through `recordUserMutation`, pushing snapshots to `historyRef`.
   - Background daemon updates (SSE title updates, running statuses, digest updates) pass through `persistDirectMap` without polluting the user undo history.

---

## 3. Component Boundaries & Responsibilities

| Component / Subsystem | Responsible For | MUST NOT Contain |
| :--- | :--- | :--- |
| `Sidebar.tsx` | Project filtering, session search, time grouping (`Today`/`Yesterday`/`Older`) | Message payload handling, SSE subscriptions |
| `Header.tsx` | Tab management, token analytics counter, desktop deep-link, Map trigger | Direct session creation network calls |
| `ChatTimeline.tsx` | Scroll preservation, message bubbles layout, 502 error banner | Input form validation, prompt submission |
| `PromptInput.tsx` | Dynamic agent/model dropdowns, textarea auto-resize, image paste | Chat message history manipulation |
| `MapCanvas.tsx` | Map lifecycle, undo/redo dispatch, project board subscriptions | Low-level SVG canvas rendering |
| `MapFlow.tsx` | ReactFlow wrapper, pointer capture, laser cutting state | Server REST API calls |
| `BlueprintActionMenu.tsx` | Contextual action search popover, fuzzy session filter | Canvas node layout algorithms |
| `CountdownConfirmDialog.tsx` | Enforced 2s countdown safety lock on dangerous/reset actions | Application business logic |

---

## 4. Key Invariants & Contracts

<!-- BEGIN USER-SPECIFIED -->
1. **Host Sandbox Isolation**:
   - The companion app lives strictly on the host filesystem (`opencode-companion/`).
   - NEVER place the frontend inside the WSL2 `opencode-jail` sandbox, preventing sandbox firewall whitelist blocks or filesystem permission clashes.
2. **Dual-Mode Desktop Navigation**:
   - Switching focus to OpenCode Desktop MUST attempt `POST /tui/select-session` first. This performs a silent in-place tab switch in the running desktop app without triggering browser security prompts.
   - Fallback to `opencode://session?id=<id>` is only used when the TUI API is unresponsive.
3. **Zero Credential Exposure**:
   - The frontend communicates only with the unauthenticated local daemon on `127.0.0.1:5001`.
   - Never store or log raw API tokens in frontend storage.
<!-- END USER-SPECIFIED -->

---

## 5. Troubleshooting & Diagnostics

- **Vite Dev Server**: `pnpm dev --host 127.0.0.1 --port 5173`
- **Production Preview**: `pnpm preview` or `node serve.mjs`
- **Unit Test Suite**: `npx tsx --test "src/**/*.test.ts"` (92 automated tests)
- **TypeScript Typecheck & Build**: `pnpm run build` (`tsc -b && vite build`)
- **Healthcheck Probe**: `curl http://127.0.0.1:5001/global/health`
