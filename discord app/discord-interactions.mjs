// Formline Discord commands. Credentials stay in Worker secrets.
const encoder=new TextEncoder();
const invite='https://discord.gg/3EuqCaRcCY';
export const commands=[
 ...[['formline','Open the Formline portal'],['license','Check your license privately'],['beta','Request free Formline beta access'],['support','Find Formline support'],['help','Browse Formline commands'],['status','Check Formline service availability']].map(([name,description])=>({name,description,type:1,integration_types:[1],contexts:[0,1,2]})),
 {name:'formline-setup',description:'Post the Formline access panel in this server',type:1,integration_types:[0],contexts:[0],default_member_permissions:'32'}
];
function fromHex(s,n){return typeof s==='string'&&s.length===2*n&&/^[0-9a-f]+$/i.test(s)?Uint8Array.from(s.match(/../g),b=>parseInt(b,16)):null;}
function reply(body,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
function msg(content,extra={}){return reply({type:4,data:{content,flags:64,allowed_mentions:{parse:[]},...extra}});}
function links(origin,kind){return [{type:1,components:kind==='support'?[{type:2,style:5,label:'Join support server',url:invite}]:[{type:2,style:5,label:'Open Formline',url:origin},{type:2,style:5,label:'Community',url:invite}]}];}
function manager(d){try{return !!d.guild_id&&d.authorizing_integration_owners?.['0']===d.guild_id&&(BigInt(d.member?.permissions||'0')&40n)!==0n;}catch{return false;}}
export async function interactions(request,env){
 const sig=fromHex(request.headers.get('X-Signature-Ed25519'),64),pk=fromHex(env.DISCORD_PUBLIC_KEY,32),stamp=request.headers.get('X-Signature-Timestamp');
 if(!sig||!pk||!stamp||!/^\d{1,12}$/.test(stamp)||Math.abs(Date.now()/1000-Number(stamp))>300)return reply({error:'Invalid signature'},401);
 const body=await request.text();if(body.length>65536)return reply({error:'Invalid request'},400);
 try{const key=await crypto.subtle.importKey('raw',pk,{name:'Ed25519'},false,['verify']);if(!await crypto.subtle.verify('Ed25519',key,sig,encoder.encode(stamp+body)))return reply({error:'Invalid signature'},401);}catch{return reply({error:'Invalid signature'},401);}
 let d;try{d=JSON.parse(body)}catch{return reply({error:'Invalid request'},400)}
 if(d.type===1)return reply({type:1});
 if(d.type!==2||d.application_id!==env.DISCORD_CLIENT_ID)return reply({error:'Unsupported interaction'},400);
 const id=d.member?.user?.id||d.user?.id;if(typeof id!=='string'||!/^\d{17,20}$/.test(id))return reply({error:'Invalid Discord identity'},400);
 const origin=env.PUBLIC_ORIGIN,name=d.data?.name;
 if(name==='formline-setup'){
   if(!manager(d))return msg('Only a server manager can post the Formline access panel. Install Formline to this server first.');
   return reply({type:4,data:{embeds:[{title:'Every detail counts.',description:'Formline is a desktop toolkit for Discord creators. Connect your Discord account and request free beta access. Your activation code is private.',color:0x242429,footer:{text:'formline.'}}],components:links(origin),allowed_mentions:{parse:[]}}});
 }
 if(name==='formline'||name==='beta')return msg(name==='beta'?'Connect Discord on the customer portal and request free beta access. No payment is required.':'Design, customize and organize your Discord workspace with Formline.',{components:links(origin)});
 if(name==='support')return msg('Need help with activation or a Formline tool? Visit the community. Never post your private activation code.',{components:links(origin,'support')});
 if(name==='help')return msg('**Formline commands**\n/formline — customer portal\n/license — private license status\n/beta — request free beta access\n/support — community support\n/status — service check\n/formline-setup — server managers: post an access panel.\nKeep license codes private.',{components:links(origin)});
 if(name==='status'){try{const row=await env.DB.prepare('SELECT 1 AS ok').first();return msg(row?.ok===1?'License database reachable. Discord authorization and DM delivery are separate services.':'License database unavailable.');}catch{return msg('License database temporarily unavailable.');}}
 if(name==='license'){
   try{const l=await env.DB.prepare("SELECT status FROM licenses WHERE customer_id=? ORDER BY CASE status WHEN 'available' THEN 0 WHEN 'redeemed' THEN 1 ELSE 2 END,created DESC LIMIT 1").bind(id).first();const req=await env.DB.prepare('SELECT status FROM beta_requests WHERE customer_id=?').bind(id).first();const message=l?.status==='available'?'Your license is ready. Sign in to the Formline portal to retrieve your private code.':l?.status==='redeemed'?'Your license has been activated.':req?.status==='pending'?'Your beta request is awaiting approval.':req?.status==='declined'?'Your beta request was declined.':l?.status==='revoked'?'Your license is inactive. Contact Formline support.':'You do not have an active license. Request beta access in Formline.';return msg(message,{components:links(origin)});}catch{return msg('License status temporarily unavailable.');}
 }
 return reply({error:'Unknown command'},400);
}
