/* Graphene electrostatics lab: counting states, carrier statistics, and the gate with its quantum capacitance.
   Physics in physics.js, pictures in views.js. */
(function () {
  'use strict';
  const G = window.GE, V = window.GEViews;
  const $ = id => document.getElementById(id);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const START = { Efc: 0.1, L: 100, Ef: 0.15, T: 300, V: 20, d: 300, er: 3.9, vF: 1 };
  const VIDEO = { vF: 1, T: 300 };
  const S = Object.assign({}, START);
  // the thickness slider is an index 0..250 on a log scale from 1 nm to 300 nm: each step is 2.3%
  const NSTEP = 250, LOGMAX = Math.log10(300), dOf = i => Math.pow(10, LOGMAX * i / NSTEP), iOf = d => Math.round(NSTEP * Math.log10(d) / LOGMAX);
  const fmtD = d => (d >= 100 ? d.toFixed(0) : d >= 10 ? d.toFixed(1) : d.toFixed(2));
  let mode = 'count';
  const vF = () => S.vF * 1e6;
  const RED = '#c0392b', BLUE = '#1f4ea8', GREEN = '#2e8b57', ORANGE = '#c47a12', INK = '#14232c';

  // ---------- formatting ----------
  const fixed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  function sci(x, d = 2) { if (!(x > 0)) return '0'; let k = Math.floor(Math.log10(x)), m = x / Math.pow(10, k); if (m >= 9.995) { m /= 10; k++; } return `${m.toFixed(d)} × 10${String(k).split('').map(c => SUP[c]).join('')}`; }
  const cm2 = nm2 => nm2 * 1e14;                         // per nm^2 -> per cm^2
  const uF = Fm2 => Fm2 * 100;                            // F/m^2 -> uF/cm^2
  const fmtV = v => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v) >= 10 ? Math.abs(v).toFixed(1) : Math.abs(v).toFixed(2)} V`;
  const fmtC = c => (c >= 0.1 ? `${fixed(c, 3)} µF/cm²` : `${fixed(c * 1000, 1)} nF/cm²`);

  // ---------- helpers ----------
  const rich = t => String(t).replace(/_\{([^}]*)\}|_([A-Za-z0-9])/g, (m, a, b) => `<sub>${a || b}</sub>`);
  function stats(items) {
    $('stats').innerHTML = items.map(([label, value, sub2]) =>
      `<div class="stat"><div class="stat__label">${rich(label)}</div><div class="stat__value">${value}</div><div class="stat__sub">${rich(sub2)}</div></div>`).join('');
  }
  function legend(id, items) { $(id).innerHTML = items.map(([color, kind, label]) => `<li style="color:${color}"><span class="swatch ${kind}"></span><span>${rich(label)}</span></li>`).join(''); }
  function typeset(el) { if (window.MathJax && MathJax.typesetPromise && /\\\(/.test(el.innerHTML)) MathJax.typesetPromise([el]).catch(() => {}); }
  function setHTML(el, html) { if (el.dataset.html === html) return; el.dataset.html = html; el.innerHTML = html; typeset(el); }
  const put = (id, t) => setHTML($(id), rich(t));
  const MARGIN = { l: 62, r: 18, t: 12, b: 42 };
  const plotA = new NanoPlot($('plot-a'), { margin: MARGIN, narrowMargin: { l: 58 } });
  const plotB = new NanoPlot($('plot-b'), { margin: MARGIN, narrowMargin: { l: 58 } });
  const range = (a, b, k) => Array.from({ length: k + 1 }, (_, i) => a + (b - a) * i / k);
  const narrow = () => $('diagram').clientWidth < 560;
  const reset = pl => { pl.opts.xTickValues = null; pl.opts.xFormat = null; pl.opts.yFormat = null; pl.opts.zeroLine = false; };

  // ---------- 1. Counting electrons ----------
  function renderCount() {
    const kF = G.kF(S.Efc, vF()), step = 2 * Math.PI / S.L, N = G.count(S.L, kF), formula = kF * kF * S.L * S.L / (4 * Math.PI);
    $('diagram').innerHTML = V.kgrid({ L: S.L, Ef: S.Efc, vF: vF(), narrow: narrow() });
    stats([
      ['Grid spacing', `${fixed(step, 3)} nm⁻¹`, '2π/L between allowed k values'],
      ['Fermi wavevector', `${fixed(kF, 3)} nm⁻¹`, 'k_F = E_F/ħv_F'],
      ['k-points inside', `${N}`, `formula πk_F²/(2π/L)² = ${fixed(formula, 1)}`],
      ['Electrons per cm²', `${sci(cm2(4 * N / (S.L * S.L)))}`, `counted; k_F²/π gives ${sci(cm2(kF * kF / Math.PI))}`],
    ]);
    setHTML($('dg-title'), `Allowed states in a ${S.L} nm × ${S.L} nm sheet`);
    put('dg-cap', 'Each dot is an allowed wavevector k = (2π/L)(m_x, m_y). Blue: inside the Fermi circle (dashed), so filled. The shaded square is the area of k-space each state owns. Right: the same electrons in the cone.');
    const ratio = 4 * N / (4 * formula);
    setHTML($('info'), `<b>${4 * N} electrons</b> (${N} k-points × 4) against ${fixed(4 * formula, 1)} from the formula: ${ratio >= 1 ? '+' : ''}${fixed(100 * (ratio - 1), 1)}%. ${Math.abs(ratio - 1) > 0.05 ? (S.L < 300 ? 'With so few points the jagged edge of the circle matters; make the sheet larger.' : 'Even at 300 nm, so few points fill the circle at this Fermi level that its jagged edge still matters.') : 'With this many points the count and the area agree closely.'}`);
    // plot A: electrons counted as E_F rises (a staircase), against the smooth formula
    reset(plotA);
    const Es = range(0.005, 0.4, 320), stair = Es.map(e => 4 * G.count(S.L, G.kF(e, vF()))), smooth = Es.map(e => G.kF(e, vF()) ** 2 * S.L * S.L / Math.PI);
    plotA.opts.xLabel = 'Fermi energy EF (eV)'; plotA.opts.yLabel = 'Electrons in the sheet'; plotA.opts.xTicks = 5;
    plotA.opts.yFormat = v => (Math.abs(v) >= 1e4 ? `${+(v / 1000).toPrecision(3)}k` : String(+v.toPrecision(4)));
    plotA.setRange([0, 0.4], [0, Math.max(...smooth, ...stair) * 1.05]);
    plotA.draw([
      { type: 'line', x: Es, y: smooth, color: GREEN, width: 2, dash: [6, 4] },
      { type: 'line', x: Es, y: stair, color: BLUE, width: 2.2 },
      { type: 'vline', x: S.Efc, color: INK, width: 1.2, dash: [] },
      { type: 'dots', x: [S.Efc], y: [4 * N], color: INK, r: 4.5 },
    ]);
    setHTML($('pa-title'), 'Filling the sheet, one k-point at a time');
    put('pa-cap', `Electrons counted in the ${S.L} nm sheet as E_F rises: a staircase that rises each time the Fermi circle reaches new k-points: 4 electrons for the point at k = 0, then 16 or more at a time, since the square grid's symmetry adds k-points in sets of four or eight. Dashed: the formula k_F²L²/π.`);
    legend('pa-legend', [[BLUE, '', 'counted'], [GREEN, 'swatch--dash', 'formula k_F²L²/π']]);
    // plot B: the ratio as the sample grows
    reset(plotB);
    const Ls = range(20, 300, 280), r = Ls.map(L => G.count(L, kF) / (kF * kF * L * L / (4 * Math.PI)));
    plotB.opts.xLabel = 'Sample size L (nm)'; plotB.opts.yLabel = 'Counted ÷ formula'; plotB.opts.xTicks = 6;
    const lo = Math.min(...r, 0.8), hi = Math.max(...r, 1.2);
    plotB.setRange([20, 310], [Math.max(0, lo - 0.05), hi + 0.05]);
    plotB.draw([
      { type: 'hline', y: 1, color: GREEN, width: 1.4, dash: [6, 4] },
      { type: 'line', x: Ls, y: r, color: BLUE, width: 1.8 },
      { type: 'dots', x: [S.L], y: [N / formula], color: INK, r: 4.5 },
    ]);
    setHTML($('pb-title'), 'Counting converges to the formula');
    put('pb-cap', `At E_F = ${fixed(S.Efc, 3)} eV: the number of k-points counted, divided by πk_F²/(2π/L)², as the sheet grows. The scatter shrinks as the grid gets finer, which is why the density of states of a large sample is a smooth function.`);
    legend('pb-legend', [[BLUE, '', 'counted ÷ formula'], [INK, 'swatch--stem', 'this sheet']]);
    setHTML($('takeaway'), '<b>Density of states from counting:</b> the number of states below E grows as the area πk² ∝ E², so its derivative, the density of states, grows linearly: D(E) = 2|E|/πħ²v<sub>F</sub>². That linear D is the source of everything in the next two tabs.');
  }

  // ---------- 2. Electrons, holes and heat ----------
  function renderStat() {
    const n = G.n(S.Ef, S.T, vF()), p = G.p(S.Ef, S.T, vF()), hv = G.hv(vF());
    $('diagram').innerHTML = V.cone({ Ef: S.Ef, T: S.T, Emax: 0.5, narrow: narrow() });
    const somm = S.Ef * S.Ef / (Math.PI * hv * hv) + Math.PI * G.kT(S.T) ** 2 / (3 * hv * hv);
    stats([
      ['Electrons n, per cm²', `${sci(cm2(n))}`, 'in the conduction band'],
      ['Holes p, per cm²', `${sci(cm2(p))}`, 'empty states in the valence band'],
      ['n − p, per cm²', `${n - p < 0 ? '−' : ''}${sci(cm2(Math.abs(n - p)))}`, `the net electron density; ${fixed((n - p) / G.ATOMS * 1000, 2)} per 1000 atoms`],
      ['n + p, per cm²', `${sci(cm2(n + p))}`, `Sommerfeld formula: ${sci(cm2(somm))}`],
    ]);
    setHTML($('dg-title'), `The cone at ${S.T} K, E<sub>F</sub> = ${fixed(S.Ef, 3)} eV`);
    put('dg-cap', 'Left: the Fermi–Dirac occupation f(E). Right: the cone, with the states at each energy shown as balls (more balls where the density of states is larger). Blue: occupied; white: empty states (holes) in the valence band; partly faded: occupied with probability f.');
    const kTe = G.kT(S.T);
    setHTML($('info'), S.T === 0 ? `<b>At 0 K</b> the cone is filled exactly to E<sub>F</sub>: ${S.Ef > 0 ? 'electrons only, n = E<sub>F</sub>²/πħ²v<sub>F</sub>²' : S.Ef < 0 ? 'holes only, p = E<sub>F</sub>²/πħ²v<sub>F</sub>²' : 'no carriers at all, since the Fermi level sits exactly at the Dirac point'}.`
      : Math.abs(S.Ef) < 3 * kTe ? `<b>|E<sub>F</sub>| is within a few k<sub>B</sub>T (${fixed(1000 * kTe, 1)} meV) of the Dirac point,</b> so heat lifts electrons across it and electrons and holes coexist. The Sommerfeld formula, meant for E<sub>F</sub> ≫ k<sub>B</sub>T, is here exactly n + p, not n.`
      : `<b>Degenerate:</b> E<sub>F</sub> is ${fixed(Math.abs(S.Ef) / kTe, 1)} k<sub>B</sub>T from the Dirac point, so ${S.Ef > 0 ? 'holes are rare and n ≈ E<sub>F</sub>²/πħ²v<sub>F</sub>² + π(k<sub>B</sub>T)²/3ħ²v<sub>F</sub>²' : 'electrons are rare and p ≈ E<sub>F</sub>²/πħ²v<sub>F</sub>² + π(k<sub>B</sub>T)²/3ħ²v<sub>F</sub>²'}, the Sommerfeld result.`);
    // plot A: n and p against E_F, as on the video's slides
    reset(plotA);
    const Es = range(-0.5, 0.5, 300), nn = Es.map(e => cm2(G.n(e, S.T, vF())) / 1e13), pp = Es.map(e => cm2(G.p(e, S.T, vF())) / 1e13);
    const n0 = Es.map(e => cm2(G.n(e, 0, vF())) / 1e13), p0 = Es.map(e => cm2(G.p(e, 0, vF())) / 1e13);
    const sm = Es.map(e => cm2(e * e / (Math.PI * hv * hv) + Math.PI * kTe ** 2 / (3 * hv * hv)) / 1e13);
    const LA = [];
    if (S.T > 0) LA.push({ type: 'line', x: Es, y: n0, color: '#e8a3a3', width: 1.2, dash: [3, 3] }, { type: 'line', x: Es, y: p0, color: '#a3b8e8', width: 1.2, dash: [3, 3] });
    LA.push({ type: 'line', x: Es, y: sm, color: ORANGE, width: 1.6, dash: [6, 4] });
    LA.push({ type: 'line', x: Es, y: pp, color: BLUE, width: 2.6 }, { type: 'line', x: Es, y: nn, color: RED, width: 2.6 });
    LA.push({ type: 'vline', x: S.Ef, color: INK, width: 1.2, dash: [] }, { type: 'dots', x: [S.Ef, S.Ef], y: [cm2(n) / 1e13, cm2(p) / 1e13], colors: [RED, BLUE], r: 4.5 });
    plotA.opts.xLabel = 'Fermi energy EF (eV)'; plotA.opts.yLabel = 'Carrier density (10¹³ cm⁻²)'; plotA.opts.xTicks = 5;
    plotA.setRange([-0.5, 0.5], [0, Math.max(...nn, ...sm.map(v => Math.min(v, 2.6))) * 1.05]);
    plotA.draw(LA);
    setHTML($('pa-title'), `Electron and hole densities at ${S.T} K`);
    put('pa-cap', `Red: electrons n; blue: holes p; dots at the current E_F.${S.T > 0 ? ' Faint dashed: 0 K.' : ''} Orange dashed: the Sommerfeld formula E_F²/πħ²v_F² + π(k_BT)²/3ħ²v_F², which is exactly n + p.`);
    legend('pa-legend', [[RED, '', 'n'], [BLUE, '', 'p'], [ORANGE, 'swatch--dash', 'Sommerfeld formula = n + p']]);
    // plot B: where in energy the carriers are
    reset(plotB);
    const W = Math.max(0.15, Math.abs(S.Ef) + 8 * kTe), Ee = range(-W, W, 400), c = G.cdos(vF());
    // electrons live at E > 0 and holes at E < 0: give each its own x range, so each shaded area is exactly n or p
    const occ = e => (S.T > 0 ? 1 / (1 + Math.exp((e - S.Ef) / kTe)) : e < S.Ef ? 1 : 0);
    const Eel = Ee.filter(e => e >= 0), Eho = Ee.filter(e => e <= 0);
    const el = Eel.map(e => c * e * occ(e)), ho = Eho.map(e => c * -e * (1 - occ(e)));
    const dos = Ee.map(e => c * Math.abs(e));
    // with no carriers at all (0 K at the Dirac point) keep a scale on which the density of states shows
    const ymax = Math.max(...el, ...ho, 0.3 * c * W) * 1.25;
    plotB.opts.xLabel = 'Energy E (eV)'; plotB.opts.yLabel = 'Carriers per eV per nm²'; plotB.opts.xTicks = 6;
    plotB.setRange([-W, W], [0, ymax]);
    plotB.draw([
      { type: 'line', x: Ee, y: dos.map(v => (v > ymax ? NaN : v)), color: '#9fb1ba', width: 1.2, dash: [4, 4] },
      { type: 'line', x: Eel, y: el, color: RED, width: 2.2, fill: 'rgba(192, 57, 43, 0.18)' },
      { type: 'line', x: Eho, y: ho, color: BLUE, width: 2.2, fill: 'rgba(31, 78, 168, 0.18)' },
      { type: 'vline', x: S.Ef, color: GREEN, width: 1.4, dash: [6, 4], label: 'EF' },
    ]);
    setHTML($('pb-title'), 'Where in energy the carriers are');
    put('pb-cap', `Red: D(E)f(E), the electrons at each energy; blue: D(E)[1 − f(E)], the holes. Their areas are n and p.${S.T === 0 && S.Ef === 0 ? ' At 0 K with E_F at the Dirac point both are zero.' : ''} Dashed grey: the density of states 2|E|/πħ²v_F².`);
    legend('pb-legend', [[RED, 'swatch--area', 'electrons'], [BLUE, 'swatch--area', 'holes'], ['#9fb1ba', 'swatch--dash', 'D(E)']]);
    setHTML($('takeaway'), '<b>No gap, no freeze-out:</b> in a semiconductor the carriers die away as e<sup>−E<sub>g</sub>/2k<sub>B</sub>T</sup> on cooling. In graphene they fall only as T², and at the Dirac point electrons and holes are always both present at any finite temperature.');
  }

  // ---------- 3. Gating and quantum capacitance ----------
  const Cox = () => G.Cox(S.d, S.er);
  const vmax = () => { const v = G.E * 1.2e17 / Cox(); return Math.max(0.5, Math.min(80, +v.toPrecision(2))); };
  function renderCap() {
    const C = Cox(), Ef = Math.abs(S.V) < 1e-9 ? 0 : G.solve(S.V, S.T, C, vF()), net = Ef === 0 ? 0 : G.net(Ef, S.T, vF()), Cq = G.Cq(Ef, S.T, vF()), Ct = G.series(C, Cq);
    $('diagram').innerHTML = V.gate({ V: S.V, Ef, net, Cox: C, d: S.d, er: S.er, narrow: narrow() });
    const metal = C * S.V / G.E * 1e-18;          // per nm^2
    stats([
      ['Fermi level', `${Ef > 5e-4 ? '+' : ''}${fixed(Ef, 3)} eV`, `${fixed(100 * Math.abs(Ef / (S.V || 1e-9)), 1)}% of the gate voltage`],
      ['n − p, per cm²', `${net < 0 ? '−' : ''}${sci(cm2(Math.abs(net)))}`, `a metal would hold ${sci(cm2(Math.abs(metal)))}`],
      ['Quantum capacitance', fmtC(uF(Cq)), `oxide: ${fmtC(uF(C))}`],
      ['Total capacitance', fmtC(uF(Ct)), `${fixed(100 * Ct / C, 1)}% of C_{ox}`],
    ]);
    setHTML($('dg-title'), 'A graphene capacitor');
    put('dg-cap', 'The gate charge +Q (or −Q) is matched by electrons (or holes) in the graphene. The bar on the right splits the gate voltage into the drop across the oxide, Q/C_{ox}, and the rise of graphene\'s Fermi level, E_F/e.');
    const frac = Math.abs(Ef / (S.V || 1e-9));
    setHTML($('info'), Math.abs(S.V) < 1e-9 ? '<b>No gate voltage:</b> the graphene is neutral and the Fermi level sits at the Dirac point. Here the quantum capacitance is at its smallest.'
      : (frac < 0.05 ? `<b>Like a metal:</b> only ${fixed(100 * frac, 1)}% of the gate voltage goes into the Fermi level, and graphene holds ${fixed(100 * Math.abs(net / metal), 0)}% of the charge a metal would. `
        : `<b>Quantum capacitance matters:</b> ${fixed(100 * frac, 1)}% of the gate voltage goes into raising graphene's Fermi level, so it holds only ${fixed(100 * Math.abs(net / metal), 0)}% of the charge a metal would. `)
        + (Cq >= C ? `Here C<sub>qm</sub> (${fmtC(uF(Cq))}) is ${fixed(Cq / C, 1)} times C<sub>ox</sub> (${fmtC(uF(C))})${Cq > 20 * C ? ', so the oxide decides almost everything.' : ', so graphene takes a noticeable share of the voltage.'}`
          : `Here C<sub>qm</sub> (${fmtC(uF(Cq))}) is ${fixed(C / Cq, 1)} times smaller than C<sub>ox</sub> (${fmtC(uF(C))}), so graphene's own capacitance, not the oxide, limits the charge.`));
    // plot A: where the gate voltage goes
    reset(plotA);
    const vm = vmax(), Vs = range(-vm, vm, 240), efs = Vs.map(v => G.solve(v, S.T, C, vF()));
    plotA.opts.xLabel = 'Gate voltage V (V)'; plotA.opts.yLabel = 'Volts'; plotA.opts.xTicks = 6; plotA.opts.zeroLine = true;
    plotA.setRange([-vm, vm], [-vm, vm]);
    plotA.draw([
      { type: 'line', x: Vs, y: Vs, color: '#c9d4db', width: 1, dash: [3, 3] },
      { type: 'line', x: Vs, y: Vs.map((v, i) => v - efs[i]), color: ORANGE, width: 2.4 },
      { type: 'line', x: Vs, y: efs, color: GREEN, width: 2.6 },
      { type: 'vline', x: S.V, color: INK, width: 1.2, dash: [] },
      { type: 'dots', x: [S.V, S.V], y: [S.V - Ef, Ef], colors: [ORANGE, GREEN], r: 4.5 },
    ]);
    setHTML($('pa-title'), 'Where the gate voltage goes');
    const endShare = Math.abs(efs[efs.length - 1] / vm);
    put('pa-cap', `Orange: the drop across the oxide, Q/C_{ox}; green: the Fermi level, E_F/e. They add up to V (dotted). For this gate E_F takes ${fixed(100 * endShare, 1)}% of V at the ends of the range. Where the oxide dominates (C_{ox} ≪ C_{qm}), E_F grows only as √V, since n ∝ E_F²; where graphene's capacitance dominates, E_F follows V almost one for one.`);
    legend('pa-legend', [[ORANGE, '', 'across the oxide'], [GREEN, '', 'E_F/e']]);
    // plot B: capacitances
    reset(plotB);
    // a log axis, so a thick oxide (nF/cm^2) and the quantum capacitance (uF/cm^2) both fit
    const lg = v => Math.log10(Math.max(v, 1e-6));
    const cq = efs.map(e => uF(G.Cq(e, S.T, vF()))), ct = cq.map(q => uF(G.series(C, q / 100)));
    const ylo = Math.floor(lg(Math.min(uF(C), ...ct.filter(v => v > 0))) - 0.3), yhi = Math.ceil(lg(Math.max(uF(C), ...cq)) + 0.1);
    plotB.opts.xLabel = 'Gate voltage V (V)'; plotB.opts.yLabel = 'Capacitance (µF/cm², log scale)'; plotB.opts.xTicks = 6;
    plotB.opts.yFormat = v => (Math.abs(v - Math.round(v)) < 1e-9 ? String(+Math.pow(10, Math.round(v)).toPrecision(1)) : '');
    plotB.setRange([-vm, vm], [Math.max(ylo, yhi - 5), yhi]);
    plotB.draw([
      { type: 'hline', y: lg(uF(C)), color: ORANGE, width: 1.8, dash: [6, 4] },
      { type: 'line', x: Vs, y: cq.map(lg), color: GREEN, width: 2.2 },
      { type: 'line', x: Vs, y: ct.map(lg), color: INK, width: 2.6 },
      { type: 'vline', x: S.V, color: INK, width: 1.2, dash: [3, 3] },
    ]);
    setHTML($('pb-title'), 'Two capacitors in series');
    put('pb-cap', `Orange dashed: C_{ox}. Green: graphene's quantum capacitance C_{qm} = e²D(E_F), smallest at the Dirac point${S.T > 0 ? ` (${fmtC(uF(G.Cq(0, S.T, vF())))} at ${S.T} K)` : ' (zero at 0 K)'}. Black: the total, 1/C_{tot} = 1/C_{ox} + 1/C_{qm}, always below both.`);
    legend('pb-legend', [[ORANGE, 'swatch--dash', 'C_{ox}'], [GREEN, '', 'C_{qm}'], [INK, '', 'C_{tot}']]);
    setHTML($('takeaway'), '<b>Thin gates see the band structure.</b> As oxides get thinner, C<sub>ox</sub> grows until it is comparable to C<sub>qm</sub>, and a measurement of capacitance against gate voltage traces out graphene\'s density of states, the dip at the Dirac point included.');
  }

  // ---------- controls ----------
  function syncControls() {
    const set = (id, v, txt) => { $(id).value = v; $(id + '-out').textContent = txt; $(id).setAttribute('aria-valuetext', txt); };
    set('efc', S.Efc, `${fixed(S.Efc, 3)} eV`); set('len', S.L, `${S.L} nm`);
    set('ef', S.Ef, `${S.Ef > 0 ? '+' : ''}${fixed(S.Ef, 3)} eV`);
    set('temp', S.T, `${S.T} K`); set('vf', S.vF, `${fixed(S.vF, 2)} × 10⁶ m/s`);
    const vm = vmax(), vstep = vm >= 20 ? 0.5 : vm >= 4 ? 0.05 : 0.01;
    $('volt').min = -vm; $('volt').max = vm; $('volt').step = vstep;
    S.V = Math.max(-vm, Math.min(vm, Math.round(S.V / vstep) * vstep));      // on the slider's own steps, so thumb and readout agree
    if (Math.abs(S.V) < vstep / 2) S.V = 0;
    set('volt', S.V, fmtV(S.V));
    if (mode === 'cap') { const nEnd = G.net(G.solve(vm, S.T, Cox(), vF()), S.T, vF()); $('volt-hint').textContent = `Range ±${vm} V for this gate: about ${sci(cm2(nEnd))} carriers per cm² at the ends.`; }
    set('thick', iOf(S.d), `${fmtD(S.d)} nm`); set('er', S.er, fixed(S.er, 1));
    document.querySelectorAll('[data-len]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.len === S.L)));
    document.querySelectorAll('[data-temp]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.temp === S.T)));
    document.querySelectorAll('[data-ef]').forEach(b => b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.ef - S.Ef) < 1e-9)));
    document.querySelectorAll('[data-ox]').forEach(b => { const [d, er] = b.dataset.ox.split(',').map(Number); b.setAttribute('aria-pressed', String(Math.abs(S.d / d - 1) < 0.005 && Math.abs(er - S.er) < 1e-9)); });
  }
  function render() {
    syncControls();
    if (mode === 'count') renderCount(); else if (mode === 'stat') renderStat(); else renderCap();
    $('plot-a').setAttribute('aria-label', $('pa-title').textContent); $('plot-b').setAttribute('aria-label', $('pb-title').textContent);
    $('play').textContent = playing ? '❚❚ Pause' : '▶ Sweep the gate';
    $('info').setAttribute('aria-live', playing ? 'off' : 'polite');      // do not read every frame of the sweep aloud
    $('play-out').textContent = mode === 'cap' ? fmtV(S.V) : '';
  }
  function applyMode() {
    document.querySelectorAll('.tab').forEach(b => { const on = b.dataset.mode === mode; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $('lab').setAttribute('aria-labelledby', 'tab-' + mode);
    document.querySelectorAll('.mode-intro').forEach(el => { el.hidden = el.dataset.for !== mode; });
    document.querySelectorAll('[data-modes]').forEach(el => { el.hidden = !el.dataset.modes.split(' ').includes(mode); });
    render();
  }
  let pending = false;
  const later = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; render(); }); };
  [['efc', 'Efc'], ['len', 'L'], ['ef', 'Ef'], ['temp', 'T'], ['volt', 'V'], ['er', 'er'], ['vf', 'vF']].forEach(([id, key]) => $(id).addEventListener('input', e => { if (id === 'volt') stop(); S[key] = +e.target.value; later(); }));
  // keep the exact thickness: rounding it here would snap the slider back and trap keyboard users
  $('thick').addEventListener('input', e => { S.d = dOf(+e.target.value); later(); });
  document.querySelector('.controls').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.len) S.L = +d.len;
    else if (d.temp !== undefined && d.temp !== '') S.T = +d.temp;
    else if (d.ef !== undefined && d.ef !== '') S.Ef = +d.ef;
    else if (d.ox) { stop(); const [t, er] = d.ox.split(',').map(Number); S.d = t; S.er = er; S.V = 0.5 * vmax(); }
    else if (b.id === 'video-values') { stop(); Object.assign(S, START); }
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
  if ('ResizeObserver' in window) {
    let was = null;
    new ResizeObserver(() => { const nw = narrow() + '|' + Math.round($('plot-a').clientWidth / 40); if (nw !== was) { was = nw; if (!playing) render(); } }).observe($('lab'));
  }

  // ---------- the gate sweep, back and forth until paused ----------
  let playing = false, raf = 0, lastT = 0, dir = 1;
  function frame(now) {
    if (!playing) return;
    const dt = Math.max(0, Math.min(0.1, (now - lastT) / 1000)), vm = vmax(); lastT = now;
    let v = S.V + dir * 2 * vm * dt / 6;
    if (v > vm) { v = 2 * vm - v; dir = -1; } else if (v < -vm) { v = -2 * vm - v; dir = 1; }
    S.V = v; render();
    raf = requestAnimationFrame(frame);
  }
  function stop() { playing = false; cancelAnimationFrame(raf); }
  $('play').addEventListener('click', () => {
    if (playing) { stop(); render(); return; }
    if (reduceMotion) { S.V = Math.abs(S.V - vmax()) < 1e-9 ? -vmax() : Math.min(vmax(), S.V + vmax() / 4); render(); return; }
    playing = true; lastT = performance.now(); raf = requestAnimationFrame(frame); render();
  });
  if (reduceMotion) $('transport-note').textContent = 'Reduced motion is on: each press steps the gate voltage up by a quarter of its range.';

  // ---------- predict-first loaders ----------
  const QUESTIONS = {
    q1: () => { mode = 'count'; Object.assign(S, START, { Efc: 0.1, L: 100 }); },
    q2: () => { mode = 'count'; Object.assign(S, START, { Efc: 0.2, L: 100 }); },
    q3: () => { mode = 'stat'; Object.assign(S, START, { Ef: -0.37, T: 0 }); },
    q4: () => { mode = 'stat'; Object.assign(S, START, { Ef: 0, T: 300 }); },
    q5: () => { mode = 'stat'; Object.assign(S, START, { Ef: 0, T: 1000 }); },
    q6: () => { mode = 'cap'; Object.assign(S, START, { d: 300, er: 3.9, V: 10, T: 300 }); },
    q7: () => { mode = 'cap'; Object.assign(S, START, { d: 3, er: 3.9, V: 1, T: 0 }); },
    q8: () => { mode = 'cap'; Object.assign(S, START, { d: 3, er: 3.9, V: 0, T: 300 }); },
  };
  document.querySelectorAll('.predict__load[data-q]').forEach(b => b.addEventListener('click', () => {
    stop();
    QUESTIONS[b.dataset.q]();
    applyMode();
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }));

  applyMode();
  window.__elec = { S, render };
})();
