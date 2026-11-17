/* Quantum harmonic oscillator: the physics, with no DOM access.
   Units: position xi = x / x0 with x0 = sqrt(hbar / m omega), momentum in hbar / x0,
   energy in hbar omega, time in oscillation periods (omega t = 2 pi t).
   A state is a list of complex amplitudes c_n = [re, im] on the eigenstates |n>, n = 0 .. NMAX - 1.
   x = (a + a^dagger) / sqrt 2,  p = i (a^dagger - a) / sqrt 2,  H = a^dagger a + 1/2.        */
(function () {
  'use strict';
  const NMAX = 90;
  const PI4 = Math.pow(Math.PI, -0.25);
  const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cconj = a => [a[0], -a[1]];
  const abs2 = a => a[0] * a[0] + a[1] * a[1];
  const expi = t => [Math.cos(t), Math.sin(t)];
  const zeros = () => Array.from({ length: NMAX }, () => [0, 0]);

  // psi_n(xi) for n = 0 .. nmax-1 on a grid, by the stable three-term recurrence
  // psi_{n+1} = sqrt(2/(n+1)) xi psi_n - sqrt(n/(n+1)) psi_{n-1}.
  function eigenTable(xs, nmax) {
    nmax = nmax || NMAX;
    const T = [Float64Array.from(xs, x => PI4 * Math.exp(-x * x / 2))];
    if (nmax > 1) T.push(Float64Array.from(xs, (x, i) => Math.SQRT2 * x * T[0][i]));
    for (let n = 1; n + 1 < nmax; n++) {
      const a = Math.sqrt(2 / (n + 1)), b = Math.sqrt(n / (n + 1)), p = T[n], q = T[n - 1];
      T.push(Float64Array.from(xs, (x, i) => a * x * p[i] - b * q[i]));
    }
    return T;
  }
  const energy = n => n + 0.5;
  const turning = n => Math.sqrt(2 * n + 1);                         // classical amplitude at energy n + 1/2
  const classicalDensity = (A, x) => (Math.abs(x) < A ? 1 / (Math.PI * Math.sqrt(A * A - x * x)) : 0);

  // ---------- ladder operators on a state vector ----------
  function lower(c) { const o = zeros(); for (let n = 1; n < NMAX; n++) { const s = Math.sqrt(n); o[n - 1] = [c[n][0] * s, c[n][1] * s]; } return o; }
  function raise(c) { const o = zeros(); for (let n = 0; n + 1 < NMAX; n++) { const s = Math.sqrt(n + 1); o[n + 1] = [c[n][0] * s, c[n][1] * s]; } return o; }
  const norm2 = c => c.reduce((s, z) => s + abs2(z), 0);
  function normalise(c) { const k = 1 / Math.sqrt(norm2(c)); return c.map(z => [z[0] * k, z[1] * k]); }
  function number(n) { const c = zeros(); c[n] = [1, 0]; return c; }

  // ---------- time evolution and expectation values ----------
  const evolve = (c, t) => c.map((z, n) => cmul(z, expi(-2 * Math.PI * t * (n + 0.5))));
  function moments(c) {
    let a = [0, 0], a2 = [0, 0], N = 0;
    for (let n = 0; n < NMAX; n++) {
      N += n * abs2(c[n]);
      if (n + 1 < NMAX) { const t = cmul(cconj(c[n]), c[n + 1]); const s = Math.sqrt(n + 1); a[0] += s * t[0]; a[1] += s * t[1]; }
      if (n + 2 < NMAX) { const t = cmul(cconj(c[n]), c[n + 2]); const s = Math.sqrt((n + 1) * (n + 2)); a2[0] += s * t[0]; a2[1] += s * t[1]; }
    }
    const x = Math.SQRT2 * a[0], p = Math.SQRT2 * a[1];
    const x2 = a2[0] + N + 0.5, p2 = -a2[0] + N + 0.5;                // <x^2> = Re<a^2> + <n> + 1/2, <p^2> = -Re<a^2> + <n> + 1/2
    const dx = Math.sqrt(Math.max(x2 - x * x, 0)), dp = Math.sqrt(Math.max(p2 - p * p, 0));
    const cov = a2[1] - x * p;                                         // (1/2)<xp + px> - <x><p> = Im<a^2> - <x><p>
    return { x, p, dx, dp, cov, n: N, E: N + 0.5, a, a2 };
  }
  // psi(xi) = sum c_n psi_n(xi) on the grid of a table
  function wave(c, T) {
    const m = T[0].length, re = new Float64Array(m), im = new Float64Array(m);
    for (let n = 0; n < T.length; n++) {
      const z = c[n];
      if (z[0] === 0 && z[1] === 0) continue;
      const row = T[n];
      for (let i = 0; i < m; i++) { re[i] += z[0] * row[i]; im[i] += z[1] * row[i]; }
    }
    return { re, im, dens: Float64Array.from(re, (r, i) => r * r + im[i] * im[i]) };
  }

  // ---------- coherent and Gaussian states ----------
  // |alpha> = e^{-|alpha|^2/2} sum alpha^n / sqrt(n!) |n>
  function coherent(alpha) {
    const c = zeros();
    let z = [Math.exp(-abs2(alpha) / 2), 0];
    for (let n = 0; n < NMAX; n++) { c[n] = z; z = cmul(z, alpha); const s = 1 / Math.sqrt(n + 1); z = [z[0] * s, z[1] * s]; }
    return c;
  }
  // A Gaussian packet centred at (xc, pc) with position spread sigma, projected onto the eigenstates.
  // sigma = 1/sqrt2 is the coherent state; other widths are squeezed.
  let fine = null;
  function gaussianState(xc, pc, sigma) {
    if (!fine) { const xs = []; for (let i = 0; i <= 3600; i++) xs.push(-18 + i * 0.01); fine = { xs, T: eigenTable(xs) }; }
    const { xs, T } = fine, h = 0.01, k = Math.pow(2 * Math.PI * sigma * sigma, -0.25);
    const g = xs.map(x => { const e = k * Math.exp(-(x - xc) * (x - xc) / (4 * sigma * sigma)); return [e * Math.cos(pc * x), e * Math.sin(pc * x)]; });
    const c = zeros();
    for (let n = 0; n < NMAX; n++) {
      let re = 0, im = 0;
      const row = T[n];
      for (let i = 0; i < xs.length; i++) { const w = (i === 0 || i === xs.length - 1 ? 0.5 : 1) * h * row[i]; re += w * g[i][0]; im += w * g[i][1]; }
      c[n] = [re, im];
    }
    return c;
  }
  const poisson = (mean, n) => Math.exp(-mean + n * Math.log(mean || 1e-300) - lgamma(n + 1));
  function lgamma(n) { let s = 0; for (let k = 2; k < n; k++) s += Math.log(k); return s; }   // log((n-1)!) for integer n

  // (xi - d/dxi) f / sqrt 2 on a uniform grid, by central differences: a^dagger written as a differential operator
  function raiseByDerivative(f, xs) {
    const h = xs[1] - xs[0], m = f.length, out = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      const d = i === 0 ? (f[1] - f[0]) / h : i === m - 1 ? (f[m - 1] - f[m - 2]) / h : (f[i + 1] - f[i - 1]) / (2 * h);
      out[i] = (xs[i] * f[i] - d) / Math.SQRT2;
    }
    return out;
  }
  function lowerByDerivative(f, xs) {
    const h = xs[1] - xs[0], m = f.length, out = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      const d = i === 0 ? (f[1] - f[0]) / h : i === m - 1 ? (f[m - 1] - f[m - 2]) / h : (f[i + 1] - f[i - 1]) / (2 * h);
      out[i] = (xs[i] * f[i] + d) / Math.SQRT2;
    }
    return out;
  }

  window.HO = {
    NMAX, eigenTable, energy, turning, classicalDensity, lower, raise, norm2, normalise, number,
    evolve, moments, wave, coherent, gaussianState, poisson, raiseByDerivative, lowerByDerivative, cmul, abs2, expi,
  };
})();
