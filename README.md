# drop. 0.6 — Daki edition

A minimal **black-and-purple Chrome extension** plus a private Daki-based YouTube media processor using `yt-dlp`, FFmpeg and Deno. For content you own or are authorized to save.

**This is a tested source package, not a claim of a live Daki deployment.** The included API tests use a fake downloaded file. Real YouTube access must be tested from the Daki server; requests can be limited by YouTube even when yt-dlp is current.

## Daki setup

**Protect your Formline/Pip bot:** create a *separate paid-plan server split* called `drop-backend`, rather than uploading into the Formline server or changing Pip's startup command.

1. In [Daki Billing Panel](https://billing.daki.cc), open your paid service and create a **Python** split (start with about 2 GB RAM and enough free disk). Daki allows multiple splits and public ports for paid plans.
2. In [Daki Portal](https://portal.daki.cc), open the new split and allocate a **public network port**.
3. Upload the contents of this project to the split's Files tab, **or** connect a Git repository/branch in its Git Deploy tab.
4. In Startup, set the Python image to **Python 3.13**, Install command to `bash install.sh`, and Startup command to `python app.py`.
5. Set `PORT` to your allocated port if Daki doesn't populate `SERVER_PORT`. Start the split.
6. In the Daki Console, locate the **one-time 8-character pairing code** printed on first boot. Pairing creates a long secret token stored locally in `data/auth.json`; don't share that file or log.
7. For a remote extension connection, place the split behind a **HTTPS** endpoint (e.g. Cloudflare reverse proxy or tunnel), using the [Daki custom-domain guide](https://daki.cc/wiki/guides/connect-domain). Never send the pairing code over a public HTTP endpoint. You can use `http://localhost` for local development only.
8. In Chrome, open `chrome://extensions`, turn on Developer Mode and **Load unpacked**. Select the `extension` folder. Click the settings icon once to paste the HTTPS endpoint and pairing code.

After setup: open a YouTube watch page → click drop. → choose MP3/MP4 quality → Download. **Close the popup**; Chrome's background alarm checks jobs every ~30 seconds and downloads completed files automatically to `Downloads/drop`.

## Server safety and reliability

- Single concurrent download; at most four queued/running jobs; maximum 90-minute media and 850 MB final size (configurable with `DROP_MAX_DURATION`, `DROP_MAX_FILESIZE`). No per-account rate caps, but these resource caps prevent unlimited disk consumption and preserve Pip.
- Completed files expire after 15 minutes and are cleaned automatically. Jobs disappear on server restart; the extension may report a missing job afterward.
- The public API accepts **only 11-character YouTube video IDs** (not arbitrary URLs), uses pairing + bearer auth, and issues short-lived file tickets.
- Deno is installed automatically into `./bin` at setup if missing; installation requires Daki outbound access to GitHub. Imageio-FFmpeg installs its own binary via pip.
- If you reload the API after it is paired, the same browser stays connected. If you need to re-pair after losing the Chrome extension settings, stop the app, delete `data/auth.json`, then restart to print a fresh pairing code.
- Browser-only self-contained YouTube downloading is intentionally *not* claimed. This app runs the video processing on your hosting slot.
- YouTube can return errors or block datacenter IPs. A successful local mock test isn't proof that your specific Daki node will be allowed to retrieve a video.

## Development tests

```bash
pip install fastapi uvicorn pydantic pytest httpx
python -m pytest -q tests
node --check extension/background.js
node --check extension/popup.js
```

Don't publish this unpacked extension to the Chrome Web Store: its YouTube downloading functionality conflicts with Chrome Web Store policy.
