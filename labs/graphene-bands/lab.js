/* Graphene band structure lab: controls, the lattice, the 3D bands, the Dirac cone and the plots.
   Physics in physics.js, the 2D pictures in views.js, the 3D bands in bands3d.js. */
(function () {
  'use strict';
  const G = window.Gr, V = window.GrViews;
  const $ = id => document.getElementById(id);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const S3 = Math.sqrt(3);

  const PLAIN = { t: 2.7, tp: 0, D: 0 };
  const S = { t: 2.7, tp: 0, D: 0, s: 0.2, upper: false, Ef: 0.6, E: 0.5, cut: 'G' };
  let mode = 'tb';
  const P = () => ({ t: S.t, tp: S.tp, D: S.D });
  const DCOL = ['#c2410c', '#7c3aed', '#0e7490'];
  const LO = '#1f4ea8', HI = '#c4501c';
  const FRAC = { G: 0, K: G.LEN[0] / G.PATH_LEN, M: (G.LEN[0] + G.LEN[1]) / G.PATH_LEN };

  // ---------- formatting and helpers ----------
  const fixed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  function sci(x) { if (!(x > 0)) return '0'; let k = Math.floor(Math.log10(x)), m = x / Math.pow(10, k); if (m >= 9.995) { m /= 10; k++; } return `${m.toFixed(2)} × 10${String(k).split('').map(c => SUP[c]).join('')}`; }
  const rich = t => String(t).replace(/_\{([^}]*)\}|_([A-Za-z0-9])/g, (m, a, b) => `<sub>${a || b}</sub>`);
  function stats(items) {
    $('stats').innerHTML = items.map(([label, value, sub2]) =>
      `<div class="stat"><div class="stat__label">${rich(label)}</div><div class="stat__value">${value}</div><div class="stat__sub">${rich(sub2)}</div></div>`).join('');
  }
  function legend(id, items) { $(id).innerHTML = items.map(([color, kind, label]) => `<li style="color:${color}"><span class="swatch ${kind}"></span><span>${rich(label)}</span></li>`).join(''); }
  function typeset(el) { if (window.MathJax && MathJax.typesetPromise && /\\\(/.test(el.innerHTML)) MathJax.typesetPromise([el]).catch(() => {}); }
  function setHTML(el, html) { if (el.dataset.html === html) return; el.dataset.html = html; el.innerHTML = html; typeset(el); }
  const put = (id, t) => setHTML($(id), rich(t));
  const MARGIN = { l: 58, r: 18, t: 12, b: 42 };
  const plotA = new NanoPlot($('plot-a'), { margin: MARGIN, narrowMargin: { l: 54 } });
  const plotB = new NanoPlot($('plot-b'), { margin: MARGIN, narrowMargin: { l: 54 } });
  const range = (a, b, k) => Array.from({ length: k + 1 }, (_, i) => a + (b - a) * i / k);
  const narrow = el => el.clientWidth < 560;
  const reset = pl => { pl.opts.xTickValues = null; pl.opts.xFormat = null; pl.opts.yFormat = null; pl.opts.zeroLine = false; };
  function squareRange(plot, xr, yr) {
    const aw = plot.w - plot.m.l - plot.m.r, ah = plot.h - plot.m.t - plot.m.b, sx = (xr[1] - xr[0]) / aw, sy = (yr[1] - yr[0]) / ah;
    if (sx > sy) { const c = (yr[0] + yr[1]) / 2, h = sx * ah / 2; return [xr, [c - h, c + h]]; }
    const c = (xr[0] + xr[1]) / 2, w = sy * aw / 2; return [[c - w, c + w], yr];
  }
  const arrowLayers = (x0, y0, x1, y1, color, width) => {
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 1e-9) return [];
    const ux = (x1 - x0) / L, uy = (y1 - y0) / L, s = Math.min(0.28, 0.4 * L);
    return [{ type: 'line', x: [x0, x1 - ux * s * 0.7], y: [y0, y1 - uy * s * 0.7], color, width },
      { type: 'poly', x: [x1, x1 - ux * s - uy * s * 0.45, x1 - ux * s + uy * s * 0.45], y: [y1, y1 - uy * s + ux * s * 0.45, y1 - uy * s - ux * s * 0.45], fill: color }];
  };

  const b3 = new BandView3D($('b3-gl'), $('b3-ov'));
  b3.reduce = reduceMotion; if (reduceMotion) b3.spin = false;
  b3.onUserRotate = () => $('spin').setAttribute('aria-pressed', 'false');

  // ---------- 1. Tight binding ----------
  // the special points are exact: the slider snaps onto them (see the input handler), so test equality closely
  function kName(s) {
    for (const [n, f] of Object.entries(FRAC)) if (Math.abs(s - f) < 1e-6) return n === 'G' ? 'Γ' : n;
    if (Math.abs(s - 1) < 1e-6) return 'Γ';
    return '';
  }
  // where k is along the path, in words: 'Γ → K, 40%'
  function kWhere(s) {
    const legs = [['Γ → K', 0, FRAC.K], ['K → M', FRAC.K, FRAC.M], ['M → Γ', FRAC.M, 1]];
    const [name, a, b] = legs.find(([, , hi]) => s <= hi + 1e-9) || legs[2];
    return `${name}, ${Math.round(100 * (s - a) / (b - a))}%`;
  }
  const plainModel = () => !S.tp && !S.D;
  const formula = () => (plainModel() ? 'E = ±t|g|' : 'E = −t′|g|² ± √(Δ² + t²|g|²)');
  function renderTB() {
    const p = P(), [kx, ky] = G.pathPoint(S.s * G.PATH_LEN), [gr, gi] = G.g(kx, ky), gm = Math.hypot(gr, gi), [Em, Ep] = G.bands(kx, ky, p), nm = kName(S.s);
    $('lat').innerHTML = V.lattice({ k: [kx, ky], p, upper: S.upper, narrow: narrow($('lat')) });
    stats([
      ['Wavevector', nm || `(${fixed(kx, 2)}, ${fixed(ky, 2)})`, nm ? `k = (${fixed(kx, 2)}, ${fixed(ky, 2)}) nm⁻¹` : `nm⁻¹; ${kWhere(S.s)} of the way`],
      ['|g(k)|', fixed(gm, 3), 'length of the sum of the three phases (0 to 3)'],
      ['Energies', `${fixed(Em, 2)}, ${Ep >= 0.005 ? '+' : ''}${fixed(Ep, 2)} eV`, 'lower and upper band'],
      ['Gap at this k', `${fixed(Ep - Em, 2)} eV`, `2√(Δ² + t²|g|²)`],
    ]);
    setHTML($('dg-title'), `The ${S.upper ? 'upper' : 'lower'}-band Bloch wave at ${nm || 'this k'}`);
    put('dg-cap', 'Each atom is coloured by the phase of the wavefunction there (colour wheel, top right) and sized by its weight. Solid outline: A atoms; dashed: B atoms. The arrows from the central A atom are δ₁, δ₂, δ₃; the shaded rhombus is the unit cell.');
    const atK = gm < 1e-6;
    const pair = `${fixed(Em, 2)} and ${Ep >= 0.005 ? '+' : ''}${fixed(Ep, 2)} eV`;
    setHTML($('info'), atK ? `<b>At ${nm || 'a Dirac point'}:</b> the three phases are 120° apart and their sum vanishes, so both bands sit at ${S.D ? '±Δ' : 'zero energy'}. ${S.D ? 'The sublattice energy splits them: the upper state lives only on A, the lower only on B.' : 'The two states are degenerate here; any combination of them is a solution.'}`
      : nm === 'Γ' ? `<b>At Γ</b> all three hops arrive in phase: |g| = 3, and the bands are at ${pair}${plainModel() ? ', that is ±3t' : ''}. The lower state is bonding (A and B in phase), the upper antibonding.`
      : nm === 'M' ? `<b>At M,</b> |g| = 1 and the bands are at ${pair}${plainModel() ? ', that is ±t' : ''}. M is a saddle point: along Γ–M the upper band has a minimum there, along the zone edge K–M–K′ a maximum.`
      : `<b>Moving k</b> turns the three phases at different rates. Their sum sets the energy: ${formula()}.`);
    // plot A: the three phasors, head to tail
    reset(plotA);
    const [xr, yr] = squareRange(plotA, [-3.4, 3.4], [-3.4, 3.4]);
    const th = range(0, 2 * Math.PI, 120), LA = [];
    LA.push({ type: 'line', x: th.map(a => 3 * Math.cos(a)), y: th.map(a => 3 * Math.sin(a)), color: '#d5dee4', width: 1, dash: [4, 4] });
    LA.push({ type: 'line', x: th.map(a => Math.cos(a)), y: th.map(a => Math.sin(a)), color: '#e4eaee', width: 1 });
    let x = 0, y = 0;
    const mids = [];
    G.DEL.forEach(([dx, dy], j) => {
      const ph = kx * dx + ky * dy, x1 = x + Math.cos(ph), y1 = y + Math.sin(ph);
      LA.push(...arrowLayers(x, y, x1, y1, DCOL[j], 2.6));
      mids.push([(x + x1) / 2, (y + y1) / 2, x1 - x, y1 - y]);
      x = x1; y = y1;
    });
    // label each arrow on the side away from the other two, so the labels do not pile up when the arrows close a triangle
    const cxm = mids.reduce((a, m) => a + m[0], 0) / 3, cym = mids.reduce((a, m) => a + m[1], 0) / 3;
    mids.forEach(([mx, my, ux, uy], j) => {
      let ox = mx - cxm, oy = my - cym, L = Math.hypot(ox, oy);
      if (L < 0.05) { ox = -uy; oy = ux; L = Math.hypot(ox, oy) || 1; }
      LA.push({ type: 'text', x: mx + 0.42 * ox / L, y: my + 0.42 * oy / L + 0.12, text: ['δ₁', 'δ₂', 'δ₃'][j], color: DCOL[j], weight: '800' });
    });
    if (Math.hypot(x, y) > 0.05) LA.push(...arrowLayers(0, 0, x, y, '#14232c', 2.2).map(l => (l.type === 'line' ? Object.assign(l, { dash: [5, 3] }) : l)));
    LA.push({ type: 'dots', x: [0], y: [0], color: '#14232c', r: 3.5 });
    plotA.opts.xLabel = 'Re'; plotA.opts.yLabel = 'Im'; plotA.opts.xTicks = 7;
    plotA.setRange(xr, yr); plotA.draw(LA);
    setHTML($('pa-title'), 'Adding up the three hops');
    put('pa-cap', `The phases e^{ik·δ_j} as unit arrows, head to tail. Dashed: their sum g(k), of length ${fixed(gm, 2)}; ${formula()}. The dashed circle has radius 3, the value at Γ.`.replace('e^{ik·δ_j}', 'e<sup>ik·δ<sub>j</sub></sup>'));
    legend('pa-legend', [[DCOL[0], '', 'from δ_1'], [DCOL[1], '', 'from δ_2'], [DCOL[2], '', 'from δ_3'], ['#14232c', 'swatch--dash', 'sum g(k)']]);
    // plot B: the bands along the path
    reset(plotB);
    const ss = range(0, 1, 360), pts = ss.map(f => G.pathPoint(f * G.PATH_LEN)), e = pts.map(k => G.bands(k[0], k[1], p));
    const top = Math.max(...e.map(v => v[1])), bot = Math.min(...e.map(v => v[0]));
    const LB = G.TICKS.map(x0 => ({ type: 'vline', x: x0 / G.PATH_LEN, color: '#c9d4db', width: 1, dash: [] }));
    LB.push({ type: 'line', x: ss, y: e.map(v => v[0]), color: LO, width: S.upper ? 1.8 : 3 });
    LB.push({ type: 'line', x: ss, y: e.map(v => v[1]), color: HI, width: S.upper ? 3 : 1.8 });
    LB.push({ type: 'vline', x: S.s, color: '#14232c', width: 1.2, dash: [4, 3] });
    LB.push({ type: 'dots', x: [S.s, S.s], y: [Em, Ep], colors: [LO, HI], r: 5 });
    plotB.opts.xLabel = 'Wavevector along the path'; plotB.opts.yLabel = 'Energy (eV)'; plotB.opts.zeroLine = true;
    plotB.opts.xTickValues = G.TICKS.map(x0 => x0 / G.PATH_LEN); plotB.opts.xFormat = v => ['Γ', 'K', 'M', 'Γ'][G.TICKS.findIndex(x0 => Math.abs(x0 / G.PATH_LEN - v) < 1e-9)] || '';
    plotB.setRange([0, 1], [bot * 1.06 - 0.3, top * 1.06 + 0.3]); plotB.draw(LB);
    setHTML($('pb-title'), 'The bands along Γ → K → M → Γ');
    put('pb-cap', `Lower band (π, filled in neutral graphene) and upper band (π*). ${S.D ? `A gap of 2Δ = ${fixed(2 * S.D, 2)} eV opens at K` : 'They touch at K'}; the dots mark the current k.`);
    legend('pb-legend', [[LO, '', 'lower band E<sub>−</sub>'], [HI, '', 'upper band E<sub>+</sub>']]);
    setHTML($('takeaway'), '<b>Band structure from interference:</b> the energy of a Bloch wave is set by how the waves hopping in from the three neighbours add up. Where they cancel, at K and K′, the bands touch. That happens because the honeycomb has two identical atoms per cell and three-fold symmetry, not because of the value of t; make the A and B sites different (Δ) and a gap opens.');
  }

  // ---------- 2. The bands in 3D ----------
  const cache = new Map();
  function memo(key, fn) { if (!cache.has(key)) { if (cache.size > 40) cache.clear(); cache.set(key, fn()); } return cache.get(key); }
  const dosTab = () => memo(`dos|${S.t}|${S.tp}|${S.D}`, () => G.dos(P()));
  const vanHove = G.vanHove;
  function fermiShape(p, Ef) {
    const [vl, vh] = vanHove(p), [lo, hi] = G.edges(p);
    if (Ef >= hi) return ['none', 'above both bands: they are full'];
    if (Ef <= lo) return ['none', 'below both bands: they are empty'];
    if (Ef === 0 && !p.D) return ['two points', 'the Dirac points K and K′'];
    const band = Ef >= 0 ? 1 : 0, edgeK = G.bands(...G.PTS.K, p)[band];
    if ((band === 1 && Ef <= edgeK) || (band === 0 && Ef >= edgeK)) return ['none', 'E_F is in the gap'];
    if (Math.abs(Ef - (band ? vh : vl)) < 0.03) return ['a hexagon', 'the pockets join at the M points'];
    if ((band === 1 && Ef < vh) || (band === 0 && Ef > vl)) return ['two pockets', 'one round K, one round K′'];
    return ['one contour', 'closed round Γ'];
  }
  function bzImage(R, band) {
    const N = 300, cv = document.createElement('canvas'); cv.width = N; cv.height = N;
    const g = cv.getContext('2d'), img = g.createImageData(N, N), p = P(), e = new Float32Array(N * N), emax = 3 * S.t + 9 * Math.abs(S.tp) + S.D;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) e[i + N * j] = G.bands(-R + 2 * R * (i + 0.5) / N, R - 2 * R * (j + 0.5) / N, p)[band];
    const lo = [31, 78, 168], mid = [219, 228, 238], hi = [204, 77, 26];
    for (let k = 0; k < N * N; k++) {
      const x = Math.max(-1, Math.min(1, e[k] / emax)), f = Math.pow(Math.abs(x), 0.7), c = (x < 0 ? lo : hi).map((q, i) => mid[i] + f * (q - mid[i]));
      const i = k % N, j = (k - i) / N;
      // the Fermi contour: where the band crosses E_F between neighbouring pixels
      const s0 = e[k] > S.Ef, cross = (i + 1 < N && (e[k + 1] > S.Ef) !== s0) || (j + 1 < N && (e[k + N] > S.Ef) !== s0);
      const out = cross ? [255, 250, 205] : c;
      img.data[4 * k] = out[0]; img.data[4 * k + 1] = out[1]; img.data[4 * k + 2] = out[2]; img.data[4 * k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return cv;
  }
  function renderBZ() {
    const p = P(), tab = dosTab(), n = G.carriers(S.Ef, p, tab), [shape, where] = fermiShape(p, S.Ef);
    b3.set(p, S.Ef);
    // DOS at E_F: the slope of the exact carrier density while the pockets are closed, else the histogram
    let rhoF = 0;
    const h = 0.002, n1 = G.carriers(S.Ef + h, p, null), n0 = G.carriers(S.Ef - h, p, null);
    if (Number.isFinite(n1) && Number.isFinite(n0) && Math.abs(S.Ef) < 0.8 * p.t) rhoF = (n1 - n0) / (2 * h) * G.CELL;
    else { const b = Math.floor((S.Ef - tab.E[0] + tab.dE / 2) / tab.dE); if (b >= 0 && b < tab.E.length) rhoF = tab.rho[b]; }
    stats([
      ['Fermi level', `${S.Ef > 0 ? '+' : ''}${fixed(S.Ef, 2)} eV`, 'measured from the Dirac point'],
      ['Carriers', sci(Math.abs(n) * 1e14), n > 0 ? 'electrons per cm², added' : n < 0 ? 'holes per cm² (electrons removed)' : 'per cm²: neutral'],
      ['Density of states', `${fixed(rhoF, 3)}`, 'states per eV per unit cell, at E_F'],
      ['Fermi surface', shape, where],
    ]);
    setHTML($('dg-title'), 'Both bands across the Brillouin zone');
    put('dg-cap', 'Lower band in blue, upper in orange, over a disc a little larger than the zone so the six cones are whole. The pale plane is the Fermi level; the bands glow where they cross it. Drag to turn.');
    setHTML($('info'), shape === 'two pockets' ? `<b>Two valleys:</b> the Fermi surface is a small pocket round each corner. Each of the six corners is shared by three zones, so the six thirds make two whole pockets, one at K and one at K′.`
      : shape === 'a hexagon' ? '<b>A van Hove singularity:</b> the pockets meet at the M points. Many states pile up at this energy, and the Fermi surface changes topology (a Lifshitz transition).'
      : shape === 'one contour' ? '<b>Beyond the van Hove energy</b> the Fermi surface is one contour round Γ, as in an ordinary metal.'
      : shape === 'none' && /full|empty/.test(where) ? `<b>Beyond the bands:</b> the π bands span ${fixed(G.edges(p)[0], 2)} to ${fixed(G.edges(p)[1], 2)} eV, so at this Fermi level they are ${S.Ef > 0 ? 'completely full' : 'completely empty'} and there is no Fermi surface.`
      : shape === 'none' ? '<b>In the gap:</b> with Δ ≠ 0 there are no states between −Δ and +Δ.'
      : '<b>Neutral graphene:</b> the lower band is exactly full and the Fermi surface shrinks to the six corners.');
    // plot A: the zone as a map
    reset(plotA);
    const KR = 2 * G.KK / S3, R = 1.18 * KR, [xr, yr] = squareRange(plotA, [-R, R], [-R, R]), band = S.Ef >= 0 ? 1 : 0;
    const LA = [{ type: 'image', canvas: bzImage(R, band), x0: -R, x1: R, y0: -R, y1: R, smooth: true }];
    const hx = [], hy = [];
    for (let i = 0; i <= 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; hx.push(KR * Math.cos(a)); hy.push(KR * Math.sin(a)); }
    LA.push({ type: 'line', x: hx, y: hy, color: '#14232c', width: 1.4 });
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; LA.push({ type: 'text', x: 1.09 * KR * Math.cos(a), y: 1.09 * KR * Math.sin(a) + 1.1, text: i % 2 ? 'K′' : 'K', color: '#14232c', weight: '800' }); }
    LA.push({ type: 'text', x: 0, y: 1.6, text: 'Γ', color: '#14232c', weight: '800' }, { type: 'text', x: 1.08 * G.KK, y: 1.3, text: 'M', color: '#14232c', weight: '800' });
    plotA.opts.xLabel = 'kx (nm⁻¹)'; plotA.opts.yLabel = 'ky (nm⁻¹)'; plotA.opts.xTicks = 5;
    plotA.setRange(xr, yr); plotA.draw(LA);
    setHTML($('pa-title'), `The ${band ? 'upper' : 'lower'} band seen from above`);
    put('pa-cap', `Colour: energy of the ${band ? 'upper' : 'lower'} band (the one that holds E_F), pale near the Dirac points. Pale yellow line: the Fermi contour at E_F = ${fixed(S.Ef, 2)} eV. Black: the first Brillouin zone.`);
    legend('pa-legend', []);
    // plot B: density of states
    reset(plotB);
    const dd = Array.from(tab.E).map(E => G.diracDos(E, p)), ymax = 1.15 * Math.min(Math.max(...tab.rho), 1.4);
    const [vl, vh] = vanHove(p);
    const LB = [
      { type: 'line', x: Array.from(tab.E), y: Array.from(tab.rho), color: css('--series-1'), width: 2.4, fill: NanoPlot.alpha(css('--series-1'), 0.14) },
      { type: 'line', x: Array.from(tab.E), y: dd.map(v => (v > ymax * 1.2 ? NaN : v)), color: '#5f7382', width: 1.5, dash: [6, 4] },
      { type: 'vline', x: vl, color: '#9fb1ba', width: 1, dash: [2, 3] }, { type: 'vline', x: vh, color: '#9fb1ba', width: 1, dash: [2, 3] },
      { type: 'vline', x: S.Ef, color: '#14232c', width: 1.6, dash: [] },
    ];
    plotB.opts.xLabel = 'Energy (eV)'; plotB.opts.yLabel = 'States per eV per cell'; plotB.opts.xTicks = 8;
    plotB.setRange([Math.min(tab.E[0], S.Ef - 0.3), Math.max(tab.E[tab.E.length - 1], S.Ef + 0.3)], [0, ymax]); plotB.draw(LB);
    setHTML($('pb-title'), 'Density of states');
    put('pb-cap', `Tight binding (solid, spin included) against the Dirac model's straight lines, ρ ∝ |E| (dashed). They agree near zero energy; the peaks at ${fixed(vl, 2)} and ${fixed(vh, 2)} eV (dotted) are the van Hove singularities from the saddle points at M.`);
    legend('pb-legend', [[css('--series-1'), 'swatch--area', 'tight binding'], ['#5f7382', 'swatch--dash', 'Dirac model'], ['#14232c', '', 'Fermi level']]);
    setHTML($('takeaway'), '<b>A gate moves E<sub>F</sub> through the cones.</b> Near the Dirac point the density of states is small and grows linearly, so a few volts on a gate shift E<sub>F</sub> by tenths of an eV, and graphene switches between electron and hole conduction.');
  }

  // ---------- 3. The Dirac cone ----------
  function warpCurve(p) {
    return memo(`warp|${S.t}|${S.tp}|${S.D}`, () => {
      const Es = range(Math.max(0.03, S.D + 0.03), 2.5, 32), mean = [], aniso = [];
      for (const E of Es) {
        const q = G.contour('K', E, p, 72), qd = Math.sqrt(Math.max(0, E * E - S.D * S.D)) / G.hv(p);
        if (q.some(v => !Number.isFinite(v))) { mean.push(NaN); aniso.push(NaN); continue; }
        mean.push(100 * (q.reduce((s, v) => s + v, 0) / q.length / qd - 1)); aniso.push(100 * (Math.max(...q) / Math.min(...q) - 1));
      }
      return { Es, mean, aniso };
    });
  }
  function renderDirac() {
    const p = P(), E = S.E, q = G.contour('K', E, p, 360), ok = !q.some(v => !Number.isFinite(v)), vh = G.vanHove(p)[1];
    const qd = Math.sqrt(Math.max(0, E * E - S.D * S.D)) / G.hv(p), qm = ok ? q.reduce((s, v) => s + v, 0) / q.length : NaN;
    const gam = ok ? G.berry('K', E, p, 240) : NaN, gamP = ok ? G.berry('Kp', E, p, 240) : NaN;
    $('ps').innerHTML = V.pseudospin({ p, E, narrow: narrow($('ps')) });
    stats([
      ['Fermi velocity', `${fixed(G.vF(p) / 1e6, 3)} × 10<sup>6</sup> m/s`, `v_F = 3ta/2ħ ≈ c/${Math.round(2.998e8 / G.vF(p))}`],
      ['Contour radius', ok ? `${fixed(qm, 3)} nm⁻¹` : '—', `Dirac model: ${fixed(qd, 3)} nm⁻¹ (${ok ? (qm >= qd ? '+' : '') + fixed(100 * (qm / qd - 1), 2) + '%' : '—'})`],
      ['Trigonal warping', ok ? `${fixed(100 * (Math.max(...q) / Math.min(...q) - 1), 1)}%` : '—', 'largest over smallest radius, minus 1'],
      // with no gap the Berry phase is pi, and +pi and -pi are the same phase: show its size only
      S.D < 1e-9 ? ['Berry phase', ok ? `${fixed(Math.abs(gam) / Math.PI, 3)}π` : '—', 'round K and round K′ alike (+π and −π are the same phase)']
        : ['Berry phase', ok ? `${gam >= 0 ? '+' : ''}${fixed(gam / Math.PI, 3)}π` : '—', `round K; ${ok ? (gamP >= 0 ? '+' : '') + fixed(gamP / Math.PI, 3) + 'π' : '—'} round K′`],
    ]);
    setHTML($('dg-title'), `Pseudospin round the two valleys, at ${fixed(E, 2)} eV`);
    put('dg-cap', `Arrows: the direction of the pseudospin in the upper band (in the plane of (c_A, c_B) space). ${ok ? `Green: the tight-binding contour at ${fixed(E, 2)} eV; dashed grey` : 'Dashed grey'}: the Dirac circle; thin grey: lower energies. Each disc is ${fixed(2 * Math.max(0.12, 1.7 * qd), 2)} nm⁻¹ across.`);
    setHTML($('info'), !ok ? `<b>No closed contour round K:</b> above the van Hove energy (${fixed(vh, 2)} eV here) the pockets round K and K′ have joined into one contour round Γ, so the radius, the warping and the Berry phase round K are not defined. Lower the energy, or raise t.`
      : (S.clamped ? `<b>At the bottom of the band:</b> there are no states inside the gap, so the energy cannot go below Δ = ${fixed(S.D, 2)} eV. ` : '') + (S.D > 0 ? `<b>A massive Dirac cone:</b> near the bottom of the band (E ≈ Δ) the pseudospin points out of the plane, onto one sublattice, so the arrows shrink. The Berry phase falls below π, close to the Dirac model's π(1 − Δ/E) = ${fixed(1 - S.D / E, 3)}π.`
      : `<b>A massless Dirac cone:</b> the pseudospin always lies in the plane and turns once round each valley, in opposite senses at K and K′. That single turn is a Berry phase of π, which shows up as the half-integer quantum Hall effect and as suppressed backscattering.`));
    // plot A: a cut through K
    reset(plotA);
    const [Kx, Ky] = G.PTS.K, dir = S.cut === 'G' ? [-Kx, -Ky] : [G.PTS.M[0] - Kx, G.PTS.M[1] - Ky], dl = Math.hypot(...dir), u = [dir[0] / dl, dir[1] / dl];
    const Q = Math.min(0.95 * G.KK / S3, Math.max(0.6, 1.7 * qd)), qs = range(-Q, Q, 240);
    const tb = qs.map(s => G.bands(Kx + s * u[0], Ky + s * u[1], p)), dc = qs.map(s => G.dirac(Math.abs(s), p));
    const LA = [
      { type: 'line', x: qs, y: dc, color: '#5f7382', width: 1.6, dash: [6, 4] }, { type: 'line', x: qs, y: dc.map(v => -v), color: '#5f7382', width: 1.6, dash: [6, 4] },
      { type: 'line', x: qs, y: tb.map(v => v[0]), color: LO, width: 2.6 }, { type: 'line', x: qs, y: tb.map(v => v[1]), color: HI, width: 2.6 },
      { type: 'hline', y: E, color: '#127a5e', width: 1.4, dash: [3, 3] },
    ];
    const ymax = Math.max(1.2 * E, ...tb.map(v => v[1]).filter(Number.isFinite));
    plotA.opts.xLabel = `q along K → ${S.cut === 'G' ? 'Γ' : 'M'} (nm⁻¹)`; plotA.opts.yLabel = 'Energy (eV)'; plotA.opts.xTicks = 6; plotA.opts.zeroLine = true;
    plotA.setRange([-Q, Q], [-ymax, ymax]); plotA.draw(LA);
    setHTML($('pa-title'), `A cut through K, towards ${S.cut === 'G' ? 'Γ' : 'M'}`);
    put('pa-cap', `Tight binding (solid) against the Dirac cone ±√(Δ² + ħ²v_F²q²) (dashed). Positive q points from K towards ${S.cut === 'G' ? 'Γ' : 'M'}; the two sides differ once the cone starts to warp. Green: the energy chosen on the left.`);
    legend('pa-legend', [[HI, '', 'tight binding'], ['#5f7382', 'swatch--dash', 'Dirac model']]);
    // plot B: how good is the Dirac model?
    reset(plotB);
    const w = warpCurve(p);
    const fin = a => a.filter(Number.isFinite), ylo = Math.min(0, ...fin(w.mean)) * 1.15, yhi = Math.max(10, ...fin(w.aniso)) * 1.05;
    const LB = [
      { type: 'line', x: w.Es, y: w.aniso, color: '#127a5e', width: 2.4 },
      { type: 'line', x: w.Es, y: w.mean, color: '#c47a12', width: 2.4, dash: [6, 4] },
      { type: 'vline', x: E, color: '#14232c', width: 1.2, dash: [] },
    ];
    if (ok) LB.push({ type: 'dots', x: [E, E], y: [100 * (Math.max(...q) / Math.min(...q) - 1), 100 * (qm / qd - 1)], colors: ['#127a5e', '#c47a12'], r: 4.5 });
    plotB.opts.xLabel = 'Energy above the Dirac point (eV)'; plotB.opts.yLabel = 'Difference (%)'; plotB.opts.xTicks = 6; plotB.opts.zeroLine = ylo < 0;
    plotB.setRange([0, 2.5], [ylo, yhi]); plotB.draw(LB);
    setHTML($('pb-title'), 'How good is the Dirac model?');
    put('pb-cap', 'Green: how far the contour is from round (largest over smallest radius, minus 1). Amber: its average radius against the Dirac circle. Both vanish at the Dirac point and grow roughly as E and E².');
    legend('pb-legend', [['#127a5e', '', 'trigonal warping'], ['#c47a12', 'swatch--dash', 'mean radius vs Dirac']]);
    setHTML($('takeaway'), '<b>The Dirac model is the tight-binding model, zoomed in.</b> Expanding g(k) to first order near K turns the honeycomb into a 2D Dirac equation with c replaced by v<sub>F</sub> ≈ c/340. For t = 2.7 eV its contours stay round to within 4% up to 0.3 eV and 7% at 0.5 eV, the range reached in gated devices.');
  }

  // ---------- controls ----------
  function syncControls() {
    const set = (id, v, txt) => { $(id).value = v; $(id + '-out').textContent = txt; $(id).setAttribute('aria-valuetext', txt); };
    set('kpos', S.s, kName(S.s) || kWhere(S.s));
    set('ef', S.Ef, `${S.Ef > 0 ? '+' : ''}${fixed(S.Ef, 2)} eV`);
    set('en', S.E, `${fixed(S.E, 2)} eV`);
    set('t', S.t, `${fixed(S.t, 2)} eV`); set('tp', S.tp, `${fixed(S.tp, 2)} eV`); set('gap', S.D, `${fixed(S.D, 2)} eV`);
    document.querySelectorAll('[data-band]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.band === 'upper') === S.upper)));
    document.querySelectorAll('[data-cut]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cut === S.cut)));
    document.querySelectorAll('[data-kpt]').forEach(b => b.setAttribute('aria-pressed', String(Math.abs(FRAC[b.dataset.kpt] - S.s) < 1e-6)));
    $('spin').setAttribute('aria-pressed', String(b3.spin));
  }
  // inside the gap there are no states: keep the Dirac-tab energy just above Delta, and say so
  function clampState() { if (S.E <= S.D) S.E = Math.round((S.D + 0.01) * 100) / 100; S.clamped = S.D > 0 && S.E <= S.D + 0.0101; }
  function render() {
    clampState();
    syncControls();
    if (mode === 'tb') renderTB(); else if (mode === 'bz') renderBZ(); else renderDirac();
    // the plots take their accessible names from their titles
    $('plot-a').setAttribute('aria-label', $('pa-title').textContent); $('plot-b').setAttribute('aria-label', $('pb-title').textContent);
    $('play').textContent = playing ? '❚❚ Pause' : reduceMotion ? '▶ Step k along the path' : '▶ Move k along the path';
    $('play-out').textContent = mode === 'tb' ? kName(S.s) || '' : '';
  }
  function applyMode() {
    document.querySelectorAll('.tab').forEach(b => { const on = b.dataset.mode === mode; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $('lab').setAttribute('aria-labelledby', 'tab-' + mode);
    document.querySelectorAll('.mode-intro').forEach(el => { el.hidden = el.dataset.for !== mode; });
    document.querySelectorAll('[data-modes]').forEach(el => { el.hidden = !el.dataset.modes.split(' ').includes(mode); });
    b3.paused = mode !== 'bz';
    render();
  }
  // sliders: follow them at most once per frame (the 3D mesh and the density of states are rebuilt when t, t' or Δ change)
  let pending = false;
  const later = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; render(); }); };
  // the k slider snaps onto Γ, K and M, so the special points can be reached by dragging
  const snapK = v => { for (const f of [0, FRAC.K, FRAC.M, 1]) if (Math.abs(v - f) < 0.004) return f; return v; };
  [['kpos', 's'], ['ef', 'Ef'], ['en', 'E'], ['t', 't'], ['tp', 'tp'], ['gap', 'D']].forEach(([id, key]) => $(id).addEventListener('input', e => { if (id === 'kpos') stop(); S[key] = id === 'kpos' ? snapK(+e.target.value) : +e.target.value; later(); }));
  document.querySelector('.controls').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.kpt) { stop(); S.s = FRAC[d.kpt]; }
    else if (d.band) S.upper = d.band === 'upper';
    else if (d.ef) S.Ef = d.ef === 't' ? Math.round(vanHove(P())[1] * 100) / 100 : +d.ef;
    else if (d.en) S.E = +d.en;
    else if (d.cut) S.cut = d.cut;
    else if (b.id === 'plain') Object.assign(S, PLAIN);
    else if (b.id === 'spin') b3.spin = !b3.spin && !reduceMotion;
    else if (b.id === 'reset-view') { b3.resetView(); return; }
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
    new ResizeObserver(() => { const nw = narrow($('lab').querySelector('.diagram-card')) + '|' + Math.round($('plot-a').clientWidth / 40); if (nw !== was) { was = nw; if (!playing) render(); } }).observe($('lab'));
  }

  // ---------- k round the path, looping until paused ----------
  let playing = false, raf = 0, lastT = 0, speed = 1;
  function frame(now) {
    if (!playing) return;
    const dt = Math.max(0, Math.min(0.1, (now - lastT) / 1000)); lastT = now;
    S.s = (S.s + dt * speed / 9) % 1;
    render();
    raf = requestAnimationFrame(frame);
  }
  function stop() { playing = false; cancelAnimationFrame(raf); }
  $('play').addEventListener('click', () => {
    if (playing) { stop(); render(); return; }
    if (reduceMotion) { S.s = (S.s + 0.05) % 1; render(); return; }
    playing = true; lastT = performance.now(); raf = requestAnimationFrame(frame); render();
  });
  $('speed').addEventListener('change', e => { speed = +e.target.value; });
  if (reduceMotion) {
    $('transport-note').textContent = 'Reduced motion is on: each press moves k a step along Γ → K → M → Γ.';
    const sp = $('spin'); sp.disabled = true; sp.setAttribute('aria-pressed', 'false'); sp.title = 'Off because your system asks for reduced motion';
  }

  // ---------- predict-first loaders ----------
  const QUESTIONS = {
    q1: () => { mode = 'tb'; Object.assign(S, PLAIN, { s: FRAC.G, upper: false }); },
    q2: () => { mode = 'tb'; Object.assign(S, PLAIN, { s: FRAC.K, upper: false }); },
    q3: () => { mode = 'tb'; Object.assign(S, PLAIN, { s: FRAC.M, upper: true }); },
    q4: () => { mode = 'bz'; Object.assign(S, PLAIN, { Ef: 0.3 }); },
    q5: () => { mode = 'bz'; Object.assign(S, PLAIN, { Ef: 2.7 }); },
    q6: () => { mode = 'bz'; Object.assign(S, PLAIN, { Ef: 0 }); },
    q7: () => { mode = 'dirac'; Object.assign(S, PLAIN, { E: 1, cut: 'M' }); },
    q8: () => { mode = 'dirac'; Object.assign(S, PLAIN, { D: 0.3, E: 0.6, cut: 'G' }); },
  };
  document.querySelectorAll('.predict__load[data-q]').forEach(b => b.addEventListener('click', () => {
    stop();
    QUESTIONS[b.dataset.q]();
    applyMode();
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }));

  applyMode();
  window.__graphene = { S, b3, render };
})();
