/* Nanoscale transistor: controls, sweeps and plots. Physics in physics.js; the band diagram in views.js. */
(function () {
  'use strict';
  const F = window.FET;
  const $ = id => document.getElementById(id);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const VIDEO = { EF: 0.2, L: 50, T: 300, alpha: 1 };
  const S = { U0: 0.15, VD: 0.1, T: 300, L: 50, alpha: 1, EF: 0.2 };
  let mode = 'window';
  const opts = () => ({ EF: S.EF, L: S.L * 1e-9 });
  const kT = () => F.kTeV(S.T);
  const NAVY = '#1d2b53', RED = '#d9495f', INK = '#14232c';
  const SLIDE_U0 = [0.1, 0.125, 0.15, 0.175, 0.2];
  const SLIDE_COL = ['#1f77b4', '#d95f02', '#e0a91a', '#7b3294', '#4daf4a'];

  // ---------- formatting ----------
  const fixed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  const sup = n => String(n).split('').map(c => SUP[c] || c).join('');
  function fmtI(x) {
    if (!(x > 0)) return '0';
    if (x >= 100) return Math.round(x).toLocaleString('en-US');
    if (x >= 1e-2) return x.toPrecision(3);
    const k = Math.floor(Math.log10(x));
    return `${(x / Math.pow(10, k)).toFixed(1)} × 10${sup(k)}`;
  }
  const pct = x => (x >= 0.995 ? '100' : x >= 0.1 ? (100 * x).toFixed(0) : (100 * x).toFixed(x >= 0.01 ? 1 : 2)) + '%';

  // ---------- shared helpers ----------
  function stats(items) {
    $('stats').innerHTML = items.map(([label, value, sub2]) =>
      `<div class="stat"><div class="stat__label">${rich(label)}</div><div class="stat__value">${rich(value)}</div><div class="stat__sub">${rich(sub2)}</div></div>`).join('');
  }
  function legend(id, items) {
    $(id).innerHTML = items.map(([color, kind, label]) => `<li style="color:${color}"><span class="swatch ${kind}"></span><span>${rich(label)}</span></li>`).join('');
  }
  function typeset(el) { if (window.MathJax && MathJax.typesetPromise && /\\\(/.test(el.innerHTML)) MathJax.typesetPromise([el]).catch(() => {}); }
  const rich = t => String(t).replace(/_\{([^}]*)\}|_([A-Za-z0-9])/g, (m, a, b) => `<sub>${a || b}</sub>`);
  const put = (id, t) => setHTML($(id), rich(t));
  function setHTML(el, html) { if (el.dataset.html === html) return; el.dataset.html = html; el.innerHTML = html; typeset(el); }
  const info = html => setHTML($('info'), html);
  const note = html => setHTML($('takeaway'), html);
  const MARGIN = { l: 62, r: 22, t: 12, b: 42 };
  const plotA = new NanoPlot($('plot-a'), { margin: MARGIN, narrowMargin: { l: 60 } });
  const plotB = new NanoPlot($('plot-b'), { margin: MARGIN, narrowMargin: { l: 60 } });
  const narrow = () => $('band').clientWidth < 560;
  const range = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);

  // the share of the current carried at each energy, for the moving band over the barrier
  function spectrum(U0, VD) {
    const lo = Math.max(0, U0 - (S.L < 4 ? 0.25 : 0.04)), hi = Math.max(U0, S.EF) + 8 * kT();
    const Es = range(lo, hi, 90), js = Es.map(E => F.spectral(E, U0, VD, S.T, opts()));
    const m = Math.max(...js);
    return { Es, js, list: Es.map((E, i) => [E, m > 0 ? js[i] / m : 0]) };
  }
  function drawBand(U0, VD, gateText) {
    const sp = VD > 0 ? spectrum(U0, VD).list : [];
    $('band').innerHTML = BandView.draw({ U0, VD, EF: S.EF, kT: kT(), Lnm: S.L, spectrum: sp, narrow: narrow(), windows: true, gateText });
  }

  // ---------- 1. The Landauer picture ----------
  // put the U0 label on the barrier line, as far as possible from where f_S and f_D cross it
  function uLabel(Elo, Ehi) {
    const a = F.fermi(S.U0, S.EF, S.T), b = F.fermi(S.U0, S.EF - S.VD, S.T);
    const spots = [[0.03, 'left'], [0.52, 'center'], [1.02, 'right']];
    const [x, align] = spots.reduce((best, c) => (Math.min(Math.abs(c[0] - a), Math.abs(c[0] - b)) > Math.min(Math.abs(best[0] - a), Math.abs(best[0] - b)) ? c : best));
    return { type: 'text', x, y: S.U0 + 0.065 * (Ehi - Elo), text: 'barrier top U₀', align, color: css('--plot-text') };
  }
  function renderWindow() {
    const o = opts(), f = F.flows(S.U0, S.VD, S.T, o), I = f.S - f.D;
    drawBand(S.U0, S.VD);
    put('dg-title', S.U0 < S.EF ? 'Transistor in the “on” state' : 'Transistor in the “off” state');
    put('dg-cap', 'Blue balls: electrons, fading where the Fermi function falls. Pink: the hot tail above E_F. Yellow: the cold window between the two Fermi levels. The moving orange band over the barrier shows where in energy the current flows.');
    stats([
      ['Barrier U₀', `${fixed(S.U0, 3)} eV`, S.U0 < S.EF ? 'below E_F: the transistor is on' : 'above E_F: the transistor is off'],
      ['Drain Fermi level', `${fixed(S.EF - S.VD, 3)} eV`, 'E′_F = E_F − eV_D'],
      ['Current I_D', `${fmtI(I)} µA/µm`, 'source flow minus drain flow'],
      ['Through the barrier', I > 0 ? pct(f.tunnel / I) : '—', 'the share that tunnels rather than going over'],
    ]);
    if (S.VD === 0) info('<b>No drain bias:</b> f<sub>S</sub> and f<sub>D</sub> are identical, so at every energy as many electrons cross from the drain as from the source. The current is exactly zero, however low the barrier.');
    else if (S.U0 >= S.EF) info(`<b>Off:</b> the barrier is ${fixed(1000 * (S.U0 - S.EF), 0)} meV above E<sub>F</sub>. Only hot electrons in the Boltzmann tail of the source get over, so the current flows in a thin band just above the barrier top.`);
    else info(`<b>On:</b> the barrier is ${fixed(1000 * (S.EF - S.U0), 0)} meV below E<sub>F</sub>. Every source electron with E<sub>x</sub> above U<sub>0</sub> crosses; the drain sends back only those above its own, lower, Fermi level.`);
    // plot A: occupations against energy
    const Elo = Math.max(-0.55, -S.VD - 0.05), Ehi = Math.max(S.U0, S.EF) + 0.15, Es = range(Elo, Ehi, 240);
    const fS = Es.map(E => F.fermi(E, S.EF, S.T)), fD = Es.map(E => F.fermi(E, S.EF - S.VD, S.T));
    const brand = css('--series-1');
    plotA.opts.xLabel = 'Occupation f(E)'; plotA.opts.yLabel = 'Energy E (eV)'; plotA.opts.xTicks = 5; plotA.opts.yFormat = null;
    plotA.setRange([0, 1.05], [Elo, Ehi]);
    plotA.draw([
      { type: 'poly', x: fS.concat(fD.slice().reverse()), y: Es.concat(Es.slice().reverse()), fill: NanoPlot.alpha(brand, 0.25) },
      { type: 'hline', y: S.U0, color: css('--plot-text'), width: 1.4, dash: [] },
      { type: 'hline', y: S.EF, color: RED, width: 1.2, dash: [5, 4] },
      { type: 'hline', y: S.EF - S.VD, color: RED, width: 1.2, dash: [2, 3] },
      { type: 'line', x: fD, y: Es, color: RED, width: 2.4 },
      { type: 'line', x: fS, y: Es, color: NAVY, width: 2.4 },
      uLabel(Elo, Ehi),
    ]);
    put('pa-title', 'Who has electrons at each energy');
    put('pa-cap', 'The source fills states up to E_F, the drain up to E′_F (for k_y = 0, as on the slides). Shaded: where the source has electrons the drain lacks. The grey line is the barrier top.');
    legend('pa-legend', [[NAVY, '', 'f_S(E)'], [RED, '', 'f_D(E)'], [brand, 'swatch--area', 'f_S − f_D']]);
    // plot B: energy-resolved current
    const sp = spectrum(S.U0, S.VD), jx = sp.js.map(j => j / 1000), jmax = Math.max(...jx, 1e-30);
    const Tline = sp.Es.map(E => F.transmission(E, S.U0, F.params(o)) * jmax);
    plotB.opts.xLabel = 'Current per energy (µA/µm per meV)'; plotB.opts.yLabel = 'Energy Eₓ (eV)'; plotB.opts.xTicks = 4; plotB.opts.yFormat = null;
    plotB.setRange([0, jmax * 1.12], [Elo, Ehi]);
    plotB.draw([
      { type: 'poly', x: [0, ...jx, 0], y: [sp.Es[0], ...sp.Es, sp.Es[sp.Es.length - 1]], fill: NanoPlot.alpha(brand, 0.28), color: brand, width: 2 },
      { type: 'line', x: Tline, y: sp.Es, color: css('--plot-text'), width: 1.5, dash: [5, 4] },
      { type: 'hline', y: S.U0, color: css('--plot-text'), width: 1.4, dash: [] },
      { type: 'hline', y: S.EF, color: RED, width: 1.2, dash: [5, 4] },
    ]);
    put('pb-title', 'Where the current flows in energy');
    put('pb-cap', 'T(E_x)[F₋₁/₂(η_S) − F₋₁/₂(η_D)]: the integrand of the Landauer formula. Dashed: the transmission T(E_x), scaled to the peak. It is 1 above the barrier and falls off steeply below.');
    legend('pb-legend', [[brand, 'swatch--area', 'current at each energy'], [css('--plot-text'), 'swatch--dash', 'T(E_x), scaled']]);
    note(S.VD === 0 ? '<b>Try raising V<sub>D</sub>:</b> the drain sea drops, and a window opens where the source has electrons the drain does not.'
      : S.U0 >= S.EF ? '<b>Hot electrons carry the off current.</b> Lower the barrier with the gate, or raise the temperature, and watch the band over the barrier fill up.'
      : '<b>The current flows between the barrier top and E<sub>F</sub>, smeared by a few k<sub>B</sub>T.</b> Raise V<sub>D</sub> until E′<sub>F</sub> passes below the barrier, and the drain stops sending electrons back.');
  }

  // ---------- 2. Drain bias and saturation ----------
  const cache = new Map();
  function memo(key, fn) { if (!cache.has(key)) { if (cache.size > 200) cache.clear(); cache.set(key, fn()); } return cache.get(key); }
  const VDs = range(0, 0.5, 100);
  function outputCurve(U0) {
    return memo(`out|${U0}|${S.T}|${S.EF}|${S.L}`, () => VDs.map(v => F.current(U0, v, S.T, opts())));
  }
  function renderDrain() {
    const o = opts(), f = F.flows(S.U0, S.VD, S.T, o), I = f.S - f.D, Isat = f.S;
    drawBand(S.U0, S.VD);
    put('dg-title', `Drain bias V_D = ${fixed(S.VD, 3)} V`);
    put('dg-cap', 'As V_D rises, the drain sea drops. Once its Fermi level falls below the barrier top, no drain electrons can get back over, and the current stops growing.');
    const onset = S.U0 < S.EF ? S.EF - S.U0 : NaN;
    stats([
      ['Current I_D', `${fmtI(I)} µA/µm`, `at V_D = ${fixed(S.VD, 3)} V`],
      ['Saturation current', `${fmtI(Isat)} µA/µm`, 'what the source sends; set by U₀ and T'],
      ['Drain back-flow', Isat > 0 ? pct(f.D / Isat) : '—', 'as a share of the source flow'],
      ['Saturates near', Number.isFinite(onset) ? `${fixed(onset, 3)} V` : `≈ ${fixed(3 * kT(), 3)} V`, Number.isFinite(onset) ? 'eV_D = E_F − U₀: E′_F at the barrier top' : 'a few k_BT/e: the barrier is above E_F'],
    ]);
    info(f.D / Isat > 0.05
      ? `<b>Still linear-ish:</b> the drain sends back ${pct(f.D / Isat)} of what the source sends. Raise V<sub>D</sub> and the back-flow shrinks.`
      : `<b>Saturated:</b> the back-flow is down to ${pct(f.D / Isat)}. Raising V<sub>D</sub> further changes almost nothing: the current is the source flow alone.`);
    // plot A: output characteristics
    const brand = css('--series-1'), LA = [];
    let ymax = 0;
    SLIDE_U0.forEach((u, i) => { const c = outputCurve(u); ymax = Math.max(ymax, ...c); LA.push({ type: 'line', x: VDs, y: c, color: SLIDE_COL[i], width: Math.abs(u - S.U0) < 1e-9 ? 3 : 1.6 }); });
    const mine = outputCurve(S.U0);
    ymax = Math.max(ymax, ...mine) * 1.12;
    const g = F.current(S.U0, 1e-4, S.T, o) / 1e-4;
    LA.push({ type: 'line', x: [0, Math.min(0.5, 1.15 * Isat / g)], y: [0, Math.min(0.5, 1.15 * Isat / g) * g], color: css('--plot-text'), width: 1.5, dash: [6, 4] });
    LA.push({ type: 'hline', y: Isat, color: css('--plot-text'), width: 1.5, dash: [6, 4] });
    if (Number.isFinite(onset) && onset <= 0.5) LA.push({ type: 'vline', x: onset, color: css('--plot-text'), width: 1.2, dash: [2, 3], label: 'saturation onset' });
    if (!SLIDE_U0.some(u => Math.abs(u - S.U0) < 1e-9)) LA.push({ type: 'line', x: VDs, y: mine, color: INK, width: 3 });
    LA.push({ type: 'dots', x: [S.VD], y: [I], color: '#14232c', r: 5 });
    plotA.opts.xLabel = 'Drain voltage (V)'; plotA.opts.yLabel = 'Drain current (µA/µm)'; plotA.opts.xTicks = 5; plotA.opts.yFormat = null;
    plotA.setRange([0, 0.5], [0, ymax]);
    plotA.draw(LA);
    put('pa-title', 'Output characteristics');
    put('pa-cap', `The video's five barriers, 0.1 to 0.2 eV, at ${S.T} K. Dashed grey: the linear and saturation asymptotes for U₀ = ${fixed(S.U0, 3)} eV; the dotted line is where E′_F reaches the barrier top.`);
    legend('pa-legend', SLIDE_U0.map((u, i) => [SLIDE_COL[i], '', `${u} eV`]).concat(SLIDE_U0.some(u => Math.abs(u - S.U0) < 1e-9) ? [] : [[INK, '', `${fixed(S.U0, 3)} eV`]]));
    // plot B: the two flows
    const fl = memo(`flows|${S.U0}|${S.T}|${S.EF}|${S.L}`, () => VDs.map(v => F.flows(S.U0, v, S.T, opts())));
    plotB.opts.xLabel = 'Drain voltage (V)'; plotB.opts.yLabel = 'Flow (µA/µm)'; plotB.opts.xTicks = 5; plotB.opts.yFormat = null;
    plotB.setRange([0, 0.5], [0, Isat * 1.12]);
    plotB.draw([
      { type: 'line', x: VDs, y: fl.map(q => q.S), color: NAVY, width: 2.2 },
      { type: 'line', x: VDs, y: fl.map(q => q.D), color: RED, width: 2.2, dash: [6, 4] },
      { type: 'line', x: VDs, y: fl.map(q => q.S - q.D), color: brand, width: 2.8 },
      { type: 'vline', x: S.VD, color: css('--plot-text'), width: 1.2, dash: [] },
    ]);
    put('pb-title', 'Two flows, one current');
    put('pb-cap', 'The flow from the source does not depend on V_D. Saturation is the flow back from the drain dying away.');
    legend('pb-legend', [[NAVY, '', 'source → drain'], [RED, 'swatch--dash', 'drain → source'], [brand, '', 'I_D, the difference']]);
    note('<b>A transistor saturates because it runs out of back-flow, not because the electrons run out of speed.</b> The saturation current is fixed by how many source electrons sit above the barrier, which is exactly what the gate controls.');
  }

  // ---------- 3. Gate and subthreshold slope ----------
  const U0s = range(0.1, 0.4, 120);
  function transfer(T) { return memo(`tr|${T}|${S.VD}|${S.EF}|${S.L}`, () => U0s.map(u => F.current(u, S.VD, T, opts()))); }
  function slopes(T) { return memo(`sl|${T}|${S.VD}|${S.EF}|${S.L}`, () => U0s.map(u => F.slope(u, S.VD, T, opts()))); }
  function renderGate() {
    const o = opts(), I = F.current(S.U0, S.VD, S.T, o), sU = F.slope(S.U0, S.VD, S.T, o), ideal = F.idealSlope(S.T);
    drawBand(S.U0, S.VD, 'V_G');
    put('dg-title', `Barrier U₀ = ${fixed(S.U0, 3)} eV`);
    put('dg-cap', 'The gate moves the barrier top up and down. Above E_F, every k_BT of extra barrier divides the number of electrons that can get over it by e.');
    stats([
      ['Current I_D', `${fmtI(I)} µA/µm`, `at V_D = ${fixed(S.VD, 2)} V`],
      ['Barrier per decade', `${fixed(sU, 1)} meV`, 'local −dU₀ / d log₁₀ I_D'],
      ['Gate swing per decade', `${fixed(sU / S.alpha, 1)} mV`, S.alpha < 1 ? `÷ α = ${fixed(S.alpha, 2)}` : 'for a perfect gate, α = 1'],
      ['Thermal limit', `${fixed(ideal, 1)} mV/dec`, `ln(10) k_BT/e at ${S.T} K`],
    ]);
    const f = F.flows(S.U0, S.VD, S.T, o), tun = f.tunnel / (f.S - f.D);
    info(S.U0 < S.EF ? '<b>On state:</b> the barrier is below E<sub>F</sub>, so lowering it further adds electrons only slowly. The slope here is not set by the Boltzmann tail.'
      : tun > 0.2 ? `<b>Tunnelling takes over:</b> ${pct(tun)} of this off current goes through the barrier, not over it, and the gate's grip on it is weaker than ${fixed(ideal, 0)} meV per decade.`
      : `<b>Subthreshold:</b> the barrier is above E<sub>F</sub>, and the current falls tenfold for every ${fixed(sU, 1)} meV of barrier, close to the thermal limit of ${fixed(ideal, 1)} meV.`);
    // plot A: log current against the barrier height
    const brand = css('--series-1'), ref = [[300, '#1f77b4'], [200, '#7b3294']];
    const LA = [{ type: 'vband', x0: S.EF, x1: 0.4, color: 'rgba(240, 160, 140, 0.16)' }];
    let lo = Infinity, hi = -Infinity;
    const curves = ref.map(([T, c]) => [T, c, transfer(T).map(Math.log10)]);
    const showMine = !ref.some(([T]) => T === S.T);
    if (showMine) curves.push([S.T, brand, transfer(S.T).map(Math.log10)]);
    curves.forEach(([T, c, y]) => { lo = Math.min(lo, ...y); hi = Math.max(hi, ...y); LA.push({ type: 'line', x: U0s, y, color: c, width: T === S.T ? 3 : 1.8 }); });
    // ideal slope through the current curve at U0 = 0.35
    const y35 = Math.log10(F.current(0.35, S.VD, S.T, o)), kt = kT();
    LA.push({ type: 'line', x: [0.15, 0.4], y: [y35 + (0.35 - 0.15) / (Math.LN10 * kt), y35 - (0.4 - 0.35) / (Math.LN10 * kt)], color: RED, width: 1.4, dash: [5, 4] });
    LA.push({ type: 'dots', x: [S.U0], y: [Math.log10(I)], color: '#14232c', r: 5 });
    plotA.opts.xLabel = 'Barrier height U₀ (eV)'; plotA.opts.yLabel = 'Drain current (µA/µm)'; plotA.opts.xTicks = 7;
    plotA.opts.yFormat = v => (Math.abs(v - Math.round(v)) < 1e-9 ? '10' + sup(Math.round(v)) : '');
    plotA.setRange([0.1, 0.4], [Math.floor(lo) - 0.2, Math.ceil(hi) + 0.2]);
    plotA.draw(LA);
    put('pa-title', 'Turning the transistor off');
    put('pa-cap', `I_D on a log scale at V_D = ${fixed(S.VD, 2)} V${S.L < 50 ? `, L = ${S.L} nm` : ''}. Shaded: the barrier above E_F. Dashed red: the ideal slope, one decade per ${fixed(F.idealSlope(S.T), 1)} meV.`);
    legend('pa-legend', [...ref.map(([T, c]) => [c, '', `${T} K`]), ...(showMine ? [[brand, '', `${S.T} K`]] : []), [RED, 'swatch--dash', 'ln(10) k_BT per decade']]);
    // plot B: local slope
    const LB = [];
    ref.forEach(([T, c]) => { LB.push({ type: 'hline', y: F.idealSlope(T) / S.alpha, color: c, width: 1, dash: [3, 4] }); LB.push({ type: 'line', x: U0s, y: slopes(T).map(v => v / S.alpha), color: c, width: T === S.T ? 3 : 1.8 }); });
    if (showMine) { LB.push({ type: 'hline', y: ideal / S.alpha, color: brand, width: 1, dash: [3, 4] }); LB.push({ type: 'line', x: U0s, y: slopes(S.T).map(v => v / S.alpha), color: brand, width: 3 }); }
    LB.push({ type: 'vline', x: S.U0, color: css('--plot-text'), width: 1.2, dash: [] });
    plotB.opts.xLabel = 'Barrier height U₀ (eV)'; plotB.opts.yLabel = 'Swing (mV/decade)'; plotB.opts.xTicks = 7; plotB.opts.yFormat = null;
    plotB.setRange([0.1, 0.4], [0, Math.max(150, 1.1 * ideal / S.alpha)]);
    plotB.draw(LB);
    put('pb-title', 'Subthreshold slope');
    put('pb-cap', 'Gate voltage needed per decade of current. Above E_F it settles at ln(10) k_BT/(αe); dotted lines mark that limit for each temperature.');
    legend('pb-legend', [...ref.map(([T, c]) => [c, '', `${T} K`]), ...(showMine ? [[brand, '', `${S.T} K`]] : []), [css('--plot-text'), 'swatch--dash', 'thermal limit']]);
    note('<b>The Boltzmann tyranny:</b> at room temperature no transistor that works by lifting electrons over a barrier can switch faster than about 60 mV per decade. That is why supply voltages stopped shrinking: switching off needs several decades, and each costs 60 mV.');
  }

  // ---------- 4. Near equilibrium ----------
  const EFs = range(-0.1, 0.4, 200);
  function renderCond() {
    const o = opts(), G = F.conductance(S.T, o), G0 = F.conductance0(o), M = F.modesPerMetre(o) * 1e-6;
    $('band').innerHTML = BandView.draw({ U0: 0, VD: 0.01, EF: S.EF, kT: kT(), Lnm: S.L, spectrum: spectrumCond(), narrow: narrow(), windows: true });
    put('dg-title', 'A ballistic channel with no barrier');
    put('dg-cap', 'No barrier and a tiny drain bias. The current is carried at the Fermi energy, but the streaks spread over every E_x from the band edge to E_F: each one is a transverse mode (a value of k_y) passing straight through.');
    stats([
      ['Modes', S.EF > 0 ? `${fixed(M, 0)} per µm` : 'none at 0 K', 'Wk_F/π, below E_F'],
      ['Conductance', `${G / 1e3 >= 0.1 ? fixed(G / 1e3, 2) : fmtI(G / 1e3)} mS/µm`, `at ${S.T} K`],
      ['Resistance × width', G > 0 ? `${G > 1e3 ? fixed(1e6 / G, 1) : fmtI(1e6 / G)} Ω·µm` : '—', 'the ballistic limit: no scattering at all'],
      ['G / G(0 K)', S.EF > 0 ? fixed(G / G0, 4) : '—', `per mode: 2e²/h = ${fixed(F.G_QUANTUM * 1e6, 1)} µS`],
    ]);
    const x = S.EF / kT();
    info(S.EF <= 0 ? `<b>Nondegenerate source:</b> E<sub>F</sub> is below the band edge, so only the thermal tail conducts. G falls as e<sup>E_F/k_BT</sup>, the regime where F₋₁/₂(x) ≈ eˣ.`
      : x > 5 ? `<b>Degenerate source:</b> E<sub>F</sub> = ${fixed(x, 1)} k<sub>B</sub>T, so F₋₁/₂ is close to 2√(x/π) and G is within ${pct(1 - G / G0)} of its 0 K value.`
      : `<b>In between:</b> E<sub>F</sub> is only ${fixed(x, 1)} k<sub>B</sub>T above the band edge, so neither approximation of F₋₁/₂ is accurate; the full integral is used.`);
    // plot A: conductance against E_F
    const brand = css('--series-1');
    const g = EFs.map(e => F.conductance(S.T, { EF: e, L: S.L * 1e-9 }) / 1e3), g0 = EFs.map(e => F.conductance0({ EF: e }) / 1e3);
    plotA.opts.xLabel = 'Fermi energy (eV)'; plotA.opts.yLabel = 'G (mS/µm)'; plotA.opts.xTicks = 6; plotA.opts.yFormat = null;
    plotA.setRange([-0.1, 0.4], [0, Math.max(...g, ...g0) * 1.08]);
    plotA.draw([
      { type: 'line', x: EFs, y: g0, color: NAVY, width: 1.8, dash: [6, 4] },
      { type: 'line', x: EFs, y: g, color: brand, width: 2.6 },
      { type: 'dots', x: [S.EF], y: [G / 1e3], color: '#14232c', r: 5 },
    ]);
    put('pa-title', 'Conductance and the number of modes');
    put('pa-cap', `Dashed: the video's 0 K result, G = (g_s e²/h)(W/π)√(2m_yE_F)/ħ, which grows as √E_F like the number of modes. Solid: the exact result at ${S.T} K.`);
    legend('pa-legend', [[NAVY, 'swatch--dash', '0 K formula'], [brand, '', `${S.T} K`]]);
    // plot B: the Fermi-Dirac integral and its two limits
    const xs = range(-6, 30, 360), ex = xs.map(F.Fm).map(Math.log10), nd = xs.map(v => v / Math.LN10), dg = xs.map(v => (v > 0.05 ? Math.log10(2 * Math.sqrt(v / Math.PI)) : NaN));
    const xm = Math.max(-6, Math.min(30, x));
    plotB.opts.xLabel = 'x'; plotB.opts.yLabel = 'F₋₁/₂(x)'; plotB.opts.xTicks = 6;
    plotB.opts.yFormat = v => (Math.abs(v - Math.round(v)) < 1e-9 ? '10' + sup(Math.round(v)) : '');
    plotB.setRange([-6, 30], [-3, 1.2]);
    plotB.draw([
      { type: 'line', x: xs, y: nd, color: css('--series-amber'), width: 1.6, dash: [6, 4] },
      { type: 'line', x: xs, y: dg, color: NAVY, width: 1.6, dash: [6, 4] },
      { type: 'line', x: xs, y: ex, color: brand, width: 2.6 },
      { type: 'vline', x: xm, color: css('--plot-text'), width: 1.2, dash: [], label: x > 30 ? `x = ${fixed(x, 0)} →` : `x = ${fixed(x, 1)}` },
    ]);
    put('pb-title', 'The Fermi–Dirac integral');
    put('pb-cap', 'F₋₁/₂(x) against its nondegenerate limit eˣ (x ≪ −1) and degenerate limit 2√(x/π) (x ≫ 1), the step the video takes to reach the 0 K conductance.');
    legend('pb-legend', [[brand, '', 'F₋₁/₂(x), exact'], [css('--series-amber'), 'swatch--dash', 'eˣ'], [NAVY, 'swatch--dash', '2√(x/π)']]);
    note('<b>Even a perfect channel has resistance.</b> Each mode conducts at most 2e²/h, so a channel with M modes can never have a resistance below h/(2e²M), however short or clean it is. The resistance is set at the contacts, where many modes in the reservoir squeeze into few in the channel.');
  }
  function spectrumCond() {
    const VD = 0.01, hi = Math.max(0, S.EF) + 6 * kT(), Es = range(0, hi, 80);
    const js = Es.map(E => F.spectral(E, 0, VD, S.T, opts())), m = Math.max(...js);
    return Es.map((E, i) => [E, m > 0 ? js[i] / m : 0]);
  }

  // ---------- render ----------
  function syncControls() {
    const out = (id, txt) => { $(id + '-out').textContent = txt; };
    $('U0').value = S.U0; out('U0', `${fixed(S.U0, 3)} eV`);
    $('VD').value = S.VD; out('VD', `${fixed(S.VD, 3)} V`);
    $('EF').value = S.EF; out('EF', `${fixed(S.EF, 3)} eV`);
    $('temp').value = S.T; out('temp', `${S.T} K`);
    $('len').value = S.L; out('len', `${S.L} nm`);
    $('alpha').value = S.alpha; out('alpha', fixed(S.alpha, 2));
    document.querySelectorAll('[data-u0]').forEach(b => b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.u0 - S.U0) < 1e-9)));
    document.querySelectorAll('[data-temp]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.temp === S.T)));
  }
  function render() {
    syncControls();
    if (mode === 'window') renderWindow();
    else if (mode === 'drain') renderDrain();
    else if (mode === 'gate') renderGate();
    else renderCond();
    const sw = SWEEP[mode];
    setHTML($('play'), playing ? '❚❚ Pause' : sw ? rich(`▶ ${sw.label}`) : '▶ Play');
    setHTML($('sweep-out'), sw ? rich(sw.show()) : '');
    $('transport-note').textContent = sw ? sw.note : '';
  }
  function applyMode() {
    document.querySelectorAll('.tab').forEach(b => { const on = b.dataset.mode === mode; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $('lab').setAttribute('aria-labelledby', 'tab-' + mode);
    document.querySelectorAll('.mode-intro').forEach(el => { el.hidden = el.dataset.for !== mode; });
    document.querySelectorAll('[data-modes]').forEach(el => { el.hidden = !el.dataset.modes.split(' ').includes(mode); });
    render();
  }

  // ---------- sweeps ----------
  const SWEEP = {
    drain: { label: 'Sweep V_D', key: 'VD', from: 0, to: 0.5, secs: 5, show: () => `V_D = ${fixed(S.VD, 3)} V`, note: 'Sweeps the drain voltage from 0 to 0.5 V and back, until you pause.' },
    gate: { label: 'Sweep the gate', key: 'U0', from: 0.4, to: 0.1, secs: 6, show: () => `U₀ = ${fixed(S.U0, 3)} eV`, note: 'Lowers the barrier from 0.4 to 0.1 eV and back: the transistor turns on and off, until you pause.' },
    cond: { label: 'Cool down', key: 'T', from: 400, to: 4, secs: 6, show: () => `T = ${S.T} K`, note: 'Cools the device from 400 K to 4 K and warms it again, until you pause.' },
  };
  let playing = false, raf = 0, lastT = 0, speed = 1, resumable = false;   // resumable: paused mid-sweep, nothing touched since
  let pos = 0, dir = 1;   // the sweep's exact position (only the value shown is rounded) and direction: +1 from -> to, -1 back
  function frame(now) {
    if (!playing) return;
    const sw = SWEEP[mode], dt = Math.max(0, Math.min(0.1, (now - lastT) / 1000)); lastT = now;
    // back and forth between the two ends until paused
    const lo = Math.min(sw.from, sw.to), hi = Math.max(sw.from, sw.to);
    pos += dir * (sw.to - sw.from) * dt * speed / sw.secs;
    if (pos > hi || pos < lo) { pos = pos > hi ? 2 * hi - pos : 2 * lo - pos; dir = -dir; }
    S[sw.key] = sw.key === 'T' ? Math.round(pos) : Math.round(pos * 1000) / 1000;
    render();
    raf = requestAnimationFrame(frame);
  }
  function stop() { playing = false; resumable = false; cancelAnimationFrame(raf); }
  $('play').addEventListener('click', () => {
    const sw = SWEEP[mode];
    if (!sw) return;
    if (playing) { stop(); resumable = true; render(); return; }
    if (!resumable) { S[sw.key] = sw.from; dir = 1; }
    resumable = false;
    pos = S[sw.key];
    if (reduceMotion) { S[sw.key] = sw.to; render(); return; }
    playing = true; lastT = performance.now(); raf = requestAnimationFrame(frame); render();
  });
  $('restart').addEventListener('click', () => { stop(); const sw = SWEEP[mode]; if (sw) S[sw.key] = sw.from; render(); });
  $('speed').addEventListener('change', e => { speed = +e.target.value; });

  // ---------- controls ----------
  const bind = (id, key) => $(id).addEventListener('input', e => { stop(); S[key] = +e.target.value; render(); });
  bind('U0', 'U0'); bind('VD', 'VD'); bind('EF', 'EF'); bind('temp', 'T'); bind('len', 'L'); bind('alpha', 'alpha');
  document.querySelectorAll('[data-u0]').forEach(b => b.addEventListener('click', () => { stop(); S.U0 = +b.dataset.u0; render(); }));
  document.querySelectorAll('[data-temp]').forEach(b => b.addEventListener('click', () => { stop(); S.T = +b.dataset.temp; render(); }));
  $('video-values').addEventListener('click', () => { stop(); Object.assign(S, VIDEO); render(); });
  const tabs = Array.from(document.querySelectorAll('.tab'));
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => { stop(); mode = b.dataset.mode; applyMode(); });
    b.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus(); next.click();
    });
  });
  if ('ResizeObserver' in window) {
    let wasNarrow = null;
    new ResizeObserver(() => { const n = narrow(); if (n !== wasNarrow) { wasNarrow = n; if (!playing) render(); } }).observe($('band'));
  }

  // ---------- predict-first loaders ----------
  const QUESTIONS = {
    q1: () => { mode = 'window'; Object.assign(S, VIDEO, { U0: 0.1, VD: 0 }); },
    q2: () => { mode = 'window'; Object.assign(S, VIDEO, { U0: 0.3, VD: 0.3 }); },
    q3: () => { mode = 'drain'; Object.assign(S, VIDEO, { U0: 0.125, VD: 0.075 }); },
    q4: () => { mode = 'drain'; Object.assign(S, VIDEO, { U0: 0.125, VD: 0.05 }); },
    q5: () => { mode = 'gate'; Object.assign(S, VIDEO, { U0: 0.3, VD: 0.5 }); },
    q6: () => { mode = 'gate'; Object.assign(S, VIDEO, { U0: 0.35, VD: 0.5, alpha: 0.8 }); },
    q7: () => { mode = 'gate'; Object.assign(S, VIDEO, { U0: 0.4, VD: 0.5, L: 1.5 }); },
    q8: () => { mode = 'cond'; Object.assign(S, VIDEO, { T: 4 }); },
  };
  document.querySelectorAll('.predict__load[data-q]').forEach(b => b.addEventListener('click', () => {
    stop();
    QUESTIONS[b.dataset.q]();
    applyMode();
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }));

  applyMode();
})();
