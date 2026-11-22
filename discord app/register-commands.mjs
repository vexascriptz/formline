// Node 22+. Read the bot token from an environment variable, never a source file.
const id=process.env.DISCORD_CLIENT_ID||'1573885202671996939';
const token=process.env.DISCORD_BOT_TOKEN;
if(!token||!/^\d{17,20}$/.test(id))throw Error('Set DISCORD_BOT_TOKEN and a valid DISCORD_CLIENT_ID.');
for(const command of [{name:'formline',description:'Open the Formline beta portal'},{name:'license',description:'Check your Formline license status privately'}]){
 const response=await fetch(`https://discord.com/api/v10/applications/${id}/commands`,{method:'POST',headers:{Authorization:'Bot '+token,'Content-Type':'application/json'},body:JSON.stringify({...command,type:1})});
 if(!response.ok)throw Error(`${command.name}: Discord returned ${response.status}`);
 console.log(`Registered /${command.name}`);
}
