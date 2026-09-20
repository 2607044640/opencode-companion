# OpenCode Web Companion — Architecture

Windows-host dashboard for the OpenCode daemon at `http://127.0.0.1:5001`. Presentation only (REST + SSE). Execution stays in WSL2 `opencode-jail`. Load exactly one module; do not concatenate this tree into one prompt.

Public usage + run commands: `README.md`. This file is the lean architecture router (plugin-doc Modular Router). Hierarchy is **one level**: this file → `docs/modules/<subsystem>.md`. Nested routers are forbidden.

## Global Invariants

At most three. System-wide. Modules reference these; they do not restate them.

<!-- BEGIN USER-SPECIFIED -->
- **Host Sandbox Isolation**: Companion lives on the host (`opencode-companion/`). NEVER place the frontend inside WSL2 `opencode-jail`.
- **Dual-Mode Desktop Navigation**: `POST /tui/select-session` first; `opencode://session?id=` only when TUI is unresponsive.
- **Zero Credential Exposure**: Talk only to the unauthenticated loopback daemon on `127.0.0.1:5001`. Never store or log raw API tokens in frontend source.
<!-- END USER-SPECIFIED -->

## Progressive Router

| Subsystem | Doc | Owns | Do not put here |
| :--- | :--- | :--- | :--- |
| SessionManagement | `docs/modules/session-management.md` | List/tabs, `__draft__`, pin DnD, unread, archive, revert dock, JSON export, `normalizeSession`, 2-letter project badges | SSE deltas, prompt composer, map geometry |
| DialogueBlueprint | `docs/modules/dialogue-blueprint.md` | React Flow canvas, Dagre LR, laser, lazy connect, pin-break, multi-token search, quick right-click menu, `blueprint-action-helpers`, undo vs SSE | Daemon `/session` writes, prompt send |
| StreamingChat | `docs/modules/streaming-chat.md` | `/global/event`, optimistic swap, `<think>`, worked summary, floating/drawer diffs, hunk folding | Textarea, map persist |
| PromptController | `docs/modules/prompt-controller.md` | Autogrow composer, `/` `@`, paste, next-send agent/model | Timeline merge, historical badges |
| LayoutModes | `docs/modules/layout-modes.md` | Sidebar/tabs, Ctrl+K / Ctrl+F, F11 zen, shortcuts, 2s countdown | REST normalize, Bézier math |
| RelayGateway | `docs/modules/relay-gateway.md` | Model picker, relay hub, `:3000` billing view, loopback bind | New API channel provisioning |
| FeatureFlags | `docs/modules/plugin-system.md` | `UserPreferences` visibility toggles. **No** `src/plugins/` tree in this repo | Invented plugin registry APIs |

## When to load

| Trigger | Module |
| :--- | :--- |
| Draft, pin DnD, unread ring, revert dock, export, canonical workspaces, 2-letter tab badges (`ON`/`OD`/`AS`/`AI`) | SessionManagement |
| Laser, lazy connect, pin-break, Dagre `Alt+R`, canvas search, quick right-click menu, undo vs SSE | DialogueBlueprint |
| SSE fuse, optimistic `usr_` swap, `<think>`, floating diffs, hunk `+N more lines` | StreamingChat |
| Enter send, `/` `@`, image paste, next-send agent | PromptController |
| Sidebar, Ctrl+K vs Ctrl+F, F11 zen, 2s countdown | LayoutModes |
| Relay keys, `:3000` quota, loopback bind | RelayGateway |
| Preference toggles / “add a plugin” | FeatureFlags (honest: no registry) |

## Bind & Source Map

```text
[Edge 127.0.0.1:5173] --REST/SSE--> [daemon 127.0.0.1:5001]
                 \--POST /tui/select-session--> [OpenCode Desktop]
                 \--quota view--> [New API 127.0.0.1:3000]   (RelayGateway only)
```

- `src/services/api.ts` — REST + defensive normalize (`extra="allow"`). Every daemon payload crosses here before React state.
- `src/services/sse.ts` — single `EventSource` to `/global/event`.
- `src/hooks/useSessions.ts` / `useChatStream.ts` — session list vs transcript.
- `src/utils/session-workspace.ts` — project resolve, `formatProjectPill` (`[APISpace]`), `getProjectAbbreviation` (`AS`/`ON`/`OD`/`AI`/`NS`).
- `src/components/{chat,layout,map,search,settings,diff}/` — UI stores named in the table above. `map/canvas/session-search.ts`, `HighlightedText.tsx`, `blueprint-action-helpers.ts` belong to DialogueBlueprint. Diff drawer chrome is StreamingChat.
- `serve.mjs` — host static + `/api/map`, `/api/export-session`, `/api/git-revert`, `/api/proxy/relay-quota`. Bind `127.0.0.1`.

Skill (JIT, not this tree): `OpenCodeCompanionDev`. Daemon/jail: `OpenCodeBackendOps`. Channel provision on `:3000`: `GatewayAPIManager`.

Do not inline module recipes, API tables, or 3-layer XML here. Recurring agent failures → patch the owning module, not this file.
