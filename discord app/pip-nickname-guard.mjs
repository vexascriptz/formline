/**
 * Pip nickname guard for a discord.js v14 Gateway bot.
 * Uses current-member update events (no broad member intent needed).
 * Only the bot's OWN nickname is touched.
 */
export const DEFAULT_PIP_NICKNAME = 'pip';

const DAY = 86_400_000;
const AUDIT_MAX_AGE_MS = 15_000;
export function findNicknameEditor(entries, { botId, changedTo, eventAt, now = Date.now() }) {
  for (const entry of entries || []) {
    const target = entry.targetId ?? entry.target?.id;
    const actor = entry.executorId ?? entry.executor?.id;
    if (String(target) !== String(botId) || !actor || String(actor) === String(botId)) continue;
    const timestamp = entry.createdTimestamp ?? entry.createdAt?.getTime?.();
    if (typeof timestamp !== 'number' || timestamp < eventAt - 4000 || timestamp > now + 3000 || now - timestamp > AUDIT_MAX_AGE_MS) continue;
    if (!entry.changes?.some(c => c.key === 'nick' && (c.new ?? null) === (changedTo ?? null))) continue;
    return { actorId: String(actor), auditEntryId: String(entry.id) };
  }
  return null;
}

export function installPipNicknameGuard(client, {
  nickname = DEFAULT_PIP_NICKNAME,
  notifyEditors = true,
  correctionCooldownMs = 20_000,
  dmCooldownMs = DAY,
  disabledGuildIds = [],
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = () => Date.now(),
  logger = console,
} = {}) {
  if (!client?.on || !client?.rest?.patch || !client?.guilds?.cache || !client?.users?.fetch) {
    throw new TypeError('Expected a discord.js v14 Client.');
  }
  if (typeof nickname !== 'string' || nickname.length < 1 || nickname.length > 32) {
    throw new TypeError('Nickname must be 1–32 characters.');
  }
  const disabled = new Set(disabledGuildIds.map(String));
  const lastCorrection = new Map();
  const lastDm = new Map();
  const inProgress = new Set();
  const pending = new Map();
  const seenAuditEntries = new Set();
  let stopped = false;
  const warn = (message, error) => logger.warn?.('[Pip Nickname] ' + message + ': ' + (error?.message || error));

  async function notifyEditor(guild, botId, alteredNick, eventAt) {
    if (!notifyEditors || !guild?.fetchAuditLogs || stopped) return;
    // Attribution is best-effort, never guessed. Audit entries may be delayed.
    for (const waitMs of [800, 2200]) {
      await sleep(waitMs);
      if (stopped) return;
      let log;
      try { log = await guild.fetchAuditLogs({ type: 24, limit: 15 }); }
      catch (error) { warn('Audit log unavailable (View Audit Log required)', error); return; }
      const editor = findNicknameEditor(log?.entries?.values?.(), {
        botId, changedTo: alteredNick, eventAt, now: now(),
      });
      if (!editor) continue;
      if (seenAuditEntries.has(editor.auditEntryId)) return;
      seenAuditEntries.add(editor.auditEntryId);
      if (seenAuditEntries.size > 250) seenAuditEntries.clear();
      const key = guild.id + ':' + editor.actorId;
      if (now() - (lastDm.get(key) ?? -Infinity) < dmCooldownMs) return;
      lastDm.set(key, now()); // even blocked DMs should be rate limited
      if (lastDm.size > 1000) {
        for (const [k, timestamp] of lastDm) if (now() - timestamp > dmCooldownMs) lastDm.delete(k);
      }
      try {
        const user = await client.users.fetch(editor.actorId);
        if (user?.bot) return;
        await user.send("hi, i'm pip! ♡ just a little heads-up: my server nickname is set to **pip**, so i changed it back. if you'd prefer a different name here, you can ask the server owner to turn off my nickname lock.");
      } catch (error) { warn('Could not deliver optional rename notice', error); }
      return;
    }
  }

  async function reconcile(guild, { observedNick, notify = false, eventAt = now() } = {}) {
    if (stopped || !guild?.id || disabled.has(String(guild.id))) return false;
    const botId = client.user?.id;
    const id = String(guild.id);
    if (!botId || inProgress.has(id)) return false;
    const remaining = correctionCooldownMs - (now() - (lastCorrection.get(id) ?? -Infinity));
    if (remaining > 0) {
      if (!pending.has(id)) {
        const timer = setTimeout(() => {
          pending.delete(id);
          void reconcile(guild);
        }, remaining + 25);
        timer.unref?.();
        pending.set(id, timer);
      }
      return false;
    }
    inProgress.add(id);
    try {
      // Verify the live nickname instead of trusting a possibly stale event.
      const me = await guild.members.fetchMe();
      if (me?.nickname === nickname) return true;
      lastCorrection.set(id, now());
      // Self nickname: Change Nickname permission; no Administrator needed.
      await client.rest.patch('/guilds/' + id + '/members/@me', { body: { nick: nickname } });
      logger.info?.('[Pip Nickname] Set nickname to ' + nickname + ' in guild ' + id);
      if (notify && observedNick !== undefined && observedNick !== nickname) {
        void notifyEditor(guild, botId, observedNick, eventAt).catch(error => warn('Notice failed', error));
      }
      return true;
    } catch (error) {
      warn('Cannot update nickname in guild ' + id + ' (Change Nickname required)', error);
      return false;
    } finally {
      inProgress.delete(id);
    }
  }

  function onGuildCreate(guild) { void reconcile(guild); }
  function onReady() {
    for (const guild of client.guilds.cache.values()) void reconcile(guild);
  }
  function onRaw(packet) {
    const d = packet?.d;
    if (packet?.t !== 'GUILD_MEMBER_UPDATE' || !d?.guild_id || d?.user?.id !== client.user?.id) return;
    if (d.nick === nickname) return;
    const guild = client.guilds.cache.get(d.guild_id);
    if (guild) void reconcile(guild, { observedNick: d.nick ?? null, notify: true, eventAt: now() });
  }

  client.on('guildCreate', onGuildCreate);
  client.on('ready', onReady);
  client.on('raw', onRaw);
  if (client.isReady?.()) onReady();
  return {
    reconcile,
    stop() {
      stopped = true;
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
      client.off('guildCreate', onGuildCreate);
      client.off('ready', onReady);
      client.off('raw', onRaw);
    },
  };
}
