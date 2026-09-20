# FeatureFlags

Companion has **no** `src/plugins/` tree, no `registry.ts` / `types.ts` / `usePlugins.ts`, and no Settings “Plugins” tab. Feature visibility is `UserPreferences` in `src/utils/preferences.ts`, rendered by existing Settings tabs and consumed as boolean gates in UI.

Do not invent a plugin registry from this document.

## Scope Boundaries

| Component | Responsible For | MUST NOT Contain |
| :--- | :--- | :--- |
| `src/utils/preferences.ts` | `UserPreferences`, `getPreferences` / `savePreferences` / `usePreferences`, `preferences-changed` event | HTTP, daemon writes, a plugin taxonomy |
| `src/components/settings/SettingsModal.tsx` | Tabs: `general`, `application`, `appearance`, `models`, `relays`, `customizations`, `browser`, `archived` | A Plugins tab that does not exist |
| `src/App.tsx` | Consumes prefs for chrome (timeline jump, zen, settings open) | Dynamic `import()` of plugin modules |
| `src/components/layout/Header.tsx` | Compact chrome; model/token chips gated by prefs | Plugin registry |
| `src/components/chat/PromptInput.tsx` | `showModelSelector` gate on next-send model menu | Plugin enable-all |
| `src/components/common/CountdownConfirmDialog.tsx` | Destructive confirm lock (shortcut reset) | Plugin reset-defaults |
| `src/utils/model-filter.ts` | Per-model/provider visibility maps on prefs | Canvas/navigation/input/analytics/system categories |

## Key Invariants

- Persistence is `localStorage['opencode_companion_user_preferences']` plus `CustomEvent('preferences-changed')`. Toggles apply without reload because `usePreferences` subscribes to that event. (Why chosen over a plugin registry: the live tree has boolean prefs, not loadable modules.)
- Settings tabs are a closed union (`SettingsTab`). Adding a “Plugins” tab requires a real `src/plugins/` implementation first; docs must not precede code. (Why chosen over scaffolding `registry.ts` here: InstructionDesignPrinciples forbid fabricating APIs/paths.)
- `CountdownConfirmDialog` is the destructive gate (2s). There is no “enable all plugins / reset plugin defaults” control.

## Numbered Data Flow

1. Boot: `getPreferences()` merges JSON over `DEFAULT_PREFERENCES`.
2. `usePreferences()` holds state; window listener on `preferences-changed` replaces it.
3. Settings fields call `updatePreferences` / `savePreferences(partial)` → write storage → dispatch event → subscribers re-render (App, Header, PromptInput, ManageModels).
4. Model visibility: `prefs.modelVisibility` / `providerVisibility` feed `isModelVisible`.
5. Destructive shortcut reset still uses `CountdownConfirmDialog` (LayoutModes), not a plugin reset.

## Side-effects API

| Method | Signature | Side-Effects |
| :--- | :--- | :--- |
| `getPreferences` | `() => UserPreferences` | Reads `opencode_companion_user_preferences` |
| `savePreferences` | `(partial: Partial<UserPreferences>) => UserPreferences` | Writes storage; `CustomEvent('preferences-changed', { detail })` |
| `usePreferences` | `() => { prefs, updatePreferences }` | Subscribes to `preferences-changed` |
| `isModelVisible` | see `model-filter.ts` | Pure |

`UserPreferences` (live): `showReasoning`, `autoCollapsePrompt`, `collapseToolBatch`, `collapseSidebarOnStartup`, `autoGitCheckpoint`, `floatingDiffView` (default `true`; StreamingChat drawer vs overlay), `promptCharThreshold`, `promptLineThreshold`, `language`, `showModelSelector`, `showTimelineQuickJump`, `modelVisibility`, `providerVisibility`, `verboseAgentChat`, `conversationWidth`, `themeMode`, `darkThemePreset`, `themeColors`, `userProfile`.

Absent (do not document as implemented): `Plugin` type, categories `canvas` \| `navigation` \| `input` \| `analytics` \| `system`, `usePlugins()`, enable-all, plugin DOM events.

## Actionable Recipes

<adding_preference_toggle_recipe>
1. Add a field to `UserPreferences` + `DEFAULT_PREFERENCES` in `src/utils/preferences.ts`.
2. Bind a control on an existing `SettingsTab` in `SettingsModal.tsx`.
3. Gate the UI at the call site (`App.tsx`, `Header.tsx`, `PromptInput.tsx`, …) by reading `prefs.<field>`.
4. Do not create `src/plugins/`. A real plugin loader is a separate implementation task.
</adding_preference_toggle_recipe>

<adding_plugin_registry_recipe>
Only after code exists: introduce `src/plugins/types.ts`, `registry.ts`, `usePlugins.ts`, a Settings Plugins tab, and capture-phase-safe guards. Until then this recipe is blocked. Do not stub those files from documentation.
</adding_plugin_registry_recipe>

## User Protection Zones

<!-- BEGIN USER-SPECIFIED -->
- Do not scaffold `src/plugins/` or a Settings Plugins tab from this document. Preference toggles are the live feature-flag store.
- `preferences-changed` is the no-reload channel. Do not require a page refresh for visibility flags.
- Destructive resets stay on `CountdownConfirmDialog` (2s). Do not add an ungated “enable all / reset defaults” for a registry that does not exist.
<!-- END USER-SPECIFIED -->
