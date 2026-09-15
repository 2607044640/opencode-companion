# SessionManagement

Session list, tabs, canonical project binding, lazy draft, pin DnD, unread ring, revert dock, archive, JSON export. Transcripts persist in the OpenCode daemon. Companion never opens SQLite.

`POST /api/git-revert` exists on `serve.mjs` (host worktree revert/reset). **No React caller.** Session rollback UI is daemon `revert` / `unrevert` via `SessionRevertDock`.

## Scope Boundaries

| Component | Responsible For | MUST NOT Contain |
| :--- | :--- | :--- |
| `src/hooks/useSessions.ts` | Project/session fetch, tab set, draft swap, date groups, archive filter, URL `?session=` | Message parts, SSE delta concat, prompt textarea |
| `src/services/api.ts` (`normalizeSession`, CRUD) | Ingress defaults, canonical 5-workspace filter, directory canonicalize, revert/unrevert HTTP | UI grouping, localStorage archive keys |
| `src/utils/pinning.ts` | Pin ID set, `reorderPinnedSessionIds` move-to-index | Daemon DELETE |
| `src/utils/session-unread.ts` | Human-pending + unread IDs; blue ring trigger | Automated `/RelayAPIVetting` runs |
| `src/utils/archiving.ts` | localStorage archive IDs + custom events | Daemon `DELETE /session` |
| `src/components/layout/Sidebar.tsx` | Project chips, pin DnD, rename, archive, Today/Yesterday/Older, unread pulse | Chat timeline, map mutations |
| `src/components/chat/SessionRevertDock.tsx` | Rolled-back **user** turns after `session.revert.messageID` | Disk snapshot restore, prompt send |
| `src/components/chat/CopyExportButton.tsx` | Click copy JSON; long-press 500ms desktop export | Git revert |

## Key Invariants

- Companion never reads `opencode.db`, `one-api.db`, or `C:/APIGatewayData`. Sessions persist in the daemon; UI-only sets (archive, pin, unread) live in localStorage. (Why chosen over reading SQLite: AGENTS credential/lock hygiene; file locks crash the daemon.)
- `Ctrl+N` opens `DRAFT_SESSION_ID` (`__draft__`) and does **not** call `POST /session` until the first send. (Why chosen over eager create: abandoned `New session - *` rows with zero tokens polluted the sidebar.)
- `canonicalizeDirectory` rewrites `C:/.../<CanonicalName>` to `/workspace/projects/<CanonicalName>` before `POST /session?directory=`. Sidebar filters to `CANONICAL_PROJECTS` (`APISpace`, `ObsidianDev`, `ObsidianNote`, `AISpace`, `NullSpace`). (Why chosen over raw host paths: daemon worktrees are Linux paths inside the jail; aliases otherwise duplicate the same repo.)

## Numbered Data Flow

1. Mount: `useSessions.refresh` → `GET /project` + `GET /session?limit=500` → `normalizeSession` / `normalizeProject` → `deduplicateAndFilterProjects`.
2. `sanitizeSessionTitle` trims; whitespace-only (`' '`, `\t`, `\u00a0`) becomes `'Untitled Session'`. Sidebar display fallback is localized `'未命名会话'` / `'Untitled session'`.
3. URL `?session=<id>` wins; else first non-abandoned session becomes the active tab.
4. SSE `session.created` / `updated` / `deleted` upsert or drop rows and repair `openTabIds`.
5. `startDraftSession` sets active id to `__draft__`, drops `?session`, skips backend create. First prompt (PromptController) calls `createNewSession`, swaps the draft tab id in place, writes `?session=<newId>`.
6. Pin: `togglePinSessionId` writes `opencode_pinned_sessions` and emits `opencode_pinned_sessions_updated`. Sidebar HTML5 DnD uses MIME `application/x-opencode-pinned-id`; drop calls `reorderPinnedSessionIds(fromId, toId)` (move-to-index; no-op if unknown/same; **preserves hidden archived IDs** in the full storage array).
7. Unread: human send → `markHumanInitiated` (`sessionStorage`). On idle/`handleSessionCompletion`, if human-pending, `markSessionUnread` (`localStorage`) and pulse `bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]`. Viewing clears via `markSessionRead`. Automated AI runs do not mark unread.
8. Revert: `POST /session/{id}/revert` (or `/api/session/{id}/revert/stage` when `files: false`) stores `session.revert.messageID`. Dock lists user messages after that boundary. Restore latest → `POST /unrevert`; restore older → revert to that message.
9. Export: `api.getAllMessagesRaw` → click copies clipboard; pointer-down 500ms → `POST /api/export-session` `{ filename, content }` (Desktop via `serve.mjs`; blob download fallback).
10. Archive: write `opencode_archived_sessions` and emit `opencode_archived_sessions_updated`. Row leaves `groupedSessions`, stays in `archivedSessions`. Delete is a separate daemon `DELETE`.
11. Agent: `POST /api/session/{id}/agent` with canonical names from `resolveAgentName` (`Atlas - Plan Executor`, `Prometheus - Plan Builder`, `Sisyphus - ultraworker`).

## Side-effects API

| Method | Signature | Side-Effects |
| :--- | :--- | :--- |
| `sanitizeSessionTitle` | `(rawTitle: unknown, defaultFallback = 'Untitled Session') => string` | Pure |
| `normalizeSession` | `(raw: any) => Session` | Pure; `...raw` extra="allow" |
| `canonicalizeDirectory` | `(dir?: string) => string \| undefined` | Pure |
| `api.getProjects` | `() => Promise<Project[]>` | `GET /project`; canonical five (+ optional `global`) |
| `api.getSessions` | `(directory?: string) => Promise<Session[]>` | `GET /session?limit=500`; sort `time.updated` desc |
| `api.createSession` | `(params?: { title?, agent?, directory?, model? }) => Promise<Session>` | `POST /session?directory=`; may `POST /api/session/{id}/agent` |
| `api.updateSession` | `(id, { title?, directory? }) => Promise<Session>` | `PATCH /session/{id}` |
| `api.deleteSession` | `(id) => Promise<void>` | `DELETE /session/{id}`; hook also `closeTab` |
| `api.switchSessionAgent` | `(sessionID, agentName) => Promise<void>` | `POST /api/session/{id}/agent` |
| `api.revertSession` | `(id, messageID, opts?: RevertSessionOptions) => Promise<Session>` | `POST /revert` or v2 `/revert/stage`; sets `session.revert` |
| `api.unrevertSession` | `(id) => Promise<Session>` | `POST /unrevert` |
| `api.getAllMessagesRaw` | `(sessionID) => Promise<string>` | `GET /session/{id}/message` unnormalized JSON string |
| `useSessions.startDraftSession` | `() => void` | Sets `__draft__`; no HTTP |
| `useSessions.createNewSession` | `same as api.createSession` | Inserts row, replaces draft tab, `history.replaceState` |
| `reorderPinnedSessionIds` | `(fromId, toId, storage?) => string[]` | Rewrites `opencode_pinned_sessions` |
| `handleSessionCompletion` | `(sessionId, storage?, sessionStorage?) => boolean` | May mark unread |
| `archiveSessionId` | `(id) => { archivedIds }` | Writes `opencode_archived_sessions` |

`RevertSessionOptions`: `{ partID?: string; files?: boolean }`. `files: false` prefers conversation-only stage.

Host-only (no UI): `POST /api/git-revert` `{ directory, mode?: 'revert' \| 'reset' }` in `serve.mjs` (`git revert HEAD --no-edit` or `git reset HEAD~1 --soft`, 15s).

## Actionable Recipes

<adding_session_field_recipe>
1. Extend `Session` in `src/types/opencode.ts`.
2. Map the field inside `normalizeSession` with a safe default (`extra="allow"` spread remains).
3. If it is UI-only, persist via a dedicated localStorage util — do not invent a daemon PATCH.
4. Add a unit test next to the util; do not assert against live SQLite.
</adding_session_field_recipe>

<adding_canonical_workspace_recipe>
1. Append one `CanonicalProjectMeta` to `CANONICAL_PROJECTS` in `src/services/api.ts` (name, `defaultWorktree`, `defaultColor`, `fallbackId`).
2. Keep `fallbackId` stable; it is the merge key when the daemon returns duplicate worktrees.
3. Verify `matchCanonicalWorkspace` + `deduplicateAndFilterProjects` still collapse Windows and jail paths to one chip.
</adding_canonical_workspace_recipe>

## User Protection Zones

<!-- BEGIN USER-SPECIFIED -->
- Lazy draft: `Ctrl+N` must not create a daemon session until the user sends. Instant `POST /session` is a regression.
- Dual-mode desktop handoff lives on `api.openInDesktop`: try `POST /tui/select-session` first; fallback `opencode://session?id=` only when TUI is down.
- Revert dock restores **user** turns only; do not list assistant/tool rows as restore targets.
<!-- END USER-SPECIFIED -->
