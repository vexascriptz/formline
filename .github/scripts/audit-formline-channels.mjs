// Read-only Discord server layout inspection via Pip's existing Discord connection.
// The temporary runtime edit only adds a channel metadata report; no Discord changes.
const key=process.env.DAKI_API_KEY;
const root='https://portal.daki.cc/api/client/servers/ffe0e9f7';
if(!key)throw Error('DAKI_API_KEY missing');
const header={Authorization:'Bearer '+key,Accept:'application/json'};
async function req(path,{method='GET',body,contentType}={}){
 const r=await fetch(root+path,{method,headers:{...header,...(contentType?{'Content-Type':contentType}:{})},body,signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Daki HTTP '+r.status+' at '+path.split('?')[0]);
 return r;
}
const read=async p=>(await req('/files/contents?file='+encodeURIComponent('/'+p))).text();
const write=(p,s)=>req('/files/write?file='+encodeURIComponent('/'+p),{method:'POST',contentType:'text/plain',body:s});
const code=await read('pip-runtime.mjs');
const anchor='  report(summary);';
if(!code.includes(anchor))throw Error('Unexpected runtime source; stopped');
const additional="  if(guild){await guild.channels.fetch();summary.layout=[...guild.channels.cache.values()].filter(x=>!x.isThread?.()).map(x=>({name:x.name,type:x.type,id:x.id,parent:x.parent?.name||null,topic:(x.topic||'').slice(0,140),tags:(x.availableTags||[]).map(t=>t.name)}));}\n";
const patched=code.replace(anchor,additional+anchor);
if(!patched.includes('summary.layout='))throw Error('Patch not applied.');
await write('pip-runtime.mjs.audit-backup-'+Date.now()+'.txt',code);
await write('pip-runtime.mjs',patched);
await req('/power',{method:'POST',body:JSON.stringify({signal:'restart'}),contentType:'application/json'});
let layout;
for(let i=0;i<15;i++){
 await new Promise(r=>setTimeout(r,2000));
 try{const v=JSON.parse(await read('pip-runtime-report.json'));if(v.layout?.length){layout=v;break;}}catch{}
}
if(!layout)throw Error('Server layout report not generated.');
console.log('SERVER:',layout.server?.guildName||layout.server?.name||'Formline', 'CHANNELS:',layout.layout.length);
for(const row of layout.layout.sort((a,b)=>(a.parent||'').localeCompare(b.parent||'')||a.type-b.type))console.log(JSON.stringify({name:row.name,type:row.type,parent:row.parent,tags:row.tags,topic:row.topic}));
