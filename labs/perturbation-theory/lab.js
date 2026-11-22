/* Perturbation theory: controls, animation and plots. The physics is in physics.js. */
(function () {
  'use strict';
  const P = window.PT;
  const $ = id => document.getElementById(id);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // each kind of push: the slider's range, its starting value, and what it is
  const KIND = {
    tilt: { max: 30, step: 0.25, start: 5, word: 'tilt', hint: 'An electric field across the box: the potential falls steadily from one wall to the other, by s in all.' },
    bump: { max: 40, step: 0.5, start: 10, word: 'bump', hint: 'A thin barrier of height s across the middle tenth of the box.' },
    step: { max: 12, step: 0.1, start: 2, word: 'step', hint: 'The right half of the box raised by s, as if it were made of a different material.' },
  };
  const START = { kind: 'tilt', s: 5, n: 1, order: 1, det: 1, cpl: 0.2 };
  const S = JSON.parse(JSON.stringify(START));
  let mode = 'energy';
  let deep = false;
  try { deep = localStorage.getItem('perturb-depth') === 'deep'; } catch (e) { /* storage blocked: start simple */ }
  const INK = '#14232c', BLUE = '#1f6fb4', ORANGE = '#b35900', GREEN = '#2e7d32', GREY = '#5f7382', LIGHT = '#c3ced5', RED = '#c2372f', VIOLET = '#5b45b0', MUTED = '#5f7382';
  const ORDER_COL = [GREY, ORANGE, GREEN, BLUE];

  // ---------- formatting and page helpers ----------
  const fixed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const pct = x => `${(100 * x).toFixed(1)}%`;
  const sub = t => String(t).replace(/\^\((\d)\)/g, (m, d) => `⁽${'⁰¹²³⁴⁵⁶⁷⁸⁹'[d]}⁾`).replace(/_\{([^}]*)\}|_([A-Za-z0-9])/g, (m, a, b) => `<sub>${a || b}</sub>`);
  const range = (a, b, k) => Array.from({ length: k + 1 }, (_, i) => a + (b - a) * i / k);
  const trim = v => String(Math.round(v * 100) / 100).replace('-', '−');
  // formulas inside the capitalised stat labels keep their case (δ must not turn into Δ)
  const sym = t => `<span class="sym">${t}</span>`;
  const ORD = ['zeroth', 'first', 'second'];
  function stats(items) {
    $('stats').className = `stats stats--${items.length} stats--steady stats--wrap`;
    $('stats').innerHTML = items.map(([label, value, s2]) => `<div class="stat"><div class="stat__label">${sub(label)}</div><div class="stat__value">${sub(value)}</div><div class="stat__sub">${sub(s2)}</div></div>`).join('');
  }
  function typeset(el) { if (window.MathJax && MathJax.typesetPromise && /\\\(/.test(el.innerHTML)) MathJax.typesetPromise([el]).catch(() => {}); }
  function setHTML(el, html) { if (el.dataset.html === html) return; el.dataset.html = html; el.innerHTML = html; typeset(el); }
  const put = (id, t) => setHTML($(id), sub(t));
  function legend(id, items) { setHTML($(id), items.map(([c, k, l]) => `<li style="color:${c}"><span class="swatch ${k}"></span><span>${sub(l)}</span></li>`).join('')); }
  const MARGIN = { l: 58, r: 18, t: 12, b: 42 };
  const scene = new NanoPlot($('scene'), { margin: { l: 56, r: 10, t: 12, b: 40 }, narrowMargin: { l: 54, r: 8 } });
  const side = new NanoPlot($('side'), { margin: { l: 62, r: 10, t: 12, b: 40 }, narrowMargin: { l: 60, r: 8 } });
  const plotA = new NanoPlot($('plot-a'), { margin: MARGIN, narrowMargin: { l: 56, r: 12 } });
  const plotB = new NanoPlot($('plot-b'), { margin: { l: 64, r: 18, t: 12, b: 42 }, narrowMargin: { l: 60, r: 12 } });
  const reset = pl => { pl.opts.xTickValues = null; pl.opts.xFormat = null; pl.opts.yFormat = null; pl.opts.zeroLine = false; pl.opts.xTicks = 6; pl.opts.yTicks = 5; };
  const alpha = (hex, a) => { const v = parseInt(hex.slice(1), 16); return `rgba(${v >> 16}, ${(v >> 8) & 255}, ${v & 255}, ${a})`; };
  // keep far-off values from reaching the canvas as huge numbers; the plot clips at its edges anyway
  const tame = (ys, lo, hi) => { const span = hi - lo; return ys.map(y => (Number.isFinite(y) ? Math.max(lo - span, Math.min(hi + span, y)) : NaN)); };
  const cache = new Map();
  function memo(key, fn) { let v; if (cache.has(key)) { v = cache.get(key); cache.delete(key); } else v = fn(); cache.set(key, v); if (cache.size > 60) cache.delete(cache.keys().next().value); return v; }

  // ---------- the animation: the push is switched on from zero, then a pause on the full strength ----------
  const LAP = 4, HOLD = 2;
  let animOn = !reduceMotion, animT0 = performance.now(), animRaf = 0, seen = true, frameFn = null, lastF = null;
  const running = () => animOn && !document.hidden && seen && !!frameFn;
  // a frame can be stamped a moment before the animation (re)started: never let the fraction go below 0
  const animFrac = now => Math.max(0, Math.min(1, (((now - animT0) / 1000) % (LAP + HOLD)) / LAP));
  // the fraction in steps of 1%, so that each exact solution is computed once and then reused
  const quant = f => Math.round(f * 100) / 100;
  // only redraw when the (quantised) strength has changed: the hold at full strength costs nothing
  function tick(now) { animRaf = 0; if (!running()) return; const f = quant(animFrac(now)); if (f !== lastF) { lastF = f; frameFn(f); } animRaf = requestAnimationFrame(tick); }
  function kick() { if (running() && !animRaf) animRaf = requestAnimationFrame(tick); }
  function syncAnim() { $('anim').textContent = animOn ? '❚❚ Pause' : '▶ Animate'; $('anim').setAttribute('aria-pressed', String(animOn)); }
  $('anim').addEventListener('click', () => { animOn = !animOn; if (animOn) animT0 = performance.now(); syncAnim(); if (!animOn && frameFn) { lastF = 1; frameFn(1); } kick(); });
  document.addEventListener('visibilitychange', kick);
  // the diagram and the plots below it all move, so watch the whole lab, not just the diagram
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { seen = es[0].isIntersecting; kick(); }).observe($('lab'));
  const nowF = () => (running() ? quant(animFrac(performance.now())) : 1);

  /* ================= the box: shared pieces ================= */
  const XS = range(0, 1, 240);
  const W0 = P.BUMP / 2;
  function potLine(kind, s) {
    if (kind === 'tilt') return { x: [0, 1], y: [-s / 2, s / 2] };
    if (kind === 'bump') return { x: [0, 0.5 - W0, 0.5 - W0, 0.5 + W0, 0.5 + W0, 1], y: [0, 0, s, s, 0, 0] };
    return { x: [0, 0.5, 0.5, 1], y: [0, 0, s, s] };
  }
  const potRange = (kind, s) => (kind === 'tilt' ? [-s / 2, s / 2] : [0, s]);
  // energies against strength, for plot A of the first tab; and the overlaps, for the second
  function energyCurves(kind, n) {
    return memo(`ec|${kind}|${n}`, () => {
      const ss = range(0, KIND[kind].max, 60), ex = [], p1 = [], p2 = [];
      ss.forEach(s => { const X = P.exact(kind, s), T = P.series(kind, n, s); ex.push(X.E[n - 1]); p1.push(T.E0 + T.E1); p2.push(T.E0 + T.E1 + T.E2); });
      return { ss, ex, p1, p2 };
    });
  }
  function stateCurves(kind, n) {
    return memo(`sc|${kind}|${n}`, () => {
      const ss = range(0, KIND[kind].max, 60), ov = [[], [], []], shEx = [], shPT = [];
      ss.forEach(s => {
        const ex = P.exactCoeffs(kind, n, s);
        for (let o = 0; o < 3; o++) ov[o].push(P.overlap2(ex, P.coeffs(kind, n, s, o)));
        const v = P.exact(kind, s).vecs[n - 1];
        shEx.push(v[n - 1] * v[n - 1]); shPT.push(1 / P.series(kind, n, s).len2);
      });
      return { ss, ov, shEx, shPT };
    });
  }
  const maxRatio = T => T.c1.reduce((a, c) => Math.max(a, Math.abs(c)), 0);

  /* ================= 1. Energies, order by order ================= */
  let view1 = null;                                      // ranges fixed for the whole animation
  function energyFrame(f) {
    const lam = f * S.s, n = S.n, X = P.exact(S.kind, lam), T = P.series(S.kind, n, lam), V = view1;
    // the box: walls, the push, the levels and the state on its level
    const pl = potLine(S.kind, lam), kmax = Math.min(n + 1, 6), layers = [];
    layers.push({ type: 'line', x: pl.x, y: pl.y, color: VIOLET, width: 2, fill: alpha(VIOLET, 0.13), fillTo: 0 });
    // level labels, nudged apart where levels crowd together
    let ly = -Infinity;
    for (let k = 1; k <= kmax; k++) {
      layers.push({ type: 'line', x: [0, 1], y: [X.E[k - 1], X.E[k - 1]], color: k === n ? BLUE : LIGHT, width: k === n ? 2 : 1.2 });
      ly = Math.max(X.E[k - 1] + V.th / 2, ly + V.th * 1.05);
      layers.push({ type: 'text', x: 1.035, y: ly, text: `n = ${k}`, align: 'left', size: 11, color: k === n ? BLUE : MUTED });
    }
    layers.push({ type: 'line', x: [0, 1], y: [n * n, n * n], color: GREY, width: 1.2, dash: [5, 4] });
    const psi = P.wave(P.exact(S.kind, lam).vecs[n - 1], XS, true);
    layers.push({ type: 'line', x: XS, y: Array.from(psi, v => X.E[n - 1] + V.amp * v), color: BLUE, width: 2.2 });
    layers.push({ type: 'line', x: [0, 0], y: [V.lo, V.hi], color: INK, width: 3 }, { type: 'line', x: [1, 1], y: [V.lo, V.hi], color: INK, width: 3 });
    if (f < 1) layers.push({ type: 'text', x: 0.03, y: V.hi - V.th * 0.3, text: `switching on: s = ${trim(lam)}`, align: 'left', size: 11.5, color: VIOLET });
    scene.opts.xLabel = 'Position x / L'; scene.opts.yLabel = 'Energy (E₁)'; scene.opts.xTickValues = [0, 0.5, 1]; scene.opts.xFormat = null;
    scene.setRange([-0.06, 1.2], [V.lo, V.hi]);
    scene.draw(layers);
    // the ladder of corrections for level n
    const vals = [T.E0, T.E0 + T.E1, T.E0 + T.E1 + T.E2, X.E[n - 1]], L2 = [];
    vals.forEach((v, i) => {
      if (i < 3) L2.push({ type: 'line', x: [i + 0.3, i + 0.7], y: [v, vals[i + 1]], color: '#9fb3bd', width: 1.2, dash: [3, 3] });
      L2.push({ type: 'line', x: [i - 0.3, i + 0.3], y: [v, v], color: ORDER_COL[i], width: 4 });
      L2.push({ type: 'text', x: i, y: v + V.lth * 1.15, text: fixed(v, 3), size: 11, color: ORDER_COL[i] });
    });
    side.opts.xLabel = ''; side.opts.yLabel = `Energy of level ${n} (E₁)`; side.opts.xTickValues = [0, 1, 2, 3]; side.opts.zeroLine = false;
    side.opts.xFormat = v => ['E⁽⁰⁾', '+ 1st', '+ 2nd', 'exact'][Math.round(v)] || '';
    side.setRange([-0.6, 3.6], [V.llo, V.lhi]);
    side.draw(L2);
    // plot A: the dot at the current strength
    plotA.draw(V.pa.concat([{ type: 'dots', x: [lam, lam], y: [T.E0 + T.E1 + T.E2, X.E[n - 1]], colors: [GREEN, BLUE], r: 5 }]));
  }
  function renderEnergy() {
    const n = S.n, s = S.s, X = P.exact(S.kind, s), T = P.series(S.kind, n, s), E0 = T.E0, p1 = E0 + T.E1, p2 = p1 + T.E2, ex = X.E[n - 1];
    const mr = maxRatio(T), err = Math.abs(ex - p2);
    // the scene's range covers both ends of the animation, so that it does not jump while the push grows
    const kmax = Math.min(n + 1, 6), X0 = P.exact(S.kind, 0), pr = potRange(S.kind, s);
    const gap = n === 1 ? 3 : 2 * n - 1, amp = 0.36 * gap / 1.45;           // the smaller gap to a neighbouring level
    // frame the levels; a push much taller (or deeper) than they are is cut off at the edge rather than squashing them
    const hiL = Math.max(X.E[kmax - 1], X0.E[kmax - 1], Math.max(ex, E0) + amp * 1.6), loL = Math.min(0, X.E[0]);
    let hi = Math.min(Math.max(pr[1], hiL), hiL + 0.25 * (hiL - loL)), lo = Math.max(Math.min(pr[0], loL), loL - 0.25 * (hiL - loL));
    const span = hi - lo; lo -= 0.06 * span; hi += 0.1 * span;
    const lv = [E0, p1, p2, ex];
    let llo = Math.min(...lv), lhi = Math.max(...lv);
    const lpad = Math.max(0.2 * (lhi - llo), 0.06 + 0.012 * E0);
    llo -= lpad; lhi += lpad * 1.6;
    // plot A: energy against strength, exact and order by order
    const C = energyCurves(S.kind, n), all = C.ex.concat(C.p1, [E0]);
    let alo = Math.min(...all), ahi = Math.max(...all); const ap = 0.08 * (ahi - alo || 1); alo -= ap; ahi += ap;
    reset(plotA);
    plotA.opts.xLabel = 'Strength of the push, s (E₁)'; plotA.opts.yLabel = `Energy of level ${n} (E₁)`;
    plotA.setRange([0, KIND[S.kind].max], [alo, ahi]);
    const pa = [
      { type: 'hline', y: E0, color: GREY, width: 1.4, dash: [5, 4] },
      { type: 'vline', x: s, color: LIGHT, width: 1, dash: [3, 3] },
      { type: 'line', x: C.ss, y: tame(C.p1, alo, ahi), color: ORANGE, width: 2, dash: [7, 4] },
      { type: 'line', x: C.ss, y: tame(C.p2, alo, ahi), color: GREEN, width: 2.2 },
      { type: 'line', x: C.ss, y: C.ex, color: BLUE, width: 2.6 },
    ];
    view1 = { lo, hi, amp, th: 0.045 * (hi - lo), llo, lhi, lth: 0.045 * (lhi - llo), pa };
    // plot B: every other level's push on level n
    reset(plotB);
    // levels 1-8 one by one, and all the levels above 8 lumped together in a ninth bar, so the bars add up to E(2)
    const ms = range(1, 8, 7), bars = [];
    let rest = 0;
    for (let m = 9; m <= P.N; m++) if (m !== n) rest += T.contrib[m - 1];
    const vals9 = ms.map(m => (m === n ? 0 : T.contrib[m - 1])).concat([rest]);
    const bmax = Math.max(...vals9.map(Math.abs));
    vals9.forEach((v, i) => {
      const m = i + 1;
      if (m === n || !(Math.abs(v) > 1e-9 * bmax)) return;
      bars.push({ type: 'poly', x: [m - 0.32, m + 0.32, m + 0.32, m - 0.32], y: [0, 0, v, v], fill: alpha(v >= 0 ? RED : BLUE, m === 9 ? 0.4 : 0.75), color: v >= 0 ? RED : BLUE });
    });
    const bl = s > 0 && bmax > 0 ? 1.3 * bmax : 0.1;
    bars.push({ type: 'text', x: n, y: bl * 0.12, text: `level ${n}`, size: 11, color: MUTED });
    if (!(s > 0)) bars.push({ type: 'text', x: 5, y: bl * 0.6, text: 'no push yet', size: 12, color: MUTED });
    plotB.opts.xLabel = 'Other level m'; plotB.opts.yLabel = `Its push on level ${n} (E₁)`; plotB.opts.zeroLine = true;
    plotB.opts.xTickValues = range(1, 9, 8); plotB.opts.xFormat = v => (Math.round(v) === 9 ? '9+' : String(Math.round(v)));
    plotB.setRange([0.4, 9.6], [-bl, bl]);
    plotB.draw(bars);
    // the numbers
    if (!deep) stats([
      ['Before the push', `${fixed(E0, 3)} E₁`, `level ${n} of the box: n² E₁`],
      ['First order', `${fixed(p1, 3)} E₁`, 'adds the push, averaged over the state'],
      ['Second order', `${fixed(p2, 3)} E₁`, 'adds the nudges of the other levels'],
      ['Exact', `${fixed(ex, 3)} E₁`, `second order is off by ${fixed(err, 3)}`],
    ]);
    else stats([
      [sym('E_n^(0) = n² E₁'), fixed(E0, 4), 'the unperturbed box'],
      [sym('+ E^(1) = V_{nn}'), fixed(p1, 4), `V_{nn} = ${fixed(T.E1, 4)}`],
      [sym('+ E^(2)'), fixed(p2, 4), `Σ_{m≠n} |V_{mn}|²/(E_n − E_m) = ${fixed(T.E2, 4)}`],
      ['Exact', fixed(ex, 4), `largest |V_{mn}/(E_n − E_m)| = ${fixed(mr, 3)}${mr > 0.5 ? ': not small' : ''}`],
    ]);
    setHTML($('dg-title'), `A box with a ${KIND[S.kind].word}: level ${n}, order by order`);
    put('dg-cap', deep
      ? `Left: the box (walls at x = 0 and L), the push s·W(x) (violet), the exact levels and the exact ψ_${n} drawn on its level; the dashed line is the unperturbed n² E₁. Right: E_n^(0), then + E^(1) = V_{nn}, then + E^(2), and the exact value.`
      : `Left: the box, with the push in violet. The lines are its energy levels, and the blue wave is level ${n}'s state, drawn on its level; the dashed line is where level ${n} was before the push. Right: level ${n} before the push, after first order, after second order, and exact.`);
    legend('dg-legend', [[VIOLET, 'swatch--area', 'the push'], [BLUE, '', 'exact level and state'], [GREY, 'swatch--dash', 'before the push'], [ORANGE, '', 'first order'], [GREEN, '', 'second order']]);
    setHTML($('pa-title'), 'Each order, against the strength of the push');
    put('pa-cap', `The energy of level ${n} as the push grows: exact (blue), first order (orange, dashed), second order (green). While the push is weak they agree, and second order stays with the exact curve longest; push harder and second order can wander off, sometimes further than first order.`);
    legend('pa-legend', [[BLUE, '', 'exact'], [ORANGE, 'swatch--dash', 'first order'], [GREEN, '', 'second order'], [GREY, 'swatch--dash', 'before the push']]);
    setHTML($('pb-title'), `Who pushes level ${n}, and how hard`);
    put('pb-cap', deep
      ? `Each term of E^(2) = Σ |V_{mn}|²/(E_n − E_m) at s = ${trim(s)}: positive (red) from levels below, negative (blue) from levels above; the last bar is all the levels above 8 together. They add up to E^(2) = ${fixed(T.E2, 4)}.`
      : `At s = ${trim(s)}, each other level nudges level ${n}: levels below push it up (red), levels above push it down (blue), and for links of similar strength, nearer levels push harder. The last bar lumps together all the levels above 8; all the bars add up to the second-order shift, ${fixed(T.E2, 3)}.`);
    legend('pb-legend', [[RED, 'swatch--area', 'pushes up'], [BLUE, 'swatch--area', 'pushes down']]);
    let msg;
    if (s === 0) msg = `<b>No push yet:</b> level ${n} sits at ${E0} E₁, as in the plain box. Turn up the strength.`;
    else {
      msg = Math.abs(T.E1) < 1e-9
        ? `<b>No change at first order:</b> the ${KIND[S.kind].word} averages to zero over level ${n}'s state. The whole shift, ${fixed(ex - E0, 3)} exactly, comes from second order and beyond: ${fixed(T.E2, 3)} at second order.`
        : `<b>Level ${n} rises by ${fixed(T.E1, 3)} at first order</b>, the push averaged over its state; second order then ${T.E2 < 0 ? 'lowers' : 'raises'} it by ${fixed(Math.abs(T.E2), 3)}.`;
      // judge second order by how far it actually lands from the exact level, compared with the true shift
      const err1 = Math.abs(ex - p1), rel = err / Math.max(Math.abs(ex - E0), 1e-9), eTxt = v => (v < 0.0005 ? 'less than 0.001' : fixed(v, 3));
      const wrongWay = Math.abs(T.E2) > 1e-9 && err1 > 1e-9 && Math.sign(T.E2) !== Math.sign(ex - p1);
      if (err > err1 && wrongWay) msg += ` Here second order moves the level the wrong way: from ${fixed(p1, 3)} at first order to ${fixed(p2, 3)}, while the exact level is ${fixed(ex, 3)}. The push is too strong for a second-order answer.`;
      else if (err > err1) msg += ` Here second order moves the level the right way, but too far: it ends ${eTxt(err)} off, more than first order's ${eTxt(err1)}. Higher orders are needed.`;
      else msg += rel < 0.05 || err < 0.005 ? ` The push is gentle: second order is within ${eTxt(err)} of the exact ${fixed(ex, 3)} E₁.`
        : rel < 0.25 ? ` The push is getting strong: second order is off by ${eTxt(err)}, ${Math.round(100 * rel)}% of the shift.`
        : ` The push is strong: second order is still off by ${eTxt(err)}, and higher orders are needed.`;
    }
    setHTML($('info'), msg);
    setHTML($('takeaway'), '<b>First order is the average; second order is the neighbours.</b> The first correction needs only the old state. The second asks every other level how strongly the push links it, and divides by the gap: levels below push up, levels above push down.');
    $('scene').setAttribute('aria-label', `The box with a ${KIND[S.kind].word} of strength ${trim(s)}; level ${n} is at ${fixed(ex, 3)} E₁, against ${E0} E₁ before the push`);
    $('side').setAttribute('aria-label', `Level ${n}: ${E0} before the push, ${fixed(p1, 3)} at first order, ${fixed(p2, 3)} at second order, ${fixed(ex, 3)} exact`);
    frameFn = energyFrame;
    energyFrame(nowF());
  }

  /* ================= 2. How the state changes ================= */
  let view2 = null;
  function stateFrame(f) {
    const lam = f * S.s, n = S.n, V = view2;
    const ex = P.exactCoeffs(S.kind, n, lam), ap = P.coeffs(S.kind, n, lam, S.order), c0 = P.coeffs(S.kind, n, lam, 0);
    const layers = [];
    // the push as a silhouette along the bottom
    const pl = potLine(S.kind, lam), [plo, phi] = potRange(S.kind, S.s), scale = (phi - plo) || 1;
    const base = V.lo + 0.08, top = V.lo + 0.5;
    layers.push({ type: 'line', x: pl.x, y: pl.y.map(p => base + (top - base) * (p - plo) / scale), color: VIOLET, width: 1.6, fill: alpha(VIOLET, 0.12), fillTo: base });
    layers.push({ type: 'line', x: XS, y: Array.from(P.wave(c0, XS, true)), color: GREY, width: 1.6, dash: [5, 4] });
    layers.push({ type: 'line', x: XS, y: Array.from(P.wave(ap, XS, true)), color: ORDER_COL[S.order], width: 2.4 });
    layers.push({ type: 'line', x: XS, y: Array.from(P.wave(ex, XS, true)), color: BLUE, width: 2.2, dash: [2, 3] });
    layers.push({ type: 'line', x: [0, 0], y: [V.lo, V.hi], color: INK, width: 3 }, { type: 'line', x: [1, 1], y: [V.lo, V.hi], color: INK, width: 3 });
    if (f < 1) layers.push({ type: 'text', x: 0.03, y: V.hi - 0.05, text: `switching on: s = ${trim(lam)}`, align: 'left', size: 11.5, color: VIOLET });
    scene.opts.xLabel = 'Position x / L'; scene.opts.yLabel = `ψ${'₀₁₂₃₄₅₆₇₈₉'[n]} (1/√L)`; scene.opts.xTickValues = [0, 0.5, 1]; scene.opts.xFormat = null;
    scene.setRange([-0.06, 1.06], [V.lo, V.hi]);
    scene.draw(layers);
    // the amounts borrowed from each other state, exact against perturbation theory
    const ms = range(1, 10, 9).filter(m => m !== n), L2 = [];
    L2.push({ type: 'stems', x: ms.map(m => m - 0.17), y: ms.map(m => ex[m - 1]), color: BLUE, r: 3.6, width: 2 });
    L2.push({ type: 'stems', x: ms.map(m => m + 0.17), y: ms.map(m => ap[m - 1]), color: ORDER_COL[S.order], r: 3.6, width: 2 });
    L2.push({ type: 'text', x: n <= 2 ? n - 0.45 : n, y: V.chi * 0.92, text: `c${'₀₁₂₃₄₅₆₇₈₉'[n]} = 1`, align: n <= 2 ? 'left' : 'center', size: 11, color: MUTED });
    side.opts.xLabel = 'Other state m'; side.opts.yLabel = 'Amount borrowed, cₘ'; side.opts.xTickValues = range(1, 10, 9); side.opts.xFormat = null; side.opts.zeroLine = true;
    side.setRange([0.4, 10.6], [V.clo, V.chi]);
    side.draw(L2);
    // plots A and B: the dots at the current strength
    const T = P.series(S.kind, n, lam), v = P.exact(S.kind, lam).vecs[n - 1];
    const ov = P.overlap2(ex, ap);
    if (V.tx(lam) !== null) plotA.draw(V.pa.concat([{ type: 'dots', x: [V.tx(lam)], y: [V.ty(ov)], color: ORDER_COL[S.order], r: 5 }])); else plotA.draw(V.pa);
    plotB.draw(V.pb.concat([{ type: 'dots', x: [lam, lam], y: [v[n - 1] * v[n - 1], 1 / T.len2], colors: [BLUE, ORANGE], r: 5 }]));
  }
  function renderState() {
    const n = S.n, s = S.s, ex = P.exactCoeffs(S.kind, n, s), ap = P.coeffs(S.kind, n, s, S.order), T = P.series(S.kind, n, s);
    const c0 = P.coeffs(S.kind, n, s, 0), ov = P.overlap2(ex, ap), ov0 = P.overlap2(ex, c0), v = P.exact(S.kind, s).vecs[n - 1], share = v[n - 1] * v[n - 1];
    let mMax = 0, cMax = 0;
    for (let m = 1; m <= P.N; m++) if (m !== n && Math.abs(T.c1[m - 1]) > Math.abs(cMax)) { cMax = T.c1[m - 1]; mMax = m; }
    // ranges for the whole animation
    const w = Array.from(P.wave(ex, XS, true)).concat(Array.from(P.wave(ap, XS, true)));
    const ymax = Math.max(1.6, 1.12 * Math.max(...w.map(Math.abs)));
    // the coefficients' range: one-sided when every coefficient has the same sign
    let cmin = 0, cmax = 0;
    for (let m = 1; m <= 10; m++) if (m !== n) { cmin = Math.min(cmin, ex[m - 1], ap[m - 1]); cmax = Math.max(cmax, ex[m - 1], ap[m - 1]); }
    const cabs = Math.max(0.02, -cmin, cmax), clo = Math.min(-0.1 * cabs, 1.3 * cmin), chi = Math.max(0.1 * cabs, 1.3 * cmax);
    // plot A: how close each order's state is to the exact one
    const C = stateCurves(S.kind, n);
    reset(plotA);
    plotA.opts.xLabel = 'Strength of the push, s (E₁)';
    let ty, tx, pa;
    if (!deep) {
      ty = y => y; tx = x => x;
      const lo = Math.min(...C.ov[S.order], ...C.ov[0]);
      plotA.opts.yLabel = 'Overlap with the exact state';
      plotA.setRange([0, KIND[S.kind].max], [Math.max(0, lo - 0.04), 1.005]);
      pa = [{ type: 'vline', x: s, color: LIGHT, width: 1, dash: [3, 3] }].concat([0, 1, 2].map(o => ({ type: 'line', x: C.ss, y: C.ov[o], color: ORDER_COL[o], width: o === S.order ? 2.6 : 1.8, dash: o === 0 ? [5, 4] : o === 2 ? [9, 3] : undefined })));
    } else {
      // log-log, so that the powers s², s⁴, s⁶ show as straight lines of slope 2, 4, 6
      const smin = C.ss[1], smax = KIND[S.kind].max;
      ty = y => Math.log10(Math.max(1 - y, 1e-12)); tx = x => (x >= smin ? Math.log10(x) : null);
      const sup = v => String(Math.round(v)).replace('-', '⁻').replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
      plotA.opts.xLabel = 'Strength of the push, s (E₁, log scale)';
      plotA.opts.yLabel = '1 − overlap (log scale)';
      plotA.opts.yFormat = vv => (Math.abs(vv - Math.round(vv)) < 1e-6 ? `10${sup(vv)}` : '');
      const xt = [0.5, 1, 2, 5, 10, 20, 40].filter(v => v >= smin * 0.999 && v <= smax * 1.001);
      plotA.opts.xTickValues = xt.map(Math.log10); plotA.opts.xFormat = vv => { const m = xt.find(v => Math.abs(Math.log10(v) - vv) < 1e-6); return m === undefined ? '' : String(m); };
      plotA.setRange([Math.log10(smin), Math.log10(smax)], [-10, 0]);
      pa = (s >= smin ? [{ type: 'vline', x: Math.log10(s), color: LIGHT, width: 1, dash: [3, 3] }] : []).concat([0, 1, 2].map(o => ({ type: 'line', x: C.ss.slice(1).map(Math.log10), y: C.ov[o].slice(1).map(ty), color: ORDER_COL[o], width: o === S.order ? 2.6 : 1.8, dash: o === 0 ? [5, 4] : o === 2 ? [9, 3] : undefined })));
    }
    // plot B: how much of the old state is left
    reset(plotB);
    const blo = Math.min(...C.shEx, ...C.shPT);
    plotB.opts.xLabel = 'Strength of the push, s (E₁)'; plotB.opts.yLabel = `Share of the old state ψ_${n}`.replace(/_(\d)/, (m, d) => '₀₁₂₃₄₅₆₇₈₉'[d]);
    plotB.setRange([0, KIND[S.kind].max], [Math.max(0, blo - 0.04), 1.005]);
    const pb = [{ type: 'vline', x: s, color: LIGHT, width: 1, dash: [3, 3] }, { type: 'line', x: C.ss, y: C.shPT, color: ORANGE, width: 2, dash: [7, 4] }, { type: 'line', x: C.ss, y: C.shEx, color: BLUE, width: 2.6 }];
    view2 = { lo: -ymax - 0.6, hi: ymax, clo, chi, pa, pb, ty, tx };
    const other = n % 2 ? 'even' : 'odd';
    const parity = S.kind === 'bump'
      ? `The bump is symmetric about the middle of the box, so it only mixes states of the same symmetry as level ${n}, ${n % 2 ? 'odd' : 'even'}-numbered ones, at every order.`
      : `To first order the ${KIND[S.kind].word}, which is ${S.kind === 'step' ? 'odd about the middle apart from raising everything by s/2' : 'odd about the middle of the box'}, mixes in only states of the opposite symmetry, ${other}-numbered ones; the rest come in at second order, borrowed through those.`;
    const none = !(s > 0) || mMax === 0;
    if (!deep) stats([
      ['Overlap with the exact state', fixed(ov, 4), `the ${ORD[S.order]}-order state; 1 is perfect`],
      ['Without any correction', fixed(ov0, 4), 'the old state alone'],
      ['Borrowed most, first order', none ? 'nothing yet' : `state ${mMax}`, none ? 'no push' : `c = ${fixed(cMax, 3)} (exact ${fixed(ex[mMax - 1], 3)})`],
      ['Share of the old state left', pct(share), `first-order estimate: ${pct(1 / T.len2)}`],
    ]);
    else stats([
      [sym('|⟨ψ_{exact}|ψ_{approx}⟩|²'), fixed(ov, 5), `${ORD[S.order]}-order state; |⟨ψ_{exact}|n^(0)⟩|² = ${fixed(ov0, 5)}`],
      [`Largest ${sym('c_m^(1)')}`, none ? '—' : `c_{${mMax}} = ${fixed(cMax, 4)}`, none ? 'no push' : `V_{${mMax}${n}}/(E_${n} − E_{${mMax}}); exact ${fixed(ex[mMax - 1], 4)}`],
      [`Length, with ${sym('⟨n^(0)|n⟩ = 1')}`, fixed(Math.sqrt(T.len2), 4), `√(1 + Σ|c_m^(1)|²), first-order state`],
      ['Old state, normalised', fixed(share, 4), `1/(1 + Σ|c_m^(1)|²) = ${fixed(1 / T.len2, 4)}`],
    ]);
    setHTML($('dg-title'), `Level ${n}'s state, corrected to ${ORD[S.order]} order`);
    put('dg-cap', deep
      ? `Left: ψ^(0) (grey, dashed), the ${ORD[S.order]}-order state (${S.order === 1 ? 'orange' : 'green'}) and the exact state (blue, dotted), each normalised, with the push along the bottom. Right: the coefficients c_m with intermediate normalisation, c_${n} = 1: exact (blue) against perturbation theory.`
      : `Left: level ${n}'s state before the push (grey, dashed), corrected by perturbation theory (${S.order === 1 ? 'orange' : 'green'}), and exact (blue, dotted); the push is drawn along the bottom. Right: how much of each other state it borrows, exact (blue) against perturbation theory.`);
    legend('dg-legend', [[GREY, 'swatch--dash', 'before the push'], [ORDER_COL[S.order], '', `${ORD[S.order]} order`], [BLUE, 'swatch--dot', 'exact'], [VIOLET, 'swatch--area', 'the push']]);
    setHTML($('pa-title'), 'How close is each corrected state?');
    put('pa-cap', deep
      ? '1 − |⟨ψ_{exact}|ψ_{approx}⟩|² against s, both on log scales, for the old state (grey), first order (orange) and second order (green): for a weak push they fall as s², s⁴ and s⁶, lines of slope 2, 4 and 6, as each order removes the next power of s.'
      : 'The overlap of each approximate state with the exact one, 1 for a perfect match: the old state (grey), first order (orange), second order (green, dashed). Each order stays close for longer.');
    legend('pa-legend', [[GREY, 'swatch--dash', 'no correction'], [ORANGE, '', 'first order'], [GREEN, 'swatch--dash', 'second order']]);
    setHTML($('pb-title'), 'How much of the old state is left');
    put('pb-cap', deep
      ? `|⟨n^(0)|n⟩|² for the normalised exact state (blue), against 1/(1 + Σ|c_m^(1)|²) from perturbation theory (orange). With intermediate normalisation the state's length is √(1 + Σ|c_m|²): normalising divides the old state's coefficient by that, and its share by 1 + Σ|c_m|².`
      : 'The share of the old state in the new one: exact (blue) and from perturbation theory (orange). It starts at 1 and falls slowly: the borrowed parts sit at right angles to the old state, so they only make it longer, by a second-order amount.');
    legend('pb-legend', [[BLUE, '', 'exact'], [ORANGE, 'swatch--dash', 'perturbation theory']]);
    setHTML($('info'), s === 0
      ? `<b>No push yet:</b> the state is the plain box's ψ<sub>${n}</sub>. Turn up the strength.`
      : `<b>To first order, level ${n} borrows most from state ${mMax}:</b> ${fixed(Math.abs(cMax), 3)} of it; the exact state has ${fixed(Math.abs(ex[mMax - 1]), 3)}. ${parity} ${ov > 0.999 ? `The ${ORD[S.order]}-order state is almost exactly right: overlap ${fixed(ov, 4)}.` : ov > 0.98 ? `The ${ORD[S.order]}-order state is close: overlap ${fixed(ov, 4)}.` : `The push is too strong for the ${ORD[S.order]}-order state alone: its overlap with the exact one is only ${fixed(ov, 3)}.`}`);
    setHTML($('takeaway'), '<b>The state changes by borrowing.</b> To first order, each other state m is mixed in by V<sub>mn</sub>/(E<sub>n</sub> − E<sub>m</sub>): only states the push links directly, mostly the nearest. The rest join at second order, through those. Intermediate normalisation keeps the old state\'s coefficient at 1 and adds the borrowed parts at right angles, so normalising only matters from second order on.');
    $('scene').setAttribute('aria-label', `Level ${n}'s state with a ${KIND[S.kind].word} of strength ${trim(s)}: before the push, at ${ORD[S.order]} order, and exact; overlap ${fixed(ov, 3)}`);
    $('side').setAttribute('aria-label', none ? 'No other state is borrowed yet' : `To first order the state borrows most from state ${mMax}, ${fixed(cMax, 3)}; exactly ${fixed(ex[mMax - 1], 3)}`);
    frameFn = stateFrame;
    stateFrame(nowF());
  }

  /* ================= 3. Two levels repel ================= */
  const DS = range(-2, 2, 400);
  let view3 = null;
  function twoFrame(f) {
    const Vf = f * S.cpl, d = S.det, T = P.twoLevel(d, Vf), V = view3, lo = -1.4, hi = 1.4;
    // left: the levels against detuning, at the current coupling
    const exL = DS.map(x => -Math.sqrt(x * x / 4 + Vf * Vf)), exU = exL.map(y => -y);
    const pt1 = DS.map(x => (Math.abs(x) < 1e-9 ? NaN : -x / 2 - Vf * Vf / x)), pt2 = DS.map(x => (Math.abs(x) < 1e-9 ? NaN : x / 2 + Vf * Vf / x));
    const layers = [
      { type: 'line', x: [-2, 2], y: [1, -1], color: GREY, width: 1.4, dash: [5, 4] },
      { type: 'line', x: [-2, 2], y: [-1, 1], color: GREY, width: 1.4, dash: [5, 4] },
      { type: 'line', x: DS, y: tame(pt1, lo, hi), color: ORANGE, width: 1.8, dash: [2, 3] },
      { type: 'line', x: DS, y: tame(pt2, lo, hi), color: ORANGE, width: 1.8, dash: [2, 3] },
      { type: 'line', x: DS, y: exL, color: BLUE, width: 2.6 },
      { type: 'line', x: DS, y: exU, color: BLUE, width: 2.6 },
      { type: 'vline', x: d, color: LIGHT, width: 1, dash: [3, 3] },
      { type: 'dots', x: [d, d], y: [T.lower, T.upper], colors: [BLUE, RED], r: 5 },
      { type: 'text', x: -1.95, y: 1.33, text: '|1⟩ left dot', align: 'left', size: 11, color: MUTED },
      { type: 'text', x: -1.95, y: -1.06, text: '|2⟩ right dot', align: 'left', size: 11, color: MUTED },
      { type: 'text', x: 1.95, y: 1.33, text: '|2⟩ right dot', align: 'right', size: 11, color: MUTED },
      { type: 'text', x: 1.95, y: -1.06, text: '|1⟩ left dot', align: 'right', size: 11, color: MUTED },
    ];
    if (f < 1) layers.push({ type: 'text', x: 0, y: 1.33, text: `switching on: V = ${fixed(Vf, 2)} meV`, size: 11.5, color: VIOLET });
    scene.opts.xLabel = 'Detuning δ (meV)'; scene.opts.yLabel = 'Energy (meV)'; scene.opts.xTickValues = [-2, -1, 0, 1, 2]; scene.opts.xFormat = null;
    scene.setRange([-2, 2], [lo, hi]);
    scene.draw(layers);
    // right: the two dots, the bare levels, and where each state's electron is
    const L2 = [], dotL = [-1.75, -0.35], dotR = [0.35, 1.75], floor = -1.4, roof = 1.55;
    [dotL, dotR].forEach(([a, b]) => L2.push({ type: 'poly', x: [a, b, b, a], y: [floor, floor, roof, roof], color: '#9fb3bd', width: 1.4, fill: 'rgba(159, 179, 189, 0.08)' }));
    L2.push({ type: 'line', x: dotL, y: [T.E1, T.E1], color: GREY, width: 1.3, dash: [5, 4] }, { type: 'line', x: dotR, y: [T.E2, T.E2], color: GREY, width: 1.3, dash: [5, 4] });
    const hump = ([a, b], yb, h, col) => { const xs = range(a + 0.06, b - 0.06, 30); return { type: 'line', x: xs, y: xs.map(x => yb + h * Math.sin(Math.PI * (x - a - 0.06) / (b - a - 0.12))), color: col, width: 2, fill: alpha(col, 0.25), fillTo: yb }; };
    const H = 0.32;
    L2.push(hump(dotL, T.lower, H * T.w1, BLUE), hump(dotR, T.lower, H * (1 - T.w1), BLUE), hump(dotL, T.upper, H * (1 - T.w1), RED), hump(dotR, T.upper, H * T.w1, RED));
    L2.push({ type: 'line', x: [-1.75, 1.75], y: [T.lower, T.lower], color: BLUE, width: 1.2 }, { type: 'line', x: [-1.75, 1.75], y: [T.upper, T.upper], color: RED, width: 1.2 });
    L2.push({ type: 'text', x: -1.05, y: 1.74, text: 'left dot, |1⟩', size: 11, color: MUTED }, { type: 'text', x: 1.05, y: 1.74, text: 'right dot, |2⟩', size: 11, color: MUTED });
    L2.push({ type: 'text', x: 0, y: 1.74, text: '⇄ V', size: 11.5, color: VIOLET, weight: '700' });
    L2.push({ type: 'text', x: -1.05, y: T.lower - 0.05, text: pct(T.w1), size: 10.5, color: BLUE }, { type: 'text', x: 1.05, y: T.lower - 0.05, text: pct(1 - T.w1), size: 10.5, color: BLUE });
    side.opts.xLabel = ''; side.opts.yLabel = 'Energy (meV)'; side.opts.xTickValues = []; side.opts.xFormat = null; side.opts.zeroLine = false;
    side.setRange([-2, 2], [-1.45, 1.78]);
    side.draw(L2);
    // plots A and B: the dots at the current coupling
    plotA.draw(V.pa.concat([{ type: 'dots', x: [Vf], y: [T.upper - Math.abs(d) / 2], color: BLUE, r: 5 }]));
    plotB.draw(V.pb);
  }
  function renderTwo() {
    const d = S.det, Vc = S.cpl, T = P.twoLevel(d, Vc), ad = Math.abs(d), shift = T.upper - ad / 2, ptShift = ad > 0 ? Vc * Vc / ad : Infinity;
    const ptW = ad > 0 ? (d > 0 ? T.keep : 1 - T.keep) : NaN;
    // plot A: the shift of each level against the coupling, at this detuning
    reset(plotA);
    const vs = range(0, 0.6, 120), exS = vs.map(v => Math.sqrt(d * d / 4 + v * v) - ad / 2), ptS = vs.map(v => (ad > 0 ? v * v / ad : NaN));
    const ahi = Math.max(0.05, 1.2 * Math.max(...exS));
    plotA.opts.xLabel = 'Tunnel coupling V (meV)'; plotA.opts.yLabel = 'How far each level moves (meV)';
    plotA.setRange([0, 0.6], [0, ahi]);
    const pa = [{ type: 'vline', x: Vc, color: LIGHT, width: 1, dash: [3, 3] }, { type: 'line', x: vs, y: tame(ptS, 0, ahi), color: ORANGE, width: 2, dash: [7, 4] }, { type: 'line', x: vs, y: exS, color: BLUE, width: 2.6 }];
    if (!(ad > 0) && Vc > 0) pa.push({ type: 'text', x: 0.02, y: ahi * 0.96, text: 'δ = 0: V²/δ blows up', align: 'left', size: 11.5, color: ORANGE });
    // plot B: where the lower state's electron is, against detuning, at this coupling
    reset(plotB);
    const wEx = DS.map(x => P.twoLevel(x, Vc).w1), wPT = DS.map(x => { if (Math.abs(x) < 1e-9) return NaN; const c2 = Vc * Vc / (x * x); return x > 0 ? 1 / (1 + c2) : c2 / (1 + c2); });
    plotB.opts.xLabel = 'Detuning δ (meV)'; plotB.opts.yLabel = 'Lower state, in left dot'; plotB.opts.xTickValues = [-2, -1, 0, 1, 2];
    plotB.setRange([-2, 2], [-0.03, 1.03]);
    const pb = [{ type: 'hline', y: 0.5, color: LIGHT, width: 1, dash: [3, 3] }, { type: 'vline', x: d, color: LIGHT, width: 1, dash: [3, 3] }, { type: 'line', x: DS, y: wPT, color: ORANGE, width: 2, dash: [7, 4] }, { type: 'line', x: DS, y: wEx, color: BLUE, width: 2.6 }];
    pb.push({ type: 'dots', x: [d], y: [T.w1], color: BLUE, r: 5 });
    view3 = { pa, pb };
    const ratio = Vc === 0 ? 0 : ad > 0 ? Vc / ad : Infinity;
    const noV = Vc === 0, both0 = noV && !(ad > 0);
    // with no coupling there is no push: perturbation theory is exact (and at δ = 0 any mix of the two equal levels will do)
    const ptGapTxt = noV ? 'no coupling: the bare levels' : ad > 0 ? `perturbation theory: ${fixed(ad + 2 * ptShift, 3)} meV` : 'perturbation theory: infinite (it divides by zero)';
    const ptShiftTxt = noV ? 'no coupling, no shift' : `perturbation theory: ${ad > 0 ? `${fixed(ptShift, 4)} meV` : 'infinite'}`;
    const wTxt = both0 ? 'either dot: the two levels are equal' : noV ? 'no coupling: it stays in the lower dot' : ad > 0 ? `perturbation theory: ${pct(ptW)}` : 'shared equally by the two dots';
    if (!deep) stats([
      ['Gap between the levels', `${fixed(T.gap, 3)} meV`, ptGapTxt],
      ['Each level moves by', `${fixed(shift, 4)} meV`, ptShiftTxt],
      ['Lower state, left dot', both0 ? '—' : pct(T.w1), wTxt],
      [`Small number ${sym('V/|δ|')}`, noV ? '0' : ad > 0 ? fixed(ratio, 3) : 'infinite', noV ? 'no push at all' : 'perturbation theory needs it ≪ 1'],
    ]);
    else stats([
      [sym('E₊ − E₋ = 2√(δ²/4 + V²)'), `${fixed(T.gap, 4)} meV`, noV ? 'V = 0: just |δ|' : `|δ| + 2V²/|δ| = ${ad > 0 ? fixed(ad + 2 * ptShift, 4) : 'infinite'}`],
      [sym('√(δ²/4 + V²) − |δ|/2'), `${fixed(shift, 5)} meV`, noV ? 'V = 0: no shift' : `second order, V²/|δ| = ${ad > 0 ? fixed(ptShift, 5) : 'infinite'}`],
      [sym('|⟨1|−⟩|² = ½(1 + δ/√(δ² + 4V²))'), both0 ? '—' : fixed(T.w1, 4), both0 ? 'undefined: the levels are equal' : noV ? 'V = 0: 0 or 1' : ad > 0 ? `first order: ${fixed(ptW, 4)}` : 'exactly ½'],
      [sym('V/|δ|'), noV ? '0' : ad > 0 ? fixed(ratio, 4) : 'infinite', 'the series converges only if 2V < |δ|'],
    ]);
    setHTML($('dg-title'), 'Two quantum dots: level repulsion and an avoided crossing');
    put('dg-cap', deep
      ? `Left: ε₁ = −δ/2 and ε₂ = +δ/2 without coupling (grey, dashed), the exact levels ±√(δ²/4 + V²) (blue) and second-order perturbation theory, ±(|δ|/2 + V²/|δ|) (orange, dotted), against δ at V = ${fixed(Vc, 2)} meV; the dots mark δ = ${fixed(d, 2)} meV. Right: the two dots, their bare levels (dashed), and |⟨1|−⟩|², |⟨2|−⟩|² for the lower state (blue) and |⟨1|+⟩|², |⟨2|+⟩|² for the upper one (red).`
      : `Left: the two dots' levels against the detuning δ: without tunnelling they cross (grey, dashed); with it they repel and never cross (blue). Perturbation theory (orange, dotted) works far from the crossing and blows up at it. Right: the two dots, and where the electron is in the lower state (blue) and the upper state (red), which has the opposite shares.`);
    legend('dg-legend', [[GREY, 'swatch--dash', 'no tunnelling'], [BLUE, '', 'exact levels'], [ORANGE, 'swatch--dot', 'perturbation theory'], [BLUE, 'swatch--area', 'lower state'], [RED, 'swatch--area', 'upper state']]);
    setHTML($('pa-title'), 'How far the levels move, against the coupling');
    put('pa-cap', ad > 0
      ? `At δ = ${fixed(d, 2)} meV: the exact shift of each level (blue) against second order, V²/|δ| (orange). They agree while V is small compared with |δ|, and part as V grows.`
      : 'At δ = 0 the levels move by V, in proportion to the coupling, not its square: there is no small number to expand in, and second order, V²/δ, blows up.');
    legend('pa-legend', [[BLUE, '', 'exact'], [ORANGE, 'swatch--dash', 'perturbation theory']]);
    setHTML($('pb-title'), 'Where the electron is in the lower state');
    put('pb-cap', noV
      ? 'With no coupling, the lower state is simply the lower dot: the electron is in the right dot for δ < 0 and in the left dot for δ > 0, and both curves jump at δ = 0.'
      : `At V = ${fixed(Vc, 2)} meV, the chance that the lower state's electron is in the left dot, against detuning: exact (blue) and first-order perturbation theory (orange). The exact curve slides smoothly from the right dot to the left one, through 50% at δ = 0; perturbation theory jumps.`);
    legend('pb-legend', [[BLUE, '', 'exact'], [ORANGE, 'swatch--dash', 'perturbation theory']]);
    let msg;
    if (Vc === 0) msg = '<b>No tunnelling:</b> the two dots do not talk, the levels simply cross, and the electron stays in whichever dot it is in. Turn up the coupling V.';
    else if (!(ad > 0)) msg = `<b>On resonance, perturbation theory divides by zero.</b> The exact levels sit at ±V = ±${fixed(Vc, 2)} meV, a gap of 2V, and both states are shared equally between the two dots: (|1⟩ ± |2⟩)/√2.`;
    else if (2 * Vc > ad) msg = `<b>The series has given up:</b> with 2V > |δ| the expansion of √(δ²/4 + V²) no longer converges. The exact shift is ${fixed(shift, 3)} meV; second order says ${fixed(ptShift, 3)}.`;
    else msg = `<b>The levels repel:</b> the lower one moves down and the upper one up, by ${fixed(shift, 4)} meV each; second order gives ${fixed(ptShift, 4)}. The electron in the lower state is ${pct(Math.max(T.w1, 1 - T.w1))} in the ${d > 0 ? 'left' : 'right'} dot${ratio < 0.3 ? ', and perturbation theory is excellent' : ', and perturbation theory is starting to miss'}.`;
    setHTML($('info'), msg);
    setHTML($('takeaway'), '<b>Coupled levels repel, and never cross.</b> Far apart, a coupling barely moves them, by V²/|δ|. Brought together, they swap character instead of crossing, and the gap never falls below 2V. Where two levels are equal, or nearly so, the pair must be treated together: degenerate perturbation theory.');
    $('scene').setAttribute('aria-label', `The two dots' levels against detuning, at V = ${fixed(Vc, 2)} meV: exact levels ±${fixed(T.upper, 3)} meV at δ = ${fixed(d, 2)} meV`);
    $('side').setAttribute('aria-label', both0 ? 'The two dots at equal energy, with no coupling' : `The two dots: the lower state is ${pct(T.w1)} in the left dot, the upper state ${pct(1 - T.w1)}`);
    frameFn = twoFrame;
    twoFrame(nowF());
  }

  // ---------- controls ----------
  function syncControls() {
    const K = KIND[S.kind], str = $('str');
    str.max = K.max; str.step = K.step; str.value = S.s;
    const strTxt = `${trim(S.s)} E₁`;
    $('str-out').textContent = strTxt; str.setAttribute('aria-valuetext', strTxt);
    $('str-hint').textContent = S.kind === 'tilt' ? `In a 10 nm GaAs well, taken as infinitely deep, about ${Math.round(56 * S.s)} kV/cm.` : `In a 10 nm GaAs well, taken as infinitely deep, about ${Math.round(56 * S.s)} meV high.`;
    $('kind-hint').textContent = K.hint;
    const set = (id, v, txt) => { $(id).value = v; $(id + '-out').textContent = txt; $(id).setAttribute('aria-valuetext', txt); };
    set('det', S.det, `${fixed(S.det, 2)} meV`); set('cpl', S.cpl, `${fixed(S.cpl, 2)} meV`);
    const pressed = (attr, val) => document.querySelectorAll(`button[data-${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(val))));
    pressed('kind', S.kind); pressed('n', S.n); pressed('order', S.order); pressed('depth', deep ? 'deep' : 'simple');
    document.querySelectorAll('button[data-two]').forEach(b => { const [x, y] = b.dataset.two.split(',').map(Number); b.setAttribute('aria-pressed', String(Math.abs(S.det - x) < 1e-9 && Math.abs(S.cpl - y) < 1e-9)); });
    $('depth-hint').textContent = deep ? 'The formulas: each order\'s sum, the matrix elements, intermediate normalisation.' : 'The main ideas; switch to Go deeper for the formulas behind them.';
  }
  function render() {
    syncControls();
    lastF = null;
    if (mode === 'energy') renderEnergy(); else if (mode === 'state') renderState(); else renderTwo();
    $('plot-a').setAttribute('aria-label', $('pa-title').textContent); $('plot-b').setAttribute('aria-label', $('pb-title').textContent);
    kick();
  }
  function applyMode() {
    document.querySelectorAll('.tab').forEach(b => { const on = b.dataset.mode === mode; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $('lab').setAttribute('aria-labelledby', 'tab-' + mode);
    document.querySelectorAll('.mode-intro').forEach(el => { el.hidden = el.dataset.for !== mode; });
    document.querySelectorAll('[data-modes], [data-deep]').forEach(el => { el.hidden = !((!el.dataset.modes || el.dataset.modes.split(' ').includes(mode)) && (!('deep' in el.dataset) || deep)); });
    animT0 = performance.now();                           // a new tab starts with the push switched off
    render();
  }
  let pending = false;
  function later() { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; render(); }); }
  $('str').addEventListener('input', e => { S.s = +e.target.value; later(); });
  $('det').addEventListener('input', e => { S.det = +e.target.value; later(); });
  $('cpl').addEventListener('input', e => { S.cpl = +e.target.value; later(); });
  document.querySelector('.lab-main').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !b.closest('.controls')) return;
    const d = b.dataset;
    if (d.kind) { S.kind = d.kind; S.s = KIND[d.kind].start; }
    else if (d.n) S.n = +d.n;
    else if (d.order) S.order = +d.order;
    else if (d.two) { const [x, y] = d.two.split(',').map(Number); S.det = x; S.cpl = y; }
    else if (b.id === 'video-values') Object.assign(S, JSON.parse(JSON.stringify(START)));
    else return;
    render();
  });
  document.querySelectorAll('[data-depth]').forEach(b => b.addEventListener('click', () => {
    deep = b.dataset.depth === 'deep';
    try { localStorage.setItem('perturb-depth', deep ? 'deep' : 'simple'); } catch (e) { /* not remembered: fine */ }
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
    tilt1: () => { mode = 'energy'; fresh({ kind: 'tilt', s: 5, n: 1 }); },
    step: () => { mode = 'energy'; fresh({ kind: 'step', s: 2, n: 1 }); },
    tilt2: () => { mode = 'energy'; fresh({ kind: 'tilt', s: 5, n: 2 }); },
    borrow: () => { mode = 'state'; fresh({ kind: 'tilt', s: 5, n: 1, order: 1 }); },
    inorm: () => { mode = 'state'; fresh({ kind: 'tilt', s: 5, n: 1, order: 1 }); },
    hard: () => { mode = 'state'; fresh({ kind: 'tilt', s: 20, n: 1, order: 1 }); },
    far: () => { mode = 'two'; fresh({ det: 1, cpl: 0.2 }); },
    res: () => { mode = 'two'; fresh({ det: 0, cpl: 0.2 }); },
  };
  document.querySelectorAll('.predict__load[data-q]').forEach(b => b.addEventListener('click', () => {
    QUESTIONS[b.dataset.q]();
    applyMode();
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    const t = tabs.find(x => x.dataset.mode === mode); if (t) t.focus({ preventScroll: true });
  }));

  syncAnim();
  applyMode();
  window.__perturb = { S, render, frame: f => frameFn && frameFn(f), setMode: m => { mode = m; applyMode(); } };
})();
