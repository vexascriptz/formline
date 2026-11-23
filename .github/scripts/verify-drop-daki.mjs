// Verify the dedicated drop. Daki backend without changing anything.
const BASE='https://portal.daki.cc/api/client/servers/bde2f0db';
const headers={Authorization:'Bearer '+process.env.DAKI_API_KEY,Accept:'Application/vnd.pterodactyl.v1+json'};
async function get(path){
 const r=await fetch(BASE+path,{headers,signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!r.ok)throw Error(path+' returned HTTP '+r.status);
 return r.json();
}
const info=(await get('')).attributes;
if(info?.identifier!=='bde2f0db' || info?.name!=='drop-backend')throw Error('Wrong Daki split; stopping');
const resources=(await get('/resources')).attributes;
console.log('Server:',info.name);
console.log('Power state:',resources?.current_state);
console.log('RAM MB:',Math.round((resources?.resources?.memory_bytes||0)/1048576));
console.log('Disk MB:',Math.round((resources?.resources?.disk_bytes||0)/1048576));
const files=(await get('/files/list?directory=%2F')).data||[];
console.log('Files deployed:',files.map(x=>x.attributes?.name).filter(Boolean).join(', '));
const startup=await get('/startup');
console.log('Startup command:',String(startup.meta?.startup_command||'(not given)').replace(/[A-Za-z0-9_\-]{24,}/g,'[redacted]').slice(0,180));
const allocations=(await get('/network/allocations')).data||[];
for(const a of allocations) {
 const x=a.attributes||{};
 const host=x.ip_alias||x.ip;
 const port=x.port;
 if(!host||!port)continue;
 const url='http://'+host+':'+port+'/health';
 try {
  const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(6000)});
  const body=await r.json().catch(()=>({}));
  console.log('HTTP health status:',r.status,body?.service==='drop.'&&body?.ok===true?'drop. healthy':'unexpected response');
  if(r.ok&&body?.service==='drop.'&&body?.ok===true)break;
 } catch(e){console.log('HTTP health:',e.name==='TimeoutError'?'timed out':'unreachable');}
}

console.log('Checking auto-session without recording credentials.');
for(const scheme of ['https','http']) {
 const u=scheme+'://paid8.daki.cc:4261';
 try {
  const h=await fetch(u+'/health',{signal:AbortSignal.timeout(4500),redirect:'error'});
  const health=await h.json().catch(()=>({}));
  console.log('Public '+scheme+' health:',h.status,health?.ok===true&&health?.service==='drop.'?'drop OK':'unexpected');
  if(!h.ok||health?.ok!==true) continue;
  const ses=await fetch(u+'/api/guest/session',{method:'POST',signal:AbortSignal.timeout(4500),redirect:'error'});
  const j=await ses.json().catch(()=>({}));
  console.log('Automatic guest session:',ses.status,typeof j?.token==='string'&&j.token.length>20?'working':'unavailable');
  if(ses.ok&&typeof j?.token==='string'&&j.token.length>20)break;
 }catch(e){console.log('Public '+scheme+' endpoint:',e.name==='TimeoutError'?'timeout':'unreachable');}
}
