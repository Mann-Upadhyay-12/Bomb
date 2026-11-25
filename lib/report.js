// The ⚑ "wrong answer?" button (src/core/report.js → api/report.js): the Discord message a report becomes.
// Only the owner (ADMIN_IDS) and the OGs (OG_IDS) can send one.
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
 * `who`: { id, name, handle }. Everything else is what the page sent, as text; `images` are Blobs.
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

  const from = who.handle ? `${who.name} (@${who.handle})` : who.name;
  const embed = {
    title: cut(`⚑ Wrong answer · ${module || 'a module'}${card ? ` · ${card}` : ''}`, 256),
    color: 0xDC1F3C,
    fields: [
      { name: 'Answer it gave', value: String(answer ?? '').trim() ? block(answer, 1000) : '— (no answer on screen)' },
      { name: "What's wrong", value: cut(note, 1000) || '— (no note)' },
      { name: 'Serial', value: cut(serial, 40) || '—', inline: true },
      { name: 'From', value: cut(`${from} · <@${who.id}>`, 300), inline: true },
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
