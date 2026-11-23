'use strict';

const ALARM = 'drop-check-downloads';
const POLL_INTERVAL_MIN = 0.5;
let pollRunning = false;

async function config() {
  return chrome.storage.local.get(['server', 'token', 'jobs', 'lastResult']);
}

function normalizeServer(input) {
  let url;
  try { url = new URL(String(input).trim()); } catch { throw new Error('Enter a complete HTTPS server URL.'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Enter only the server address, without a path.');
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('Use HTTPS for a remote server.');
  return url.origin;
}

async function api(path, method='GET', body=null) {
  const {server,token} = await config();
  if (!server || !token) throw new Error('Connect drop. to your server first.');
  let response;
  try {
    response = await fetch(server + path, {
      method,
      headers: {'Authorization':'Bearer '+token, ...(body ? {'Content-Type':'application/json'} : {})},
      body: body ? JSON.stringify(body) : undefined,
      cache:'no-store',
      signal: AbortSignal.timeout(22000)
    });
  } catch { throw new Error('Cannot reach your Daki server. Check its address and whether it is running.'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('Server response was not valid JSON.'); }
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Server returned ${response.status}.`);
  return data;
}

async function checkJobs() {
  if (pollRunning) return;
  pollRunning = true;
  try {
    const state = await config();
    if (!state.server || !state.token || !state.jobs?.length) return;
    const jobs = [...state.jobs];
    const remaining=[];
    for (const job of jobs) {
      try {
        const result = await api('/api/jobs/' + encodeURIComponent(job.id));
        if (result.state === 'ready' && result.ticket) {
          const safeName = String(result.filename || `video.${job.format}`).replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g,' ').trim().slice(0,130);
          const url = state.server + '/api/jobs/' + encodeURIComponent(job.id) + '/file/' + encodeURIComponent(result.ticket);
          await chrome.downloads.download({url, filename:'drop/' + safeName, conflictAction:'uniquify', saveAs:false});
          await chrome.storage.local.set({lastResult: {message:'Downloading ' + safeName, type:'success', at:Date.now()}});
        } else if (result.state === 'error') {
          await chrome.storage.local.set({lastResult: {message:result.error || 'Download failed', type:'error', at:Date.now()}});
        } else {
          remaining.push({...job, state:result.state, progress:result.progress});
        }
      } catch (e) {
        remaining.push(job); // Do not lose queued work due to a temporary outage.
        await chrome.storage.local.set({lastResult:{message:e.message || 'Server unavailable',type:'error',at:Date.now()}});
      }
    }
    await chrome.storage.local.set({jobs:remaining});
    await chrome.action.setBadgeText({text:remaining.length ? String(remaining.length) : ''});
    await chrome.action.setBadgeBackgroundColor({color:'#8757e8'});
  } finally {
    pollRunning=false;
  }
}

async function handle(message) {
  switch(message?.type) {
    case 'getState': return config();
    case 'pair': {
      const server = normalizeServer(message.server);
      let response;
      try {
        response = await fetch(server + '/api/pair', {
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({code:String(message.code || '').trim()}),
          signal:AbortSignal.timeout(12000),cache:'no-store'
        });
      } catch { throw new Error('Could not connect to the server. Check Daki and HTTPS.'); }
      const result = await response.json().catch(()=>({}));
      if (!response.ok || !result.token) throw new Error(result.detail || `Pairing failed (${response.status}).`);
      await chrome.storage.local.set({server,token:result.token,jobs:[],lastResult:null});
      return {connected:true};
    }
    case 'disconnect':
      await chrome.storage.local.remove(['server','token','jobs','lastResult']);
      await chrome.action.setBadgeText({text:''});
      return {ok:true};
    case 'download': {
      if (!/^[A-Za-z0-9_-]{11}$/.test(message.videoId||'')) throw new Error('Open a normal YouTube video first.');
      const format = message.format === 'mp3' ? 'mp3' : 'mp4';
      const quality = String(message.quality || (format === 'mp3' ? 192 : 720));
      const r = await api('/api/jobs','POST',{video_id:message.videoId, format, quality});
      const existing=(await config()).jobs || [];
      existing.push({id:r.id,format,created:Date.now(),state:'queued',progress:0});
      await chrome.storage.local.set({jobs:existing,lastResult:{message:'Preparing download in background',type:'success',at:Date.now()}});
      await chrome.action.setBadgeText({text:String(existing.length)});
      await chrome.action.setBadgeBackgroundColor({color:'#8757e8'});
      return r;
    }
    case 'check': await checkJobs(); return config();
    case 'health': return api('/api/me');
    default: throw new Error('Unknown request');
  }
}

chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
  handle(message).then(v=>sendResponse({ok:true,data:v})).catch(e=>sendResponse({ok:false,error:e.message||String(e)}));
  return true;
});

chrome.runtime.onInstalled.addListener(()=>chrome.alarms.create(ALARM,{periodInMinutes:POLL_INTERVAL_MIN}));
chrome.runtime.onStartup.addListener(()=>chrome.alarms.create(ALARM,{periodInMinutes:POLL_INTERVAL_MIN}));
chrome.alarms.onAlarm.addListener(a=>{if(a.name===ALARM) checkJobs().catch(()=>{});});
// Worker may be restarted; restore the alarm if it was somehow removed.
chrome.alarms.get(ALARM, alarm=>{if(!alarm)chrome.alarms.create(ALARM,{periodInMinutes:POLL_INTERVAL_MIN});});
