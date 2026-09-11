# OpenCode Web Companion

An independent, high-performance web dashboard and visual dialogue canvas for the OpenCode AI coding engine, running on the Windows host and interfacing with the OpenCode daemon (`http://127.0.0.1:5001`).

---

## Overview

OpenCode Web Companion provides a dedicated desktop and browser interface for interacting with OpenCode sessions. It decouples the presentation layer from the sandboxed execution environment, running natively on Windows while communicating with the backend daemon via REST and Server-Sent Events (SSE).

Key components:
- **Dialogue Map Canvas**: A visual node graph powered by `@xyflow/react` and `@dagrejs/dagre`, adopting interaction patterns from Unreal Engine 5.4 Blueprint editors (wire cutting, lazy connection, contextual search menus, and state-isolated undo/redo).
- **A1 Floating Search**: A system-wide session search modal with Windows Input Method Editor (IME) protection, continuous focus management, and lossless keystroke redirection.
- **Immersive Zen Mode**: Fullscreen distraction-free reading mode for reviewing complex reasoning chains and code diffs.
- **Realtime Stream Visualizer**: Zero-flicker incremental rendering for assistant responses, thinking traces, tool execution output, and multimodal attachments.
- **Configurable Shortcut System**: User-configurable keybindings with an enforced 2-second countdown safety lock on destructive operations.

---

## Architecture

```text
[ Windows Host: Chromium / Edge PWA (127.0.0.1:5173) ]
      |
      |-- HTTP REST (GET / POST / DELETE) --> [ WSL2 / Local OpenCode Daemon (127.0.0.1:5001) ]
      |-- SSE Event Stream (GET /global/event) <--+ (Incremental deltas, tool updates, session state)
      +-- TUI Focus Switch (POST /tui/select-session) --> [ OpenCode Desktop Application ]
```

### Architectural Principles
1. **Host-Sandbox Decoupling**: The companion frontend operates purely on the host environment, preventing file system permission locks or network firewall blocks inside execution sandboxes.
2. **Event Phase Separation**: Canvas interaction shortcuts (such as laser wire cutting and pin breaking) hook into the DOM capture phase (`onPointerDownCapture`), preventing event pollution on pan/zoom surfaces.
3. **Dual Coordinate Space Isolation**: Screen-space coordinates govern floating popovers and HUDs, while flow-space coordinates govern node positions and vector routing on the infinite canvas.
4. **Stream-Safe History**: User mutations to canvas layout (drag, delete, rearrange, group) enter an isolated 50-step transaction history (`Ctrl+Z` / `Ctrl+Y`) that remains decoupled from incoming background SSE streams.

---

## Prerequisites

- **Operating System**: Windows 10/11 or Linux
- **Node.js**: v20.0.0 or later (v22+ recommended)
- **Package Manager**: `pnpm` v9.0.0 or later
- **Backend Service**: OpenCode daemon running and listening on `http://127.0.0.1:5001`

---

## Quick Start

### 1. Clone and Install Dependencies

```powershell
git clone https://github.com/your-org/opencode-companion.git
cd opencode-companion
pnpm install
```

### 2. Run Development Server

```powershell
pnpm dev
```

The application will be available at `http://127.0.0.1:5173/`.

### 3. Production Build and Native Server

To compile the production bundle and start the lightweight HTTP server:

```powershell
pnpm run build
node serve.mjs
```

### 4. Background Launch (Windows)

For silent background startup without a terminal window:
- Launch `start-silent.vbs` or execute `pythonw launch.pyw`.
- The launcher verifies server health, initiates background services if needed, and launches Microsoft Edge in standalone PWA application mode (`--app=http://127.0.0.1:5173/`).

---

## Feature Catalog

### 1. Dialogue Map Blueprint Canvas (`Ctrl + M`)
- **Lazy Connect**: Dragging an output pin and releasing anywhere inside a target card body automatically resolves polarity (`source -> target` or `target -> source`) and completes the connection.
- **Laser Wire Cutter**: Hold `Alt + Middle Mouse` (or `Alt + Left Drag` on canvas) to draw a laser cutting line. Any non-native connection intersected by the line is severed immediately. Slicing multiple wires in a single gesture consolidates into a single Undo step.
- **Wire & Pin Break**: `Alt + Left Click` on any connection or pin immediately disconnects it.
- **Blueprint Context Action Menu**: Releasing an edge connection in empty space opens an in-place search menu at the cursor to search existing sessions or instantiate new branches.
- **Hierarchical Auto-Layout (`Alt + R`)**: Executes Directed Acyclic Graph auto-layout via `@dagrejs/dagre` with horizontal left-to-right hierarchy.
- **Comment Groups (`C`)**: Wrap selected cards into a group. Groups automatically adjust boundaries when nodes are moved within them and support 4-corner resizing.
- **Hover Deletion**: Hovering over any card or group header and pressing `Delete` or `Backspace` removes it without requiring prior selection.

### 2. A1 Floating Search Modal (`Ctrl + K`)
- High-depth backdrop blur layout (`85vw x 85vh`).
- Windows IME Shield: Monitors composition states with cooldown guard to prevent Chinese/Japanese input keystrokes from misfiring navigation triggers.
- Continuous Focus: Arrow key navigation keeps keyboard focus anchored in the search input field without interruption.
- Lossless Keystroke Redirection: Typing anywhere on the dialog immediately transfers focus to the query input without dropping the first character.

### 3. Immersive Zen Reading Mode (`F11`)
- Hides sidebars, headers, and secondary controls.
- Centers conversation stream in an optimized reading container.
- Press `F11` or `Esc` to return to standard layout.

### 4. Safety Guarded Settings (`Ctrl + ,`)
- Searchable shortcut configuration across global and canvas scopes.
- Resetting keybindings to default enforces a 2-second countdown button lock to prevent unintended resets.

---

## Keyboard Shortcuts

| Shortcut | Action | Scope |
| :--- | :--- | :--- |
| `Ctrl + M` | Toggle Dialogue Map Canvas | Global |
| `Ctrl + K` | Open Floating Search Modal | Global |
| `Ctrl + B` | Toggle Project Sidebar | Global |
| `Ctrl + N` | Create New Session | Global |
| `Ctrl + ,` | Open Settings & Shortcuts Modal | Global |
| `F11` | Toggle Immersive Zen Reading Mode | Global |
| `Ctrl + Z` | Undo Canvas Layout Action | Dialogue Map |
| `Ctrl + Y` / `Ctrl + Shift + Z` | Redo Canvas Layout Action | Dialogue Map |
| `Alt + Left Click` | Break Connection or Pin | Dialogue Map |
| `Alt + Middle Drag` | Laser Wire Cutter | Dialogue Map |
| `Alt + R` | Auto-Rearrange Nodes (Dagre) | Dialogue Map |
| `C` | Create Comment Group from Selection | Dialogue Map |
| `Delete` / `Backspace` | Delete Hovered or Selected Node | Dialogue Map |
| `F` | Focus / Fit View to Selection | Dialogue Map |

---

## Testing and Verification

The codebase includes automated unit tests covering geometry algorithms (Bézier discretization, bounding box collision, line straddle tests), state reducers, and shortcut registries.

Execute the test suite:
```powershell
npx tsx --test "src/**/*.test.ts"
```

Type-checking and production compilation:
```powershell
pnpm run build
```

Linter audit:
```powershell
pnpm run lint
```

---

## Project Structure

```text
opencode-companion/
├── data/                       # Local runtime map data (ignored by git)
│   └── talk_map.sample.json    # Sample map schema template
├── public/                     # Static assets and favicons
├── src/
│   ├── components/
│   │   ├── chat/               # Conversation timeline, prompt input, markdown renderers
│   │   ├── common/             # CountdownConfirmDialog, UI primitives
│   │   ├── layout/             # Sidebar, Header, TabManager
│   │   ├── map/                # Dialogue map, canvas flow, nodes, edges, geometry
│   │   │   └── canvas/         # cutting-wire.ts, lazy-connect.ts, layout-dagre.ts
│   │   └── search/             # FloatingSearchModal, IME shield
│   ├── hooks/                  # useChatStream, useSessions, useTalkMap
│   ├── services/               # api.ts (REST client), sse.ts (EventSource manager)
│   ├── types/                  # opencode.ts, talk-map schema
│   └── utils/                  # shortcuts.ts, markdown formatting
├── launch.pyw                  # Windows background launcher with healthcheck
├── open_protocol.pyw           # Custom protocol URI handler (opencode://)
├── serve.mjs                   # Lightweight host HTTP daemon
├── session_launcher.py         # Local redirection shim
└── vite.config.ts              # Vite configuration and development proxy
```

---

## Privacy and Data Hygiene

This repository contains no hardcoded credentials, personal paths, or recorded conversation data:
- All dialogue history and session state remain in the local OpenCode daemon database.
- Dialogue map files (`data/*.json`) are excluded via `.gitignore`.
- Authentication tokens are not stored or transmitted by the frontend client.

---

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.
