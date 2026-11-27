// The ⚑ "wrong answer?" button (src/core/report.js → api/report.js): the Discord message a report becomes.
// Anyone on the site can send one, logged in or not (a guest shows as "Guest #a1b2c3").
//
// Environment (Vercel → Settings → Environment Variables):
//   REPORT_WEBHOOK   a Discord webhook link for the channel the reports go to (Discord: the channel →
//                    Edit Channel → Integrations → Webhooks → New Webhook → Copy Webhook URL).
//                    Without it the button says reports aren't switched on yet.

export const MAX_IMAGES = 6;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
// pasted.txt / game-data.txt: a whole manual's text several times over, still far under the 4.5 MB request
export const TEXT_FILE_CHARS = 200000;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

const clean = (s) => String(s || '').trim().replace(/^["']|["']$/g, '');
const WEBHOOK_RE = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d{5,25}\/[\w-]{20,}$/;

/** The webhook link, or '' when REPORT_WEBHOOK is missing or isn't a Discord webhook link. */
export function reportWebhook(env = process.env) {
  const url = clean(env.REPORT_WEBHOOK).replace(/\/+$/, '').replace(/\?.*$/, '');
  return WEBHOOK_RE.test(url) ? url : '';
}

/** At most `n` characters (Discord refuses longer fields). */
export function cut(s, n) {
  const t = String(s ?? '').replace(/\r/g, '').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}
// a code block can't be closed early by the text inside it
const block = (s, n) => '```\n' + cut(String(s ?? '').replace(/`/g, 'ˋ'), n - 8) + '\n```';

/**
 * → { payload, files: [{ name, blob }] } for a Discord webhook (multipart: payload_json + files[i]).
 * `who`: { id, name, handle } for someone logged in, { guest: true, tag, name } for a guest. Everything
 * else is what the page sent, as text; `images` are Blobs.
 * Nothing in it can ping anyone (allowed_mentions is empty).
 */
export function reportMessage({ who, module, card, answer, note, serial, page, device, text, pasted, game, images = [] }) {
  const files = images.map((blob, i) => ({ name: `picture-${i + 1}.${EXT[blob.type] || 'png'}`, blob }));
  const txt = (name, s) => files.push({ name, blob: new Blob([s], { type: 'text/plain;charset=utf-8' }) });
  const screen = cut(text, 20000);
  if (screen) txt('screen.txt', screen);
  // every text pasted on the page this session (manual text, serial, image links), and the game's data
  // in use (serial, this game's manuals and tables): 6 pictures + these 3 stay within Discord's 10 files
  const pastes = cut(pasted, TEXT_FILE_CHARS);
  if (pastes) txt('pasted.txt', pastes);
  const data = cut(game, TEXT_FILE_CHARS);
  if (data) txt('game-data.txt', data);

  const from = who.guest ? `${who.name} (not logged in)` : who.handle ? `${who.name} (@${who.handle})` : who.name;
  const embed = {
    title: cut(`⚑ Wrong answer · ${module || 'a module'}${card ? ` · ${card}` : ''}`, 256),
    color: 0xDC1F3C,
    fields: [
      { name: 'Answer it gave', value: String(answer ?? '').trim() ? block(answer, 1000) : '— (no answer on screen)' },
      { name: "What's wrong", value: cut(note, 1000) || '— (no note)' },
      { name: 'Serial', value: cut(serial, 40) || '—', inline: true },
      { name: 'From', value: cut(who.guest ? from : `${from} · <@${who.id}>`, 300), inline: true },
      { name: 'Page', value: cut(page, 100) || '—', inline: true },
    ],
    footer: { text: cut(device, 300) || 'device unknown' },
    timestamp: new Date().toISOString(),
  };
  if (files.length && files[0].name.startsWith('picture-')) embed.image = { url: `attachment://${files[0].name}` };
  return {
    payload: {
      username: 'Bomb Vision reports',
      content: cut(`⚑ **${from}** says this answer is wrong${[
        screen && 'screen.txt: everything the module showed',
        pastes && 'pasted.txt: every text pasted on the page',
        data && 'game-data.txt: the serial, manuals and tables in use',
      ].filter(Boolean).map((s) => `\n· ${s}`).join('')}`, 1900),
      embeds: [embed],
      allowed_mentions: { parse: [] },
      attachments: files.map((f, i) => ({ id: i, filename: f.name })),
    },
    files,
  };
}

// ── a report sent from a room card: the room's side of it (a second message) ─────────────────────────
// The server has the card's pictures (pasted as files: in the database; as Discord links: fetched now),
// who pasted each, every member's answer and the card's values (what the reading gave). In a room only
// the app that took a picture reads it, so a teammate's own report may not have the picture: this one
// does. Sent after the report itself, as its own message.
export const ROOM_PICS = 6;
const ROOM_BUDGET = 8 * 1024 * 1024;
// a link picture is fetched only from Discord's own picture servers (never any address a page names)
const LINK_RE = /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/[^\s]{1,1900}$/i;
export const roomLinkOk = (url) => LINK_RE.test(String(url || ''));

/**
 * → { module, card, pictures: [{ blob | null, who, at, kind, url }], answers: [{ who, answer }], values } for
 * the card `cardKey` (card:<module>:<n>), or null. items: the room's items; nameOf(id) → a name;
 * loadPicture(picId) → { type, bytes } | null; fetchLink(url) → Blob | null.
 */
export async function gatherRoomReport({ cardKey, items, nameOf, loadPicture, fetchLink }) {
  const m = /^card:([a-z0-9]{2,20}):(\d)$/.exec(String(cardKey || ''));
  if (!m) return null;
  const [, module, n] = m;
  const log = items.find((i) => i.key === cardKey);
  const pics = log && log.value && Array.isArray(log.value.pics) ? log.value.pics : [];
  const pictures = [];
  let total = 0;
  for (const p of pics.slice(-ROOM_PICS)) {
    let blob = null;
    try {
      if (p.kind === 'pic' && p.pic) {
        const got = await loadPicture(p.pic);
        if (got) blob = new Blob([got.bytes], { type: got.type });
      } else if (p.kind === 'link' && roomLinkOk(p.url)) blob = await fetchLink(p.url);
    } catch (e) { blob = null; }
    if (blob && (!IMAGE_TYPES.includes(blob.type) || blob.size > MAX_IMAGE_BYTES || total + blob.size > ROOM_BUDGET)) blob = null;
    if (blob) total += blob.size;
    pictures.push({ blob, who: nameOf(p.from), at: p.at, kind: p.kind, url: p.kind === 'link' ? String(p.url || '') : '' });
  }
  const answers = items.filter((i) => i.key.startsWith(`ans:${module}:${n}:`))
    .map((i) => ({ who: nameOf(i.key.split(':')[3]), answer: String((i.value && i.value.a) || '') }));
  const values = Object.fromEntries(items.filter((i) => i.key.startsWith(`state:${module}:${n}:`)).map((i) => [i.key.split(':')[3], i.value]));
  return { module, card: Number(n), pictures, answers, values };
}

const utc = (t) => (Number.isFinite(t) ? `${new Date(t).toISOString().slice(11, 19)} UTC` : '');

/** The room's side of a report as a webhook message → { payload, files }. who: the reporter's name. */
export function roomReportMessage({ who, room }) {
  const files = [];
  const lines = room.pictures.map((p, i) => {
    let name = '';
    if (p.blob) {
      name = `room-${i + 1}.${EXT[p.blob.type] || 'png'}`;
      files.push({ name, blob: p.blob });
    }
    const what = p.blob ? `\`${name}\`` : p.kind === 'link' ? `link (not fetched): ${cut(p.url, 300)}` : 'file (not found)';
    return `${i + 1}. **${cut(p.who, 40)}** · ${utc(p.at)} · ${what}`;
  });
  const values = Object.keys(room.values).length ? JSON.stringify(room.values, null, 1) : '';
  if (values) files.push({ name: 'card-values.txt', blob: new Blob([cut(values, TEXT_FILE_CHARS)], { type: 'text/plain;charset=utf-8' }) });
  const card = `${room.module} #${room.card + 1}`;
  const embed = {
    title: cut(`👥 Room view · ${card}`, 256),
    color: 0x3B82F6,
    fields: [
      { name: 'Pictures, in the order they were pasted', value: cut(lines.join('\n'), 1024) || '— (no pictures in this card)' },
      { name: "Each player's answer", value: cut(room.answers.map((a) => `**${cut(a.who, 40)}**: ${a.answer ? cut(a.answer, 200) : '—'}`).join('\n'), 1024) || '— (no answers yet)' },
    ],
    timestamp: new Date().toISOString(),
  };
  const firstPic = files.find((f) => f.name.startsWith('room-'));
  if (firstPic) embed.image = { url: `attachment://${firstPic.name}` };
  return {
    payload: {
      username: 'Bomb Vision reports',
      content: cut(`👥 The room's copy of ${card}, for **${who}**'s report above: the pictures from the server${values ? ' · card-values.txt: what the card holds (what its pictures were read as)' : ''}`, 1900),
      embeds: [embed],
      allowed_mentions: { parse: [] },
      attachments: files.map((f, i) => ({ id: i, filename: f.name })),
    },
    files,
  };
}
