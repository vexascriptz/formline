// Formline 1.8 — Discord role access; staged rollout preserves existing customers.
const guild='1391162919353319505', enc=new TextEncoder();
const snow=x=>typeof x==='string'&&/^\d{17,20}$/.test(x), hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const now=()=>Math.floor(Date.now()/1000), toHex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const random=(n=32)=>toHex(crypto.getRandomValues(new Uint8Array(n))), hash=async s=>toHex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
const q=(e,s,...v)=>e.DB.prepare(s).bind(...v), one=(e,s,...v)=>q(e,s,...v).first(), run=(e,s,...v)=>q(e,s,...v).run(), all=async(e,s,...v)=>(await q(e,s,...v).all()).results;
const json=(o,status=200)=>Response.json(o,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const failure=(error,status=400)=>json({error},status);
const cookie=(name,value,age)=>name+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+age;
const getCookie=(r,k)=>(r.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(k+'='))?.slice(k.length+1)||'';
async function discord(e,path,method='GET',body){
 const res=await fetch('https://discord.com/api/v10'+path,{method,headers:{Authorization:'Bot '+e.DISCORD_BOT_TOKEN,Accept:'application/json','User-Agent':'DiscordBot (https://github.com/vexascriptz/formline, 2.0)','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual',signal:AbortSignal.timeout(10000)});
 if(res.status===404)return null;if(!res.ok)throw Error('Discord unavailable (HTTP '+res.status+')');return res.status===204?{}:await res.json();
}
async function role(e){const roles=await discord(e,'/guilds/'+guild+'/roles');const found=Array.isArray(roles)?roles.filter(r=>!r.managed&&r.name==='Customer'):[];if(found.length!==1||!snow(found[0].id))throw Error('Exactly one Customer role must exist');return found[0].id;}
async function rawHas(e,id){if(!snow(id))return false;const [rid,member]=await Promise.all([role(e),discord(e,'/guilds/'+guild+'/members/'+id)]);return !!member&&Array.isArray(member.roles)&&member.roles.includes(rid);}
export async function hasCustomer(e,id){if(!snow(id)||await one(e,'SELECT customer_id FROM role_denials WHERE customer_id=?',id))return false;return rawHas(e,id);}
async function changeRole(e,id,grant){const rid=await role(e),member=await discord(e,'/guilds/'+guild+'/members/'+id);if(!member){if(!grant)return;throw Error('Join Formline Studios first');}if(member.roles?.includes(rid)===grant)return;const result=await discord(e,'/guilds/'+guild+'/members/'+id+'/roles/'+rid,grant?'PUT':'DELETE');if(!result||await rawHas(e,id)!==grant)throw Error('Discord has not confirmed role change');}
export async function rolloutReady(e){return (await one(e,'SELECT status FROM role_rollout WHERE id=1'))?.status==='ready';}
export async function authorizedDesktop(e,d){if(!hex(d?.token)||!hex(d?.device))return null;const th=await hash(d.token),dh=await hash(d.device);const session=await one(e,'SELECT customer_id FROM role_sessions WHERE token_hash=? AND client_hash=? AND expires>?',th,dh,now());if(session)return await hasCustomer(e,session.customer_id)?{...session,id:'discord-'+session.customer_id}:null;const row=await one(e,"SELECT id,customer_id FROM licenses WHERE status='redeemed' AND session_hash=? AND device_hash=?",th,dh);if(!row||await one(e,'SELECT customer_id FROM role_denials WHERE customer_id=?',row.customer_id))return null;return !await rolloutReady(e)||await hasCustomer(e,row.customer_id)?row:null;}
async function rate(e,scope,max,seconds=300){const r=await one(e,'INSERT INTO limits VALUES(?,?,1) ON CONFLICT(scope) DO UPDATE SET attempts=CASE WHEN bucket=excluded.bucket THEN attempts+1 ELSE 1 END,bucket=excluded.bucket RETURNING attempts',scope,Math.floor(now()/seconds));return r.attempts<=max;}
export async function roleAccessRoute(r,e){const u=new URL(r.url),p=u.pathname;
 if(p==='/auth/desktop/role-connect'&&r.method==='GET'){
  const pair=u.searchParams.get('pair'),key=u.searchParams.get('key');if(!hex(pair)||!hex(key))return failure('Invalid sign-in request.');
  const row=await one(e,"SELECT pair_id FROM role_pairs WHERE pair_id=? AND browser_hash=? AND status='pending' AND expires>?",pair,await hash(key),now());if(!row)return failure('Sign-in expired. Return to the app.',410);
  return new Response(null,{status:303,headers:{Location:'/auth/start','Set-Cookie':cookie('fl_role_pair',pair+'.'+key,600),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }
 if(p!=='/api/desktop/access'||r.method!=='POST')return null;
 const raw=await r.text();if(raw.length>4096)return failure('Invalid request.',413);let d;try{d=JSON.parse(raw)}catch{return failure('Invalid request.');}if(!d||typeof d!=='object')return failure('Invalid request.');
 if(d.action==='begin'){
  if(!hex(d.device))return failure('Invalid client.');if(!await rate(e,'role-begin:'+await hash(r.headers.get('CF-Connecting-IP')||'unknown'),20))return failure('Try again later.',429);
  const pair=random(),browser=random(),poll=random();await run(e,'DELETE FROM role_pairs WHERE expires<=?',now());await run(e,"INSERT INTO role_pairs(pair_id,browser_hash,poll_hash,client_hash,status,expires) VALUES(?,?,?,?,'pending',?)",pair,await hash(browser),await hash(poll),await hash(d.device),now()+600);
  return json({pair,poll,url:e.PUBLIC_ORIGIN+'/auth/desktop/role-connect?pair='+pair+'&key='+browser});
 }
 if(d.action==='poll'){
  if(!await rate(e,'role-poll:'+await hash(r.headers.get('CF-Connecting-IP')||'unknown'),240))return failure('Try again shortly.',429);
  if(!hex(d.pair)||!hex(d.poll)||!hex(d.device))return failure('Invalid sign-in request.');
  const ph=await hash(d.poll),ch=await hash(d.device),row=await one(e,'SELECT * FROM role_pairs WHERE pair_id=? AND poll_hash=? AND client_hash=? AND expires>?',d.pair,ph,ch,now());if(!row)return failure('Sign-in expired. Start again.',410);
  if(row.status!=='complete')return json({connected:false});
  if(!await hasCustomer(e,row.customer_id))return json({connected:false,needs_redemption:true});
  await run(e,'INSERT INTO role_sessions(token_hash,client_hash,customer_id,expires) VALUES(?,?,?,?) ON CONFLICT(token_hash) DO NOTHING',ph,ch,row.customer_id,now()+30*86400);
  const user=await one(e,'SELECT id,username,display_name,avatar FROM customers WHERE id=?',row.customer_id);
  let legacy_match=false;if(hex(d.legacy_token)&&hex(d.legacy_device)){const old=await one(e,"SELECT customer_id FROM licenses WHERE status='redeemed' AND session_hash=? AND device_hash=?",await hash(d.legacy_token),await hash(d.legacy_device));legacy_match=old?.customer_id===row.customer_id;}
  return json({connected:true,customer_role_granted:true,user,token:d.poll,legacy_match});
 }
 if(d.action==='validate'){if(!await rate(e,'role-validate:'+await hash(r.headers.get('CF-Connecting-IP')||'unknown'),600))return failure('Try again shortly.',429);const row=await authorizedDesktop(e,d);if(!row)return json({active:false,code:'access_inactive'},401);return json({active:true,customer_id:row.customer_id});}
 if(d.action==='logout'){if(hex(d.token)&&hex(d.device)){const th=await hash(d.token),dh=await hash(d.device);await e.DB.batch([q(e,'DELETE FROM role_sessions WHERE token_hash=? AND client_hash=?',th,dh),q(e,'DELETE FROM role_pairs WHERE poll_hash=? AND client_hash=?',th,dh)]);}return json({ok:true});}
 return failure('Unknown access action.');
}
export async function finishRolePair(r,e,user,token,storeConnection){const val=getCookie(r,'fl_role_pair');if(!val)return 'none';const [pair,key]=val.split('.');if(!hex(pair)||!hex(key)||!snow(user.id))return 'expired';const row=await one(e,"SELECT pair_id FROM role_pairs WHERE pair_id=? AND browser_hash=? AND status='pending' AND expires>?",pair,await hash(key),now());if(!row)return 'expired';if(!token.access_token||!token.refresh_token||!String(token.scope||'').split(/\s+/).includes('guilds'))return 'scope';await storeConnection(e,user.id,token);const changed=await one(e,"UPDATE role_pairs SET customer_id=?,status='complete' WHERE pair_id=? AND status='pending' AND expires>? RETURNING pair_id",user.id,pair,now());return changed?'connected':'expired';}
export const roleCommands=[
 {name:'redeem',description:'Redeem your Formline code privately',type:1,integration_types:[0,1],contexts:[0,1,2],options:[{name:'code',description:'Your one-time code',type:3,required:true}]},
 {name:'access',description:'Check Formline access privately',type:1,integration_types:[0,1],contexts:[0,1,2]},
 ...[['generate','Generate a code for a customer'],['revoke','Remove a customer access'],['lookup','Check a customer access']].map(([name,description])=>({name,description,type:1,integration_types:[0],contexts:[0],default_member_permissions:'8',options:[{name:'customer',description:'Discord account',type:6,required:true}]}))];
const msg=content=>json({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
async function makeCode(e,id){const lid=random(16),gen=random(16);const key=await crypto.subtle.importKey('raw',enc.encode(e.LICENSE_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);const code='FL-'+toHex(await crypto.subtle.sign('HMAC',key,enc.encode('license:'+lid+':'+gen))).slice(0,32).toUpperCase();await run(e,'INSERT INTO licenses(id,customer_id,generation,code_hash,created) VALUES(?,?,?,?,?)',lid,id,gen,await hash(code),now());return code;}
async function denyAndRemove(e,id){await e.DB.batch([q(e,'INSERT OR IGNORE INTO role_denials VALUES(?)',id),q(e,'DELETE FROM role_sessions WHERE customer_id=?',id),q(e,'DELETE FROM role_pairs WHERE customer_id=?',id)]);await changeRole(e,id,false);await run(e,'DELETE FROM role_denials WHERE customer_id=?',id);}
export async function roleCommand(d,e,id){const name=d.data?.name;if(!roleCommands.some(c=>c.name===name))return null;const opts=d.data?.options||[];try{
 if(name==='access')return msg(await hasCustomer(e,id)?'Your Customer role is active. Connect Discord in Formline to unlock it.':'No Customer role. Join Formline Studios and use /redeem with your code.');
 if(name==='redeem'){
  if(!await rate(e,'role-redeem:'+id,5))return msg('Too many attempts. Try again in a few minutes.');const code=String(opts.find(x=>x.name==='code')?.value||'').trim().toUpperCase();if(!/^FL-[A-F0-9]{32}$/.test(code))return msg('Invalid, used, or account-mismatched code.');
  const l=await one(e,'SELECT id,status,customer_id FROM licenses WHERE code_hash=? AND customer_id=?',await hash(code),id);if(!l)return msg('Invalid, used, or account-mismatched code.');
  if(l.status==='available'){await e.DB.batch([q(e,"INSERT INTO role_redemptions(license_id,customer_id,state) SELECT id,customer_id,'pending' FROM licenses WHERE id=? AND customer_id=? AND status='available' ON CONFLICT(license_id) DO NOTHING",l.id,id),q(e,"UPDATE licenses SET status='redeemed',redeemed=?,session_hash=NULL,device_hash=NULL WHERE id=? AND status='available' AND EXISTS(SELECT 1 FROM role_redemptions WHERE license_id=? AND customer_id=? AND state='pending')",now(),l.id,l.id,id)]);}
  const reserved=await one(e,"SELECT l.status,r.state FROM licenses l JOIN role_redemptions r ON l.id=r.license_id WHERE l.id=? AND l.customer_id=?",l.id,id);if(!reserved||reserved.status!=='redeemed'||reserved.state!=='pending')return msg('This code has already been used or revoked.');
  await changeRole(e,id,true);const done=await one(e,"UPDATE role_redemptions SET state='complete' WHERE license_id=? AND state='pending' AND EXISTS(SELECT 1 FROM licenses WHERE id=? AND status='redeemed') RETURNING license_id",l.id,l.id);if(!done){const current=await one(e,"SELECT r.state,l.status FROM role_redemptions r JOIN licenses l ON r.license_id=l.id WHERE r.license_id=?",l.id);if(current?.state!=='complete'||current?.status!=='redeemed'){await denyAndRemove(e,id);return msg('Access was revoked. Contact support.');}}
  await run(e,"DELETE FROM role_denials WHERE customer_id=? AND EXISTS(SELECT 1 FROM licenses WHERE id=? AND status='redeemed')",id,l.id);
  return msg('Code redeemed. Your Customer role is active. Open Formline and connect Discord.');
 }
 if(!String(e.ADMIN_DISCORD_IDS||'').split(/[,\s]+/).includes(id)||d.guild_id!==guild)return msg('Administrator access required.');
 const target=String(opts.find(x=>x.name==='customer')?.value||'');if(!snow(target))return msg('Choose a customer.');
 if(name==='lookup')return msg('<@'+target+'> — '+(await hasCustomer(e,target)?'Customer access active':'No Customer role')+'.');
 if(name==='generate'){if(!await rate(e,'role-issue:'+id,30,3600))return msg('Generation limit reached.');const u=d.data?.resolved?.users?.[target];if(!u||u.bot)return msg('Choose a real Discord user.');await run(e,'INSERT INTO customers(id,username,display_name,avatar,updated) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING',target,u.username,u.global_name||null,u.avatar||null,now());return msg('One-time code (bound to selected customer): '+String.fromCharCode(96)+await makeCode(e,target)+String.fromCharCode(96));}
 if(name==='revoke'){await e.DB.batch([q(e,"UPDATE licenses SET status='revoked',session_hash=NULL WHERE customer_id=? AND status IN ('redeemed','available')",target),q(e,"UPDATE role_redemptions SET state='revoked' WHERE customer_id=?",target),q(e,'INSERT OR IGNORE INTO role_denials VALUES(?)',target),q(e,'DELETE FROM role_sessions WHERE customer_id=?',target),q(e,'DELETE FROM role_pairs WHERE customer_id=?',target)]);await denyAndRemove(e,target);return msg('Customer role removed and existing sessions revoked.');}
 }catch(err){return msg('Could not complete access operation. '+(name==='redeem'?'If your code was reserved, retry after joining the server.':'Check Discord availability and role permissions.'))}return null;}
export async function removeCustomerIfNoEntitlement(e,id){const remaining=await one(e,"SELECT id FROM licenses WHERE customer_id=? AND status='redeemed' LIMIT 1",id);if(remaining)return;await denyAndRemove(e,id);}
// Run only from the scheduled event or service initialization. No user-supplied command data.
export async function reconcileRollout(e){
 const claim=await one(e,"UPDATE role_rollout SET updated=?,detail='Checking Discord' WHERE id=1 AND status!='ready' AND updated<? RETURNING registered",now(),now()-90);if(!claim)return;
 let registered=claim.registered;
 try{
  const app=await discord(e,'/oauth2/applications/@me'), bot=await discord(e,'/users/@me');
  if(!app||app.id!==e.DISCORD_CLIENT_ID||!app.integration_types_config?.['0']||!snow(bot?.id))throw Error('Discord guild installation not enabled');
  const [roles,member]=await Promise.all([discord(e,'/guilds/'+guild+'/roles'),discord(e,'/guilds/'+guild+'/members/'+bot.id)]);
  const cr=roles?.filter(r=>r.name==='Customer'&&!r.managed)||[];
  if(cr.length!==1||!member)throw Error('Customer role or bot membership missing');
  const mine=roles.filter(r=>r.id===guild||member.roles?.includes(r.id));
  const perms=mine.reduce((p,r)=>p|BigInt(r.permissions||'0'),0n);
  if(!(perms&8n)&&!(perms&268435456n))throw Error('Pip needs Manage Roles');
  if(Math.max(...mine.map(r=>r.position))<=cr[0].position)throw Error('Pip role must be above Customer');
  if(!registered){for(const command of roleCommands){await discord(e,'/applications/'+e.DISCORD_CLIENT_ID+'/commands','POST',command);}
    const active=await discord(e,'/applications/'+e.DISCORD_CLIENT_ID+'/commands');if(!roleCommands.every(c=>active?.some(a=>a.name===c.name&&a.type===1)))throw Error('Discord command verification incomplete');
    registered=1;await run(e,"UPDATE role_rollout SET registered=1,detail='Commands confirmed' WHERE id=1");
  }
  const legacy=await all(e,"SELECT DISTINCT customer_id FROM licenses WHERE status='redeemed' AND session_hash IS NOT NULL");
  let missing=0;for(const u of legacy){if(await rawHas(e,u.customer_id))continue;const m=await discord(e,'/guilds/'+guild+'/members/'+u.customer_id);if(!m){missing++;continue;}await changeRole(e,u.customer_id,true);}
  if(missing){await run(e,"UPDATE role_rollout SET status='pending',detail=?,updated=? WHERE id=1",missing+' existing customer(s) need to join the server; old activation stays compatible',now());return;}
  await run(e,"UPDATE role_rollout SET status='ready',registered=1,detail='Five commands verified; Customer role preflight and legacy migration passed',updated=? WHERE id=1",now());
 }catch(err){await run(e,"UPDATE role_rollout SET status='pending',registered=?,detail=?,updated=? WHERE id=1",registered,String(err.message||'Discord check failed').slice(0,160),now());}
}
