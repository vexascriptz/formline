// Experimental interactive panels. No tokens in the client.
const ident=x=>typeof x==='string'&&/^\d{17,20}$/.test(x);
const pid=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
const stamp=()=>Math.floor(Date.now()/1000);
const row=(...components)=>({type:1,components});
const button=(label,id,style=2)=>({type:2,style,label,custom_id:id});
const text=content=>({type:10,content});
const packet=(type,data)=>Response.json({type,data},{headers:{'Cache-Control':'no-store'}});
const privateReply=content=>packet(4,{content,flags:64,allowed_mentions:{parse:[]}});
const prefix=p=>'flx:'+p.id+':';
const container=(...components)=>({type:17,accent_color:0xe8e6e2,components});
const ptext=(title,body)=>text('## '+title+'\n'+body);
export function normalize(d){if(d?.version===2)return normalizeFlow(d);
 if(!d||typeof d!=='object'||!Array.isArray(d.pages)||d.pages.length!==3)throw Error('Exactly three pages are required.');
 const trim=(v,max,min=1)=>{if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)throw Error('Check page title, body and feedback prompt lengths.');return v.trim();};
 return {pages:d.pages.map(p=>({title:trim(p?.title,36),body:trim(p?.body,700)})),prompt:trim(d.prompt,45)};
}
export function launch(p){const c=JSON.parse(p.config);return {flags:32768,allowed_mentions:{parse:[]},components:[container(ptext(c.pages[0].title,c.pages[0].body),row(button('Open panel',prefix(p)+'open',1)),text('-# Formline Interactive · Experimental'))]};}
export function privatePage(p,n){const c=JSON.parse(p.config);return {flags:32832,allowed_mentions:{parse:[]},components:[container(ptext(c.pages[n].title,c.pages[n].body),row(...c.pages.map((page,i)=>button(page.title,prefix(p)+'p'+i,i===n?1:2))),row(button('Send feedback',prefix(p)+'form')),text('-# '+(n+1)+' / 3 · Only you can see this view'))]};}
export function modal(p){const c=JSON.parse(p.config);return {title:'Send feedback',custom_id:prefix(p)+'submit',components:[{type:10,content:'Your response is stored for the Formline panel owner. Do not include personal information, passwords or private codes.'},{type:18,label:c.prompt,component:{type:4,custom_id:'response',style:2,min_length:3,max_length:500,required:true}}]};}
function responseValue(d){for(const a of d?.data?.components||[]){const fields=a.component?[a.component]:a.components||[];for(const f of fields)if(f.custom_id==='response'&&typeof f.value==='string')return f.value.trim();}return '';}
export async function interactive(d,e){
 const custom=d.data?.custom_id;if(typeof custom!=='string'||!custom.startsWith('flx:'))return null;
 const match=/^flx:([a-f0-9]{32}):(open|p[0-2]|form|submit|a:[a-z][a-z0-9_-]{0,23}:[a-z][a-z0-9_-]{0,23}|f:[a-z][a-z0-9_-]{0,23}:[a-z][a-z0-9_-]{0,23}|m:[a-z][a-z0-9_-]{0,23})$/.exec(custom);if(!match)return privateReply('Invalid Formline action.');
 const id=d.member?.user?.id||d.user?.id;if(!ident(id)||!ident(d.guild_id)||!ident(d.channel_id))return privateReply('This panel is only available in its original server.');
 const p=await e.DB.prepare('SELECT * FROM interactive_panels WHERE id=? AND active=1 AND message_id IS NOT NULL').bind(match[1]).first();
 if(!p||p.guild_id!==d.guild_id||p.channel_id!==d.channel_id)return privateReply('This panel is inactive or unavailable.');
 const cfg=JSON.parse(p.config);if(cfg.version===2)return flowInteraction(d,e,p,cfg,id);const act=match[2];
 if(d.type===3){
  if(act==='open'&&d.message?.id===p.message_id)return packet(4,privatePage(p,0));
  if(!(Number(d.message?.flags||0)&64))return privateReply('Open your private panel first.');
  if(/^p[0-2]$/.test(act)){const next=privatePage(p,Number(act[1]));delete next.flags;return packet(7,next);}
  if(act==='form')return packet(9,modal(p));
 }
 if(d.type===5&&act==='submit'){
  const value=responseValue(d);if(value.length<3||value.length>500)return privateReply('Enter 3–500 characters.');
  const h=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(p.id+':'+id))),b=>b.toString(16).padStart(2,'0')).join('');
  await e.DB.prepare('INSERT INTO interactive_submissions(id,panel_id,user_id,response,created) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM interactive_panels WHERE id=? AND active=1) ON CONFLICT(panel_id,user_id) DO UPDATE SET response=excluded.response,created=excluded.created').bind(d.id,p.id,h,value,stamp(),p.id).run();
  return privateReply('Feedback saved. Submitting again replaces your previous response.');
 }
 return privateReply('Invalid Formline action.');
}


// V2 flow format. Legacy three-page panels are handled by the original renderer.
const safeId=x=>typeof x==='string'&&/^[a-z][a-z0-9_-]{0,23}$/.test(x);
const actionTypes=['goto','reply','form','link','role','vote','close'];
function cleanText(x,min,max){if(typeof x!=='string'||x.trim().length<min||x.trim().length>max)throw Error('A text field is missing or exceeds its limit.');return x.trim();}
function urlCheck(x){try{const u=new URL(x);if(u.protocol==='https:'&&!u.username&&!u.password&&x.length<=512)return u.href;}catch{}throw Error('Links must be valid HTTPS URLs.');}
export function normalizeFlow(d){
 if(d?.version!==2||!Array.isArray(d.pages)||d.pages.length<1||d.pages.length>12)throw Error('Create 1–12 pages.');
 const ids=new Set();for(const p of d.pages){if(!safeId(p.id)||ids.has(p.id))throw Error('Invalid or duplicate page ID.');ids.add(p.id);}
 const target=x=>{if(!ids.has(x))throw Error('An action links to a missing page.');return x;};
 const optionalTarget=x=>x?target(x):'';
 const entry=target(d.entry),accent=typeof d.accent==='string'&&/^#[0-9a-f]{6}$/i.test(d.accent)?d.accent:'#e8e6e2';
 const intro={title:cleanText(d.intro?.title,1,80),body:cleanText(d.intro?.body,0,1000),label:cleanText(d.intro?.label,1,80)};
 const pages=d.pages.map(p=>{
  if(!Array.isArray(p.actions)||p.actions.length>10)throw Error('Each page supports up to ten actions.');
  const seen=new Set(),mode=p.mode==='menu'?'menu':'buttons';
  const actions=p.actions.map(a=>{
   if(!safeId(a.id)||seen.has(a.id)||!actionTypes.includes(a.type))throw Error('Invalid action.');seen.add(a.id);
   const o={id:a.id,type:a.type,label:cleanText(a.label,1,80),style:[1,2,3,4].includes(Number(a.style))?Number(a.style):2};
   if(a.type==='goto')o.target=target(a.target);
   if(a.type==='reply')o.text=cleanText(a.text,1,1000);
   if(a.type==='link')o.url=urlCheck(a.url);
   if(a.type==='role'){if(!ident(a.role))throw Error('Enter a Discord role ID.');o.role=a.role;o.target=target(a.target);o.other=target(a.other);}
   if(a.type==='form'){o.title=cleanText(a.title,1,45);if(!Array.isArray(a.fields)||a.fields.length<1||a.fields.length>3)throw Error('Forms require 1–3 questions.');o.fields=a.fields.map(f=>({label:cleanText(f.label,1,45),placeholder:cleanText(f.placeholder||'',0,100),required:f.required!==false,long:f.long!==false}));o.target=optionalTarget(a.target);o.text=cleanText(a.text||'Response saved.',1,300);}
   if(a.type==='vote'){if(!safeId(a.group))throw Error('Poll group must be a short lowercase identifier.');o.group=a.group;o.choice=cleanText(a.choice||a.label,1,80);o.target=optionalTarget(a.target);}
   return o;
  });
  return {id:p.id,title:cleanText(p.title,1,80),body:cleanText(p.body,0,1500),footer:cleanText(p.footer||'',0,160),mode,actions};
 });
 return {version:2,entry,accent,intro,pages};
}
const flowContainer=(cfg,...components)=>({type:17,accent_color:parseInt(cfg.accent.slice(1),16),components});
const flowID=(panel,p,a)=>'flx:'+panel.id+':a:'+p.id+':'+a.id;
const flowFormID=(panel,p,a)=>'flx:'+panel.id+':f:'+p.id+':'+a.id;
export function flowLaunch(panel){const c=JSON.parse(panel.config);if(c.version!==2)return launch(panel);return {flags:32768,allowed_mentions:{parse:[]},components:[flowContainer(c,text('## '+c.intro.title+(c.intro.body?'\n'+c.intro.body:'')),row(button(c.intro.label,prefix(panel)+'open',1)))]};}
function flowRender(panel,c,page,notice=''){
 const interactive=page.actions.filter(a=>a.type!=='link'), links=page.actions.filter(a=>a.type==='link');
 const nodes=[text('## '+page.title+(page.body?'\n'+page.body:''))];
 if(notice)nodes.push(text(notice));
 if(page.mode==='menu'&&interactive.length){nodes.push(row({type:3,custom_id:'flx:'+panel.id+':m:'+page.id,placeholder:'Choose an action',min_values:1,max_values:1,options:interactive.map(a=>({label:a.label,value:a.id}))}));}
 else{for(let i=0;i<interactive.length;i+=5)nodes.push(row(...interactive.slice(i,i+5).map(a=>button(a.label,flowID(panel,page,a),a.style))));}
 for(let i=0;i<links.length;i+=5)nodes.push(row(...links.slice(i,i+5).map(a=>({type:2,style:5,label:a.label,url:a.url}))));
 if(page.footer)nodes.push(text('-# '+page.footer));
 return {flags:32832,allowed_mentions:{parse:[]},components:[flowContainer(c,...nodes)]};
}
function flowUpdate(panel,c,page,notice=''){const v=flowRender(panel,c,page,notice);delete v.flags;return packet(7,v);}
function flowModal(panel,p,a){return {title:a.title,custom_id:flowFormID(panel,p,a),components:[{type:10,content:'Responses are stored for the panel owner. Do not include private credentials or personal information.'},...a.fields.map((f,i)=>({type:18,label:f.label,component:{type:4,custom_id:'q'+i,style:f.long?2:1,placeholder:f.placeholder||undefined,required:f.required,max_length:500}}))]};}
async function participant(panel,user,scope){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(panel.id+':'+scope+':'+user))),b=>b.toString(16).padStart(2,'0')).join('');}
async function flowInteraction(d,e,p,c,id){
 const cmd=d.data.custom_id.split(':'),kind=cmd[2],page=c.pages.find(x=>x.id===cmd[3]),findPage=x=>c.pages.find(y=>y.id===x);
 if(d.type===3&&kind==='open'&&d.message?.id===p.message_id)return packet(4,flowRender(p,c,findPage(c.entry)));
 const privateMessage=(Number(d.message?.flags||0)&64)!==0;
 if(!page)return privateReply('This action no longer exists. Open the panel again.');
 const aid=kind==='m'?d.data.values?.[0]:cmd[4],a=page.actions.find(x=>x.id===aid);
 if(!a)return privateReply('This action is no longer available.');
 if(d.type===5&&kind==='f'&&a.type==='form'){
  const values={};for(const item of d.data.components||[]){for(const f of item.component?[item.component]:item.components||[]){if(typeof f.value==='string')values[f.custom_id]=f.value.trim();}}
  const out=[];for(let i=0;i<a.fields.length;i++){const f=a.fields[i],v=values['q'+i]||'';if((f.required&&!v)||v.length>500)return privateReply('Complete the required questions.');out.push(f.label+': '+v);}
  const hash=await participant(p,id,page.id+':'+a.id);
  await e.DB.prepare('INSERT INTO interactive_submissions(id,panel_id,user_id,response,created) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM interactive_panels WHERE id=? AND active=1) ON CONFLICT(panel_id,user_id) DO UPDATE SET response=excluded.response,created=excluded.created').bind(d.id,p.id,hash,'['+a.title+']\n'+out.join('\n'),stamp(),p.id).run();
  return a.target?packet(4,flowRender(p,c,findPage(a.target),a.text)):privateReply(a.text);
 }
 if(d.type!==3||!privateMessage||!['a','m'].includes(kind))return privateReply('Open your private panel first.');
 if(a.type==='goto')return flowUpdate(p,c,findPage(a.target));
 if(a.type==='role'){const roles=Array.isArray(d.member?.roles)?d.member.roles:[];return flowUpdate(p,c,findPage(roles.includes(a.role)?a.target:a.other));}
 if(a.type==='reply')return privateReply(a.text);
 if(a.type==='form')return packet(9,flowModal(p,page,a));
 if(a.type==='close')return packet(7,{components:[flowContainer(c,text('Panel closed. Reopen the original message to start again.'))],allowed_mentions:{parse:[]}});
 if(a.type==='vote'){
  const h=await participant(p,id,'vote:'+a.group);
  await e.DB.prepare('INSERT INTO interactive_votes(panel_id,group_id,participant,choice,created) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM interactive_panels WHERE id=? AND active=1) ON CONFLICT(panel_id,group_id,participant) DO UPDATE SET choice=excluded.choice,created=excluded.created').bind(p.id,a.group,h,a.choice,stamp(),p.id).run();
  return a.target?flowUpdate(p,c,findPage(a.target),'Vote saved.'):privateReply('Vote saved. You can change it by voting again.');
 }
 return privateReply('Unsupported action.');
}
