/* Berry phase lab: a spin carried around a loop, chains of states in any gauge, curvature in two crystals.
   Physics in physics.js, pictures in views.js. */
(function () {
  'use strict';
  const B = window.BP, V = window.BerryViews, PI = Math.PI, DEG = PI / 180, TAU = 2 * PI;
  const $ = id => document.getElementById(id);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const NICE = [1, 1.5, 2, 3, 4, 5, 7, 10, 15, 20, 30, 40, 50, 70, 100, 150, 200, 300, 400, 500, 700, 1000];   // loop times on offer, in Larmor periods
  const START = { thc: 60, logT: Math.log10(30), shape: 'circle', dphi: 120, N: 8, cg: 'smooth', seed: 1, model: 'hex', qm: 1, hm: 0.2, ht2: 0, hphi: 90, rad: 0.8, c: [4 * Math.PI / (3 * Math.sqrt(3)), 0], gauge: 'N' };
  const S = JSON.parse(JSON.stringify(START));
  let mode = 'loop';
  // "The essentials" or "Go deeper": a per-viewer preference, remembered where the browser allows
  let deep = false;
  try { deep = localStorage.getItem('berry-depth') === 'deep'; } catch (e) { /* storage blocked: start simple */ }
  const INK = '#14232c', GOLD = '#946600', BLUE = '#1f6fb4', RED = '#c2372f', GREEN = '#2e8b57', BERRY = '#a3326c', MUTED = '#5f7382', GREY = '#8a9aa5';
  const PLAY_S = 6;               // seconds of playback per loop

  // ---------- formatting ----------
  const fixed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const piTxt = (x, d = 3) => { const v = x / PI; return Math.abs(v) < 0.5 * Math.pow(10, -d) ? '0' : `${fixed(v, d)}π`; };
  const pct = (x, d = 1) => `${fixed(100 * x, d)}%`;
  const sub = t => String(t).replace(/_\{([^}]*)\}|_([A-Za-z0-9])/g, (m, a, b) => `<sub>${a || b}</sub>`);
  const sym = t => `<span class="sym">${t}</span>`;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const range = (a, b, k) => Array.from({ length: k + 1 }, (_, i) => a + (b - a) * i / k);
  const nearest = (x, ref) => ref + B.wrap(x - ref);              // the branch of a phase closest to ref
  // a phase as a fraction of a full turn, in words
  function turns(x) {
    const f = x / TAU, a = Math.abs(f), dir = f < 0 ? 'back' : 'forward';
    if (a < 0.0015) return 'no turn at all';
    const named = [[0.25, 'a quarter turn'], [0.5, 'half a turn'], [0.75, 'three quarters of a turn'], [1, 'a full turn']].find(([v]) => Math.abs(a - v) < 0.0015);
    return named ? `${named[1]} ${dir}` : `${fixed(a, 3)} of a turn ${dir}`;
  }

  // ---------- helpers ----------
  function stats(items, veiled) {
    $('stats').className = `stats stats--${items.length} stats--steady stats--wrap${veiled ? ' stats--veiled' : ''}`;
    $('stats').innerHTML = items.map(([label, value, s2]) => `<div class="stat"><div class="stat__label">${sub(label)}</div><div class="stat__value">${veiled ? '?' : value}</div><div class="stat__sub">${veiled ? 'Press Play to find out' : sub(s2)}</div></div>`).join('');
  }
  function typeset(el) { if (window.MathJax && MathJax.typesetPromise && /\\\(/.test(el.innerHTML)) MathJax.typesetPromise([el]).catch(() => {}); }
  function setHTML(el, html) { if (el.dataset.html === html) return; el.dataset.html = html; el.innerHTML = html; typeset(el); }
  const put = (id, t) => setHTML($(id), sub(t));
  function legend(id, items) { setHTML($(id), items.map(([c, k, l]) => `<li style="color:${c}"><span class="swatch ${k}"></span><span>${sub(l)}</span></li>`).join('')); }
  const MARGIN = { l: 58, r: 18, t: 12, b: 42 };
  const plotA = new NanoPlot($('plot-a'), { margin: MARGIN, narrowMargin: { l: 54, r: 12 } });
  const plotB = new NanoPlot($('plot-b'), { margin: MARGIN, narrowMargin: { l: 54, r: 12 } });
  const sphere = new V.GeoSphere($('sphere'));
  const dial = new V.PhaseDial($('dial'));
  const map = new V.ZoneMap($('map'), { margin: { l: 46, r: 12, t: 12, b: 40 }, xLabel: 'kx', yLabel: 'ky', xTicks: 5, yTicks: 5 });
  map.onFit = () => { if (mode === 'crystal') later(); };      // a resized map shows a different patch of k: redraw it
  const reset = pl => { pl.opts.xTickValues = null; pl.opts.xFormat = null; pl.opts.yFormat = null; pl.opts.zeroLine = false; pl.opts.xTicks = 6; pl.opts.yTicks = 5; };
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³' };
  const logFmt = v => (Math.abs(v - Math.round(v)) < 1e-6 ? (Math.round(v) === 0 ? '1' : Math.round(v) === 1 ? '10' : `10${String(Math.round(v)).split('').map(c => SUP[c]).join('')}`) : '');
  const cache = new Map();
  // least recently used goes first; the loop's integrals, which change with every drag, have a cache of their own
  function lru(store, size) { return (key, fn) => { let v; if (store.has(key)) { v = store.get(key); store.delete(key); } else v = fn(); store.set(key, v); if (store.size > size) store.delete(store.keys().next().value); return v; }; }
  const loopCache = new Map(), memo = lru(cache, 60), loopMemo = lru(loopCache, 12);
  // the flux through the loop can take a moment near a closing gap: it is worked out once the controls settle
  let fluxTimer = 0;
  function settled(key, fn) {
    if (loopCache.has(key)) return loopMemo(key, fn);
    clearTimeout(fluxTimer);
    fluxTimer = setTimeout(() => { if (!loopCache.has(key)) { loopMemo(key, fn); if (mode === 'crystal') render(); } }, 150);
    return null;
  }
  const add = (a, b, s) => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]];

  // ---------- 1. A spin goes around a loop ----------
  const nL = () => Math.pow(10, S.logT);                          // Larmor periods per loop
  const solid = thc => TAU * (1 - Math.cos(thc));
  function runOf() {
    const thc = S.thc * DEG, n = nL(), nOut = Math.round(clamp(40 * n, 600, 4000));
    return memo(`run|${S.thc}|${S.logT}`, () => B.spinRun(thc, TAU * n, nOut));
  }
  function finals() {
    const thc = S.thc * DEG, ideal = -solid(thc) / 2;
    return memo(`fin|${S.thc}`, () => { const xs = range(0, 3, 150); return { x: xs, y: xs.map(l => { const r = B.spinFinal(thc, TAU * Math.pow(10, l)); return { g: nearest(r.geo, ideal), f: r.fid }; }) }; });
  }
  let pos = 1, playing = false, raf = 0, last = 0, veil = false;
  function frame(now) {
    if (!playing) return;
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
    pos += dt / PLAY_S;
    if (pos >= 1) { pos = 1; playing = false; }
    render();
    if (playing) raf = requestAnimationFrame(frame);
  }
  function stop() { playing = false; cancelAnimationFrame(raf); }
  function play() {
    veil = false;
    if (reduceMotion) { pos = pos >= 0.999 ? 0.125 : Math.min(1, pos + 0.125); render(); return; }
    if (pos >= 0.999) pos = 0;
    playing = true; last = performance.now(); raf = requestAnimationFrame(frame); render();
  }
  $('play').addEventListener('click', () => { if (playing) { stop(); render(); } else play(); });
  $('restart').addEventListener('click', () => { stop(); pos = 0; render(); });
  $('time').addEventListener('input', e => { stop(); pos = +e.target.value / 1000; veil = false; render(); });

  function renderLoop() {
    const thc = S.thc * DEG, run = runOf(), nOut = run.t.length - 1, idx = Math.round(pos * nOut), f = idx / nOut;
    const Sa = solid(thc), ideal = -Sa / 2, n = run.n[idx], spin = run.spin[idx], geo = run.geo[idx], fid = run.fid[idx];
    let minF = 1; for (let i = 0; i <= nOut; i++) minF = Math.min(minF, run.fid[i]);
    const per = nL(), ph = TAU * f;
    // the sphere: the field's cone, the spin and its path, and an arrow carried along without turning
    const eth = p => [Math.cos(thc) * Math.cos(p), Math.cos(thc) * Math.sin(p), -Math.sin(thc)], eph = p => [-Math.sin(p), Math.cos(p), 0];
    const ptv = p => { const b = -Math.cos(thc) * p, a = eth(p), c = eph(p); return [Math.cos(b) * a[0] + Math.sin(b) * c[0], Math.cos(b) * a[1] + Math.sin(b) * c[1], Math.cos(b) * a[2] + Math.sin(b) * c[2]]; };
    const n0 = [Math.sin(thc), 0, Math.cos(thc)], L = 0.42;
    const step = Math.max(1, Math.floor(idx / 1500));
    const trail = []; for (let i = 0; i <= idx; i += step) trail.push(run.spin[i]); trail.push(spin);
    const loop = range(0, TAU, 160).map(p => [Math.sin(thc) * Math.cos(p), Math.sin(thc) * Math.sin(p), Math.cos(thc)]);
    sphere.draw({
      curves: [{ pts: loop, color: GOLD, width: 2.2, dash: [6, 4] }],
      trail: idx > 0 ? [{ pts: trail, color: BLUE, width: 1.8 }] : [],
      arrows: [{ v: n, color: INK, width: 2.4, label: 'field' }, { v: spin, color: BLUE, width: 3.4 }],
      vecs: [{ a: n0, b: add(n0, eth(0), L), color: GREEN, width: 2, dash: [4, 3] }, { a: n, b: add(n, ptv(ph), L), color: GREEN, width: 3 }],
      dots: [{ v: n0, color: INK, r: 4, ring: true }],
      tags: [{ v: add(n0, eth(0), L + 0.12), text: 'start', color: GREEN, size: 11.5, bold: false }],
    });
    $('sphere').setAttribute('aria-label', `Field on a cone of ${S.thc}° about z; the spin, in blue, ${fid > 0.99 ? 'follows it closely' : 'wobbles around it'}; a green arrow carried along the loop has turned by ${fixed((((-Math.cos(thc) * ph) % TAU) + TAU) % TAU / DEG, 0)}° relative to the local frame`);
    // the dial: the phase collected so far, with the dynamical phase removed
    const shown = veil ? 0 : geo, ideal_t = ideal * f;
    dial.draw(veil ? { arrows: [] } : {
      arrows: [{ z: [Math.cos(ideal_t), Math.sin(ideal_t)], color: GOLD, width: 2.2, dash: [5, 4] }, { z: [Math.sqrt(fid) * Math.cos(shown), Math.sqrt(fid) * Math.sin(shown)], color: BLUE, width: 3.2 }],
      arc: { to: shown, color: BLUE, label: 'γ' },
    });
    $('dial').setAttribute('aria-label', veil ? 'Phase dial, hidden until Play' : `Phase collected so far: ${piTxt(geo)}, against ${piTxt(ideal_t)} for a slow loop`);
    const share = pct(Sa / (4 * PI), Sa / (4 * PI) < 0.01 || Sa / (4 * PI) > 0.99 ? 1 : 0);
    if (!deep) stats([
      ['Area of the loop (solid angle)', `${fixed(Sa / PI, 3)}π`, `${share} of the sphere`],
      ['Berry phase predicted', piTxt(ideal), `minus half the area: ${turns(ideal)}`],
      [f >= 0.999 ? 'Phase measured, one loop' : 'Phase measured so far', piTxt(geo), f >= 0.999 ? (minF > 0.99 ? 'the spin followed the field all the way' : `the spin lagged behind the field`) : `${fixed(100 * f, 0)}% of the way round`],
    ], veil);
    else stats([
      ['Solid angle of the loop', `${fixed(Sa / PI, 3)}π`, `2π(1 − cos θ): ${share} of the sphere`],
      ['Berry phase', piTxt(ideal), 'minus half the solid angle: the slow-loop result'],
      [f >= 0.999 ? 'Phase after one loop' : `Phase so far, ${sym(`t = ${fixed(f, 2)}T`)}`, piTxt(geo), `dynamical phase ω_0t/2 = ${fixed(PI * per * f, PI * per * f >= 100 ? 0 : 1)} rad removed`],
      [`Spin still in ${sym('|+n⟩')}`, pct(fid, fid > 0.999 ? 2 : 1), `lowest along the loop: ${pct(minF, minF > 0.999 ? 2 : 1)}`],
    ], veil);
    setHTML($('dg-title'), 'The spin follows the field around a cone');
    put('dg-cap', !deep ? 'The black arrow is the magnetic field\'s direction, going round the dashed loop; the blue arrow is the spin, following it. The green arrow is slid round without ever being turned: compare it with the dashed one it started as. The dial shows the extra phase the spin has picked up so far (blue) against the prediction (gold). Drag the sphere to turn it.' : 'On the sphere: the field\'s direction (black) turns around the dashed cone; the spin (blue) follows it, wobbling around it if the trip is fast. The green arrow is carried along without turning (parallel transport); it starts along the dashed one. On the dial: the phase the spin has collected, with the dynamical phase taken out (blue; its length is the overlap with |+n⟩), and the slow-loop value so far (gold, dashed). Drag the sphere to turn it.');
    legend('dg-legend', [[INK, '', deep ? 'field direction n' : 'the field\'s direction'], [BLUE, '', deep ? 'spin ⟨σ⟩ and its path' : 'the spin and its path'], [GOLD, 'swatch--dash', 'the loop'], [GREEN, '', 'arrow carried without turning']]);
    // plot A: the phase against time
    reset(plotA);
    plotA.opts.xLabel = 'Time t / T'; plotA.opts.yLabel = 'Phase (units of π)'; plotA.opts.zeroLine = true;
    const ys = run.geo.map(g => g / PI), lo = Math.min(0, ideal / PI, ...ys), hi = Math.max(0, ideal / PI, ...ys), pad = 0.08 * (hi - lo) + 0.05;
    plotA.setRange([0, 1], [lo - pad, hi + pad]);
    const LA = veil ? [] : [{ type: 'line', x: [0, 1], y: [0, ideal / PI], color: GOLD, width: 2, dash: [6, 4] }];
    if (!veil && idx > 0) { const xs = [], yy = []; for (let i = 0; i <= idx; i += step) { xs.push(run.t[i] / run.t[nOut]); yy.push(ys[i]); } xs.push(f); yy.push(ys[idx]); LA.push({ type: 'line', x: xs, y: yy, color: BLUE, width: 2.2 }, { type: 'dots', x: [f], y: [ys[idx]], color: BLUE, r: 4.5 }); }
    plotA.draw(LA);
    setHTML($('pa-title'), 'The phase grows as the field goes round');
    put('pa-cap', !deep ? `The extra phase the spin picks up on its way round (blue), against the prediction, which grows steadily to minus half the loop's area (gold). ${per < 8 ? 'At this speed the spin can\'t keep up and wobbles around the field, so its phase wobbles too.' : 'The small ripples come from the spin wobbling around the field; slower loops make them smaller.'}` : `The spin's phase relative to |+n⟩, with the dynamical phase taken out, followed through the loop (blue), against the slow-loop result, −\\(\\mathcal S\\)/2 × t/T (gold). ${per < 8 ? 'At this speed the spin lags and wobbles around the field: the phase oscillates at the Larmor frequency.' : 'The ripples, at the Larmor frequency, shrink as the loop gets slower.'}`);
    legend('pa-legend', [[BLUE, '', 'measured'], [GOLD, 'swatch--dash', deep ? 'slow-loop limit' : 'prediction']]);
    // plot B: the phase after one loop against the loop time
    reset(plotB);
    plotB.opts.xLabel = deep ? 'Time for one loop (Larmor periods)' : 'Time for one loop (spin wobbles)'; plotB.opts.yLabel = 'Phase after one loop (π)';
    plotB.opts.xTickValues = [0, 1, 2, 3]; plotB.opts.xFormat = logFmt;
    const F = finals(), gy = F.y.map(p => p.g / PI);
    let blo = Math.min(...gy, ideal / PI), bhi = Math.max(...gy, ideal / PI, 0);
    if (bhi - blo < 0.2) { const mid = (bhi + blo) / 2; blo = mid - 0.1; bhi = mid + 0.1; }
    const bp = 0.1 * (bhi - blo) + 0.05;
    plotB.setRange([0, 3], [blo - bp, bhi + bp]);
    if (veil) plotB.draw([{ type: 'text', x: 1.5, y: (blo + bhi) / 2, text: 'Shown after you press Play', color: MUTED, size: 13 }]);
    else plotB.draw([
      { type: 'hline', y: ideal / PI, color: GOLD, width: 2, dash: [6, 4] },
      { type: 'line', x: F.x, y: gy, color: BLUE, width: 2.2 },
      { type: 'vline', x: S.logT, color: INK, width: 1, dash: [3, 3] },
      { type: 'dots', x: [S.logT], y: [nearest(run.geo[nOut], ideal) / PI], color: INK, r: 5 },
    ]);
    setHTML($('pb-title'), veil ? 'The phase after one loop, against the loop time' : 'Slower loops converge on the Berry phase');
    put('pb-cap', veil ? 'Shown after you press Play.' : !deep ? `The phase after one full loop, for loops from fast (left) to slow (right). Slow loops land on the Berry phase, ${piTxt(ideal)} (gold), however slow you go: it is set by the loop's shape, not by how long the trip takes.` : `The phase left after one full loop (blue), against the time the loop takes, on a log scale; the gold line is the Berry phase, ${piTxt(ideal)}. The dynamical phase grows in proportion to the time; the Berry phase does not depend on it at all.`);
    legend('pb-legend', veil ? [] : [[BLUE, '', 'phase after one loop'], [GOLD, 'swatch--dash', 'Berry phase −\\(\\mathcal S\\)/2'], [INK, '', 'this loop']]);
    const final = run.geo[nOut];
    setHTML($('info'), veil ? '<b>Make your prediction,</b> then press ▶ Play to carry the spin around the loop.'
      : f < 0.999 ? `<b>${fixed(f * 100, 0)}% of the way round:</b> the spin has collected ${piTxt(geo)} of geometric phase, against ${piTxt(ideal_t)} for a slow loop.`
      : minF > 0.99 && !deep ? `<b>Slow enough: the spin follows the field all the way round.</b> It picks up ${piTxt(final)}, against the Berry phase ${piTxt(ideal)}${Math.abs(B.wrap(final - ideal)) > 0.005 * PI ? '; go slower and the difference shrinks' : ''}. ${Math.abs(B.wrap(Sa)) < 1e-6 ? 'The green arrow has turned a full 360° and looks unchanged, while the spin\'s state has changed sign: a spin needs two turns to come back to itself.' : `The green arrow has turned by ${fixed(((Sa % TAU) + TAU) % TAU / DEG, 0)}°, the loop's area (mod 360°); the spin's phase is half of that, the other way.`}`
      : minF <= 0.99 && !deep ? `<b>Too fast: the spin can't keep up</b> and wobbles around the field, so its phase, ${piTxt(final)}, ${Math.abs(B.wrap(final - ideal)) < 0.005 * PI ? `lands near the Berry phase, ${piTxt(ideal)}, only by coincidence` : `is not the Berry phase, ${piTxt(ideal)}`}. Slow the loop down.`
      : minF > 0.99 ? `<b>Slow enough: the spin stays in |+n⟩, with a probability that never drops below ${pct(minF, minF > 0.999 ? 2 : 1)}.</b> After one loop it has picked up ${piTxt(final)} on top of the dynamical phase, against the Berry phase ${piTxt(ideal)}${Math.abs(B.wrap(final - ideal)) > 0.005 * PI ? `; the gap closes like 1/T as the loop gets slower` : ''}. ${Math.abs(B.wrap(Sa)) < 1e-6 ? 'The green arrow comes back exactly as it left: it has turned through the solid angle, a full 2π, which an arrow cannot tell from no turn at all, while the spin\'s state has changed sign. A spinor can tell.' : `The green arrow has turned by ${fixed(((Sa % TAU) + TAU) % TAU / DEG, 0)}°, the solid angle (mod 360°): twice the phase, the other way.`}`
      : `<b>Too fast for the spin to follow:</b> at one point it is only ${pct(minF, 0)} in |+n⟩, so the phase it picks up, ${piTxt(final)}, ${Math.abs(B.wrap(final - ideal)) < 0.005 * PI ? `lands close to the Berry phase, ${piTxt(ideal)}, but only by coincidence: this loop encloses so small a cap around the south pole that both are nearly zero, mod 2π` : `is not the Berry phase, ${piTxt(ideal)}`}. Slow the loop down.`);
    setHTML($('takeaway'), veil ? '<b>Predict first:</b> what phase does the spin bring back, apart from the ordinary one? Press Play to find out.' : !deep ? `<b>The Berry phase is geometry, not time.</b> Take ten times longer and the ordinary phase grows tenfold, but the Berry phase stays at ${piTxt(ideal)}, set by the loop's area alone: the arrow on the sphere turns by that area, the spin's phase by minus half of it.` : `<b>The Berry phase is geometry, not time.</b> Take ten times longer and the dynamical phase grows tenfold; the Berry phase stays at ${piTxt(ideal)}, set by the solid angle of the loop alone. It is a spin's version of the arrow carried around a sphere: the arrow turns by the solid angle, the spinor's phase by minus half of it.`);
    $('time').value = Math.round(pos * 1000); $('time').setAttribute('aria-valuetext', `${fixed(f, 2)} of the way round the loop`);
    $('time-out').textContent = `${fixed(f, 2)} T`;
    $('play').textContent = playing ? '❚❚ Pause' : '▶ Play';
    $('transport-note').textContent = `${reduceMotion ? 'Reduced motion is on: each press of Play steps an eighth of the way round.' : `One loop plays in ${PLAY_S} s.`} ${deep ? `It takes T = ${+per.toPrecision(4)} Larmor period${per === 1 ? '' : 's'}, so the spin precesses` : 'On the way, the spin wobbles'} about ${+per.toPrecision(4)} time${per === 1 ? '' : 's'} around the field.`;
  }

  // ---------- 2. Chains of states and gauge ----------
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function chain() {
    const pts = S.shape === 'lune' ? B.lune(S.dphi * DEG, S.N) : B.circle(S.thc * DEG, S.N);
    const smooth = pts.map(B.up);
    let st = smooth;
    if (S.cg === 'random') { const r = rng(S.seed * 7919 + S.N); st = smooth.map(u => B.phase(u, TAU * r())); }
    else if (S.cg === 'pt') {
      st = [smooth[0]];
      for (let j = 1; j < S.N; j++) { const o = B.ov(st[j - 1], smooth[j]); st.push(B.phase(smooth[j], -Math.atan2(o[1], o[0]))); }
    }
    const L = B.links(st, true), Sa = S.shape === 'lune' ? S.dphi * DEG : solid(S.thc * DEG);
    // the polygon's solid angle is defined mod 4π: show the branch nearest the smooth loop's
    const P = B.polySolid(pts), poly = P + 2 * TAU * Math.round((Sa - P) / (2 * TAU));
    return { pts, st, L, Sa, exact: -Sa / 2, proj: B.projectorPhase(st), poly };
  }
  function renderChain() {
    const C = chain(), N = S.N, { pts, st, L } = C, g = L.gamma;
    const open = L.link.slice(0, N - 1).reduce((a, b) => a + b, 0);
    // the sphere: the smooth loop, the great-circle polygon, and each state's flag
    const smoothLoop = S.shape === 'lune' ? B.lune(S.dphi * DEG, 240).concat([[0, 0, 1]]) : range(0, TAU, 160).map(p => [Math.sin(S.thc * DEG) * Math.cos(p), Math.sin(S.thc * DEG) * Math.sin(p), Math.cos(S.thc * DEG)]);
    let poly = [];
    for (let j = 0; j < N; j++) poly = poly.concat(V.geodesic(pts[j], pts[(j + 1) % N]));
    const len = clamp(2.4 / N, 0.12, 0.3);
    const vecs = st.map((u, j) => ({ a: pts[j], b: add(pts[j], B.flag(u), len), color: j === 0 ? INK : GREEN, width: j === 0 ? 2.6 : 2 }));
    let closing = null;
    if (S.cg === 'pt') {
      // the last state carried on to the first point: its flag shows the holonomy
      const o = B.ov(st[N - 1], B.up(pts[0])), u = B.phase(B.up(pts[0]), -Math.atan2(o[1], o[0]));
      closing = { a: pts[0], b: add(pts[0], B.flag(u), len * 1.15), color: BERRY, width: 2.4, dash: [4, 3] };
      vecs.push(closing);
    }
    sphere.draw({
      curves: [{ pts: smoothLoop, color: GOLD, width: 1.6, dash: [5, 4] }, { pts: poly, color: GOLD, width: 2.6 }],
      dots: pts.map((p, j) => ({ v: p, color: INK, r: j === 0 ? 4.5 : 3.2, ring: j === 0 })),
      vecs,
      tags: [{ v: pts[0].map(x => x * 1.13), text: '1', color: INK, size: 12 }].concat(N <= 12 ? pts.slice(1).map((p, j) => ({ v: p.map(x => x * 1.12), text: String(j + 2), color: MUTED, size: 11, bold: false })) : []),
    });
    $('sphere').setAttribute('aria-label', `${N} states on a ${S.shape === 'lune' ? 'slice' : 'circle'} of the sphere, joined by great-circle arcs, each with a hand showing its phase`);
    // the dial: the running product of the overlaps (conjugated, so its angle is the phase collected)
    let z = [1, 0]; const chainPts = [];
    for (let j = 0; j < N; j++) { const o = B.ov(st[j], st[(j + 1) % N]); z = [z[0] * o[0] + z[1] * o[1], z[1] * o[0] - z[0] * o[1]]; chainPts.push(z.slice()); }
    dial.draw({
      arrows: [{ z: [Math.cos(C.exact), Math.sin(C.exact)], color: GOLD, width: 2.2, dash: [5, 4] }, { z, color: BLUE, width: 3.2 }],
      arc: { to: g, color: BLUE, label: 'γ' }, chain: { pts: chainPts, color: BLUE },
    });
    $('dial').setAttribute('aria-label', `Running product of the overlaps; its final phase gives γ = ${piTxt(g)}`);
    if (!deep) stats([
      ['Berry phase of the smooth loop', piTxt(C.exact), turns(C.exact)],
      ['Phase around the chain', piTxt(g), `${N} states, chain closed`],
      ['Phase without closing it', piTxt(B.wrap(open)), 'from state 1 to state N: changes with your choice of phases'],
    ]);
    else stats([
      ['Exact, smooth loop', piTxt(C.exact), `minus half the solid angle, ${S.shape === 'lune' ? 'Δφ = ' : ''}${fixed(C.Sa / PI, 3)}π`],
      [`Chain ${sym('γ_N')}`, piTxt(g), `−arg Π⟨u_j|u_{j+1}⟩, N = ${N}`],
      ['From projectors only', piTxt(C.proj), '−arg Tr[P_1P_2⋯P_N]: no phases needed'],
      ['Open chain, 1 → N', piTxt(B.wrap(open)), 'without closing: depends on the gauge'],
    ]);
    setHTML($('dg-title'), S.cg === 'pt' ? `Parallel transport: the ${deep ? 'flag' : 'hand'} is carried without turning` : S.cg === 'random' ? 'A random gauge: every phase scrambled' : 'A chain of states in a smooth gauge');
    put('dg-cap', !deep ? `On the sphere: ${N} states on the loop (dashed), joined by the shortest paths between them (gold). The little hand at each state shows the phase chosen for it. ${S.cg === 'pt' ? 'The dashed berry hand at state 1 is the last state carried on to the first: the angle between it and state 1\'s own hand shows the Berry phase, doubled. ' : ''}The dial adds up the phase step by step (blue dots); where the arrow ends is the phase around the chain (gold dashed: the smooth loop's Berry phase).` : `On the sphere: ${N} states on the loop (dashed), joined by great-circle arcs (gold). Each state's phase is drawn as a flag at its point: multiplying the state by e<sup>iχ</sup> turns its flag by 2χ. ${S.cg === 'pt' ? 'The berry dashed flag at state 1 is state N carried on to it: the angle between it and state 1\'s own flag is the holonomy.' : ''} On the dial: the complex conjugates of the overlaps, ⟨u_{j+1}|u_j⟩, multiplied one by one (blue dots); the angle of the result is γ_N (gold, dashed: the exact −\\(\\mathcal S\\)/2).`);
    legend('dg-legend', [[GOLD, '', deep ? 'great-circle polygon' : 'the chain'], [GOLD, 'swatch--dash', 'the smooth loop'], [GREEN, '', deep ? 'each state\'s flag' : 'each state\'s phase'], ...(S.cg === 'pt' ? [[BERRY, 'swatch--dash', 'state N carried to state 1']] : [])]);
    // plot A: the phase of each link, and their running sum
    reset(plotA);
    plotA.opts.xLabel = 'Link j → j+1'; plotA.opts.yLabel = 'Phase (units of π)'; plotA.opts.zeroLine = true;
    const xs = range(1, N, N - 1), lk = L.link.map(v => v / PI), cum = []; let acc = 0; lk.forEach(v => { acc += v; cum.push(acc); });
    const all = lk.concat(cum, [C.exact / PI, 0]), lo = Math.min(...all), hi = Math.max(...all), pad = 0.08 * (hi - lo) + 0.05;
    plotA.setRange([0.5, N + 0.5], [lo - pad, hi + pad]);
    plotA.opts.xTicks = Math.min(8, N);
    plotA.draw([
      { type: 'hline', y: C.exact / PI, color: GOLD, width: 1.6, dash: [6, 4] },
      { type: 'line', x: [0.5].concat(xs), y: [0].concat(cum), color: BLUE, width: 2 },
      { type: 'stems', x: xs, y: lk, color: GREEN, width: 1.8, r: N > 30 ? 2.2 : 3.2 },
    ]);
    setHTML($('pa-title'), S.cg === 'pt' ? 'All of the phase sits in the last link' : S.cg === 'random' ? 'The links are random; their sum is not' : 'Each link carries a little of the phase');
    const extra = Math.round((acc * PI - g) / TAU);
    put('pa-cap', `${deep ? 'The phase of each overlap, −arg⟨u_j|u_{j+1}⟩ (green)' : 'The phase of each step from one state to the next (green)'}, the last one closing the loop back to state 1, and their running sum (blue). ${extra ? `The sum ends at γ_N ${extra > 0 ? '+' : '−'} ${Math.abs(extra) === 1 ? '' : Math.abs(extra)}2π: the same phase.` : 'The sum ends at γ_N.'}`);
    legend('pa-legend', [[GREEN, '', 'one link'], [BLUE, '', 'running sum'], [GOLD, 'swatch--dash', 'exact −\\(\\mathcal S\\)/2']]);
    // plot B: γ_N against N
    reset(plotB);
    plotB.opts.xLabel = 'Number of states N'; plotB.opts.yLabel = 'Phase of the chain (units of π)';
    const ns = range(3, 60, 57), gs = memo(`gN|${S.shape}|${S.shape === 'lune' ? S.dphi : S.thc}`, () => ns.map(k => nearest(B.links((S.shape === 'lune' ? B.lune(S.dphi * DEG, k) : B.circle(S.thc * DEG, k)).map(B.up), true).gamma, C.exact) / PI));
    let blo = Math.min(...gs, C.exact / PI), bhi = Math.max(...gs, C.exact / PI);
    if (bhi - blo < 0.2) { const mid = (bhi + blo) / 2; blo = mid - 0.1; bhi = mid + 0.1; }
    const bp = 0.12 * (bhi - blo) + 0.03;
    plotB.setRange([0, 61], [blo - bp, bhi + bp]);
    plotB.draw([
      { type: 'hline', y: C.exact / PI, color: GOLD, width: 2, dash: [6, 4] },
      { type: 'line', x: ns, y: gs, color: BLUE, width: 1.6 },
      { type: 'dots', x: ns, y: gs, color: BLUE, r: 2.4 },
      { type: 'dots', x: [N], y: [nearest(g, C.exact) / PI], color: INK, r: 5.5 },
    ]);
    const err = Math.abs(B.wrap(g - C.exact));
    setHTML($('pb-title'), err < 1e-9 ? 'Exact for every N on this loop' : 'More states, closer to the smooth loop');
    put('pb-cap', !deep ? `The phase around the chain for 3 to 60 states, the same whatever phases you choose, against the smooth loop's Berry phase (gold). ${err < 1e-9 ? 'On the equator the chain is exact for any number of states.' : 'More states follow the loop more closely.'}` : `γ_N for N = 3 to 60 (the same in every gauge), against the exact −\\(\\mathcal S\\)/2. γ_N is exactly −½ the solid angle of the great-circle polygon, ${fixed(C.poly / PI, 4)}π here; ${err < 1e-9 ? 'on this loop the arcs are the loop itself.' : 'it approaches the smooth loop like 1/N².'}`);
    legend('pb-legend', [[BLUE, '', 'γ_N'], [GOLD, 'swatch--dash', 'exact −\\(\\mathcal S\\)/2'], [INK, '', `N = ${N}`]]);
    const HINT = { smooth: 'Each state is |+n⟩ as written in tab 1: the phases change smoothly along the loop.', random: 'Each state is multiplied by its own random phase factor e<sup>iχ</sup>.', pt: 'Each phase is chosen so that ⟨u_j|u_{j+1}⟩ is real and positive: the video\'s parallel transport.' };
    put('cg-hint', HINT[S.cg]);
    $('reroll').hidden = S.cg !== 'random';
    setHTML($('info'), !deep ? (S.cg === 'pt' ? `<b>Parallel transport puts the whole phase, ${piTxt(L.link[N - 1])}, into the last link.</b> Every other step has no phase at all, so each hand is carried along without turning; only when the chain closes does the mismatch show up. You can move the Berry phase from link to link, but never get rid of it.`
      : S.cg === 'random' ? `<b>The links changed; the total did not: ${piTxt(g)}.</b> Each state's random phase enters once on the way in and once on the way out, and cancels. The phase without closing the loop, ${piTxt(B.wrap(open))}, does change: press "New random phases".`
      : `<b>${N} states give ${piTxt(g)} around the chain, against ${piTxt(C.exact)} for the smooth loop.</b> In this smooth choice of phases each link carries a small share, about ${piTxt(C.exact / N, 3)}.`)
      : S.cg === 'pt' ? `<b>Parallel transport moves the whole phase into the last link: ${piTxt(L.link[N - 1])}.</b> Every other overlap is real and positive, so each flag is carried along its arc without turning; back at state 1 it has turned, relative to state 1's own flag, by the polygon's solid angle, ${(() => { const t = ((C.poly % TAU) + TAU) % TAU; return t < 1e-6 || t > TAU - 1e-6 ? `${fixed(C.poly / PI, 3)}π: a whole number of turns, which leaves it pointing the same way` : `${fixed(C.poly / PI, 3)}π${Math.abs(C.poly) > TAU ? `, that is ${fixed(t / PI, 3)}π` : ''}`; })()}.`
      : S.cg === 'random' ? `<b>The links changed; γ<sub>N</sub> did not: ${piTxt(g)}.</b> Each state appears in the product once as a ket and once as a bra, so its random phase cancels. The open chain, ${piTxt(B.wrap(open))}, is not gauge invariant: press "New random phases" and it changes.`
      : `<b>${N} states give γ<sub>N</sub> = ${piTxt(g)}, against ${piTxt(C.exact)} for the smooth loop.</b> In this gauge each link carries a small share, about ${piTxt(C.exact / N, 3)} each, as the video's ⟨j|j+1⟩ ≈ 1 − iA·dk suggests.`);
    setHTML($('takeaway'), deep ? '<b>The gauge is a choice; the Berry phase is not.</b> Link phases, open paths and the connection change with the gauge. A closed loop\'s product, the projector trace and, in a crystal, the curvature do not: they are what experiments measure.' : '<b>The phases are your choice; the Berry phase is not.</b> Whatever phase you give each state, the total around a closed loop comes out the same, which is why it can be measured.');
  }

  // ---------- 3. Curvature in a crystal ----------
  const S3 = Math.sqrt(3), KX = 4 * PI / (3 * S3);
  const HEX = range(0, 5, 5).map(i => [KX * Math.cos(i * PI / 3), KX * Math.sin(i * PI / 3)]);
  const model = () => (S.model === 'qwz' ? { type: 'qwz', m: S.qm } : { type: 'hex', M: S.hm, t2: S.ht2, phi: S.hphi * DEG });
  const mkey = () => (S.model === 'qwz' ? `q${S.qm}` : `h${S.hm}|${S.ht2}|${S.hphi}`);
  const BOX = { qwz: [-1.15 * PI, 1.15 * PI, -1.15 * PI, 1.15 * PI], hex: [-3.05, 3.05, -2.7, 2.7] };
  const POINTS = {
    qwz: [{ k: [0, 0], text: 'Γ' }, { k: [PI, 0], text: 'X' }, { k: [PI, PI], text: 'M' }],
    hex: [{ k: [0, 0], text: 'Γ' }, { k: [KX, 0], text: 'K' }, { k: [KX / 2, 2 * PI / 3], text: 'K′' }, { k: [PI / S3, PI / 3], text: 'M' }],
  };
  // points where d_x = d_y = 0 (n = ±z), with the sign of d_z there
  function poles(md) {
    if (md.type === 'qwz') {
      const out = [];
      for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) out.push({ k: [a * PI, b * PI], dz: md.m - Math.cos(a * PI) - Math.cos(b * PI) });
      return out;
    }
    const mK = md.M - 3 * S3 * md.t2 * Math.sin(md.phi), mKp = md.M + 3 * S3 * md.t2 * Math.sin(md.phi);
    return HEX.map((k, i) => ({ k, dz: i % 2 ? mKp : mK }));
  }
  function gapInfo(md) {
    return memo(`gap|${mkey()}`, () => {
      const [o, a, b] = B.cell(md), n = 96;
      let direct = Infinity, top = -Infinity, bot = Infinity;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const k = [o[0] + (a[0] * i + b[0] * j) / n, o[1] + (a[1] * i + b[1] * j) / n], r = B.dvec(md, k), dd = Math.hypot(...r.d);
        direct = Math.min(direct, 2 * dd); top = Math.max(top, r.d0 - dd); bot = Math.min(bot, r.d0 + dd);
      }
      poles(md).forEach(p => { direct = Math.min(direct, 2 * Math.abs(p.dz)); });
      return { direct, indirect: bot - top };
    });
  }
  function sphereImage(md) {
    return memo(`img|${mkey()}`, () => {
      const lines = [], nl = 12, np = 90;
      if (md.type === 'qwz') {
        for (let i = 0; i < nl; i++) { const x = -PI + TAU * i / nl; lines.push(range(-PI, PI, np).map(y => B.unit(B.dvec(md, [x, y]).d))); lines.push(range(-PI, PI, np).map(y => B.unit(B.dvec(md, [y, x]).d))); }
      } else {
        const [, a, b] = B.cell(md);
        for (let i = 0; i < nl; i++) { const u = i / nl; lines.push(range(0, 1, np).map(v => B.unit(B.dvec(md, [u * a[0] + v * b[0], u * a[1] + v * b[1]]).d))); lines.push(range(0, 1, np).map(v => B.unit(B.dvec(md, [v * a[0] + u * b[0], v * a[1] + u * b[1]]).d))); }
      }
      return lines;
    });
  }
  function renderCrystal() {
    const md = model(), key = mkey(), r = S.rad, c = S.c, GZ = deep ? S.gauge : 'off';      // the connection only under "Go deeper"
    // the map
    map.opts.xLabel = 'Wavevector kx'; map.opts.yLabel = 'Wavevector ky';
    map.fit(BOX[S.model]);
    const box = [map.xr[0], map.xr[1], map.yr[0], map.yr[1]], nx = 150, ny = Math.round(150 * (box[3] - box[2]) / (box[1] - box[0]));
    const heat = memo(`heat|${key}|${box.map(v => v.toFixed(3)).join(',')}`, () => {
      // the colour scale follows the bulk of the map (its 97th percentile), so a narrow peak near a closing gap
      // saturates instead of washing everything else out
      const vals = [];
      for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) { const v = Math.abs(B.omega(md, [box[0] + (box[1] - box[0]) * (i + 0.5) / 60, box[2] + (box[3] - box[2]) * (j + 0.5) / 60])); if (Number.isFinite(v)) vals.push(v); }
      vals.sort((a, b) => a - b);
      const p97 = vals.length ? vals[Math.floor(0.97 * (vals.length - 1))] : 0;
      return { canvas: V.heatCanvas((x, y) => B.omega(md, [x, y]), box, nx, ny, Math.max(0.5 * p97, 1e-12)) };
    });
    const pl = poles(md), vort = GZ === 'off' ? [] : pl.filter(p => (GZ === 'N' ? p.dz <= 1e-12 : p.dz >= -1e-12)).map(p => p.k);
    let arrows = [];
    if (GZ !== 'off') {
      const n = 15, sp = (box[1] - box[0]) / n, raw = [];
      for (let i = 0; i < n; i++) for (let j = 0; j < Math.round(n * (box[3] - box[2]) / (box[1] - box[0])); j++) {
        const k = [box[0] + sp * (i + 0.5), box[2] + sp * (j + 0.5)], A = B.connection(md, k, GZ);
        if (Number.isFinite(A[0])) raw.push({ k, A, m: Math.hypot(A[0], A[1]) });
      }
      const ms = raw.map(q => q.m).sort((a, b) => a - b), ref = ms[Math.floor(0.8 * (ms.length - 1))] || 1;
      arrows = raw.map(q => { const s = Math.min(1, ref * 1.6 / Math.max(q.m, 1e-12)) * 0.75 * sp / Math.max(ref, 1e-12); return { k: q.k, a: [q.A[0] * s, q.A[1] * s] }; });
    }
    map.overlay = { zone: S.model === 'qwz' ? [[-PI, -PI], [PI, -PI], [PI, PI], [-PI, PI]] : HEX, arrows, vortices: vort, points: POINTS[S.model], loop: { c, r, color: INK } };
    map.draw([{ type: 'image', canvas: heat.canvas, x0: box[0], x1: box[1], y0: box[2], y1: box[3], smooth: true }]);
    // the numbers
    const C = memo(`C|${key}`, () => B.chern(md, 48)), gp = gapInfo(md), closed = gp.direct < 1e-6;
    const dirac = pl.filter(p => Math.abs(p.dz) < 1e-9), dist = p => Math.hypot(p.k[0] - c[0], p.k[1] - c[1]);
    const onLoop = dirac.some(p => Math.abs(dist(p) - r) < 0.01), encl = dirac.filter(p => dist(p) < r).length;
    const lk = `${key}|${c.join(',')}|${r}`, g0 = onLoop ? NaN : loopMemo(`g|${lk}`, () => B.loopPhaseConv(md, c, r)), g = g0 <= -PI + 1e-9 ? g0 + TAU : g0;
    const Cr = Math.round(C), fl = { flux: onLoop ? NaN : settled(`f|${lk}`, () => B.loopFlux(md, c, r)) }, wait = fl.flux === null;
    const loopSub = onLoop ? 'the loop passes through a gap closing' : wait ? 'working out the curvature inside…' : `${deep ? 'flux of Ω through it' : 'total curvature inside'}: ${piTxt(fl.flux)}`;
    if (!deep) stats([
      [`Chern number ${sym('C')}`, closed ? 'not defined' : String(Cr).replace('-', '−'), closed ? 'the gap is closed: a semimetal' : gp.indirect > 0 ? `Hall conductance ${Math.abs(Cr)} e²/h` : 'the bands overlap in energy: a metal'],
      ['Berry phase of the loop', onLoop ? '—' : piTxt(g), loopSub],
      ['Gap', `${fixed(gp.direct, 3)}${S.model === 'qwz' ? '' : ' t'}`, 'the smallest energy gap between the bands'],
    ]);
    else stats([
      [`Chern number ${sym('C')}`, closed ? 'not defined' : String(Cr).replace('-', '−'), closed ? 'the gap is closed' : 'lower band, from 48 × 48 plaquettes'],
      [`Hall conductance ${sym('|σ_{xy}|')}`, closed ? '—' : `${Math.abs(Cr)} e²/h`, closed ? 'no gap: a semimetal' : gp.indirect > 0 ? 'with the lower band full' : 'but the bands overlap: a metal'],
      ['The loop\'s Berry phase', onLoop ? '—' : piTxt(g), loopSub],
      ['Smallest gap', `${fixed(gp.direct, 3)}${S.model === 'qwz' ? '' : ' t'}`, S.model === 'qwz' ? '2|d| at its smallest, in the units of d' : '2|d|, in units of the hopping t'],
    ]);
    // the sphere: the image of the zone, and of the loop
    const lines = sphereImage(md), loopImg = range(0, TAU, 240).map(a => B.unit(B.dvec(md, [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]).d));
    sphere.draw({ curves: lines.map(pts => ({ pts, color: 'rgba(160, 110, 0, .45)', width: 1 })).concat([{ pts: loopImg, color: INK, width: 2.8 }]), dots: [{ v: loopImg[0], color: INK, r: 4 }] });
    $('sphere').setAttribute('aria-label', `The image of the Brillouin zone on the sphere of directions n = d/|d|${closed ? '' : `: it covers the sphere ${Math.abs(Cr)} time${Math.abs(Cr) === 1 ? '' : 's'} net`}`);
    $('map').setAttribute('aria-label', `Berry curvature over the Brillouin zone, red positive, blue negative; the loop is centred at kx = ${fixed(c[0], 2)}, ky = ${fixed(c[1], 2)}, radius ${fixed(r, 2)}. Drag on the map, or use the arrow keys, to move it.`);
    setHTML($('dg-title'), 'Berry curvature over the Brillouin zone');
    put('dg-cap', !deep ? `On the map: the Berry curvature of ${S.model === 'hex' ? 'graphene\'s' : 'the'} lower band (red positive, blue negative) over the Brillouin zone (dashed)${S.model === 'hex' ? ', whose corners are the valleys K and K′' : ''}, and your loop: tap or drag to move it. On the sphere: where the electron's state points at each k; the black curve is your loop, and the grid the whole zone.` : `On the map: the Berry curvature Ω(k) of the lower band (red positive, blue negative; the colour saturates at the strongest peaks), the Berry connection${GZ === 'off' ? '' : ` in gauge ${GZ} (arrows), its vortices (⊗), where that gauge fails,`} and the loop, which you can drag. The dashed outline is the Brillouin zone. On the sphere: each k sent to the direction n = d/|d|; the grid is the image of the zone, the black curve the image of the loop.`);
    legend('dg-legend', [[RED, 'swatch--area', 'Ω > 0'], [BLUE, 'swatch--area', 'Ω < 0'], [INK, '', 'the loop and its image'], [GOLD, '', 'image of the zone']]);
    // plot A: where C changes
    reset(plotA);
    if (S.model === 'qwz') {
      plotA.opts.xLabel = 'Mass m'; plotA.opts.yLabel = 'Chern number C';
      plotA.setRange([-3, 3], [-1.5, 1.5]); plotA.opts.zeroLine = true;
      const xs = range(-3, 3, 600), cs = xs.map(m => (m > 0 && m < 2 ? -1 : m < 0 && m > -2 ? 1 : 0));
      plotA.draw([
        { type: 'vline', x: -2, color: GREY, dash: [4, 4] }, { type: 'vline', x: 0, color: GREY, dash: [4, 4] }, { type: 'vline', x: 2, color: GREY, dash: [4, 4] },
        { type: 'line', x: xs, y: cs, color: GOLD, width: 2.6 },
        { type: 'dots', x: [S.qm], y: [closed ? NaN : Cr], color: INK, r: 5.5 },
      ]);
      setHTML($('pa-title'), 'C changes only where the gap closes');
      put('pa-cap', 'The Chern number of the lower band against the mass m. It jumps at m = −2, 0 and 2 (dashed), where the gap closes at M, at X and Y, and at Γ; the dot is this model, from the plaquette sum.');
      legend('pa-legend', [[GOLD, '', 'C(m)'], [GREY, 'swatch--dash', 'gap closes'], ...(closed ? [] : [[INK, '', 'this model']])]);
    } else if (!deep) {
      // C against the substrate's mass, for this kind of graphene
      const h = 3 * S3 * S.ht2 * Math.sin(S.hphi * DEG), xs = range(-1, 1, 800), cs = xs.map(M => (Math.sign(M + h) - Math.sign(M - h)) / 2);
      plotA.opts.xLabel = 'Mass M from the substrate (units of t)'; plotA.opts.yLabel = 'Chern number C';
      plotA.setRange([-1, 1], [-1.5, 1.5]); plotA.opts.zeroLine = true;
      const cuts = Math.abs(h) > 1e-9 ? [-Math.abs(h), Math.abs(h)] : [0];
      plotA.draw(cuts.map(x => ({ type: 'vline', x, color: GREY, dash: [4, 4] })).concat([
        { type: 'line', x: xs, y: cs.map((v, i) => (cuts.some(x => Math.abs(xs[i] - x) < 1e-9) ? NaN : v)), color: GOLD, width: 2.6 },
        { type: 'dots', x: [S.hm], y: [closed ? NaN : Cr], color: INK, r: 5.5 },
      ]));
      setHTML($('pa-title'), 'C changes only where the gap closes');
      put('pa-cap', Math.abs(h) > 1e-9 ? `The Chern number against the substrate's mass M, for this kind of graphene. Between M = ±${fixed(Math.abs(h), 2)} t (dashed), Haldane's hopping wins and C = ${Math.sign(h) > 0 ? 1 : '−1'}; beyond, the substrate wins and C = 0. At the dashed lines the gap closes, the only way a whole number can change. The dot is the graphene above.` : 'The Chern number against the substrate\'s mass M. Without Haldane\'s hopping, C = 0 for any mass; the gap closes only at M = 0 (dashed), plain graphene. The dot is the graphene above.');
      legend('pa-legend', [[GOLD, '', 'C'], [GREY, 'swatch--dash', 'gap closes'], ...(closed ? [] : [[INK, '', 'this graphene']])]);
    } else {
      plotA.opts.xLabel = 'Haldane phase φ (degrees)'; plotA.opts.yLabel = 'Sublattice mass M'; plotA.opts.xTickValues = [-180, -90, 0, 90, 180];
      plotA.setRange([-180, 180], [-1, 1]); plotA.opts.zeroLine = true;
      const ph = range(-180, 180, 180);
      const LA = [];
      if (S.ht2 > 0) {
        const up = ph.filter(p => p >= 0), dn = ph.filter(p => p <= 0), f = p => 3 * S3 * S.ht2 * Math.sin(p * DEG);
        LA.push({ type: 'poly', x: up.concat(up.slice().reverse()), y: up.map(f).concat(up.slice().reverse().map(p => -f(p))), fill: 'rgba(194, 55, 47, .18)', color: RED, width: 1.6 });
        LA.push({ type: 'poly', x: dn.concat(dn.slice().reverse()), y: dn.map(f).concat(dn.slice().reverse().map(p => -f(p))), fill: 'rgba(31, 111, 180, .18)', color: BLUE, width: 1.6 });
        const hgt = 3 * S3 * S.ht2;
        if (hgt > 0.12) LA.push({ type: 'text', x: 90, y: 0.06, text: 'C = 1', color: RED, size: 12.5, weight: 700 }, { type: 'text', x: -90, y: 0.06, text: 'C = −1', color: BLUE, size: 12.5, weight: 700 });
        if (hgt < 0.85) LA.push({ type: 'text', x: 0, y: 0.82, text: 'C = 0', color: MUTED, size: 12.5, weight: 700 });
      } else LA.push({ type: 'text', x: 0, y: 0.62, text: 't₂ = 0: no Haldane term,', color: MUTED, size: 12.5 }, { type: 'text', x: 0, y: 0.44, text: 'C = 0 whenever M ≠ 0', color: MUTED, size: 12.5 });
      LA.push({ type: 'dots', x: [S.hphi], y: [S.hm], color: INK, r: 5.5 });
      plotA.draw(LA);
      setHTML($('pa-title'), 'Haldane\'s phase diagram');
      put('pa-cap', `The Chern number over the plane of φ and M, at t_2 = ${fixed(S.ht2, 3)} t. The boundaries, M = ±3√3 t_2 sin φ, are where the gap closes at K or K′: inside, the two valleys' curvature has the same sign and C = ±1; outside, opposite signs and C = 0. The dot is this model.`);
      legend('pa-legend', [...(S.ht2 > 0 ? [[RED, 'swatch--area', 'C = 1'], [BLUE, 'swatch--area', 'C = −1']] : []), [INK, '', 'this model']]);
    }
    // plot B: the bands along a path
    reset(plotB);
    const path = S.model === 'qwz' ? [[[0, 0], 'Γ'], [[PI, 0], 'X'], [[PI, PI], 'M'], [[0, 0], 'Γ']] : [[[0, 0], 'Γ'], [[KX, 0], 'K'], [[PI / S3, PI / 3], 'M'], [[KX / 2, 2 * PI / 3], 'K′'], [[0, 0], 'Γ']];
    const ks = [], xs = [], marks = []; let s = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const [a] = path[i], [b] = path[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(20, Math.round(L * 60));
      marks.push([s, path[i][1]]);
      for (let j = (i ? 1 : 0); j <= n; j++) { ks.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]); xs.push(s + L * j / n); }
      s += L;
    }
    marks.push([s, path[path.length - 1][1]]);
    const E = B.bands(md, ks), lo = Math.min(...E.map(e => e[0])), hi = Math.max(...E.map(e => e[1])), pad = 0.08 * (hi - lo);
    plotB.opts.xLabel = 'Along the path'; plotB.opts.yLabel = S.model === 'qwz' ? 'Energy' : 'Energy (units of t)';
    plotB.opts.xTickValues = marks.map(m => m[0]); plotB.opts.xFormat = v => { const m = marks.find(q => Math.abs(q[0] - v) < 1e-9); return m ? m[1] : ''; };
    plotB.setRange([0, s], [lo - pad, hi + pad]); plotB.opts.zeroLine = true;
    plotB.draw(marks.slice(1, -1).map(m => ({ type: 'vline', x: m[0], color: GREY, dash: [3, 3] })).concat([
      { type: 'line', x: xs, y: E.map(e => e[1]), color: GREY, width: 2.2 },
      { type: 'line', x: xs, y: E.map(e => e[0]), color: GOLD, width: 2.6 },
    ]));
    setHTML($('pb-title'), closed ? 'The bands touch' : 'Two bands and the gap between them');
    put('pb-cap', !deep ? `The two energy bands along a path through the zone, ${path.map(p => p[1]).join('–')}. The lower one (gold) is the band whose curvature is mapped; ${S.model === 'hex' ? 'the gap is smallest at the valleys K and K′.' : 'the gap is smallest at Γ, X or M.'}` : `The two bands, d_0 ± |d|, along the path ${path.map(p => p[1]).join('–')}. The lower one (gold) is the band whose curvature is mapped${S.model === 'hex' && S.ht2 > 0 && Math.abs(Math.cos(S.hphi * DEG)) > 0.01 ? '; Haldane\'s hopping also shifts the bands up and down (d_0), which can make them overlap in energy without closing the gap at any one k' : ''}.`);
    legend('pb-legend', [[GOLD, '', 'lower band'], [GREY, '', 'upper band']]);
    // what the loop shows
    // a vortex of the chosen gauge on the loop itself makes ∮A·dk undefined there
    const gz = GZ === 'off' ? null : GZ, vOn = gz && vort.some(k => Math.abs(Math.hypot(k[0] - c[0], k[1] - c[1]) - r) < 2e-3);
    const Aint = gz && !onLoop && !vOn && !wait ? loopMemo(`a${gz}|${lk}`, () => B.loopA(md, c, r, gz)) : NaN, diff = Math.round((Aint - fl.flux) / TAU);
    let info;
    if (onLoop) info = '<b>The loop runs through a point where the gap closes,</b> so the state, and its phase, are not defined all the way round. Move it or change its size.';
    else if (S.model === 'hex' && S.hm === 0 && S.ht2 === 0) info = `<b>Plain graphene has no gap: the curvature is zero everywhere except at K and K′,</b> where all of it sits in a point. A loop around one of them picks up ${encl ? piTxt(g) : 'π'} all the same: the Berry phase of a Dirac cone, which shows up in graphene's half-integer quantum Hall effect.${encl ? '' : ' Move the loop onto K or K′ to see it.'}`;
    else if (wait) info = `<b>The loop's Berry phase is ${piTxt(g)}.</b> Working out the ${deep ? 'flux of Ω through it' : 'curvature inside it'}…`;
    else if (encl) info = `<b>The gap closes at a point inside the loop.</b> There Ω is not defined: the loop's Berry phase, ${piTxt(g)}, includes what sits at that point, while the flux of Ω around it, ${piTxt(fl.flux)}, misses it.`;
    else if (!deep) info = `<b>The loop's Berry phase, ${piTxt(g)}, equals the total Berry curvature inside it, ${piTxt(fl.flux)}${Math.abs(B.wrap(g - fl.flux)) < 1e-3 && Math.abs(g - fl.flux) > 1 ? ', up to a full turn' : ''}.</b> That is what curvature means: Berry phase per unit area. Move the loop around the zone and watch where the phase comes from.`;
    else {
      info = `<b>Stokes: the loop's Berry phase, ${piTxt(g)}, is the flux of Ω through it, ${piTxt(fl.flux)}${Math.abs(B.wrap(g - fl.flux)) < 1e-3 && Math.abs(g - fl.flux) > 1 ? ', mod 2π' : ''}.</b>`;
      if (vOn) info += ` The loop runs through a vortex of gauge ${gz}, where its connection is not defined, so ∮A·dk is not either.`;
      else if (gz) info += diff === 0 ? ` In gauge ${gz}, ∮A·dk = ${piTxt(Aint)} too: no vortex of gauge ${gz} is inside the loop.` : ` But in gauge ${gz}, ∮A·dk = ${piTxt(Aint)}: it differs from the flux by ${Math.abs(diff) === 1 ? '' : Math.abs(diff)}2π, because the loop encloses a vortex of gauge ${gz}, where that gauge is not smooth. The Berry phase itself does not notice, only the gauge does.`;
    }
    setHTML($('info'), info);
    setHTML($('takeaway'), closed ? '<b>Where the gap closes, the Chern number is not defined:</b> this is the only way an integer like C can change.'
      : !deep ? (Cr ? `<b>C = ${String(Cr).replace('-', '−')}: the electron's states wrap the sphere ${Math.abs(Cr) === 1 ? 'once' : `${Math.abs(Cr)} times`}.</b> The band's curvature adds up to ${Math.abs(Cr) === 1 ? '' : Math.abs(Cr)}2π, and a full band then has a Hall conductance of exactly ${Math.abs(Cr) === 1 ? '' : Math.abs(Cr)} e²/h, with no magnetic field: a Chern insulator.` : '<b>C = 0: the curvature adds up to zero.</b> It is positive in one place and negative in another, for graphene in one valley and the other, and the total cancels: no Hall effect.')
      : Cr ? `<b>C = ${String(Cr).replace('-', '−')}: the zone's image wraps the sphere ${Math.abs(Cr) === 1 ? 'once' : `${Math.abs(Cr)} times`}.</b> So n(k) points straight down somewhere, where gauge N fails, and straight up somewhere else, where gauge S fails: no single gauge is smooth over the whole zone. The total curvature, 2πC, is the mismatch between the two, and it is what fixes the Hall conductance of the full band at |C| e²/h.`
      : '<b>C = 0: the zone\'s image does not wrap the sphere.</b> There may be plenty of curvature, positive in one place and negative in another, but it adds up to zero, and a single gauge can be smooth over the whole zone.');
    $('model-hint').innerHTML = S.model === 'qwz' ? 'A square lattice with two orbitals: d = (sin k<sub>x</sub>, sin k<sub>y</sub>, m − cos k<sub>x</sub> − cos k<sub>y</sub>).' : deep ? 'Graphene\'s two sublattices, with a mass M on them and Haldane\'s complex second-neighbour hopping t<sub>2</sub>e<sup>±iφ</sup>.' : 'Carbon atoms on a honeycomb, two in each cell. Pick a kind of graphene:';
    $('gauge-hint').textContent = S.gauge === 'off' ? 'The curvature does not depend on a gauge; the connection does.' : `Gauge ${S.gauge} fails, with a vortex (⊗), wherever n points ${S.gauge === 'N' ? 'down, n = −z' : 'up, n = +z'}.`;
  }

  // dragging the loop on the map
  (function () {
    const cv = $('map');
    let drag = false;
    const keep = k => { const bx = BOX[S.model]; return [+clamp(k[0], bx[0], bx[1]).toFixed(3), +clamp(k[1], bx[2], bx[3]).toFixed(3)]; };
    const at = e => { const b = cv.getBoundingClientRect(); S.c = keep(map.toK(e.clientX - b.left, e.clientY - b.top)); later(); };
    cv.addEventListener('pointerdown', e => { if (mode !== 'crystal') return; drag = true; cv.setPointerCapture(e.pointerId); at(e); });
    cv.addEventListener('pointermove', e => { if (drag) at(e); });
    const end = () => { drag = false; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('keydown', e => {
      const d = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] }[e.key];
      if (!d) return;
      e.preventDefault(); S.c = keep([S.c[0] + d[0], S.c[1] + d[1]]); later();
    });
  })();

  // ---------- controls ----------
  function syncControls() {
    const set = (id, v, txt) => { $(id).value = v; $(id + '-out').textContent = txt; $(id).setAttribute('aria-valuetext', txt); };
    const per = nL();
    const speed = per <= 2 ? 'fast' : per <= 10 ? 'medium' : per <= 100 ? 'slow' : 'very slow';
    set('thc', S.thc, `${S.thc}°`); set('per', NICE.indexOf(Math.round(per * 10) / 10), deep ? `${+per.toPrecision(4)} Larmor period${per === 1 ? '' : 's'}` : `${speed} · ${+per.toPrecision(4)} wobble${per === 1 ? '' : 's'}`); set('nn', S.N, String(S.N)); set('dphi', S.dphi, `${S.dphi}°`);
    set('qm', S.qm, fixed(S.qm, 2)); set('hm', S.hm, `${fixed(S.hm, 2)} t`); set('ht2', S.ht2, `${fixed(S.ht2, 3)} t`); set('hphi', S.hphi, `${S.hphi}°`); set('rad', S.rad, fixed(S.rad, 2));
    $('thc-hint').textContent = mode === 'loop' ? `Area enclosed (solid angle): ${fixed(solid(S.thc * DEG) / PI, 3)}π of the sphere's 4π.` : '';
    document.querySelectorAll('[data-depth]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.depth === 'deep') === deep)));
    $('depth-hint').textContent = deep ? 'Every control: gauges, the connection, a second crystal, the full formulas.' : 'The main ideas; switch to Go deeper for gauges, connections and a second crystal.';
    const lune = mode === 'chain' && S.shape === 'lune';
    $('thc-ctrl').hidden = lune; $('dphi-ctrl').hidden = !lune; $('thc-chips').hidden = lune;
    $('qwz-ctrls').hidden = S.model !== 'qwz'; $('hex-ctrls').hidden = S.model !== 'hex';
    document.querySelectorAll('[data-thc]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.thc === S.thc)));
    const pressed = (attr, val) => document.querySelectorAll(`button[data-${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === val)));
    pressed('shape', S.shape); pressed('cg', S.cg); pressed('model', S.model); pressed('gauge', S.gauge);
    const cs = (S.model === 'qwz' ? POINTS.qwz : POINTS.hex);
    if ($('centres').dataset.model !== S.model) { $('centres').dataset.model = S.model; $('centres').innerHTML = cs.map((p, i) => `<button class="chip-btn" type="button" data-at="${i}">Centre on ${p.text}</button>`).join(''); }
    document.querySelectorAll('#centres [data-at]').forEach(b => { const p = cs[+b.dataset.at]; b.setAttribute('aria-pressed', String(Math.abs(p.k[0] - S.c[0]) < 1e-6 && Math.abs(p.k[1] - S.c[1]) < 1e-6)); });
    const PRE = presets();
    document.querySelectorAll('[data-preset]').forEach(b => { const p = PRE[b.dataset.preset]; b.setAttribute('aria-pressed', String(Object.keys(p).every(k => S[k] === p[k]))); });
  }
  function presets() {
    return {
      qtopo: { model: 'qwz', qm: 1 }, qtriv: { model: 'qwz', qm: 3 },
      gapped: { model: 'hex', hm: 0.2, ht2: 0 }, haldane: { model: 'hex', hm: 0, ht2: 0.1, hphi: 90 }, gapless: { model: 'hex', hm: 0, ht2: 0 },
    };
  }
  function render() {
    syncControls();
    if (mode === 'loop') renderLoop(); else if (mode === 'chain') renderChain(); else renderCrystal();
    $('info').setAttribute('aria-live', mode === 'loop' && playing ? 'off' : 'polite');
    $('plot-a').setAttribute('aria-label', $('pa-title').textContent); $('plot-b').setAttribute('aria-label', $('pb-title').textContent);
  }
  function applyMode() {
    if (mode !== 'loop') stop();
    document.querySelectorAll('.tab').forEach(b => { const on = b.dataset.mode === mode; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $('lab').setAttribute('aria-labelledby', 'tab-' + mode);
    document.querySelectorAll('.mode-intro').forEach(el => { el.hidden = el.dataset.for !== mode; });
    // shown in this tab, and at this depth (data-deep marks what only "Go deeper" shows)
    document.querySelectorAll('[data-modes], [data-deep]').forEach(el => { el.hidden = !((!el.dataset.modes || el.dataset.modes.split(' ').includes(mode)) && (!('deep' in el.dataset) || deep)); });
    $('dial-box').hidden = mode === 'crystal'; $('map-box').hidden = mode !== 'crystal';
    $('mag-view').classList.toggle('mag-view--swap', mode === 'crystal');
    render();
  }
  let pending = false;
  function later() { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; render(); }); }
  const onTune = () => { if (mode === 'loop') stop(); later(); };
  function setDepth(d) {
    deep = d;
    try { localStorage.setItem('berry-depth', d ? 'deep' : 'simple'); } catch (e) { /* not remembered: fine */ }
    // the essentials use graphene and circular loops only
    if (!deep) { S.shape = 'circle'; if (S.model !== 'hex') { S.model = 'hex'; S.c = POINTS.hex[1].k.slice(); } }
    applyMode();
  }
  document.querySelectorAll('[data-depth]').forEach(b => b.addEventListener('click', () => setDepth(b.dataset.depth === 'deep')));
  $('per').addEventListener('input', e => { S.logT = Math.log10(NICE[+e.target.value]); onTune(); });
  [['thc', 'thc'], ['nn', 'N'], ['dphi', 'dphi'], ['qm', 'qm'], ['hm', 'hm'], ['ht2', 'ht2'], ['hphi', 'hphi'], ['rad', 'rad']].forEach(([id, key]) => $(id).addEventListener('input', e => { S[key] = +e.target.value; onTune(); }));
  document.querySelector('.lab-main').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !b.closest('.controls')) return;
    const d = b.dataset;
    if (d.thc) S.thc = +d.thc;
    else if (d.shape) S.shape = d.shape;
    else if (d.cg) S.cg = d.cg;
    else if (b.id === 'reroll') S.seed++;
    else if (d.model) { if (S.model !== d.model) { S.model = d.model; S.c = d.model === 'hex' ? POINTS.hex[1].k.slice() : [0, 0]; } }
    else if (d.preset) { const p = presets()[d.preset]; if (p.model !== S.model) S.c = p.model === 'hex' ? POINTS.hex[1].k.slice() : [0, 0]; Object.assign(S, p); }
    else if (d.at !== undefined && d.at !== '') S.c = (S.model === 'qwz' ? POINTS.qwz : POINTS.hex)[+d.at].k.slice();
    else if (d.gauge) S.gauge = d.gauge;
    else if (b.id === 'video-values') { Object.assign(S, JSON.parse(JSON.stringify(START))); pos = 1; veil = false; }
    else return;
    onTune();
  });
  $('reset-view').addEventListener('click', () => sphere.setView(32 * DEG, 22 * DEG));
  const tabs = Array.from(document.querySelectorAll('.tab'));
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => { mode = b.dataset.mode; veil = false; applyMode(); });
    b.addEventListener('keydown', e => {
      const to = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault(); tabs[to].focus(); tabs[to].click();
    });
  });

  // ---------- predict-first loaders ----------
  const fresh = o => Object.assign(S, JSON.parse(JSON.stringify(START)), o);
  const K = POINTS.hex[1].k;
  const QUESTIONS = {
    q1: () => { mode = 'loop'; fresh({ thc: 90, logT: 2 }); stop(); pos = 0; veil = true; },
    q2: () => { mode = 'loop'; fresh({ thc: 60, logT: 0 }); stop(); pos = 0; veil = true; },
    q3: () => { mode = 'loop'; fresh({ thc: 120, logT: 2 }); stop(); pos = 0; veil = true; },
    q4: () => { mode = 'chain'; fresh({ thc: 90, N: 3 }); },
    q5: () => { mode = 'chain'; fresh({ thc: 60, N: 8, cg: 'random' }); },
    q6: () => { mode = 'chain'; fresh({ thc: 60, N: 8, cg: 'pt' }); },
    q7: () => { mode = 'crystal'; fresh({ model: 'hex', hm: 0.2, ht2: 0, c: K.slice(), rad: 0.8 }); },
    q8: () => { mode = 'crystal'; fresh({ model: 'hex', hm: 0, ht2: 0.1, hphi: 90, c: K.slice(), rad: 0.8 }); },
  };
  document.querySelectorAll('.predict__load[data-q]').forEach(b => b.addEventListener('click', () => {
    QUESTIONS[b.dataset.q]();
    applyMode();
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }));

  applyMode();
  window.__berry = { S, render, cache, setMode: m => { mode = m; applyMode(); } };
})();
