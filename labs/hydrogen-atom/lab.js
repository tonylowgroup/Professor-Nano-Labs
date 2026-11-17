/* Hydrogen atom lab: controls, the 3D orbital, slices, radial plots and the spectrum.
   Physics in physics.js, the 3D view in viewer.js, the level diagram in levels.js. */
(function () {
  'use strict';
  const H = window.Hyd, Lv = window.Levels;
  const $ = id => document.getElementById(id);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const S = { n: 3, l: 2, m: 0, real: true, view: 'surface', q: 90, cut: false, plane: 'xz', show: 'dens', radial: 'P', ni: 3, nf: 2 };
  let mode = 'orb';
  const LCOL = ['#1f77b4', '#d95f02', '#2e8b57', '#7b3294', '#c4473a'];      // s p d f g
  const POS = '#e8553f', NEG = '#c9d3de';

  // ---------- formatting ----------
  const fixed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const sgn = m => (m < 0 ? '−' + -m : m > 0 ? '+' + m : '0');
  function nameHTML(n, l, m, real) {
    const [main, sb] = H.name(n, l, m, real);
    if (!sb) return main;
    return real ? `${main}<sub>${sb}</sub>` : `${main} (m = ${sgn(m)})`;
  }
  const list = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  const aLen = r => `${fixed(r, r < 10 ? 2 : 1)} a`;

  // ---------- shared helpers ----------
  const rich = t => String(t).replace(/_\{([^}]*)\}|_([A-Za-z0-9])/g, (mm, a, b) => `<sub>${a || b}</sub>`);
  function stats(items) {
    $('stats').innerHTML = items.map(([label, value, sub2]) =>
      `<div class="stat"><div class="stat__label">${rich(label)}</div><div class="stat__value">${value}</div><div class="stat__sub">${rich(sub2)}</div></div>`).join('');
  }
  function legend(id, items) {
    $(id).innerHTML = items.map(([color, kind, label]) => `<li style="color:${color}"><span class="swatch ${kind}"></span><span>${rich(label)}</span></li>`).join('');
  }
  function typeset(el) { if (window.MathJax && MathJax.typesetPromise && /\\\(/.test(el.innerHTML)) MathJax.typesetPromise([el]).catch(() => {}); }
  function setHTML(el, html) { if (el.dataset.html === html) return; el.dataset.html = html; el.innerHTML = html; typeset(el); }
  const put = (id, t) => setHTML($(id), rich(t));
  const MARGIN = { l: 58, r: 18, t: 12, b: 42 };
  const plotA = new NanoPlot($('plot-a'), { margin: MARGIN, narrowMargin: { l: 54 } });
  const plotB = new NanoPlot($('plot-b'), { margin: MARGIN, narrowMargin: { l: 54 } });
  const range = (a, b, k) => Array.from({ length: k + 1 }, (_, i) => a + (b - a) * i / k);
  const narrow = el => el.clientWidth < 560;

  const view = new OrbitalView($('orb-gl'), $('orb-ov'));
  view.reduce = reduceMotion;
  if (reduceMotion) view.spin = false;
  view.onUserRotate = () => { if (mode !== 'spec') { view.spin = false; $('spin').setAttribute('aria-pressed', 'false'); } };

  // ---------- nodes, in words ----------
  function angularNodes(l, m, real) {
    const k = Math.abs(m), out = [];
    // zeros of P_l^|m|(cos theta): cones (the xy plane when theta = 90 degrees)
    const xs = [], f = x => H.legendre(l, k, x);
    let x0 = -1 + 1e-9, f0 = f(x0);
    for (let i = 1; i <= 2000; i++) {
      const x1 = -1 + 1e-9 + (2 - 2e-9) * i / 2000, f1 = f(x1);
      if (f0 * f1 < 0) { let a = x0, b = x1; for (let it = 0; it < 60; it++) { const c = (a + b) / 2; if (f(a) * f(c) <= 0) b = c; else a = c; } xs.push((a + b) / 2); }
      x0 = x1; f0 = f1;
    }
    const thetas = xs.map(x => Math.acos(x) * 180 / Math.PI).sort((a, b) => a - b);
    const flat = thetas.filter(t => Math.abs(t - 90) < 1e-6), cones = thetas.filter(t => Math.abs(t - 90) >= 1e-6);
    if (flat.length) out.push('the xy plane');
    if (cones.length) out.push(`${cones.length === 1 ? 'a cone' : 'cones'} at θ = ${cones.map(t => t.toFixed(1) + '°').join(' and ')}`);
    if (!real && k) out.push('the z axis, a nodal line rather than a surface');
    if (real && k) {      // |m| vertical planes through the z axis
      const phis = [];
      for (let j = 0; j < k; j++) phis.push(((m > 0 ? (2 * j + 1) * 90 / k : j * 180 / k) % 180 + 180) % 180);
      const named = phis.sort((a, b) => a - b).map(p => (Math.abs(p) < 1e-6 ? 'the xz plane' : Math.abs(p - 90) < 1e-6 ? 'the yz plane' : Math.abs(p - 45) < 1e-6 ? 'the plane x = y' : Math.abs(p - 135) < 1e-6 ? 'the plane x = −y' : `a plane through z at φ = ${fixed(p, 0)}°`));
      out.push(...named);
    }
    return out;
  }

  // ---------- 1. Orbitals in 3D ----------
  function sliceImage(B) {
    const N = 240, cv = document.createElement('canvas');
    cv.width = N; cv.height = N;
    const g = cv.getContext('2d'), img = g.createImageData(N, N), val = new Float64Array(N * N), ph = new Float64Array(N * N);
    let max = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = -B + 2 * B * (i + 0.5) / N, v = B - 2 * B * (j + 0.5) / N;
      const [x, y, z] = S.plane === 'xz' ? [u, 0, v] : [u, v, 0];
      const w = H.psi(S.n, S.l, S.m, x, y, z, S.real), k = i + N * j;
      if (S.real) { val[k] = w; ph[k] = w >= 0 ? 0 : Math.PI; } else { val[k] = Math.hypot(w[0], w[1]); ph[k] = Math.atan2(w[1], w[0]); }
      max = Math.max(max, Math.abs(val[k]));
    }
    const INF = [[0, 0, 4], [66, 10, 104], [147, 38, 103], [221, 81, 58], [252, 165, 10], [252, 255, 164]];
    const inferno = t => { const s = Math.min(0.9999, Math.max(0, t)) * (INF.length - 1), i = Math.floor(s), f = s - i; return INF[i].map((c, q) => c + f * (INF[i + 1][q] - c)); };
    const pos = [232, 85, 64], neg = [205, 216, 228];
    for (let k = 0; k < N * N; k++) {
      const a = max > 0 ? Math.abs(val[k]) / max : 0;
      let c;
      if (S.show === 'dens') c = inferno(Math.pow(a * a, 0.4));
      else if (S.real) { const t = Math.pow(a, 0.8); c = (ph[k] === 0 ? pos : neg).map(q => q * t); }
      else { const t = Math.pow(a, 0.8), hc = OrbitalView._internals.hue(ph[k]); c = hc.map(q => 255 * q * t); }
      img.data[4 * k] = c[0]; img.data[4 * k + 1] = c[1]; img.data[4 * k + 2] = c[2]; img.data[4 * k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return cv;
  }
  function squareRange(plot, B) {
    const aw = plot.w - plot.m.l - plot.m.r, ah = plot.h - plot.m.t - plot.m.b;
    return aw > ah ? [[-B * aw / ah, B * aw / ah], [-B, B]] : [[-B, B], [-B * ah / aw, B * ah / aw]];
  }
  function renderOrb() {
    const { n, l, m, real } = S, name = nameHTML(n, l, m, real), E = H.energy(n), nodes = H.nodes(n, l), ang = angularNodes(l, m, real);
    view.set({ n, l, m, real }, { mode: S.view, q: S.q / 100, cutaway: S.cut });
    $('orb-note').hidden = view.webgl;
    if (!view.webgl) $('orb-note').textContent = 'Your browser cannot draw 3D surfaces here (WebGL is off), so the cloud of positions is shown instead.';
    stats([
      ['Orbital', name, `n = ${n}, l = ${l}, m = ${sgn(m)}`],
      ['Energy', `${fixed(E, 2)} eV`, n === 1 ? 'the only orbital with n = 1' : `the same for all ${n * n} orbitals with n = ${n}`],
      real || !m ? ['Nodes', `${n - 1}`, `${n - l - 1} radial (spheres) + ${l} angular`]
        : ['Nodal surfaces', `${n - 1 - Math.abs(m)}`, `${n - l - 1} radial + ${l - Math.abs(m)} angular, plus the z axis`],
      ['Average distance', `${fixed(H.meanR(n, l), 1)} a`, `= ${fixed(H.meanR(n, l) * H.A0 * 10, 2)} Å from the nucleus`],
    ]);
    setHTML($('dg-title'), `The ${name} orbital`);
    put('dg-cap', S.view === 'surface'
      ? `The surface encloses ${S.q}% of the probability of finding the electron. Drag to turn it${S.cut ? '; a quarter is cut away to show what is inside' : ''}.`
      : `Each dot is one place the electron could be found: ${(20000).toLocaleString('en-US')} positions drawn at random from |ψ|². Drag to turn it.`);
    $('orb-legend').innerHTML = real
      ? `<li><span class="dot" style="background:${POS}"></span>ψ &gt; 0</li><li><span class="dot" style="background:${NEG}"></span>ψ &lt; 0</li>`
      : `<li><span class="wheel"></span>phase of ψ, 0 → 2π</li>`;
    const radTxt = nodes.length ? `${nodes.length === 1 ? 'a sphere' : 'spheres'} at r = ${list(nodes.map(aLen))}` : 'none';
    setHTML($('info'), `<b>Nodes of ${name}:</b> radial, ${radTxt}; angular, ${ang.length ? list(ang) : 'none'}.${!real && m ? ' |ψ|² does not depend on φ, so it is the same doughnut for +m and −m; only the phase winds around z.' : ''}`);
    // plot A: a slice through the atom
    const B = 1.08 * H.radiusFor(n, l, 0.99), [xr, yr] = squareRange(plotA, B);
    plotA.opts.xTickValues = null; plotA.opts.xFormat = null;
    plotA.opts.xLabel = 'x / a'; plotA.opts.yLabel = S.plane === 'xz' ? 'z / a' : 'y / a'; plotA.opts.xTicks = 5; plotA.opts.yFormat = null; plotA.opts.zeroLine = false;
    plotA.setRange(xr, yr);
    const LA = [{ type: 'vband', x0: xr[0], x1: xr[1], color: '#000004' }, { type: 'image', canvas: sliceImage(B), x0: -B, x1: B, y0: -B, y1: B, smooth: true }];
    const th = range(0, 2 * Math.PI, 120);
    nodes.forEach(r => LA.push({ type: 'line', x: th.map(t => r * Math.cos(t)), y: th.map(t => r * Math.sin(t)), color: 'rgba(255, 255, 255, 0.55)', width: 1.2, dash: [4, 4] }));
    plotA.draw(LA);
    setHTML($('pa-title'), `A slice through ${name}`);
    put('pa-cap', `${S.show === 'dens' ? '|ψ|²' : real ? 'ψ: red where positive, pale where negative' : 'ψ, coloured by its phase'} on the ${S.plane} plane (${S.plane === 'xz' ? 'y' : 'z'} = 0), in the style of the video's pictures. Brightness rises as (|ψ|²)<sup>0.4</sup> to show the faint outer parts.${nodes.length ? ' Dashed: the radial nodes.' : ''}`);
    legend('pa-legend', []);
    // plot B: radial probability
    const rmax = H.radiusFor(n, l, 0.995), rs = range(0, rmax, 400), P = rs.map(r => H.P(n, l, r)), pk = H.peakR(n, l), mr = H.meanR(n, l), brand = css('--series-1');
    const pmax = Math.max(...P);
    plotB.opts.xLabel = 'Distance from the nucleus r / a'; plotB.opts.yLabel = 'P(r) (per a)'; plotB.opts.xTicks = 6; plotB.opts.yFormat = null; plotB.opts.zeroLine = false;
    plotB.setRange([0, rmax], [0, pmax * 1.15]);
    const LB = [{ type: 'line', x: rs, y: P, color: brand, width: 2.6, fill: NanoPlot.alpha(brand, 0.16) }];
    nodes.forEach((r, i) => LB.push({ type: 'vline', x: r, color: css('--plot-text'), width: 1.2, dash: [4, 4], label: i === 0 ? 'node' : '' }));
    LB.push({ type: 'vline', x: mr, color: css('--series-amber'), width: 1.5, dash: [6, 4], label: '⟨r⟩' });
    LB.push({ type: 'dots', x: [pk], y: [H.P(n, l, pk)], color: '#14232c', r: 5 });
    plotB.draw(LB);
    setHTML($('pb-title'), 'How far from the nucleus?');
    put('pb-cap', `P(r) = r²R²: the chance of finding the electron at distance r, in any direction. Most likely at r = ${aLen(pk)} (dot); on average ${aLen(mr)}.`);
    legend('pb-legend', [[brand, 'swatch--area', `P(r) for ${H.name(n, l, m, real)[0]}`], [css('--series-amber'), 'swatch--dash', '⟨r⟩']]);
    setHTML($('takeaway'), n === 1 ? '<b>The ground state has no nodes at all.</b> Pick n = 2 or 3 to see nodes appear: each step up in n adds one, as a sphere if l stays the same, or as a plane or cone if l grows.'
      : '<b>Same n, same energy:</b> every orbital in a shell has the same energy, whatever its shape. Shape and orientation (l and m) only matter once something breaks the symmetry, such as a magnetic field or a neighbouring atom.');
  }

  // ---------- 2. The radial equation ----------
  function renderRad() {
    const { n, l } = S, E = H.energy(n), nodes = H.nodes(n, l), [r1, r2] = H.turning(n, l), pk = H.peakR(n, l), forb = H.forbidden(n, l);
    view.set({ n, l, m: 0, real: true }, { mode: 'surface', q: 0.9, cutaway: true });
    $('orb-note').hidden = view.webgl;
    stats([
      ['Energy', `${fixed(E, 3)} eV`, `E_n = −13.6 eV / ${n * n}`],
      ['Radial nodes', nodes.length ? `${nodes.length} sphere${nodes.length > 1 ? 's' : ''}` : 'none', nodes.length ? `at r = ${list(nodes.map(aLen))}` : `n − l − 1 = 0`],
      ['Most likely distance', aLen(pk), `the peak of P(r); ⟨r⟩ = ${aLen(H.meanR(n, l))}`],
      ['Outside the classical region', `${fixed(100 * forb, 1)}%`, `of the time, beyond the turning point${l ? 's' : ''}`],
    ]);
    setHTML($('dg-title'), `${nameHTML(n, l, 0, true)}, cut open`);
    put('dg-cap', 'The same orbital in 3D with a quarter removed: each radial node is a sphere where ψ changes sign.');
    $('orb-legend').innerHTML = `<li><span class="dot" style="background:${POS}"></span>ψ &gt; 0</li><li><span class="dot" style="background:${NEG}"></span>ψ &lt; 0</li>`;
    setHTML($('info'), l === 0
      ? `<b>No centrifugal barrier for s states:</b> the electron can reach the nucleus. Classically it could never go beyond r = ${aLen(r2)}, where V(r) = E; quantum mechanically it does, ${fixed(100 * forb, 1)}% of the time.`
      : `<b>The centrifugal barrier</b> ħ²l(l+1)/2m<sub>e</sub>r² keeps this electron away from the nucleus: classically it would stay between r = ${aLen(r1)} and ${aLen(r2)}. Quantum mechanically it spends ${fixed(100 * forb, 1)}% of its time outside that range.`);
    // plot A: effective potential, levels and u(r)
    const brand = css('--series-1'), top = Math.max(12, 1.45 * r2), rs = range(0.02, top, 600);
    const Emin = l === 0 ? H.energy(1) * 1.18 : Math.min(H.energy(l + 1), H.veff(l, l * (l + 1))) * 1.25;
    const Emax = Math.abs(H.energy(l + 1)) * 0.55;
    const clip = v => Math.max(Emin - 1, Math.min(Emax + 1, v));
    const LA = [
      { type: 'line', x: rs, y: rs.map(r => clip(-2 * H.RY / r)), color: css('--plot-text'), width: 1.3, dash: [6, 4] },
    ];
    if (l) LA.push({ type: 'line', x: rs, y: rs.map(r => clip(H.RY * l * (l + 1) / (r * r))), color: css('--plot-text'), width: 1.3, dash: [2, 3] });
    LA.push({ type: 'line', x: rs, y: rs.map(r => clip(H.veff(l, r))), color: '#14232c', width: 2.4 });
    for (let k = l + 1; k <= 7; k++) {
      const [a, b] = H.turning(k, l), Ek = H.energy(k), on = k === n;
      if (Ek < Emin || Ek > Emax) continue;
      LA.push({ type: 'line', x: [a, Math.min(b, top)], y: [Ek, Ek], color: on ? brand : '#9fb1ba', width: on ? 2 : 1.2 });
      if (on) {
        const us = rs.map(r => H.u(n, l, r)), umax = Math.max(...us.map(Math.abs));
        const room = 0.42 * Math.min(Math.abs(Ek) * 0.9, k > l + 1 ? Math.abs(Ek - H.energy(k - 1)) : Infinity, Math.abs(H.energy(k + 1) - Ek));
        LA.push({ type: 'line', x: rs, y: us.map(u => Ek + room * u / umax), color: brand, width: 2.4 });
        LA.push({ type: 'dots', x: l ? [a, b] : [b], y: l ? [Ek, Ek] : [Ek], color: '#d9495f', r: 4.5 });
      }
    }
    plotA.opts.xTickValues = null; plotA.opts.xFormat = null;
    plotA.opts.xLabel = 'r / a'; plotA.opts.yLabel = 'Energy (eV)'; plotA.opts.xTicks = 6; plotA.opts.yFormat = null; plotA.opts.zeroLine = true;
    plotA.setRange([0, top], [Emin, Emax]);
    plotA.draw(LA);
    setHTML($('pa-title'), 'The effective potential');
    put('pa-cap', `Black: V_{eff} for l = ${l}, the Coulomb well (dashed)${l ? ' plus the centrifugal barrier (dotted)' : ''}. Each level is drawn where it is classically allowed; on level n = ${n}, u(r) = rR(r) is drawn in colour, and the red dots are its turning points.`);
    legend('pa-legend', [['#14232c', '', 'V_{eff}(r)'], [brand, '', `u(r), n = ${n}`], ['#d9495f', 'swatch--stem', 'turning point']]);
    // plot B: R or P for every l in this shell
    const rmax = H.radiusFor(n, 0, 0.995), rr = range(0, rmax, 500), LB = [];
    let lo = 0, hi = 0;
    for (let k = 0; k < n; k++) {
      const ys = rr.map(r => (S.radial === 'P' ? H.P(n, k, r) : H.R(n, k, r)));
      if (S.radial === 'R') ys[0] = H.R(n, k, 1e-9);
      lo = Math.min(lo, ...ys); hi = Math.max(hi, ...ys);
      LB.push({ type: 'line', x: rr, y: ys, color: LCOL[k], width: k === l ? 3 : 1.5, dash: k === l ? [] : [5, 3] });
    }
    if (S.radial === 'R') hi = Math.min(hi, 1.3 * Math.max(...rr.slice(1).map(r => H.R(n, l, r))));
    LB.unshift({ type: 'dots', x: nodes, y: nodes.map(() => 0), color: LCOL[l], r: 4.5 });
    plotB.opts.xLabel = 'r / a'; plotB.opts.yLabel = S.radial === 'P' ? 'P(r) (per a)' : 'R(r) (a^−3/2)'; plotB.opts.xTicks = 6; plotB.opts.yFormat = null;
    plotB.setRange([0, rmax], S.radial === 'P' ? [0, hi * 1.1] : [lo * 1.1 - 0.02 * hi, hi * 1.05]);
    plotB.opts.zeroLine = S.radial === 'R';
    plotB.draw(LB);
    setHTML($('pb-title'), `Every shape in the n = ${n} shell`);
    put('pb-cap', `${S.radial === 'P' ? 'P(r) = r²R²' : 'R(r), as plotted in the video'} for l = 0 to ${n - 1}; the selected l is solid, and its nodes are dots. Higher l: fewer nodes and less weight near the nucleus.`);
    legend('pb-legend', Array.from({ length: n }, (_, k) => [LCOL[k], k === l ? '' : 'swatch--dash', `${n}${'spdfg'[k]}`]));
    setHTML($('takeaway'), '<b>The 3D problem has become a 1D one.</b> u(r) behaves like a particle in a box whose walls are the turning points: it oscillates where E is above V_eff, with n − l − 1 nodes, and decays outside. That decay is the same tunnelling physics as in a barrier.'.replace('V_eff', 'V<sub>eff</sub>'));
  }

  // ---------- 3. Spectral lines ----------
  function renderSpec() {
    const { ni, nf } = S, nm = H.wavelength(ni, nf), eV = H.photon(ni, nf), col = Lv.wlColor(nm), lim = H.wavelength(1e9, nf);
    $('levels').innerHTML = Lv.draw({ ni, nf, narrow: narrow($('levels')) });
    const nmTxt = v => (v >= 1000 ? `${fixed(v / 1000, 3)} µm` : `${fixed(v, 1)} nm`);
    stats([
      ['Transition', `n = ${ni} → ${nf}`, `${Lv.lineName(ni, nf)}, ${H.SERIES[nf]} series`],
      ['Wavelength', nmTxt(nm), col ? `visible: <span class="swatch-inline" style="background:${col}"></span>` : H.region(nm)],
      ['Photon energy', `${fixed(eV, 3)} eV`, `E_${ni} − E_${nf} = hc/λ`],
      ['Series limit', nmTxt(lim), `n_i → ∞: ${fixed(-H.energy(nf), 2)} eV, enough to ionise from n = ${nf}`],
    ]);
    setHTML($('dg-title'), 'Energy levels and the four series');
    put('dg-cap', 'Click an arrow to choose a transition. Levels are spaced as 1/n so the upper ones stay apart; their energies are on the left.');
    setHTML($('info'), `<b>${Lv.lineName(ni, nf)}:</b> 1/λ = R(1/${nf * nf} − 1/${ni * ni}) = ${fixed(1e3 / nm, 3)} µm⁻¹, so λ = ${nmTxt(nm)}${col ? ', a visible line' : H.region(nm) === 'ultraviolet' ? ', in the ultraviolet' : ', in the infrared'}.`);
    // plot A: every line on one photon-energy axis
    const LA = [], lg = Math.log10;
    for (let w = 380; w < 750; w += 6) { const e1 = lg(H.HC / (w + 6)), e0 = lg(H.HC / w); LA.push({ type: 'vband', x0: e1, x1: e0, color: (Lv.wlColor(w + 3) || '#fff').replace('rgb', 'rgba').replace(')', ', 0.28)') }); }
    for (let f = 1; f <= 4; f++) {
      const xs = [], ys = [];
      for (let i = f + 1; i <= f + 30; i++) { xs.push(lg(H.photon(i, f))); ys.push(f === nf ? 1 : 0.55); }
      LA.push({ type: 'stems', x: xs, y: ys, color: Lv.SERIES_COL[f], width: f === nf ? 1.5 : 1, r: f === nf ? 1.6 : 0.8 });
      LA.push({ type: 'text', x: (lg(H.photon(f + 1, f)) + lg(H.photon(1e9, f))) / 2, y: f === nf ? 1.22 : f === 4 ? 0.64 : 0.8, text: H.SERIES[f], color: Lv.SERIES_COL[f] });
    }
    LA.push({ type: 'stems', x: [lg(eV)], y: [1.08], color: '#14232c', width: 2.4, r: 4.5 });
    plotA.opts.xLabel = 'Photon energy (eV, log scale)'; plotA.opts.yLabel = ''; plotA.opts.yFormat = () => '';
    plotA.opts.xTickValues = [0.3, 0.5, 1, 2, 3, 5, 10].map(lg); plotA.opts.xFormat = v => String(+Math.pow(10, v).toPrecision(2));
    plotA.opts.zeroLine = false;
    plotA.setRange([lg(0.26), lg(16)], [0, 1.35]);
    plotA.draw(LA);
    setHTML($('pa-title'), 'All four series on one axis');
    put('pa-cap', 'Each stem is a line, up to n_i = 31, on a log scale of photon energy. Each series crowds towards its limit; the tinted band is visible light, which only the Balmer series reaches. Black: the selected line.');
    legend('pa-legend', [1, 2, 3, 4].map(f => [Lv.SERIES_COL[f], '', `${H.SERIES[f]} (n_f = ${f})`]));
    // plot B: what a spectrometer shows for this series
    const first = H.wavelength(nf + 1, nf), x0 = lim * 0.965, x1 = first * 1.04, LB = [{ type: 'vband', x0, x1, color: '#0b0f1a' }];
    for (let i = nf + 30; i > nf; i--) {
      const w = H.wavelength(i, nf), c = Lv.wlColor(w) || 'rgb(150, 160, 178)', fade = i - nf <= 6 ? 1 : 0.45;
      LB.push({ type: 'vline', x: w, color: c.replace('rgb', 'rgba').replace(')', `, ${fade})`), width: i - nf <= 6 ? 3 : 1.2, dash: [] });
    }
    LB.push({ type: 'vline', x: lim, color: 'rgba(255, 255, 255, 0.7)', width: 1.2, dash: [4, 4], label: 'limit' });
    LB.push({ type: 'vline', x: nm, color: '#ffffff', width: 1, dash: [2, 2], label: Lv.lineName(ni, nf) });
    plotB.opts.xLabel = 'Wavelength (nm)'; plotB.opts.yLabel = ''; plotB.opts.xTicks = 6; plotB.opts.yFormat = () => ''; plotB.opts.zeroLine = false;
    plotB.setRange([x0, x1], [0, 1]);
    plotB.draw(LB);
    setHTML($('pb-title'), `The ${H.SERIES[nf]} series through a spectrometer`);
    put('pb-cap', `Lines in their own colours (grey outside the visible), longest wavelength on the right. The lines bunch up towards the series limit at ${nmTxt(lim)}.`);
    legend('pb-legend', []);
    setHTML($('takeaway'), '<b>A spectrum is a fingerprint of the energy levels.</b> Every line is the difference of two Bohr energies, which is how the 1/n² law was found, decades before the Schrödinger equation explained it.');
  }

  // ---------- controls ----------
  function seg(id, items, current, attr) {
    $(id).innerHTML = items.map(([v, label, disabled]) => `<button type="button" data-${attr}="${v}" aria-pressed="${v === current}"${disabled ? ' disabled' : ''}>${label}</button>`).join('');
  }
  function syncControls() {
    seg('n-seg', [1, 2, 3, 4, 5].map(v => [v, v]), S.n, 'n');
    seg('l-seg', [0, 1, 2, 3, 4].map(v => [v, 'spdfg'[v], v >= S.n]), S.l, 'l');
    seg('m-seg', Array.from({ length: 2 * S.l + 1 }, (_, i) => i - S.l).map(v => [v, sgn(v)]), S.m, 'm');
    seg('ni-seg', [2, 3, 4, 5, 6, 7, 8].map(v => [v, v, v <= S.nf]), S.ni, 'ni');
    seg('nf-seg', [1, 2, 3, 4].map(v => [v, v]), S.nf, 'nf');
    $('n-out').textContent = `n = ${S.n}`; $('l-out').textContent = `l = ${S.l} (${'spdfg'[S.l]})`; $('m-out').textContent = `m = ${sgn(S.m)}`;
    $('ni-out').textContent = `n = ${S.ni}`; $('nf-out').textContent = `n = ${S.nf} (${H.SERIES[S.nf]})`;
    const [main, sb] = H.name(S.n, S.l, S.m, true);
    setHTML($('m-hint'), S.l === 0 ? 'An s orbital has only m = 0.' : S.real ? `Real orbital: ${main}<sub>${sb}</sub>.` : `Complex orbital: Y<sub>${S.l}</sub><sup>${S.m}</sup> ∝ e<sup>${S.m ? sgn(S.m) + 'iφ' : '0'}</sup>, with L<sub>z</sub> = ${S.m ? sgn(S.m) : '0'}ħ.`);
    setHTML($('basis-hint'), S.real ? 'Combinations of +m and −m that are real: the lobes chemists draw.' : 'States with a definite L<sub>z</sub> = mħ. Their phase winds m times around z.');
    document.querySelectorAll('[data-basis]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.basis === 'real') === S.real)));
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === S.view)));
    document.querySelectorAll('[data-plane]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.plane === S.plane)));
    document.querySelectorAll('[data-show]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.show === S.show)));
    document.querySelectorAll('[data-radial]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.radial === S.radial)));
    document.querySelectorAll('[data-orb]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.orb === `${S.n},${S.l},${S.m}` && S.real)));
    document.querySelectorAll('[data-view-only]').forEach(el => { el.hidden = el.dataset.viewOnly !== S.view; });
    $('prob').value = S.q; $('prob-out').textContent = `${S.q}%`;
    $('cut').setAttribute('aria-pressed', String(S.cut));
    $('spin').setAttribute('aria-pressed', String(view.spin));
  }
  function render() {
    syncControls();
    if (mode === 'orb') renderOrb(); else if (mode === 'rad') renderRad(); else renderSpec();
    $('play').textContent = playing ? '❚❚ Pause' : '▶ Cycle through the series';
    $('play-out').textContent = mode === 'spec' ? `${S.ni} → ${S.nf}` : '';
  }
  function applyMode() {
    document.querySelectorAll('.tab').forEach(b => { const on = b.dataset.mode === mode; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $('lab').setAttribute('aria-labelledby', 'tab-' + mode);
    document.querySelectorAll('.mode-intro').forEach(el => { el.hidden = el.dataset.for !== mode; });
    document.querySelectorAll('[data-modes]').forEach(el => { el.hidden = !el.dataset.modes.split(' ').includes(mode); });
    view.paused = mode === 'spec';
    render();
  }
  const clampState = () => { S.l = Math.min(S.l, S.n - 1); S.m = Math.max(-S.l, Math.min(S.l, S.m)); if (S.ni <= S.nf) S.ni = S.nf + 1; };
  document.querySelector('.controls').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.n) S.n = +d.n; else if (d.l) S.l = +d.l; else if (d.m !== undefined && d.m !== '') S.m = +d.m;
    else if (d.ni) S.ni = +d.ni; else if (d.nf) { S.nf = +d.nf; if (S.ni <= S.nf) S.ni = S.nf + 1; }
    else if (d.basis) S.real = d.basis === 'real'; else if (d.view) S.view = d.view; else if (d.plane) S.plane = d.plane;
    else if (d.show) S.show = d.show; else if (d.radial) S.radial = d.radial;
    else if (d.orb) { const [n, l, m] = d.orb.split(',').map(Number); Object.assign(S, { n, l, m, real: true }); }
    else if (b.id === 'cut') S.cut = !S.cut;
    else if (b.id === 'spin') { view.spin = !view.spin && !reduceMotion; }
    else if (b.id === 'reset-view') { view.resetView(); return; }
    else return;
    if (d.nf || d.ni) stop();
    clampState();
    render();
  });
  // the probability slider rebuilds the surface, so follow it at most once per frame
  let probPending = false;
  $('prob').addEventListener('input', e => {
    S.q = +e.target.value; $('prob-out').textContent = `${S.q}%`;
    if (probPending) return;
    probPending = true;
    requestAnimationFrame(() => { probPending = false; render(); });
  });
  $('levels').addEventListener('click', e => {
    const g = e.target.closest('.lv-arrow');
    if (!g) return;
    stop(); S.ni = +g.dataset.ni; S.nf = +g.dataset.nf; render();
    const again = $('levels').querySelector(`.lv-arrow[data-ni="${S.ni}"][data-nf="${S.nf}"]`);
    if (again) again.focus();
  });
  $('levels').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const g = e.target.closest('.lv-arrow');
    if (!g) return;
    e.preventDefault(); g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
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
    let was = null;
    new ResizeObserver(() => { const nw = narrow($('levels')) + '|' + Math.round($('plot-a').clientWidth / 40); if (nw !== was) { was = nw; render(); } }).observe($('lab'));
  }

  // ---------- cycling through a series (loops until paused) ----------
  let playing = false, timer = 0;
  function stepLine() {
    const last = Math.min(Lv.NMAX, S.nf + 6);
    S.ni = S.ni >= last ? S.nf + 1 : S.ni + 1;
    render();
  }
  function stop() { playing = false; clearInterval(timer); }
  $('play').addEventListener('click', () => {
    if (playing) { stop(); render(); return; }
    playing = true; stepLine(); timer = setInterval(stepLine, 1400); render();
  });

  // ---------- predict-first loaders ----------
  const BASE = { real: true, view: 'surface', q: 90, cut: false, plane: 'xz', show: 'dens' };
  const QUESTIONS = {
    q1: () => { mode = 'orb'; Object.assign(S, BASE, { n: 2, l: 0, m: 0, cut: true }); },
    q2: () => { mode = 'orb'; Object.assign(S, BASE, { n: 3, l: 2, m: 0 }); },
    q3: () => { mode = 'orb'; Object.assign(S, BASE, { n: 2, l: 1, m: 1, real: false, show: 'psi', plane: 'xy' }); },
    q4: () => { mode = 'orb'; Object.assign(S, BASE, { n: 1, l: 0, m: 0, view: 'cloud' }); },
    q5: () => { mode = 'rad'; Object.assign(S, { n: 1, l: 0, m: 0, radial: 'P' }); },
    q6: () => { mode = 'rad'; Object.assign(S, { n: 3, l: 2, m: 0, radial: 'P' }); },
    q7: () => { mode = 'spec'; Object.assign(S, { ni: 3, nf: 2 }); },
    q8: () => { mode = 'spec'; Object.assign(S, { ni: 8, nf: 1 }); },
  };
  document.querySelectorAll('.predict__load[data-q]').forEach(b => b.addEventListener('click', () => {
    stop();
    QUESTIONS[b.dataset.q]();
    applyMode();
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }));

  applyMode();
  window.__hydrogen = { S, view, render };
})();
