'use strict';
const $ = id => document.getElementById(id);
const MP4=[['1080','1080p'],['720','720p'],['480','480p'],['360','360p']];
const MP3=[['320','320 kbps'],['192','192 kbps'],['128','128 kbps']];
let format='mp4', videoId='', state={};
const send = (type, rest={}) => chrome.runtime.sendMessage({type,...rest}).then(r=>{if (!r.ok) throw Error(r.error||'Unknown error'); return r.data;});
const status = (message, kind='') => { $('status').textContent=message; $('status').className='status '+kind; };
const settingsStatus = (message,kind='') => { $('settingsStatus').textContent=message; $('settingsStatus').className='status '+kind; };

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
  $('download').disabled=!videoId||!state.token;
  if(!videoId)return;
  $('videoTitle').textContent=tab?.title?.replace(/\s*[-–]\s*YouTube\s*$/i,'') || 'Current video';
  $('thumbnail').src='https://i.ytimg.com/vi/'+videoId+'/mqdefault.jpg';
  if(!state.token)status('Tap settings to connect your server.');
  else status(state.jobs?.length ? `${state.jobs.length} download(s) running in background` : 'Ready when you are.');
}
function showSettings(){
  $('settingsPane').classList.remove('hidden'); $('mainPane').classList.add('hidden');
  $('server').value=state.server||'';
  $('disconnect').classList.toggle('hidden',!state.token);
  $('pairCode').value=''; $('settingsBtn').setAttribute('aria-label','Back to downloads');
}
function showMain(){
  $('mainPane').classList.remove('hidden'); $('settingsPane').classList.add('hidden');
  $('settingsBtn').setAttribute('aria-label','Server settings'); initVideo();
}
$('settingsBtn').addEventListener('click',()=> $('settingsPane').classList.contains('hidden')?showSettings():showMain());
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
  finally{$('download').disabled=!videoId||!state.token;}
});
$('connect').addEventListener('click',async()=>{
  $('connect').disabled=true;settingsStatus('Connecting…');
  try{
    const origin=new URL($('server').value.trim()).origin;
    // Request only the one server permission the user explicitly selected.
    const u=new URL(origin);
    const allowed=await chrome.permissions.request({origins:[u.protocol+'//'+u.hostname+'/*']});
    if(!allowed)throw Error('Permission to contact this server was denied.');
    await send('pair',{server:$('server').value,code:$('pairCode').value});
    state=await send('getState'); settingsStatus('Connected','success');
    setTimeout(showMain,550);
  }catch(e){settingsStatus(e.message,'error');}
  finally{$('connect').disabled=false;}
});
$('disconnect').addEventListener('click',async()=>{
  await send('disconnect');state=await send('getState');showMain();
});
(async()=>{
  state=await send('getState');
  setFormat((await chrome.storage.local.get('preferredFormat')).preferredFormat==='mp3'?'mp3':'mp4');
  await initVideo();
  if(!state.token) showSettings();
  if(state.lastResult && Date.now()-state.lastResult.at<180000 && state.token){status(state.lastResult.message,state.lastResult.type);}
  if(state.jobs?.length){send('check').then(async()=>{state=await send('getState');if(state.jobs.length)status(`${state.jobs.length} download(s) processing`);else if(state.lastResult)status(state.lastResult.message,state.lastResult.type);}).catch(()=>{});}
})().catch(e=>status(e.message,'error'));
