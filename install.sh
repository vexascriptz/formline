#!/usr/bin/env bash
set -euo pipefail
python -m pip install --upgrade -r requirements.txt
# Modern yt-dlp needs a JS runtime for full YouTube extraction.
# Deno is installed locally, with no root privileges or global config changes.
if command -v deno >/dev/null 2>&1; then
  echo '[drop.] Using existing Deno.'
elif [ -x './bin/deno' ]; then
  echo '[drop.] Using bundled Deno.'
else
  mkdir -p bin
  python bootstrap_deno.py
fi
