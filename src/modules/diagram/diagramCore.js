// VennCore: circle detection, Otsu region sampling, letter templates, and shortest expression search

export var VennCore = (function () {
    'use strict';

    var SLOT_ORDER = { c3: ['T', 'L', 'R'], c2h: ['L', 'R'], c2v: ['T', 'B'] };

    /* ── glyph templates (12×16 coverage grids, digits 0-9) ─────────────── */
    var GW = 12, GH = 16;
    var TEMPLATES = { A: [], B: [], C: [] };

    function addTemplate(letter, grid) { if (TEMPLATES[letter]) TEMPLATES[letter].push(grid); }

    /* ── image prep ────────────────────────────────────────────────────── */
    function prep(img) {
      var W = img.width, H = img.height, d = img.data;
      var lum = new Float32Array(W * H), sat = new Float32Array(W * H);
      for (var i = 0, p = 0; i < W * H; i++, p += 4) {
        var r = d[p], g = d[p + 1], b = d[p + 2];
        lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        sat[i] = mx ? (mx - mn) / mx : 0;
      }
      return { W: W, H: H, lum: lum, sat: sat };
    }
    function isBright(P, x, y) {
      if (x < 0 || y < 0 || x >= P.W || y >= P.H) return false;
      var i = y * P.W + x;
      return P.lum[i] > 165 && P.sat[i] < 0.3;
    }

    /* ── circle detection (Hough, equal radii) ─────────────────────────── */
    function houghAcc(P, pts, r, acc) {
      var W = P.W, H = P.H;
      acc.fill(0);
      var steps = Math.ceil(2 * Math.PI * r), seen = {}, dxs = [], dys = [];
      for (var k = 0; k < steps; k++) {
        var th = 2 * Math.PI * k / steps;
        var dx = Math.round(r * Math.cos(th)), dy = Math.round(r * Math.sin(th));
        var key = dx * 4096 + dy;
        if (!seen[key]) { seen[key] = 1; dxs.push(dx); dys.push(dy); }
      }
      var n = dxs.length;
      for (var p = 0; p < pts.length; p += 2) {
        var x = pts[p], y = pts[p + 1];
        for (var j = 0; j < n; j++) {
          var cx = x - dxs[j], cy = y - dys[j];
          if (cx >= 0 && cx < W && cy >= 0 && cy < H) acc[cy * W + cx]++;
        }
      }
    }
    function rawMax(acc) { var m = 0; for (var i = 0; i < acc.length; i++) if (acc[i] > m) m = acc[i]; return m; }
    function smooth3(P, acc) {
      var W = P.W, H = P.H, tmp = new Int32Array(W * H), out = new Int32Array(W * H);
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var s = acc[y * W + x];
        if (x > 0) s += acc[y * W + x - 1];
        if (x < W - 1) s += acc[y * W + x + 1];
        tmp[y * W + x] = s;
      }
      for (var y2 = 0; y2 < H; y2++) for (var x2 = 0; x2 < W; x2++) {
        var t = tmp[y2 * W + x2];
        if (y2 > 0) t += tmp[(y2 - 1) * W + x2];
        if (y2 < H - 1) t += tmp[(y2 + 1) * W + x2];
        out[y2 * W + x2] = t;
      }
      return out;
    }
    function ringScore(P, cx, cy, r) {
      var n = 120, hit = 0;
      for (var k = 0; k < n; k++) {
        var th = 2 * Math.PI * k / n, ok = false;
        for (var d = -2; d <= 2 && !ok; d++) {
          var x = Math.round(cx + (r + d) * Math.cos(th)), y = Math.round(cy + (r + d) * Math.sin(th));
          if (isBright(P, x, y)) ok = true;
        }
        if (ok) hit++;
      }
      return hit / n;
    }
    function refineCircle(P, c) {
      var best = { x: c.x, y: c.y, r: c.r, s: ringScore(P, c.x, c.y, c.r) };
      for (var dr = -2; dr <= 2; dr++) for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
        var s = ringScore(P, c.x + dx, c.y + dy, c.r + dr);
        if (s > best.s + 1e-9) best = { x: c.x + dx, y: c.y + dy, r: c.r + dr, s: s };
      }
      return best;
    }
    function findCircles(P) {
      var W = P.W, H = P.H, all = [];
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (isBright(P, x, y)) all.push(x, y);
      var N = all.length / 2;
      if (N < 80) return [];
      var stepP = Math.max(1, Math.ceil(N / 1800)), pts = [];
      for (var i = 0; i < N; i += stepP) pts.push(all[2 * i], all[2 * i + 1]);

      var m = Math.min(W, H);
      var rMin = Math.max(8, Math.round(0.08 * m)), rMax = Math.round(0.28 * m);
      var acc = new Int32Array(W * H);
      var bestR = rMin, bestV = -1;
      for (var r = rMin; r <= rMax; r += 2) {
        houghAcc(P, pts, r, acc);
        var v = rawMax(acc);
        if (v > bestV) { bestV = v; bestR = r; }
      }
      // fine pass around best radius using smoothed accumulator
      var fine = null;
      for (var rr = bestR - 2; rr <= bestR + 2; rr++) {
        if (rr < rMin - 2) continue;
        houghAcc(P, pts, rr, acc);
        var sm = smooth3(P, acc), mx = 0;
        for (var q = 0; q < sm.length; q++) if (sm[q] > mx) mx = sm[q];
        if (!fine || mx > fine.mx) fine = { r: rr, sm: sm, mx: mx };
      }
      var R = fine.r, sm2 = fine.sm, cands = [], guard = Math.round(0.5 * R);
      for (var it = 0; it < 6; it++) {
        var bi = -1, bv = 0;
        for (var j = 0; j < sm2.length; j++) if (sm2[j] > bv) { bv = sm2[j]; bi = j; }
        if (bi < 0) break;
        if (it === 0) fine.first = bv;
        if (bv < 0.4 * fine.first) break;
        var cy = Math.floor(bi / W), cx = bi % W;
        cands.push({ x: cx, y: cy, r: R });
        for (var yy = Math.max(0, cy - guard); yy <= Math.min(H - 1, cy + guard); yy++)
          for (var xx = Math.max(0, cx - guard); xx <= Math.min(W - 1, cx + guard); xx++) sm2[yy * W + xx] = 0;
      }
      var good = [];
      cands.forEach(function (c) {
        var rf = refineCircle(P, c);
        if (rf.s >= 0.7) good.push(rf);
      });
      good.sort(function (a, b) { return b.s - a.s; });
      // drop near-duplicates
      var out = [];
      good.forEach(function (g) {
        if (out.every(function (o) { return Math.hypot(o.x - g.x, o.y - g.y) > 0.4 * g.r; })) out.push(g);
      });
      return out.slice(0, 3);
    }

    function assignSlots(cs) {
      var n = cs.length, layout, ordered;
      if (n === 3) {
        layout = 'c3';
        var byY = cs.slice().sort(function (a, b) { return a.y - b.y; });
        var rest = byY.slice(1).sort(function (a, b) { return a.x - b.x; });
        ordered = [byY[0], rest[0], rest[1]];
      } else {
        var dx = Math.abs(cs[0].x - cs[1].x), dy = Math.abs(cs[0].y - cs[1].y);
        if (dx >= dy) { layout = 'c2h'; ordered = cs.slice().sort(function (a, b) { return a.x - b.x; }); }
        else { layout = 'c2v'; ordered = cs.slice().sort(function (a, b) { return a.y - b.y; }); }
      }
      var slots = SLOT_ORDER[layout];
      ordered.forEach(function (c, i) { c.slot = slots[i]; });
      return { layout: layout, circles: ordered };
    }

    /* ── universe rectangle (dark inner panel border) ──────────────────── */
    function findRect(P, cs) {
      var bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9;
      cs.forEach(function (c) {
        bx0 = Math.min(bx0, c.x - c.r); bx1 = Math.max(bx1, c.x + c.r);
        by0 = Math.min(by0, c.y - c.r); by1 = Math.max(by1, c.y + c.r);
      });
      var cxm = Math.round((bx0 + bx1) / 2), cym = Math.round((by0 + by1) / 2), W = P.W, H = P.H;
      function scan(x, y, dx, dy, maxd) {
        for (var t = 0; t <= maxd; t++) {
          var px = Math.round(x + dx * t), py = Math.round(y + dy * t);
          if (px < 0 || py < 0 || px >= W || py >= H) return -1;
          if (P.lum[py * W + px] < 24) return t;
        }
        return -1;
      }
      var maxd = 0.6 * Math.min(W, H);
      var l = scan(bx0 - 2, cym, -1, 0, maxd), r = scan(bx1 + 2, cym, 1, 0, maxd);
      var t = scan(cxm, by0 - 2, 0, -1, maxd), b = scan(cxm, by1 + 2, 0, 1, maxd);
      var pad = 0.3 * cs[0].r, guessed = false;
      var x0 = l >= 0 ? bx0 - 2 - l : bx0 - pad, x1 = r >= 0 ? bx1 + 2 + r : bx1 + pad;
      var y0 = t >= 0 ? by0 - 2 - t : by0 - pad, y1 = b >= 0 ? by1 + 2 + b : by1 + pad;
      if (l < 0 || r < 0 || t < 0 || b < 0) guessed = true;
      return { x0: x0 + 3, y0: y0 + 3, x1: x1 - 3, y1: y1 - 3, guessed: guessed };
    }

    /* ── region sampling & shading classification ──────────────────────── */
    function regionMaskAt(cs, x, y) {
      var mask = 0, edge = 1e9;
      for (var i = 0; i < cs.length; i++) {
        var d = Math.hypot(x - cs[i].x, y - cs[i].y);
        if (d < cs[i].r) mask |= (1 << i);
        edge = Math.min(edge, Math.abs(d - cs[i].r));
      }
      return { mask: mask, edge: edge };
    }
    function median(a) { a.sort(function (p, q) { return p - q; }); return a[a.length >> 1]; }

    function sampleRegions(P, cs, rect) {
      var n = cs.length, M = 1 << n, buckets = [], sx = [], sy = [], cnt = [];
      for (var m = 0; m < M; m++) { buckets.push([]); sx.push(0); sy.push(0); cnt.push(0); }
      var W = P.W;
      for (var y = Math.ceil(rect.y0); y <= rect.y1; y += 2) {
        for (var x = Math.ceil(rect.x0); x <= rect.x1; x += 2) {
          var rm = regionMaskAt(cs, x, y);
          if (rm.edge < 5) continue;
          var i = y * W + x;
          if (P.lum[i] > 150 && P.sat[i] < 0.3) continue; // letters / stray bright bits
          buckets[rm.mask].push(P.lum[i]); sx[rm.mask] += x; sy[rm.mask] += y; cnt[rm.mask]++;
        }
      }
      var lums = [], dots = [];
      for (var k = 0; k < M; k++) {
        if (cnt[k] >= 12) { lums.push(median(buckets[k])); dots.push({ mask: k, x: sx[k] / cnt[k], y: sy[k] / cnt[k] }); }
        else { lums.push(null); dots.push({ mask: k, x: null, y: null }); }
      }
      return { lums: lums, dots: dots };
    }

    function classify(lums) {
      var vals = lums.filter(function (v) { return v !== null; });
      var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
      var thr = (mx - mn >= 28) ? (mn + mx) / 2 : 68;
      return lums.map(function (v) { return v !== null && v > thr; });
    }

    /* ── letter reading ────────────────────────────────────────────────── */
    function resampleGlyph(cov, w, h) { // cov: Float32Array w*h, returns GW*GH 0..1
      var out = new Float32Array(GW * GH), SS = 4;
      for (var gy = 0; gy < GH; gy++) for (var gx = 0; gx < GW; gx++) {
        var s = 0;
        for (var sy = 0; sy < SS; sy++) for (var sx = 0; sx < SS; sx++) {
          var px = Math.min(w - 1, Math.floor(((gx + (sx + 0.5) / SS) / GW) * w));
          var py = Math.min(h - 1, Math.floor(((gy + (sy + 0.5) / SS) / GH) * h));
          s += cov[py * w + px];
        }
        out[gy * GW + gx] = s / (SS * SS);
      }
      return out;
    }
    function gridToStr(g) {
      var rows = [];
      for (var y = 0; y < GH; y++) { var r = ''; for (var x = 0; x < GW; x++) r += Math.min(9, Math.round(g[y * GW + x] * 9)); rows.push(r); }
      return rows.join('');
    }
    function strToGrid(s) {
      var g = new Float32Array(GW * GH);
      for (var i = 0; i < GW * GH; i++) g[i] = (s.charCodeAt(i) - 48) / 9;
      return g;
    }
    function ncc(a, b) {
      var n = a.length, ma = 0, mb = 0, i;
      for (i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
      ma /= n; mb /= n;
      var sab = 0, saa = 0, sbb = 0;
      for (i = 0; i < n; i++) { var da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
      return (saa > 0 && sbb > 0) ? sab / Math.sqrt(saa * sbb) : 0;
    }

    function extractGlyph(P, cs, idx) {
      var c = cs[idx], W = P.W, H = P.H, bgs = [];
      var pix = [];
      var x0 = Math.floor(c.x - c.r), x1 = Math.ceil(c.x + c.r), y0 = Math.floor(c.y - c.r), y1 = Math.ceil(c.y + c.r);
      for (var y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (var x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
        var rm = regionMaskAt(cs, x, y);
        if (rm.mask !== (1 << idx) || rm.edge < 6) continue;
        var i = y * W + x;
        if (P.lum[i] > 140 && P.sat[i] < 0.35) pix.push(x, y); else if ((x + y) % 5 === 0) bgs.push(P.lum[i]);
      }
      if (pix.length / 2 < 14) return null;
      var set = {}, k;
      for (k = 0; k < pix.length; k += 2) set[pix[k] + ',' + pix[k + 1]] = 1;
      var best = null, seen = {};
      for (k = 0; k < pix.length; k += 2) {
        var key = pix[k] + ',' + pix[k + 1];
        if (seen[key]) continue;
        var stack = [[pix[k], pix[k + 1]]], comp = [];
        seen[key] = 1;
        while (stack.length) {
          var cur = stack.pop(); comp.push(cur);
          for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
            var nk = (cur[0] + dx) + ',' + (cur[1] + dy);
            if (set[nk] && !seen[nk]) { seen[nk] = 1; stack.push([cur[0] + dx, cur[1] + dy]); }
          }
        }
        if (!best || comp.length > best.length) best = comp;
      }
      var bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9;
      best.forEach(function (p) { bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); by0 = Math.min(by0, p[1]); by1 = Math.max(by1, p[1]); });
      bx0 -= 1; by0 -= 1; bx1 += 1; by1 += 1;
      var w = bx1 - bx0 + 1, h = by1 - by0 + 1;
      if (h < 0.12 * c.r || h > 0.95 * c.r || w > 1.2 * c.r || w < 3) return null;
      var bg = bgs.length ? median(bgs) : 34, cov = new Float32Array(w * h);
      for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
        var px = bx0 + xx, py = by0 + yy;
        var l = (px >= 0 && py >= 0 && px < W && py < H) ? P.lum[py * W + px] : bg;
        cov[yy * w + xx] = Math.max(0, Math.min(1, (l - bg) / (255 - bg)));
      }
      return { grid: resampleGlyph(cov, w, h), bbox: [bx0, by0, bx1, by1] };
    }

    function bestTemplateScore(grid, letter) {
      var best = -1;
      TEMPLATES[letter].forEach(function (t) { var s = ncc(grid, t); if (s > best) best = s; });
      return best;
    }

    function readLetters(P, cs, layout) {
      var n = cs.length, glyphs = [], i;
      for (i = 0; i < n; i++) { var g = extractGlyph(P, cs, i); if (!g) return null; glyphs.push(g); }
      var L = ['A', 'B', 'C'];
      if (!TEMPLATES.A.length || !TEMPLATES.B.length || !TEMPLATES.C.length) return { ok: false, minScore: -1, glyphs: glyphs };
      var sc = glyphs.map(function (g) { return L.map(function (l) { return bestTemplateScore(g.grid, l); }); });
      var best = null;
      function rec(i2, used, acc, total) {
        if (i2 === n) { if (!best || total > best.total) best = { assign: acc.slice(), total: total }; return; }
        for (var j = 0; j < 3; j++) if (!(used & (1 << j))) { acc.push(j); rec(i2 + 1, used | (1 << j), acc, total + sc[i2][j]); acc.pop(); }
      }
      rec(0, 0, [], 0);
      var minScore = Math.min.apply(null, best.assign.map(function (j, k) { return sc[k][j]; }));
      if (minScore < 0.55) return { ok: false, minScore: minScore, glyphs: glyphs };
      var slots = SLOT_ORDER[layout], map = {};
      best.assign.forEach(function (j, k) { map[slots[k]] = L[j]; });
      return { ok: true, slotLetters: map, minScore: minScore, glyphs: glyphs };
    }

    /* ── top-level analysis ────────────────────────────────────────────── */
    function analyze(img) {
      var P = prep(img);
      var cs = findCircles(P);
      if (cs.length < 2) return { ok: false, reason: 'Could not find 2 or 3 circles — crop the screenshot closer to the diagram.' };
      var as = assignSlots(cs), circles = as.circles, layout = as.layout;
      var rect = findRect(P, circles);
      var sm = sampleRegions(P, circles, rect);
      var flags = classify(sm.lums);
      var masks = [];
      flags.forEach(function (f, m) { if (f) masks.push(m); });
      var dots = sm.dots.map(function (d, m) { d.shaded = flags[m]; return d; });
      var lt = readLetters(P, circles, layout);
      return {
        ok: true, W: P.W, H: P.H, layout: layout, circles: circles, rect: rect,
        shade: { masks: masks, lums: sm.lums, dots: dots },
        letters: (lt && lt.ok) ? { slotLetters: lt.slotLetters, minScore: lt.minScore } : null,
        lettersTried: !!lt, lettersMinScore: lt ? lt.minScore : null,
        _glyphs: lt && lt.glyphs ? lt.glyphs : null
      };
    }

    /* ════════════════ notation engine (shortest expression search) ════════ */
    var engineCache = {};
    function wrap(e, ctx) {
      if (ctx === 'n' && e.prec === 1) return '(' + e.s + ')';
      if (ctx === 'u' && e.prec === 2) return '(' + e.s + ')';
      return e.s;
    }
    function buildEngine(names) {
      var k = names.length, M = 1 << k, N = 1 << M, FULL = N - 1;
      var best = new Array(N).fill(null), buckets = [];
      function relax(f, e) {
        var b = best[f];
        var better = !b || e.s.length < b.s.length ||
          (e.s.length === b.s.length && (e.nc < b.nc || (e.nc === b.nc && e.s < b.s)));
        if (better) { best[f] = e; var L = e.s.length; if (!buckets[L]) buckets[L] = []; buckets[L].push([f, e]); }
      }
      for (var v = 0; v < k; v++) {
        var t = 0; for (var m = 0; m < M; m++) if ((m >> v) & 1) t |= (1 << m);
        relax(t, { s: names[v], prec: 3, nc: 0, base: false });
      }
      relax(FULL, { s: 'S', prec: 3, nc: 0, base: true });
      relax(0, { s: 'Null', prec: 3, nc: 0, base: true });
      var done = [];
      for (var c = 1; c < buckets.length; c++) {
        var list = buckets[c]; if (!list) continue;
        for (var i = 0; i < list.length; i++) {
          var f = list[i][0], e = list[i][1];
          if (best[f] !== e || e.done) continue;
          e.done = true;
          if (e.base) continue;
          if (e.s.charAt(e.s.length - 1) !== "'") {
            var ns = (e.prec === 3 && e.s.length === 1) ? e.s + "'" : '(' + e.s + ")'";
            relax((~f) & FULL, { s: ns, prec: 3, nc: e.nc + 1 });
          }
          for (var j = 0; j < done.length; j++) {
            var g = done[j], ge = best[g];
            var a1 = wrap(e, 'n'), b1 = wrap(ge, 'n');
            relax(f & g, { s: (a1 <= b1 ? a1 + 'n' + b1 : b1 + 'n' + a1), prec: 2, nc: e.nc + ge.nc });
            var a2 = wrap(e, 'u'), b2 = wrap(ge, 'u');
            relax(f | g, { s: (a2 <= b2 ? a2 + 'u' + b2 : b2 + 'u' + a2), prec: 1, nc: e.nc + ge.nc });
          }
          done.push(f);
        }
      }
      return { names: names, best: best, M: M };
    }
    function getEngine(names) {
      var key = names.join('');
      if (!engineCache[key]) engineCache[key] = buildEngine(names);
      return engineCache[key];
    }
    function expression(names, localMasks) {
      var eng = getEngine(names), f = 0;
      localMasks.forEach(function (m) { f |= (1 << m); });
      return eng.best[f].s;
    }
    function minterm(names, m) {
      return names.map(function (nm, i) { return ((m >> i) & 1) ? nm : nm + "'"; }).join('n');
    }

    addTemplate('A', strToGrid("000012210000000047851000000168872000000288883000000588886000001787887100002884888300004872788500016862588710027877788830038888888840158755578861168400037873388200015884376100002575121000000111"));
    addTemplate('C', strToGrid("000124553320001478888740016888778851038883125861158861002761278830000241288820000000288720000000288720000000278820000000168830000010048861001462028885235872005888788841001367877410000012432100"));
    addTemplate('B', strToGrid("011111110000156666664100158888888500028886788810028882278820028882178820028883388820028887788500028888888710028884478840028882148851028882028861028883368851028887888830018888887610004444443100"));

    return {
      analyze: analyze, expression: expression, minterm: minterm,
      addTemplate: addTemplate, strToGrid: strToGrid, gridToStr: gridToStr,
      resampleGlyph: resampleGlyph, TEMPLATES: TEMPLATES, SLOT_ORDER: SLOT_ORDER, GW: GW, GH: GH,
      _ncc: ncc
    };
  })();
