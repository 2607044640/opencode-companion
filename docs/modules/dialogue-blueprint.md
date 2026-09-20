# DialogueBlueprint

Visual session graph (`Ctrl+M`). React Flow canvas, Dagre LR (`Alt+R`), laser wire cutter, lazy connect, empty-space action menu, pin-break, comment groups, multi-token canvas search, 50-step undo isolated from SSE.

There is **no** `pin-disconnect.ts`. Pin-break is `disconnectPinEdges` in `map-mutations.ts` plus capture-phase handlers on `SessionCard`.

Canvas search is **not** the top-left global input stealing every keystroke. A quick right-click on empty pane opens `BlueprintActionMenu` at the cursor; printable keys stay in that menu.

## Scope Boundaries

| Component | Responsible For | MUST NOT Contain |
| :--- | :--- | :--- |
| `src/components/map/canvas/MapCanvas.tsx` | Map lifecycle, undo/redo dispatch, project-board subscription | Cubic Bézier math, REST prompt send |
| `src/components/map/canvas/MapFlow.tsx` | React Flow wrapper, capture-phase pointer hooks, laser stroke state | `fetch` to daemon session APIs |
| `map-flow-handlers.ts` | Drop → lazy connect or `BlueprintActionMenu`; rubber-band | Geometry primitives |
| `map-gestures.ts` | `isQuickRightClick` (≤6px, ≤500ms), `applyLinkOnView` | Menu JSX, REST prompt send |
| `session-search.ts` | Multi-token `sessionMatchesQuery`, `withSearchHighlight` | Menu commit, daemon writes |
| `HighlightedText.tsx` | Yellow/orange token highlight (`escapeRegExp`) | Scoring, persistence |
| `cutting-wire.ts` | Bézier discretize (16 segs), AABB reject, CCW straddle, skip `native` | React state, persistence, history |
| `lazy-connect.ts` | Card AABB hit-test (pad 12, 240×140), polarity invert, closest-center pick | Branch session creation |
| `layout-dagre.ts` | Hierarchical LR (default) node positions; leave comment groups intact | Edge geometry, SSE |
| `map-history.ts` | 50-snapshot past/future stacks | Applying SSE title/status patches |
| `map-mutations.ts` | Pure card/edge/group deletes; `disconnectPinEdges` | History recording, disk I/O |
| `map-card-actions.ts` | `breakPinConnections` toast + persist wrapper | Pointer capture |
| `SessionCard.tsx` | Alt+left-click handle capture → pin-break | Laser stroke sampling |
| `BlueprintActionMenu.tsx` + `blueprint-action-helpers.ts` | Cursor menu, multi-token scored filter, `[Project]` pills, `executeBranchAction` / `executeNewSessionAction` / `executeConnectAction` | Dagre, laser |
| `groups/group-commands.ts` | Comment group create/resize/drop/delete | SSE |
| `opencode/persist.ts` | `GET/PUT /api/map` + `localStorage['opencode_talk_map']` | Daemon `/session` writes |
| `schema/talk-map.ts` | Zod `TalkMap` v1 | UI components |

## Key Invariants

- Laser (`Alt` + middle-drag / `Alt` + left-drag) and pin-break (`Alt` + click on handle) attach in the **capture** phase and `stopPropagation`. (Why chosen over bubble-phase: React Flow pan/connect would steal the gesture.)
- `clientPoint` / `screenPos` (`clientX/Y`) positions floating HUD; `flowPos` (`screenToFlowPosition`) positions nodes/edges. Never mix. (Why chosen over one space: menus drift under pan/zoom.)
- User gestures go through `recordHistorySnapshot` (cap `MAX_HISTORY_LENGTH = 50`). SSE title/status/digest updates call persist **without** pushing history. (Why chosen over recording every SSE patch: token/title sync would wipe Ctrl+Z.)
- Canvas search is multi-token AND (`"fix c"` matches a title containing both `fix` and `c`). Phrase match still wins if the full trimmed query appears in title / nextStep / sessionId. Yellow highlight is `HighlightedText` (`preset: "yellow"`). (Why chosen over substring-only: short second tokens like `c` would otherwise miss “Fix Companion …”.)
- Quick right-click (pointer down+up, distance ≤6px, duration ≤500ms) on empty canvas opens `BlueprintActionMenu` at `clientPoint` and does **not** focus the top-left map search. `FloatingMapModal` global key redirect bails when `[data-testid="blueprint-action-menu"]` is mounted. (Why chosen over always-redirect: typing in the cursor menu used to jump to the chrome input.)
- Menu commits are three helpers in `blueprint-action-helpers.ts`, not inline JSX: `executeBranchAction` (inject branch), `executeNewSessionAction` (untitled at `flowPos`), `executeConnectAction` (link edge or `onSelectSession` when `fromNode` is null). Self-link and duplicate-edge toast and abort.

## Numbered Data Flow

1. `FloatingMapModal` / `MapApp` loads `loadTalkMapFromApi()` → Zod parse → fallback `localStorage['opencode_talk_map']` → `emptyTalkMap()`.
2. Board filtered by current directory; cards become React Flow nodes (`SessionCard`, `CommentGroup`).
3. Pointer down capture: if Alt+cut, `cutting-wire` samples the stroke (`getBezierCurvePoints` / `discretizeBezier`), AABB-rejects, CCW-tests (`segmentsIntersect`), collects non-native edge ids (`findIntersectedEdges` with `skipNative`).
4. Stroke end: `removeEdgesFromMap` then **one** `recordHistorySnapshot` for the whole stroke (not per slice).
5. Drop on a card body: `findCardAtFlowPosition` + `resolveLazyConnect` writes a `link`/`inject` edge (`fromHandleType === "target"` inverts polarity). Drop on empty canvas: `BlueprintActionMenu` at `clientPoint` with `flowPos` for commits. Quick right-click on empty pane (not on a node, minimap, or controls) uses the same menu with `fromNode: null`. Keyboard: arrows/enter; `filterProjectSessions` scores phrase then multi-token hits across title/project/directory/sessionId; list rows show a bordered project pill (`formatProjectPill` → `[APISpace]`) plus `HighlightedText` on the title; actions `branch` vs `new_session` vs `connect_session` call the three `execute*Action` helpers.
6. `Alt+R` (`mapRearrange`): `getLayoutedNodes(..., { direction: "LR" })` then persist + history. Comment groups are excluded from Dagre ranking.
7. `C`: wrap selection via `createGroupFromSelectedCards` / rubber-band `createGroupFromRubberBand`; resizer writes `w/h` through `resizeGroup`.
8. Alt+click handle (capture): `breakPinConnections` → `disconnectPinEdges` (native edges counted, not deleted).
9. Debounced `saveTalkMapToApi` PUTs JSON and mirrors localStorage. SSE digest/title patches `persistDirectMap` with no undo push.

## Side-effects API

| Method | Signature | Side-Effects |
| :--- | :--- | :--- |
| `loadTalkMapFromApi` | `() => Promise<TalkMap>` | `GET /api/map`; else `opencode_talk_map` |
| `saveTalkMapToApi` | `(map: TalkMap) => Promise<void>` | Writes localStorage; `PUT /api/map` (errors swallowed) |
| `addSessionToTalkMap` | `(sessionId, directory?, title?) => Promise<{ cardId, alreadyExisted }>` | Inserts card if no live (non-ghost) card for that session |
| `recordHistorySnapshot` | `(history, snapshot, max=50) => MapHistory` | Pushes past, **clears** future |
| `undoHistory` / `redoHistory` | `(history, current) => { history, map }` | Pure; `map` is `null` at stack end |
| `resolveLazyConnect` | `(input: ResolveLazyConnectInput) => LazyConnectResult` | Pure polarity |
| `findCardAtFlowPosition` | `(input: FindCardAtFlowPosInput) => string \| undefined` | Pure; closest-center among AABB hits |
| `getLayoutedNodes` | `(nodes, edges, opts?, groups?) => nodes` | Pure Dagre; default LR, node 240×140, sep 50/80 |
| `segmentsIntersect` | `(p1,p2,p3,p4) => boolean` | Pure; AABB then CCW |
| `findIntersectedEdges` | `({ cutter, edges, resolveHandlePoint, skipNative? }) => string[]` | Pure |
| `calculateControlOffset` | `(distance, curvature=0.25) => number` | Pure; negative span uses `curvature * 25 * Math.sqrt(-distance)` |
| `disconnectPinEdges` | `(map, cardId, type: "source"\|"target") => DisconnectPinResult` | Pure; native edges kept |
| `breakPinConnections` | `(setView, persistMap, setToast, cardId, type) => void` | Persist + toast |
| `removeCardFromMap` | `(map, cardId) => TalkMap` | Pure; drops card + incident edges |
| `filterProjectSessions` | `(cards, titles, directory, query, exclude?, projects?) => ProjectSessionItem[]` | Pure scored multi-token filter; fills `projectBadge` / `projectColorClass` |
| `sessionMatchesQuery` | `(query, { title, nextStep, sessionId }) => boolean` | Pure; phrase OR all-tokens-AND |
| `withSearchHighlight` | `(nodes, query, activeSessionId) => nodes` | Pure; dims non-hits, attaches `searchQuery` |
| `isQuickRightClick` | `({ startPoint, endPoint, durationMs, maxDistance=6, maxDurationMs=500 }) => boolean` | Pure |
| `executeBranchAction` | `(input) => Promise<boolean>` | `createInjectedBranch` + persist; toast `已创建分支会话` |
| `executeNewSessionAction` | `(input) => Promise<boolean>` | `createUntitledAtClick` at `flowPos`; toast `已创建独立会话` |
| `executeConnectAction` | `(input) => boolean` | Link edge (polarity invert) or `onSelectSession`; self/duplicate abort |
| `createGroupFromSelectedCards` / `createGroupFromRubberBand` / `resizeGroup` / `deleteGroupFromMap` | see `group-commands.ts` | Pure map transforms |

`TalkMap` v1: `global.camera`, `boards`, `cards`, `groups`, `edges`, `digests`. Card: `{ cardId, sessionId?, ghost, label?, colorTag?, groupId, position, directory }`. Edges: `native` \| `inject` \| `link`. Laser must not slice native parent/child wires. Map JSON is companion-local (`data/talk_map.json` via `/api/map`), not daemon SQLite.

## Actionable Recipes

<adding_map_gesture_recipe>
1. Put geometry in a pure `src/components/map/canvas/*.ts` file with tests (`*.test.ts`).
2. Wire the gesture on `MapFlow` via `onPointerDownCapture` / `onMouseDownCapture` if it must beat React Flow.
3. Commit through `map-mutations` then `recordHistorySnapshot`. Do not persist inside the geometry file.
4. If the gesture draws HUD, position with `clientPoint`; commit nodes with `flowPos`.
5. Menu commits belong in `blueprint-action-helpers.ts` (`executeBranchAction` / `executeNewSessionAction` / `executeConnectAction`), not in `BlueprintActionMenu.tsx`.
</adding_map_gesture_recipe>

<adding_edge_kind_recipe>
1. Extend `EdgeKindSchema` in `schema/talk-map.ts`.
2. Teach laser (`skipNative`) and `disconnectPinEdges` which kinds are cuttable. Native parent wires stay protected.
3. Persist via existing PUT; keep `version: 1` until a breaking field lands.
</adding_edge_kind_recipe>

## User Protection Zones

<!-- BEGIN USER-SPECIFIED -->
- Capture-phase laser and pin-break. Moving them to bubble phase is a functional regression.
- Undo stack must stay SSE-blind. Title/status/digest sync is not a user mutation.
- Dual coordinate spaces (`clientPoint`/`screenPos` vs `flowPos`) are mandatory. Do not "simplify" onto one space.
- UE-style gestures (Alt-click break, Alt-drag laser, lazy connect on card body, empty-space search menu) are product, not decoration.
- Quick right-click on empty canvas must open `BlueprintActionMenu` without focusing the top-left map search. Do not restore global keystroke steal while the cursor menu is open.
- Canvas / menu search is multi-token AND (`"fix c"`). Do not collapse it back to a single substring. Yellow `HighlightedText` and bordered `[Project]` pills stay on match rows.
<!-- END USER-SPECIFIED -->
