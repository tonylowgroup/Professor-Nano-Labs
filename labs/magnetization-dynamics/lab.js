/* Magnetization dynamics lab: precession, damping, switching a bit, and writing a cross-point MRAM.
   Physics in physics.js, pictures in views.js. Each run is integrated once when a control changes,
   then played back in slow motion. */
(function () {
  'use strict';
  const L = window.LLG, V = window.MagViews, DEG = Math.PI / 180;
  const $ = id => document.getElementById(id);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const START = { H: 1e5, th0: 30, a2: 0.1, H3: 6e5, tilt: 5, hold: true, pulse: 1, K: 4e5, a3: 0.1, he: 0.6, hx: 0.6 };
  const S = Object.assign({}, START);
  let mode = 'prec';
  const INK = '#14232c', RED = '#d23b2e', GREEN = '#2e8b57', ORANGE = '#e07b1a', BLUE = '#1f6fb4', BERRY = '#a3326c', AMBER = '#c47a12';
  const CLS = { sel: '#1f4ea8', row: '#0f8b8d', col: '#8a3fc7' };
  const TR = 0.5e-9, HOLD = 2e-9, TW = 4e-9;                      // the write pulse: ramp, hold, ramp, then 1 ns to settle
  const PLAY = { prec: 7, damp: 8, switch: 10, write: 10 };       // seconds of playback per run

  // ---------- formatting ----------
  const fixed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  function sci(x, d = 1) { if (!(x > 0)) return '0'; let k = Math.floor(Math.log10(x)), m = x / Math.pow(10, k); if (m >= 10 - 0.5 * Math.pow(10, -d)) { m /= 10; k++; } return `${m.toFixed(d)} × 10${String(k).split('').map(c => SUP[c]).join('')}`; }
  const fmtH = H => (H > 0 ? `${sci(H)} A/m` : '0 A/m');
  const fmtT = s => (!isFinite(s) ? '∞' : s < 1e-9 ? `${(s * 1e12).toFixed(s < 1e-11 ? 1 : 0)} ps` : `${(s * 1e9).toFixed(s < 1e-8 ? 2 : 1)} ns`);
  const fmtA = a => (a >= 10 ? a.toFixed(0) : a >= 1 ? a.toFixed(1) : a.toPrecision(2));
  const aOf = i => Math.pow(10, -2 + i / 100), iOfA = a => Math.round(100 * (Math.log10(a) + 2));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const range = (a, b, k) => Array.from({ length: k + 1 }, (_, i) => a + (b - a) * i / k);

  // ---------- helpers ----------
  const rich = t => String(t).replace(/_\{([^}]*)\}|_([A-Za-z0-9])/g, (m, a, b) => `<sub>${a || b}</sub>`);
  function stats(items) {
    $('stats').innerHTML = items.map(([label, value, sub2]) =>
      `<div class="stat"><div class="stat__label">${rich(label)}</div><div class="stat__value">${value}</div><div class="stat__sub">${rich(sub2)}</div></div>`).join('');
  }
  function legend(id, items) { setHTML($(id), items.map(([color, kind, label]) => `<li style="color:${color}"><span class="swatch ${kind}"></span><span>${rich(label)}</span></li>`).join('')); }
  function typeset(el) { if (window.MathJax && MathJax.typesetPromise && /\\\(/.test(el.innerHTML)) MathJax.typesetPromise([el]).catch(() => {}); }
  function setHTML(el, html) { if (el.dataset.html === html) return; el.dataset.html = html; el.innerHTML = html; typeset(el); }
  const put = (id, t) => setHTML($(id), rich(t));
  const MARGIN = { l: 58, r: 18, t: 12, b: 42 };
  const plotA = new NanoPlot($('plot-a'), { margin: MARGIN, narrowMargin: { l: 58 } });
  const plotB = new NanoPlot($('plot-b'), { margin: MARGIN, narrowMargin: { l: 58 } });
  const land = new NanoPlot($('land'), { margin: { l: 52, r: 14, t: 12, b: 42 }, xTicks: 4 });
  const sphere = new V.MagSphere($('sphere'));
  const reset = pl => { pl.opts.xTickValues = null; pl.opts.xFormat = null; pl.opts.yFormat = null; pl.opts.zeroLine = false; pl.opts.xTicks = 6; };

  // ---------- one run of the LLG equation for the current controls ----------
  let run = null;
  const env = t => (t < TR ? t / TR : t < TR + HOLD ? 1 : t < 2 * TR + HOLD ? 1 - (t - TR - HOLD) / TR : 0);
  function keyFor() {
    if (mode === 'prec') return ['prec', S.H, S.th0].join();
    if (mode === 'damp') return ['damp', S.H, S.th0, S.a2].join();
    if (mode === 'switch') return ['switch', S.H3, S.tilt, S.hold, S.pulse, S.K, S.a3].join();
    return ['write', S.he, S.hx, S.K, S.a3].join();
  }
  function compute() {
    const key = keyFor();
    if (run && run.key === key) return false;
    let r;
    if (mode === 'prec' || mode === 'damp') {
      const a = mode === 'prec' ? 0 : S.a2, H = S.H, th0 = S.th0 * DEG, m0 = L.fromAngles(th0, 0);
      let T = 1e-9, tset = Infinity;
      if (mode === 'damp') { tset = L.tau(H, a) * Math.log(Math.tan(th0 / 2) / Math.tan(0.5 * DEG)); T = clamp(1.15 * tset, 0.03e-9, 30e-9); }
      const field = () => [0, 0, H];
      const sim = L.simulate({ m0: [m0], fields: [field], K: 0, alpha: a, T, Hmax: H, nOut: 2000 });
      r = { T, t: sim.t, mags: sim.m, a, m0, field, K: 0, Href: H, tset };
    } else if (mode === 'switch') {
      const hk = L.HK(S.K), a = S.a3, H = S.H3, u0 = -Math.cos(S.tilt * DEG), tp = S.hold ? Infinity : S.pulse * 1e-9, c2 = Math.cos(2 * DEG);
      // how long until it settles within 2 degrees of a pole, from the closed form (the motion is symmetric about z)
      const settle = (Hf, u) => { const s = Hf + hk * u; if (s === 0) return Infinity; if (s > 0) return u >= c2 ? 0 : L.tAxis(Hf, S.K, a, u, c2); return u <= -c2 ? 0 : L.tAxis(Hf, S.K, a, u, -c2); };
      const t1 = settle(H, u0);
      let T, uOff = null;
      if (t1 <= tp) T = Math.max(t1, isFinite(tp) ? tp + 0.15e-9 : 0);
      else { uOff = L.uAfter(H, S.K, a, u0, tp); T = tp + settle(0, uOff); }
      T = isFinite(T) ? clamp(T * 1.12 + 0.05e-9, 0.3e-9, 25e-9) : 25e-9;
      const tc = H + hk * u0 > 0 ? L.tAxis(H, S.K, a, u0, 0) : Infinity;       // time to reach the equator with the field on
      const field = t => [0, 0, t < tp ? H : 0];
      const m0 = L.fromAngles(Math.PI - S.tilt * DEG, 0);
      const sim = L.simulate({ m0: [m0], fields: [field], K: S.K, alpha: a, T, Hmax: H, nOut: 2000, breaks: isFinite(tp) ? [tp] : [] });
      r = { T, t: sim.t, mags: sim.m, a, m0, field, K: S.K, Href: H + hk, tp, tc, uOff, hk };
    } else {
      const hk = L.HK(S.K), a = S.a3, m0 = L.fromAngles(Math.PI - 1 * DEG, 30 * DEG);
      const fields = [t => [S.hx * hk * env(t), 0, S.he * hk * env(t)], t => [0, 0, S.he * hk * env(t)], t => [S.hx * hk * env(t), 0, 0]];
      const sim = L.simulate({ m0: [m0, m0, m0], fields, K: S.K, alpha: a, T: TW, Hmax: hk * Math.hypot(S.hx, S.he), nOut: 3200 });
      r = { T: TW, t: sim.t, mags: sim.m, a, m0, field: fields[0], fields, K: S.K, Href: hk * (1 + Math.hypot(S.hx, S.he)), hk };
    }
    r.key = key; r.n = r.t.length - 1;
    r.final = r.mags.map(m => m.z[r.n]);
    run = r;
    return true;
  }
  // the state of magnet j at fractional sample f, and its path up to there
  function at(j, f) {
    const m = run.mags[j], i = Math.min(run.n - 1, Math.floor(f)), w = Math.min(1, f - i);
    const x = m.x[i] + w * (m.x[i + 1] - m.x[i]), y = m.y[i] + w * (m.y[i + 1] - m.y[i]), z = m.z[i] + w * (m.z[i + 1] - m.z[i]);
    const r = Math.hypot(x, y, z) || 1;
    return [x / r, y / r, z / r];
  }
  function path(j, f, max) {
    const m = run.mags[j], i = Math.floor(f), step = Math.max(1, Math.ceil(i / (max || 2000))), pts = [];
    for (let k = 0; k <= i; k += step) pts.push([m.x[k], m.y[k], m.z[k]]);
    pts.push(at(j, f));
    return pts;
  }
  const unit = () => (run.T < 0.999e-9 ? { s: 1e12, name: 'ps' } : { s: 1e9, name: 'ns' });

  // ---------- playback ----------
  let pos = 1, playing = false, raf = 0, last = 0;
  function frame(now) {
    if (!playing) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    pos += dt / PLAY[mode];
    if (pos >= 1) { pos = 1; playing = false; }
    draw();
    if (playing) raf = requestAnimationFrame(frame);
  }
  function stop() { playing = false; cancelAnimationFrame(raf); }
  function play() {
    if (reduceMotion) { pos = pos >= 0.999 ? 0.125 : Math.min(1, pos + 0.125); draw(); return; }
    if (pos >= 0.999) pos = 0;
    playing = true; last = performance.now(); raf = requestAnimationFrame(frame); draw();
  }
  $('play').addEventListener('click', () => { if (playing) { stop(); draw(); } else play(); });
  $('restart').addEventListener('click', () => { stop(); pos = 0; draw(); });
  $('time').addEventListener('input', e => { stop(); pos = +e.target.value / 1000; draw(); });
  $('reset-view').addEventListener('click', () => sphere.setView(28 * DEG, 14 * DEG));

  // ---------- the pictures for one moment ----------
  function sphereScene(f, t) {
    const m = at(0, f), H = run.field(t), Hn = Math.hypot(...H);
    const scene = { mags: [], torques: [] };
    if (mode === 'write') {
      [['sel', 0, 3.4], ['row', 1, 2.4], ['col', 2, 2.4]].forEach(([k, j, w]) => scene.mags.push({ v: at(j, f), color: CLS[k], width: w, trail: path(j, f, 3200), trailWidth: j ? 1.6 : 2.2 }));
      scene.mags.reverse();
      scene.easy = ORANGE;
    } else {
      scene.mags.push({ v: m, color: INK, trail: path(0, f), trailColor: RED, start: run.m0 });
      if (mode === 'switch') scene.easy = ORANGE;
    }
    if (Hn > 0) scene.field = { n: H.map(v => v / Hn), size: mode === 'write' ? Math.max(0.35, Math.hypot(S.hx, S.he) / 1.2) : clamp(0.4 + 0.6 * Hn / 1e6, 0.4, 1), color: GREEN };
    // the two parts of dm/dt at the tip, on one scale for the whole run, so their lengths show how fast m moves
    const P = L.parts(m, L.heff(m, H, run.K), run.a), k = 0.75 / (L.GAMMA * run.Href);
    scene.torques.push({ from: m, d: P.prec.map(v => v * k), color: BLUE });
    if (run.a > 0) scene.torques.push({ from: m, d: P.damp.map(v => v * k), color: BERRY });
    return scene;
  }
  function drawLand(f, t) {
    const m = at(0, f), th = Math.acos(clamp(m[2], -1, 1)) / Math.PI, th0 = Math.acos(clamp(run.m0[2], -1, 1)) / Math.PI;
    const xs = range(-0.15, 1.15, 260);
    const LA = [];
    let E, Eon, yr;
    if (mode === 'switch') {
      const h = run.field(t)[2] / run.hk, hOn = S.H3 / run.hk;
      E = x => Math.sin(Math.PI * x) ** 2 - 2 * h * Math.cos(Math.PI * x);
      Eon = x => Math.sin(Math.PI * x) ** 2 - 2 * hOn * Math.cos(Math.PI * x);
      const ys = xs.map(Eon), y0 = xs.map(x => Math.sin(Math.PI * x) ** 2);
      yr = [Math.min(...ys, ...y0) - 0.25, Math.max(...ys, ...y0) + 0.25];
      if (h !== hOn) LA.push({ type: 'line', x: xs, y: ys, color: '#e8a3a3', width: 2, dash: [5, 4] });
      land.opts.yLabel = 'Energy E/Keff';
    } else {
      E = x => -Math.cos(Math.PI * x);
      yr = [-1.25, 1.25];
      land.opts.yLabel = 'Energy E/μ0MSH';
    }
    land.opts.xLabel = 'Angle from +z, θ/π';
    land.setRange([-0.15, 1.15], yr);
    LA.push({ type: 'line', x: xs, y: xs.map(E), color: RED, width: 4 });
    LA.push({ type: 'dots', x: [th0], y: [E(th0)], color: GREEN, r: 6.5 }, { type: 'dots', x: [th0], y: [E(th0)], color: '#fff', r: 4.5 });
    LA.push({ type: 'dots', x: [th], y: [E(th)], color: INK, r: 7.5 });
    land.draw(LA);
  }
  function cursor(t, u) { return { type: 'vline', x: t * u.s, color: INK, width: 1, dash: [3, 3] }; }
  function upto(j, comp, f, u) {
    const i = Math.floor(f), xs = [], ys = [], arr = run.mags[j][comp];
    for (let k = 0; k <= i; k++) { xs.push(run.t[k] * u.s); ys.push(arr[k]); }
    const m = at(j, f); xs.push(f / run.n * run.T * u.s); ys.push(m['xyz'.indexOf(comp)]);
    return { x: xs, y: ys };
  }

  function draw() {
    const f = pos * run.n, t = pos * run.T, u = unit();
    sphere.draw(sphereScene(f, t));
    if (mode === 'write') drawArray(f, t); else drawLand(f, t);
    if (mode === 'prec') plotsPrec(f, t, u); else if (mode === 'damp') plotsDamp(f, t, u); else if (mode === 'switch') plotsSwitch(f, t, u); else plotsWrite(f, t, u);
    $('time').value = Math.round(pos * 1000);
    const txt = `t = ${(t * u.s).toFixed(t * u.s >= 100 ? 0 : t * u.s >= 10 ? 1 : 2)} ${u.name}`;
    $('time-out').textContent = txt; $('time').setAttribute('aria-valuetext', `${txt} of ${(run.T * u.s).toFixed(run.T * u.s >= 100 ? 0 : 2)} ${u.name}`);
    $('play').textContent = playing ? '❚❚ Pause' : pos >= 0.999 ? '▶ Play again' : '▶ Play';
    $('info').setAttribute('aria-live', playing ? 'off' : 'polite');
  }

  // ---------- 1. Precession ----------
  function staticPrec() {
    const f = L.fGHz(S.H), mu0H = L.MU0 * S.H, c = Math.cos(S.th0 * DEG);
    stats([
      ['Precession frequency', `${fixed(f, 2)} GHz`, `γH/2π: 28.0 GHz per tesla × μ_0H = ${fixed(mu0H, 3)} T`],
      ['One turn takes', fmtT(1e-9 / f), 'the Larmor period'],
      ['Cone angle θ', `${S.th0}°`, 'fixed: nothing pulls m toward H'],
      ['Energy E/μ_0M_SH', fixed(-c, 3), 'constant: the torque does no work'],
    ]);
    setHTML($('dg-title'), 'The magnetization, and its energy');
    put('dg-cap', 'Left: every direction of m is a point on a sphere (drag to turn it). The green arrow is the field; red is the path of the tip of m; the blue arrow at the tip is dm/dt, all of it around the field. Right: the energy E = −μ_0M_SH cos θ against the angle from the field, as in the video; the ball is the magnetization, the open circle where it started.');
    legend('dg-legend', [[INK, '', 'm'], [RED, '', 'path of m'], [GREEN, '', 'field H'], [BLUE, '', 'dm/dt: around H']]);
    setHTML($('info'), `<b>The magnetization circles the field ${fixed(f, 2)} times per nanosecond</b>, on a cone of ${S.th0}°. ${S.th0 > 90 ? 'Even pointing mostly against the field, it never turns toward it: without damping the ball cannot roll down.' : 'Its angle to the field never changes, so neither does its energy: the ball sits still on the curve.'}`);
    setHTML($('takeaway'), '<b>Precession is how a spin answers a torque.</b> The magnetization is angular momentum, so a torque turns it sideways, the way gravity makes a tilted top precess instead of falling over. The 28 GHz per tesla of this motion sets the gigahertz clock of all magnetization dynamics.');
  }
  function plotsPrec(f, t, u) {
    reset(plotA);
    plotA.opts.xLabel = `Time (${u.name})`; plotA.opts.yLabel = 'Components of m'; plotA.opts.zeroLine = true;
    plotA.setRange([0, run.T * u.s], [-1.1, 1.1]);
    const X = upto(0, 'x', f, u), Y = upto(0, 'y', f, u), Z = upto(0, 'z', f, u);
    plotA.draw([
      { type: 'line', x: X.x, y: X.y, color: BLUE, width: 2 }, { type: 'line', x: Y.x, y: Y.y, color: AMBER, width: 2 }, { type: 'line', x: Z.x, y: Z.y, color: INK, width: 2.6 },
      cursor(t, u),
    ]);
    setHTML($('pa-title'), 'The three components of m');
    put('pa-cap', 'm_x and m_y swing back and forth a quarter turn apart as m goes round; m_z, its projection on the field, stays put.');
    legend('pa-legend', [[BLUE, '', 'm_x'], [AMBER, '', 'm_y'], [INK, '', 'm_z']]);
    reset(plotB);
    const Hs = range(0, 10, 50), fs = Hs.map(h => L.fGHz(h * 1e5));
    plotB.opts.xLabel = 'Field H (10⁵ A/m)'; plotB.opts.yLabel = 'Frequency (GHz)';
    plotB.setRange([0, 10], [0, 37]);
    plotB.draw([{ type: 'line', x: Hs, y: fs, color: BLUE, width: 2.4 }, { type: 'dots', x: [S.H / 1e5], y: [L.fGHz(S.H)], color: INK, r: 5 }]);
    setHTML($('pb-title'), 'Faster in a stronger field');
    put('pb-cap', `The precession frequency f = γH/2π is proportional to the field: 3.52 GHz at 10⁵ A/m. The dot is this field. The cone angle does not enter.`);
    legend('pb-legend', [[BLUE, '', 'f = γH/2π'], [INK, 'swatch--stem', 'this field']]);
  }

  // ---------- 2. Damping ----------
  function staticDamp() {
    const a = S.a2, f = L.fGHz(S.H), fd = f / (1 + a * a), tau = L.tau(S.H, a), turns = fd * 1e9 * run.tset;
    stats([
      ['Precession frequency', `${fixed(fd, fd < 1 ? 3 : 2)} GHz`, `γH/2π(1 + α²): ${fixed(100 / (1 + a * a), 1)}% of the undamped ${fixed(f, 2)} GHz`],
      ['Relaxation time τ', fmtT(tau), '(1 + α²)/αγH: tan(θ/2) falls e-fold each τ'],
      ['Turns per τ', fixed(1 / (2 * Math.PI * a), 1 / (2 * Math.PI * a) < 1 ? 3 : 2), '1/2πα, whatever the field'],
      ['Within 1° of H after', fmtT(run.tset), `${fixed(turns, turns < 1 ? 2 : 1)} turns from θ_0 = ${S.th0}°`],
    ]);
    setHTML($('dg-title'), 'The magnetization spirals in');
    put('dg-cap', 'Left: the blue arrow is the part of dm/dt that goes around the field, the berry one the part that points toward it, drawn on the same scale; their ratio is α. Right: the damping lets the ball roll down the energy curve to the bottom, θ = 0.');
    legend('dg-legend', [[INK, '', 'm'], [RED, '', 'path of m'], [GREEN, '', 'field H'], [BLUE, '', 'dm/dt: around H'], [BERRY, '', 'dm/dt: toward H']]);
    const regime = a < 0.3 ? `<b>Lightly damped:</b> each relaxation time lasts ${fixed(1 / (2 * Math.PI * a), 1)} turns, so the magnetization spirals in slowly, many turns at almost the undamped frequency.`
      : a <= 3 ? `<b>Near the fastest damping:</b> at α = 1 the two parts of the motion are equal and the cone closes in the least time, τ = 2/γH.`
      : `<b>Overdamped:</b> the precession has almost stopped, ${fixed(100 / (1 + a * a), 1)}% of its undamped rate, and the magnetization creeps straight toward the field. More damping makes it slower, not faster.`;
    setHTML($('info'), regime);
    setHTML($('takeaway'), '<b>Damping is where the energy goes.</b> The Gilbert term stands for every way a precessing magnetization loses energy, to lattice vibrations and conduction electrons through spin–orbit coupling. It is what lets a magnet settle at all, and it sets how fast a bit can be switched.');
  }
  function plotsDamp(f, t, u) {
    reset(plotA);
    plotA.opts.xLabel = `Time (${u.name})`; plotA.opts.yLabel = 'Components of m'; plotA.opts.zeroLine = true;
    plotA.setRange([0, run.T * u.s], [-1.1, 1.1]);
    const ts = range(0, run.T, 300), an = ts.map(x => L.mzRelax(x, S.H, S.a2, S.th0 * DEG));
    const X = upto(0, 'x', f, u), Z = upto(0, 'z', f, u);
    plotA.draw([
      { type: 'line', x: X.x, y: X.y, color: BLUE, width: 1.6 },
      { type: 'line', x: ts.map(x => x * u.s), y: an, color: GREEN, width: 1.6, dash: [6, 4] },
      { type: 'line', x: Z.x, y: Z.y, color: INK, width: 2.6 },
      cursor(t, u),
    ]);
    setHTML($('pa-title'), 'm_z climbs to 1, m_x rings down'.replace('m_z', 'm<sub>z</sub>').replace('m_x', 'm<sub>x</sub>'));
    put('pa-cap', 'Black: m_z from the simulation. Green dashed: the exact solution m_z = tanh(t/τ + tanh⁻¹cos θ_0); they lie on top of each other. Blue: m_x, the precession dying away.');
    legend('pa-legend', [[INK, '', 'm_z (simulated)'], [GREEN, 'swatch--dash', 'm_z (formula)'], [BLUE, '', 'm_x']]);
    reset(plotB);
    const ls = range(-2, 1, 120), taus = ls.map(l => Math.log10(L.tau(S.H, Math.pow(10, l)) * 1e12));
    plotB.opts.xLabel = 'Damping constant α'; plotB.opts.yLabel = 'Relaxation time τ (ps)';
    plotB.opts.xTickValues = [-2, -1, 0, 1]; plotB.opts.xFormat = v => ['0.01', '0.1', '1', '10'][v + 2];
    const lo = Math.floor(Math.min(...taus)), hi = Math.ceil(Math.max(...taus));
    plotB.opts.yFormat = v => { if (Math.abs(v - Math.round(v)) > 1e-6) return ''; const k = Math.round(v); return k <= 3 ? String(Math.pow(10, k)) : `10${String(k).split('').map(c => SUP[c]).join('')}`; };
    plotB.setRange([-2, 1], [lo, hi]);
    plotB.draw([
      { type: 'vline', x: 0, color: GREEN, width: 1.2, dash: [5, 4], label: 'fastest, α = 1' },
      { type: 'line', x: ls, y: taus, color: BERRY, width: 2.4 },
      { type: 'dots', x: [Math.log10(S.a2)], y: [Math.log10(L.tau(S.H, S.a2) * 1e12)], color: INK, r: 5 },
    ]);
    setHTML($('pb-title'), 'More damping is not always faster');
    put('pb-cap', `τ = (1 + α²)/αγH at this field, on log scales. It is smallest at α = 1, and the same for α and 1/α: heavy damping slows the whole motion down.`);
    legend('pb-legend', [[BERRY, '', 'τ against α'], [INK, 'swatch--stem', 'this α']]);
  }

  // ---------- 3. Switching a bit ----------
  function staticSwitch() {
    const hk = run.hk, h = S.H3 / hk, dE = L.barrier(S.H3, S.K), up = run.final[0] > 0, tp = run.tp;
    const swOK = isFinite(run.tc) && run.tc <= tp;
    stats([
      ['Anisotropy field H_K', fmtH(hk), `2K_{eff}/μ_0M_S; μ_0H_K = ${fixed(L.MU0 * hk, 2)} T`],
      ['Field ratio h = H/H_K', fixed(h, 2), h >= 1 ? 'above 1: the down well is gone' : 'below 1: the down well survives'],
      ['Barrier holding it down', dE > 0 ? `${sci(dE)} J/m³` : '0', dE > 0 ? `(1 − h)² K_{eff}, ${fixed(100 * (1 - h) * (1 - h), 0)}% of K_{eff}` : 'nothing holds it down'],
      ['Time to the equator', isFinite(run.tc) ? fmtT(run.tc) : 'never', isFinite(run.tc) ? (swOK ? `from a ${S.tilt}° tilt, with the field on` : `but the pulse ends at ${fmtT(tp)}`) : 'with this field it never gets there'],
    ]);
    setHTML($('dg-title'), up ? 'The bit flips from down to up' : 'The bit stays down');
    put('dg-cap', 'Left: the orange arrow is the easy axis, the green one the field (it disappears when the pulse ends). Right: the energy E = K_{eff} sin²θ − μ_0M_SH cos θ in units of K_{eff}, as on the video\'s slides; θ = π is the down state the bit starts in. The dashed curve is the landscape while the field was on.');
    legend('dg-legend', [[INK, '', 'm'], [RED, '', 'path of m'], [GREEN, '', 'field H'], [ORANGE, '', 'easy axis'], [BLUE, '', 'dm/dt: around H_{eff}'], [BERRY, '', 'dm/dt: toward H_{eff}']]);
    let msg;
    if (isFinite(tp) && isFinite(run.tc) && run.tc > tp) msg = `<b>Back to 0.</b> The pulse ended after ${fmtT(tp)} with m<sub>z</sub> = ${fixed(run.uOff, 2)}, still below the equator. With the field off the two wells are equal and the barrier is the equator, so the bit fell back into the down well. It needed ${fmtT(run.tc)}.`;
    else if (up && isFinite(tp)) msg = `<b>Switched, and it stays.</b> The magnetization crossed the equator at ${fmtT(run.tc)}, before the pulse ended at ${fmtT(tp)}; with the field off it settles in the up well and keeps it with no power at all.`;
    else if (up) msg = `<b>Switched.</b> ${h >= 1 ? `The field exceeds H<sub>K</sub>, so the down state is no longer a well: the magnetization spirals away from it, slowly at first, crosses the equator at ${fmtT(run.tc)} and settles up the axis.` : `The field is below H<sub>K</sub>, but the bit started ${S.tilt}° off the axis, already past the top of the barrier (at θ = ${fixed(180 - Math.acos(h) / DEG, 0)}° from up), so it rolled the other way.`}`;
    else if (S.H3 === 0) msg = '<b>No field, no switching.</b> The bit rings and settles back to the bottom of its own well: this is the stable 0 of the memory.';
    else msg = `<b>The barrier holds.</b> h = ${fixed(h, 2)} is below 1, so the down state is still a well, ${fixed(100 * (1 - h) * (1 - h), 0)}% as deep as with no field. The magnetization wobbles and settles back down. It needs more than ${fmtH(hk)}.`;
    setHTML($('info'), msg);
    setHTML($('takeaway'), '<b>A bit is a double well, and writing it means tilting the wells.</b> The barrier that keeps a bit stable for years, many times k<sub>B</sub>T, is the same barrier the write field has to remove. Stability and easy writing pull in opposite directions: the central trade-off of magnetic memory.');
  }
  function plotsSwitch(f, t, u) {
    reset(plotA);
    plotA.opts.xLabel = `Time (${u.name})`; plotA.opts.yLabel = 'mz, along the easy axis'; plotA.opts.zeroLine = true;
    plotA.setRange([0, run.T * u.s], [-1.1, 1.1]);
    const Z = upto(0, 'z', f, u), LA = [];
    LA.push({ type: 'vband', x0: 0, x1: Math.min(run.T, run.tp) * u.s, color: 'rgba(46, 139, 87, 0.10)' });
    if (isFinite(run.tc) && run.tc < run.T) LA.push({ type: 'vline', x: run.tc * u.s, color: GREEN, width: 1.2, dash: [5, 4], label: 'crosses' });
    LA.push({ type: 'line', x: Z.x, y: Z.y, color: INK, width: 2.6 }, cursor(t, u));
    plotA.draw(LA);
    setHTML($('pa-title'), 'From 0 (down) to 1 (up)?');
    put('pa-cap', `m_z against time. Green band: the field is on${isFinite(run.tp) ? ` (a ${fmtT(run.tp)} pulse)` : ''}. The faster wiggles are the precession, which speeds up and slows down as the effective field H + H_Km_z changes.`);
    legend('pa-legend', [[INK, '', 'm_z'], ['rgba(46, 139, 87, 0.45)', 'swatch--area', 'field on']]);
    reset(plotB);
    const hk = run.hk, u0 = -Math.cos(S.tilt * DEG), Hs = range(0, 10, 400);
    const ts = Hs.map(h => { const H = h * 1e5; return H + hk * u0 > 0 ? L.tAxis(H, S.K, S.a3, u0, 0) * 1e9 : NaN; });
    const fin = ts.filter(Number.isFinite);
    let ymax = fin.length ? Math.min(30, 2.5 * Math.min(...fin) + 0.5) : 2;
    if (isFinite(run.tc)) ymax = Math.min(30, Math.max(ymax, run.tc * 1e9 * 1.15));
    plotB.opts.xLabel = 'Field H (10⁵ A/m)'; plotB.opts.yLabel = 'Time to switch (ns)';
    plotB.setRange([0, 10], [0, ymax]);
    const LB = [{ type: 'vline', x: hk / 1e5, color: ORANGE, width: 1.4, dash: [5, 4], label: 'HK' }];
    LB.push({ type: 'line', x: Hs, y: ts.map(v => (v > ymax * 1.5 ? NaN : v)), color: BLUE, width: 2.4 });
    if (isFinite(run.tc)) LB.push({ type: 'dots', x: [S.H3 / 1e5], y: [run.tc * 1e9], color: INK, r: 5 });
    plotB.draw(LB);
    setHTML($('pb-title'), 'Just above H<sub>K</sub>, switching is slow');
    put('pb-cap', `Time to reach the equator against the field, from a ${S.tilt}° tilt, with this K_{eff} and α. Below H_K (orange) it never switches; just above, the time diverges, because the torque on a bit near its axis is tiny.`);
    legend('pb-legend', [[BLUE, '', 'time to the equator'], [ORANGE, 'swatch--dash', 'H_K'], [INK, 'swatch--stem', 'this field']]);
  }

  // ---------- 4. Writing MRAM ----------
  const SEL = [1, 1];
  function outcome(j) { return run.final[j] > 0; }
  function staticWrite() {
    const hk = run.hk, as = L.astroid(S.hx, S.he), sel = outcome(0), row = outcome(1), col = outcome(2);
    const mA = h => fixed(2 * 100e-9 * h * hk * 1e3, 0);
    const colHard = S.hx >= 1;
    stats([
      ['Selected bit', sel ? 'Switched to 1' : 'Still 0', `fields (${fixed(S.hx, 2)}, ${fixed(S.he, 2)}) H_K: ${as > 1 ? 'outside' : 'inside'} the astroid`],
      ['Bits on its word line', row ? 'Flipped: error' : 'Kept 0', `H_e = ${fixed(S.he, 2)} H_K on its own`],
      ['Bits on its bit line', colHard ? (col ? 'Flipped: error' : 'Kept 0, by luck') : col ? 'Flipped: error' : 'Kept 0', colHard ? 'pulled onto the hard axis; could fall either way' : `H_x = ${fixed(S.hx, 2)} H_K on its own`],
      ['Current per line', `${mA(S.he)} mA, ${mA(S.hx)} mA`, 'word line, bit line, if 100 nm wide (H ≈ I/2w)'],
    ]);
    setHTML($('dg-title'), 'Writing the middle bit of a 3 × 3 array');
    put('dg-cap', 'Left: the selected bit (blue), one on the same word line (teal) and one on the same bit line (purple), all starting down, with the field the selected bit feels (green). Right: the array from above; each bit\'s arrow shows its magnetization, with the easy axis drawn vertical.');
    legend('dg-legend', [[CLS.sel, '', 'selected bit'], [CLS.row, '', 'same word line'], [CLS.col, '', 'same bit line'], [GREEN, '', 'field on the selected bit'], [ORANGE, '', 'easy axis']]);
    let msg;
    const ok = sel && !row && !col;
    if (ok) msg = `<b>Written.</b> Only the selected bit flipped: together the two fields put it outside the astroid (${fixed(as, 2)} &gt; 1), while each neighbour feels one field only, inside it.`;
    else if (!sel && !row && !col) msg = as > 1 ? `<b>Nothing written.</b> The fields put the selected bit just outside the astroid (${fixed(as, 2)}), but so close to its edge that the old state hardly moves, and it did not escape before the pulse ended.${S.hx === 0 ? ' With no hard-axis field the torque on a bit pointing straight down is almost zero.' : ''}` : `<b>Nothing written.</b> The selected bit is inside the astroid (${fixed(as, 2)} &lt; 1): its down state survives, so it tilts and comes back.${as > 0.96 ? ' It is close to the edge: with less damping the ringing can carry it over even here.' : ''}`;
    else {
      const bad = [row ? 'the bits on its word line' : '', col ? 'the bits on its bit line' : ''].filter(Boolean).join(' and ');
      msg = `<b>Write error:</b> ${bad} flipped too. ${row ? `H<sub>e</sub> on its own exceeds H<sub>K</sub>, so every bit on that word line is outside the astroid.` : ''} ${col ? (colHard ? 'H<sub>x</sub> on its own exceeds H<sub>K</sub>: it drags those bits onto the hard axis, and when it is removed they fall either way.' : 'The ringing of the field ramp carried them over the barrier.') : ''}${sel ? '' : ' And the selected bit did not switch.'}`;
    }
    setHTML($('info'), msg);
    setHTML($('takeaway'), '<b>A cross-point array writes by coincidence:</b> one line\'s field must be too weak on its own, both together strong enough. The window is narrow, and the spread of H<sub>K</sub> from bit to bit narrows it further. Worse, a nanoscale bit needs tens of milliamps of line current. That is why newer MRAMs pass a current through the bit itself and switch it with a spin torque, the extra term N in the generalized LLG equation at the end of the video.');
  }
  function drawArray(f, t) {
    const ms = [0, 1, 2].map(j => at(j, f)), bits = [];
    for (let r = 0; r < 3; r++) {
      bits.push([]);
      for (let c = 0; c < 3; c++) {
        const j = r === SEL[0] && c === SEL[1] ? 0 : r === SEL[0] ? 1 : c === SEL[1] ? 2 : -1;
        const m = j < 0 ? run.m0 : ms[j];
        bits[r].push({ mx: m[0], mz: m[2] });
      }
    }
    const e = env(t);
    $('array').innerHTML = V.mram({ he: S.he * e, hx: S.hx * e, sel: SEL, bits, colors: CLS });
  }
  function plotsWrite(f, t, u) {
    reset(plotA);
    plotA.opts.xLabel = 'Hard-axis field Hx / HK'; plotA.opts.yLabel = 'Easy-axis field He / HK';
    plotA.opts.xTicks = 5;
    plotA.setRange([0, 1.25], [0, 1.25]);
    const ps = range(0, Math.PI / 2, 120), ax = ps.map(p => Math.cos(p) ** 3), ay = ps.map(p => Math.sin(p) ** 3);
    const e = env(t), LA = [];
    LA.push({ type: 'poly', x: [...ax, 0, 1.25, 1.25], y: [...ay, 1.25, 1.25, 0], fill: 'rgba(31, 78, 168, 0.07)' });
    LA.push({ type: 'line', x: ax, y: ay, color: INK, width: 2.2 });
    LA.push({ type: 'text', x: 0.24, y: 0.2, text: 'keeps its state', color: '#5f7382', align: 'center' });
    LA.push({ type: 'text', x: 0.92, y: 1.17, text: 'one well: switches', color: CLS.sel, align: 'center' });
    const pts = [[S.hx, S.he, CLS.sel], [0, S.he, CLS.row], [S.hx, 0, CLS.col]];
    pts.forEach(([x, y, c]) => LA.push({ type: 'line', x: [0, x], y: [0, y], color: c, width: 1, dash: [3, 3] }));
    pts.forEach(([x, y, c]) => LA.push({ type: 'dots', x: [x], y: [y], color: c, r: 7 }, { type: 'dots', x: [x], y: [y], color: '#fff', r: 4.8 }));
    pts.forEach(([x, y, c]) => { if (e > 0) LA.push({ type: 'dots', x: [x * e], y: [y * e], color: c, r: 5 }); });
    plotA.draw(LA);
    setHTML($('pa-title'), 'The Stoner–Wohlfarth astroid');
    put('pa-cap', 'Fields that leave a bit with both its wells lie inside the curve; outside it, only the well along the field is left. Rings: the full field each kind of bit feels while the currents are on. Dots: the field right now, moving out along the dashed lines as the currents ramp up.');
    legend('pa-legend', [[CLS.sel, 'swatch--stem', 'selected'], [CLS.row, 'swatch--stem', 'same word line'], [CLS.col, 'swatch--stem', 'same bit line']]);
    reset(plotB);
    plotB.opts.xLabel = `Time (${u.name})`; plotB.opts.yLabel = 'mz, along the easy axis'; plotB.opts.zeroLine = true;
    plotB.setRange([0, run.T * u.s], [-1.1, 1.1]);
    const LB = [
      { type: 'vband', x0: 0, x1: TR * u.s, color: 'rgba(46, 139, 87, 0.06)' }, { type: 'vband', x0: TR * u.s, x1: (TR + HOLD) * u.s, color: 'rgba(46, 139, 87, 0.13)' }, { type: 'vband', x0: (TR + HOLD) * u.s, x1: (2 * TR + HOLD) * u.s, color: 'rgba(46, 139, 87, 0.06)' },
    ];
    [[2, CLS.col, 1.8], [1, CLS.row, 1.8], [0, CLS.sel, 2.6]].forEach(([j, c, w]) => { const Z = upto(j, 'z', f, u); LB.push({ type: 'line', x: Z.x, y: Z.y, color: c, width: w }); });
    LB.push(cursor(t, u));
    plotB.draw(LB);
    setHTML($('pb-title'), 'Who flips?');
    put('pb-cap', 'm_z of each kind of bit against time. Green: the currents ramp up over 0.5 ns, hold for 2 ns and ramp down. Bits not on either line feel nothing and stay put.');
    legend('pb-legend', [[CLS.sel, '', 'selected'], [CLS.row, '', 'same word line'], [CLS.col, '', 'same bit line'], ['rgba(46, 139, 87, 0.45)', 'swatch--area', 'currents on']]);
  }

  // ---------- controls ----------
  function syncControls() {
    const set = (id, v, txt) => { $(id).value = v; $(id + '-out').textContent = txt; $(id).setAttribute('aria-valuetext', txt); };
    set('hfield', S.H, fmtH(S.H)); setHTML($('hfield-hint'), rich(`μ_0H = ${fixed(L.MU0 * S.H, 3)} T`));
    set('theta', S.th0, `${S.th0}°`);
    set('alpha', iOfA(S.a2), fmtA(S.a2));
    set('hsw', S.H3, fmtH(S.H3)); setHTML($('hsw-hint'), rich(`μ_0H = ${fixed(L.MU0 * S.H3, 3)} T, or ${fixed(S.H3 / L.HK(S.K), 2)} H_K for this bit`));
    set('tilt', S.tilt, `${S.tilt}°`);
    set('pulse', S.pulse, `${fixed(S.pulse, 2)} ns`); $('hold').checked = S.hold; $('pulse').disabled = S.hold;
    $('pulse-hint').textContent = S.hold ? 'Untick “Leave the field on” to make it a pulse.' : 'The field switches off after this time.';
    set('kani', S.K, `${sci(S.K)} J/m³`); setHTML($('kani-hint'), rich(`H_K = 2K_{eff}/μ_0M_S = ${fmtH(L.HK(S.K))}, with μ_0M_S = 1.6 T`));
    set('alpha3', S.a3, fixed(S.a3, 2));
    set('he', S.he, `${fixed(S.he, 2)} times HK`); set('hx', S.hx, `${fixed(S.hx, 2)} times HK`);
    $('he-out').innerHTML = `${fixed(S.he, 2)} H<sub>K</sub>`; $('hx-out').innerHTML = `${fixed(S.hx, 2)} H<sub>K</sub>`;
    document.querySelectorAll('[data-h]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.h === S.H)));
    document.querySelectorAll('[data-alpha]').forEach(b => b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.alpha / S.a2 - 1) < 1e-9)));
    document.querySelectorAll('[data-hsw]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.hsw === S.H3)));
    document.querySelectorAll('[data-write]').forEach(b => { const [e, x] = b.dataset.write.split(',').map(Number); b.setAttribute('aria-pressed', String(e === S.he && x === S.hx)); });
  }
  function render() {
    syncControls();
    const fresh = compute();
    if (fresh) { if (playing) pos = 0; else if (!keepPos) pos = 1; }
    keepPos = false;
    $('land-box').hidden = mode === 'write'; $('array').hidden = mode !== 'write';
    if (mode === 'prec') staticPrec(); else if (mode === 'damp') staticDamp(); else if (mode === 'switch') staticSwitch(); else staticWrite();
    const sec = PLAY[mode], perNs = sec / (run.T * 1e9);
    $('transport-note').textContent = reduceMotion ? 'Reduced motion is on: each press of Play steps an eighth of the way through the run. Drag the time slider to see any moment.'
      : `Slow motion: ${perNs >= 1 ? `one nanosecond of the magnet's time plays in ${fixed(perNs, perNs >= 10 ? 0 : 1)} s` : `${fixed(1 / perNs, 1)} ns of the magnet's time play each second`}. Drag the time slider to see any moment.`;
    $('plot-a').setAttribute('aria-label', $('pa-title').textContent); $('plot-b').setAttribute('aria-label', $('pb-title').textContent);
    draw();
  }
  let keepPos = false;
  function applyMode() {
    document.querySelectorAll('.tab').forEach(b => { const on = b.dataset.mode === mode; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $('lab').setAttribute('aria-labelledby', 'tab-' + mode);
    document.querySelectorAll('.mode-intro').forEach(el => { el.hidden = el.dataset.for !== mode; });
    document.querySelectorAll('[data-modes]').forEach(el => { el.hidden = !el.dataset.modes.split(' ').includes(mode); });
    render();
  }
  let pending = false;
  const later = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; render(); }); };
  [['hfield', 'H'], ['theta', 'th0'], ['hsw', 'H3'], ['tilt', 'tilt'], ['pulse', 'pulse'], ['kani', 'K'], ['alpha3', 'a3'], ['he', 'he'], ['hx', 'hx']].forEach(([id, key]) =>
    $(id).addEventListener('input', e => { S[key] = +e.target.value; later(); }));
  $('alpha').addEventListener('input', e => { S.a2 = aOf(+e.target.value); later(); });
  $('hold').addEventListener('change', e => { S.hold = e.target.checked; render(); });
  document.querySelector('.controls').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.h) S.H = +d.h;
    else if (d.alpha) S.a2 = +d.alpha;
    else if (d.hsw !== undefined && d.hsw !== '') S.H3 = +d.hsw;
    else if (d.write) { const [e2, x] = d.write.split(',').map(Number); S.he = e2; S.hx = x; }
    else if (b.id === 'video-values') Object.assign(S, START);
    else return;
    render();
  });
  const tabs = Array.from(document.querySelectorAll('.tab'));
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => { stop(); mode = b.dataset.mode; applyMode(); });
    b.addEventListener('keydown', e => {
      const to = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault(); tabs[to].focus(); tabs[to].click();
    });
  });

  // ---------- predict-first loaders: they set up the run and wait at t = 0 for Play ----------
  const QUESTIONS = {
    q1: () => { mode = 'prec'; Object.assign(S, START, { H: 1e5, th0: 30 }); },
    q2: () => { mode = 'prec'; Object.assign(S, START, { H: 1e5, th0: 150 }); },
    q3: () => { mode = 'damp'; Object.assign(S, START, { H: 5e5, th0: 30, a2: 0.1 }); },
    q4: () => { mode = 'damp'; Object.assign(S, START, { H: 5e5, th0: 30, a2: 1 }); },
    q5: () => { mode = 'switch'; Object.assign(S, START, { H3: 1e5 }); },
    q6: () => { mode = 'switch'; Object.assign(S, START, { H3: 6e5 }); },
    q7: () => { mode = 'switch'; Object.assign(S, START, { H3: 6e5, hold: false, pulse: 0.8 }); },
    q8: () => { mode = 'write'; Object.assign(S, START, { he: 0.6, hx: 0.6 }); },
  };
  document.querySelectorAll('.predict__load[data-q]').forEach(b => b.addEventListener('click', () => {
    stop();
    QUESTIONS[b.dataset.q]();
    run = null; pos = 0; keepPos = true;
    applyMode();
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }));

  applyMode();
  window.__llg = { S, render, get run() { return run; }, get pos() { return pos; }, setPos: p => { stop(); pos = p; draw(); } };
})();
