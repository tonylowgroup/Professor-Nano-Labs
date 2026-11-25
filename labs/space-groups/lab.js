/* Space groups lab: page logic. Symmetry algebra in physics.js (window.SG), data in data.js and crystals.js. */
(function () {
  'use strict';
  const G = window.SG, CRYSTALS = window.SG_CRYSTALS;
  const $ = id => document.getElementById(id);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const START = { n: 14, op: 1, show: 'all', move: 'cell', draw: 'both', crystal: 'diamond' };
  const S = JSON.parse(JSON.stringify(START));
  let mode = 'ops';
  let deep = false;
  try { deep = localStorage.getItem('sg-depth') === 'deep'; } catch (e) { /* not remembered: fine */ }

  const INK = '#14232c', GREY = '#5f7382', LIGHT = '#c3ced5', ORANGE = '#b35900', BLUE = '#1f6fb4', RED = '#c2372f', GREEN = '#2e7d32';
  const BRAND = (getComputedStyle(document.documentElement).getPropertyValue('--brand') || '#557214').trim();
  const X0 = [0.137, 0.229, 0.083];                     // the general position
  const ELCOL = { Na: '#8e44ad', Cl: '#2e9d4f', Cs: '#1f8a8a', Si: '#7d8c96', C: '#4a4f55', Ga: '#c77d2e', As: '#7b3fa0', Ca: '#3b8fd1', F: '#79c043', Sr: '#2f9e8f', Ti: '#9aa3ab', O: '#d0342c', B: '#e58fa8', N: '#2f5fd0', Mo: '#5c8fa8', S: '#e2b714', Bi: '#a05c9e', Se: '#d9822b', P: '#e07b39' };

  // ---------- helpers ----------
  const fixed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const sub = t => String(t).replace(/_\{([^}]*)\}|_([A-Za-z0-9])/g, (m, a, b) => `<sub>${a || b}</sub>`);
  const sym = t => `<span class="sym">${t}</span>`;
  function stats(items) {
    $('stats').className = `stats stats--${items.length} stats--steady stats--wrap`;
    $('stats').innerHTML = items.map(([label, value, s2]) => `<div class="stat"><div class="stat__label">${label}</div><div class="stat__value">${value}</div><div class="stat__sub">${s2}</div></div>`).join('');
  }
  function typeset(el) { if (window.MathJax && MathJax.typesetPromise && /\\\(/.test(el.innerHTML)) MathJax.typesetPromise([el]).catch(() => {}); }
  function setHTML(el, html) { if (el.dataset.html === html) return; el.dataset.html = html; el.innerHTML = html; typeset(el); }
  const put = (id, t) => setHTML($(id), t);
  function legend(id, items) { setHTML($(id), items.map(([c, k, l]) => `<li style="color:${c}"><span class="swatch ${k}"></span><span>${l}</span></li>`).join('')); }
  const alpha = (hex, a) => { const v = parseInt(hex.slice(1), 16); return `rgba(${v >> 16}, ${(v >> 8) & 255}, ${v & 255}, ${a})`; };
  const UNI = { '1/2': '½', '1/4': '¼', '3/4': '¾', '1/3': '⅓', '2/3': '⅔', '1/6': '⅙', '5/6': '⅚', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞' };
  const nice = s => String(s).replace(/(\d+)\/(\d+)/g, m => UNI[m] || m).replace(/-/g, '−');
  const BRAV = { triclinic: 'a', monoclinic: 'm', orthorhombic: 'o', tetragonal: 't', trigonal: 'h', hexagonal: 'h', cubic: 'c' };
  const CENNAME = { P: 'primitive', A: 'A-face centred', B: 'B-face centred', C: 'C-face centred', I: 'body centred', F: 'face centred', R: 'rhombohedral' };

  // ---------- the group, the cell and the operations on show ----------
  const crystal = () => CRYSTALS.find(c => c.id === S.crystal);
  const grp = () => G.group(S.n);
  function cellM() {
    if (mode !== 'crystal') return grp().M;
    const c = crystal(), M = G.cellMatrix(...c.cell), s = Math.max(...c.cell.slice(0, 3));
    return M.map(r => r.map(v => v / s));
  }
  // the list: the coset representatives, then the centring translations
  function entries() {
    const g = grp(), list = g.reps.map((o, i) => ({ i, o }));
    g.cv.slice(1).forEach((c, k) => list.push({ i: g.reps.length + k, o: { kind: 't', W: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], w: c, sym: 't', name: 'centring translation', where: '', desc: `slides everything by (${G.pointText(c)}), from one lattice point to another`, text: `x+${G.frac(c[0])},y+${G.frac(c[1])},z+${G.frac(c[2])}`.replace(/\+0(?=,|$)/g, ''), det: 1 } }));
    return list;
  }
  const cur = () => entries().find(e => e.i === S.op) || entries()[0];
  // the version of the operation, shifted by a lattice vector, that keeps the object (or the crystal) in the cell
  function variant(o, x) {
    const y = G.add(G.mv(o.W, x), o.w), N = y.map(v => -Math.floor(v + 1e-9));
    const w = G.add(o.w, N);
    if (o.kind === 't') return { o, W: o.W, w, el: Object.assign({}, o, { w }) };
    const el = G.classify({ W: o.W, w }, grp().cv, cellM());
    return { o, W: o.W, w, el };
  }

  function variantMid(o) {
    if (o.kind === 't' || o.kind === '1') return variant(o, [0.5, 0.5, 0.5]);
    const mid = [0.5, 0.5, 0.5], cands = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const w = G.add(o.w, [i, j, k]), y = G.add(G.mv(o.W, mid), w), el = G.classify({ W: o.W, w }, grp().cv, cellM());
      const fwd = !(el.screw > 0) || G.dot(el.tin, el.u) > 1e-9;
      cands.push({ w, el, fwd, d: G.norm(G.mv(cellM(), G.sub(y, mid))) });
    }
    const best = cands.filter(c => c.fwd).sort((a, b) => a.d - b.d)[0] || cands.sort((a, b) => a.d - b.d)[0];
    return { o, W: o.W, w: best.w, el: best.el };
  }
  // ---------- a small 3D renderer on a plain canvas ----------
  const cv3 = $('view'), c3 = cv3.getContext('2d');
  const view = { yaw: -0.55, pitch: 0.42, w: 0, h: 0, up: [0, 0, 1] };
  function size(c) { const r = c.parentElement.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 3), w = Math.max(200, Math.round(r.width)), h = Math.max(160, Math.round(r.height)); c.width = Math.round(w * d); c.height = Math.round(h * d); c.style.width = w + 'px'; c.style.height = h + 'px'; c.getContext('2d').setTransform(d, 0, 0, d, 0, 0); return { w, h }; }
  function camera(M, extra) {
    const ca = Math.cos(view.yaw), sa = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
    // look at the middle of the cell, or of the cell and where it moves to
    const c0 = G.mv(M, [0.5, 0.5, 0.5]), centre = extra && extra.length ? G.scl(G.add(c0, G.scl(extra.reduce((a, p) => G.add(a, p), [0, 0, 0]), 1 / extra.length)), 0.5) : c0;
    const U = view.up, E1 = (() => { const t = Math.abs(U[2]) > 0.99 ? [1, 0, 0] : G.cross([0, 0, 1], U); const w = G.sub(t, G.scl(U, G.dot(t, U))); return G.scl(w, 1 / G.norm(w)); })(), E2 = G.cross(U, E1);
    const r = p => { const d = G.sub(p, centre), v = [G.dot(d, E1), G.dot(d, E2), G.dot(d, U)], x1 = ca * v[0] - sa * v[1], y1 = sa * v[0] + ca * v[1]; return [x1, sp * y1 + cp * v[2], cp * y1 - sp * v[2]]; };
    let ext = 0; for (const f of CORNERS) { const q = r(G.mv(M, f)); ext = Math.max(ext, Math.abs(q[0]), Math.abs(q[1])); }
    for (const p of extra || []) { const q = r(p); ext = Math.max(ext, Math.abs(q[0]), Math.abs(q[1])); }
    const sc = 0.44 * Math.min(view.w, view.h - 30) / Math.max(ext, 1e-6);
    return p => { const q = r(p); return [view.w / 2 + q[0] * sc, (view.h + 30) / 2 - q[1] * sc, q[2], sc]; };
  }
  const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const EDGES = [[0, 1], [0, 2], [0, 3], [1, 4], [1, 5], [2, 4], [2, 6], [3, 5], [3, 6], [4, 7], [5, 7], [6, 7]];
  function draw3D(prims, M, caption, extra) {
    const s = size(cv3); view.w = s.w; view.h = s.h;
    const P = camera(M, extra), ctx = c3;
    ctx.clearRect(0, 0, view.w, view.h);
    const items = [];
    for (const [i, j] of EDGES) {
      const a = G.mv(M, CORNERS[i]), b = G.mv(M, CORNERS[j]);
      for (let k = 0; k < 6; k++) items.push({ t: 'seg', a: G.add(a, G.scl(G.sub(b, a), k / 6)), b: G.add(a, G.scl(G.sub(b, a), (k + 1) / 6)), color: '#8aa0ad', w: 1.2 });
    }
    items.push(...prims);
    const depth = it => (it.t === 'sphere' || it.t === 'text' ? P(it.p)[2] : it.t === 'seg' ? P(G.scl(G.add(it.a, it.b), 0.5))[2] : it.pts.reduce((s, p) => s + P(p)[2], 0) / it.pts.length) + (it.bias || 0);
    items.forEach(it => { it.d = depth(it); });
    items.sort((a, b) => b.d - a.d);
    for (const it of items) {
      ctx.globalAlpha = it.alpha == null ? 1 : it.alpha;
      if (it.t === 'seg') {
        const a = P(it.a), b = P(it.b); ctx.strokeStyle = it.color; ctx.lineWidth = it.w || 1.5; ctx.setLineDash(it.dash || []); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
      } else if (it.t === 'poly') {
        ctx.beginPath(); it.pts.forEach((p, k) => { const q = P(p); if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath();
        if (it.fill) { ctx.fillStyle = it.fill; ctx.fill(); }
        if (it.stroke) { ctx.strokeStyle = it.stroke; ctx.lineWidth = it.w || 1.5; ctx.setLineDash(it.dash || []); ctx.stroke(); ctx.setLineDash([]); }
      } else if (it.t === 'sphere') {
        const q = P(it.p), r = Math.max(1.5, it.r * q[3]);
        const gr = ctx.createRadialGradient(q[0] - r * 0.35, q[1] - r * 0.35, r * 0.1, q[0], q[1], r);
        gr.addColorStop(0, it.light || '#ffffff'); gr.addColorStop(0.35, it.color); gr.addColorStop(1, it.dark || it.color);
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 2 * Math.PI); ctx.fill();
        if (it.ring) { ctx.strokeStyle = it.ring; ctx.lineWidth = 2; ctx.stroke(); }
      } else if (it.t === 'text') {
        const q = P(it.p); ctx.font = `${it.weight || 700} ${it.size || 12}px Inter, system-ui, sans-serif`; ctx.fillStyle = it.color || INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (it.halo) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeText(it.text, q[0], q[1]); }
        ctx.fillText(it.text, q[0], q[1]);
      }
    }
    ctx.globalAlpha = 1;
    // the cell axes, labelled at the far ends of a, b and c from the origin
    const o = P(G.mv(M, [0, 0, 0]));
    ctx.font = '700 12px Inter, system-ui, sans-serif'; ctx.fillStyle = GREY; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [['a', [1.08, 0, 0]], ['b', [0, 1.08, 0]], ['c', [0, 0, 1.08]]].forEach(([l, f]) => { const q = P(G.mv(M, f)); ctx.fillText(l, q[0], q[1]); });
    ctx.fillText('0', o[0] - 8, o[1] + 8);
    if (caption) caption.forEach((c, k) => { ctx.font = `${c.on ? 700 : 600} 13px Inter, system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.strokeText(c.text, 10, 8 + 19 * k); ctx.fillStyle = c.on ? c.color || BRAND : '#8a99a3'; ctx.fillText(c.text, 10, 8 + 19 * k); });
  }
  // shade a colour towards white or black
  function shade(hex, a) { const v = parseInt(hex.slice(1), 16), t = a > 0 ? 255 : 0, f = Math.abs(a); return `rgb(${[v >> 16, (v >> 8) & 255, v & 255].map(c => Math.round(c + (t - c) * f)).join(',')})`; }
  const ball = (p, r, color, extra) => Object.assign({ t: 'sphere', p, r, color, light: shade(color, 0.6), dark: shade(color, -0.45) }, extra || {});

  // ---------- the handed object: a hub and three unequal legs, red, green and blue ----------
  const LEGS = [[0.085, 0, 0], [0, 0.062, 0], [0, 0, 0.046]], LEGC = [RED, GREEN, BLUE], LEGR = [0.03, 0.025, 0.02];
  function motif(p, legs, hand, extra) {
    if (mode === 'ops' && S.move !== 'one') legs = legs.map(d => G.scl(d, 1.3));
    const out = [ball(p, extra && extra.hub ? 0.026 : 0.018, extra && extra.hub ? extra.hub : hand > 0 ? INK : '#ffffff', Object.assign({ ring: hand > 0 ? null : INK }, extra))];
    legs.forEach((d, k) => { const q = G.add(p, d); out.push({ t: 'seg', a: p, b: q, color: '#5b6b75', w: 2, alpha: extra && extra.alpha }); out.push(ball(q, LEGR[k], LEGC[k], extra)); });
    return out;
  }

  // ---------- moving an object through an operation ----------
  function rodrigues(u, th, v) { const c = Math.cos(th), s = Math.sin(th), d = G.dot(u, v), x = G.cross(u, v); return [v[0] * c + x[0] * s + u[0] * d * (1 - c), v[1] * c + x[1] * s + u[1] * d * (1 - c), v[2] * c + x[2] * s + u[2] * d * (1 - c)]; }
  // a function of s in [0, 1] that carries a point (Cartesian) and its leg vectors from where they are to where the operation sends them
  function mover(vr, M) {
    const el = vr.el, Mi = G.inv3(M), Wc = G.mm(G.mm(M, vr.W), Mi);
    const tC = G.mv(M, el.tin || [0, 0, 0]), cC = G.mv(M, el.x0 || [0, 0, 0]);
    // screws and glides in two steps: the turn (or reflection) first, then the slide along the axis (or in the plane)
    const two = (el.screw > 0) || (el.kind === 'm' && el.letter && el.letter !== 'm');
    const R1 = s => (two ? Math.min(1, s / 0.6) : s), Q = s => (two ? Math.max(0, (s - 0.6) / 0.4) : s);
    let f;
    if (el.kind === 't' || el.kind === '1') { const sh = G.mv(M, vr.w); f = (p, s, isLeg) => (isLeg ? p : G.add(p, G.scl(sh, s))); }
    else if (el.kind === 'm') {
      const nu = (() => { for (const e of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) { const v = G.sub(e, G.mv(Wc, e)); if (G.norm(v) > 1e-6) return G.scl(v, 1 / G.norm(v)); } return [0, 0, 1]; })();
      const lin = (d, s) => G.sub(d, G.scl(nu, 2 * s * G.dot(d, nu)));
      f = (p, s, isLeg) => (isLeg ? lin(p, R1(s)) : G.add(G.add(cC, lin(G.sub(p, cC), R1(s))), G.scl(tC, Q(s))));
    } else if (el.kind === '-1') { const lin = (d, s) => G.scl(d, 1 - 2 * s); f = (p, s, isLeg) => (isLeg ? lin(p, s) : G.add(cC, lin(G.sub(p, cC), s))); }
    else {
      // rotations and rotoinversions: axis and signed angle from the Cartesian matrix
      const improper = el.det < 0, R = improper ? Wc.map(r => r.map(v => -v)) : Wc;
      const uc = G.mv(M, el.u), un = G.scl(uc, 1 / G.norm(uc));
      const cs = (R[0][0] + R[1][1] + R[2][2] - 1) / 2, sn = 0.5 * G.dot(un, [R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]]), th = Math.atan2(sn, cs);
      const lin = (d, s) => { const r = rodrigues(un, s * th, d); return improper ? G.scl(r, 1 - 2 * s) : r; };
      f = (p, s, isLeg) => (isLeg ? lin(p, R1(s)) : G.add(G.add(cC, lin(G.sub(p, cC), R1(s))), G.scl(tC, Q(s))));
    }
    f.two = two; f.R1 = R1; f.Q = Q; f.tC = tC;
    return f;
  }
  // an arrow in the cell, with a small head
  function arrow3(a, b, color, alpha) {
    const d = G.sub(b, a), L = G.norm(d); if (L < 1e-6) return [];
    const u = G.scl(d, 1 / L), side = (() => { const t = G.cross(u, view.up); return G.norm(t) > 1e-3 ? G.scl(t, 1 / G.norm(t)) : [1, 0, 0]; })();
    const h = Math.min(0.06, 0.35 * L), back = G.sub(b, G.scl(u, h));
    return [{ t: 'seg', a, b, color, w: 3.2, alpha }, { t: 'seg', a: b, b: G.add(back, G.scl(side, h * 0.6)), color, w: 3.2, alpha }, { t: 'seg', a: b, b: G.sub(back, G.scl(side, h * 0.6)), color, w: 3.2, alpha }];
  }
  // what the picture says, step by step
  function stepCaption(vr, s, mvr) {
    const el = vr.el;
    if (!mvr.two) return null;
    const slide = el.screw > 0 ? (() => { const g = grp(), u = el.u; const lam = G.dot(el.tin, u) / G.dot(u, u); const axis = u.filter(v => v !== 0).length === 1 ? 'abc'[u.findIndex(v => v !== 0)] : `[${u.join('')}]`; return `${nice(G.frac(Math.abs(lam)))} ${axis}`; })() : `(${nice(G.pointText(el.glide || el.tin))})`;
    const first = el.screw > 0 ? `1 · turn ${360 / Math.abs(Number(el.kind))}° about the ${el.sym.replace(/[⁺⁻]/g, '')} axis` : '1 · reflect in the plane';
    const second = el.screw > 0 ? `2 · slide ${slide} along the axis` : `2 · slide by ${slide} within the plane`;
    return [{ text: first, on: s < 0.6 || s >= 1 }, { text: second, on: s >= 0.6, color: ORANGE }];
  }
  // ---------- the symmetry element, clipped to the cell ----------
  function clipLine(x0, u) {
    let lo = -1e9, hi = 1e9;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(u[k]) < 1e-9) { if (x0[k] < -0.02 || x0[k] > 1.02) return null; continue; }
      let a = (-0.02 - x0[k]) / u[k], b = (1.02 - x0[k]) / u[k]; if (a > b) [a, b] = [b, a]; lo = Math.max(lo, a); hi = Math.min(hi, b);
    }
    return lo < hi ? [G.add(x0, G.scl(u, lo)), G.add(x0, G.scl(u, hi))] : null;
  }
  function clipPlane(n, d) {
    const pts = [];
    for (const [i, j] of EDGES) {
      const a = CORNERS[i], b = CORNERS[j], fa = G.dot(n, a) - d, fb = G.dot(n, b) - d;
      if (Math.abs(fa) < 1e-9) pts.push(a);
      if (fa * fb < -1e-12) { const t = fa / (fa - fb); pts.push(G.add(a, G.scl(G.sub(b, a), t))); }
    }
    const uniq = []; for (const p of pts) if (!uniq.some(q => G.norm(G.sub(p, q)) < 1e-6)) uniq.push(p);
    if (uniq.length < 3) return null;
    const c = G.scl(uniq.reduce((s, p) => G.add(s, p), [0, 0, 0]), 1 / uniq.length);
    let e1 = G.sub(uniq[0], c); e1 = G.scl(e1, 1 / G.norm(e1)); const nn = G.scl(n, 1 / G.norm(n)), e2 = G.cross(nn, e1);
    return uniq.sort((p, q) => Math.atan2(G.dot(G.sub(p, c), e2), G.dot(G.sub(p, c), e1)) - Math.atan2(G.dot(G.sub(q, c), e2), G.dot(G.sub(q, c), e1)));
  }
  function elementPrims(el, M, s) {
    const out = [], col = BRAND;
    if (!el || el.kind === '1' || el.kind === 't') return out;
    const C = f => G.mv(M, f);
    if (el.kind === 'm') {
      // the plane through the cell, nudged by whole cells if it misses it
      const d0 = G.dot(el.n, el.x0); let poly = null;
      for (const k of [0, -1, 1, -2, 2]) { const shift = k * Math.max(...el.n.map(Math.abs)); poly = clipPlane(el.n, d0 + shift); if (poly) break; }
      if (poly) out.push({ t: 'poly', pts: poly.map(C), fill: alpha(col, 0.16), stroke: col, w: 1.6, dash: el.letter === 'm' ? [] : [6, 4], bias: 0 });
      return out;
    }
    if (el.kind === '-1') { out.push(ball(C(G.wrap(el.x0)), 0.022, '#ffffff', { ring: col })); return out; }
    let seg = clipLine(el.x0, el.u);
    if (!seg) for (const N of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0], [0, 0, -1], [1, 1, 0], [-1, -1, 0]]) { seg = clipLine(G.add(el.x0, N), el.u); if (seg) break; }
    if (seg) {
      const a = C(seg[0]), b = C(seg[1]);
      for (let k = 0; k < 8; k++) out.push({ t: 'seg', a: G.add(a, G.scl(G.sub(b, a), k / 8)), b: G.add(a, G.scl(G.sub(b, a), (k + 1) / 8)), color: col, w: 3, dash: el.screw ? [7, 4] : [] });
      out.push({ t: 'text', p: G.add(b, G.scl(G.sub(b, a), 0.06)), text: el.sym.replace(/[⁺⁻]/g, ''), color: col, size: 13, halo: true });
    }
    if (el.det < 0) out.push(ball(C(el.x0), 0.02, '#ffffff', { ring: col }));
    return out;
  }

  // ---------- 1 and 3. The cell: copies, the move, and crystals ----------
  let frameFn = null;
  function opsScene(f) {
    const g = grp(), M = cellM(), Mi = G.inv3(M), e = cur(), prims = [];
    const orbit = G.orbit(g, X0);
    const legsOf = W => { const Wc = G.mm(G.mm(M, W), Mi); return LEGS.map(d => G.mv(Wc, d)); };
    if (S.move === 'one') {
      if (S.show === 'all') orbit.forEach(o => prims.push(...motif(G.mv(M, o.f), legsOf(o.op.W), o.det, { alpha: 0.32 })));
      const vr = variant(e.o, X0), mv = mover(vr, M), p0 = G.mv(M, X0), s = f;
      prims.push(...elementPrims(vr.el, M));
      if (s < 1) prims.push(...motif(p0, LEGS, 1, { alpha: 0.25 }));
      prims.push(...motif(mv(p0, s), LEGS.map(d => mv(d, s, true)), (e.o.det || 1) > 0 || s < 0.5 ? 1 : -1, {}));
      if (mv.two) { const pr = mv(p0, 0.6); prims.push(...arrow3(pr, G.add(pr, mv.tC), ORANGE, s >= 0.6 ? 1 : 0.3)); }
      draw3D(prims, M, stepCaption(vr, s, mv));
      return;
    }
    // the whole pattern moves at once (and, in 'cell', the cell with it): the version of the operation that keeps
    // the middle of the cell inside the cell, so the moved block overlaps the original as much as it can
    const vr = variantMid(e.o), mv = mover(vr, M), det = e.o.det || 1;
    prims.push(...elementPrims(vr.el, M));
    if (mv.two) {
      const el = vr.el, mid = [0.5, 0.5, 0.5];
      const pc = el.screw > 0 ? G.add(el.x0, G.scl(el.u, G.dot(G.sub(mid, el.x0), el.u) / G.dot(el.u, el.u))) : G.sub(mid, G.scl(el.n, (G.dot(el.n, mid) - G.dot(el.n, el.x0)) / G.dot(el.n, el.n)));
      const P = G.mv(M, pc), h = G.scl(mv.tC, 0.5);
      prims.push(...arrow3(G.sub(P, h), G.add(P, h), ORANGE, f >= 0.6 ? 1 : 0.35));
    }
    // where the copies were, faint: at the end every moving copy lands on one of these
    orbit.forEach(o => prims.push(...motif(G.mv(M, o.f), legsOf(o.op.W), o.det, { alpha: 0.18 })));
    // the copies move with the operation and stay where it puts them, in the moved cell
    const s = f;
    orbit.forEach(o => {
      const legs = legsOf(o.op.W), p = G.mv(M, o.f), hand = o.det * (det < 0 && s >= 0.5 ? -1 : 1);
      const orig = o.op.W.every((r, i) => r.every((v, j) => v === (i === j ? 1 : 0))) && o.op.w.every(v => Math.abs(v) < 1e-9);
      prims.push(...motif(mv(p, s), legs.map(d => mv(d, s, true)), hand, orig ? { hub: BRAND } : {}));
    });
    if (S.move === 'cell') {
      const C = CORNERS.map(c => mv(G.mv(M, c), s));
      EDGES.forEach(([i, j]) => { for (let k = 0; k < 4; k++) prims.push({ t: 'seg', a: G.add(C[i], G.scl(G.sub(C[j], C[i]), k / 4)), b: G.add(C[i], G.scl(G.sub(C[j], C[i]), (k + 1) / 4)), color: BRAND, w: 2.2, dash: [6, 4] }); });
      const lab = mv(G.mv(M, [1.08, 0, 0]), s), lbb = mv(G.mv(M, [0, 1.08, 0]), s), lbc = mv(G.mv(M, [0, 0, 1.08]), s);
      [['a′', lab], ['b′', lbb], ['c′', lbc]].forEach(([t, p]) => prims.push({ t: 'text', p, text: t, color: BRAND, size: 12, halo: true }));
    }
    draw3D(prims, M, stepCaption(vr, s, mv), S.move === 'cell' ? CORNERS.map(c => mv(G.mv(M, c), 1)) : orbit.map(o => mv(G.mv(M, o.f), 1)));
  }
  // crystals: the atoms, their bonds, and the operation applied to all of them
  const crystalCache = new Map();
  function crystalAtoms() {
    const c = crystal(); if (crystalCache.has(c.id)) return crystalCache.get(c.id);
    const g = G.group(c.sg), base = G.expand(g, c.atoms), Mr = G.cellMatrix(...c.cell);
    // copies on the cell faces are drawn on both faces
    const shown = [];
    for (const a of base) {
      const opts = a.f.map(v => (Math.abs(v) < 1e-6 ? [0, 1] : [v]));
      for (const x of opts[0]) for (const y of opts[1]) for (const z of opts[2]) shown.push({ el: a.el, f: [x, y, z] });
    }
    const bonds = [];
    for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
      const d = G.norm(G.mv(Mr, G.sub(shown[i].f, shown[j].f))); if (d < c.bond && d > 0.4) bonds.push([i, j, d]);
    }
    const dmin = bonds.length ? Math.min(...bonds.map(b => b[2])) : 2.5;
    const out = { base, shown, bonds, g, r0: 0.27 * dmin / Math.max(...c.cell.slice(0, 3)) };
    crystalCache.set(c.id, out);
    return out;
  }
  function crystalScene(f) {
    const c = crystal(), M = cellM(), A = crystalAtoms(), prims = [];
    // ball sizes from the shortest bond, in units of the longest cell edge (the picture's scale)
    const rad = el => A.r0 * (['O', 'F', 'N', 'B', 'C', 'Si', 'P'].includes(el) ? 0.85 : 1);
    const e = cur(), vr = variant(e.o, [0.5, 0.5, 0.5]), mv = mover(vr, M);
    prims.push(...elementPrims(vr.el, M));
    const moving = f > 0 && e.o.kind !== '1';
    A.bonds.forEach(([i, j]) => prims.push({ t: 'seg', a: G.mv(M, A.shown[i].f), b: G.mv(M, A.shown[j].f), color: '#9aa8b1', w: 2.2, alpha: moving ? 0.35 : 1 }));
    A.shown.forEach(a => prims.push(ball(G.mv(M, a.f), rad(a.el), ELCOL[a.el] || GREY, { alpha: moving ? 0.3 : 1 })));
    if (moving) {
      // every atom of the cell, carried by the operation, staying where it lands
      A.base.forEach(a => prims.push(ball(mv(G.mv(M, a.f), f), rad(a.el), ELCOL[a.el] || GREY, { ring: INK })));
    }
    draw3D(prims, M);
  }

  // ---------- 2. The diagram, looking down c ----------
  const cv2 = $('proj'), c2 = cv2.getContext('2d');
  function zLabel(op, x) {
    const W = op.W;
    if (Math.abs(W[2][0]) + Math.abs(W[2][1]) < 1e-9) {
      const sgn = W[2][2], z = G.wrap([0, 0, sgn * x[2] + op.w[2]])[2], tau = G.wrap([0, 0, z - sgn * x[2]])[2];
      return (tau > 1e-6 ? nice(G.frac(tau)) : '') + (sgn > 0 ? '+' : '−');
    }
    return fixed(G.wrap(G.add(G.mv(W, x), op.w))[2], 2);
  }
  let diagInfo = { drawn: 0, skipped: 0, horiz: [] };
  function drawDiagram() {
    const g = grp(), s = size(cv2), W = s.w, H = s.h, ctx = c2, M = g.M;
    ctx.clearRect(0, 0, W, H);
    const a = [M[0][0], M[1][0]], b = [M[0][1], M[1][1]];
    const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => [u * a[0] + v * b[0], u * a[1] + v * b[1]]);
    const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]), pad = 40;
    const sc = Math.min((W - 2 * pad) / (Math.max(...xs) - Math.min(...xs)), (H - 2 * pad - 20) / (Math.max(...ys) - Math.min(...ys)));
    const ox = W / 2 - sc * (Math.max(...xs) + Math.min(...xs)) / 2, oy = H / 2 + 8 + sc * (Math.max(...ys) + Math.min(...ys)) / 2;
    const P = (u, v) => [ox + sc * (u * a[0] + v * b[0]), oy - sc * (u * a[1] + v * b[1])];
    // the cell
    ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.beginPath(); [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], k) => { const q = P(u, v); if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.stroke();
    ctx.font = '600 12px Inter, system-ui, sans-serif'; ctx.fillStyle = GREY; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    { const q = P(1.08, 0); ctx.fillText('a', q[0], q[1]); const r = P(0, 1.08); ctx.fillText('b', r[0], r[1]); const o = P(0, 0); ctx.fillText('0', o[0] - 10, o[1] + 10); }
    const inBox = (u, v) => u > -1e-6 && u < 1 + 1e-6 && v > -1e-6 && v < 1 + 1e-6;
    const reps = (u, v) => { const out = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (inBox(u + i, v + j)) out.push([u + i, v + j]); return out; };
    diagInfo = { drawn: 0, skipped: 0, horiz: [] };
    // symmetry elements
    if (S.draw !== 'pos') {
      const seenPt = new Map(), seenLn = new Set();
      const all = [];
      for (const op of g.all) for (const t of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1]]) all.push(G.classify({ W: op.W, w: G.add(op.w, t) }, g.cv, M));
      // lines: planes containing c, and axes lying in the ab plane; points: axes along c, inversion centres
      for (const el of all) {
        if (el.kind === '1') continue;
        const isC = v => Math.abs(v[0]) < 1e-9 && Math.abs(v[1]) < 1e-9;
        if (el.kind === 'm') {
          if (Math.abs(el.n[2]) < 1e-9) { drawLine(el.x0, [-el.n[1], el.n[0]], el.letter, el.glide, null); continue; }
          if (isC(el.n)) { diagInfo.horiz.push(`${el.letter} at z = ${nice(G.frac(G.wrap(el.x0)[2]))}`); continue; }
          diagInfo.skipped++; continue;
        }
        if (el.kind === '-1') { const w0 = G.wrap(el.x0); reps(w0[0], w0[1]).forEach(([u, v]) => pointSym(u, v, 'inv', 0, nice(G.frac(w0[2])))); continue; }
        const u = el.u;
        if (isC(u)) { const w0 = G.wrap(el.x0); const n = Math.abs(Number(el.kind)), key = `${fixed(w0[0], 3)},${fixed(w0[1], 3)}`; const prev = seenPt.get(key); const rank = n * 10 + (el.det < 0 ? 1 : 0); if (!prev || prev.rank < rank) seenPt.set(key, { rank, w0, el }); continue; }
        if (Math.abs(u[2]) < 1e-9 && el.det > 0) { drawLine(el.x0, [u[0], u[1]], 'axis', null, el); continue; }
        diagInfo.skipped++;
      }
      for (const { w0, el } of seenPt.values()) reps(w0[0], w0[1]).forEach(([u, v]) => pointSym(u, v, el.kind, el.screw || 0, ''));
      function drawLine(x0, dir, letter, glide, axis) {
        // the line through (x0, y0) along dir, and its lattice copies, clipped to the cell
        const nrm = [-dir[1], dir[0]], d0 = nrm[0] * x0[0] + nrm[1] * x0[1];
        for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
          const d = d0 + i * nrm[0] + j * nrm[1], pts = [];
          for (const [p, q] of [[[0, 0], [1, 0]], [[1, 0], [1, 1]], [[1, 1], [0, 1]], [[0, 1], [0, 0]]]) {
            const fa = nrm[0] * p[0] + nrm[1] * p[1] - d, fb = nrm[0] * q[0] + nrm[1] * q[1] - d;
            if (Math.abs(fa) < 1e-9) pts.push(p); if (fa * fb < -1e-12) { const t = fa / (fa - fb); pts.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
          }
          const u = []; for (const p of pts) if (!u.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6)) u.push(p);
          if (u.length < 2) continue;
          const key = `${letter}|${(axis ? 'A' + (axis.screw || 0) + fixed(G.wrap(axis.x0)[2], 3) : '')}|${u.map(p => p.map(v => fixed(v, 4)).join(',')).sort().join(';')}`;
          if (seenLn.has(key)) continue; seenLn.add(key);
          const A = P(...u[0]), B = P(...u[1]);
          ctx.save();
          if (axis) { ctx.strokeStyle = BLUE; ctx.lineWidth = 1.4; ctx.setLineDash(axis.screw ? [2, 3] : []); }
          else {
            ctx.strokeStyle = BRAND; ctx.lineWidth = letter === 'm' ? 3 : 2;
            const gz = glide && Math.abs(glide[2]) > 1e-9, gxy = glide && (Math.abs(glide[0]) > 1e-9 || Math.abs(glide[1]) > 1e-9);
            ctx.setLineDash(letter === 'm' ? [] : letter === 'n' ? [8, 3, 2, 3] : letter === 'd' ? [8, 3, 2, 3, 2, 3] : gz && !gxy ? [2, 3] : [8, 4]);
          }
          ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); ctx.restore();
          if (axis) { const m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]; ctx.fillStyle = BLUE; ctx.font = '700 11px Inter, system-ui, sans-serif'; ctx.fillText(`${axis.sym}${deep ? ' z=' + nice(G.frac(G.wrap(axis.x0)[2])) : ''}`, m[0] + 9, m[1] - 8); }
          diagInfo.drawn++;
        }
      }
      function pointSym(u, v, kind, screw, label) {
        const q = P(u, v), r = 7; ctx.save(); ctx.fillStyle = BRAND; ctx.strokeStyle = BRAND; ctx.lineWidth = 1.5;
        const poly = n => { ctx.beginPath(); for (let k = 0; k < n; k++) { const t = -Math.PI / 2 + 2 * Math.PI * k / n; const x = q[0] + r * Math.cos(t), y = q[1] + r * Math.sin(t); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.closePath(); };
        if (kind === 'inv') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(q[0], q[1], 3.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); }
        else if (kind === '2') { ctx.beginPath(); ctx.ellipse(q[0], q[1], 4, 8, 0, 0, 2 * Math.PI); if (screw) ctx.stroke(); else ctx.fill(); }
        else {
          const n = Math.abs(Number(kind)); poly(n);
          if (Number(kind) < 0) { ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); ctx.fillStyle = BRAND; ctx.beginPath(); ctx.arc(q[0], q[1], 2, 0, 2 * Math.PI); ctx.fill(); }
          else if (screw) { ctx.stroke(); ctx.font = '700 9px Inter, system-ui, sans-serif'; ctx.fillText(String(screw), q[0], q[1] + 1); }
          else ctx.fill();
        }
        ctx.restore(); diagInfo.drawn++;
      }
    }
    // general positions
    if (S.draw !== 'el') {
      const orb = G.orbit(g, X0);
      for (const o of orb) reps(o.f[0], o.f[1]).forEach(([u, v]) => {
        const q = P(u, v);
        ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(q[0], q[1], 9, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        if (o.det < 0) { ctx.fillStyle = INK; ctx.font = '800 13px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(',', q[0] + 0.5, q[1] - 2); }
        ctx.fillStyle = INK; ctx.font = '600 10.5px Inter, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(zLabel(o.op, X0), q[0] + 11, q[1] - 7);
      });
    }
    if (diagInfo.horiz.length) { ctx.fillStyle = BRAND; ctx.font = '600 11.5px Inter, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(`planes across c: ${[...new Set(diagInfo.horiz)].join(', ')}`, 10, 6); }
  }

  // ---------- the stereogram of the point group ----------
  const cvS = $('stereo'), cs = cvS.getContext('2d');
  function drawStereo() {
    const g = grp(), M = cellM(), Mi = G.inv3(M), s = size(cvS), W = s.w, H = s.h, R = Math.min(W, H) / 2 - 22, cx = W / 2, cy = H / 2;
    cs.clearRect(0, 0, W, H);
    cs.strokeStyle = INK; cs.lineWidth = 1.4; cs.beginPath(); cs.arc(cx, cy, R, 0, 2 * Math.PI); cs.stroke();
    const proj = v => { const n = G.norm(v), x = v[0] / n, y = v[1] / n, z = v[2] / n, up = z >= -1e-9, k = up ? 1 / (1 + z) : 1 / (1 - z); return [cx + R * x * k, cy - R * y * k, up]; };
    // mirror planes as great circles (upper half), rotation axes as their symbols
    const seen = new Set();
    g.reps.forEach(o => {
      const Wc = G.mm(G.mm(M, o.W), Mi);
      if (o.kind === 'm') {
        const nu = (() => { for (const e of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) { const v = G.sub(e, G.mv(Wc, e)); if (G.norm(v) > 1e-6) return G.scl(v, 1 / G.norm(v)); } return [0, 0, 1]; })();
        const key = nu.map(v => fixed(Math.abs(v), 3)).join(); if (seen.has('m' + key)) return; seen.add('m' + key);
        let e1 = G.cross(nu, Math.abs(nu[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]); e1 = G.scl(e1, 1 / G.norm(e1)); const e2 = G.cross(nu, e1);
        cs.strokeStyle = BRAND; cs.lineWidth = 2; cs.beginPath(); let pen = false;
        for (let k = 0; k <= 360; k++) { const t = k * Math.PI / 180, v = G.add(G.scl(e1, Math.cos(t)), G.scl(e2, Math.sin(t))); if (v[2] < -1e-6) { pen = false; continue; } const q = proj(v); if (pen) cs.lineTo(q[0], q[1]); else { cs.moveTo(q[0], q[1]); pen = true; } }
        cs.stroke();
      } else if (o.u) {
        const n = Math.abs(Number(o.kind)); let v = G.mv(M, o.u); if (v[2] < 0 || (Math.abs(v[2]) < 1e-9 && (v[1] < 0 || (Math.abs(v[1]) < 1e-9 && v[0] < 0)))) v = G.scl(v, -1);
        const key = v.map(c => fixed(c / G.norm(v), 3)).join(); if (seen.has('a' + key + n)) return; seen.add('a' + key + n);
        [v, G.scl(v, -1)].forEach(w => { if (w[2] < -1e-9) return; const q = proj(w); cs.fillStyle = BRAND; cs.strokeStyle = BRAND; cs.beginPath(); if (n === 2) cs.ellipse(q[0], q[1], 3.5, 6.5, Math.atan2(q[1] - cy, q[0] - cx), 0, 2 * Math.PI); else for (let k = 0; k < n; k++) { const t = -Math.PI / 2 + 2 * Math.PI * k / n; const x = q[0] + 6.5 * Math.cos(t), y = q[1] + 6.5 * Math.sin(t); if (k) cs.lineTo(x, y); else cs.moveTo(x, y); } cs.closePath(); if (o.det < 0) { cs.fillStyle = '#fff'; cs.fill(); cs.stroke(); } else cs.fill(); });
      }
    });
    // the poles of one general direction under every operation of the point group
    const v0 = [0.42, 0.27, 0.86];
    const pts = [];
    g.reps.forEach(o => { const Wc = G.mm(G.mm(M, o.W), Mi), v = G.mv(Wc, v0); if (!pts.some(p => G.norm(G.sub(p.v, v)) < 1e-6)) pts.push({ v, det: o.det }); });
    pts.forEach(({ v }) => { const q = proj(v); cs.strokeStyle = INK; cs.lineWidth = 1.4; cs.fillStyle = INK; cs.beginPath(); cs.arc(q[0], q[1], q[2] ? 3.5 : 5.5, 0, 2 * Math.PI); if (q[2]) cs.fill(); else cs.stroke(); });
    return pts.length;
  }

  // ---------- the operation card, the census, the Wyckoff table ----------
  function matrixHTML(W, w) {
    let h = '<div class="mat">';
    for (let i = 0; i < 3; i++) { h += W[i].map(v => `<span>${v === 0 ? '0' : String(v).replace('-', '−')}</span>`).join('') + '<span></span>' + `<span>${nice(G.frac(w[i]))}</span>`; }
    return h + '</div>';
  }
  function opCard() {
    const e = cur(), o = e.o, y = G.add(G.mv(o.W, X0), o.w);
    return `<p><b style="font-size:16px">${o.sym}</b> · ${o.name}${o.where ? ` at <code>${nice(o.where)}</code>` : ''}</p>${matrixHTML(o.W, o.w)}<p>As coordinates: <code>${nice(o.text)}</code></p>`
      + `<p>The object at (${X0.map(v => fixed(v, 3)).join(', ')}) goes to (${y.map(v => fixed(v, 3)).join(', ')})${G.wrap(y).some((v, k) => Math.abs(v - y[k]) > 1e-9) ? `, the same as (${G.wrap(y).map(v => fixed(v, 3)).join(', ')}) in this cell` : ''}.</p>`
      + (deep && o.kind !== 't' && o.kind !== '1' ? `<p>det W = ${o.det > 0 ? '+1' : '−1'}, tr W = ${fixed(o.W[0][0] + o.W[1][1] + o.W[2][2], 0)}; intrinsic part (${o.tin.map(v => nice(G.frac(v))).join(', ')})${o.glide ? `, glide (${o.glide.map(v => nice(G.frac(v))).join(', ')})` : ''}.</p>` : '');
  }
  function census() {
    const g = grp(), counts = {};
    g.all.forEach(op => { const el = G.classify(op, g.cv, g.M); const k = el.kind === '1' ? (el.trans ? 't' : '1') : el.kind === 'm' ? (el.letter === 'm' ? 'm' : 'glide ' + el.letter) : el.screw ? `${Math.abs(Number(el.kind))}${'₀₁₂₃₄₅'[el.screw]} screw` : el.kind; counts[k] = (counts[k] || 0) + 1; });
    const NAMES = { 1: 'identity', t: 'centring translations', 2: '2-fold rotations', 3: '3-fold rotations', 4: '4-fold rotations', 6: '6-fold rotations', '-1': 'inversion', m: 'mirrors', '-3': '3̄ rotoinversions', '-4': '4̄ rotoinversions', '-6': '6̄ rotoinversions' };
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${NAMES[k] || (k.startsWith('glide') ? k.replace('glide ', '') + '-glides' : k + 's')}</td><td>${v}</td></tr>`).join('');
    return `<table><tr><th>Operation</th><th>In one cell</th></tr>${rows}<tr><td><b>All</b></td><td><b>${g.all.length}</b></td></tr></table>`;
  }
  function wyckoff() {
    const c = crystal(), A = crystalAtoms(), order = A.g.all.length;
    const rows = c.atoms.map(a => { const m = G.orbit(A.g, a.f).length; return `<tr><td>${a.el}</td><td>${a.w}</td><td><code>${a.f.map(v => nice(G.frac(v))).join(', ')}</code></td><td>${m}</td><td>${order / m}</td></tr>`; }).join('');
    return `<table><tr><th>Atom</th><th>Wyckoff</th><th>Position</th><th>Copies</th><th>Site order</th></tr>${rows}</table><p style="margin-top:8px">${A.base.length} atoms in the cell from ${c.atoms.length} in the asymmetric unit; the group has ${order} operations in the cell, and copies × site order = ${order} for every atom.</p>`;
  }

  // ---------- rendering each mode ----------
  function renderCommon() {
    const g = grp(), order = g.all.length;
    $('sgn').value = g.n;
    put('sg-name', `${g.html}${g.old ? ` (formerly ${g.old})` : ''}${g.setting ? `, ${g.setting}` : ''}`);
    stats([
      ['Space group', `${g.n} · ${g.html}`, g.old ? `formerly ${g.old}` : g.setting || 'standard setting'],
      ['Crystal system', g.system, `${CENNAME[g.cen]} lattice, ${BRAV[g.system]}${g.cen === 'R' ? 'R' : g.cen}`],
      ['Point group', g.pg.replace(/-(\d)/g, '<span class="ovl">$1</span>'), `${g.reps.length} operations without the shifts`],
      ['General positions', String(order), g.symmorphic ? 'symmorphic: no screws or glides' : 'non-symmorphic: has screws or glides'],
    ]);
  }
  function renderList() {
    const g = grp(), list = entries(), groups = [['The identity', e => e.o.kind === '1'], ['Rotations and screws', e => ['2', '3', '4', '6'].includes(e.o.kind)], ['Inversion and rotoinversions', e => ['-1', '-3', '-4', '-6'].includes(e.o.kind)], ['Mirrors and glides', e => e.o.kind === 'm'], ['Centring translations', e => e.o.kind === 't']];
    const html = groups.map(([t, f]) => { const xs = list.filter(f); return xs.length ? `<h4>${t}</h4>` + xs.map(e => `<button type="button" class="op-btn" data-op="${e.i}" aria-pressed="${e.i === S.op}"><b>${e.o.sym}</b><span>${nice(e.o.where || e.o.text)}</span></button>`).join('') : ''; }).join('');
    const key = `${g.n}|${S.op}`;
    if ($('oplist').dataset.key !== key) { $('oplist').dataset.key = key; $('oplist').innerHTML = html; const b = $('oplist').querySelector('[aria-pressed="true"]'); if (b) b.scrollIntoView({ block: 'nearest' }); }
  }
  // a screw n_m: turn 360/n degrees and slide m/n of a cell; n of them make one full turn and m whole cells
  function staircase(o) {
    const n = Math.abs(Number(o.kind)), m = o.screw, sub = '₀₁₂₃₄₅'[m];
    return `A ${n}${sub} screw is a turn of ${360 / n}° plus a slide of ${m}/${n} of a cell along the axis, done together. Repeat it ${n} times and you have turned all the way round and moved ${m === 1 ? 'one whole cell' : `${m} whole cells`} along the axis, which is just a lattice translation: the copies climb round the axis like a spiral staircase.`;
  }
  function renderOps() {
    const g = grp(), e = cur(), o = e.o;
    put('dg-title', `${g.n} · ${g.html}: the operations`);
    put('dg-cap', S.move === 'one' ? 'The handed object at a general position, and a faint copy for every operation. Pick an operation on the right to see its symmetry element and watch the object move to its image. Drag to turn the cell.' : `Every copy in the cell moves at once${S.move === 'cell' ? ', and so does the cell itself (dashed)' : ''}; the faint ones show where the copies were. At the end the moved copies stay where the operation puts them: every one lands where the repeating pattern has a copy, whether in this cell or the next. The original object has a green hub.`);
    legend('dg-legend', [[INK, 'swatch--dot', 'dark hub: original handedness'], [GREY, 'swatch--dot', 'white hub: mirror image'], [BRAND, '', 'the symmetry element']]);
    const keeps = o.det > 0;
    put('info', o.kind === '1' ? `<b>The identity.</b> Every group has it: the move that does nothing. ${g.all.length} operations in all, so ${g.all.length} copies of the object in the cell.`
      : o.kind === 't' ? `<b>A centring translation.</b> The lattice is ${CENNAME[g.cen]}, so this shift by (${nice(G.pointText(o.w))}) is a symmetry too; it doubles (or triples, or quadruples) the copies of every other operation.`
      : `<b>${o.sym} · ${o.name}.</b> It ${nice(o.desc)}. ${keeps ? 'It keeps the object\'s handedness.' : 'It turns the object into its mirror image.'}${o.screw > 0 ? ` ${staircase(o)}` : ''}`);
    frameFn = opsScene;
    put('pa-title', 'The point group, as a stereogram'); put('pa-cap', `The ${g.reps.length} operations with their shifts removed, acting on one direction: dots above the equator, circles below. Teal-green: mirror planes and rotation axes.`);
    legend('pa-legend', [[INK, 'swatch--dot', 'pole, upper half'], [BRAND, '', 'mirror plane']]);
    put('pb-title', 'The operation, written out'); put('pb-cap', 'Its matrix W and shift w in cell coordinates, x → Wx + w, and what it does to the object.');
    put('opcard', opCard());
    put('takeaway', 'Every space group is a lattice of translations plus a finite set of turning, reflecting and inverting operations, some of them with screw or glide shifts that only a repeating pattern can have.');
  }
  function renderDiagram() {
    const g = grp();
    put('dg-title', `${g.n} · ${g.html}, looking down c`);
    put('dg-cap', 'Circles: the copies of one general point, labelled with their heights; a comma marks a mirror image. Symbols: two-fold axes (lens, open for 2₁), three-, four- and six-fold axes (triangle, square, hexagon; open with the screw number for screws; white with a dot for rotoinversions), inversion centres (small circles). Lines: mirrors (solid), glides (dashed, dotted along c, dot-dashed for n), axes lying in the page (blue).');
    legend('dg-legend', [[INK, 'swatch--dot', 'general position'], [BRAND, '', 'mirror'], [BRAND, 'swatch--dash', 'glide'], [BLUE, '', 'axis in the page']]);
    drawDiagram();
    put('info', `${g.all.length} copies of the general point${g.cv.length > 1 ? `, ${g.reps.length} for each of the ${g.cv.length} lattice points of the ${CENNAME[g.cen]} cell` : ''}. ${diagInfo.skipped ? 'Some symmetry elements, such as the three-fold axes of a cubic group, are tilted to the page and not drawn here; tab 1 shows each of them in 3D.' : 'Every symmetry element is along c, in a plane containing c, or in the page, so all of them are drawn.'}`);
    frameFn = null;
    put('pa-title', 'The point group, as a stereogram'); put('pa-cap', 'The same symmetry with the translations removed: the poles of one direction under every operation.');
    legend('pa-legend', [[INK, 'swatch--dot', 'pole, upper half'], [BRAND, '', 'mirror plane']]);
    put('pb-title', 'What the group contains'); put('pb-cap', 'Every operation in one cell, by kind, including the copies the lattice centring adds.');
    put('opcard', census());
    put('takeaway', 'The International Tables give every group two diagrams like this one, the general positions and the symmetry elements; together they are enough to place every atom of a crystal.');
  }
  function renderCrystal() {
    const c = crystal(), A = crystalAtoms(), e = cur(), o = e.o;
    put('dg-title', `${c.name}: ${A.g.html}`);
    put('dg-cap', `The conventional cell, ${c.cell.slice(0, 3).map(v => fixed(v, 2)).join(' × ')} Å, with ${A.base.length} atoms (atoms on the faces are drawn on both). Pick an operation and the whole cell moves; each atom lands on an atom of the same kind.`);
    legend('dg-legend', [...new Set(c.atoms.map(a => a.el))].map(el => [ELCOL[el] || GREY, 'swatch--dot', el]).concat([[BRAND, '', 'the symmetry element']]));
    // check: the operation maps every atom onto one of the same element
    const ok = A.base.every(a => { const y = G.wrap(G.add(G.mv(o.W, a.f), o.w)); return A.base.some(b => b.el === a.el && G.sub(b.f, y).every(v => Math.abs(v - Math.round(v)) < 1e-4)); });
    put('info', `<b>${c.atoms.length} atom${c.atoms.length > 1 ? 's' : ''} in, ${A.base.length} out.</b> ${c.note} ${o.kind === '1' ? '' : `The ${o.name}${o.where ? ` at ${nice(o.where)}` : ''} sends ${ok ? 'every one of the ' + A.base.length + ' atoms onto an atom of the same element' : 'some atoms to empty places: check the data'}.`}`);
    frameFn = crystalScene;
    put('pa-title', 'The point group, as a stereogram'); put('pa-cap', 'The crystal class: its symmetry with the translations removed, as seen in the shape of a well-grown crystal.');
    legend('pa-legend', [[INK, 'swatch--dot', 'pole, upper half'], [BRAND, '', 'mirror plane']]);
    put('pb-title', 'The asymmetric unit and its Wyckoff positions'); put('pb-cap', 'Each atom stored in the structure, and how many copies the group makes of it.');
    put('opcard', wyckoff());
    put('takeaway', 'A crystal structure is a space group, a cell and a few atoms. The group\'s operations do the rest: they generate every atom, and every one of them maps the crystal onto itself.');
  }

  // ---------- the animation: one lap, then a pause on the finished move ----------
  const LAP = 2.6, HOLD = 1.2;
  let animOn = !reduceMotion, animT0 = performance.now(), raf = 0, seen = true, lastF = null;
  const running = () => animOn && !document.hidden && seen && !!frameFn;
  const animFrac = now => Math.max(0, Math.min(1, (((now - animT0) / 1000) % (LAP + HOLD)) / LAP));
  const ease = f => (f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f));
  function tick(now) { raf = 0; if (!running()) return; const f = Math.round(animFrac(now) * 400) / 400; if (f !== lastF) { lastF = f; frameFn(ease(f)); } raf = requestAnimationFrame(tick); }
  function kick() { if (running() && !raf) raf = requestAnimationFrame(tick); }
  function syncAnim() { $('anim').textContent = animOn ? '❚❚ Pause' : '▶ Animate'; $('anim').setAttribute('aria-pressed', String(animOn)); $('anim').hidden = mode === 'diagram'; }
  $('anim').addEventListener('click', () => { animOn = !animOn; if (animOn) animT0 = performance.now(); syncAnim(); if (!animOn && frameFn) frameFn(1); kick(); });
  document.addEventListener('visibilitychange', kick);
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { seen = es[0].isIntersecting; kick(); }).observe($('mag-view'));
  const nowF = () => (running() ? ease(animFrac(performance.now())) : 1);

  // ---------- controls ----------
  function syncControls() {
    const pressed = (attr, val) => document.querySelectorAll(`button[data-${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(val))));
    pressed('sg', S.n); pressed('move', S.move); pressed('draw', S.draw); pressed('cr', S.crystal); pressed('depth', deep ? 'deep' : 'simple');
    $('sgn').disabled = mode === 'crystal'; $('sg-prev').disabled = mode === 'crystal' || S.n <= 1; $('sg-next').disabled = mode === 'crystal' || S.n >= 230;
    $('depth-hint').textContent = deep ? 'The details: the matrix test for each operation, its intrinsic shift, and heights on the axes in the diagram.' : 'The main ideas; switch to Go deeper for the matrices and the shifts.';
  }
  function render() {
    if (mode === 'crystal') S.n = crystal().sg;
    if (!entries().some(e => e.i === S.op)) S.op = 0;
    syncControls(); syncAnim(); renderCommon(); renderList();
    if (mode === 'ops') renderOps(); else if (mode === 'diagram') renderDiagram(); else renderCrystal();
    const np = drawStereo();
    $('stereo').setAttribute('aria-label', `Stereographic projection of point group ${grp().pg}: ${np} poles.`);
    if (frameFn) frameFn(nowF());
    $('view').setAttribute('aria-label', `${$('dg-title').textContent}. ${$('info').textContent}`);
    $('proj').setAttribute('aria-label', `${$('dg-title').textContent}. ${$('info').textContent}`);
    lastF = null; kick();
  }
  function applyMode() {
    document.querySelectorAll('.tab').forEach(b => { const on = b.dataset.mode === mode; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $('lab').setAttribute('aria-labelledby', 'tab-' + mode);
    document.querySelectorAll('.mode-intro').forEach(el => { el.hidden = el.dataset.for !== mode; });
    document.querySelectorAll('[data-modes]').forEach(el => { el.hidden = !el.dataset.modes.split(' ').includes(mode); });
    $('view').hidden = mode === 'diagram'; $('proj').hidden = mode !== 'diagram';
    animT0 = performance.now();
    render();
  }
  // the materials
  $('crystal-chips').innerHTML = CRYSTALS.map(c => `<button class="chip-btn" type="button" data-cr="${c.id}" aria-pressed="false">${c.name.split(',')[0]}</button>`).join('');
  function uprightFor(o) {
    if (o && o.screw > 0 && mode === 'ops') { let v = G.mv(cellM(), o.u); v = G.scl(v, 1 / G.norm(v)); if (v[2] < -1e-6) v = G.scl(v, -1); view.up = v; view.pitch = 0.28; }
  }
  const setGroup = n => { S.n = Math.max(1, Math.min(230, Math.round(n) || 1)); S.op = Math.min(1, entries().length - 1); view.up = [0, 0, 1]; view.pitch = 0.42; uprightFor(cur().o); animT0 = performance.now(); render(); };
  $('sgn').addEventListener('change', e => setGroup(+e.target.value));
  $('sgn').addEventListener('keydown', e => { if (e.key === 'Enter') setGroup(+e.target.value); });
  $('sg-prev').addEventListener('click', () => setGroup(S.n - 1));
  $('sg-next').addEventListener('click', () => setGroup(S.n + 1));
  document.querySelector('.lab-main').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.op !== undefined && b.closest('#oplist')) { S.op = +d.op; uprightFor(cur().o); animT0 = performance.now(); render(); return; }
    if (!b.closest('.controls')) return;
    if (d.sg) { if (mode === 'crystal') { mode = 'ops'; applyMode(); } setGroup(+d.sg); return; }
    if (d.cr) { S.crystal = d.cr; S.op = 1; animT0 = performance.now(); }
    else if (d.move) { S.move = d.move; animT0 = performance.now(); }
    else if (d.draw) S.draw = d.draw;
    else if (b.id === 'video-values') Object.assign(S, JSON.parse(JSON.stringify(START)));
    else return;
    render();
  });
  // drag to turn the cell: sideways turns it about c, up and down tilts it (mouse only; on touch screens vertical swipes scroll)
  let drag = null;
  cv3.addEventListener('pointerdown', e => { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch, touch: e.pointerType === 'touch' }; try { cv3.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } });
  cv3.addEventListener('pointermove', e => {
    if (!drag) return;
    view.yaw = drag.yaw + (e.clientX - drag.x) * 0.01;
    if (!drag.touch) view.pitch = Math.max(-1.4, Math.min(1.4, drag.pitch + (e.clientY - drag.y) * 0.01));
    if (frameFn) frameFn(nowF());
  });
  ['pointerup', 'pointercancel'].forEach(t => cv3.addEventListener(t, () => { drag = null; }));
  if ('ResizeObserver' in window) new ResizeObserver(() => { if (frameFn) frameFn(nowF()); if (mode === 'diagram') drawDiagram(); drawStereo(); }).observe($('mag-view'));
  document.querySelectorAll('[data-depth]').forEach(b => b.addEventListener('click', () => {
    deep = b.dataset.depth === 'deep';
    try { localStorage.setItem('sg-depth', deep ? 'deep' : 'simple'); } catch (e) { /* not remembered: fine */ }
    render();
  }));
  const tabs = Array.from(document.querySelectorAll('.tab'));
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => { mode = b.dataset.mode; applyMode(); });
    b.addEventListener('keydown', e => {
      const to = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault(); tabs[to].focus(); tabs[to].click();
    });
  });

  // ---------- predict-first loaders ----------
  const fresh = o => Object.assign(S, JSON.parse(JSON.stringify(START)), o);
  const findOp = (n, test) => { const g = G.group(n); const i = g.reps.findIndex(test); return i < 0 ? 0 : i; };
  const QUESTIONS = {
    p21c: () => { mode = 'ops'; fresh({ n: 14, op: 1 }); },
    p21: () => { mode = 'diagram'; fresh({ n: 4 }); },
    pnma: () => { mode = 'ops'; fresh({ n: 62, op: findOp(62, o => o.letter === 'n') }); },
    fm3m: () => { mode = 'ops'; fresh({ n: 225, op: 1 }); },
    gaas: () => { mode = 'crystal'; fresh({ crystal: 'gaas', op: findOp(216, o => o.kind === '-4') }); },
    graphite: () => { mode = 'crystal'; fresh({ crystal: 'graphite', op: findOp(194, o => o.kind === '6' && o.screw === 3 && o.sense > 0) }); },
    quartz: () => { mode = 'crystal'; fresh({ crystal: 'quartz', op: findOp(152, o => o.kind === '3' && o.sense > 0) }); },
    six: () => { mode = 'ops'; fresh({ n: 191, op: findOp(191, o => o.kind === '6' && o.sense > 0) }); },
  };
  document.querySelectorAll('.predict__load[data-q]').forEach(b => b.addEventListener('click', () => {
    QUESTIONS[b.dataset.q]();
    view.up = [0, 0, 1]; view.pitch = 0.42; uprightFor(cur().o);
    applyMode();
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    const t = tabs.find(x => x.dataset.mode === mode); if (t) t.focus({ preventScroll: true });
  }));

  syncAnim();
  uprightFor(cur().o);
  applyMode();
  window.__sg = { S, render, setMode: m => { mode = m; applyMode(); }, frame: f => frameFn && frameFn(f), diag: () => diagInfo };
})();
