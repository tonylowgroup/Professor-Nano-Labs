/* Qubits on the Bloch Sphere: controls, replay, shots and drawing.
   Physics is in physics.js; the sphere and phasor drawings are in sphere.js. */
(function () {
  'use strict';
  const Q = window.Qubit;
  const $ = id => document.getElementById(id);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const DEG = Math.PI / 180;
  const PER = 48;            // replay samples per gate
  const MAX_GATES = 24;
  const MS_PER_GATE = 900;   // replay speed at 1x
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- state ----------
  const STARTS = { '0': [0, 0], '1': [180, 0], '+': [90, 0], '-': [90, 180], '+i': [90, 90], '-i': [90, 270] };
  const KET = { '0': '|0⟩', '1': '|1⟩', '+': '|+⟩', '-': '|−⟩', '+i': '|+i⟩', '-i': '|−i⟩' };
  const AXIS_NAME = { x: 'x', y: 'y', z: 'z', h: 'x+z' };
  const OUTCOME = { z: ['0', '1'], x: ['+', '−'], y: ['+i', '−i'] };

  const INITIAL = { theta: 0, phi: 0, gates1: [], gates2: [], axis: 'y', alpha: 90, target: 'A', basis: 'z', basisA: 'z', basisB: 'z' };
  const fresh = () => JSON.parse(JSON.stringify(INITIAL));
  let state = fresh();
  let mode = 'gates';
  let t1 = 0, t2 = 0;          // replay positions, in gates
  let preview = false;          // show where the rotation gate would take the arrow

  const newCounts = () => ({ n: 0, plus: 0, hist: [] });
  let shots = { x: newCounts(), y: newCounts(), z: newCounts() };
  let recent = [];
  let shotKey = '';
  let joint = { n: 0, counts: [0, 0, 0, 0] };
  let jointKey = '';

  // ---------- formatting ----------
  const fixed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const signed = (x, d = 2) => (x >= 0.5 * Math.pow(10, -d) ? '+' : '') + fixed(x, d);
  const deg = r => (Math.round(r / DEG) % 360 === 0 && r > 0 ? 0 : Math.round(r / DEG)) + '°';

  function coef(z) {
    const m = Q.cabs(z);
    if (m < 5e-4) return null;
    const a = Q.carg(z) / DEG, mag = m.toFixed(3);
    const near = v => Math.abs(a - v) < 0.06;
    if (near(0)) return mag;
    if (near(180) || near(-180)) return '−' + mag;
    if (near(90)) return mag + 'i';
    if (near(-90)) return '−' + mag + 'i';
    return `${mag} e<sup>${a < 0 ? '−' : ''}i${Math.round(Math.abs(a))}°</sup>`;
  }

  function ketHTML(amps, labels) {
    let s = '';
    amps.forEach((z, i) => {
      const c = coef(z);
      if (c === null) return;
      const neg = c.startsWith('−');
      const body = (neg ? c.slice(1) : c) + ' ' + labels[i];
      s += s ? (neg ? ' − ' : ' + ') + body : (neg ? '−' : '') + body;
    });
    return s;
  }

  function gateText(g, html) {
    const sub = t => (html ? `<sub>${t}</sub>` : t);
    if (g.kind === 'R') return `R${sub(AXIS_NAME[g.axis])}(${Math.round(g.angle / DEG)}°)`;
    if (g.kind === 'CNOT') return g.control === 'A' ? 'CNOT A→B' : 'CNOT B→A';
    if (g.kind === 'CZ' || g.kind === 'SWAP') return g.kind;
    const name = Q.GATES[g.kind].label;
    return g.target ? `${name}${html ? '<sub>' + g.target + '</sub>' : ' on ' + g.target}` : name;
  }

  // ---------- drawings ----------
  const sphereA = new BlochSphere($('sphere-a'));
  const sphereB = new BlochSphere($('sphere-b'));
  sphereA.onView = (az, el) => sphereB.setView(az, el, true);
  sphereB.onView = (az, el) => sphereA.setView(az, el, true);
  const phasor = new PhasorView($('phasor'));
  const plotT = new NanoPlot($('plot-t'), { xLabel: 'Position in the circuit (gates)', yLabel: '' });
  const plotConv = new NanoPlot($('plot-conv'), { xLabel: 'Number of shots N', yLabel: 'Fraction of + outcomes' });

  function legend(id, items) {
    $(id).innerHTML = items.map(([color, kind, label]) =>
      `<li style="color:${color}"><span class="swatch ${kind}"></span><span>${label}</span></li>`).join('');
  }

  function stats(items) {
    $('stats').innerHTML = items.map(([label, value, sub, cls]) =>
      `<div class="stat"><div class="stat__label">${label}</div><div class="stat__value${cls ? ' stat__value--' + cls : ''}">${value}</div><div class="stat__sub">${sub}</div></div>`).join('');
  }

  // ---------- one qubit ----------
  const psi0 = () => Q.fromAngles(state.theta * DEG, state.phi * DEG);
  let traj1 = null, traj1Key = '';
  function trajectory1() {
    const key = JSON.stringify([state.theta, state.phi, state.gates1]);
    if (key !== traj1Key) { traj1 = Q.trajectory1(psi0(), state.gates1, PER); traj1Key = key; }
    return traj1;
  }
  const rotationR = () => ({ kind: 'R', axis: state.axis, angle: state.alpha * DEG });

  function splitTrail(traj, t, pick) {
    const done = [], todo = [];
    for (const p of traj) {
      if (p.t <= t + 1e-9) done.push(pick(p));
      if (p.t >= t - 1.5 / PER) todo.push(pick(p));
    }
    return { done, todo };
  }

  function currentAxis(gates, t, target) {
    const n = gates.length, k = Math.floor(t + 1e-9);
    if (!(playing || anim) || k >= n || t - k < 1e-6) return null;
    const g = gates[k];
    if (g.kind === 'CNOT' || g.kind === 'CZ' || g.kind === 'SWAP') return null;
    if (target && g.target !== target) return null;
    return { n: Q.rotationOf(g).n, label: gateText(g, false).split(' on ')[0] + ' axis' };
  }

  function previewPath(psiEnd, apply, pick) {
    const pts = [];
    for (let j = 0; j <= 40; j++) pts.push(pick(apply(psiEnd, rotationR(), j / 40)));
    return pts;
  }

  function renderGates() {
    const brand = css('--series-1'), ghost = css('--series-ghost'), amber = css('--series-amber');
    const gates = state.gates1, n = gates.length;
    const traj = trajectory1();
    const psi = Q.run1(psi0(), gates, t1);
    const r = Q.bloch(psi);
    const ang = Q.angles(r);
    const { done, todo } = splitTrail(traj, t1, p => p.r);

    const scene = { arrows: [{ v: r, color: brand, width: 3.2 }], trail: [], angles: !(playing || anim) && !preview && (n === 0 || t1 < 1e-9) };
    if (todo.length > 1) scene.trail.push({ pts: todo, color: NanoPlot.alpha(brand, 0.5), width: 1.8, dash: [5, 4] });
    if (done.length > 1) scene.trail.push({ pts: done, color: brand, width: 2.4 });
    const ax = currentAxis(gates, t1);
    if (ax) scene.axis = { ...ax, color: amber };
    if (preview && t1 >= n - 1e-9) {
      const path = previewPath(psi, Q.applyGate1, p => Q.bloch(p));
      scene.trail.push({ pts: path, color: amber, width: 2 });
      scene.arrows.push({ v: path[path.length - 1], color: amber, width: 2, dash: [5, 4], hollow: true, alpha: 0.9 });
      scene.axis = { n: Q.AXES[state.axis], color: amber, label: AXIS_NAME[state.axis] + ' axis' };
    }
    sphereA.draw(scene);
    $('sphere-a').setAttribute('aria-label', `Bloch sphere: arrow at x ${fixed(r[0])}, y ${fixed(r[1])}, z ${fixed(r[2])}`);

    // amplitudes as phasors (the true amplitudes, overall phase included)
    phasor.draw({
      amps: [{ z: psi[0], color: brand, label: 'α' }, { z: psi[1], color: css('--series-im'), label: 'β' }],
      arcColor: css('--series-re'),
    });
    const a0 = Q.cabs(psi[0]), b0 = Q.cabs(psi[1]);
    $('phasor-read').innerHTML = `|α| = ${a0.toFixed(3)}, arg α = ${a0 > 1e-6 ? deg(Q.carg(psi[0])) : '—'} · |β| = ${b0.toFixed(3)}, arg β = ${b0 > 1e-6 ? deg(Q.carg(psi[1])) : '—'}`;

    const p0 = Q.abs2(psi[0]), p1 = Q.abs2(psi[1]);
    stats([
      ['Polar angle', deg(ang.theta), 'θ, measured down from |0⟩'],
      ['Azimuth', Number.isNaN(ang.phi) ? 'any' : deg(ang.phi), Number.isNaN(ang.phi) ? 'undefined at a pole' : 'φ, around from |+⟩'],
      ['Probabilities', `${p0.toFixed(3)} / ${p1.toFixed(3)}`, 'P(0) / P(1) along z'],
      ['Bloch vector', `(${fixed(r[0])}, ${fixed(r[1])}, ${fixed(r[2])})`, 'x, y, z · length 1', 'sm'],
    ]);

    const can = Q.canonical(psi);
    const gp = can.globalPhase / DEG;
    $('ket').innerHTML = `<b>State:</b> |ψ⟩ = ${ketHTML([can.alpha, can.beta], ['|0⟩', '|1⟩'])}` +
      (Math.abs(gp) > 0.5 ? ` <span class="ket__aside">times an overall phase e<sup>${gp < 0 ? '−' : ''}i${Math.round(Math.abs(gp))}°</sup>, which the sphere does not show.</span>` : '');

    // Bloch components along the circuit
    const xs = traj.map(p => p.t);
    const span = Math.max(n, 1);
    plotT.opts.xTicks = n >= 1 && n <= 8 ? n : 8;
    plotT.opts.yLabel = 'Bloch component';
    plotT.setRange([0, span], [-1.12, 1.12]);
    const layers = [{ type: 'hline', y: 0, color: css('--plot-axis'), dash: [] }];
    for (let i = 1; i < n; i++) layers.push({ type: 'vline', x: i, color: NanoPlot.alpha(ghost, 0.8), dash: [2, 4] });
    const re = css('--series-re'), im = css('--series-im');
    if (n) {
      layers.push({ type: 'line', x: xs, y: traj.map(p => p.r[0]), color: re, width: 2 });
      layers.push({ type: 'line', x: xs, y: traj.map(p => p.r[1]), color: im, width: 2 });
      layers.push({ type: 'line', x: xs, y: traj.map(p => p.r[2]), color: brand, width: 2.6 });
      layers.push({ type: 'vline', x: t1, color: amber, width: 1.6, dash: [] });
      if (plotT.w / n > 34) gates.forEach((g, i) => layers.push({ type: 'text', x: i + 0.5, text: gateText(g, false), color: css('--plot-text') }));
    } else {
      layers.push({ type: 'dots', x: [0], y: [r[0]], color: re, r: 4 }, { type: 'dots', x: [0], y: [r[1]], color: im, r: 4 }, { type: 'dots', x: [0], y: [r[2]], color: brand, r: 4.5 });
    }
    plotT.draw(layers);

    note(n === 0
      ? '<b>Start here:</b> pick an input with the chips or the θ and φ sliders, then add a gate. Every gate turns the arrow about an axis; it never changes its length.'
      : '<b>Read the sphere:</b> the solid trail is the path so far and the dashed trail what is still to come. Drag the timeline, or click a gate in the circuit to jump to just after it. A gate changes the direction of the arrow, never its length.');
    const norm = p0 + p1;
    $('lab-status').textContent = `Check: |α|² + |β|² = 1 ${Math.abs(norm - 1) < 1e-12 ? 'to machine precision' : '(off by ' + (norm - 1).toExponential(1) + ')'}; the arrow has length ${Math.hypot(...r).toFixed(6)}.`;
  }

  // ---------- measurement ----------
  const measured = () => Q.run1(psi0(), state.gates1, state.gates1.length);

  function syncShotKey(r) {
    const key = r.map(v => v.toFixed(9)).join(',');
    if (key !== shotKey) {
      shotKey = key;
      shots = { x: newCounts(), y: newCounts(), z: newCounts() };
      recent = [];
    }
  }

  function takeShots(basis, count) {
    const r = Q.bloch(measured());
    syncShotKey(r);
    const p = Q.probPlus(r, Q.AXES[basis]);
    const c = shots[basis];
    for (let i = 0; i < count; i++) {
      const plus = Math.random() < p;
      c.n++; if (plus) c.plus++;
      if (c.hist.length < 50000) c.hist.push(c.plus);
      if (basis === state.basis) { recent.push(plus); if (recent.length > 60) recent.shift(); }
    }
  }

  function bars(items) {
    return items.map(it => `
      <div class="outcome">
        <span class="outcome__label">${it.label}</span>
        <span class="outcome__track"><span class="outcome__bar" style="width:${(100 * it.frac).toFixed(2)}%;background:${it.color}"></span><span class="outcome__pred" style="left:${(100 * it.pred).toFixed(2)}%" title="Prediction ${(100 * it.pred).toFixed(1)}%"></span></span>
        <span class="outcome__val">${it.count} · ${it.n ? (100 * it.frac).toFixed(1) + '%' : '—'}</span>
      </div>`).join('');
  }

  function renderMeasure() {
    const brand = css('--series-1'), amber = css('--series-amber'), im = css('--series-im'), ghost = css('--series-ghost');
    const psi = measured(), r = Q.bloch(psi);
    syncShotKey(r);
    const b = state.basis, nvec = Q.AXES[b], c = shots[b];
    const p = Q.probPlus(r, nvec);
    const [plusName, minusName] = OUTCOME[b];
    const frac = c.n ? c.plus / c.n : 0;
    const err = c.n ? Math.sqrt(Math.max(frac * (1 - frac), 0) / c.n) : NaN;

    const all = ['x', 'y', 'z'].every(k => shots[k].n > 0);
    const est = ['x', 'y', 'z'].map(k => (shots[k].n ? (2 * shots[k].plus - shots[k].n) / shots[k].n : 0));
    const scene = {
      arrows: [{ v: r, color: brand, width: 3.2 }],
      measure: { n: nvec, pPlus: p, color: css('--series-re') },
    };
    if (all) scene.arrows.push({ v: est, color: amber, width: 2.4, dash: [6, 4], hollow: true });
    sphereA.draw(scene);
    $('sphere-a').setAttribute('aria-label', `Bloch sphere: state at x ${fixed(r[0])}, y ${fixed(r[1])}, z ${fixed(r[2])}, measured along ${b}`);

    $('out-title').textContent = `Outcomes along ${b}`;
    $('outcomes').innerHTML = bars([
      { label: `|${plusName}⟩`, count: c.plus, n: c.n, frac: c.n ? frac : 0, pred: p, color: brand },
      { label: `|${minusName}⟩`, count: c.n - c.plus, n: c.n, frac: c.n ? 1 - frac : 0, pred: 1 - p, color: im },
    ]);
    $('shot-strip').innerHTML = recent.map(v => `<span class="shot ${v ? 'shot--plus' : 'shot--minus'}"></span>`).join('');

    let errEst = NaN;
    if (all) errEst = Math.hypot(est[0] - r[0], est[1] - r[1], est[2] - r[2]);
    stats([
      ['Shots', String(c.n), `along ${b}, on fresh copies`],
      [`Measured P(|${plusName}⟩)`, c.n ? `${frac.toFixed(3)}` : '—', c.n ? `± ${err.toFixed(3)} (one std. dev.)` : 'take some shots'],
      ['Born rule', p.toFixed(3), '(1 + r·n)/2'],
      ['Arrow from shots', all ? 'off by ' + errEst.toFixed(3) : '—', all ? '|r̂ − r|, from all three axes' : 'needs shots along x, y and z'],
    ]);

    // tomography table
    const rows = ['x', 'y', 'z'].map(k => {
      const s = shots[k], e = s.n ? (2 * s.plus - s.n) / s.n : NaN;
      const de = s.n ? Math.sqrt(Math.max(1 - e * e, 0) / s.n) : NaN;
      const exact = r[{ x: 0, y: 1, z: 2 }[k]];
      return `<tr class="${k === b ? 'is-current' : ''}"><td><b>${k}</b></td><td>${s.n}</td><td>${s.n ? signed(e, 3) + ' ± ' + de.toFixed(3) : '—'}</td><td>${signed(exact, 3)}</td></tr>`;
    }).join('');
    $('tomo-table').innerHTML = `<thead><tr><th>Axis</th><th>Shots</th><th>From shots</th><th>Exact</th></tr></thead><tbody>${rows}</tbody>`;

    // running estimate
    const N = c.n, xmax = Math.max(20, N);
    plotConv.setRange([0, xmax], [0, 1]);
    const layers = [];
    const fx = [], up = [], lo = [];
    const sd = Math.sqrt(p * (1 - p));
    for (let j = 0; j <= 160; j++) {
      const k = Math.max(1, Math.pow(xmax, j / 160));
      fx.push(k); up.push(Math.min(1, p + sd / Math.sqrt(k))); lo.push(Math.max(0, p - sd / Math.sqrt(k)));
    }
    if (sd > 1e-9) {
      layers.push({ type: 'line', x: fx, y: up, color: ghost, width: 1.4, dash: [2, 3] });
      layers.push({ type: 'line', x: fx, y: lo, color: ghost, width: 1.4, dash: [2, 3] });
    }
    layers.push({ type: 'hline', y: p, color: amber, width: 1.6, dash: [6, 4] });
    if (N) {
      const step = Math.max(1, Math.ceil(c.hist.length / 2500));
      const x = [], y = [];
      for (let i = 0; i < c.hist.length; i += step) { x.push(i + 1); y.push(c.hist[i] / (i + 1)); }
      x.push(c.hist.length); y.push(c.hist[c.hist.length - 1] / c.hist.length);
      layers.push({ type: 'line', x, y, color: brand, width: 2 });
    }
    plotConv.opts.yLabel = `Fraction of |${plusName}⟩ outcomes`;
    plotConv.draw(layers);
    $('conv-cap').textContent = `The fraction of |${plusName}⟩ outcomes after each shot along ${b}. Its scatter shrinks like 1/√N: four times the shots halve the error.`;
    legend('conv-legend', [[brand, '', 'measured fraction'], [amber, 'swatch--dash', 'Born-rule prediction'], [ghost, 'swatch--dot', 'expected ±1 std. dev.']]);

    const can = Q.canonical(psi);
    const n1 = state.gates1.length;
    $('ket').innerHTML = `<b>Measuring:</b> |ψ⟩ = ${ketHTML([can.alpha, can.beta], ['|0⟩', '|1⟩'])} <span class="ket__aside">${n1 ? 'the output of your circuit from tab 1 (' + n1 + (n1 === 1 ? ' gate)' : ' gates)') : 'the input state; tab 1 has no gates'}</span>`;

    if (!N) note('<b>Predict first:</b> what fraction of shots will give each outcome? Then take shots. One shot only ever gives one of the two answers, never the arrow itself.');
    else if (N < 30) note(`<b>Only ${N} shot${N === 1 ? '' : 's'}:</b> the fraction can still sit far from ${p.toFixed(3)}. Keep measuring and watch it settle.`);
    else note(`<b>After ${N} shots</b> the measured fraction is ${frac.toFixed(3)} ± ${err.toFixed(3)}, and the prediction is ${p.toFixed(3)}. ${all ? 'The dashed arrow is rebuilt from all three axes.' : 'Measure along the other two axes as well to rebuild the arrow.'}`);
    $('lab-status').textContent = 'Shots use the browser\'s random number generator, so every run differs. Counts reset whenever the state changes.';
  }

  // ---------- two qubits ----------
  let traj2 = null, traj2Key = '';
  function trajectory2() {
    const key = JSON.stringify(state.gates2);
    if (key !== traj2Key) { traj2 = Q.trajectory2(Q.ZERO2(), state.gates2, PER); traj2Key = key; }
    return traj2;
  }

  function sampleJoint(psi, count) {
    syncJoint(psi);
    const probs = Q.jointProbs(psi, state.basisA, state.basisB);
    for (let i = 0; i < count; i++) { joint.counts[Q.draw(probs, Math.random())]++; joint.n++; }
  }
  function syncJoint(psi) {
    const key = psi.map(z => z[0].toFixed(9) + ',' + z[1].toFixed(9)).join(';') + state.basisA + state.basisB;
    if (key !== jointKey) { jointKey = key; joint = { n: 0, counts: [0, 0, 0, 0] }; }
  }

  function renderPair() {
    const brand = css('--series-1'), ghost = css('--series-ghost'), amber = css('--series-amber'), re = css('--series-re'), im = css('--series-im');
    const gates = state.gates2, n = gates.length;
    const traj = trajectory2();
    const psi = Q.run2(Q.ZERO2(), gates, t2);
    const { rA, rB } = Q.reduced(psi);
    const C = Q.concurrence(psi);
    const len = Math.hypot(...rA);

    const showPreview = preview && t2 >= n - 1e-9;
    let ghostPsi = null;
    if (showPreview) ghostPsi = Q.applyGate2(psi, { ...rotationR(), target: state.target }, 1);
    [['A', sphereA, rA, 'rA'], ['B', sphereB, rB, 'rB']].forEach(([q, sph, r, key]) => {
      const { done, todo } = splitTrail(traj, t2, p => p[key]);
      const scene = { arrows: [{ v: r, color: brand, width: 3.2 }], trail: [] };
      if (todo.length > 1) scene.trail.push({ pts: todo, color: NanoPlot.alpha(brand, 0.5), width: 1.8, dash: [5, 4] });
      if (done.length > 1) scene.trail.push({ pts: done, color: brand, width: 2.4 });
      const ax = currentAxis(gates, t2, q);
      if (ax) scene.axis = { ...ax, color: amber };
      if (showPreview && state.target === q) {
        const path = previewPath(psi, (p, g, s) => Q.applyGate2(p, { ...g, target: q }, s), p => Q.reduced(p)[key]);
        scene.trail.push({ pts: path, color: amber, width: 2 });
        scene.arrows.push({ v: Q.reduced(ghostPsi)[key], color: amber, width: 2, dash: [5, 4], hollow: true, alpha: 0.9 });
        scene.axis = { n: Q.AXES[state.axis], color: amber, label: AXIS_NAME[state.axis] + ' axis' };
      }
      sph.draw(scene);
      $(q === 'A' ? 'sphere-a' : 'sphere-b').setAttribute('aria-label', `Qubit ${q} on its own: arrow of length ${Math.hypot(...r).toFixed(2)}`);
    });

    const S = Q.entropy(len);
    const verdict = C < 1e-6 ? ['Product state', 'not entangled'] : C > 1 - 1e-6 ? ['Maximally entangled', 'a Bell state, up to local gates'] : ['Entangled', 'partly'];
    stats([
      ['Concurrence', C.toFixed(3), 'C: 0 for a product, 1 for a Bell state'],
      ['Arrow length', len.toFixed(3), '|r<sub>A</sub>| = |r<sub>B</sub>| = √(1 − C²)'],
      ['Entropy of one qubit', S.toFixed(3) + ' bit', 'entanglement entropy'],
      ['Verdict', verdict[0], verdict[1], 'sm'],
    ]);

    const lead = psi.find(z => Q.cabs(z) > 1e-10);
    const ph = Q.expi(-Q.carg(lead));
    const amps = psi.map(z => Q.cmul(ph, z));
    $('ket').innerHTML = `<b>Pair state:</b> |ψ⟩ = ${ketHTML(amps, ['|00⟩', '|01⟩', '|10⟩', '|11⟩'])} <span class="ket__aside">qubit A written first; overall phase removed.</span>`;

    // entanglement along the circuit
    const xs = traj.map(p => p.t);
    plotT.opts.xTicks = n >= 1 && n <= 8 ? n : 8;
    plotT.opts.yLabel = 'Value';
    plotT.setRange([0, Math.max(n, 1)], [0, 1.08]);
    const layers = [];
    for (let i = 1; i < n; i++) layers.push({ type: 'vline', x: i, color: NanoPlot.alpha(ghost, 0.8), dash: [2, 4] });
    if (n) {
      layers.push({ type: 'line', x: xs, y: traj.map(p => Q.entropy(Math.hypot(...p.rA))), color: amber, width: 1.8, dash: [6, 4] });
      layers.push({ type: 'line', x: xs, y: traj.map(p => Math.hypot(...p.rA)), color: re, width: 2.2 });
      layers.push({ type: 'line', x: xs, y: traj.map(p => p.C), color: brand, width: 2.6 });
      layers.push({ type: 'vline', x: t2, color: amber, width: 1.6, dash: [] });
      if (plotT.w / n > 40) gates.forEach((g, i) => layers.push({ type: 'text', x: i + 0.5, y: 1.06, text: gateText(g, false).replace(' on ', '·'), color: css('--plot-text') }));
    } else {
      layers.push({ type: 'dots', x: [0, 0], y: [C, len], colors: [brand, re], r: 4.5 });
    }
    plotT.draw(layers);

    // joint measurement
    syncJoint(psi);
    const probs = Q.jointProbs(psi, state.basisA, state.basisB);
    const la = OUTCOME[state.basisA], lb = OUTCOME[state.basisB];
    const labels = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([a, b2]) => `|${la[a]}⟩|${lb[b2]}⟩`);
    const sameCol = brand, diffCol = im;
    $('joint').innerHTML = bars(labels.map((l, i) => ({
      label: l, count: joint.counts[i], n: joint.n, frac: joint.n ? joint.counts[i] / joint.n : 0, pred: probs[i],
      color: i === 0 || i === 3 ? sameCol : diffCol,
    })));
    const Eex = probs[0] - probs[1] - probs[2] + probs[3];
    const Em = joint.n ? (joint.counts[0] - joint.counts[1] - joint.counts[2] + joint.counts[3]) / joint.n : NaN;
    const dE = joint.n ? Math.sqrt(Math.max(1 - Em * Em, 0) / joint.n) : NaN;
    $('joint-read').innerHTML = `Correlation ⟨σ<sub>A</sub>σ<sub>B</sub>⟩ along (${state.basisA}, ${state.basisB}): ` +
      (joint.n ? `measured <b>${signed(Em, 3)} ± ${dE.toFixed(3)}</b> from ${joint.n} shots, ` : 'take shots to measure it; ') +
      `exact <b>${signed(Eex, 3)}</b>. +1 means the outcomes always agree, −1 always disagree.`;

    const T = Q.correlations(psi);
    const B = ['x', 'y', 'z'];
    let g = '<div class="corr__grid"><span class="corr__h">A \\ B</span>' + B.map(k => `<span class="corr__h">${k}</span>`).join('');
    B.forEach((a, i) => {
      g += `<span class="corr__h">${a}</span>`;
      B.forEach((bb, j) => {
        const v = T[i][j], col = v >= 0 ? brand : im;
        const cur = a === state.basisA && bb === state.basisB;
        g += `<span class="corr__c${cur ? ' is-current' : ''}" style="background:${NanoPlot.alpha(col, Math.min(1, Math.abs(v)) * 0.55)}">${signed(v, 2)}</span>`;
      });
    });
    $('corr').innerHTML = g + '</div>';

    if (C < 1e-6) note('<b>Product state:</b> both arrows reach the surface, so each qubit has a definite direction of its own. Any correlation in the shots is just the two directions combined: ⟨σ<sub>A</sub>σ<sub>B</sub>⟩ = r<sub>A</sub> r<sub>B</sub>.');
    else if (C > 1 - 1e-6) note('<b>Maximally entangled:</b> both arrows have shrunk to the centre. Each qubit alone is a fair coin along every axis, yet the pair is perfectly correlated along three axes at once. Measure both qubits below, along z and then along x.');
    else note(`<b>Partly entangled:</b> each arrow has length ${len.toFixed(2)}. The part that is missing from the single-qubit arrows is now stored only in the correlations between the two qubits.`);
    $('lab-status').textContent = `Check: |r_A|² + C² = ${(len * len + C * C).toFixed(12)}, which is 1 for every pure two-qubit state.`;
  }

  function note(html) { $('takeaway').innerHTML = html; }

  // ---------- circuit diagram ----------
  function circuitSVG() {
    const pair = mode === 'pair';
    const gates = pair ? state.gates2 : state.gates1, t = pair ? t2 : t1, n = gates.length;
    const brand = css('--series-1'), amber = css('--series-amber');
    const wy = pair ? [28, 78] : [30];
    const H = pair ? 106 : 60;
    const x0 = pair ? 74 : 64, gap = 10;
    const angText = g => String(Math.round(g.angle / DEG)).replace('-', '−') + '°';
    const width = g => (g.kind === 'R' ? 20 + 6 * AXIS_NAME[g.axis].length + 7 * angText(g).length : g.kind === 'CNOT' || g.kind === 'CZ' || g.kind === 'SWAP' ? 34 : 36);
    const xs = []; let x = x0;
    gates.forEach(g => { xs.push(x); x += width(g) + gap; });
    const W = Math.max(x + 24, 280);
    const wireY = q => wy[q === 'B' ? 1 : 0];
    let s = '';
    wy.forEach(y => { s += `<line x1="${x0 - 14}" y1="${y}" x2="${W - 8}" y2="${y}" class="cw"/>`; });
    if (pair) {
      s += `<text x="6" y="${wy[0] + 5}" class="cl">A |0⟩</text><text x="6" y="${wy[1] + 5}" class="cl">B |0⟩</text>`;
    } else {
      const key = Object.keys(STARTS).find(k => STARTS[k][0] === state.theta && (STARTS[k][1] === state.phi || state.theta === 0 || state.theta === 180));
      s += `<text x="6" y="${wy[0] + 5}" class="cl">${key ? KET[key] : '|ψ₀⟩'}</text>`;
    }
    if (!n) s += `<text x="${x0 + 6}" y="${(pair ? 53 : 30) + 5}" class="ce">Add a gate to start the circuit.</text>`;
    gates.forEach((g, i) => {
      const gx = xs[i], w = width(g);
      const k = Math.floor(t + 1e-9), frac = t - k;
      const status = i < k ? 'done' : i === k && frac > 1e-6 ? 'now' : 'todo';
      const cls = 'cg cg--' + status;
      s += `<g class="${cls}" data-i="${i}" role="button" tabindex="0" aria-label="Jump to after gate ${i + 1}: ${gateText(g, false)}">`;
      s += `<rect x="${gx - 2}" y="2" width="${w + 4}" height="${H - 4}" class="cg__hit"/>`;
      if (g.kind === 'CNOT') {
        const yc = wireY(g.control), yt = wireY(g.control === 'A' ? 'B' : 'A'), cx = gx + w / 2;
        s += `<line x1="${cx}" y1="${yc}" x2="${cx}" y2="${yt + (yt > yc ? 11 : -11)}" class="cg__line"/><circle cx="${cx}" cy="${yc}" r="5" class="cg__dot"/>`;
        s += `<circle cx="${cx}" cy="${yt}" r="11" class="cg__targ"/><line x1="${cx - 11}" y1="${yt}" x2="${cx + 11}" y2="${yt}" class="cg__line"/><line x1="${cx}" y1="${yt - 11}" x2="${cx}" y2="${yt + 11}" class="cg__line"/>`;
      } else if (g.kind === 'CZ') {
        const cx = gx + w / 2;
        s += `<line x1="${cx}" y1="${wy[0]}" x2="${cx}" y2="${wy[1]}" class="cg__line"/><circle cx="${cx}" cy="${wy[0]}" r="5" class="cg__dot"/><circle cx="${cx}" cy="${wy[1]}" r="5" class="cg__dot"/>`;
      } else if (g.kind === 'SWAP') {
        const cx = gx + w / 2, d = 6;
        s += `<line x1="${cx}" y1="${wy[0]}" x2="${cx}" y2="${wy[1]}" class="cg__line"/>`;
        wy.forEach(y => { s += `<path d="M${cx - d},${y - d}L${cx + d},${y + d}M${cx + d},${y - d}L${cx - d},${y + d}" class="cg__line cg__x"/>`; });
      } else {
        const y = wireY(g.target);
        s += `<rect x="${gx}" y="${y - 15}" width="${w}" height="30" rx="6" class="cg__box"/>`;
        if (status === 'now') s += `<rect x="${gx}" y="${y - 15}" width="${(w * frac).toFixed(1)}" height="30" rx="6" class="cg__fill"/>`;
        if (g.kind === 'R') {
          s += `<text x="${gx + w / 2}" y="${y + 5}" class="cg__t cg__t--r">R<tspan class="cg__sub" dy="3">${AXIS_NAME[g.axis]}</tspan><tspan class="cg__ang" dx="3" dy="-3">${angText(g)}</tspan></text>`;
        } else {
          s += `<text x="${gx + w / 2}" y="${y + 5}" class="cg__t">${Q.GATES[g.kind].label}</text>`;
        }
      }
      s += '</g>';
    });
    // time marker
    if (n) {
      const k = Math.floor(t + 1e-9), frac = t - k;
      let mx;
      if (k >= n) mx = xs[n - 1] + width(gates[n - 1]) + gap / 2;
      else if (frac > 1e-6) mx = xs[k] + width(gates[k]) * frac;
      else mx = xs[k] - gap / 2;
      s += `<line x1="${mx}" y1="4" x2="${mx}" y2="${H - 4}" stroke="${amber}" stroke-width="2"/>`;
    }
    $('circuit').innerHTML = `<svg class="circuit__svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="--c-brand:${brand}" role="group" aria-label="Circuit with ${n} gate${n === 1 ? '' : 's'}">${s}</svg>`;
    $('circuit').querySelectorAll('.cg').forEach(el => {
      const go = () => { stopAll(); setTime(+el.dataset.i + 1); render(); };
      el.addEventListener('click', go);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  // ---------- transport ----------
  const gatesNow = () => (mode === 'pair' ? state.gates2 : state.gates1);
  const timeNow = () => (mode === 'pair' ? t2 : t1);
  function setTime(t) { if (mode === 'pair') t2 = t; else t1 = t; }

  function syncTransport() {
    const n = gatesNow().length, t = timeNow();
    const slider = $('time');
    slider.max = String(Math.max(n, 0) * 120);
    slider.value = String(Math.round(t * 120));
    slider.disabled = n === 0;
    let label;
    if (mode === 'measure') {
      label = shots[state.basis].n + ' shots';
    } else if (!n) label = 'No gates';
    else {
      const k = Math.floor(t + 1e-9), frac = t - k;
      label = t < 1e-9 ? 'Input' : frac > 1e-6 && k < n ? `Gate ${k + 1} · ${Math.round(frac * 100)}%` : `After gate ${k}`;
    }
    $('time-out').textContent = label;
    $('play').textContent = playing ? '❚❚ Pause' : mode === 'measure' ? '▶ Keep measuring' : '▶ Replay';
    $('undo').disabled = !n; $('clear').disabled = !n;
    if (mode === 'measure') {
      $('transport-note').textContent = `Adds about ${Math.round(50 * speed)} shots per second along ${state.basis}.`;
    } else {
      $('transport-note').textContent = n ? 'Click a gate in the circuit to jump to just after it.' : '';
    }
  }

  // ---------- render ----------
  function syncControls() {
    $('theta').value = state.theta; $('theta-out').textContent = state.theta + '°';
    $('phi').value = state.phi; $('phi-out').textContent = state.phi + '°';
    $('phi').disabled = state.theta === 0 || state.theta === 180;
    $('alpha').value = state.alpha; $('alpha-out').textContent = String(state.alpha).replace('-', '−') + '°';
    $('add-r').innerHTML = `Add R<sub>${AXIS_NAME[state.axis]}</sub>(${String(state.alpha).replace('-', '−')}°)`;
    document.querySelectorAll('[data-start]').forEach(b => {
      const [th, ph] = STARTS[b.dataset.start];
      b.setAttribute('aria-pressed', String(th === state.theta && (th === 0 || th === 180 || ph === state.phi)));
    });
    document.querySelectorAll('#axis [data-axis]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.axis === state.axis)));
    document.querySelectorAll('#target [data-target]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.target === state.target)));
    document.querySelectorAll('#basis [data-basis]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.basis === state.basis)));
    document.querySelectorAll('#basis-a [data-basis]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.basis === state.basisA)));
    document.querySelectorAll('#basis-b [data-basis]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.basis === state.basisB)));
    document.querySelectorAll('[data-alpha]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.alpha === state.alpha)));
    const full = gatesNow().length >= MAX_GATES;
    document.querySelectorAll('[data-gate], [data-gate2], #add-r').forEach(b => { b.disabled = full; });
    const n1 = state.gates1.length;
    $('input-note').textContent = mode === 'measure' && n1
      ? `Tab 1's ${n1}-gate circuit acts on this input; you are measuring its output.`
      : mode === 'gates' && n1 ? 'Changing the input replays the same gates from a new start.' : '';
  }

  function render() {
    syncControls();
    if (mode !== 'measure') circuitSVG();
    if (mode === 'gates') renderGates();
    else if (mode === 'measure') renderMeasure();
    else renderPair();
    syncTransport();
  }

  const TEXT = {
    gates: ['Bloch sphere', 'Drag to turn the sphere. Solid trail: the path so far. Dashed trail: what is still to come. θ and φ are drawn at the input.', 'Bloch components along the circuit', 'The arrow\'s x, y and z components at every point of the replay. z = P(0) − P(1).'],
    measure: ['The state being measured', 'The thick line is the measurement axis. The circles at its ends are sized by the two probabilities; the dashed arrow is rebuilt from your shots.', '', ''],
    pair: ['Qubit A on its own', 'Length 1: a definite direction. Length 0: completely random on its own.', 'Entanglement along the circuit', 'Concurrence, single-qubit arrow length and entropy at every point of the replay.'],
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
    const [sa, sc, pt, pc] = TEXT[mode];
    $('sa-title').textContent = sa; $('sa-cap').textContent = sc;
    $('pt-title').textContent = pt; $('pt-cap').textContent = pc;
    const brand = css('--series-1');
    if (mode === 'gates') legend('pt-legend', [[css('--series-re'), '', 'x'], [css('--series-im'), '', 'y'], [brand, '', 'z'], [css('--series-amber'), '', 'now']]);
    else if (mode === 'pair') legend('pt-legend', [[brand, '', 'concurrence C'], [css('--series-re'), '', 'arrow length |r<sub>A</sub>|'], [css('--series-amber'), 'swatch--dash', 'entropy (bits)']]);
    render();
  }

  // ---------- animation ----------
  let playing = false, anim = null, raf = 0, last = 0, speed = 1, shotDebt = 0;

  function frame(now) {
    const dt = Math.min(100, now - last); last = now;
    if (mode === 'measure' && playing) {
      shotDebt += 50 * speed * dt / 1000;
      const k = Math.floor(shotDebt);
      if (k > 0) { shotDebt -= k; takeShots(state.basis, k); }
      render();
    } else if (anim) {
      const u = Math.min(1, (now - anim.t0) / anim.dur);
      setTime(anim.from + (anim.to - anim.from) * u);
      if (u >= 1) { anim = null; playing = false; }
      render();
    }
    if (playing || anim) raf = requestAnimationFrame(frame);
    else syncTransport();
  }

  function animateTo(from, to, dur) {
    cancelAnimationFrame(raf);
    if (reduceMotion || dur <= 0) { setTime(to); anim = null; render(); return; }
    anim = { from, to, t0: performance.now(), dur };
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function play() {
    if (mode === 'measure') {
      playing = true; shotDebt = 0; last = performance.now();
      cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
      syncTransport();
      return;
    }
    const n = gatesNow().length;
    if (!n) return;
    let from = timeNow();
    if (from >= n - 1e-9) from = 0;
    playing = true;
    preview = false;
    animateTo(from, n, (n - from) * MS_PER_GATE / speed);
    syncTransport();
  }

  function stopAll() {
    playing = false; anim = null; cancelAnimationFrame(raf);
  }

  function addGate(g) {
    const list = gatesNow();
    if (list.length >= MAX_GATES) return;
    stopAll();
    const n = list.length;
    list.push(g);
    preview = false;
    setTime(n);
    animateTo(n, n + 1, 650 / speed);
  }

  // ---------- controls ----------
  $('play').addEventListener('click', () => { if (playing) { stopAll(); render(); } else play(); });
  $('rewind').addEventListener('click', () => { stopAll(); setTime(0); render(); });
  $('time').addEventListener('input', e => { stopAll(); preview = false; setTime(+e.target.value / 120); render(); });
  $('speed').addEventListener('change', e => { speed = +e.target.value; syncTransport(); });
  $('undo').addEventListener('click', () => {
    stopAll(); const list = gatesNow(); list.pop();
    setTime(Math.min(timeNow(), list.length)); render();
  });
  $('clear').addEventListener('click', () => {
    stopAll();
    if (mode === 'pair') state.gates2 = []; else state.gates1 = [];
    setTime(0); render();
  });

  document.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', () => {
    stopAll();
    [state.theta, state.phi] = STARTS[b.dataset.start];
    render();
  }));
  ['theta', 'phi'].forEach(k => $(k).addEventListener('input', e => { stopAll(); state[k] = +e.target.value; render(); }));

  document.querySelectorAll('[data-gate]').forEach(b => b.addEventListener('click', () => {
    const g = { kind: b.dataset.gate };
    if (mode === 'pair') g.target = state.target;
    addGate(g);
  }));
  document.querySelectorAll('[data-gate2]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.gate2;
    addGate(k === 'CNOT-A' ? { kind: 'CNOT', control: 'A' } : k === 'CNOT-B' ? { kind: 'CNOT', control: 'B' } : { kind: k });
  }));
  document.querySelectorAll('#target [data-target]').forEach(b => b.addEventListener('click', () => { state.target = b.dataset.target; render(); }));

  function touchRotation() {
    stopAll();
    preview = true;
    setTime(gatesNow().length);
    render();
  }
  document.querySelectorAll('#axis [data-axis]').forEach(b => b.addEventListener('click', () => { state.axis = b.dataset.axis; touchRotation(); }));
  $('alpha').addEventListener('input', e => { state.alpha = +e.target.value; touchRotation(); });
  document.querySelectorAll('[data-alpha]').forEach(b => b.addEventListener('click', () => { state.alpha = +b.dataset.alpha; touchRotation(); }));
  $('add-r').addEventListener('click', () => {
    const g = rotationR();
    if (mode === 'pair') g.target = state.target;
    addGate(g);
  });

  document.querySelectorAll('#basis [data-basis]').forEach(b => b.addEventListener('click', () => { state.basis = b.dataset.basis; recent = []; render(); }));
  document.querySelectorAll('[data-shots]').forEach(b => b.addEventListener('click', () => { takeShots(state.basis, +b.dataset.shots); render(); }));
  $('tomo').addEventListener('click', () => { ['x', 'y', 'z'].forEach(k => takeShots(k, 1000)); render(); });
  $('clear-shots').addEventListener('click', () => { stopAll(); shotKey = ''; render(); });

  document.querySelectorAll('#basis-a [data-basis]').forEach(b => b.addEventListener('click', () => { state.basisA = b.dataset.basis; render(); }));
  document.querySelectorAll('#basis-b [data-basis]').forEach(b => b.addEventListener('click', () => { state.basisB = b.dataset.basis; render(); }));
  document.querySelectorAll('[data-jshots]').forEach(b => b.addEventListener('click', () => {
    stopAll();
    sampleJoint(Q.run2(Q.ZERO2(), state.gates2, t2), +b.dataset.jshots); render();
  }));
  $('jclear').addEventListener('click', () => { jointKey = ''; render(); });

  $('reset-view').addEventListener('click', () => {
    sphereA.setView(28 * DEG, 16 * DEG, true); sphereB.setView(28 * DEG, 16 * DEG, true);
  });

  const EXAMPLES = {
    bell: [{ kind: 'H', target: 'A' }, { kind: 'CNOT', control: 'A' }],
    singlet: [{ kind: 'X', target: 'A' }, { kind: 'X', target: 'B' }, { kind: 'H', target: 'A' }, { kind: 'CNOT', control: 'A' }],
    partial: [{ kind: 'R', axis: 'y', angle: 60 * DEG, target: 'A' }, { kind: 'CNOT', control: 'A' }],
    plusplus: [{ kind: 'H', target: 'A' }, { kind: 'H', target: 'B' }, { kind: 'CNOT', control: 'A' }],
    swap: [{ kind: 'X', target: 'B' }, { kind: 'SWAP' }],
  };
  document.querySelectorAll('[data-example]').forEach(b => b.addEventListener('click', () => {
    stopAll();
    state.gates2 = JSON.parse(JSON.stringify(EXAMPLES[b.dataset.example]));
    preview = false;
    t2 = 0;
    play();
  }));

  const tabs = Array.from(document.querySelectorAll('.tab'));
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => { stopAll(); preview = false; mode = b.dataset.mode; applyMode(); });
    b.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus(); next.click();
    });
  });

  // ---------- predict-first loaders ----------
  const QUESTIONS = {
    q1: () => { mode = 'gates'; [state.theta, state.phi] = STARTS['0']; state.gates1 = [{ kind: 'H' }]; t1 = 1; },
    q2: () => { mode = 'gates'; [state.theta, state.phi] = STARTS['+']; state.gates1 = []; t1 = 0; state.axis = 'y'; state.alpha = 90; preview = true; },
    q3: () => { mode = 'gates'; [state.theta, state.phi] = STARTS['0']; state.gates1 = []; t1 = 0; state.axis = 'x'; state.alpha = 360; preview = true; },
    q4: () => { mode = 'measure'; state.theta = 60; state.phi = 0; state.gates1 = []; t1 = 0; state.basis = 'z'; shotKey = ''; },
    q5: () => { mode = 'measure'; [state.theta, state.phi] = STARTS['+i']; state.gates1 = []; t1 = 0; state.basis = 'z'; shotKey = ''; },
    q6: () => { mode = 'pair'; state.gates2 = [{ kind: 'H', target: 'A' }]; t2 = 1; state.basisA = 'z'; state.basisB = 'z'; },
    q7: () => { mode = 'pair'; state.gates2 = [{ kind: 'H', target: 'A' }, { kind: 'H', target: 'B' }]; t2 = 2; state.basisA = 'z'; state.basisB = 'z'; },
    q8: () => { mode = 'pair'; state.gates2 = [{ kind: 'X', target: 'B' }, { kind: 'SWAP' }]; t2 = 1.5; state.basisA = 'z'; state.basisB = 'z'; },
  };
  document.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
    stopAll();
    preview = false;
    QUESTIONS[b.dataset.q]();
    applyMode();
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }));

  applyMode();
})();
