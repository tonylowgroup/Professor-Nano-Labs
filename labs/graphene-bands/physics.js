/* Graphene: nearest-neighbour tight binding on the honeycomb lattice, and its Dirac limit.
   Carbon-carbon distance a = 0.142 nm; k in nm^-1, energies in eV.
     H(k) = [[ D - t'|g|^2 , -t g ], [ -t g* , -D - t'|g|^2 ]],   g(k) = sum_j exp(i k.delta_j)
   delta_1,2 = a(1/2, +-sqrt3/2), delta_3 = a(-1, 0) join an A atom to its three B neighbours. t' is the
   next-nearest-neighbour hopping (sum over the six A-A neighbours = |g|^2 - 3); energies are measured from
   the Dirac point, so E = -t'|g|^2 +- sqrt(D^2 + t^2 |g|^2). D is a sublattice potential (+D on A, -D on B). */
(function () {
  'use strict';
  const A = 0.142;                                   // nm
  const HBAR = 6.582119569e-16;                      // eV s
  const S3 = Math.sqrt(3);
  const DEL = [[A / 2, S3 * A / 2], [A / 2, -S3 * A / 2], [-A, 0]];
  const A1 = [1.5 * A, S3 * A / 2], A2 = [1.5 * A, -S3 * A / 2];
  const KK = 2 * Math.PI / (3 * A);
  const PTS = { G: [0, 0], K: [KK, KK / S3], Kp: [KK, -KK / S3], M: [KK, 0] };
  const B1 = [KK, S3 * KK], B2 = [KK, -S3 * KK];
  const CELL = 1.5 * S3 * A * A;                     // unit-cell area, nm^2 (two atoms)
  const DEFAULTS = { t: 2.7, tp: 0, D: 0 };

  // g(k) as [re, im]
  function g(kx, ky) {
    let re = 0, im = 0;
    for (const [dx, dy] of DEL) { const p = kx * dx + ky * dy; re += Math.cos(p); im += Math.sin(p); }
    return [re, im];
  }
  function bands(kx, ky, p) {
    const [re, im] = g(kx, ky), g2 = re * re + im * im, s = Math.sqrt(p.D * p.D + p.t * p.t * g2), c = -p.tp * g2;
    return [c - s, c + s];
  }
  /* pseudospin: H = c + d.sigma with d = (Re h, -Im h, D), h = -t g. The upper band's pseudospin points along d,
     the lower band's against it. Eigenvectors (c_A, c_B) as [[reA, imA], [reB, imB]]. */
  function dvec(kx, ky, p) { const [re, im] = g(kx, ky); return [-p.t * re, p.t * im, p.D]; }
  function eigvec(kx, ky, p, upper) {
    const d = dvec(kx, ky, p), n = Math.hypot(d[0], d[1], d[2]);
    if (n < 1e-12) return upper ? [[1, 0], [0, 0]] : [[0, 0], [1, 0]];
    const th = Math.acos(Math.max(-1, Math.min(1, d[2] / n))), ph = Math.atan2(d[1], d[0]);
    return upper ? [[Math.cos(th / 2), 0], [Math.sin(th / 2) * Math.cos(ph), Math.sin(th / 2) * Math.sin(ph)]]
                 : [[Math.sin(th / 2), 0], [-Math.cos(th / 2) * Math.cos(ph), -Math.cos(th / 2) * Math.sin(ph)]];
  }

  // ---------- the path G -> K -> M -> G ----------
  const LEGS = [['G', 'K'], ['K', 'M'], ['M', 'G']];
  const LEN = LEGS.map(([a, b]) => Math.hypot(PTS[b][0] - PTS[a][0], PTS[b][1] - PTS[a][1]));
  const PATH_LEN = LEN.reduce((s, v) => s + v, 0);
  const TICKS = [0, LEN[0], LEN[0] + LEN[1], PATH_LEN];
  function pathPoint(s) {      // s in [0, PATH_LEN] -> [kx, ky]
    s = Math.max(0, Math.min(PATH_LEN, s));
    let i = 0;
    while (i < 2 && s > LEN[i]) { s -= LEN[i]; i++; }
    const [a, b] = LEGS[i].map(q => PTS[q]), f = LEN[i] ? s / LEN[i] : 0;
    return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])];
  }

  // ---------- density of states: a histogram over the Brillouin zone ----------
  /* returns { E: centres, rho: states per eV per unit cell (spin included) }, normalised so the two bands hold 4 states */
  function dos(p, opts) {
    const N = (opts && opts.N) || 440, dE = (opts && opts.dE) || 0.03;
    const emax = 3 * p.t + 9 * Math.abs(p.tp) + Math.abs(p.D) + 0.3, nb = Math.ceil(2 * emax / dE);
    const h = new Float64Array(nb);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const u = (i + 0.5) / N, v = (j + 0.5) / N, kx = u * B1[0] + v * B2[0], ky = u * B1[1] + v * B2[1];
      for (const e of bands(kx, ky, p)) { const b = Math.floor((e + emax) / dE); if (b >= 0 && b < nb) h[b] += 1; }
    }
    // smooth with a narrow Gaussian (sigma = 1 bin) to tame the histogram noise
    const w = [0.054, 0.242, 0.399, 0.242, 0.054].map(v => v / 0.991), sm = new Float64Array(nb);
    for (let b = 0; b < nb; b++) for (let q = -2; q <= 2; q++) { const c = b + q; if (c >= 0 && c < nb) sm[b] += w[q + 2] * h[c]; }
    const E = new Float64Array(nb), rho = new Float64Array(nb), norm = 2 / (N * N * dE);
    for (let b = 0; b < nb; b++) { E[b] = -emax + (b + 0.5) * dE; rho[b] = sm[b] * norm; }
    return { E, rho, dE };
  }
  /* electrons (+) or holes (-) per nm^2 from neutrality. While the Fermi contours close around K and K' this is
     exact: 2 spins x (area around K + area around K') / (2 pi)^2. Beyond that (near the van Hove energy) it
     integrates the DOS table instead. */
  function carriers(Ef, p, tab) {
    if (Ef === 0) return 0;
    const lower = Ef < 0, n = 240;
    let area = 0;
    for (const v of ['K', 'Kp']) {
      const f0 = lower ? Ef - bands(...PTS[v], p)[0] : bands(...PTS[v], p)[1] - Ef;
      if (f0 > 0) continue;                       // inside the gap: no carriers in this valley
      const q = contour(v, Ef, p, n, lower);
      if (q.some(x => !Number.isFinite(x))) return tab ? density(tab, Ef) : NaN;
      area += q.reduce((s, x) => s + x * x, 0) * Math.PI / n;      // (1/2) sum q^2 dphi
    }
    return (lower ? -1 : 1) * 2 * area / (4 * Math.PI * Math.PI);
  }
  // electrons (+) or holes (-) per nm^2 measured from neutrality, from a DOS table
  function density(tab, Ef) {
    const lo = Math.min(0, Ef), hi = Math.max(0, Ef);
    let s = 0;
    for (let b = 0; b < tab.E.length; b++) {
      const overlap = Math.min(hi, tab.E[b] + tab.dE / 2) - Math.max(lo, tab.E[b] - tab.dE / 2);
      if (overlap > 0) s += tab.rho[b] * overlap;
    }
    return Math.sign(Ef) * s / CELL;
  }

  // ---------- the Dirac model ----------
  const vF = p => 1.5 * p.t * A / HBAR * 1e-9;                     // m/s
  const hv = p => 1.5 * p.t * A;                                     // hbar v_F in eV nm
  const dirac = (q, p) => Math.sqrt(p.D * p.D + Math.pow(hv(p) * q, 2));            // upper band, q in nm^-1
  const diracDos = (E, p) => (Math.abs(E) > Math.abs(p.D) ? 2 * Math.abs(E) / (Math.PI * hv(p) ** 2) * CELL : 0);   // per eV per cell
  const diracDensity = (Ef, p) => Math.sign(Ef) * Math.max(0, Ef * Ef - p.D * p.D) / (Math.PI * hv(p) ** 2);        // per nm^2

  /* the constant-energy contour of the upper band around a valley: radius q(phi) in nm^-1 (bisection along each ray) */
  function contour(valley, E, p, n, lower) {
    const [Kx, Ky] = PTS[valley], out = [], qmax = 0.98 * KK / S3 * 2;
    for (let i = 0; i < n; i++) {
      const phi = 2 * Math.PI * i / n, cx = Math.cos(phi), cy = Math.sin(phi);
      const f = lower ? q => E - bands(Kx + q * cx, Ky + q * cy, p)[0] : q => bands(Kx + q * cx, Ky + q * cy, p)[1] - E;
      // the first crossing along the ray (towards M the band rises to t, then falls again towards K')
      let a = 0, b = NaN;
      if (f(0) <= 0) for (let k = 1; k <= 400; k++) { const q = qmax * k / 400; if (f(q) > 0) { b = q; a = qmax * (k - 1) / 400; break; } }
      if (!Number.isFinite(b)) { out.push(NaN); continue; }
      for (let it = 0; it < 44; it++) { const c = (a + b) / 2; if (f(c) < 0) a = c; else b = c; }
      out.push((a + b) / 2);
    }
    return out;
  }
  /* Berry phase of the upper band around the contour at energy E: -arg prod <u_i|u_i+1> */
  function berry(valley, E, p, n) {
    const q = contour(valley, E, p, n || 240), [Kx, Ky] = PTS[valley];
    if (q.some(v => !Number.isFinite(v))) return NaN;
    const us = q.map((r, i) => { const ph = 2 * Math.PI * i / q.length; return eigvec(Kx + r * Math.cos(ph), Ky + r * Math.sin(ph), p, true); });
    let pr = [1, 0];
    for (let i = 0; i < us.length; i++) {
      const u = us[i], v = us[(i + 1) % us.length];
      // <u|v> = conj(uA) vA + conj(uB) vB
      const re = u[0][0] * v[0][0] + u[0][1] * v[0][1] + u[1][0] * v[1][0] + u[1][1] * v[1][1];
      const im = u[0][0] * v[0][1] - u[0][1] * v[0][0] + u[1][0] * v[1][1] - u[1][1] * v[1][0];
      pr = [pr[0] * re - pr[1] * im, pr[0] * im + pr[1] * re];
    }
    return -Math.atan2(pr[1], pr[0]);
  }

  // how many times the in-plane pseudospin turns (anticlockwise positive) on an anticlockwise loop of radius q round a valley
  function winding(valley, p, q) {
    const [Kx, Ky] = PTS[valley];
    let tot = 0, prev = null;
    for (let i = 0; i <= 360; i++) {
      const a = 2 * Math.PI * i / 360, d = dvec(Kx + q * Math.cos(a), Ky + q * Math.sin(a), p), ang = Math.atan2(d[1], d[0]);
      if (prev !== null) { let da = ang - prev; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; tot += da; }
      prev = ang;
    }
    return Math.round(tot / (2 * Math.PI));
  }

  // the bottom of the lower band and the top of the upper band (both bands depend on k only through |g|, 0..3)
  function edges(p) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i <= 600; i++) {
      const x = 3 * i / 600, c = -p.tp * x * x, s = Math.sqrt(p.D * p.D + p.t * p.t * x * x);
      lo = Math.min(lo, c - s); hi = Math.max(hi, c + s);
    }
    return [lo, hi];
  }
  // the van Hove energies: both bands at M, where |g| = 1
  const vanHove = p => [-p.tp - Math.sqrt(p.D * p.D + p.t * p.t), -p.tp + Math.sqrt(p.D * p.D + p.t * p.t)];

  window.Gr = { A, HBAR, DEL, A1, A2, B1, B2, KK, PTS, CELL, DEFAULTS, g, bands, dvec, eigvec, LEGS, LEN, PATH_LEN, TICKS, pathPoint, dos, density, vF, hv, dirac, diracDos, diracDensity, contour, berry, carriers, winding, edges, vanHove };
})();
