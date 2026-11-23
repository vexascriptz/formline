// Pip: Formline's Discord helper (discord.js v14).
// Set server nickname only at join/start, never lock or DM renamers.
// Rotate presence; keep existing global commands; optionally apply one-time server design.

import {existsSync,writeFileSync} from 'node:fs';

const GUILD='1391162919353319505';
export const PIP_STATUSES=[
 {name:'over Formline apps',type:3},
 {name:'little things come together',type:0},
 {name:'new creations',type:3},
 {name:'the Formline community',type:2}
];
export const PIP_COMMANDS=[
 {name:'pip',description:'Meet Pip and explore Formline'},
 {name:'apps',description:'Explore the Formline app lineup'},
 {name:'updates',description:'Find the latest Formline development updates'},
 {name:'community',description:'Find the Formline Discord community'},
 {name:'feedback',description:'Send feedback or report an issue'}
];
const errorText=e=>String(e?.message||e).replace(/https?:\/\/\S+/g,'[link]').slice(0,150);
const saveReport=x=>{
 try{writeFileSync('pip-runtime-report.json',JSON.stringify(x,null,2),{mode:0o600});}
 catch(e){console.warn('[Pip] Could not save runtime report: '+errorText(e));}
};
async function setNickname(client,guild){
 try{
  const me=await guild.members.fetchMe();
  if(me.nickname!=='pip')await client.rest.patch('/guilds/'+guild.id+'/members/@me',{body:{nick:'pip'}});
 }catch(e){console.warn('[Pip] Could not set nickname in '+guild.id+': '+errorText(e));}
}
async function registerCommands(client){
 try{
  const current=await client.application.commands.fetch(),names=new Set(current.map(x=>x.name)),added=[];
  for(const c of PIP_COMMANDS)if(!names.has(c.name)){
   await client.application.commands.create({...c,type:1,integrationTypes:[0,1],contexts:[0,1,2]});
   added.push(c.name);
  }
  return{added,registered:PIP_COMMANDS.length};
 }catch(e){return{error:errorText(e)};}
}
export function installPipRuntime(client){
 if(!client?.on||!client?.guilds?.cache||!client?.rest?.patch)throw Error('discord.js v14 client required');
 let interval,started=false,index=0;
 const rotate=()=>{
  const activity=PIP_STATUSES[index++%PIP_STATUSES.length];
  try{client.user?.setPresence({status:'online',activities:[activity]});}
  catch(e){console.warn('[Pip] Presence failed: '+errorText(e));}
 };
 const onJoin=g=>{void setNickname(client,g);};
 const onReady=async()=>{
  if(started)return;started=true;
  rotate();interval=setInterval(rotate,300_000);interval.unref?.();
  for(const guild of client.guilds.cache.values())void setNickname(client,guild);
  const summary={installed:true,nicknameMode:'join-and-start-only',rotatingStatuses:PIP_STATUSES.length,commands:await registerCommands(client),layout:null};
  const guild=client.guilds.cache.get(GUILD);
  if(!guild){summary.layout={error:'Formline Studios is not in the connected guild cache.'};}
  else if(!existsSync('formline-layout-v2.tags-applied')){
   try{
    const {arrangeFormline}=await import('./formline-layout-v2.mjs');
    summary.layout=await arrangeFormline(client,guild);
    writeFileSync('formline-layout-v2.tags-applied',JSON.stringify({guildId:GUILD,version:2,createdAt:new Date().toISOString()}),{mode:0o600});
    console.log('[Pip] Formline layout v2 applied, '+summary.layout.created.length+' new channels/categories and '+summary.layout.warnings.length+' warnings.');
   }catch(e){
    summary.layout={error:errorText(e)};
    console.error('[Pip] Formline layout v2 could not complete: '+errorText(e));
   }
  }else{summary.layout={version:2,alreadyApplied:true};}
  saveReport(summary);
 };
 client.on('guildCreate',onJoin);client.on('ready',onReady);
 if(client.isReady?.())void onReady();
 return{stop(){if(interval)clearInterval(interval);client.off('guildCreate',onJoin);client.off('ready',onReady);}};
}
