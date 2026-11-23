// drop. tiny build. Shared by the service worker and popup; only the relevant half executes.
if (typeof document === "undefined") {
'use strict';

const ALARM = 'drop-check-downloads';
const POLL_INTERVAL_MIN = 0.5;
const SERVER = 'http://paid8.daki.cc:4261';
// Purple toolbar icon, generated at runtime to avoid shipping image files.
try {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(32, 32), ctx = canvas.getContext('2d');
    ctx.fillStyle = '#171020'; ctx.fillRect(0,0,32,32);
    ctx.fillStyle = '#ad85ff'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('↓',16,26);
    chrome.action.setIcon({imageData: ctx.getImageData(0,0,32,32)}).catch(()=>{});
  }
} catch (_) { /* Chrome can use its standard extension icon instead. */ }

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
} else {
'use strict';
const $ = id => document.getElementById(id);
const MP4=[['1080','1080p'],['720','720p'],['480','480p'],['360','360p']];
const MP3=[['320','320 kbps'],['192','192 kbps'],['128','128 kbps']];
let format='mp4', videoId='', state={};
const send = (type, rest={}) => chrome.runtime.sendMessage({type,...rest}).then(r=>{if (!r.ok) throw Error(r.error||'Unknown error'); return r.data;});
const status = (message, kind='') => { $('status').textContent=message; $('status').className='status '+kind; };

function setFormat(value){
  format=value;
  $('mp4').classList.toggle('selected',format==='mp4');
  $('mp3').classList.toggle('selected',format==='mp3');
  $('downloadText').textContent=`Download ${format.toUpperCase()}`;
  $('quality').replaceChildren(...(format==='mp4'?MP4:MP3).map(([value,name])=>new Option(name,value)));
  $('quality').value= format==='mp4'?'720':'192';
  chrome.storage.local.set({preferredFormat:format});
}
function getVideoId(raw){
  try { const url=new URL(raw); const host=url.hostname.toLowerCase();
    if(host==='youtu.be')return url.pathname.slice(1).match(/^[\w-]{11}$/)?.[0]||'';
    if(!['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(host)) return '';
    const id=url.searchParams.get('v'); return /^[\w-]{11}$/.test(id||'')?id:'';
  } catch {return '';}
}
async function initVideo(){
  const tabs=await chrome.tabs.query({active:true,currentWindow:true});
  const tab=tabs[0]; videoId=getVideoId(tab?.url||'');
  $('media').classList.toggle('hidden',!videoId);
  $('empty').classList.toggle('hidden',!!videoId);
  $('downloadControls').classList.toggle('hidden',!videoId);
  $('download').disabled=!videoId;
  if(!videoId)return;
  $('videoTitle').textContent=tab?.title?.replace(/\s*[-–]\s*YouTube\s*$/i,'') || 'Current video';
  $('thumbnail').src='https://i.ytimg.com/vi/'+videoId+'/mqdefault.jpg';
  status(state.jobs?.length ? `${state.jobs.length} download(s) running in background` : 'Ready when you are.');
}
$('mp4').addEventListener('click',()=>setFormat('mp4'));
$('mp3').addEventListener('click',()=>setFormat('mp3'));
$('download').addEventListener('click',async()=>{
  $('download').disabled=true;
  status('Sending to Daki…');
  try{
    await send('download',{videoId,format,quality:$('quality').value});
    status('Queued. You can close drop.','success');
    state=await send('getState');
  }catch(e){status(e.message,'error');}
  finally{$('download').disabled=!videoId;}
});
(async()=>{
  state=await send('getState');
  setFormat((await chrome.storage.local.get('preferredFormat')).preferredFormat==='mp3'?'mp3':'mp4');
  await initVideo();
  if(state.lastResult && Date.now()-state.lastResult.at<180000){status(state.lastResult.message,state.lastResult.type);}
  if(state.jobs?.length){send('check').then(async()=>{state=await send('getState');if(state.jobs.length)status(`${state.jobs.length} download(s) processing`);else if(state.lastResult)status(state.lastResult.message,state.lastResult.type);}).catch(()=>{});}
})().catch(e=>status(e.message,'error'));
}
