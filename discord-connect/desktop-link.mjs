// Browser OAuth linking for licensed Formline Desktop. No user tokens leave Cloudflare.
const id=x=>typeof x==='string'&&/^\d{17,20}$/.test(x);
const hex=(x,n)=>typeof x==='string'&&new RegExp('^[0-9a-f]{'+n+'}$').test(x);
const encoder=new TextEncoder();
const b64=x=>btoa(String.fromCharCode(...new Uint8Array(x))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'=='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
async function cipherKey(e){const bits=await crypto.subtle.digest('SHA-256',encoder.encode('Formline Discord OAuth storage v1:'+e.LICENSE_SECRET));return crypto.subtle.importKey('raw',bits,'AES-GCM',false,['encrypt','decrypt'])}
async function encrypt(e,obj){const iv=crypto.getRandomValues(new Uint8Array(12));const bytes=encoder.encode(JSON.stringify(obj));return b64(iv)+'.'+b64(await crypto.subtle.encrypt({name:'AES-GCM',iv},await cipherKey(e),bytes));}
async function decrypt(e,value){const parts=String(value||'').split('.');if(parts.length!==2)throw Error('Invalid encrypted session');const iv=unb64(parts[0]);return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},await cipherKey(e),unb64(parts[1]))));}
async function meGuilds(access){
 const all=[],seen=new Set();let before='';
 for(let page=0;page<5;page++){
  const url='https://discord.com/api/v10/users/@me/guilds?limit=200'+(before?'&before='+before:'');
  const res=await fetch(url,{headers:{Authorization:'Bearer '+access,Accept:'application/json'},signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!res.ok)throw Error('Discord guild permission lookup unavailable');
  const batch=await res.json();
  if(!Array.isArray(batch))throw Error('Unexpected guild permission response');
  for(const g of batch)if(id(g.id)&&!seen.has(g.id)){seen.add(g.id);all.push(g)}
  if(batch.length<200)break;
  const last=batch.at(-1)?.id;if(!id(last)||last===before)break;before=last;
 }
 return all.filter(g=>id(g.id)&&(g.owner===true||((BigInt(g.permissions||g.permissions_new||'0')&8n)!==0n))).map(g=>({id:g.id,name:typeof g.name==='string'?g.name.slice(0,100):'Server',icon:typeof g.icon==='string'?g.icon:null,owner:g.owner===true}));
}
async function freshToken(e,customer,h){
 const row=await h.one(e,'SELECT encrypted,expires FROM desktop_connections WHERE customer_id=?',customer);
 if(!row)return null;
 const data=await decrypt(e,row.encrypted);
 if(!data.access_token||!data.refresh_token)throw Error('Discord connection needs renewal');
 if(data.expires_at>h.now()+90)return data.access_token;
 const res=await fetch('https://discord.com/api/v10/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:e.DISCORD_CLIENT_ID,client_secret:e.DISCORD_CLIENT_SECRET,grant_type:'refresh_token',refresh_token:data.refresh_token}),signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!res.ok){await h.run(e,'DELETE FROM desktop_connections WHERE customer_id=?',customer);throw Error('Discord connection expired. Connect again.')}
 const fresh=await res.json();
 if(!fresh.access_token||!fresh.refresh_token||!String(fresh.scope||'').split(/\s+/).includes('guilds'))throw Error('Discord authorization missing guilds permission');
 const next={access_token:fresh.access_token,refresh_token:fresh.refresh_token,expires_at:h.now()+Number(fresh.expires_in||3600),scope:fresh.scope};
 const protectedValue=await encrypt(e,next);
 // Conditional rotation prevents two overlapping refreshes overwriting tokens.
 await h.run(e,'UPDATE desktop_connections SET encrypted=?,expires=?,updated=? WHERE customer_id=? AND encrypted=?',protectedValue,next.expires_at,h.now(),customer,row.encrypted);
 return next.access_token;
}
export async function isDiscordAdmin(e,customer,guild,h){
 if(!id(guild))return false;
 const access=await freshToken(e,customer,h);if(!access)return false;
 return (await meGuilds(access)).some(g=>g.id===guild);
}
export async function desktopLink(d,e,customer,h){
 const action=d?.action;
 if(action==='begin'){
  if(!await h.limit(e,'desktop-pair:'+customer,8,3600))return {error:'Too many connection requests.',status:429};
  const pair=h.random(16),key=h.random(24),expires=h.now()+600;
  await h.run(e,"DELETE FROM desktop_pairs WHERE customer_id=? AND status='pending'",customer);
  await h.run(e,"INSERT INTO desktop_pairs(pair_id,key_hash,customer_id,status,created,expires) VALUES(?,?,?,'pending',?,?)",pair,await digest(key),customer,h.now(),expires);
  return {connected:false,url:e.PUBLIC_ORIGIN+'/auth/desktop/connect?pair='+pair+'&key='+key,expires};
 }
 if(action==='status'){
  const connected=await h.one(e,'SELECT customer_id,expires FROM desktop_connections WHERE customer_id=?',customer);
  const user=connected?await h.one(e,'SELECT id,username,display_name,avatar FROM customers WHERE id=?',customer):null;
  return {connected:!!connected,user:user?{id:user.id,username:user.username,display_name:user.display_name,avatar:user.avatar}:null,expires:connected?.expires||null};
 }
 if(action==='disconnect'){
  await h.run(e,'DELETE FROM desktop_connections WHERE customer_id=?',customer);
  await h.run(e,'DELETE FROM desktop_pairs WHERE customer_id=?',customer);
  return {ok:true,connected:false};
 }
 if(action==='guilds'){
  if(!await h.limit(e,'desktop-guilds:'+customer,45,300))return {error:'Try again in a few minutes.',status:429};
  const access=await freshToken(e,customer,h);if(!access)return {error:'Connect Discord before choosing a server.',status:401};
  const guilds=await meGuilds(access);
  return {ok:true,guilds};
 }
 if(action==='channels'){
  if(!id(d.guild_id))return {error:'Select a server.',status:400};
  if(!await h.limit(e,'desktop-channels:'+customer,40,300))return {error:'Try again in a few minutes.',status:429};
  if(!await isDiscordAdmin(e,customer,d.guild_id,h))return {error:'Administrator permission required. Reconnect Discord if your permissions changed.',status:403};
  let guild,channels;
  try{[guild,channels]=await Promise.all([h.discord(e,'/guilds/'+d.guild_id),h.discord(e,'/guilds/'+d.guild_id+'/channels')]);}
  catch{return {error:'Formline bot cannot access this server. Install the bot first.',status:409};}
  if(!Array.isArray(channels))return {error:'Could not load channels.',status:502};
  return {ok:true,server:{id:d.guild_id,name:guild.name},channels:channels.filter(c=>[0,5].includes(c.type)).map(c=>({id:c.id,name:c.name,type:c.type,category:c.parent_id||null})).sort((a,b)=>a.name.localeCompare(b.name))};
 }
 return {error:'Unknown Discord connection action.',status:400};
}
export async function connectBrowser(r,e,u,h){
 const pair=u.searchParams.get('pair'),key=u.searchParams.get('key');
 if(!hex(pair,32)||!hex(key,48))return new Response('Invalid or expired Formline connection.',{status:400});
 const row=await h.one(e,"SELECT customer_id FROM desktop_pairs WHERE pair_id=? AND key_hash=? AND status='pending' AND expires>?",pair,await digest(key),h.now());
 if(!row)return new Response('Connection request expired. Return to Formline and start again.',{status:410});
 const headers=new Headers({Location:'/auth/start','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
 headers.append('Set-Cookie','fl_pair='+pair+'.'+key+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
 return new Response(null,{status:303,headers});
}
export async function finishBrowserPair(r,e,user,token,h){
 const cookie=h.getCookie(r,'fl_pair');if(!cookie)return 'none';
 const [pair,key]=cookie.split('.');
 if(!hex(pair,32)||!hex(key,48))return 'expired';
 const row=await h.one(e,"SELECT customer_id FROM desktop_pairs WHERE pair_id=? AND key_hash=? AND status='pending' AND expires>?",pair,await digest(key),h.now());
 if(!row)return 'expired';
 if(user.id!==row.customer_id)return 'mismatch';
 if(!token.access_token||!token.refresh_token||!String(token.scope||'').split(/\s+/).includes('guilds'))return 'scope';
 const expires=h.now()+Math.max(60,Number(token.expires_in||3600));
 const encrypted=await encrypt(e,{access_token:token.access_token,refresh_token:token.refresh_token,expires_at:expires,scope:token.scope});
 await h.run(e,'INSERT INTO desktop_connections(customer_id,encrypted,expires,updated) VALUES(?,?,?,?) ON CONFLICT(customer_id) DO UPDATE SET encrypted=excluded.encrypted,expires=excluded.expires,updated=excluded.updated',user.id,encrypted,expires,h.now());
 await h.run(e,"UPDATE desktop_pairs SET status='complete',completed=? WHERE pair_id=? AND customer_id=?",h.now(),pair,user.id);
 return 'connected';
}
export function connectedPage(status){
 const message=status==='connected'?'Discord connected. Return to Formline.':status==='mismatch'?'Use the same Discord account that owns your Formline license.':status==='scope'?'Allow Formline to view your servers, then try again.':'Connection expired. Start again from the app.';
 const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;':'&quot;'}[c]));
 return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Formline · Connect Discord</title><style>body{background:#111113;color:#f2f1ee;font:16px system-ui;margin:0;display:grid;place-items:center;min-height:100vh;padding:24px}main{max-width:430px}p{color:#aaa;line-height:1.6}h1{font-size:36px;letter-spacing:-.05em}</style><main><p>formline.</p><h1>'+esc(status==='connected'?'You’re connected.':'Connection not finished.')+'</h1><p>'+esc(message)+'</p></main></html>';
}
