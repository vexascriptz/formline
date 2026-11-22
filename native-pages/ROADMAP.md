# Formline Native — proposed bot-first direction
Spaces and Activities are not part of this direction. Keep the existing interactive bot, licensing, Daki connection and desktop application.

## First milestone: permanent native pages
- [x] Isolated two-pass compiler in native-pages/publisher.mjs, with mocked adapter tests.
- [ ] Authenticated owner-only publishing API: validate guild ownership, channel reachability, bot permissions, rate limits and idempotency.
- [ ] Publish each page to its own message ID; wire buttons to the native Discord message URLs.
- [ ] Durable publish journal, cleanup/retry, stable IDs when pages are edited, repair deleted destinations.
- [ ] Desktop editor: page destination modes (public messages, individual private session threads, forum documents), linked page graph, native preview.
- [ ] Test message link buttons, jump behavior, layout and permissions in live Discord desktop/mobile.
- [ ] Private thread sessions: explicit opt-in, cap per member, membership checks, archive/reopen policy, delete on request; staff access disclosed.

## Expansion
- [ ] Live linked-message variables and dependency graph: update only affected published bot messages.
- [ ] Search command with autocomplete for published pages the member can view.
- [ ] Forum collections with tag-filtered content and explicitly approved submissions.
- [ ] Personal progress, read/bookmark history and resume links; opt-in and user deletion.
- [ ] Native modal builder: radios, checkboxes, uploads, user/role/channel selection.
- [ ] Scheduled event control: synchronized stage and announcements, native events, bounded updates.
- [ ] Collective puzzles and world state using explicit interactions; safe role gates.
- [ ] Collaborative review queues and versioned publication.
- [ ] Advanced Components V2 layout compiler and component-limit validation.
- [ ] Self-repair checks for broken message links and permissions.
- [ ] Controlled per-server bot branding and role connection metadata where supported.
- [ ] Optional static share cards via official component link previews, not a separate application.
- [ ] Selective event routing from hosted Daki bot; do not ingest unrelated chat messages.

## Limits
Use official bot APIs only; no injected Discord client UI, no custom HTML inside chat, no forced navigation, no promise of globally unique ideas. Link buttons navigate without interaction callbacks; use a separate explicit action when authorization, persistence or logging is required. Every public page is visible to anyone who can read its channel. Never enforce access with a navigation-only condition. Avoid excessive channel/thread creation and edit loops.

References: https://docs.discord.com/developers/components/reference ; https://docs.discord.com/developers/resources/channel ; https://docs.discord.com/developers/resources/message ; https://docs.discord.com/developers/interactions/receiving-and-responding ; https://docs.discord.com/developers/events/gateway-events ; https://docs.discord.com/developers/link-previews/component-embeds
