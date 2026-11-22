/* Perturbation theory: the physics, with no DOM access.
   A particle in a box of width L, 0 < x < L, measured in units of L: psi_n(x) = sqrt2 sin(n pi x), n = 1, 2, ...
   Energies in units of the ground-state energy E1 = pi^2 hbar^2 / (2 m L^2), so the unperturbed levels are n^2.
   A perturbation V = s W, with strength s in units of E1, is one of
     tilt: W = x - 1/2            (an electric field: the potential drops by s across the box)
     bump: W = 1 for |x - 1/2| < w/2, w = 0.1   (a narrow barrier in the middle)
     step: W = 1 for x > 1/2       (the right half raised)
   Everything is done in the first N box states: the exact answer by diagonalising H = diag(n^2) + s W, and the
   perturbation series from the matrix elements W_mn, with intermediate normalisation <n0|n> = 1.          */
(function () {
  'use strict';
  const N = 40, BUMP = 0.1, PI = Math.PI;

  // ---------- matrix elements W_mn = <m|W|n>, analytic ----------
  // integral over [a, b] of 2 sin(m pi x) sin(n pi x) dx
  function interval(m, n, a, b) {
    if (m === n) return (b - a) - (Math.sin(2 * n * PI * b) - Math.sin(2 * n * PI * a)) / (2 * n * PI);
    const d = m - n, s = m + n;
    return (Math.sin(d * PI * b) - Math.sin(d * PI * a)) / (d * PI) - (Math.sin(s * PI * b) - Math.sin(s * PI * a)) / (s * PI);
  }
  // <m|x|n> for m != n: -8 m n / (pi^2 (m^2 - n^2)^2) when m + n is odd, zero otherwise; <n|x - 1/2|n> = 0
  const xmn = (m, n) => (m === n || (m + n) % 2 === 0 ? 0 : -8 * m * n / (PI * PI * Math.pow(m * m - n * n, 2)));
  const KINDS = {
    tilt: { W: x => x - 0.5, el: (m, n) => xmn(m, n) },                                       // W(x) itself, for reference and tests
    bump: { W: x => (Math.abs(x - 0.5) < BUMP / 2 ? 1 : 0), el: (m, n) => interval(m, n, 0.5 - BUMP / 2, 0.5 + BUMP / 2) },
    step: { W: x => (x > 0.5 ? 1 : 0), el: (m, n) => interval(m, n, 0.5, 1) },
  };
  const cacheW = {};
  function Wmat(kind) {
    if (cacheW[kind]) return cacheW[kind];
    const el = KINDS[kind].el, M = Array.from({ length: N }, () => new Float64Array(N));
    for (let i = 0; i < N; i++) for (let j = 0; j <= i; j++) { const v = el(i + 1, j + 1); M[i][j] = v; M[j][i] = v; }
    return (cacheW[kind] = M);
  }
  const level0 = n => n * n;

  // ---------- exact: diagonalisation of a symmetric matrix ----------
  // Householder reduction to tridiagonal form, then the QL algorithm with implicit shifts (tred2 and tql2, as in
  // EISPACK and JAMA). Returns the eigenvalues in ascending order and their vectors.
  function eigh(A0) {
    const n = A0.length, V = A0.map(r => Float64Array.from(r)), d = new Float64Array(n), e = new Float64Array(n);
    for (let j = 0; j < n; j++) d[j] = V[n - 1][j];
    for (let i = n - 1; i > 0; i--) {
      let scale = 0, h = 0;
      for (let k = 0; k < i; k++) scale += Math.abs(d[k]);
      if (scale === 0) {
        e[i] = d[i - 1];
        for (let j = 0; j < i; j++) { d[j] = V[i - 1][j]; V[i][j] = 0; V[j][i] = 0; }
      } else {
        for (let k = 0; k < i; k++) { d[k] /= scale; h += d[k] * d[k]; }
        let f = d[i - 1], g = Math.sqrt(h);
        if (f > 0) g = -g;
        e[i] = scale * g; h -= f * g; d[i - 1] = f - g;
        for (let j = 0; j < i; j++) e[j] = 0;
        for (let j = 0; j < i; j++) {
          f = d[j]; V[j][i] = f; g = e[j] + V[j][j] * f;
          for (let k = j + 1; k <= i - 1; k++) { g += V[k][j] * d[k]; e[k] += V[k][j] * f; }
          e[j] = g;
        }
        f = 0;
        for (let j = 0; j < i; j++) { e[j] /= h; f += e[j] * d[j]; }
        const hh = f / (h + h);
        for (let j = 0; j < i; j++) e[j] -= hh * d[j];
        for (let j = 0; j < i; j++) {
          f = d[j]; g = e[j];
          for (let k = j; k <= i - 1; k++) V[k][j] -= f * e[k] + g * d[k];
          d[j] = V[i - 1][j]; V[i][j] = 0;
        }
      }
      d[i] = h;
    }
    for (let i = 0; i < n - 1; i++) {
      V[n - 1][i] = V[i][i]; V[i][i] = 1;
      const h = d[i + 1];
      if (h !== 0) {
        for (let k = 0; k <= i; k++) d[k] = V[k][i + 1] / h;
        for (let j = 0; j <= i; j++) {
          let g = 0;
          for (let k = 0; k <= i; k++) g += V[k][i + 1] * V[k][j];
          for (let k = 0; k <= i; k++) V[k][j] -= g * d[k];
        }
      }
      for (let k = 0; k <= i; k++) V[k][i + 1] = 0;
    }
    for (let j = 0; j < n; j++) { d[j] = V[n - 1][j]; V[n - 1][j] = 0; }
    V[n - 1][n - 1] = 1; e[0] = 0;
    // tql2
    for (let i = 1; i < n; i++) e[i - 1] = e[i];
    e[n - 1] = 0;
    let f = 0, tst1 = 0;
    const eps = Math.pow(2, -52);
    for (let l = 0; l < n; l++) {
      tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
      let m = l;
      while (m < n && Math.abs(e[m]) > eps * tst1) m++;
      if (m > l) {
        do {
          let g = d[l], p = (d[l + 1] - g) / (2 * e[l]), r = Math.hypot(p, 1);
          if (p < 0) r = -r;
          d[l] = e[l] / (p + r); d[l + 1] = e[l] * (p + r);
          const dl1 = d[l + 1];
          let h = g - d[l];
          for (let i = l + 2; i < n; i++) d[i] -= h;
          f += h;
          p = d[m];
          let c = 1, c2 = c, c3 = c, el1 = e[l + 1], s = 0, s2 = 0;
          for (let i = m - 1; i >= l; i--) {
            c3 = c2; c2 = c; s2 = s;
            g = c * e[i]; h = c * p; r = Math.hypot(p, e[i]);
            e[i + 1] = s * r; s = e[i] / r; c = p / r; p = c * d[i] - s * g; d[i + 1] = h + s * (c * g + s * d[i]);
            for (let k = 0; k < n; k++) { h = V[k][i + 1]; V[k][i + 1] = s * V[k][i] + c * h; V[k][i] = c * V[k][i] - s * h; }
          }
          p = -s * s2 * c3 * el1 * e[l] / dl1; e[l] = s * p; d[l] = c * p;
        } while (Math.abs(e[l]) > eps * tst1);
      }
      d[l] += f; e[l] = 0;
    }
    const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => d[i] - d[j]);
    return { vals: order.map(i => d[i]), vecs: order.map(i => Float64Array.from(V, r => r[i])) };
  }
  // the exact levels and states at strength s; state k (1-based) is the k-th lowest level, which in one dimension
  // is always the one that grows out of the unperturbed level k. Its sign is chosen so that <k0|k> > 0.
  const cacheX = new Map();
  function exact(kind, s) {
    const key = kind + '|' + s.toFixed(6);
    if (cacheX.has(key)) { const v = cacheX.get(key); cacheX.delete(key); cacheX.set(key, v); return v; }
    const W = Wmat(kind), H = W.map((r, i) => Float64Array.from(r, (w, j) => s * w + (i === j ? level0(i + 1) : 0)));
    const { vals, vecs } = eigh(H);
    vecs.forEach((v, k) => { if (v[k] < 0) for (let i = 0; i < N; i++) v[i] = -v[i]; });
    const out = { E: vals, vecs };
    cacheX.set(key, out);
    if (cacheX.size > 400) cacheX.delete(cacheX.keys().next().value);
    return out;
  }

  // ---------- the perturbation series for state n (1-based), with intermediate normalisation ----------
  // E1 = V_nn, E2 = sum_m |V_mn|^2 / (E_n - E_m)
  // c1_m = V_mn / (E_n - E_m)
  // c2_m = sum_k V_mk V_kn / ((E_n - E_m)(E_n - E_k)) - V_nn V_mn / (E_n - E_m)^2,   and c1_n = c2_n = 0
  function series(kind, n, s) {
    const W = Wmat(kind), i = n - 1, En = level0(n), V = (a, b) => s * W[a][b];
    const c1 = new Float64Array(N), c2 = new Float64Array(N), contrib = new Float64Array(N);
    let E2 = 0;
    for (let m = 0; m < N; m++) {
      if (m === i) continue;
      const d = En - level0(m + 1);
      c1[m] = V(m, i) / d;
      contrib[m] = V(m, i) * V(m, i) / d;
      E2 += contrib[m];
    }
    for (let m = 0; m < N; m++) {
      if (m === i) continue;
      const dm = En - level0(m + 1);
      let t = 0;
      for (let k = 0; k < N; k++) if (k !== i) t += V(m, k) * V(k, i) / (dm * (En - level0(k + 1)));
      c2[m] = t - V(i, i) * V(m, i) / (dm * dm);
    }
    const E1 = V(i, i);
    const len2 = 1 + c1.reduce((a, c) => a + c * c, 0);                // |n0 + n1|^2 with <n0|n> = 1
    return { E0: En, E1, E2, c1, c2, contrib, len2 };
  }
  // coefficients of the state through a given order (0, 1, 2), with intermediate normalisation (the n-th is 1)
  function coeffs(kind, n, s, order) {
    const S = series(kind, n, s), c = new Float64Array(N);
    c[n - 1] = 1;
    if (order >= 1) for (let m = 0; m < N; m++) c[m] += S.c1[m];
    if (order >= 2) for (let m = 0; m < N; m++) c[m] += S.c2[m];
    return c;
  }
  // the exact state scaled to intermediate normalisation, <n0|n> = 1
  function exactCoeffs(kind, n, s) { const v = exact(kind, s).vecs[n - 1], k = 1 / v[n - 1]; return Float64Array.from(v, x => x * k); }
  const norm = c => Math.sqrt(c.reduce((a, x) => a + x * x, 0));
  function overlap2(a, b) { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return (d * d) / (norm(a) * norm(a) * norm(b) * norm(b)); }

  // ---------- wavefunctions and potentials on a grid ----------
  const basisCache = new Map();
  function basis(xs) {
    const key = xs.length + '|' + xs[0] + '|' + xs[xs.length - 1];
    if (basisCache.has(key)) return basisCache.get(key);
    const B = Array.from({ length: N }, (_, m) => Float64Array.from(xs, x => Math.SQRT2 * Math.sin((m + 1) * PI * x)));
    basisCache.set(key, B);
    return B;
  }
  function wave(c, xs, normalise) {
    const B = basis(xs), out = new Float64Array(xs.length), k = normalise ? 1 / norm(c) : 1;
    for (let m = 0; m < N; m++) { if (!c[m]) continue; const w = c[m] * k, row = B[m]; for (let i = 0; i < xs.length; i++) out[i] += w * row[i]; }
    return out;
  }

  // ---------- two coupled levels: the video's example ----------
  // |1> at E1 = -delta/2 and |2> at E2 = +delta/2, coupled by V: H = [[-delta/2, V], [V, delta/2]]
  function twoLevel(delta, V) {
    const r = Math.sqrt(delta * delta / 4 + V * V);
    // lower eigenstate a|1> + b|2> with a = <1|lower>: weight on |1> = (1 + delta / 2r) / 2
    const w1 = r > 0 ? 0.5 * (1 + delta / (2 * r)) : 0.5;
    const E1 = -delta / 2, E2 = delta / 2;
    // first-order states |1> + V/(E1 - E2)|2> and |2> + V/(E2 - E1)|1>, normalised: the weight left on the unperturbed
    // state. With no coupling there is no push at all, and the unperturbed states are exact.
    const c = V === 0 ? 0 : delta !== 0 ? V / delta : Infinity;
    const keep = Number.isFinite(c) ? 1 / (1 + c * c) : 0;
    return { lower: -r, upper: r, gap: 2 * r, w1, E1, E2, keep };
  }

  window.PT = { N, BUMP, KINDS, Wmat, level0, eigh, exact, series, coeffs, exactCoeffs, overlap2, norm, wave, twoLevel, xmn, interval };
})();
