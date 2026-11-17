/* Quantum harmonic oscillator: controls, animation and plots. The physics is in physics.js. */
(function () {
  'use strict';
  const H = window.HO;
  const $ = id => document.getElementById(id);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const DEG = Math.PI / 180;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const S = {
    n: 0, last: null, classical: true,                    // 1. the ladder
    m: 0, k: 1, w: 0.5, rel: 0,                          // 2. two rungs |m> and |k>
    amp: 2, aph: 0, sq: 1,                               // 3. coherent state
  };
  let mode = 'ladder';
  const T = { super: 0, coherent: 0 };                   // time in periods

  // ---------- formatting ----------
  const fixed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const pct = x => (100 * x).toFixed(1) + '%';
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  const sub = n => String(n).split('').map(d => SUB[+d]).join('');
  const half = n => fixed(n + 0.5, 1);

  // ---------- plots ----------
  const MARGIN = { l: 58, r: 22, t: 12, b: 42 };
  const well = new NanoPlot($('well'), { xLabel: 'Position x / x₀', yLabel: 'Energy (ħω)', margin: MARGIN, xTicks: 9 });
  const plotA = new NanoPlot($('plot-a'), { margin: MARGIN });
  const plotB = new NanoPlot($('plot-b'), { margin: MARGIN });
  const phasor = new PhasorView($('phasor'));
  function stats(items) {
    $('stats').innerHTML = items.map(([label, value, s]) =>
      `<div class="stat"><div class="stat__label">${label}</div><div class="stat__value">${value}</div><div class="stat__sub">${s}</div></div>`).join('');
  }
  function legend(id, items) {
    $(id).innerHTML = items.map(([color, kind, label]) => `<li style="color:${color}"><span class="swatch ${kind}"></span><span>${label}</span></li>`).join('');
  }
  function typeset(el) { if (window.MathJax && MathJax.typesetPromise && /\\\(/.test(el.innerHTML)) MathJax.typesetPromise([el]).catch(() => {}); }
  function setHTML(el, html) { if (el.dataset.html === html) return; el.dataset.html = html; el.innerHTML = html; typeset(el); }
  const info = html => setHTML($('info'), html);
  const note = html => setHTML($('takeaway'), html);

  // eigenfunctions on a grid, cached for each half-width L
  let grid = null;
  function gridFor(L) {
    if (grid && grid.L === L) return grid;
    const xs = []; for (let i = 0; i <= 600; i++) xs.push(-L + 2 * L * i / 600);
    grid = { L, xs, T: H.eigenTable(xs) };
    return grid;
  }
  const niceL = v => Math.ceil(v * 2) / 2;
  // the parabola and the rungs up to kmax, as plot layers
  function wellLayers(L, kmax, highlight) {
    const xs = [], ys = [];
    for (let i = 0; i <= 200; i++) { const x = -L + 2 * L * i / 200; xs.push(x); ys.push(x * x / 2); }
    const out = [{ type: 'line', x: xs, y: ys, color: '#8fa4ae', width: 2 }];
    for (let k = 0; k <= kmax; k++) {
      const A = H.turning(k), on = highlight && highlight.includes(k);
      out.push({ type: 'line', x: [-A, A], y: [k + 0.5, k + 0.5], color: on ? css('--series-1') : '#cfdbe1', width: on ? 1.8 : 1.1 });
    }
    return out;
  }

  // ---------- 1. Climb the ladder ----------
  function renderLadder() {
    const n = S.n, top = Math.max(n + 2, 7), L = niceL(H.turning(Math.max(n + 1, 6)) + 1.2), g = gridFor(L), psi = g.T[n];
    const re = css('--series-re'), brand = css('--series-1'), amber = css('--series-amber');
    const E = n + 0.5, A = H.turning(n);
    const layers = wellLayers(L, top, [n]);
    layers.push({ type: 'line', x: g.xs, y: Array.from(psi, v => E + 0.55 * v), color: re, width: 2.2, fill: NanoPlot.alpha(re, 0.12), fillTo: E });
    if (S.classical) layers.push({ type: 'dots', x: [-A, A], y: [E, E], color: amber, r: 4.5 });
    well.setRange([-L, L], [0, top + 1.2]);
    well.draw(layers);
    $('dg-title').textContent = 'The potential and its ladder of rungs';
    $('dg-cap').textContent = `Grey lines: the rungs E = (n + ½)ħω, spaced exactly one ħω apart. Blue: ψ${sub(n)}(x), drawn on its own rung.${S.classical ? ' Orange dots: where a classical mass with the same energy would turn round.' : ''}`;
    legend('dg-legend', []);
    stats([
      ['Rung n', `${n}`, `${n} node${n === 1 ? '' : 's'} in ψ${sub(n)}`],
      ['Energy', `${half(n)} ħω`, 'E = (n + ½)ħω'],
      ['Spread Δx', `${fixed(Math.sqrt(n + 0.5), 2)} x₀`, 'grows as √(n + ½)'],
      ['Δx · Δp', `${half(n)} ħ`, n === 0 ? 'the minimum allowed, ħ/2' : '(n + ½)ħ; the minimum, ħ/2, is only at n = 0'],
    ]);
    let msg;
    if (S.last === 'zero') msg = '<b>a|0⟩ = 0.</b> The lowering operator finds no rung below the ground state and gives nothing at all. The ground state still has energy ħω/2: the zero-point energy.';
    else if (S.last === 'raise') msg = `<b>a<sup>†</sup>|${n - 1}⟩ = √${n} |${n}⟩${Number.isInteger(Math.sqrt(n)) ? ` = ${Math.sqrt(n)}|${n}⟩` : ''}.</b> One rung up: one more ħω of energy and one more node.`;
    else if (S.last === 'lower') msg = `<b>a|${n + 1}⟩ = √${n + 1} |${n}⟩${Number.isInteger(Math.sqrt(n + 1)) ? ` = ${Math.sqrt(n + 1)}|${n}⟩` : ''}.</b> One rung down: one ħω less, one node fewer.`;
    else msg = `<b>|${n}⟩:</b> energy ${half(n)} ħω and ${n} node${n === 1 ? '' : 's'}. Press a<sup>†</sup> to climb or a to step down.`;
    info(msg);
    // plot A: a-dagger as a derivative
    let check, label;
    if (n === 0) { check = H.lowerByDerivative(g.T[0], g.xs); label = '(ξ + d/dξ)ψ₀/√2: a|0⟩, zero everywhere'; }
    else { check = Array.from(H.raiseByDerivative(g.T[n - 1], g.xs), v => v / Math.sqrt(n)); label = `(ξ − d/dξ)ψ${sub(n - 1)}/√2, divided by √${n}`; }
    plotA.opts.xLabel = 'Position x / x₀'; plotA.opts.yLabel = 'ψ (x₀^−½)'; plotA.opts.xTicks = 7; plotA.opts.zeroLine = true;
    plotA.setRange([-L, L], [-0.85, 0.85]);
    plotA.draw([
      { type: 'line', x: g.xs, y: Array.from(psi), color: re, width: 2.6 },
      { type: 'line', x: g.xs, y: Array.from(check), color: amber, width: 2, dash: [6, 4] },
    ]);
    $('pa-title').textContent = n === 0 ? 'The lowering operator as a derivative' : 'The raising operator as a derivative';
    $('pa-cap').textContent = n === 0
      ? 'Applying a = (ξ + d/dξ)/√2 to the ground state gives zero at every point: the dashed line lies flat on the axis.'
      : `Apply a† = (ξ − d/dξ)/√2 to ψ${sub(n - 1)} by taking its slope numerically, divide by √${n}, and you land exactly on ψ${sub(n)}.`;
    legend('pa-legend', [[re, '', `ψ${sub(n)}`], [amber, 'swatch--dash', label]]);
    // plot B: probability density against the classical one
    const dens = Array.from(psi, v => v * v), ymax = Math.max(...dens) * 1.35;
    const LB = [{ type: 'line', x: g.xs, y: dens, color: brand, width: 2.2, fill: NanoPlot.alpha(brand, 0.12) }];
    if (S.classical) {
      const cx = [], cy = [];
      for (let i = 1; i < 400; i++) { const x = -A + 2 * A * i / 400; cx.push(x); cy.push(H.classicalDensity(A, x)); }
      LB.push({ type: 'line', x: cx, y: cy, color: amber, width: 2, dash: [6, 4] });
      LB.push({ type: 'vline', x: -A, color: amber, width: 1, dash: [2, 3] }, { type: 'vline', x: A, color: amber, width: 1, dash: [2, 3] });
    }
    plotB.opts.xLabel = 'Position x / x₀'; plotB.opts.yLabel = 'Probability density (1/x₀)'; plotB.opts.xTicks = 7; plotB.opts.zeroLine = false;
    plotB.setRange([-L, L], [0, ymax]);
    plotB.draw(LB);
    $('pb-title').textContent = 'Where the particle is found';
    $('pb-cap').textContent = S.classical ? `|ψ${sub(n)}|² against a classical mass with the same energy, which spends most time near its turning points ±${fixed(A, 2)} x₀.` : `|ψ${sub(n)}|²: the chance of finding the particle at each position.`;
    legend('pb-legend', [[brand, '', 'quantum |ψ|²'], ...(S.classical ? [[amber, 'swatch--dash', 'classical, 1/π√(A² − x²)']] : [])]);
    note(n === 0 ? '<b>The ground state</b> is a Gaussian, most likely found at the centre, where a classical mass at rest would sit. But it can never be completely at rest: ħω/2 of energy remains.'
      : n >= 15 ? '<b>The correspondence principle:</b> at high rungs the quantum density follows the classical one on average, wiggling around it. Turn the classical curve off and on to compare.'
      : '<b>Each rung is a standing wave</b> in the parabola: n nodes, and it leaks a little past the classical turning points, where a classical mass could never go.');
    $('raise').disabled = n >= 30;
  }

  // ---------- 2. Superpositions ----------
  function pairState() {
    const c = H.number(0); c[0] = [0, 0];
    const cm = Math.sqrt(1 - S.w), ck = Math.sqrt(S.w), ph = S.rel * DEG;
    c[S.m] = [cm, 0];
    c[S.k] = [ck * Math.cos(ph), ck * Math.sin(ph)];
    return c;
  }
  let traceCache = null;
  function superTrace(c) {
    const key = [S.m, S.k, S.w, S.rel].join('|');
    if (traceCache && traceCache.key === key) return traceCache;
    const t = [], x = [], dx = [];
    for (let i = 0; i <= 400; i++) { const s = 2 * i / 400, mm = H.moments(H.evolve(c, s)); t.push(s); x.push(mm.x); dx.push(mm.dx); }
    traceCache = { key, t, x, dx };
    return traceCache;
  }
  function renderSuper() {
    const c0 = pairState(), t = T.super, c = H.evolve(c0, t), mm = H.moments(c);
    const single = S.w < 1e-9 || S.w > 1 - 1e-9, top = Math.max(S.k + 2, 5);
    const L = niceL(H.turning(Math.max(S.k, 3)) + 1.6), g = gridFor(L);
    const brand = css('--series-1'), re = css('--series-re'), amber = css('--series-amber'), ghost = css('--series-ghost');
    const d0 = H.wave(c0, g.T).dens, d = H.wave(c, g.T).dens, scale = 0.9 / Math.max(...d0), E = mm.E;
    const layers = wellLayers(L, top, single ? [S.w > 0.5 ? S.k : S.m] : [S.m, S.k]);
    layers.push({ type: 'line', x: g.xs, y: Array.from(d0, v => E + scale * v), color: ghost, width: 1.4, dash: [5, 4] });
    layers.push({ type: 'line', x: g.xs, y: Array.from(d, v => E + scale * v), color: brand, width: 2.4, fill: NanoPlot.alpha(brand, 0.14), fillTo: E });
    layers.push({ type: 'dots', x: [mm.x], y: [E], color: amber, r: 5 });
    well.setRange([-L, L], [0, top + 1.2]);
    well.draw(layers);
    $('dg-title').textContent = single ? 'One rung on its own' : `|${S.m}⟩ and |${S.k}⟩ together`;
    $('dg-cap').textContent = 'The probability density at time t, drawn at the average energy. Dashed grey: the density at t = 0. Orange dot: the centre ⟨x⟩.';
    legend('dg-legend', [[brand, '', '|ψ(x, t)|²'], [ghost, 'swatch--dash', 't = 0'], [amber, 'swatch--stem', '⟨x⟩']]);
    const gap = S.k - S.m, neighbours = gap === 1;
    stats([
      ['Rungs', single ? `|${S.w > 0.5 ? S.k : S.m}⟩` : `|${S.m}⟩ + |${S.k}⟩`, single ? 'a single eigenstate' : `weights ${pct(1 - S.w)} and ${pct(S.w)}`],
      ['Beat', single ? 'none' : `${gap} ω`, single ? 'a single rung never moves' : `the density repeats every ${gap === 1 ? 'T' : `T/${gap}`}`],
      ['Centre ⟨x⟩', `${fixed(mm.x, 2)} x₀`, single ? 'always 0' : neighbours ? 'swings: the rungs are neighbours' : 'always 0: the rungs are not neighbours'],
      ['Energy ⟨E⟩', `${fixed(E, 2)} ħω`, 'constant in time'],
    ]);
    let msg;
    if (single) msg = `<b>A stationary state:</b> |${S.w > 0.5 ? S.k : S.m}⟩ only picks up a phase, so its density never changes. Its arrow in plot A turns, but on its own a phase is invisible.`;
    else if (neighbours) msg = `<b>The two arrows turn at different rates,</b> ${half(S.m)} and ${half(S.k)} turns per period. When they line up the density bulges to one side; when they point opposite ways, to the other. So the centre swings at ω.`;
    else if (gap % 2 === 0) msg = `<b>Same parity, no swing:</b> |${S.m}⟩ and |${S.k}⟩ are both ${S.m % 2 ? 'odd' : 'even'}, so the density stays symmetric. It breathes ${gap} times per period while the centre stays at 0.`;
    else msg = `<b>Lopsided, but centred:</b> the density sloshes ${gap} times per period, yet ⟨x⟩ stays at 0. Position only links neighbouring rungs, and ${S.m} and ${S.k} are ${gap} apart.`;
    info(msg);
    // plot A: the two amplitudes as phasors
    phasor.draw({ amps: [{ z: c[S.m], color: re, label: 'c' + sub(S.m) }, { z: c[S.k], color: brand, label: 'c' + sub(S.k) }], arcColor: amber });
    $('pa-title').textContent = 'The two amplitudes';
    $('pa-cap').textContent = `Each amplitude turns clockwise at its own rate: c${sub(S.m)} at ${half(S.m)} turns per period, c${sub(S.k)} at ${half(S.k)}. The density depends only on the angle φ between them.`;
    legend('pa-legend', [[re, '', `c${sub(S.m)} on |${S.m}⟩`], [brand, '', `c${sub(S.k)} on |${S.k}⟩`]]);
    // plot B: centre and width over two periods
    const tr = superTrace(c0), ymax = Math.max(1, ...tr.dx, ...tr.x.map(Math.abs)) * 1.15;
    plotB.opts.xLabel = 'Time (periods T)'; plotB.opts.yLabel = 'x / x₀'; plotB.opts.xTicks = 5; plotB.opts.zeroLine = true;
    plotB.setRange([0, 2], [-ymax, ymax]);
    plotB.draw([
      { type: 'line', x: tr.t, y: tr.dx, color: amber, width: 2, dash: [6, 4] },
      { type: 'line', x: tr.t, y: tr.x, color: brand, width: 2.4 },
      { type: 'vline', x: t % 2, color: css('--plot-text'), width: 1.4, dash: [] },
    ]);
    $('pb-title').textContent = 'Centre and width over two periods';
    $('pb-cap').textContent = 'Solid: the centre ⟨x⟩. Dashed: the width Δx. The vertical line is now.';
    legend('pb-legend', [[brand, '', '⟨x⟩'], [amber, 'swatch--dash', 'Δx']]);
    note(single ? '<b>Add a second rung</b> with the weight slider, or pick |0⟩ + |1⟩: motion needs at least two energies.'
      : '<b>Motion is interference between rungs.</b> The beat frequency is the energy difference divided by ħ. That is why atoms emit light at the difference between two levels.');
  }

  // ---------- 3. Coherent states ----------
  let cohCache = null;
  function cohState() {
    const key = [S.amp, S.aph, S.sq].join('|');
    if (cohCache && cohCache.key === key) return cohCache.c;
    const al = [S.amp * Math.cos(S.aph * DEG), S.amp * Math.sin(S.aph * DEG)];
    const c = S.sq === 1 ? H.coherent(al) : H.gaussianState(Math.SQRT2 * al[0], Math.SQRT2 * al[1], S.sq * Math.SQRT1_2);
    cohCache = { key, c };
    return c;
  }
  function ellipse(cx, cy, sxx, syy, sxy) {
    const tr = (sxx + syy) / 2, det = Math.sqrt(Math.max(((sxx - syy) / 2) ** 2 + sxy * sxy, 0));
    const l1 = tr + det, l2 = Math.max(tr - det, 0), th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const x = [], y = [];
    for (let i = 0; i <= 80; i++) { const s = 2 * Math.PI * i / 80, u = Math.sqrt(l1) * Math.cos(s), v = Math.sqrt(l2) * Math.sin(s); x.push(cx + u * Math.cos(th) - v * Math.sin(th)); y.push(cy + u * Math.sin(th) + v * Math.cos(th)); }
    return { x, y };
  }
  function renderCoherent() {
    const c0 = cohState(), t = T.coherent, c = H.evolve(c0, t), mm = H.moments(c), m0 = H.moments(c0);
    const R = S.amp * Math.SQRT2, wide = Math.max(S.sq, 1 / S.sq) * Math.SQRT1_2;
    const L = niceL(Math.max(4, R + 3 * wide + 0.6)), g = gridFor(L);
    const brand = css('--series-1'), amber = css('--series-amber'), ghost = css('--series-ghost');
    const E = m0.E, ytop = Math.max(6, 1.3 * E + 3), scale = 0.22 * ytop / 0.564, d = H.wave(c, g.T).dens;
    const layers = wellLayers(L, Math.min(Math.ceil(ytop), 60), []);
    const xcl = R * Math.cos(2 * Math.PI * t - S.aph * DEG);
    layers.push({ type: 'line', x: g.xs, y: Array.from(d, v => E + scale * v), color: brand, width: 2.4, fill: NanoPlot.alpha(brand, 0.14), fillTo: E });
    layers.push({ type: 'dots', x: [xcl], y: [xcl * xcl / 2], color: amber, r: 6.5 });
    well.setRange([-L, L], [0, ytop]);
    well.draw(layers);
    $('dg-title').textContent = S.amp === 0 && S.sq === 1 ? 'The ground state' : S.sq === 1 ? 'A coherent state swinging in the well' : 'A squeezed state swinging in the well';
    $('dg-cap').textContent = 'The probability density at time t, drawn at the average energy. Orange ball: a classical mass with the same energy, rolling on the parabola.';
    legend('dg-legend', [[brand, '', '|ψ(x, t)|²'], [amber, 'swatch--stem', 'classical mass']]);
    const prod = mm.dx * mm.dp, overlap = mm.n > 1e-9 ? (mm.a[0] ** 2 + mm.a[1] ** 2) / mm.n : NaN;
    stats([
      ['Quanta ⟨n⟩', fixed(mm.n, 2), `energy ${fixed(mm.E, 2)} ħω`],
      ['Swing', `±${fixed(R, 2)} x₀`, 'the amplitude of ⟨x⟩, as for the classical mass'],
      ['Δx · Δp', `${fixed(prod, 3)} ħ`, S.sq === 1 ? 'ħ/2 at every moment' : 'ħ/2 only at the narrowest and widest moments'],
      ['Unchanged by a?', Number.isFinite(overlap) ? pct(overlap) : 'a|0⟩ = 0', Number.isFinite(overlap) ? (S.sq === 1 ? 'overlap of a|ψ⟩ with |ψ⟩: a|α⟩ = α|α⟩' : 'not an eigenstate of a') : 'the ground state is |α = 0⟩'],
    ]);
    let msg;
    if (S.sq === 1 && S.amp === 0) msg = '<b>The ground state is a coherent state</b> with α = 0. It sits still in the centre.';
    else if (S.sq === 1) msg = `<b>It never spreads.</b> The Gaussian keeps its width, Δx = ${fixed(mm.dx, 2)} x₀, and follows the classical mass exactly: ⟨x⟩ = ${fixed(mm.x, 2)} x₀ now. A free packet would spread; the spring's pull refocuses this one all the time.`;
    else msg = `<b>A squeezed state breathes as it swings:</b> Δx = ${fixed(mm.dx, 2)} x₀ now, between ${fixed(Math.min(S.sq, 1 / S.sq) * Math.SQRT1_2, 2)} and ${fixed(Math.max(S.sq, 1 / S.sq) * Math.SQRT1_2, 2)} x₀, twice per period. Its centre still follows the classical mass.`;
    info(msg);
    // plot A: phase space
    const sx = mm.dx * mm.dx, sp = mm.dp * mm.dp;
    const el = ellipse(mm.x, mm.p, sx, sp, mm.cov), circ = { x: [], y: [] };
    for (let i = 0; i <= 120; i++) { const s = 2 * Math.PI * i / 120; circ.x.push(R * Math.cos(s)); circ.y.push(R * Math.sin(s)); }
    const half2 = Math.max(R + 2.2 * wide + 0.6, 2.5), mA = plotA.m, wA = plotA.w - mA.l - mA.r, hA = plotA.h - mA.t - mA.b, ar = wA / hA;
    plotA.opts.xLabel = 'Position ⟨x⟩ / x₀'; plotA.opts.yLabel = 'Momentum ⟨p⟩ (ħ/x₀)'; plotA.opts.xTicks = 7; plotA.opts.zeroLine = true;
    plotA.setRange(ar >= 1 ? [-half2 * ar, half2 * ar] : [-half2, half2], ar >= 1 ? [-half2, half2] : [-half2 / ar, half2 / ar]);
    plotA.draw([
      { type: 'line', x: circ.x, y: circ.y, color: ghost, width: 1.4, dash: [5, 4] },
      { type: 'poly', x: el.x, y: el.y, fill: NanoPlot.alpha(brand, 0.22), color: brand, width: 1.6 },
      { type: 'dots', x: [mm.x], y: [mm.p], color: brand, r: 4 },
      { type: 'dots', x: [xcl], y: [-R * Math.sin(2 * Math.PI * t - S.aph * DEG)], color: amber, r: 3 },
    ]);
    $('pa-title').textContent = 'Phase space';
    $('pa-cap').textContent = 'The state as a blob in position and momentum: its centre goes round the classical circle once per period, clockwise. The blob\'s size is the uncertainty; for a coherent state it is a circle of fixed size.';
    legend('pa-legend', [[brand, 'swatch--area', 'uncertainty, one Δ'], [ghost, 'swatch--dash', 'classical orbit']]);
    // plot B: number distribution against Poisson
    const nmax = Math.min(H.NMAX - 1, Math.ceil(mm.n + 4 * Math.sqrt(mm.n + 0.5) + 6));
    const nx = [], ny = [], px = [], py = [];
    for (let k = 0; k <= nmax; k++) { nx.push(k); ny.push(H.abs2(c0[k])); px.push(k); py.push(H.poisson(m0.n, k)); }
    plotB.opts.xLabel = 'Rung n'; plotB.opts.yLabel = 'P(n)'; plotB.opts.xTicks = 7; plotB.opts.zeroLine = false;
    plotB.setRange([-0.6, nmax + 0.6], [0, Math.max(...ny, ...py) * 1.18]);
    plotB.draw([
      { type: 'stems', x: nx, y: ny, color: brand, r: 3.5 },
      ...(m0.n > 1e-9 ? [{ type: 'dots', x: px, y: py, color: amber, r: 3 }] : []),
    ]);
    $('pb-title').textContent = 'How many quanta?';
    $('pb-cap').textContent = S.sq === 1 ? `|c${sub(0)}|², |c${sub(1)}|², …: a Poisson spread around |α|² = ${fixed(m0.n, 2)}. It does not change in time.` : 'A squeezed state favours even or odd steps and does not follow the Poisson curve for the same mean.';
    legend('pb-legend', [[brand, 'swatch--stem', 'P(n) = |cₙ|²'], [amber, 'swatch--stem', `Poisson, mean ${fixed(m0.n, 2)}`]]);
    note(S.sq === 1 ? '<b>Why it holds together:</b> its rungs are spaced exactly ħω apart, so every amplitude comes back into step once per period. In a potential with uneven spacing the packet would spread out and later reassemble.'
      : '<b>Squeezing</b> trades uncertainty in one quantity for the other. It is used to push measurements below the standard quantum limit, for example in gravitational-wave detectors.');
  }

  // ---------- render ----------
  function syncControls() {
    $('rung').value = S.n; $('rung-out').textContent = S.n;
    $('classical').checked = S.classical;
    $('lev-m').value = S.m; $('lev-m-out').textContent = S.m;
    $('lev-n').value = S.k; $('lev-n-out').textContent = S.k;
    $('weight').value = S.w; $('weight-out').textContent = pct(S.w).replace('.0%', '%');
    $('relphase').value = S.rel; $('relphase-out').textContent = `${S.rel}°`;
    document.querySelectorAll('[data-pair]').forEach(b => { const [m, k, w] = b.dataset.pair.split(',').map(Number); b.setAttribute('aria-pressed', String(m === S.m && k === S.k && w === S.w && S.rel === 0)); });
    $('alpha').value = S.amp; $('alpha-out').textContent = fixed(S.amp, 2);
    $('aphase').value = S.aph; $('aphase-out').textContent = `${S.aph}°`;
    $('squeeze').value = S.sq; $('squeeze-out').textContent = `${fixed(S.sq, 2)}×`;
    document.querySelectorAll('[data-coh]').forEach(b => { const [a, p, s] = b.dataset.coh.split(',').map(Number); b.setAttribute('aria-pressed', String(a === S.amp && p === S.aph && s === S.sq)); });
  }
  function render() {
    syncControls();
    $('pa-box').hidden = mode === 'super'; $('phasor-box').hidden = mode !== 'super';
    if (mode === 'ladder') renderLadder(); else if (mode === 'super') renderSuper(); else renderCoherent();
    const t = T[mode] || 0;
    $('time-out').textContent = `t = ${fixed(t, 2)} T`;
    $('play').textContent = playing ? '❚❚ Pause' : '▶ Play';
  }
  function applyMode() {
    document.querySelectorAll('.tab').forEach(b => { const on = b.dataset.mode === mode; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $('lab').setAttribute('aria-labelledby', 'tab-' + mode);
    document.querySelectorAll('.mode-intro').forEach(el => { el.hidden = el.dataset.for !== mode; });
    document.querySelectorAll('[data-modes]').forEach(el => { el.hidden = !el.dataset.modes.split(' ').includes(mode); });
    render();
  }

  // ---------- playback ----------
  let playing = false, raf = 0, lastT = 0, speed = 1;
  function frame(now) {
    if (!playing) return;
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    T[mode] += 0.5 * dt * speed;            // one period every 2 s at 1x
    render();
    raf = requestAnimationFrame(frame);
  }
  function stop() { playing = false; cancelAnimationFrame(raf); }
  $('play').addEventListener('click', () => {
    if (playing) { stop(); render(); return; }
    if (reduceMotion) { T[mode] += 0.125; render(); return; }      // step an eighth of a period instead of animating
    playing = true; lastT = performance.now(); raf = requestAnimationFrame(frame); render();
  });
  $('reset').addEventListener('click', () => { stop(); T[mode] = 0; render(); });
  $('speed').addEventListener('change', e => { speed = +e.target.value; });

  // ---------- controls ----------
  $('raise').addEventListener('click', () => { if (S.n < 30) { S.n++; S.last = 'raise'; render(); } });
  $('lower').addEventListener('click', () => { if (S.n > 0) { S.n--; S.last = 'lower'; } else S.last = 'zero'; render(); });
  $('rung').addEventListener('input', e => { S.n = +e.target.value; S.last = null; render(); });
  $('classical').addEventListener('change', e => { S.classical = e.target.checked; render(); });
  const pairChanged = () => { if (S.k <= S.m) S.k = Math.min(9, S.m + 1); if (S.m >= S.k) S.m = S.k - 1; T.super = 0; };
  $('lev-m').addEventListener('input', e => { S.m = +e.target.value; if (S.k <= S.m) S.k = S.m + 1; pairChanged(); render(); });
  $('lev-n').addEventListener('input', e => { S.k = +e.target.value; if (S.m >= S.k) S.m = S.k - 1; pairChanged(); render(); });
  $('weight').addEventListener('input', e => { S.w = +e.target.value; T.super = 0; render(); });
  $('relphase').addEventListener('input', e => { S.rel = +e.target.value; T.super = 0; render(); });
  document.querySelectorAll('[data-pair]').forEach(b => b.addEventListener('click', () => { [S.m, S.k, S.w] = b.dataset.pair.split(',').map(Number); S.rel = 0; T.super = 0; render(); }));
  $('alpha').addEventListener('input', e => { S.amp = +e.target.value; T.coherent = 0; render(); });
  $('aphase').addEventListener('input', e => { S.aph = +e.target.value; T.coherent = 0; render(); });
  $('squeeze').addEventListener('input', e => { S.sq = +e.target.value; T.coherent = 0; render(); });
  document.querySelectorAll('[data-coh]').forEach(b => b.addEventListener('click', () => { [S.amp, S.aph, S.sq] = b.dataset.coh.split(',').map(Number); T.coherent = 0; render(); }));

  const tabs = Array.from(document.querySelectorAll('.tab'));
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => { stop(); mode = b.dataset.mode; applyMode(); });
    b.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus(); next.click();
    });
  });

  // ---------- predict-first loaders ----------
  const QUESTIONS = {
    q1: () => { mode = 'ladder'; S.n = 0; S.last = null; },
    q2: () => { mode = 'ladder'; S.n = 3; S.last = null; },
    q3: () => { mode = 'ladder'; S.n = 30; S.last = null; S.classical = true; },
    q4: () => { mode = 'super'; S.m = 0; S.k = 2; S.w = 1; S.rel = 0; T.super = 0; },
    q5: () => { mode = 'super'; S.m = 0; S.k = 1; S.w = 0.5; S.rel = 0; T.super = 0; },
    q6: () => { mode = 'super'; S.m = 0; S.k = 2; S.w = 0.5; S.rel = 0; T.super = 0; },
    q7: () => { mode = 'coherent'; S.amp = 2; S.aph = 0; S.sq = 1; T.coherent = 0; },
    q8: () => { mode = 'coherent'; S.amp = 2; S.aph = 0; S.sq = 0.5; T.coherent = 0; },
  };
  document.querySelectorAll('.predict__load[data-q]').forEach(b => b.addEventListener('click', () => {
    stop();
    QUESTIONS[b.dataset.q]();
    applyMode();
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }));

  applyMode();
})();
