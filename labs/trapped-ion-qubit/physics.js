/* Trapped-Ion Qubit: the physics. No DOM access here.

   A two-level ion, |0> = ground (north pole) and |1> = excited (south pole),
   driven by a laser. In the frame rotating with the laser, and keeping only
   the near-resonant terms (rotating-wave approximation),

       H = (hbar/2) W.sigma,   W = (Omega cos phi, Omega sin phi, Delta),   Delta = omega_L - omega_0.

   With energy loss (T1) and dephasing (T2) the Bloch vector obeys the Bloch equations

       dr/dt = W x r - (r_x/T2, r_y/T2, (r_z - 1)/T1),

   which relax toward the ground state r = (0, 0, 1). For constant W this is a
   linear system, d[r; 1]/dt = M [r; 1], solved exactly with a 4x4 matrix
   exponential. Slow "field noise" is a Gaussian spread sigma in Delta that is
   fixed during one shot and random between shots; it is averaged over an
   ensemble of detunings.

   Units: time in microseconds, angular frequencies in rad/us. 1 kHz = 2 pi / 1000 rad/us.
*/
(function () {
  'use strict';
  const TAU = 2 * Math.PI;
  const kHz = f => TAU * f / 1000;          // frequency in kHz -> angular frequency in rad/us
  const toKHz = w => w * 1000 / TAU;

  // ---------- 4x4 matrices (flat, row-major) ----------
  function mul4(A, B) {
    const C = new Float64Array(16);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) {
      const a = A[4 * i + k];
      if (a === 0) continue;
      for (let j = 0; j < 4; j++) C[4 * i + j] += a * B[4 * k + j];
    }
    return C;
  }

  /* exp(M t) by scaling and squaring with a Taylor series. */
  function expm4(M, t) {
    const A = new Float64Array(16);
    let norm = 0;
    for (let i = 0; i < 4; i++) {
      let row = 0;
      for (let j = 0; j < 4; j++) { A[4 * i + j] = M[4 * i + j] * t; row += Math.abs(A[4 * i + j]); }
      norm = Math.max(norm, row);
    }
    const s = norm > 0.5 ? Math.ceil(Math.log2(norm / 0.5)) : 0;
    const scale = Math.pow(2, -s);
    for (let i = 0; i < 16; i++) A[i] *= scale;
    let E = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    let term = E.slice();
    for (let k = 1; k <= 20; k++) {
      term = mul4(term, A);
      let big = 0;
      for (let i = 0; i < 16; i++) { term[i] /= k; E[i] += term[i]; big = Math.max(big, Math.abs(term[i])); }
      if (big < 1e-18) break;
    }
    for (let i = 0; i < s; i++) E = mul4(E, E);
    return E;
  }

  /* Generator of d[r; 1]/dt = M [r; 1] for drive vector W and decay rates g1 = 1/T1, g2 = 1/T2. */
  function generator(W, g1, g2) {
    const [wx, wy, wz] = W;
    return new Float64Array([
      -g2, -wz, wy, 0,
      wz, -g2, -wx, 0,
      -wy, wx, -g1, g1,
      0, 0, 0, 0,
    ]);
  }

  function apply4(P, r) {
    return [
      P[0] * r[0] + P[1] * r[1] + P[2] * r[2] + P[3],
      P[4] * r[0] + P[5] * r[1] + P[6] * r[2] + P[7],
      P[8] * r[0] + P[9] * r[1] + P[10] * r[2] + P[11],
    ];
  }

  /* Free evolution (laser off) in closed form: precession at the detuning plus decay. */
  function free(r, delta, t, g1, g2) {
    const c = Math.cos(delta * t), s = Math.sin(delta * t), e2 = Math.exp(-g2 * t);
    return [e2 * (r[0] * c - r[1] * s), e2 * (r[0] * s + r[1] * c), 1 + (r[2] - 1) * Math.exp(-g1 * t)];
  }

  // ---------- parameters ----------
  /* Decay rates. T2 can never exceed 2 T1: energy loss alone destroys coherence at 1/(2 T1). */
  function rates(T1, T2) {
    const g1 = Number.isFinite(T1) ? 1 / T1 : 0;
    const g2set = Number.isFinite(T2) ? 1 / T2 : 0;
    const g2 = Math.max(g2set, g1 / 2);
    return { g1, g2, T2eff: g2 > 0 ? 1 / g2 : Infinity, capped: g1 > 0 && g2set < g1 / 2 };
  }

  /* Detuning offsets and weights for a Gaussian spread sigma: K evenly spaced points over +-4 sigma. */
  function ensemble(sigma, K) {
    if (!(sigma > 0)) return [{ d: 0, w: 1 }];
    const n = K || 41, out = [];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const x = -4 + 8 * i / (n - 1), w = Math.exp(-x * x / 2);
      out.push({ d: sigma * x, w }); sum += w;
    }
    out.forEach(m => { m.w /= sum; });
    return out;
  }

  // A segment is { kind: 'pulse' | 'wait', dur, phase, label }. Pulses use the Rabi frequency p.omega.
  function driveOf(seg, p, d) {
    return seg.kind === 'pulse'
      ? [p.omega * Math.cos(seg.phase || 0), p.omega * Math.sin(seg.phase || 0), p.delta + d]
      : [0, 0, p.delta + d];
  }

  function step(r, seg, p, d, t, cache) {
    if (t <= 0) return r.slice();
    if (seg.kind === 'wait') return free(r, p.delta + d, t, p.g1, p.g2);
    const key = cache && `${p.omega}|${p.delta}|${p.g1}|${p.g2}|${seg.phase || 0}|${d}|${t}`;
    let P = cache && cache.get(key);
    if (!P) { P = expm4(generator(driveOf(seg, p, d), p.g1, p.g2), t); if (cache) cache.set(key, P); }
    return apply4(P, r);
  }

  /* Ensemble-averaged Bloch vector at the end of a sequence, starting in |0>. */
  function finalState(segs, p, K, cache) {
    const avg = [0, 0, 0];
    for (const m of ensemble(p.sigma, K)) {
      let r = [0, 0, 1];
      for (const seg of segs) r = step(r, seg, p, m.d, seg.dur, cache);
      avg[0] += m.w * r[0]; avg[1] += m.w * r[1]; avg[2] += m.w * r[2];
    }
    return avg;
  }

  /* Sampled trajectory for drawing: about N samples spread over the segments by duration. */
  function simulate(segs, p, N, K) {
    const total = segs.reduce((a, s) => a + s.dur, 0);
    const mem = ensemble(p.sigma, K);
    const t = [], counts = segs.map(s => (s.dur > 0 ? Math.max(6, Math.round(N * s.dur / Math.max(total, 1e-12))) : 0));
    let t0 = 0;
    const starts = [];          // per segment: start time and each member's state there
    segs.forEach((s, i) => { starts.push({ t0 }); if (i === 0) t.push(0); for (let j = 1; j <= counts[i]; j++) t.push(t0 + s.dur * j / counts[i]); t0 += s.dur; });
    const members = mem.map(m => {
      const rs = [[0, 0, 1]];
      let r = [0, 0, 1];
      segs.forEach((s, i) => {
        (starts[i].r || (starts[i].r = [])).push(r.slice());
        if (!counts[i]) return;
        const dt = s.dur / counts[i];
        if (s.kind === 'wait') {
          for (let j = 1; j <= counts[i]; j++) rs.push(free(r, p.delta + m.d, dt * j, p.g1, p.g2));
          r = rs[rs.length - 1];
        } else {
          const P = expm4(generator(driveOf(s, p, m.d), p.g1, p.g2), dt);
          for (let j = 1; j <= counts[i]; j++) { r = apply4(P, r); rs.push(r); }
        }
      });
      return rs;
    });
    const avg = t.map((_, k) => {
      const a = [0, 0, 0];
      mem.forEach((m, i) => { const r = members[i][k]; a[0] += m.w * r[0]; a[1] += m.w * r[1]; a[2] += m.w * r[2]; });
      return a;
    });
    return { t, avg, members, weights: mem.map(m => m.w), offsets: mem.map(m => m.d), starts, segs, total };
  }

  /* Exact state at time t (each member and the average), from the stored segment starts. */
  function stateAt(sim, p, t) {
    const segs = sim.segs;
    let i = 0;
    while (i < segs.length - 1 && t > sim.starts[i].t0 + segs[i].dur) i++;
    const tin = Math.max(0, Math.min(segs[i].dur, t - sim.starts[i].t0));
    const avg = [0, 0, 0];
    const members = sim.offsets.map((d, k) => {
      const r = step(sim.starts[i].r[k], segs[i], p, d, tin);
      const w = sim.weights[k];
      avg[0] += w * r[0]; avg[1] += w * r[1]; avg[2] += w * r[2];
      return r;
    });
    return { avg, members, seg: i };
  }

  /* Closed-form Rabi formula from |0>, no decay: P1 = Omega^2/(Omega^2+Delta^2) sin^2(Omega_eff t/2). */
  function rabiP1(omega, delta, t) {
    const we = Math.hypot(omega, delta);
    if (we === 0) return 0;
    const s = Math.sin(we * t / 2);
    return (omega * omega) / (we * we) * s * s;
  }

  const P1 = r => (1 - r[2]) / 2;

  window.Ion = { TAU, kHz, toKHz, expm4, generator, apply4, free, rates, ensemble, driveOf, finalState, simulate, stateAt, rabiP1, P1 };
})();
