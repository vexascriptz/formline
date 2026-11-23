"""Install the official Deno Linux x64 release to ./bin without shell-piping remote code."""
from pathlib import Path
import io, os, urllib.request, zipfile
root = Path(__file__).resolve().parent
path = root/'bin'/'deno'
if path.exists():
    print('[drop.] Deno already installed')
else:
    url='https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip'
    request=urllib.request.Request(url,headers={'User-Agent':'drop-backend-setup/1.0'})
    with urllib.request.urlopen(request,timeout=100) as resp:
        payload=resp.read(160*1024*1024)
    with zipfile.ZipFile(io.BytesIO(payload)) as zip_:
        data=zip_.read('deno')
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(data)
    path.chmod(0o755)
    print('[drop.] Installed Deno to',path)
