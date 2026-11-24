// Pip command consolidation. License operations are restricted to Formline Studios.
import {roleCommand,hasCustomer,licenseAdmin} from './role-access.mjs';
const guild='1391162919353319505',invite='https://discord.gg/3EuqCaRcCY';
const snow=x=>typeof x==='string'&&/^\d{17,20}$/.test(x),now=()=>Math.floor(Date.now()/1000);
const q=(e,s,...v)=>e.DB.prepare(s).bind(...v),one=(e,s,...v)=>q(e,s,...v).first(),run=(e,s,...v)=>q(e,s,...v).run(),all=async(e,s,...v)=>(await q(e,s,...v).all()).results;
const sub=(name,description,options=[])=>({name,description,type:1,...(options.length?{options}:{})});
const customer=(required=true)=>({name:'customer',description:'Discord member',type:6,required});
export const licenseCommand={name:'license',description:'Manage Formline licenses and Customer access',type:1,options:[
 sub('redeem','Redeem a one-time code privately',[{name:'code',description:'Leave blank to open the private redemption form',type:3,required:false}]),
 sub('view','View your licenses privately'),
 sub('generate','Staff: generate a code for a member',[customer()]),
 sub('revoke','Staff: revoke a member’s access',[customer()]),
 sub('check','Check access; staff may select a member',[customer(false)])
]};
const sections=['about','apps','updates','support','community','feedback','status'];
export const formlineCommand={name:'formline',description:'Explore Formline, apps, updates and support',type:1,integration_types:[0,1],contexts:[0,1,2],options:[{name:'section',description:'Choose a section',type:3,required:false,choices:sections.map(s=>({name:s.charAt(0).toUpperCase()+s.slice(1),value:s}))}]};
const retired=['redeem','access','generate','revoke','lookup','license','pip','apps','updates','community','feedback','beta','support','help','status'];
const response=(type,data)=>Response.json({type,data},{headers:{'Cache-Control':'no-store'}});
const button=(label,id,style=2)=>({type:2,style,label,custom_id:id}),link=(label,url)=>({type:2,style:5,label,url});
const row=(...components)=>({type:1,components});
const meta=async e=>await one(e,'SELECT license_id,formline_id,avatar_url FROM pip_command_rollout WHERE id=1');
const mention=(m,name,sub)=>snow(m?.[name+'_id'])?'</'+name+(sub?' '+sub:'')+':'+m[name+'_id']+'>':'/'+name+(sub?' '+sub:'');
function embed(title,description,info,color=0xe8e6e2,fields=[]){return {title,description,color,footer:{text:'formline. • pip'},...(fields.length?{fields}:{}),...(info?.avatar_url?{thumbnail:{url:info.avatar_url}}:{})}}
function card(title,description,info,components=[],color=0xe8e6e2,fields=[]){return response(4,{flags:64,embeds:[embed(title,description,info,color,fields)],components,allowed_mentions:{parse:[]}})}
const actions=()=>[row(button('Redeem code','fl-license:redeem',1),button('My licenses','fl-license:view'),button('Check access','fl-license:check'))];
function modal(){return response(9,{custom_id:'fl-license:submit',title:'Redeem Formline code',components:[row({type:4,custom_id:'code',label:'One-time code',style:1,required:true,min_length:35,max_length:35,placeholder:'FL-…'})]})}
async function discord(e,path,method='GET',body){const res=await fetch('https://discord.com/api/v10'+path,{method,headers:{Authorization:'Bot '+e.DISCORD_BOT_TOKEN,Accept:'application/json','Content-Type':'application/json','User-Agent':'DiscordBot (https://github.com/vexascriptz/formline, 2.1)'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual',signal:AbortSignal.timeout(10000)});if(!res.ok)throw Error('Discord HTTP '+res.status);return res.status===204?{}:await res.json()}
async function channelLinks(e,section){const targets={apps:['app-index','discord','steam'],updates:['announcements','devlog','roadmap','previews'],support:['support','help'],feedback:['suggestions','support']}[section];if(!targets)return [];try{const channels=await discord(e,'/guilds/'+guild+'/channels');return targets.map(n=>channels.find(c=>c.name===n&&[0,5,15,16].includes(c.type)&&snow(c.id))).filter(Boolean).slice(0,3).map(c=>link('#'+c.name,'https://discord.com/channels/'+guild+'/'+c.id))}catch{return []}}
async function formlinePanel(e,section,info){
 if(!sections.includes(section))section='about';
 const data={
 about:['Meet Pip','hi, i’m pip. Formline is a growing family of creative apps and tools. Pick a section below to find what you need.'],
 apps:['Formline apps','**Formline — Discord**\nCreative Discord tools, interactive content and Live Pages.\n\n**Formline — Steam**\nA free Steam companion in development.'],
 updates:['Updates','Follow the official development and announcement channels for releases and progress.'],
 support:['Support','Need help with an app or your access? Visit the official support channel. Never post private redemption codes.'],
 community:['Formline Studios','Our home for Formline apps, development and community.'],
 feedback:['Feedback','Share suggestions and bug reports in the community. Include relevant app versions and avoid posting private credentials.'],
 status:['Service status','The database is reachable. Discord access and the Daki runtime are separate services.']
 }[section];
 const components=[row(button('Apps','fl-formline:apps'),button('Updates','fl-formline:updates'),button('Support','fl-formline:support')),row(button('Feedback','fl-formline:feedback'),button('Status','fl-formline:status'),link('Community',invite))];
 const links=await channelLinks(e,section);if(links.length)components.push(row(...links));
 return card(data[0],data[1],info,components);
}
async function view(e,id,info){
 const records=await all(e,'SELECT status,created FROM licenses WHERE customer_id=? ORDER BY created DESC LIMIT 10',id);
 const counts=records.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{});
 const fields=[{name:'Unused codes',value:String(counts.available||0),inline:true},{name:'Redeemed',value:String(counts.redeemed||0),inline:true},{name:'Revoked',value:String(counts.revoked||0),inline:true}];
 return card('Your licenses',records.length?'Your codes are tied to this Discord account. Use '+mention(info,'license','redeem')+' to redeem an unused code.':'No license records were found for your Discord account.',info,actions(),0xe8e6e2,fields);
}
async function check(e,d,id,target,info){
 if(target&&target!==id&&!await licenseAdmin(e,d))return card('Access denied','Only an authorized staff role can check another member.',info,[],0xc66b70);
 const who=target||id,active=await hasCustomer(e,who);
 return card('Customer access',active?'The Customer role is active. Open Formline and connect Discord.':'No active Customer role. Redeem a valid code or contact support.',info,who===id?actions():[],active?0x8aa893:0xc66b70,[{name:'Account',value:'<@'+who+'>',inline:true},{name:'Access',value:active?'Active':'Not active',inline:true}]);
}
export async function handlePip(d,e){
 const name=d.data?.name,custom=d.data?.custom_id||'';
 const isLicense=name==='license'||['redeem','access','generate','revoke','lookup'].includes(name)||custom.startsWith('fl-license:');
 const general=name==='formline'||sections.includes(name)||['pip','beta','help'].includes(name)||custom.startsWith('fl-formline:');
 if(!isLicense&&!general)return null;
 const id=d.member?.user?.id||d.user?.id;if(!snow(id))return card('Invalid identity','Discord did not provide a valid account.',null,[],0xc66b70);
 if(isLicense&&(d.guild_id||d.guild?.id)!==guild)return card('Formline Studios only','License commands can only be used in the official Formline Studios server.',null,[row(link('Join Formline Studios',invite))],0xc66b70);
 // Return modal immediately: Discord does not permit opening modals after deferral.
 const option=d.data?.options?.[0];
 if(isLicense&&((d.type===2&&name==='license'&&option?.name==='redeem'&&!option.options?.find(x=>x.name==='code')?.value)||(d.type===3&&custom==='fl-license:redeem')))return modal();
 let info=null;try{
 info=await meta(e);
 if(general){const section=custom.startsWith('fl-formline:')?custom.slice(12):name==='formline'?(option?.value||'about'):sections.includes(name)?name:'about';return await formlinePanel(e,section,info)}
 if(d.type===2&&name!=='license')return card('Command moved','Use '+mention(info,'license','redeem')+' or '+mention(info,'license','check')+' instead.',info,actions());
 let action=option?.name||'menu',opts=option?.options||[];
 if(d.type===3){action=custom==='fl-license:view'?'view':custom==='fl-license:check'?'check':'menu';opts=[]}
 if(d.type===5&&custom==='fl-license:submit'){action='redeem';const fields=(d.data?.components||[]).flatMap(x=>x.components||[x.component].filter(Boolean));opts=[{name:'code',value:fields.find(x=>x.custom_id==='code')?.value||''}]}
 if(action==='menu')return card('Formline licenses','Redeem a code, view your licenses, or check your Customer access.',info,actions());
 if(action==='view')return await view(e,id,info);
 if(action==='check')return await check(e,d,id,opts.find(x=>x.name==='customer')?.value,info);
 if(!['redeem','generate','revoke'].includes(action))return card('Unknown action','Open /license again.',info,actions(),0xc66b70);
 if(action!=='redeem'&&!await licenseAdmin(e,d))return card('Staff access required','An authorized staff role is required. If none have been configured, this action is disabled.',info,[],0xc66b70);
 const result=await roleCommand({...d,guild_id:guild,data:{...d.data,name:action,options:opts}},e,id);
 const payload=await result.json(),message=payload?.data?.content||'The operation did not complete. Try again.';
 const good=/^(Code redeemed|One-time code|Customer role removed)/.test(message);
 return card(good?(action==='redeem'?'Access unlocked':action==='generate'?'Code generated':'Access revoked'):'License operation',message,info,action==='redeem'?actions():[],good?0x8aa893:0xc66b70);
 }catch(err){const reason=String(err?.message||'');const safe=/^Discord (?:HTTP|unavailable \(HTTP) \d{3}\)?$/.test(reason)?reason:'The operation could not be completed. Try again or contact support.';console.error('Pip command error',name||custom,err?.name||'Error');return card('Temporarily unavailable',safe,info,[],0xc66b70)}
}
export async function syncPipCommands(e,force=false){
 if(force)await run(e,"UPDATE pip_command_rollout SET status='pending',updated=0 WHERE id=1");
 const claim=await one(e,"UPDATE pip_command_rollout SET updated=?,detail='Registering consolidated commands' WHERE id=1 AND status!='ready' AND updated<? RETURNING id",now(),now()-60);if(!claim)return;
 try{
 const app=await discord(e,'/oauth2/applications/@me'),bot=await discord(e,'/users/@me');if(app.id!==e.DISCORD_CLIENT_ID)throw Error('Bot and application identity mismatch');
 const expected=e.PUBLIC_ORIGIN+'/discord/interactions';if(app.interactions_endpoint_url&&app.interactions_endpoint_url!==expected)throw Error('Discord interaction endpoint does not match Worker');
 const base='/applications/'+e.DISCORD_CLIENT_ID,gp=base+'/guilds/'+guild+'/commands',global=base+'/commands';
 const lic=await discord(e,gp,'POST',licenseCommand);const form=await discord(e,global,'POST',formlineCommand);
 const [gs,globals]=await Promise.all([discord(e,gp),discord(e,global)]);
 const confirmed=gs.find(c=>c.id===lic.id&&c.name==='license'&&licenseCommand.options.every(o=>c.options?.some(a=>a.name===o.name)));
 if(!confirmed||!globals.some(c=>c.id===form.id&&c.name==='formline'))throw Error('Discord has not confirmed the new commands');
 for(const cmd of globals)if(cmd.type===1&&retired.includes(cmd.name))await discord(e,global+'/'+cmd.id,'DELETE');
 const [after,afterGuild]=await Promise.all([discord(e,global),discord(e,gp)]);
 if(after.some(c=>c.type===1&&retired.includes(c.name))||!afterGuild.some(c=>c.id===lic.id))throw Error('Command cleanup not confirmed');
 const avatar=snow(bot?.id)&&/^(?:a_)?[a-f0-9]{32}$/.test(bot?.avatar||'')?'https://cdn.discordapp.com/avatars/'+bot.id+'/'+bot.avatar+'.png?size=128':null;
 await run(e,"UPDATE pip_command_rollout SET status='ready',detail='Guild license command and global formline command verified; obsolete global commands removed',updated=?,license_id=?,formline_id=?,avatar_url=? WHERE id=1",now(),lic.id,form.id,avatar);
 }catch(err){await run(e,"UPDATE pip_command_rollout SET status='pending',detail=?,updated=? WHERE id=1",String(err.message||'Discord command registration failed').slice(0,160),now());}
}
