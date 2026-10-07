# StreamingChat

Realtime transcript: SSE `/global/event`, optimistic user bubble, delta concatenation, session error fuse, thinking/`<think>` accordion, worked summary, unified diffs, GFM markdown tables.

There is **no** `UnifiedDiffView.tsx`. Hunk rendering is `src/components/diff/DiffViewer.tsx` fed by `parseUnifiedHunks` + `collapseUnchangedLines` in `tool-diff.ts`. Drawer chrome is `DiffSidebarDrawer.tsx` (`prefs.floatingDiffView` default true → centered overlay; false → right sidebar).

## Scope Boundaries

| Component | Responsible For | MUST NOT Contain |
| :--- | :--- | :--- |
| `src/services/sse.ts` | Single `EventSource` to `/global/event`, reconnect 2s→10s, typed `on*` helpers | React state, REST prompt POST |
| `src/hooks/useChatStream.ts` | History load, optimistic send, delta/part merge, status, error fuse, revert/unrevert | Textarea, map, shortcut registry, part-array assembly |
| `src/utils/prompt-parts.ts` | `buildPromptParts`, `buildOptimisticMessage`, `reconcileHistoryWithOptimistic` | FileReader, HTTP |
| `src/components/chat/ChatTimeline.tsx` | Scroll, 502/error banner, find-in-page host, revert confirm diffs | `sendPrompt` HTTP |
| `MessageBubble.tsx` | Per-message agent badge, model pill, `react-markdown` + `remark-gfm` + `rehype-highlight` | Prompt target dropdown (next-send, not author) |
| `src/utils/worked-summary.ts` | `classifyTool`, `partitionAssistantTurn`, `<think>` split, duration labels, diff line counts | HTTP |
| `WorkedSummaryCard.tsx` | Collapsed explore/command/thought groups; per-edit cards | Session CRUD |
| `src/utils/tool-diff.ts` | `parseUnifiedHunks`, `buildUnifiedDiff` (skip files >20k lines), `collapseUnchangedLines` | Drawer chrome |
| `src/components/diff/DiffViewer.tsx` | Hunk headers, line numbers, `+N more lines` / `+10` fold UI | Prompt send, session CRUD |
| `src/components/diff/DiffSidebarDrawer.tsx` | Floating overlay vs right drawer, turn-mode file accordion, Esc close | Hunk parse |
| `src/components/diff/DiffDrawerContext.tsx` | `payload` / `turnPayload` open state | SSE concat |
| `ToolCard.tsx` / `ToolBatchCard.tsx` / `ReasoningCard.tsx` | Tool I/O, batched tools, collapsible reasoning | Session CRUD |
| `src/services/api.ts` (`normalizeMessage*`) | Defensive ingress (`extra="allow"`) | UI collapsing |

## Key Invariants

- Normalize once at the API/SSE boundary (`normalizeMessageInfo`, `normalizeMessagePart`). Components must not sprinkle `x?.y || ''` as a substitute. (Why chosen over per-widget defaults: daemon omits `model` / `tokens` / `name` across roles.)
- Error fuse: `session.error` immediately sets status `idle` and `error`. Do not wait for a later `session.status`. (Why chosen over waiting for idle: a hung `busy` spinner traps the abort button.)
- Optimistic user id `usr_<ts>` is swapped for the real id on `message.updated` (`pendingOptimisticIdRef`). (Why chosen over appending a second bubble: without the swap, the user message duplicates.)
- Wire parts and the optimistic bubble share `src/utils/prompt-parts.ts`. `useChatStream.sendPrompt` calls `buildOptimisticMessage` then `buildPromptParts`; `api.sendPrompt` calls `buildPromptParts` again (file URLs deduped). Do not assemble `{ type: 'file' }` inline. (Why chosen over two builders: the first send and `__draft__` promotion dropped images when only one path knew about attachments.)
- `loadSessionData` sets messages via `reconcileHistoryWithOptimistic(history, prev)`. Empty history while a local timeline exists keeps `prev`. A user row in history that lacks file parts inherits file parts from the previous optimistic user message. (Why chosen over replacing state with GET: the daemon often returns text before file parts exist, which wiped the thumbnail.)
- `loading`, `messages`, `todos`, `error`, and `loadedSessionId` are written only while `currentSessionIdRef` is still that id. A late GET for session A must not clear session B's spinner. `__draft__` and a null id set `loading` false. The timeline spinner is `messagesLoading || isPendingSession` while the transcript is empty and there is no error. Token or file counts are not a loading signal. (Why chosen over an unconditional `finally`: a fast tab switch left the new session looking idle, and a fetched empty transcript with leftover tokens spun forever.)
- Data-URL file parts trigger `api.materializeAttachment` → `POST /api/materialize-attachment` (`serve.mjs`) without awaiting it before `prompt_async`. Failure is a console warning. (Why chosen over blocking send: disk mirrors are for native file reads, not the daemon contract.)
- Unchanged hunk context is folded (`collapseUnchangedLines`: pad 3, minCollapse 4). The fold control is `+N more lines` (expand remaining) plus `+10` head/tail when `count > 10`. `prefs.floatingDiffView !== false` (default on) renders a centered `min(88vw, 1100px)` × `min(86vh, 900px)` dialog; turning the setting off restores the right `w-[min(48vw,720px)]` drawer. (Why chosen over dumping full context: long ctx blocks bury the actual add/del lines.)

## Numbered Data Flow

1. Session change: if id is `__draft__`, load no messages and subscribe to nothing. Else `GET /session/{id}/message` + `GET /session/{id}/todo`. History is merged with `reconcileHistoryWithOptimistic`, not assigned raw. A draft→real switch that this hook itself started (`transitioningSessionIdRef`) still loads history but does not clear the optimistic row first.
2. Subscribe: `message.part.delta`, `message.part.updated`, `message.updated`, `session.status`, `session.error`, `session.idle`, `todo.updated`. Ignore events whose `sessionID` ≠ active id. One `EventSource` only (`sseManager`).
3. Send: `buildOptimisticMessage` (file parts then trimmed text, `isOptimistic: true`, id `usr_<ts>`), set `busy`, `buildPromptParts`, `api.sendPrompt` → `POST /session/{id}/prompt_async` with `{ parts, agent?, model? }` (204). Image-only (no text) is sent. Each data-URL file part also fires `POST /api/materialize-attachment` (non-blocking).
4. `message.part.delta`: locate `messageID`/`partID`; append `delta` onto `text` or `reasoning`; create placeholder part/message if missing.
5. `message.part.updated`: replace by id, or replace the first optimistic part of the same type.
6. `message.updated`: merge `info` (tokens, finish, agent). If role is user and pending optimistic id is set, rewrite that bubble's id and part `messageID`s in place.
7. `partitionAssistantTurn` splits `<think>...</think>` (unclosed tag allowed) into thought groups; `classifyTool` buckets explore/edit/command/other; edits get `countDiffLines` + `extractEditItem`. Label: `formatWorkedLabel` (`Worked for 32s` / `Working for 4m`).
8. Tool cards flip `state.status` (`pending` → `running` → `completed` | `error`) from full part payloads, not deltas. Diff open: `parseUnifiedHunks` → `DiffViewer` (`collapseUnchangedLines` per hunk). `DiffSidebarDrawer` is a floating dialog when `prefs.floatingDiffView !== false`, else a right sidebar. Turn mode accordion-folds files (`collapsedFiles`); Esc / backdrop click closes.
9. `session.error` → fuse to idle + banner. Retry resends last user text/attachments. Abort → `POST /session/{id}/abort`. On `session.idle`, an empty `empty_response` or `system_abort` with no assistant error body calls that same retry once per user prompt text. Retry deletes the user row and mints a new id, so the latch is the text, not the id. A second empty failure of that same text stays on the banner. `repetition_loop` and a 502 that already has an error body do not auto-retry.

## Side-effects API

| Method | Signature | Side-Effects |
| :--- | :--- | :--- |
| `sseManager.connect` | `() => void` | Opens `EventSource(http://127.0.0.1:5001/global/event)` |
| `sseManager.on` | `(type, cb) => unsubscribe` | In-memory listener set |
| `sseManager.onPartDelta` | `(cb: (SSEEventMessagePartDelta) => void)` | type `message.part.delta` |
| `useChatStream.sendPrompt` | `(text, { agent?, model?, attachments? }, targetSessionId?) => Promise<void>` | Optimistic row via `buildOptimisticMessage`; `api.sendPrompt`; `busy` |
| `buildPromptParts` | `(input: string \| MessagePartInput[], attachments?) => MessagePartInput[]` | Pure. File parts `{ type, mime, filename, url }` then text. |
| `buildOptimisticMessage` | `({ sessionId, text, attachments?, agent?, model? }) => Message` | Pure. `usr_<ts>` + `isOptimistic` parts |
| `reconcileHistoryWithOptimistic` | `(history, prev) => Message[]` | Pure. Keeps `prev` when history is empty; copies missing file parts onto history user rows |
| `api.materializeAttachment` | `({ filename?, mime?, dataUrl }) => Promise<void>` | `POST /api/materialize-attachment`; swallows errors |
| `useChatStream.abort` | `() => Promise<void>` | `POST /abort`; status idle |
| `useChatStream.retry` | `() => Promise<void>` | Replays last user parts |
| `useChatStream.revertToMessage` | `(messageId, { mode?: RevertMode, partID? }) => Promise<{ok, error?, session?}>` | Reloads history |
| `api.getMessages` | `(sessionID) => Promise<Message[]>` | `GET /session/{id}/message` |
| `api.sendPrompt` | `(id, string \| MessagePartInput[], { agent?, model?, attachments? })` | `buildPromptParts`; optional `switchSessionAgent`; non-blocking materialize; `POST /prompt_async` |
| `classifyTool` | `(tool: string) => 'explore' \| 'edit' \| 'command' \| 'other'` | Pure |
| `partitionAssistantTurn` | `(parts, info?, now?) => WorkedTurn` | Pure |
| `formatWorkedLabel` | `(ms, isLive) => string` | Pure |
| `countDiffLines` | `(unified: string) => { additions, deletions }` | Pure |
| `parseUnifiedHunks` | `(unified: string) => DiffHunk[]` | Pure; skips `diff --git` / `---` / `+++` preamble |
| `collapseUnchangedLines` | `(lines, { pad=3, minCollapse=4, revealed? }) => DiffViewRow[]` | Pure; `line` vs `collapse` rows |
| `buildUnifiedDiff` | `(filePath, oldStr?, newStr?) => string` | Pure; >20k lines → stub hunk |

`RevertMode`: `both` (files+conversation), `conversation_only` (`files: false` / v2 stage), `code_only` (revert files then `unrevert` to keep messages), `summarize` (`POST /summarize`).

SSE envelope: `{ id, type, properties }` or `{ payload: { type, properties } }`. Delta fields: `sessionID`, `messageID`, `partID`, `field` (`text` \| `reasoning`), `delta`. Reconnect delay starts 2000ms, `* 1.5`, cap 10000ms.

User vs assistant author fields differ: user has `model: { providerID, modelID }`; assistant has top-level `modelID` / `providerID` / `mode`. Normalizer unifies both so historical badges are not the PromptInput target.

## Actionable Recipes

<adding_sse_event_recipe>
1. Add the payload type in `src/types/opencode.ts`.
2. If it needs a helper, add `sseManager.onX` next to the existing typed wrappers.
3. Subscribe inside the `useChatStream` effect and filter `sessionID`.
4. Mutate `messages` / `todos` / `sessionStatus` only. Do not open a second EventSource.
</adding_sse_event_recipe>

<adding_part_type_recipe>
1. Extend `MessagePart` union + `normalizeMessagePart` (keep `...raw`).
2. Render in `MessageBubble` or fold into `partitionAssistantTurn`. GFM stays on the markdown path.
3. Delta handler only concatenates `text` and `reasoning`. New streamed fields need an explicit branch.
</adding_part_type_recipe>

## User Protection Zones

<!-- BEGIN USER-SPECIFIED -->
- Error fuse on `session.error` is mandatory. A `busy` lock after a backend fault is a defect.
- Historical agent/model badges read `info.agent` / `info.mode` / normalized `modelID`. Never substitute the bottom PromptInput selection.
- Optimistic user-message swap (`pendingOptimisticIdRef`) stays. Removing it reintroduces duplicate bubbles.
- File parts on send and on history reload go through `prompt-parts.ts`. Do not POST a text-only body when attachments exist, and do not replace history with a GET that drops in-flight file parts.
- `remark-gfm` tables and `rehype-highlight` fences stay on assistant markdown.
- Diff hunk context folding (`+N more lines` / `+10`) and the floating-vs-drawer pref stay. Do not dump full unchanged context by default.
<!-- END USER-SPECIFIED -->
