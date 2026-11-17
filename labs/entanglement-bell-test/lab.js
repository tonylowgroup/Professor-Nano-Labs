/* Entanglement: controls, shots, plots. Physics is in physics.js; the dials in dials.js. */
(function () {
  'use strict';
  const B = window.Bell, DC = window.Dials.C;
  const $ = id => document.getElementById(id);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const RAD = Math.PI / 180;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const S = {
    source: { same: 'quantum', turn: 'quantum', chsh: 'quantum' },
    both: 0, a: 0, b: 60, ca: 0, cap: 90, cb: 45, cbp: 135,
    sheet: { Aa: 1, Aap: 1, Bb: 1, Bbp: 1 }, v: 1, tell: 'no',
  };
  let mode = 'same';
  let last = null;              // the last pair measured in this tab
  let strip = [];               // recent pairs, for the strip of dominoes

  // ---------- stored results ----------
  const blank = () => ({ n: 0, same: 0, aPlus: 0, bPlus: 0 });
  const data = {
    same: { quantum: new Map(), socks: new Map() },
    turn: { quantum: new Map(), arrow: new Map() },
    chsh: null,
    steer: null,
  };
  const keyOf = o => JSON.stringify(o);

  // ---------- formatting ----------
  const fixed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const signed = (x, d = 2) => (x > 0.5 * Math.pow(10, -d) ? '+' : '') + fixed(x, d);
  const pct = x => (100 * x).toFixed(1) + '%';
  const deg = x => Math.round(x) + '°';
  const se = (p, n) => Math.sqrt(Math.max(p * (1 - p), 0) / n);

  // ---------- plots ----------
  const MARGIN = { l: 58, r: 26, t: 12, b: 42 };
  const plotA = new NanoPlot($('plot-a'), { xLabel: '', yLabel: '', margin: MARGIN });
  const plotB = new NanoPlot($('plot-b'), { xLabel: '', yLabel: '', margin: MARGIN });
  const SPIN = { labels: { z0: '+z', z1: '−z', xp: '+x', xm: '−x', yp: '+y', ym: '−y' } };   // spin directions, not qubit kets
  const sphA = new BlochSphere($('sphere-a'), SPIN);
  const sphB = new BlochSphere($('sphere-b'), SPIN);
  sphA.onView = (az, el) => sphB.setView(az, el, true);
  sphB.onView = (az, el) => sphA.setView(az, el, true);

  function legend(id, items) {
    $(id).innerHTML = items.map(([color, kind, label]) => `<li style="color:${color}"><span class="swatch ${kind}"></span><span>${label}</span></li>`).join('');
  }
  function stats(items) {
    $('stats').innerHTML = items.map(([label, value, sub]) =>
      `<div class="stat"><div class="stat__label">${label}</div><div class="stat__value">${value}</div><div class="stat__sub">${sub}</div></div>`).join('');
  }
  const note = html => { $('takeaway').innerHTML = html; };
  function tallies(rows) {
    $('tallies').innerHTML = rows.map(r => `
      <div class="outcome">
        <span class="outcome__label outcome__label--wide">${r.label}</span>
        <span class="outcome__track"><span class="outcome__bar" style="width:${(100 * (r.n ? r.frac : 0)).toFixed(2)}%;background:${r.color}"></span><span class="outcome__pred" style="left:${(100 * r.pred).toFixed(2)}%" title="Prediction ${(100 * r.pred).toFixed(1)}%"></span></span>
        <span class="outcome__val">${r.n ? pct(r.frac) : '—'}</span>
      </div>`).join('');
  }
  const rangeLine = (f, x0, x1, n) => { const x = [], y = []; for (let i = 0; i <= n; i++) { const t = x0 + (x1 - x0) * i / n; x.push(t); y.push(f(t)); } return { x, y }; };

  // ---------- shots ----------
  function pushStrip(A, Bv) { strip.push([A, Bv]); if (strip.length > 48) strip.shift(); }

  function chshKey() { return keyOf([S.source.chsh, S.ca, S.cap, S.cb, S.cbp, S.source.chsh === 'quantum' ? S.v : 0, S.source.chsh === 'sheet' ? S.sheet : 0]); }
  function chshData() {
    const key = chshKey();
    if (!data.chsh || data.chsh.key !== key) data.chsh = { key, rounds: 0, c: { ab: [0, 0], abp: [0, 0], apb: [0, 0], apbp: [0, 0] }, hist: [] };
    return data.chsh;
  }
  function steerData() {
    const key = keyOf([S.a, S.b, S.v]);
    if (!data.steer || data.steer.key !== key) data.steer = { key, n: 0, bPlus: 0, nA: { 1: 0, '-1': 0 }, bPlusA: { 1: 0, '-1': 0 } };
    return data.steer;
  }
  function chshEstimate(d) {
    const E = {}, err = {};
    for (const k of ['ab', 'abp', 'apb', 'apbp']) {
      const [n, sum] = d.c[k];
      E[k] = n ? sum / n : NaN;
      err[k] = n ? Math.sqrt(Math.max(1 - E[k] * E[k], 0) / n) : NaN;
    }
    const Sv = B.chsh(E.ab, E.abp, E.apb, E.apbp);
    const dS = Math.sqrt(err.ab ** 2 + err.abp ** 2 + err.apb ** 2 + err.apbp ** 2);
    return { E, err, S: Sv, dS };
  }

  function takeShots(k) {
    const r = Math.random;
    for (let i = 0; i < k; i++) {
      if (mode === 'same') {
        const src = S.source.same, th = S.both * RAD, s = B.shot(src, th, th, 1, r);
        const m = data.same[src]; const c = m.get(S.both) || blank(); m.set(S.both, c);
        c.n++; if (s.A === s.B) c.same++; if (s.A > 0) c.aPlus++; if (s.B > 0) c.bPlus++;
        last = s; pushStrip(s.A, s.B);
      } else if (mode === 'turn') {
        const src = S.source.turn, s = B.shot(src, S.a * RAD, S.b * RAD, 1, r);
        const g = Math.round(B.gap(S.a * RAD, S.b * RAD) / RAD);
        const m = data.turn[src]; const c = m.get(g) || blank(); m.set(g, c);
        c.n++; if (s.A === s.B) c.same++; if (s.A > 0) c.aPlus++; if (s.B > 0) c.bPlus++;
        last = s; pushStrip(s.A, s.B);
      } else if (mode === 'chsh') {
        const d = chshData();
        const ia = r() < 0.5 ? 'a' : 'ap', ib = r() < 0.5 ? 'b' : 'bp';
        const ang = { a: S.ca, ap: S.cap, b: S.cb, bp: S.cbp };
        let s;
        if (S.source.chsh === 'sheet') s = { A: ia === 'a' ? S.sheet.Aa : S.sheet.Aap, B: ib === 'b' ? S.sheet.Bb : S.sheet.Bbp };
        else s = B.shot(S.source.chsh, ang[ia] * RAD, ang[ib] * RAD, S.v, r);
        const key = ia + ib;
        d.c[key][0]++; d.c[key][1] += s.A * s.B; d.rounds++;
        if (d.hist.length < 50000) { const est = chshEstimate(d); d.hist.push(Number.isFinite(est.S) ? Math.abs(est.S) : NaN); }
        last = { ...s, ia, ib }; pushStrip(s.A, s.B);
      } else {
        const d = steerData(), s = B.shot('quantum', S.a * RAD, S.b * RAD, S.v, r);
        d.n++; if (s.B > 0) d.bPlus++;
        d.nA[s.A]++; if (s.B > 0) d.bPlusA[s.A]++;
        last = s; pushStrip(s.A, s.B);
      }
    }
  }

  function scan() {
    const src = S.source.turn, r = Math.random;
    for (let g = 0; g <= 180; g += 15) {
      const m = data.turn[src]; const c = m.get(g) || blank(); m.set(g, c);
      for (let i = 0; i < 300; i++) { const s = B.shot(src, 0, g * RAD, 1, r); c.n++; if (s.A === s.B) c.same++; if (s.A > 0) c.aPlus++; if (s.B > 0) c.bPlus++; }
    }
  }

  // ---------- drawing ----------
  const narrowDials = () => $('dials').clientWidth < 540;
  function drawStrip() {
    $('pair-strip').innerHTML = strip.length
      ? '<span class="pair-strip__label">Latest pairs (Alice on top)</span>' + strip.map(([a, b]) => `<i class="pair"><b class="${a > 0 ? 'up' : 'down'}"></b><b class="${b > 0 ? 'up' : 'down'}"></b></i>`).join('')
      : '<span class="pair-strip__label">No pairs measured yet: press +1 pair or Keep measuring.</span>';
  }

  function measuredDots(map, f) {
    const x = [], y = [];
    [...map.entries()].sort((p, q) => p[0] - q[0]).forEach(([g, c]) => { if (c.n) { x.push(g); y.push(f(c)); } });
    return { x, y };
  }

  function renderSame() {
    const src = S.source.same, th = S.both * RAD;
    $('dials').innerHTML = Dials.draw({ source: src, a: th, b: th, aLabel: '', bLabel: '', last, narrow: narrowDials() });
    const c = data.same[src].get(S.both) || blank();
    const Ex = B.corr(src, th, th, 1), pSame = (1 + Ex) / 2;
    const Em = c.n ? (2 * c.same - c.n) / c.n : NaN;
    stats([
      ['Both dials at', deg(S.both), S.both === 0 ? 'along z' : S.both === 90 ? 'along x' : 'from z toward x'],
      ['Opposite answers', c.n ? pct(1 - c.same / c.n) : '—', `predicted ${pct(1 - pSame)}`],
      ['Alice +1', c.n ? pct(c.aPlus / c.n) : '—', 'predicted 50.0%, always'],
      ['Correlation', c.n ? signed(Em) : '—', `predicted ${signed(Ex)}${c.n ? ` · ${c.n} pairs here` : ''}`],
    ]);
    $('dg-title').textContent = 'Source and dials';
    $('dg-cap').textContent = 'Both dials turn together. The thick arrow on each dial is that person\'s last result: up (+1) or down (−1) along their dial.';
    $('info').innerHTML = src === 'quantum'
      ? '<b>Entangled pair:</b> each spin alone has no direction. Only when the dials are compared does a pattern appear: along any shared axis, the answers are opposite.'
      : `<b>Socks:</b> each pair really is up–down or down–up along z${last && last.zA ? ` (this one: Alice ${last.zA > 0 ? '↑' : '↓'}, Bob ${last.zA > 0 ? '↓' : '↑'})` : ''}. Measured along another axis, each spin gives a random answer of its own.`;

    // plot A: correlation with both dials at theta
    const q = rangeLine(t => -1, 0, 180, 2), so = rangeLine(t => -(Math.cos(t * RAD) ** 2), 0, 180, 180);
    const dq = measuredDots(data.same.quantum, c => (2 * c.same - c.n) / c.n), ds = measuredDots(data.same.socks, c => (2 * c.same - c.n) / c.n);
    plotA.opts.xLabel = 'Both dials at angle θ from z (°)'; plotA.opts.yLabel = 'Correlation E'; plotA.opts.xTicks = 6;
    plotA.setRange([0, 180], [-1.08, 0.25]);
    plotA.draw([
      { type: 'line', x: q.x, y: q.y, color: css('--series-1'), width: 2.4 },
      { type: 'line', x: so.x, y: so.y, color: css('--series-amber'), width: 2, dash: [6, 4] },
      { type: 'dots', x: dq.x, y: dq.y, color: css('--series-1'), r: 4.5 },
      { type: 'dots', x: ds.x, y: ds.y, color: css('--series-amber'), r: 4.5 },
      { type: 'vline', x: S.both, color: css('--plot-axis'), width: 1.4, dash: [] },
    ]);
    $('pa-title').textContent = 'Correlation with both dials together';
    $('pa-cap').textContent = 'Lines: predictions. Dots: your pairs at each angle. −1 means always opposite; 0 means unrelated coins.';
    legend('pa-legend', [[css('--series-1'), '', 'entangled pair'], [css('--series-amber'), 'swatch--dash', 'socks']]);

    $('pb-title').textContent = 'Counts at this angle';
    $('pb-cap').textContent = 'Bars: your pairs. Ticks: the prediction. Each person alone always sees a fair coin.';
    legend('pb-legend', []);
    tallies([
      { label: 'Opposite answers', n: c.n, frac: c.n ? 1 - c.same / c.n : 0, pred: 1 - pSame, color: css('--series-1') },
      { label: 'Same answer', n: c.n, frac: c.n ? c.same / c.n : 0, pred: pSame, color: css('--series-amber') },
      { label: 'Alice +1', n: c.n, frac: c.n ? c.aPlus / c.n : 0, pred: 0.5, color: DC.plus },
      { label: 'Bob +1', n: c.n, frac: c.n ? c.bPlus / c.n : 0, pred: 0.5, color: DC.minus },
    ]);
    if (S.both === 90 && src === 'socks') note('<b>Socks along x:</b> the pair was only ever opposite along z, so along x the two answers are independent coin flips: as often the same as opposite.');
    else if (src === 'quantum') note('<b>Try 0°, 45° and 90°:</b> the entangled pair stays perfectly opposite at every one. Then switch to socks and repeat.');
    else note('<b>Socks</b> are perfectly opposite along z, weaker in between, and unrelated along x: the correlation follows −cos²θ.');
    return c.n;
  }

  function renderTurn() {
    const src = S.source.turn, a = S.a * RAD, b = S.b * RAD;
    $('dials').innerHTML = Dials.draw({ source: src, a, b, aLabel: '', bLabel: '', last, narrow: narrowDials() });
    const g = Math.round(B.gap(a, b) / RAD);
    const c = data.turn[src].get(g) || blank();
    const Eq = -Math.cos(g * RAD), Ec = -(1 - 2 * g / 180);
    const Em = c.n ? (2 * c.same - c.n) / c.n : NaN;
    stats([
      ['Angle between dials', deg(g), `a = ${deg(S.a)}, b = ${deg(S.b)}`],
      ['Same answer', c.n ? pct(c.same / c.n) : '—', `quantum ${pct((1 + Eq) / 2)} · sheets ${pct((1 + Ec) / 2)}`],
      ['Correlation', c.n ? signed(Em) : '—', c.n ? `± ${(2 * se(c.same / c.n, c.n)).toFixed(2)} from ${c.n} pair${c.n === 1 ? '' : 's'}` : 'measure some pairs'],
      ['Quantum − sheets', signed(Eq - Ec, 3), 'the gap in the correlation'],
    ]);
    $('dg-title').textContent = 'Source and dials';
    $('dg-cap').textContent = src === 'arrow'
      ? 'Answer sheets: each pair carries a hidden arrow λ. Alice answers +1 if her dial\'s + end lies in the shaded half around λ; Bob does the same around the opposite direction.'
      : 'Turn Bob\'s dial away from Alice\'s. The thick arrows are the last pair\'s results.';
    $('info').innerHTML = src === 'arrow'
      ? '<b>Hidden arrow:</b> the answers are fixed at the source, before any dial is chosen. The chance that λ falls where the two shaded halves disagree grows in a straight line with the angle, which is why this model gives a zigzag.'
      : '<b>Entangled pair:</b> nothing is fixed at the source. The chance of the same answer is sin²(θ/2), a curve no hidden arrow can reproduce.';
    const xs = rangeLine(t => -Math.cos(t * RAD), 0, 180, 180), zs = rangeLine(t => -(1 - 2 * t / 180), 0, 180, 2);
    const dq = measuredDots(data.turn.quantum, c => (2 * c.same - c.n) / c.n), da = measuredDots(data.turn.arrow, c => (2 * c.same - c.n) / c.n);
    plotA.opts.xLabel = 'Angle between the dials θ (°)'; plotA.opts.yLabel = 'Correlation E'; plotA.opts.xTicks = 6;
    plotA.setRange([0, 180], [-1.08, 1.08]);
    plotA.draw([
      { type: 'hline', y: 0, color: css('--plot-axis'), dash: [] },
      { type: 'line', x: zs.x, y: zs.y, color: css('--series-amber'), width: 2, dash: [6, 4] },
      { type: 'line', x: xs.x, y: xs.y, color: css('--series-1'), width: 2.4 },
      { type: 'dots', x: da.x, y: da.y, color: css('--series-amber'), r: 4.5 },
      { type: 'dots', x: dq.x, y: dq.y, color: css('--series-1'), r: 4.5 },
      { type: 'vline', x: g, color: css('--plot-axis'), width: 1.4, dash: [] },
    ]);
    $('pa-title').textContent = 'Correlation against the angle';
    $('pa-cap').textContent = 'The cosine (entangled pair) bulges beyond the straight zigzag (best answer sheets) between 0°, 90° and 180°. Dots: your pairs; Scan fills in every 15°.';
    legend('pa-legend', [[css('--series-1'), '', 'entangled pair: −cos θ'], [css('--series-amber'), 'swatch--dash', 'answer sheets: −(1 − 2θ/π)']]);
    const ps = rangeLine(t => Math.sin(t * RAD / 2) ** 2, 0, 180, 180), pc = rangeLine(t => t / 180, 0, 180, 2);
    const dq2 = measuredDots(data.turn.quantum, c => c.same / c.n), da2 = measuredDots(data.turn.arrow, c => c.same / c.n);
    plotB.opts.xLabel = 'Angle between the dials θ (°)'; plotB.opts.yLabel = 'P(same answer)'; plotB.opts.xTicks = 6;
    plotB.setRange([0, 180], [0, 1.04]);
    plotB.draw([
      { type: 'line', x: pc.x, y: pc.y, color: css('--series-amber'), width: 2, dash: [6, 4] },
      { type: 'line', x: ps.x, y: ps.y, color: css('--series-1'), width: 2.4 },
      { type: 'dots', x: da2.x, y: da2.y, color: css('--series-amber'), r: 4.5 },
      { type: 'dots', x: dq2.x, y: dq2.y, color: css('--series-1'), r: 4.5 },
      { type: 'vline', x: g, color: css('--plot-axis'), width: 1.4, dash: [] },
    ]);
    $('pb-title').textContent = 'How often they agree';
    $('pb-cap').textContent = 'The same comparison as a chance: sin²(θ/2) for the pair, θ/180° for answer sheets.';
    legend('pb-legend', [[css('--series-1'), '', 'entangled pair'], [css('--series-amber'), 'swatch--dash', 'answer sheets']]);
    if (g === 0 || g === 90 || g === 180) note(`<b>At ${g}°</b> the pair and the best answer sheet agree exactly. Move to an angle in between, around 40° or 140°, where the gap is largest.`);
    else note(`<b>At ${g}°</b> the entangled pair agrees ${pct((1 + Eq) / 2)} of the time, the best answer sheet ${pct((1 + Ec) / 2)}. Take enough pairs and the difference stands out from the noise.`);
    return c.n;
  }

  function evenPhi() {
    const p = S.cb - S.ca;
    return (S.cap - S.ca === 2 * p && S.cbp - S.ca === 3 * p) ? p : null;
  }

  function verdict(Sabs, dS, sigmas) {
    if (!Number.isFinite(Sabs)) return ['Verdict', '—', 'needs rounds on all four dial pairs'];
    if (!(dS > 1e-12)) return ['Verdict', Math.abs(Sabs - 2) < 1e-9 ? 'Exactly 2' : Sabs > 2 ? 'Beats 2' : 'Below 2', 'every answer here is certain, so there is no scatter'];
    return ['Verdict', sigmas > 5 ? 'Beats 2' : sigmas < -5 ? 'Below 2' : 'Too close to call', `${signed(sigmas, 1)} standard deviations from 2`];
  }

  function renderChsh() {
    const src = S.source.chsh, d = chshData(), est = chshEstimate(d);
    const r = { a: S.ca * RAD, ap: S.cap * RAD, b: S.cb * RAD, bp: S.cbp * RAD };
    const exE = src === 'sheet'
      ? { ab: S.sheet.Aa * S.sheet.Bb, abp: S.sheet.Aa * S.sheet.Bbp, apb: S.sheet.Aap * S.sheet.Bb, apbp: S.sheet.Aap * S.sheet.Bbp }
      : { ab: B.corr(src, r.a, r.b, S.v), abp: B.corr(src, r.a, r.bp, S.v), apb: B.corr(src, r.ap, r.b, S.v), apbp: B.corr(src, r.ap, r.bp, S.v) };
    const exS = B.chsh(exE.ab, exE.abp, exE.apb, exE.apbp);
    const lastA = last && last.ia, lastB = last && last.ib;
    $('dials').innerHTML = Dials.draw({ source: src, a: r.a, b: r.b, aLabel: 'a', bLabel: 'b', aAlt: r.ap, aAltLabel: 'a′', aAltActive: lastA === 'ap', bAlt: r.bp, bAltLabel: 'b′', bAltActive: lastB === 'bp', last, narrow: narrowDials() });
    $('dg-title').textContent = 'Each round: a or a′, b or b′';
    $('dg-cap').textContent = 'Solid: a and b. Dashed: a′ and b′. The bold one is the dial used in the last round. The bar below is |S|: the solid mark at 2 is the classical limit, the dashed mark the quantum maximum 2√2.';
    $('info').innerHTML = src === 'sheet'
      ? `<b>My answer sheet</b> fixes every answer in advance, so each correlation is exactly +1 or −1 and the score is exactly ${signed(exS, 0)}.`
      : src === 'arrow' ? '<b>Answer sheets:</b> a fresh hidden arrow for each pair, which is a random mix of answer sheets. The best it can do is 2, reached at these dials.'
      : `<b>Entangled pair</b> with purity v = ${S.v.toFixed(2)}: exact score ${fixed(Math.abs(exS), 3)}${S.v < B.VIOLATES_FROM ? ', no longer above 2' : ''}.`;
    // scoreboard
    const cell = (k, label, sgn) => `<div class="sb__cell"><span class="sb__lab">${sgn} E(${label})</span><b>${Number.isFinite(est.E[k]) ? signed(est.E[k]) : '—'}</b><small>exact ${signed(exE[k])}${d.c[k][0] ? ` · ${d.c[k][0]} rounds` : ''}</small></div>`;
    const Sabs = Math.abs(est.S), gaugeX = v => Math.min(100, 100 * v / 3);
    $('scoreboard').innerHTML = `<div class="sb__cells">${cell('ab', 'a, b', '')}${cell('abp', 'a, b′', '−')}${cell('apb', 'a′, b', '+')}${cell('apbp', 'a′, b′', '+')}</div>
      <div class="sb__gauge"><div class="sb__track"><div class="sb__fill" style="width:${Number.isFinite(Sabs) ? gaugeX(Sabs) : 0}%"></div>
      <span class="sb__mark" style="left:${gaugeX(2)}%"><em>2</em></span><span class="sb__mark sb__mark--q" style="left:${gaugeX(B.TSIRELSON)}%"><em>2√2</em></span></div>
      <div class="sb__val">|S| = <b>${Number.isFinite(Sabs) ? fixed(Sabs, 3) : '—'}</b>${Number.isFinite(est.dS) ? ` ± ${est.dS.toFixed(3)}` : ''}</div></div>`;
    const sigmas = Number.isFinite(Sabs) && est.dS > 0 ? (Sabs - 2) / est.dS : NaN;
    stats([
      ['Score |S|', Number.isFinite(Sabs) ? fixed(Sabs, 3) : '—', Number.isFinite(est.dS) ? `± ${est.dS.toFixed(3)} from ${d.rounds} rounds` : 'needs all four dial pairs'],
      ['Exact |S|', fixed(Math.abs(exS), 3), src === 'quantum' ? `2√2 v at the best dials` : 'never above 2'],
      ['Classical limit', '2', 'any answer sheet, or any mix of them'],
      verdict(Sabs, est.dS, sigmas),
    ]);
    // plot A: running score
    const h = d.hist, step = Math.max(1, Math.ceil(h.length / 2000)), x = [], y = [];
    for (let i = 0; i < h.length; i += step) { x.push(i + 1); y.push(h[i]); }
    const xmax = Math.max(40, d.rounds);
    plotA.opts.xLabel = 'Rounds played'; plotA.opts.yLabel = 'Score |S|'; plotA.opts.xTicks = 6;
    plotA.setRange([0, xmax], [0, 4]);
    plotA.draw([
      { type: 'hband', y0: 2, y1: 4, color: 'rgba(163, 50, 108, 0.06)' },
      { type: 'hline', y: 2, color: css('--series-amber'), width: 1.8, dash: [] },
      { type: 'hline', y: B.TSIRELSON, color: css('--series-1'), width: 1.2, dash: [3, 4] },
      { type: 'hline', y: Math.abs(exS), color: css('--plot-text'), width: 1.2, dash: [6, 4] },
      { type: 'line', x, y, color: css('--series-1'), width: 2 },
    ]);
    $('pa-title').textContent = 'Your score as the rounds add up';
    $('pa-cap').textContent = 'Above the orange line is out of reach for any answer sheet. Grey dashed: the exact score for these settings.';
    legend('pa-legend', [[css('--series-1'), '', 'measured |S|'], [css('--series-amber'), '', 'classical limit 2'], [css('--plot-text'), 'swatch--dash', 'exact']]);
    // plot B: score for evenly spaced dials
    const qs = rangeLine(t => Math.abs(B.evenScore('quantum', t * RAD, S.v)), 0, 90, 180), cs = rangeLine(t => Math.abs(B.evenScore('arrow', t * RAD, 1)), 0, 90, 180);
    const phi = evenPhi();
    plotB.opts.xLabel = 'Step φ between dials (°)'; plotB.opts.yLabel = 'Score |S|'; plotB.opts.xTicks = 6;
    plotB.setRange([0, 90], [0, 3]);
    const LB = [
      { type: 'hline', y: 2, color: css('--series-amber'), width: 1.4, dash: [] },
      { type: 'line', x: cs.x, y: cs.y, color: css('--series-amber'), width: 2, dash: [6, 4] },
      { type: 'line', x: qs.x, y: qs.y, color: css('--series-1'), width: 2.4 },
    ];
    if (phi !== null && phi >= 0 && phi <= 90) LB.push({ type: 'vline', x: phi, color: css('--plot-text'), width: 1.4, dash: [], label: 'your dials' });
    plotB.draw(LB);
    $('pb-title').textContent = 'Which dials win';
    $('pb-cap').textContent = `Dials evenly spaced: a = 0, b = φ, a′ = 2φ, b′ = 3φ. The entangled pair peaks at φ = 45°; answer sheets never pass 2.${phi === null ? ' Your current dials are not evenly spaced.' : ''}`;
    legend('pb-legend', [[css('--series-1'), '', `entangled pair (v = ${S.v.toFixed(2)})`], [css('--series-amber'), 'swatch--dash', 'answer sheets']]);
    if (src === 'sheet') note('<b>Change any answer on your sheet:</b> the score jumps between +2 and −2 and never lands anywhere else. That ceiling is Bell\'s inequality in its CHSH form.');
    else if (src === 'quantum' && S.v < B.VIOLATES_FROM && S.v > B.ENTANGLED_FROM) note(`<b>Still entangled, but no violation:</b> at v = ${S.v.toFixed(2)} the pair is entangled (it is for v above 1/3), yet its best score, ${fixed(2 * Math.SQRT2 * S.v, 2)}, does not pass 2. A Bell test can miss real entanglement.`);
    else if (src === 'quantum' && S.v <= B.ENTANGLED_FROM) note(`<b>No longer entangled:</b> below v = 1/3 the noisy pair could be produced by classical means, and its score cannot pass 2.`);
    else note('<b>Keep measuring:</b> the score wanders at first, then settles. With the best dials the entangled pair settles near 2.83, well above any answer sheet.');
    return d.rounds;
  }

  function renderSteer() {
    const d = steerData(), a = S.a * RAD, b = S.b * RAD, na = B.axis(a), nb = B.axis(b);
    const brand = css('--series-1'), amber = css('--series-amber'), blue = css('--series-re');
    const A = last ? last.A : null;
    // Alice's sphere
    const sa = { arrows: [], measure: { n: na, pPlus: 0.5, color: css('--plot-text'), plusColor: brand, minusColor: blue } };
    sa.arrows.push(A ? { v: na.map(x => A * x), color: A > 0 ? brand : blue, width: 3.2 } : { v: [0, 0, 0], color: brand, width: 3 });
    sphA.draw(sa);
    // Bob's sphere
    const knows = S.tell === 'yes' && A;
    const pB = knows ? B.bobPlusGiven(A, a, b, S.v) : 0.5;
    const sb = { arrows: [], measure: { n: nb, pPlus: pB, color: css('--plot-text'), plusColor: brand, minusColor: blue } };
    // colour follows Alice's result: track colour when she got +1, blue when she got -1
    if (knows) sb.arrows.push({ v: B.bobGiven(A, a, S.v), color: A > 0 ? brand : blue, width: 3.2 });
    else {
      sb.arrows.push({ v: B.bobGiven(1, a, S.v), color: brand, width: 1.8, dash: [5, 4], alpha: 0.6 });
      sb.arrows.push({ v: B.bobGiven(-1, a, S.v), color: blue, width: 1.8, dash: [5, 4], alpha: 0.6 });
      sb.arrows.push({ v: [0, 0, 0], color: amber, width: 3 });
    }
    sphB.draw(sb);
    $('dg-title').textContent = 'Each spin on its own Bloch sphere';
    $('dg-cap').innerHTML = `Grey axes: the dials (Alice ${deg(S.a)}, Bob ${deg(S.b)}). ${knows ? 'Bob knows Alice\'s last result, so his spin has a definite direction.' : 'Bob does not know Alice\'s result: his spin is one of the two dashed arrows, half the time each, and on average it is the ring at the centre.'}`;
    const fr = (num, den) => (den ? num / den : NaN);
    const pAll = fr(d.bPlus, d.n), pP = fr(d.bPlusA[1], d.nA[1]), pM = fr(d.bPlusA[-1], d.nA[-1]);
    stats([
      ['Bob +1, all pairs', d.n ? pct(pAll) : '—', 'predicted 50.0%, whatever Alice does'],
      ['Bob +1 if Alice +1', d.nA[1] ? pct(pP) : '—', `predicted ${pct(B.bobPlusGiven(1, a, b, S.v))}`],
      ['Bob +1 if Alice −1', d.nA[-1] ? pct(pM) : '—', `predicted ${pct(B.bobPlusGiven(-1, a, b, S.v))}`],
      ['Bob\'s arrow', knows ? fixed(S.v, 2) : '0', knows ? 'length, given Alice\'s result' : 'length, on average'],
    ]);
    $('info').innerHTML = A
      ? `<b>Alice got ${A > 0 ? '+1' : '−1'}</b> along ${deg(S.a)}, so Bob's spin now points ${A > 0 ? 'down' : 'up'} along that same dial${S.v < 1 ? ` (length ${S.v.toFixed(2)})` : ''}. ${knows ? 'Bob knows this because Alice told him.' : 'Bob cannot see this: to him the two possibilities average to nothing.'}`
      : '<b>Nothing measured yet:</b> both arrows sit at the centre. Each spin of a singlet, on its own, has no direction at all.';
    // plot A: Bob's P(+1) against Alice's dial
    const all = rangeLine(() => 0.5, 0, 180, 2), gp = rangeLine(t => B.bobPlusGiven(1, t * RAD, b, S.v), 0, 180, 180), gm = rangeLine(t => B.bobPlusGiven(-1, t * RAD, b, S.v), 0, 180, 180);
    const pts = [];
    if (d.n) pts.push({ type: 'dots', x: [S.a], y: [pAll], color: amber, r: 5 });
    if (d.nA[1]) pts.push({ type: 'dots', x: [S.a], y: [pP], color: brand, r: 5 });
    if (d.nA[-1]) pts.push({ type: 'dots', x: [S.a], y: [pM], color: blue, r: 5 });
    plotA.opts.xLabel = 'Alice\'s dial a (°)'; plotA.opts.yLabel = 'Bob\'s chance of +1'; plotA.opts.xTicks = 6;
    plotA.setRange([0, 180], [0, 1.04]);
    plotA.draw([
      { type: 'line', x: gp.x, y: gp.y, color: brand, width: 1.8, dash: [6, 4] },
      { type: 'line', x: gm.x, y: gm.y, color: blue, width: 1.8, dash: [6, 4] },
      { type: 'line', x: all.x, y: all.y, color: amber, width: 2.6 },
      { type: 'vline', x: S.a, color: css('--plot-axis'), width: 1.4, dash: [] },
      ...pts,
    ]);
    $('pa-title').textContent = 'Can Bob see Alice\'s choice?';
    $('pa-cap').textContent = `Bob measures at ${deg(S.b)}. Orange: his own results, flat at ½ whatever dial Alice uses. Dashed: his results sorted by Alice's, which needs her list.`;
    legend('pa-legend', [[amber, '', 'Bob alone'], [brand, 'swatch--dash', 'given Alice +1'], [blue, 'swatch--dash', 'given Alice −1']]);
    $('pb-title').textContent = 'Bob\'s results, sorted and unsorted';
    $('pb-cap').textContent = 'Bars: your pairs. Ticks: the prediction.';
    legend('pb-legend', []);
    tallies([
      { label: 'Bob +1, all pairs', n: d.n, frac: pAll, pred: 0.5, color: amber },
      { label: 'Bob +1 when Alice got +1', n: d.nA[1], frac: pP, pred: B.bobPlusGiven(1, a, b, S.v), color: brand },
      { label: 'Bob +1 when Alice got −1', n: d.nA[-1], frac: pM, pred: B.bobPlusGiven(-1, a, b, S.v), color: blue },
    ]);
    note('<b>Steering, not signalling:</b> Alice\'s choice of dial decides which two directions Bob\'s spin is split between, but the halves always cancel. Bob sees ½ no matter what; the link shows up only after Alice sends her results by an ordinary channel.');
    return d.n;
  }

  // ---------- render ----------
  function syncControls() {
    const src = S.source[mode];
    document.querySelectorAll('#source [data-source]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.source === src)));
    $('source-hint').textContent = { quantum: 'The singlet: opposite along every axis.', socks: 'Opposite along z only, like a pair of socks.', arrow: 'Each pair carries hidden instructions: Bell\'s hidden arrow.', sheet: 'One answer sheet you write yourself.' }[src] || '';
    $('both').value = S.both; $('both-out').textContent = deg(S.both);
    document.querySelectorAll('[data-both]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.both === S.both)));
    $('dial-a').value = S.a; $('dial-a-out').textContent = deg(S.a);
    $('dial-b').value = S.b; $('dial-b-out').textContent = deg(S.b);
    for (const k of ['ca', 'cap', 'cb', 'cbp']) { $(k).value = S[k]; $(k + '-out').textContent = deg(S[k]); }
    document.querySelectorAll('[data-sheet]').forEach(b => { const v = S.sheet[b.dataset.sheet]; b.textContent = v > 0 ? '+1' : '−1'; b.classList.toggle('is-minus', v < 0); });
    $('sheet-hint').textContent = `This sheet scores exactly ${signed(B.sheetScore(S.sheet.Aa, S.sheet.Aap, S.sheet.Bb, S.sheet.Bbp), 0)}. Click an answer to flip it.`;
    $('purity').value = S.v; $('purity-out').textContent = S.v.toFixed(2);
    document.querySelectorAll('#tell [data-tell]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tell === S.tell)));
  }

  function render() {
    syncControls();
    $('sheet-group').hidden = !(mode === 'chsh' && S.source.chsh === 'sheet');
    const steer = mode === 'steer';
    $('dials').hidden = steer; $('spheres').hidden = !steer;
    $('scoreboard').hidden = mode !== 'chsh';
    const tal = mode === 'same' || mode === 'steer';
    $('tallies').hidden = !tal; $('pb-box').hidden = tal;
    let n;
    if (mode === 'same') n = renderSame();
    else if (mode === 'turn') n = renderTurn();
    else if (mode === 'chsh') n = renderChsh();
    else n = renderSteer();
    drawStrip();
    $('count-out').textContent = `${n} ${mode === 'chsh' ? 'round' : 'pair'}${n === 1 ? '' : 's'}`;
    $('play').textContent = playing ? '❚❚ Pause' : '▶ Keep measuring';
    $('transport-note').textContent = mode === 'same' ? 'Counts are kept for each angle.' : mode === 'turn' ? 'Counts are kept for each angle between the dials, for each source.' : mode === 'chsh' ? 'Each round picks a dial at random on each side.' : 'Counts reset when a dial or the purity changes.';
    $('lab-status').textContent = 'Pairs are simulated with the browser\'s random number generator; every run differs.';
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
    last = null; strip = [];
    render();
  }

  // ---------- playback ----------
  let playing = false, raf = 0, lastT = 0, speed = 1, debt = 0;
  const RATE = { same: 8, turn: 8, chsh: 80, steer: 8 };
  function frame(now) {
    if (!playing) return;
    const dt = Math.min(100, now - lastT); lastT = now;
    debt += RATE[mode] * speed * dt / 1000;
    const k = Math.floor(debt);
    if (k) { debt -= k; takeShots(k); render(); }
    raf = requestAnimationFrame(frame);
  }
  function stop() { playing = false; cancelAnimationFrame(raf); }
  $('play').addEventListener('click', () => {
    if (playing) { stop(); render(); return; }
    if (reduceMotion) { takeShots(100); render(); return; }
    playing = true; debt = 0; lastT = performance.now(); raf = requestAnimationFrame(frame); render();
  });
  $('speed').addEventListener('change', e => { speed = +e.target.value; });
  document.querySelectorAll('[data-shots]').forEach(b => b.addEventListener('click', () => { takeShots(+b.dataset.shots); render(); }));
  $('scan').addEventListener('click', () => { scan(); render(); });
  $('clear').addEventListener('click', () => {
    stop();
    if (mode === 'same') data.same[S.source.same] = new Map();
    else if (mode === 'turn') data.turn[S.source.turn] = new Map();
    else if (mode === 'chsh') data.chsh = null;
    else data.steer = null;
    last = null; strip = []; render();
  });

  // ---------- controls ----------
  const fresh = () => { last = null; strip = []; };
  document.querySelectorAll('#source [data-source]').forEach(b => b.addEventListener('click', () => { stop(); S.source[mode] = b.dataset.source; fresh(); render(); }));
  $('both').addEventListener('input', e => { S.both = +e.target.value; fresh(); render(); });
  document.querySelectorAll('[data-both]').forEach(b => b.addEventListener('click', () => { S.both = +b.dataset.both; fresh(); render(); }));
  ['dial-a', 'dial-b'].forEach(id => $(id).addEventListener('input', e => { S[id === 'dial-a' ? 'a' : 'b'] = +e.target.value; fresh(); render(); }));
  ['ca', 'cap', 'cb', 'cbp'].forEach(k => $(k).addEventListener('input', e => { S[k] = +e.target.value; fresh(); render(); }));
  document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
    Object.assign(S, b.dataset.preset === 'best' ? { ca: 0, cap: 90, cb: 45, cbp: 135 } : { ca: 0, cap: 0, cb: 0, cbp: 0 }); fresh(); render();
  }));
  document.querySelectorAll('[data-sheet]').forEach(b => b.addEventListener('click', () => { S.sheet[b.dataset.sheet] *= -1; fresh(); render(); }));
  $('purity').addEventListener('input', e => { S.v = +e.target.value; fresh(); render(); });
  document.querySelectorAll('#tell [data-tell]').forEach(b => b.addEventListener('click', () => { S.tell = b.dataset.tell; render(); }));

  const tabs = Array.from(document.querySelectorAll('.tab'));
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => { stop(); mode = b.dataset.mode; applyMode(); });
    b.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus(); next.click();
    });
  });
  if ('ResizeObserver' in window) new ResizeObserver(() => { if (!playing) render(); }).observe($('dials'));

  // ---------- predict-first loaders ----------
  const QUESTIONS = {
    q1: () => { mode = 'same'; S.source.same = 'quantum'; S.both = 90; },
    q2: () => { mode = 'same'; S.source.same = 'quantum'; S.both = 0; },
    q3: () => { mode = 'turn'; S.source.turn = 'quantum'; S.a = 0; S.b = 60; },
    q4: () => { mode = 'turn'; S.a = 0; S.b = 45; for (const s of ['arrow', 'quantum']) { S.source.turn = s; scan(); } },
    q5: () => { mode = 'chsh'; S.source.chsh = 'sheet'; Object.assign(S, { ca: 0, cap: 90, cb: 45, cbp: 135 }); },
    q6: () => { mode = 'chsh'; S.source.chsh = 'quantum'; Object.assign(S, { ca: 0, cap: 90, cb: 45, cbp: 135, v: 1 }); },
    q7: () => { mode = 'chsh'; S.source.chsh = 'quantum'; Object.assign(S, { ca: 0, cap: 90, cb: 45, cbp: 135, v: 0.6 }); },
    q8: () => { mode = 'steer'; Object.assign(S, { a: 90, b: 90, v: 1, tell: 'no' }); },
  };
  document.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
    stop();
    QUESTIONS[b.dataset.q]();
    applyMode();
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }));

  applyMode();
})();
