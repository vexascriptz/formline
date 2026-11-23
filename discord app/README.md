# Formline Discord — Pip

Pip is the Discord assistant for the pre-launch **Formline app lineup**.

- Official community: https://discord.gg/3EuqCaRcCY
- Server: Formline Studios
- Daki: discord.js v14 runtime and presence
- Cloudflare: interaction commands and Formline backend

## Before launch

The Formline website and public downloads have **not launched**. Public bot commands and official intro messages must not advertise the unfinished website or download links. The existing private beta infrastructure is separate from the public server.

## Pip behavior

- Sets its server nickname to `pip` when added or on startup; does **not** lock it or DM people who rename it.
- Rotates four Discord activities every five minutes.
- Registered commands: `/pip`, `/apps`, `/updates`, `/community`, `/feedback` alongside existing support/license/interactive commands.
- The Discord command handler is in `discord-interactions.mjs` and deployed to `formline-discord` and `formline-beta`.
- The Daki entrypoint imports `pip-runtime.mjs`. Never replace the live bot token or its existing `index.js` from GitHub.

## Live server layout (v2)

**FORMLINE**: #start-here, #rules, #announcements (announcement channel).

**APPS**: #app-index, #discord (Formline's Discord toolkit), #pip-bot, #experiments (forum for possible future apps).

**DEVELOPMENT**: #devlog (announcement channel), #roadmap, #previews (gallery-style forum).

**COMMUNITY**: #general, #showcase, #off-topic, lounge (voice).

**SUPPORT**: #support, #suggestions, #bug-reports (forum channels with product/issue tags).

The old #releases is preserved but hidden from everyone until launch. Existing conversations are preserved; the migration reused or renamed channels where possible.

The v2 design is implemented in `formline-layout-v2.mjs`. It is a one-time migration gated by `formline-layout-v2.tags-applied` on Daki. Do not auto-recreate previous generic channels each time Pip restarts. Bot guides and forum instructions are factual; do not fake app updates or release dates.

## Deployment and verification

- `.github/workflows/apply-formline-layout-v2.yml`: backs up the live runtime and deploys layout code; verifies startup.
- `.github/workflows/verify-formline-layout.yml`: read-only verification of the server layout report and forum-tag settings.
- `.github/workflows/sync-formline-invite.yml`: checks the current invite across live sources.
- `.github/workflows/daki-connection-test.yml`: manual read-only server check.

Initial live migration completed with channels moved and guide posts pinned. A follow-up tag repair completed with **zero reported warnings**. The bot remained running. See Actions logs for details.

If further redesign is needed, update the migration deliberately; do not bypass the marker without reviewing effects on member content and permissions.
