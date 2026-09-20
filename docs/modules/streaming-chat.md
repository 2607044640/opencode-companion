# StreamingChat

Realtime transcript: SSE `/global/event`, optimistic user bubble, delta concatenation, session error fuse, thinking/`<think>` accordion, worked summary, unified diffs, GFM markdown tables.

There is **no** `UnifiedDiffView.tsx`. Hunk rendering is `src/components/diff/DiffViewer.tsx` fed by `parseUnifiedHunks` + `collapseUnchangedLines` in `tool-diff.ts`. Drawer chrome is `DiffSidebarDrawer.tsx` (`prefs.floatingDiffView` default true → centered overlay; false → right sidebar).

## Scope Boundaries

| Component | Responsible For | MUST NOT Contain |
| :--- | :--- | :--- |
| `src/services/sse.ts` | Single `EventSource` to `/global/event`, reconnect 2s→10s, typed `on*` helpers | React state, REST prompt POST |
| `src/hooks/useChatStream.ts` | History load, optimistic send, delta/part merge, status, error fuse, revert/unrevert | Textarea, map, shortcut registry |
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
- Unchanged hunk context is folded (`collapseUnchangedLines`: pad 3, minCollapse 4). The fold control is `+N more lines` (expand remaining) plus `+10` head/tail when `count > 10`. `prefs.floatingDiffView !== false` (default on) renders a centered `min(88vw, 1100px)` × `min(86vh, 900px)` dialog; turning the setting off restores the right `w-[min(48vw,720px)]` drawer. (Why chosen over dumping full context: long ctx blocks bury the actual add/del lines.)

## Numbered Data Flow

1. Session change: if id is `__draft__`, load no messages and subscribe to nothing. Else `GET /session/{id}/message` + `GET /session/{id}/todo` → normalized arrays.
2. Subscribe: `message.part.delta`, `message.part.updated`, `message.updated`, `session.status`, `session.error`, `session.idle`, `todo.updated`. Ignore events whose `sessionID` ≠ active id. One `EventSource` only (`sseManager`).
3. Send: append optimistic user message + file/text parts (`isOptimistic: true`), set `busy`, `POST /session/{id}/prompt_async` with `{ parts, agent?, model? }` (204).
4. `message.part.delta`: locate `messageID`/`partID`; append `delta` onto `text` or `reasoning`; create placeholder part/message if missing.
5. `message.part.updated`: replace by id, or replace the first optimistic part of the same type.
6. `message.updated`: merge `info` (tokens, finish, agent). If role is user and pending optimistic id is set, rewrite that bubble's id and part `messageID`s in place.
7. `partitionAssistantTurn` splits `<think>...</think>` (unclosed tag allowed) into thought groups; `classifyTool` buckets explore/edit/command/other; edits get `countDiffLines` + `extractEditItem`. Label: `formatWorkedLabel` (`Worked for 32s` / `Working for 4m`).
8. Tool cards flip `state.status` (`pending` → `running` → `completed` | `error`) from full part payloads, not deltas. Diff open: `parseUnifiedHunks` → `DiffViewer` (`collapseUnchangedLines` per hunk). `DiffSidebarDrawer` is a floating dialog when `prefs.floatingDiffView !== false`, else a right sidebar. Turn mode accordion-folds files (`collapsedFiles`); Esc / backdrop click closes.
9. `session.error` → fuse to idle + banner. Retry resends last user text/attachments. Abort → `POST /session/{id}/abort`.

## Side-effects API

| Method | Signature | Side-Effects |
| :--- | :--- | :--- |
| `sseManager.connect` | `() => void` | Opens `EventSource(http://127.0.0.1:5001/global/event)` |
| `sseManager.on` | `(type, cb) => unsubscribe` | In-memory listener set |
| `sseManager.onPartDelta` | `(cb: (SSEEventMessagePartDelta) => void)` | type `message.part.delta` |
| `useChatStream.sendPrompt` | `(text, { agent?, model?, attachments? }) => Promise<void>` | Optimistic row; `api.sendPrompt`; `busy` |
| `useChatStream.abort` | `() => Promise<void>` | `POST /abort`; status idle |
| `useChatStream.retry` | `() => Promise<void>` | Replays last user parts |
| `useChatStream.revertToMessage` | `(messageId, { mode?: RevertMode, partID? }) => Promise<{ok, error?, session?}>` | Reloads history |
| `api.getMessages` | `(sessionID) => Promise<Message[]>` | `GET /session/{id}/message` |
| `api.sendPrompt` | `(id, string \| MessagePartInput[], { agent?, model? })` | Optional `switchSessionAgent` then `POST /prompt_async` |
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
- `remark-gfm` tables and `rehype-highlight` fences stay on assistant markdown.
- Diff hunk context folding (`+N more lines` / `+10`) and the floating-vs-drawer pref stay. Do not dump full unchanged context by default.
<!-- END USER-SPECIFIED -->
