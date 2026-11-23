// Formline v4: concise public layout and non-destructive internal archive.
// Move existing channels, keep messages, and verify ordering/visibility.
import {existsSync,writeFileSync} from 'node:fs';
const GUILD='1391162919353319505';
const MARKER='formline-community-v4.applied';
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
 if(existsSync(MARKER))return {version:4,alreadyApplied:true,warnings:[]};
 const guild=client.guilds.cache.get(GUILD);
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
  const parent=find(guild,categoryName);
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
 if(warnings.length===0)writeFileSync(MARKER,JSON.stringify({version:4,appliedAt:new Date().toISOString()}),{mode:0o600});
 return report;
}
