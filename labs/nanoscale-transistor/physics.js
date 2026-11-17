/* Nanoscale transistor: the Landauer current, with no DOM access.
   Notation follows the video. The source is grounded (V_S = 0) and its band edge is E_c = 0.
   Energies in eV, voltages in V, temperatures in K, lengths in m, currents per width in A/m (= uA/um).

   I_D = I0 sqrt(kT) Int dE_x T(E_x) { F_-1/2((E_F - E_x)/kT) - F_-1/2((E_F - eV_D - E_x)/kT) },
   I0  = (g_s e / h) (W / sqrt(2 pi)) (sqrt(m_y) / hbar),
   T(E_x) = exp(-2 L sqrt(2 m (U0 - E_x)) / hbar) below the barrier top U0, and 1 above it.
   Above the barrier the integral is exact: Int_U0^inf F_-1/2((E_F - E)/kT) dE = kT F_1/2((E_F - U0)/kT).  */
(function () {
  'use strict';
  const E = 1.602176634e-19, H = 6.62607015e-34, HBAR = H / (2 * Math.PI), KB = 1.380649e-23, ME = 9.1093837015e-31;
  const DEFAULTS = { EF: 0.2, L: 50e-9, mass: 1.25, gs: 2 };   // mass in m_e: reproduces the video's curves
  const kTeV = T => KB * T / E;

  // ---------- Fermi-Dirac integrals F_-1/2 and F_1/2 (normalised by Gamma(j+1)) ----------
  // With y = t^2: F_-1/2(x) = (2/sqrt pi) Int_0^inf dt / (1 + e^(t^2 - x)),
  //               F_1/2(x)  = (4/sqrt pi) Int_0^inf t^2 dt / (1 + e^(t^2 - x)).
  // Tabulated as log F on x in [-40, 80] (composite 8-point Gauss-Legendre), exact tails outside.
  const GL8x = [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498, 0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363];
  const GL8w = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620, 0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];
  const X0 = -40, X1 = 80, DX = 0.02, NX = Math.round((X1 - X0) / DX) + 1;
  const SQPI = Math.sqrt(Math.PI);
  function integrate(x) {
    const tmax = Math.sqrt(Math.max(x, 0) + 42), n = Math.ceil(tmax / 0.1), w = tmax / n;
    let a = 0, b = 0;
    for (let k = 0; k < n; k++) {
      const c = (k + 0.5) * w;
      for (let i = 0; i < 8; i++) {
        const t = c + 0.5 * w * GL8x[i], f = 1 / (1 + Math.exp(t * t - x)), ww = 0.5 * w * GL8w[i];
        a += ww * f; b += ww * t * t * f;
      }
    }
    return [2 / SQPI * a, 4 / SQPI * b];
  }
  let LOGM = null, LOGP = null;
  function tables() {
    if (LOGM) return;
    LOGM = new Float64Array(NX); LOGP = new Float64Array(NX);
    for (let i = 0; i < NX; i++) { const [m, p] = integrate(X0 + i * DX); LOGM[i] = Math.log(m); LOGP[i] = Math.log(p); }
  }
  function interp(tab, x) {
    const s = (x - X0) / DX, i = Math.min(NX - 2, Math.max(0, Math.floor(s))), u = s - i;
    return Math.exp(tab[i] + (tab[i + 1] - tab[i]) * u);
  }
  function Fm(x) {          // F_-1/2
    if (x < X0) return Math.exp(x);
    if (x > X1) return 2 * Math.sqrt(x / Math.PI) * (1 - Math.PI * Math.PI / (24 * x * x));
    tables(); return interp(LOGM, x);
  }
  function Fp(x) {          // F_1/2
    if (x < X0) return Math.exp(x);
    if (x > X1) return 4 / (3 * SQPI) * Math.pow(x, 1.5) * (1 + Math.PI * Math.PI / (8 * x * x));
    tables(); return interp(LOGP, x);
  }

  // ---------- the device ----------
  function params(o) { return Object.assign({}, DEFAULTS, o || {}); }
  const I0 = p => p.gs * E / H / Math.sqrt(2 * Math.PI) * Math.sqrt(p.mass * ME) / HBAR;     // per metre of width
  const fermi = (Eev, mu, T) => 1 / (1 + Math.exp((Eev - mu) / kTeV(T)));
  // WKB transmission through a barrier of height U0 and length L
  function transmission(Ex, U0, p) {
    if (Ex >= U0) return 1;
    return Math.exp(-2 * p.L * Math.sqrt(2 * p.mass * ME * (U0 - Ex) * E) / HBAR);
  }
  // 32-point Gauss-Legendre on [0, 1], for the tunnelling part
  const GL32 = (function () {
    const n = 32, x = [], w = [];
    for (let i = 1; i <= n; i++) {
      let z = Math.cos(Math.PI * (i - 0.25) / (n + 0.5)), pp = 0;
      for (let it = 0; it < 100; it++) {
        let p1 = 1, p2 = 0;
        for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
        pp = n * (z * p1 - p2) / (z * z - 1);
        const z1 = z; z = z1 - p1 / pp;
        if (Math.abs(z - z1) < 1e-15) break;
      }
      x.push((1 - z) / 2); w.push(1 / ((1 - z * z) * pp * pp));
    }
    return { x, w };
  })();
  /* Source-to-drain and drain-to-source parts of I_D/W (A/m), each = I0 sqrt(kT) Int T(E) F_-1/2(...) dE.
     The tunnelling integral below the barrier uses E = U0 - a z^2, so that T = e^(-2z).            */
  function flows(U0, VD, T, o) {
    const p = params(o), kT = kTeV(T), pref = I0(p) * Math.sqrt(KB * T) * E;
    const muS = p.EF, muD = p.EF - VD;
    let tunS = 0, tunD = 0;
    if (U0 > 0) {
      const a = HBAR * HBAR / (2 * p.mass * ME * p.L * p.L) / E;           // eV
      const zmax = Math.min(Math.sqrt(U0 / a), 40);
      for (let seg = 0; seg < 4; seg++) {                                      // four panels on [0, zmax]
        const z0 = zmax * seg / 4, dz = zmax / 4;
        for (let i = 0; i < 32; i++) {
          const z = z0 + dz * GL32.x[i], Ex = U0 - a * z * z, wgt = dz * GL32.w[i] * 2 * a * z * Math.exp(-2 * z);
          tunS += wgt * Fm((muS - Ex) / kT); tunD += wgt * Fm((muD - Ex) / kT);
        }
      }
    }
    const top = Math.max(U0, 0);
    const overS = kT * Fp((muS - top) / kT), overD = kT * Fp((muD - top) / kT);
    return { S: pref * (overS + tunS), D: pref * (overD + tunD), tunnel: pref * (tunS - tunD), over: pref * (overS - overD) };
  }
  function current(U0, VD, T, o) { const f = flows(U0, VD, T, o); return f.S - f.D; }
  // Energy-resolved current dI/dE_x (A/m per eV) at E_x, and the transmission there
  function spectral(Ex, U0, VD, T, o) {
    const p = params(o), kT = kTeV(T), pref = I0(p) * Math.sqrt(KB * T) * E;
    if (Ex < 0) return 0;
    return pref * transmission(Ex, U0, p) * (Fm((p.EF - Ex) / kT) - Fm((p.EF - VD - Ex) / kT));
  }
  // Local subthreshold slope S = -dU0 / d log10(I_D), in mV per decade
  function slope(U0, VD, T, o) {
    const h = 1e-3, a = current(U0 - h, VD, T, o), b = current(U0 + h, VD, T, o);
    return 1000 * 2 * h / Math.log10(a / b);
  }
  const idealSlope = T => 1000 * Math.LN10 * kTeV(T);                       // mV/dec
  // Near equilibrium, no barrier (U0 = 0): G/W = I0 sqrt(kT) e F_-1/2(E_F/kT), exact; and its T -> 0 limit
  function conductance(T, o) { const p = params(o); return I0(p) * Math.sqrt(KB * T) * E * Fm(p.EF / kTeV(T)); }
  function conductance0(o) { const p = params(o); return p.EF > 0 ? p.gs * E * E / H / Math.PI * Math.sqrt(2 * p.mass * ME * p.EF * E) / HBAR : 0; }
  const modesPerMetre = o => { const p = params(o); return p.EF > 0 ? Math.sqrt(2 * p.mass * ME * p.EF * E) / HBAR / Math.PI : 0; };
  const G_QUANTUM = 2 * E * E / H;

  window.FET = { E, H, HBAR, KB, ME, DEFAULTS, kTeV, Fm, Fp, params, I0, fermi, transmission, flows, current, spectral, slope, idealSlope, conductance, conductance0, modesPerMetre, G_QUANTUM, _integrate: integrate };
})();
