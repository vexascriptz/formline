// Formline Native Pages: isolated proof of concept.
// Adapter must enforce guild ownership/permissions, rate limits, and bot-authored messages.
// No credentials, networking, or production routes in this module.
const snow=id=>typeof id==='string'&&/^\d{17,20}$/.test(id);
const key=id=>typeof id==='string'&&/^[a-z][a-z0-9_-]{0,23}$/.test(id);
const clean=(s,n,required=true)=>{if(typeof s!=='string'||s.length>n||(required&&!s.trim()))throw Error('Invalid page text');return s.trim()};
const td=content=>({type:10,content});
const btn=(label,url)=>({type:2,style:5,label,url});
const row=components=>({type:1,components});
const link=(guild,channel,message)=>{if(![guild,channel,message].every(snow))throw Error('Invalid destination');return 'https://discord.com/channels/'+guild+'/'+channel+'/'+message};
export function validatePages(d){
 if(!d||!snow(d.guild)||!snow(d.channel)||!Array.isArray(d.pages)||!d.pages.length||d.pages.length>12)throw Error('One to twelve pages in an authorized channel required');
 const ids=new Set(d.pages.map(p=>p.id));
 if(ids.size!==d.pages.length||![...ids].every(key)||!ids.has(d.entry))throw Error('Invalid page identifiers');
 return {guild:d.guild,channel:d.channel,entry:d.entry,pages:d.pages.map(p=>{
 if(!Array.isArray(p.links)||p.links.length>10)throw Error('Maximum ten links per page');
 return {id:p.id,title:clean(p.title,80),body:clean(p.body||'',1800,false),accent:/^#[a-f0-9]{6}$/i.test(p.accent||'')?p.accent:'#e8e6e2',links:p.links.map(l=>{if(!ids.has(l.to))throw Error('Unknown page destination');return {to:l.to,label:clean(l.label,80),description:clean(l.description||'',180,false)}})}
 })};
}
export function pagePayload(doc,p,addresses=null){
 const parts=[td('## '+p.title),...(p.body?[td(p.body)]:[])];
 if(addresses){
  for(const l of p.links){
   const dest=addresses.get(l.to);
   if(!dest)throw Error('Missing published destination');
   parts.push({type:9,components:[td('**'+l.label+'**'+(l.description?'\n'+l.description:''))],accessory:btn('Open',link(doc.guild,dest.channel,dest.message))});
  }
  if(p.id!==doc.entry){const home=addresses.get(doc.entry);parts.push({type:14,divider:true,spacing:1},row([btn('Home',link(doc.guild,home.channel,home.message))]));}
 }else parts.push(td('-# Navigation is being prepared.'));
 // 1 container + 2 text + max 10 × (section, text, button) + 3 home components = 36.
 return {flags:32768,components:[{type:17,accent_color:parseInt(p.accent.slice(1),16),components:parts}],allowed_mentions:{parse:[]}};
}
// Two-pass publish: create distinct messages; then wire all cyclic/forward references.
// This only accepts an adapter dedicated to this operation. The adapter owns authorization,
// rate limiting, retry policy, and durable operation journaling for real deployments.
export async function publishPages(input,adapter){
 const doc=validatePages(input);
 await adapter.authorize(doc.guild,doc.channel);
 const addresses=new Map(),created=[];
 try{
  for(const p of doc.pages){
   const m=await adapter.create(doc.channel,pagePayload(doc,p));
   if(!snow(m?.id))throw Error('Discord did not return a valid message ID');
   const location={channel:doc.channel,message:m.id};created.push(location);addresses.set(p.id,location);
  }
  for(const p of doc.pages){const a=addresses.get(p.id);await adapter.edit(a.channel,a.message,pagePayload(doc,p,addresses));}
  return {entry:link(doc.guild,doc.channel,addresses.get(doc.entry).message),pages:Object.fromEntries(addresses)};
 }catch(error){
  const cleanup=await Promise.allSettled(created.map(a=>adapter.remove(a.channel,a.message)));
  const remaining=created.filter((_,i)=>cleanup[i].status==='rejected');
  const failure=new Error('Publish incomplete. '+remaining.length+' known message(s) require cleanup.',{cause:error});
  failure.remaining=remaining;throw failure;
 }
}
