/* Three qubits: the physics, with no DOM access.
   Complex numbers are [re, im] pairs. A state is 8 amplitudes, row i = 4 q1 + 2 q2 + q3,
   so qubit 1 is written first: |q1 q2 q3>.
   Gates: {kind: 'X' | 'H' | 'Z', t}            one qubit
          {kind: 'CNOT', c, t}                  control c, target t
          {kind: 'TOF', t}                      Toffoli: the other two qubits control t
          {kind: 'FRED', c}                     Fredkin: c controls a swap of the other two
          {kind: 'CCZ'}                         a sign flip on |111>                      */
(function () {
  'use strict';
  const S2 = Math.SQRT1_2;
  const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const cscale = (a, s) => [a[0] * s, a[1] * s];
  const conj = a => [a[0], -a[1]];
  const abs2 = a => a[0] * a[0] + a[1] * a[1];
  const cabs = a => Math.hypot(a[0], a[1]);
  const carg = a => Math.atan2(a[1], a[0]);
  const expi = t => [Math.cos(t), Math.sin(t)];

  const bit = (i, k) => (i >> (3 - k)) & 1;           // the value of qubit k (1, 2 or 3) in row i
  const flip = (i, k) => i ^ (1 << (3 - k));
  const others = k => [1, 2, 3].filter(q => q !== k);
  const KETS = Array.from({ length: 8 }, (_, i) => '|' + i.toString(2).padStart(3, '0') + '⟩');
  const zero = () => Array.from({ length: 8 }, () => [0, 0]);
  function basis(i) { const s = zero(); s[i] = [1, 0]; return s; }

  const M1 = {
    X: [[[0, 0], [1, 0]], [[1, 0], [0, 0]]],
    Y: [[[0, 0], [0, -1]], [[0, 1], [0, 0]]],
    Z: [[[1, 0], [0, 0]], [[0, 0], [-1, 0]]],
    H: [[[S2, 0], [S2, 0]], [[S2, 0], [-S2, 0]]],
  };
  function apply1(psi, U, k) {
    const out = psi.map(z => z.slice());
    for (let i = 0; i < 8; i++) {
      if (bit(i, k)) continue;
      const j = flip(i, k), a = psi[i], b = psi[j];
      out[i] = cadd(cmul(U[0][0], a), cmul(U[0][1], b));
      out[j] = cadd(cmul(U[1][0], a), cmul(U[1][1], b));
    }
    return out;
  }
  // Where a gate sends row i, for the gates that only reorder rows.
  function image(g, i) {
    if (g.kind === 'CNOT') return bit(i, g.c) ? flip(i, g.t) : i;
    if (g.kind === 'TOF') { const [a, b] = others(g.t); return bit(i, a) && bit(i, b) ? flip(i, g.t) : i; }
    if (g.kind === 'FRED') { const [a, b] = others(g.c); return bit(i, g.c) && bit(i, a) !== bit(i, b) ? flip(flip(i, a), b) : i; }
    return i;
  }
  function apply(psi, g) {
    if (M1[g.kind]) return apply1(psi, M1[g.kind], g.t);
    if (g.kind === 'CCZ') return psi.map((z, i) => (i === 7 ? cscale(z, -1) : z.slice()));
    const out = zero();
    for (let i = 0; i < 8; i++) out[image(g, i)] = psi[i].slice();
    return out;
  }
  // The gate as an 8x8 matrix, M[j][i] = <j|U|i>.
  function matrix(g) {
    const M = Array.from({ length: 8 }, () => zero());
    for (let i = 0; i < 8; i++) apply(basis(i), g).forEach((z, j) => { M[j][i] = z; });
    return M;
  }
  const isPermutation = g => ['CNOT', 'TOF', 'FRED'].includes(g.kind) || g.kind === 'X';
  function run(input, gates, n) {
    let s = basis(input);
    for (let k = 0; k < Math.min(n, gates.length); k++) s = apply(s, gates[k]);
    return s;
  }
  const probs = psi => psi.map(abs2);
  // Bloch vector of qubit k on its own (from the reduced density matrix).
  function bloch(psi, k) {
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < 8; i++) {
      const p = abs2(psi[i]);
      z += bit(i, k) ? -p : p;
      if (!bit(i, k)) { const c = cmul(conj(psi[i]), psi[flip(i, k)]); x += 2 * c[0]; y += 2 * c[1]; }
    }
    return [x, y, z];
  }
  function sample(p, rand) {
    let u = rand();
    for (let i = 0; i < p.length; i++) { if (u < p[i]) return i; u -= p[i]; }
    return p.length - 1;
  }

  // ---------- teleportation ----------
  // Qubit 1 holds Alice's message, qubit 2 her half of the pair, qubit 3 Bob's half.
  const fromAngles = (th, ph) => [[Math.cos(th / 2), 0], cscale(expi(ph), Math.sin(th / 2))];
  const blochOf = msg => { const s = zero(); s[0] = msg[0]; s[1] = msg[1]; return bloch(s, 3); };
  const STEPS = [
    { name: 'Start' },
    { name: 'H on qubit 2', gate: { kind: 'H', t: 2 } },
    { name: 'CNOT 2→3: the shared pair', gate: { kind: 'CNOT', c: 2, t: 3 } },
    { name: 'CNOT 1→2', gate: { kind: 'CNOT', c: 1, t: 2 } },
    { name: 'H on qubit 1', gate: { kind: 'H', t: 1 } },
    { name: 'Alice measures 1 and 2', measure: true },
    { name: 'Bob corrects', correct: true },
  ];
  const PAULI = [null, 'X', 'Y', 'Z'];
  // A noisy pair is the Bell pair with probability (1+3v)/4, or one of X, Y, Z applied to Bob's half,
  // each with probability (1-v)/4: the mixture v |Phi+><Phi+| + (1-v) I/4.
  const weights = v => [(1 + 3 * v) / 4, (1 - v) / 4, (1 - v) / 4, (1 - v) / 4];
  // One pure history: noise k on Bob's half, Alice's outcome m = [m1, m2] (needed from step 5).
  function history(msg, k, m, step) {
    let s = zero(); s[0] = msg[0].slice(); s[4] = msg[1].slice();
    for (let n = 1; n <= Math.min(step, 4); n++) {
      s = apply(s, STEPS[n].gate);
      if (n === 2 && k) s = apply1(s, M1[PAULI[k]], 3);
    }
    if (step >= 5) {
      let norm = 0;
      s = s.map((z, i) => (bit(i, 1) === m[0] && bit(i, 2) === m[1] ? (norm += abs2(z), z) : [0, 0]));
      s = s.map(z => cscale(z, 1 / Math.sqrt(norm)));
    }
    if (step >= 6) { if (m[1]) s = apply1(s, M1.X, 3); if (m[0]) s = apply1(s, M1.Z, 3); }
    return s;
  }
  const outcomeProb = (s, m) => s.reduce((p, z, i) => p + (bit(i, 1) === m[0] && bit(i, 2) === m[1] ? abs2(z) : 0), 0);
  // What we know at a step: Bloch vectors averaged over the noise (and conditioned on m from step 5).
  function teleportView(msg, v, m, step) {
    const w = weights(v), r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    let wsum = 0;
    for (let k = 0; k < 4; k++) {
      if (w[k] < 1e-15) continue;
      const pk = step >= 5 ? outcomeProb(history(msg, k, null, 4), m) : 1, wk = w[k] * pk;
      const s = history(msg, k, m, step);
      [1, 2, 3].forEach((q, j) => { const b = bloch(s, q); for (let c = 0; c < 3; c++) r[j][c] += wk * b[c]; });
      wsum += wk;
    }
    return r.map(b => b.map(c => c / wsum));
  }
  // Bob's part of the noiseless state after step 4, for each of Alice's outcomes: X^m2 Z^m1 |psi>.
  function bobParts(msg) {
    const s = history(msg, 0, null, 4);
    return [0, 1, 2, 3].map(m => { const a = s[2 * m], b = s[2 * m + 1], n = Math.sqrt(abs2(a) + abs2(b)); return [cscale(a, 1 / n), cscale(b, 1 / n)]; });
  }
  // One full run: noise drawn, Alice measures, Bob checks his qubit against the message with and without correcting.
  function teleportRun(msg, v, rand) {
    const k = sample(weights(v), rand);
    const pre = history(msg, k, null, 4), pm = [0, 1, 2, 3].map(m => outcomeProb(pre, [m >> 1, m & 1]));
    const mi = sample(pm, rand), m = [mi >> 1, mi & 1];
    const n = blochOf(msg), dot = r => r[0] * n[0] + r[1] * n[1] + r[2] * n[2];
    const fixed = bloch(history(msg, k, m, 6), 3), raw = bloch(history(msg, k, m, 5), 3);
    return { m: mi, k, pass: rand() < (1 + dot(fixed)) / 2, passRaw: rand() < (1 + dot(raw)) / 2 };
  }
  const fidelity = v => (1 + v) / 2;           // with the two bits, for any message
  const CLASSICAL = 2 / 3;                       // best without entanglement, averaged over messages

  window.Three = {
    cmul, cadd, cscale, conj, abs2, cabs, carg, expi, bit, flip, others, KETS, basis, M1,
    apply1, image, apply, matrix, isPermutation, run, probs, bloch, sample,
    fromAngles, blochOf, STEPS, weights, history, outcomeProb, teleportView, bobParts, teleportRun, fidelity, CLASSICAL,
  };
})();
