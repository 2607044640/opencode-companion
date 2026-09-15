# RelayGateway

Next-send model picker, curated model visibility, relay hub balances, settings provider forms, loopback bind. Does not provision New API channels (that is `GatewayAPIManager`).

Unauthenticated daemon: `http://127.0.0.1:5001`. Local New API preset: `http://127.0.0.1:3000`. Companion Vite/`serve.mjs` bind `127.0.0.1:5173`.

## Scope Boundaries

| Component | Responsible For | MUST NOT Contain |
| :--- | :--- | :--- |
| `src/services/api.ts` (`BASE_URL`) | Daemon REST on `127.0.0.1:5001`; optional `opencode_auth_token` headers | Relay key persistence |
| `src/components/chat/PromptInput.tsx` (model menu) | Searchable next-send model; opens Manage Models | Historical bubble model pills |
| `src/utils/model-filter.ts` | `isCuratedModel` / `isModelVisible` | HTTP |
| `src/components/models/ManageModelsModal.tsx` | Per-model visibility toggles | Quota probes |
| `src/utils/relay-billing.ts` | Provider CRUD in localStorage, quota parse, preset sync, aggregate display | Daemon `/session` |
| `RelayHubDropdown.tsx` | Header chip + refresh | Raw key echo in DOM title/logs |
| `RelayHubSettings.tsx` | Settings tab form, presets, test probe | Binding companion to `0.0.0.0` |
| `SettingsModal.tsx` (`relays` + daemon token) | Hosts hub; `opencode_auth_token` for reverse-proxy | Channel writes to `:3000` |
| `serve.mjs` | `127.0.0.1:5173`; `/api/proxy/relay-quota` loopback proxy | LAN bind |

## Key Invariants

- Relay API keys live in `localStorage['opencode_relay_providers']` on the **host** browser, never in git, never in `console.log`. UI shows `••••` unless the eye toggle is on. (Why chosen over env files in this repo: companion is a clean code tree; keys in source leak through commits and transcripts.)
- Probe order: `/v1/usage` → billing subscription → `/api/user/self` → `/v1/models`. Direct fetch 8s; CORS failure → `/api/proxy/relay-quota?target=&token=` (10s). Token is a query param on the **loopback** proxy only.
- Ingress token (`setAuthToken`) adds `Authorization: Bearer` and `X-OpenCode-Token` on daemon REST. It is not a relay key. Empty token = zero-auth loopback, which is the default threat model. Companion does not call New API admin APIs.

## Numbered Data Flow

1. Header `RelayHubDropdown` loads providers; if empty or NovAI remnant, `syncRelayPresets` (`GET /api/relays/presets`; drops `once-cf.novai.su` / `relay_novai`).
2. For each provider, `fetchRelayQuota` → `parseQuotaResponse` → `updateRelayProvider({ balance, status, lastUpdated })`. Balance: NewAPI/OneAPI quota ÷ `DEFAULT_QUOTA_RATE` (500_000 per $1); CNY × `DEFAULT_CNY_RATE` (7.2). Prefer `/v1/usage` `{ balance }` when present.
3. Chip text from `aggregateBalances` (`¥x + $y` when mixed).
4. Settings Relays tab: add/edit via presets (TokenShop, GGUU, Local New API `http://127.0.0.1:3000`) or manual baseUrl/key/redeemUrl/currency/rates.
5. Test button runs the same probe; result is ok/error copy, not the raw key.
6. PromptInput model menu lists `GET /config/providers` filtered by `isModelVisible`. Selection is sent on the next `prompt_async` only.
7. Optional Settings daemon token: `setAuthToken`; subsequent `api.request` headers include it.

## Side-effects API

| Method | Signature | Side-Effects |
| :--- | :--- | :--- |
| `getRelayProviders` | `(storage?) => RelayProvider[]` | Reads `opencode_relay_providers` |
| `saveRelayProviders` | `(providers, storage?) => void` | Writes JSON to localStorage |
| `addRelayProvider` | `(omit id, storage?) => RelayProvider` | Appends `relay_<ts>_<rand>` |
| `updateRelayProvider` | `(id, patch, storage?) => RelayProvider[]` | In-place merge + save |
| `deleteRelayProvider` | `(id, storage?) => RelayProvider[]` | Filter + save |
| `parseQuotaResponse` | `(data, provider) => { balance, totalQuota?, usedQuota?, isUnmetered?, note? }` | Pure |
| `fetchRelayQuota` | `(provider, fetchImpl?) => Promise<RelayQuotaResult>` | HTTP to relay or `/api/proxy/relay-quota` |
| `syncRelayPresets` | `(storage?, fetchImpl?) => Promise<RelayProvider[]>` | `GET /api/relays/presets`; may save |
| `aggregateBalances` | `(providers) => BalanceSummary` | Pure display |
| `formatBalance` | `(amount?, 'USD'\|'CNY') => string` | Pure |
| `getAuthToken` / `setAuthToken` | `() => string` / `(token) => void` | `opencode_auth_token` |
| `api.getProviders` | `() => Promise<ProviderInfo[]>` | `GET /config/providers` |

`RelayProvider`: `{ id, name, baseUrl, apiKey, redeemUrl?, currency, quotaRate?, cnyRate?, balance?, totalQuota?, usedQuota?, isUnmetered?, note?, lastUpdated?, status?, error? }`.

## Actionable Recipes

<adding_relay_preset_recipe>
1. Add the public baseUrl + redeemUrl to `PRESETS` in `RelayHubSettings.tsx` **and** to the companion server `/api/relays/presets` payload (so `syncRelayPresets` agrees).
2. Never put live keys in either file. Keys enter via Settings or the local presets endpoint that reads host env — not source.
3. Extend `parseQuotaResponse` only when the vendor JSON shape is new; keep the 8s/10s timeouts.
</adding_relay_preset_recipe>

<adding_model_to_picker_recipe>
1. The daemon must already expose the model on `GET /config/providers`.
2. If it should be hidden by default, update `model-filter.ts` curated lists / visibility.
3. Do not hardcode model ids in MessageBubble; that widget reads normalized `info.modelID`.
</adding_model_to_picker_recipe>

## User Protection Zones

<!-- BEGIN USER-SPECIFIED -->
- Never log, commit, or render raw relay keys (except the explicit eye-toggle in Settings).
- Loopback bind stays `127.0.0.1`. Remote use requires an authenticating reverse proxy plus optional `opencode_auth_token` — not `server.listen(0.0.0.0)`.
- NovAI (`once-cf.novai.su`, `relay_novai`) is purged on sync. Do not add it back.
- Relay Hub is a billing viewer. It must not silently rewrite daemon provider config or New API channels.
<!-- END USER-SPECIFIED -->
