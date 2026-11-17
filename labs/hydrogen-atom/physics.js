/* Hydrogen atom: the video's wavefunctions, energies and spectral lines.
   Lengths are in Bohr radii a = 0.529 Å and energies in eV; the proton is held still, as in the video.
     psi_nlm = R_nl(r) Y_l^m(theta, phi),   R_nl = sqrt((2/n)^3 (n-l-1)! / (2n (n+l)!)) e^(-r/n) (2r/n)^l L_{n-l-1}^{2l+1}(2r/n)
   Y_l^m uses the Condon-Shortley phase. The real orbitals follow the video's table (slide 16):
   m > 0 is the cos(m phi) combination (p_x, d_xz, d_x2-y2), m < 0 the sin(|m| phi) one (p_y, d_yz, d_xy). */
(function () {
  'use strict';
  const RY = 13.605693122994;            // eV, the Rydberg energy hbar^2 / (2 m_e a^2)
  const A0 = 0.0529177210903;            // nm
  const RINF = 1.0973731568160e-2;       // nm^-1, the Rydberg constant R = m e^4 / (8 c eps0^2 h^3)
  const HC = 1239.8419843320026;         // eV nm
  const fact = k => { let f = 1; for (let j = 2; j <= k; j++) f *= j; return f; };

  // ---------- energies and lines ----------
  const energy = n => -RY / (n * n);
  const wavelength = (ni, nf) => 1 / (RINF * (1 / (nf * nf) - 1 / (ni * ni)));      // nm
  const photon = (ni, nf) => energy(ni) - energy(nf);                                // eV
  const SERIES = { 1: 'Lyman', 2: 'Balmer', 3: 'Paschen', 4: 'Brackett', 5: 'Pfund' };
  function region(nm) { return nm < 380 ? 'ultraviolet' : nm <= 750 ? 'visible' : 'infrared'; }

  // ---------- radial part ----------
  // generalised Laguerre L_k^alpha(x) by the three-term recurrence
  function laguerre(k, alpha, x) {
    if (k === 0) return 1;
    let a = 1, b = 1 + alpha - x;
    for (let j = 1; j < k; j++) { const c = ((2 * j + 1 + alpha - x) * b - (j + alpha) * a) / (j + 1); a = b; b = c; }
    return b;
  }
  const NORM = {};
  function rnorm(n, l) { const k = n * 10 + l; return NORM[k] || (NORM[k] = Math.sqrt(Math.pow(2 / n, 3) * fact(n - l - 1) / (2 * n * fact(n + l)))); }
  function R(n, l, r) { const x = 2 * r / n; return rnorm(n, l) * Math.exp(-r / n) * Math.pow(x, l) * laguerre(n - l - 1, 2 * l + 1, x); }
  const P = (n, l, r) => { const v = r * R(n, l, r); return v * v; };       // radial probability per unit r
  const u = (n, l, r) => r * R(n, l, r);
  const meanR = (n, l) => (3 * n * n - l * (l + 1)) / 2;
  // V_eff(r) = -2 Ry a / r + Ry a^2 l(l+1) / r^2, in eV with r in a
  const veff = (l, r) => RY * (-2 / r + l * (l + 1) / (r * r));
  // classical turning points: V_eff(r) = E_n  ->  r = n^2 (1 -/+ sqrt(1 - l(l+1)/n^2))
  function turning(n, l) { const s = Math.sqrt(1 - l * (l + 1) / (n * n)); return [n * n * (1 - s), n * n * (1 + s)]; }

  // finite-r nodes: zeros of L_{n-l-1}^{2l+1}(2r/n), bracketed on a fine grid and bisected
  function nodes(n, l) {
    const k = n - l - 1, out = [];
    if (!k) return out;
    const f = r => laguerre(k, 2 * l + 1, 2 * r / n), top = 4 * n * n + 20, N = 4000;
    let r0 = 1e-9, f0 = f(r0);
    for (let i = 1; i <= N; i++) {
      const r1 = top * i / N, f1 = f(r1);
      if (f0 * f1 < 0) { let a = r0, b = r1, fa = f0; for (let it = 0; it < 80; it++) { const c = (a + b) / 2, fc = f(c); if (fa * fc <= 0) b = c; else { a = c; fa = fc; } } out.push((a + b) / 2); }
      r0 = r1; f0 = f1;
    }
    return out;
  }
  // most probable radius: the largest peak of P(r)
  function peakR(n, l) {
    let best = 0, rb = 0;
    const top = 4 * n * n + 10;
    for (let i = 1; i <= 4000; i++) { const r = top * i / 4000, p = P(n, l, r); if (p > best) { best = p; rb = r; } }
    let a = Math.max(1e-6, rb - top / 4000), b = rb + top / 4000;       // golden-section polish
    const g = (Math.sqrt(5) - 1) / 2;
    for (let it = 0; it < 60; it++) { const c = b - g * (b - a), d = a + g * (b - a); if (P(n, l, c) > P(n, l, d)) b = d; else a = c; }
    return (a + b) / 2;
  }
  // probability inside radius r: Simpson on a fine grid (P is smooth)
  function inside(n, l, r, N = 2000) {
    if (r <= 0) return 0;
    const h = r / N;
    let s = P(n, l, 0) + P(n, l, r);
    for (let i = 1; i < N; i++) s += (i % 2 ? 4 : 2) * P(n, l, i * h);
    return s * h / 3;
  }
  // radius that encloses a fraction q of the probability
  function radiusFor(n, l, q) {
    let a = 0, b = 6 * n * n + 30;
    for (let it = 0; it < 60; it++) { const c = (a + b) / 2; if (inside(n, l, c, 800) < q) a = c; else b = c; }
    return (a + b) / 2;
  }
  // probability in the classically forbidden region (outside the turning points)
  function forbidden(n, l) { const [r1, r2] = turning(n, l); return 1 - (inside(n, l, r2, 4000) - inside(n, l, r1, 4000)); }

  // ---------- angular part ----------
  // associated Legendre P_l^m(x), m >= 0, with the Condon-Shortley phase (-1)^m
  function legendre(l, m, x) {
    let pmm = 1;
    const s = Math.sqrt(Math.max(0, (1 - x) * (1 + x)));
    for (let j = 1; j <= m; j++) pmm *= -(2 * j - 1) * s;
    if (l === m) return pmm;
    let pm1 = (2 * m + 1) * x * pmm;
    if (l === m + 1) return pm1;
    for (let j = m + 2; j <= l; j++) { const p = ((2 * j - 1) * x * pm1 - (j + m - 1) * pmm) / (j - m); pmm = pm1; pm1 = p; }
    return pm1;
  }
  const ynorm = (l, m) => Math.sqrt((2 * l + 1) / (4 * Math.PI) * fact(l - m) / fact(l + m));
  // complex Y_l^m(theta, phi) as [re, im]; Y_l^-m = (-1)^m conj(Y_l^m)
  function Yc(l, m, ct, phi) {
    const k = Math.abs(m), a = ynorm(l, k) * legendre(l, k, ct);
    if (m >= 0) return [a * Math.cos(k * phi), a * Math.sin(k * phi)];
    const s = k % 2 ? -1 : 1;
    return [s * a * Math.cos(k * phi), -s * a * Math.sin(k * phi)];
  }
  // real orbitals: sqrt2 (-1)^m Re Y_l^m (m > 0), sqrt2 (-1)^m Im Y_l^|m| (m < 0)
  function Yr(l, m, ct, phi) {
    if (m === 0) return ynorm(l, 0) * legendre(l, 0, ct);
    const k = Math.abs(m), a = Math.SQRT2 * ynorm(l, k) * legendre(l, k, ct) * (k % 2 ? -1 : 1);
    return m > 0 ? a * Math.cos(k * phi) : a * Math.sin(k * phi);
  }
  // the wavefunction at a point. Real basis: a number; complex: [re, im].
  function psi(n, l, m, x, y, z, real) {
    const r = Math.sqrt(x * x + y * y + z * z), ct = r > 0 ? z / r : 1, phi = Math.atan2(y, x), rad = R(n, l, r);
    if (real) return rad * Yr(l, m, ct, phi);
    const [a, b] = Yc(l, m, ct, phi);
    return [rad * a, rad * b];
  }

  // ---------- names ----------
  const LETTER = 'spdfghik';
  const REAL_NAMES = {
    1: { '-1': 'y', 0: 'z', 1: 'x' },
    2: { '-2': 'xy', '-1': 'yz', 0: 'z²', 1: 'xz', 2: 'x²−y²' },
    3: { '-3': 'y(3x²−y²)', '-2': 'xyz', '-1': 'yz²', 0: 'z³', 1: 'xz²', 2: 'z(x²−y²)', 3: 'x(x²−3y²)' },
  };
  // [main, subscript] so pages can typeset the subscript: ['3d', 'z²']
  function name(n, l, m, real) {
    const main = `${n}${LETTER[l]}`;
    if (!l) return [main, ''];
    if (real && REAL_NAMES[l]) return [main, REAL_NAMES[l][m]];
    return [main, `m = ${m < 0 ? '−' + -m : m}`];
  }

  // ---------- sampling the probability cloud ----------
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  /* N points drawn from |psi|^2: r from P(r) by inverting its cumulative sum, the direction from |Y|^2 by rejection.
     Returns { pos: Float32Array(3N), val: Float32Array(N) } where val is the sign (real) or the phase (complex). */
  function sample(n, l, m, real, N, seed) {
    const rand = rng(seed || 12345), top = radiusFor(n, l, 0.9995), M = 3000;
    const cdf = new Float64Array(M + 1);
    for (let i = 1; i <= M; i++) { const r = top * (i - 0.5) / M; cdf[i] = cdf[i - 1] + P(n, l, r); }
    for (let i = 1; i <= M; i++) cdf[i] /= cdf[M];
    let ymax = 0;
    for (let i = 0; i <= 90; i++) for (let j = 0; j < 90; j++) {
      const ct = Math.cos(Math.PI * i / 90), ph = 2 * Math.PI * j / 90;
      const v = real ? Yr(l, m, ct, ph) ** 2 : Yc(l, m, ct, ph).reduce((s, q) => s + q * q, 0);
      if (v > ymax) ymax = v;
    }
    ymax *= 1.08;
    const pos = new Float32Array(3 * N), val = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const q = rand();
      let lo = 0, hi = M;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cdf[mid] < q) lo = mid; else hi = mid; }
      const r = top * (lo + (q - cdf[lo]) / Math.max(1e-300, cdf[hi] - cdf[lo])) / M;
      let ct, ph, w;
      for (let tries = 0; tries < 10000; tries++) {
        ct = 2 * rand() - 1; ph = 2 * Math.PI * rand();
        w = real ? Yr(l, m, ct, ph) : Yc(l, m, ct, ph);
        const d = real ? w * w : w[0] * w[0] + w[1] * w[1];
        if (rand() * ymax < d) break;
      }
      const st = Math.sqrt(1 - ct * ct);
      pos[3 * k] = r * st * Math.cos(ph); pos[3 * k + 1] = r * st * Math.sin(ph); pos[3 * k + 2] = r * ct;
      const s = R(n, l, r) >= 0 ? 1 : -1;
      val[k] = real ? s * Math.sign(w || 1) : Math.atan2(s * w[1], s * w[0]);
    }
    return { pos, val };
  }

  window.Hyd = { RY, A0, RINF, HC, SERIES, energy, wavelength, photon, region, laguerre, R, P, u, meanR, veff, turning, nodes, peakR, inside, radiusFor, forbidden, legendre, Yc, Yr, psi, name, sample, rng };
})();
