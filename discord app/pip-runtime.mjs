// Pip: Formline's Discord helper (discord.js v14).
// Set server nickname only at join/start, never lock or DM renamers.
// Rotate short custom statuses; preserve commands and apply non-destructive layout migration.

import {existsSync,writeFileSync} from 'node:fs';

const GUILD='1391162919353319505';
export const PIP_STATUSES=[
 {name:'Custom Status',type:4,state:'here for the little things'},
 {name:'Custom Status',type:4,state:'making things feel simple'},
 {name:'Custom Status',type:4,state:'a little help, always'},
 {name:'Custom Status',type:4,state:'keeping Formline cozy'}
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
// Formline v4: concise public layout and non-destructive internal archive.
// Move existing channels, keep messages, and verify ordering/visibility.
const GUILD_V4='1391162919353319505';
const MARKER_V4='formline-community-v4.applied';
const CATEGORY_ORDER=['FORMLINE','APPS','COMMUNITY','SUPPORT','INTERNAL'];
const PUBLIC={
 FORMLINE:['start-here','announcements','rules'],
 APPS:['discord','pip-bot'],
 COMMUNITY:['general','showcase','off-topic','lounge'],
 SUPPORT:['support','suggestions','bug-reports']
};
const INTERNAL=['experiments','devlog','roadmap','previews','releases','app-index'];
const TOPICS={
 'start-here':'Welcome to Formline Studios. Find our apps, chat and get help. Public downloads are not yet available.',
 announcements:'Official Formline announcements. No unfinished website or download links.',
 discord:'Formline for Discord — discuss the toolkit and give feedback.',
 'pip-bot':'Pip, the Formline Discord helper. Questions and suggestions welcome.',
 general:'Talk with the Formline community.',
 showcase:'Share things you have made.',
 support:'Get help with Formline apps. Never post activation codes or tokens.',
 suggestions:'Ideas and requests for Formline products.',
 'bug-reports':'Report an issue with clear reproduction steps and your app version.'
};
const find=(guild,name)=>guild.channels.cache.find(c=>c.name.toLowerCase()===name.toLowerCase());
const safe=e=>String(e?.message||e).slice(0,150);
export async function applyFormlineCommunityV4(client){
 if(existsSync(MARKER_V4))return {version:4,alreadyApplied:true,warnings:[]};
 const guild=client.guilds.cache.get(GUILD_V4);
 if(!guild)throw Error('Formline Studios guild missing');
 await guild.channels.fetch();
 const changes=[],warnings=[];
 const attempt=async(label,fn)=>{try{await fn();changes.push(label);}catch(e){warnings.push(label+': '+safe(e));}};
 let internal=find(guild,'INTERNAL');
 if(!internal){
  try{internal=await guild.channels.create({name:'INTERNAL',type:4,permissionOverwrites:[{id:guild.id,deny:['ViewChannel']}],reason:'Private Formline archive'});changes.push('Create INTERNAL');}
  catch(e){warnings.push('Create INTERNAL: '+safe(e));}
 }
 if(!internal)throw Error('Cannot establish private archive category');
 await attempt('Lock INTERNAL category',()=>internal.permissionOverwrites.edit(guild.roles.everyone,{ViewChannel:false}));
 // Only archive existing channels. Do not create speculative channels.
 for(const name of INTERNAL){
  let ch=find(guild,name);
  if(!ch)continue;
  // Hide before moving so public users cannot see internal content during migration.
  await attempt('Hide '+name,()=>ch.permissionOverwrites.edit(guild.roles.everyone,{ViewChannel:false}));
  if(ch.parentId!==internal.id)await attempt('Archive '+name,()=>ch.setParent(internal.id,{lockPermissions:false,reason:'Move internal material out of public navigation'}));
 }
 // Put public channels into concise categories. Preserve their other overwrites.
 for(const [categoryName,names] of Object.entries(PUBLIC)){
  let parent=find(guild,categoryName);
  if((!parent||parent.type!==4)&&categoryName==='SUPPORT'){
   const alternative=find(guild,'HELP');
   if(alternative?.type===4){await attempt('Rename HELP to SUPPORT',()=>alternative.edit({name:'SUPPORT'}));parent=find(guild,'SUPPORT')||alternative;}
   else{try{parent=await guild.channels.create({name:'SUPPORT',type:4,reason:'Restore public support category'});changes.push('Create SUPPORT');}catch(e){warnings.push('Create SUPPORT: '+safe(e));}}
  }
  if(!parent||parent.type!==4){warnings.push('Missing category '+categoryName);continue;}
  for(const name of names){
   let ch=find(guild,name);
   if(!ch){warnings.push('Missing existing channel '+name);continue;}
   if(ch.parentId!==parent.id)await attempt('Move '+name,()=>ch.setParent(parent.id,{lockPermissions:false}));
   if(TOPICS[name]&&ch.topic!==TOPICS[name]&&ch.edit)await attempt('Topic '+name,()=>ch.edit({topic:TOPICS[name]}));
  }
 }
 // Replace only the bot's old introductory guide containing private references.
 const intro=find(guild,'start-here');
 if(intro?.messages?.fetch){
  await attempt('Refresh public introduction',async()=>{
   const messages=await intro.messages.fetch({limit:80});
   const old=[...messages.values()].filter(m=>m.author?.id===client.user.id&&m.content?.includes('FORMLINE GUIDE: start-here'));
   const channel=n=>{const c=find(guild,n);return c?'<#'+c.id+'>':'#'+n;};
   const content='**Welcome to Formline Studios**\n\nA home for useful, creative software. We are still preparing our public launch.\n\n**Explore**\n'+channel('discord')+' — our Discord toolkit\n'+channel('pip-bot')+' — meet Pip, our little helper\n\n**Join in**\n'+channel('general')+' — chat\n'+channel('showcase')+' — share your creations\n\n**Need something?**\n'+channel('support')+' — help\n'+channel('suggestions')+' — feedback\n'+channel('bug-reports')+' — bugs\n\nNews goes in '+channel('announcements')+'. No public downloads have launched yet.';
   if(old.length){await old[0].edit({content,allowedMentions:{parse:[]}});}
   else{const m=await intro.send({content,allowedMentions:{parse:[]}});await m.pin();}
  });
 }
 // Category order first, channel order second, to avoid sort collisions.
 for(const [i,name] of CATEGORY_ORDER.entries()){
  const cat=find(guild,name);if(cat)await attempt('Order category '+name,()=>cat.setPosition(i));
 }
 for(const [categoryName,names] of Object.entries(PUBLIC)){
  for(const [i,name] of names.entries()){
   const ch=find(guild,name);if(ch)await attempt('Order '+name,()=>ch.setPosition(i));
  }
 }
 for(const [i,name] of INTERNAL.entries()){
  const ch=find(guild,name);if(ch)await attempt('Order private '+name,()=>ch.setPosition(i));
 }
 await guild.channels.fetch();
 for(const name of INTERNAL){
  const ch=find(guild,name);
  if(!ch)continue;
  if(ch.parentId!==internal.id)warnings.push(name+': not in private archive');
  if(!ch.permissionOverwrites.cache.get(guild.id)?.deny.has('ViewChannel'))warnings.push(name+': public deny missing');
 }
 const report={version:4,changes,warnings,publicCategories:CATEGORY_ORDER.slice(0,4),archived:INTERNAL.filter(n=>!!find(guild,n))};
 if(warnings.length===0)writeFileSync(MARKER_V4,JSON.stringify({version:4,appliedAt:new Date().toISOString()}),{mode:0o600});
 return report;
}


const REDUNDANT_CHANNELS=['experiments','devlog','roadmap','previews','releases','app-index'];
async function removeRedundantFormlineContent(client) {
 const marker='formline-redundant-content-v5.applied';
 if(existsSync(marker))return {alreadyApplied:true};
 const guild=client.guilds.cache.get(GUILD);
 if(!guild)throw Error('Formline guild unavailable');
 await guild.channels.fetch();
 const deletedChannels=[],deletedMessages=[],preserved=[],warnings=[];
 // Discord can contain long-running history. Never erase conversations or forum threads
 // without inspecting their contents. A forum containing threads is retained.
 for(const name of REDUNDANT_CHANNELS){
  const ch=guild.channels.cache.find(c=>c.name===name);
  if(!ch)continue;
  try {
   if(ch.threads?.fetchActive){
    const active=await ch.threads.fetchActive();
    const archived=await ch.threads.fetchArchived({type:'public',limit:100});
    if(active.threads.size||archived.threads.size||archived.hasMore){
     preserved.push(name+' (contains threads)');continue;
    }
   }
   if(ch.messages?.fetch){
    let before,seen=0,hasMemberMessages=false,exhausted=false;
    while(seen<1000){
     const page=await ch.messages.fetch({limit:100,...(before?{before}:{})});
     if(page.size===0){exhausted=true;break;}
     seen+=page.size;
     if(page.some(m=>m.author?.id!==client.user.id)){hasMemberMessages=true;break;}
     before=page.last()?.id;
     if(page.size<100){exhausted=true;break;}
    }
    if(hasMemberMessages||!exhausted){
     preserved.push(name+(hasMemberMessages?' (member messages)':' (unverified older history)'));continue;
    }
   }else if(ch.type!==15){
    preserved.push(name+' (message history unavailable)');continue;
   }
   await ch.delete('Remove obsolete Formline channel after verifying no member messages or threads');
   deletedChannels.push(name);
  }catch(e){warnings.push(name+': '+String(e?.message||e).slice(0,120));}
 }
 // Remove outdated bot-written guide messages, never messages authored by members.
 for(const name of ['start-here','discord','pip-bot','general','announcements']){
  const ch=guild.channels.cache.find(c=>c.name===name);
  if(!ch?.messages?.fetch)continue;
  try{
   let before,seen=0;
   while(seen<500){
    const page=await ch.messages.fetch({limit:100,...(before?{before}:{})});
    if(!page.size)break;
    for(const m of page.values()){
     if(m.author?.id!==client.user.id)continue;
     if(!m.content?.startsWith('**FORMLINE GUIDE:'))continue;
     if(name==='start-here'&&m.content.includes('**Welcome to Formline Studios**'))continue;
     await m.delete();
     deletedMessages.push(name+':'+m.id);
    }
    seen+=page.size;
    before=page.last()?.id;
    if(page.size<100)break;
   }
  }catch(e){warnings.push('Guides '+name+': '+String(e?.message||e).slice(0,120));}
 }
 // Remove the empty private archive category only when no children remain.
 const internal=guild.channels.cache.find(c=>c.name==='INTERNAL'&&c.type===4);
 if(internal){
  await guild.channels.fetch();
  if(!guild.channels.cache.some(c=>c.parentId===internal.id)){
   try{await internal.delete('Remove empty internal archive');deletedChannels.push('INTERNAL');}
   catch(e){warnings.push('INTERNAL: '+String(e?.message||e).slice(0,120));}
  }
 }
 const report={deletedChannels,deletedBotGuideMessages:deletedMessages.length,preserved,warnings};
 if(!warnings.length)writeFileSync(marker,JSON.stringify(report),{mode:0o600});
 return report;
}

export function installPipRuntime(client){
 if(!client?.on||!client?.guilds?.cache||!client?.rest?.patch)throw Error('discord.js v14 client required');
 let started=false,interval,index=0;
 const setStatus=()=>{try{client.user?.setPresence({status:'online',activities:[PIP_STATUSES[index++%PIP_STATUSES.length]]});}catch(e){console.warn('[Pip] Presence failed: '+errorText(e));}};
 const onJoin=g=>{void setNickname(client,g);};
 const onReady=async()=>{
  if(started)return;started=true;
  setStatus();interval=setInterval(setStatus,300_000);interval.unref?.();
  for(const guild of client.guilds.cache.values())void setNickname(client,guild);
  const summary={generatedAt:Date.now(),installed:true,nicknameMode:'join-and-start-only',rotatingCustomStatuses:PIP_STATUSES.map(x=>x.state),commands:await registerCommands(client),layout:null};
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
  try{const {cleanupFormlineCommunity}=await import('./formline-community-cleanup.mjs');summary.cleanup=await cleanupFormlineCommunity(client);}catch(e){summary.cleanup={error:errorText(e)};}
  try{summary.communityV4=await applyFormlineCommunityV4(client);}catch(e){summary.communityV4={error:errorText(e)};}
  try{summary.contentV5=await removeRedundantFormlineContent(client);}catch(e){summary.contentV5={error:errorText(e)};}
  saveReport(summary);
 };
 client.on('guildCreate',onJoin);client.on('ready',onReady);
 if(client.isReady?.())void onReady();
 return{stop(){if(interval)clearInterval(interval);client.off('guildCreate',onJoin);client.off('ready',onReady);}};
}
