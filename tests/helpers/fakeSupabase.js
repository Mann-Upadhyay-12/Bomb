// A small in-memory Supabase for tests: the PostgREST calls lib/users.js and lib/rooms.js make, and
// Realtime's REST broadcast. Not a test file itself (node --test runs *.test.js only).
//
// const sb = fakeSupabase({ url: 'https://db.example' });  globalThis.fetch = sb.fetch;
// sb.tables.bomb_rooms → rows · sb.broadcasts → [{ topic, event, payload }]

const RULES = {
  bomb_users: { key: ['discord_id'], defaults: () => ({ status: 'allowed', expires_at: null, created_at: now() }) },
  bomb_rooms: {
    key: ['id'],
    defaults: () => ({ id: uuid(), size: 4, game: 1, locked: false, created_at: now(), last_active: now(), ended_at: null }),
    unique: [{ cols: ['code'], where: (r) => r.ended_at == null }],
  },
  bomb_room_members: { key: ['room_id', 'discord_id'], defaults: () => ({ joined_at: now(), left_at: null, kicked: false }), parent: 'room_id' },
  bomb_room_items: { key: ['room_id', 'game', 'key'], defaults: () => ({ updated_at: now() }), parent: 'room_id' },
  bomb_room_pictures: { key: ['id'], defaults: () => ({ id: uuid(), created_at: now() }), parent: 'room_id' },
};

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

function parseValue(v) {
  if (v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

// a number compares as a number (game=gt.0), anything else as a time (last_active=lt.<iso>)
const order = (v) => (/^-?\d+(\.\d+)?$/.test(String(v)) ? Number(v) : Date.parse(v));

/** PostgREST filters in a query string → a row test. */
function filterOf(params) {
  const tests = [];
  for (const [col, raw] of params) {
    if (['select', 'order', 'on_conflict', 'limit'].includes(col)) continue;
    const dot = raw.indexOf('.');
    const op = raw.slice(0, dot), arg = raw.slice(dot + 1);
    const same = (a, b) => String(a) === String(b);
    if (op === 'eq') tests.push((r) => same(r[col], parseValue(arg)));
    else if (op === 'neq') tests.push((r) => !same(r[col], parseValue(arg)));
    else if (op === 'is') tests.push((r) => (arg === 'null' ? r[col] == null : r[col] === parseValue(arg)));
    else if (op === 'in') {
      const list = arg.replace(/^\(|\)$/g, '').split(',').map((s) => decodeURIComponent(s));
      tests.push((r) => list.some((x) => same(r[col], x)));
    } else if (op === 'lt') tests.push((r) => r[col] != null && order(r[col]) < order(arg));
    else if (op === 'gt') tests.push((r) => r[col] != null && order(r[col]) > order(arg));
    else if (op === 'like') {
      // PostgREST: * is %, any run of characters
      const re = new RegExp(`^${arg.split('*').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
      tests.push((r) => r[col] != null && re.test(String(r[col])));
    }
    else throw new Error(`fake Supabase: no filter ${op}`);
  }
  return (r) => tests.every((t) => t(r));
}

const pick = (row, select) => {
  if (!select || select === '*') return { ...row };
  return Object.fromEntries(select.split(',').map((c) => [c, row[c]]));
};

export function fakeSupabase({ url = 'https://db.example', key = 'service-key' } = {}) {
  const host = new URL(url).host;
  const tables = Object.fromEntries(Object.keys(RULES).map((t) => [t, []]));
  const broadcasts = [];
  const state = { down: false, broadcastStatus: 200, calls: 0 };

  const reply = (data, status = 200) => new Response(data == null ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const conflict = (msg) => reply({ code: '23505', message: msg }, 409);

  function clash(table, row, ignore = null) {
    const rules = RULES[table];
    const sameKey = (a, b, cols) => cols.every((c) => String(a[c]) === String(b[c]));
    for (const other of tables[table]) {
      if (other === ignore) continue;
      if (sameKey(other, row, rules.key)) return 'key';
      for (const u of rules.unique || []) if (u.where(row) && u.where(other) && sameKey(other, row, u.cols)) return 'unique';
    }
    return null;
  }

  function cascade(table, removed) {
    if (table !== 'bomb_rooms') return;
    const ids = new Set(removed.map((r) => r.id));
    for (const [t, rules] of Object.entries(RULES)) {
      if (rules.parent) tables[t] = tables[t].filter((r) => !ids.has(r[rules.parent]));
    }
  }

  async function fetchFake(input, init = {}) {
    const u = new URL(typeof input === 'string' ? input : input.url);
    if (u.host !== host) throw new Error(`fake Supabase: unexpected fetch to ${u.href}`);
    state.calls++;
    if (state.down) throw new TypeError('fetch failed');
    const method = init.method || 'GET';
    const headers = new Headers(init.headers);
    if (headers.get('apikey') !== key) return reply({ message: 'Invalid API key' }, 401);

    if (u.pathname === '/realtime/v1/api/broadcast') {
      for (const m of JSON.parse(init.body).messages) broadcasts.push(m);
      return reply(null, state.broadcastStatus === 200 ? 202 : state.broadcastStatus);
    }

    const m = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
    if (!m || !RULES[m[1]]) return reply({ message: `no table ${u.pathname}` }, 404);
    const table = m[1], rules = RULES[table];
    const prefer = headers.get('prefer') || '';
    const back = prefer.includes('return=representation');
    const params = [...u.searchParams];
    const select = u.searchParams.get('select');

    if (method === 'GET') {
      let rows = tables[table].filter(filterOf(params));
      const order = u.searchParams.get('order');
      if (order) {
        const [col, dir] = order.split('.');
        rows = rows.slice().sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (dir === 'desc' ? -1 : 1));
      }
      return reply(rows.map((r) => pick(r, select)));
    }
    if (method === 'POST') {
      const body = JSON.parse(init.body);
      const upsert = prefer.includes('resolution=merge-duplicates');
      const out = [];
      for (const given of Array.isArray(body) ? body : [body]) {
        const row = { ...rules.defaults(), ...given };
        const same = tables[table].find((o) => rules.key.every((c) => String(o[c]) === String(row[c])));
        if (same && upsert) { Object.assign(same, given); out.push(same); continue; }
        const why = clash(table, row);
        if (why) return conflict(`duplicate key (${why}) in ${table}`);
        tables[table].push(row);
        out.push(row);
      }
      return back ? reply(out.map((r) => ({ ...r })), 201) : new Response('', { status: 201 }); // PostgREST: no body
    }
    if (method === 'PATCH') {
      const change = JSON.parse(init.body);
      const rows = tables[table].filter(filterOf(params));
      for (const r of rows) {
        const next = { ...r, ...change };
        if (clash(table, next, r)) return conflict(`duplicate key in ${table}`);
      }
      rows.forEach((r) => Object.assign(r, change));
      return reply(back ? rows.map((r) => ({ ...r })) : null, back ? 200 : 204);
    }
    if (method === 'DELETE') {
      const test = filterOf(params);
      const removed = tables[table].filter(test);
      tables[table] = tables[table].filter((r) => !test(r));
      cascade(table, removed);
      return reply(null, 204);
    }
    return reply({ message: 'method' }, 405);
  }

  return { fetch: fetchFake, tables, broadcasts, state };
}
