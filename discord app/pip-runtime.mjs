// Pip runtime for the Formline Discord bot. Requires no additional dependencies.
// Set nickname at join/start only (never lock it). Rotate presence, register helpful commands,
// and bootstrap a tidy, non-destructive official server structure.

import {writeFileSync} from 'node:fs';

const INVITE = '3EuqCaRcCY';
const PORTAL = 'https://formline-beta.formline-app-d6e2.workers.dev/';
const TYPE = {TEXT:0,VOICE:2,CATEGORY:4,FORUM:15};
const MANAGE_CHANNELS = 16n;
const SEND_MESSAGES = 2048n;
export const PIP_STATUSES = [
  {name:'over Formline apps',type:3},
  {name:'little things come together',type:0},
  {name:'new creations',type:3},
  {name:'the Formline community',type:2}
];
export const PIP_COMMANDS = [
  {name:'pip',description:'Meet Pip and explore Formline'},
  {name:'apps',description:'Explore the Formline app lineup'},
  {name:'updates',description:'Find the latest Formline releases and updates'},
  {name:'community',description:'Find the Formline Discord community'},
  {name:'feedback',description:'Send feedback or report an issue'}
];
const layout=[
  ['INFORMATION',[
    ['start-here','Welcome to Formline. Begin here for a quick tour.','readonly'],
    ['announcements','Official news about Formline and its apps.','readonly'],
    ['releases','New app releases, downloads and changelogs.','readonly'],
    ['roadmap','What we are building next.','readonly']]],
  ['COMMUNITY',[
    ['general','Chat with the Formline community.'],
    ['showcase','Share what you made with Formline.'],
    ['off-topic','Conversation beyond Formline.'],
    ['lounge','','voice']]],
  ['FORMLINE',[
    ['apps','Directory of apps in the Formline family.','readonly'],
    ['app-discussion','Ideas and questions about Formline apps.'],
    ['support','Get help with Formline apps.','forum'],
    ['feedback','Suggest new features and share ideas.','forum']]]
];
const starter={
 'start-here':'**welcome to formline.**\n\nFormline is a growing lineup of creative apps and tools. This is our official community.\n\n**Get started**\n• #apps — discover Formline apps\n• #releases — downloads and updates\n• #support — get help\n• #feedback — share your ideas\n• #showcase — show us what you made\n\nI am **pip**, Formline’s little helper. Try the /pip command. ♡',
 'apps':'**formline apps**\n\n**Formline desktop toolkit** — create and customize content for Discord. Explore the beta at '+PORTAL+'\n\nWe will add more Formline products here as they launch.',
 'roadmap':'**coming up**\n\nCommunity improvements → app updates → Pip and the Discord bot → Formline website.\n\nRelease notes and downloads belong in #releases.',
 'showcase':'**made something with Formline?**\n\nPost your work here. Share what you created and how you did it.',
 'general':'hi, i am pip! ♡ welcome to Formline. what are you making?'
};
const err=e=>String(e?.message||e).replace(/https?:\/\/\S+/g,'[link]').slice(0,140);
async function nickname(client,guild){
 try{
  const me=await guild.members.fetchMe();
  if(me.nickname!=='pip'){await client.rest.patch('/guilds/'+guild.id+'/members/@me',{body:{nick:'pip'}});console.log('[Pip] Nickname set in '+guild.id);}
 }catch(e){console.warn('[Pip] Could not set nickname in '+guild.id+': '+err(e));}
}
async function commands(client){
 try{
  const existing=await client.application.commands.fetch();
  const names=new Set(existing.map(c=>c.name)),added=[];
  for(const cmd of PIP_COMMANDS){
   if(names.has(cmd.name))continue;
   await client.application.commands.create({...cmd,type:1,integrationTypes:[0,1],contexts:[0,1,2]});
   added.push(cmd.name);
  }
  return {added};
 }catch(e){return {error:err(e)};}
}
async function officialGuild(client){
 try{
  const inv=await client.rest.get('/invites/'+INVITE);
  if(inv?.guild?.id&&client.guilds.cache.has(inv.guild.id))return client.guilds.cache.get(inv.guild.id);
 }catch(e){console.warn('[Pip] Invite lookup failed: '+err(e));}
 const matches=[...client.guilds.cache.values()].filter(g=>g.name.toLowerCase().trim()==='formline');
 return matches.length===1?matches[0]:null;
}
async function setupServer(guild){
 const report={guildId:guild.id,guildName:guild.name,created:[],seeded:[],warnings:[]};
 try{
  await guild.channels.fetch();
  const me=await guild.members.fetchMe();
  if(!me.permissions.has(MANAGE_CHANNELS)){
   report.warnings.push('Missing Manage Channels; left the server unchanged.');
   return report;
  }
  const isCommunity=guild.features.includes('COMMUNITY');
  const find=(n,type)=>guild.channels.cache.find(c=>c.name.toLowerCase()===n.toLowerCase()&&(type===undefined||c.type===type));
  async function category(name){
   const existing=find(name,TYPE.CATEGORY);if(existing)return existing;
   const created=await guild.channels.create({name,type:TYPE.CATEGORY,reason:'Formline community setup'});
   report.created.push('Category: '+name);return created;
  }
  for(const [catName,entries] of layout){
   for(const [name,topic,kind] of entries){
    if(find(name))continue; // never move, delete, or overwrite an existing channel
    let parent;
    try{parent=await category(catName);}catch(e){report.warnings.push('Category '+catName+': '+err(e));continue;}
    const type=kind==='voice'?TYPE.VOICE:kind==='forum'&&isCommunity?TYPE.FORUM:TYPE.TEXT;
    const options={name,type,parent:parent.id,reason:'Formline community setup'};
    if(type!==TYPE.VOICE)options.topic=topic;
    if(kind==='readonly'&&type===TYPE.TEXT)options.permissionOverwrites=[{id:guild.id,deny:[SEND_MESSAGES]}];
    if(type===TYPE.FORUM)options.availableTags=(name==='support'
      ?['Question','Bug','Account','Resolved']
      :['Idea','Feature','Design','Under review']).map(name=>({name}));
    try{
     const ch=await guild.channels.create(options);
     report.created.push(name+(type===TYPE.FORUM?' (forum)':type===TYPE.VOICE?' (voice)':''));
     if(type===TYPE.TEXT&&starter[name]){
      try{await ch.send({content:starter[name],allowedMentions:{parse:[]}});report.seeded.push(name);}
      catch(e){report.warnings.push('Posting to '+name+': '+err(e));}
     }
    }catch(e){report.warnings.push('Channel '+name+': '+err(e));}
   }
  }
 }catch(e){report.warnings.push('Setup interrupted: '+err(e));}
 return report;
}
function report(x){try{writeFileSync('pip-runtime-report.json',JSON.stringify(x,null,2),{mode:0o600});}
 catch(e){console.warn('[Pip] Could not save report: '+err(e));}}

export function installPipRuntime(client){
 if(!client?.on||!client?.guilds?.cache||!client?.rest?.patch)throw Error('A discord.js v14 Client is required.');
 let started=false,interval,step=0;
 const rotate=()=>{
  const activity=PIP_STATUSES[(step++)%PIP_STATUSES.length];
  try{client.user?.setPresence({status:'online',activities:[activity]});}
  catch(e){console.warn('[Pip] Presence update failed: '+err(e));}
 };
 const join=g=>{void nickname(client,g);};
 const ready=async()=>{
  if(started)return;started=true;
  rotate();interval=setInterval(rotate,300_000);interval.unref?.();
  for(const guild of client.guilds.cache.values())void nickname(client,guild);
  const registered=await commands(client);
  const guild=await officialGuild(client);
  const summary={installed:true,nicknameMode:'join-and-start-only',rotatingStatuses:PIP_STATUSES.length,commands:registered,server:null};
  if(guild){summary.server=await setupServer(guild);console.info('[Pip] Community setup: '+summary.server.created.length+' new channels/categories');}
  else{summary.server={warning:'Official Formline guild not found in bot guilds. No changes made.'};}
  report(summary);
 };
 client.on('guildCreate',join);client.on('ready',ready);
 if(client.isReady?.())void ready();
 return{stop(){if(interval)clearInterval(interval);client.off('guildCreate',join);client.off('ready',ready);}};
}
