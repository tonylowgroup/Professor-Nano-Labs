/* Divergence and curl lab: page logic. Physics in physics.js (window.DC). */
(function () {
  'use strict';
  const D = window.DC, TAU = D.TAU;
  const $ = id => document.getElementById(id);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const START = { field: 'source', px: 0.8, py: 0.5, side: 0.6, src: 'one', cx: 0, cy: 0, rad: 0.8, pot: 'grad' };
  const S = JSON.parse(JSON.stringify(START));
  let mode = 'field';
  let deep = false;
  try { deep = localStorage.getItem('divcurl-depth') === 'deep'; } catch (e) { /* not remembered: fine */ }

  const INK = '#14232c', BLUE = '#1f6fb4', ORANGE = '#b35900', GREY = '#5f7382', LIGHT = '#c3ced5', RED = '#c2372f';
  const BRAND = (getComputedStyle(document.documentElement).getPropertyValue('--brand') || '#0b6e85').trim();
  const NAMES = { source: 'source', vortex: 'vortex', shear: 'shear', saddle: 'saddle', river: 'river', fading: 'fading source', charge: 'line charge', drain: 'whirlpool' };

  // ---------- formatting and page helpers ----------
  const fixed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const signed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? fixed(0, d) : (x > 0 ? '+' : '') + fixed(x, d));
  const trim = v => String(Math.round(v * 100) / 100).replace('-', '−');
  const sub = t => String(t).replace(/_\{([^}]*)\}|_([A-Za-z0-9])/g, (m, a, b) => `<sub>${a || b}</sub>`);
  const sym = t => `<span class="sym">${t}</span>`;
  const range = (a, b, k) => Array.from({ length: k + 1 }, (_, i) => a + (b - a) * i / k);
  function stats(items) {
    $('stats').className = `stats stats--${items.length} stats--steady stats--wrap`;
    $('stats').innerHTML = items.map(([label, value, s2]) => `<div class="stat"><div class="stat__label">${sub(label)}</div><div class="stat__value">${sub(value)}</div><div class="stat__sub">${sub(s2)}</div></div>`).join('');
  }
  function typeset(el) { if (window.MathJax && MathJax.typesetPromise && /\\\(/.test(el.innerHTML)) MathJax.typesetPromise([el]).catch(() => {}); }
  function setHTML(el, html) { if (el.dataset.html === html) return; el.dataset.html = html; el.innerHTML = html; typeset(el); }
  const put = (id, t) => setHTML($(id), sub(t));
  function legend(id, items) { setHTML($(id), items.map(([c, k, l]) => `<li style="color:${c}"><span class="swatch ${k}"></span><span>${sub(l)}</span></li>`).join('')); }
  const alpha = (hex, a) => { const v = parseInt(hex.slice(1), 16); return `rgba(${v >> 16}, ${(v >> 8) & 255}, ${v & 255}, ${a})`; };
  const MARGIN = { l: 50, r: 14, t: 12, b: 40 };
  const field = new NanoPlot($('field'), { margin: { l: 40, r: 10, t: 10, b: 34 }, narrowMargin: { l: 38, r: 8 }, xLabel: 'x', yLabel: 'y' });
  const plotA = new NanoPlot($('plot-a'), { margin: MARGIN, narrowMargin: { l: 48, r: 10 } });
  const plotB = new NanoPlot($('plot-b'), { margin: MARGIN, narrowMargin: { l: 48, r: 10 } });
  const cache = new Map();
  function memo(key, fn) { let v; if (cache.has(key)) { v = cache.get(key); cache.delete(key); } else v = fn(); cache.set(key, v); if (cache.size > 40) cache.delete(cache.keys().next().value); return v; }

  // equal scales on both axes: the shorter side spans ±half
  function fit(pl, half) {
    const W = pl.w - pl.m.l - pl.m.r, H = pl.h - pl.m.t - pl.m.b, r = W / H;
    if (r >= 1) pl.setRange([-half * r, half * r], [-half, half]); else pl.setRange([-half, half], [-half / r, half / r]);
  }
  const curField = () => (mode === 'zeros' ? D.ZEROS[S.pot] : D.FIELDS[S.field]);
  const fkey = () => (mode === 'zeros' ? 'z' + S.pot : mode === 'gauss' ? 'g' + S.src : 'f' + S.field);
  const vec = (x, y) => (mode === 'gauss' ? D.field2(D.SOURCES[S.src], x, y) : curField().F(x, y));

  // ---------- arrows: one line layer, broken by NaNs; lengths saturate so the strong and the weak both show ----------
  function arrows(pl) {
    const xr = pl.xr, yr = pl.yr, sp = (yr[1] - yr[0]) / 13, key = `a|${fkey()}|${xr.map(v => v.toFixed(3))}|${yr.map(v => v.toFixed(3))}`;
    return memo(key, () => {
      const pts = [];
      for (let y = yr[0] + sp / 2; y < yr[1]; y += sp) for (let x = xr[0] + sp / 2; x < xr[1]; x += sp) {
        const [fx, fy] = vec(x, y), m = Math.hypot(fx, fy);
        if (Number.isFinite(m)) pts.push([x, y, fx, fy, m]);
      }
      const ms = pts.map(p => p[4]).sort((a, b) => a - b), ref = Math.max(1e-9, ms[Math.floor(0.6 * ms.length)] || 1);
      const X = [], Y = [];
      for (const [x, y, fx, fy, m] of pts) {
        if (m < 1e-9) continue;
        const len = 0.82 * sp * Math.tanh(m / (1.4 * ref)), ux = fx / m, uy = fy / m;
        const x0 = x - ux * len / 2, y0 = y - uy * len / 2, x1 = x + ux * len / 2, y1 = y + uy * len / 2, hd = Math.min(0.32 * len, 0.22 * sp);
        X.push(x0, x1, NaN, x1 - hd * (ux * 0.87 - uy * 0.5), x1, x1 - hd * (ux * 0.87 + uy * 0.5), NaN);
        Y.push(y0, y1, NaN, y1 - hd * (uy * 0.87 + ux * 0.5), y1, y1 - hd * (uy * 0.87 - ux * 0.5), NaN);
      }
      return { x: X, y: Y, ref };
    });
  }

  // ---------- contour lines by marching squares ----------
  function contours(f, xr, yr, n, levels) {
    const xs = range(xr[0], xr[1], n), ys = range(yr[0], yr[1], n), v = ys.map(y => xs.map(x => f(x, y))), X = [], Y = [];
    for (const L of levels) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const c = [[xs[i], ys[j], v[j][i] - L], [xs[i + 1], ys[j], v[j][i + 1] - L], [xs[i + 1], ys[j + 1], v[j + 1][i + 1] - L], [xs[i], ys[j + 1], v[j + 1][i] - L]], pts = [];
      for (let k = 0; k < 4; k++) { const p = c[k], q = c[(k + 1) % 4]; if ((p[2] > 0) !== (q[2] > 0)) { const t = p[2] / (p[2] - q[2]); pts.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); } }
      for (let k = 0; k + 1 < pts.length; k += 2) { X.push(pts[k][0], pts[k + 1][0], NaN); Y.push(pts[k][1], pts[k + 1][1], NaN); }
    }
    return { x: X, y: Y };
  }

  // ---------- a map of a quantity: white at zero, orange positive, blue negative ----------
  const ORANGE_RGB = [179, 89, 0], BLUE_RGB = [31, 111, 180];
  function heat(f, xr, yr, key) {
    return memo('h|' + key + '|' + xr.map(v => v.toFixed(3)) + '|' + yr.map(v => v.toFixed(3)), () => {
      const W = 120, H = Math.max(40, Math.round(120 * (yr[1] - yr[0]) / (xr[1] - xr[0]))), vals = new Float64Array(W * H);
      let vmax = 0;
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const v = f(xr[0] + (i + 0.5) / W * (xr[1] - xr[0]), yr[1] - (j + 0.5) / H * (yr[1] - yr[0]));
        vals[j * W + i] = v; if (Number.isFinite(v)) vmax = Math.max(vmax, Math.abs(v));
      }
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const cx = cv.getContext('2d'), im = cx.createImageData(W, H);
      for (let k = 0; k < W * H; k++) {
        const t = vmax > 1e-9 ? Math.max(-1, Math.min(1, vals[k] / vmax)) : 0, c = t >= 0 ? ORANGE_RGB : BLUE_RGB, a = 0.85 * Math.abs(t);
        im.data[4 * k] = Math.round(255 + (c[0] - 255) * a); im.data[4 * k + 1] = Math.round(255 + (c[1] - 255) * a); im.data[4 * k + 2] = Math.round(255 + (c[2] - 255) * a); im.data[4 * k + 3] = 255;
      }
      cx.putImageData(im, 0, 0);
      return { canvas: cv, vmax };
    });
  }

  // ---------- the moving dots and the paddle wheel ----------
  const NDOTS = 240;
  let dots = [], theta = 0;
  function spawn(pl) { return { x: pl.xr[0] + Math.random() * (pl.xr[1] - pl.xr[0]), y: pl.yr[0] + Math.random() * (pl.yr[1] - pl.yr[0]), age: 0, life: 2 + 3 * Math.random() }; }
  function advance(dt) {
    if (!dots.length) dots = Array.from({ length: NDOTS }, () => spawn(field));
    const ref = arrows(field).ref, k = 1 / ref, fd = curField(), cap = 0.06;
    for (let i = 0; i < dots.length; i++) {
      const p = dots[i];
      const [ax, ay] = fd.F(p.x, p.y), mx = p.x + 0.5 * dt * k * ax, my = p.y + 0.5 * dt * k * ay, [bx, by] = fd.F(mx, my);
      let sx = dt * k * bx, sy = dt * k * by; const s = Math.hypot(sx, sy); if (s > cap) { sx *= cap / s; sy *= cap / s; }
      p.x += sx; p.y += sy; p.age += dt;
      if (!(p.x > field.xr[0] && p.x < field.xr[1] && p.y > field.yr[0] && p.y < field.yr[1]) || p.age > p.life || (fd.point && Math.hypot(p.x, p.y) < 0.08) || !Number.isFinite(p.x)) dots[i] = spawn(field);
    }
    theta += dt * k * wheelRate();
  }
  // the wheel turns at half the curl at its centre (for the whirlpool, the curl is zero away from the drain)
  const wheelRate = () => { const fd = curField(); if (fd.point === 'curl' && Math.hypot(S.px, S.py) < 1e-9) return 3; return 0.5 * fd.curl(S.px, S.py); };

  // ---------- the field picture ----------
  function probeLayers(pl, b) {
    const h = S.side / 2, c = D.corners(S.px, S.py, h), L = [];
    const big = Math.max(1e-9, ...b.sides.map(s => Math.abs(s[0])));
    L.push({ type: 'poly', x: c.map(p => p[0]), y: c.map(p => p[1]), fill: 'rgba(255,255,255,0.35)', color: INK, width: 1.2 });
    for (let i = 0; i < 4; i++) {
      const a = c[i], e = c[(i + 1) % 4], f = b.sides[i][0];
      if (Math.abs(f) < 1e-6 * Math.max(1, big)) continue;
      L.push({ type: 'line', x: [a[0], e[0]], y: [a[1], e[1]], color: f > 0 ? ORANGE : BLUE, width: 1.5 + 4 * Math.abs(f) / big });
    }
    // the wheel: a hub and four paddles
    const r = Math.min(0.42 * h, 0.22), X = [], Y = [];
    for (let k = 0; k < 4; k++) { const a = theta + k * Math.PI / 2; X.push(S.px, S.px + r * Math.cos(a), NaN); Y.push(S.py, S.py + r * Math.sin(a), NaN); }
    L.push({ type: 'line', x: X, y: Y, color: INK, width: 2.2 });
    const ring = range(0, TAU, 24);
    L.push({ type: 'poly', x: ring.map(a => S.px + 0.18 * r * Math.cos(a)), y: ring.map(a => S.py + 0.18 * r * Math.sin(a)), fill: INK });
    return L;
  }
  function drawField() {
    fit(field, 2);
    const ar = arrows(field), layers = [];
    if (mode === 'zeros') {
      const lv = memo(`c|${field.xr.map(v => v.toFixed(3))}|${field.yr.map(v => v.toFixed(3))}`, () => ({
        up: contours((x, y) => D.land(x, y).p, field.xr, field.yr, 90, [0.15, 0.4, 0.65, 0.9]),
        down: contours((x, y) => D.land(x, y).p, field.xr, field.yr, 90, [-0.15, -0.4, -0.65]),
      }));
      layers.push({ type: 'line', x: lv.up.x, y: lv.up.y, color: alpha(ORANGE, 0.55), width: 1.2 }, { type: 'line', x: lv.down.x, y: lv.down.y, color: alpha(BLUE, 0.55), width: 1.2 });
    }
    layers.push({ type: 'line', x: ar.x, y: ar.y, color: alpha(GREY, 0.8), width: 1.2 });
    if (mode === 'gauss') layers.push(...gaussLayers());
    else {
      if (running()) layers.push({ type: 'dots', x: dots.map(p => p.x), y: dots.map(p => p.y), color: alpha(BRAND, 0.75), r: 2 });
      const fd = curField();
      if (fd.point) layers.push({ type: 'dots', x: [0], y: [0], color: fd.point === 'div' ? ORANGE : INK, r: 4.5 });
      layers.push(...probeLayers(field, view.box));
    }
    field.draw(layers);
  }

  // ---------- the probe up close: a canvas of its own ----------
  const zc = $('zoom'), zx = zc.getContext('2d');
  let zw = 0, zh = 0;
  function zsize() {
    const r = zc.parentElement.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3);
    zw = Math.max(200, Math.round(r.width)); zh = Math.max(140, Math.round(r.height));
    zc.width = Math.round(zw * dpr); zc.height = Math.round(zh * dpr); zc.style.width = zw + 'px'; zc.style.height = zh + 'px';
    zx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function arrowPx(x0, y0, x1, y1, col, w) {
    const dx = x1 - x0, dy = y1 - y0, m = Math.hypot(dx, dy); if (m < 1.5) return;
    const ux = dx / m, uy = dy / m, hd = Math.min(9, 0.4 * m);
    zx.strokeStyle = col; zx.lineWidth = w; zx.beginPath(); zx.moveTo(x0, y0); zx.lineTo(x1, y1);
    zx.moveTo(x1 - hd * (ux * 0.87 - uy * 0.5), y1 - hd * (uy * 0.87 + ux * 0.5)); zx.lineTo(x1, y1); zx.lineTo(x1 - hd * (ux * 0.87 + uy * 0.5), y1 - hd * (uy * 0.87 - ux * 0.5)); zx.stroke();
  }
  function drawZoom() {
    if (mode === 'gauss') return;
    if (!zw) zsize();
    zx.clearRect(0, 0, zw, zh);
    const b = view.box, fd = curField(), h = S.side / 2, side = Math.min(zw, zh) * 0.56, ox = zw / 2, oy = zh / 2 + 6, sc = side / (2 * h);
    const P = (x, y) => [ox + (x - S.px) * sc, oy - (y - S.py) * sc];
    zx.font = '600 12px Inter, system-ui, sans-serif'; zx.fillStyle = GREY; zx.textAlign = 'left'; zx.textBaseline = 'top';
    zx.fillText('The probe up close', 10, 8);
    zx.fillStyle = 'rgba(255,255,255,0.6)'; zx.strokeStyle = INK; zx.lineWidth = 1.4; zx.fillRect(ox - side / 2, oy - side / 2, side, side); zx.strokeRect(ox - side / 2, oy - side / 2, side, side);
    // the field at five points on each side, coloured by whether it leaves or enters there
    const c = D.corners(S.px, S.py, h), samples = [];
    for (let i = 0; i < 4; i++) for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const a = c[i], e = c[(i + 1) % 4], x = a[0] + t * (e[0] - a[0]), y = a[1] + t * (e[1] - a[1]), [fx, fy] = fd.F(x, y);
      const nx = (e[1] - a[1]) / (2 * h), ny = -(e[0] - a[0]) / (2 * h);
      samples.push([x, y, fx, fy, fx * nx + fy * ny]);
    }
    const mmax = Math.max(1e-9, ...samples.map(s => Math.hypot(s[2], s[3])).filter(Number.isFinite));
    for (const [x, y, fx, fy, fn] of samples) {
      if (!Number.isFinite(fn)) continue;
      const [X, Y] = P(x, y), len = 0.24 * side * Math.min(1, Math.hypot(fx, fy) / mmax), m = Math.hypot(fx, fy) || 1;
      arrowPx(X - fx / m * len / 2, Y + fy / m * len / 2, X + fx / m * len / 2, Y - fy / m * len / 2, Math.abs(fn) < 1e-9 * mmax ? GREY : fn > 0 ? ORANGE : BLUE, 2);
    }
    // each side's flux, written outside it
    const gap = 0.12 * side + 12, where = [[ox, oy + side / 2 + gap + 4, 'center'], [ox + side / 2 + gap, oy, 'left'], [ox, oy - side / 2 - gap - 4, 'center'], [ox - side / 2 - gap, oy, 'right']];
    zx.font = '700 12.5px Inter, system-ui, sans-serif'; zx.textBaseline = 'middle';
    b.sides.forEach((s, i) => {
      const [X, Y, al] = where[i]; zx.textAlign = al; zx.fillStyle = Math.abs(s[0]) < 5e-4 ? GREY : s[0] > 0 ? ORANGE : BLUE;
      zx.fillText(deep ? `${signed(s[0], 3)} · ∮ ${signed(s[1], 3)}` : signed(s[0], 2), X, Y);
    });
    // the singular point, if the box holds it
    if (fd.point && Math.abs(S.px) < h && Math.abs(S.py) < h) {
      const [X, Y] = P(0, 0); zx.fillStyle = fd.point === 'div' ? ORANGE : INK; zx.beginPath(); zx.arc(X, Y, 5, 0, TAU); zx.fill();
    }
    // the wheel
    const r = 0.3 * side;
    zx.strokeStyle = INK; zx.lineWidth = 3; zx.lineCap = 'round';
    for (let k = 0; k < 4; k++) { const a = theta + k * Math.PI / 2; zx.beginPath(); zx.moveTo(ox, oy); zx.lineTo(ox + r * Math.cos(a), oy - r * Math.sin(a)); zx.stroke(); zx.beginPath(); zx.moveTo(ox + r * Math.cos(a), oy - r * Math.sin(a)); zx.lineTo(ox + r * Math.cos(a) - 0.16 * r * Math.sin(a), oy - r * Math.sin(a) - 0.16 * r * Math.cos(a)); zx.stroke(); }
    zx.lineCap = 'butt'; zx.fillStyle = INK; zx.beginPath(); zx.arc(ox, oy, 4.5, 0, TAU); zx.fill();
    const w = wheelRate(); zx.font = '600 12px Inter, system-ui, sans-serif'; zx.textAlign = 'right'; zx.textBaseline = 'top'; zx.fillStyle = GREY;
    zx.fillText(Math.abs(w) < 5e-4 ? 'wheel: still' : `wheel: ${w > 0 ? 'anticlockwise' : 'clockwise'}`, zw - 10, 8);
  }

  // ---------- 1. Flux box and paddle wheel ----------
  let view = { box: null };
  function renderField() {
    const fd = D.FIELDS[S.field], b = D.box(fd, S.px, S.py, S.side / 2);
    view = { box: b };
    const hh = S.side / 2, ax = Math.abs(S.px), ay = Math.abs(S.py);
    const edge = !!fd.point && ((Math.abs(ax - hh) < 1e-9 && ay <= hh + 1e-9) || (Math.abs(ay - hh) < 1e-9 && ax <= hh + 1e-9));
    const corner = edge && Math.abs(ax - hh) < 1e-9 && Math.abs(ay - hh) < 1e-9;
    const holds = !!fd.point && !edge && ax < hh && ay < hh;
    put('dg-title', `The ${NAMES[S.field]} field`);
    put('dg-cap', 'Grey arrows: the field. Drag or tap to move the probe. Each side of the box glows orange where field leaves and blue where it enters, thicker for more; the wheel turns with the field\'s curl.');
    legend('dg-legend', [[ORANGE, '', 'leaving the box'], [BLUE, '', 'entering the box'], [BRAND, 'swatch--dot', 'carried by the field']]);
    const dv = fd.div(S.px, S.py), cu = fd.curl(S.px, S.py);
    const dirF = Math.abs(b.flux) < 5e-4 ? 'as much in as out' : b.flux > 0 ? 'more leaving than entering' : 'more entering than leaving';
    const dirC = Math.abs(b.circ) < 5e-4 ? 'no net push round it' : b.circ > 0 ? 'anticlockwise' : 'clockwise';
    stats([
      ['Flux out of the box', fixed(b.flux, 3), dirF],
      [`Flux ÷ area`, fixed(b.div, 3), edge && fd.point === 'div' ? 'the charge is on the edge' : holds && fd.point === 'div' ? 'all from the point at the centre' : deep ? `at the centre, ${sym('∇·F')} = ${fixed(dv, 3)}` : 'the divergence, for a small box'],
      ['Circulation round it', fixed(b.circ, 3), dirC],
      [`Circulation ÷ area`, fixed(b.curl, 3), edge && fd.point === 'curl' ? 'the drain is on the edge' : holds && fd.point === 'curl' ? 'all from the point at the centre' : deep ? `at the centre, curl = ${fixed(cu, 3)}; wheel at half` : 'the curl; the wheel turns at half'],
    ]);
    const msgs = {
      source: 'The source spreads out evenly: every box, wherever you put it, has a flux of 2 × its area. The divergence is 2 everywhere, not just at the centre, and the curl is 0.',
      vortex: 'The vortex turns like a record: every box has a circulation of 2 × its area, wherever it is. The curl is 2 everywhere, and nothing springs out: the divergence is 0.',
      shear: 'Every arrow is horizontal, to the right above the middle line and to the left below it, yet the wheel turns clockwise: the push on its upper paddles is always further to the right than the push on its lower ones. The curl is −1 everywhere.',
      saddle: 'Field rushes in at the top and bottom and out at the sides, and it all balances: the divergence and the curl are both 0 everywhere.',
      river: `The river flows fastest in the middle. Above the middle the wheel turns anticlockwise, below it clockwise, and on the centre line it stays still: the curl is y/2, here ${fixed(cu, 3)}.`,
      fading: `All the arrows point outwards, but beyond r = √2 ≈ 1.41 they fade faster than they spread, and the box catches a net inflow there. Here the divergence is ${fixed(dv, 3)}${Math.hypot(S.px, S.py) > Math.SQRT2 ? ': a sink, even though the arrows point away from the centre' : ''}.`,
      charge: holds ? `The box holds the line charge: the flux is 2π ≈ 6.283 for any box round it, and shrinking the box only raises flux ÷ area. All the divergence sits at the one point.` : 'This box misses the charge, and its flux is 0: what enters on the inner side leaves through the others. The divergence is zero everywhere except at the charge itself.',
      drain: holds ? 'The box holds the drain: the circulation is 2π ≈ 6.283 for any box round it. All the curl sits at the one point, like the magnetic field round a thin wire.' : 'The water circles the drain, but the wheel does not turn: away from the drain, the curl is exactly zero. Move the box over the drain and the circulation jumps to 2π.',
    };
    const edgeMsg = what => `The box's ${corner ? 'corner' : 'edge'} sits right on the ${what}, where the field blows up, so the ${S.field === 'charge' ? 'flux' : 'circulation'} is not really defined. Taken symmetrically, ${corner ? 'a quarter' : 'half'} of the full 2π counts, ${corner ? 'π/2 ≈ 1.571' : 'π ≈ 3.142'}; nudge the box either way and it jumps to 2π or 0.`;
    put('info', edge ? edgeMsg(S.field === 'charge' ? 'line charge' : 'drain') : msgs[S.field]);
    // the maps of divergence and curl
    [[plotA, 'pa', 'Where the sources are: the divergence', (x, y) => fd.div(x, y), 'div', [[ORANGE, 'swatch--area', 'source (positive)'], [BLUE, 'swatch--area', 'sink (negative)']]],
     [plotB, 'pb', 'Where the swirl is: the curl', (x, y) => fd.curl(x, y), 'curl', [[ORANGE, 'swatch--area', 'anticlockwise (positive)'], [BLUE, 'swatch--area', 'clockwise (negative)']]]].forEach(([pl, id, title, f, kind, leg]) => {
      pl.opts.xLabel = 'x'; pl.opts.yLabel = 'y'; fit(pl, 2);
      const hm = heat(f, pl.xr, pl.yr, kind + S.field), L = [{ type: 'image', canvas: hm.canvas, x0: pl.xr[0], x1: pl.xr[1], y0: pl.yr[0], y1: pl.yr[1], smooth: true }];
      const c = D.corners(S.px, S.py, S.side / 2);
      L.push({ type: 'poly', x: c.map(p => p[0]), y: c.map(p => p[1]), color: INK, width: 1.4 });
      const zero = hm.vmax < 1e-9;
      if (fd.point === kind) { L.push({ type: 'dots', x: [0], y: [0], color: INK, r: 4 }, { type: 'text', x: 0, y: -0.25, text: 'all of it here', color: INK }); }
      if (zero) L.push({ type: 'text', x: (pl.xr[0] + pl.xr[1]) / 2, text: fd.point === kind ? 'zero everywhere else' : 'zero everywhere', color: GREY, size: 13 });
      pl.draw(L);
      put(id + '-title', title);
      put(id + '-cap', kind === 'div' ? `The divergence worked out by hand at every point. ${zero ? '' : `Strongest colour: ${fixed(hm.vmax, 2)}.`}` : `The curl worked out by hand at every point. ${zero ? '' : `Strongest colour: ${fixed(hm.vmax, 2)}.`}`);
      legend(id + '-legend', leg);
    });
    put('takeaway', 'Divergence asks how much field springs out of a point; curl asks how much it swirls round it. Neither can be read off the direction of the arrows alone: what counts is how they change from place to place.');
  }

  // ---------- 2. Gauss and Ampère ----------
  function gaussLayers() {
    const src = D.SOURCES[S.src], L = [], ring = range(0, TAU, 240), rim = memo(`r|${S.src}|${S.cx}|${S.cy}|${S.rad}`, () => D.rim(src, S.cx, S.cy, S.rad, 240));
    // the circle, orange where the field leaves (or runs anticlockwise), blue where it enters (or runs clockwise)
    const pos = { x: [], y: [] }, neg = { x: [], y: [] };
    ring.forEach((a, i) => {
      const x = S.cx + S.rad * Math.cos(a), y = S.cy + S.rad * Math.sin(a), v = rim.v[i], on = v >= 0 ? pos : neg, off = v >= 0 ? neg : pos;
      on.x.push(x); on.y.push(y); off.x.push(NaN); off.y.push(NaN);
    });
    L.push({ type: 'line', x: pos.x, y: pos.y, color: ORANGE, width: 3.2 }, { type: 'line', x: neg.x, y: neg.y, color: BLUE, width: 3.2 });
    for (const s of src.items) {
      const col = s.q > 0 ? RED : BLUE, cir = range(0, TAU, 24);
      L.push({ type: 'poly', x: cir.map(a => s.x + 0.085 * Math.cos(a)), y: cir.map(a => s.y + 0.085 * Math.sin(a)), fill: '#fff', color: col, width: 2 });
      if (src.kind === 'charge') L.push({ type: 'text', x: s.x, y: s.y + 0.075, text: s.q > 0 ? '+' : '−', color: col, size: 14, weight: '800' });
      else if (s.q > 0) L.push({ type: 'dots', x: [s.x], y: [s.y], color: col, r: 2.6 });
      else L.push({ type: 'line', x: [s.x - 0.05, s.x + 0.05, NaN, s.x - 0.05, s.x + 0.05], y: [s.y - 0.05, s.y + 0.05, NaN, s.y + 0.05, s.y - 0.05], color: col, width: 2 });
    }
    return L;
  }
  function renderGauss() {
    const src = D.SOURCES[S.src], wire = src.kind === 'wire', r = memo(`s|${S.src}|${S.cx}|${S.cy}|${S.rad}`, () => D.surface(src, S.cx, S.cy, S.rad));
    const rim = memo(`r|${S.src}|${S.cx}|${S.cy}|${S.rad}`, () => D.rim(src, S.cx, S.cy, S.rad, 240));
    const fin = rim.v.filter(Number.isFinite), lo = Math.min(...fin), hi = Math.max(...fin), on = r.on > 0, centred = S.src === 'one' || S.src === 'wire' ? Math.hypot(S.cx, S.cy) < 1e-9 : false;
    const unit = wire ? 'μ_0I' : 'q/ε_0', what = wire ? 'loop' : 'sphere';
    $('surf-label').textContent = wire ? 'The loop' : 'The sphere';
    put('src-hint', wire ? 'Long straight wires along z, seen end-on: ⊙ current towards you, ⊗ away.' : 'Point charges, and a sphere around them; the picture is the plane through their centres.');
    put('dg-title', wire ? 'A loop round wires: Ampère\'s law' : 'A sphere round charges: Gauss\'s law');
    put('dg-cap', wire ? 'Grey arrows: the magnetic field of the wires, in a plane across them. The loop is orange where the field runs anticlockwise along it, blue where it runs clockwise. Tap to move the loop.' : 'Grey arrows: the electric field in the plane through the charges. The sphere\'s rim is orange where the field leaves it and blue where it enters. Tap to move the sphere.');
    legend('dg-legend', wire ? [[ORANGE, '', 'field along the loop'], [BLUE, '', 'field against it'], [RED, 'swatch--dot', 'current +I'], [BLUE, 'swatch--dot', 'current −I']] : [[ORANGE, '', 'field leaving'], [BLUE, '', 'field entering'], [RED, 'swatch--dot', 'charge +q'], [BLUE, 'swatch--dot', 'charge −q']]);
    const encl = (r.inside === 0 ? '0' : `${r.inside > 0 ? '+' : '−'}${wire ? 'I' : 'q'}`) + (on ? ` (+${r.on} on the ${wire ? 'loop' : 'sphere'})` : '');
    const avg = wire ? r.total / (TAU * S.rad) : r.total / (2 * TAU * S.rad * S.rad);
    stats([
      [wire ? 'Circulation round the loop' : 'Flux out of the sphere', `${fixed(r.total, 3)} ${unit}`, wire ? '∮ B·dl, added up all the way round' : 'E·dA, added up over the whole sphere'],
      [wire ? 'Current through the loop' : 'Charge inside', encl, wire ? 'only the wires inside count' : 'only the charges inside count'],
      [wire ? 'Field along the loop' : 'Outward field round the rim', on ? 'unbounded' : `${fixed(lo, 3)} to ${fixed(hi, 3)}`, on ? `it blows up where the ${what} meets the ${wire ? 'wire' : 'charge'}${r.on > 1 ? 's' : ''}` : 'lowest and highest, round the circle'],
      [wire ? 'Average field along it' : 'Average outward field', fixed(avg, 4), centred ? (wire ? `= μ_0I/2πr = ${fixed(1 / (TAU * S.rad), 4)}` : `= q/4πε_0r² = ${fixed(1 / (2 * TAU * S.rad * S.rad), 4)}`) : (wire ? 'circulation ÷ 2πr' : 'flux ÷ 4πr²')],
    ]);
    let msg;
    if (on) msg = `${r.on > 1 ? `Both ${wire ? 'wires' : 'charges'} sit` : `A ${wire ? 'wire' : 'charge'} sits`} exactly on the ${what}, where the field blows up, so the total is not really defined. Taken symmetrically, half of ${r.on > 1 ? 'each' : 'it'} counts, which gives ${fixed(r.total, 3)} ${wire ? 'μ₀I' : 'q/ε₀'}. Move the ${what} a little either way and the total jumps by a whole ${wire ? 'μ₀I' : 'q/ε₀'}.`;
    else if (S.src === 'one' && centred) msg = `Centred on the charge, the field is the same all over the sphere, ${fixed(hi, 4)}, and flux = field × area = ${fixed(hi, 4)} × 4π(${trim(S.rad)})² = ${fixed(r.total, 3)}. Whatever the radius, the flux is q/ε₀, so the field must fall as 1/r²: Coulomb's law.`;
    else if (S.src === 'wire' && centred) msg = `Centred on the wire, the field is the same all round the loop, ${fixed(hi, 4)}, and the circulation is ${fixed(hi, 4)} × 2π(${trim(S.rad)}) = ${fixed(r.total, 3)}. Whatever the radius, it is μ₀I, so the field must fall as 1/r: the field of a long wire.`;
    else if (Math.abs(r.total) < 5e-4 && lo < -1e-6 && hi > 1e-6) msg = `The field ${wire ? 'runs along the loop in some places and against it in others' : 'leaves the sphere in some places and enters in others'}, and the two cancel exactly: nothing net is inside. The field on the ${what} is not zero, but the total is.`;
    else if (Math.abs(r.total) < 5e-4) msg = `Nothing is inside the ${what}, and the total is zero.`;
    else msg = `Off-centre, the field on the ${what} is far from even, from ${fixed(lo, 3)} to ${fixed(hi, 3)}, yet the total is still exactly ${fixed(r.total, 3)} ${wire ? 'μ₀I' : 'q/ε₀'}: it counts only what is inside.`;
    put('info', msg);
    // plot A: the total against the radius, for this centre
    const rs = range(0.05, 1.9, 186), tot = memo(`t|${S.src}|${S.cx}|${S.cy}`, () => rs.map(R => D.surface(src, S.cx, S.cy, R).total));
    plotA.opts.xLabel = 'Radius'; plotA.opts.yLabel = wire ? 'Circulation (μ0 I)' : 'Flux (q/ε0)';
    plotA.setRange([0, 1.9], [-1.3, 1.3]);
    const LA = [{ type: 'hline', y: 0, color: LIGHT, dash: [] }];
    for (const s of src.items) { const d = Math.hypot(s.x - S.cx, s.y - S.cy); if (d < 1.9) LA.push({ type: 'vline', x: d, color: s.q > 0 ? RED : BLUE, dash: [3, 4] }); }
    LA.push({ type: 'line', x: rs, y: tot, color: BRAND, width: 2.4 }, { type: 'vline', x: S.rad, color: INK, dash: [], width: 1.5, label: `r = ${trim(S.rad)}` }, { type: 'dots', x: [S.rad], y: [r.total], color: INK, r: 4 });
    plotA.draw(LA);
    put('pa-title', wire ? 'Circulation against the loop\'s size' : 'Flux against the sphere\'s size');
    put('pa-cap', `Same centre, every radius. The total steps only where a ${wire ? 'wire' : 'charge'} crosses the ${what} (dotted lines), and is flat in between.`);
    legend('pa-legend', [[BRAND, '', wire ? 'circulation' : 'flux'], [INK, 'swatch--dot', 'this ' + what]]);
    // plot B: the field round the rim, whose total is the flux or circulation
    const abs = fin.map(Math.abs).sort((a, b) => a - b), cap = on ? abs[Math.floor(0.9 * (abs.length - 1))] : abs[abs.length - 1];
    const ypos = rim.v.map(v => Math.max(v, 0)), yneg = rim.v.map(v => Math.min(v, 0)), top = Math.max(0.05, cap) * 1.15;
    plotB.opts.xLabel = 'Angle round the circle (degrees)'; plotB.opts.yLabel = wire ? 'B along the loop' : 'Outward E';
    plotB.opts.xTickValues = [0, 90, 180, 270, 360]; plotB.setRange([0, 360], [-top, top]);
    plotB.draw([{ type: 'line', x: rim.th, y: ypos, color: ORANGE, width: 1.6, fill: alpha(ORANGE, 0.25) }, { type: 'line', x: rim.th, y: yneg, color: BLUE, width: 1.6, fill: alpha(BLUE, 0.25) }, { type: 'hline', y: 0, color: GREY, dash: [] }]);
    put('pb-title', wire ? 'The field along the loop, all the way round' : 'The outward field round the rim');
    put('pb-cap', wire ? 'Starting from the loop\'s right-hand side and going anticlockwise. The circulation is the average of this curve times the loop\'s length, 2πr.' : 'Starting from the rim\'s right-hand side and going anticlockwise round the circle where the sphere meets this plane.');
    legend('pb-legend', wire ? [[ORANGE, 'swatch--area', 'along'], [BLUE, 'swatch--area', 'against']] : [[ORANGE, 'swatch--area', 'leaving'], [BLUE, 'swatch--area', 'entering']]);
    put('takeaway', wire ? 'Ampère\'s law, ∮B·dl = μ₀I, is the curl equation ∇×B = μ₀J added up over a surface. With symmetry it gives the field of a wire, B = μ₀I/2πr; without it, the Biot–Savart law does the job.' : 'Gauss\'s law, ∮E·dA = q/ε₀, is the divergence equation ∇·E = ρ/ε₀ added up over a volume. With the symmetry of a single charge, it gives Coulomb\'s law.');
  }

  // ---------- 3. Two zeros ----------
  function renderZeros() {
    const fd = D.ZEROS[S.pot], b = D.box(fd, S.px, S.py, S.side / 2), grad = S.pot === 'grad', l = D.land(S.px, S.py);
    view = { box: b };
    put('dg-title', grad ? 'Downhill from a hill and a valley' : 'Along the contours of the same landscape');
    put('dg-cap', grad ? 'Contour lines of the landscape φ: orange round the hill, blue round the valley. The arrows point straight downhill, across the contours.' : 'The same contour lines; now every arrow is turned a quarter turn and runs along them: round the hill one way, round the valley the other.');
    legend('dg-legend', [[ORANGE, '', 'leaving the box'], [BLUE, '', 'entering the box'], [alpha(ORANGE, 0.7), '', 'contours of the hill'], [alpha(BLUE, 0.7), '', 'of the valley']]);
    stats([
      ['Flux out of the box', fixed(b.flux, 3), grad ? (b.flux >= 0 ? 'field springs out of this box' : 'field converges into this box') : 'zero, for every box'],
      ['Circulation round it', fixed(b.circ, 3), grad ? 'zero, for every box' : 'the contour field does swirl'],
      ['Divergence here', grad ? fixed(-l.lap, 3) : '0', grad ? (-l.lap >= 0 ? (deep ? `${sym('−∇²φ')} > 0: ground curving down` : 'positive: a source') : (deep ? `${sym('−∇²φ')} < 0: ground curving up` : 'negative: a sink')) : `${sym('∇·(∇×A)')} = 0 always`],
      ['Curl here', grad ? '0' : fixed(-l.lap, 3), grad ? `${sym('∇×∇φ')} = 0 always` : (-l.lap >= 0 ? (deep ? `${sym('−∇²φ')} > 0: anticlockwise` : 'positive: anticlockwise swirl') : (deep ? `${sym('−∇²φ')} < 0: clockwise` : 'negative: clockwise swirl'))],
    ]);
    put('info', grad
      ? `Walk round the box and you climb and descend, but you end at the height you started from: the circulation is ${fixed(b.circ, 3)}, and the wheel stays still. Field ${b.flux > 0 ? 'leaves' : 'enters'} the box, ${fixed(Math.abs(b.flux), 3)} in all, ${b.flux > 0 ? 'running downhill away from ground that curves down like a hilltop' : 'converging on ground that curves up, like the valley floor or the outer slopes of the hill'}.`
      : `The arrows run along the contours, and the field crossing any stretch of path equals the change in height along it. Round a closed box you come back to the same height, so whatever enters crosses back out: the flux is ${fixed(b.flux, 3)}. But the field swirls round the hill and the valley, and the circulation round this box is ${fixed(b.circ, 3)}.`);
    // plot A: the walk round the box
    const w = memo(`w|${S.pot}|${S.px}|${S.py}|${S.side}`, () => D.walk(fd, S.px, S.py, S.side / 2, 60));
    const all = w.flux.concat(w.circ), lo = Math.min(0, ...all), hi = Math.max(0, ...all), pad = 0.12 * Math.max(0.05, hi - lo);
    plotA.opts.xLabel = 'Distance walked round the box'; plotA.opts.yLabel = 'Running total'; plotA.opts.xTickValues = null;
    plotA.setRange([0, 4 * S.side], [lo - pad, hi + pad]);
    const LA = [{ type: 'hline', y: 0, color: LIGHT, dash: [] }];
    for (let k = 1; k < 4; k++) LA.push({ type: 'vline', x: k * S.side, color: LIGHT, dash: [2, 4] });
    LA.push({ type: 'line', x: w.s, y: w.flux, color: ORANGE, width: 2.2 }, { type: 'line', x: w.s, y: w.circ, color: INK, width: 2.2 });
    if (deep && grad) { const c = D.corners(S.px, S.py, S.side / 2), p0 = D.land(c[0][0], c[0][1]).p; LA.push({ type: 'line', x: w.s, y: w.s.map(s => { const k = Math.min(3, Math.floor(s / S.side)), t = s / S.side - k, a = c[k], e = c[(k + 1) % 4]; return p0 - D.land(a[0] + t * (e[0] - a[0]), a[1] + t * (e[1] - a[1])).p; }), color: GREY, width: 1.4, dash: [5, 4] }); }
    plotA.draw(LA);
    put('pa-title', 'Walking round the box');
    put('pa-cap', `Anticlockwise from the bottom-left corner; the dotted lines are the corners. ${grad ? 'The push along the path climbs and falls, and comes back to zero at the end.' : 'The flux across the path rises and falls, and comes back to zero at the end.'}`);
    legend('pa-legend', [[ORANGE, '', 'flux out, so far'], [INK, '', '∫F·dl, so far'], ...(deep && grad ? [[GREY, '', 'height lost, φ(start) − φ']] : [])]);
    // plot B: the quantity that is not zero
    plotB.opts.xLabel = 'x'; plotB.opts.yLabel = 'y'; plotB.opts.xTickValues = null; fit(plotB, 2);
    const hm = heat((x, y) => -D.land(x, y).lap, plotB.xr, plotB.yr, 'lap'), c = D.corners(S.px, S.py, S.side / 2);
    plotB.draw([{ type: 'image', canvas: hm.canvas, x0: plotB.xr[0], x1: plotB.xr[1], y0: plotB.yr[0], y1: plotB.yr[1], smooth: true }, { type: 'poly', x: c.map(p => p[0]), y: c.map(p => p[1]), color: INK, width: 1.4 }]);
    put('pb-title', grad ? 'The divergence, −∇²φ (the curl is zero everywhere)' : 'The curl, −∇²φ (the divergence is zero everywhere)');
    put('pb-cap', grad ? 'The downhill field springs out of the hilltop and drains into the valley floor.' : 'The contour field swirls anticlockwise round the hilltop and clockwise round the valley floor.');
    legend('pb-legend', grad ? [[ORANGE, 'swatch--area', 'source'], [BLUE, 'swatch--area', 'sink']] : [[ORANGE, 'swatch--area', 'anticlockwise'], [BLUE, 'swatch--area', 'clockwise']]);
    put('takeaway', 'The curl of a gradient is zero, and so is the divergence of a curl. That is why the electric field of static charges can be written E = −∇V, and why the magnetic field, which never springs out of anywhere, can be written B = ∇×A.');
  }

  // ---------- the animation ----------
  let animOn = !reduceMotion, raf = 0, seen = true, lastT = 0;
  const running = () => animOn && !document.hidden && seen && mode !== 'gauss';
  function tick(now) {
    raf = 0; if (!running()) return;
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0; lastT = now;
    advance(dt); drawField(); drawZoom();
    raf = requestAnimationFrame(tick);
  }
  function kick() { if (running() && !raf) { lastT = 0; raf = requestAnimationFrame(tick); } }
  function syncAnim() { $('anim').textContent = animOn ? '❚❚ Pause' : '▶ Animate'; $('anim').setAttribute('aria-pressed', String(animOn)); $('anim').hidden = mode === 'gauss'; }
  $('anim').addEventListener('click', () => { animOn = !animOn; syncAnim(); drawField(); kick(); });
  document.addEventListener('visibilitychange', kick);
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { seen = es[0].isIntersecting; kick(); }).observe($('lab'));

  // ---------- controls ----------
  function syncControls() {
    const set = (id, v, txt) => { $(id).value = v; $(id + '-out').textContent = txt; $(id).setAttribute('aria-valuetext', txt); };
    set('px', S.px, trim(S.px)); set('py', S.py, trim(S.py)); set('side', S.side, trim(S.side));
    set('cx', S.cx, trim(S.cx)); set('cy', S.cy, trim(S.cy)); set('rad', S.rad, trim(S.rad));
    const pressed = (attr, val) => document.querySelectorAll(`button[data-${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(val))));
    pressed('field', S.field); pressed('src', S.src); pressed('pot', S.pot); pressed('depth', deep ? 'deep' : 'simple');
    $('depth-hint').textContent = deep ? 'The formulas: divergence and curl at the centre, each side\'s flux and circulation, and the height lost on the walk round the box.' : 'The main ideas; switch to Go deeper for the formulas and the side-by-side numbers.';
  }
  function render() {
    syncControls(); syncAnim();
    if (mode === 'field') renderField(); else if (mode === 'gauss') renderGauss(); else renderZeros();
    drawField(); drawZoom();
    $('plot-a').setAttribute('aria-label', $('pa-title').textContent); $('plot-b').setAttribute('aria-label', $('pb-title').textContent);
    $('field').setAttribute('aria-label', `${$('dg-title').textContent}. ${$('info').textContent}`);
    kick();
  }
  function applyMode() {
    document.querySelectorAll('.tab').forEach(b => { const on = b.dataset.mode === mode; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $('lab').setAttribute('aria-labelledby', 'tab-' + mode);
    document.querySelectorAll('.mode-intro').forEach(el => { el.hidden = el.dataset.for !== mode; });
    document.querySelectorAll('[data-modes], [data-deep]').forEach(el => { el.hidden = !((!el.dataset.modes || el.dataset.modes.split(' ').includes(mode)) && (!('deep' in el.dataset) || deep)); });
    $('side-box').hidden = mode === 'gauss';
    $('mag-view').classList.toggle('mag-view--single', mode === 'gauss');
    dots = []; zw = 0;
    plotA.opts.xTickValues = null; plotB.opts.xTickValues = null;
    render();
  }
  let pending = false;
  function later() { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; render(); }); }
  ['px', 'py', 'side', 'cx', 'cy', 'rad'].forEach(id => $(id).addEventListener('input', e => { S[id] = +e.target.value; later(); }));
  document.querySelector('.lab-main').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !b.closest('.controls')) return;
    const d = b.dataset;
    if (d.field) { S.field = d.field; dots = []; }
    else if (d.src) S.src = d.src;
    else if (d.pot) { S.pot = d.pot; dots = []; }
    else if (b.id === 'video-values') { Object.assign(S, JSON.parse(JSON.stringify(START))); dots = []; }
    else return;
    render();
  });
  // tap or drag on the picture to move the probe, the sphere or the loop; arrow keys nudge it
  const snap = v => Math.max(-1.6, Math.min(1.6, Math.round(v / 0.05) * 0.05));
  function place(e) {
    const r = $('field').getBoundingClientRect(), m = field.m, X = e.clientX - r.left, Y = e.clientY - r.top;
    const x = field.xr[0] + (X - m.l) / (field.w - m.l - m.r) * (field.xr[1] - field.xr[0]), y = field.yr[1] - (Y - m.t) / (field.h - m.t - m.b) * (field.yr[1] - field.yr[0]);
    if (mode === 'gauss') { S.cx = snap(x); S.cy = snap(y); } else { S.px = snap(x); S.py = snap(y); }
    later();
  }
  let dragging = false;
  $('field').addEventListener('pointerdown', e => { dragging = true; place(e); });
  $('field').addEventListener('pointermove', e => { if (dragging) place(e); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => $('field').addEventListener(t, () => { dragging = false; }));
  $('field').addEventListener('keydown', e => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const kx = mode === 'gauss' ? 'cx' : 'px', ky = mode === 'gauss' ? 'cy' : 'py';
    S[kx] = snap(S[kx] + 0.05 * d[0]); S[ky] = snap(S[ky] + 0.05 * d[1]); later();
  });
  if ('ResizeObserver' in window) new ResizeObserver(() => { zw = 0; dots = []; later(); }).observe($('mag-view'));
  document.querySelectorAll('[data-depth]').forEach(b => b.addEventListener('click', () => {
    deep = b.dataset.depth === 'deep';
    try { localStorage.setItem('divcurl-depth', deep ? 'deep' : 'simple'); } catch (e) { /* not remembered: fine */ }
    applyMode();
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
  const fresh = o => { Object.assign(S, JSON.parse(JSON.stringify(START)), o); dots = []; };
  const QUESTIONS = {
    shear: () => { mode = 'field'; fresh({ field: 'shear' }); },
    drain: () => { mode = 'field'; fresh({ field: 'drain', px: 1, py: 0.5 }); },
    fading: () => { mode = 'field'; fresh({ field: 'fading', px: 1.6, py: 0 }); },
    saddle: () => { mode = 'field'; fresh({ field: 'saddle', px: 0, py: 0 }); },
    sphere: () => { mode = 'gauss'; fresh({ src: 'one', rad: 0.5 }); },
    pair: () => { mode = 'gauss'; fresh({ src: 'pair', rad: 1 }); },
    miss: () => { mode = 'gauss'; fresh({ src: 'wire', cx: 1, cy: 0.6, rad: 0.5 }); },
    hill: () => { mode = 'zeros'; fresh({ pot: 'grad', px: -0.8, py: 0.5 }); },
  };
  document.querySelectorAll('.predict__load[data-q]').forEach(b => b.addEventListener('click', () => {
    QUESTIONS[b.dataset.q]();
    applyMode();
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    const t = tabs.find(x => x.dataset.mode === mode); if (t) t.focus({ preventScroll: true });
  }));

  syncAnim();
  applyMode();
  window.__dc = { S, render, setMode: m => { mode = m; applyMode(); }, view: () => view };
})();
