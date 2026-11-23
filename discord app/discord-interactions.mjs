import {interactive,openContextPanel} from './interactive.mjs';
// Formline Discord commands. Credentials stay in Worker secrets.
const encoder=new TextEncoder();
const invite='https://discord.gg/3EuqCaRcCY';
export const commands=[
 ...[['formline','Open the Formline portal'],['license','Check your license privately'],['beta','Request free Formline beta access'],['support','Find Formline support'],['help','Browse Formline commands'],['status','Check Formline service availability']].map(([name,description])=>({name,description,type:1,integration_types:[1],contexts:[0,1,2]})),
 ...[['pip','Meet Pip and explore Formline'],['apps','Explore the Formline app lineup'],['updates','Find Formline releases and updates'],['community','Join the Formline Discord community'],['feedback','Share Formline feedback and report issues']].map(([name,description])=>({name,description,type:1,integration_types:[0,1],contexts:[0,1,2]})),
  {name:'Open Formline panel',type:3,integration_types:[0],contexts:[0]},
 {name:'formline-setup',description:'Post the Formline access panel in this server',type:1,integration_types:[0],contexts:[0],default_member_permissions:'32'}
];
function fromHex(s,n){return typeof s==='string'&&s.length===2*n&&/^[0-9a-f]+$/i.test(s)?Uint8Array.from(s.match(/../g),b=>parseInt(b,16)):null;}
function reply(body,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
function msg(content,extra={}){return reply({type:4,data:{content,flags:64,allowed_mentions:{parse:[]},...extra}});}
function links(origin,kind){return [{type:1,components:kind==='support'?[{type:2,style:5,label:'Join support server',url:invite}]:[{type:2,style:5,label:'Open Formline',url:origin},{type:2,style:5,label:'Community',url:invite}]}];}
function manager(d){try{return !!d.guild_id&&d.authorizing_integration_owners?.['0']===d.guild_id&&(BigInt(d.member?.permissions||'0')&40n)!==0n;}catch{return false;}}

async function completeDeferred(d,work,update){
 try{
   const response=await work, result=await response.json();
   const data=result?.data||{};
   if(update && result.type===4){
     const resp=await fetch('https://discord.com/api/v10/webhooks/'+d.application_id+'/'+d.token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,flags:(Number(data.flags)||0)|64,allowed_mentions:{parse:[]}})});
     if(!resp.ok)console.error('Formline follow-up failed',resp.status);
     return;
   }
   if(![4,7].includes(result.type))throw Error('Unexpected response');
   if(!update){const v2=(Number(data.flags||0)&32768)!==0;delete data.flags;if(v2)data.flags=32768;}
   else delete data.flags;
   const resp=await fetch('https://discord.com/api/v10/webhooks/'+d.application_id+'/'+d.token+'/messages/@original',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,allowed_mentions:{parse:[]}})});
   if(!resp.ok)console.error('Formline deferred response failed',resp.status);
 }catch{console.error('Formline deferred response unavailable');try{if(!update)await fetch('https://discord.com/api/v10/webhooks/'+d.application_id+'/'+d.token+'/messages/@original',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:'Formline could not complete this request. Try again.',allowed_mentions:{parse:[]}})});}catch{}}
}
async function bounded(d,work,ctx){
 const custom=d.data?.custom_id||'';
 // Opening a modal cannot be deferred. Menu choices may also open a modal.
 const canDefer=d.type===2||d.type===5||(d.type===3&&/^flx:[a-f0-9]{32}:(open|p[0-2])$/.test(custom));
 const update=d.type===3&&/:p[0-2]$/.test(custom)&&!!(Number(d.message?.flags||0)&64);
 const deadline=canDefer?950:1550;
 let timer;
 try{
   const pending=Symbol('pending');
   const result=await Promise.race([work,new Promise(resolve=>{timer=setTimeout(()=>resolve(pending),deadline);})]);
   if(result!==pending)return result;
   if(canDefer&&ctx?.waitUntil&&typeof d.token==='string'&&/^[A-Za-z0-9_.-]{10,300}$/.test(d.token)){
     ctx.waitUntil(completeDeferred(d,work,update));
     return reply(update?{type:6}:{type:5,data:{flags:64}});
   }
   console.warn('Formline interaction reached response deadline',d.type);
   return msg('Formline is taking longer than expected. Reopen the panel or try again.');
 }catch{console.error('Formline interaction failed',d.type);return msg('Formline is temporarily unavailable. Try again.');}
 finally{clearTimeout(timer);}
}

export async function interactions(request,env,ctx){
 const sig=fromHex(request.headers.get('X-Signature-Ed25519'),64),pk=fromHex(env.DISCORD_PUBLIC_KEY,32),stamp=request.headers.get('X-Signature-Timestamp');
 if(!sig||!pk||!stamp||!/^\d{1,12}$/.test(stamp)||Math.abs(Date.now()/1000-Number(stamp))>300)return reply({error:'Invalid signature'},401);
 const body=await request.text();if(body.length>65536)return reply({error:'Invalid request'},400);
 try{const key=await crypto.subtle.importKey('raw',pk,{name:'Ed25519'},false,['verify']);if(!await crypto.subtle.verify('Ed25519',key,sig,encoder.encode(stamp+body)))return reply({error:'Invalid signature'},401);}catch{return reply({error:'Invalid signature'},401);}
 let d;try{d=JSON.parse(body)}catch{return reply({error:'Invalid request'},400)}
 if(d.type===1)return reply({type:1});
 if(d.application_id!==env.DISCORD_CLIENT_ID)return reply({error:'Unsupported interaction'},400);
 if(!d.channel_id&&d.channel?.id)d.channel_id=d.channel.id;
 const work=dispatch(d,env);return bounded(d,work,ctx);
}
async function dispatch(d,env){
if(d.type===3||d.type===5){try{const result=await interactive(d,env);return result||msg('Unknown interaction.');}catch{return msg('Formline Interactive is temporarily unavailable.');}}if(d.type!==2)return reply({error:'Unsupported interaction'},400);
 const id=d.member?.user?.id||d.user?.id;if(typeof id!=='string'||!/^\d{17,20}$/.test(id))return reply({error:'Invalid Discord identity'},400);
 const origin=env.PUBLIC_ORIGIN,name=d.data?.name;
 if(d.data?.type===3&&name==='Open Formline panel'){try{return await openContextPanel(d,env)}catch{return msg('Could not open this panel. Try again.')}}
 if(name==='formline-setup'){
   if(!manager(d))return msg('Only a server manager can post the Formline access panel. Install Formline to this server first.');
   return reply({type:4,data:{embeds:[{title:'Every detail counts.',description:'Formline is a growing family of creative apps and tools. Connect your Discord account and request free beta access. Your activation code is private.',color:0x242429,footer:{text:'formline.'}}],components:links(origin),allowed_mentions:{parse:[]}}});
 }
 if(name==='pip')return msg('hi, i am **pip**! ♡\n\nI am Formline’s little helper. I can help you find our apps, releases, support and community.',{components:links(origin)});
 if(name==='apps')return msg('**Formline apps**\n\nDiscover our growing lineup of creative apps and tools through the official portal. New releases appear in the Formline community.',{components:links(origin)});
 if(name==='updates')return msg('Looking for the latest Formline updates? Check **#releases** in our community or visit the official portal.',{components:links(origin)});
 if(name==='community')return msg('Come say hi in the official Formline community! ♡',{components:links(origin,'support')});
 if(name==='feedback')return msg('Have an idea or found a bug? Head to **#feedback** or **#support** in the Formline community. Please avoid posting private codes.',{components:links(origin,'support')});
 if(name==='formline'||name==='beta')return msg(name==='beta'?'Connect Discord on the customer portal and request free beta access. No payment is required.':'Design, customize and organize your Discord workspace with Formline.',{components:links(origin)});
 if(name==='support')return msg('Need help with activation or a Formline tool? Visit the community. Never post your private activation code.',{components:links(origin,'support')});
 if(name==='help')return msg('**Formline commands**\n/formline — customer portal\n/license — private license status\n/beta — request free beta access\n/support — community support\n/status — service check\n/formline-setup — server managers: post an access panel.\nKeep license codes private.',{components:links(origin)});
 if(name==='status'){try{const row=await env.DB.prepare('SELECT 1 AS ok').first();return msg(row?.ok===1?'License database reachable. Discord authorization and DM delivery are separate services.':'License database unavailable.');}catch{return msg('License database temporarily unavailable.');}}
 if(name==='license'){
   try{const l=await env.DB.prepare("SELECT status FROM licenses WHERE customer_id=? ORDER BY CASE status WHEN 'available' THEN 0 WHEN 'redeemed' THEN 1 ELSE 2 END,created DESC LIMIT 1").bind(id).first();const req=await env.DB.prepare('SELECT status FROM beta_requests WHERE customer_id=?').bind(id).first();const message=l?.status==='available'?'Your license is ready. Sign in to the Formline portal to retrieve your private code.':l?.status==='redeemed'?'Your license has been activated.':req?.status==='pending'?'Your beta request is awaiting approval.':req?.status==='declined'?'Your beta request was declined.':l?.status==='revoked'?'Your license is inactive. Contact Formline support.':'You do not have an active license. Request beta access in Formline.';return msg(message,{components:links(origin)});}catch{return msg('License status temporarily unavailable.');}
 }
 return reply({error:'Unknown command'},400);
}
