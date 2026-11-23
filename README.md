# drop. v0.7 — zero-setup extension

Users install the `extension/` folder and click Download on a YouTube watch page. The extension is preconfigured to the owner's Daki slot and creates a temporary limited session automatically. No pairing code, login, API key, helper app or settings screen.

## Backend

Uses the existing dedicated `drop-backend` Daki split at the owner-supplied address. `/api/guest/session`, `/api/guest/jobs`, and `/api/guest/jobs/{id}` handle browser sessions without exposing the administrator pairing secret. The old private `/api/pair` and `/api/jobs` endpoints remain available for administration.

## Security tradeoffs

The new guest endpoint is **public**. Other users with the extension can consume the owner's server bandwidth and CPU. It is rate-limited to 8 queued downloads per IP per hour, 4 simultaneous pending/running, file expiry after 15 minutes, and validated YouTube IDs only. No rate limit is truly tamperproof on the public internet.

**Important:** The supplied host uses HTTP on its custom port, which does not encrypt connections. A real HTTPS reverse proxy under an HTTPS domain is strongly recommended before wider distribution. The extension does NOT send the administrator pairing code or token over the network.

## Installing

Unzip the ZIP; in `chrome://extensions`, enable Developer mode, Load unpacked, choose the `drop` folder containing `manifest.json`. Update the existing extension with the new files and reload it. Only the one host permission is requested.

## Limitations

This is not Chrome Web Store eligible as a YouTube downloader. YouTube downloads can still fail due to blocked server IPs and other restrictions. Tests include simulated media; they do not confirm an end-to-end real YouTube download.
