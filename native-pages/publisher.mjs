// Formline Native Pages: isolated proof of concept.
// Adapter must enforce guild ownership/permissions, rate limits, and bot-authored messages.
// No credentials, networking, or production routes in this module.
const snow=id=>typeof id==='string'&&/^\d{17,20}$/.test(id);
const key=id=>typeof id==='string'&&/^[a-z][a-z0-9_-]{0,23}$/.test(id);
const clean=(s,n,required=true)=>{if(typeof s!=='string'||s.length>n||(required&&!s.trim()))throw Error('Invalid page text');return s.trim()};
const varsOf=v=>{
 if(v==null)return {};
 if(typeof v!=='object'||Array.isArray(v)||Object.keys(v).length>20)throw Error('Invalid variables');
 return Object.fromEntries(Object.entries(v).map(([k,x])=>{if(!key(k)||['constructor','prototype'].includes(k))throw Error('Invalid variable name');return [k,clean(x,120,false)]}));
};
const expand=(s,v)=>s.replace(/\{\{([a-z][a-z0-9_-]{0,23})\}\}/g,(_,k)=>Object.hasOwn(v,k)?v[k]:'—');
const used=s=>[...s.matchAll(/\{\{([a-z][a-z0-9_-]{0,23})\}\}/g)].map(x=>x[1]);
const blocksOf=b=>{
 if(b==null)return [];
 if(!Array.isArray(b)||b.length>8)throw Error('Maximum eight content blocks');
 return b.map(x=>{
 if(x?.type==='text')return {type:'text',text:clean(x.text,1200)};
 if(x?.type==='divider')return {type:'divider'};
 if(x?.type==='image'){
  if(typeof x.url!=='string'||x.url.length>512||!/^https:\/\/[^/\s?#]+(?:[/?#][^\s]*)?$/i.test(x.url))throw Error('Invalid HTTPS media URL');
  const url=new URL(x.url);
  if(url.protocol!=='https:'||url.username||url.password||!url.hostname)throw Error('Invalid HTTPS media URL');
  return {type:'image',url:url.href};
 }
 throw Error('Unknown block type');
 });
};
const td=content=>({type:10,content});
const btn=(label,url)=>({type:2,style:5,label,url});
const row=components=>({type:1,components});
const link=(guild,channel,message)=>{if(![guild,channel,message].every(snow))throw Error('Invalid destination');return 'https://discord.com/channels/'+guild+'/'+channel+'/'+message};
export function validatePages(d){
 if(!d||!snow(d.guild)||!snow(d.channel)||!Array.isArray(d.pages)||!d.pages.length||d.pages.length>12)throw Error('One to twelve pages in an authorized channel required');
 const ids=new Set(d.pages.map(p=>p.id));
 if(ids.size!==d.pages.length||![...ids].every(key)||!ids.has(d.entry))throw Error('Invalid page identifiers');
 const doc={guild:d.guild,channel:d.channel,entry:d.entry,variables:varsOf(d.variables),pages:d.pages.map(p=>{
 if(!Array.isArray(p.links)||p.links.length>8)throw Error('Maximum eight links per page');
 return {id:p.id,title:clean(p.title,80),body:clean(p.body||'',1800,false),accent:/^#[a-f0-9]{6}$/i.test(p.accent||'')?p.accent:'#e8e6e2',blocks:blocksOf(p.blocks),links:p.links.map(l=>{if(!ids.has(l.to))throw Error('Unknown page destination');return {to:l.to,label:clean(l.label,80),description:clean(l.description||'',180,false)}})}
 })};
 const seen=new Set([doc.entry]),queue=[doc.entry];while(queue.length){const id=queue.shift();for(const l of doc.pages.find(p=>p.id===id).links){if(!seen.has(l.to)){seen.add(l.to);queue.push(l.to)}}}
 if(seen.size!==doc.pages.length)throw Error('Every page must be reachable from Home');
 const sample=new Map(doc.pages.map(p=>[p.id,{channel:doc.channel,message:'123456789012345678'}]));for(const p of doc.pages)pagePayload(doc,p,sample);return doc;
}
export function pagePayload(doc,p,addresses=null){
 const v=doc.variables||{},render=(s,n)=>{const out=expand(s,v);if(out.length>n)throw Error('Expanded text exceeds limit');return out};
 const parts=[td('## '+render(p.title,80)),...(p.body?[td(render(p.body,1800))]:[])];
 for(const b of p.blocks||[]){if(b.type==='text')parts.push(td(render(b.text,1200)));if(b.type==='divider')parts.push({type:14,divider:true,spacing:1});if(b.type==='image')parts.push({type:12,items:[{media:{url:b.url}}]});}
 if(addresses){
  for(const l of p.links){
   const dest=addresses.get(l.to);
   if(!dest)throw Error('Missing published destination');
   parts.push({type:9,components:[td('**'+render(l.label,80)+'**'+(l.description?'\n'+render(l.description,180):''))],accessory:btn('Open',link(doc.guild,dest.channel,dest.message))});
  }
  if(p.id!==doc.entry){const home=addresses.get(doc.entry);parts.push({type:14,divider:true,spacing:1},row([btn('Home',link(doc.guild,home.channel,home.message))]));}
 }else parts.push(td('-# Navigation is being prepared.'));
 // 1 container + 2 text + max 10 × (section, text, button) + 3 home components = 36.
 const root={type:17,accent_color:parseInt(p.accent.slice(1),16),components:parts};
 const count=c=>1+(c.components||[]).reduce((n,x)=>n+count(x),0)+(c.accessory?count(c.accessory):0);const chars=c=>(c.content||'').length+(c.components||[]).reduce((n,x)=>n+chars(x),0);
 if(count(root)>40||chars(root)>4000)throw Error('Page exceeds safe component or text budget');
 return {flags:32768,components:[root],allowed_mentions:{parse:[]}};
}
// Two-pass publish: create distinct messages; then wire all cyclic/forward references.
// This only accepts an adapter dedicated to this operation. The adapter owns authorization,
// rate limiting, retry policy, and durable operation journaling for real deployments.
export async function publishPages(input,adapter){
 const doc=validatePages(input);
 await adapter.authorize(doc.guild,doc.channel);
 const addresses=new Map(),created=[];let uncertain=false;
 try{
  for(const p of doc.pages){
   if(adapter.journal)await adapter.journal({phase:'creating',page:p.id,addresses:Object.fromEntries(addresses)});uncertain=true;
   const m=await adapter.create(doc.channel,pagePayload(doc,p));
   if(!snow(m?.id))throw Error('Discord did not return a valid message ID');
   const location={channel:doc.channel,message:m.id};created.push(location);addresses.set(p.id,location);uncertain=false;if(adapter.journal)await adapter.journal({phase:'created',page:p.id,addresses:Object.fromEntries(addresses)});
  }
  for(const p of doc.pages){const a=addresses.get(p.id);await adapter.edit(a.channel,a.message,pagePayload(doc,p,addresses));}
  return {entry:link(doc.guild,doc.channel,addresses.get(doc.entry).message),pages:Object.fromEntries(addresses)};
 }catch(error){
  const remaining=[];for(const a of [...created].reverse())try{await adapter.remove(a.channel,a.message)}catch{remaining.push(a)}
  const failure=new Error('Publish incomplete. '+remaining.length+' known message(s) require cleanup.',{cause:error});
  failure.remaining=remaining;failure.uncertain=uncertain;if(adapter.journal)try{await adapter.journal({phase:'failed',remaining,uncertain})}catch{failure.journalFailed=true}throw failure;
 }
}

export function dependencies(doc){
 const out=Object.create(null);for(const p of doc.pages){const names=new Set([p.title,p.body,...p.links.flatMap(l=>[l.label,l.description]),...(p.blocks||[]).filter(b=>b.type==='text').map(b=>b.text)].flatMap(used));for(const k of names)(out[k]??=[]).push(p.id)}return out;
}
export function updateVariables(input,patch){
 const before=validatePages(input),changes=varsOf(patch),doc=validatePages({...before,variables:{...before.variables,...changes}}),deps=dependencies(doc);
 return {doc,affected:[...new Set(Object.keys(changes).filter(k=>before.variables[k]!==doc.variables[k]).flatMap(k=>deps[k]||[]))]};
}
// Only trusted, stored addresses are allowed. Verify publication membership and
// bot authorship before editing any message. Never accept arbitrary client IDs.
export async function refreshPages(input,locations,adapter,only=null){
 const doc=validatePages(input);await adapter.authorize(doc.guild,doc.channel);
 const addresses=new Map();for(const p of doc.pages){const a=locations?.[p.id];if(!a||a.channel!==doc.channel||!snow(a.message))throw Error('Missing or mismatched page address');addresses.set(p.id,a)}
 if(new Set([...addresses.values()].map(a=>a.message)).size!==doc.pages.length)throw Error('Duplicate address');
 for(const p of doc.pages){const a=addresses.get(p.id);await adapter.verify(a.channel,a.message,p.id)}
 const completed=[];for(const p of doc.pages.filter(p=>only===null||only.includes(p.id))){const a=addresses.get(p.id);await adapter.edit(a.channel,a.message,pagePayload(doc,p,addresses));completed.push(p.id);if(adapter.journal)await adapter.journal({phase:'refresh',completed:[...completed]})}return {completed};
}
