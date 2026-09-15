# OpenCode Web Companion

Independent Windows-host dashboard for the OpenCode daemon at `http://127.0.0.1:5001`. Presentation only: REST + SSE. Execution stays in WSL2 `opencode-jail`.

## Global Invariants

<!-- BEGIN USER-SPECIFIED -->
- **Host isolation**: Source lives in `opencode-companion/` on the host. Never inject the frontend into the WSL2 jail.
- **Loopback lock**: Bind Vite and `serve.mjs` to `127.0.0.1` only. The daemon has no auth; `0.0.0.0` is LAN RCE.
- **Zero credential exposure**: Do not store or log raw relay/API tokens in source, reports, or console. Session history lives in the daemon, not this repo.
<!-- END USER-SPECIFIED -->

Load `docs/modules/<file>.md` only when changing that subsystem. Do not concatenate this tree into one prompt.

## Module Router

| Module | Document | Responsibilities & when to read |
| :--- | :--- | :--- |
| SessionManagement | [docs/modules/session-management.md](docs/modules/session-management.md) | Lifecycle, draft tabs, canonical project binding, revert dock, archive/pin. Daemon owns SQLite; companion never reads `opencode.db`. |
| DialogueBlueprint | [docs/modules/dialogue-blueprint.md](docs/modules/dialogue-blueprint.md) | React Flow canvas, Dagre, laser cutter, lazy connect, action menu, undo vs SSE persist. |
| StreamingChat | [docs/modules/streaming-chat.md](docs/modules/streaming-chat.md) | SSE `/global/event`, delta concat, error fuse, tool cards, GFM markdown tables. |
| PromptController | [docs/modules/prompt-controller.md](docs/modules/prompt-controller.md) | Textarea, `/` and `@` popover, paste/upload/drag-drop, project pill, Todo button. |
| LayoutModes | [docs/modules/layout-modes.md](docs/modules/layout-modes.md) | Sidebar, tabs, Ctrl+K search, Ctrl+F find, F11 zen, shortcuts, 2s countdown lock. |
| RelayGateway | [docs/modules/relay-gateway.md](docs/modules/relay-gateway.md) | Model selector, provider config, relay billing hub, settings token field. |
| FeatureFlags | [docs/modules/plugin-system.md](docs/modules/plugin-system.md) | `UserPreferences` visibility toggles. No `src/plugins/` registry in this repo. |

Agent skill (JIT, not this tree): `OpenCodeCompanionDev`. Daemon ops: `OpenCodeBackendOps`.

```text
[Edge/Chrome 127.0.0.1:5173] --REST/SSE--> [WSL2 daemon 127.0.0.1:5001]
                         \--POST /tui/select-session--> [OpenCode Desktop]
```

`src/services/api.ts` REST + normalize · `src/services/sse.ts` EventSource · `src/hooks/` session/chat · `src/components/{chat,layout,map,search,settings}/` · `serve.mjs` / `launch.pyw` host runtime.

## Run

```powershell
pnpm install
pnpm dev          # http://127.0.0.1:5173
pnpm test
pnpm run build    # tsc -b && vite build
node serve.mjs    # production, bind 127.0.0.1:5173
```

Health: `curl --max-time 5 http://127.0.0.1:5001/global/health`

Normalize every daemon payload in `src/services/api.ts` before React state. Schema details live in SessionManagement and StreamingChat.

Silent Windows start: `start-silent.vbs` or `pythonw launch.pyw` (Edge `--app=http://127.0.0.1:5173/`). Map JSON in `data/` is gitignored. MIT — see `LICENSE`.

`_Architecture.md` is the lean architecture router. `_README.md` is a usage pointer. Do not restore feature lists into this file.
