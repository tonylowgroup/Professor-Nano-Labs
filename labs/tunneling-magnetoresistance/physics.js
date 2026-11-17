/* Tunnelling magnetoresistance: a free-electron ferromagnet / insulator / ferromagnet junction, solved exactly.
   Energies in eV, lengths in Å, conductances per µm².
     Fixed layer (x < 0):  majority band bottom 0, minority Δ, spins along m1 = z.
     Barrier (0 < x < d):  potential U = E_F + φ_B, sloping down by eV across it under a bias V. No spin dependence.
     Free layer (x > d):   majority bottom −eV, minority Δ − eV, spins along m2 = (θ, φ).
   The spinor Schrödinger equation is discretized on a fine lattice (spacing A) and solved with Green's functions:
   the leads enter as exact self-energies, so the result is the continuum answer up to O(A²). For each transverse
   wavevector k∥ only the normal energy E_x = E − ħ²k∥²/2m matters, and the Landauer formula sums them:
     G/A = (e²/h)(m/2πħ²) ∫ T(E_x) dE_x,      T = Σ over spins in and out. */
(function () {
  'use strict';
  const C = 3.80998212;                    // ħ²/2m_e in eV Å²
  const EH = 3.874045846e-5;               // e²/h in S
  const G0 = EH * 9.1093837015e-31 / (2 * Math.PI * 1.054571817e-34 ** 2) * 1.602176634e-19 * 1e-12;   // (e²/h)(m/2πħ²): 80.9 S per eV per µm²
  const A = 0.025;                         // lattice spacing, Å (converged to better than 0.3%)
  const T0 = C / (A * A);                  // hopping, eV

  // Gauss–Legendre, 10 points on [-1, 1]
  const GLX = [-0.9739065285171717, -0.8650633666889845, -0.6794095682990244, -0.4333953941292472, -0.1488743389816312, 0.1488743389816312, 0.4333953941292472, 0.6794095682990244, 0.8650633666889845, 0.9739065285171717];
  const GLW = [0.0666713443086881, 0.1494513491505806, 0.2190863625159820, 0.2692667193099963, 0.2955242247147529, 0.2955242247147529, 0.2692667193099963, 0.2190863625159820, 0.1494513491505806, 0.0666713443086881];

  // a semi-infinite lead with band bottom eb at energy E: self-energy (re, im), broadening, and e^{ika} for the outgoing wave
  function lead(E, eb) {
    const x = (E - eb) / (4 * T0);
    if (x >= 0) { const ka = 2 * Math.asin(Math.min(1, Math.sqrt(x))); return { sr: -T0 * Math.cos(ka), si: -T0 * Math.sin(ka), gam: 2 * T0 * Math.sin(ka), er: Math.cos(ka), ei: Math.sin(ka) }; }
    const qa = 2 * Math.asinh(Math.sqrt(-x)), e = Math.exp(-qa);
    return { sr: -T0 * e, si: 0, gam: 0, er: e, ei: 0 };
  }

  // spinors along n(θ, φ) in the z basis: R = [|+⟩ |−⟩], as complex 2×2 [re, im] arrays (row-major)
  function rot(th, ph) {
    const c = Math.cos(th / 2), s = Math.sin(th / 2), cp = Math.cos(ph), sp = Math.sin(ph);
    return { re: [c, -cp * s, cp * s, c], im: [0, sp * s, sp * s, 0] };
  }
  // small complex 2×2 helpers (row-major arrays of 4)
  const mm = (a, b) => ({
    re: [a.re[0] * b.re[0] - a.im[0] * b.im[0] + a.re[1] * b.re[2] - a.im[1] * b.im[2], a.re[0] * b.re[1] - a.im[0] * b.im[1] + a.re[1] * b.re[3] - a.im[1] * b.im[3],
      a.re[2] * b.re[0] - a.im[2] * b.im[0] + a.re[3] * b.re[2] - a.im[3] * b.im[2], a.re[2] * b.re[1] - a.im[2] * b.im[1] + a.re[3] * b.re[3] - a.im[3] * b.im[3]],
    im: [a.re[0] * b.im[0] + a.im[0] * b.re[0] + a.re[1] * b.im[2] + a.im[1] * b.re[2], a.re[0] * b.im[1] + a.im[0] * b.re[1] + a.re[1] * b.im[3] + a.im[1] * b.re[3],
      a.re[2] * b.im[0] + a.im[2] * b.re[0] + a.re[3] * b.im[2] + a.im[3] * b.re[2], a.re[2] * b.im[1] + a.im[2] * b.re[1] + a.re[3] * b.im[3] + a.im[3] * b.re[3]],
  });
  const dag = a => ({ re: [a.re[0], a.re[2], a.re[1], a.re[3]], im: [-a.im[0], -a.im[2], -a.im[1], -a.im[3]] });
  const diag = (r0, i0, r1, i1) => ({ re: [r0, 0, 0, r1], im: [i0, 0, 0, i1] });
  function inv(a) {
    const dr = a.re[0] * a.re[3] - a.im[0] * a.im[3] - (a.re[1] * a.re[2] - a.im[1] * a.im[2]);
    const di = a.re[0] * a.im[3] + a.im[0] * a.re[3] - (a.re[1] * a.im[2] + a.im[1] * a.re[2]);
    const n = dr * dr + di * di, ir = dr / n, ii = -di / n;
    const m = (r, i) => [r * ir - i * ii, r * ii + i * ir];
    const p = [m(a.re[3], a.im[3]), m(-a.re[1], -a.im[1]), m(-a.re[2], -a.im[2]), m(a.re[0], a.im[0])];
    return { re: p.map(v => v[0]), im: p.map(v => v[1]) };
  }

  const kF = (EF, D) => ({ ku: Math.sqrt(Math.max(0, EF) / C), kd: Math.sqrt(Math.max(0, EF - D) / C) });
  const nSites = d => Math.max(1, Math.round(d / A));

  /* The fixed layer plus the barrier, for one spin (spin is conserved up to the free layer): the Green's function
     at the barrier's last site, g, and the propagator from its first site, gN1, by the recursive method. */
  function leftPart(Ex, p, s) {
    const N = nSites(p.d), U = p.EF + p.phiB, V = p.V || 0, L1 = lead(Ex, s ? p.D : 0);
    let gr = 0, gi = 0, pr = 0, pi = 0;
    for (let n = 1; n <= N; n++) {
      const h = U - V * (n - 0.5) / N + 2 * T0;
      let ar, ai;
      if (n === 1) { ar = Ex - h - L1.sr; ai = -L1.si; }
      else { ar = Ex - h - T0 * T0 * gr; ai = -T0 * T0 * gi; }
      const q = ar * ar + ai * ai, nr = ar / q, ni = -ai / q;
      if (n === 1) { pr = nr; pi = ni; }
      else { const tr = -T0 * (nr * pr - ni * pi), ti = -T0 * (nr * pi + ni * pr); pr = tr; pi = ti; }
      gr = nr; gi = ni;
    }
    return { gr, gi, pr, pi, lead: L1 };
  }

  /* Attach the free layer at angles (θ, φ). Returns the transmissions T[out][in] (in: majority/minority of the fixed
     layer, out: majority/minority of the free layer), and the spin current carried by the electrons injected from the
     fixed layer (vector js, with jp the particle current: js/jp is their spin polarization). */
  function attach(Ex, p, L, th, ph) {
    const V = p.V || 0, Lp = lead(Ex, -V), Lm = lead(Ex, p.D - V);
    const R = rot(th, ph), Rd = dag(R);
    const S2 = mm(mm(R, diag(Lp.sr, Lp.si, Lm.sr, Lm.si)), Rd);
    // G_NN = (g⁻¹ − Σ2)⁻¹, with g = diag(g↑, g↓)
    const ig = L.map(l => { const q = l.gr * l.gr + l.gi * l.gi; return [l.gr / q, -l.gi / q]; });
    const M = { re: [ig[0][0] - S2.re[0], -S2.re[1], -S2.re[2], ig[1][0] - S2.re[3]], im: [ig[0][1] - S2.im[0], -S2.im[1], -S2.im[2], ig[1][1] - S2.im[3]] };
    const GNN = inv(M);
    // G_N1 = G_NN g⁻¹ diag(gN1): column s scaled by (gN1/g)_s
    const f = L.map((l, s) => [ig[s][0] * l.pr - ig[s][1] * l.pi, ig[s][0] * l.pi + ig[s][1] * l.pr]);
    const GN1 = mm(GNN, diag(f[0][0], f[0][1], f[1][0], f[1][1]));
    const Aout = mm(Rd, GN1);
    const g1 = [L[0].lead.gam, L[1].lead.gam], g2 = [Lp.gam, Lm.gam];
    const T = [[0, 0], [0, 0]];
    for (let o = 0; o < 2; o++) for (let s = 0; s < 2; s++) { const k = 2 * o + s; T[o][s] = g2[o] * g1[s] * (Aout.re[k] ** 2 + Aout.im[k] ** 2); }
    // spin current at the last bond: ψ_N = G_N1 |s⟩ i√γ1s, ψ_{N+1} = R diag(e^{ika}) R† ψ_N (outgoing waves)
    const P = mm(mm(R, diag(Lp.er, Lp.ei, Lm.er, Lm.ei)), Rd);
    const js = [0, 0, 0]; let jp = 0;
    for (let s = 0; s < 2; s++) {
      if (!(g1[s] > 0)) continue;
      const a = Math.sqrt(g1[s]);
      // ψ_N = i a G_N1[:, s]
      const u = [{ r: -a * GN1.im[s], i: a * GN1.re[s] }, { r: -a * GN1.im[2 + s], i: a * GN1.re[2 + s] }];
      const v = [{ r: P.re[0] * u[0].r - P.im[0] * u[0].i + P.re[1] * u[1].r - P.im[1] * u[1].i, i: P.re[0] * u[0].i + P.im[0] * u[0].r + P.re[1] * u[1].i + P.im[1] * u[1].r },
        { r: P.re[2] * u[0].r - P.im[2] * u[0].i + P.re[3] * u[1].r - P.im[3] * u[1].i, i: P.re[2] * u[0].i + P.im[2] * u[0].r + P.re[3] * u[1].i + P.im[3] * u[1].r }];
      // Im(u_a* v_b) for the four pairs
      const im = (x, y) => x.r * y.i - x.i * y.r;
      js[0] += 2 * T0 * (im(u[0], v[1]) + im(u[1], v[0]));                  // σx
      js[1] += 2 * T0 * ((u[1].r * v[0].r + u[1].i * v[0].i) - (u[0].r * v[1].r + u[0].i * v[1].i));   // σy: Im(−i u0* v1 + i u1* v0) = Re(u1* v0) − Re(u0* v1)
      js[2] += 2 * T0 * (im(u[0], v[0]) - im(u[1], v[1]));                  // σz
      jp += 2 * T0 * (im(u[0], v[0]) + im(u[1], v[1]));
    }
    return { T, js, jp };
  }

  // transmissions at one normal energy for a list of angles [[θ, φ], ...]
  function atEx(Ex, p, angles) {
    const L = [leftPart(Ex, p, 0), leftPart(Ex, p, 1)];
    return angles.map(([th, ph]) => attach(Ex, p, L, th, ph));
  }

  /* Quadrature nodes for ∫ dE_x from the lowest open band edge up to E_F, split at band edges, at E_F − eV,
     and on a geometric ladder below E_F, where tunnelling is concentrated (the transmission falls e-fold every ħ²κ/2md). */
  function nodes(p) {
    const V = p.V || 0, lo = Math.max(0, -V), hi = p.EF;
    if (!(hi > lo)) return [];
    const kap = Math.sqrt(Math.max(0.05, p.phiB) / C), de = C * kap / Math.max(p.d, 1);
    const br = [lo, hi, p.D, p.D - V, p.EF - V];
    for (let j = -1; j < 9; j++) br.push(hi - de * Math.pow(2, j));
    const pts = Array.from(new Set(br.filter(x => x > lo && x < hi).concat([lo, hi]).map(x => +x.toFixed(12)))).sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], h = (b - a) / 2;
      for (let k = 0; k < 10; k++) out.push([a + h * (1 + GLX[k]), h * GLW[k]]);
    }
    return out;
  }

  /* Linear-response conductance per µm² for each angle, its four spin channels, and the spin current of the
     electrons tunnelling from the fixed layer (per unit particle current). */
  function conductance(p, angles) {
    const q = Object.assign({}, p, { V: 0 }), nd = nodes(q);
    const res = angles.map(() => ({ G: 0, ch: [[0, 0], [0, 0]], js: [0, 0, 0], jp: 0 }));
    for (const [E, w] of nd) {
      const r = atEx(E, q, angles);
      r.forEach((x, i) => {
        const o = res[i];
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { o.ch[a][b] += G0 * w * x.T[a][b]; o.G += G0 * w * x.T[a][b]; }
        for (let k = 0; k < 3; k++) o.js[k] += w * x.js[k];
        o.jp += w * x.jp;
      });
    }
    return res;
  }

  /* Current density (A/µm²) at bias V for each angle, T = 0:  J = (G0/e) ∫ T(E_x; V) w(E_x) dE_x,
     with w = the width of the window [E_F − eV, E_F] above E_x. */
  function current(p, V, angles) {
    const q = Object.assign({}, p, { V }), nd = nodes(q);
    const J = angles.map(() => 0);
    if (!(V > 0)) return J;
    for (const [E, w] of nd) {
      const wt = Math.max(0, p.EF - Math.max(E, p.EF - V));
      if (!(wt > 0)) continue;
      const r = atEx(E, q, angles);
      r.forEach((x, i) => { J[i] += G0 * w * wt * (x.T[0][0] + x.T[0][1] + x.T[1][0] + x.T[1][1]); });
    }
    return J;
  }

  // the video's thick-barrier, normal-incidence result (Slonczewski 1989) and Julliere's formula
  function video(p) {
    const { ku, kd } = kF(p.EF, p.D), kap2 = p.phiB / C, kap = Math.sqrt(kap2);
    const PJ = ku + kd > 0 ? (ku - kd) / (ku + kd) : 0;
    const Ps = PJ * (kap2 - ku * kd) / (kap2 + ku * kd);
    const Ak = k => 4 * k * kap / (kap2 + k * k);
    const e = Math.exp(-2 * kap * p.d);
    return { ku, kd, kap, PJ, Ps, tmrS: 2 * Ps * Ps / (1 - Ps * Ps), tmrJ: 2 * PJ * PJ / (1 - PJ * PJ),
      T: th => e * (Math.cos(th / 2) ** 2 * (Ak(ku) ** 2 + Ak(kd) ** 2) + Math.sin(th / 2) ** 2 * 2 * Ak(ku) * Ak(kd)) };
  }

  /* The scattering state at energy Ex (normal incidence) for an electron injected from the fixed layer with spin s
     (0 majority, 1 minority), amplitude 1, on the barrier plus buffers of length buf on each side. Block Thomas solve.
     Returns x (Å) and, at each point, the spin components: along z in the fixed layer and the barrier, along m2 in the free layer. */
  function wave(Ex, p, th, ph, s, buf, every) {
    const V = p.V || 0, N = nSites(p.d), nb = Math.round(buf / A), M = N + 2 * nb, U = p.EF + p.phiB;
    const R = rot(th, ph), Rd = dag(R), L1 = [lead(Ex, 0), lead(Ex, p.D)], Lp = lead(Ex, -V), Lm = lead(Ex, p.D - V);
    if (!(L1[s].gam > 0)) return null;
    const onsite2 = mm(mm(R, diag(-V, 0, p.D - V, 0)), Rd), S2 = mm(mm(R, diag(Lp.sr, Lp.si, Lm.sr, Lm.si)), Rd);
    // diagonal blocks of (E − H − Σ)
    const Dj = j => {
      if (j < nb) { const m = diag(Ex - 2 * T0, 0, Ex - p.D - 2 * T0, 0); if (j === 0) { m.re[0] -= L1[0].sr; m.im[0] -= L1[0].si; m.re[3] -= L1[1].sr; m.im[3] -= L1[1].si; } return m; }
      if (j < nb + N) { const n = j - nb + 1, h = U - V * (n - 0.5) / N + 2 * T0; return diag(Ex - h, 0, Ex - h, 0); }
      const m = { re: [Ex - 2 * T0 - onsite2.re[0], -onsite2.re[1], -onsite2.re[2], Ex - 2 * T0 - onsite2.re[3]], im: [-onsite2.im[0], -onsite2.im[1], -onsite2.im[2], -onsite2.im[3]] };
      if (j === M - 1) for (let k = 0; k < 4; k++) { m.re[k] -= S2.re[k]; m.im[k] -= S2.im[k]; }
      return m;
    };
    // forward sweep: Q_j = D_j − t² Q_{j−1}⁻¹, y_j = s_j − t Q_{j−1}⁻¹ y_{j−1}; source i γ |s⟩ at site 0 (amplitude-1 incoming wave)
    const Qi = new Array(M), Y = new Array(M);
    let y = [{ r: 0, i: 0 }, { r: 0, i: 0 }]; y[s] = { r: 0, i: L1[s].gam };
    for (let j = 0; j < M; j++) {
      const Dm = Dj(j);
      if (j > 0) {
        const P = Qi[j - 1];
        for (let k = 0; k < 4; k++) { Dm.re[k] -= T0 * T0 * P.re[k]; Dm.im[k] -= T0 * T0 * P.im[k]; }
        const yp = Y[j - 1];
        y = [0, 1].map(r => ({ r: -T0 * (P.re[2 * r] * yp[0].r - P.im[2 * r] * yp[0].i + P.re[2 * r + 1] * yp[1].r - P.im[2 * r + 1] * yp[1].i), i: -T0 * (P.re[2 * r] * yp[0].i + P.im[2 * r] * yp[0].r + P.re[2 * r + 1] * yp[1].i + P.im[2 * r + 1] * yp[1].r) }));
      }
      Qi[j] = inv(Dm); Y[j] = y;
    }
    const psi = new Array(M);
    const app = (P, v) => [0, 1].map(r => ({ r: P.re[2 * r] * v[0].r - P.im[2 * r] * v[0].i + P.re[2 * r + 1] * v[1].r - P.im[2 * r + 1] * v[1].i, i: P.re[2 * r] * v[0].i + P.im[2 * r] * v[0].r + P.re[2 * r + 1] * v[1].i + P.im[2 * r + 1] * v[1].r }));
    psi[M - 1] = app(Qi[M - 1], Y[M - 1]);
    for (let j = M - 2; j >= 0; j--) { const z = Y[j].map((v, r) => ({ r: v.r - T0 * psi[j + 1][r].r, i: v.i - T0 * psi[j + 1][r].i })); psi[j] = app(Qi[j], z); }
    const x = [], maj = [], min = [];
    const st = Math.max(1, every || 1);
    for (let j = 0; j < M; j += st) {
      x.push((j - nb + 0.5) * A);
      let v = psi[j];
      if (j >= nb + N) v = app(Rd, v);          // in the free layer, along m2
      maj.push(v[0].r ** 2 + v[0].i ** 2); min.push(v[1].r ** 2 + v[1].i ** 2);
    }
    return { x, maj, min, k: [Math.sqrt(Math.max(0, Ex) / C), Math.sqrt(Math.max(0, Ex - p.D) / C)] };
  }

  window.MTJ = { C, G0, A, T0, kF, lead, rot, atEx, attach, leftPart, nodes, conductance, current, video, wave, nSites };
})();
