/* Lorentz transformation lab: page logic. Physics in physics.js (window.LT). */
(function () {
  'use strict';
  const P = window.LT;
  const $ = id => document.getElementById(id);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const START = { bc: 0.6, bt: 0.6, view: 'platform', bv: 0.5, bu: 0.5 };
  const S = JSON.parse(JSON.stringify(START));
  let mode = 'clock';
  let deep = false;
  try { deep = localStorage.getItem('lorentz-depth') === 'deep'; } catch (e) { /* not remembered: fine */ }

  const INK = '#14232c', BLUE = '#1f6fb4', ORANGE = '#b35900', GREY = '#5f7382', LIGHT = '#c3ced5', AMBER = '#e0a100';
  const BRAND = (getComputedStyle(document.documentElement).getPropertyValue('--brand') || '#0b6e85').trim();

  // ---------- formatting and page helpers ----------
  const fixed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const trim = v => String(Math.round(v * 1000) / 1000).replace('-', '−');
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
  const MARGIN = { l: 54, r: 14, t: 12, b: 40 };
  const dia = new NanoPlot($('diagram'), { margin: { l: 50, r: 10, t: 10, b: 38 }, narrowMargin: { l: 50, r: 8 } });
  const plotA = new NanoPlot($('plot-a'), { margin: MARGIN, narrowMargin: { l: 50, r: 10 } });
  const plotB = new NanoPlot($('plot-b'), { margin: MARGIN, narrowMargin: { l: 50, r: 10 } });
  // equal scales on both axes, around a centre
  function fitAround(pl, xc, yc, halfY) {
    const W = pl.w - pl.m.l - pl.m.r, H = pl.h - pl.m.t - pl.m.b, hx = halfY * W / H;
    pl.setRange([xc - hx, xc + hx], [yc - halfY, yc + halfY]);
  }

  // ---------- a plain canvas, for the clocks and the track ----------
  function Pad(id) {
    const c = $(id), x = c.getContext('2d'), pad = { c, x, w: 0, h: 0 };
    pad.size = () => {
      const r = c.parentElement.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3);
      pad.w = Math.max(200, Math.round(r.width)); pad.h = Math.max(140, Math.round(r.height));
      c.width = Math.round(pad.w * dpr); c.height = Math.round(pad.h * dpr); c.style.width = pad.w + 'px'; c.style.height = pad.h + 'px';
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    return pad;
  }
  const scene = Pad('scene'), side = Pad('side');
  const text = (pd, s, X, Y, o = {}) => { const x = pd.x; x.font = `${o.weight || 600} ${o.size || 12}px Inter, system-ui, sans-serif`; x.fillStyle = o.color || GREY; x.textAlign = o.align || 'left'; x.textBaseline = o.base || 'top'; x.fillText(s, X, Y); };
  const line = (pd, pts, col, w = 1.5, dash = []) => { const x = pd.x; x.strokeStyle = col; x.lineWidth = w; x.setLineDash(dash); x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke(); x.setLineDash([]); };
  const dot = (pd, X, Y, r, col) => { const x = pd.x; x.fillStyle = col; x.beginPath(); x.arc(X, Y, r, 0, 2 * Math.PI); x.fill(); };
  function bolt(pd, X, Y, s) { const x = pd.x; x.fillStyle = AMBER; x.strokeStyle = ORANGE; x.lineWidth = 1; x.beginPath(); x.moveTo(X + 0.2 * s, Y - s); x.lineTo(X - 0.35 * s, Y + 0.1 * s); x.lineTo(X, Y + 0.1 * s); x.lineTo(X - 0.2 * s, Y + s); x.lineTo(X + 0.35 * s, Y - 0.15 * s); x.lineTo(X, Y - 0.15 * s); x.closePath(); x.fill(); x.stroke(); }

  // ---------- the animation: one lap, then a pause on the finished picture ----------
  const LAP = 8, HOLD = 1.5;
  let animOn = !reduceMotion, animT0 = performance.now(), raf = 0, seen = true, lastF = null;
  const running = () => animOn && !document.hidden && seen;
  const animFrac = now => Math.max(0, Math.min(1, (((now - animT0) / 1000) % (LAP + HOLD)) / LAP));
  const quant = f => Math.round(f * 600) / 600;
  function tick(now) { raf = 0; if (!running()) return; const f = quant(animFrac(now)); if (f !== lastF) { lastF = f; frame(f); } raf = requestAnimationFrame(tick); }
  function kick() { if (running() && !raf) raf = requestAnimationFrame(tick); }
  function syncAnim() { $('anim').textContent = animOn ? '❚❚ Pause' : '▶ Animate'; $('anim').setAttribute('aria-pressed', String(animOn)); }
  $('anim').addEventListener('click', () => { animOn = !animOn; if (animOn) animT0 = performance.now(); syncAnim(); if (!animOn) { lastF = 1; frame(1); } kick(); });
  document.addEventListener('visibilitychange', kick);
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { seen = es[0].isIntersecting; kick(); }).observe($('lab'));
  const nowF = () => (running() ? quant(animFrac(performance.now())) : 1);
  function frame(f) { if (mode === 'clock') drawClocks(f); else if (mode === 'train') drawTrain(f); else drawAdd(f); }

  // ---------- 1. The light clock ----------
  const TICKS = 10;
  function drawClocks(f) {
    const pd = scene; if (!pd.w) pd.size();
    const x = pd.x, W = pd.w, H = pd.h, b = S.bc, g = P.gamma(b), t = TICKS * f;
    x.clearRect(0, 0, W, H);
    const lane = H / 2, gap = Math.min(lane - 56, 120), s = gap / 0.5, cx = W * 0.5;
    [[0, 'The platform clock, at rest', t, false], [lane, `The moving clock, at ${trim(b)}c`, t / g, true]].forEach(([y0, label, tau, moving]) => {
      text(pd, label, 12, y0 + 8, { color: moving ? BRAND : INK });
      const top = y0 + 30, bot = top + gap;
      // the platform's marks slide past the moving clock, which the picture follows
      const ground = bot + 12;
      line(pd, [[0, ground], [W, ground]], LIGHT, 1.2);
      for (let k = -40; k <= 40; k++) { const X = cx + (k * 0.25 - (moving ? b * t : 0)) * s; if (X > -5 && X < W + 5) line(pd, [[X, ground], [X, ground + (k % 4 ? 4 : 8)]], LIGHT, 1.2); }
      // the light's zigzag, drawn on the platform
      if (moving) {
        const pts = []; for (let k = 0; k <= 160; k++) { const tt = Math.max(0, t - 1.6 * g * k / 160); pts.push([cx + (b * tt - b * t) * s, bot - P.tri(tt / g) * gap]); }
        line(pd, pts, alpha(AMBER, 0.85), 2);
      } else {
        line(pd, [[cx, top], [cx, bot]], alpha(AMBER, 0.45), 2, [4, 4]);
      }
      line(pd, [[cx - 34, top], [cx + 34, top]], INK, 4); line(pd, [[cx - 34, bot], [cx + 34, bot]], INK, 4);
      dot(pd, cx, bot - P.tri(tau) * gap, 6, AMBER); dot(pd, cx, bot - P.tri(tau) * gap, 2.5, '#fff');
      text(pd, String(Math.floor(tau + 1e-9)), W - 14, top + gap / 2 - 22, { size: 30, weight: 800, align: 'right', color: moving ? BRAND : INK });
      text(pd, 'ticks', W - 14, top + gap / 2 + 12, { align: 'right' });
    });
    // the light triangle beside it
    drawTriangle();
  }
  function drawTriangle() {
    const pd = side; if (!pd.w) pd.size();
    const x = pd.x, W = pd.w, H = pd.h, b = S.bc, g = P.gamma(b);
    x.clearRect(0, 0, W, H);
    text(pd, 'Half a tick, seen from the platform', 12, 8);
    const across = b * g, up = 1, sc = Math.min((W - 140) / Math.max(across, 0.4), (H - 110) / up), X0 = 40, Y0 = H - 50;
    // the clock at rest: straight up
    line(pd, [[X0, Y0], [X0, Y0 - up * sc]], alpha(INK, 0.6), 2, [5, 4]);
    text(pd, 'at rest: L', X0 - 6, Y0 - up * sc - 18, { color: INK });
    const A = [X0 + 34, Y0], B = [X0 + 34 + across * sc, Y0], C = [X0 + 34 + across * sc, Y0 - up * sc];
    x.fillStyle = alpha(BRAND, 0.08); x.beginPath(); x.moveTo(...A); x.lineTo(...B); x.lineTo(...C); x.closePath(); x.fill();
    line(pd, [A, B], GREY, 2); line(pd, [B, C], INK, 2); line(pd, [A, C], AMBER, 3);
    text(pd, `v·Δt/2 = ${fixed(across, 2)} L`, (A[0] + B[0]) / 2, Y0 + 10, { align: 'center' });
    text(pd, 'L', C[0] + 8, (B[1] + C[1]) / 2 - 7, { color: INK, weight: 700 });
    const mx = (A[0] + C[0]) / 2, my = (A[1] + C[1]) / 2;
    text(pd, `c·Δt/2 = ${fixed(g, 2)} L`, mx - 10, my - 24, { color: ORANGE, weight: 700, align: across * sc > 120 ? 'center' : 'left' });
    if (deep) text(pd, `${fixed(g, 3)}² = 1² + ${fixed(across, 3)}²`, W - 12, 28, { align: 'right', color: INK });
  }
  function renderClock() {
    const b = S.bc, g = P.gamma(b), M = P.MUON;
    put('dg-title', 'Two light clocks');
    put('dg-cap', 'Each tick is one trip of the light up and back. The picture follows the moving clock; its light leaves a zigzag trail on the platform, longer than the straight up-and-down path of the clock at rest.');
    legend('dg-legend', [[AMBER, '', 'the light'], [INK, '', 'the mirrors'], [LIGHT, '', 'platform marks']]);
    const r1 = P.muonRange(b, true), r0 = P.muonRange(b, false);
    stats([
      [`Lorentz factor ${sym('γ')}`, fixed(g, 3), `1/√(1 − ${fixed(b * b, 3)})`],
      ['Ticks per 10 at rest', fixed(TICKS / g, 2), 'made by the moving clock'],
      ['Each tick lasts', `${fixed(g, 3)} ticks`, 'of the platform clock'],
      ['A muon\'s mean range', r1 >= 1000 ? `${fixed(r1 / 1000, 2)} km` : `${fixed(r1, 0)} m`, deep ? `γvτ; without time dilation vτ = ${fixed(r0, 0)} m` : `${fixed(r0, 0)} m if its clock ran at the normal rate`],
    ]);
    put('info', b < 0.15 ? `At ${trim(b)}c the two clocks keep almost perfect step: γ = ${fixed(g, 4)}, a difference of ${fixed(100 * (g - 1), 2)}%. Everyday speeds are far smaller still, which is why no one noticed for so long.` : `At ${trim(b)}c the moving clock's light must cover ${fixed(g, 2)} mirror gaps along the diagonal for every gap a clock at rest needs, and it goes no faster. So each tick takes ${fixed(g, 2)} times as long: ${fixed(TICKS / g, 1)} ticks while the platform clock makes 10.`);
    // plot A: γ against speed
    const bs = range(0, 0.995, 199);
    plotA.opts.xLabel = 'Speed, v/c'; plotA.opts.yLabel = 'Lorentz factor γ'; plotA.opts.xTickValues = null; plotA.opts.xFormat = null;
    plotA.setRange([0, 1], [0, 11]);
    plotA.draw([{ type: 'hline', y: 1, color: LIGHT }, { type: 'vline', x: 1, color: LIGHT, label: 'c' }, { type: 'line', x: bs, y: bs.map(P.gamma), color: BRAND, width: 2.4 }, { type: 'vline', x: b, color: INK, dash: [3, 4] }, { type: 'dots', x: [b], y: [g], color: INK, r: 4.5 }]);
    put('pa-title', 'How slow a moving clock runs');
    put('pa-cap', 'γ stays close to 1 until v is a sizeable fraction of c, then grows without limit.');
    legend('pa-legend', [[BRAND, '', 'γ = 1/√(1 − v²/c²)'], [INK, 'swatch--dot', 'this speed']]);
    // plot B: muons surviving the trip down
    const ds = range(0, M.height, 150), km = ds.map(d => d / 1000);
    plotB.opts.xLabel = 'Distance travelled (km)'; plotB.opts.yLabel = 'Muons still alive'; plotB.opts.xTickValues = null;
    plotB.setRange([0, 15], [0, 1.05]);
    const at = P.survive(M.height, b, true);
    plotB.draw([{ type: 'line', x: km, y: ds.map(d => P.survive(d, b, false)), color: GREY, width: 1.8, dash: [5, 4] }, { type: 'line', x: km, y: ds.map(d => P.survive(d, b, true)), color: BRAND, width: 2.4, fill: alpha(BRAND, 0.1) }, { type: 'dots', x: [15], y: [at], color: INK, r: 4.5 }, { type: 'text', x: 14.6, y: Math.min(0.98, at + 0.12), text: `${at >= 0.001 ? fixed(100 * at, 1) + '%' : at.toExponential(0)} reach the ground`, align: 'right', color: INK }]);
    put('pb-title', 'Muons from 15 km up');
    put('pb-cap', `Muons made by cosmic rays 15 km up, moving at ${trim(b)}c, with a mean lifetime of 2.2 μs. Dashed: what would survive if their clocks were not slowed.`);
    legend('pb-legend', [[BRAND, '', 'with time dilation'], [GREY, 'swatch--dash', 'without']]);
    put('takeaway', 'Time dilation follows from one fact: light moves at c for everyone. A moving clock runs slow by γ, and so does everything that moves with it: its light, its atoms, a muon\'s decay.');
  }

  // ---------- 2. The train and the lightning ----------
  const TR = { tmin: -0.7, tmax: 1.75 };
  const bview = () => (S.view === 'train' ? S.bt : 0);
  // an event or a worldline point, from platform coordinates to the chosen view
  const V = (x, t) => P.boost(bview(), x, t);
  // where a body moving at w (on the platform), at x0 when t = 0, is at time T of the chosen view
  function at(x0, w, T) { const bv = bview(), g = P.gamma(bv), t = (T / g + bv * x0) / (1 - bv * w); return V(x0 + w * t, t); }
  function seg(pairs) { const X = [], Y = []; for (const p of pairs) { if (!p) { X.push(NaN); Y.push(NaN); continue; } const [x, t] = V(p[0], p[1]); X.push(x); Y.push(t); } return { x: X, y: Y }; }
  function drawTrain(f) {
    const b = S.bt, T = P.train(b, 1), L = T.L, now = TR.tmin + (TR.tmax - TR.tmin) * f;
    fitAround(dia, 0, (TR.tmin + TR.tmax) / 2, (TR.tmax - TR.tmin) / 2);
    dia.opts.xLabel = 'Position, x (light-seconds)'; dia.opts.yLabel = 'Time, ct (seconds)';
    const t0 = -4, t1 = 6, Ls = [];
    const wl = (x0, w) => seg([[x0 + w * t0, t0], [x0 + w * t1, t1]]);
    // worldlines: the platform observer, the strike marks on the platform, the train's ends and its middle
    const pm = wl(0, 0); Ls.push({ type: 'line', ...pm, color: INK, width: 1.6 });
    [-L / 2, L / 2].forEach(x0 => { const m = wl(x0, 0); Ls.push({ type: 'line', ...m, color: LIGHT, width: 1.2 }); });
    const tb = wl(-L / 2, b), tf = wl(L / 2, b), tm = wl(0, b);
    // shade the train between its ends
    const poly = { x: [tb.x[0], tb.x[1], tf.x[1], tf.x[0]], y: [tb.y[0], tb.y[1], tf.y[1], tf.y[0]] };
    Ls.push({ type: 'poly', ...poly, fill: alpha(BRAND, 0.1) }, { type: 'line', ...tb, color: alpha(BRAND, 0.7), width: 1.2 }, { type: 'line', ...tf, color: alpha(BRAND, 0.7), width: 1.2 }, { type: 'line', ...tm, color: BRAND, width: 2 });
    // "now" lines through the strikes: the platform's (one line) and the train's (one through each strike)
    const plat = seg([[-6, 0], [6, 0]]); Ls.push({ type: 'line', ...plat, color: INK, width: 1.2, dash: [6, 4] });
    [T.A, T.B].forEach(([xe, te]) => { const s = seg([[xe - 6, te - 6 * b], [xe + 6, te + 6 * b]]); Ls.push({ type: 'line', ...s, color: BRAND, width: 1.2, dash: [6, 4] }); });
    // light from each strike, up to the chosen view's "now"
    const [xa, ta] = V(...T.A), [xb, tb2] = V(...T.B);
    const ray = (xe, te, dir) => (now > te ? { type: 'line', x: [xe, xe + dir * (now - te)], y: [te, now], color: AMBER, width: 2.2 } : null);
    [ray(xa, ta, 1), ray(xa, ta, -1), ray(xb, tb2, 1), ray(xb, tb2, -1)].forEach(r => r && Ls.push(r));
    // the moments the light arrives
    const arrivals = [[T.mid(T.seeFront), T.seeFront], [T.mid(T.seeBack), T.seeBack], [0, T.seePlatform]].map(([x, t]) => V(x, t)).filter(p => p[1] <= now);
    if (arrivals.length) Ls.push({ type: 'dots', x: arrivals.map(p => p[0]), y: arrivals.map(p => p[1]), color: INK, r: 4 });
    Ls.push({ type: 'dots', x: [xa, xb].filter((_, i) => [ta, tb2][i] <= now), y: [ta, tb2].filter(t => t <= now), color: ORANGE, r: 6 });
    if (f < 1) Ls.push({ type: 'hline', y: now, color: alpha(INK, 0.5), dash: [] });
    dia.draw(Ls);
    drawTrack(now);
  }
  function drawTrack(now) {
    const pd = side; if (!pd.w) pd.size();
    const x = pd.x, W = pd.w, H = pd.h, b = S.bt, T = P.train(b, 1), L = T.L;
    x.clearRect(0, 0, W, H);
    const xr = dia.xr, X = v => 14 + (v - xr[0]) / (xr[1] - xr[0]) * (W - 28);
    text(pd, `The track at t${S.view === 'train' ? '′' : ''} = ${fixed(now, 2)} s, ${S.view === 'train' ? 'in the train\'s frame' : 'on the platform'}`, 12, 8);
    const yT = H * 0.42, yP = H * 0.74;
    // the platform, with its strike marks and observer
    const p0 = at(-3, 0, now)[0], p1 = at(3, 0, now)[0];
    line(pd, [[X(p0), yP], [X(p1), yP]], GREY, 3);
    for (let k = -12; k <= 12; k++) { const m = at(k * 0.25, 0, now)[0]; line(pd, [[X(m), yP], [X(m), yP + (k % 2 ? 4 : 8)]], LIGHT, 1.2); }
    [-L / 2, L / 2].forEach(x0 => { const m = at(x0, 0, now)[0]; line(pd, [[X(m), yP - 6], [X(m), yP + 10]], ORANGE, 2); });
    const po = at(0, 0, now)[0]; dot(pd, X(po), yP - 9, 5, INK); text(pd, 'platform observer', X(po), yP + 14, { align: 'center', color: INK });
    // the train and its passenger
    const xb = at(-L / 2, b, now)[0], xf = at(L / 2, b, now)[0], xm = at(0, b, now)[0];
    x.fillStyle = alpha(BRAND, 0.15); x.strokeStyle = BRAND; x.lineWidth = 2; x.fillRect(X(xb), yT - 16, X(xf) - X(xb), 32); x.strokeRect(X(xb), yT - 16, X(xf) - X(xb), 32);
    dot(pd, X(xm), yT, 5, BRAND); text(pd, 'passenger', X(xm), yT - 34, { align: 'center', color: BRAND });
    text(pd, 'back', X(xb) + 4, yT + 20, { size: 11 }); text(pd, 'front', X(xf) - 4, yT + 20, { size: 11, align: 'right' });
    // the strikes and their light
    [[T.A, 'A'], [T.B, 'B']].forEach(([[xe, te]]) => {
      const [xv, tv] = V(xe, te);
      if (now >= tv) {
        if (now - tv < 0.18) bolt(pd, X(xv), (yT + yP) / 2, 14);
        [xv - (now - tv), xv + (now - tv)].forEach(q => { if (q > xr[0] && q < xr[1]) { dot(pd, X(q), yT, 4.5, AMBER); dot(pd, X(q), yP - 2, 3.5, AMBER); } });
      }
    });
  }
  function renderTrain() {
    const b = S.bt, g = P.gamma(b), T = P.train(b, 1), s = P.strikes(b, b, 1), tv = S.view === 'train';
    put('dg-title', tv ? 'The strikes, in the train\'s frame' : 'The strikes, on the platform');
    put('dg-cap', `Time runs up, position across; light travels at 45°. Teal band: the train; solid teal line: the passenger in its middle; black line: the platform observer. Dashed lines join events that are simultaneous: black for the platform, teal for the train. ${tv ? 'Here the train\'s lines are level and the platform\'s are tilted.' : 'Here the platform\'s line is level and the train\'s are tilted.'}`);
    legend('dg-legend', [[ORANGE, 'swatch--dot', 'lightning strikes'], [AMBER, '', 'their light'], [INK, 'swatch--dash', 'same time, platform'], [BRAND, 'swatch--dash', 'same time, train']]);
    stats([
      [`Lorentz factor ${sym('γ')}`, fixed(g, 3), `at ${trim(b)}c`],
      ['The train on the platform', `${fixed(T.L, 3)} light-s`, `L_0/γ; it is 1 at rest`],
      ['For the passenger', b < 1e-9 ? 'at the same time' : `front first, by ${fixed(s.dt, 3)} s`, b < 1e-9 ? 'the train is not moving' : `vL_0/c²; on the platform, at the same time`],
      [`Interval ${sym('Δx² − c²Δt²')}`, fixed(s.interval, 3), deep ? `platform ${fixed(T.L, 3)}² − 0² ; train 1² − ${fixed(s.dt, 3)}²` : 'the same in both frames'],
    ]);
    put('info', b < 1e-9 ? 'At rest, the train and the platform agree on everything: the strikes are simultaneous for both, and the train is 1 light-second long.' : tv
      ? `In the train's frame the train is at rest and 1 light-second long. The front strike comes ${fixed(s.dt, 3)} s before the back one, and the passenger, in the middle, sees each flash half a light-second after it happened. The platform's level line has tipped: its clocks are out of step.`
      : `On the platform both strikes happen at t = 0, and their light meets at the platform observer at ${fixed(T.seePlatform, 3)} s. The passenger, moving towards the front flash, sees it at ${fixed(T.seeFront, 3)} s and the back flash at ${fixed(T.seeBack, 3)} s. Follow the tilted teal line through the back strike: it crosses the front's worldline before the strike there, so for the train the front came first.`);
    // plot A: who sees which strike first
    const us = range(-0.8, 0.8, 160), dts = us.map(u => P.strikes(b, u, 1).dt);
    plotA.opts.xLabel = 'Observer\'s speed along the platform, u/c'; plotA.opts.yLabel = 't_back − t_front (s)'; plotA.opts.xTickValues = null;
    plotA.setRange([-0.8, 0.8], [-1.1, 1.1]);
    plotA.draw([{ type: 'hline', y: 0, color: LIGHT, dash: [] }, { type: 'line', x: us, y: dts, color: BRAND, width: 2.4 }, { type: 'dots', x: [0], y: [0], color: INK, r: 4.5 }, { type: 'dots', x: [b], y: [s.dt], color: BRAND, r: 5 }, { type: 'text', x: -0.42, y: 0.95, text: 'front first ↑', color: GREY }, { type: 'text', x: -0.42, y: -0.82, text: 'back first ↓', color: GREY }]);
    put('pa-title', 'Which strike comes first depends on who is asking');
    put('pa-cap', 'For observers moving along the platform at every speed from −0.8c to 0.8c. Black dot: the platform; teal dot: the train.');
    legend('pa-legend', [[BRAND, '', 'time between the strikes'], [INK, 'swatch--dot', 'platform'], [BRAND, 'swatch--dot', 'train']]);
    // plot B: the hyperbola that every observer's (Δx, cΔt) lies on
    const ws = range(-0.95, 0.95, 190), hx = ws.map(u => P.strikes(b, u, 1).dx), hy = ws.map(u => P.strikes(b, u, 1).dt);
    plotB.opts.xLabel = 'Distance between the strikes, Δx'; plotB.opts.yLabel = 'Time between them, cΔt'; plotB.opts.xTickValues = null;
    plotB.setRange([0, 3.2], [-2.6, 2.6]);
    plotB.draw([{ type: 'line', x: [0, 3.2], y: [0, 3.2], color: LIGHT, dash: [4, 4] }, { type: 'line', x: [0, 3.2], y: [0, -3.2], color: LIGHT, dash: [4, 4] }, { type: 'line', x: hx, y: hy, color: BRAND, width: 2.4 }, { type: 'dots', x: [T.L], y: [0], color: INK, r: 4.5 }, { type: 'dots', x: [s.dx], y: [s.dt], color: BRAND, r: 5 }]);
    put('pb-title', 'What every observer agrees on');
    put('pb-cap', `Each observer finds a different distance and time between the strikes, but all lie on one hyperbola, Δx² − c²Δt² = ${fixed(T.L * T.L, 3)}. It never reaches the light lines (dashed), so no one sees the strikes at one place.`);
    legend('pb-legend', [[BRAND, '', 'all observers'], [INK, 'swatch--dot', 'platform'], [BRAND, 'swatch--dot', 'train']]);
    put('takeaway', 'Simultaneity is not absolute: events at the same time in one frame are at different times in another moving along the line between them. Length contraction is the same fact seen another way: to measure a moving train, you must mark both ends at the same time, and the two frames disagree on what that means.');
  }

  // ---------- 3. Adding velocities ----------
  function drawAdd(f) {
    const v = S.bv, up = S.bu, u = P.add(up, v), gal = up + v, now = 1.0 * f;
    dia.opts.xLabel = 'Position, x (light-seconds)'; dia.opts.yLabel = 'Time, ct (seconds)';
    fitAround(dia, 0.7, 0.52, 0.6);
    const xr = dia.xr, Ls = [];
    // the forbidden regions outside the light lines
    Ls.push({ type: 'poly', x: [0, 3, 3], y: [0, 0, 3], fill: alpha(ORANGE, 0.06) }, { type: 'poly', x: [0, -3, -3], y: [0, 0, 3], fill: alpha(ORANGE, 0.06) });
    Ls.push({ type: 'line', x: [0, 3], y: [0, 3], color: AMBER, width: 1.6, dash: [6, 4] }, { type: 'line', x: [0, -3], y: [0, 3], color: AMBER, width: 1.6, dash: [6, 4] });
    Ls.push({ type: 'line', x: [0, 0], y: [0, 3], color: INK, width: 1.6 }, { type: 'line', x: [0, 3 * v], y: [0, 3], color: BRAND, width: 2 });
    Ls.push({ type: 'line', x: [0, 3 * gal], y: [0, 3], color: GREY, width: 1.6, dash: [3, 4] }, { type: 'line', x: [0, 3 * u], y: [0, 3], color: ORANGE, width: 2.6 });
    if (f < 1) Ls.push({ type: 'hline', y: now, color: alpha(INK, 0.4), dash: [] });
    Ls.push({ type: 'dots', x: [0, v * now, u * now], y: [now, now, now], colors: [INK, BRAND, ORANGE], r: 5 });
    if (gal * now < xr[1]) Ls.push({ type: 'dots', x: [gal * now], y: [now], color: GREY, r: 3.5 });
    Ls.push({ type: 'text', x: Math.min(xr[1] - 0.25, 1.02), y: 1.08, text: 'light', color: ORANGE, size: 11 });
    if (gal > 1.001) Ls.push({ type: 'text', x: Math.min(xr[1] - 0.45, gal * 0.55 + 0.15), y: 0.5, text: 'faster than light', color: GREY, size: 11 });
    dia.draw(Ls);
  }
  function renderAdd() {
    const v = S.bv, up = S.bu, u = P.add(up, v), gal = up + v, light = up >= 1;
    put('dg-title', 'The ball\'s path, seen from the platform');
    put('dg-cap', 'Time runs up, position across, from the moment the ball is thrown. The shaded regions lie beyond the light lines, where nothing can go.');
    legend('dg-legend', [[INK, '', 'platform'], [BRAND, '', 'train'], [ORANGE, '', 'the ball (relativity)'], [GREY, 'swatch--dash', 'the ball (common sense)'], [AMBER, 'swatch--dash', 'light']]);
    const fv = P.rapidity(v), fu = light ? Infinity : P.rapidity(up), ft = fv + fu;
    stats([
      [`Common sense, ${sym('u′ + v')}`, `${fixed(gal, 3)}c`, gal > 1 ? 'faster than light: impossible' : 'Galileo\'s rule'],
      ['Relativity', `${fixed(u, 4)}c`, deep ? `(u′ + v)/(1 + u′v/c²) = ${fixed(gal, 2)}/${fixed(1 + up * v, 3)}` : '(u′ + v)/(1 + u′v/c²)'],
      ['Rapidities', light ? '∞' : `${fixed(fv, 3)} + ${fixed(fu, 3)}`, light ? 'light has unlimited rapidity' : `= ${fixed(ft, 3)}, and tanh ${fixed(ft, 3)} = ${fixed(Math.tanh(ft), 4)}`],
      [`The ball's ${sym('γ')}`, light ? '∞' : fixed(P.gamma(u), 3), light ? 'light has no rest frame' : 'measured on the platform'],
    ]);
    put('info', light ? `Light from a torch on a train at ${trim(v)}c: common sense says ${fixed(gal, 2)}c, but the platform measures exactly c. (1 + ${trim(v)})/(1 + ${trim(v)}) = 1, whatever the train's speed.`
      : `Thrown at ${trim(up)}c inside a train moving at ${trim(v)}c, the ball moves at ${fixed(u, 4)}c on the platform, not ${fixed(gal, 3)}c. ${Math.abs(up * v) < 0.01 ? 'At low speeds the correction is tiny: common sense works.' : `The correction factor 1 + u′v/c² = ${fixed(1 + up * v, 3)}.`}`);
    // plot A: relativity against common sense, for this train
    const us = range(-1, 1, 200);
    plotA.opts.xLabel = 'Ball in the train, u′/c'; plotA.opts.yLabel = 'Ball on the platform, u/c'; plotA.opts.xTickValues = null;
    plotA.setRange([-1, 1], [-1.2, 2]);
    plotA.draw([{ type: 'hline', y: 1, color: AMBER, dash: [6, 4] }, { type: 'hline', y: -1, color: AMBER, dash: [6, 4] }, { type: 'line', x: us, y: us.map(w => w + v), color: GREY, width: 1.6, dash: [3, 4] }, { type: 'line', x: us, y: us.map(w => P.add(w, v)), color: ORANGE, width: 2.4 }, { type: 'dots', x: [up], y: [u], color: INK, r: 4.5 }]);
    put('pa-title', `Every ball, for a train at ${trim(v)}c`);
    put('pa-cap', 'The relativistic sum bends away from the common-sense line and meets the speed of light (dashed) exactly at u′ = c.');
    legend('pa-legend', [[ORANGE, '', 'relativity'], [GREY, 'swatch--dash', 'common sense'], [INK, 'swatch--dot', 'this ball']]);
    // plot B: rapidities add along the tanh curve
    const lo = Math.min(0, light ? 0 : ft) - 0.3, hi = Math.max(3, light ? 3 : Math.min(6, ft)) + 0.2, ps = range(lo, hi, 200);
    plotB.opts.xLabel = 'Rapidity, φ'; plotB.opts.yLabel = 'Speed, v/c = tanh φ'; plotB.opts.xTickValues = null;
    plotB.setRange([lo, hi], [-1.05, 1.1]);
    const LB = [{ type: 'hline', y: 1, color: AMBER, dash: [6, 4] }, { type: 'hline', y: 0, color: LIGHT, dash: [] }, { type: 'line', x: ps, y: ps.map(Math.tanh), color: BRAND, width: 2.4 }, { type: 'dots', x: [fv], y: [v], color: BRAND, r: 5 }];
    if (!light) LB.push({ type: 'line', x: [fv, ft], y: [-0.9, -0.9], color: ORANGE, width: 3 }, { type: 'line', x: [0, fv], y: [-0.9, -0.9], color: BRAND, width: 3 }, { type: 'vline', x: ft, color: ORANGE, dash: [3, 4] }, { type: 'dots', x: [ft], y: [Math.tanh(ft)], color: ORANGE, r: 5 });
    plotB.draw(LB);
    put('pb-title', 'What does add: rapidity');
    put('pb-cap', light ? 'Light sits at the top of the curve, at infinite rapidity: no push gets a body there.' : 'The train\'s rapidity (teal bar) plus the ball\'s (orange bar) gives the ball\'s rapidity on the platform; the curve turns it back into a speed.');
    legend('pb-legend', [[BRAND, '', 'v/c = tanh φ'], [BRAND, 'swatch--dot', 'the train'], [ORANGE, 'swatch--dot', 'the ball']]);
    put('takeaway', 'Velocities near c do not add like ordinary numbers; rapidities do. Nothing with mass reaches c, and light, which moves at c, moves at c for everyone.');
  }

  // ---------- controls ----------
  function syncControls() {
    const set = (id, v, txt) => { $(id).value = v; $(id + '-out').textContent = txt; $(id).setAttribute('aria-valuetext', txt); };
    set('bc', S.bc, `${trim(S.bc)}c`); set('bt', S.bt, `${trim(S.bt)}c`); set('bv', S.bv, `${trim(S.bv)}c`); set('bu', S.bu, S.bu >= 1 ? 'c (light)' : `${trim(S.bu)}c`);
    const pressed = (attr, val) => document.querySelectorAll(`button[data-${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(val))));
    pressed('bc', S.bc); pressed('view', S.view); pressed('depth', deep ? 'deep' : 'simple');
    $('depth-hint').textContent = deep ? 'The formulas: Pythagoras in the light triangle, the interval in both frames, the velocity-addition fraction.' : 'The main ideas; switch to Go deeper for the formulas behind each number.';
  }
  function render() {
    syncControls();
    lastF = null;
    if (mode === 'clock') renderClock(); else if (mode === 'train') renderTrain(); else renderAdd();
    frame(nowF());
    $('plot-a').setAttribute('aria-label', $('pa-title').textContent); $('plot-b').setAttribute('aria-label', $('pb-title').textContent);
    $('scene').setAttribute('aria-label', `${$('dg-title').textContent}. ${$('info').textContent}`); $('diagram').setAttribute('aria-label', `${$('dg-title').textContent}. ${$('info').textContent}`);
    kick();
  }
  function applyMode() {
    document.querySelectorAll('.tab').forEach(b => { const on = b.dataset.mode === mode; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $('lab').setAttribute('aria-labelledby', 'tab-' + mode);
    document.querySelectorAll('.mode-intro').forEach(el => { el.hidden = el.dataset.for !== mode; });
    document.querySelectorAll('[data-modes], [data-deep]').forEach(el => { el.hidden = !((!el.dataset.modes || el.dataset.modes.split(' ').includes(mode)) && (!('deep' in el.dataset) || deep)); });
    $('scene').hidden = mode !== 'clock'; $('diagram').hidden = mode === 'clock';
    $('side-box').hidden = mode === 'add';
    $('mag-view').classList.toggle('mag-view--single', mode === 'add');
    scene.w = 0; side.w = 0;
    animT0 = performance.now();
    requestAnimationFrame(() => { scene.w = 0; side.w = 0; dia._resize(); render(); });
    render();
  }
  let pending = false;
  function later() { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; render(); }); }
  ['bc', 'bt', 'bv', 'bu'].forEach(id => $(id).addEventListener('input', e => { S[id] = +e.target.value; later(); }));
  document.querySelector('.lab-main').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !b.closest('.controls')) return;
    const d = b.dataset;
    if (d.bc) S.bc = +d.bc;
    else if (d.view) S.view = d.view;
    else if (b.id === 'torch') S.bu = 1;
    else if (b.id === 'video-values') Object.assign(S, JSON.parse(JSON.stringify(START)));
    else return;
    animT0 = performance.now();
    render();
  });
  if ('ResizeObserver' in window) new ResizeObserver(() => { scene.w = 0; side.w = 0; later(); }).observe($('mag-view'));
  document.querySelectorAll('[data-depth]').forEach(b => b.addEventListener('click', () => {
    deep = b.dataset.depth === 'deep';
    try { localStorage.setItem('lorentz-depth', deep ? 'deep' : 'simple'); } catch (e) { /* not remembered: fine */ }
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
  const fresh = o => Object.assign(S, JSON.parse(JSON.stringify(START)), o);
  const QUESTIONS = {
    six: () => { mode = 'clock'; fresh({ bc: 0.6 }); },
    eight: () => { mode = 'clock'; fresh({ bc: 0.8 }); },
    muon: () => { mode = 'clock'; fresh({ bc: 0.995 }); },
    strikes: () => { mode = 'train'; fresh({ bt: 0.6, view: 'platform' }); },
    short: () => { mode = 'train'; fresh({ bt: 0.8, view: 'platform' }); },
    interval: () => { mode = 'train'; fresh({ bt: 0.6, view: 'train' }); },
    half: () => { mode = 'add'; fresh({ bv: 0.5, bu: 0.5 }); },
    torch: () => { mode = 'add'; fresh({ bv: 0.9, bu: 1 }); },
  };
  document.querySelectorAll('.predict__load[data-q]').forEach(b => b.addEventListener('click', () => {
    QUESTIONS[b.dataset.q]();
    applyMode();
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    const t = tabs.find(x => x.dataset.mode === mode); if (t) t.focus({ preventScroll: true });
  }));

  syncAnim();
  applyMode();
  window.__lt = { S, render, frame, setMode: m => { mode = m; applyMode(); } };
})();
