/* Paul trap lab: the physics, with no drawing.
   Tabs 1-3 measure lengths in units of r0 (the distance from the axis to the electrodes).
   Tab 4 measures lengths in units of the crystal length scale l = (e^2 / 4 pi eps0 m wz^2)^(1/3). */
(function () {
  'use strict';
  const E = 1.602176634e-19, AMU = 1.66053906660e-27, EPS0 = 8.8541878128e-12, KB = 1.380649e-23;
  const M_CA = 39.9626 * AMU;          // a 40Ca+ ion (the missing electron is negligible)
  const R0 = 0.5e-3;                   // 0.5 mm from the trap axis to the electrodes
  const TAU = 2 * Math.PI;

  // ---------- 1. Earnshaw: a static potential U = 1/2 m w0^2 (kx x^2 + ky y^2 + kz z^2) ----------
  // Laplace's equation forces kx + ky + kz = 0. Time is in units of 1/w0.
  const kzFrom = (kx, ky) => -(kx + ky);
  function axisMotion(k, u0, t) {
    if (k > 0) return u0 * Math.cos(Math.sqrt(k) * t);
    if (k < 0) return u0 * Math.cosh(Math.sqrt(-k) * t);
    return u0;                          // no force along this axis: the ion stays where it was put
  }
  function escapeTime(k, u0) {          // time to roll from rest at u0 out to |u| = 1
    if (k >= 0) return Infinity;
    return Math.acosh(1 / Math.abs(u0)) / Math.sqrt(-k);
  }

  // ---------- 2-3. The Mathieu equation  u'' + (a - 2q cos 2xi) u = 0,  xi = W t / 2 ----------
  // One RF period is xi = pi. Along x the trap has (a, q); along y it has (-a, -q).
  function rk4(a, q, u, v, xi, h) {
    const f = (x, uu) => -(a - 2 * q * Math.cos(2 * x)) * uu;
    const k1u = v, k1v = f(xi, u);
    const k2u = v + h / 2 * k1v, k2v = f(xi + h / 2, u + h / 2 * k1u);
    const k3u = v + h / 2 * k2v, k3v = f(xi + h / 2, u + h / 2 * k2u);
    const k4u = v + h * k3v, k4v = f(xi + h, u + h * k3u);
    return [u + h / 6 * (k1u + 2 * k2u + 2 * k3u + k4u), v + h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)];
  }
  // Trace of the one-period transfer matrix. |trace| < 2 means bounded (stable) motion.
  function trace(a, q, n) {
    n = n || 240;
    const h = Math.PI / n;
    let s1 = [1, 0], s2 = [0, 1];
    for (let i = 0; i < n; i++) { const xi = i * h; s1 = rk4(a, q, s1[0], s1[1], xi, h); s2 = rk4(a, q, s2[0], s2[1], xi, h); }
    return s1[0] + s2[1];
  }
  // Characteristic exponent beta: the secular frequency is w = beta * W / 2 (first stability region).
  function beta(a, q) {
    const tr = trace(a, q);
    const stable = Math.abs(tr) < 2;
    return { stable, tr, beta: stable ? Math.acos(tr / 2) / Math.PI : NaN };
  }
  const betaApprox = (a, q) => { const b2 = a + q * q / 2; return b2 > 0 ? Math.sqrt(b2) : NaN; };
  // Edges of the first stability region along x at this q: a0(q) < a < b1(q). Found by bisection on the trace.
  function bisect(f, lo, hi, tol) {
    let flo = f(lo);
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2, fm = f(mid); if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid; if (hi - lo < tol) break; }
    return (lo + hi) / 2;
  }
  // tol and n trade accuracy for speed: the defaults give about 1e-9; the chart uses a coarser, faster setting.
  function edges(q, tol, n) {
    if (q === 0) return { a0: 0, b1: 1 };
    tol = tol || 1e-11;
    const a0 = bisect(a => trace(a, q, n) - 2, -2, 0, tol);
    const b1 = bisect(a => trace(a, q, n) + 2, a0, 1, tol);
    return { a0, b1 };
  }
  // Ion released from rest at (x0, y0) when the RF is at its peak. Lost when it reaches r = limit (the electrodes, by default).
  function trajectory(a, q, x0, y0, cycles, perCycle, limit) {
    perCycle = perCycle || 120;
    const lim2 = (limit === undefined ? 1 : limit) ** 2;
    const h = Math.PI / perCycle, n = Math.round(cycles * perCycle);
    const t = [0], x = [x0], y = [y0];
    let sx = [x0, 0], sy = [y0, 0], lost = null;
    for (let i = 0; i < n; i++) {
      const xi = i * h;
      sx = rk4(a, q, sx[0], sx[1], xi, h);
      sy = rk4(-a, -q, sy[0], sy[1], xi, h);
      t.push((i + 1) / perCycle); x.push(sx[0]); y.push(sy[0]);
      if (sx[0] * sx[0] + sy[0] * sy[0] >= lim2) { lost = (i + 1) / perCycle; break; }
    }
    return { t, x, y, lost, perCycle };
  }
  // Real units for a 40Ca+ ion: q = 2 e V / (m r0^2 W^2), a = 4 e U / (m r0^2 W^2)
  const qOf = (V, fHz) => 2 * E * V / (M_CA * R0 * R0 * (TAU * fHz) ** 2);
  const aOf = (U, fHz) => 4 * E * U / (M_CA * R0 * R0 * (TAU * fHz) ** 2);
  const depthEV = (q, V) => q * V / 8;  // pseudopotential depth at a = 0, in eV
  const evToK = ev => ev * E / KB;

  // ---------- 4. Ion crystals in a linear trap ----------
  // Energy per m wz^2 l^2:  sum (z^2 + b^2 x^2)/2 + sum_{i<j} 1/r_ij,  b = wr / wz.
  // Coordinates are packed as P = [z_0..z_{N-1}, x_0..x_{N-1}].
  const lengthScale = fz => Math.cbrt(E * E / (4 * Math.PI * EPS0 * M_CA * (TAU * fz) ** 2));
  function energy(P, N, b) {
    let s = 0;
    for (let i = 0; i < N; i++) {
      s += 0.5 * (P[i] ** 2 + b * b * P[N + i] ** 2);
      for (let j = i + 1; j < N; j++) s += 1 / Math.hypot(P[i] - P[j], P[N + i] - P[N + j]);
    }
    return s;
  }
  function grad(P, N, b) {
    const g = new Array(2 * N).fill(0);
    for (let i = 0; i < N; i++) {
      g[i] += P[i]; g[N + i] += b * b * P[N + i];
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const dz = P[i] - P[j], dx = P[N + i] - P[N + j], r3 = Math.hypot(dz, dx) ** 3;
        g[i] -= dz / r3; g[N + i] -= dx / r3;
      }
    }
    return g;
  }
  function hessian(P, N, b) {
    const H = Array.from({ length: 2 * N }, () => new Array(2 * N).fill(0));
    for (let i = 0; i < N; i++) { H[i][i] += 1; H[N + i][N + i] += b * b; }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (i === j) continue;
      const d = [P[i] - P[j], P[N + i] - P[N + j]], r2 = d[0] * d[0] + d[1] * d[1], r5 = r2 * r2 * Math.sqrt(r2);
      for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) {
        const K = (3 * d[a] * d[c] - (a === c ? r2 : 0)) / r5;   // second derivative of 1/r
        H[a * N + i][c * N + i] += K;
        H[a * N + i][c * N + j] -= K;
      }
    }
    return H;
  }
  // Symmetric eigenproblem by cyclic Jacobi rotations. Returns eigenvalues and eigenvectors (as columns), ascending.
  function eigSym(A) {
    const n = A.length, a = A.map(r => r.slice());
    const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0, diag = 0;
      for (let p = 0; p < n; p++) { diag += a[p][p] ** 2; for (let q = p + 1; q < n; q++) off += a[p][q] ** 2; }
      if (off <= 1e-30 * Math.max(diag, 1e-300)) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (a[p][q] === 0) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const kp = a[k][p], kq = a[k][q]; a[k][p] = c * kp - s * kq; a[k][q] = s * kp + c * kq; }
        for (let k = 0; k < n; k++) { const pk = a[p][k], qk = a[q][k]; a[p][k] = c * pk - s * qk; a[q][k] = s * pk + c * qk; }
        for (let k = 0; k < n; k++) { const kp = V[k][p], kq = V[k][q]; V[k][p] = c * kp - s * kq; V[k][q] = s * kp + c * kq; }
      }
    }
    const idx = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[i][i] - a[j][j]);
    return { values: idx.map(i => a[i][i]), vectors: idx.map(i => V.map(row => row[i])) };
  }
  // Solve H d = g by Cholesky factorisation; null if H is not positive definite.
  function cholSolve(H, g) {
    const n = g.length, L = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
      let sum = H[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) { if (sum <= 1e-10) return null; L[i][i] = Math.sqrt(sum); } else L[i][j] = sum / L[j][j];
    }
    const y = new Array(n), d = new Array(n);
    for (let i = 0; i < n; i++) { let sum = g[i]; for (let k = 0; k < i; k++) sum -= L[i][k] * y[k]; y[i] = sum / L[i][i]; }
    for (let i = n - 1; i >= 0; i--) { let sum = y[i]; for (let k = i + 1; k < n; k++) sum -= L[k][i] * d[k]; d[i] = sum / L[i][i]; }
    return d;
  }
  // Minimise the energy with saddle-free Newton steps (they walk away from saddles such as an unstable straight string).
  function relax(P, N, b, onlyAxial) {
    const dim = onlyAxial ? N : 2 * N;
    for (let it = 0; it < 300; it++) {
      const g = grad(P, N, b).slice(0, dim);
      const gn = Math.hypot(...g);
      if (gn < 1e-12) break;
      const H = hessian(P, N, b).slice(0, dim).map(r => r.slice(0, dim));
      let d = cholSolve(H, g);                // plain Newton step where the Hessian is positive definite
      if (!d) {                               // otherwise a saddle-free step: divide by |eigenvalue|
        const { values, vectors } = eigSym(H);
        d = new Array(dim).fill(0);
        values.forEach((lam, k) => { const v = vectors[k]; let vg = 0; for (let i = 0; i < dim; i++) vg += v[i] * g[i]; const c = vg / Math.max(Math.abs(lam), 1e-6); for (let i = 0; i < dim; i++) d[i] -= c * v[i]; });
      } else d = d.map(v => -v);
      const E0 = energy(P, N, b);
      let s = 1, moved = false;
      for (let k = 0; k < 40; k++) {
        const T = P.slice(); for (let i = 0; i < dim; i++) T[i] += s * d[i];
        const E1 = energy(T, N, b);
        if (E1 < E0 || (E1 - E0 < 1e-13 * Math.abs(E0) && Math.hypot(...grad(T, N, b).slice(0, dim)) < gn)) { for (let i = 0; i < dim; i++) P[i] = T[i]; moved = true; break; }
        s /= 2;
      }
      if (!moved) break;
    }
    return P;
  }
  function startGuess(N) {
    const P = new Array(2 * N).fill(0), w = 1.6 * Math.pow(N, -0.45);
    for (let i = 0; i < N; i++) P[i] = (i - (N - 1) / 2) * w;
    return P;
  }
  // The straight string along the axis (the radial confinement is assumed strong enough).
  function chain(N) { return relax(startGuess(N), N, 1, true).slice(0, N); }
  // Relax, then make sure the result is a minimum: while the Hessian has a negative eigenvalue
  // (a saddle, such as a string that wants to buckle), step off along it both ways and keep the lower energy.
  function relaxToMinimum(P, N, b) {
    relax(P, N, b, false);
    for (let k = 0; k < 12; k++) {
      const { values, vectors } = eigSym(hessian(P, N, b));
      if (values[0] > -1e-9) break;
      let best = null;
      for (const s of [0.15, -0.15]) {
        const T = P.map((p, i) => p + s * vectors[0][i]);
        relax(T, N, b, false);
        const E = energy(T, N, b);
        if (!best || E < best.E) best = { T, E };
      }
      for (let i = 0; i < 2 * N; i++) P[i] = best.T[i];
    }
    return P;
  }
  // The 2D crystal in the x-z plane with the lowest energy. A straight string is the answer while the radial
  // grip is above the zigzag threshold; below it, several deterministic starts are tried and the lowest kept.
  const STARTS = 3;
  function crystal(N, b) {
    let P = startGuess(N);
    for (let i = 0; i < N; i++) P[N + i] = 0.02 * (i % 2 ? 1 : -1);
    relaxToMinimum(P, N, b);
    if (N > 2 && b < zigzagRatio(N)) {
      let seed = 12345 + 977 * N;
      const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
      let bestE = energy(P, N, b);
      for (let k = 0; k < STARTS; k++) {
        const T = startGuess(N);
        for (let i = 0; i < N; i++) { T[i] *= 0.8 + 0.4 * rand(); T[N + i] = (rand() - 0.5) * (k % 2 ? 1.6 : 0.6) / b; }
        relaxToMinimum(T, N, b);
        const E = energy(T, N, b);
        if (E < bestE - 1e-9) { bestE = E; P = T; }
      }
    }
    // a tidy orientation: sorted along the axis, and the leftmost ion on the lower side
    const idx = Array.from({ length: N }, (_, i) => i).sort((i, j) => P[i] - P[j]);
    const zs = idx.map(i => P[i]), xs = idx.map(i => P[N + i]);
    const flip = xs.length && xs[0] > 1e-6 ? -1 : 1;
    P = zs.concat(xs.map(v => flip * v));
    const z = P.slice(0, N), x = P.slice(N);
    const zigzag = Math.max(...x.map(Math.abs)) > 1e-4;
    if (!zigzag) for (let i = 0; i < N; i++) x[i] = 0;
    return { z, x, zigzag };
  }
  // Normal modes at the equilibrium: frequencies in units of wz, eigenvectors, and how much of each mode is along the axis.
  function modes(z, x, b) {
    const N = z.length, P = z.concat(x);
    const { values, vectors } = eigSym(hessian(P, N, b));
    return values.map((lam, k) => {
      const v = vectors[k];
      let ax = 0; for (let i = 0; i < N; i++) ax += v[i] * v[i];
      return { w: Math.sqrt(Math.max(lam, 0)), lam, v, axial: ax };
    });
  }
  // A straight string turns into a zigzag when wr / wz falls below this.
  const zigCache = {};
  function zigzagRatio(N) {
    if (N < 2) return 0;
    if (N in zigCache) return zigCache[N];
    const z = chain(N), x = new Array(N).fill(0);
    const A = hessian(z.concat(x), N, 0).slice(0, N).map(r => r.slice(0, N));
    const mu = eigSym(A).values[N - 1];
    return (zigCache[N] = Math.sqrt((mu - 1) / 2));
  }

  window.Paul = {
    E, AMU, EPS0, KB, M_CA, R0, TAU,
    kzFrom, axisMotion, escapeTime,
    rk4, trace, beta, betaApprox, edges, trajectory, qOf, aOf, depthEV, evToK,
    lengthScale, energy, grad, hessian, eigSym, relax, chain, crystal, modes, zigzagRatio,
  };
})();
