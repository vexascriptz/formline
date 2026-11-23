// Find and update obsolete Discord invites in deployable Daki bot files.
// Keep backups, skip secrets and dependencies, and never print source contents.
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const KEY=process.env.DAKI_API_KEY;
const ORIGIN='https://portal.daki.cc';
const SERVER='ffe0e9f7';
const root=ORIGIN+'/api/client/servers/'+SERVER;
const OLD='YKKB8vebKu',NEW='3EuqCaRcCY';
if(!KEY||KEY.length<20)throw Error('Daki API key missing');
const h={Authorization:'Bearer '+KEY,Accept:'application/json','User-Agent':'Formline-Invite-Update/1.0'};
const digest=x=>createHash('sha256').update(x).digest('hex');
async function call(path,options={}){
 const url=new URL(root+path);
 if(url.origin!==ORIGIN)throw Error('Unexpected host');
 const r=await fetch(url,{...options,headers:{...h,...options.headers},redirect:'error',signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw Error('Daki returned HTTP '+r.status+' at '+path.split('?')[0]);
 return r;
}
const contentPath=path=>'/files/contents?file='+encodeURIComponent(path);
const writePath=path=>'/files/write?file='+encodeURIComponent(path);
async function readFile(path){return (await call(contentPath(path))).text()}
async function writeFile(path,data){await call(writePath(path),{method:'POST',headers:{'Content-Type':'text/plain'},body:data})}
const candidates=[];
async function list(dir,level=0){
 const j=await (await call('/files/list?directory='+encodeURIComponent(dir))).json();
 for(const item of j.data||[]){
  const a=item.attributes||{};
  const name=String(a.name||'');
  if(!name||name.startsWith('.')||/node_modules|cache|backup|before-|package-lock|pip-runtime-report/i.test(name))continue;
  const path=(dir==='/'?'':dir)+'/'+name;
  if(!a.is_file&&level<2){await list(path,level+1);continue;}
  if(a.is_file&&/\.(?:js|cjs|mjs|json|html|md)$/i.test(name)&&Number(a.size||0)<250000)candidates.push(path);
  if(candidates.length>90)throw Error('Too many candidate files; refusing broad scan');
 }
}
function checkSyntax(filename,source){
 if(!/\.(?:js|mjs|cjs)$/i.test(filename))return;
 const dir=mkdtempSync(join(tmpdir(),'formline-invite-'));
 try{
  const temp=join(dir,'code'+(filename.endsWith('.mjs')?'.mjs':'.cjs'));
  writeFileSync(temp,source,{mode:0o600});
  const chk=spawnSync(process.execPath,['--check',temp],{timeout:10000,encoding:'utf8'});
  if(chk.status!==0)throw Error('Syntax check failed for '+filename);
 }finally{rmSync(dir,{recursive:true,force:true})}
}
await list('/');
const updates=[];
for(const filename of candidates){
 const source=await readFile(filename);
 if(!source.includes(OLD))continue;
 const updated=source.replaceAll(OLD,NEW);
 checkSyntax(filename,updated);
 const backup=filename+'.invite-backup-'+Date.now()+'.txt';
 await writeFile(backup,source);
 if(digest(await readFile(backup))!==digest(source))throw Error('Backup verification failed for '+filename);
 try{
  await writeFile(filename,updated);
  if(digest(await readFile(filename))!==digest(updated))throw Error('Update verification failed for '+filename);
  updates.push(filename);
 }catch(e){
  await writeFile(filename,source);
  throw e;
 }
}
if(updates.includes('/index.js')){
 await call('/power',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({signal:'restart'})});
}
console.log('DAKI INVITE SWEEP: inspected '+candidates.length+' source files');
console.log('Changed:',JSON.stringify(updates));
console.log('Ignored backups, dependencies, and secret files.');
for(const url of [
 'https://formline-beta.formline-app-d6e2.workers.dev/',
 'https://formline-discord.formline-app-d6e2.workers.dev/health'
]){
 try{
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(12000)});
  const text=await response.text();
  console.log('LIVE ENDPOINT:',new URL(url).hostname,'HTTP',response.status,'oldInviteFound',text.includes(OLD),'newInviteFound',text.includes(NEW));
 }catch(e){console.log('LIVE ENDPOINT:',new URL(url).hostname,'could not verify from runner:',String(e.message).slice(0,90))}
}
