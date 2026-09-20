# LayoutModes

Chrome: sidebar, session tabs, floating search (`Ctrl+K`), find-in-page (`Ctrl+F`), zen (`F11`), configurable shortcuts, 2-second destructive countdown, collapsible Todo banner.

Live sidebar width is `w-64 sm:w-[260px]` on `Sidebar.tsx` (`<aside>`). There is **no** `w-fit min-w-[120px] max-w-[176px]` class in this tree.

## Scope Boundaries

| Component | Responsible For | MUST NOT Contain |
| :--- | :--- | :--- |
| `src/App.tsx` | Layout flags, global key router, zen/search/map/settings, unread + scheduler | Geometry engines, REST normalize |
| `src/components/layout/Sidebar.tsx` | Project/session chrome, pin/archive menus | Prompt send, SSE delta |
| `src/components/layout/Header.tsx` | Compact tabs, token chip, desktop deep-link, map trigger | `POST /session` |
| `src/utils/tab-navigation.ts` | Close/other/right, next/prev tab, index jump | Persistence |
| `src/components/search/FloatingSearchModal.tsx` | A1 85vw×85vh session + message search, IME shield, `[Project]` pills + `HighlightedText` | Map mutations |
| `src/utils/find-in-page.ts` + `FindInPageBar.tsx` | In-timeline query (case/word/regex), scroll to hit | Cross-session search (that is Ctrl+K) |
| `src/utils/shortcuts.ts` | Defaults, localStorage merge, match/double-tap, overlay/editable guards | Feature logic |
| `CountdownConfirmDialog.tsx` | Mandatory countdown lock (default 2s) | Business mutations (caller does the work) |
| `SettingsModal.tsx` | Tabbed settings host, shortcut editor, theme, archived list | Relay HTTP internals (RelayGateway) |
| `TodoBanner.tsx` | Expand/collapse/dismiss checklist overlay | `GET /todo` |

## Key Invariants

- Global shortcuts no-op when `isEditableTarget` (input/textarea/contenteditable) or `hasActiveOverlay` (`[role=dialog]`, `[data-floating-modal]`, …) unless the shortcut belongs to that overlay. (Why chosen over always-on chords: Ctrl+F inside search must not also spawn find-in-page.)
- `Ctrl+K` is session/message search. `Ctrl+F` is find-in-current-timeline. Do not merge them.
- Zen (`F11`, Esc to leave) hides sidebar + header and flips `isZenMode`. Do not treat native browser fullscreen as a substitute without also flipping that flag. (Why chosen over fullscreen-only: layout chrome would remain.)

## Numbered Data Flow

1. App reads `opencode_sidebar_open` and `getShortcuts()`.
2. Keydown: `matchesShortcut` / `createDoubleTapTracker.check` → toggle sidebar, new draft, tabs, search, find, map, settings, zen, close/reopen tab.
3. `Ctrl+K` mounts `FloatingSearchModal` (`data-floating-modal`). IME composition is shielded; first printable key redirects into the query box. Hits show `formatProjectPill` (`[APISpace]`) plus `HighlightedText` on title/snippet. Select hit → `selectSession` (+ optional `targetMessageId` for ChatTimeline scroll animation).
4. `Ctrl+F` sets `isFindOpen`; `findMatchesInMessages` scans text (and reasoning) parts; bar cycles hits with scroll-into-view.
5. Tab close uses `calculateCloseTabState`; recently closed stack (max 30, skip draft) powers `Ctrl+Shift+T`. Header tabs stay compact; overflow via context menu (`TabContextMenu.tsx`).
6. Zen: hide `Sidebar` + `Header`; floating exit chip; prompt docks bottom-center. Esc / F11 leaves.
7. Todo: `TodoBanner` starts collapsed; X sets `isDismissed` for the mount; `TodoButton` stays closed unless the user opens it.
8. Settings save writes shortcuts and broadcasts. Reset: `CountdownConfirmDialog` (`countdownSeconds = 2`) → `resetShortcuts()` → remove storage key → event with `DEFAULT_SHORTCUTS`.

## Side-effects API

| Method | Signature | Side-Effects |
| :--- | :--- | :--- |
| `getShortcuts` | `() => ShortcutsMap` | Reads `opencode_companion_shortcuts`; fills missing keys from `DEFAULT_SHORTCUTS` |
| `saveShortcuts` | `(map) => void` | Writes storage; `CustomEvent('shortcuts-updated')` |
| `resetShortcuts` | `() => ShortcutsMap` | Removes key; broadcasts defaults |
| `matchesShortcut` | `(e, ShortcutItem?) => boolean` | Pure; Ctrl ≡ Meta |
| `isEditableTarget` | `(EventTarget \| null) => boolean` | Pure |
| `hasActiveOverlay` | `(Document?) => boolean` | DOM query |
| `createDoubleTapTracker` | `() => { check, reset }` | Closure timestamps (350ms) |
| `findMatchesInMessages` | `(messages, query, FindOptions?) => FindMatch[]` | Pure; invalid regex → `[]` |
| `calculateCloseTabState` | `(tabs, active, target) => { nextTabs, nextActiveId }` | Pure |
| `CountdownConfirmDialog` | `{ isOpen, countdownSeconds=2, onConfirm, onClose, isDestructive? }` | Disables confirm until timer hits 0 |

Default chords (`DEFAULT_SHORTCUTS`): `Ctrl+B` sidebar, `Ctrl+N` new, `Ctrl+Tab` / `Ctrl+Shift+Tab` tabs, `Ctrl+W` close, `Ctrl+Shift+T` reopen, `Ctrl+K` search, `Ctrl+F` find, `Ctrl+M` map, `Ctrl+,` settings, `F11` zen, map: `Ctrl+Z/Y`, `F`, `C`, `Ctrl+A`, `Home`, `Alt+R`. Double-tap ↑/↓ (`kind: 'double-press'`) jumps timeline top/bottom; single tap is prev/next dialogue.

## Actionable Recipes

<adding_shortcut_recipe>
1. Add a key to `ShortcutsMap` + `DEFAULT_SHORTCUTS` in `src/utils/shortcuts.ts` (`category: 'general' \| 'map'`).
2. Handle it in `App.tsx` (global) or map hotkeys (`blueprint-hotkeys.ts`). Honor editable/overlay guards.
3. Settings editor picks up the map automatically; group it under All / Global & Chat / Blueprint Map.
4. Destructive actions must use `CountdownConfirmDialog`, not `window.confirm`.
</adding_shortcut_recipe>

<adding_overlay_recipe>
1. Mark the root with `role="dialog"` or `data-floating-modal` so `hasActiveOverlay` is true.
2. Keep A1 search geometry `85vw × 85vh` with IME composition guards if the overlay has a text field.
</adding_overlay_recipe>

## User Protection Zones

<!-- BEGIN USER-SPECIFIED -->
- 2-second countdown lock on shortcut reset and other destructive settings. Do not remove the timer.
- Windows IME shield on floating search: composition must not fire navigation.
- Ctrl+K (session search) and Ctrl+F (find in page) stay distinct.
- Zen is an application layout mode, not "just F11 fullscreen".
<!-- END USER-SPECIFIED -->
