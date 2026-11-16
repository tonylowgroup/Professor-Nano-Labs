/* From Atoms to a Band: physics of an open, nearest-neighbour chain.
   Ported from the companion notebook's own browser lab, so both use the same
   formulas. Energies in eV, lengths in angstrom, one spin channel. */
(function (root) {
  'use strict';

  const DEFAULTS = { tRef: -0.40, aRef: 5.0 };   // reference hopping at the reference spacing

  /* Exact levels of the open tridiagonal chain, sorted ascending:
     E_n = eps + 2 t cos[n pi / (N + 1)], n = 1..N. */
  function levels(N, eps, t) {
    const out = new Float64Array(N);
    for (let n = 1; n <= N; n++) out[n - 1] = eps + 2 * t * Math.cos(n * Math.PI / (N + 1));
    return out.sort();
  }

  /* Normalized approximate hopping: t(a) = t_ref (a/a_ref) exp[-kappa (a - a_ref)]. */
  function hopping(a, kappa, tRef = DEFAULTS.tRef, aRef = DEFAULTS.aRef) {
    return tRef * (a / aRef) * Math.exp(-kappa * (a - aRef));
  }

  /* Omega_N(E): number of levels at or below E (levels sorted ascending). */
  function countAt(E, es) {
    let lo = 0, hi = es.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (es[mid] <= E) lo = mid + 1; else hi = mid; }
    return lo;
  }

  /* Gaussian-broadened DOS shape in reduced energy u = (E - eps)/|t|.
     rs are reduced levels; r = sigma/|t|. The result integrates to 1 over u,
     so D(E) = shape/(a|t|) per length and a D(E) = shape/|t| per site. */
  function densityShape(us, rs, r) {
    const denom = rs.length * r * Math.sqrt(2 * Math.PI);
    const out = new Float64Array(us.length);
    for (let i = 0; i < us.length; i++) {
      let s = 0;
      for (let j = 0; j < rs.length; j++) {
        const z = (us[i] - rs[j]) / r;
        if (z < 9 && z > -9) s += Math.exp(-0.5 * z * z);
      }
      out[i] = s / denom;
    }
    return out;
  }

  /* Reduced continuum levels for the broadened bulk reference (midpoint rule in q). */
  function continuumLevels(nq) {
    const out = new Float64Array(nq);
    for (let i = 0; i < nq; i++) out[i] = -2 * Math.cos((i + 0.5) * Math.PI / nq);
    return out;
  }

  /* Large-N cumulative fraction of states at or below E. */
  function bulkFraction(E, eps, mag) {
    if (mag === 0) return E >= eps ? 1 : 0;
    return Math.acos(Math.max(-1, Math.min(1, (eps - E) / (2 * mag)))) / Math.PI;
  }

  function linspace(a, b, n) {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = a + (b - a) * i / (n - 1);
    return out;
  }

  function trapezoid(y, x) {
    let s = 0;
    for (let i = 1; i < x.length; i++) s += (y[i] + y[i - 1]) * (x[i] - x[i - 1]) / 2;
    return s;
  }

  const api = { DEFAULTS, levels, hopping, countAt, densityShape, continuumLevels, bulkFraction, linspace, trapezoid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Lattice = api;
})(this);
