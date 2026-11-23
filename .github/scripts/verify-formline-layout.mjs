// Read-only verification of the completed Formline layout and forum tag repair.
const key=process.env.DAKI_API_KEY;
const root='https://portal.daki.cc/api/client/servers/ffe0e9f7';
if(!key)throw Error('Daki secret missing.');
const headers={Authorization:'Bearer '+key,Accept:'application/json'};
async function get(path){
 const r=await fetch(root+path,{headers,signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!r.ok)throw Error('Daki HTTP '+r.status+' at '+path.split('?')[0]);
 return r;
}
async function read(name){return (await get('/files/contents?file='+encodeURIComponent('/'+name))).text()}
const sleep=t=>new Promise(r=>setTimeout(r,t));
let report,marker;
for(let i=0;i<16;i++){
 try{
  marker=JSON.parse(await read('formline-layout-v2.tags-applied'));
  report=JSON.parse(await read('pip-runtime-report.json'));
  if(marker.version===2&&report.layout?.version===2&&!report.layout?.warnings?.some(x=>x.includes('setFlags')))break;
 }catch{}
 if(i<15)await sleep(1500);
}
const status=(await (await get('/resources')).json()).attributes?.current_state;
console.log('Bot status:',status);
console.log('Tag repair marker:',marker?JSON.stringify({version:marker.version,createdAt:marker.createdAt}):'MISSING');
console.log('Layout report:',JSON.stringify({version:report?.layout?.version,prelaunch:report?.layout?.prelaunch,warnings:report?.layout?.warnings,posted:report?.layout?.posted?.length,created:report?.layout?.created?.length}));
if(!marker||report?.layout?.version!==2||report.layout?.warnings?.some(x=>x.includes('setFlags'))||status!=='running')throw Error('Layout/forum tag repair is not verified.');
console.log('VERIFIED: live layout updated and forum-tag repair completed without old flag-method warnings.');
