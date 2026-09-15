# PromptController

Composer: autogrow textarea, Enter send / Shift+Enter newline, `/` and `@` popover, image paste/upload, drag-drop, project dropdown, Todo button, next-send agent/model.

## Scope Boundaries

| Component | Responsible For | MUST NOT Contain |
| :--- | :--- | :--- |
| `src/components/chat/PromptInput.tsx` | Text, attachments, agent/model menus, send/abort, draft injection, popover state | Timeline history, SSE merge |
| `PromptPopover.tsx` | Command / agent / file list, keyboard highlight | File search HTTP (`api.findFiles` stays in PromptInput) |
| `ProjectDropdown.tsx` | Canonical project pick, new-project / settings modals | Session create HTTP |
| `TodoButton.tsx` + `todo-state.ts` | Hidden-by-default checklist popover from `todos` prop | `GET /todo` (hook owns fetch) |
| `drag-drop.ts` | Image vs `@file` split, mention insertion | Upload HTTP |
| `ManageModelsModal.tsx` | Curated visibility (`model-filter.ts`) | Relay balance fetch (RelayGateway) |

## Key Invariants

- PromptInput is the **next prompt target**, labeled as such. Historical bubbles use StreamingChat attribution. Sync defaults from `activeSession.agent` / `activeSession.model` on session switch only. (Why chosen over binding the dropdown to history: users otherwise think the widget rewrites the past.)
- Defaults: agent `Atlas - Plan Executor`, model `{ providerID: 'obsidian', modelID: 'grok-4.6' }`. `resolveAgentName` maps short aliases (`atlas`, `sisyphus`, `prometheus`) to daemon names before POST.
- Images (`image/*` or image extensions) become `PromptAttachment` thumbnails. Other files insert `@filename` mentions via `formatFileMentions`. (Why chosen over treating every drop as a file part: daemon file parts are multimodal URLs; non-images are path context.)

## Numbered Data Flow

1. Mount: `GET /agent`, `GET /config/providers`, `GET /command`. Apply session agent/model if real (not draft).
2. Textarea autogrows. `/` at token start opens `popoverMode: 'commands'` from `GET /command`. `@` opens `'context'` (agents + `GET /find/file?query=`). Arrow/enter select; outside pointerdown closes menus.
3. Paste image or `<input type=file>` → data URL attachment. Drop: `hasFilePayload` → `categorizeDroppedFiles` → thumbnails and/or `@` mentions at caret.
4. Enter sends (`sendMessage` shortcut); Shift+Enter newline (`newLine`). Busy session: square button → `onAbort`.
5. `onSend(text, { agent, model, attachments })` → parent. If active id is `__draft__`, parent `createNewSession` then `sendPrompt`. PromptInput does **not** call `createSession`.
6. `api.sendPrompt` durably `POST /api/session/{id}/agent` then `POST /prompt_async`.
7. Directory context: `ProjectDropdown` selection is passed into `createSession({ directory })` after `canonicalizeDirectory` (SessionManagement).
8. Revert restore: parent `extractDraftFromMessage` → `setDraftInjection` → textarea focus at end. `DraftInjection` applies only when `timestamp` changes (`lastInjectedTimestamp`).

## Side-effects API

| Method | Signature | Side-Effects |
| :--- | :--- | :--- |
| `PromptInput.onSend` | `(text, { agent?, model?, attachments? }) => void` | Parent HTTP; clears local text/attachments after send |
| `PromptInput.onAbort` | `() => void` | Parent `abortSession` |
| `api.getAgents` | `() => Promise<AgentInfo[]>` | `GET /agent` |
| `api.getProviders` | `() => Promise<ProviderInfo[]>` | `GET /config/providers` |
| `api.getCommands` | `() => Promise<CommandItem[]>` | `GET /command` |
| `api.findFiles` | `(query, directory?) => Promise<string[]>` | `GET /find/file?query=` |
| `api.switchSessionAgent` | `(sessionID, agentName) => Promise<void>` | `POST /api/session/{id}/agent` |
| `categorizeDroppedFiles` | `(files) => { imageFiles, otherFiles }` | Pure |
| `formatFileMentions` | `(files, currentText, cursor?) => { newText, newCursorPosition }` | Pure |
| `extractDraftFromMessage` | `(Message) => { text, attachments }` | Pure |
| `getTodoStats` | `(todos) => TodoStats` | Pure; button remains closed |

`DraftInjection`: `{ text, attachments?, timestamp: number, focus?: boolean }`.

## Actionable Recipes

<adding_slash_command_recipe>
Commands are daemon-defined (`GET /command`). Do not hardcode a command table in PromptInput. If the popover item shape changes, update `PopoverItem` and the select handler that inserts `/{name}`.
</adding_slash_command_recipe>

<adding_attachment_kind_recipe>
1. If it is bytes the model should see, add a `PromptAttachment` and a `MessagePartInput` of `type: 'file'` with `mime` + `url`.
2. If it is a path mention, extend `drag-drop.ts` and keep it in the textarea text.
3. Optimistic timeline parts must set `isOptimistic: true` so StreamingChat can replace them.
</adding_attachment_kind_recipe>

## User Protection Zones

<!-- BEGIN USER-SPECIFIED -->
- Todo popover default-hidden. Do not auto-open on `todo.updated`.
- Agent/model widgets are the next-send target, never a rewrite of historical `MessageInfo`.
- First send from `__draft__` must create the daemon session in the parent; PromptInput does not call `createSession` itself.
<!-- END USER-SPECIFIED -->
