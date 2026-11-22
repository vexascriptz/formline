// Discord interactions are authenticated with the application's public Ed25519 key.
const encoder = new TextEncoder();
function fromHex(s,bytes){if(typeof s!=='string'||s.length!==bytes*2||!/^[0-9a-f]+$/i.test(s))return null;return Uint8Array.from(s.match(/../g),b=>parseInt(b,16));}
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function interactions(request,env){
 const signature=fromHex(request.headers.get('X-Signature-Ed25519'),64), publicKey=fromHex(env.DISCORD_PUBLIC_KEY,32), stamp=request.headers.get('X-Signature-Timestamp');
 if(!signature||!publicKey||!stamp||!/^\d{1,12}$/.test(stamp)||Math.abs(Date.now()/1000-Number(stamp))>300)return reply({error:'Invalid signature'},401);
 const body=await request.text();if(body.length>65536)return reply({error:'Invalid request'},400);
 try{const key=await crypto.subtle.importKey('raw',publicKey,{name:'Ed25519'},false,['verify']);if(!await crypto.subtle.verify('Ed25519',key,signature,encoder.encode(stamp+body)))return reply({error:'Invalid signature'},401);}catch{return reply({error:'Invalid signature'},401);}
 let data;try{data=JSON.parse(body)}catch{return reply({error:'Invalid request'},400)}
 if(data.type===1)return reply({type:1});
 if(data.type!==2||data.application_id!==env.DISCORD_CLIENT_ID)return reply({error:'Unsupported interaction'},400);
 const id=data.member?.user?.id||data.user?.id;
 if(typeof id!=='string'||!/^\d{17,20}$/.test(id))return reply({error:'Invalid Discord identity'},400);
 const name=data.data?.name;
 let message='Open Formline to connect your Discord account, request beta access, and manage your license.';
 if(name==='license'){
   try{const l=await env.DB.prepare('SELECT status FROM licenses WHERE customer_id=? ORDER BY created DESC LIMIT 1').bind(id).first();const req=await env.DB.prepare('SELECT status FROM beta_requests WHERE customer_id=?').bind(id).first();message=l?.status==='available'?'Your license is ready. Sign in to the Formline portal to retrieve your private code.':l?.status==='redeemed'?'Your license has been activated.':req?.status==='pending'?'Your beta request is awaiting approval.':req?.status==='declined'?'Your beta request was declined.':l?.status==='revoked'?'Your license is inactive. Contact Formline support.':'You do not have an active license. Request beta access in Formline.';}catch{message='License status is temporarily unavailable. Try the Formline portal.';}
 }else if(name!=='formline')return reply({error:'Unknown command'},400);
 return reply({type:4,data:{content:message+'\n'+env.PUBLIC_ORIGIN,flags:64,allowed_mentions:{parse:[]}}});
}
