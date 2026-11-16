/* Gaussian wave packet physics: a direct sum of plane waves.
   Follows the companion notebook: Psi(x,t) = 1/sqrt(2 pi) * integral of
   Phi(k) e^{ikx} e^{-i omega_k t} dk, evaluated with a trapezoidal sum.
   Units: x in nm, t in fs, k in 1/nm, Psi in nm^-1/2. */
(function (root) {
  'use strict';

  // hbar / m0 in nm^2/fs (CODATA 2018: hbar = 1.054571817e-34 J s, m0 = 9.1093837015e-31 kg)
  const HBAR_OVER_M0 = 0.11576763606960588;
  const MAX_NK = 4001;           // cap on plane waves in the converged sum
  const WAVE_COUNTS = [1, 3, 5, 9, 15, 25, 41, 61, 101, 0];   // 0 means "converged"

  /* p = { sigma, k0, mass, tmax, X, mode: 'full' | 'linear', waves } */
  function buildModel(p) {
    const hm = HBAR_OVER_M0 / p.mass;                 // hbar/m, nm^2/fs
    const vg = hm * p.k0;                             // group velocity, nm/fs
    const tau = 2 * p.sigma * p.sigma / hm;           // spreading time, fs
    const linear = p.mode === 'linear';
    const widthAt = t => linear ? p.sigma : p.sigma * Math.sqrt(1 + (t / tau) * (t / tau));

    let Q, Nk, dk, capped = false;
    if (p.waves === 0) {
      // Converged: span k0 +- 8/sigma and choose dk so the copies that repeat
      // every 2 pi/dk stay outside the view for the whole time range.
      Q = 8 / p.sigma;
      const reach = Math.abs(vg) * p.tmax + 6 * widthAt(p.tmax);
      const period = 1.2 * (p.X + Math.max(p.X, reach));
      let half = Math.ceil(Q / (2 * Math.PI / period));
      if (2 * half + 1 > MAX_NK) { half = (MAX_NK - 1) / 2; capped = true; }
      Nk = 2 * half + 1;
      dk = Q / half;
    } else if (p.waves === 1) {
      Q = 0; Nk = 1; dk = 0;
    } else {
      Q = 3 / p.sigma; Nk = p.waves; dk = 2 * Q / (Nk - 1);
    }

    const k = new Float64Array(Nk), amp = new Float64Array(Nk), omega = new Float64Array(Nk);
    const pref = Math.pow(2 / Math.PI, 0.25) * Math.sqrt(p.sigma);
    const C = dk / Math.sqrt(2 * Math.PI);
    const w0 = 0.5 * hm * p.k0 * p.k0;
    for (let j = 0; j < Nk; j++) {
      const kj = p.k0 - Q + j * dk;
      const q = kj - p.k0;
      const phi = pref * Math.exp(-p.sigma * p.sigma * q * q);
      const w = (Nk > 1 && (j === 0 || j === Nk - 1)) ? 0.5 : 1;
      k[j] = kj;
      amp[j] = C * w * phi;
      omega[j] = linear ? w0 + vg * q : 0.5 * hm * kj * kj;
    }
    if (Nk === 1) amp[0] = Math.pow(2 * Math.PI * p.sigma * p.sigma, -0.25);

    // Position grid: fine enough for the shortest wavelength that carries weight.
    const kmax = Math.abs(p.k0) + 3 / p.sigma;
    const dxWanted = Math.min(2 * p.X / 500, 2 * Math.PI / kmax / 12);
    const Nx = Math.max(501, Math.min(2401, Math.round(2 * p.X / dxWanted) + 1));
    const x = new Float64Array(Nx);
    for (let i = 0; i < Nx; i++) x[i] = -p.X + 2 * p.X * i / (Nx - 1);

    return {
      p, hm, vg, tau, linear, widthAt, Q, Nk, dk, capped, k, amp, omega, x, Nx,
      ar: new Float64Array(Nk), ai: new Float64Array(Nk),
      period: Nk > 1 ? 2 * Math.PI / dk : Infinity,
    };
  }

  /* Fill re[], im[] with Psi(x_i, t). Uses a rotation recurrence for
     e^{i k_j x}, so each position costs one cos/sin pair instead of Nk. */
  function evaluate(M, t, re, im) {
    const { amp, omega, ar, ai, Nk, x, Nx, dk } = M;
    for (let j = 0; j < Nk; j++) {
      const ph = -omega[j] * t;
      ar[j] = amp[j] * Math.cos(ph);
      ai[j] = amp[j] * Math.sin(ph);
    }
    const k1 = M.k[0];
    for (let i = 0; i < Nx; i++) {
      const xi = x[i];
      let zr = Math.cos(k1 * xi), zi = Math.sin(k1 * xi);
      const rr = Math.cos(dk * xi), ri = Math.sin(dk * xi);
      let sr = 0, si = 0;
      for (let j = 0; j < Nk; j++) {
        const a = ar[j], b = ai[j];
        sr += a * zr - b * zi;
        si += a * zi + b * zr;
        const t1 = zr * rr - zi * ri;
        zi = zr * ri + zi * rr;
        zr = t1;
      }
      re[i] = sr; im[i] = si;
    }
  }

  /* Probability inside the window, by the trapezoidal rule. */
  function windowProbability(M, re, im) {
    const dx = M.x[1] - M.x[0];
    let s = 0;
    for (let i = 0; i < M.Nx; i++) {
      const d = re[i] * re[i] + im[i] * im[i];
      s += (i === 0 || i === M.Nx - 1) ? 0.5 * d : d;
    }
    return s * dx;
  }

  /* |Phi(k)|^2 for the momentum plot. */
  function phiSquared(p, kk) {
    const q = kk - p.k0;
    return Math.sqrt(2 / Math.PI) * p.sigma * Math.exp(-2 * p.sigma * p.sigma * q * q);
  }

  const api = { HBAR_OVER_M0, WAVE_COUNTS, buildModel, evaluate, windowProbability, phiSquared };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WavePacket = api;
})(this);
