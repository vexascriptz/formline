// Safe single-pass update of Formline's live Pip runtime and product-first guild layout.
// Keeps local server-side backups, verifies files, and leaves the existing index.js alone.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const KEY=process.env.DAKI_API_KEY;
if(!KEY||KEY.length<20)throw Error('DAKI_API_KEY missing');
const ORIGIN='https://portal.daki.cc';
const ROOT=ORIGIN+'/api/client/servers/ffe0e9f7';
const headers={Authorization:'Bearer '+KEY,Accept:'application/json','User-Agent':'Formline-Product-Layout-V2/1.0'};
const digest=x=>createHash('sha256').update(x).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function call(path,{method='GET',body,contentType}={}){
 const u=new URL(ROOT+path);
 if(u.origin!==ORIGIN)throw Error('Invalid API host');
 const r=await fetch(u,{method,headers:{...headers,...(contentType?{'Content-Type':contentType}:{})},body,redirect:'error',signal:AbortSignal.timeout(25000)});
 if(!r.ok)throw Error('Daki HTTP '+r.status+' at '+path.split('?')[0]);
 return r;
}
const fileParam=p=>encodeURIComponent('/'+p);
const read=async p=>(await call('/files/contents?file='+fileParam(p))).text();
async function write(p,t){await call('/files/write?file='+fileParam(p),{method:'POST',contentType:'text/plain',body:t})}
const status=async()=>((await (await call('/resources')).json()).attributes?.current_state);
const restart=async()=>call('/power',{method:'POST',contentType:'application/json',body:JSON.stringify({signal:'restart'})});
function syntax(code,ext){
 const d=mkdtempSync(join(tmpdir(),'formline-guild-'));
 try{
  const p=join(d,'test'+ext);writeFileSync(p,code,{mode:0o600});
  const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8',timeout:15000});
  if(r.status!==0)throw Error('Syntax check failed for '+ext);
 }finally{rmSync(d,{recursive:true,force:true})}
}
if(await status()!=='running')throw Error('Daki bot not running; refusing deployment');
const original=await read('pip-runtime.mjs');
const runtime=readFileSync('discord app/pip-runtime.mjs','utf8');
const layout=readFileSync('discord app/formline-layout-v2.mjs','utf8');
const cleanup=readFileSync('discord app/formline-community-cleanup.mjs','utf8');
const layoutV4=readFileSync('discord app/formline-community-layout-v4.mjs','utf8');
if(!original.includes('installPipRuntime')||!runtime.includes('installPipRuntime'))throw Error('Unexpected Pip runtime module');
if(!runtime.includes('arrangeFormline')||runtime.includes('function setupServer(guild)'))throw Error('Old channel auto-setup still present');
syntax(runtime,'.mjs');syntax(layout,'.mjs');syntax(cleanup,'.mjs');syntax(layoutV4,'.mjs');
const backups={runtime:'pip-runtime.mjs.before-formline-layout-v2-'+Date.now()+'.txt'};
let modified=false,restarted=false;
try{
 await write(backups.runtime,original);
 if(digest(await read(backups.runtime))!==digest(original))throw Error('Backup verification failed');
 await write('formline-layout-v2.mjs',layout);
 if(digest(await read('formline-layout-v2.mjs'))!==digest(layout))throw Error('Layout module upload mismatched');
 await write('formline-community-cleanup.mjs',cleanup);
 if(digest(await read('formline-community-cleanup.mjs'))!==digest(cleanup))throw Error('Cleanup module upload mismatched');
 await write('formline-community-layout-v4.mjs',layoutV4);
 if(digest(await read('formline-community-layout-v4.mjs'))!==digest(layoutV4))throw Error('Layout v4 upload mismatched');
 await write('pip-runtime.mjs',runtime);
 modified=true;
 if(digest(await read('pip-runtime.mjs'))!==digest(runtime))throw Error('Pip runtime upload mismatched');
 console.log('Original runtime backed up on Daki; previous generic channel auto-creation disabled.');
 const deploymentStarted=Date.now();
 restarted=true;await restart();
 let report;
 for(let i=0;i<70;i++){
  await sleep(3000);
  try{
   const r=JSON.parse(await read('pip-runtime-report.json'));
   if(r.generatedAt>=deploymentStarted&&r.installed&&r.layout?.version===2&&r.cleanup&&r.communityV4){report=r;break;}
   if(r.generatedAt>=deploymentStarted&&r.layout?.error)throw Error(r.layout.error);
  }catch(e){if(i===69)throw e;}
 }
 if(!report)throw Error('Layout report not found after bot restart');
 if(report.cleanup?.error||report.cleanup?.warnings?.length)throw Error('Community cleanup incomplete: '+JSON.stringify(report.cleanup).slice(0,300));
 if(report.communityV4?.warnings?.length)console.error('COMMUNITY V4 WARNINGS:',JSON.stringify(report.communityV4.warnings));
 if(report.communityV4?.error)console.error('COMMUNITY V4 ERROR:',report.communityV4.error);
 if(report.communityV4?.error||report.communityV4?.warnings?.length)throw Error('Community v4 incomplete; see warnings above');
 console.log('FORMLINE COMMUNITY CLEANUP:',JSON.stringify(report.cleanup));
 console.log('FORMLINE COMMUNITY V4:',JSON.stringify(report.communityV4));
 console.log('PIP ROTATING STATUSES:',JSON.stringify(report.rotatingCustomStatuses));
 console.log('FORMLINE LAYOUT V2 VERIFIED');
 console.log('GUILD:',report.layout.guildName);
 console.log('CREATED:',JSON.stringify(report.layout.created));
 console.log('RENAMED:',JSON.stringify(report.layout.renamed));
 console.log('MOVED:',JSON.stringify(report.layout.moved));
 console.log('GUIDES:',JSON.stringify(report.layout.posted));
 console.log('WARNINGS:',JSON.stringify(report.layout.warnings));
 console.log('PUBLIC CHANNELS:',JSON.stringify(report.layout.publicChannels));
 if(await status()!=='running')throw Error('Bot not running after community update');
 console.log('PIP RUNTIME: online');
}catch(e){
 console.error('Layout deployment could not be verified: '+String(e.message).slice(0,300));
 if(modified){
  try{
   await write('pip-runtime.mjs',original);
   if(digest(await read('pip-runtime.mjs'))!==digest(original))throw Error('Backup restore verification failed');
   if(restarted)await restart();
   console.log('Pip runtime source rolled back. Individual Discord changes were not reverted; see server audit.');
  }catch(re){console.error('URGENT: runtime rollback failed: '+String(re.message).slice(0,200));}
 }
 process.exitCode=1;
}
