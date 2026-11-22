/* The double slit: controls, the live simulation, animation and plots. The physics is in physics.js. */
(function () {
  'use strict';
  const D = window.DS, L = D.LAMBDA, N = D.N, G = D.G;
  const $ = id => document.getElementById(id);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COUNTS = [1, 3, 10, 30, 100, 300, 1000, 3000, 10000];
  const START = { d: 3, a: 1, open: 'both', cnt: 6, dm: 0, seed: 1 };
  const S = JSON.parse(JSON.stringify(START));
  let mode = 'wave';
  let deep = false;
  try { deep = localStorage.getItem('slit-depth') === 'deep'; } catch (e) { /* storage blocked: start simple */ }
  const INK = '#14232c', BLUE = '#1f6fb4', ORANGE = '#b35900', GREY = '#5f7382', LIGHT = '#c3ced5', VIOLET = '#5b45b0', RED = '#c2372f', WALL = '#3d4b55';
  const LX = (G.screen - G.wall - G.thick) / L;               // screen distance in wavelengths
  const YMAX = (N / 2 - G.edge) / L;                           // the visible half-height, in wavelengths

  // ---------- formatting and page helpers ----------
  const fixed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const pct = x => `${(100 * x).toFixed(1)}%`;
  const trim = v => String(Math.round(v * 100) / 100);
  const sub = t => String(t).replace(/_\{([^}]*)\}|_([A-Za-z0-9])/g, (m, a, b) => `<sub>${a || b}</sub>`);
  const sym = t => `<span class="sym">${t}</span>`;
  const range = (a, b, k) => Array.from({ length: k + 1 }, (_, i) => a + (b - a) * i / k);
  const big = n => n.toLocaleString('en-US').replace(/,/g, ' ');
  function stats(items) {
    $('stats').className = `stats stats--${items.length} stats--steady stats--wrap`;
    $('stats').innerHTML = items.map(([label, value, s2]) => `<div class="stat"><div class="stat__label">${sub(label)}</div><div class="stat__value">${sub(value)}</div><div class="stat__sub">${sub(s2)}</div></div>`).join('');
  }
  function typeset(el) { if (window.MathJax && MathJax.typesetPromise && /\\\(/.test(el.innerHTML)) MathJax.typesetPromise([el]).catch(() => {}); }
  function setHTML(el, html) { if (el.dataset.html === html) return; el.dataset.html = html; el.innerHTML = html; typeset(el); }
  const put = (id, t) => setHTML($(id), sub(t));
  function legend(id, items) { setHTML($(id), items.map(([c, k, l]) => `<li style="color:${c}"><span class="swatch ${k}"></span><span>${sub(l)}</span></li>`).join('')); }
  const alpha = (hex, a) => { const v = parseInt(hex.slice(1), 16); return `rgba(${v >> 16}, ${(v >> 8) & 255}, ${v & 255}, ${a})`; };
  const MARGIN = { l: 58, r: 18, t: 12, b: 42 };
  const field = new NanoPlot($('field'), { margin: { l: 50, r: 10, t: 12, b: 40 }, narrowMargin: { l: 46, r: 8 } });
  const side = new NanoPlot($('side'), { margin: { l: 46, r: 10, t: 12, b: 40 }, narrowMargin: { l: 44, r: 8 } });
  const plotA = new NanoPlot($('plot-a'), { margin: MARGIN, narrowMargin: { l: 56, r: 12 } });
  const plotB = new NanoPlot($('plot-b'), { margin: MARGIN, narrowMargin: { l: 56, r: 12 } });
  const reset = pl => { pl.opts.xTickValues = null; pl.opts.xFormat = null; pl.opts.yFormat = null; pl.opts.zeroLine = false; pl.opts.xTicks = 6; pl.opts.yTicks = 5; };
  const cache = new Map();
  function memo(key, fn) { let v; if (cache.has(key)) { v = cache.get(key); cache.delete(key); } else v = fn(); cache.set(key, v); if (cache.size > 24) cache.delete(cache.keys().next().value); return v; }

  // ---------- the animation: tabs 2 and 3 send their particles; tab 1 replays the simulation ----------
  const LAP = 6, HOLD = 2;
  let animOn = !reduceMotion, animT0 = performance.now(), animRaf = 0, seen = true, frameFn = null, lastF = null;
  const running = () => animOn && !document.hidden && seen && !!frameFn;
  const animFrac = now => Math.max(0, Math.min(1, (((now - animT0) / 1000) % (LAP + HOLD)) / LAP));
  const quant = f => Math.round(f * 300) / 300;
  function tick(now) { animRaf = 0; if (!running()) return; const f = quant(animFrac(now)); if (f !== lastF) { lastF = f; frameFn(f); } animRaf = requestAnimationFrame(tick); }
  function kick() { if (running() && !animRaf) animRaf = requestAnimationFrame(tick); }
  function syncAnim() { $('anim').textContent = animOn ? '❚❚ Pause' : '▶ Animate'; $('anim').setAttribute('aria-pressed', String(animOn)); }
  $('anim').addEventListener('click', () => { animOn = !animOn; if (animOn) animT0 = performance.now(); syncAnim(); if (!animOn && frameFn) { lastF = 1; frameFn(1); } kick(); });
  document.addEventListener('visibilitychange', () => { kick(); work(); });
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { seen = es[0].isIntersecting; kick(); work(); }).observe($('lab'));
  const nowF = () => (running() ? quant(animFrac(performance.now())) : 1);

  // ---------- the screen, sampled finely, and the Huygens pattern on it (tabs 2 and 3, and the comparison in tab 1) ----------
  const YS = range(-YMAX * L, YMAX * L, 832);                 // rows of the screen, in grid steps
  const YL = YS.map(y => y / L);                               // the same, in wavelengths
  const pattern = () => memo(`h|${S.d}|${S.a}|${S.open}`, () => D.huygens(S.d * L, S.a * L, S.open, YS));
  const pattern2 = () => memo(`h|${S.d}|${S.a}|both`, () => D.huygens(S.d * L, S.a * L, 'both', YS));
  // bright stripes: the local maxima of a pattern, in wavelengths
  function peaks(I, ys) { ys = ys || YL; const m = Math.max(...I), out = []; for (let i = 1; i < I.length - 1; i++) if (I[i] > I[i - 1] && I[i] >= I[i + 1] && I[i] > 0.04 * m) out.push(ys[i]); return out; }
  // the central stripe runs between the first minima either side of the middle
  function centralShare(I) {
    let c = 0; YL.forEach((y, i) => { if (Math.abs(y) < Math.abs(YL[c])) c = i; });
    let lo = c, hi = c;
    while (lo > 1 && I[lo - 1] <= I[lo]) lo--;
    while (hi < I.length - 2 && I[hi + 1] <= I[hi]) hi++;
    let tot = 0, cen = 0; I.forEach((v, i) => { tot += v; if (i >= lo && i <= hi) cen += v; });
    return { share: cen / tot, lo: YL[lo], hi: YL[hi] };
  }

  /* ================= 1. The live simulation ================= */
  // the run for the current slits: frames every 8 steps (amplitude and phase as bytes), the screen and the bookkeeping so far
  let run = null;
  const FRAME_EVERY = 8;
  function startRun() {
    const key = `${S.d}|${S.a}|${S.open}`;
    if (run && run.key === key) return;
    const sim = new D.Sim(S.d * L, S.a * L, S.open);
    run = { key, sim, frames: [], done: false, A0: 0 };
    let m = 0; for (let o = 0; o < sim.re.length; o++) m = Math.max(m, sim.re[o] * sim.re[o] + sim.im[o] * sim.im[o]);
    run.A0 = Math.sqrt(m);
    snap();
  }
  function snap() {
    const s = run.sim, n2 = N * N, amp = new Uint8Array(n2), ph = new Uint8Array(n2), k = 3 / run.A0;
    for (let o = 0; o < n2; o++) {
      const r = s.re[o], q = s.im[o], b = Math.min(1, Math.sqrt(r * r + q * q) * k);
      amp[o] = Math.round(255 * Math.pow(b, 0.75));
      ph[o] = Math.round(((Math.atan2(q, r) + Math.PI) / (2 * Math.PI)) * 255);
    }
    const h = s.history[s.history.length - 1];
    run.frames.push({ amp, ph, t: s.t, screen: Float64Array.from(s.screen), beyond: h ? h.right : 0 });
  }
  // when the run is over, the picture to rest on: the moment with the most wave between the wall and the screen
  const showcase = () => run.frames.reduce((b, fr, i) => (fr.beyond > run.frames[b].beyond ? i : b), 0);
  // compute in slices that leave the page responsive; redraw as the run goes, and fully when it is done
  let workRaf = 0, lastDraw = 0;
  function work() {
    if (workRaf || !run || run.done || mode !== 'wave' || document.hidden || !seen) return;
    workRaf = requestAnimationFrame(function slice() {
      workRaf = 0;
      if (!run || run.done || mode !== 'wave') return;
      const t0 = performance.now();
      while (performance.now() - t0 < 22 && run.sim.steps < D.STEPS) { run.sim.step(); if (run.sim.steps % FRAME_EVERY === 0) snap(); }
      if (run.sim.steps >= D.STEPS) { run.done = true; renderWave(); return; }
      if (performance.now() - lastDraw > 120) { lastDraw = performance.now(); waveFrame(1, true); waveTables(); }
      work();
    });
  }
  // colour the field: brightness from the amplitude; in "Go deeper", hue from the phase (wavefronts show as colour bands)
  const img = document.createElement('canvas'); img.width = N; img.height = N;
  const ictx = img.getContext('2d'), idata = ictx.createImageData(N, N);
  const VIO = [91, 69, 176], DARK = [36, 22, 92];
  function hue(h) { const k = n => (n + h * 6) % 6, f = n => 1 - Math.max(0, Math.min(k(n), 4 - k(n), 1)); return [f(5), f(3), f(1)]; }
  const HUES = Array.from({ length: 256 }, (_, i) => hue(i / 256).map(v => Math.round(40 + 175 * v)));
  function paint(fr) {
    const px = idata.data;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const o = j * N + i, p = 4 * ((N - 1 - j) * N + i), b = fr.amp[o] / 255;
      let r, g, bl;
      if (!deep) {
        const t = Math.min(1, b * 1.15), c = t < 0.7 ? VIO.map(v => 255 + (v - 255) * t / 0.7) : VIO.map((v, q) => v + (DARK[q] - v) * (t - 0.7) / 0.3);
        r = c[0]; g = c[1]; bl = c[2];
      } else { const c = HUES[fr.ph[o]]; r = 255 + (c[0] - 255) * b; g = 255 + (c[1] - 255) * b; bl = 255 + (c[2] - 255) * b; }
      px[p] = r; px[p + 1] = g; px[p + 2] = bl; px[p + 3] = 255;
    }
    ictx.putImageData(idata, 0, 0);
  }
  function wallLayers() {
    const out = [], x0 = G.wall / L, x1 = (G.wall + G.thick) / L, S2 = D.slits(S.d * L, S.a * L, S.open).map(s => [(s.y - s.a / 2) / L, (s.y + s.a / 2) / L]).sort((p, q) => p[0] - q[0]);
    // solid wall everywhere except the open slits (a closed slit is part of the wall)
    let y = -N / 2 / L;
    S2.forEach(([lo, hi]) => { out.push({ type: 'poly', x: [x0, x1, x1, x0], y: [y, y, lo, lo], fill: WALL, color: WALL }); y = hi; });
    out.push({ type: 'poly', x: [x0, x1, x1, x0], y: [y, y, N / 2 / L, N / 2 / L], fill: WALL, color: WALL });
    out.push({ type: 'vline', x: G.screen / L, color: ORANGE, width: 1.6, dash: [5, 4] });
    return out;
  }
  function screenCurve(scr) {
    // the screen's record so far, on the visible rows, scaled to its own largest value
    const ys = [], vs = [];
    for (let j = G.edge; j < N - G.edge; j++) { ys.push(D.rowY(j) / L); vs.push(scr[j]); }
    const m = Math.max(...vs, 1e-30);
    return { ys, vs: vs.map(v => v / m) };
  }
  function waveFrame(f, live) {
    if (!run) return;
    const rest = run.done && f >= 1 && !live;
    const fr = live || !run.done ? run.frames[run.frames.length - 1] : rest ? run.frames[showcase()] : run.frames[Math.round(f * (run.frames.length - 1))];
    const rec = rest ? run.frames[run.frames.length - 1].screen : fr.screen;
    paint(fr);
    const layers = [{ type: 'image', canvas: img, x0: 0, x1: N / L, y0: -N / 2 / L, y1: N / 2 / L, smooth: true }].concat(wallLayers());
    layers.push({ type: 'text', x: G.edge / L + 0.3, y: YMAX - 0.4, text: run.done ? `t = ${fixed(fr.t / (L / D.K0), 1)} λ/v` : `computing: ${Math.round(100 * run.sim.steps / D.STEPS)}%`, align: 'left', size: 11.5, color: VIOLET });
    field.opts.xLabel = 'x (wavelengths)'; field.opts.yLabel = 'y (wavelengths)'; field.opts.yFormat = null; field.opts.xTickValues = null;
    field.setRange([G.edge / L, (N - G.edge) / L], [-YMAX, YMAX]);
    field.draw(layers);
    // the screen: what it has recorded up to this moment, against Huygens' prediction
    const sc = screenCurve(rec), H = pattern(), hm = Math.max(...H.I);
    side.opts.xLabel = rest ? 'Recorded on the screen: all of it' : 'Recorded on the screen so far'; side.opts.yLabel = 'y (wavelengths)'; side.opts.xTickValues = [0, 0.5, 1]; side.opts.xFormat = v => (v === 0 ? '0' : v === 1 ? 'max' : '');
    side.setRange([0, 1.12], [-YMAX, YMAX]);
    const poly = { type: 'poly', x: [0].concat(sc.vs, [0]), y: [sc.ys[0]].concat(sc.ys, [sc.ys[sc.ys.length - 1]]), fill: alpha(ORANGE, 0.25), color: ORANGE, width: 1.6 };
    side.draw([poly, { type: 'line', x: Array.from(H.I, v => v / hm), y: YL, color: INK, width: 1.4, dash: [4, 3] }]);
    // plot B: the moment on the bookkeeping
    if (run.done && plotB.layers && view1) plotB.draw(view1.pb.concat([{ type: 'vline', x: fr.t / (L / D.K0), color: VIOLET, width: 1.4, dash: [3, 3] }]));
  }
  let view1 = null;
  // plots A and B and the numbers, from the run so far
  function waveTables() {
    const sim = run.sim, H = pattern(), sc = screenCurve(sim.screen);
    // plot A: the screen pattern, simulated and predicted, each scaled to its largest value
    reset(plotA);
    plotA.opts.xLabel = 'Position on the screen, y (wavelengths)'; plotA.opts.yLabel = 'Brightness on the screen';
    plotA.setRange([-YMAX, YMAX], [0, 1.1]);
    const hm = Math.max(...H.I);
    plotA.draw([{ type: 'line', x: YL, y: Array.from(H.I, v => v / hm), color: INK, width: 1.6, dash: [5, 4] }, { type: 'line', x: sc.ys, y: sc.vs, color: ORANGE, width: 2.4 }]);
    // plot B: where the probability is: still on the near side of the wall, and through the slits
    reset(plotB);
    const T = L / D.K0, hs = sim.history;
    plotB.opts.xLabel = 'Time (time to travel one wavelength)'; plotB.opts.yLabel = 'Probability';
    plotB.setRange([0, G.tEnd / T], [0, 1.02]);
    const pb = [
      { type: 'line', x: hs.map(h => h.t / T), y: hs.map(h => h.back), color: GREY, width: 2, dash: [6, 4] },
      { type: 'line', x: hs.map(h => h.t / T), y: hs.map(h => h.through), color: BLUE, width: 2.4 },
    ];
    view1 = { pb };
    plotB.draw(pb);
    const pk = peaks(H.I), last = hs.length ? hs[hs.length - 1] : { through: 0 };
    const spacingH = pk.length > 1 ? Math.min(...pk.filter(y => y > 0.05)) : NaN;
    const done = run.done, open2 = S.open === 'both';
    const skPeaks = done ? peaks(sc.vs, sc.ys) : [];
    const spacingS = skPeaks.filter(y => y > 0.05).length ? Math.min(...skPeaks.filter(y => y > 0.05)) : NaN;
    if (!deep) stats([
      ['Slit spacing', `${trim(S.d)} λ`, `slit width ${trim(S.a)} λ`],
      ['Through the slits', done ? pct(last.through) : '…', done ? 'the rest bounces off the wall' : `computing: ${Math.round(100 * sim.steps / D.STEPS)}%`],
      ['First side stripe, Huygens', open2 ? `${fixed(spacingH, 2)} λ` : 'no stripes', open2 ? `rule of thumb λL/d = ${fixed(LX / S.d, 2)} λ` : 'one slit: a single hump'],
      ['First side stripe, simulated', done ? (open2 && Number.isFinite(spacingS) ? `${fixed(spacingS, 2)} λ` : 'no stripes') : '…', done ? 'from the screen\'s record' : 'waiting for the run'],
    ]);
    else stats([
      [sym('λL/d'), `${fixed(LX / S.d, 3)} λ`, `L = ${fixed(LX, 2)} λ from the wall to the screen`],
      ['Transmitted probability', done ? fixed(last.through, 4) : '…', done ? `reflected ${fixed(last.back, 4)}; sum ${fixed(last.through + last.back, 4)}` : `${sim.steps} of ${D.STEPS} steps`],
      ['First side stripe, Huygens', open2 ? `${fixed(spacingH, 3)} λ` : '—', 'wavelets from every point of the open slits'],
      ['Grid', `${N} × ${N}`, `Δt = ${G.dt}, V₀ = ${G.V0}, λ = ${L} grid steps`],
    ]);
    $('field').setAttribute('aria-label', `The wave packet meeting ${open2 ? 'two slits' : 'one slit'} ${trim(S.d)} wavelengths apart; ${done ? `${pct(last.through)} of it gets through` : 'the simulation is running'}`);
    $('side').setAttribute('aria-label', open2 ? `The screen records stripes about ${fixed(spacingH, 2)} wavelengths apart` : 'The screen records a single broad hump');
  }
  function renderWave() {
    startRun();
    const open2 = S.open === 'both';
    setHTML($('dg-title'), open2 ? 'A wave packet meets two slits' : `A wave packet meets one slit (the ${S.open} one)`);
    put('dg-cap', deep
      ? 'Left: the wavefunction, coloured by its phase (the colour bands are wavefronts) and shaded by |ψ|; the wall is dark grey, the screen dashed orange. Right: ∫|ψ|² dt along the screen so far (orange), against the Huygens prediction (dashed). The edges of the grid absorb whatever reaches them.'
      : 'Left: the wave packet, darker where it is stronger, meeting the wall (dark grey). The dashed orange line is the screen. Right: what the screen has recorded so far (orange), against the prediction from Huygens\' wavelets (dashed). The edges absorb the wave, as if the space went on.');
    legend('dg-legend', [[VIOLET, 'swatch--area', deep ? 'the wave (hue: phase)' : 'the wave'], [WALL, 'swatch--area', 'the wall'], [ORANGE, 'swatch--dash', 'the screen and its record'], [INK, 'swatch--dash', 'Huygens prediction']]);
    setHTML($('pa-title'), 'The pattern on the screen');
    put('pa-cap', deep
      ? 'The time-integrated |ψ|² along the screen (orange), against the sum of Huygens wavelets e^{ikr}/√r from both slits, averaged over the packet\'s spread of wavelengths (dashed), each scaled to its own peak. The Huygens sum lights each slit evenly, Kirchhoff\'s approximation; in a slit only a wavelength or so wide the real wave is strongest in the middle, so it spreads wider and the outer stripes come out brighter.'
      : 'What the screen records once the packet has gone by (orange), against the prediction from Huygens\' wavelets (dashed): bright where the waves from the two slits arrive in step. The stripes sit in the same places; the simulation\'s outer ones are brighter, because a slit only a wavelength wide spreads the wave a little wider than the simple Huygens picture assumes.');
    legend('pa-legend', [[ORANGE, '', 'simulation'], [INK, 'swatch--dash', 'Huygens prediction']]);
    setHTML($('pb-title'), 'How much gets through');
    put('pb-cap', 'The probability of finding the particle beyond the wall (blue), including what has passed the screen and been absorbed, against the probability that stayed on the near side, mostly bounced back (grey).');
    legend('pb-legend', [[BLUE, '', 'through the slits'], [GREY, 'swatch--dash', 'bounced back']]);
    waveTables();
    const H = pattern(), pk = peaks(H.I).filter(y => y > 0.05);
    setHTML($('info'), !open2
      ? `<b>One slit, no stripes.</b> The wave fans out from the open slit into one broad hump${S.a <= 1 ? ': a slit a wavelength wide or narrower spreads it over every angle, so there is no dark stripe at all' : ', with dark stripes only far out, where the slit\'s own edges interfere'}. Open both slits to see the stripes.`
      : `<b>The first bright stripes either side sit about ${fixed(pk[0] || NaN, 1)} wavelengths out</b> in the Huygens prediction: there the paths from the two slits differ by one wavelength. The rule of thumb for the spacing, λL/d, gives ${fixed(LX / S.d, 2)}. Move the slits apart and the stripes crowd together.`);
    setHTML($('takeaway'), '<b>The wave goes through both slits.</b> Each slit sends out its own wave; on the screen they add, and where they arrive out of step they cancel. Close one slit and there is nothing to cancel with: the stripes disappear.');
    frameFn = f => waveFrame(f);
    waveFrame(run.done ? nowF() : 1, !run.done);
    work();
  }

  /* ================= 2 and 3. Particles on the screen ================= */
  // the detections for this pattern and seed: rows drawn at random from it, and a random height on the screen
  function detections(kind) {
    const H = pattern2();
    const key = `${kind}|${S.d}|${S.a}|${kind === 'which' ? S.dm : ''}|${S.seed}`;
    return memo(key, () => {
      const I = kind === 'which' ? D.marked(H, S.dm) : H.I, draw = D.sampler(YS, I), r = D.rng(S.seed * 7919 + (kind === 'which' ? 17 : 3));
      const n = kind === 'which' ? 4000 : 10000, y = new Float64Array(n), z = new Float64Array(n), top = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        y[i] = draw(r()) / L; z[i] = r();
        // with the path known, each particle also says which slit it took: the top one with chance I1 / (I1 + I2) here
        const j = Math.max(0, Math.min(YS.length - 1, Math.round((y[i] * L - YS[0]) / (YS[1] - YS[0])))), u = r();
        top[i] = u < H.I1[j] / (H.I1[j] + H.I2[j]) ? 1 : 0;
      }
      return { y, z, top, I };
    });
  }
  const BIN = 0.5, BINS = range(-YMAX, YMAX - BIN, Math.round(2 * YMAX / BIN) - 1);
  function histogram(y, n) {
    const h = new Float64Array(BINS.length);
    for (let i = 0; i < n; i++) { const b = Math.floor((y[i] + YMAX) / BIN); if (b >= 0 && b < h.length) h[b]++; }
    return h;
  }
  // the expected count in each bin for n particles
  function expected(I, n) {
    const tot = I.reduce((a, v) => a + v, 0), e = new Float64Array(BINS.length);
    I.forEach((v, i) => { const b = Math.floor((YL[i] + YMAX) / BIN); if (b >= 0 && b < e.length) e[b] += v; });
    return e.map(v => n * v / tot);
  }
  // the histogram's noise: rms difference from the expected counts, relative to the rms expected count
  function noise(y, I, n) { const h = histogram(y, n), e = expected(I, n); let a = 0, b = 0; h.forEach((v, i) => { a += (v - e[i]) ** 2; b += e[i] ** 2; }); return Math.sqrt(a / b); }
  function screenLayers(det, n, colorBy) {
    const r = n < 40 ? 4.5 : n < 400 ? 2.6 : n < 3000 ? 1.7 : 1.25;
    const xs = Array.from(det.y.subarray(0, n)), zs = Array.from(det.z.subarray(0, n));
    if (!colorBy) return [{ type: 'dots', x: xs, y: zs, color: INK, r }];
    return [{ type: 'dots', x: xs, y: zs, colors: Array.from(det.top.subarray(0, n), t => (t ? BLUE : RED)), r }];
  }
  function drawScreen(det, n, colorBy, note) {
    field.opts.xLabel = 'Position on the screen, y (wavelengths)'; field.opts.yLabel = 'Along the slits'; field.opts.yFormat = () => ''; field.opts.xTickValues = null;
    field.setRange([-YMAX, YMAX], [0, 1]);
    field.draw([{ type: 'vband', x0: -YMAX, x1: YMAX, color: 'rgba(20, 35, 44, 0.03)' }].concat(screenLayers(det, n, colorBy), note ? [{ type: 'text', x: -YMAX + 0.3, y: 0.985, text: note, align: 'left', size: 11.5, color: VIOLET }] : []));
  }
  const ramp = (f, total) => (f >= 1 ? total : Math.max(1, Math.round(total * f * f * f)));

  // ---------- 2. One particle at a time ----------
  let view2 = null;
  function oneFrame(f) {
    const total = COUNTS[S.cnt], n = ramp(f, total), det = detections('one');
    drawScreen(det, n, false, f < 1 ? `${big(n)} so far` : '');
    const h = histogram(det.y, n), e = expected(det.I, n), hmax = Math.max(...e, ...h, 1);
    reset(plotA);
    plotA.opts.xLabel = 'Position on the screen, y (wavelengths)'; plotA.opts.yLabel = `Particles in each ${BIN} λ strip`;
    plotA.setRange([-YMAX, YMAX], [0, hmax * 1.15]);
    const bars = []; h.forEach((v, i) => { if (v > 0) bars.push({ type: 'poly', x: [BINS[i], BINS[i] + BIN, BINS[i] + BIN, BINS[i]], y: [0, 0, v, v], fill: alpha(VIOLET, 0.35), color: alpha(VIOLET, 0.8) }); });
    plotA.draw(bars.concat([{ type: 'line', x: BINS.map(b => b + BIN / 2), y: Array.from(e), color: INK, width: 1.8, dash: [5, 4] }]));
    if (view2) plotB.draw(view2.pb.concat(n >= 10 ? [{ type: 'dots', x: [Math.log10(n)], y: [Math.log10(noise(det.y, det.I, n))], color: VIOLET, r: 5 }] : []));
  }
  function renderOne() {
    const total = COUNTS[S.cnt], det = detections('one'), H = pattern2(), cs = centralShare(H.I);
    let inC = 0; for (let i = 0; i < total; i++) if (det.y[i] >= cs.lo && det.y[i] <= cs.hi) inC++;
    const ns = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000], nz = ns.map(n => noise(det.y, det.I, n));
    reset(plotB);
    const lf = v => (Math.abs(v - Math.round(v)) < 1e-6 ? (Math.round(v) === 0 ? '1' : Math.round(v) === 1 ? '10' : `10${String(Math.round(v)).replace('-', '⁻').replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])}`) : '');
    plotB.opts.xLabel = 'Number of particles N'; plotB.opts.yLabel = 'Noise in the histogram';
    plotB.opts.xTickValues = [1, 2, 3, 4]; plotB.opts.xFormat = v => ({ 1: '10', 2: '100', 3: '1000', 4: '10⁴' })[Math.round(v)] || ''; plotB.opts.yFormat = lf;
    plotB.setRange([0.9, 4.1], [-2.2, 0.6]);
    const ref = ns.map(n => Math.log10(nz[3] * Math.sqrt(100 / n)));
    view2 = { pb: [{ type: 'line', x: ns.map(Math.log10), y: ref, color: GREY, width: 1.6, dash: [6, 4] }, { type: 'line', x: ns.map(Math.log10), y: nz.map(Math.log10), color: VIOLET, width: 2.2 }] };
    const nzT = total >= 10 ? noise(det.y, det.I, total) : NaN;
    if (!deep) stats([
      ['Particles detected', big(total), total === 1 ? 'one dot: no pattern yet' : 'each one a single dot'],
      ['In the central stripe', pct(inC / total), `predicted: ${pct(cs.share)}`],
      ['Histogram noise', total >= 10 ? pct(nzT) : '—', 'shrinks as 1/√N'],
      ['Stripe spacing', `${fixed(Math.min(...peaks(H.I).filter(y => y > 0.05)), 2)} λ`, 'where the dots pile up'],
    ]);
    else stats([
      ['N', big(total), 'detections drawn from P(y) = |ψ|²/∫|ψ|²'],
      [`Central stripe, ${sym('|y| < ' + fixed(cs.hi, 2) + ' λ')}`, `${inC} of ${big(total)}`, `expected ${fixed(cs.share * total, 1)} ± ${fixed(Math.sqrt(total * cs.share * (1 - cs.share)), 1)}`],
      [`Relative noise, ${sym('rms(n − n̄)/rms(n̄)')}`, total >= 10 ? fixed(nzT, 4) : '—', '∝ 1/√N'],
      ['Strip width', `${BIN} λ`, `${BINS.length} strips across the screen`],
    ]);
    setHTML($('dg-title'), 'The screen, one particle at a time');
    put('dg-cap', 'Each dot is one particle, detected at one place on the screen; the height along the slits is random and means nothing. The stripes show up only as the dots pile up.');
    legend('dg-legend', [[INK, 'swatch--area', 'one detected particle']]);
    setHTML($('pa-title'), 'Where they landed, strip by strip');
    put('pa-cap', `The number of particles in each ${BIN}-wavelength strip of the screen (violet bars), against the number expected from |ψ|² (dashed). With few particles they barely agree; with many, the bars trace the curve.`);
    legend('pa-legend', [[VIOLET, 'swatch--area', 'particles counted'], [INK, 'swatch--dash', 'expected from |ψ|²']]);
    setHTML($('pb-title'), 'The noise shrinks as 1/√N');
    put('pb-cap', 'How far the histogram is from the expected counts, against the number of particles, on log scales (violet), with a line falling as 1/√N (grey): a hundred times more particles, ten times less noise.');
    legend('pb-legend', [[VIOLET, '', 'this run'], [GREY, 'swatch--dash', '1/√N']]);
    setHTML($('info'), total < 50
      ? `<b>${total === 1 ? 'One particle, one dot.' : `${total} particles, ${total} dots.`}</b> Each lands at a single point, at random. With so few, no one could see stripes, yet every dot fell where |ψ|² is not zero.`
      : `<b>${big(total)} particles: ${total >= 1000 ? 'the stripes are plain to see' : 'the stripes are starting to show'}.</b> ${pct(inC / total)} landed in the central stripe, against ${pct(cs.share)} expected. No one can say where the next particle will land; only the odds are known.`);
    setHTML($('takeaway'), '<b>The wave sets the odds; each particle lands in one place.</b> A single detection is random, but |ψ|² decides how likely each place is. Many detections trace out the interference pattern: the Born rule.');
    $('field').setAttribute('aria-label', `${big(total)} particles detected on the screen, piling up in stripes`);
    $('side').setAttribute('aria-label', '');
    frameFn = oneFrame;
    oneFrame(nowF());
  }

  // ---------- 3. Which way did it go? ----------
  let view3 = null;
  function whichFrame(f) {
    const det = detections('which'), n = ramp(f, 4000);
    drawScreen(det, n, S.dm >= 0.999, f < 1 ? `${big(n)} so far` : '');
  }
  function renderWhich() {
    const H = pattern2(), I = D.marked(H, S.dm), V = D.contrast(YS, H, S.dm), V0 = D.contrast(YS, H, 0);
    const norm = Math.max(...H.I);
    reset(plotA);
    plotA.opts.xLabel = 'Position on the screen, y (wavelengths)'; plotA.opts.yLabel = 'Brightness on the screen';
    plotA.setRange([-YMAX, YMAX], [0, 1.1]);
    plotA.draw([
      { type: 'line', x: YL, y: Array.from(H.I, v => v / norm), color: GREY, width: 1.3, dash: [2, 3] },
      { type: 'line', x: YL, y: Array.from(H.I1, v => v / norm), color: BLUE, width: 1.6, dash: [5, 4] },
      { type: 'line', x: YL, y: Array.from(H.I2, v => v / norm), color: RED, width: 1.6, dash: [5, 4] },
      { type: 'line', x: YL, y: Array.from(I, v => v / norm), color: VIOLET, width: 2.6 },
    ]);
    reset(plotB);
    const ds = range(0, 1, 100);
    plotB.opts.xLabel = 'Distinguishability D'; plotB.opts.yLabel = 'Fringe visibility V';
    plotB.setRange([-0.03, 1.03], [0, 1.08]);
    plotB.draw([
      { type: 'line', x: ds, y: ds.map(x => Math.sqrt(1 - x * x)), color: GREY, width: 1.8, dash: [6, 4] },
      { type: 'vline', x: S.dm, color: LIGHT, width: 1, dash: [3, 3] },
      { type: 'dots', x: [S.dm], y: [V], color: VIOLET, r: 6 },
    ]);
    if (!deep) stats([
      ['Distinguishability D', fixed(S.dm, 2), S.dm === 0 ? 'the marker says nothing' : S.dm >= 0.999 ? 'the path is known every time' : 'the path is partly known'],
      ['Fringe visibility V', fixed(V, 3), 'contrast of the central stripe'],
      [`${sym('D² + V²')}`, fixed(S.dm * S.dm + V * V, 3), 'never more than 1'],
      ['Particles', '4 000', S.dm >= 0.999 ? 'coloured by the slit they took' : 'drawn from the pattern'],
    ]);
    else stats([
      [sym('D = √(1 − |⟨χ₁|χ₂⟩|²)'), fixed(S.dm, 3), `|⟨χ₁|χ₂⟩| = ${fixed(Math.sqrt(Math.max(0, 1 - S.dm * S.dm)), 3)}`],
      [sym('V = 2Re(ψ₁*ψ₂⟨χ₁|χ₂⟩)/(|ψ₁|² + |ψ₂|²)'), fixed(V, 4), `at y = 0; unmarked: ${fixed(V0, 4)}`],
      [sym('D² + V²'), fixed(S.dm * S.dm + V * V, 4), '= 1 for a marker in a pure state'],
      ['Particles', '4 000', 'drawn from the marked pattern'],
    ]);
    setHTML($('dg-title'), S.dm >= 0.999 ? 'Which way: the path is known, and the stripes are gone' : S.dm === 0 ? 'Which way: no marker, full stripes' : 'Which way: the path is partly known');
    put('dg-cap', S.dm >= 0.999
      ? 'Each dot is a particle whose marker says which slit it took: blue for the top slit, red for the bottom. Each colour alone makes a single broad hump, and so does their sum: no stripes.'
      : 'Each dot is one detected particle. The better the marker can tell the paths apart, the more the dark stripes fill in.');
    legend('dg-legend', S.dm >= 0.999 ? [[BLUE, 'swatch--area', 'took the top slit'], [RED, 'swatch--area', 'took the bottom slit']] : [[INK, 'swatch--area', 'one detected particle']]);
    setHTML($('pa-title'), 'The pattern, as the path becomes known');
    put('pa-cap', `The screen pattern with the marker at D = ${fixed(S.dm, 2)} (violet), the two slits alone (dashed: blue for the top slit, red for the bottom) and the pattern with no marker (grey, dotted). The interference term shrinks by √(1 − D²).`);
    legend('pa-legend', [[VIOLET, '', 'with this marker'], [BLUE, 'swatch--dash', 'top slit alone'], [RED, 'swatch--dash', 'bottom slit alone'], [GREY, 'swatch--dot', 'no marker']]);
    setHTML($('pb-title'), 'Knowledge against stripes');
    put('pb-cap', deep
      ? 'The visibility of the central fringe (violet dot), computed from the pattern, against Englert\'s duality relation D² + V² = 1 (dashed): which-path knowledge and interference trade off along a quarter circle.'
      : 'The strength of the stripes against how well the path is known: they fall along a quarter circle, V = √(1 − D²) (dashed). Full knowledge, no stripes; no knowledge, full stripes.');
    legend('pb-legend', [[VIOLET, 'swatch--area', 'this marker'], [GREY, 'swatch--dash', 'V = √(1 − D²)']]);
    setHTML($('info'), S.dm === 0
      ? '<b>No marker: full stripes.</b> Nothing records the path, so the two ways through interfere completely, and the central stripe goes fully dark at its edges.'
      : S.dm >= 0.999
      ? '<b>Path known: the stripes are gone.</b> Each particle\'s marker says which slit it took, so the two ways through no longer interfere: the pattern is just the two single-slit humps added up.'
      : `<b>Partly known: visibility ${fixed(V, 2)}.</b> The marker could tell the paths apart with distinguishability ${fixed(S.dm, 2)}, and the stripes fade to √(1 − ${fixed(S.dm, 2)}²) = ${fixed(V, 2)} of their full strength.`);
    setHTML($('takeaway'), '<b>Which way, or interference: not both.</b> Stripes need the two paths to be indistinguishable. Anything that could tell them apart, even a marker no one looks at, weakens the stripes, by exactly as much as it could tell.');
    $('field').setAttribute('aria-label', `4000 particles on the screen with a which-path marker of distinguishability ${fixed(S.dm, 2)}; fringe visibility ${fixed(V, 2)}`);
    $('side').setAttribute('aria-label', '');
    frameFn = whichFrame;
    whichFrame(nowF());
  }

  // ---------- controls ----------
  function syncControls() {
    const set = (id, v, txt) => { $(id).value = v; $(id + '-out').textContent = txt; $(id).setAttribute('aria-valuetext', txt); };
    set('sd', S.d, `${trim(S.d)} λ`); set('sa', S.a, `${trim(S.a)} λ`); set('cnt', S.cnt, big(COUNTS[S.cnt])); set('dm', S.dm, fixed(S.dm, 2));
    const pressed = (attr, val) => document.querySelectorAll(`button[data-${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(val))));
    pressed('open', S.open); pressed('cnt', S.cnt); pressed('dm', S.dm); pressed('depth', deep ? 'deep' : 'simple');
    $('depth-hint').textContent = deep ? 'The formulas: the simulation, Huygens wavelets, the Born rule, the duality relation; the wave coloured by its phase.' : 'The main ideas; switch to Go deeper for the formulas, and to see the wave\'s phase.';
  }
  function render() {
    syncControls();
    lastF = null;
    if (mode === 'wave') renderWave(); else if (mode === 'one') renderOne(); else renderWhich();
    $('plot-a').setAttribute('aria-label', $('pa-title').textContent); $('plot-b').setAttribute('aria-label', $('pb-title').textContent);
    kick();
  }
  function applyMode() {
    document.querySelectorAll('.tab').forEach(b => { const on = b.dataset.mode === mode; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $('lab').setAttribute('aria-labelledby', 'tab-' + mode);
    document.querySelectorAll('.mode-intro').forEach(el => { el.hidden = el.dataset.for !== mode; });
    document.querySelectorAll('[data-modes], [data-deep]').forEach(el => { el.hidden = !((!el.dataset.modes || el.dataset.modes.split(' ').includes(mode)) && (!('deep' in el.dataset) || deep)); });
    $('side-box').hidden = mode !== 'wave';
    $('mag-view').classList.toggle('mag-view--single', mode !== 'wave');
    animT0 = performance.now();
    render();
  }
  let pending = false;
  function later() { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; render(); }); }
  [['sd', 'd'], ['sa', 'a'], ['cnt', 'cnt'], ['dm', 'dm']].forEach(([id, key]) => $(id).addEventListener('input', e => { S[key] = +e.target.value; later(); }));
  document.querySelector('.lab-main').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !b.closest('.controls')) return;
    const d = b.dataset;
    if (d.open) S.open = d.open;
    else if (d.cnt) S.cnt = +d.cnt;
    else if (d.dm) S.dm = +d.dm;
    else if (b.id === 'reroll') S.seed++;
    else if (b.id === 'video-values') Object.assign(S, JSON.parse(JSON.stringify(START)));
    else return;
    render();
  });
  document.querySelectorAll('[data-depth]').forEach(b => b.addEventListener('click', () => {
    deep = b.dataset.depth === 'deep';
    try { localStorage.setItem('slit-depth', deep ? 'deep' : 'simple'); } catch (e) { /* not remembered: fine */ }
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
    wide: () => { mode = 'wave'; fresh({ d: 6 }); },
    one: () => { mode = 'wave'; fresh({ open: 'top' }); },
    width: () => { mode = 'wave'; fresh({ a: 2 }); },
    ten: () => { mode = 'one'; fresh({ cnt: 2 }); },
    central: () => { mode = 'one'; fresh({ cnt: 8 }); },
    noise: () => { mode = 'one'; fresh({ cnt: 4 }); },
    known: () => { mode = 'which'; fresh({ dm: 1 }); },
    half: () => { mode = 'which'; fresh({ dm: 0.6 }); },
  };
  document.querySelectorAll('.predict__load[data-q]').forEach(b => b.addEventListener('click', () => {
    QUESTIONS[b.dataset.q]();
    applyMode();
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    const t = tabs.find(x => x.dataset.mode === mode); if (t) t.focus({ preventScroll: true });
  }));

  syncAnim();
  applyMode();
  window.__slit = { S, render, frame: f => frameFn && frameFn(f), setMode: m => { mode = m; applyMode(); }, run: () => run };
})();
