/** Deploy Pip's nickname-guard add-on without publishing the live bot's code. */
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const api='https://portal.daki.cc/api/client/servers/ffe0e9f7';
const key=process.env.DAKI_API_KEY;
if(!key || key.length<20) throw Error('DAKI_API_KEY secret missing.');
const headers={Authorization:'Bearer '+key,Accept:'application/json','User-Agent':'Formline-Pip-Safe-Deploy/1.0'};
const hash=t=>createHash('sha256').update(t).digest('hex');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(path,{method='GET',body,contentType}={}){
  if(!path.startsWith('/'))throw Error('Path must be local to the Daki server API.');
  const url=new URL(api+path);
  if(url.origin!=='https://portal.daki.cc')throw Error('Unexpected API host.');
  const response=await fetch(url,{method,headers:{...headers,...(contentType?{'Content-Type':contentType}:{})},body,redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(method+' '+path.split('?')[0]+' returned HTTP '+response.status);
  return response;
}
const remoteFile=(name)=>'/files/contents?file='+encodeURIComponent('/'+name);
const writeRoute=(name)=>'/files/write?file='+encodeURIComponent('/'+name);
async function readRemote(name){return (await request(remoteFile(name))).text();}
async function writeRemote(name,text){await request(writeRoute(name),{method:'POST',body:text,contentType:'text/plain'});}
async function state(){const o=await (await request('/resources')).json();return o?.attributes?.current_state||'unknown';}
async function restart(){await request('/power',{method:'POST',body:JSON.stringify({signal:'restart'}),contentType:'application/json'});}
function syntaxCheck(code,extension){
  const dir=mkdtempSync(join(tmpdir(),'pip-deploy-'));
  const file=join(dir,'check'+extension);
  try{
    writeFileSync(file,code,{mode:0o600});
    const check=spawnSync(process.execPath,['--check',file],{encoding:'utf8',timeout:10000});
    if(check.status!==0)throw Error('Syntax check failed for '+extension+' (source withheld).');
  }finally{rmSync(dir,{recursive:true,force:true});}
}

const suffix='\n// FORMLINE:PIP-NICKNAME-GUARD:BEGIN\n'
+"import('./pip-nickname-guard.mjs').then(({ installPipNicknameGuard }) => {\n"
+"  installPipNicknameGuard(client, {\n"
+"    nickname: 'pip',\n"
+"    notifyEditors: true,\n"
+"    disabledGuildIds: (process.env.PIP_NICKNAME_EXEMPT_GUILDS || '').split(',').map(s => s.trim()).filter(Boolean),\n"
+"  });\n"
+"}).catch(error => console.error('[Pip Nickname] Could not initialize:', error?.message));\n"
+'// FORMLINE:PIP-NICKNAME-GUARD:END\n';

async function main(){
  console.log('Pip nickname guard: starting safe deployment');
  const was=await state();
  if(was!=='running')throw Error('Daki server is not running ('+was+'); refusing to change files.');
  const pkg=JSON.parse(await readRemote('package.json'));
  if(!String(pkg.dependencies?.['discord.js']||'').includes('14'))throw Error('Incompatible discord.js runtime.');
  const original=await readRemote('index.js');
  const module=readFileSync('discord app/pip-nickname-guard.mjs','utf8');
  if(!/\b(?:const|let|var)\s+client\s*=\s*new\s+(?:discord\.)?Client\s*\(/.test(original) || !/\bclient\.login\s*\(/.test(original)){
    throw Error('Unexpected live index.js structure: deployment refused.');
  }
  const already=original.includes('// FORMLINE:PIP-NICKNAME-GUARD:BEGIN');
  const patched=already?original:original.trimEnd()+'\n'+suffix;
  syntaxCheck(module,'.mjs');
  syntaxCheck(patched,'.cjs');
  // Snapshot backup stays on Daki; never uploaded to the public repository or actions logs.
  const backup='index.js.pip-backup-'+Date.now()+'.txt';
  let modifiedIndex=false;
  let startedRestart=false;
  try{
    await writeRemote(backup,original);
    if(hash(await readRemote(backup))!==hash(original))throw Error('Backup verification failed.');
    await writeRemote('pip-nickname-guard.mjs',module);
    if(hash(await readRemote('pip-nickname-guard.mjs'))!==hash(module))throw Error('Module upload verification failed.');
    if(patched!==original){
      modifiedIndex=true;
      await writeRemote('index.js',patched);
      if(hash(await readRemote('index.js'))!==hash(patched))throw Error('Patched index verification failed.');
    }
    console.log('Uploaded guard and verified hashes. Daki backup: '+backup);
    startedRestart=true;
    await restart();
    let online=false;
    for(let i=0;i<6;i++){
      await wait(4000);
      if(await state()==='running'){
        await wait(3000);
        if(await state()==='running'){online=true;break;}
      }
    }
    if(!online)throw Error('Server did not become stable after restart.');
    console.log('DAKI DEPLOY: SUCCESS. Server running after restart.');
    console.log('Pip nickname guard is installed. Confirm Discord Gateway event handling in your test guild.');
  }catch(error){
    console.error('Deployment failed: '+error.message);
    if(modifiedIndex){
      try{
        await writeRemote('index.js',original);
        if(hash(await readRemote('index.js'))!==hash(original))throw Error('Rollback verification failed');
        console.log('Restored original index.js from in-memory copy.');
        if(startedRestart){await restart();console.log('Attempted rollback restart.');}
      }catch(rollbackError){console.error('URGENT: automatic rollback failed: '+rollbackError.message+'; backup is '+backup);}
    }
    process.exitCode=1;
  }
}
await main();
