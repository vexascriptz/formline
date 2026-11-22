// Node 22+. Use private environment variables, never hardcode tokens.
import {commands} from './discord-interactions.mjs';
const id=process.env.DISCORD_CLIENT_ID||'1573885202671996939', token=process.env.DISCORD_BOT_TOKEN;
if(!token||!/^\d{17,20}$/.test(id))throw Error('Set DISCORD_BOT_TOKEN and a valid DISCORD_CLIENT_ID.');
const headers={Authorization:'Bot '+token,'Content-Type':'application/json'};
const a=await fetch('https://discord.com/api/v10/oauth2/applications/@me',{headers});if(!a.ok)throw Error('Application check failed: '+a.status);
const app=await a.json();if(app.id!==id)throw Error('Token belongs to a different application.');
const guild=!!app.integration_types_config?.['0'];
for(const command of commands.filter(c=>c.name!=='formline-setup'||guild).map(c=>c.name==='formline-setup'?c:{...c,integration_types:guild?[0,1]:[1]})){
 const r=await fetch('https://discord.com/api/v10/applications/'+id+'/commands',{method:'POST',headers,body:JSON.stringify(command)});
 if(!r.ok)throw Error(command.name+': Discord returned '+r.status);console.log('Registered /'+command.name);
}
if(!guild)console.log('Enable Guild Install in the Developer Portal to register /formline-setup.');
