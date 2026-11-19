/* The quantum metric lab: measuring curved surfaces, the distance between quantum states, and the quantum metric of
   graphene. Physics in metric.js (and, for graphene, the Berry phase lab's physics.js); pictures in views.js and the
   Berry phase lab's views.js. */
(function () {
  'use strict';
  const B = window.BP, QM = window.QM, BV = window.BerryViews, MV = window.MetricViews;
  const PI = Math.PI, DEG = PI / 180, TAU = 2 * PI, S3 = Math.sqrt(3), KX = 4 * PI / (3 * S3);
  const $ = id => document.getElementById(id);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const START = { surf: 'sphere', u: [0.4, 0.5], eps: 0.5, thc: 60, cg: 'smooth', seed: 1, hm: 0.2, ht2: 0, hphi: 90, path: 'across' };
  const S = JSON.parse(JSON.stringify(START));
  let mode = 'surface';
  let deep = false;
  try { deep = localStorage.getItem('metric-depth') === 'deep'; } catch (e) { /* storage blocked: start simple */ }
  const INK = '#14232c', GOLD = '#946600', BLUE = '#1f6fb4', RED = '#c2372f', GREEN = '#2e8b57', MUTED = '#5f7382', GREY = '#8a9aa5';

  // ---------- formatting and page helpers ----------
  const fixed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const piTxt = (x, d = 3) => { const v = x / PI; return Math.abs(v) < 0.5 * Math.pow(10, -d) ? '0' : `${fixed(v, d)}π`; };
  const sub = t => String(t).replace(/_\{([^}]*)\}|_([A-Za-z0-9])/g, (m, a, b) => `<sub>${a || b}</sub>`);
  const sym = t => `<span class="sym">${t}</span>`;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const range = (a, b, k) => Array.from({ length: k + 1 }, (_, i) => a + (b - a) * i / k);
  const deg = x => `${fixed(x / DEG, Math.abs(x / DEG) < 10 ? 1 : 0)}°`;
  function stats(items) {
    $('stats').className = `stats stats--${items.length} stats--steady stats--wrap`;
    $('stats').innerHTML = items.map(([label, value, s2]) => `<div class="stat"><div class="stat__label">${sub(label)}</div><div class="stat__value">${value}</div><div class="stat__sub">${sub(s2)}</div></div>`).join('');
  }
  function typeset(el) { if (window.MathJax && MathJax.typesetPromise && /\\\(/.test(el.innerHTML)) MathJax.typesetPromise([el]).catch(() => {}); }
  function setHTML(el, html) { if (el.dataset.html === html) return; el.dataset.html = html; el.innerHTML = html; typeset(el); }
  const put = (id, t) => setHTML($(id), sub(t));
  function legend(id, items) { setHTML($(id), items.map(([c, k, l]) => `<li style="color:${c}"><span class="swatch ${k}"></span><span>${sub(l)}</span></li>`).join('')); }
  const MARGIN = { l: 58, r: 18, t: 12, b: 42 };
  const plotA = new NanoPlot($('plot-a'), { margin: MARGIN, narrowMargin: { l: 54, r: 12 } });
  const plotB = new NanoPlot($('plot-b'), { margin: MARGIN, narrowMargin: { l: 54, r: 12 } });
  const plane = new BV.ZoneMap($('plane'), { margin: { l: 46, r: 12, t: 12, b: 40 }, xTicks: 5, yTicks: 5 });
  plane.onFit = () => { if (mode !== 'states') later(); };
  const surf = new MV.SurfaceView($('surf'));
  const bloch = new BV.GeoSphere($('bloch'));
  const dial = new BV.PhaseDial($('dial'));
  const sphereR = new BV.GeoSphere($('sphere'));
  const reset = pl => { pl.opts.xTickValues = null; pl.opts.xFormat = null; pl.opts.yFormat = null; pl.opts.zeroLine = false; pl.opts.xTicks = 6; pl.opts.yTicks = 5; };
  const cache = new Map();
  function memo(key, fn) { let v; if (cache.has(key)) { v = cache.get(key); cache.delete(key); } else v = fn(); cache.set(key, v); if (cache.size > 40) cache.delete(cache.keys().next().value); return v; }
  const slerp = (p, q, t) => { const v = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t], l = Math.hypot(...v) || 1; return v.map(x => x / l); };
  const add3 = (a, b, s = 1) => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]];
  const unit3 = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
  const ellipsePts = (c, W, rx, n = 28) => Array.from({ length: n + 1 }, (_, j) => { const t = TAU * j / n, a = rx * Math.cos(t), b = rx * Math.sin(t); return [c[0] + W[0][0] * a + W[0][1] * b, c[1] + W[1][0] * a + W[1][1] * b]; });

  // ---------- the animation: a dot goes round (or along) once, then a pause on the finished picture ----------
  const LAP = 5, HOLD = 1.8;
  let animOn = !reduceMotion, animT0 = performance.now(), animRaf = 0, seen = true, frameFn = null;
  const running = () => animOn && !document.hidden && seen && !!frameFn;
  // a frame can be stamped a moment before the animation (re)started: never let the fraction go below 0
  const animFrac = now => clamp((((now - animT0) / 1000) % (LAP + HOLD)) / LAP, 0, 1);
  function tick(now) { animRaf = 0; if (!running()) return; frameFn(animFrac(now)); animRaf = requestAnimationFrame(tick); }
  function kick() { if (running() && !animRaf) animRaf = requestAnimationFrame(tick); }
  function syncAnim() { $('anim').textContent = animOn ? '❚❚ Pause' : '▶ Animate'; $('anim').setAttribute('aria-pressed', String(animOn)); }
  $('anim').addEventListener('click', () => { animOn = !animOn; if (animOn) animT0 = performance.now(); syncAnim(); if (!animOn && frameFn) frameFn(1); kick(); });
  document.addEventListener('visibilitychange', kick);
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { seen = es[0].isIntersecting; kick(); }).observe($('mag-view'));
  const nowF = () => (running() ? animFrac(performance.now()) : 1);

  /* ================= 1. Measuring a curved surface ================= */
  const NLOOP = 400;
  function surfMesh(key) {
    return memo(`mesh|${key}`, () => {
      // the sphere is drawn whole, poles and all, though its chart stops short of them
      const Sf = QM.SURFACES[key], [a0, a1, b0, b1] = key === 'sphere' ? [-PI, PI, -PI / 2, PI / 2] : Sf.box, nu = 32, nv = 22, P = [];
      for (let i = 0; i <= nu; i++) { P.push([]); for (let j = 0; j <= nv; j++) P[i].push(Sf.r(a0 + (a1 - a0) * i / nu, b0 + (b1 - b0) * j / nv)); }
      const quads = [], ex = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const p = [P[i][j], P[i + 1][j], P[i + 1][j + 1], P[i][j + 1]], d1 = add3(p[2], p[0], -1), d2 = add3(p[3], p[1], -1);
        quads.push({ p, n: unit3([d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0]]) });
        p.forEach(v => { for (let k = 0; k < 3; k++) { ex[2 * k] = Math.min(ex[2 * k], v[k]); ex[2 * k + 1] = Math.max(ex[2 * k + 1], v[k]); } });
      }
      // the radius that holds the whole surface, from the middle of its extent
      const mid = [(ex[0] + ex[1]) / 2, (ex[2] + ex[3]) / 2, (ex[4] + ex[5]) / 2];
      let rad = 0; P.forEach(row => row.forEach(v => { rad = Math.max(rad, Math.hypot(v[0] - mid[0], v[1] - mid[1], v[2] - mid[2])); }));
      return { quads, extent: ex, radius: rad };
    });
  }
  // the loop: the metric ellipse, shrunk if needed so that it stays on the chart
  function surfLoop() {
    const Sf = QM.SURFACES[S.surf], [a0, a1, b0, b1] = Sf.box;
    let eps = S.eps, pts;
    for (let it = 0; it < 30; it++) {
      pts = QM.ellipse(Sf, S.u, eps, NLOOP);
      if (pts.every(p => (Sf.wrap[0] || (p[0] > a0 && p[0] < a1)) && (Sf.wrap[1] || (p[1] > b0 && p[1] < b1)))) break;
      eps *= 0.9;
    }
    return { eps, pts };
  }
  function surfData() {
    const key = `${S.surf}|${S.u.map(v => v.toFixed(3)).join(',')}|${S.eps}`;
    return memo(`surf|${key}`, () => {
      const Sf = QM.SURFACES[S.surf], { eps, pts } = surfLoop(), T = QM.transport(Sf, pts), F = QM.frame(Sf, S.u);
      // the arrow's angle from the chart's first direction e1, followed round the loop
      const ang = [];
      let prev = 0, acc = 0;
      T.steps.forEach((s, j) => {
        const Fj = QM.frame(Sf, pts[j % pts.length]), e = unit3(Fj.e1), cr = [e[1] * s.v[2] - e[2] * s.v[1], e[2] * s.v[0] - e[0] * s.v[2], e[0] * s.v[1] - e[1] * s.v[0]];
        const a = Math.atan2(cr[0] * Fj.N[0] + cr[1] * Fj.N[1] + cr[2] * Fj.N[2], e[0] * s.v[0] + e[1] * s.v[1] + e[2] * s.v[2]);
        acc = j ? acc + B.wrap(a - prev) : a; prev = a; ang.push(acc);
      });
      return { Sf, eps, pts, T, F, K: QM.curvature(Sf, S.u), intK: QM.curvatureInside(Sf, S.u, eps), ang };
    });
  }
  // how the turn grows with the size of the loop
  function surfSizes() {
    return memo(`sizes|${S.surf}|${S.u.map(v => v.toFixed(3)).join(',')}`, () => {
      const Sf = QM.SURFACES[S.surf], out = [];
      range(0.05, 0.8, 15).forEach(e => {
        const save = S.eps; S.eps = e; const L = surfLoop(); S.eps = save;
        if (L.eps < e - 1e-9) return;                       // too big to fit on the chart here
        out.push({ e, turn: QM.transport(Sf, QM.ellipse(Sf, S.u, e, 160)).turn });
      });
      return out;
    });
  }
  function surfaceFrame(f) {
    const X = surfData(), Sf = X.Sf, N = X.pts.length, j = Math.min(N, Math.round(f * N)), step = X.T.steps[j], L = 0.38;
    const loop3 = X.pts.map(p => Sf.r(...p)), traced = loop3.slice(0, j + 1);
    if (f >= 0.999) traced.push(loop3[0]);
    const s0 = X.T.steps[0], e1 = unit3(X.F.e1), e2 = unit3(X.F.e2);
    surf.draw(Object.assign({}, surfMesh(S.surf), {
      curves: [{ pts: loop3.concat([loop3[0]]), color: GREY, width: 1.6, dash: [4, 4] }, { pts: traced, color: INK, width: 2.8 }],
      arrows: [
        { a: X.F.r, b: add3(X.F.r, e1, L * 0.9), color: GOLD, width: 2.2, label: 'e₁' }, { a: X.F.r, b: add3(X.F.r, e2, L * 0.9), color: GOLD, width: 2.2, label: 'e₂' },
        { a: s0.r, b: add3(s0.r, s0.v, L), color: GREEN, width: 2, dash: [4, 3] },
        { a: step.r, b: add3(step.r, step.v, L), color: GREEN, width: 3.2 },
      ],
      dots: [{ v: X.F.r, color: INK, r: 4.5, ring: true }, { v: step.r, color: INK, r: 4 }],
      caption: f >= 0.999 ? `turned by ${deg(X.T.turn)}` : `${fixed(100 * f, 0)}% of the way round`,
    }));
    const tr = X.pts[j % N];
    plane.overlay = { tracer: { k: tr, color: INK } };
    plane.draw(plane.layers);
  }
  function renderSurface() {
    const X = surfData(), Sf = X.Sf, g = X.F.g, area = PI * X.eps * X.eps;
    // the chart: the metric's ellipses everywhere, the loop and the point
    plane.opts.xLabel = Sf.u[0]; plane.opts.yLabel = Sf.u[1];
    plane.fit(Sf.box);
    const [a0, a1, b0, b1] = Sf.box, layers = [], de = 0.05 * Math.min(a1 - a0, b1 - b0);
    for (let i = 0; i < 8; i++) for (let jj = 0; jj < 6; jj++) {
      const c = [a0 + (a1 - a0) * (i + 0.5) / 8, b0 + (b1 - b0) * (jj + 0.5) / 6], W = QM.invSqrt(QM.frame(Sf, c).g), pts = ellipsePts(c, W, de);
      layers.push({ type: 'line', x: pts.map(p => p[0]), y: pts.map(p => p[1]), color: 'rgba(148, 102, 0, .55)', width: 1.4 });
    }
    layers.push({ type: 'line', x: X.pts.concat([X.pts[0]]).map(p => p[0]), y: X.pts.concat([X.pts[0]]).map(p => p[1]), color: INK, width: 2.4 });
    layers.push({ type: 'dots', x: [S.u[0]], y: [S.u[1]], color: INK, r: 4.5 });
    plane.layers = layers;
    const kind = Math.abs(X.K) < 1e-6 ? 'flat' : X.K > 0 ? 'positive' : 'negative';
    if (!deep) stats([
      ['Metric here', `${sym('g')}₁₁ = ${fixed(g[0][0], 2)}, ${sym('g')}₂₂ = ${fixed(g[1][1], 2)}${Math.abs(g[0][1]) > 0.005 ? `, ${sym('g')}₁₂ = ${fixed(g[0][1], 2)}` : ''}`, Math.abs(g[0][0] - g[1][1]) < 0.01 && Math.abs(g[0][1]) < 0.005 ? 'the chart is true to scale here' : 'steps on the chart cover different distances in different directions'],
      ['Curvature here', `${sym('K')} = ${fixed(X.K, 2)}`, kind === 'flat' ? 'flat: it can be unrolled onto a plane' : kind === 'positive' ? 'positive: curved like a ball' : 'negative: curved like a saddle'],
      ['Arrow\'s turn after one loop', deg(X.T.turn), `curvature × area = ${deg(X.K * area)}`],
    ]);
    else stats([
      ['Metric here', `${fixed(g[0][0], 3)}, ${fixed(g[0][1], 3)}, ${fixed(g[1][1], 3)}`, `g_{11}, g_{12}, g_{22}; √det g = ${fixed(Math.sqrt(g[0][0] * g[1][1] - g[0][1] * g[0][1]), 3)}`],
      [`Gaussian curvature ${sym('K')}`, fixed(X.K, 4), 'det L / det g, at the point'],
      ['Turn after one loop', `${fixed(X.T.turn, 4)} rad`, `parallel transport, ${NLOOP} steps`],
      [`${sym('∬K dA')} inside`, `${fixed(X.intK, 4)} rad`, `Gauss–Bonnet; K × πε² = ${fixed(X.K * area, 4)}`],
    ]);
    setHTML($('dg-title'), `A ${Sf.name.toLowerCase()}, its chart, and an arrow carried round a loop`);
    put('dg-cap', deep ? 'On the chart, in coordinates (u¹, u²): the faint ellipses are the steps g_{ij}du^idu^j = const, the black ellipse the loop, ε on the surface. On the surface: the coordinate tangent vectors e₁ and e₂ (gold) at the point, and an arrow parallel-transported round the loop (green; dashed, where it started). Drag the surface to turn it; drag on the chart to move the point.'
      : 'On the chart, each faint ellipse holds the steps that cover the same short distance on the surface; the black one is your loop. On the surface, the gold arrows point along the chart\'s two directions, and the green arrow is slid round the loop without ever being turned. Compare it with the dashed one it started as. Drag the surface to turn it; drag on the chart to move the point.');
    legend('dg-legend', [[GOLD, '', 'equal distances, and the chart\'s directions'], [INK, '', 'the loop'], [GREEN, '', 'arrow slid round without turning']]);
    // plot A: the arrow's angle on its way round
    reset(plotA);
    plotA.opts.xLabel = 'Fraction of the way round'; plotA.opts.yLabel = 'Arrow\'s angle from e₁ (°)'; plotA.opts.zeroLine = true;
    const xs = X.ang.map((_, i) => i / (X.ang.length - 1)), ys = X.ang.map(a => a / DEG), lo = Math.min(...ys, X.T.turn / DEG, 0), hi = Math.max(...ys, X.T.turn / DEG, 0), pad = 0.1 * (hi - lo) + 5;
    plotA.setRange([0, 1], [lo - pad, hi + pad]);
    plotA.layers = [{ type: 'hline', y: X.intK / DEG, color: GOLD, width: 1.6, dash: [6, 4] }, { type: 'line', x: xs, y: ys, color: GREEN, width: 2.4 }];
    plotA.draw(plotA.layers);
    setHTML($('pa-title'), 'The arrow\'s angle on its way round');
    put('pa-cap', `The angle between the carried arrow and the chart's direction e₁ as it goes round (green). On the way it depends on the chart; when the loop closes, only the turn is left, ${deg(X.T.turn)}, the curvature inside the loop (gold).`);
    legend('pa-legend', [[GREEN, '', 'arrow\'s angle'], [GOLD, 'swatch--dash', 'curvature inside the loop']]);
    // plot B: the turn against the size of the loop
    reset(plotB);
    const SZ = surfSizes(), es = range(0, 0.8, 80);
    plotB.opts.xLabel = 'Size of the loop, ε'; plotB.opts.yLabel = 'Turn after one loop (°)'; plotB.opts.zeroLine = true;
    const tv = SZ.map(p => p.turn / DEG).concat(es.map(e => X.K * PI * e * e / DEG)), blo = Math.min(0, ...tv), bhi = Math.max(0, ...tv), bp = 0.1 * (bhi - blo) + 4;
    plotB.setRange([0, 0.8], [blo - bp, bhi + bp]);
    plotB.draw([
      { type: 'line', x: es, y: es.map(e => X.K * PI * e * e / DEG), color: GOLD, width: 1.8, dash: [6, 4] },
      { type: 'line', x: SZ.map(p => p.e), y: SZ.map(p => p.turn / DEG), color: GREEN, width: 2.4 },
      { type: 'dots', x: [X.eps], y: [X.T.turn / DEG], color: INK, r: 5 },
    ]);
    setHTML($('pb-title'), 'Bigger loops turn the arrow more');
    put('pb-cap', `The turn after one loop against the loop's size (green), and curvature × area, K πε², the rule for small loops (gold). ${kind === 'flat' ? 'Here the surface is flat: no loop turns the arrow.' : 'Small loops follow the rule; big ones feel how the curvature changes across them.'}`);
    legend('pb-legend', [[GREEN, '', 'turn'], [GOLD, 'swatch--dash', 'curvature × area'], [INK, '', 'this loop']]);
    setHTML($('info'), kind === 'flat'
      ? `<b>The arrow comes back exactly as it left.</b> ${S.surf === 'cylinder' ? 'A cylinder is a rolled-up sheet: unroll it and its metric, and so its distances, are those of a flat sheet. It is curved in space, but not to anyone living on it.' : 'On a flat sheet, an arrow slid round any loop comes back unturned.'}`
      : `<b>The arrow comes back turned by ${deg(Math.abs(X.T.turn))}, ${X.T.turn > 0 ? 'the same way as the loop goes round' : 'against the way the loop goes round'}.</b> ${kind === 'positive' ? 'Positive curvature, as on a ball.' : 'Negative curvature, as on a saddle or a pass between two hills.'} For a small loop the turn is the curvature times the area: ${fixed(X.K, 2)} × ${fixed(area, 2)} = ${deg(X.K * area)}${X.eps < S.eps - 1e-6 ? ' (the loop has been shrunk to stay on the chart)' : ''}.`);
    setHTML($('takeaway'), '<b>Curvature can be measured from inside the surface.</b> The metric alone, distances measured without ever leaving the surface, decides how much the arrow turns. That is the idea the video carries over to quantum states.');
    $('path-note').hidden = true;
    $('plane').setAttribute('aria-label', `Chart of the ${Sf.name.toLowerCase()} in ${Sf.u[0]} and ${Sf.u[1]}, with the point at ${fixed(S.u[0], 2)}, ${fixed(S.u[1], 2)} and its loop`);
    $('surf').setAttribute('aria-label', `The ${Sf.name.toLowerCase()} in 3D; an arrow carried round the loop comes back turned by ${deg(X.T.turn)}`);
    frameFn = surfaceFrame;
    surfaceFrame(nowF());
  }

  /* ================= 2. The distance between quantum states ================= */
  const NST = 400;
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const withPhase = (u, ch) => { const c = Math.cos(ch), s = Math.sin(ch); return [u[0] * c - u[1] * s, u[0] * s + u[1] * c, u[2] * c - u[3] * s, u[2] * s + u[3] * c]; };
  function stateData() {
    return memo(`st|${S.thc}|${S.cg}|${S.seed}`, () => {
      const th = S.thc * DEG, r = rng(S.seed * 7919 + 13), ns = [], st = [];
      for (let j = 0; j <= NST; j++) {
        const p = TAU * j / NST, n = [Math.sin(th) * Math.cos(p), Math.sin(th) * Math.sin(p), Math.cos(th)];
        ns.push(n);
        const u = B.up(n);
        st.push(S.cg === 'random' && j > 0 && j < NST ? withPhase(u, TAU * r()) : u);
      }
      const od = QM.odometer(st), crow = st.map(u => QM.fsAngle(st[0], u)), d2 = st.map(u => 1 - QM.overlap2(st[0], u));
      return { th, ns, st, od, crow, d2, length: PI * Math.sin(th), berry: -PI * (1 - Math.cos(th)) };
    });
  }
  function statesFrame(f) {
    const X = stateData(), j = Math.round(f * NST), n = X.ns[j], n0 = X.ns[0];
    const loop = X.ns, traced = X.ns.slice(0, j + 1);
    // the shortest way back to the start, on the sphere ("as the crow flies")
    const crowPath = range(0, 1, 40).map(t => slerp(n0, n, t));
    bloch.draw({
      curves: [{ pts: loop, color: GOLD, width: 1.8, dash: [5, 4] }, { pts: traced, color: INK, width: 2.8 }].concat(j > 0 && j < NST ? [{ pts: crowPath, color: BLUE, width: 1.8, dash: [3, 3] }] : []),
      arrows: [{ v: n0, color: GREY, width: 2.4 }, { v: n, color: BLUE, width: 3.2, label: 'ψ' }],
      dots: [{ v: n0, color: INK, r: 4, ring: true }],
      tags: [{ v: n0.map(x => x * 1.18), text: 'ψ₀', color: MUTED, size: 12.5 }],
      caption: `travelled ${fixed(X.od[j], 3)} · from the start ${fixed(X.crow[j], 3)}`,
    });
    const o = B.ov(X.st[0], X.st[j]);
    dial.draw({ arrows: [{ z: [o[0], o[1]], color: BLUE, width: 3.2, label: '⟨ψ₀|ψ⟩' }], caption: `|⟨ψ₀|ψ⟩|² = ${fixed(o[0] * o[0] + o[1] * o[1], 3)}` });
    $('dial').setAttribute('aria-label', `The overlap with the starting state: length ${fixed(Math.hypot(o[0], o[1]), 3)}`);
    // live numbers in the stats
    const live = $('stats').querySelectorAll('.stat__value');
    if (live.length) { live[0].textContent = fixed(X.d2[j], 3); live[1].textContent = fixed(X.od[j], 3); }
    reset(plotA);
    plotA.opts.xLabel = 'Fraction of the way round'; plotA.opts.yLabel = 'Quantum distance';
    plotA.setRange([0, 1], [0, Math.max(X.length, 0.2) * 1.08]);
    const xs = range(0, j / NST, j);
    plotA.draw([
      { type: 'line', x: range(0, 1, NST), y: X.od, color: 'rgba(20,35,44,.18)', width: 1.4 },
      { type: 'line', x: xs, y: X.od.slice(0, j + 1), color: INK, width: 2.6 },
      { type: 'line', x: xs, y: X.crow.slice(0, j + 1), color: BLUE, width: 2.4 },
      { type: 'dots', x: [j / NST, j / NST], y: [X.od[j], X.crow[j]], colors: [INK, BLUE], r: 4.5 },
    ]);
  }
  function renderStates() {
    const X = stateData();
    if (!deep) stats([
      ['Distance from the start', '', '1 − |⟨ψ₀|ψ⟩|²: 0 for the same state, 1 for the opposite one'],
      ['Distance travelled', '', `the odometer; the whole loop is ${fixed(X.length, 3)}`],
      ['Berry phase of the loop', piTxt(X.berry), 'its twist, from card 1: −½ the area inside'],
    ]);
    else stats([
      [`${sym('1 − |⟨ψ₀|ψ⟩|²')}`, '', 'infidelity with the start'],
      ['Arc length so far', '', `Σ arccos|⟨ψ_j|ψ_{j+1}⟩|; loop: π sin θ = ${fixed(X.length, 4)}`],
      ['Metric on the loop', `${sym('g')}_φφ = ${fixed(Math.sin(X.th) ** 2 / 4, 3)}`, 'ds² = ¼(dθ² + sin²θ dφ²): a sphere of radius ½'],
      ['Berry phase', piTxt(X.berry), `Ω_θφ = ½ sin θ; Q = g − (i/2)Ω`],
    ]);
    setHTML($('dg-title'), 'A state goes round a loop: distance and odometer');
    put('dg-cap', 'On the Bloch sphere, the state ψ (blue) goes round the dashed loop from ψ₀; the blue dashed arc is the shortest way back to the start. On the dial: the overlap ⟨ψ₀|ψ⟩, a complex number. Its length sets the distance from the start; its direction is the phase, which depends on the phase chosen for each state.');
    legend('dg-legend', [[BLUE, '', 'the state now, and the shortest way back'], [INK, '', 'the path travelled'], [GOLD, 'swatch--dash', 'the loop']]);
    setHTML($('pa-title'), 'As the crow flies, and along the road');
    put('pa-cap', `The quantum distance from the start, arccos|⟨ψ₀|ψ⟩| (blue), rises and falls; the distance travelled (black) only grows, to π sin θ = ${fixed(X.length, 3)} for the whole loop.`);
    legend('pa-legend', [[BLUE, '', 'from the start'], [INK, '', 'travelled']]);
    reset(plotB);
    const ths = range(0, 180, 180);
    plotB.opts.xLabel = 'Cone angle θ (degrees)'; plotB.opts.yLabel = 'Length, and |Berry phase|'; plotB.opts.xTickValues = [0, 45, 90, 135, 180];
    plotB.setRange([0, 180], [0, 2 * PI * 1.04]);
    plotB.draw([
      { type: 'line', x: ths, y: ths.map(t => PI * Math.sin(t * DEG)), color: INK, width: 2.4 },
      { type: 'line', x: ths, y: ths.map(t => PI * (1 - Math.cos(t * DEG))), color: RED, width: 2.2, dash: [6, 4] },
      { type: 'vline', x: S.thc, color: GREY, dash: [3, 3] },
      { type: 'dots', x: [S.thc, S.thc], y: [X.length, -X.berry], colors: [INK, RED], r: 5 },
    ]);
    setHTML($('pb-title'), 'Length from the metric, twist from the curvature');
    put('pb-cap', 'The loop\'s length on the odometer, π sin θ (black), and the size of its Berry phase, π(1 − cos θ) (red), against the cone angle. The length is greatest on the equator and shrinks again; the Berry phase keeps growing with the area inside.');
    legend('pb-legend', [[INK, '', 'length'], [RED, 'swatch--dash', '|Berry phase|']]);
    put('cg-hint', S.cg === 'random' ? 'Each state on the loop is multiplied by its own random phase factor.' : 'Each state is |+n⟩ as in card 1: its phase changes smoothly round the loop.');
    $('reroll').hidden = S.cg !== 'random';
    setHTML($('info'), S.cg === 'random'
      ? '<b>Scrambled phases: the overlap\'s arrow jumps about, but its length does not.</b> The distance from the start, the odometer and the Berry phase are exactly as before: none of them depends on the phase given to each state.'
      : `<b>Round a ${S.thc}° cone, the state travels ${fixed(X.length, 3)}${Math.abs(S.thc - 90) < 0.5 ? ', the longest loop there is: π, the equator of a sphere of radius ½' : ''}.</b> Half way round it is ${fixed(1 - QM.overlap2(X.st[0], X.st[NST / 2]), 3)} from the start${Math.abs(S.thc - 90) < 0.5 ? ', as far as two states can be' : ''}; back at the start, 0, while the odometer keeps the whole length.`);
    setHTML($('takeaway'), '<b>Distance and twist are the two halves of quantum geometry.</b> The quantum metric measures how far a state moves; the Berry curvature, how much it twists. Together they make the quantum geometric tensor, Q = g − (i/2)Ω.');
    $('path-note').hidden = true;
    $('bloch').setAttribute('aria-label', `A state going round a ${S.thc}° cone on the Bloch sphere`);
    frameFn = statesFrame;
    statesFrame(nowF());
  }

  /* ================= 3. The quantum metric of graphene ================= */
  const BOX = [-3.05, 3.05, -2.7, 2.7];
  const HEX = range(0, 5, 5).map(i => [KX * Math.cos(i * PI / 3), KX * Math.sin(i * PI / 3)]);
  const POINTS = [{ k: [0, 0], text: 'Γ' }, { k: [KX, 0], text: 'K' }, { k: [KX / 2, 2 * PI / 3], text: 'K′' }, { k: [PI / S3, PI / 3], text: 'M' }];
  const model = () => ({ type: 'hex', M: S.hm, t2: S.ht2, phi: S.hphi * DEG });
  const mkey = () => `${S.hm}|${S.ht2}|${S.hphi}`;
  const NP = 1200;
  function pathPoints() {
    if (S.path === 'across') return { pts: range(-1.2, 1.2, NP).map(y => [KX, y]), marks: [[0.5, 'K']], name: 'straight across valley K' };
    const corners = [[[0, 0], 'Γ'], [[KX, 0], 'K'], [[PI / S3, PI / 3], 'M'], [[KX / 2, 2 * PI / 3], 'K′'], [[0, 0], 'Γ']];
    const seg = corners.slice(1).map((c, i) => Math.hypot(c[0][0] - corners[i][0][0], c[0][1] - corners[i][0][1])), tot = seg.reduce((a, b) => a + b, 0), pts = [], marks = [];
    let acc = 0;
    corners.forEach((c, i) => { marks.push([acc / tot, c[1]]); if (i < seg.length) acc += seg[i]; });
    for (let j = 0; j <= NP; j++) {
      let s = tot * j / NP, i = 0;
      while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
      const a = corners[i][0], b = corners[i + 1][0], t = Math.min(1, s / seg[i]);
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return { pts, marks, name: 'round the zone, Γ–K–M–K′–Γ' };
  }
  function grapheneData() {
    return memo(`gr|${mkey()}|${S.path}`, () => {
      const md = model(), P = pathPoints(), ps = QM.pathStates(md, P.pts), dirs = P.pts.map(k => B.stateDir(md, k));
      const mK = S.hm - 3 * S3 * S.ht2 * Math.sin(S.hphi * DEG), mKp = S.hm + 3 * S3 * S.ht2 * Math.sin(S.hphi * DEG);
      let gap = Infinity;
      for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) { const [o, a, b] = B.cell(md), k = [o[0] + (a[0] * i + b[0] * j) / 60, o[1] + (a[1] * i + b[1] * j) / 60]; gap = Math.min(gap, 2 * Math.hypot(...B.dvec(md, k).d)); }
      gap = Math.min(gap, 2 * Math.abs(mK), 2 * Math.abs(mKp));
      return { md, P, dist: ps.dist, dirs, mK, mKp, gap, trK: QM.metric(md, [KX, 0]).tr };
    });
  }
  function grapheneFrame(f) {
    const X = grapheneData(), j = Math.round(f * NP), k = X.P.pts[j], G = QM.metric(X.md, k), cur = X.dirs[j];
    sphereR.draw({
      curves: [{ pts: X.dirs, color: GREY, width: 1.4, dash: [4, 4] }, { pts: X.dirs.slice(0, j + 1), color: INK, width: 2.8 }],
      arrows: [{ v: cur, color: INK, width: 3, label: 'state' }],
      dots: [{ v: X.dirs[0], color: INK, r: 4, ring: true }],
      tags: [{ v: [0, 0, 1], text: 'atom A', color: MUTED, size: 11.5, bold: false, dx: -30, dy: -9 }, { v: [0, 0, -1], text: 'atom B', color: MUTED, size: 11.5, bold: false, dx: -30, dy: 9 }].filter(t => t.v[2] * cur[2] < 0.85),
      caption: `travelled ${fixed(X.dist[j], 3)}`,
      notes: [{ text: 'quantum distance = ½ × length on the sphere', bold: true }, { text: `metric here: tr g = ${Number.isFinite(G.tr) ? fixed(G.tr, G.tr < 10 ? 2 : 1) : '∞'}` }],
    });
    plane.overlay = Object.assign({}, plane.overlay, { tracer: { k, color: INK } });
    plane.draw(plane.layers);
    const live = $('stats').querySelectorAll('.stat__value');
    if (live.length) { live[0].textContent = Number.isFinite(G.tr) ? fixed(G.tr, G.tr < 10 ? 2 : 1) : '∞'; live[1].textContent = fixed(X.dist[j], 3); if (deep && live.length > 3) live[2].textContent = Number.isFinite(G.det) ? `${fixed(Math.sqrt(G.det), 3)} = ${fixed(Math.abs(G.omega) / 2, 3)}` : '∞'; }
    reset(plotA);
    plotA.opts.xLabel = 'Along the path'; plotA.opts.yLabel = 'Quantum distance travelled';
    plotA.opts.xTickValues = X.P.marks.map(m => m[0]); plotA.opts.xFormat = v => { const m = X.P.marks.find(q => Math.abs(q[0] - v) < 1e-9); return m ? m[1] : ''; };
    const tot = X.dist[NP], xs = range(0, j / NP, j);
    plotA.setRange([0, 1], [0, Math.max(tot, 0.3) * 1.08]);
    plotA.draw(X.P.marks.map(m => ({ type: 'vline', x: m[0], color: GREY, dash: [3, 3] })).concat([
      { type: 'line', x: range(0, 1, NP), y: X.dist, color: 'rgba(20,35,44,.18)', width: 1.4 },
      { type: 'line', x: xs, y: X.dist.slice(0, j + 1), color: INK, width: 2.6 },
      { type: 'dots', x: [j / NP], y: [X.dist[j]], color: INK, r: 4.5 },
    ]));
  }
  function renderGraphene() {
    const X = grapheneData(), md = X.md, closed = X.gap < 1e-6;
    // the map: tr g, its ellipses, the path
    plane.opts.xLabel = 'Wavevector kx'; plane.opts.yLabel = 'Wavevector ky';
    plane.fit(BOX);
    const box = [plane.xr[0], plane.xr[1], plane.yr[0], plane.yr[1]];
    const heat = memo(`heat|${mkey()}|${box.map(v => v.toFixed(3)).join(',')}`, () => {
      const vals = [];
      for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) { const v = QM.metric(md, [box[0] + (box[1] - box[0]) * (i + 0.5) / 60, box[2] + (box[3] - box[2]) * (j + 0.5) / 60]).tr; if (Number.isFinite(v)) vals.push(v); }
      vals.sort((a, b) => a - b);
      const p97 = vals.length ? vals[Math.floor(0.97 * (vals.length - 1))] : 1;
      return MV.seqCanvas((x, y) => QM.metric(md, [x, y]).tr, box, 150, Math.round(150 * (box[3] - box[2]) / (box[1] - box[0])), Math.max(0.6 * p97, 1e-9));
    });
    const layers = [{ type: 'image', canvas: heat, x0: box[0], x1: box[1], y0: box[2], y1: box[3], smooth: true }];
    // ellipses: axes along g's eigenvectors, proportional to √eigenvalue (how far the state moves for a fixed step)
    const nx = 11, ny = 9, sp = Math.min((BOX[1] - BOX[0]) / nx, (BOX[3] - BOX[2]) / ny), E = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const c = [BOX[0] + (BOX[1] - BOX[0]) * (i + 0.5) / nx, BOX[2] + (BOX[3] - BOX[2]) * (j + 0.5) / ny], G = QM.metric(md, c);
      if (!Number.isFinite(G.tr)) continue;
      const e = QM.eig2(G.g); E.push({ c, e });
    }
    const ref = E.map(q => Math.sqrt(Math.max(q.e.l[0], 0))).sort((a, b) => a - b)[Math.floor(0.6 * (E.length - 1))] || 1;
    E.forEach(({ c, e }) => {
      const s = 0.42 * sp / ref, a = Math.min(0.48 * sp, s * Math.sqrt(Math.max(e.l[0], 0))), b = Math.min(0.48 * sp, s * Math.sqrt(Math.max(e.l[1], 0)));
      const W = [[e.v[0][0] * a, e.v[1][0] * b], [e.v[0][1] * a, e.v[1][1] * b]], pts = ellipsePts(c, W, 1, 24);
      layers.push({ type: 'line', x: pts.map(p => p[0]), y: pts.map(p => p[1]), color: 'rgba(20,35,44,.6)', width: 1.1 });
    });
    layers.push({ type: 'line', x: X.P.pts.map(p => p[0]), y: X.P.pts.map(p => p[1]), color: BLUE, width: 2.4 });
    plane.layers = layers;
    plane.overlay = { zone: HEX, points: POINTS };
    const trTxt = Number.isFinite(X.trK) ? fixed(X.trK, X.trK < 10 ? 2 : 1) : '∞';
    if (!deep) stats([
      ['Quantum metric at the dot', '', `tr g; at the valley K: ${trTxt}`],
      ['Distance travelled', '', `along the whole path: ${fixed(X.dist[NP], 3)}`],
      ['Gap', `${fixed(X.gap, 3)} t`, closed ? 'closed: plain graphene' : 'smallest energy gap between the bands'],
    ]);
    else stats([
      [`${sym('tr g')} at the dot`, '', `at K: ${trTxt}${S.ht2 === 0 && X.mK !== 0 ? ` = v²/2M² with v = 3/2` : ''}`],
      ['Distance travelled', '', `Σ arccos|⟨u_j|u_{j+1}⟩|; whole path ${fixed(X.dist[NP], 4)}`],
      [`${sym('√det g')} = ${sym('|Ω|/2')}`, '', 'exact for two bands, so tr g ≥ |Ω|'],
      ['Gap', `${fixed(X.gap, 3)} t`, `masses at K and K′: ${fixed(X.mK, 3)}, ${fixed(X.mKp, 3)}`],
    ]);
    setHTML($('dg-title'), 'The quantum metric over graphene\'s Brillouin zone');
    put('dg-cap', deep ? 'On the map: tr g of the lower band (darker is larger; saturating at the strongest peaks) and the metric\'s ellipses, axes along the eigenvectors of g, proportional to √eigenvalue; the blue line is the path. On the sphere: the state\'s direction s = −d/|d| along the path; ds = ½|dŝ|, so the quantum distance is half the length of the curve on the Bloch sphere.'
      : 'On the map: the quantum metric (darker where it is larger) over graphene\'s Brillouin zone, with the valleys K and K′ at its corners. Each small ellipse shows how far the electron\'s state moves for a short step in each direction: bigger ellipses, faster change. The black dot runs along the blue path. On the sphere: where the state points at the dot. The distance it travels is half the length of its path on the sphere.');
    legend('dg-legend', [[GOLD, 'swatch--area', 'quantum metric'], [INK, '', 'how far the state moves per step'], [BLUE, '', 'the path']]);
    setHTML($('pa-title'), closed && S.path === 'across' ? 'The odometer jumps at K' : 'The distance piles up near the valleys');
    put('pa-cap', `The quantum distance travelled along the path, ${X.P.name}. It grows fastest where the metric is largest${closed ? '; in plain graphene the state flips at K, a jump of π/2' : ', near the valleys'}.`);
    legend('pa-legend', [[INK, '', 'distance travelled']]);
    // plot B: the metric at K against the mass there
    reset(plotB);
    const ms = range(Math.log10(0.02), 0, 60).map(v => Math.pow(10, v)), lineY = ms.map(m => Math.log10(2.25 / (2 * m * m)));
    plotB.opts.xLabel = 'Mass at the valley, |m| (units of t)'; plotB.opts.yLabel = 'Metric at the valley, tr g';
    const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴' }, lf = v => (Math.abs(v - Math.round(v)) < 1e-6 ? (Math.round(v) === 0 ? '1' : Math.round(v) === 1 ? '10' : `10${String(Math.round(v)).split('').map(c => SUP[c]).join('')}`) : '');
    plotB.opts.xTickValues = [-2, -1, 0]; plotB.opts.xFormat = v => (v === -2 ? '0.01' : v === -1 ? '0.1' : '1'); plotB.opts.yFormat = lf;
    plotB.setRange([Math.log10(0.02), 0], [0, 4]);
    const LB = [{ type: 'line', x: ms.map(Math.log10), y: lineY, color: GOLD, width: 2.2 }];
    if (Math.abs(X.mK) > 1e-9) LB.push({ type: 'dots', x: [Math.log10(clamp(Math.abs(X.mK), 0.02, 1))], y: [Math.log10(X.trK)], color: INK, r: 5.5 });
    else LB.push({ type: 'text', x: -0.85, y: 3.6, text: 'm = 0: the metric at K is infinite', color: MUTED, size: 12 });
    plotB.draw(LB);
    setHTML($('pb-title'), 'Halve the gap, four times the metric');
    put('pb-cap', `The quantum metric at the valley K against the mass there, on log scales: tr g = v²/2m², with v = 3/2 t (gold). The dot is this graphene${S.ht2 ? ', whose mass at K is m = M − 3√3 t_2 sin φ' : ''}. As the gap closes the metric blows up: the signature of a quantum phase transition.`);
    legend('pb-legend', [[GOLD, '', 'v²/2m²'], [INK, '', 'this graphene']]);
    setHTML($('info'), closed
      ? `<b>Plain graphene: no gap, and the metric is infinite at K.</b> ${S.path === 'across' ? 'Crossing K the state flips at once to an orthogonal one, so the odometer jumps by π/2, the largest step there is.' : 'Wherever the path crosses a valley, the state flips and the odometer jumps by π/2.'}`
      : `<b>The metric is largest at the valleys: tr g = ${trTxt} at K.</b> There the gap is smallest, and the state turns quickly from one carbon atom to the other as k moves: over a distance of about |m|/v = ${fixed(Math.abs(X.mK) / 1.5, 2)} in k.`);
    setHTML($('path-note'), sub(deep
      ? '<b>Metric and curvature together.</b> For two bands, g_{ij} = ¼ ∂_in·∂_jn and Ω = ½ n·(∂_xn × ∂_yn), so √det g = |Ω|/2 exactly and tr g ≥ |Ω|: wherever the Berry curvature of card 1 is large, the metric is at least as large. The quantum geometric tensor Q = g − (i/2)Ω holds both.'
      : '<b>Metric and curvature go together.</b> Where the state changes fast, near the valleys, the Berry curvature of card 1 is large too: for graphene the metric is never smaller than the curvature, and the two are tied exactly, √det g = |Ω|/2.'));
    $('path-note').hidden = false;
    setHTML($('takeaway'), '<b>The quantum metric measures how fast a band\'s states change with k.</b> It piles up where the gap is small and blows up as the gap closes; in flat-band materials such as twisted bilayer graphene it even decides whether the electrons can superconduct.');
    $('plane').setAttribute('aria-label', `The quantum metric of graphene over the Brillouin zone, with a path ${X.P.name}`);
    frameFn = grapheneFrame;
    grapheneFrame(nowF());
  }

  // ---------- moving the point on the chart (tab 1) ----------
  (function () {
    const cv = $('plane');
    let drag = false;
    const keep = u => { const b = QM.SURFACES[S.surf].box, m = 0.04 * (b[1] - b[0]); return [+clamp(u[0], b[0] + m, b[1] - m).toFixed(3), +clamp(u[1], b[2] + m, b[3] - m).toFixed(3)]; };
    const at = e => { const r = cv.getBoundingClientRect(); S.u = keep(plane.toK(e.clientX - r.left, e.clientY - r.top)); later(); aimSoon(); };
    cv.addEventListener('pointerdown', e => { if (mode !== 'surface') return; drag = true; cv.setPointerCapture(e.pointerId); at(e); });
    cv.addEventListener('pointermove', e => { if (drag) at(e); });
    const end = () => { drag = false; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('keydown', e => {
      if (mode !== 'surface') return;
      const d = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] }[e.key];
      if (!d) return;
      e.preventDefault(); S.u = keep([S.u[0] + d[0], S.u[1] + d[1]]); later(); aimSoon();
    });
  })();
  // turn the surface to face the point, from the side its normal points to (a level view for flat-ish surfaces)
  function aimSurface() {
    const F = QM.frame(QM.SURFACES[S.surf], S.u), n = F.N;
    if (Math.hypot(n[0], n[1]) < 0.3) surf.setView(35 * DEG, 32 * DEG); else surf.aim(n);
  }
  let aimT = 0;
  function aimSoon() { clearTimeout(aimT); aimT = setTimeout(aimSurface, 120); }

  // ---------- controls ----------
  function syncControls() {
    const set = (id, v, txt) => { $(id).value = v; $(id + '-out').textContent = txt; $(id).setAttribute('aria-valuetext', txt); };
    set('eps', S.eps, fixed(S.eps, 2)); set('thc', S.thc, `${S.thc}°`); set('hm', S.hm, `${fixed(S.hm, 2)} t`); set('ht2', S.ht2, `${fixed(S.ht2, 3)} t`); set('hphi', S.hphi, `${S.hphi}°`);
    const pressed = (attr, val) => document.querySelectorAll(`button[data-${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === val)));
    pressed('surf', S.surf); pressed('cg', S.cg); pressed('path', S.path); pressed('depth', deep ? 'deep' : 'simple');
    document.querySelectorAll('[data-thc]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.thc === S.thc)));
    const PRE = presets();
    document.querySelectorAll('[data-preset]').forEach(b => { const p = PRE[b.dataset.preset]; b.setAttribute('aria-pressed', String(Object.keys(p).every(k => S[k] === p[k]))); });
    const HINT = { plane: 'A flat sheet, with a square grid: the chart is true to scale everywhere.', cylinder: 'A cylinder of radius 1: around, and up.', sphere: 'A sphere of radius 1, charted like a world map: longitude across, latitude up.', saddle: 'A saddle, z = (x² − y²)/2: curving up one way and down the other.' };
    $('surf-hint').textContent = HINT[S.surf];
    $('depth-hint').textContent = deep ? 'The formulas: components of g, Gauss–Bonnet, the quantum geometric tensor.' : 'The main ideas; switch to Go deeper for the formulas behind them.';
  }
  function presets() { return { gapless: { hm: 0, ht2: 0 }, gapped: { hm: 0.2, ht2: 0 }, haldane: { hm: 0, ht2: 0.1, hphi: 90 } }; }
  function render() {
    syncControls();
    if (mode === 'surface') renderSurface(); else if (mode === 'states') renderStates(); else renderGraphene();
    $('info').setAttribute('aria-live', running() ? 'off' : 'polite');
    $('plot-a').setAttribute('aria-label', $('pa-title').textContent); $('plot-b').setAttribute('aria-label', $('pb-title').textContent);
    kick();
  }
  function applyMode() {
    document.querySelectorAll('.tab').forEach(b => { const on = b.dataset.mode === mode; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $('lab').setAttribute('aria-labelledby', 'tab-' + mode);
    document.querySelectorAll('.mode-intro').forEach(el => { el.hidden = el.dataset.for !== mode; });
    document.querySelectorAll('[data-modes], [data-deep]').forEach(el => { el.hidden = !((!el.dataset.modes || el.dataset.modes.split(' ').includes(mode)) && (!('deep' in el.dataset) || deep)); });
    $('plane-box').hidden = mode === 'states'; $('bloch-box').hidden = mode !== 'states';
    $('surf-box').hidden = mode !== 'surface'; $('dial-box').hidden = mode !== 'states'; $('sphere-box').hidden = mode !== 'graphene';
    render();
    if (mode === 'surface') aimSurface();
  }
  let pending = false;
  function later() { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; render(); }); }
  [['eps', 'eps'], ['thc', 'thc'], ['hm', 'hm'], ['ht2', 'ht2'], ['hphi', 'hphi']].forEach(([id, key]) => $(id).addEventListener('input', e => { S[key] = +e.target.value; later(); }));
  document.querySelector('.lab-main').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !b.closest('.controls')) return;
    const d = b.dataset;
    if (d.surf) { S.surf = d.surf; S.u = d.surf === 'sphere' ? [0.4, 0.5] : d.surf === 'cylinder' ? [0.5, 0.2] : [0.3, -0.2]; }
    else if (d.thc) S.thc = +d.thc;
    else if (d.cg) S.cg = d.cg;
    else if (b.id === 'reroll') S.seed++;
    else if (d.preset) Object.assign(S, presets()[d.preset]);
    else if (d.path) S.path = d.path;
    else if (b.id === 'video-values') Object.assign(S, JSON.parse(JSON.stringify(START)));
    else return;
    render();
    if (mode === 'surface' && (d.surf || b.id === 'video-values')) aimSurface();
  });
  document.querySelectorAll('[data-depth]').forEach(b => b.addEventListener('click', () => {
    deep = b.dataset.depth === 'deep';
    try { localStorage.setItem('metric-depth', deep ? 'deep' : 'simple'); } catch (e) { /* not remembered: fine */ }
    applyMode();
  }));
  $('reset-view').addEventListener('click', () => { if (mode === 'surface') aimSurface(); else if (mode === 'states') bloch.setView(32 * DEG, 22 * DEG); else sphereR.setView(32 * DEG, 22 * DEG); });
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
    cyl: () => { mode = 'surface'; fresh({ surf: 'cylinder', u: [0.5, 0.2] }); },
    sad: () => { mode = 'surface'; fresh({ surf: 'saddle', u: [0, 0] }); },
    map: () => { mode = 'surface'; fresh({ surf: 'sphere', u: [0.3, +(PI / 3).toFixed(3)], eps: 0.25 }); },
    eq: () => { mode = 'states'; fresh({ thc: 90 }); },
    scr: () => { mode = 'states'; fresh({ thc: 60, cg: 'random' }); },
    cone: () => { mode = 'states'; fresh({ thc: 120 }); },
    half: () => { mode = 'graphene'; fresh({ hm: 0.2, ht2: 0, path: 'across' }); },
    flip: () => { mode = 'graphene'; fresh({ hm: 0, ht2: 0, path: 'across' }); },
  };
  document.querySelectorAll('.predict__load[data-q]').forEach(b => b.addEventListener('click', () => {
    QUESTIONS[b.dataset.q]();
    applyMode();
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }));

  syncAnim();
  applyMode();
  window.__metric = { S, render, frame: f => frameFn && frameFn(f), setMode: m => { mode = m; applyMode(); } };
})();
