# Formline Discord integration
Payments disabled; beta access only.
- Portal: https://formline-beta.formline-app-d6e2.workers.dev/
- Admin: https://formline-beta.formline-app-d6e2.workers.dev/admin
- Code generator: https://formline-beta.formline-app-d6e2.workers.dev/admin?view=generate
- Interactions endpoint: https://formline-discord.formline-app-d6e2.workers.dev/discord/interactions
- OAuth callback: https://formline-beta.formline-app-d6e2.workers.dev/auth/discord/callback

Commands: /formline, /license, /beta, /support, /help, /status. /formline-setup is guild-install only and checks Manage Server or Administrator permission at runtime. It posts a public access panel; other responses are private. No mentions are generated.

Both workers were redeployed with the expanded command handler. Register commands via the owner-only Admin UI after configuring DISCORD_BOT_TOKEN and DISCORD_CLIENT_SECRET as encrypted Worker secrets in formline-beta. Alternatively run register-commands.mjs with an environment-provided token. Enable Guild Install in Discord to register the server panel command. The interaction handler requires no bot token; it validates Ed25519 signatures with the public key. Live registration and delivery must be tested separately.
