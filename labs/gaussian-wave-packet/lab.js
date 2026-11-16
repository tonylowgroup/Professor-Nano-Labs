/* Gaussian Wave Packet lab: controls, playback and drawing. Physics is in physics.js. */
(function () {
  'use strict';
  const W = window.WavePacket;
  const $ = id => document.getElementById(id);

  // Mass slider is logarithmic: 0.05 m0 ... 3 m0
  const M_MIN = 0.05, M_MAX = 3;
  const massFromSlider = v => M_MIN * Math.pow(M_MAX / M_MIN, v / 1000);
  const sliderFromMass = m => Math.round(1000 * Math.log(m / M_MIN) / Math.log(M_MAX / M_MIN));

  const DEFAULTS = { sigma: Math.SQRT1_2, k0: 0, mass: 0.5, tmax: 50, X: 20, mode: 'full', waves: 0 };
  const PRESETS = {
    rest:   { ...DEFAULTS },
    narrow: { ...DEFAULTS, sigma: Math.SQRT1_2 / 2 },
    heavy:  { ...DEFAULTS, mass: 2 },
    moving: { sigma: 2, k0: 3, mass: 1, tmax: 50, X: 40, mode: 'full', waves: 0 },
    linear: { sigma: 2, k0: 3, mass: 1, tmax: 50, X: 40, mode: 'linear', waves: 0 },
    few:    { sigma: 2, k0: 3, mass: 1, tmax: 50, X: 40, mode: 'full', waves: 15 },
  };

  const state = { ...DEFAULTS, t: 0, playing: false, speed: 1, ghost: true, envelope: true, preset: 'rest' };
  let model = null, re = null, im = null, re0 = null, im0 = null, dens0 = null, kCurve = null;

  // ---------- plots ----------
  const plotD = new NanoPlot($('plot-density'), { xLabel: 'Position x (nm)', yLabel: '|Ψ|² (nm⁻¹)' });
  const plotR = new NanoPlot($('plot-reim'), { xLabel: 'Position x (nm)', yLabel: 'Ψ (nm⁻¹ᐟ²)', zeroLine: true });
  const plotK = new NanoPlot($('plot-k'), { xLabel: 'Wavevector k (nm⁻¹)', yLabel: '|Φ(k)|² (nm)' });
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ---------- model ----------
  function rebuild() {
    const p = {
      sigma: state.sigma, k0: state.k0, mass: state.mass, tmax: state.tmax,
      X: state.X, mode: state.mode, waves: state.waves,
    };
    model = W.buildModel(p);
    re = new Float64Array(model.Nx); im = new Float64Array(model.Nx);
    re0 = new Float64Array(model.Nx); im0 = new Float64Array(model.Nx);
    W.evaluate(model, 0, re0, im0);
    dens0 = new Float64Array(model.Nx);
    let peak = 0;
    for (let i = 0; i < model.Nx; i++) { dens0[i] = re0[i] * re0[i] + im0[i] * im0[i]; peak = Math.max(peak, dens0[i]); }
    const peakTheory = 1 / (Math.sqrt(2 * Math.PI) * state.sigma);
    model.densMax = 1.12 * Math.max(peak, peakTheory);
    model.ampMax = 1.15 * Math.sqrt(Math.max(peak, peakTheory));

    // Momentum curve over k0 +- 2.2/sigma
    const kr = 2.2 / state.sigma, n = 300;
    const kx = new Float64Array(n), ky = new Float64Array(n);
    for (let i = 0; i < n; i++) { kx[i] = state.k0 - kr + 2 * kr * i / (n - 1); ky[i] = W.phiSquared(p, kx[i]); }
    kCurve = { x: kx, y: ky, range: [state.k0 - kr, state.k0 + kr], max: W.phiSquared(p, state.k0) };
    drawK();
    updateStatic();
    frame();
  }

  // ---------- drawing ----------
  function frame() {
    W.evaluate(model, state.t, re, im);
    const n = model.Nx, x = model.x;
    const dens = new Float64Array(n), env = new Float64Array(n), negEnv = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      dens[i] = re[i] * re[i] + im[i] * im[i];
      env[i] = Math.sqrt(dens[i]); negEnv[i] = -env[i];
    }

    plotD.setRange([-state.X, state.X], [0, model.densMax]);
    const dl = [];
    if (state.ghost) dl.push({ type: 'line', x, y: dens0, color: css('--series-ghost'), width: 1.5, dash: [5, 4] });
    dl.push({ type: 'line', x, y: dens, color: css('--series-1'), width: 2.2, fill: NanoPlot.alpha(css('--series-1'), .12) });
    if (model.Nk > 1) dl.push({ type: 'vline', x: model.vg * state.t, color: css('--series-amber'), dash: [3, 4], label: '⟨x⟩' });
    plotD.draw(dl);

    plotR.setRange([-state.X, state.X], [-model.ampMax, model.ampMax]);
    const rl = [];
    if (state.envelope) {
      rl.push({ type: 'line', x, y: env, color: css('--series-ghost'), width: 1.3, dash: [2, 3] });
      rl.push({ type: 'line', x, y: negEnv, color: css('--series-ghost'), width: 1.3, dash: [2, 3] });
    }
    rl.push({ type: 'line', x, y: re, color: css('--series-re'), width: 2 });
    rl.push({ type: 'line', x, y: im, color: css('--series-im'), width: 2, dash: [6, 4] });
    plotR.draw(rl);

    updateDynamic();
  }

  function drawK() {
    plotK.setRange(kCurve.range, [0, 1.15 * kCurve.max]);
    const layers = [{ type: 'line', x: kCurve.x, y: kCurve.y, color: css('--series-1'), width: 2.2, fill: NanoPlot.alpha(css('--series-1'), .10) }];
    const showStems = model.Nk <= 101;
    $('stem-legend').hidden = !showStems;
    if (showStems) {
      const sx = [], sy = [];
      for (let j = 0; j < model.Nk; j++) {
        if (model.k[j] >= kCurve.range[0] && model.k[j] <= kCurve.range[1]) { sx.push(model.k[j]); sy.push(W.phiSquared(model.p, model.k[j])); }
      }
      layers.push({ type: 'stems', x: sx, y: sy, color: css('--series-amber'), r: model.Nk > 41 ? 2 : 3 });
    }
    plotK.draw(layers);
  }

  // ---------- readouts ----------
  const f = (v, d) => (Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v).toFixed(d);

  function updateStatic() {
    $('sigma-out').textContent = state.sigma.toFixed(2) + ' nm';
    $('k0-out').textContent = f(state.k0, 1) + ' nm⁻¹';
    $('mass-out').textContent = (state.mass < 0.1 ? state.mass.toFixed(3) : state.mass.toFixed(2)) + ' m₀';
    $('k0-hint').textContent = state.k0 === 0
      ? 'k₀ = 0: no average momentum, so the packet stays centred.'
      : `Carrier wavelength 2π/|k₀| = ${(2 * Math.PI / Math.abs(state.k0)).toFixed(2)} nm.`;
    $('mode-hint').textContent = state.mode === 'full'
      ? 'Each plane wave keeps its own frequency, so the packet spreads.'
      : 'Every plane wave moves at the same group velocity: no spreading.';

    const n = state.waves;
    $('waves-out').textContent = n === 0 ? `Converged (${model.Nk})` : String(n);
    $('waves-hint').textContent = n === 0
      ? `Wavevectors span k₀ ± 8/σ in steps of Δk = ${model.dk.toPrecision(3)} nm⁻¹.`
      : n === 1 ? 'A single plane wave: one momentum, spread over all space.'
      : `Evenly spaced by Δk = ${model.dk.toPrecision(3)} nm⁻¹, so the sum repeats every ${model.period.toFixed(1)} nm.`;

    $('st-vg').textContent = f(model.vg, 3) + ' nm/fs';
    $('st-vg-sub').textContent = state.k0 === 0 ? 'k₀ = 0: at rest'
      : state.mode === 'linear' ? 'crests move with the packet' : `crests move at v_p = ${f(model.vg / 2, 3)} nm/fs`;
    $('st-tau').textContent = state.mode === 'linear' ? '∞' : fmtTime(model.tau);
    $('st-tau-sub').textContent = state.mode === 'linear' ? 'linearized: no spreading' : 'τ = 2mσ²/ħ';

    document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
    document.querySelectorAll('[data-show]').forEach(li => { li.hidden = !state[li.dataset.show]; });
    document.querySelectorAll('.preset').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.preset === state.preset)));
  }

  function fmtTime(fs) {
    if (fs >= 1e6) return (fs / 1e6).toPrecision(3) + ' ns';
    if (fs >= 1e3) return (fs / 1e3).toPrecision(3) + ' ps';
    return fs.toPrecision(3) + ' fs';
  }

  function updateDynamic() {
    const t = state.t;
    $('time-out').textContent = t.toFixed(1) + ' fs';
    const converged = state.waves === 0;
    const xc = model.vg * t;
    const st = model.widthAt(t);
    $('st-center').textContent = f(xc, 2) + ' nm';
    $('st-width').textContent = st.toFixed(2) + ' nm';
    $('st-width-sub').textContent = `σ(t); started at ${state.sigma.toFixed(2)} nm`;
    if (converged) {
      $('st-prob').textContent = (100 * W.windowProbability(model, re, im)).toFixed(1) + '%';
      $('st-prob-sub').textContent = 'of the probability, not renormalized';
    } else {
      $('st-prob').textContent = '—';
      $('st-prob-sub').textContent = 'a sum of a few plane waves cannot be normalized';
    }
    const unc = state.mode === 'linear' ? 1 : Math.sqrt(1 + (t / model.tau) ** 2);
    $('st-unc').textContent = unc.toFixed(2);

    const note = $('note');
    note.className = 'note';
    let msg = '';
    if (model.capped) {
      note.className = 'note note--warn';
      msg = 'This combination needs more plane waves than the lab uses, so copies of the packet may drift into view at late times. Shorten the time range or raise σ or the mass.';
    } else if (!converged && model.Nk > 1 && model.period < 2 * state.X) {
      msg = `Copies repeat every ${model.period.toFixed(1)} nm because the plane waves are evenly spaced. Add more plane waves to push them out of view.`;
    } else if (converged && Math.abs(xc) + 2 * st > state.X) {
      msg = 'Part of the packet has left the view. The probability is still there: choose a wider position window to see it.';
    }
    if (note.textContent !== msg) note.textContent = msg;

    const v = Math.round(1000 * t / state.tmax);
    if ((+$('time').value) !== v) $('time').value = v;
  }

  // ---------- controls ----------
  function setFromState() {
    $('sigma').value = state.sigma;
    $('k0').value = state.k0;
    $('mass').value = sliderFromMass(state.mass);
    $('tmax').value = String(state.tmax);
    $('window').value = String(state.X);
    $('waves').value = String(W.WAVE_COUNTS.indexOf(state.waves));
    $('ghost').checked = state.ghost;
    $('envelope').checked = state.envelope;
  }

  function applyPreset(name) {
    Object.assign(state, PRESETS[name], { t: 0, preset: name });
    pause();
    setFromState();
    rebuild();
  }

  function changed(updates) {
    Object.assign(state, updates, { preset: null });
    rebuild();
  }

  $('sigma').addEventListener('input', e => changed({ sigma: +e.target.value }));
  $('k0').addEventListener('input', e => changed({ k0: +e.target.value }));
  $('mass').addEventListener('input', e => changed({ mass: massFromSlider(+e.target.value) }));
  document.querySelectorAll('[data-mass]').forEach(b => b.addEventListener('click', () => {
    const m = +b.dataset.mass; $('mass').value = sliderFromMass(m); changed({ mass: m });
  }));
  document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => changed({ mode: b.dataset.mode })));
  $('waves').addEventListener('input', e => changed({ waves: W.WAVE_COUNTS[+e.target.value] }));
  $('window').addEventListener('change', e => changed({ X: +e.target.value }));
  $('tmax').addEventListener('change', e => { state.t = Math.min(state.t, +e.target.value); changed({ tmax: +e.target.value }); });
  $('ghost').addEventListener('change', e => { state.ghost = e.target.checked; updateStatic(); frame(); });
  $('envelope').addEventListener('change', e => { state.envelope = e.target.checked; updateStatic(); frame(); });
  $('speed').addEventListener('change', e => { state.speed = +e.target.value; });
  $('time').addEventListener('input', e => { pause(); state.t = state.tmax * (+e.target.value) / 1000; frame(); });
  $('reset').addEventListener('click', () => { pause(); state.t = 0; frame(); });
  document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
    applyPreset(b.dataset.preset);
    if (b.classList.contains('predict__load')) document.querySelector('.lab-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  // ---------- playback ----------
  const PASS_MS = 6000;            // one pass through the time range at 1x
  let raf = 0, last = 0;
  function tick(now) {
    if (!state.playing) return;
    const dt = Math.min(64, now - last); last = now;
    state.t += state.tmax * dt / PASS_MS * state.speed;
    if (state.t > state.tmax) state.t = 0;
    frame();
    raf = requestAnimationFrame(tick);
  }
  function play() {
    if (state.playing) return;
    if (state.t >= state.tmax) state.t = 0;
    state.playing = true; last = performance.now();
    $('play').textContent = '❚❚ Pause';
    raf = requestAnimationFrame(tick);
  }
  function pause() {
    state.playing = false; cancelAnimationFrame(raf);
    $('play').textContent = '▶ Play';
  }
  $('play').addEventListener('click', () => (state.playing ? pause() : play()));

  // ---------- start ----------
  setFromState();
  rebuild();
})();
