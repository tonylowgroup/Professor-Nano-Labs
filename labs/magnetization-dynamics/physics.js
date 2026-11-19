/* Magnetization dynamics: a single-domain magnet (a macrospin) obeying the Landau-Lifshitz-Gilbert equation.
   SI units: fields in A/m, energies in J/m^3, times in s.
     dm/dt = -gamma m x H_eff + alpha m x dm/dt                     (Gilbert form, as in the video)
           = -gamma/(1 + alpha^2) [ m x H_eff + alpha m x (m x H_eff) ]   (the same equation, solved for dm/dt)
     H_eff = H_ext + H_K m_z z,   H_K = 2 K_eff / (mu0 Ms)           (a field plus uniaxial anisotropy along z)
     E     = K_eff (1 - m_z^2) - mu0 Ms m . H_ext                     (energy density) */
(function () {
  'use strict';
  const MU0 = 1.25663706212e-6;              // T m / A
  const GAMMA_E = 1.76085963023e11;          // electron gyromagnetic ratio, rad / (s T)
  const GAMMA = MU0 * GAMMA_E;               // 2.213e5 m / (A s): the gamma that multiplies H in A/m
  const MU0MS = 1.6;                         // mu0 Ms in tesla (a CoFeB-like value; the slides do not give one)
  const MS = MU0MS / MU0;                    // 1.27e6 A/m
  const HK = K => 2 * K / (MU0 * MS);        // anisotropy field, A/m (5e5 A/m for K = 4e5 J/m^3)
  const fGHz = H => GAMMA * H / (2 * Math.PI) / 1e9;   // Larmor frequency (28.0 GHz per tesla of mu0 H)
  const DEG = Math.PI / 180;

  const fromAngles = (th, ph = 0) => [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
  const energy = (m, H, K) => K * (1 - m[2] * m[2]) - MU0 * MS * (m[0] * H[0] + m[1] * H[1] + m[2] * H[2]);
  const Etheta = (th, Hz, K) => K * Math.sin(th) ** 2 - MU0 * MS * Hz * Math.cos(th);   // field along z

  /* dm/dt (1/s) for a total effective field H (A/m), split into its two parts:
     prec = -gamma' m x H (around H) and damp = -alpha gamma' m x (m x H) (toward H), gamma' = gamma / (1 + alpha^2) */
  function parts(m, H, alpha) {
    const g = GAMMA / (1 + alpha * alpha);
    const c = [m[1] * H[2] - m[2] * H[1], m[2] * H[0] - m[0] * H[2], m[0] * H[1] - m[1] * H[0]];
    const d = [m[1] * c[2] - m[2] * c[1], m[2] * c[0] - m[0] * c[2], m[0] * c[1] - m[1] * c[0]];
    return { prec: c.map(v => -g * v), damp: d.map(v => -g * alpha * v) };
  }
  const heff = (m, Hext, K) => [Hext[0], Hext[1], Hext[2] + HK(K) * m[2]];

  /* Fourth-order Runge-Kutta for one or more independent magnets sharing a time grid.
     o = { m0: [[mx,my,mz], ...], fields: [t => [Hx,Hy,Hz], ...], K, alpha, T, Hmax, nOut, breaks }
     breaks lists the times where a field jumps (a step is split there, so the jump is not smeared).
     Returns { t, m: [{ x, y, z } per magnet] } sampled at nOut + 1 evenly spaced times. */
  function simulate(o) {
    const hk = HK(o.K), a = o.alpha, g = GAMMA / (1 + a * a), nOut = o.nOut || 2000;
    const dtMax = 0.04 / (GAMMA * Math.max(o.Hmax + hk, 1e3));     // under 0.04 rad of precession per step
    const per = Math.max(1, Math.ceil(o.T / nOut / dtMax)), dt = o.T / nOut / per;
    const t = new Float64Array(nOut + 1);
    for (let i = 0; i <= nOut; i++) t[i] = o.T * i / nOut;
    const out = o.m0.map((m0, j) => {
      const X = new Float64Array(nOut + 1), Y = new Float64Array(nOut + 1), Z = new Float64Array(nOut + 1);
      const f = o.fields[j];
      let x = m0[0], y = m0[1], z = m0[2];
      const nm = Math.hypot(x, y, z); x /= nm; y /= nm; z /= nm;
      const k = new Float64Array(12);
      const der = (x, y, z, H, off) => {
        const hx = H[0], hy = H[1], hz = H[2] + hk * z;
        const cx = y * hz - z * hy, cy = z * hx - x * hz, cz = x * hy - y * hx;
        k[off] = -g * (cx + a * (y * cz - z * cy));
        k[off + 1] = -g * (cy + a * (z * cx - x * cz));
        k[off + 2] = -g * (cz + a * (x * cy - y * cx));
      };
      // one RK4 step of length h from t0; the field at its end is read at tEnd (just before a jump, if it ends on one)
      const rk4 = (h, t0, tEnd) => {
        const H0 = f(t0), H1 = f(t0 + h / 2), H2 = f(tEnd);
        der(x, y, z, H0, 0);
        der(x + h / 2 * k[0], y + h / 2 * k[1], z + h / 2 * k[2], H1, 3);
        der(x + h / 2 * k[3], y + h / 2 * k[4], z + h / 2 * k[5], H1, 6);
        const b0 = k[0] + 2 * k[3] + 2 * k[6], b1 = k[1] + 2 * k[4] + 2 * k[7], b2 = k[2] + 2 * k[5] + 2 * k[8];
        der(x + h * k[6], y + h * k[7], z + h * k[8], H2, 9);
        x += h / 6 * (b0 + k[9]); y += h / 6 * (b1 + k[10]); z += h / 6 * (b2 + k[11]);
        const r = Math.hypot(x, y, z); x /= r; y /= r; z /= r;          // keep |m| = 1
      };
      const breaks = (o.breaks || []).filter(b => b > 0 && b < o.T).sort((p, q) => p - q);
      let nb = 0;
      X[0] = x; Y[0] = y; Z[0] = z;
      let tt = 0;
      for (let i = 1; i <= nOut; i++) {
        for (let s = 0; s < per; s++) {
          const t1 = tt + dt;
          while (nb < breaks.length && breaks[nb] <= tt) nb++;
          if (nb < breaks.length && breaks[nb] <= t1) {
            // a field that jumps within this step, or exactly at its end: split the step there,
            // reading the field just before the jump at the end of the first part
            const b = breaks[nb], h = b - tt;
            if (h > 0) rk4(h, tt, b - 1e-6 * h);
            if (t1 > b) rk4(t1 - b, b, t1);
            nb++;
          } else rk4(dt, tt, t1);
          tt = t1;
        }
        tt = t[i];
        X[i] = x; Y[i] = y; Z[i] = z;
      }
      return { x: X, y: Y, z: Z };
    });
    return { t, m: out, dt };
  }

  // ---------- closed forms for a field along the easy axis (everything stays symmetric about z) ----------
  // relaxation in a field H along z (no anisotropy): tan(theta/2) = tan(theta0/2) exp(-t/tau)
  const tau = (H, alpha) => (1 + alpha * alpha) / (alpha * GAMMA * H);
  const mzRelax = (t, H, alpha, th0) => Math.tanh(t / tau(H, alpha) + Math.atanh(Math.cos(th0)));

  /* Time for m_z to go from u0 to u1 with a field H along z and anisotropy K:
       du/dt = alpha gamma' (H + H_K u)(1 - u^2)
     integrated in closed form by partial fractions. Infinity if it never gets there. */
  function tAxis(H, K, alpha, u0, u1) {
    if (u1 === u0) return 0;
    const a = H, b = HK(K), up = u1 > u0;
    if (!(alpha > 0)) return Infinity;
    const s0 = a + b * u0, s1 = a + b * u1;
    if (up ? !(s0 > 0 && s1 > 0) : !(s0 < 0 && s1 < 0)) return Infinity;   // the drive must point the same way all along
    if (Math.abs(u0) >= 1 || Math.abs(u1) >= 1) return Infinity;
    let F;
    if (b > 0 && Math.abs(a - b) <= 1e-9 * b) F = u => (0.25 * Math.log(1 + u) - 0.5 / (1 + u) - 0.25 * Math.log(1 - u)) / b;
    else if (b > 0 && Math.abs(a + b) <= 1e-9 * b) F = u => -(0.25 * Math.log(1 + u) + 0.5 / (1 - u) - 0.25 * Math.log(1 - u)) / b;
    else F = u => (b > 0 ? b / (b * b - a * a) * Math.log(Math.abs(a + b * u)) : 0) - Math.log(1 - u) / (2 * (a + b)) + Math.log(1 + u) / (2 * (a - b));
    return (1 + alpha * alpha) / (alpha * GAMMA) * (F(u1) - F(u0));
  }
  // m_z after a time t, starting from u0 (by bisection on tAxis)
  function uAfter(H, K, alpha, u0, t) {
    const a = H, b = HK(K), s = a + b * u0;
    if (!(alpha > 0) || s === 0 || t <= 0) return u0;
    let lo = u0, hi = s > 0 ? 1 - 1e-15 : -1 + 1e-15;      // the pole it is heading for
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (tAxis(H, K, alpha, u0, mid) < t) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // the barrier that holds a bit pointing down against a field H up the easy axis
  const barrier = (H, K) => { const h = H / HK(K); return h >= 1 ? 0 : K * (1 - h) * (1 - h); };
  // Stoner-Wohlfarth: the down state survives inside |hx|^(2/3) + |hz|^(2/3) < 1 (fields in units of H_K)
  const astroid = (hx, hz) => Math.pow(Math.abs(hx), 2 / 3) + Math.pow(Math.abs(hz), 2 / 3);
  const hsw = psi => Math.pow(Math.pow(Math.abs(Math.cos(psi)), 2 / 3) + Math.pow(Math.abs(Math.sin(psi)), 2 / 3), -1.5);

  window.LLG = { MU0, GAMMA_E, GAMMA, MU0MS, MS, DEG, HK, fGHz, fromAngles, energy, Etheta, parts, heff, simulate, tau, mzRelax, tAxis, uAfter, barrier, astroid, hsw };
})();
