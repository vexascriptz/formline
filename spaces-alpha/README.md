# Spaces alpha
The deployed browser sandbox is https://formline-spaces-alpha.formline-app-d6e2.workers.dev/. It is a distinct Worker, with no DB or secret bindings. All draft/example data is local and the control room is a local simulation.

## Build the Activity bundle
On a network-enabled CI/build runner, in this directory, run `npm install` then `npm run build`. Review package lock and dependency licenses. Deploy the resulting dist/worker.mjs as the main module of the isolated formline-spaces-alpha Worker; no bot credentials are required by this runtime. SDK dependency installation and Discord client launch are not yet verified. Test /health for sdkBundled:true after that deployment.

## Private Discord launch
After the SDK build is deployed, set the Activity URL mapping in the Discord Developer Portal to prefix / and target formline-spaces-alpha.formline-app-d6e2.workers.dev. Enable Activities and launch Formline in a test server from Discord's App Launcher. Verify the READY state in the UI, then test pages, resize, dialogs, history and storage. Keep the existing Interactions Endpoint URL unchanged. Do not re-register command lists destructively, since enabling Activities creates an entry-point command.

This initial handshake does not authenticate a Discord member or authorize sensitive data. Server-side identity, owner publishing, protected content, shared databases and synchronized control rooms are future release gates. No local hosting is required.
