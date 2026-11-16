/* Blackbody radiation: Planck's law, the Rayleigh-Jeans limit, and the
   approximate colour of the glow. SI units inside; wavelengths in metres.
   Constants are the exact 2019 SI values. */
(function (root) {
  'use strict';

  const h = 6.62607015e-34, c = 299792458, kB = 1.380649e-23;
  const SIGMA = 2 * Math.PI ** 5 * kB ** 4 / (15 * h ** 3 * c ** 2);   // 5.670374e-8 W m^-2 K^-4
  const WIEN_B = 2.897771955e-3;                                         // m K
  const HC_K = h * c / kB;                                               // m K

  /* Spectral radiance B_lambda(T), W m^-2 sr^-1 per metre of wavelength.
     Math.expm1(x) is already e^x - 1, accurate for small x. */
  function planck(lam, T) {
    return 2 * h * c * c / lam ** 5 / Math.expm1(HC_K / (lam * T));
  }
  /* Rayleigh-Jeans: every mode carries k_B T. */
  function rayleighJeans(lam, T) {
    return 2 * c * kB * T / lam ** 4;
  }
  /* Average energy per mode in units of k_B T: x / (e^x - 1), x = hc / (lambda k_B T). */
  function energyPerMode(lam, T) {
    const x = HC_K / (lam * T);
    return x < 1e-8 ? 1 : x / Math.expm1(x);
  }
  /* Energy density per unit wavelength: u_lambda = (4 pi / c) B_lambda. */
  const toEnergyDensity = B => 4 * Math.PI / c * B;

  const peakWavelength = T => WIEN_B / T;
  const totalRadiance = T => SIGMA * T ** 4 / Math.PI;       // integral of B over all wavelengths
  const exitance = T => SIGMA * T ** 4;                       // power per area, W m^-2

  /* Fraction of the total radiance between lam1 and lam2 (Simpson's rule). */
  function bandFraction(T, lam1, lam2, n = 2000) {
    const dx = (lam2 - lam1) / n;
    let s = planck(lam1, T) + planck(lam2, T);
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * planck(lam1 + i * dx, T);
    return (s * dx / 3) / totalRadiance(T);
  }

  /* CIE 1931 colour-matching functions: the multi-lobe Gaussian fit of
     Wyman, Sloan and Shirley, JCGT 2(2), 2013. lam in nm. */
  function g(x, mu, s1, s2) { const t = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * t * t); }
  function cmf(nm) {
    return [
      1.056 * g(nm, 599.8, 37.9, 31.0) + 0.362 * g(nm, 442.0, 16.0, 26.7) - 0.065 * g(nm, 501.1, 20.4, 26.2),
      0.821 * g(nm, 568.8, 46.9, 40.5) + 0.286 * g(nm, 530.9, 16.3, 31.1),
      1.217 * g(nm, 437.0, 11.8, 36.0) + 0.681 * g(nm, 459.0, 26.0, 13.8),
    ];
  }
  function xyzToRgb([X, Y, Z]) {
    // XYZ to linear sRGB (D65), then keep the hue: lift negatives, scale the brightest channel to 1.
    let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
    let gg = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
    let b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
    const lo = Math.min(r, gg, b, 0);
    r -= lo; gg -= lo; b -= lo;
    const hi = Math.max(r, gg, b) || 1;
    const enc = v => { v /= hi; return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); };
    return [enc(r), enc(gg), enc(b)];
  }
  /* Approximate colour of a blackbody at temperature T (hue only, brightness normalized). */
  function glowColour(T) {
    const xyz = [0, 0, 0];
    for (let nm = 380; nm <= 780; nm += 2) {
      const w = planck(nm * 1e-9, T), m = cmf(nm);
      xyz[0] += w * m[0]; xyz[1] += w * m[1]; xyz[2] += w * m[2];
    }
    const s = xyz[1] || 1;
    return xyzToRgb(xyz.map(v => v / s));
  }
  /* Colour of a single wavelength, for drawing the visible band: the common
     piecewise approximation (after Dan Bruton), with fading at both ends. */
  function spectralColour(nm) {
    let r = 0, gg = 0, b = 0;
    if (nm < 440) { r = (440 - nm) / 60; b = 1; }
    else if (nm < 490) { gg = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { gg = 1; b = (510 - nm) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; gg = 1; }
    else if (nm < 645) { r = 1; gg = (645 - nm) / 65; }
    else { r = 1; }
    const f = nm < 420 ? 0.3 + 0.7 * (nm - 380) / 40 : nm > 700 ? 0.3 + 0.7 * (780 - nm) / 80 : 1;
    return [r, gg, b].map(v => Math.round(255 * Math.pow(Math.max(0, v * f), 0.8)));
  }

  const api = { h, c, kB, SIGMA, WIEN_B, HC_K, planck, rayleighJeans, energyPerMode, toEnergyDensity,
    peakWavelength, totalRadiance, exitance, bandFraction, glowColour, spectralColour };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Blackbody = api;
})(this);
