import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { findNicknameEditor, installPipNicknameGuard } from './pip-nickname-guard.mjs';

const now = 1700000000000;
const audit = { id:'edit1', targetId:'bot-1', executorId:'admin-1', createdTimestamp:now+200, changes:[{key:'nick',new:'wrong'}] };
const flush = async () => { await new Promise(r=>setImmediate(r)); await new Promise(r=>setImmediate(r)); };

function makeMock({nick=null,audits=[],privilege=true}={}) {
  let currentNick=nick;
  const patches=[], dms=[], warnings=[];
  const guild={id:'guild-1',members:{fetchMe:async()=>({nickname:currentNick})},fetchAuditLogs:async()=>({entries:new Map(audits.map(a=>[a.id,a]))})};
  const client=new EventEmitter();
  client.user={id:'bot-1'};
  client.guilds={cache:new Map([[guild.id,guild]])};
  client.rest={patch:async(url,opts)=>{if(!privilege)throw Error('Forbidden');patches.push({url,opts});currentNick=opts.body.nick;}};
  client.users={fetch:async id=>({bot:false,send:async message=>dms.push({id,message})})};
  client.isReady=()=>false;
  return {client,guild,patches,dms,warnings,logger:{info:()=>{},warn:(...x)=>warnings.push(x)},get nick(){return currentNick;}};
}

test('editor attribution requires the right bot, nickname, actor and timestamp',()=>{
  const args={botId:'bot-1',changedTo:'wrong',eventAt:now,now:now+800};
  assert.deepEqual(findNicknameEditor([audit],args),{actorId:'admin-1',auditEntryId:'edit1'});
  assert.equal(findNicknameEditor([{...audit,targetId:'other'}],args),null);
  assert.equal(findNicknameEditor([{...audit,executorId:'bot-1'}],args),null);
  assert.equal(findNicknameEditor([{...audit,createdTimestamp:now-12000}],args),null);
  assert.equal(findNicknameEditor([{...audit,changes:[{key:'nick',new:'another'}]}],args),null);
});

test('sets pip nickname on guild join using self nickname API',async()=>{
  const m=makeMock(),guard=installPipNicknameGuard(m.client,{logger:m.logger,now:()=>now,sleep:async()=>{}});
  m.client.emit('guildCreate',m.guild);await flush();
  assert.equal(m.nick,'pip');
  assert.equal(m.patches[0].url,'/guilds/guild-1/members/@me');
  assert.deepEqual(m.patches[0].opts.body,{nick:'pip'});
  guard.stop();
});

test('leaves an already correct nickname alone',async()=>{
  const m=makeMock({nick:'pip'}),guard=installPipNicknameGuard(m.client,{logger:m.logger,now:()=>now});
  m.client.emit('ready');await flush();
  assert.equal(m.patches.length,0);guard.stop();
});

test('restores pip and sends one DM to a verified actor',async()=>{
  const m=makeMock({nick:'wrong',audits:[audit]});
  const guard=installPipNicknameGuard(m.client,{logger:m.logger,now:()=>now+800,sleep:async()=>{},correctionCooldownMs:0});
  m.client.emit('raw',{t:'GUILD_MEMBER_UPDATE',d:{guild_id:'guild-1',user:{id:'bot-1'},nick:'wrong'}});
  await flush();
  assert.equal(m.nick,'pip');assert.equal(m.dms.length,1);assert.equal(m.dms[0].id,'admin-1');
  m.client.emit('raw',{t:'GUILD_MEMBER_UPDATE',d:{guild_id:'guild-1',user:{id:'bot-1'},nick:'wrong'}});
  await flush();
  assert.equal(m.dms.length,1);guard.stop();
});

test('unknown actor means no DM, not an accusation',async()=>{
  const m=makeMock({nick:'wrong',audits:[{...audit,changes:[{key:'nick',new:'different'}]}]});
  const guard=installPipNicknameGuard(m.client,{logger:m.logger,now:()=>now+800,sleep:async()=>{}});
  m.client.emit('raw',{t:'GUILD_MEMBER_UPDATE',d:{guild_id:'guild-1',user:{id:'bot-1'},nick:'wrong'}});
  await flush();assert.equal(m.nick,'pip');assert.equal(m.dms.length,0);guard.stop();
});

test('missing nickname permission does not cause a tight retry loop',async()=>{
  const m=makeMock({nick:'wrong',privilege:false});
  const guard=installPipNicknameGuard(m.client,{logger:m.logger,now:()=>now});
  m.client.emit('guildCreate',m.guild);await flush();assert.equal(m.nick,'wrong');
  m.client.emit('guildCreate',m.guild);await flush();assert.equal(m.warnings.length,1);guard.stop();
});

test('per-guild opt-out disables lock',async()=>{
  const m=makeMock();const guard=installPipNicknameGuard(m.client,{disabledGuildIds:['guild-1'],logger:m.logger,now:()=>now});
  m.client.emit('guildCreate',m.guild);await flush();assert.equal(m.patches.length,0);guard.stop();
});
