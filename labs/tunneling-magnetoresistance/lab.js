/* Tunnelling magnetoresistance lab: one electron through the barrier, the Landauer sum, the free layer's angle, bias.
   Physics in physics.js (exact lattice Green's functions), pictures in views.js. */
(function () {
  'use strict';
  const M = window.MTJ, V = window.TMRViews, DEG = Math.PI / 180;
  const $ = id => document.getElementById(id);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const MAT = { fe: { EF: 4.53, D: 3.85 }, strong: { EF: 3.0, D: 2.8 }, half: { EF: 3.0, D: 3.5 } };
  const START = { th: 0, ph: 0, inj: 0, phiB: 3, d: 8, V: 0, EF: 4.53, D: 3.85, pb: 'd' };
  const S = Object.assign({}, START);
  let mode = 'wave';
  const INK = '#14232c', MAJ = '#d23b2e', MIN = '#1f6fb4', GREEN = '#2e8b57', BERRY = '#a3326c', BRAND = '#2a55b8', AMBER = '#c47a12', GREY = '#8a9aa5';
  const BUF = 8;               // Å of each ferromagnet shown beside the barrier

  // ---------- formatting ----------
  const fixed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  function sci(x, d = 2) {
    if (!(x > 0) || !isFinite(x)) return x === 0 ? '0' : '∞';
    let k = Math.floor(Math.log10(x)), m = x / Math.pow(10, k);
    if (m >= 10 - 0.5 * Math.pow(10, 1 - d)) { m /= 10; k++; }
    if (k >= -2 && k <= 3) { const dec = Math.max(0, d - k), r = Math.round(x / Math.pow(10, k - d)) * Math.pow(10, k - d); return r.toFixed(dec); }
    return `${m.toFixed(d - 1)} × 10${String(k).split('').map(c => SUP[c]).join('')}`;
  }
  const pctTxt = r => (!isFinite(r) || r > 1e5 ? '∞' : `${fixed(100 * r, Math.abs(100 * r) < 10 ? 1 : 0)}%`);
  const tmrOf = (a, b) => (b > 0 && a / b < 1e8 ? a / b - 1 : Infinity);
  const range = (a, b, k) => Array.from({ length: k + 1 }, (_, i) => a + (b - a) * i / k);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sub = t => String(t).replace(/_\{([^}]*)\}|_([A-Za-z0-9↑↓∥])/g, (m, a, b) => `<sub>${a || b}</sub>`);
  const sym = t => `<span class="sym">${t}</span>`;

  // ---------- helpers ----------
  function stats(items) {
    $('stats').innerHTML = items.map(([label, value, s2]) => `<div class="stat"><div class="stat__label">${sub(label)}</div><div class="stat__value">${value}</div><div class="stat__sub">${sub(s2)}</div></div>`).join('');
  }
  function typeset(el) { if (window.MathJax && MathJax.typesetPromise && /\\\(/.test(el.innerHTML)) MathJax.typesetPromise([el]).catch(() => {}); }
  function setHTML(el, html) { if (el.dataset.html === html) return; el.dataset.html = html; el.innerHTML = html; typeset(el); }
  const put = (id, t) => setHTML($(id), sub(t));
  function legend(id, items) { setHTML($(id), items.map(([c, k, l]) => `<li style="color:${c}"><span class="swatch ${k}"></span><span>${sub(l)}</span></li>`).join('')); }
  const MARGIN = { l: 60, r: 18, t: 12, b: 42 };
  const plotA = new NanoPlot($('plot-a'), { margin: MARGIN, narrowMargin: { l: 58 } });
  const plotB = new NanoPlot($('plot-b'), { margin: MARGIN, narrowMargin: { l: 58 } });
  const prof = new NanoPlot($('profile'), { margin: { l: 46, r: 12, t: 12, b: 40 }, xTicks: 4 });
  const sphere = new V.SpinSphere($('sphere'));
  const reset = pl => { pl.opts.xTickValues = null; pl.opts.xFormat = null; pl.opts.yFormat = null; pl.opts.zeroLine = false; pl.opts.xTicks = 6; pl.opts.yTicks = 5; };
  const logFmt = v => (Math.abs(v - Math.round(v)) < 1e-6 ? `10${String(Math.round(v)).split('').map(c => SUP[c]).join('')}` : '');
  const par = () => ({ EF: S.EF, D: S.D, phiB: S.phiB, d: S.d });
  const m2 = () => [Math.sin(S.th * DEG) * Math.cos(S.ph * DEG), Math.sin(S.th * DEG) * Math.sin(S.ph * DEG), Math.cos(S.th * DEG)];
  const thr = () => S.th * DEG, phr = () => S.ph * DEG;
  const PI = Math.PI;

  // ---------- slow curves, computed once the controls have settled ----------
  const cache = new Map();
  let timer = 0;
  function slow(key, fn) {
    if (cache.has(key)) return cache.get(key);
    clearTimeout(timer);
    timer = setTimeout(() => { if (!cache.has(key)) { cache.set(key, fn()); if (cache.size > 40) cache.delete(cache.keys().next().value); render(); } }, 160);
    return null;
  }

  // ---------- the sphere of directions ----------
  // the in-plane direction across m2, toward m1: m2 × (m1 × m2), normalized
  function inPlane() {
    const n = m2(), c = [-n[1], n[0], 0], e = [n[1] * c[2] - n[2] * c[1], n[2] * c[0] - n[0] * c[2], n[0] * c[1] - n[1] * c[0]], l = Math.hypot(...e);
    return l > 1e-9 ? e.map(v => v / l) : [0, 0, 0];
  }
  function drawSphere(torque) {
    const n2 = m2(), arrows = [{ v: [0, 0, 1], color: INK, label: 'm₁', side: -1 }, { v: n2, color: BRAND, label: 'm₂' }];
    const from = [];
    if (torque && Math.abs(torque) > 0.005) { const e = inPlane(); from.push({ a: n2, b: n2.map((v, i) => v + torque * e[i]), color: BERRY, width: 3 }); }
    sphere.draw({ arrows, from });
    $('sphere').setAttribute('aria-label', `Fixed layer along z; free layer at θ = ${S.th}°, φ = ${S.ph}°${torque ? `; spin torque of ${fixed(torque, 2)} per electron, toward the fixed layer` : ''}`);
  }

  // ---------- the energy profile ----------
  function drawProfile(showE) {
    const p = par(), Vb = S.V, U = p.EF + p.phiB;
    reset(prof);
    prof.opts.xLabel = 'Position x (Å)'; prof.opts.yLabel = 'Energy (eV)';
    const ylo = Math.min(0, -Vb) - 0.5, yhi = U + 0.7;
    prof.setRange([-BUF, p.d + BUF], [ylo, yhi]);
    const L = [];
    L.push({ type: 'poly', x: [0, 0, p.d, p.d], y: [ylo, U, U - Vb, ylo], fill: 'rgba(95, 115, 130, 0.16)' });
    L.push({ type: 'line', x: [0, 0, p.d, p.d], y: [ylo, U, U - Vb, ylo], color: '#5f7382', width: 2 });
    L.push({ type: 'line', x: [-BUF, 0], y: [0, 0], color: MAJ, width: 2.6 }, { type: 'line', x: [-BUF, 0], y: [p.D, p.D], color: MIN, width: 2.6 });
    L.push({ type: 'line', x: [p.d, p.d + BUF], y: [-Vb, -Vb], color: MAJ, width: 2.6, dash: [6, 3] }, { type: 'line', x: [p.d, p.d + BUF], y: [p.D - Vb, p.D - Vb], color: MIN, width: 2.6, dash: [6, 3] });
    L.push({ type: 'line', x: [-BUF, 0], y: [p.EF, p.EF], color: INK, width: 1.4, dash: [4, 3] }, { type: 'line', x: [p.d, p.d + BUF], y: [p.EF - Vb, p.EF - Vb], color: INK, width: 1.4, dash: [4, 3] });
    L.push({ type: 'text', x: -BUF / 2, y: yhi - 0.05, text: 'fixed', color: '#5f7382' }, { type: 'text', x: p.d + BUF / 2, y: yhi - 0.05, text: 'free', color: '#5f7382' });
    if (showE) L.push({ type: 'line', x: [-BUF * 0.85, p.d + BUF * 0.85], y: [p.EF, p.EF], color: GREEN, width: 1.6, dash: [2, 3] }, { type: 'dots', x: [-BUF * 0.6], y: [p.EF], color: GREEN, r: 5 });
    prof.draw(L);
  }

  // ---------- 1. One electron tunnels ----------
  function renderWave() {
    const p = par(), q = Object.assign({}, p, { V: S.V }), vid = M.video(p);
    const r = M.atEx(p.EF, q, [[thr(), phr()], [0, 0], [PI, 0]]);
    const T = r[0].T, Tin = s => T[0][s] + T[1][s];
    const kap = Math.sqrt(p.phiB / M.C);
    const open = [p.EF > 0, p.EF > p.D];
    stats([
      ['Fermi wavevectors k_↑, k_↓', `${fixed(vid.ku, 2)}, ${fixed(vid.kd, 2)} Å⁻¹`, open[1] ? 'majority and minority, at E_F' : 'no minority states at E_F'],
      [`Decay constant ${sym('κ')}`, `${fixed(kap, 2)} Å⁻¹`, `the wave falls e-fold every ${fixed(1 / kap, 2)} Å`],
      ['A majority electron gets through', open[0] ? sci(Tin(0)) : '—', `T at normal incidence, θ = ${S.th}°`],
      ['A minority electron gets through', open[1] ? sci(Tin(1)) : '—', open[1] ? `T at normal incidence, θ = ${S.th}°` : 'there are none at E_F'],
    ]);
    drawSphere(null);
    $('prof-box').hidden = false; $('side-svg').hidden = true;
    drawProfile(true);
    setHTML($('dg-title'), 'The junction, and the electron\'s energy');
    put('dg-cap', 'Left: the two magnetizations (drag to turn). Right: the energy landscape of the video\'s toy model: red and blue are the bottoms of the majority and minority bands (dashed: along m_2 in the free layer), grey is the barrier, black dashed the Fermi levels. The green line is the electron, at the Fermi energy.');
    legend('dg-legend', [[INK, '', 'fixed layer m_1'], [BRAND, '', 'free layer m_2'], [MAJ, '', 'majority band bottom'], [MIN, '', 'minority band bottom']]);
    // plot A: the wavefunction
    reset(plotA);
    const w = M.wave(p.EF, q, thr(), phr(), S.inj, BUF, Math.max(1, Math.floor((p.d + 2 * BUF) / M.A / 700)));
    plotA.opts.xLabel = 'Position x (Å)'; plotA.opts.yLabel = 'Probability density |ψ|²'; plotA.opts.yFormat = logFmt;
    const LA = [{ type: 'vband', x0: 0, x1: p.d, color: 'rgba(95, 115, 130, 0.12)' }];
    let lo = -1;
    if (w) {
      const lg = a => a.map(v => (v > 1e-30 ? Math.log10(v) : NaN));
      const a = lg(w.maj), b = lg(w.min);
      const fin = a.concat(b).filter(Number.isFinite);
      lo = Math.max(-30, Math.floor(Math.min(...fin) - 0.5));
      LA.push({ type: 'line', x: w.x, y: b, color: MIN, width: 2 }, { type: 'line', x: w.x, y: a, color: MAJ, width: 2.4 });
    }
    plotA.setRange([-BUF, p.d + BUF], [lo, 1]);
    plotA.draw(LA);
    setHTML($('pa-title'), `A ${S.inj ? 'minority' : 'majority'} electron tunnels`);
    put('pa-cap', w ? `|ψ|² on a log scale, for an incoming wave of amplitude 1, split into majority (red) and minority (blue) spin: along m_1 up to the far side of the barrier (grey), along m_2 in the free layer. Left: incoming and reflected waves interfere; in the barrier, a straight line, the exponential decay; right: the transmitted waves.` : 'There are no minority electrons at the Fermi energy in these ferromagnets: choose the majority spin, or lower Δ.');
    legend('pa-legend', [[MAJ, '', 'majority part'], [MIN, '', 'minority part'], ['rgba(95, 115, 130, 0.5)', 'swatch--area', 'barrier']]);
    // plot B: the head-on TMR against thickness, exact and the video's thick-barrier formula
    reset(plotB);
    const ds = range(3, 25, 44);
    const hz = ds.map(d => { const x = M.atEx(p.EF, Object.assign({}, q, { d }), [[0, 0], [PI, 0]]).map(y => y.T[0][0] + y.T[0][1] + y.T[1][0] + y.T[1][1]); return 100 * tmrOf(x[0], x[1]); });
    const vline = 100 * vid.tmrS;
    const fin = hz.filter(isFinite).concat(isFinite(vline) ? [vline] : []);
    const ylo = Math.min(0, ...fin), yhi = Math.max(...fin, 1);
    plotB.opts.xLabel = 'Barrier thickness d (Å)'; plotB.opts.yLabel = 'TMR, head on (%)'; plotB.opts.zeroLine = true;
    plotB.setRange([3, 25], [ylo - 0.06 * (yhi - ylo), yhi + 0.1 * (yhi - ylo)]);
    const LB = [{ type: 'vline', x: p.d, color: INK, width: 1, dash: [3, 3] }];
    if (!S.V && isFinite(vline)) LB.push({ type: 'hline', y: vline, color: GREY, width: 1.6, dash: [6, 4] });
    LB.push({ type: 'line', x: ds, y: hz.map(v => (isFinite(v) ? v : NaN)), color: BRAND, width: 2.6 });
    LB.push({ type: 'dots', x: [p.d], y: [100 * tmrOf(r[1].T[0][0] + r[1].T[0][1] + r[1].T[1][0] + r[1].T[1][1], r[2].T[0][0] + r[2].T[0][1] + r[2].T[1][0] + r[2].T[1][1])], color: INK, r: 5 });
    plotB.draw(LB);
    setHTML($('pb-title'), 'The video\'s formula is the thick-barrier limit');
    put('pb-cap', `TMR for electrons arriving head on, (T_P − T_{AP})/T_{AP}, against thickness (blue). ${S.V ? 'At this bias the video\'s formula, for V = 0, is not drawn.' : `Grey dashed: the video's 2P²/(1 − P²), ${pctTxt(vid.tmrS)}, from its thick-barrier coefficients. The exact value settles onto it within a few ångströms; only very thin barriers differ, through multiple reflections.`}`);
    legend('pb-legend', [[BRAND, '', 'exact, head on'], ...(S.V ? [] : [[GREY, 'swatch--dash', 'video, thick barrier']])]);
    const ratio = Tin(0) > 0 && open[1] && Tin(1) > 0 ? Tin(0) / Tin(1) : NaN;
    setHTML($('info'), !open[1] ? '<b>A half metal:</b> only majority electrons exist at the Fermi energy, so in the antiparallel state, when the free layer has no majority states for them in that direction, nothing tunnels head on.'
      : `<b>${S.inj ? 'Minority' : 'Majority'} electron, θ = ${S.th}°.</b> In the barrier the wave falls as e<sup>−κx</sup>, ${fixed(2 * kap * p.d / Math.LN10, 1)} decades in |ψ|² over ${fixed(p.d, 1)} Å. Head on, a majority electron gets through ${isFinite(ratio) ? `${fixed(ratio, ratio < 10 ? 2 : 1)} times` : ''} as often as a minority one at this angle. ${S.th === 0 ? 'In the parallel state each spin stays in its own channel.' : S.th === 180 ? 'Antiparallel, each spin arrives as the other kind in the free layer.' : 'At this angle each spin comes out as a mixture of the free layer\'s majority and minority spin.'}`);
    setHTML($('takeaway'), '<b>The barrier is spin-blind, the interfaces are not.</b> Both spins decay at the same rate inside the insulator; the difference comes from matching the wave to leads where majority and minority electrons move at different speeds. That matching is what the video\'s coefficients C<sub>↑</sub> and C<sub>↓</sub> express.');
  }

  // ---------- 2. Every electron: the Landauer sum ----------
  function renderSum() {
    const p = par(), vid = M.video(p), r = M.conductance(p, [[0, 0], [PI, 0]]);
    const GP = r[0].G, GAP = r[1].G, tmr = tmrOf(GP, GAP);
    const kap = Math.sqrt(p.phiB / M.C), kw = Math.sqrt(kap / p.d);
    stats([
      ['Resistance × area, parallel', `${sci(1 / GP)} Ω µm²`, `from G_P = ${sci(GP)} S/µm²`],
      ['Resistance × area, antiparallel', GAP > 0 ? `${sci(1 / GAP)} Ω µm²` : '∞', `G_{AP} = ${sci(GAP)} S/µm²`],
      ['TMR, exact', pctTxt(tmr), '(R_{AP} − R_P)/R_P, all k_∥'],
      ['TMR, the video\'s formulas', pctTxt(vid.tmrS), `k_∥ = 0, thick barrier; Julliere ${pctTxt(vid.tmrJ)}`],
    ]);
    drawSphere(null);
    $('prof-box').hidden = true; $('side-svg').hidden = false;
    $('side-svg').innerHTML = V.fermi({ ku: vid.ku, kd: vid.kd, kw });
    setHTML($('dg-title'), 'Which electrons tunnel');
    put('dg-cap', `Right: a cut through the Fermi spheres. Each point is an electron at the Fermi energy with wavevector (k_x, k_∥). Only those in the green band, close to normal incidence, tunnel noticeably: their transmission is at least 1/e of the head-on one. Thick arcs: the electrons that carry the current.`);
    legend('dg-legend', [[MAJ, '', 'majority Fermi sphere'], [MIN, '', 'minority Fermi sphere'], [GREEN, 'swatch--area', 'tunnelling window']]);
    // plot A: where in k∥ the conductance comes from
    reset(plotA);
    const kmax = vid.ku, ks = range(0, kmax * 0.999, 140);
    const dd = ks.map(k => { const x = M.atEx(p.EF - M.C * k * k, Object.assign({}, p, { V: 0 }), [[0, 0], [PI, 0], [thr(), phr()]]); return x.map(y => (y.T[0][0] + y.T[0][1] + y.T[1][0] + y.T[1][1]) * k); });
    const mx = Math.max(...dd.map(v => v[0]));
    plotA.opts.xLabel = 'Transverse wavevector k∥ (Å⁻¹)'; plotA.opts.yLabel = 'Share of the conductance';
    plotA.setRange([0, kmax], [0, 1.08]);
    const LA = [{ type: 'vband', x0: 0, x1: Math.min(kw, kmax), color: 'rgba(46, 139, 87, 0.10)' }];
    if (vid.kd > 0) LA.push({ type: 'vline', x: vid.kd, color: MIN, width: 1.2, dash: [4, 3], label: 'k↓' });
    LA.push({ type: 'line', x: ks, y: dd.map(v => v[1] / mx), color: MIN, width: 2.4 }, { type: 'line', x: ks, y: dd.map(v => v[0] / mx), color: MAJ, width: 2.6 });
    if (S.th % 180) LA.push({ type: 'line', x: ks, y: dd.map(v => v[2] / mx), color: BRAND, width: 2 });
    plotA.draw(LA);
    setHTML($('pa-title'), 'The conductance comes from a narrow cone');
    put('pa-cap', `dG/dk_∥ ∝ k_∥ T(k_∥): parallel (red) and antiparallel (blue)${S.th % 180 ? `, θ = ${S.th}° (blue-purple)` : ''}, scaled to the parallel peak. The k_∥ factor counts the ring of states; T falls as κ grows with k_∥. Past k_↓ there are no minority states, so the antiparallel channel shuts.`);
    legend('pa-legend', [[MAJ, '', 'parallel'], [MIN, '', 'antiparallel'], ...(S.th % 180 ? [[BRAND, '', `θ = ${S.th}°`]] : []), [GREEN, 'swatch--area', '|k_∥| < √(κ/d)']]);
    // plot B: TMR against thickness or barrier height
    reset(plotB);
    $('pb-switch').hidden = false;
    const byD = S.pb === 'd', xs = byD ? range(3, 25, 22) : range(0.3, 5, 23);
    const key = ['sum', byD, p.EF, p.D, byD ? p.phiB : p.d].join();
    const ex = slow(key, () => xs.map(x => { const q = byD ? Object.assign({}, p, { d: x }) : Object.assign({}, p, { phiB: x }); const c = M.conductance(q, [[0, 0], [PI, 0]]); return 100 * tmrOf(c[0].G, c[1].G); }));
    const vs = xs.map(x => 100 * M.video(byD ? Object.assign({}, p, { d: x }) : Object.assign({}, p, { phiB: x })).tmrS);
    const yJ = 100 * vid.tmrJ;
    const cap = v => (isFinite(v) ? v : NaN);
    const top = Math.min(1000, Math.max(10, yJ * 1.15, ...(ex || []).filter(isFinite).map(v => v * 1.1), ...vs.filter(isFinite).map(v => v * 1.1)));
    plotB.opts.xLabel = byD ? 'Barrier thickness d (Å)' : 'Barrier height U − EF (eV)'; plotB.opts.yLabel = 'TMR (%)';
    plotB.setRange([xs[0], xs[xs.length - 1]], [0, top]);
    const LB = [{ type: 'vline', x: byD ? p.d : p.phiB, color: INK, width: 1, dash: [3, 3] }];
    if (isFinite(yJ)) LB.push({ type: 'hline', y: yJ, color: AMBER, width: 1.6, dash: [6, 4] });
    LB.push({ type: 'line', x: xs, y: vs.map(cap), color: GREY, width: 2, dash: [5, 4] });
    if (ex) LB.push({ type: 'line', x: xs, y: ex.map(v => cap(Math.min(v, top * 2))), color: BRAND, width: 2.6 });
    else LB.push({ type: 'text', x: (xs[0] + xs[xs.length - 1]) / 2, y: top * 0.55, text: 'computing…', color: '#5f7382' });
    LB.push({ type: 'dots', x: [byD ? p.d : p.phiB], y: [Math.min(100 * tmr, top * 0.98)], color: INK, r: 5 });
    plotB.draw(LB);
    setHTML($('pb-title'), byD ? 'Thick barriers approach the video\'s answer' : 'TMR depends on the barrier, not just the magnets');
    put('pb-cap', byD ? 'The exact TMR (blue) against thickness, with the video\'s thick-barrier, head-on formula (grey dashed) and Julliere\'s (orange dashed). Thicker barriers narrow the cone, so the exact result falls toward the head-on value.'
      : 'The exact TMR (blue) against barrier height, with the video\'s formula (grey dashed), which vanishes where κ² = k_↑k_↓, and Julliere\'s (orange dashed), its tall-barrier limit.');
    legend('pb-legend', [[BRAND, '', 'exact (Landauer)'], [GREY, 'swatch--dash', 'video, k_∥ = 0'], [AMBER, 'swatch--dash', 'Julliere']]);
    setHTML($('info'), `<b>${pctTxt(tmr)} exact, against ${pctTxt(vid.tmrS)} from the video's head-on formula and ${pctTxt(vid.tmrJ)} from Julliere's.</b> ${vid.kd > 0 && kw > vid.kd ? `The tunnelling cone (|k<sub>∥</sub>| ≲ ${fixed(kw, 2)} Å⁻¹) is wider than the minority Fermi sphere (k<sub>↓</sub> = ${fixed(vid.kd, 2)} Å⁻¹): electrons beyond k<sub>↓</sub> have no minority states to tunnel into, which shuts the antiparallel channel for them and raises the TMR.` : vid.kd > 0 ? `The tunnelling cone (|k<sub>∥</sub>| ≲ ${fixed(kw, 2)} Å⁻¹) sits inside the minority Fermi sphere, so the result stays closer to the head-on formula.` : 'A half metal: with no minority electrons at all, the antiparallel junction does not conduct.'}${Math.abs(vid.Ps) < 0.03 && vid.kd > 0 ? ' Here κ² is close to k<sub>↑</sub>k<sub>↓</sub>, where the video\'s polarization P changes sign and its TMR vanishes; the electrons off normal incidence still give a TMR.' : ''}`);
    setHTML($('takeaway'), '<b>Tunnelling is a filter in k-space.</b> The barrier passes only a narrow cone of directions, so the TMR depends on how the two spins\' Fermi surfaces look inside that cone. This is why real MgO junctions, whose barrier also filters by the symmetry of the wavefunction, reach several hundred per cent, far beyond what Julliere\'s count of states allows.');
  }

  // ---------- 3. Turning the free layer ----------
  const ANG = range(0, 180, 36);
  function renderAngle() {
    const p = par(), vid = M.video(p);
    const r = M.conductance(p, ANG.map(t => [t * DEG, 0]).concat([[thr(), phr()]]));
    const cur = r[r.length - 1], GP = r[0].G, GAP = r[ANG.length - 1].G, G = cur.G;
    // the spin current of the electrons tunnelling from the fixed layer, per electron (units of ħ/2): its part along m2
    // stays with the free layer's electrons; its part across m2, in the plane of m1 and m2, is absorbed: the spin torque
    const pv = cur.jp > 0 ? cur.js.map(v => v / cur.jp) : [0, 0, 0];
    const n2 = m2(), e = inPlane(), along = pv[0] * n2[0] + pv[1] * n2[1] + pv[2] * n2[2], torque = pv[0] * e[0] + pv[1] * e[1] + pv[2] * e[2];
    const tmrTh = GP > 0 && G > 0 ? GP / G - 1 : NaN;
    stats([
      ['Conductance G(θ)/G_P', fixed(G / GP, 3), `cos law: ${fixed(Math.cos(thr() / 2) ** 2 + Math.sin(thr() / 2) ** 2 * GAP / GP, 3)}`],
      ['Resistance × area', G > 0 ? `${sci(1 / G)} Ω µm²` : '∞', `at θ = ${S.th}°`],
      ['Resistance above parallel', pctTxt(tmrTh), '(R(θ) − R_P)/R_P'],
      ['Spin torque per electron', fixed(torque, 2), `ħ/2 across m_2, toward m_1; spin polarization along m_2: ${fixed(along, 2)}`],
    ]);
    drawSphere(torque);
    $('prof-box').hidden = true; $('side-svg').hidden = false;
    $('side-svg').innerHTML = V.channels({ ch: cur.ch, th: S.th });
    setHTML($('dg-title'), 'Four spin channels, and the spin they carry');
    put('dg-cap', 'Left: m_1 and m_2. The berry arrow at the tip of m_2 is the spin, per tunnelling electron, that the current carries across m_2 in the plane of the two magnetizations, in units of ħ/2: the free layer absorbs it, so it is a torque on m_2 (the spin-transfer torque), pulling it toward m_1 for electrons flowing from the fixed layer. Right: how the conductance splits between the four spin channels.');
    legend('dg-legend', [[INK, '', 'm_1 (fixed)'], [BRAND, '', 'm_2 (free)'], [BERRY, '', 'spin torque on m_2']]);
    // plot A: G(θ)
    reset(plotA);
    const Gs = r.slice(0, ANG.length).map(x => x.G / GP);
    const Ps2 = vid.Ps * vid.Ps, law = ANG.map(t => (1 + Ps2 * Math.cos(t * DEG)) / (1 + Ps2));
    plotA.opts.xLabel = 'Free layer angle θ (degrees)'; plotA.opts.yLabel = 'Conductance G(θ)/G_P'; plotA.opts.xTickValues = [0, 30, 60, 90, 120, 150, 180];
    const lo = Math.min(...Gs, ...law);
    plotA.setRange([0, 180], [Math.max(0, lo - 0.08), 1.04]);
    plotA.draw([
      { type: 'line', x: ANG, y: law, color: GREY, width: 1.8, dash: [6, 4] },
      { type: 'line', x: ANG, y: Gs, color: BRAND, width: 2.8 },
      { type: 'vline', x: S.th, color: INK, width: 1, dash: [3, 3] },
      { type: 'dots', x: [S.th], y: [G / GP], color: INK, r: 5 },
    ]);
    setHTML($('pa-title'), 'Conductance against the free layer\'s angle');
    put('pa-cap', `The exact conductance (blue), with all k_∥, against θ, and the video's cos θ law with its head-on polarization P² = ${fixed(Ps2, 3)} (grey dashed). The exact curve is a cos θ law too, to about one part in a million, but with its own amplitude.`);
    legend('pa-legend', [[BRAND, '', 'exact'], [GREY, 'swatch--dash', 'video: 1 + P²cos θ'], [INK, 'swatch--stem', 'this angle']]);
    // plot B: the four channels
    reset(plotB);
    $('pb-switch').hidden = true;
    const chs = [[0, 0, MAJ, '', 'majority → majority'], [1, 0, MAJ, 'swatch--dash', 'majority → minority'], [1, 1, MIN, '', 'minority → minority'], [0, 1, MIN, 'swatch--dash', 'minority → majority']];
    plotB.opts.xLabel = 'Free layer angle θ (degrees)'; plotB.opts.yLabel = 'Channel conductance / G_P'; plotB.opts.xTickValues = [0, 30, 60, 90, 120, 150, 180];
    plotB.setRange([0, 180], [0, 1.04]);
    const LB = chs.map(([o, s, c, k]) => ({ type: 'line', x: ANG, y: r.slice(0, ANG.length).map(x => x.ch[o][s] / GP), color: c, width: 2.2, dash: k ? [6, 4] : [] }));
    LB.push({ type: 'vline', x: S.th, color: INK, width: 1, dash: [3, 3] });
    plotB.draw(LB);
    setHTML($('pb-title'), 'Where the current goes');
    put('pb-cap', 'Each spin channel\'s conductance against θ, from the fixed layer\'s majority or minority electrons into the free layer\'s majority or minority states. Majority → majority falls as cos²(θ/2) while majority → minority rises as sin²(θ/2).');
    legend('pb-legend', chs.map(([, , c, k, l]) => [c, k, l]));
    const cosdev = Math.abs(r[18].G / ((GP + GAP) / 2) - 1);
    setHTML($('info'), `<b>θ = ${S.th}°: G = ${fixed(G / GP, 3)} G<sub>P</sub>.</b> ${S.th === 90 ? `Half way between parallel and antiparallel, to ${cosdev < 1e-6 ? 'better than one part in a million' : `within ${sci(cosdev, 1)}`}: the cos θ law. ` : ''}Turning φ changes nothing in the conductance, which depends only on the angle between m<sub>1</sub> and m<sub>2</sub>, but it turns the torque with m<sub>2</sub>, which always lies in the plane of the two magnetizations. ${S.th % 180 ? `Each electron that crosses delivers ${fixed(torque, 2)} × ħ/2 of spin across m<sub>2</sub>, pulling it toward m<sub>1</sub>; reverse the current and it pushes m<sub>2</sub> away, which is how a current writes both 0 and 1.` : 'Collinear, the spin arrives along m<sub>2</sub>, there is nothing to absorb, and there is no torque.'}`);
    setHTML($('takeaway'), '<b>Reading and writing a bit are two sides of one current.</b> The resistance tells the free layer\'s direction (that is how an MRAM bit is read); the spin the current carries across the free layer\'s magnetization is a torque on it, which, with enough current, switches it (that is how the bit is written). The spin-transfer-torque video picks up from here.');
  }

  // ---------- 4. Bias ----------
  function renderBias() {
    const p = par(), Vs = range(0, 1.5, 30).slice(1), ang = [[0, 0], [PI, 0], [thr(), 0]];
    const key = ['iv', p.EF, p.D, p.phiB, p.d, S.th].join();
    const iv = slow(key, () => Vs.map(v => M.current(p, v, ang)));
    const g0 = M.conductance(p, [[0, 0], [PI, 0]]), tmr0 = tmrOf(g0[0].G, g0[1].G);
    const Jn = S.V > 0 ? M.current(p, S.V, ang) : [0, 0, 0];
    const tmrV = S.V > 0 ? tmrOf(Jn[0], Jn[1]) : tmr0;
    let vhalf = NaN;
    if (iv && isFinite(tmr0)) { const t = iv.map(j => tmrOf(j[0], j[1])); for (let i = 0; i < t.length; i++) if (t[i] <= tmr0 / 2) { const t0 = i ? t[i - 1] : tmr0, v0 = i ? Vs[i - 1] : 0; vhalf = v0 + (Vs[i] - v0) * (t0 - tmr0 / 2) / (t0 - t[i]); break; } }
    const Acm = j => j * 1e8;        // A/µm² → A/cm²
    stats([
      ['Current density, parallel', S.V > 0 ? `${sci(Acm(Jn[0]))} A/cm²` : '0', `at V = ${fixed(S.V, 2)} V`],
      ['Current density, antiparallel', S.V > 0 ? `${sci(Acm(Jn[1]))} A/cm²` : '0', `at V = ${fixed(S.V, 2)} V`],
      ['TMR at this bias', pctTxt(tmrV), `${pctTxt(tmr0)} at zero bias`],
      ['TMR halves at', isFinite(vhalf) ? `${fixed(vhalf, 2)} V` : iv ? '> 1.5 V' : '…', 'V_{1/2}, a common figure of merit'],
    ]);
    drawSphere(null);
    $('prof-box').hidden = false; $('side-svg').hidden = true;
    drawProfile(false);
    setHTML($('dg-title'), 'The junction under bias');
    put('dg-cap', 'Right: the bias tilts the barrier and lowers the free layer\'s bands by eV. Electrons tunnel from the fixed layer\'s states between E_F − eV and E_F into empty states of the free layer.');
    legend('dg-legend', [[INK, '', 'fixed layer m_1'], [BRAND, '', 'free layer m_2'], [MAJ, '', 'majority band bottom'], [MIN, '', 'minority band bottom']]);
    reset(plotA);
    plotA.opts.xLabel = 'Bias V (volts)';
    const LA = [];
    if (iv) {
      const top = Math.max(...iv.map(j => Acm(j[0]))), ex = Math.floor(Math.log10(top)), sc = Math.pow(10, ex);
      plotA.opts.yLabel = `Current density (10${String(ex).split('').map(c => SUP[c]).join('')} A/cm²)`;
      plotA.setRange([0, 1.5], [0, top / sc * 1.05]);
      [[1, MIN, 2.4], [0, MAJ, 2.6]].forEach(([i, c, w]) => LA.push({ type: 'line', x: [0].concat(Vs), y: [0].concat(iv.map(j => Acm(j[i]) / sc)), color: c, width: w }));
      if (S.th % 180) LA.push({ type: 'line', x: [0].concat(Vs), y: [0].concat(iv.map(j => Acm(j[2]) / sc)), color: BRAND, width: 2 });
      LA.push({ type: 'vline', x: S.V, color: INK, width: 1, dash: [3, 3] });
    } else { plotA.opts.yLabel = 'Current density'; plotA.setRange([0, 1.5], [0, 1]); LA.push({ type: 'text', x: 0.75, y: 0.55, text: 'computing…', color: '#5f7382' }); }
    plotA.draw(LA);
    setHTML($('pa-title'), 'Current against bias');
    put('pa-cap', `Current density for the parallel (red) and antiparallel (blue) junction${S.th % 180 ? ` and at θ = ${S.th}° (blue-purple)` : ''}, at zero temperature. It starts linear (Ohmic), then rises faster as the tilted barrier becomes effectively lower.`);
    legend('pa-legend', [[MAJ, '', 'parallel'], [MIN, '', 'antiparallel'], ...(S.th % 180 ? [[BRAND, '', `θ = ${S.th}°`]] : [])]);
    reset(plotB);
    $('pb-switch').hidden = true;
    plotB.opts.xLabel = 'Bias V (volts)'; plotB.opts.yLabel = 'TMR (%)';
    const LB = [];
    if (iv) {
      const t = [100 * tmr0].concat(iv.map(j => 100 * tmrOf(j[0], j[1]))).map(v => (isFinite(v) ? v : NaN));
      const fin = t.filter(Number.isFinite), tl = Math.min(0, ...fin), th = Math.max(...fin, 1);
      plotB.setRange([0, 1.5], [tl - 0.05 * (th - tl), th * 1.08]);
      plotB.opts.zeroLine = true;
      LB.push({ type: 'line', x: [0].concat(Vs), y: t, color: BRAND, width: 2.6 });
      if (isFinite(vhalf)) LB.push({ type: 'vline', x: vhalf, color: AMBER, width: 1.2, dash: [5, 4], label: 'V½' });
      LB.push({ type: 'vline', x: S.V, color: INK, width: 1, dash: [3, 3] }, { type: 'dots', x: [S.V], y: [isFinite(tmrV) ? 100 * tmrV : NaN], color: INK, r: 5 });
    } else { plotB.setRange([0, 1.5], [0, 1]); LB.push({ type: 'text', x: 0.75, y: 0.55, text: 'computing…', color: '#5f7382' }); }
    plotB.draw(LB);
    setHTML($('pb-title'), 'The TMR falls with bias');
    put('pb-cap', '(I_P − I_{AP})/I_{AP} against bias. Electrons that tunnel at a bias land well above the free layer\'s Fermi level, where its majority and minority bands are more alike, so the spin contrast fades.');
    legend('pb-legend', [[BRAND, '', 'TMR'], [AMBER, 'swatch--dash', 'half its zero-bias value']]);
    setHTML($('info'), isFinite(tmr0) ? `<b>${pctTxt(tmrV)} at ${fixed(S.V, 2)} V, against ${pctTxt(tmr0)} at zero bias.</b> ${isFinite(vhalf) ? `It halves by ${fixed(vhalf, 2)} V. ` : ''}Real MgO junctions lose half their TMR at a few hundred millivolts; inelastic processes, such as magnon emission, which this elastic model leaves out, add to the fall.` : '<b>A half metal</b> has no antiparallel current at all at small bias: the TMR is infinite until the bias opens minority states.');
    setHTML($('takeaway'), '<b>Reading a bit is a compromise.</b> A larger read voltage gives more signal current but less contrast between 0 and 1; practical MRAM reads at a few hundred millivolts.');
  }

  // ---------- controls ----------
  function syncControls() {
    const set = (id, v, txt) => { $(id).value = v; $(id + '-out').textContent = txt; $(id).setAttribute('aria-valuetext', txt); };
    set('theta', S.th, `${S.th}°`); set('phi', S.ph, `${S.ph}°`);
    set('phib', S.phiB, `${fixed(S.phiB, 2)} eV`); set('thick', S.d, `${fixed(S.d, 1)} Å`); set('bias', S.V, `${fixed(S.V, 2)} V`);
    set('ef', S.EF, `${fixed(S.EF, 2)} eV`); set('delta', S.D, `${fixed(S.D, 2)} eV`);
    const k = M.kF(S.EF, S.D), PJ = k.ku + k.kd > 0 ? (k.ku - k.kd) / (k.ku + k.kd) : 0;
    setHTML($('delta-hint'), S.D >= S.EF ? 'Δ ≥ E<sub>F</sub>: no minority electrons at the Fermi energy (a half metal).' : `k<sub>↑</sub> = ${fixed(k.ku, 2)}, k<sub>↓</sub> = ${fixed(k.kd, 2)} Å⁻¹; Julliere's P = ${fixed(PJ, 2)}.`);
    setHTML($('bias-hint'), S.V ? `The free layer's bands sit ${fixed(S.V, 2)} eV lower.` : 'Zero: the linear-response conductance.');
    document.querySelectorAll('[data-th]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.th === S.th)));
    document.querySelectorAll('[data-inj]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.inj === S.inj)));
    document.querySelectorAll('[data-pb]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pb === S.pb)));
    document.querySelectorAll('[data-mat]').forEach(b => { const m = MAT[b.dataset.mat]; b.setAttribute('aria-pressed', String(Math.abs(m.EF - S.EF) < 1e-9 && Math.abs(m.D - S.D) < 1e-9)); });
  }
  function render() {
    syncControls();
    if (mode === 'wave') renderWave(); else if (mode === 'sum') renderSum(); else if (mode === 'angle') renderAngle(); else renderBias();
    $('plot-a').setAttribute('aria-label', $('pa-title').textContent); $('plot-b').setAttribute('aria-label', $('pb-title').textContent);
    if (mode !== 'sum') $('pb-switch').hidden = true;
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
  [['theta', 'th'], ['phi', 'ph'], ['phib', 'phiB'], ['thick', 'd'], ['bias', 'V'], ['ef', 'EF'], ['delta', 'D']].forEach(([id, key]) => $(id).addEventListener('input', e => { S[key] = +e.target.value; later(); }));
  document.querySelector('.lab-main').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !b.closest('.controls, #pb-switch')) return;
    const d = b.dataset;
    if (d.th !== undefined && d.th !== '') S.th = +d.th;
    else if (d.inj !== undefined && d.inj !== '') S.inj = +d.inj;
    else if (d.mat) Object.assign(S, MAT[d.mat]);
    else if (d.pb) S.pb = d.pb;
    else if (b.id === 'video-values') Object.assign(S, START);
    else return;
    render();
  });
  $('reset-view').addEventListener('click', () => sphere.setView(28 * DEG, 16 * DEG));
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
  const QUESTIONS = {
    q1: () => { mode = 'wave'; Object.assign(S, START, { inj: 0 }); },
    q2: () => { mode = 'wave'; Object.assign(S, START, { d: 10 }); },
    q3: () => { mode = 'sum'; Object.assign(S, START); },
    q4: () => { mode = 'sum'; Object.assign(S, START, { d: 20 }); },
    q5: () => { mode = 'sum'; Object.assign(S, START, MAT.strong, { phiB: 2, pb: 'u' }); },
    q6: () => { mode = 'angle'; Object.assign(S, START, { th: 90 }); },
    q7: () => { mode = 'angle'; Object.assign(S, START, MAT.half, { th: 90 }); },
    q8: () => { mode = 'bias'; Object.assign(S, START, { V: 0.5 }); },
  };
  document.querySelectorAll('.predict__load[data-q]').forEach(b => b.addEventListener('click', () => {
    QUESTIONS[b.dataset.q]();
    applyMode();
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }));

  applyMode();
  window.__tmr = { S, render, cache };
})();
