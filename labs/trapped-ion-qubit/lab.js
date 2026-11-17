/* Trapped Ions and Phonon Sidebands: controls, playback and drawing.
   Physics is in physics.js; the level diagrams are in diagrams.js. */
(function () {
  'use strict';
  const I = window.Ion, D = window.IonDiagrams, COL = D.COL;
  const $ = id => document.getElementById(id);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PLAY_SECONDS = 8;
  const PER = 40;                                  // replay samples per pulse

  const LASER = {
    carrier: { name: 'Carrier', freq: 'ω₀', color: COL.carrier, window: 40 },
    blue: { name: 'Blue sideband', freq: 'ω₀ + ω<sub>p</sub>', color: COL.blue, window: 400 },
    red: { name: 'Red sideband', freq: 'ω₀ − ω<sub>p</sub>', color: COL.red, window: 400 },
  };

  const INITIAL = {
    laser: 'carrier', pstart: 'fock', np: 0, nbar1: 1,
    bstart: [0, 0, 0], pulses: [], target: 3,
    nbar3: 5, plan: 'fixed', recoil: 1, cycles: 40,
    theta: 90, mub: 8, mud: 0.3, thr: 3, pumpCycles: 3,
  };
  let S = JSON.parse(JSON.stringify(INITIAL));
  let mode = 'sidebands';
  const tNow = { sidebands: Infinity, bus: 0, cooling: 0 };

  // readout shots
  let shots = { key: '', counts: [] };
  let lastShot = null, readStage = 'read';
  let lastRecipe = null;          // the bus recipe being shown, for its own explanation

  // ---------- formatting ----------
  const fixed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const prob = x => Math.max(0, Math.min(1, x)).toFixed(3);
  const pct = x => (x > 0 && x < 0.0005 ? '<0.1%' : (100 * x).toFixed(x < 0.1 ? 1 : 0) + '%');
  const ketHTML = (a2, a3, n) => `|${a2}<sub>2</sub> ${a3}<sub>3</sub>, ${n}<sub>p</sub>⟩`;
  const PULSE_NAME = { carrier: 'carrier', red: 'red', blue: 'blue' };
  const areaText = a => (Math.abs(a - Math.PI) < 1e-9 ? 'π' : Math.abs(a - Math.PI / 2) < 1e-9 ? 'π/2' : fixed(a / Math.PI, 2) + 'π');

  // ---------- plots ----------
  const MARGIN = { l: 58, r: 30, t: 12, b: 42 };
  const plotA = new NanoPlot($('plot-a'), { xLabel: '', yLabel: '', margin: MARGIN });
  const plotB = new NanoPlot($('plot-b'), { xLabel: '', yLabel: '', margin: MARGIN });
  function barLayers(xs, ys, color, width, fill) {
    return xs.map((x, i) => ({ type: 'line', x: [x - width / 2, x - width / 2, x + width / 2, x + width / 2], y: [0, ys[i], ys[i], 0], color, width: 1.2, fill: fill || NanoPlot.alpha(color, 0.75) }));
  }
  function legend(id, items) {
    $(id).innerHTML = items.map(([color, kind, label]) => `<li style="color:${color}"><span class="swatch ${kind}"></span><span>${label}</span></li>`).join('');
  }
  function stats(items) {
    $('stats').innerHTML = items.map(([label, value, sub]) =>
      `<div class="stat"><div class="stat__label">${label}</div><div class="stat__value">${value}</div><div class="stat__sub">${sub}</div></div>`).join('');
  }
  const note = html => { $('takeaway').innerHTML = html; };

  // ---------- 1. carrier and sidebands ----------
  function phononStart() { return S.pstart === 'fock' ? I.fock(S.np, 12) : I.thermal(S.nbar1, 40); }

  function renderSidebands() {
    const L = LASER[S.laser], T = L.window;
    const t = Math.min(tNow.sidebands, T);
    const P = phononStart();
    const r = I.flop(P, S.laser, t);
    const cols = S.pstart === 'fock' ? Math.max(4, S.np + 2) : 6;
    const arrows = [];
    for (let n = 0; n < cols; n++) {
      const m = I.partner(S.laser, n);
      if (m < 0 || m >= cols || I.rabi(S.laser, n) === 0) continue;
      arrows.push({ kind: S.laser, n, opacity: (P[n] || 0) > 0.005 ? 1 : 0.22 });
    }
    $('diagram').innerHTML = D.single({ cols, g: r.g, e: r.e, arrows, more: S.pstart === 'thermal' });
    $('dg-title').textContent = 'The ladder of |g, nₚ⟩ and |e, nₚ⟩';
    $('dg-cap').innerHTML = `Each column is one phonon number, ħω<sub>p</sub> above the last. Arrows are the transitions this laser drives; yellow dots show where the population is now.`;
    $('dg-legend').innerHTML = `<span style="color:${L.color}">●</span> ${L.name.toLowerCase()} laser`;

    // plot A: P(e) for all three colours, this one bold
    const ts = Array.from({ length: 601 }, (_, i) => T * i / 600);
    const A = [];
    ['carrier', 'blue', 'red'].forEach(k => {
      if (k === S.laser) return;
      A.push({ type: 'line', x: ts, y: ts.map(v => I.flop(P, k, v).Pe), color: NanoPlot.alpha(LASER[k].color, k === 'carrier' && S.laser !== 'carrier' ? 0.18 : 0.35), width: 1.2 });
    });
    A.push({ type: 'line', x: ts, y: ts.map(v => I.flop(P, S.laser, v).Pe), color: L.color, width: 2.6 });
    A.push({ type: 'vline', x: t, color: css('--series-amber'), width: 1.6, dash: [] });
    plotA.opts.xLabel = 'Pulse length t (µs)';
    plotA.opts.xTicks = 7;
    plotA.opts.yLabel = 'Excitation probability P(e)';
    plotA.setRange([0, T], [0, 1.04]);
    plotA.draw(A);
    $('pa-title').textContent = 'How fast each colour flips the ion';
    $('pa-cap').textContent = `P(e) while the laser stays on. Bold: the ${L.name.toLowerCase()}. Faint: the other two colours on the same ion, for comparison.`;
    legend('pa-legend', [[COL.carrier, '', 'carrier'], [COL.blue, '', 'blue sideband'], [COL.red, '', 'red sideband']]);

    // plot B: phonon distribution before and now
    const N = 8, xs = Array.from({ length: N + 1 }, (_, n) => n);
    const now = xs.map(n => (r.g[n] || 0) + (r.e[n] || 0));
    plotB.opts.xLabel = 'Phonon number nₚ';
    plotB.opts.yLabel = 'Probability';
    plotB.opts.xTicks = 8;
    plotB.setRange([-0.6, N + 0.6], [0, 1.04]);
    plotB.draw([
      ...barLayers(xs, xs.map(n => P[n] || 0), COL.muted, 0.8, 'rgba(0,0,0,0)'),
      ...barLayers(xs, now, COL.pop, 0.5),
    ]);
    $('pb-title').textContent = 'Phonons before and now';
    $('pb-cap').textContent = 'Outline: the phonon distribution at the start. Yellow: now, counting both |g⟩ and |e⟩. The carrier never changes it; the sidebands shift it by one.';
    legend('pb-legend', [[COL.muted, '', 'start'], [COL.pop, '', 'now']]);

    const w = S.pstart === 'fock' ? I.rabi(S.laser, S.np) : null;
    stats([
      ['Laser', L.freq, L.name.toLowerCase()],
      ['Flip rate', w === null ? 'varies' : w === 0 ? 'none' : fixed(w * 1000 / I.TAU, 1) + ' kHz', S.laser === 'carrier' ? 'Ω/2π' : S.laser === 'blue' ? 'η√(nₚ + 1) Ω/2π' : 'η√nₚ Ω/2π'],
      ['Flip time', w === null ? 'varies' : w === 0 ? '—' : fixed(Math.PI / w, 1) + ' µs', w === 0 ? 'no transition from 0ₚ' : 'a π pulse: fully excited'],
      ['Excited now', prob(r.Pe), `P(e) after ${fixed(t, 1)} µs`],
    ]);

    if (S.pstart === 'fock') {
      const n = S.np, m = I.partner(S.laser, n), th = (w || 0) * t / 2;
      if (m < 0 || !w) $('ket').innerHTML = `<b>State:</b> |g, ${n}<sub>p</sub>⟩ stays put: the red sideband would need |e, −1<sub>p</sub>⟩, and there is no such state.`;
      else {
        // carrier: cos|g> - i sin|e>; sidebands: cos|g> + sin|e>
        const sn = Math.sin(th), amp = S.laser === 'carrier' ? -sn : sn;
        $('ket').innerHTML = `<b>State:</b> ${fixed(Math.cos(th), 3)} |g, ${n}<sub>p</sub>⟩ ${amp < -5e-4 ? '−' : '+'} ${Math.abs(sn).toFixed(3)}${S.laser === 'carrier' ? 'i' : ''} |e, ${m}<sub>p</sub>⟩`;
      }
    } else $('ket').innerHTML = '<b>State:</b> a thermal mixture. Each phonon number flops at its own rate, so the curves wash out instead of reaching 1.';

    if (S.laser === 'red' && S.pstart === 'fock' && S.np === 0) note('<b>Nothing happens.</b> The red sideband takes a phonon away, and |g, 0<sub>p</sub>⟩ has none. Try the carrier or the blue sideband, or start with a phonon.');
    else if (S.laser === 'carrier') note('<b>Carrier:</b> only the electronic state changes; every column flips straight up and the phonon number is conserved. It is ten times faster than a sideband here.');
    else note(`<b>${L.name}:</b> the ion is excited ${S.laser === 'blue' ? 'while a phonon is added' : 'while a phonon is taken away'}, so the arrows lean ${S.laser === 'blue' ? 'right' : 'left'}. Higher phonon numbers flop faster, as √${S.laser === 'blue' ? '(nₚ + 1)' : 'nₚ'}.`);
    $('lab-status').textContent = 'Resolved-sideband model: each colour drives only its own transitions.';
    syncTime(t / T, `${fixed(t, 1)} µs`);
  }

  // ---------- 2. phonon bus ----------
  const psi0 = () => I.busState(...S.bstart);
  function busLabel(phon) {
    const parts = phon.map((p, n) => [p, n]).filter(([p]) => p > 0.005).map(([p, n]) => `|${n}ₚ⟩ ${pct(p)}`);
    return 'bus: ' + parts.join(' · ');
  }
  let busTraj = null, busKey = '';
  function busTrajectory() {
    const key = JSON.stringify([S.bstart, S.pulses]);
    if (key !== busKey) {
      busKey = key;
      const out = [];
      let psi = psi0();
      const push = (t, p) => { const m = I.busMarginals(p); out.push({ t, Pe2: m.Pe2, Pe3: m.Pe3, nbar: m.nbar }); };
      push(0, psi);
      S.pulses.forEach((pl, i) => {
        for (let j = 1; j <= PER; j++) push(i + j / PER, I.pulse(psi, pl, j / PER));
        psi = I.pulse(psi, pl, 1);
      });
      busTraj = out;
    }
    return busTraj;
  }

  function renderBus() {
    const n = S.pulses.length, t = Math.min(tNow.bus, n);
    const psi = I.runBus(psi0(), S.pulses, t);
    const m = I.busMarginals(psi);
    const k = Math.floor(t + 1e-9), inPulse = t - k > 1e-6 && k < n;
    const shown = inPulse ? S.pulses[k] : (k > 0 ? S.pulses[k - 1] : null);
    const arrows = [];
    if (shown) for (let q = 0; q < 3; q++) arrows.push({ kind: shown.kind, n: q, opacity: inPulse ? 1 : 0.55 });
    $('diagram').innerHTML = D.bus({ ion2: m.ion2, ion3: m.ion3, target: shown ? shown.ion : S.target, arrows, busLabel: busLabel(m.phon), narrow: $('diagram').clientWidth < 560 });
    $('dg-title').textContent = 'Qubits 2 and 3 on the phonon bus';
    $('dg-cap').innerHTML = 'Each box is one ion\'s ladder, with the shared phonon number across. Yellow dots: the chance of finding that ion in that level together with that many phonons. Arrows: the pulse being applied.';
    $('dg-legend').innerHTML = shown ? `<span style="color:${LASER[shown.kind].color}">●</span> ${PULSE_NAME[shown.kind]} ${areaText(shown.area)} on qubit ${shown.ion}` : '';

    // ket
    const terms = [];
    let ph = null;
    for (let a2 = 0; a2 < 2; a2++) for (let a3 = 0; a3 < 2; a3++) for (let q = 0; q <= I.NB; q++) {
      const z = psi[I.idx(a2, a3, q)];
      if (I.abs2(z) < 1e-6) continue;
      if (ph === null) ph = Math.atan2(z[1], z[0]);
      terms.push([z, a2 ? 'e' : 'g', a3 ? 'e' : 'g', q]);
    }
    const c = Math.cos(-ph), s = Math.sin(-ph);
    const str = terms.map(([z, a2, a3, q], i) => {
      const re = z[0] * c - z[1] * s, im = z[0] * s + z[1] * c;
      let coef;
      if (Math.abs(im) < 1e-4) coef = (re < 0 ? '− ' : i ? '+ ' : '') + Math.abs(re).toFixed(3);
      else if (Math.abs(re) < 1e-4) coef = (im < 0 ? '− ' : i ? '+ ' : '') + Math.abs(im).toFixed(3) + 'i';
      else coef = (i ? '+ ' : '') + `(${fixed(re, 3)} ${im < 0 ? '−' : '+'} ${Math.abs(im).toFixed(3)}i)`;
      return `${coef} ${ketHTML(a2, a3, q)}`;
    }).join(' ');
    $('ket').innerHTML = `<b>State:</b> ${str} <span class="ket__aside">overall phase removed</span>`;

    // populations grid
    const rows = [[0, 0], [0, 1], [1, 0], [1, 1]];
    let g = '<div class="popgrid__grid"><span></span>' + [0, 1, 2].map(q => `<span class="popgrid__h">${q}<sub>p</sub></span>`).join('');
    rows.forEach(([a2, a3]) => {
      g += `<span class="popgrid__h popgrid__row">|${a2 ? 'e' : 'g'}<sub>2</sub> ${a3 ? 'e' : 'g'}<sub>3</sub>⟩</span>`;
      [0, 1, 2].forEach(q => {
        const p = I.abs2(psi[I.idx(a2, a3, q)]);
        g += `<span class="popgrid__c">${p > 0.0005 ? `<i style="width:${(6 + 30 * Math.sqrt(p)).toFixed(1)}px;height:${(6 + 30 * Math.sqrt(p)).toFixed(1)}px"></i><b>${pct(p)}</b>` : ''}</span>`;
      });
    });
    $('popgrid').innerHTML = g + '</div>';
    $('pb-title').textContent = 'Every joint state';
    $('pb-cap').textContent = 'The computational space: two qubits times the bus in 0ₚ, 1ₚ (and 2ₚ, which a good recipe avoids).';
    legend('pb-legend', []);

    // plot A along the sequence
    const traj = busTrajectory(), xs = traj.map(p => p.t);
    plotA.opts.xLabel = 'Position in the pulse sequence';
    plotA.opts.yLabel = 'Probability';
    plotA.opts.xTicks = n >= 1 && n <= 8 ? n : 8;
    plotA.setRange([0, Math.max(n, 1)], [0, 1.04]);
    const A = [];
    for (let i = 1; i < n; i++) A.push({ type: 'vline', x: i, color: NanoPlot.alpha(css('--series-ghost'), 0.8), dash: [2, 4] });
    if (n) {
      A.push({ type: 'line', x: xs, y: traj.map(p => p.nbar), color: COL.pop, width: 2, dash: [6, 4] });
      A.push({ type: 'line', x: xs, y: traj.map(p => p.Pe2), color: css('--series-1'), width: 2.4 });
      A.push({ type: 'line', x: xs, y: traj.map(p => p.Pe3), color: css('--series-re'), width: 2.4 });
      A.push({ type: 'vline', x: t, color: css('--series-amber'), width: 1.6, dash: [] });
    }
    plotA.draw(A);
    $('pa-title').textContent = 'Along the pulse sequence';
    $('pa-cap').textContent = 'The chance that each qubit is excited, and the mean number of phonons on the bus, through every pulse.';
    legend('pa-legend', [[css('--series-1'), '', 'P(e₂)'], [css('--series-re'), '', 'P(e₃)'], [COL.pop, 'swatch--dash', 'phonons on the bus']]);

    const C = I.busConcurrence(psi);
    stats([
      ['Qubit 2 excited', prob(m.Pe2), 'P(e₂)'],
      ['Qubit 3 excited', prob(m.Pe3), 'P(e₃)'],
      ['Phonons on the bus', fixed(m.nbar, 2), busLabel(m.phon).replace('bus: ', '')],
      ['Entanglement', C ? fixed(C.C, 3) : '—', C ? `concurrence of qubits 2 and 3; bus in |${C.n}ₚ⟩` : 'the bus is still entangled with the qubits'],
    ]);

    // pulse sequence strip
    $('pulse-seq').innerHTML = `<span class="pulse-seq__start">${ketHTML(S.bstart[0] ? 'e' : 'g', S.bstart[1] ? 'e' : 'g', S.bstart[2])}</span>` +
      (n ? S.pulses.map((p, i) => `<button type="button" class="pulse-chip pulse-chip--${p.kind}${i < k || (i === k && inPulse) ? ' is-done' : ''}" data-i="${i}">${PULSE_NAME[p.kind]} ${areaText(p.area)}<small>qubit ${p.ion}</small></button>`).join('<span class="pulse-seq__arrow">→</span>') : '<span class="pulse-seq__empty">Add a pulse to start.</span>');
    $('pulse-seq').querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => { stopAll(); tNow.bus = +b.dataset.i + 1; render(); }));
    $('undo').disabled = !n; $('clear').disabled = !n;

    const done = n && t >= n - 1e-9;
    if (done && lastRecipe === 'swap') note('<b>Red lowers, then raises:</b> the first red π pulse lowered qubit 3 and put a phonon on the bus. With the bus now in |1<sub>p</sub>⟩, the same red pulse raised qubit 3 again and emptied the bus.');
    else if (done && lastRecipe === 'transfer') note('<b>Moved:</b> qubit 3 now holds the superposition that qubit 2 started with, and qubit 2 and the bus are back in |g<sub>2</sub>⟩ and |0<sub>p</sub>⟩. The sign of the |e⟩ part flipped on the way: (|g⟩ − i|e⟩)/√2 arrived as (|g⟩ + i|e⟩)/√2, which a phase gate on qubit 3 undoes.');
    else if (C && C.C > 0.999) note('<b>Entangled:</b> qubits 2 and 3 now share one state that cannot be split into a state for each, and the bus is back to a single phonon number. The bus carried the link between them.');
    else if (!C && n) note('<b>The bus is entangled with the qubits.</b> Its phonon number now depends on the qubits\' states. A good recipe returns it to |0<sub>p</sub>⟩ at the end.');
    else note('<b>The rule from the video:</b> with the bus in |0<sub>p</sub>⟩, red lowers a qubit and blue raises it; with the bus in |1<sub>p</sub>⟩ they swap roles, as long as the bus stays in |0<sub>p</sub>⟩ and |1<sub>p</sub>⟩. Add pulses and watch the yellow dots move.');
    const high = m.phon.slice(3).reduce((x, y) => x + y, 0);
    $('lab-status').textContent = (high > 1e-3 ? `${pct(high)} of the population now has 3 or more phonons, beyond the levels drawn and the grid, and outside the computational space. ` : '') +
      'Pulse areas: carrier as written, red calibrated on |g, 1ₚ⟩ ↔ |e, 0ₚ⟩, blue on |g, 0ₚ⟩ ↔ |e, 1ₚ⟩.';
    const label = !n ? 'No pulses' : t < 1e-9 ? 'Start' : inPulse ? `Pulse ${k + 1} · ${Math.round((t - k) * 100)}%` : `After pulse ${k}`;
    syncTime(n ? t / n : 0, label);
  }

  // ---------- 3. sideband cooling ----------
  let coolCache = { key: '', hist: null };
  function coolHistory() {
    const key = JSON.stringify([S.nbar3, S.plan, S.recoil, S.cycles]);
    if (key !== coolCache.key) coolCache = { key, hist: I.cool(I.thermal(S.nbar3, 80), S.cycles, S.plan, S.recoil / 100) };
    return coolCache.hist;
  }

  function renderCooling() {
    const hist = coolHistory();
    const k = Math.min(S.cycles, Math.floor(tNow.cooling + 1e-9));
    const P = hist[k];
    const tuned = I.TUNINGS[S.plan][k % I.TUNINGS[S.plan].length];
    const area = Math.PI / Math.sqrt(tuned);
    const cols = 7;
    const arrows = [], emission = [];
    for (let n = 1; n < cols; n++) {
      const tr = Math.sin(area * Math.sqrt(n) / 2) ** 2;
      arrows.push({ kind: 'red', n, opacity: (P[n] > 0.004 ? 0.25 + 0.75 * tr : 0.12) });
      if (P[n] > 0.004 && tr > 0.05) emission.push(n - 1);
    }
    $('diagram').innerHTML = D.single({ cols, g: P, e: [], arrows, emission, more: true });
    const last = k >= S.cycles;
    $('dg-title').textContent = last ? 'After the last cycle' : 'The next cycle: red pulse, then a photon';
    $('dg-cap').innerHTML = `The red sideband lifts |g, n<sub>p</sub>⟩ to |e, n<sub>p</sub> − 1⟩ (arrows, darker where the pulse moves more); the ion then emits a photon (green wave) and lands in |g, n<sub>p</sub> − 1⟩. ${last ? 'Cooling has stopped; the arrows show what one more cycle would do.' : `This cycle's pulse is a π pulse for ${tuned}<sub>p</sub>.`}`;
    $('dg-legend').innerHTML = `<span style="color:${COL.red}">●</span> red sideband`;

    // plot A: distribution
    const N = 20, xs = Array.from({ length: N + 1 }, (_, n) => n);
    plotA.opts.xLabel = 'Phonon number nₚ';
    plotA.opts.yLabel = 'Probability';
    plotA.opts.xTicks = 10;
    plotA.setRange([-0.6, N + 0.6], [0, 1.04]);
    plotA.draw([
      ...barLayers(xs, xs.map(n => hist[0][n]), COL.muted, 0.8, 'rgba(0,0,0,0)'),
      ...barLayers(xs, xs.map(n => P[n]), COL.pop, 0.55),
    ]);
    $('pa-title').textContent = 'Phonon distribution';
    $('pa-cap').textContent = `Outline: after ordinary laser cooling (n̄ = ${S.nbar3}). Yellow: after ${k} sideband-cooling cycle${k === 1 ? '' : 's'}.`;
    legend('pa-legend', [[COL.muted, '', 'start'], [COL.pop, '', 'now']]);

    // plot B: nbar and ground-state population per cycle
    const ks = hist.map((_, i) => i);
    plotB.opts.xLabel = 'Cooling cycle';
    plotB.opts.yLabel = 'Value';
    plotB.opts.xTicks = 8;
    const ymax = Math.max(1.04, S.nbar3 * 1.05);
    plotB.setRange([0, S.cycles], [0, ymax]);
    plotB.draw([
      { type: 'line', x: ks, y: hist.map(I.mean), color: css('--series-1'), width: 2.4 },
      { type: 'line', x: ks, y: hist.map(p => p[0]), color: COL.carrier, width: 2.4 },
      { type: 'vline', x: k, color: css('--series-amber'), width: 1.6, dash: [] },
    ]);
    $('pb-title').textContent = 'Cooling, cycle by cycle';
    $('pb-cap').textContent = 'The mean phonon number falls; the share in the motional ground state |0ₚ⟩ rises.';
    legend('pb-legend', [[css('--series-1'), '', 'mean phonon number n̄'], [COL.carrier, '', 'P(0ₚ)']]);
    $('popgrid').hidden = true;

    stats([
      ['Cycle', `${k} / ${S.cycles}`, S.plan === 'fixed' ? 'π pulses for 1ₚ' : 'pulses for 1ₚ, 2ₚ, 4ₚ in turn'],
      ['Mean phonons', fixed(I.mean(P), 2), `started at ${S.nbar3}`],
      ['Ground state', prob(P[0]), 'P(0ₚ)'],
      ['Red ÷ blue sideband', fixed(I.sidebandRatio(P), 3), 'n̄/(n̄ + 1): 0 means fully cold'],
    ]);
    $('ket').innerHTML = `<b>Thermometer:</b> probe the ion with a weak pulse and the red sideband comes out ${fixed(I.sidebandRatio(P), 3)} times as strong as the blue. It vanishes only when no phonons are left to take.`;
    if (S.plan === 'fixed' && P[4] > 0.1 && k > 10) note(`<b>Stuck at 4<sub>p</sub>:</b> ${pct(P[4])} of the population is there. For n<sub>p</sub> = 4 the red rate is √4 = 2 times faster, so a π pulse for 1<sub>p</sub> is a 2π pulse: the ion goes up and comes straight back. Switch to varied pulse lengths.`);
    else if (P[0] > 0.95) note(`<b>Ground state reached:</b> ${pct(P[0])} of the population is in |g, 0<sub>p</sub>⟩. What is left comes from the photon's recoil adding phonons back.`);
    else note('<b>Each cycle removes about one phonon</b> from every level the pulse reaches. Press Play to run the cycles.');
    $('lab-status').textContent = `Recoil: each emitted photon adds or removes a phonon with probability ${S.recoil}% each.`;
    syncTime(k / S.cycles, `cycle ${k}`);
  }

  // ---------- 4. initialize and read out ----------
  function prepared() {
    const p1i = I.pumped(0.5, S.pumpCycles);
    const c = Math.cos(S.theta * Math.PI / 360) ** 2;
    const p0 = (1 - p1i) * c + p1i * (1 - c);
    return { p0, p1: 1 - p0, p1i };
  }
  function syncShots() {
    const key = JSON.stringify([S.theta, S.pumpCycles, S.mub, S.mud]);
    if (key !== shots.key) { shots = { key, counts: [] }; lastShot = null; }
  }
  function takeShots(n) {
    syncShots();
    const { p0 } = prepared();
    for (let i = 0; i < n; i++) {
      const isBright = Math.random() < p0;
      const c = I.poisson(isBright ? S.mub + S.mud : S.mud, Math.random());
      shots.counts.push(c);
      lastShot = { counts: c, bright: isBright };
    }
    readStage = 'read';
  }

  function renderReadout() {
    syncShots();
    const pr = prepared();
    const N = shots.counts.length;
    $('diagram').innerHTML = D.calcium({ p0: pr.p0, p1: pr.p1, stage: readStage, lastBright: lastShot && lastShot.counts >= S.thr, lastCounts: lastShot ? lastShot.counts : null, threshold: S.thr });
    $('dg-title').textContent = 'The calcium ion, Ca⁺';
    $('dg-cap').innerHTML = 'Yellow dots: the chance of finding the qubit in |0⟩ (4S<sub>1/2</sub>) or |1⟩ (3D<sub>5/2</sub>) before readout. The readout laser excites only |0⟩, which glows; |1⟩ stays dark.';
    $('dg-legend').innerHTML = '';

    const er = I.readoutErrors(S.mub, S.mud, S.thr);
    const expectBright = pr.p0 * (1 - er.brightAsDark) + pr.p1 * er.darkAsBright;
    // plot A: count histogram
    const maxC = Math.max(12, Math.ceil(S.mub + S.mud + 4 * Math.sqrt(S.mub + S.mud)));
    const xs = Array.from({ length: maxC + 1 }, (_, c) => c);
    const hcount = new Array(maxC + 1).fill(0);
    for (const c of shots.counts) if (c <= maxC) hcount[c] += 1 / N;
    const pois = (mu, c) => Math.exp(-mu + c * Math.log(Math.max(mu, 1e-12)) - lgamma(c + 1));
    const expect = xs.map(c => pr.p0 * pois(S.mub + S.mud, c) + pr.p1 * pois(S.mud, c));
    plotA.opts.xLabel = 'Detector clicks in one shot';
    plotA.opts.yLabel = 'Fraction of shots';
    plotA.opts.xTicks = 8;
    const ymax = Math.max(0.1, ...expect, ...hcount) * 1.1;
    plotA.setRange([-0.6, maxC + 0.6], [0, ymax]);
    const A = [{ type: 'vband', x0: S.thr - 0.5, x1: maxC + 0.6, color: 'rgba(107, 75, 209, 0.07)' }];
    if (N) xs.forEach((c, i) => A.push(...barLayers([c], [hcount[i]], c >= S.thr ? '#6b4bd1' : COL.muted, 0.7)));
    A.push({ type: 'dots', x: xs, y: expect, color: COL.text, r: 2.6 });
    A.push({ type: 'vline', x: S.thr - 0.5, color: css('--series-amber'), width: 1.6, dash: [5, 4], label: 'threshold' });
    plotA.draw(A);
    $('pa-title').textContent = 'Clicks per shot';
    $('pa-cap').textContent = 'Bars: your shots. Dots: the expected mix of a bright peak and a dark peak at the background. Shots right of the threshold are called bright (|0⟩).';
    legend('pa-legend', [['#6b4bd1', '', 'called bright'], [COL.muted, '', 'called dark'], [COL.text, 'swatch--stem', 'expected']]);

    // plot B: running bright fraction
    const B = [];
    const xmax = Math.max(20, N);
    plotB.opts.xLabel = 'Number of shots';
    plotB.opts.yLabel = 'Fraction called bright';
    plotB.opts.xTicks = 7;
    plotB.setRange([0, xmax], [0, 1.04]);
    B.push({ type: 'hline', y: pr.p0, color: COL.carrier, dash: [6, 4], width: 1.6 });
    B.push({ type: 'hline', y: expectBright, color: css('--series-amber'), dash: [2, 3], width: 1.6 });
    let bright = 0;
    if (N) {
      // bright/dark is decided with the threshold as it is now, so moving it re-sorts every shot
      const step = Math.max(1, Math.ceil(N / 2000));
      const x = [], y = [];
      shots.counts.forEach((c, i) => { if (c >= S.thr) bright++; if (i % step === 0 || i === N - 1) { x.push(i + 1); y.push(bright / (i + 1)); } });
      B.push({ type: 'line', x, y, color: '#6b4bd1', width: 2 });
    }
    plotB.draw(B);
    $('pb-title').textContent = 'Repeat to get the probability';
    $('pb-cap').textContent = 'As in the video, one shot gives bright or dark; repeating gives the probability. Green: the true P(0). Dotted: what the detector errors make you measure.';
    legend('pb-legend', [['#6b4bd1', '', 'measured'], [COL.carrier, 'swatch--dash', 'true P(0)'], [css('--series-amber'), 'swatch--dot', 'expected with errors']]);
    $('popgrid').hidden = true;

    const frac = N ? bright / N : NaN;
    stats([
      ['Prepared P(0)', prob(pr.p0), S.pumpCycles ? `after ${S.pumpCycles} pumping cycle${S.pumpCycles === 1 ? '' : 's'}` : 'not initialized!'],
      ['Called bright', N ? prob(frac) : '—', N ? `± ${Math.sqrt(Math.max(frac * (1 - frac), 0) / N).toFixed(3)} from ${N} shots` : 'take some shots'],
      ['Bright read as dark', pct(er.brightAsDark), `fewer than ${S.thr} clicks`],
      ['Dark read as bright', pct(er.darkAsBright), `${S.thr} or more background clicks`],
    ]);
    $('ket').innerHTML = `<b>Before readout:</b> P(1) = ${prob(pr.p1i)} left over from the last experiment after ${S.pumpCycles} optical-pumping cycle${S.pumpCycles === 1 ? '' : 's'}, then a ${S.theta}° pulse at 729 nm gives P(0) = ${prob(pr.p0)}.`;
    if (!S.pumpCycles) note('<b>Not initialized.</b> The ion still holds whatever the last experiment left: half |0⟩, half |1⟩. Every pulse you apply now starts from the wrong state. Run a few optical-pumping cycles.');
    else if (er.brightAsDark > 0.025 && er.darkAsBright > 0.025) note('<b>The bright and dark peaks overlap,</b> so no threshold separates them cleanly. More photons from a bright ion, or less background, would.');
    else if (er.brightAsDark > 0.025) note(`<b>Bright shots are being missed:</b> ${pct(er.brightAsDark)} of them give fewer than ${S.thr} clicks. Lower the threshold or collect more photons.`);
    else if (er.darkAsBright > 0.025) note(`<b>Background is fooling the threshold:</b> ${pct(er.darkAsBright)} of dark shots still reach ${S.thr} clicks. Raise the threshold or reduce the background.`);
    else note('<b>Bright or dark, nearly perfectly:</b> the two peaks barely overlap, so almost every shot is called correctly. The probability comes from repeating the shot.');
    $('lab-status').textContent = 'Shots use the browser\'s random number generator; counts reset when the state or detector changes.';
    $('time-out').textContent = `${N} shot${N === 1 ? '' : 's'}`;
    $('play').textContent = playing ? '❚❚ Pause' : '▶ Keep measuring';
  }
  // log-gamma for the Poisson curve (integer arguments)
  function lgamma(n) { let s = 0; for (let k = 2; k < n; k++) s += Math.log(k); return s; }

  // ---------- shared ----------
  function syncTime(u, label) {
    $('time').value = String(Math.round(1000 * Math.max(0, Math.min(1, u))));
    $('time-out').textContent = label;
    $('play').textContent = playing ? '❚❚ Pause' : '▶ Play';
  }

  function syncControls() {
    document.querySelectorAll('#laser [data-laser]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.laser === S.laser)));
    document.querySelectorAll('#pstart [data-pstart]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pstart === S.pstart)));
    document.querySelectorAll('[data-pstart-show]').forEach(el => { el.hidden = el.dataset.pstartShow !== S.pstart; });
    document.querySelectorAll('[data-np]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.np === S.np)));
    $('nbar1').value = S.nbar1; $('nbar1-out').textContent = fixed(S.nbar1, 1);
    document.querySelectorAll('#target [data-target]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.target === S.target)));
    document.querySelectorAll('[data-bstart]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.bstart === S.bstart.join(','))));
    $('nbar3').value = S.nbar3; $('nbar3-out').textContent = fixed(S.nbar3, 1);
    document.querySelectorAll('#plan [data-plan]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.plan === S.plan)));
    $('plan-hint').textContent = S.plan === 'fixed' ? 'Every cycle uses a π pulse for |g, 1ₚ⟩ → |e, 0ₚ⟩.' : 'Cycles use π pulses for 1ₚ, 2ₚ and 4ₚ in turn.';
    $('recoil').value = S.recoil; $('recoil-out').textContent = S.recoil + '%';
    $('cycles').value = String(S.cycles);
    $('theta').value = S.theta; $('theta-out').textContent = S.theta + '°';
    document.querySelectorAll('[data-theta]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.theta === S.theta)));
    $('mub').value = S.mub; $('mub-out').textContent = fixed(S.mub, 1);
    $('mud').value = S.mud; $('mud-out').textContent = fixed(S.mud, 1);
    $('thr').value = S.thr; $('thr-out').textContent = S.thr + ' click' + (S.thr === 1 ? '' : 's');
  }

  function render() {
    syncControls();
    $('pb-box').hidden = mode === 'bus';
    $('popgrid').hidden = mode !== 'bus';
    if (mode === 'sidebands') renderSidebands();
    else if (mode === 'bus') renderBus();
    else if (mode === 'cooling') renderCooling();
    else renderReadout();
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
    render();
  }

  // ---------- playback ----------
  let playing = false, raf = 0, last = 0, speed = 1, anim = null, shotDebt = 0;
  function frame(now) {
    const dt = Math.min(100, now - last); last = now;
    if (mode === 'readout' && playing) {
      shotDebt += 50 * speed * dt / 1000;
      const k = Math.floor(shotDebt);
      if (k) { shotDebt -= k; takeShots(k); }
    } else if (mode === 'bus' && anim) {
      const u = Math.min(1, (now - anim.t0) / anim.dur);
      tNow.bus = anim.from + (anim.to - anim.from) * u;
      if (u >= 1) { anim = null; playing = false; }
    } else if (mode === 'sidebands' && playing) {
      const T = LASER[S.laser].window;
      tNow.sidebands = Math.min(T, Math.min(tNow.sidebands, T) + T * dt / 1000 / PLAY_SECONDS * speed);
      if (tNow.sidebands >= T) playing = false;
    } else if (mode === 'cooling' && playing) {
      tNow.cooling = Math.min(S.cycles, tNow.cooling + S.cycles * dt / 1000 / PLAY_SECONDS * speed);
      if (tNow.cooling >= S.cycles) playing = false;
    }
    render();
    if (playing || anim) raf = requestAnimationFrame(frame);
  }
  function start() { last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
  function stopAll() { playing = false; anim = null; cancelAnimationFrame(raf); }
  function play() {
    if (mode === 'bus') {
      const n = S.pulses.length;
      if (!n) return;
      let from = Math.min(tNow.bus, n);
      if (from >= n - 1e-9) from = 0;
      if (reduceMotion) { tNow.bus = n; render(); return; }
      playing = true; anim = { from, to: n, t0: performance.now(), dur: (n - from) * 900 / speed };
      start(); return;
    }
    if (mode === 'sidebands' && Math.min(tNow.sidebands, LASER[S.laser].window) >= LASER[S.laser].window - 1e-9) tNow.sidebands = 0;
    if (mode === 'cooling' && tNow.cooling >= S.cycles - 1e-9) tNow.cooling = 0;
    if (reduceMotion && mode !== 'readout') { if (mode === 'sidebands') tNow.sidebands = Infinity; else tNow.cooling = S.cycles; render(); return; }
    playing = true; shotDebt = 0; start(); render();
  }
  function addPulse(p) {
    stopAll();
    lastRecipe = null;
    const n = S.pulses.length;
    S.pulses.push(p);
    tNow.bus = n;
    if (reduceMotion) { tNow.bus = n + 1; render(); return; }
    anim = { from: n, to: n + 1, t0: performance.now(), dur: 700 / speed };
    start();
  }

  $('play').addEventListener('click', () => { if (playing || anim) { stopAll(); render(); } else play(); });
  $('rewind').addEventListener('click', () => {
    stopAll();
    if (mode === 'readout') { shots.key = ''; lastShot = null; }
    else tNow[mode] = 0;
    render();
  });
  $('time').addEventListener('input', e => {
    stopAll();
    const u = +e.target.value / 1000;
    if (mode === 'sidebands') tNow.sidebands = u * LASER[S.laser].window;
    else if (mode === 'bus') tNow.bus = u * S.pulses.length;
    else if (mode === 'cooling') tNow.cooling = Math.round(u * S.cycles);
    render();
  });
  $('speed').addEventListener('change', e => { speed = +e.target.value; });

  // tab 1
  document.querySelectorAll('#laser [data-laser]').forEach(b => b.addEventListener('click', () => { stopAll(); S.laser = b.dataset.laser; tNow.sidebands = Infinity; render(); }));
  document.querySelectorAll('#pstart [data-pstart]').forEach(b => b.addEventListener('click', () => { stopAll(); S.pstart = b.dataset.pstart; render(); }));
  document.querySelectorAll('[data-np]').forEach(b => b.addEventListener('click', () => { stopAll(); S.np = +b.dataset.np; render(); }));
  $('nbar1').addEventListener('input', e => { stopAll(); S.nbar1 = +e.target.value; render(); });
  // tab 2
  document.querySelectorAll('#target [data-target]').forEach(b => b.addEventListener('click', () => { S.target = +b.dataset.target; render(); }));
  document.querySelectorAll('[data-pulse]').forEach(b => b.addEventListener('click', () => addPulse({ ion: S.target, kind: b.dataset.pulse, area: Math.PI * +b.dataset.area })));
  document.querySelectorAll('[data-bstart]').forEach(b => b.addEventListener('click', () => { stopAll(); S.bstart = b.dataset.bstart.split(',').map(Number); lastRecipe = null; tNow.bus = S.pulses.length; render(); }));
  $('undo').addEventListener('click', () => { stopAll(); lastRecipe = null; S.pulses.pop(); tNow.bus = Math.min(tNow.bus, S.pulses.length); render(); });
  $('clear').addEventListener('click', () => { stopAll(); lastRecipe = null; S.pulses = []; tNow.bus = 0; render(); });
  const P = Math.PI;
  const RECIPES = {
    swap: { start: [0, 1, 0], pulses: [{ ion: 3, kind: 'red', area: P }, { ion: 3, kind: 'red', area: P }] },
    transfer: { start: [0, 0, 0], pulses: [{ ion: 2, kind: 'carrier', area: P / 2 }, { ion: 2, kind: 'red', area: P }, { ion: 3, kind: 'red', area: P }] },
    entangle: { start: [0, 0, 0], pulses: [{ ion: 2, kind: 'carrier', area: P }, { ion: 2, kind: 'red', area: P / 2 }, { ion: 3, kind: 'red', area: P }] },
  };
  document.querySelectorAll('[data-recipe]').forEach(b => b.addEventListener('click', () => {
    stopAll();
    const r = RECIPES[b.dataset.recipe];
    S.bstart = r.start.slice(); S.pulses = r.pulses.map(p => ({ ...p }));
    lastRecipe = b.dataset.recipe;
    tNow.bus = 0; play();
  }));
  // tab 3
  $('nbar3').addEventListener('input', e => { stopAll(); S.nbar3 = +e.target.value; render(); });
  document.querySelectorAll('#plan [data-plan]').forEach(b => b.addEventListener('click', () => { stopAll(); S.plan = b.dataset.plan; render(); }));
  $('recoil').addEventListener('input', e => { stopAll(); S.recoil = +e.target.value; render(); });
  $('cycles').addEventListener('change', e => { stopAll(); S.cycles = +e.target.value; tNow.cooling = Math.min(tNow.cooling, S.cycles); render(); });
  // tab 4
  $('theta').addEventListener('input', e => { S.theta = +e.target.value; render(); });
  document.querySelectorAll('[data-theta]').forEach(b => b.addEventListener('click', () => { S.theta = +b.dataset.theta; render(); }));
  ['mub', 'mud', 'thr'].forEach(k => $(k).addEventListener('input', e => { S[k] = +e.target.value; render(); }));
  $('pump').addEventListener('click', () => { S.pumpCycles = Math.min(S.pumpCycles + 1, 9); readStage = 'pump'; lastShot = null; render(); });
  $('unpump').addEventListener('click', () => { S.pumpCycles = 0; readStage = 'read'; lastShot = null; render(); });
  document.querySelectorAll('[data-shots]').forEach(b => b.addEventListener('click', () => { takeShots(+b.dataset.shots); render(); }));

  const tabs = Array.from(document.querySelectorAll('.tab'));
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => { stopAll(); mode = b.dataset.mode; applyMode(); });
    b.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus(); next.click();
    });
  });
  if ('ResizeObserver' in window) new ResizeObserver(() => { if (!playing && !anim) render(); }).observe($('diagram'));

  // ---------- predict-first loaders ----------
  const QUESTIONS = {
    q1: () => { mode = 'sidebands'; Object.assign(S, { laser: 'red', pstart: 'fock', np: 0 }); tNow.sidebands = Infinity; },
    q2: () => { mode = 'sidebands'; Object.assign(S, { laser: 'blue', pstart: 'fock', np: 0 }); tNow.sidebands = 100; },
    q3: () => { mode = 'sidebands'; Object.assign(S, { laser: 'blue', pstart: 'thermal', nbar1: 1 }); tNow.sidebands = Infinity; },
    q4: () => { mode = 'bus'; S.bstart = [0, 1, 0]; S.pulses = []; S.target = 3; tNow.bus = 0; },
    q5: () => { mode = 'bus'; S.bstart = [0, 0, 0]; S.pulses = RECIPES.entangle.pulses.slice(0, 2).map(p => ({ ...p })); S.target = 3; tNow.bus = 2; },
    q6: () => { mode = 'bus'; S.bstart = [0, 0, 1]; S.pulses = RECIPES.entangle.pulses.map(p => ({ ...p })); S.target = 3; tNow.bus = 3; },
    q7: () => { mode = 'cooling'; Object.assign(S, { nbar3: 5, plan: 'fixed', recoil: 1, cycles: 40 }); tNow.cooling = 0; },
    q8: () => { mode = 'readout'; Object.assign(S, { theta: 90, mub: 3, mud: 0.3, thr: 2, pumpCycles: 3 }); shots.key = ''; },
  };
  document.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
    stopAll();
    lastRecipe = null;
    QUESTIONS[b.dataset.q]();
    applyMode();
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }));

  applyMode();
})();
