// Deploy only drop. to its dedicated Daki split. No access to Pip/Formline.
import fs from 'node:fs/promises';
const PANEL = 'https://portal.daki.cc';
const SERVER = 'bde2f0db';
const API = PANEL + '/api/client/servers/' + SERVER;
const KEY = process.env.DAKI_API_KEY;
if (!KEY) throw new Error('Missing DAKI_API_KEY GitHub secret');
const headers = {Authorization:'Bearer '+KEY, Accept:'Application/vnd.pterodactyl.v1+json'};
async function req(path, {method='GET', data, type='application/json'}={}) {
  const result = await fetch(API + path, {
    method, headers:{...headers,...(data===undefined?{}:{'Content-Type':type})}, body:data,
    redirect:'error', signal:AbortSignal.timeout(30000)
  });
  if (!result.ok) throw new Error(method+' '+path.split('?')[0]+' returned '+result.status);
  if(result.status===204) return {};
  const raw=await result.text();
  try{return JSON.parse(raw)}catch{return raw}
}
const details=(await req('')).attributes;
if(details?.identifier !== SERVER || details?.name !== 'drop-backend') {
  throw new Error('Refusing deployment: target is not the isolated drop-backend split.');
}
if(details.is_suspended || details.is_installing) throw new Error('Split is suspended or installing');
console.log('Verified target:',details.name,details.identifier);
const root = await req('/files/list?directory=%2F');
const names = (root.data||[]).map(x=>x.attributes?.name).filter(Boolean);
console.log('Existing root files:',names.join(', ')||'(empty)');
const paths=['app.py','requirements.txt','bootstrap_deno.py','install.sh'];
for(const path of paths) {
  const content = await fs.readFile(path, 'utf8');
  await req('/files/write?file='+encodeURIComponent('/'+path), {method:'POST',type:'text/plain',data:content});
  console.log('Uploaded', path, content.length, 'chars');
}
const state=(await req('/resources')).attributes?.current_state;
console.log('Previous state:',state);
if(state==='running' || state==='starting') {
  await req('/power',{method:'POST',data:JSON.stringify({signal:'restart'})});
  console.log('Restart requested');
} else {
  await req('/power',{method:'POST',data:JSON.stringify({signal:'start'})});
  console.log('Start requested');
}
console.log('DEPLOY_REQUESTED: review live startup state and health before claiming success.');
