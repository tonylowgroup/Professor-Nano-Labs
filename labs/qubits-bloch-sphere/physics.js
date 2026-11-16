/* Qubits on the Bloch Sphere: the physics. No DOM access here.

   Complex numbers are [re, im] pairs.
   One qubit:  psi = [alpha, beta], the amplitudes of |0> and |1>.
   Two qubits: psi = [c00, c01, c10, c11], index 2a + b, qubit A written first.

   Every single-qubit gate is stored as a global phase times a rotation,
   U = e^{i gamma} R_n(alpha) with R_n(alpha) = cos(alpha/2) I - i sin(alpha/2) n.sigma.
   A gate is animated along U(s) = e^{i gamma s} R_n(alpha s), 0 <= s <= 1. For the
   named gates this is the principal fractional power U^s; for R_n(alpha) it is
   the rotation itself, swept from 0 to alpha. Two-qubit gates use the same idea:
   CNOT^s and CZ^s are controlled X^s and Z^s, and SWAP^s multiplies the singlet
   part of the state by e^{i pi s}.
*/
(function () {
  'use strict';
  const PI = Math.PI, S2 = Math.SQRT1_2;

  // ---------- complex arithmetic ----------
  const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const conj = a => [a[0], -a[1]];
  const cscale = (a, s) => [a[0] * s, a[1] * s];
  const abs2 = a => a[0] * a[0] + a[1] * a[1];
  const cabs = a => Math.hypot(a[0], a[1]);
  const carg = a => Math.atan2(a[1], a[0]);
  const expi = t => [Math.cos(t), Math.sin(t)];

  // ---------- axes and gates ----------
  const AXES = {
    x: [1, 0, 0],
    y: [0, 1, 0],
    z: [0, 0, 1],
    h: [S2, 0, S2],          // the Hadamard axis, halfway between x and z
  };

  // Named single-qubit gates as e^{i gamma} R_axis(angle).
  const GATES = {
    X:   { label: 'X',  gamma: PI / 2,  axis: 'x', angle: PI },
    Y:   { label: 'Y',  gamma: PI / 2,  axis: 'y', angle: PI },
    Z:   { label: 'Z',  gamma: PI / 2,  axis: 'z', angle: PI },
    H:   { label: 'H',  gamma: PI / 2,  axis: 'h', angle: PI },
    S:   { label: 'S',  gamma: PI / 4,  axis: 'z', angle: PI / 2 },
    Sdg: { label: 'S†', gamma: -PI / 4, axis: 'z', angle: -PI / 2 },
    T:   { label: 'T',  gamma: PI / 8,  axis: 'z', angle: PI / 4 },
    Tdg: { label: 'T†', gamma: -PI / 8, axis: 'z', angle: -PI / 4 },
  };

  // The exact matrices, used only to check the decomposition above.
  const MATRICES = {
    X: [[[0, 0], [1, 0]], [[1, 0], [0, 0]]],
    Y: [[[0, 0], [0, -1]], [[0, 1], [0, 0]]],
    Z: [[[1, 0], [0, 0]], [[0, 0], [-1, 0]]],
    H: [[[S2, 0], [S2, 0]], [[S2, 0], [-S2, 0]]],
    S: [[[1, 0], [0, 0]], [[0, 0], [0, 1]]],
    Sdg: [[[1, 0], [0, 0]], [[0, 0], [0, -1]]],
    T: [[[1, 0], [0, 0]], [[0, 0], [S2, S2]]],
    Tdg: [[[1, 0], [0, 0]], [[0, 0], [S2, -S2]]],
  };

  /* Normalised rotation axis and the (gamma, angle) of a single-qubit gate. */
  function rotationOf(g) {
    if (g.kind === 'R') return { gamma: 0, n: AXES[g.axis], angle: g.angle };
    const d = GATES[g.kind];
    return { gamma: d.gamma, n: AXES[d.axis], angle: d.angle };
  }

  /* U(s) = e^{i gamma s} [cos(a s/2) I - i sin(a s/2) n.sigma] as a 2x2 complex matrix. */
  function su2(gamma, n, angle, s) {
    const c = Math.cos(angle * s / 2), q = Math.sin(angle * s / 2);
    const [nx, ny, nz] = n;
    const ph = expi(gamma * s);
    const m = [
      [[c, -q * nz], [-q * ny, -q * nx]],
      [[q * ny, -q * nx], [c, q * nz]],
    ];
    return m.map(row => row.map(z => cmul(ph, z)));
  }

  function gateMatrix(g, s) {
    const r = rotationOf(g);
    return su2(r.gamma, r.n, r.angle, s === undefined ? 1 : s);
  }

  const mul2 = (U, a, b) => [cadd(cmul(U[0][0], a), cmul(U[0][1], b)), cadd(cmul(U[1][0], a), cmul(U[1][1], b))];

  // ---------- one qubit ----------
  function fromAngles(theta, phi) {
    const s = Math.sin(theta / 2);
    return [[Math.cos(theta / 2), 0], [s * Math.cos(phi), s * Math.sin(phi)]];
  }

  /* Bloch vector r = <psi|sigma|psi> of a one-qubit state. */
  function bloch(psi) {
    const [a, b] = psi;
    const ab = cmul(conj(a), b);
    return [2 * ab[0], 2 * ab[1], abs2(a) - abs2(b)];
  }

  /* Polar and azimuthal angles of a Bloch vector (phi in [0, 2 pi)). */
  function angles(r) {
    const len = Math.hypot(r[0], r[1], r[2]);
    if (len < 1e-12) return { theta: NaN, phi: NaN, len: 0 };
    const theta = Math.acos(Math.max(-1, Math.min(1, r[2] / len)));
    let phi = Math.atan2(r[1], r[0]);
    if (phi < 0) phi += 2 * PI;
    if (phi > 2 * PI - 1e-9) phi = 0;     // -1e-17 from rounding is 0, not 360 degrees
    const pole = Math.hypot(r[0], r[1]) < 1e-9 * Math.max(1, len);
    return { theta, phi: pole ? NaN : phi, len };
  }

  /* Remove the global phase: alpha real and >= 0 (or beta real and > 0 when alpha = 0). */
  function canonical(psi) {
    const [a, b] = psi;
    const ref = abs2(a) > 1e-20 ? a : b;
    const g = carg(ref);
    const rot = expi(-g);
    return { alpha: cmul(rot, a), beta: cmul(rot, b), globalPhase: g };
  }

  function applyGate1(psi, g, s) {
    const U = gateMatrix(g, s);
    return mul2(U, psi[0], psi[1]);
  }

  /* The state after gates[0..floor(t)) and a fraction t - floor(t) of the next gate. */
  function run1(psi0, gates, t) {
    let psi = psi0;
    const T = Math.max(0, Math.min(gates.length, t));
    const k = Math.floor(T + 1e-12);
    for (let i = 0; i < k && i < gates.length; i++) psi = applyGate1(psi, gates[i], 1);
    const s = T - k;
    if (k < gates.length && s > 1e-12) psi = applyGate1(psi, gates[k], s);
    return psi;
  }

  /* Samples along the whole circuit: [{t, psi, r}], `per` points per gate plus the start. */
  function trajectory1(psi0, gates, per) {
    const out = [{ t: 0, psi: psi0, r: bloch(psi0) }];
    let psi = psi0;
    gates.forEach((g, i) => {
      for (let j = 1; j <= per; j++) {
        const p = applyGate1(psi, g, j / per);
        out.push({ t: i + j / per, psi: p, r: bloch(p) });
      }
      psi = applyGate1(psi, g, 1);
    });
    return out;
  }

  /* Probability of the +1 outcome when measuring along axis n. */
  function probPlus(r, n) {
    return Math.max(0, Math.min(1, (1 + r[0] * n[0] + r[1] * n[1] + r[2] * n[2]) / 2));
  }

  // ---------- two qubits ----------
  const ZERO2 = () => [[1, 0], [0, 0], [0, 0], [0, 0]];

  // Index pairs (|q=0>, |q=1>) for each value of the other qubit.
  const PAIRS = { A: [[0, 2], [1, 3]], B: [[0, 1], [2, 3]] };

  function applyLocal(psi, U, target) {
    const out = psi.slice();
    for (const [i, j] of PAIRS[target]) {
      const [a, b] = mul2(U, psi[i], psi[j]);
      out[i] = a; out[j] = b;
    }
    return out;
  }

  function applyControlled(psi, U, control) {
    const out = psi.slice();
    const [i, j] = control === 'A' ? [2, 3] : [1, 3];   // control = 1; the other qubit is the target
    const [a, b] = mul2(U, psi[i], psi[j]);
    out[i] = a; out[j] = b;
    return out;
  }

  function applySwap(psi, s) {
    // SWAP^s = P_sym + e^{i pi s} P_singlet, singlet = (|01> - |10>)/sqrt 2.
    const amp = cscale(csub(psi[1], psi[2]), S2);
    const k = cscale(cmul(csub(expi(PI * s), [1, 0]), amp), S2);
    const out = psi.slice();
    out[1] = cadd(psi[1], k);
    out[2] = csub(psi[2], k);
    return out;
  }

  function applyGate2(psi, g, s) {
    if (s === undefined) s = 1;
    if (g.kind === 'CNOT') return applyControlled(psi, gateMatrix({ kind: 'X' }, s), g.control);
    if (g.kind === 'CZ') return applyControlled(psi, gateMatrix({ kind: 'Z' }, s), 'A');
    if (g.kind === 'SWAP') return applySwap(psi, s);
    return applyLocal(psi, gateMatrix(g, s), g.target);
  }

  function run2(psi0, gates, t) {
    let psi = psi0;
    const T = Math.max(0, Math.min(gates.length, t));
    const k = Math.floor(T + 1e-12);
    for (let i = 0; i < k && i < gates.length; i++) psi = applyGate2(psi, gates[i], 1);
    const s = T - k;
    if (k < gates.length && s > 1e-12) psi = applyGate2(psi, gates[k], s);
    return psi;
  }

  /* Reduced Bloch vectors of A and B: rho_A = Tr_B |psi><psi| = (I + rA.sigma)/2. */
  function reduced(psi) {
    const [c00, c01, c10, c11] = psi;
    const a01 = cadd(cmul(c00, conj(c10)), cmul(c01, conj(c11)));
    const b01 = cadd(cmul(c00, conj(c01)), cmul(c10, conj(c11)));
    const p = psi.map(abs2);
    return {
      rA: [2 * a01[0], -2 * a01[1], p[0] + p[1] - p[2] - p[3]],
      rB: [2 * b01[0], -2 * b01[1], p[0] + p[2] - p[1] - p[3]],
    };
  }

  /* Concurrence of a pure two-qubit state, C = 2 |c00 c11 - c01 c10|. */
  function concurrence(psi) {
    return Math.min(1, 2 * cabs(csub(cmul(psi[0], psi[3]), cmul(psi[1], psi[2]))));
  }

  /* Entanglement entropy in bits from the length of a reduced Bloch vector. */
  function entropy(len) {
    const h = p => (p > 1e-15 ? -p * Math.log2(p) : 0);
    const l = Math.max(0, Math.min(1, len));
    return h((1 + l) / 2) + h((1 - l) / 2);
  }

  function trajectory2(psi0, gates, per) {
    const sample = (t, p) => { const { rA, rB } = reduced(p); return { t, psi: p, rA, rB, C: concurrence(p) }; };
    const out = [sample(0, psi0)];
    let psi = psi0;
    gates.forEach((g, i) => {
      for (let j = 1; j <= per; j++) out.push(sample(i + j / per, applyGate2(psi, g, j / per)));
      psi = applyGate2(psi, g, 1);
    });
    return out;
  }

  // Basis changes that map the +1 eigenstate of a Pauli to |0>: X -> H, Y -> H S†, Z -> I.
  function toBasis(psi, target, basis) {
    if (basis === 'z') return psi;
    let p = psi;
    if (basis === 'y') p = applyLocal(p, MATRICES.Sdg, target);
    return applyLocal(p, MATRICES.H, target);
  }

  /* Joint outcome probabilities [P(++), P(+-), P(-+), P(--)] for bases of A and B. */
  function jointProbs(psi, basisA, basisB) {
    return toBasis(toBasis(psi, 'A', basisA), 'B', basisB).map(abs2);
  }

  /* Correlation matrix T[i][j] = <sigma_i (x) sigma_j>, i for A and j for B, in x, y, z order. */
  function correlations(psi) {
    const B = ['x', 'y', 'z'];
    return B.map(a => B.map(b => {
      const p = jointProbs(psi, a, b);
      return p[0] - p[1] - p[2] + p[3];
    }));
  }

  // ---------- sampling ----------
  /* Index drawn from a discrete distribution. */
  function draw(probs, u) {
    let acc = 0;
    for (let i = 0; i < probs.length; i++) { acc += probs[i]; if (u < acc) return i; }
    return probs.length - 1;
  }

  window.Qubit = {
    PI, AXES, GATES, MATRICES,
    cmul, cadd, conj, abs2, cabs, carg, expi,
    rotationOf, su2, gateMatrix,
    fromAngles, bloch, angles, canonical, applyGate1, run1, trajectory1, probPlus,
    ZERO2, applyGate2, run2, reduced, concurrence, entropy, trajectory2, jointProbs, correlations,
    draw,
  };
})();
