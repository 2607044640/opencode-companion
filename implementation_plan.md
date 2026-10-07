# Session switch and PWA focus — optimization plan

Scope is the recent companion handoff: PWA focus, nav intent, and the session-switch loading shell. No new services.

## Problems

1. **Two writers for one nav intent.** `index.html` polls `/api/active-session` every 200ms and `pushState`s `?session=`. `useSessions` polls the same endpoint every 1200ms and `selectSession` `replaceState`s the same URL. Whichever response lands last wins.
2. **Loading is a Chinese title.** `useSessions` fabricates `title: '正在加载会话…'`. `ChatTimeline` string-compares that title, and also treats token or file counts as "still loading", so a fetched empty transcript can spin forever.
3. **Stale history clears the new spinner.** `useChatStream.loadSessionData` always `setLoading(false)` in `finally`. A late response for session A clears the spinner after the user has already moved to session B. Switching to `__draft__` never clears `loading` either.
4. **PWA title filter.** `launch_pwa.pyw` rejects any title containing `"and "`, which drops a real Companion window whose title includes that word. `"Microsoft Edge"` is the actual browser-chrome check.

## Design

- **One nav writer.** The boot script only publishes intent: `window.__ocNavIntent = { sessionId, ts }` then `switch-session`. It does not touch history. `selectSession` remains the only tab and URL mutation (`replaceState`). On mount, `useSessions` replays `__ocNavIntent` once so an intent that arrives before the listener is not lost. Delete the 1200ms poll.
- **One pending resolver.** `pendingSessionPlaceholder` / `isPendingSession` in `session-workspace.ts`. Client-only `Session.pending`. Views must not match a title string. The timeline spinner is `messagesLoading || isPendingSession`, and only while the transcript is empty and there is no error.
- **One loading flag owner.** `loadSessionData` writes `loading`, `messages`, `todos`, `error`, and `loadedSessionId` only when `currentSessionIdRef` is still that id. Draft and null sessions set `loading` false.
- **Focus filter.** Drop the `"and "` clause. Keep focus-before-throttle and the 200ms `focusInstalledApp` debounce (`FOCUS_DEBOUNCE_MS`).

reuse-gap: `findfunctions.py --lang ts` is unimplemented. No existing pending-session predicate or nav-intent applicator. `planSessionActivation` stays the fetched-row planner and must not insert the placeholder into the session list. `writeSessionUrl` stays the URL writer.

## Self-review 1

- Do not add a store, context, or singleton. The boot script is the publisher; the hook is the consumer.
- Replaying `__ocNavIntent` and handling `switch-session` can call `selectSession` twice for one id. That is idempotent (same id, same `replaceState`).
- A real session titled `正在加载会话…` must show that title, not be treated as unresolved. The flag, not the string, decides.
- Header already falls back when `sessions.find` misses the id. It does not read the placeholder. Leave it.

## Self-review 2

- `planSessionActivation` returning null is not a placeholder. Folding the fake row into that plan would insert it into `sessions` and let rename/archive treat it as a daemon row.
- Removing the hook poll is safe only because mount replays `__ocNavIntent`. The boot script must assign that field before dispatching.
- The token/file spinner heuristic is not a second loading signal. `messagesLoading` is already set synchronously in the session-switch effect. An empty GET with leftover token counts is an empty transcript, not a hang.
- Do not retune focus timing, polling below 200ms, or the Edge `"Microsoft Edge"` exclusion.

## Docs

- `docs/modules/session-management.md` — pending resolver, single nav writer.
- `docs/modules/streaming-chat.md` — stale-load guard and spinner rule.
- `_Architecture.md` — one bind-map line for the boot script and `launch_pwa.pyw`.
- `README.md` — one clause. No feature list.

## Verify

`pnpm exec tsx --test src/utils/session-workspace.test.ts`, then `pnpm test`.
