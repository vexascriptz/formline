// One-time safe replacement of the old nickname lock with Pip's lighter runtime.
// Preserves the existing Daki bot; never reads or prints any bot credentials.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const KEY = process.env.DAKI_API_KEY;
const ROOT = 'https://portal.daki.cc/api/client/servers/ffe0e9f7';
if (!KEY || KEY.length < 20) throw Error('DAKI_API_KEY is missing.');
const headers = { Authorization:'Bearer '+KEY, Accept:'application/json', 'User-Agent':'Formline-Pip-Runtime/2.0' };
const sum = s => createHash('sha256').update(s).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r,ms));
async function call(path,{method='GET',body,contentType}={}) {
  const url = new URL(ROOT+path);
  if(url.origin!=='https://portal.daki.cc')throw Error('Unexpected API host');
  const result = await fetch(url,{method,headers:{...headers,...(contentType?{'Content-Type':contentType}:{})},body,signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!result.ok)throw Error('Daki HTTP '+result.status+' for '+path.split('?')[0]);
  return result;
}
async function read(name) { return (await call('/files/contents?file='+encodeURIComponent('/'+name))).text(); }
async function write(name,source) { await call('/files/write?file='+encodeURIComponent('/'+name),{method:'POST',body:source,contentType:'text/plain'}); }
async function status() { return (await (await call('/resources')).json()).attributes?.current_state; }
async function restart() { await call('/power',{method:'POST',body:JSON.stringify({signal:'restart'}),contentType:'application/json'}); }
function checkSyntax(code,extension) {
  const dir=mkdtempSync(join(tmpdir(),'formline-'));
  try{
    const name=join(dir,'check'+extension);
    writeFileSync(name,code,{mode:0o600});
    const r=spawnSync(process.execPath,['--check',name],{encoding:'utf8',timeout:10000});
    if(r.status!==0)throw Error('Syntax verification failed for '+extension+' (source withheld).');
  }finally{rmSync(dir,{recursive:true,force:true});}
}
const oldBegin='// FORMLINE:PIP-NICKNAME-GUARD:BEGIN';
const oldEnd='// FORMLINE:PIP-NICKNAME-GUARD:END';
const newBegin='// FORMLINE:PIP-RUNTIME:BEGIN';
const newEnd='// FORMLINE:PIP-RUNTIME:END';
const newHook='\n'+newBegin+'\n'+
"import('./pip-runtime.mjs').then(({ installPipRuntime }) => {\n"+
"  installPipRuntime(client);\n"+
"}).catch(error => console.error('[Pip] Runtime could not initialize:', error?.message));\n"+
newEnd+'\n';

async function main() {
  console.log('Replacing nickname guard with Pip startup nickname and rotating status.');
  const initial=await status();
  if(initial!=='running')throw Error('Bot is not running; no changes made.');
  const original=await read('index.js');
  const moduleCode=readFileSync('discord app/pip-runtime.mjs','utf8');
  const pkg=JSON.parse(await read('package.json'));
  if(!String(pkg.dependencies?.['discord.js']||'').includes('14'))throw Error('Unexpected Discord.js major version.');
  if(!/\bclient\.login\s*\(/.test(original))throw Error('Unexpected bot startup source; no changes made.');
  let updated=original;
  const hasOld=updated.includes(oldBegin),hasNew=updated.includes(newBegin);
  if(hasOld) {
    const a=updated.indexOf(oldBegin),b=updated.indexOf(oldEnd);
    if(b<=a)throw Error('Nickname guard markers incomplete');
    updated=updated.slice(0,a)+updated.slice(b+oldEnd.length);
  }
  if(!hasNew)updated=updated.trimEnd()+'\n'+newHook;
  if(updated.includes('pip-nickname-guard.mjs'))throw Error('Old guard import remains; aborting to prevent duplicate handlers.');
  checkSyntax(moduleCode,'.mjs');checkSyntax(updated,'.cjs');
  const backup='index.js.before-pip-runtime-'+Date.now()+'.txt';
  let modified=false,attemptedRestart=false;
  try {
    await write(backup,original);
    if(sum(await read(backup))!==sum(original))throw Error('Server-side backup verification failed.');
    await write('pip-runtime.mjs',moduleCode);
    if(sum(await read('pip-runtime.mjs'))!==sum(moduleCode))throw Error('Module upload verification failed.');
    await write('index.js',updated);modified=true;
    if(sum(await read('index.js'))!==sum(updated))throw Error('Bot index file verification failed.');
    console.log('Original index.js backed up on Daki as '+backup);
    attemptedRestart=true;await restart();
    let running=false;
    for(let i=0;i<10;i++){await sleep(3000);if(await status()==='running'){running=true;break;}}
    if(!running)throw Error('Server did not restart successfully.');
    let report;
    for(let i=0;i<12;i++){
      await sleep(3000);
      try{
        const t=await read('pip-runtime-report.json');
        const v=JSON.parse(t);
        if(v.installed===true&&v.nicknameMode==='join-and-start-only'){report=v;break;}
      }catch{}
    }
    if(!report)throw Error('Pip runtime startup could not be verified.');
    console.log('PIP RUNTIME DEPLOYED: old nickname lock removed; presence rotation active.');
    console.log('ADDED COMMANDS:',JSON.stringify(report.commands));
    console.log('COMMUNITY SETUP:',JSON.stringify(report.server));
  } catch (error) {
    console.error('Deployment failed: '+error.message);
    if(modified){
      try{
        await write('index.js',original);
        if(sum(await read('index.js'))!==sum(original))throw Error('Rollback verification failed');
        if(attemptedRestart)await restart();
        console.log('Restored original bot index.js from backup.');
      }catch(e){console.error('URGENT: automatic rollback failed: '+e.message+'; backup '+backup);}
    }
    process.exitCode=1;
  }
}
await main();
