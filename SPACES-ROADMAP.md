# Formline Spaces 2.0 — development plan

## Scope
A schema-driven embedded web app platform for Discord Activities. Preserve existing Interactive Studio, licensing, Daki presence and website. No local hosting. Launch from Discord's official Activity surface; do not impersonate Discord or inject client code.

## Selected features
| Feature | Phase | Initial alpha scope |
|---|---|---|
| Navigation history | 1 | Back/forward, named screens, cross-space route history |
| Responsive layouts | 1 | Adaptive navigation, content grid and single-column narrow layout |
| Interactive objects | 1 | Toggles, sliders, choices and buttons |
| Window system | 1 | Accessible dialogs and detail windows |
| Custom interfaces | 1 | Editable space title, accent, theme, navigation labels, page copy |
| Live control rooms | 3 | Local event dashboard prototype, then authenticated owner control and real synchronization |
| Custom databases | 2 | Local editable records prototype, then server-side typed collections and access controls |
| Content unlocking | 1 | Local progression gates; server-side checks required for protected content |
| Dynamic interfaces | 1 | Render content based on local selections, progression and event state |
| App-to-app navigation | 1 | Switch between spaces inside one Formline Activity; distinct Discord app launches deferred |
| Interactive worlds | 1 | Configurable room navigation prototype, then spatial editor |
| Live exhibits | 1 | Gallery and detail windows, then creator-managed shared publication |

## Native Activity integration
- Official Embedded App SDK, bundled and served from the same mapped host.
- Private Activity launch and READY handshake test; no fake Discord-connected indicator.
- Use least-privilege identity authorization only after a server-side token exchange is implemented.
- Do not store raw Discord OAuth tokens in local storage.
- Verify Discord iframe/proxy, desktop and mobile client behavior.
- Keep draft editing private to a device until owner authorization and publishing APIs exist.

## Phases
1. Hosted schema runtime + creator sandbox + local test data.
2. Authenticated publisher, versioned schemas, tenant isolation, database rules, deletion/export.
3. Server-authorized control rooms, live updates, access rules and moderation; rate limits and concurrency tests.
4. Desktop Studio integration; live Discord validation before general release.
