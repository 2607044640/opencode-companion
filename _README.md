# OpenCode Web Companion — Usage Pointer

<context>
Monolithic usage catalogs are deprecated. Root router: `README.md`. Architecture per subsystem: `docs/modules/*.md`. Agent workflow (normalize / loopback / TUI): skill `OpenCodeCompanionDev`.
</context>

Read `README.md` first. Load exactly one module file for the surface you are changing:

| Trigger | File |
| :--- | :--- |
| Session lifecycle, draft, pin, unread, revert, archive, export | `docs/modules/session-management.md` |
| Dialogue map, laser, lazy connect, pin-break, undo | `docs/modules/dialogue-blueprint.md` |
| SSE, deltas, thinking, worked summary, diffs | `docs/modules/streaming-chat.md` |
| Prompt textarea, `/` `@`, attachments | `docs/modules/prompt-controller.md` |
| Sidebar, tabs, Ctrl+K / Ctrl+F, zen, shortcuts | `docs/modules/layout-modes.md` |
| Models, relay hub, billing, ingress token | `docs/modules/relay-gateway.md` |
| Preference toggles / feature visibility (no plugin registry) | `docs/modules/plugin-system.md` |
