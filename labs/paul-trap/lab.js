/* Paul trap lab: controls, animation, plots. Physics is in physics.js; the 3D surface and the crystal view in views.js. */
(function () {
  'use strict';
  const P = window.Paul;
  const $ = id => document.getElementById(id);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const S = {
    kx: 1, ky: -1, plane: 'xy',                 // 1. no static trap
    V: 300, f: 20, view: 'saddle',              // 2. flip the saddle (volts, MHz)
    q: 0.3, a: 0,                               // 3. stability chart
    N: 5, fz: 1, fr: 4, dir: 'axial', pick: 0,  // 4. ion crystals (MHz)
  };
  let mode = 'earnshaw';
  const T = { earnshaw: 0, flip: 0, crystal: 0 };

  // ---------- formatting ----------
  const fixed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const signed = (x, d = 2) => (x > 0.5 * Math.pow(10, -d) ? '+' : '') + fixed(x, d);
  const sig2 = x => { const p = Math.pow(10, Math.floor(Math.log10(x)) - 1); return (Math.round(x / p) * p).toLocaleString('en-US'); };
  const Q_EDGE = 0.908046;

  // ---------- views and plots ----------
  const surf = new TrapViews.SaddleView($('surface'));
  const crys = new TrapViews.CrystalView($('crystal'));
  const MARGIN = { l: 58, r: 22, t: 12, b: 42 };
  const plotA = new NanoPlot($('plot-a'), { margin: MARGIN });
  const plotB = new NanoPlot($('plot-b'), { margin: MARGIN });
  const chart = new NanoPlot($('chart'), { xLabel: 'RF strength q', yLabel: 'Steady part a', margin: { l: 58, r: 16, t: 12, b: 42 }, xTicks: 7, yTicks: 5 });

  function legend(id, items) {
    $(id).innerHTML = items.map(([color, kind, label]) => `<li style="color:${color}"><span class="swatch ${kind}"></span><span>${label}</span></li>`).join('');
  }
  function stats(items) {
    $('stats').innerHTML = items.map(([label, value, sub]) =>
      `<div class="stat"><div class="stat__label">${label}</div><div class="stat__value">${value}</div><div class="stat__sub">${sub}</div></div>`).join('');
  }
  // Write a live region only when its text changes, so screen readers are not flooded during playback.
  function setHTML(el, html) { if (el.dataset.html === html) return false; el.dataset.html = html; el.innerHTML = html; typeset(el); return true; }
  const note = html => { setHTML($('takeaway'), html); };
  const info = html => { setHTML($('info'), html); };
  const rangeLine = (f, x0, x1, n) => { const x = [], y = []; for (let i = 0; i <= n; i++) { const t = x0 + (x1 - x0) * i / n; x.push(t); y.push(f(t)); } return { x, y }; };
  // ranges with equal scales on both axes, so a circle looks round
  function squareRange(plot, half) {
    const m = plot.m, w = plot.w - m.l - m.r, h = plot.h - m.t - m.b, r = w / h;
    return r >= 1 ? [[-half * r, half * r], [-half, half]] : [[-half, half], [-half / r, half / r]];
  }

  // ---------- 1. No static trap ----------
  const U0 = 0.12, T1 = 12, HS = 0.38, AXES = ['x', 'y', 'z'];
  const PLANES = { xy: ['x', 'y'], xz: ['x', 'z'], yz: ['y', 'z'] };
  function curv() { return { x: S.kx, y: S.ky, z: Math.round(-(S.kx + S.ky) * 100) / 100 || 0 }; }
  function escape1(k) {
    let t = Infinity, ax = null;
    for (const a of AXES) { const te = P.escapeTime(k[a], U0); if (te < t) { t = te; ax = a; } }
    return { t, ax };
  }
  const end1 = () => Math.min(T1, escape1(curv()).t);
  const pos1 = (k, t) => ({ x: P.axisMotion(k.x, U0, t), y: P.axisMotion(k.y, U0, t), z: P.axisMotion(k.z, U0, t) });

  function renderEarnshaw() {
    const k = curv(), esc = escape1(k), t = T.earnshaw, lost = t >= esc.t - 1e-9;
    const [ua, va] = PLANES[S.plane], p = pos1(k, Math.min(t, esc.t));
    const trail = [];
    for (let i = 0; i <= 60; i++) { const s = Math.max(0, t - 3) + (Math.min(t, esc.t) - Math.max(0, t - 3)) * i / 60; const q = pos1(k, s); trail.push([q[ua], q[va]]); }
    surf.draw({
      f: (u, v) => HS * (k[ua] * u * u + k[va] * v * v) / 2,
      ball: lost ? null : { u: p[ua], v: p[va] }, trail: lost ? [] : trail, labels: [ua, va],
      tag: lost ? `Lost along ${esc.ax} at t = ${esc.t.toFixed(2)}/ω₀` : (t === 0 ? 'Press Play to release the ion' : ''),
      tagColor: lost ? '#b23a48' : null,
    });
    $('dg-title').textContent = `Potential energy over the ${ua}–${va} plane`;
    $('surface').setAttribute('aria-label', `Potential energy over the ${ua}–${va} plane, with the ion ${lost ? `lost along ${esc.ax}` : 'on it'}`);
    $('dg-cap').textContent = `Orange is uphill, blue downhill. The ion starts at rest, slightly off centre, and rolls. Drag the surface to turn it.${k[ua] >= 0 && k[va] >= 0 && esc.ax && !PLANES[S.plane].includes(esc.ax) ? ` This plane looks like a bowl, but the ion escapes along ${esc.ax}, out of the picture.` : ''}`;
    const hold = AXES.filter(a => k[a] > 0), push = AXES.filter(a => k[a] < 0);
    stats([
      ['Curvature along z', signed(k.z), 'k<sub>z</sub> = −(k<sub>x</sub> + k<sub>y</sub>), set by Laplace'],
      ['Directions that hold', `${hold.length} of 3`, hold.length ? `curving up along ${hold.join(' and ')}` : 'none'],
      ['Directions that push out', `${push.length} of 3`, push.length ? `sloping down along ${push.join(' and ')}` : 'none'],
      ['The ion', push.length ? `Lost along ${esc.ax}` : 'Never pushed', push.length ? `reaches the electrodes at t = ${esc.t.toFixed(2)}/ω₀` : 'every curvature is zero: no force at all'],
    ]);
    info(push.length
      ? `<b>Downhill along ${push.join(' and ')}:</b> the ion is pushed out as \\(\\cosh(\\sqrt{${fixed(-k[esc.ax])}}\\,\\omega_0 t)\\) and reaches the electrodes at \\(t=${esc.t.toFixed(2)}/\\omega_0\\). ${hold.length ? `Along ${hold.join(' and ')} it only swings back and forth.` : ''}`
      : '<b>Flat in every direction:</b> with all three curvatures zero there is no force at all, so nothing holds the ion either.');
    // plot A: potential along each axis
    const col = { x: css('--series-1'), y: css('--series-re'), z: css('--series-amber') };
    const L = AXES.map(a => { const r = rangeLine(u => k[a] * u * u / 2, -1, 1, 80); return { type: 'line', x: r.x, y: r.y, color: col[a], width: a === esc.ax && push.length ? 3 : 2.2, dash: a === 'z' ? [6, 4] : [] }; });
    plotA.opts.xLabel = 'Distance from the centre (r₀)'; plotA.opts.yLabel = 'Potential energy U / mω₀²r₀²'; plotA.opts.xTicks = 5;
    plotA.setRange([-1, 1], [-1.1, 1.1]);
    plotA.draw([{ type: 'hline', y: 0, color: css('--plot-axis'), dash: [] }, ...L]);
    $('pa-title').textContent = 'The potential along each axis';
    $('pa-cap').textContent = 'Each axis is a parabola, up (holds) or down (pushes out). The three curvatures always add up to zero.';
    legend('pa-legend', AXES.map(a => [col[a], a === 'z' ? 'swatch--dash' : '', `along ${a}: k = ${signed(k[a])}`]));
    // plot B: position along each axis against time
    const tEnd = Math.min(T1, esc.t);
    const LB = AXES.map(a => { const r = rangeLine(s => P.axisMotion(k[a], U0, s), 0, tEnd, 240); return { type: 'line', x: r.x, y: r.y, color: col[a], width: 2.2, dash: a === 'z' ? [6, 4] : [] }; });
    plotB.opts.xLabel = 'Time (1/ω₀)'; plotB.opts.yLabel = 'Position (r₀)'; plotB.opts.xTicks = 6;
    plotB.setRange([0, T1], [-1.1, 1.1]);
    plotB.draw([
      { type: 'hband', y0: 1, y1: 1.1, color: 'rgba(178, 58, 72, 0.12)' }, { type: 'hband', y0: -1.1, y1: -1, color: 'rgba(178, 58, 72, 0.12)' },
      { type: 'hline', y: 0, color: css('--plot-axis'), dash: [] },
      ...LB,
      { type: 'vline', x: Math.min(t, T1), color: css('--plot-text'), width: 1.4, dash: [] },
    ]);
    $('pb-title').textContent = 'Where the ion goes';
    $('pb-cap').textContent = 'Released from rest at 0.12 r₀ along every axis. The shaded bands are the electrodes; the vertical line is now.';
    legend('pb-legend', AXES.map(a => [col[a], a === 'z' ? 'swatch--dash' : '', a]));
    note(!push.length
      ? '<b>No force, no trap.</b> The only way to avoid a downhill direction is to make every curvature zero, and then nothing holds the ion either.'
      : push.length && hold.length === 2
      ? '<b>Two out of three is the best you can do.</b> Make a bowl in any two directions and Laplace\'s equation turns the third into a hill. Try the "End caps" example: that is half of a linear Paul trap, holding along z and pushing out across it.'
      : '<b>Try to hold the ion in all three directions.</b> Whatever you choose for k<sub>x</sub> and k<sub>y</sub>, k<sub>z</sub> moves the other way, so at least one direction slopes downhill.');
    return t;
  }

  // ---------- 2. Flip the saddle ----------
  const X0 = 0.3, Y0 = 0.2;
  let flipCache = null;
  function flipData() {
    const key = S.V + '|' + S.f;
    if (flipCache && flipCache.key === key) return flipCache;
    const q = P.qOf(S.V, S.f * 1e6), b = P.beta(0, q);
    const stable = q < Q_EDGE && b.stable;      // q above 0.908 has further stable bands, but no practical trap
    const cycles = stable ? Math.min(150, Math.max(12, 6 / b.beta)) : 40;
    const per = q > 2 ? 240 : 120;
    let x0 = X0, y0 = Y0, tr;
    if (stable) {
      // the motion is linear, so scale the start down if the swing and its jiggle would reach the electrodes
      const free = P.trajectory(0, q, X0, Y0, cycles, per, Infinity);
      let rmax = 0; free.x.forEach((v, i) => { rmax = Math.max(rmax, Math.hypot(v, free.y[i])); });
      const k = Math.min(1, 0.8 / rmax);
      x0 = X0 * k; y0 = Y0 * k;
      tr = { ...free, x: free.x.map(v => v * k), y: free.y.map(v => v * k), lost: null };
    } else tr = P.trajectory(0, q, X0, Y0, cycles, per);
    flipCache = { key, q, b, stable, x0, y0, cycles, tr, end: tr.lost !== null ? tr.lost : cycles };
    return flipCache;
  }
  function at(tr, t) {
    const s = Math.min(t * tr.perCycle, tr.t.length - 1), i = Math.floor(s), w = s - i, j = Math.min(i + 1, tr.t.length - 1);
    return [tr.x[i] + (tr.x[j] - tr.x[i]) * w, tr.y[i] + (tr.y[j] - tr.y[i]) * w];
  }

  function renderFlip() {
    const d = flipData(), { q, b, tr } = d, t = Math.min(T.flip, d.end), lost = tr.lost !== null && T.flip >= tr.lost - 1e-9;
    const stable = d.stable, sgn = -Math.cos(2 * Math.PI * t);
    const [x, y] = at(tr, t);
    const trailLen = stable ? Math.min(0.75 * 2 / b.beta, 12) : 2, trail = [];
    for (let i = 0; i <= 120; i++) { const s = Math.max(0, t - trailLen) + (t - Math.max(0, t - trailLen)) * i / 120; trail.push(at(tr, s)); }
    const saddle = S.view === 'saddle';
    surf.draw({
      f: saddle ? (u, v) => 0.3 * sgn * (u * u - v * v) : (u, v) => 0.17 * (u * u + v * v),
      ball: lost ? null : { u: x, v: y }, trail: lost ? [] : trail, labels: ['x', 'y'],
      rods: saddle ? [{ u: 1.18, v: 0, sign: sgn >= 0 ? 1 : -1 }, { u: -1.18, v: 0, sign: sgn >= 0 ? 1 : -1 }, { u: 0, v: 1.18, sign: sgn >= 0 ? -1 : 1 }, { u: 0, v: -1.18, sign: sgn >= 0 ? -1 : 1 }] : [],
      tag: lost ? `Lost: it reached the electrodes after ${tr.lost.toFixed(2)} RF periods` : (T.flip === 0 ? 'Press Play: one RF period per second at 1×' : ''),
      tagColor: lost ? '#b23a48' : null,
    });
    $('dg-title').textContent = saddle ? 'The saddle, flipping with the RF' : 'The bowl the ion feels on average';
    $('surface').setAttribute('aria-label', saddle ? `The saddle potential over the x–y plane at q = ${fixed(q, 2)}, with the ion${lost ? ' lost' : ''}` : 'The average bowl over the x–y plane, with the ion');
    $('dg-cap').textContent = saddle
      ? 'A rod marked + repels the ion, back toward the axis; a rod marked − attracts it, outward. They swap every half period. The ball is the ion, computed exactly; drag the surface, or use the arrow keys, to turn it.'
      : 'The same motion drawn on the averaged potential, the pseudopotential. The slow swing follows this bowl; the fast jiggle is what averaging leaves out.';
    const fsec = stable ? b.beta * S.f / 2 : NaN, fapp = q * S.f / (2 * Math.SQRT2), depth = P.depthEV(q, S.V);
    stats([
      ['q', fixed(q, 3), q < Q_EDGE ? 'stable while q < 0.908' : 'above 0.908: not stable'],
      ['Secular frequency', stable ? `${fixed(fsec, 2)} MHz` : '—', stable ? `exact; the bowl formula gives ${fixed(fapp, 2)} MHz` : 'the ion is not held'],
      ['Micromotion', stable ? `${Math.round(50 * q)}%` : '—', 'of the slow swing, about q/2'],
      ['Trap depth', stable ? `${fixed(depth, 1)} eV` : '—', stable ? `about ${sig2(P.evToK(depth))} K; bowl picture, qV/8` : 'no bowl to speak of'],
    ]);
    $('drive-hint').textContent = `q = 2eV/(m r₀² Ω²) = ${fixed(q, 3)} for a ⁴⁰Ca⁺ ion with r₀ = 0.5 mm.`;
    const slow = q >= 1.5, when = tr.lost !== null ? ` It reaches the electrodes after ${tr.lost.toFixed(2)} RF periods.` : ' Give it time and the ion is lost.';
    const nearer = d.x0 < X0 - 1e-9 ? ` It starts ${fixed(d.x0, 2)} r₀ from the centre, closer than usual, so that its swing fits inside the trap.` : '';
    if (!stable) info(slow
      ? `<b>Too slow:</b> at q = ${fixed(q, 2)} each half period lasts long enough for the ion to roll off the saddle before it flips.${when}`
      : `<b>Just past the edge:</b> at q = ${fixed(q, 3)} each push back overshoots, so the swing grows every RF period instead of settling.${when}`);
    else if (!saddle) info(`<b>The average bowl:</b> the push back wins because the ion is further out, where the force is stronger, during the half period that holds it. The result is a bowl with curvature set by q²/2.${nearer}`);
    else if (playing) info(`<b>The saddle flips twice every RF period.</b> The jiggle keeps the ion a little closer to the centre while it is pushed out, and a little further out while it is held, where the force is stronger. So on average the push back wins.${nearer}`);
    else info(`<b>Right now the saddle holds along ${sgn >= 0 ? 'x' : 'y'} and pushes out along ${sgn >= 0 ? 'y' : 'x'}.</b> Half an RF period later it is the other way round. The jiggle keeps the ion a little closer to the centre while it is pushed out, and a little further out while it is held, where the force is stronger. So on average the push back wins.${nearer}`);
    // plot A: x(t), exact and the slow swing alone
    const x1 = d.x0 / (1 - q / 2), ba = q / Math.SQRT2;
    const shown = Math.min(d.cycles, Math.max(d.end, 1));
    const step = Math.max(1, Math.floor(tr.t.length / 2400)), tx = [], xx = [];
    for (let i = 0; i < tr.t.length; i += step) { tx.push(tr.t[i]); xx.push(tr.x[i]); }
    const amp = Math.max(0.4, Math.min(1.05, 1.15 * Math.max(...tr.x.map(Math.abs))));
    const LA = [{ type: 'hline', y: 0, color: css('--plot-axis'), dash: [] }];
    if (stable) { const g = rangeLine(s => x1 * Math.cos(ba * Math.PI * s), 0, shown, 600); LA.push({ type: 'line', x: g.x, y: g.y, color: css('--series-amber'), width: 2, dash: [6, 4] }); }
    LA.push({ type: 'line', x: tx, y: xx, color: css('--series-1'), width: 1.8 });
    LA.push({ type: 'vline', x: t, color: css('--plot-text'), width: 1.4, dash: [] });
    plotA.opts.xLabel = 'Time (RF periods)'; plotA.opts.yLabel = 'x / r₀'; plotA.opts.xTicks = 6;
    plotA.setRange([0, shown], [-amp, amp]);
    plotA.draw(LA);
    $('pa-title').textContent = 'Slow swing, fast jiggle';
    $('pa-cap').textContent = stable ? `Solid: the exact motion along x. Dashed: the slow swing alone, at the bowl-picture frequency. One swing takes about ${fixed(2 / b.beta, 1)} RF periods.` : 'The exact motion along x. Without a stable bowl, nothing brings the ion back.';
    legend('pa-legend', [[css('--series-1'), '', 'exact (Mathieu)'], ...(stable ? [[css('--series-amber'), 'swatch--dash', 'slow swing, bowl picture']] : [])]);
    // plot B: path in the x-y plane
    const ix = Math.min(tr.t.length - 1, Math.round(t * tr.perCycle)), px = [], py = [];
    for (let i = 0; i <= ix; i += Math.max(1, Math.floor(ix / 2400))) { px.push(tr.x[i]); py.push(tr.y[i]); }
    px.push(x); py.push(y);
    const circ = rangeLine(s => Math.sin(s), 0, 2 * Math.PI, 120), cx = rangeLine(s => Math.cos(s), 0, 2 * Math.PI, 120).y;
    const [xr, yr] = squareRange(plotB, 1.08);
    plotB.opts.xLabel = 'x / r₀'; plotB.opts.yLabel = 'y / r₀'; plotB.opts.xTicks = 5;
    plotB.setRange(xr, yr);
    plotB.draw([
      { type: 'line', x: cx, y: circ.y, color: 'rgba(178, 58, 72, 0.55)', width: 1.5, dash: [5, 4] },
      { type: 'line', x: tr.x.filter((_, i) => i % 4 === 0), y: tr.y.filter((_, i) => i % 4 === 0), color: 'rgba(159, 177, 186, 0.45)', width: 1 },
      { type: 'line', x: px, y: py, color: css('--series-1'), width: 1.6 },
      ...(lost ? [] : [{ type: 'dots', x: [x], y: [y], color: css('--series-1'), r: 5.5 }]),
    ]);
    $('pb-title').textContent = 'The path seen from the end of the trap';
    $('pb-cap').textContent = 'Grey: the whole computed path. Coloured: up to now. The dashed circle is the electrodes, r = r₀.';
    legend('pb-legend', []);
    note(stable
      ? `<b>Fast flipping makes a bowl.</b> Here one slow swing lasts ${fixed(2 / b.beta, 1)} RF periods, so the saddle flips ${fixed(4 / b.beta, 0)} times per swing. Raise the frequency and q falls as 1/Ω²: the motion gets smoother, but the bowl gets shallower too.`
      : q >= 1.5 ? '<b>The flip is too slow for the push-out to be undone.</b> Raise the frequency, or lower the voltage, until q drops below 0.908.'
      : '<b>The drive is a little too strong.</b> Lower the voltage, or raise the frequency, until q drops below 0.908.');
    return t;
  }

  // ---------- 3. Stability chart ----------
  let geom = null;
  function geometry() {
    if (geom) return geom;
    const qs = [], a0 = [], b1 = [];
    for (let i = 0; i <= 120; i++) { const q = i / 100, e = P.edges(q, 1e-7, 120); qs.push(q); a0.push(e.a0); b1.push(e.b1); }
    const rev = a => a.slice().reverse();
    const band = (lo, hi) => ({ x: qs.concat(rev(qs)), y: hi.concat(rev(lo)) });
    const bq = [], up = [], lo = [];
    qs.forEach((q, i) => { const u = Math.min(b1[i], -a0[i]), l = Math.max(a0[i], -b1[i]); if (u >= l) { bq.push(q); up.push(u); lo.push(l); } });
    geom = {
      xb: band(a0, b1), yb: band(b1.map(v => -v), a0.map(v => -v)),
      both: { x: bq.concat([Q_EDGE], rev(bq)), y: up.concat([0], rev(lo)) },
    };
    return geom;
  }
  let betaCurveCache = null;
  function betaCurves(a) {
    if (betaCurveCache && betaCurveCache.a === a) return betaCurveCache;
    const q = [], bx = [], by = [];
    for (let i = 0; i <= 120; i++) { const qq = i / 100; q.push(qq); bx.push(P.beta(a, qq).beta); by.push(P.beta(-a, -qq).beta); }
    betaCurveCache = { a, q, bx, by };
    return betaCurveCache;
  }

  function renderChart() {
    const g = geometry(), brand = css('--series-1'), blue = css('--series-re'), amber = css('--series-amber');
    const bx = P.beta(S.a, S.q), by = P.beta(-S.a, -S.q), ok = bx.stable && by.stable;
    chart.setRange([0, 1.2], [-0.4, 0.4]);
    chart.draw([
      { type: 'poly', x: g.xb.x, y: g.xb.y, fill: 'rgba(196, 122, 18, 0.16)' },
      { type: 'poly', x: g.yb.x, y: g.yb.y, fill: 'rgba(31, 111, 180, 0.15)' },
      { type: 'poly', x: g.both.x, y: g.both.y, fill: NanoPlot.alpha(brand, 0.42), color: brand, width: 1.6 },
      { type: 'hline', y: 0, color: css('--plot-axis'), dash: [] },
      { type: 'vline', x: Q_EDGE, color: css('--plot-text'), width: 1, dash: [3, 4] },
      { type: 'text', x: 0.5, y: 0.05, text: 'trapped', color: '#4a0f2e', weight: 800, size: 13 },
      { type: 'text', x: 1.06, y: 0.37, text: 'only y stable', color: blue },
      { type: 'text', x: 1.06, y: -0.2, text: 'only x stable', color: amber },
      { type: 'dots', x: [S.q], y: [S.a], color: '#14232c', r: 7.5 },
      { type: 'dots', x: [S.q], y: [S.a], color: ok ? '#3d9a4f' : '#d9495f', r: 4.5 },
    ]);
    legend('chart-legend', [[brand, 'swatch--area', 'both stable: trapped'], [amber, 'swatch--area', 'x stable'], [blue, 'swatch--area', 'y stable'], [css('--plot-text'), 'swatch--dash', 'q = 0.908']]);
    $('dg-title').textContent = 'The stability chart';
    $('dg-cap').textContent = 'Click to place the operating point. Along x the ion feels (a, q); along y, (−a, −q). The dark region, where both are stable, is the trap.';
    const verdict = ok ? 'Trapped' : !bx.stable && !by.stable ? 'Lost along x and y' : !bx.stable ? 'Lost along x' : 'Lost along y';
    const fs = b => `${fixed(b * S.f / 2, 2)} MHz at Ω/2π = ${S.f} MHz`;
    stats([
      ['q and a', `${fixed(S.q, 3)}, ${fixed(S.a, 3)}`, 'the operating point'],
      ['Along x', bx.stable ? `β = ${fixed(bx.beta, 3)}` : 'Unstable', bx.stable ? fs(bx.beta) : `transfer-matrix trace ${fixed(bx.tr, 2)}, beyond ±2`],
      ['Along y', by.stable ? `β = ${fixed(by.beta, 3)}` : 'Unstable', by.stable ? fs(by.beta) : `transfer-matrix trace ${fixed(by.tr, 2)}, beyond ±2`],
      ['Verdict', verdict, ok ? 'both directions stable' : 'the motion grows every RF period'],
    ]);
    let msg;
    if (ok) msg = `<b>Trapped.</b> The ion swings at β<sub>x</sub>Ω/2 along x and β<sub>y</sub>Ω/2 along y${Math.abs(S.a) > 0.0025 ? `; the steady part makes ${S.a > 0 ? 'x' : 'y'} the stiffer direction` : ''}. The bowl formula √(a + q²/2) gives ${fixed(P.betaApprox(S.a, S.q) || 0, 3)} for x${S.q > 0.5 ? ', already off at this q' : ''}.`;
    else {
      // for each lost direction, say which edge of the stable band it crossed, using the exact edges
      const e = P.edges(S.q, 1e-7, 120), why = (dir, ad) => ad <= e.a0
        ? `<b>Lost along ${dir}.</b> The steady part adds a static hill of curvature ${fixed(-ad, 3)} along ${dir}, steeper than the RF bowl can hold at this q: the limit is ${fixed(-e.a0, 3)} (the bowl formula q²/2 would say ${fixed(S.q * S.q / 2, 3)}).`
        : `<b>Lost along ${dir}.</b> The RF overshoots: the motion along ${dir} reaches half the drive frequency and locks to it, so every kick adds to the swing.`;
      msg = [!bx.stable ? why('x', S.a) : '', !by.stable ? why('y', -S.a) : ''].filter(Boolean).join(' ');
    }
    info(msg);
    // plot A: the motion at this operating point
    const tr = P.trajectory(S.a, S.q, 0.05, 0.05, 30, 120);
    const amp = Math.max(0.08, Math.min(1.05, 1.15 * Math.max(...tr.x.map(Math.abs), ...tr.y.map(Math.abs))));
    plotA.opts.xLabel = 'Time (RF periods)'; plotA.opts.yLabel = 'Position (r₀)'; plotA.opts.xTicks = 6;
    plotA.setRange([0, 30], [-amp, amp]);
    plotA.draw([
      { type: 'hline', y: 0, color: css('--plot-axis'), dash: [] },
      { type: 'line', x: tr.t, y: tr.y, color: blue, width: 1.6, dash: [5, 3] },
      { type: 'line', x: tr.t, y: tr.x, color: brand, width: 1.8 },
    ]);
    $('pa-title').textContent = 'The motion at this point';
    $('pa-cap').textContent = tr.lost !== null ? `Started at rest, 0.05 r₀ off centre. It reached the electrodes after ${tr.lost.toFixed(1)} RF periods.` : 'Started at rest, 0.05 r₀ off centre, for 30 RF periods.';
    legend('pa-legend', [[brand, '', 'x'], [blue, 'swatch--dash', 'y']]);
    // plot B: beta against q at this a
    const bc = betaCurves(S.a);
    const ax = rangeLine(q => P.betaApprox(S.a, q), 0, 1.2, 240), ay = rangeLine(q => P.betaApprox(-S.a, q), 0, 1.2, 240);
    plotB.opts.xLabel = 'RF strength q'; plotB.opts.yLabel = 'β = ω / (Ω_RF / 2)'; plotB.opts.xTicks = 6;
    plotB.setRange([0, 1.2], [0, 1.05]);
    plotB.draw([
      { type: 'hline', y: 1, color: css('--plot-axis'), dash: [4, 4] },
      { type: 'line', x: ax.x, y: ax.y, color: brand, width: 1.4, dash: [2, 3] },
      { type: 'line', x: ay.x, y: ay.y, color: blue, width: 1.4, dash: [2, 3] },
      { type: 'line', x: bc.q, y: bc.by, color: blue, width: 2.2, dash: [6, 4] },
      { type: 'line', x: bc.q, y: bc.bx, color: brand, width: 2.4 },
      { type: 'vline', x: S.q, color: css('--plot-text'), width: 1.4, dash: [] },
      ...(bx.stable ? [{ type: 'dots', x: [S.q], y: [bx.beta], color: brand, r: 5 }] : []),
      ...(by.stable ? [{ type: 'dots', x: [S.q], y: [by.beta], color: blue, r: 5 }] : []),
    ]);
    $('pb-title').textContent = `Secular frequency along a = ${fixed(S.a, 3)}`;
    $('pb-cap').textContent = 'Thick: exact β from the transfer matrix, where the motion is stable. Dotted: the bowl formula √(±a + q²/2), good only for small q.';
    legend('pb-legend', [[brand, '', 'x, exact'], [blue, 'swatch--dash', 'y, exact'], [css('--plot-text'), 'swatch--dot', 'bowl formula']]);
    note('<b>A mass filter uses the same chart.</b> Fix the ratio of steady to RF voltage and every ion mass lands on one straight line through the origin, at a different distance along it. Set the line just below the tip and only a narrow band of masses is stable in both directions.');
    return 0;
  }

  // ---------- 4. Ion crystals ----------
  const CRYS_HZ = 0.6;            // the axial frequency is shown at 0.6 cycles per second at 1x
  let mirror = 1, hot = null, fillTimer = 0;
  const zigCache = {}, crysCache = new Map();
  const bNow = () => S.fr / S.fz;
  function crystalOf(N, b) {
    const key = N + '|' + b.toFixed(6);
    if (!crysCache.has(key)) {
      if (crysCache.size > 600) crysCache.clear();
      const c = P.crystal(N, b), md = P.modes(c.z, c.x, b);
      md.forEach(m => { m.dir = m.axial >= 0.5 ? 'axial' : 'radial'; });
      crysCache.set(key, { c, md });
    }
    return crysCache.get(key);
  }
  const cached = (N, b) => crysCache.get(N + '|' + b.toFixed(6));
  // the plots need every N; compute the missing ones just after the current render
  function fillLater() {
    clearTimeout(fillTimer);
    const b = bNow();
    if ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every(N => cached(N, b))) return;
    fillTimer = setTimeout(() => {
      if (bNow() !== b) return;
      for (let N = 1; N <= 10; N++) crystalOf(N, b);
      if (mode === 'crystal' && !playing) render();
    }, 90);
  }
  const zigRatio = N => (N in zigCache ? zigCache[N] : (zigCache[N] = P.zigzagRatio(N)));
  function modeList(md, dir) { return md.filter(m => m.dir === dir); }
  function modeName(list, k, dir, zig, N, b) {
    const w = list[k].w;
    if (Math.abs(w - 1) < 1e-6 && dir === 'axial') return { long: 'centre of mass', short: 'COM' };   // exact in any crystal
    if (Math.abs(w - b) < 1e-6 && dir === 'radial') return { long: 'centre of mass', short: 'COM' };
    if (zig) return { long: `mode ${k + 1}`, short: `${k + 1}` };
    if (dir === 'axial') return k === 0 ? { long: 'centre of mass', short: 'COM' } : k === 1 ? { long: 'breathing', short: 'breathing' } : { long: `mode ${k + 1}`, short: `${k + 1}` };
    if (k === list.length - 1) return { long: 'centre of mass', short: 'COM' };
    if (k === 0) return N === 2 ? { long: 'rocking', short: 'rocking' } : { long: 'zigzag', short: 'zigzag' };
    return { long: `mode ${k + 1}`, short: `${k + 1}` };
  }
  function frameOf(c) {
    const zmax = Math.max(...c.z.map(Math.abs)), xmax = Math.max(...c.x.map(Math.abs));
    return { z: zmax + 1, x: Math.max(xmax + 0.8, 1.1) };
  }
  function selected(cur) {
    const list = modeList(cur.md, S.dir);
    if (!list.length) S.dir = S.dir === 'axial' ? 'radial' : 'axial';
    const L = modeList(cur.md, S.dir);
    S.pick = Math.max(0, Math.min(S.pick, L.length - 1));
    return { list: L, m: L[S.pick] };
  }

  function startHot() {
    const cur = crystalOf(S.N, bNow()), fr = frameOf(cur.c), N = S.N, z = [], x = [];
    for (let i = 0; i < N; i++) {
      for (let tries = 0; tries < 200; tries++) {
        const zz = (Math.random() * 2 - 1) * fr.z * 0.85, xx = (Math.random() * 2 - 1) * Math.min(fr.x, 1.6) * 0.6;
        if (z.every((zj, j) => Math.hypot(zz - zj, xx - x[j]) > 0.6)) { z.push(zz); x.push(xx); break; }
        if (tries === 199) { z.push(zz); x.push(xx); }
      }
    }
    const g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.6;
    hot = { z, x, vz: z.map(g), vx: x.map(g), t: 0 };
  }
  function accel(h, b) {
    const N = h.z.length, az = h.z.map(v => -v), ax = h.x.map(v => -b * b * v);
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const dz = h.z[i] - h.z[j], dx = h.x[i] - h.x[j], r = Math.max(Math.hypot(dz, dx), 0.05), r3 = r * r * r;
      az[i] += dz / r3; ax[i] += dx / r3; az[j] -= dz / r3; ax[j] -= dx / r3;
    }
    return [az, ax];
  }
  function stepHot(simT) {
    const b = S.fr / S.fz, gamma = 0.32, dt = 0.004, n = Math.ceil(simT / dt), h = hot;
    for (let s = 0; s < n; s++) {
      const [az, ax] = accel(h, b);
      for (let i = 0; i < h.z.length; i++) {
        h.vz[i] += dt * (az[i] - gamma * h.vz[i]); h.vx[i] += dt * (ax[i] - gamma * h.vx[i]);
        h.z[i] += dt * h.vz[i]; h.x[i] += dt * h.vx[i];
      }
    }
    h.t += n * dt;
    const vmax = Math.max(...h.vz.map(Math.abs), ...h.vx.map(Math.abs));
    return h.t > 8 && vmax < 0.004;
  }
  function settle() {
    // keep the zigzag the way the cooled ions chose it
    const cur = crystalOf(S.N, bNow()).c, order = hot.z.map((v, i) => i).sort((i, j) => hot.z[i] - hot.z[j]);
    let dot = 0; order.forEach((i, k) => { dot += hot.x[i] * cur.x[k]; });
    mirror = dot < 0 ? -1 : 1;
    hot = null;
  }

  function renderCrystal() {
    const b = bNow(), cur = crystalOf(S.N, b), { c, md } = cur, N = S.N;
    const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => cached(n, b));
    fillLater();
    const ell = P.lengthScale(S.fz * 1e6) * 1e6, crit = zigRatio(N);
    const { list, m } = selected(cur);
    const nm = modeName(list, S.pick, S.dir, c.zigzag, N, b);
    // mode chips
    const chipHtml = list.map((mm, k) => { const n2 = modeName(list, k, S.dir, c.zigzag, N, b); return `<button class="chip-btn" type="button" data-pick="${k}" aria-pressed="${k === S.pick}">${n2.short} · ${fixed(mm.w * S.fz, 2)} MHz</button>`; }).join('');
    if ($('mode-chips').dataset.html !== chipHtml) { $('mode-chips').innerHTML = chipHtml; $('mode-chips').dataset.html = chipHtml; }
    document.querySelectorAll('#mdir [data-dir]').forEach(bt => { bt.setAttribute('aria-pressed', String(bt.dataset.dir === S.dir)); bt.disabled = !modeList(md, bt.dataset.dir).length; });
    // positions to draw
    const fr = frameOf(c);
    let dmin = Infinity; for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) dmin = Math.min(dmin, Math.hypot(c.z[i] - c.z[j], c.x[i] - c.x[j]));
    const A = 0.22 * Math.min(dmin, 1.2) / Math.max(...m.v.map(Math.abs));
    let ions, arrows = null, tag = '';
    if (hot) { ions = hot.z.map((z, i) => [z, hot.x[i]]); tag = `Laser cooling… ${(hot.t / (2 * Math.PI)).toFixed(1)} axial periods`; }
    else {
      const ph = playing ? Math.sin(2 * Math.PI * CRYS_HZ * m.w * T.crystal) : 0;
      ions = c.z.map((z, i) => [z + A * m.v[i] * ph, mirror * (c.x[i] + A * m.v[N + i] * ph)]);
      if (!playing) arrows = c.z.map((_, i) => [A * 1.6 * m.v[i], mirror * A * 1.6 * m.v[N + i]]);
      tag = `${nm.long.startsWith('mode') ? 'Mode ' + nm.long.slice(5) : nm.long + ' mode'}, ${fixed(m.w * S.fz, 2)} MHz`;
    }
    crys.draw({ ions, frame: fr, lUm: ell, arrows, tag });
    $('dg-title').textContent = N === 1 ? 'One ion in the trap' : c.zigzag ? `${N} ions: a zigzag` : `${N} ions: a straight string`;
    $('dg-cap').textContent = hot ? 'Hot ions fly around the trap; a friction term, standing in for laser cooling, drains their energy until they freeze in place.' : 'Seen from the side, like a camera image of the ions\' fluorescence. Orange arrows: how each ion moves in the selected mode. Press Play to set it vibrating.';
    const len = (Math.max(...c.z) - Math.min(...c.z)) * ell;
    stats([
      ['Ions', `${N}`, N > 1 ? `${fixed(len, 1)} µm from end to end` : 'one ion, on the axis'],
      ['Closest pair', N > 1 ? `${fixed(dmin * ell, 1)} µm` : '—', `length scale ℓ = ${fixed(ell, 2)} µm`],
      ['Shape', N === 1 ? 'A single ion' : c.zigzag ? 'Zigzag' : 'Straight', N > 1 ? `straight while ω<sub>r</sub>/2π > ${fixed(crit * S.fz, 2)} MHz` : 'nothing to line up'],
      ['Selected mode', `${fixed(m.w * S.fz, 2)} MHz`, `${nm.long}, ${fixed(m.w, 3)} × ω<sub>z</sub>`],
    ]);
    const what = c.zigzag ? '' : S.dir === 'axial'
      ? (S.pick === 0 ? 'All ions move together, like one heavy particle: this is the bus mode of the trapped-ion lab.' : S.pick === 1 ? 'The string stretches and squeezes; each ion moves in proportion to its distance from the centre.' : 'Higher modes split the string into more and more groups of ions moving in opposite directions.')
      : (nm.short === 'COM' ? 'All ions move together across the axis, at exactly ω<sub>r</sub>.' : nm.short === 'zigzag' || nm.short === 'rocking' ? `Neighbours move in opposite directions. This mode softens toward zero as ω<sub>r</sub>/2π approaches ${fixed(crit * S.fz, 2)} MHz, and then the string buckles.` : 'Ions move across the axis with different amplitudes.');
    info(hot ? '<b>Cooling:</b> the ions lose energy every swing until the bowl and their repulsion balance.'
      : c.zigzag ? `<b>Zigzag:</b> the radial grip, ω<sub>r</sub>/ω<sub>z</sub> = ${fixed(b, 2)}, is below the ${fixed(crit, 2)} that ${N} ions need, so the crowded middle ions escape sideways. The modes now mix both directions.`
      : `<b>${nm.long[0].toUpperCase() + nm.long.slice(1)} mode, ${fixed(m.w, 3)} ω<sub>z</sub>:</b> ${what}`);
    // plot A: mode frequencies for 1 to 10 ions
    const brand = css('--series-1'), blue = css('--series-re'), amber = css('--series-amber');
    const axN = [], axF = [], raN = [], raF = [];
    let fmax = 0;
    all.forEach((s, k) => s && s.md.forEach(mm => { const fq = mm.w * S.fz; fmax = Math.max(fmax, fq); if (mm.dir === 'axial') { axN.push(k + 1); axF.push(fq); } else { raN.push(k + 1); raF.push(fq); } }));
    plotA.opts.xLabel = 'Number of ions N'; plotA.opts.yLabel = 'Mode frequency (MHz)'; plotA.opts.xTicks = 10;
    fmax = Math.max(fmax, ...md.map(mm => mm.w * S.fz));
    plotA.setRange([0.5, 10.5], [0, fmax * 1.06]);
    plotA.draw([
      { type: 'vband', x0: N - 0.4, x1: N + 0.4, color: NanoPlot.alpha(brand, 0.08) },
      { type: 'hline', y: S.fz, color: NanoPlot.alpha(brand, 0.5), dash: [4, 4] },
      { type: 'hline', y: Math.sqrt(3) * S.fz, color: NanoPlot.alpha(brand, 0.5), dash: [4, 4] },
      { type: 'dots', x: raN, y: raF, color: blue, r: 3.4 },
      { type: 'dots', x: axN, y: axF, color: brand, r: 3.4 },
      { type: 'dots', x: [N], y: [m.w * S.fz], color: amber, r: 6.5 },
    ]);
    $('pa-title').textContent = 'Mode frequencies for 1 to 10 ions';
    $('pa-cap').innerHTML = 'Each dot is one normal mode. Dashed: ω<sub>z</sub> and √3 ω<sub>z</sub>, where the centre-of-mass and breathing modes along the axis stay, whatever N, as long as the string is straight. Orange: the selected mode.';
    legend('pa-legend', [[brand, 'swatch--stem', 'mostly along the axis'], [blue, 'swatch--stem', 'mostly across it'], [amber, 'swatch--stem', 'selected']]);
    // plot B: positions along the axis for 1 to 10 ions
    const pz = [], pn = [], cz = [], cn = [];
    let zmax = 0;
    all.forEach((s, k) => s && s.c.z.forEach(z => { zmax = Math.max(zmax, Math.abs(z) * ell); if (k + 1 === N) { cz.push(z * ell); cn.push(k + 1); } else { pz.push(z * ell); pn.push(k + 1); } }));
    plotB.opts.xLabel = 'Position along the axis (µm)'; plotB.opts.yLabel = 'Number of ions N'; plotB.opts.xTicks = 7;
    plotB.setRange([-zmax * 1.08, zmax * 1.08], [0.4, 10.6]);
    plotB.draw([
      { type: 'hband', y0: N - 0.4, y1: N + 0.4, color: NanoPlot.alpha(brand, 0.08) },
      { type: 'vline', x: 0, color: css('--plot-axis'), dash: [] },
      { type: 'dots', x: pz, y: pn, color: css('--series-ghost'), r: 3.6 },
      { type: 'dots', x: cz, y: cn, color: brand, r: 5 },
    ]);
    $('pb-title').textContent = 'Where the ions sit';
    $('pb-cap').innerHTML = `Equilibrium positions along the axis at ω<sub>z</sub>/2π = ${fixed(S.fz, 2)} MHz. The string is densest in the middle, where the push from both sides is largest.`;
    legend('pb-legend', []);
    note(N > 1 && !c.zigzag
      ? '<b>From crystal to quantum bus:</b> each of these modes is a quantum harmonic oscillator. The centre-of-mass mode, shared by every ion, is the oscillator whose phonons \\(|n_p\\rangle\\) the trapped-ion lab uses to link qubits.'
      : N === 1 ? '<b>Add ions</b> and watch them line up: the end caps push them together and their charges push them apart.'
      : '<b>Raise ω<sub>r</sub></b> (a stronger RF) or lower ω<sub>z</sub> to pull the zigzag back into a straight string. Quantum computers keep their ions in a line.');
    return 0;
  }

  // ---------- MathJax for notes that contain maths ----------
  function typeset(el) { if (window.MathJax && MathJax.typesetPromise && /\\\(/.test(el.innerHTML)) MathJax.typesetPromise([el]).catch(() => {}); }

  // ---------- render ----------
  function syncControls() {
    $('kx').value = S.kx; $('kx-out').textContent = signed(S.kx);
    $('ky').value = S.ky; $('ky-out').textContent = signed(S.ky);
    const k = curv(), bar = (name, v, note2) => {
      const w = Math.min(Math.abs(v), 2) / 2 * 50, left = v >= 0 ? 50 : 50 - w;
      return `<div class="kbar"><span class="kbar__name">${name}</span><span class="kbar__track"><span class="kbar__fill" style="left:${left}%;width:${w}%;background:${v > 0 ? css('--series-1') : css('--series-amber')}"></span></span><span class="kbar__val">${signed(v)}</span></div>${note2 || ''}`;
    };
    $('kz-readout').innerHTML = '<div class="kbars">' + bar('k<sub>x</sub>', k.x) + bar('k<sub>y</sub>', k.y) + bar('k<sub>z</sub>', k.z) + '</div><div class="ctrl__hint">k<sub>z</sub> = −(k<sub>x</sub> + k<sub>y</sub>) is set by Laplace\'s equation. Bars to the right hold the ion; bars to the left push it out.</div>';
    document.querySelectorAll('[data-curv]').forEach(bt => { const [a, b] = bt.dataset.curv.split(',').map(Number); bt.setAttribute('aria-pressed', String(a === S.kx && b === S.ky)); });
    document.querySelectorAll('#plane [data-plane]').forEach(bt => bt.setAttribute('aria-pressed', String(bt.dataset.plane === S.plane)));
    $('volt').value = S.V; $('volt-out').textContent = `${S.V} V`;
    $('freq').value = S.f; $('freq-out').textContent = `${fixed(S.f, 1)} MHz`;
    document.querySelectorAll('[data-drive]').forEach(bt => { const [v, f] = bt.dataset.drive.split(',').map(Number); bt.setAttribute('aria-pressed', String(v === S.V && f === S.f)); });
    document.querySelectorAll('#view [data-view]').forEach(bt => bt.setAttribute('aria-pressed', String(bt.dataset.view === S.view)));
    $('qq').value = S.q; $('qq-out').textContent = fixed(S.q, 3);
    $('aa').value = S.a; $('aa-out').textContent = fixed(S.a, 3);
    $('nions').value = S.N; $('nions-out').textContent = S.N;
    $('fz').value = S.fz; $('fz-out').textContent = `${fixed(S.fz, 2)} MHz`;
    $('fr').min = frMin(); $('fr').value = S.fr; $('fr-out').textContent = `${fixed(S.fr, 1)} MHz`;
  }

  function render() {
    syncControls();
    $('surface-box').hidden = !(mode === 'earnshaw' || mode === 'flip');
    $('chart-box').hidden = mode !== 'chart'; $('chart-legend').hidden = mode !== 'chart';
    $('crystal-box').hidden = mode !== 'crystal';
    if (mode === 'earnshaw') renderEarnshaw();
    else if (mode === 'flip') renderFlip();
    else if (mode === 'chart') renderChart();
    else renderCrystal();
    $('play').textContent = playing ? '❚❚ Pause' : '▶ Play';
    $('time-out').textContent = mode === 'earnshaw' ? `t = ${fixed(T.earnshaw, 2)}/ω₀` : mode === 'flip' ? `${fixed(Math.min(T.flip, flipData().end), 2)} RF periods` : hot ? `${fixed(hot.t / (2 * Math.PI), 1)} periods` : '';
    $('transport-note').textContent = mode === 'earnshaw' ? 'Time in units of 1/ω₀; one unit per second at 1×.'
      : mode === 'flip' ? `One RF period per second at 1×. In the real trap it lasts ${fixed(1000 / S.f, 0)} ns.`
      : 'Slowed down about a million times: the axial frequency is shown at 0.6 cycles per second at 1×.';
    $('lab-status').textContent = mode === 'chart' ? 'The chart is computed in your browser when the tab first opens.' : '';
  }

  function applyMode() {
    document.querySelectorAll('.tab').forEach(b => {
      const on = b.dataset.mode === mode;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    $('lab').setAttribute('aria-labelledby', 'tab-' + mode);
    document.querySelectorAll('.mode-intro').forEach(el => { el.hidden = el.dataset.for !== mode; });
    document.querySelectorAll('[data-modes]').forEach(el => { el.hidden = !el.dataset.modes.split(' ').includes(mode); });
    $('transport-panel').hidden = mode === 'chart';
    render();
  }

  // ---------- playback ----------
  let playing = false, raf = 0, lastT = 0, speed = 1;
  function endOf() { return mode === 'earnshaw' ? end1() : mode === 'flip' ? flipData().end : Infinity; }
  function advance(s) {
    if (mode === 'earnshaw') { T.earnshaw = Math.min(end1(), T.earnshaw + s); if (T.earnshaw >= end1()) stop(); }
    else if (mode === 'flip') { const e = flipData().end; T.flip = Math.min(e, T.flip + s); if (T.flip >= e) stop(); }
    else if (mode === 'crystal') {
      if (hot) { if (stepHot(s * 2 * Math.PI * CRYS_HZ)) { settle(); stop(); } }
      else T.crystal += s;
    }
  }
  function frame(now) {
    if (!playing) return;
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    advance(dt * speed);
    render();
    if (playing) raf = requestAnimationFrame(frame);
  }
  function stop() { playing = false; cancelAnimationFrame(raf); }
  function play() {
    if (mode !== 'crystal' && T[mode] >= endOf() - 1e-9) T[mode] = 0;
    if (reduceMotion) {
      if (mode === 'crystal') { if (hot) { while (!stepHot(5)); settle(); } }
      else T[mode] = endOf();
      render(); return;
    }
    playing = true; lastT = performance.now(); raf = requestAnimationFrame(frame); render();
  }
  $('play').addEventListener('click', () => { if (playing) { stop(); render(); } else play(); });
  $('speed').addEventListener('change', e => { speed = +e.target.value; });
  $('reset').addEventListener('click', () => { stop(); if (mode === 'crystal') { hot = null; T.crystal = 0; } else T[mode] = 0; render(); });
  $('hot').addEventListener('click', () => { stop(); startHot(); play(); });

  // ---------- controls ----------
  const restart = m => { stop(); T[m] = 0; };
  ['kx', 'ky'].forEach(id => $(id).addEventListener('input', e => { S[id] = +e.target.value; restart('earnshaw'); render(); }));
  document.querySelectorAll('[data-curv]').forEach(bt => bt.addEventListener('click', () => { [S.kx, S.ky] = bt.dataset.curv.split(',').map(Number); restart('earnshaw'); render(); }));
  document.querySelectorAll('#plane [data-plane]').forEach(bt => bt.addEventListener('click', () => { S.plane = bt.dataset.plane; render(); }));
  $('volt').addEventListener('input', e => { S.V = +e.target.value; restart('flip'); render(); });
  $('freq').addEventListener('input', e => { S.f = +e.target.value; restart('flip'); render(); });
  document.querySelectorAll('[data-drive]').forEach(bt => bt.addEventListener('click', () => { [S.V, S.f] = bt.dataset.drive.split(',').map(Number); restart('flip'); render(); }));
  document.querySelectorAll('#view [data-view]').forEach(bt => bt.addEventListener('click', () => { S.view = bt.dataset.view; render(); }));
  $('qq').addEventListener('input', e => { S.q = +e.target.value; render(); });
  $('aa').addEventListener('input', e => { S.a = +e.target.value; render(); });
  document.querySelectorAll('[data-point]').forEach(bt => bt.addEventListener('click', () => {
    if (bt.dataset.point === 'tab2') { S.q = Math.min(1.2, Math.round(P.qOf(S.V, S.f * 1e6) / 0.005) * 0.005); S.a = 0; }
    else [S.q, S.a] = bt.dataset.point.split(',').map(Number);
    render();
  }));
  $('chart').addEventListener('click', e => {
    const r = e.currentTarget.getBoundingClientRect(), m = chart.m;
    const q = chart.xr[0] + (e.clientX - r.left - m.l) / (chart.w - m.l - m.r) * (chart.xr[1] - chart.xr[0]);
    const a = chart.yr[0] + (chart.h - m.b - (e.clientY - r.top)) / (chart.h - m.t - m.b) * (chart.yr[1] - chart.yr[0]);
    if (q < 0 || q > 1.2 || a < -0.4 || a > 0.4) return;
    S.q = Math.round(q / 0.005) * 0.005; S.a = Math.round(a / 0.005) * 0.005;
    render();
  });
  const crystalChange = () => { hot = null; mirror = 1; S.pick = Math.min(S.pick, 2 * S.N); render(); };
  $('nions').addEventListener('input', e => { S.N = +e.target.value; S.pick = 0; crystalChange(); });
  // a linear trap needs the radial grip stiffer than the axial one; keep wr at least 1.2 wz
  const frMin = () => Math.ceil(12 * S.fz - 1e-9) / 10;
  $('fz').addEventListener('input', e => { S.fz = +e.target.value; S.fr = Math.max(S.fr, frMin()); crystalChange(); });
  $('fr').addEventListener('input', e => { S.fr = +e.target.value; crystalChange(); });
  document.querySelectorAll('#mdir [data-dir]').forEach(bt => bt.addEventListener('click', () => { S.dir = bt.dataset.dir; S.pick = 0; render(); }));
  $('mode-chips').addEventListener('click', e => { const bt = e.target.closest('[data-pick]'); if (!bt) return; S.pick = +bt.dataset.pick; T.crystal = 0; render(); });

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
    q1: () => { mode = 'earnshaw'; S.kx = 0.5; S.ky = 0.5; S.plane = 'xy'; T.earnshaw = 0; },
    q2: () => { mode = 'flip'; S.V = 300; S.f = 5; S.view = 'saddle'; T.flip = 0; },
    q3: () => { mode = 'flip'; S.V = 300; S.f = 20; S.view = 'saddle'; T.flip = 0; },
    q4: () => { mode = 'flip'; S.V = 300; S.f = 40; S.view = 'saddle'; T.flip = 0; },
    q5: () => { mode = 'chart'; S.q = 0.9; S.a = 0; },
    q6: () => { mode = 'chart'; S.q = 0.4; S.a = 0.1; },
    q7: () => { mode = 'crystal'; S.N = 2; S.fz = 1; S.fr = 4; S.dir = 'axial'; S.pick = 1; hot = null; mirror = 1; },
    q8: () => { mode = 'crystal'; S.N = 10; S.fz = 1; S.fr = 4; S.dir = 'radial'; S.pick = 0; hot = null; mirror = 1; },
  };
  document.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
    stop();
    QUESTIONS[b.dataset.q]();
    applyMode();
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }));

  applyMode();
})();
