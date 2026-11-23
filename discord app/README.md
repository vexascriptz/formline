# Formline Discord — Pip

Pip is the friendly Discord assistant for the **Formline app lineup**.

## Live setup

- Official community invite: https://discord.gg/3EuqCaRcCY
- Daki bot runtime: `pip-runtime.mjs` deployed alongside the existing `index.js`
- Discord interaction webhook (Cloudflare): `formline-discord`
- Formline website and desktop APIs (Cloudflare): `formline-beta`
- Beta/portal: https://formline-beta.formline-app-d6e2.workers.dev/

## Pip behavior

- Sets its server nickname to `pip` when added to a guild and each time the bot starts.
- Does **not** lock nicknames, monitor nickname changes, DM people who rename it, or police server admins.
- Rotates one of four Discord activities every five minutes.
- Registers missing global `/pip`, `/apps`, `/updates`, `/community`, and `/feedback` commands without removing existing commands.
- Existing Formline beta/license/interactive commands continue running through the Cloudflare Discord interaction endpoint.

## Official server setup

On startup, Pip identifies the official server through the official invite. If invite resolution fails, it uses an unambiguous guild named exactly `formline` as a fallback.

With **Manage Channels**, it creates only missing channels and categories. It never deletes or moves existing channels or overwrites existing permissions. It adds starter posts in new relevant text channels. Support and feedback are forum channels when Community is enabled, otherwise text channels.

Layout: INFORMATION (start-here, announcements, releases, roadmap), COMMUNITY (general, showcase, off-topic, voice lounge), FORMLINE (apps, app-discussion, support, feedback).

The runtime writes only setup diagnostics to `pip-runtime-report.json` on Daki. It does not print bot tokens or secrets.

## Deployments

- `.github/workflows/install-pip-runtime.yml` installs/replaces the Pip runtime with a server-side backup, syntax checking, restart verification and rollback.
- `.github/workflows/sync-formline-invite.yml` checks accessible Daki source and live Cloudflare endpoints for old invite links.
- `.github/workflows/daki-connection-test.yml` is a manual, read-only connection test.

The old nickname-lock module and its deployment workflow were retired.

## Testing and permissions

Daki installation and server bootstrap succeeded in the initial live GitHub Actions run. Actual Discord interaction UX and future-server join behavior still merit an end-to-end Discord test.

Pip needs **Change Nickname** to set its guild nickname and **Manage Channels** to create community channels. It does not require **View Audit Log** or **Administrator** for these features.

No payment features are enabled; beta access only.
