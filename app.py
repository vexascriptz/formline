"""drop. server. Private, authenticated single-user media download queue.

Only accepts validated YouTube video IDs; never downloads arbitrary caller-supplied URLs.
Use it for media you're authorized to save and follow site terms.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import queue
import re
import secrets
import shutil
import threading
import time
import unicodedata
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

BASE = Path(__file__).resolve().parent
DATA = BASE / 'data'
OUTPUTS = DATA / 'jobs'
AUTH_FILE = DATA / 'auth.json'
VIDEO_ID = re.compile(r'^[a-zA-Z0-9_-]{11}$')
MAX_READY_AGE = int(os.environ.get('DROP_FILE_TTL', '900'))
MAX_DURATION = int(os.environ.get('DROP_MAX_DURATION', '5400'))
MAX_FILESIZE = int(os.environ.get('DROP_MAX_FILESIZE', '850000000'))
MAX_PENDING = 4
GUEST_HOURLY_LIMIT = 8  # Public auto-connect mode; protects the paid Daki slot.
GUEST_SESSION_LIFETIME = 7 * 24 * 3600
GUEST_RATE_WINDOW = 3600
GUEST_RATE_LOCK = threading.RLock()
GUEST_JOB_TIMES: dict[str, list[float]] = {}
GUEST_SESSION_TIMES: dict[str, list[float]] = {}

DATA.mkdir(parents=True, exist_ok=True)
OUTPUTS.mkdir(parents=True, exist_ok=True)


def _read_auth() -> dict:
    # Persist on Daki; never commit the data directory or print the bearer token.
    if AUTH_FILE.exists():
        auth = json.loads(AUTH_FILE.read_text(encoding='utf-8'))
    else:
        auth = {'pair_code': secrets.token_hex(4).upper(), 'token': secrets.token_urlsafe(48), 'paired': False}
        fd = os.open(str(AUTH_FILE), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(auth, f)
        print('\n[drop.] First setup pairing code:', auth['pair_code'], flush=True)
        print('[drop.] Enter this code once in the extension settings. Do NOT share it publicly.\n', flush=True)
    return auth

AUTH = _read_auth()
AUTH_LOCK = threading.Lock()
PAIR_ATTEMPTS: dict[str, list[float]] = {}


def safe_filename(text: str) -> str:
    value = unicodedata.normalize('NFKC', text or 'video')
    value = re.sub(r'[\\/:*?"<>|\x00-\x1f\x7f]', ' ', value)
    value = re.sub(r'\s+', ' ', value).strip(' .')
    return value[:115] or 'video'


@dataclass
class Job:
    id: str
    video_id: str
    fmt: str
    quality: str
    state: str = 'queued'
    progress: int = 0
    message: str = 'Queued'
    created: float = field(default_factory=time.time)
    completed: float = 0
    title: str = 'video'
    filename: str = ''
    file_path: Path | None = None
    ticket: str = ''
    error: str = ''
    owner: str = 'admin'

    def public(self) -> dict:
        return {
            'id': self.id, 'state': self.state, 'progress': self.progress,
            'message': self.message[:140], 'title': self.title,
            'filename': self.filename if self.state == 'ready' else None,
            'ticket': self.ticket if self.state == 'ready' else None,
            'error': self.error[:180] if self.state == 'error' else None,
        }


JOBS: dict[str, Job] = {}
LOCK = threading.RLock()
QUEUE: queue.Queue[str] = queue.Queue(maxsize=MAX_PENDING)


class PairRequest(BaseModel):
    code: str


class JobRequest(BaseModel):
    video_id: str
    format: str = 'mp4'
    quality: str = '720'


app = FastAPI(title='drop. private API', docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware('http')
async def security_headers(request: Request, call_next):
    # No public CORS wildcard. Extensions with host permission can call the API.
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    return response


def require_token(authorization: str | None):
    raw = (authorization or '').removeprefix('Bearer ').strip()
    if not raw or not hmac.compare_digest(raw, AUTH['token']):
        raise HTTPException(401, 'Not paired')




def _visitor(request: Request) -> str:
    # Do not trust spoofable X-Forwarded-For values; trusted reverse proxy configuration
    # can be added explicitly when a TLS proxy is installed.
    return request.client.host if request.client else 'unknown'


def _sign_guest(payload: bytes) -> bytes:
    return hmac.new(AUTH['token'].encode('utf-8'), payload, hashlib.sha256).digest()


def _make_guest_token(request: Request) -> str:
    # Token only grants access to the public, IP-bound, rate-limited guest endpoints;
    # it is never an administrator credential and contains no pairing secrets.
    ip = _visitor(request)
    expires = int(time.time() + GUEST_SESSION_LIFETIME)
    identity = secrets.token_urlsafe(18)
    payload = f'{identity}.{expires}.{hashlib.sha256(ip.encode()).hexdigest()[:24]}'.encode()
    packed = base64.urlsafe_b64encode(payload).decode().rstrip('=')
    signature = base64.urlsafe_b64encode(_sign_guest(payload)).decode().rstrip('=')
    return packed + '.' + signature


def _guest_identity(request: Request, authorization: str | None) -> str:
    raw = (authorization or '').removeprefix('Bearer ').strip()
    try:
        packed, signature = raw.split('.', 1)
        payload = base64.urlsafe_b64decode(packed + '=' * (-len(packed) % 4))
        provided_signature = base64.urlsafe_b64decode(signature + '=' * (-len(signature) % 4))
        if not hmac.compare_digest(provided_signature, _sign_guest(payload)):
            raise ValueError('Invalid signature')
        identity, expiration, ip_hash = payload.decode().split('.', 2)
        if (not identity or int(expiration) <= time.time()
            or not hmac.compare_digest(ip_hash, hashlib.sha256(_visitor(request).encode()).hexdigest()[:24])):
            raise ValueError('Expired or wrong network')
        return identity
    except (ValueError, UnicodeDecodeError, TypeError, OverflowError):
        raise HTTPException(401, 'Guest session expired. Reconnect automatically.')


def _rate_limit(bucket: dict[str, list[float]], ip: str, maximum: int) -> None:
    now = time.time()
    with GUEST_RATE_LOCK:
        # Drop stale IP entries so the in-memory dictionaries cannot grow forever.
        for k in list(bucket):
            recent = [v for v in bucket[k] if now - v < GUEST_RATE_WINDOW]
            if recent:
                bucket[k] = recent
            else:
                bucket.pop(k, None)
        recent = bucket.setdefault(ip, [])
        if len(recent) >= maximum:
            raise HTTPException(429, 'Server usage limit reached. Try again later.')
        recent.append(now)


@app.post('/api/guest/session')
def guest_session(request: Request):
    _rate_limit(GUEST_SESSION_TIMES, _visitor(request), 30)
    return {'token': _make_guest_token(request), 'expires_in': GUEST_SESSION_LIFETIME}


@app.post('/api/guest/jobs')
def guest_create_job(body: JobRequest, request: Request, authorization: str | None = Header(default=None)):
    identity = _guest_identity(request, authorization)
    if not VIDEO_ID.fullmatch(body.video_id):
        raise HTTPException(422, 'Invalid YouTube video ID')
    if body.format not in ('mp4', 'mp3'):
        raise HTTPException(422, 'Format must be mp4 or mp3')
    if body.quality not in (('360','480','720','1080') if body.format == 'mp4' else ('128','192','320')):
        raise HTTPException(422, 'Unsupported quality')
    with LOCK:
        unfinished = sum(j.state in ('queued','downloading','processing') for j in JOBS.values())
        if unfinished >= MAX_PENDING:
            raise HTTPException(429, 'Server busy. Try again shortly.')
        _rate_limit(GUEST_JOB_TIMES, _visitor(request), GUEST_HOURLY_LIMIT)
        job = Job(id=uuid.uuid4().hex, video_id=body.video_id, fmt=body.format,
                  quality=body.quality, owner=identity)
        JOBS[job.id] = job
        QUEUE.put_nowait(job.id)
        return job.public()


@app.get('/api/guest/jobs/{job_id}')
def guest_get_job(job_id: str, request: Request, authorization: str | None = Header(default=None)):
    identity = _guest_identity(request, authorization)
    with LOCK:
        job = JOBS.get(job_id)
        if not job or not hmac.compare_digest(job.owner, identity):
            raise HTTPException(404, 'Job not found')
        return job.public()


@app.get('/health')
def health():
    return {'ok': True, 'service': 'drop.', 'queue': QUEUE.qsize()}


@app.post('/api/pair')
def pair(body: PairRequest, request: Request):
    ip = request.client.host if request.client else 'unknown'
    now = time.time()
    with AUTH_LOCK:
        recent = [x for x in PAIR_ATTEMPTS.get(ip, []) if now - x < 3600]
        if len(recent) >= 8:
            raise HTTPException(429, 'Too many pairing attempts')
        recent.append(now)
        PAIR_ATTEMPTS[ip] = recent
        if AUTH['paired']:
            raise HTTPException(409, 'Already paired. Reset pairing through Daki to connect another browser.')
        if not hmac.compare_digest(body.code.strip().upper(), AUTH['pair_code']):
            raise HTTPException(403, 'Incorrect pairing code')
        AUTH['paired'] = True
        AUTH_FILE.write_text(json.dumps(AUTH), encoding='utf-8')
    return {'token': AUTH['token']}


@app.get('/api/me')
def me(authorization: str | None = Header(default=None)):
    require_token(authorization)
    return {'connected': True, 'jobs': len(JOBS)}


@app.post('/api/jobs')
def create_job(body: JobRequest, authorization: str | None = Header(default=None)):
    require_token(authorization)
    if not VIDEO_ID.fullmatch(body.video_id):
        raise HTTPException(422, 'Invalid YouTube video ID')
    if body.format not in ('mp4', 'mp3'):
        raise HTTPException(422, 'Format must be mp4 or mp3')
    if body.quality not in (('360','480','720','1080') if body.format == 'mp4' else ('128','192','320')):
        raise HTTPException(422, 'Unsupported quality')
    with LOCK:
        unfinished = sum(j.state in ('queued','downloading','processing') for j in JOBS.values())
        if unfinished >= MAX_PENDING:
            raise HTTPException(429, 'Server busy. Try again shortly.')
        # Never accept arbitrary URL to prevent SSRF.
        job = Job(id=uuid.uuid4().hex, video_id=body.video_id, fmt=body.format, quality=body.quality)
        JOBS[job.id] = job
        QUEUE.put_nowait(job.id)
        return job.public()


@app.get('/api/jobs/{job_id}')
def get_job(job_id: str, authorization: str | None = Header(default=None)):
    require_token(authorization)
    with LOCK:
        job = JOBS.get(job_id)
        if not job:
            raise HTTPException(404, 'Job not found')
        return job.public()


@app.get('/api/jobs/{job_id}/file/{ticket}')
def download_file(job_id: str, ticket: str):
    with LOCK:
        job = JOBS.get(job_id)
        if (not job or job.state != 'ready' or not job.file_path or not job.file_path.is_file()
            or not hmac.compare_digest(ticket, job.ticket)
            or time.time() - job.completed > MAX_READY_AGE):
            raise HTTPException(404, 'File expired or unavailable')
        path, filename = job.file_path, job.filename
    return FileResponse(path, filename=filename, media_type='application/octet-stream')


def _set(job: Job, **changes):
    with LOCK:
        for k,v in changes.items():
            setattr(job,k,v)


def _ffmpeg_location() -> str | None:
    if shutil.which('ffmpeg'):
        return shutil.which('ffmpeg')
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def process(job: Job):
    import yt_dlp
    folder = OUTPUTS / job.id
    folder.mkdir(parents=True, exist_ok=True)
    url = f'https://www.youtube.com/watch?v={job.video_id}'
    maxheight = int(job.quality) if job.fmt == 'mp4' else None
    quality_filter = f'[height<={maxheight}]' if maxheight else ''
    options = {
        'noplaylist': True, 'quiet': True, 'no_warnings': True,
        'skip_download': False,
        'outtmpl': str(folder / 'media.%(ext)s'),
        'max_filesize': MAX_FILESIZE,
        'match_filter': yt_dlp.utils.match_filter_func(f'duration <= {MAX_DURATION}'),
        'retries': 3, 'fragment_retries': 3, 'concurrent_fragment_downloads': 2,
        'progress_hooks': [lambda p: _on_progress(job,p)],
        'postprocessor_hooks': [lambda p: _on_postprocess(job,p)],
    }
    ffmpeg = _ffmpeg_location()
    if ffmpeg:
        options['ffmpeg_location'] = ffmpeg
    else:
        raise RuntimeError('FFmpeg missing. Install dependencies or configure FFmpeg.')
    deno = BASE / 'bin' / 'deno'
    if deno.is_file():
        options['js_runtimes'] = {'deno': {'path': str(deno)}}
    if job.fmt == 'mp3':
        options['format'] = 'bestaudio/best'
        options['postprocessors'] = [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': job.quality}]
    else:
        # Prefer MP4/H.264 and M4A for efficient no-transcode merging; allow fallback.
        options['format'] = (
            f'bv*[vcodec^=avc1]{quality_filter}+ba[ext=m4a]/'
            f'b[ext=mp4]{quality_filter}/'
            f'bv*{quality_filter}+ba/b{quality_filter}'
        )
        options['merge_output_format'] = 'mp4'
        options['postprocessors'] = [{'key': 'FFmpegVideoRemuxer', 'preferedformat': 'mp4'}]
    _set(job, state='downloading', message='Getting media')
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=True)
    candidates = list(folder.glob('media.*'))
    ext = '.mp3' if job.fmt == 'mp3' else '.mp4'
    matching = [f for f in candidates if f.suffix.lower() == ext and f.is_file()]
    if not matching:
        raise RuntimeError('The requested output format could not be generated.')
    path = max(matching, key=lambda f: f.stat().st_size)
    if path.stat().st_size > MAX_FILESIZE:
        raise RuntimeError('File is too large for the current server configuration.')
    title = safe_filename(info.get('title','video') if isinstance(info,dict) else 'video')
    _set(job, state='ready', progress=100, message='Ready', completed=time.time(),
         title=title, filename=f'{title}{ext}', file_path=path, ticket=secrets.token_urlsafe(32))


def _on_progress(job: Job, p: dict):
    if p.get('status') != 'downloading':
        return
    got = p.get('downloaded_bytes') or 0
    total = p.get('total_bytes') or p.get('total_bytes_estimate') or 0
    progress = int(94 * min(1,got / total)) if total else 0
    _set(job, state='downloading', progress=progress, message='Downloading')


def _on_postprocess(job: Job, p: dict):
    if p.get('status') == 'started':
        _set(job, state='processing', progress=95, message='Preparing file')


def _cleanup():
    now = time.time()
    with LOCK:
        expired = [k for k,j in JOBS.items() if j.state in ('ready','error') and j.completed and now-j.completed > MAX_READY_AGE]
        for k in expired:
            del JOBS[k]
            shutil.rmtree(OUTPUTS / k, ignore_errors=True)
    for path in OUTPUTS.iterdir():
        if path.is_dir() and path.name not in JOBS and now-path.stat().st_mtime > MAX_READY_AGE:
            shutil.rmtree(path,ignore_errors=True)


def _worker():
    while True:
        try:
            job_id = QUEUE.get(timeout=30)
        except queue.Empty:
            _cleanup()
            continue
        with LOCK:
            job = JOBS.get(job_id)
        if job:
            try:
                process(job)
            except Exception as e:
                # Don't return full yt-dlp traces/URLs to browser.
                error = re.sub(r'https?://\S+', '[media URL]', str(e))[:170]
                _set(job, state='error', error=error or 'Download failed', message='Failed', completed=time.time())
                shutil.rmtree(OUTPUTS / job.id, ignore_errors=True)
            finally:
                _cleanup()
        QUEUE.task_done()


threading.Thread(target=_worker, name='drop-worker', daemon=True).start()

if __name__ == '__main__':
    import uvicorn
    port = int(os.environ.get('PORT', os.environ.get('SERVER_PORT', '8000')))
    uvicorn.run(app, host='0.0.0.0', port=port, log_level='info', access_log=False)
