# Formline 1.7 — Linked Discord identity and server-aware publishing

## Implemented
- Post-activation Discord account connection is mandatory in the desktop shell.
- One-time browser connection through the existing Discord OAuth callback with PKCE; scope `identify guilds` is requested **only** for a desktop connection. Formline license Discord ID must match OAuth identity.
- OAuth access/refresh credentials are encrypted at rest on Cloudflare with an AES-GCM key derived from the existing server secret; no OAuth credential is returned to desktop or Daki.
- Server discovery filters to `owner=true` or Administrator permission (0x8) from current OAuth guild permissions.
- Channel discovery uses the installed Formline bot and shows text/announcement channels by name.
- Native Pages and Interactive Studio share the server/channel picker; live admin permission checked again before publishing or editing.
- Disconnect purges encrypted OAuth credentials and desktop pairing requests; UI returns to mandatory connect gate.
- Daki Gateway 1.1.0 listens to Guilds / channel structure events without Message Content or privileged intents. Signed server-health heartbeat sends counts only to Cloudflare. Account Settings displays last healthy heartbeat.
- Existing Discord HTTP Interactions Endpoint, bot activity text, and licensing preserved.

## Files
- `discord-connect/desktop-link.mjs`: encrypted authorization and guild discovery.
- `native-pages/api.mjs`: Native Pages admin permission check.
- Local desktop 1.7 source and Daki 1.1 ZIP distributed with the alpha installer.

## Testing
- Python syntax checks for desktop + local HTTP server.
- JavaScript syntax checks for desktop and Node Gateway.
- Mocked UI tests at 680/920/1300 px, with no horizontal overflow and no runtime errors. Tested account gate, account connection, admin server and channel selection.
- All 12 packaged app files checked against embedded SHA256 manifest.
- Cloudflare Worker deployment and secret binding checks.
- **Not yet completed:** real Discord OAuth consent, real admin/non-admin guild permission changes, Windows native installer run and real Discord message publish. Do not claim zero bugs.

## Next features worth building
1. Event-reactive panels: on guild/channel changes, recompute affected bot-created documents without polling.
2. Durable scheduled updates: host a rate-limited queue and wakeup jobs on Daki with Cloudflare persistence.
3. Permission-preview: before publishing, show whether bot can view/send in each chosen channel; only report verified permission checks.
4. Publication repair center: identify missing/deleted bot pages and re-link with explicit owner approval.
5. Multi-server publishing: one draft to explicitly selected channels, with separate permissions and rollback.
6. Live status cards: signed Gateway health and opt-in server stats; avoid reading message content.
7. Message gallery builder: rich Components V2 pages with safe media and custom visual layout.

No Spaces, Discord Activities, client injection, or age-restricted features.
