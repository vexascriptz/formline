// Formline Discord v2: pre-launch community layout, intentionally one-time.
// Reuses named channels where possible, never deletes any user content.
// Every public app has its own channel. The website is not advertised.

const TYPE={TEXT:0,VOICE:2,CATEGORY:4,ANNOUNCEMENT:5,FORUM:15};
const PRIVACY_VIEW=1n<<10n;
const SEND_MESSAGES=1n<<11n;
const CREATE_THREADS=1n<<35n;
const MANAGE_CHANNELS=1n<<4n;
const MAX_RECENT=35;
const PORTAL_DOMAIN='formline-beta.formline-app-d6e2.workers.dev';
const PUBLIC_TAGS={
 support:['Discord','Pip','Account','Question','Solved'],
 suggestions:['Discord','Pip','New app','Considering','Planned'],
 'bug-reports':['Discord','Pip','Crash','Reproducible','Fixed'],
 previews:['Discord','Pip','Concept','In progress','Preview'],
 experiments:['Concept','Discord','Pip','In progress','On hold']
};
const CHANNEL_TOPICS={
 'start-here':'Your introduction to Formline Studios. Browse the apps, meet Pip, and join the conversation. Pre-launch community.',
 rules:'Our community guidelines. Keep it kind, creative and respectful.',
 announcements:'Official Formline Studios announcements and release news. Pre-launch; no public downloads or site links.',
 devlog:'Development updates across Formline apps. Progress and experiments, not public releases.',
 'app-index':'Discover every Formline app, its current stage and its dedicated discussion channel.',
 discord:'Formline Discord toolkit — questions, design feedback, ideas and development conversation. Pre-launch.',
 'pip-bot':'Pip, the little Formline Discord helper — features, commands, behavior and suggestions.',
 experiments:'Early ideas and future Formline apps. A thread for each concept; no premature launch promises.',
 roadmap:'Planned milestones and priorities for Formline. Plans may change.',
 previews:'Visual previews, screenshots and early concepts. Nothing here is a public release.',
 general:'Community chat about Formline and what you are making.',
 showcase:'Share your designs, creations and things made with creative tools.',
 'off-topic':'Conversations beyond Formline, kept respectful.',
 support:'Ask for help with a specific Formline product; pick a relevant tag. Never share private codes.',
 suggestions:'Pitch ideas and improvements for any Formline app. Choose a product tag.',
 'bug-reports':'Report bugs with steps to reproduce, expected behavior, actual behavior and app version.',
 releases:'Reserved for public releases after launch. Hidden from members while Formline is pre-launch.'
};
const errorText=e=>String(e?.message||e).replace(/https?:\/\/\S+/g,'[link]').slice(0,160);
const wait=ms=>new Promise(r=>setTimeout(r,ms));

export async function arrangeFormline(client,guild){
  const report={guildId:guild.id,guildName:guild.name,version:2,created:[],renamed:[],moved:[],edited:[],posted:[],warnings:[],prelaunch:true};
  await guild.channels.fetch();
  const me=await guild.members.fetchMe();
  if(!me.permissions.has(MANAGE_CHANNELS))throw Error('Manage Channels permission is required to arrange the server.');
  const find=(name,type)=>guild.channels.cache.find(c=>c.name.toLowerCase()===name.toLowerCase()&&(type===undefined||c.type===type));
  const doSafe=async(label,job)=>{try{return await job();}catch(e){report.warnings.push(label+': '+errorText(e));return null;}};
  const edit=async(changes,channel,label)=>doSafe(label,async()=>{
    if(!channel)return null;
    const result=await channel.edit({...changes,reason:'Formline Studios pre-launch layout v2'});
    report.edited.push(label);return result;
  });
  const ownText=async(channel)=>{
    if(!channel?.messages?.fetch)return false;
    const messages=await channel.messages.fetch({limit:MAX_RECENT});
    return !messages.some(m=>m.author?.id!==client.user.id);
  };
  async function category(name,alternates=[]){
    const existing=find(name,TYPE.CATEGORY)||alternates.map(n=>find(n,TYPE.CATEGORY)).find(Boolean);
    if(existing){
      if(existing.name!==name)await edit({name},existing,'Category '+existing.name+' → '+name);
      return guild.channels.cache.get(existing.id)||existing;
    }
    const created=await doSafe('Create category '+name,()=>guild.channels.create({name,type:TYPE.CATEGORY,reason:'Formline Studios pre-launch layout'}));
    if(created)report.created.push('Category '+name);
    return created;
  }
  async function rename(oldName,newName,type){
    const already=find(newName,type);
    if(already)return already;
    const original=find(oldName,type);
    if(!original)return null;
    const result=await edit({name:newName},original,oldName+' → '+newName);
    if(result)report.renamed.push(oldName+' → '+newName);
    return result;
  }
  async function ensure(name,kind,parent,opts={}){
    const type=kind==='forum'?TYPE.FORUM:kind==='voice'?TYPE.VOICE:kind==='announcement'?TYPE.ANNOUNCEMENT:TYPE.TEXT;
    let existing=find(name);
    if(existing){
      if(existing.parentId!==parent?.id) {
        const moved=await doSafe('Move '+name,()=>existing.setParent(parent.id,{lockPermissions:false,reason:'Formline app-first layout'}));
        if(moved){report.moved.push(name+' → '+parent.name);existing=moved;}
      }
      if(CHANNEL_TOPICS[name]&&(type===TYPE.TEXT||type===TYPE.ANNOUNCEMENT||type===TYPE.FORUM) && existing.topic!==CHANNEL_TOPICS[name])await edit({topic:CHANNEL_TOPICS[name]},existing,'Topic '+name);
      return existing;
    }
    const options={name,type,parent:parent.id,reason:'Formline pre-launch channel design'};
    if(CHANNEL_TOPICS[name]&&type!==TYPE.VOICE)options.topic=CHANNEL_TOPICS[name];
    if(type===TYPE.FORUM){
      options.availableTags=(PUBLIC_TAGS[name]||[]).map(name=>({name}));
      options.defaultForumLayout=name==='previews'?2:1;
    }
    if(opts.readonly)options.permissionOverwrites=[{id:guild.id,deny:[SEND_MESSAGES]}];
    const ch=await doSafe('Create '+name,()=>guild.channels.create(options));
    if(ch)report.created.push(name+(type===TYPE.FORUM?' [forum]':type===TYPE.ANNOUNCEMENT?' [announcements]':''));
    return ch;
  }
  // Reuse the actual existing categories. Keep the default public set concise.
  const hq=await category('FORMLINE',['Formline']);
  const apps=await category('APPS');
  const dev=await category('DEVELOPMENT',['INFORMATION']);
  const community=await category('COMMUNITY');
  const help=await category('SUPPORT');
  if(![hq,apps,dev,community,help].every(Boolean))throw Error('Could not create essential categories.');

  // Keep pre-existing channel messages and current permission overrides.
  await ensure('start-here','text',hq);
  await ensure('rules','text',hq);
  await ensure('announcements','announcement',hq);
  await rename('updates','devlog',TYPE.ANNOUNCEMENT);
  await ensure('devlog','announcement',dev);
  await ensure('roadmap','text',dev);

  // Product identity: real named channels, plus an index and a forum for future concepts.
  await rename('apps','app-index',TYPE.TEXT);
  await ensure('app-index','text',apps);
  await ensure('discord','text',apps);
  const broad=find('app-discussion',TYPE.TEXT);
  if(broad&&!find('pip-bot')) {
    const safe=await doSafe('Check whether app-discussion has user messages',()=>ownText(broad));
    if(safe)await rename('app-discussion','pip-bot',TYPE.TEXT);
    else report.warnings.push('Kept app-discussion because it may contain member messages; creating a separate Pip channel.');
  }
  await ensure('pip-bot','text',apps);
  await ensure('experiments','forum',apps);

  // Discord-native forum channels keep feedback and bug reports searchable.
  await rename('feedback','suggestions',TYPE.FORUM);
  const support=await ensure('support','forum',help);
  const suggestions=await ensure('suggestions','forum',help);
  const bugs=await ensure('bug-reports','forum',help);
  const previews=await ensure('previews','forum',dev);
  for(const channel of [support,suggestions,bugs,previews,find('experiments',TYPE.FORUM)]){
    if(!channel||channel.type!==TYPE.FORUM)continue;
    const tags=(PUBLIC_TAGS[channel.name]||[]).map(name=>({name}));
    const existingNames=(channel.availableTags||[]).map(x=>x.name).join('|');
    const newNames=tags.map(x=>x.name).join('|');
    if(existingNames!==newNames || channel.defaultForumLayout!==(channel.name==='previews'?2:1)){
      await edit({availableTags:tags,defaultForumLayout:channel.name==='previews'?2:1},channel,'Forum layout and tags '+channel.name);
    }
    // Discord's tag-required flag (16) makes posts searchable by app and state.
    if(!(channel.flags?.bitfield&16)){
      await doSafe('Require a tag in '+channel.name,()=>channel.setFlags((channel.flags?.bitfield||0)|16));
    }
  }

  await ensure('general','text',community);
  await ensure('showcase','text',community);
  await ensure('off-topic','text',community);
  await ensure('lounge','voice',community);

  // The unreleased download channel stays hidden and intact, not deleted.
  const releases=find('releases',TYPE.TEXT);
  if(releases){
    if(releases.parentId!==dev.id) await doSafe('Move prelaunch release channel',()=>releases.setParent(dev.id,{lockPermissions:false}));
    await doSafe('Hide releases until launch',()=>releases.permissionOverwrites.edit(guild.id,{ViewChannel:false}));
    report.edited.push('releases hidden from regular members until launch');
  }

  // Correct misleading prior official posts, but never edit or remove member messages.
  const publicChannels=[...guild.channels.cache.values()].filter(c=>
    [TYPE.TEXT,TYPE.ANNOUNCEMENT].includes(c.type)&&c.id!==releases?.id&&c.viewable&&c.messages?.fetch);
  for(const ch of publicChannels){
    await doSafe('Remove unreleased URL from bot posts in '+ch.name,async()=>{
      const messages=await ch.messages.fetch({limit:MAX_RECENT});
      for(const m of messages.values()){
        if(m.author?.id!==client.user.id)continue;
        if(!m.content?.includes(PORTAL_DOMAIN))continue;
        await m.edit({content:'**formline is in development.**\n\nPublic downloads and our website have not launched yet. Official announcements will appear in #announcements. In the meantime, explore #discord and #pip-bot.',components:[],embeds:[],allowedMentions:{parse:[]}});
        report.edited.push('Prelaunch link removed from bot message in '+ch.name);
      }
    });
  }

  // A small set of meaningful introductory posts, not fake release notes.
  async function pinIntro(name,content){
    const ch=find(name);
    if(!ch?.send || !ch.messages?.fetch)return;
    await doSafe('Pinned guide '+name,async()=>{
      const messages=await ch.messages.fetch({limit:20});
      if(messages.some(m=>m.author?.id===client.user.id&&m.content?.includes('FORMLINE GUIDE: '+name)))return;
      const msg=await ch.send({content:'**FORMLINE GUIDE: '+name+'**\n\n'+content,allowedMentions:{parse:[]}});
      try{await msg.pin();}catch(e){report.warnings.push('Could not pin in '+name+': '+errorText(e));}
      report.posted.push(name);
    });
  }
  const mention=n=>{const c=find(n);return c?'<#'+c.id+'>':'#'+n;};
  await pinIntro('start-here',
    'Welcome to **Formline Studios**, home to a growing collection of creative apps. We are **pre-launch**—nothing is being sold or downloaded here yet.\n\n'
    + '**Explore the products**\n'
    + mention('discord')+' — our Discord creator toolkit\n'
    + mention('pip-bot')+' — Pip, our little community helper\n'
    + mention('experiments')+' — future ideas and prototypes\n\n'
    + '**See development**\n'
    + mention('devlog')+' — progress and behind-the-scenes work\n'
    + mention('previews')+' — mockups and early visuals\n'
    + mention('roadmap')+' — what is being worked on\n\n'
    + '**Join in**\n'
    + mention('general')+' for conversation, '+mention('showcase')+' for creations, '
    +mention('suggestions')+' for ideas, and '+mention('support')+' for help.\n\n'
    +'Meet '+mention('pip-bot')+' and keep an eye on '+mention('announcements')+'. ♡');
  await pinIntro('app-index',
    '**Available to discuss (not publicly released):**\n\n'
    +'**01 — Formline for Discord** · In development\n'+mention('discord')+'\n\n'
    +'**02 — Pip** · Bot in testing\n'+mention('pip-bot')+'\n\n'
    +'**Next apps** · Not announced\n'+mention('experiments')+'\n\n'
    +'We will add a dedicated channel whenever another app is real enough to introduce. No public download or website links until launch.');
  await pinIntro('discord',
    '**Formline for Discord** is our creative desktop toolkit. This is the place for interface ideas, feature discussion, design experiments, and early feedback.\n\n'
    +'**Current stage:** in development. Builds and downloads have **not** been announced publicly.\n'
    +'Use '+mention('suggestions')+' for feature requests or '+mention('bug-reports')+' for reproducible issues.');
  await pinIntro('pip-bot',
    'hi, i am pip! ♡\n\n'
    +'I am Formline’s little Discord helper. I can point you to apps, development updates, support and the community.\n\n'
    +'**Current commands:** /pip, /apps, /updates, /community, /feedback.\n'
    +'**Stage:** actively developing; expect changes while the bot grows.\n\n'
    +'Share your ideas for me here, or post a detailed request in '+mention('suggestions')+'.');
  await pinIntro('roadmap',
    '**Formline is pre-launch.** Current priorities:\n\n'
    +'1. Shape a useful official Discord community.\n'
    +'2. Keep improving the Discord toolkit and the app lineup.\n'
    +'3. Expand Pip’s features and reliability.\n'
    +'4. Prepare the official website for launch.\n\n'
    +'Priorities are plans, not promises or release dates. Specific progress belongs in '+mention('devlog')+'.');
  await pinIntro('devlog',
    '**Our public build log starts here.**\n\n'
    +'We are preparing the official community, giving each product its own space, and improving Pip. '
    +'Future posts will show real development progress and changes. Formline has **not launched** yet.');
  for(const [channel,heading,body] of [
    [previews,'How previews work','This gallery is for early screenshots, layouts, and experiments from our actual work. A preview is not a public release. Nothing has been posted as a product launch.'],
    [bugs,'How to report a bug','Choose the affected app tag and share the version, what happened, what you expected, steps to reproduce, and a screenshot if useful. Never post tokens, license keys, or private data.'],
    [suggestions,'How to suggest a feature','Pick an app tag, explain the problem, describe your idea and why it would help. Small focused suggestions are easier to discuss.'],
    [support,'How to get help','Choose an app tag and describe the issue, what you already tried and any error message with private information removed.'],
    [find('experiments',TYPE.FORUM),'What belongs here','New app concepts and experiments belong in their own threads. Nothing here is a confirmed launch or finished product.']
  ]){
    if(!channel?.threads?.create)continue;
    await doSafe('Forum guide '+channel.name,async()=>{
      const active=await channel.threads.fetchActive();
      if(active.threads.some(t=>t.name===heading))return;
      const tag=channel.availableTags?.[0]?.id;
      const created=await channel.threads.create({name:heading,autoArchiveDuration:10080,
        ...(tag?{appliedTags:[tag]}:{}),message:{content:body,allowedMentions:{parse:[]}}});
      report.posted.push(channel.name+' forum guide');
      try{await created.setPinned(true);}catch{}
    });
  }

  // Category order makes products immediately visible, not buried under generic chat.
  for(const [i,cat] of [hq,apps,dev,community,help].entries()){
    await doSafe('Order '+cat.name,()=>cat.setPosition(i));
    await wait(250);
  }
  await guild.channels.fetch();
  report.visibleCategoryNames=[...guild.channels.cache.values()].filter(c=>c.type===TYPE.CATEGORY).map(c=>c.name);
  report.publicChannels=[...guild.channels.cache.values()].filter(c=>c.type!==TYPE.CATEGORY&&c.id!==releases?.id)
    .map(c=>({name:c.name,type:c.type,parent:c.parent?.name||null}));
  return report;
}
