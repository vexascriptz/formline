// One-time, non-destructive Formline public server cleanup.
// Hide internal planning channels from @everyone; preserve channels, posts and permissions for staff.
import {existsSync,writeFileSync} from 'node:fs';
const GUILD='1391162919353319505';
const MARKER='formline-community-cleanup-v3.applied';
const INTERNAL=['experiments','devlog','roadmap','previews'];
export async function cleanupFormlineCommunity(client) {
  if(existsSync(MARKER)) return {alreadyApplied:true,hidden:[],warnings:[]};
  const guild=client.guilds.cache.get(GUILD);
  if(!guild)throw Error('Formline Studios guild unavailable');
  await guild.channels.fetch();
  const hidden=[],warnings=[];
  for(const name of INTERNAL){
    const channel=guild.channels.cache.find(c=>c.name===name);
    if(!channel){warnings.push(name+': not found');continue;}
    try{
      await channel.permissionOverwrites.edit(guild.roles.everyone,{ViewChannel:false},{reason:'Keep Formline internal development private'});
      hidden.push(name);
    }catch(e){warnings.push(name+': '+String(e?.message||e).slice(0,120));}
  }
  // Explicitly verify @everyone deny before recording successful migration.
  for(const name of hidden){
    const channel=guild.channels.cache.find(c=>c.name===name);
    const p=channel?.permissionOverwrites.cache.get(guild.id);
    if(!p?.deny.has('ViewChannel'))warnings.push(name+': visibility verification failed');
  }
  if(warnings.length===0)writeFileSync(MARKER,JSON.stringify({guildId:GUILD,hidden,appliedAt:new Date().toISOString()}),{mode:0o600});
  return {hidden,warnings,complete:warnings.length===0};
}
