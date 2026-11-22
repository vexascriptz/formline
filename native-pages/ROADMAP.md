# Formline Native — selected product roadmap

No Spaces or Activities. Native Discord bot, existing desktop toolkit, Daki presence and Cloudflare backend.

## Release 1: Native Pages
- [x] Two-pass public page compiler with actual separate Discord message IDs and links.
- [x] Native text/image/divider blocks, navigation cards, component and text budgets.
- [x] Dependency-based shared variables, selective stable-message refresh.
- [x] Validation for disconnected pages, invalid references, oversized content.
- [x] Journal hooks, uncertain-create detection, cleanup reporting, verification hooks.
- [x] Mock regression checks; repeatable Node test suite (node --test native-pages/publisher.test.mjs).
- [ ] Production owner-only API, durable journal and idempotent job serialization; authoritative Discord permissions and publication ownership.
- [ ] Desktop integration: responsive one-page-at-a-time design, preview mode, page map, publishing and repair.
- [ ] Discord test-server verification on desktop/mobile, restart/retry tests, permission failure tests; no claim of bug-free operation.

## Release 2: Connected experiences
- Persistent private thread sessions (opt-in, deletion and caps, disclose moderator access).
- Forum collections and searchable navigation.
- Personal continuity: explicit bookmarks, resume links, opt-in history.
- Native form layouts, radio/checkbox components and supported file submissions.
- Interactive worlds and role/access-aware destinations.
- Revision history, repair suggestions and stable links.

## Release 3: Live systems
- Shared document variables linked across published messages.
- Live event dashboards with explicit authorized controls and bounded updates.
- Collective puzzles and shared progress, with moderation and opt-in participation.
- Authorized forum-backed collections, review and approval.
- Selective Gateway event routing; do not collect unrelated chat.
- Rollback and rate limits, least privilege, tenant separation, data deletion.

## Deliberately excluded
Custom HTML/client injection, artificial navigation tabs, hidden monitoring, mass channels or thread generation, arbitrary code execution, excessive message editing, and features duplicating existing standalone apps. No promise of first-ever capability or zero defects.

## Limits
Use official bot APIs only; no injected Discord client UI, no custom HTML inside chat, no forced navigation, no promise of globally unique ideas. Link buttons navigate without interaction callbacks; use a separate explicit action when authorization, persistence or logging is required. Every public page is visible to anyone who can read its channel. Never enforce access with a navigation-only condition. Avoid excessive channel/thread creation and edit loops.

References: https://docs.discord.com/developers/components/reference ; https://docs.discord.com/developers/resources/channel ; https://docs.discord.com/developers/resources/message ; https://docs.discord.com/developers/interactions/receiving-and-responding ; https://docs.discord.com/developers/events/gateway-events ; https://docs.discord.com/developers/link-previews/component-embeds

