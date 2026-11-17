/* Graphene electrostatics: carriers in the Dirac cones, and a gate that has to fill them.
   Energies in eV, lengths in nm, densities per nm^2 (1 nm^-2 = 1e14 cm^-2), capacitances in F/m^2.
     D(E) = c|E|,  c = 2 / (pi hbar^2 vF^2)                       (spin and valley included, g = 4)
     n = c (kT)^2 F1(mu/kT),  p = c (kT)^2 F1(-mu/kT),   F1(x) = int_0^inf u du / (1 + e^(u-x)) = -Li2(-e^x)
     dn/dmu - dp/dmu = c kT ln(2 + 2 cosh(mu/kT))            (the video's quantum capacitance / e^2)
     e (n - p) = C_ox (V - E_F/e)                              (the gate equation, solved for E_F) */
(function () {
  'use strict';
  const E = 1.602176634e-19, HBAR = 6.582119569509067e-16, KB = 8.617333262145e-5, EPS0 = 8.8541878128e-12;   // C, eV s, eV/K, F/m
  const ATOMS = 4 / (3 * Math.sqrt(3) * 0.142 * 0.142);   // carbon atoms per nm^2 (38.2)
  const VF = 1e6;                                         // m/s, as in the video
  const hv = vF => HBAR * vF * 1e9;                       // hbar vF in eV nm (0.658 for 1e6 m/s)
  const cdos = vF => 2 / (Math.PI * hv(vF) ** 2);         // states per eV per nm^2, per eV of |E|
  const kT = T => KB * T;

  // dilogarithm Li2(x) for real x <= 0 (all we need, since the argument is -e^x)
  function Li2(x) {
    if (x === 0) return 0;
    if (x < -1) { const l = Math.log(-x); return -Math.PI * Math.PI / 6 - 0.5 * l * l - Li2(1 / x); }
    // Landen: Li2(x) = -Li2(x / (x - 1)) - (1/2) ln^2(1 - x), with x/(x-1) in [0, 1/2]
    const y = x / (x - 1), l = Math.log(1 - x);
    let s = 0, yk = y;
    for (let k = 1; k < 80; k++) { s += yk / (k * k); yk *= y; if (yk < 1e-18) break; }
    return -s - 0.5 * l * l;
  }
  // complete Fermi-Dirac integral of order 1; for large x use F1(x) + F1(-x) = pi^2/6 + x^2/2
  function F1(x) { return x > 0 ? Math.PI * Math.PI / 6 + x * x / 2 - F1(-x) : -Li2(-Math.exp(x)); }
  const ln1pexp = x => (x > 30 ? x : Math.log1p(Math.exp(x)));

  // carrier densities per nm^2; mu (= E_F) in eV, T in K
  function n(mu, T, vF = VF) { const c = cdos(vF); if (T <= 0) return mu > 0 ? c * mu * mu / 2 : 0; const t = kT(T); return c * t * t * F1(mu / t); }
  function p(mu, T, vF = VF) { return n(-mu, T, vF); }
  const net = (mu, T, vF) => n(mu, T, vF) - p(mu, T, vF);
  // d(n - p)/dmu, states per eV per nm^2: c|mu| at T = 0, c kT ln(2 + 2cosh(mu/kT)) otherwise
  function dnet(mu, T, vF = VF) {
    const c = cdos(vF);
    if (T <= 0) return c * Math.abs(mu);
    const t = kT(T), x = mu / t;
    return c * t * (ln1pexp(x) + ln1pexp(-x));
  }
  // capacitances in F/m^2
  const Cq = (mu, T, vF) => E * dnet(mu, T, vF) * 1e18;                    // e^2 D: per eV per nm^2 -> F/m^2
  const Cox = (dnm, er) => EPS0 * er / (dnm * 1e-9);
  const series = (a, b) => (a > 0 && b > 0 ? a * b / (a + b) : 0);

  /* the gate: e (n - p) = C_ox (V - E_F / e). Returns E_F in eV (bisection; the left side rises with E_F, the right falls) */
  function solve(V, T, C, vF = VF) {
    const g = mu => E * net(mu, T, vF) * 1e18 - C * (V - mu);
    let a = -Math.abs(V) - 1, b = Math.abs(V) + 1;
    for (let it = 0; it < 80; it++) { const m = (a + b) / 2; if (g(m) > 0) b = m; else a = m; }
    return (a + b) / 2;
  }

  // counting: k points (2 pi / L)(mx, my) inside the Fermi circle |k| < kF (strictly), for a sample L x L nm
  function count(L, kF) {
    const s = 2 * Math.PI / L, M = Math.floor(kF / s);
    let N = 0;
    for (let mx = -M; mx <= M; mx++) for (let my = -M; my <= M; my++) if (s * s * (mx * mx + my * my) < kF * kF) N++;
    return N;
  }
  const kF = (Ef, vF = VF) => Math.abs(Ef) / hv(vF);

  window.GE = { E, HBAR, KB, EPS0, ATOMS, VF, hv, cdos, kT, Li2, F1, n, p, net, dnet, Cq, Cox, series, solve, count, kF };
})();
