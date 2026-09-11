# OpenCode Web Companion

<context>
For underlying architecture constraints, data flow sequence, and component boundaries, refer to: `_Architecture.md`.
</context>

<layer_1_quick_start>
## Quick Start

OpenCode Web Companion is an independent, lightweight web dashboard running natively on the Windows host. It directly monitors and controls the OpenCode daemon running in the WSL2 sandbox (`opencode-jail`).

### Prerequisites
- Windows 11 with Node.js v22+ and pnpm v11+
- OpenCode daemon running in WSL2 at `http://127.0.0.1:5001`

### Running the Companion App
```powershell
cd opencode-companion
pnpm install
pnpm dev
```
Access the application at `http://127.0.0.1:5173/`.
</layer_1_quick_start>

<layer_2_detailed_guide>
## Core Features

1. **Workspace & Canonical Project Navigation**:
   - Sidebar filters strictly to the 5 canonical workspaces: `APISpace`, `ObsidianDev`, `ObsidianNote`, `AISpace`, `NullSpace`.
   - Instant search across session titles and session IDs (`Ctrl+K` for A1 floating search modal).
   - Categorized by time: `Today`, `Yesterday`, `Older`.

2. **Dialogue Map Blueprint Canvas (对话蓝图地图, `Ctrl+M`)**:
   - **Interactive Node Graph**: Built with `@xyflow/react` and `@dagrejs/dagre` for automated left-to-right hierarchical tree auto-layout.
   - **Unreal Engine 5.4 Blueprint Ergonomics**:
     * **Wire & Pin Break (`Alt + Left Click`)**: Alt-clicking any wire or edge label instantly breaks the connection. Alt-clicking any input/output pin (`<Handle>`) severs all connections attached to that pin.
     * **Laser Wire Cutter (`Alt + Middle Mouse` or `Alt + Left Drag`)**: Draws a sci-fi laser cutting trajectory slicing across wires with real-time feedback. Multiple sliced wires in a single stroke merge into a single atomic Undo step.
     * **Smart Drop / Lazy Connect**: Dragging a wire and releasing anywhere inside a session card (text, padding, metadata) automatically resolves polarity (`source` -> `target`, or `target` -> `source`) and establishes the link without falsely triggering branch creation.
     * **Empty-Space Blueprint Action & Search Menu**: Dragging a wire into open canvas space pops up an in-place search menu at the cursor, allowing instant fuzzy searching of existing sessions to connect, or spawning new branch/independent sessions.
     * **Auto-Rearrange (`Alt + R`)**: Runs Dagre hierarchical graph auto-layout and smoothly centers the viewport.
     * **Comment Groups**: Press `C` to group selected cards. Comment groups automatically expand bounding boxes when new cards are dropped inside, support 4-corner & edge resizing with `<NodeResizer>`, and preserve dimensions to disk.
     * **Hover Delete**: Quick-delete trash icon appears on mouse hover in the top-right corner of cards and group headers; hovering over any node and pressing `Delete` / `Backspace` deletes it instantly without prior selection.
     * **Time-Travel Undo/Redo Engine (`Ctrl+Z`, `Ctrl+Y` / `Ctrl+Shift+Z`)**: 50-step transaction history strictly decoupled from background SSE streams.

3. **Floating Global Search Modal (`Ctrl+K`)**:
   - Implements A1 standard floating geometry (`85vw × 85vh`, backdrop blur, single-row integrated header).
   - Windows IME Shield with continuous input focus and lossless keystroke redirection.
   - Arrow keys navigate results; `Enter` opens session and dismisses modal immediately.

4. **Immersive Zen Reading Mode (`F11`)**:
   - Hides sidebar, header, and clutter, dedicating 100% of viewport space to high-comfort reading of AI dialogue.
   - Press `F11` or `Esc` to exit.

5. **Configurable Shortcuts & Countdown Safety Lock**:
   - Settings modal (`Ctrl+,`) with tabbed category filtering (`All`, `Global & Chat`, `Blueprint Map`) and real-time search.
   - Resetting shortcuts to defaults triggers `CountdownConfirmDialog` with an enforced 2-second countdown lock preventing accidental clicks.

6. **Realtime SSE Streaming**:
   - Subscribes directly to `GET /global/event`.
   - Realtime incremental rendering of `message.part.delta` with zero UI freezing.
   - Live synchronization of `session.status` (`idle`, `busy`, `retry`).

7. **Rich Tool Call & Thought Visualizer**:
   - **Shell Execution**: Displays command line and terminal output block with copy support.
   - **File Operations**: Status pills for `Edit`, `Write`, and `Read`.
   - **Thinking Process**: Collapsible drawer for model reasoning tokens.
   - **Multimodal Attachments**: Clipboard paste (`Ctrl+V`) and thumbnail preview for image attachments.
</layer_2_detailed_guide>

<layer_3_advanced>
## Key API Endpoints & Shortcuts

### API Endpoints Used
| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `/project` | `GET` | Retrieve list of registered workspace projects |
| `/session` | `GET` / `POST` | List and create chat sessions (with directory binding) |
| `/session/{id}` | `GET` / `DELETE` / `PATCH` | Retrieve, delete, and rename sessions |
| `/session/{id}/message` | `GET` | Load historical messages and tool parts |
| `/session/{id}/prompt_async` | `POST` | Submit prompt asynchronously |
| `/session/{id}/abort` | `POST` | Interrupt currently running generation |
| `/session/{id}/todo` | `GET` | Retrieve session task checklist |
| `/global/event` | `GET (SSE)` | Receive server events stream |
| `/tui/select-session` | `POST` | Switch active session in OpenCode desktop |

### Default Keyboard Shortcuts
| Shortcut | Action | Scope |
| :--- | :--- | :--- |
| `Ctrl + M` | Toggle Dialogue Map Blueprint | Global |
| `Ctrl + K` | Open Floating Search Modal | Global |
| `Ctrl + B` | Toggle Left Sidebar | Global |
| `Ctrl + N` | New Chat Session | Global |
| `Ctrl + ,` | Open Settings Modal | Global |
| `F11` | Toggle Immersive Zen Reading Mode | Global |
| `Ctrl + Z` | Undo Blueprint Action | Dialogue Map |
| `Ctrl + Y` / `Ctrl + Shift + Z` | Redo Blueprint Action | Dialogue Map |
| `Alt + Left Click` | Break wire or pin connections | Dialogue Map |
| `Alt + Middle Drag` | Laser wire cutter (slice connections) | Dialogue Map |
| `Alt + R` | Auto-rearrange graph layout (Dagre) | Dialogue Map |
| `F` | Focus / Frame selected cards | Dialogue Map |
| `C` | Wrap selected cards in Comment Group | Dialogue Map |
| `Delete` / `Backspace` | Delete hovered or selected node | Dialogue Map |
</layer_3_advanced>
