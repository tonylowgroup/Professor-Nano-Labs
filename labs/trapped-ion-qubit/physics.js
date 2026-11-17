/* Trapped Ions and Phonon Sidebands: the physics. No DOM access here.

   Notation follows the video "How exactly does trapped ions perform quantum computing?":
   each ion has a ground state |g> = |0> (4S1/2 in Ca+) and an excited state |e> = |1> (3D5/2),
   and the shared motion of the chain is a phonon mode with states |n_p>, spaced by hbar*omega_p.

   A laser at hbar*omega_0 drives the carrier       |g, n_p> <-> |e, n_p>      at rate Omega,
   a laser at hbar*(omega_0 + omega_p) the blue sideband |g, n_p> <-> |e, n_p + 1> at eta*sqrt(n_p + 1)*Omega,
   a laser at hbar*(omega_0 - omega_p) the red sideband  |g, n_p> <-> |e, n_p - 1> at eta*sqrt(n_p)*Omega.

   This is the Lamb-Dicke (eta << 1) and resolved-sideband (Omega << omega_p) limit: each laser
   colour drives only its own transitions, and each transition is an exact two-level rotation.
   eta (the Lamb-Dicke parameter) says how strongly the laser's kick couples to the motion.

   Units: time in microseconds, angular frequencies in rad/us.
*/
(function () {
  'use strict';
  const TAU = 2 * Math.PI;
  const OMEGA = TAU * 0.05;       // carrier Rabi frequency: Omega/2pi = 50 kHz, so a carrier pi pulse is 10 us
  const ETA = 0.1;                // Lamb-Dicke parameter
  const SHIFT = { carrier: 0, blue: 1, red: -1 };

  /* Rabi frequency of the transition |g, n> <-> |e, n + shift> driven by a laser of this kind. */
  function rabi(kind, n) {
    if (kind === 'carrier') return OMEGA;
    if (kind === 'blue') return ETA * Math.sqrt(n + 1) * OMEGA;
    return n > 0 ? ETA * Math.sqrt(n) * OMEGA : 0;
  }
  const partner = (kind, n) => n + SHIFT[kind];

  /* pi-pulse time of the transition that starts in |g, n>. */
  const piTime = (kind, n) => (rabi(kind, n) > 0 ? Math.PI / rabi(kind, n) : Infinity);

  function thermal(nbar, N) {
    const P = [];
    let sum = 0;
    for (let n = 0; n <= N; n++) { const p = nbar > 0 ? Math.pow(nbar, n) / Math.pow(nbar + 1, n + 1) : (n === 0 ? 1 : 0); P.push(p); sum += p; }
    return P.map(p => p / sum);
  }
  function fock(n0, N) { return Array.from({ length: N + 1 }, (_, n) => (n === n0 ? 1 : 0)); }
  const mean = P => P.reduce((a, p, n) => a + n * p, 0);

  // ---------- 1. one ion: carrier and sidebands ----------
  /* Populations at time t when the ion starts in |g> with phonon distribution P and one laser is on. */
  function flop(P, kind, t) {
    const N = P.length - 1;
    const g = new Array(N + 2).fill(0), e = new Array(N + 2).fill(0);
    P.forEach((p, n) => {
      const m = partner(kind, n), w = rabi(kind, n);
      if (!p) return;
      if (m < 0 || w === 0) { g[n] += p; return; }
      const s = Math.sin(w * t / 2) ** 2;
      g[n] += p * (1 - s); e[m] += p * s;
    });
    return { g, e, Pe: e.reduce((a, b) => a + b, 0) };
  }

  // ---------- 2. two ions and the phonon bus ----------
  // Amplitudes [re, im] over |a2 a3, n_p>, a = 0 (g) or 1 (e), n_p = 0..NB.
  const NB = 12;                 // bus phonons kept: far more than the recipes need (the page warns beyond 2_p)
  const idx = (a2, a3, n) => (a2 * 2 + a3) * (NB + 1) + n;
  function busState(a2, a3, n) {
    const psi = Array.from({ length: 4 * (NB + 1) }, () => [0, 0]);
    psi[idx(a2, a3, n)] = [1, 0];
    return psi;
  }

  /* One laser pulse on one ion. area is the rotation angle of the reference transition:
     the carrier itself, |g, 0_p> <-> |e, 1_p> for blue, and |g, 1_p> <-> |e, 0_p> for red.
     Other phonon numbers rotate by area * sqrt(n + 1) (blue) or area * sqrt(n) (red).
     s in [0, 1] applies a fraction of the pulse, for the replay. */
  function pulse(psi, p, s) {
    const out = psi.map(z => z.slice());
    const frac = s === undefined ? 1 : s;
    for (let other = 0; other < 2; other++) {
      for (let n = 0; n <= NB; n++) {
        const m = partner(p.kind, n);
        if (m < 0 || m > NB) continue;
        const factor = p.kind === 'carrier' ? 1 : p.kind === 'blue' ? Math.sqrt(n + 1) : Math.sqrt(n);
        if (!factor) continue;
        const th = p.area * frac * factor, c = Math.cos(th / 2), sn = Math.sin(th / 2);
        const lo = p.ion === 2 ? idx(0, other, n) : idx(other, 0, n);
        const hi = p.ion === 2 ? idx(1, other, m) : idx(other, 1, m);
        const G = psi[lo], E = psi[hi];
        if (p.kind === 'carrier') {        // cos - i sin sigma_x
          out[lo] = [c * G[0] + sn * E[1], c * G[1] - sn * E[0]];
          out[hi] = [c * E[0] + sn * G[1], c * E[1] - sn * G[0]];
        } else {                           // sideband coupling i*eta*(...): real rotation
          out[lo] = [c * G[0] - sn * E[0], c * G[1] - sn * E[1]];
          out[hi] = [c * E[0] + sn * G[0], c * E[1] + sn * G[1]];
        }
      }
    }
    return out;
  }

  function runBus(psi0, pulses, t) {
    let psi = psi0;
    const T = Math.max(0, Math.min(pulses.length, t));
    const k = Math.floor(T + 1e-12);
    for (let i = 0; i < k; i++) psi = pulse(psi, pulses[i], 1);
    if (k < pulses.length && T - k > 1e-12) psi = pulse(psi, pulses[k], T - k);
    return psi;
  }

  const abs2 = z => z[0] * z[0] + z[1] * z[1];

  /* Marginal populations: ion i in g/e together with each phonon number, and the phonon distribution. */
  function busMarginals(psi) {
    const ion2 = { g: new Array(NB + 1).fill(0), e: new Array(NB + 1).fill(0) };
    const ion3 = { g: new Array(NB + 1).fill(0), e: new Array(NB + 1).fill(0) };
    const phon = new Array(NB + 1).fill(0);
    for (let a2 = 0; a2 < 2; a2++) for (let a3 = 0; a3 < 2; a3++) for (let n = 0; n <= NB; n++) {
      const p = abs2(psi[idx(a2, a3, n)]);
      ion2[a2 ? 'e' : 'g'][n] += p; ion3[a3 ? 'e' : 'g'][n] += p; phon[n] += p;
    }
    const sum = a => a.reduce((x, y) => x + y, 0);
    return { ion2, ion3, phon, Pe2: sum(ion2.e), Pe3: sum(ion3.e), nbar: mean(phon) };
  }

  /* Concurrence of qubits 2 and 3 when the bus holds one definite phonon number; null otherwise. */
  function busConcurrence(psi) {
    const { phon } = busMarginals(psi);
    const n = phon.indexOf(Math.max(...phon));
    if (phon[n] < 1 - 1e-9) return null;
    const c = [idx(0, 0, n), idx(0, 1, n), idx(1, 0, n), idx(1, 1, n)].map(i => psi[i]);
    const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
    const d0 = mul(c[0], c[3]), d1 = mul(c[1], c[2]);
    return { n, C: Math.min(1, 2 * Math.hypot(d0[0] - d1[0], d0[1] - d1[1])) };
  }

  // ---------- 3. sideband cooling ----------
  /* One cooling cycle on a phonon distribution P (ion in |g>):
     a red-sideband pulse whose length gives a pi rotation for n_p = tuned moves |g, n> to |e, n-1>;
     spontaneous emission then returns the ion to |g>, keeping n-1, or with probability `recoil`
     each, gaining or losing one more phonon. */
  function coolCycle(P, tuned, recoil) {
    const N = P.length - 1;
    const area = Math.PI / Math.sqrt(tuned);
    const next = new Array(N + 1).fill(0);
    for (let n = 0; n <= N; n++) {
      const p = P[n];
      if (!p) continue;
      const moved = n > 0 ? p * Math.sin(area * Math.sqrt(n) / 2) ** 2 : 0;
      next[n] += p - moved;
      if (!moved) continue;
      const m = n - 1;
      const down = m > 0 ? recoil : 0;
      next[m] += moved * (1 - down - recoil);
      next[Math.min(N, m + 1)] += moved * recoil;
      if (down) next[m - 1] += moved * down;
    }
    return next;
  }
  const TUNINGS = { fixed: [1], varied: [1, 2, 4] };
  function cool(P0, cycles, plan, recoil) {
    const list = TUNINGS[plan];
    const out = [P0];
    let P = P0;
    for (let k = 0; k < cycles; k++) { P = coolCycle(P, list[k % list.length], recoil); out.push(P); }
    return out;
  }
  /* Strength of the red sideband relative to the blue for weak probing: <n> / (<n> + 1). */
  const sidebandRatio = P => { const n = mean(P); return n / (n + 1); };

  // ---------- 4. initialization and readout (Ca+) ----------
  const BACK_TO_ZERO = 0.94;   // share of decays from 4P that land in 4S1/2 = |0> during optical pumping
  /* Probability of still being in |1> after k optical-pumping cycles, starting from p1. */
  const pumped = (p1, k) => p1 * Math.pow(1 - BACK_TO_ZERO, k);

  function poisson(mu, u) {
    // inverse transform with one uniform deviate u in [0, 1)
    let k = 0, p = Math.exp(-mu), cdf = p;
    while (u > cdf && k < 200) { k++; p *= mu / k; cdf += p; }
    return k;
  }
  function poissonCdf(mu, kmax) {
    // P(X <= kmax)
    if (kmax < 0) return 0;
    let p = Math.exp(-mu), cdf = p;
    for (let k = 1; k <= kmax; k++) { p *= mu / k; cdf += p; }
    return Math.min(1, cdf);
  }
  /* Readout errors for a threshold: a dark ion counted as bright, a bright ion counted as dark. */
  function readoutErrors(muBright, muDark, threshold) {
    return { darkAsBright: 1 - poissonCdf(muDark, threshold - 1), brightAsDark: poissonCdf(muBright + muDark, threshold - 1) };
  }

  window.Ion = {
    TAU, OMEGA, ETA, SHIFT, rabi, partner, piTime, thermal, fock, mean, flop,
    NB, idx, busState, pulse, runBus, busMarginals, busConcurrence, abs2,
    coolCycle, cool, TUNINGS, sidebandRatio,
    BACK_TO_ZERO, pumped, poisson, poissonCdf, readoutErrors,
  };
})();
