/* From Atoms to a Band: controls, sweeps and drawing. Physics is in physics.js. */
(function () {
  'use strict';
  const L = window.Lattice;
  const $ = id => document.getElementById(id);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const Ns = [1, 2, 3, 4, 8, 16, 32, 64, 128, 256];
  const INITIAL = { N: 32, mag: 0.4, eps: 0, a: 5, kappa: 1, eta: 0.08, center: 0, width: 0.10, norm: 'length', sweep: 'N' };
  let state = { ...INITIAL };
  let mode = 'band';
  let bulkCache = null;

  const QUESTIONS = {
    q1: ['band', { N: 2, mag: 0.4, eps: 0 }],
    q2: ['band', { N: 8, mag: 0, eps: 0 }],
    q3: ['spacing', { N: 32, a: 5, kappa: 1, eps: 0 }],
    q4: ['dos', { N: 64, mag: 0.4, eps: 0, a: 5, eta: 0.08, center: 0, width: 0.10, norm: 'length', sweep: 'window' }],
    q5: ['dos', { N: 16, mag: 0.4, eps: 0, a: 5, eta: 0.08, center: 0, width: 0.10, norm: 'length', sweep: 'N' }],
    q6: ['dos', { N: 8, mag: 0.4, eps: 0, a: 5, eta: 0.08, center: 0, width: 0.10, norm: 'length', sweep: 'N' }],
  };

  // ---------- formatting ----------
  function fmt(x, d = 3) {
    if (!Number.isFinite(x)) return String(x);
    if (x === 0) return '0';
    if (Math.abs(x) < 0.001 || Math.abs(x) >= 10000) return x.toExponential(2);
    return Number(x.toPrecision(d)).toString().replace('-', '−');
  }
  const fixed = (x, d = 2) => Number(x).toFixed(d).replace('-', '−');

  // ---------- plots ----------
  const plotA = new NanoPlot($('plot-a'), { xLabel: '', yLabel: 'Energy E (eV)' });
  const plotB = new NanoPlot($('plot-b'), { xLabel: '', yLabel: 'Energy E (eV)' });
  const plotC = new NanoPlot($('plot-c'), { xLabel: 'Energy E (eV)', yLabel: 'Ω(E) / N' });

  function legend(id, items) {
    $(id).innerHTML = items.map(([color, kind, label]) =>
      `<li style="color:${color}"><span class="swatch ${kind}"></span><span>${label}</span></li>`).join('');
  }

  // ---------- chain and matrix drawings ----------
  function drawChain() {
    const N = state.N, shown = Math.min(N, 10), W = 1000, H = 104;
    let s = '';
    if (mode === 'spacing') {
      const scale = 840 / 90;
      for (let j = 0; j < shown; j++) {
        const x = 70 + j * state.a * scale;
        if (j) s += `<line x1="${70 + (j - 1) * state.a * scale}" y1="40" x2="${x}" y2="40" stroke="currentColor" stroke-opacity=".35" stroke-width="2"/>`;
        s += `<circle cx="${x}" cy="40" r="8" fill="currentColor"/><text x="${x}" y="72" text-anchor="middle" class="chain__label">${j + 1}</text>`;
      }
      s += `<text x="70" y="98" class="chain__note">Drawn to scale · ${shown < N ? 'first ' + shown + ' of ' + N + ' sites' : N + ' sites'} · a = ${fixed(state.a)} Å</text>`;
    } else {
      for (let j = 0; j < shown; j++) {
        const x = shown === 1 ? 500 : 70 + j * 860 / (shown - 1);
        if (j) s += `<line x1="${70 + (j - 1) * 860 / (shown - 1)}" y1="38" x2="${x}" y2="38" stroke="currentColor" stroke-opacity="${state.mag > 0 ? .35 : .08}" stroke-width="2"/>`;
        s += `<circle cx="${x}" cy="38" r="8" fill="currentColor"/><text x="${x}" y="70" text-anchor="middle" class="chain__label">${shown < N && j === shown - 1 ? 'N' : j + 1}</text>`;
      }
      if (N > shown) s += `<rect x="858" y="26" width="44" height="24" fill="var(--surface)"/><text x="880" y="44" text-anchor="middle" fill="currentColor" font-size="22">⋯</text>`;
      s += `<text x="500" y="98" text-anchor="middle" class="chain__note">${N === 1 ? 'One isolated site' : N + ' sites, one orbital each, open ends' + (N > shown ? ' (drawing abbreviated)' : '')}${state.mag === 0 && N > 1 ? ' · no coupling' : ''}</text>`;
    }
    $('chain').innerHTML = `<svg class="chain" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chain of ${N} sites">${s}</svg>`;
  }

  function drawMatrix() {
    const n = Math.min(state.N, 7), W = 340, H = 330, cell = Math.min(40, 260 / n);
    const x0 = (W - cell * n) / 2, y0 = 22;
    let s = '';
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = i === j ? state.eps : Math.abs(i - j) === 1 ? -state.mag : 0;
      const kind = i === j ? 'matrix__diag' : Math.abs(i - j) === 1 ? 'matrix__bond' : 'matrix__zero';
      const x = x0 + j * cell, y = y0 + i * cell;
      s += `<rect x="${x}" y="${y}" width="${cell - 2}" height="${cell - 2}" rx="4" class="${kind}"/>`;
      s += `<text x="${x + cell / 2 - 1}" y="${y + cell / 2 + 4}" text-anchor="middle" font-size="${n < 4 ? 15 : 12.5}" class="${v === 0 ? 'matrix__z' : 'matrix__v'}">${fmt(v, 2)}</text>`;
    }
    const yb = y0 + n * cell;
    s += `<path d="M${x0 - 6},${y0 - 4} h-8 v${n * cell + 6} h8 M${x0 + n * cell + 4},${y0 - 4} h8 v${n * cell + 6} h-8" fill="none" stroke="currentColor" stroke-width="1.5"/>`;
    s += `<text x="${W / 2}" y="${Math.min(H - 8, yb + 34)}" text-anchor="middle" class="chain__note">${state.N > n ? 'Upper-left ' + n + ' × ' + n + ' block of the ' + state.N + ' × ' + state.N + ' matrix' : 'The full ' + state.N + ' × ' + state.N + ' Hamiltonian'} (eV)</text>`;
    $('matrix').innerHTML = `<svg class="matrix__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Hamiltonian matrix">${s}</svg>`;
  }

  // ---------- shared plot pieces ----------
  function spectrumLayers(es, eps, t, extra) {
    const q = L.linspace(0, 1, 401);
    const env = q.map(v => eps + 2 * t * Math.cos(Math.PI * v));
    const xs = es.map((_, i) => (i + 1) / (es.length + 1));
    return [
      ...(extra || []),
      { type: 'hline', y: eps, color: css('--series-ghost'), dash: [3, 4] },
      { type: 'line', x: q, y: env, color: css('--series-im'), width: 1.6, dash: [6, 4] },
    ].concat([{ type: 'dots', x: xs, y: es, color: css('--series-1'), r: es.length > 100 ? 2.2 : 3.4 }]);
  }

  function stats(items) {
    $('stats').innerHTML = items.map(([label, value, sub]) =>
      `<div class="stat"><div class="stat__label">${label}</div><div class="stat__value">${value}</div><div class="stat__sub">${sub}</div></div>`).join('');
  }

  // ---------- experiment 1 ----------
  function renderBand() {
    const N = state.N, t = -state.mag, eps = state.eps;
    const es = L.levels(N, eps, t);
    const spread = Math.max(2.35 * Math.abs(t), 0.15);
    plotA.opts.xLabel = 'Mode coordinate n / (N + 1)';
    plotA.setRange([0, 1], [eps - spread, eps + spread]);
    plotA.draw(spectrumLayers(es, eps, t));
    drawMatrix(); drawChain();
    const width = es[N - 1] - es[0];
    let sum = 0; for (const e of es) sum += e;
    stats([
      ['Available states', N, 'one per orbital, one spin'],
      ['Hopping', fmt(t) + ' eV', 't, negative by convention'],
      ['Finite width', fmt(width) + ' eV', 'W<sub>N</sub> = E<sub>N</sub> − E<sub>1</sub>'],
      ['Large-N width', fmt(4 * Math.abs(t)) + ' eV', 'W<sub>∞</sub> = 4|t|'],
    ]);
    $('takeaway').innerHTML = t === 0
      ? '<b>Isolated atoms:</b> all ' + N + ' states sit at ε. They are degenerate, not a single state. Raise |t| to split them.'
      : `<b>Read the plot:</b> every point is one state. Adding atoms puts more levels into the same interval; the band never grows wider than 4|t|. The lowest and highest levels are <b>${fmt(es[0])}</b> and <b>${fmt(es[N - 1])} eV</b>.`;
    const dev = Math.abs(sum - N * eps);
    $('lab-status').textContent = (dev < 1e-9 ? 'Check: Σ Eₙ equals Nε, the trace of H, to machine precision.' : `Check: Σ Eₙ − Nε = ${fmt(sum - N * eps)} eV.`) + ' No bond joins the two ends.';
  }

  // ---------- experiment 2 ----------
  function renderSpacing() {
    const N = state.N, a = state.a, eps = state.eps, k = state.kappa;
    const t = L.hopping(a, k);
    const es = L.levels(N, eps, t);
    const spread = Math.max(2.25 * Math.abs(L.hopping(3, k)), 0.15);
    const aa = L.linspace(3, 10, 161);
    const stride = Math.max(1, Math.ceil(N / 64));
    const fan = [];
    for (let n = 1; n <= N; n += stride) {
      const c = Math.cos(n * Math.PI / (N + 1));
      fan.push({ type: 'line', x: aa, y: aa.map(v => eps + 2 * L.hopping(v, k) * c), color: NanoPlot.alpha(css('--series-1'), .38), width: 1 });
    }
    plotA.opts.xLabel = 'Spacing a (Å)';
    plotA.setRange([3, 10], [eps - spread, eps + spread]);
    plotA.draw([
      ...fan,
      { type: 'hline', y: eps, color: css('--series-ghost'), dash: [3, 4] },
      { type: 'vline', x: a, color: css('--series-amber'), dash: [4, 3], width: 1.5, label: 'a' },
      { type: 'dots', x: Array.from(es, () => a), y: es, color: css('--series-1'), r: N > 100 ? 2 : 3 },
    ]);
    plotB.opts.xLabel = 'Mode coordinate n / (N + 1)';
    plotB.setRange([0, 1], [eps - spread, eps + spread]);
    plotB.draw(spectrumLayers(es, eps, t));
    drawChain();
    stats([
      ['Spacing', fixed(a) + ' Å', 'reference a<sub>ref</sub> = 5 Å'],
      ['Hopping', fmt(t) + ' eV', 't(a), includes the a prefactor'],
      ['Large-N width', fmt(4 * Math.abs(t)) + ' eV', 'W<sub>∞</sub> = 4|t(a)|'],
      ['Available states', N, 'unchanged as a varies'],
    ]);
    $('takeaway').innerHTML = '<b>Two separate effects:</b> N sets how many states exist; the coupling sets how widely they spread. Increasing a weakens |t(a)|, so the levels collapse toward ε. The energy axes stay fixed during the sweep.';
    $('lab-status').textContent = (N > 64 ? `The fan shows every ${stride}th level; all ${N} current levels are marked. ` : `All ${N} levels are shown. `) + 'This is a sweep through a parameter, not motion in time.';
  }

  // ---------- experiment 3 ----------
  function renderDos() {
    const N = state.N, mag = state.mag, t = -mag, eps = state.eps, a = state.a, r = state.eta;
    const us = L.linspace(-2 - 6 * r, 2 + 6 * r, 721);
    const eg = us.map(u => eps + mag * u);
    const es = L.levels(N, eps, t);
    const shape = L.densityShape(us, L.levels(N, 0, -1), r);
    const key = r.toFixed(5);
    if (!bulkCache || bulkCache.key !== key) bulkCache = { key, shape: L.densityShape(us, L.continuumLevels(1024), r) };
    const perSite = state.norm === 'site';
    const factor = perSite ? 1 / mag : 1 / (a * mag);
    const D = shape.map(v => v * factor), B = bulkCache.shape.map(v => v * factor);
    const area = L.trapezoid(shape, us);
    const center = eps + 2 * mag * state.center, delta = 4 * mag * state.width;
    const lo = center - delta / 2, hi = center + delta / 2;
    const nlo = L.countAt(lo, es), nhi = L.countAt(hi, es), count = nhi - nlo;
    const ylim = [eg[0], eg[eg.length - 1]];
    const amber = css('--series-amber'), band = 'rgba(196, 122, 18, .14)';
    const edges = [
      { type: 'hline', y: eps - 2 * mag, color: css('--series-ghost'), dash: [3, 4] },
      { type: 'hline', y: eps + 2 * mag, color: css('--series-ghost'), dash: [3, 4] },
    ];

    plotA.opts.xLabel = 'Mode coordinate n / (N + 1)';
    plotA.setRange([0, 1], ylim);
    const q = L.linspace(0, 1, 401);
    plotA.draw([
      { type: 'hband', y0: lo, y1: hi, color: band },
      ...edges,
      { type: 'line', x: q, y: q.map(v => eps + 2 * t * Math.cos(Math.PI * v)), color: css('--series-im'), width: 1.6, dash: [6, 4] },
      { type: 'dots', x: es.map((_, i) => (i + 1) / (N + 1)), y: es, r: N > 100 ? 2.2 : 3.4,
        colors: Array.from(es, e => (e > lo && e <= hi) ? amber : NanoPlot.alpha(css('--series-1'), .35)) },
    ]);

    let dmax = 0; for (let i = 0; i < D.length; i++) dmax = Math.max(dmax, D[i], B[i]);
    const aq = L.linspace(0.0008, Math.PI - 0.0008, 801);
    plotB.opts.xLabel = perSite ? 'a·D(E) (states / eV per site)' : 'D(E) (states / eV·Å)';
    plotB.setRange([0, dmax * 1.14], ylim);
    plotB.draw([
      { type: 'hband', y0: lo, y1: hi, color: band },
      ...edges,
      { type: 'line', x: aq.map(v => factor / (2 * Math.PI * Math.sin(v))), y: aq.map(v => eps - 2 * mag * Math.cos(v)), color: css('--series-im'), width: 1.6, dash: [6, 4] },
      { type: 'line', x: B, y: eg, color: css('--series-re'), width: 2, dash: [2, 3] },
      { type: 'line', x: D, y: eg, color: css('--series-1'), width: 2.2 },
    ]);

    const sx = [eg[0]], sy = [0];
    for (let i = 0; i < N; i++) { sx.push(es[i], es[i]); sy.push(i / N, (i + 1) / N); }
    sx.push(eg[eg.length - 1]); sy.push(1);
    plotC.setRange([eg[0], eg[eg.length - 1]], [0, 1.04]);
    plotC.draw([
      { type: 'vband', x0: lo, x1: hi, color: band },
      { type: 'line', x: eg, y: eg.map(E => L.bulkFraction(E, eps, mag)), color: css('--series-im'), width: 1.6, dash: [6, 4] },
      { type: 'line', x: sx, y: sy, color: css('--series-1'), width: 2 },
      { type: 'vline', x: lo, color: amber, dash: [3, 3] },
      { type: 'vline', x: hi, color: amber, dash: [3, 3] },
    ]);

    const avg = count / (N * a * delta);
    stats([
      ['States in window', `${count} / ${N}`, 'exact: E<sub>low</sub> < E<sub>n</sub> ≤ E<sub>high</sub>'],
      ['Window width', fmt(delta) + ' eV', 'centred at ' + fmt(center) + ' eV'],
      ['Average DOS', fmt(perSite ? a * avg : avg), perSite ? 'ΔΩ / (N ΔE), per eV per site' : 'ΔΩ / (N a ΔE), per eV·Å'],
      ['Area check', area.toFixed(6), 'a ∫ D<sub>σ</sub> dE = 1'],
    ]);
    $('takeaway').innerHTML = `<b>Same-width window:</b> from <b>${fmt(lo)}</b> to <b>${fmt(hi)} eV</b>, Ω<sub>N</sub> rises from <b>${nlo}</b> to <b>${nhi}</b>. Near a band edge E<sub>n</sub> changes slowly with n, so a small energy range can hold more states. Changing σ changes the drawn peaks, not these counts.`;
    $('lab-status').textContent = `L = Na = ${fmt(N * a)} Å · ${N} states · σ = ${fmt(r * mag)} eV · per-length DOS area 1/a = ${fmt(1 / a)} Å⁻¹. The energy axes match across plots; the DOS axis rescales for readability.`;
  }

  // ---------- mode switching ----------
  const PANEL_B = {
    band: { title: 'The Hamiltonian being solved', cap: 'Only the main diagonal and the two neighbouring diagonals are non-zero.', matrix: true },
    spacing: { title: 'Current spectrum', cap: 'N does not change when you move the spacing.', matrix: false },
    dos: { title: 'From separate peaks to a continuum', cap: 'The ideal bulk curve diverges at both edges and is clipped. Tails beyond the band are display broadening, not extra states.', matrix: false },
  };
  const PANEL_A = {
    band: ['One point = one energy level', 'Points: exact levels of the chain. Dashed curve: the cosine they all sit on.'],
    spacing: ['The energy-level fan', 'Every level against spacing a, for the selected κ. The energy range stays fixed during the sweep.'],
    dos: ['Which levels fall in the window?', 'Highlighted points are counted states, not occupied electrons.'],
  };
  const SWEEP_NOTE = {
    band: 'Play steps through N = 1, 2, 3, 4, 8 … 256. Not time evolution.',
    spacing: 'Play pulls the atoms closer (a decreases); Reverse pushes them apart.',
    dos: 'Sweeps N or the window position. Not time evolution.',
  };

  function applyMode() {
    document.querySelectorAll('.tab').forEach(b => {
      const on = b.dataset.mode === mode;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    $('lab').setAttribute('aria-labelledby', 'tab-' + mode);
    document.querySelectorAll('.mode-intro').forEach(el => { el.hidden = el.dataset.for !== mode; });
    document.querySelectorAll('[data-modes]').forEach(el => { el.hidden = !el.dataset.modes.split(' ').includes(mode); });
    $('pa-title').textContent = PANEL_A[mode][0];
    $('pa-cap').textContent = PANEL_A[mode][1];
    const pb = PANEL_B[mode];
    $('pb-title').textContent = pb.title;
    $('pb-cap').textContent = pb.cap;
    $('pb-box').hidden = pb.matrix;
    $('matrix').hidden = !pb.matrix;
    $('sweep-note').textContent = SWEEP_NOTE[mode];
    $('a-label').textContent = mode === 'dos' ? 'Spacing a (t fixed)' : 'Spacing a';
    const mag = $('mag');
    mag.min = mode === 'dos' ? '0.05' : '0';
    if (mode === 'dos' && state.mag < 0.05) state.mag = 0.05;

    const ink = css('--series-1'), im = css('--series-im'), re = css('--series-re'), amber = css('--series-amber');
    if (mode === 'band') legend('pa-legend', [[ink, 'swatch--stem', 'levels E<sub>n</sub>'], [im, 'swatch--dash', 'cosine envelope']]);
    if (mode === 'spacing') {
      legend('pa-legend', [[ink, '', 'level E<sub>n</sub>(a)'], [amber, 'swatch--dash', 'current a']]);
      legend('pb-legend', [[ink, 'swatch--stem', 'levels'], [im, 'swatch--dash', 'cosine envelope']]);
    }
    if (mode === 'dos') {
      legend('pa-legend', [[amber, 'swatch--stem', 'in the window'], [ink, 'swatch--stem', 'outside']]);
      legend('pb-legend', [[ink, '', 'finite N, broadened'], [im, 'swatch--dash', 'ideal bulk'], [re, 'swatch--dot', 'bulk, same broadening']]);
    }
    if (mode === 'band') $('pb-legend').innerHTML = '';
    render();
  }

  // ---------- controls ----------
  const SLIDERS = {
    N: v => String(v),
    mag: v => fixed(v) + ' eV',
    eps: v => fixed(v) + ' eV',
    a: v => fixed(v) + ' Å',
    kappa: v => fixed(v) + ' Å⁻¹',
    eta: v => fixed(v),
    center: v => fixed(v),
    width: v => fixed(v),
  };

  function syncControls() {
    for (const key of Object.keys(SLIDERS)) {
      $(key).value = state[key];
      $(key + '-out').textContent = SLIDERS[key](state[key]);
    }
    $('norm').value = state.norm;
    $('sweep').value = state.sweep;
    document.querySelectorAll('[data-n]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.n === state.N)));
  }

  function render() {
    syncControls();
    if (mode === 'band') renderBand();
    else if (mode === 'spacing') renderSpacing();
    else renderDos();
  }

  for (const key of Object.keys(SLIDERS)) {
    $(key).addEventListener('input', e => {
      pause();
      state[key] = key === 'N' ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
      render();
    });
  }
  $('norm').addEventListener('change', e => { state.norm = e.target.value; render(); });
  $('sweep').addEventListener('change', e => { pause(); state.sweep = e.target.value; });
  document.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => { pause(); state.N = +b.dataset.n; render(); }));

  const tabs = Array.from(document.querySelectorAll('.tab'));
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => { pause(); mode = b.dataset.mode; applyMode(); });
    b.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus(); next.click();
    });
  });

  document.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
    const [m, values] = QUESTIONS[b.dataset.q];
    pause();
    state = { ...INITIAL, ...values };
    mode = m;
    applyMode();
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  // ---------- sweeps ----------
  let playing = false, direction = 1, raf = 0, last = 0, speed = 1;
  function step(dir) {
    if (mode === 'spacing') {
      state.a = +(state.a - dir * 0.1).toFixed(2);
      if (state.a < 3 - 1e-8) state.a = 10;
      if (state.a > 10 + 1e-8) state.a = 3;
    } else if (mode === 'dos' && state.sweep === 'window') {
      state.center = +(state.center + dir * 0.04).toFixed(3);
      if (state.center > 1.1) state.center = -1.1;
      if (state.center < -1.1) state.center = 1.1;
    } else if (dir > 0) {
      state.N = Ns.find(n => n > state.N) || Ns[0];
    } else {
      state.N = [...Ns].reverse().find(n => n < state.N) || Ns[Ns.length - 1];
    }
    render();
  }
  function frame(now) {
    if (!playing) return;
    const interval = (mode === 'spacing' || (mode === 'dos' && state.sweep === 'window') ? 160 : 650) / speed;
    if (now - last >= interval) { last = now; step(direction); }
    raf = requestAnimationFrame(frame);
  }
  function start() {
    playing = true; last = performance.now();
    $('play').textContent = '❚❚ Pause';
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }
  function pause() {
    playing = false; cancelAnimationFrame(raf);
    $('play').textContent = '▶ Play';
  }
  $('play').addEventListener('click', () => (playing ? pause() : start()));
  $('reverse').addEventListener('click', () => { direction *= -1; start(); });
  $('back').addEventListener('click', () => { pause(); step(-1); });
  $('forward').addEventListener('click', () => { pause(); step(1); });
  $('reset').addEventListener('click', () => { pause(); direction = 1; state = { ...INITIAL }; bulkCache = null; render(); });
  $('speed').addEventListener('change', e => { speed = +e.target.value; });

  applyMode();
})();
