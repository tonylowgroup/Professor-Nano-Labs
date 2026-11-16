/* Trapped-Ion Qubit: controls, sequences, playback and drawing.
   Physics is in physics.js; the sphere drawing is shared (assets/js/bloch-sphere.js). */
(function () {
  'use strict';
  const I = window.Ion;
  const $ = id => document.getElementById(id);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const DEG = Math.PI / 180;
  const T_STEPS = [10, 20, 30, 50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000, Infinity];
  const ENSEMBLE = 41;
  const PLAY_SECONDS = 8;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const INITIAL = { omega: 100, delta: 0, phase: 0, seq: 'ramsey', tau: 50, prep: 'pi', sigma: 0, t1: 13, t2: 13, window: 50, scan: 'tau' };
  let state = { ...INITIAL };
  let mode = 'rabi';
  const tNow = { rabi: Infinity, ramsey: Infinity, decay: Infinity };   // Infinity = the end of the sequence
  const visited = { ramsey: false, decay: false };

  // ---------- formatting ----------
  const fixed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const fmtT = T => (Number.isFinite(T) ? (T >= 1000 ? fixed(T / 1000, T % 1000 ? 1 : 0) + ' ms' : Math.round(T) + ' µs') : '∞');
  const fmtTime = t => (t >= 1000 ? fixed(t / 1000, 2) + ' ms' : fixed(t, t < 10 ? 2 : 1) + ' µs');
  const prob = x => Math.max(0, Math.min(1, x)).toFixed(3);
  const kHzText = f => fixed(f, Math.abs(f) < 10 && f % 1 ? 1 : 0) + ' kHz';

  // ---------- model ----------
  function params() {
    const T1 = T_STEPS[state.t1], T2 = T_STEPS[state.t2];
    const R = I.rates(T1, T2);
    return { omega: I.kHz(state.omega), delta: I.kHz(state.delta), sigma: I.kHz(state.sigma), g1: R.g1, g2: R.g2, T1, T2, R };
  }
  const tPi = () => 1000 / (2 * state.omega);   // pi / Omega in us, with Omega/2pi in kHz

  function decayWindow(p) {
    const finite = [p.T1, p.R.T2eff].filter(Number.isFinite);
    if (!finite.length) return 200;
    const w = 4 * Math.max(...finite);
    const nice = [100, 200, 400, 500, 1000, 2000, 4000, 5000, 10000, 20000, 40000];
    return nice.find(v => v >= w) || 40000;
  }

  function segments(m, p) {
    const tp = tPi();
    if (m === 'rabi') return [{ kind: 'pulse', dur: state.window, phase: state.phase * DEG, label: 'laser on' }];
    if (m === 'ramsey') {
      const tau = state.tau;
      return state.seq === 'ramsey'
        ? [{ kind: 'pulse', dur: tp / 2, phase: 0, label: 'π/2' }, { kind: 'wait', dur: tau, label: 'wait τ' }, { kind: 'pulse', dur: tp / 2, phase: 0, label: 'π/2' }]
        : [{ kind: 'pulse', dur: tp / 2, phase: 0, label: 'π/2' }, { kind: 'wait', dur: tau / 2, label: 'τ/2' }, { kind: 'pulse', dur: tp, phase: 0, label: 'π' },
          { kind: 'wait', dur: tau / 2, label: 'τ/2' }, { kind: 'pulse', dur: tp / 2, phase: Math.PI, label: 'π/2 (−x)' }];
    }
    const prep = state.prep === 'pi' ? { kind: 'pulse', dur: tp, phase: 0, label: 'π' } : { kind: 'pulse', dur: tp / 2, phase: 0, label: 'π/2' };
    return [prep, { kind: 'wait', dur: decayWindow(p), label: 'leave it alone' }];
  }

  let simCache = { key: '', sim: null };
  function simulation(p, segs) {
    const key = JSON.stringify([mode, segs, p.omega, p.delta, p.sigma, p.g1, p.g2]);
    if (key !== simCache.key) simCache = { key, sim: I.simulate(segs, p, 700, ENSEMBLE) };
    return simCache.sim;
  }

  const scanCache = new Map();
  function cached(key, fn) {
    if (!scanCache.has(key)) { if (scanCache.size > 40) scanCache.clear(); scanCache.set(key, fn()); }
    return scanCache.get(key);
  }

  // ---------- drawing helpers ----------
  const sphere = new BlochSphere($('sphere'), { labels: { z0: '|0⟩ ground', z1: '|1⟩ excited' } });
  const MARGIN = { l: 58, r: 26, t: 12, b: 42 };
  const plotA = new NanoPlot($('plot-a'), { xLabel: 'Time t (µs)', yLabel: 'Excitation probability P(1)', margin: MARGIN });
  const plotB = new NanoPlot($('plot-b'), { xLabel: '', yLabel: 'P(1)', margin: MARGIN });

  function legend(id, items) {
    $(id).innerHTML = items.map(([color, kind, label]) =>
      `<li style="color:${color}"><span class="swatch ${kind}"></span><span>${label}</span></li>`).join('');
  }
  function stats(items) {
    $('stats').innerHTML = items.map(([label, value, sub]) =>
      `<div class="stat"><div class="stat__label">${label}</div><div class="stat__value">${value}</div><div class="stat__sub">${sub}</div></div>`).join('');
  }
  function note(html) { $('takeaway').innerHTML = html; }

  function rhoHTML(r) {
    const p0 = (1 + r[2]) / 2, p1 = (1 - r[2]) / 2, re = r[0] / 2, im = -r[1] / 2;
    const c = (a, b) => `${fixed(a, 3)} ${b <= -5e-4 ? '−' : '+'} ${Math.abs(b) < 5e-4 ? '0.000' : Math.abs(b).toFixed(3)}i`;
    const purity = (1 + r[0] * r[0] + r[1] * r[1] + r[2] * r[2]) / 2;
    return `<span class="rho__name">ρ =</span><span class="rho__m"><span>${p0.toFixed(3)}</span><span>${c(re, im)}</span><span>${c(re, -im)}</span><span>${p1.toFixed(3)}</span></span>` +
      `<span class="rho__side">Tr ρ² = ${purity.toFixed(3)}<br>${purity > 0.9995 ? 'pure state' : 'mixed state'}</span>`;
  }

  // Timeline strip: pulses get a minimum width so their labels fit (not to scale).
  function timelineMap(segs, W) {
    const total = segs.reduce((a, s) => a + s.dur, 0) || 1;
    const minPulse = 46;
    const waitTotal = segs.filter(s => s.kind === 'wait').reduce((a, s) => a + s.dur, 0);
    const widths = segs.map(s => {
      if (segs.length === 1) return W;
      if (s.kind === 'pulse') return Math.max(minPulse, W * s.dur / total);
      return 0;
    });
    const used = widths.reduce((a, b) => a + b, 0);
    const free = Math.max(0, W - used);
    segs.forEach((s, i) => { if (s.kind === 'wait') widths[i] = waitTotal > 0 ? free * s.dur / waitTotal : 0; });
    const x0 = []; let x = 0;
    widths.forEach(w => { x0.push(x); x += w; });
    return { widths, x0, xOf(t) {
      let acc = 0;
      for (let i = 0; i < segs.length; i++) {
        if (t <= acc + segs[i].dur + 1e-9 || i === segs.length - 1) return x0[i] + widths[i] * (segs[i].dur ? Math.min(1, Math.max(0, (t - acc) / segs[i].dur)) : 0);
        acc += segs[i].dur;
      }
      return W;
    } };
  }

  function drawTimeline(segs, t) {
    const box = $('timeline');
    const W = Math.max(240, Math.round(box.clientWidth || 600)), H = 46;
    const map = timelineMap(segs, W - 2);
    let s = '';
    segs.forEach((g, i) => {
      const x = map.x0[i] + 1, w = map.widths[i];
      if (w <= 0) return;
      if (g.kind === 'pulse') {
        s += `<rect x="${x + 1}" y="6" width="${Math.max(0, w - 2)}" height="34" rx="6" class="tl__pulse"/>`;
        s += `<text x="${x + w / 2}" y="28" class="tl__t tl__t--on">${g.label}</text>`;
      } else {
        s += `<line x1="${x}" y1="23" x2="${x + w}" y2="23" class="tl__wire"/>`;
        if (w > 60) s += `<text x="${x + w / 2}" y="17" class="tl__t">${g.label} · ${fmtTime(g.dur)}</text>`;
      }
    });
    const mx = 1 + map.xOf(t);
    s += `<line x1="${mx}" y1="2" x2="${mx}" y2="${H - 2}" stroke="${css('--series-amber')}" stroke-width="2.2"/>`;
    box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Laser pulse sequence">${s}</svg>`;
  }

  // ---------- render ----------
  function syncControls(p) {
    $('omega').value = state.omega; $('omega-out').textContent = kHzText(state.omega);
    $('omega-hint').textContent = `π pulse: ${fixed(tPi(), tPi() < 10 ? 2 : 1)} µs.`;
    $('delta').value = state.delta; $('delta-out').textContent = (state.delta > 0 ? '+' : '') + kHzText(state.delta);
    $('phase').value = state.phase; $('phase-out').textContent = state.phase + '°';
    $('tau').value = state.tau; $('tau-out').textContent = state.tau + ' µs';
    $('sigma').value = state.sigma; $('sigma-out').textContent = state.sigma ? kHzText(state.sigma) : 'off';
    $('t1').value = state.t1; $('t1-out').textContent = fmtT(T_STEPS[state.t1]);
    $('t2').value = state.t2; $('t2-out').textContent = fmtT(T_STEPS[state.t2]);
    $('window').value = String(state.window);
    $('noise-note').textContent = p.R.capped ? `T₂ is limited to 2T₁ = ${fmtT(p.R.T2eff)}: energy loss destroys phase too.` : '';
    document.querySelectorAll('[data-delta]').forEach(b => b.setAttribute('aria-pressed', String(Math.round(+b.dataset.delta * state.omega) === state.delta)));
    document.querySelectorAll('#seq [data-seq]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.seq === state.seq)));
    document.querySelectorAll('#prep [data-prep]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.prep === state.prep)));
    document.querySelectorAll('#scan [data-scan]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scan === state.scan)));
  }

  function render() {
    const p = params();
    syncControls(p);
    const segs = segments(mode, p);
    const sim = simulation(p, segs);
    const total = sim.total;
    let t = Math.min(tNow[mode], total);
    const now = I.stateAt(sim, p, t);
    const r = now.avg;
    const brand = css('--series-1'), amber = css('--series-amber'), ghost = css('--series-ghost'), blue = css('--series-re');

    // sphere
    const k = sim.t.findIndex(v => v > t + 1e-9);
    const cut = k < 0 ? sim.t.length : k;
    const done = sim.avg.slice(0, cut).concat([r]);
    const todo = [r].concat(sim.avg.slice(cut));
    const scene = { arrows: [], trail: [] };
    if (todo.length > 1) scene.trail.push({ pts: todo, color: NanoPlot.alpha(brand, 0.45), width: 1.6, dash: [5, 4] });
    if (done.length > 1) scene.trail.push({ pts: done, color: brand, width: 2.2 });
    if (p.sigma > 0) {
      const wmax = Math.max(...sim.weights);
      now.members.forEach((m, i) => {
        if (i % 5) return;
        scene.arrows.push({ v: m, color: brand, width: 1.4, alpha: 0.12 + 0.45 * sim.weights[i] / wmax, dot: 2 });
      });
    }
    scene.arrows.push({ v: r, color: brand, width: 3.4 });
    const seg = segs[now.seg];
    if (seg && seg.kind === 'pulse' && t > 0 && t < total) {
      const w = I.driveOf(seg, p, 0), n = Math.hypot(...w);
      scene.axis = { n: w.map(v => v / n), color: amber };
    } else if (mode === 'rabi') {
      const w = I.driveOf(segs[0], p, 0), n = Math.hypot(...w);
      scene.axis = { n: w.map(v => v / n), color: amber };
    }
    sphere.draw(scene);
    $('sphere').setAttribute('aria-label', `Bloch sphere: arrow at x ${fixed(r[0])}, y ${fixed(r[1])}, z ${fixed(r[2])}`);
    $('rho').innerHTML = rhoHTML(r);

    drawTimeline(segs, t);
    const P1now = I.P1(r);

    // plot A: P(1) against time
    const ts = sim.t, P1s = sim.avg.map(I.P1);
    plotA.setRange([0, total], [0, 1.04]);
    const A = [];
    let acc = 0;
    segs.forEach(s => { if (s.kind === 'pulse' && segs.length > 1) A.push({ type: 'vband', x0: acc, x1: acc + s.dur, color: NanoPlot.alpha(brand, 0.1) }); acc += s.dur; });
    const noisy = p.sigma > 0 || p.g1 > 0 || p.g2 > 0;
    if (mode === 'rabi') {
      const peak = p.omega ** 2 / (p.omega ** 2 + p.delta ** 2);
      A.push({ type: 'hline', y: peak, color: amber, dash: [6, 4], width: 1.4 });
      if (noisy) A.push({ type: 'line', x: ts, y: ts.map(v => I.rabiP1(p.omega, p.delta, v)), color: ghost, width: 1.4, dash: [4, 4] });
    }
    if (mode === 'decay' && p.g1 > 0) {
      const t0 = segs[0].dur, i0 = ts.findIndex(v => v >= t0 - 1e-9), p0 = P1s[i0];
      const xs = ts.filter(v => v >= t0 - 1e-9);
      A.push({ type: 'line', x: xs, y: xs.map(v => p0 * Math.exp(-(v - t0) * p.g1)), color: amber, width: 1.6, dash: [6, 4] });
    }
    A.push({ type: 'line', x: ts, y: P1s, color: brand, width: 2.2 });
    A.push({ type: 'vline', x: t, color: amber, width: 1.6, dash: [] });
    plotA.opts.xLabel = 'Time t (µs)';
    plotA.draw(A);

    // mode-specific panels
    if (mode === 'rabi') renderRabi(p, sim, t, P1now, noisy);
    else if (mode === 'ramsey') renderRamsey(p, sim, segs, t, P1now);
    else renderDecay(p, sim, segs, t, r, P1now);

    // transport
    const slider = $('time');
    slider.value = String(Math.round(1000 * t / total));
    $('time-out').textContent = fmtTime(t);
    $('play').textContent = playing ? '❚❚ Pause' : '▶ Play';
  }

  function renderRabi(p, sim, t, P1now, noisy) {
    const brand = css('--series-1'), amber = css('--series-amber'), ghost = css('--series-ghost');
    const we = Math.hypot(p.omega, p.delta), peak = p.omega ** 2 / (we * we);
    stats([
      ['Flip time', fixed(tPi(), 2) + ' µs', 'a π pulse: π/Ω'],
      ['Flopping rate', kHzText(I.toKHz(we)), '√(Ω² + Δ²)/2π'],
      ['Highest P(1)', peak.toFixed(3), 'Ω²/(Ω² + Δ²)'],
      ['P(1) now', prob(P1now), `after ${fmtTime(t)}`],
    ]);
    $('pa-title').textContent = 'Rabi flopping';
    $('pa-cap').textContent = 'The probability of finding the ion excited while the laser stays on. The orange dashed line is the highest value the swing can reach.';
    legend('pa-legend', [[brand, '', 'P(1)'], [amber, 'swatch--dash', 'Ω²/(Ω² + Δ²)']].concat(noisy ? [[ghost, 'swatch--dash', 'without noise']] : []));

    // pi-pulse spectrum
    const half = Math.max(80, 4 * state.omega);
    const key = JSON.stringify(['spec', state.omega, state.sigma, p.g1, p.g2, half]);
    const spec = cached(key, () => {
      const xs = [], ys = [], seg = [{ kind: 'pulse', dur: tPi(), phase: 0 }];
      for (let i = 0; i <= 240; i++) {
        const f = -half + 2 * half * i / 240;
        xs.push(f);
        ys.push(I.P1(I.finalState(seg, { ...p, delta: I.kHz(f) }, 31)));
      }
      return { xs, ys };
    });
    plotB.opts.xLabel = 'Detuning Δ/2π (kHz)';
    plotB.opts.yLabel = 'P(1) after a π pulse';
    plotB.setRange([-half, half], [0, 1.04]);
    const z = Math.sqrt(3) * state.omega;
    const B = [];
    if (z < half) B.push({ type: 'vline', x: -z, color: ghost, dash: [2, 4], label: '−√3 Ω' }, { type: 'vline', x: z, color: ghost, dash: [2, 4], label: '+√3 Ω' });
    if (noisy) B.push({ type: 'line', x: spec.xs, y: spec.xs.map(f => I.rabiP1(p.omega, I.kHz(f), tPi())), color: ghost, width: 1.4, dash: [4, 4] });
    B.push({ type: 'line', x: spec.xs, y: spec.ys, color: brand, width: 2.2 });
    B.push({ type: 'vline', x: state.delta, color: amber, width: 1.6, dash: [] });
    plotB.draw(B);
    $('pb-title').textContent = 'Spectroscopy with a π pulse';
    $('pb-cap').textContent = `P(1) after a π pulse (${fixed(tPi(), 2)} µs) against the laser's detuning. The orange line marks the current detuning; the first zeros sit at ±√3 Ω.`;
    legend('pb-legend', [[brand, '', 'P(1)'], [amber, '', 'current Δ']].concat(noisy ? [[ghost, 'swatch--dash', 'without noise']] : []));

    note(Math.abs(state.delta) < 0.5
      ? `<b>On resonance:</b> the drive axis lies in the equator and the arrow swings through both poles. After ${fixed(tPi(), 2)} µs (a π pulse) the ion is certainly excited; after twice that it is back in |0⟩.`
      : `<b>Detuned by ${kHzText(state.delta)}:</b> the drive axis tilts out of the equator by ${Math.round(Math.atan2(Math.abs(p.delta), p.omega) / DEG)}°. The arrow circles faster but can only reach P(1) = ${peak.toFixed(2)}.`);
    $('lab-status').textContent = noisy ? 'Noise is on: the grey dashed curves show the ideal ion for comparison.' : 'Check: with no noise the curve is exactly the Rabi formula above.';
  }

  function renderRamsey(p, sim, segs, t, P1now) {
    const brand = css('--series-1'), amber = css('--series-amber'), blue = css('--series-re');
    const finalP1 = I.P1(sim.avg[sim.avg.length - 1]);
    // contrast: the averaged arrow's length in the equator just before the last pulse
    const tLast = sim.total - segs[segs.length - 1].dur;
    const before = I.stateAt(sim, p, tLast).avg;
    const contrast = Math.hypot(before[0], before[1]);
    const turns = state.delta * state.tau / 1000;
    stats([
      ['Short pulses', fixed(tPi() / 2, 2) + ' µs', state.seq === 'echo' ? `π/2 at each end, a ${fixed(tPi(), 2)} µs π between` : 'a π/2 pulse at each end'],
      ['Phase in the wait', fixed(turns, 2) + ' turns', 'Δτ/2π'],
      ['Final P(1)', prob(finalP1), state.seq === 'echo' ? 'spin echo' : 'Ramsey'],
      ['Contrast', contrast.toFixed(3), 'arrow length in the equator before the last pulse'],
    ]);
    $('pa-title').textContent = 'P(1) during the sequence';
    $('pa-cap').textContent = 'Shaded: laser pulses. In between, the laser is off and the arrow precesses around the equator at the detuning.';
    legend('pa-legend', [[brand, '', 'P(1)'], [amber, '', 'now']]);

    const seqs = {
      ramsey: tau => [{ kind: 'pulse', dur: tPi() / 2, phase: 0 }, { kind: 'wait', dur: tau }, { kind: 'pulse', dur: tPi() / 2, phase: 0 }],
      echo: tau => [{ kind: 'pulse', dur: tPi() / 2, phase: 0 }, { kind: 'wait', dur: tau / 2 }, { kind: 'pulse', dur: tPi(), phase: 0 }, { kind: 'wait', dur: tau / 2 }, { kind: 'pulse', dur: tPi() / 2, phase: Math.PI }],
    };
    const B = [];
    if (state.scan === 'tau') {
      const key = JSON.stringify(['tau', state.omega, state.delta, state.sigma, p.g1, p.g2]);
      const sc = cached(key, () => {
        const xs = [], ram = [], ech = [], cache = new Map();
        for (let i = 0; i <= 150; i++) {
          const tau = 300 * i / 150;
          xs.push(tau);
          ram.push(I.P1(I.finalState(seqs.ramsey(tau), p, ENSEMBLE, cache)));
          ech.push(I.P1(I.finalState(seqs.echo(tau), p, ENSEMBLE, cache)));
        }
        return { xs, ram, ech };
      });
      plotB.opts.xLabel = 'Wait τ (µs)';
      plotB.setRange([0, 300], [0, 1.04]);
      B.push({ type: 'hline', y: 0.5, color: css('--series-ghost'), dash: [2, 4] });
      B.push({ type: 'line', x: sc.xs, y: sc.ech, color: blue, width: state.seq === 'echo' ? 2.6 : 1.6 });
      B.push({ type: 'line', x: sc.xs, y: sc.ram, color: brand, width: state.seq === 'ramsey' ? 2.6 : 1.6 });
      B.push({ type: 'vline', x: state.tau, color: amber, width: 1.6, dash: [] });
      $('pb-title').textContent = 'Final P(1) against the wait';
      $('pb-cap').textContent = 'Both sequences, ending at every wait from 0 to 300 µs. Ramsey oscillates at the detuning; the echo does not depend on it. Decay pulls both toward ½, where the ion has forgotten.';
    } else {
      const half = Math.max(20, Math.min(120, 8000 / Math.max(state.tau, 1)));
      const key = JSON.stringify(['delta', state.seq, state.omega, state.tau, state.sigma, p.g1, p.g2, half]);
      const sc = cached(key, () => {
        const xs = [], ys = [], cache = new Map();
        for (let i = 0; i <= 400; i++) {
          const f = -half + 2 * half * i / 400;
          xs.push(f);
          ys.push(I.P1(I.finalState(seqs[state.seq](state.tau), { ...p, delta: I.kHz(f) }, 31, cache)));
        }
        return { xs, ys };
      });
      plotB.opts.xLabel = 'Detuning Δ/2π (kHz)';
      plotB.setRange([-half, half], [0, 1.04]);
      B.push({ type: 'line', x: sc.xs, y: sc.ys, color: state.seq === 'echo' ? blue : brand, width: 2.2 });
      B.push({ type: 'vline', x: state.delta, color: amber, width: 1.6, dash: [] });
      $('pb-title').textContent = state.seq === 'echo' ? 'Final P(1) against detuning: echo' : 'Ramsey fringes';
      $('pb-cap').textContent = state.seq === 'echo'
        ? 'The echo cancels the detuning during the wait, so only the short pulses still depend on it.'
        : `Fringes 1/τ = ${kHzText(1000 / Math.max(state.tau, 1e-9))} apart, inside the much wider response of a single π/2 pulse.`;
    }
    plotB.opts.yLabel = 'Final P(1)';
    plotB.draw(B);
    legend('pb-legend', state.scan === 'tau'
      ? [[brand, '', 'Ramsey'], [blue, '', 'spin echo'], [amber, '', 'current τ']]
      : [[state.seq === 'echo' ? blue : brand, '', state.seq === 'echo' ? 'spin echo' : 'Ramsey'], [amber, '', 'current Δ']]);

    if (state.sigma > 0 && state.seq === 'ramsey') note('<b>Field noise:</b> each thin arrow is one shot with a slightly different detuning. They fan out around the equator during the wait, so their average, the thick arrow, shrinks. Switch to the spin echo to bring them back together.');
    else if (state.sigma > 0) note('<b>Spin echo:</b> the π pulse in the middle flips the fan of arrows over, so the shots that ran ahead now fall behind by the same amount. At the end of the wait they meet again, whatever each shot\'s detuning was.');
    else note(`<b>Ramsey:</b> during the wait the arrow turns ${fixed(turns, 2)} times around the equator. The second π/2 pulse turns that phase into P(1), so the result oscillates as you change τ or Δ.`);
    $('lab-status').textContent = `Field noise is averaged over ${state.sigma > 0 ? ENSEMBLE : 1} detuning${state.sigma > 0 ? 's' : ''}; ${state.sigma > 0 ? 'every fifth one is drawn on the sphere.' : 'switch on field noise to see the spread.'}`;
  }

  function renderDecay(p, sim, segs, t, r, P1now) {
    const brand = css('--series-1'), amber = css('--series-amber'), blue = css('--series-re');
    const purity = (1 + r[0] * r[0] + r[1] * r[1] + r[2] * r[2]) / 2;
    stats([
      ['T₁', fmtT(p.T1), 'energy loss'],
      ['T₂', fmtT(p.R.T2eff), p.R.capped ? 'capped at 2T₁' : 'dephasing'],
      ['P(1) now', prob(P1now), `after ${fmtTime(t)}`],
      ['Purity', purity.toFixed(3), 'Tr ρ²: 1 pure, ½ fully mixed'],
    ]);
    $('pa-title').textContent = 'Energy loss: P(1)';
    $('pa-cap').textContent = p.g1 > 0 ? 'After the first pulse (shaded) the excitation decays. Orange dashed: P(1) at the end of the pulse times e^(−t/T₁).' : 'T₁ is ∞, so the excitation never decays.';
    legend('pa-legend', [[brand, '', 'P(1)']].concat(p.g1 > 0 ? [[amber, 'swatch--dash', 'e^(−t/T₁)']] : []));

    const ts = sim.t, perp = sim.avg.map(v => Math.hypot(v[0], v[1])), len = sim.avg.map(v => Math.hypot(v[0], v[1], v[2]));
    plotB.opts.xLabel = 'Time t (µs)';
    plotB.opts.yLabel = 'Length';
    plotB.setRange([0, sim.total], [0, 1.04]);
    const B = [];
    const t0 = segs[0].dur;
    B.push({ type: 'vband', x0: 0, x1: t0, color: NanoPlot.alpha(brand, 0.1) });
    if (p.g2 > 0 && state.prep === 'half') {
      const i0 = ts.findIndex(v => v >= t0 - 1e-9), c0 = perp[i0];
      const xs = ts.filter(v => v >= t0 - 1e-9);
      B.push({ type: 'line', x: xs, y: xs.map(v => c0 * Math.exp(-(v - t0) * p.g2)), color: amber, width: 1.6, dash: [6, 4] });
    }
    B.push({ type: 'line', x: ts, y: len, color: blue, width: 2 });
    B.push({ type: 'line', x: ts, y: perp, color: brand, width: 2.4 });
    B.push({ type: 'vline', x: t, color: amber, width: 1.6, dash: [] });
    plotB.draw(B);
    $('pb-title').textContent = 'Coherence and the length of the arrow';
    $('pb-cap').textContent = 'Coherence |r⊥| = 2|ρ₀₁| is the arrow\'s part in the equator; it decays with T₂. The whole arrow\'s length |r| is 1 only for a pure state.';
    legend('pb-legend', [[brand, '', 'coherence |r⊥|'], [blue, '', 'arrow length |r|']].concat(p.g2 > 0 && state.prep === 'half' ? [[amber, 'swatch--dash', 'e^(−t/T₂)']] : []));

    if (!(p.g1 > 0) && !(p.g2 > 0) && !(p.sigma > 0)) note('<b>No decay:</b> with T₁ and T₂ both ∞ the ion remembers its state forever. Shorten them to watch it forget.');
    else if (state.prep === 'pi') note('<b>After a π pulse</b> the arrow points straight down. Energy loss slides it back up the z axis to |0⟩: it shrinks to nothing at the centre, then grows again as the ion settles into the ground state.');
    else note('<b>After a π/2 pulse</b> the arrow lies in the equator. Dephasing shrinks it toward the axis while energy loss lifts it toward |0⟩, so it moves inward and up, spiralling if the laser is detuned. Every point inside the sphere is a mixed state.');
    $('lab-status').textContent = `The plotted window is 4 × the longest decay time, ${fmtTime(sim.total - segs[0].dur)} after the pulse.`;
  }

  // ---------- modes ----------
  function applyMode() {
    document.querySelectorAll('.tab').forEach(b => {
      const on = b.dataset.mode === mode;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    $('lab').setAttribute('aria-labelledby', 'tab-' + mode);
    document.querySelectorAll('.mode-intro').forEach(el => { el.hidden = el.dataset.for !== mode; });
    document.querySelectorAll('[data-modes]').forEach(el => { el.hidden = !el.dataset.modes.split(' ').includes(mode); });
    $('sphere-cap').textContent = {
      rabi: 'Drag to turn. The arrow precesses about the orange drive axis while the laser is on.',
      ramsey: 'Drag to turn. The orange axis appears during each pulse; thin arrows are single shots when field noise is on.',
      decay: 'Drag to turn. Inside the sphere the ion is in a mixed state; the density matrix is below.',
    }[mode];
    render();
  }

  function enterMode(m) {
    mode = m;
    if (m === 'ramsey' && !visited.ramsey && state.delta === 0) state.delta = 10;
    if (m === 'decay' && !visited.decay && !Number.isFinite(T_STEPS[state.t1]) && !Number.isFinite(T_STEPS[state.t2])) { state.t1 = 6; state.t2 = 5; }
    if (m in visited) visited[m] = true;
    applyMode();
  }

  // ---------- playback ----------
  let playing = false, raf = 0, last = 0, speed = 1;
  function totalNow() { return segments(mode, params()).reduce((a, s) => a + s.dur, 0); }
  function frame(now) {
    if (!playing) return;
    const dt = Math.min(100, now - last); last = now;
    const total = totalNow();
    let t = Math.min(tNow[mode], total) + total * dt / 1000 / PLAY_SECONDS * speed;
    if (t >= total) { t = total; playing = false; }
    tNow[mode] = t;
    render();
    if (playing) raf = requestAnimationFrame(frame);
  }
  function play() {
    const total = totalNow();
    if (Math.min(tNow[mode], total) >= total - 1e-9) tNow[mode] = 0;
    if (reduceMotion) { tNow[mode] = total; render(); return; }
    playing = true; last = performance.now();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    render();
  }
  function pause() { playing = false; cancelAnimationFrame(raf); }

  $('play').addEventListener('click', () => { if (playing) { pause(); render(); } else play(); });
  $('rewind').addEventListener('click', () => { pause(); tNow[mode] = 0; render(); });
  $('time').addEventListener('input', e => { pause(); const v = +e.target.value; tNow[mode] = v >= 1000 ? Infinity : totalNow() * v / 1000; render(); });
  $('speed').addEventListener('change', e => { speed = +e.target.value; });
  $('window').addEventListener('change', e => { state.window = +e.target.value; render(); });

  // ---------- controls ----------
  const sliders = { omega: 'omega', delta: 'delta', phase: 'phase', tau: 'tau', sigma: 'sigma', t1: 't1', t2: 't2' };
  Object.keys(sliders).forEach(k => $(k).addEventListener('input', e => { pause(); state[k] = +e.target.value; render(); }));
  document.querySelectorAll('[data-delta]').forEach(b => b.addEventListener('click', () => { pause(); state.delta = Math.round(+b.dataset.delta * state.omega); render(); }));
  document.querySelectorAll('#seq [data-seq]').forEach(b => b.addEventListener('click', () => { pause(); state.seq = b.dataset.seq; render(); }));
  document.querySelectorAll('#prep [data-prep]').forEach(b => b.addEventListener('click', () => { pause(); state.prep = b.dataset.prep; tNow.decay = Infinity; render(); }));
  document.querySelectorAll('#scan [data-scan]').forEach(b => b.addEventListener('click', () => { state.scan = b.dataset.scan; render(); }));
  $('ideal').addEventListener('click', () => { pause(); state.sigma = 0; state.t1 = 13; state.t2 = 13; render(); });
  $('reset-view').addEventListener('click', () => sphere.setView(28 * DEG, 16 * DEG, true));
  if ('ResizeObserver' in window) new ResizeObserver(() => render()).observe($('timeline'));

  const tabs = Array.from(document.querySelectorAll('.tab'));
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => { pause(); enterMode(b.dataset.mode); });
    b.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus(); next.click();
    });
  });

  // ---------- predict-first loaders ----------
  const IDEAL = { sigma: 0, t1: 13, t2: 13 };
  const QUESTIONS = {
    q1: ['rabi', { omega: 100, delta: 0, phase: 0, window: 20, ...IDEAL }],
    q2: ['rabi', { omega: 100, delta: 100, phase: 0, window: 50, ...IDEAL }],
    q3: ['rabi', { omega: 100, delta: 0, phase: 0, window: 20, ...IDEAL }],
    q4: ['ramsey', { omega: 100, delta: 10, tau: 50, seq: 'ramsey', scan: 'tau', ...IDEAL }],
    q5: ['ramsey', { omega: 100, delta: 10, tau: 50, seq: 'ramsey', scan: 'tau', ...IDEAL, sigma: 3 }],
    q6: ['ramsey', { omega: 100, delta: 10, tau: 100, seq: 'echo', scan: 'tau', ...IDEAL, sigma: 3, t2: 4 }],
    q7: ['decay', { omega: 100, delta: 0, prep: 'pi', ...IDEAL, t1: 6 }],
    q8: ['decay', { omega: 100, delta: 0, prep: 'half', ...IDEAL, t1: 6 }],
  };
  document.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
    pause();
    const [m, values] = QUESTIONS[b.dataset.q];
    state = { ...state, ...values };
    visited.ramsey = visited.decay = true;
    tNow[m] = Infinity;
    enterMode(m);
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }));

  applyMode();
})();
