// Formline Native Pages owner-only API. No public routes or tokens stored here.
// Imported by the existing licensed desktop endpoint.
import {validatePages,pagePayload,publishPages,refreshPages,updateVariables} from './native-pages.mjs';
const hex32=x=>typeof x==='string'&&/^[0-9a-f]{32}$/.test(x);
const snow=x=>typeof x==='string'&&/^\d{17,20}$/.test(x);
const err=(message,status=400)=>({error:message,status});
async function assertServer(e,d,owner,discord){
 if(!snow(d.guild)||!snow(d.channel))throw Error('Invalid server or channel.');
 const [guild,channel]=await Promise.all([discord(e,'/guilds/'+d.guild),discord(e,'/channels/'+d.channel)]);
 if(guild.owner_id!==owner||channel.guild_id!==d.guild||![0,5].includes(channel.type))throw Error('Choose a text channel in a server you own.');
 return channel;
}
export async function nativeOperation(d,e,owner,h){
 const {one,all,run,now,random,limit,discord}=h;
 const action=d?.action;
 if(action==='preview'){
  const doc=validatePages(d.document),sample=new Map(doc.pages.map(p=>[p.id,{channel:doc.channel,message:'123456789012345678'}]));
  return {ok:true,preview:doc.pages.map(p=>({id:p.id,title:p.title,payload:pagePayload(doc,p,sample)})),message:'Preview only. Nothing posted.'};
 }
 if(action==='list'){
  const rows=await all(e,'SELECT id,guild_id,channel_id,entry_url,status,created,updated,error,document FROM native_publications WHERE owner_id=? ORDER BY created DESC LIMIT 20',owner);
  return {ok:true,publications:rows.map(r=>({id:r.id,guild:r.guild_id,channel:r.channel_id,url:r.entry_url,status:r.status,created:r.created,updated:r.updated,pageCount:JSON.parse(r.document).pages.length,error:r.error||null}))};
 }
 if(action==='status'){
  if(!hex32(d.id))return err('Invalid publication ID.');
  const p=await one(e,'SELECT id,owner_id,status,addresses,entry_url,error,updated FROM native_publications WHERE id=? AND owner_id=?',d.id,owner);
  if(!p)return err('Publication not found.',404);
  return {ok:true,id:p.id,status:p.status,addresses:JSON.parse(p.addresses||'{}'),entry:p.entry_url,error:p.error,updated:p.updated};
 }
 if(action==='publish'){
  if(d.confirm!=='PUBLISH'||!hex32(d.request_id))return err('Explicit publish confirmation and request ID required.');
  const doc=validatePages(d.document);
  const previous=await one(e,'SELECT id,status,entry_url FROM native_publications WHERE owner_id=? AND request_id=?',owner,d.request_id);
  if(previous)return {ok:true,existing:true,id:previous.id,status:previous.status,entry:previous.entry_url};
  await assertServer(e,doc,owner,discord);
  if(!await limit(e,'native-publish:'+owner,3,3600))return err('Native page publish limit reached.',429);
  const id=random(16);
  // Unique (owner, request_id) is a separate idempotency barrier.
  try{await run(e,'INSERT INTO native_publications(id,owner_id,request_id,guild_id,channel_id,document,addresses,status,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)',id,owner,d.request_id,doc.guild,doc.channel,JSON.stringify(doc),'{}','preparing',now(),now());}
  catch{const duplicate=await one(e,'SELECT id,status,entry_url FROM native_publications WHERE owner_id=? AND request_id=?',owner,d.request_id);if(duplicate)return {ok:true,existing:true,id:duplicate.id,status:duplicate.status,entry:duplicate.entry_url};throw Error('Could not reserve publication job.')}
  let addresses={};
  const journal=async j=>{
   if(j.addresses)addresses=j.addresses;
   const status=j.phase==='complete'?'published':j.phase==='failed'?'needs_review':'publishing';
   await run(e,'UPDATE native_publications SET addresses=?,status=?,error=?,updated=? WHERE id=? AND owner_id=?',JSON.stringify(addresses),status,j.phase==='failed'?'Publish failed; verify cleanup before retrying.':null,now(),id,owner);
  };
  const adapter={
   authorize:async(g,c)=>assertServer(e,{guild:g,channel:c},owner,discord),
   journal,
   create:async(c,payload)=>discord(e,'/channels/'+c+'/messages',{method:'POST',body:JSON.stringify(payload)}),
   edit:async(c,m,payload)=>discord(e,'/channels/'+c+'/messages/'+m,{method:'PATCH',body:JSON.stringify(payload)}),
   remove:async(c,m)=>{
    const r=await fetch('https://discord.com/api/v10/channels/'+c+'/messages/'+m,{method:'DELETE',headers:{Authorization:'Bot '+e.DISCORD_BOT_TOKEN,'User-Agent':'DiscordBot (https://github.com/vexascriptz/formline, 1.0)'},signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('Discord cleanup rejected deletion.');
   }
  };
  try{
   const result=await publishPages(doc,adapter);
   await run(e,'UPDATE native_publications SET entry_url=?,status=?,addresses=?,error=NULL,updated=? WHERE id=? AND owner_id=?',result.entry,'published',JSON.stringify(result.pages),now(),id,owner);
   return {ok:true,id,status:'published',entry:result.entry,pages:result.pages};
  }catch(x){
   // Uncertain creates may exist even when Discord never returned their IDs.
   await run(e,'UPDATE native_publications SET status=?,addresses=?,error=?,updated=? WHERE id=? AND owner_id=?','needs_review',JSON.stringify(addresses),x.uncertain?'Unknown publish outcome. Manual review required.':'Publish failed. Inspect cleanup status.',now(),id,owner);
   return err('Publish did not complete. No automatic retry. Review publication '+id+'.',502);
  }
 }
 if(action==='variables'){
  if(!hex32(d.id))return err('Invalid publication ID.');
  const row=await one(e,'SELECT * FROM native_publications WHERE id=? AND owner_id=?',d.id,owner);
  if(!row)return err('Publication not found.',404);
  if(row.status!=='published')return err('Publication needs review before editing.',409);
  if(!await limit(e,'native-edit:'+owner,8,300))return err('Edit limit reached.',429);
  const doc=JSON.parse(row.document),patched=updateVariables(doc,d.patch);
  if(!patched.affected.length)return {ok:true,updated:[],entry:row.entry_url};
  await assertServer(e,doc,owner,discord);
  const locked=await one(e,"UPDATE native_publications SET status='editing',updated=? WHERE id=? AND owner_id=? AND status='published' RETURNING id",now(),row.id,owner);
  if(!locked)return err('Publication is already being edited.',409);
  const current=await one(e,'SELECT document FROM native_publications WHERE id=? AND owner_id=?',row.id,owner);
  if(current.document!==row.document){await run(e,"UPDATE native_publications SET status='published' WHERE id=? AND owner_id=? AND status='editing'",row.id,owner);return err('This publication changed. Refresh and try again.',409);}
  const addresses=JSON.parse(row.addresses);
  const adapter={
   authorize:async(g,c)=>assertServer(e,{guild:g,channel:c},owner,discord),
   verify:async(c,m,pageId)=>{
    if(addresses[pageId]?.message!==m||addresses[pageId]?.channel!==c)throw Error('Address mismatch');
    const message=await discord(e,'/channels/'+c+'/messages/'+m);
    if(message.id!==m||message.author?.id!==e.DISCORD_CLIENT_ID)throw Error('Message ownership mismatch');
   },
   edit:async(c,m,payload)=>discord(e,'/channels/'+c+'/messages/'+m,{method:'PATCH',body:JSON.stringify(payload)}),
   journal:async()=>{}
  };
  try{
   const changed=await refreshPages(patched.doc,addresses,adapter,patched.affected);
   await run(e,"UPDATE native_publications SET document=?,status='published',updated=?,error=NULL WHERE id=? AND owner_id=?",JSON.stringify(patched.doc),now(),row.id,owner);
   return {ok:true,updated:changed.completed,entry:row.entry_url};
  }catch{
   await run(e,"UPDATE native_publications SET status='needs_review',error='Partial update possible; check messages before retrying.',updated=? WHERE id=? AND owner_id=?",now(),row.id,owner);
   return err('Update needs review; edits may be partially applied.',502);
  }
 }
 return err('Unknown Native Pages action.');
}
