// A ⚑ report from a room card (lib/report.js): the room's copy of the card — its pictures from the
// server in paste order (who pasted each), every member's answer, the card's values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gatherRoomReport, roomReportMessage, roomLinkOk } from '../lib/report.js';

const A = '400000000000000001', B = '400000000000000002';
const names = { [A]: 'Yuza', [B]: 'Dixie' };
const items = [
  { key: 'card:mines:1', value: { pics: [
    { id: 'e1', kind: 'pic', pic: 'p-1', type: 'image/png', from: A, at: Date.UTC(2026, 10, 26, 18, 3, 44) },
    { id: 'e2', kind: 'link', url: 'https://cdn.discordapp.com/attachments/1/2/m.png?ex=1', from: B, at: Date.UTC(2026, 10, 26, 18, 4, 0) },
    { id: 'e3', kind: 'link', url: 'https://evil.example/m.png', from: B, at: Date.UTC(2026, 10, 26, 18, 4, 9) },
  ], cleared: 0 } },
  { key: `ans:mines:1:${A}`, value: { a: 'A5 C4' } },
  { key: `ans:mines:1:${B}`, value: { a: 'A5' } },
  { key: 'ans:mines:0:' + A, value: { a: 'other card' } },
  { key: 'state:mines:1:grid', value: [[1, 2], [3, 4]] },
  { key: 'state:mines:1:pictureRead', value: 'e2' },
];

test('room report: the card\'s pictures in order, a link only from Discord, everyone\'s answers, the values', async () => {
  const fetched = [];
  const room = await gatherRoomReport({
    cardKey: 'card:mines:1', items, nameOf: (id) => names[id] || 'someone',
    loadPicture: async (id) => (id === 'p-1' ? { type: 'image/png', bytes: new Uint8Array([1, 2, 3]) } : null),
    fetchLink: async (url) => { fetched.push(url); return new Blob([new Uint8Array([9, 9])], { type: 'image/png' }); },
  });
  assert.deepEqual(fetched, ['https://cdn.discordapp.com/attachments/1/2/m.png?ex=1'], 'never another site');
  assert.deepEqual(room.pictures.map((p) => [p.who, p.kind, Boolean(p.blob)]), [['Yuza', 'pic', true], ['Dixie', 'link', true], ['Dixie', 'link', false]]);
  assert.deepEqual(room.answers, [{ who: 'Yuza', answer: 'A5 C4' }, { who: 'Dixie', answer: 'A5' }]);
  assert.deepEqual(room.values, { grid: [[1, 2], [3, 4]], pictureRead: 'e2' });

  const { payload, files } = roomReportMessage({ who: 'Yuza', room });
  assert.deepEqual(files.map((f) => f.name), ['room-1.png', 'room-2.png', 'card-values.txt']);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  const [pics, answers] = payload.embeds[0].fields;
  assert.match(pics.value, /^1\. \*\*Yuza\*\* · 18:03:44 UTC · `room-1\.png`\n2\. \*\*Dixie\*\* · 18:04:00 UTC · `room-2\.png`\n3\. \*\*Dixie\*\* · 18:04:09 UTC · link \(not fetched\)/);
  assert.equal(answers.value, '**Yuza**: A5 C4\n**Dixie**: A5');
  assert.equal(payload.embeds[0].image.url, 'attachment://room-1.png');
  assert.equal(payload.attachments.length, files.length);
});

test('room report: links only from Discord\'s picture servers; a card with nothing says so', async () => {
  assert.equal(roomLinkOk('https://media.discordapp.net/attachments/1/2/x.png'), true);
  assert.equal(roomLinkOk('http://cdn.discordapp.com/x.png'), false);
  assert.equal(roomLinkOk('https://cdn.discordapp.com.evil.example/x.png'), false);
  assert.equal(roomLinkOk('https://169.254.169.254/latest'), false);
  const room = await gatherRoomReport({ cardKey: 'card:wires:0', items: [], nameOf: () => 'x', loadPicture: async () => null, fetchLink: async () => null });
  const { payload, files } = roomReportMessage({ who: 'Yuza', room });
  assert.equal(files.length, 0);
  assert.match(payload.embeds[0].fields[0].value, /no pictures/);
  assert.equal(await gatherRoomReport({ cardKey: 'nope', items: [] }), null);
});
