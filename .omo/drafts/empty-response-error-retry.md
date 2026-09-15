---
slug: empty-response-error-retry
status: awaiting-approval
intent: clear
review_required: false
pending-action: write .omo/plans/empty-response-error-retry.md
approach: Preserve daemon AssistantMessage.error through normalize; extract relay HTTP body/status from session.error + ApiError; treat idle empty assistant turns as a local UI failure; render the error inside the empty assistant card AND the existing timeline banner; on Retry delete failed assistant messages (not the user prompt), clear local error, resend via prompt_async without appending a duplicate user bubble. Never copy error text into message parts.
classification: standard
---

# Draft: empty-response-error-retry

## Components (topology ledger)

| id | outcome | status | evidence |
|---|---|---|---|
| error-schema | `MessageInfo.error` typed + `normalizeMessageInfo` preserves daemon `AssistantMessage.error` | active | `src/types/opencode.ts:82-105`; `src/services/api.ts:290-333`; SDK `AssistantMessage.error` at `@opencode-ai/sdk/dist/gen/types.gen.d.ts:98-106` |
| error-extract | Pure `extractRelayError` / `formatRelayErrorDisplay` from session.error, info.error, ApiError, empty-idle | active | `useChatStream.ts:259-267`; `api.ts:454-496`; SDK `ApiError.data.{message,statusCode,responseBody}` |
| empty-turn | Pure `isAssistantTurnEmpty` + idle-time fuse so empty cards become failures | active | `useChatStream.ts:270-274` idle sets idle only; `MessageBubble.tsx:887/997` skip blank text; `timeline-grouping.ts:42-97` still emits empty assistant bubble |
| error-ui | Empty assistant card shows relay/status copy; existing rose banner still fires | active | `ChatTimeline.tsx:595-625` banner; `MessageBubble.tsx:32,788` unused `onRetry`; `App.tsx:868-869` |
| retry-cleanup | Retry deletes failed assistants, clears error, resends without duplicating user | active | `useChatStream.ts:395-420` retry→sendPrompt; `api.ts:683-687` `deleteMessage` unused; SDK `EventMessageRemoved` |
| sse-removed | Subscribe `message.removed` so DELETE is reflected locally | active | `sse.ts` has no `onMessageRemoved`; SDK `EventMessageRemoved` `:135-140` |
| tests | node:test for extract/empty/normalize/retry-plan; no RTL | active | `package.json` `"test": "tsx --test src/**/*.test.ts"`; no hook tests today |

## Open assumptions (announced defaults)

| assumption | adopted default | rationale | reversible? |
|---|---|---|---|
| Error chrome | Both: fill the empty assistant card AND keep the existing timeline rose banner | User complaint is the empty card; banner already exists and is wired (`error` / `sessionStatus.retry`) | yes |
| Retry keeps the user prompt | DELETE only failed/empty assistant messages after last user; do not delete the user turn | User asked to clean the failed assistant turn, not the prompt | yes |
| Resend path | New `resendLastUserPrompt` that POSTs `/prompt_async` without appending another optimistic user bubble | Current `retry()`→`sendPrompt()` duplicates the user message | yes |
| Empty-turn definition | After `session.idle` (and not `MessageAbortedError`), last assistant group after last user has no trimmed text, no reasoning text, no file, no tool with status completed/error/running | Matches the blank card the user sees | yes |
| Error copy | Prefer relay `responseBody` (trim to 500 chars) → `data.message` → `HTTP {statusCode}` → error `name` → localized empty fallback | User asked for 中转站报错 if available | yes |
| Abort is not empty-fail | User abort / `MessageAbortedError` does not synthesize an empty-response error | Intentional stop, not a relay failure | yes |
| Do not write error into text parts | Display via `info.error` + hook `error` string only | Text parts are session history the model will see | no (safety) |
| DELETE primary, revert fallback | `DELETE /session/{id}/message/{assistantId}` first; if 404/405, conversation-only revert to last **user** messageId (`files: false`) then immediately `unrevert` is NOT used — only DELETE. If DELETE unavailable, conversation-only revert to last user (hides assistants from next prompt) and clear local assistants; do not open revert dock UX if we can avoid it. Prefer DELETE. | Revert dock is the wrong UX for Retry | yes |
| Test strategy | TDD: pure helpers first (`src/utils/relay-error.ts`, `src/utils/empty-turn.ts`), then normalize tests, then a retry-plan unit test. No React Testing Library (repo has none). Agent-executed `pnpm test` + `pnpm exec tsc -b --pretty false`. | Matches existing `src/**/*.test.ts` | n/a |

## Findings (cited - path:lines)

### Why the empty card happens

1. `POST /session/{id}/prompt_async` is fire-and-forget 204 (`api.ts:807-814`). HTTP success only means "queued", not "model produced tokens".
2. `message.updated` with a new assistant id and empty parts creates a placeholder bubble (`useChatStream.ts:248`: `{ info: cleanInfo, parts: [] }`).
3. `normalizeMessageInfo` **drops** daemon `AssistantMessage.error` (`api.ts:290-333`). SDK assistant messages carry `error?: ProviderAuthError | UnknownError | MessageOutputLengthError | MessageAbortedError | ApiError` (`types.gen.d.ts:106`).
4. `session.error` fuse does set hook `error` (`useChatStream.ts:259-267`) from `data.error?.data?.message || data.error?.message`. It does **not** read `data.error.data.statusCode` or `data.error.data.responseBody` (the relay body the user asked for).
5. Empty/timeout/HTTP-200-empty-completion paths often never emit `session.error`. They emit `message.updated` + `session.idle`. Idle handler only sets status idle (`useChatStream.ts:270-274`) and never inspects parts.
6. `MessageBubble` returns `null` for blank text (`887`, `997`) so an assistant shell with header badges and zero body is exactly the "空响应没有报错信息" card.
7. Timeline grouping still emits that assistant item (`timeline-grouping.ts:42-97`) even when `parts` is `[]`.

### Why Retry leaves residue the model can see

1. `retry()` (`useChatStream.ts:395-420`) only `setError(null)` then calls `sendPrompt(lastUserText, attachments)`.
2. `sendPrompt` **always** appends a new optimistic user message (`306-349`) and POSTs a new user turn. Failed/empty assistant stays in daemon SQLite and in React `messages`.
3. Next model call therefore includes: original user, empty/error assistant, duplicate user. That is the "打扰思考" bug.
4. `api.deleteMessage` exists (`api.ts:683-687`) and is **never called**. SSE `message.removed` exists in the SDK and is **not subscribed**.
5. `MessageBubble.onRetry` is declared (`32`) but `ChatTimeline` never passes it (`554-591`). Only the bottom banner button calls `onRetry`.

### Existing error UI we should reuse

- Timeline banner (`ChatTimeline.tsx:595-625`): shows `error || sessionStatus.message`, Attempt N, button `重试 / 继续`.
- Header shows `sessionStatus.type === 'retry'` (`Header.tsx:360-363`) for daemon auto-retry; do not confuse with user Retry.
- i18n already has `common.error` / `common.retry` (`i18n.ts:203-204`).

## Decisions (with rationale)

1. **Parse, don't stringify blindly.** Add `AssistantMessageError` union (mirror SDK v1 names used by daemon 1.18.29) on `MessageInfo.error`. `normalizeMessageInfo` copies `raw.error` when `name` + `data` look like the SDK shape.
2. **Single display string** produced by `formatRelayErrorDisplay(err)`: `[HTTP {status}] {message}` plus truncated `responseBody` when present and not a duplicate of message. Empty-idle uses `t.chat.emptyResponse` (new i18n keys).
3. **Empty-idle fuse** in `onSessionIdle`: if session was busy/retry this turn and `isAssistantTurnEmpty(lastAssistantGroup)` and last error is not abort → `setError(display)` and attach a local-only error onto the last assistant `info.error` as `UnknownError` with message `Empty response from relay`. Do not POST anything.
4. **Retry lifecycle (strict):**
   1. Snapshot last user message (real id if swapped, else skip DELETE for optimistic-only).
   2. Collect assistant message ids after that user (all in the last grouped turn, including empty placeholders).
   3. `setError(null)`; strip those assistant ids from local `messages` immediately.
   4. `DELETE` each assistant id (`api.deleteMessage`). Ignore 404. Do not DELETE the user message.
   5. Subscribe/handle `message.removed` as the daemon ack.
   6. `POST prompt_async` with the same parts/agent/model **without** a second optimistic user row. Set `busy`.
   7. If DELETE fails with 405/501, fallback: `revertSession(lastUserId, { files: false })` so the daemon revert boundary hides failed assistants from the next prompt, then still resend. After successful new completion, do **not** unrevert (that would restore the bad turn into context). Document this fallback as last resort; primary is DELETE.
5. **Do not** put error strings into `TextPart.text`. Export/copy JSON may still contain `info.error` from daemon until DELETE; that is daemon-owned. After retry, those messages are gone.
6. **Tests-first** for extract + empty-turn + normalize error preserve + retry id selection.

## Scope IN

- Types, normalize, SSE error extract, idle empty fuse, MessageBubble empty-error body, ChatTimeline pass-through, retry cleanup + resend-without-duplicate-user, `message.removed` subscription, i18n strings, docs/modules/streaming-chat.md error-fuse paragraph, unit tests.

## Scope OUT (Must NOT have)

- Auto-retry loops / polling the relay
- Writing error traces into user or assistant text parts
- Deleting the user prompt on Retry
- Changing revert-dock UX, map, prompt composer, relay billing, daemon jail code
- Logging raw relay API keys or full response headers
- React Testing Library / Playwright for this task
- New dependencies

## Open questions

None blocking. Announced defaults above; veto at the gate.

## Approval gate

status: awaiting-approval

Next workflow action: on explicit okay, scaffold `.omo/plans/empty-response-error-retry.md`, run Metis, APPEND todos, fill TL;DR last. Approval authorizes writing the plan only — not implementation.
