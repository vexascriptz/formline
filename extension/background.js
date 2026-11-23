'use strict';

const ALARM = 'drop-check-downloads';
const POLL_INTERVAL_MIN = 0.5;
const SERVER = 'http://paid8.daki.cc:4261';
let pollRunning = false;

async function config() {
  const values = await chrome.storage.local.get(['guestToken','jobs','lastResult']);
  return {server:SERVER,token:values.guestToken || '',jobs:values.jobs || [],lastResult:values.lastResult};
}

async function session(force=false) {
  const state = await config();
  if (state.token && !force) return state.token;
  let response;
  try {
    response = await fetch(SERVER + '/api/guest/session', {
      method:'POST', cache:'no-store', signal:AbortSignal.timeout(12000)
    });
  } catch { throw Error('drop. server is unreachable. Try again in a moment.'); }
  if (!response.ok) throw Error('drop. is temporarily unavailable ('+response.status+').');
  const data = await response.json();
  if (!data.token) throw Error('drop. session could not start.');
  await chrome.storage.local.set({guestToken:data.token});
  return data.token;
}

async function api(path,method='GET',body=null,attempt=0) {
  const token = await session();
  let response;
  try {
    response = await fetch(SERVER + path, {
      method,
      headers: {'Authorization':'Bearer '+token,...(body ? {'Content-Type':'application/json'} : {})},
      body: body ? JSON.stringify(body) : undefined,
      cache:'no-store',signal:AbortSignal.timeout(22000)
    });
  } catch { throw Error('Cannot reach drop. on Daki.'); }
  if(response.status === 401 && attempt === 0) {
    await session(true);
    return api(path,method,body,1);
  }
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'Server returned '+response.status);
  return data;
}

async function checkJobs() {
  if (pollRunning) return;
  pollRunning = true;
  try {
    const state = await config();
    if (!state.jobs?.length) return;
    const jobs = [...state.jobs];
    const remaining=[];
    for (const job of jobs) {
      try {
        const result = await api('/api/guest/jobs/' + encodeURIComponent(job.id));
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
    case 'download': {
      if (!/^[A-Za-z0-9_-]{11}$/.test(message.videoId||'')) throw new Error('Open a normal YouTube video first.');
      const format = message.format === 'mp3' ? 'mp3' : 'mp4';
      const quality = String(message.quality || (format === 'mp3' ? 192 : 720));
      const r = await api('/api/guest/jobs','POST',{video_id:message.videoId, format, quality});
      const existing=(await config()).jobs || [];
      existing.push({id:r.id,format,created:Date.now(),state:'queued',progress:0});
      await chrome.storage.local.set({jobs:existing,lastResult:{message:'Preparing download in background',type:'success',at:Date.now()}});
      await chrome.action.setBadgeText({text:String(existing.length)});
      await chrome.action.setBadgeBackgroundColor({color:'#8757e8'});
      return r;
    }
    case 'check': await checkJobs(); return config();
    case 'health': { await session(); return {connected:true}; }
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
