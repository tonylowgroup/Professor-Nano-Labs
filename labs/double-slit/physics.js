/* The double slit: the physics, with no DOM access.
   Units: hbar = m = 1, lengths in grid steps. The wavelength is LAMBDA = 8 steps, so k0 = 2 pi / 8 and the packet moves
   at k0 steps per unit time. The lab quotes lengths in wavelengths.
   1. A wave packet in two dimensions, evolved with the split-step Fourier method on a 256 x 256 grid:
      psi -> e^{-iV dt/2} F^-1 e^{-ik^2 dt/2} F e^{-iV dt/2} psi, with absorbing edges so nothing wraps round.
      A thin wall with one or two slits stands across its path; a column further on is the screen.
   2. The screen pattern predicted from Huygens' wavelets leaving each slit, averaged over the packet's spread of k.
   3. Detections drawn at random from that pattern; and the pattern when the path is marked.                       */
(function () {
  'use strict';
  const N = 256, LAMBDA = 8, K0 = 2 * Math.PI / LAMBDA, TAU = 2 * Math.PI;
  // the layout, in grid steps (x across, y up; y = 0 is the middle row)
  // V0 * dt must stay well below pi: the wall acts through the phase e^{-iV dt}, and a phase past 2 pi would turn it into a dip.
  // V0 = 2.5 is 8 times the packet's energy (k0^2/2 = 0.31), and the 4-step wall lets through less than 1e-7.
  const G = { x0: 60, sx: 12, sy: 28, wall: 104, thick: 4, screen: 216, edge: 24, V0: 2.5, dt: 0.5, tEnd: 330 };

  // ---------- a radix-2 complex FFT, in place on separate real and imaginary arrays ----------
  function makeFFT(n) {
    const bits = Math.log2(n), rev = new Uint32Array(n), cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(TAU * i / n); sin[i] = Math.sin(TAU * i / n); }
    return function fft(re, im, inverse) {
      for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      const sg = inverse ? 1 : -1;
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let start = 0; start < n; start += size) {
          for (let k = 0, t = 0; k < half; k++, t += step) {
            const a = start + k, b = a + half, wr = cos[t], wi = sg * sin[t];
            const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
            re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          }
        }
      }
      if (inverse) { const s = 1 / n; for (let i = 0; i < n; i++) { re[i] *= s; im[i] *= s; } }
    };
  }
  const fft1 = makeFFT(N);
  const rowR = new Float64Array(N), rowI = new Float64Array(N);
  // 2D transform of an N x N field stored row by row (index j*N + i, i across)
  function fft2(re, im, inverse) {
    for (let j = 0; j < N; j++) {
      const o = j * N;
      for (let i = 0; i < N; i++) { rowR[i] = re[o + i]; rowI[i] = im[o + i]; }
      fft1(rowR, rowI, inverse);
      for (let i = 0; i < N; i++) { re[o + i] = rowR[i]; im[o + i] = rowI[i]; }
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) { rowR[j] = re[j * N + i]; rowI[j] = im[j * N + i]; }
      fft1(rowR, rowI, inverse);
      for (let j = 0; j < N; j++) { re[j * N + i] = rowR[j]; im[j * N + i] = rowI[j]; }
    }
  }

  // ---------- the geometry of the wall: which slits are open, where ----------
  // d: centre-to-centre spacing, a: width (both in grid steps); open: 'both' | 'top' | 'bottom'
  function slits(d, a, open) {
    const out = [];
    if (open !== 'bottom') out.push({ y: d / 2, a });
    if (open !== 'top') out.push({ y: -d / 2, a });
    return out;
  }
  const rowY = j => j - N / 2;                              // y of row j

  // ---------- 1. the simulation ----------
  class Sim {
    constructor(d, a, open) {
      this.d = d; this.a = a; this.open = open;
      const n2 = N * N, dt = G.dt;
      this.re = new Float64Array(n2); this.im = new Float64Array(n2);
      // potential phase for half a step, the absorbing mask, and the kinetic phase for a full step
      this.vr = new Float64Array(n2); this.vi = new Float64Array(n2); this.mask = new Float32Array(n2); this.wallMask = new Uint8Array(n2);
      const S = slits(d, a, open);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const o = j * N + i, y = rowY(j);
        const inWall = i >= G.wall && i < G.wall + G.thick && !S.some(s => Math.abs(y - s.y) < s.a / 2);
        const V = inWall ? G.V0 : 0;
        this.wallMask[o] = inWall ? 1 : 0;
        this.vr[o] = Math.cos(-V * dt / 2); this.vi[o] = Math.sin(-V * dt / 2);
        // a smooth absorbing border: the mask falls from 1 to about 0.94 per step at the very edge
        const e = Math.min(i, N - 1 - i, j, N - 1 - j), u = e < G.edge ? (G.edge - e) / G.edge : 0;
        this.mask[o] = Math.exp(-0.06 * u * u);
      }
      this.kr = new Float64Array(n2); this.ki = new Float64Array(n2);
      const kk = i => TAU * (i < N / 2 ? i : i - N) / N;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const ph = -0.5 * (kk(i) ** 2 + kk(j) ** 2) * dt, o = j * N + i; this.kr[o] = Math.cos(ph); this.ki[o] = Math.sin(ph); }
      // the starting packet: Gaussian, moving right at k0, wide enough in y to light up both slits
      let nrm = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = i - G.x0, y = rowY(j), env = Math.exp(-x * x / (4 * G.sx * G.sx) - y * y / (4 * G.sy * G.sy)), o = j * N + i;
        this.re[o] = env * Math.cos(K0 * x); this.im[o] = env * Math.sin(K0 * x); nrm += env * env;
      }
      const k = 1 / Math.sqrt(nrm);
      for (let o = 0; o < n2; o++) { this.re[o] *= k; this.im[o] *= k; }
      this.t = 0; this.steps = 0;
      this.screen = new Float64Array(N);                     // time-integrated |psi|^2 along the screen column
      this.history = [];                                     // probability before the wall and beyond it, over time
      this.lostLeft = 0; this.lostRight = 0;                 // what the absorbing edges have taken, before and beyond the wall
    }
    _phase(ar, ai) { const re = this.re, im = this.im; for (let o = 0; o < re.length; o++) { const r = re[o], q = im[o]; re[o] = r * ar[o] - q * ai[o]; im[o] = r * ai[o] + q * ar[o]; } }
    step() {
      this._phase(this.vr, this.vi);
      fft2(this.re, this.im, false);
      this._phase(this.kr, this.ki);
      fft2(this.re, this.im, true);
      this._phase(this.vr, this.vi);
      const re = this.re, im = this.im, m = this.mask;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const o = j * N + i, mm = m[o];
        if (mm < 1) { const p = (re[o] * re[o] + im[o] * im[o]) * (1 - mm * mm); if (i < G.wall) this.lostLeft += p; else this.lostRight += p; }
        re[o] *= mm; im[o] *= mm;
      }
      for (let j = 0; j < N; j++) { const o = j * N + G.screen; this.screen[j] += (re[o] * re[o] + im[o] * im[o]) * G.dt; }
      this.t += G.dt; this.steps++;
      if (this.steps % 4 === 0) {
        let left = 0, right = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const o = j * N + i, p = re[o] * re[o] + im[o] * im[o]; if (i < G.wall) left += p; else right += p; }
        // through the slits so far: what is beyond the wall now, plus what the edges beyond it have absorbed
        this.history.push({ t: this.t, left, right, through: right + this.lostRight, back: left + this.lostLeft });
      }
    }
    density(out) {
      const re = this.re, im = this.im;
      out = out || new Float32Array(re.length);
      for (let o = 0; o < re.length; o++) out[o] = re[o] * re[o] + im[o] * im[o];
      return out;
    }
  }
  // long enough for the waves that leave the slits at wide angles, on the longest paths, to cross the screen too
  const STEPS = Math.round(G.tEnd / G.dt);

  // ---------- 2. Huygens' wavelets from each slit ----------
  // The amplitude at the screen from a slit, sum over its width of A(y') e^{ikr}/sqrt(r), with the obliquity (1 + cos)/2
  // and the incoming packet's amplitude A(y') = exp(-y'^2 / 4 sy^2). The result is averaged over the packet's spread of
  // wavenumbers (sigma_k = 1 / 2 sx), as the simulation's screen adds up all of them.
  const GH = [[-2.0201828704560856, 0.019953242059045913], [-0.9585724646138185, 0.39361932315224116], [0, 0.9453087204829419], [0.9585724646138185, 0.39361932315224116], [2.0201828704560856, 0.019953242059045913]];
  function slitAmp(s, y, k, L) {
    let re = 0, im = 0;
    const M = Math.max(12, Math.ceil(s.a * 3));
    for (let q = 0; q < M; q++) {
      const yp = s.y - s.a / 2 + s.a * (q + 0.5) / M, dy = y - yp, r = Math.sqrt(L * L + dy * dy);
      const w = Math.exp(-yp * yp / (4 * G.sy * G.sy)) * 0.5 * (1 + L / r) / Math.sqrt(r) * (s.a / M);
      re += w * Math.cos(k * r); im += w * Math.sin(k * r);
    }
    return [re, im];
  }
  // the pattern on a screen L steps beyond the wall, at the rows ys: total, and each slit alone, plus their interference
  function huygens(d, a, open, ys, L) {
    L = L || (G.screen - G.wall - G.thick);
    const S = slits(d, a, open), sk = 1 / (2 * G.sx);
    const I = new Float64Array(ys.length), I1 = new Float64Array(ys.length), I2 = new Float64Array(ys.length), X = new Float64Array(ys.length);
    let wsum = 0;
    GH.forEach(([z, w]) => {
      const k = K0 + Math.SQRT2 * sk * z;
      wsum += w;
      ys.forEach((y, i) => {
        const A = S.map(s => slitAmp(s, y, k, L));
        const p1 = A[0] || [0, 0], p2 = A[1] || [0, 0];
        const a1 = p1[0] * p1[0] + p1[1] * p1[1], a2 = p2[0] * p2[0] + p2[1] * p2[1], x = 2 * (p1[0] * p2[0] + p1[1] * p2[1]);
        I1[i] += w * a1; I2[i] += w * a2; X[i] += w * x; I[i] += w * (a1 + a2 + x);
      });
    });
    for (let i = 0; i < ys.length; i++) { I[i] /= wsum; I1[i] /= wsum; I2[i] /= wsum; X[i] /= wsum; }
    return { I, I1, I2, X };
  }
  // with the path marked by a detector state of distinguishability D, the cross term is multiplied by V = sqrt(1 - D^2)
  const marked = (H, D) => Float64Array.from(H.I1, (v, i) => v + H.I2[i] + Math.sqrt(Math.max(0, 1 - D * D)) * H.X[i]);
  // the far-field (Fraunhofer) pattern for ideal slits, at angle theta: cos^2(pi d sin(theta) / lambda) sinc^2(pi a sin(theta) / lambda)
  function fraunhofer(d, a, sinT) { const b = Math.PI * a * sinT / LAMBDA, s = Math.abs(b) < 1e-12 ? 1 : Math.sin(b) / b; return Math.cos(Math.PI * d * sinT / LAMBDA) ** 2 * s * s; }
  // the contrast of the fringes at the centre of the screen: the interference term against the two slits' own light,
  // X / (I1 + I2) at y = 0, which is (Imax - Imin) / (Imax + Imin) for the central fringe. It equals sqrt(1 - D^2) when
  // the path is marked, because there the two paths have equal length for every wavelength in the packet.
  function contrast(ys, H, D) {
    let c = 0; ys.forEach((y, i) => { if (Math.abs(y) < Math.abs(ys[c])) c = i; });
    return Math.sqrt(Math.max(0, 1 - D * D)) * H.X[c] / (H.I1[c] + H.I2[c]);
  }

  // ---------- 3. detections ----------
  // a cumulative table for drawing rows at random in proportion to the pattern
  function sampler(ys, I) {
    const cdf = new Float64Array(I.length); let s = 0;
    for (let i = 0; i < I.length; i++) { s += Math.max(0, I[i]); cdf[i] = s; }
    for (let i = 0; i < I.length; i++) cdf[i] /= s;
    const dy = ys.length > 1 ? ys[1] - ys[0] : 1;
    return u => { let lo = 0, hi = cdf.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < u) lo = m + 1; else hi = m; } const prev = lo ? cdf[lo - 1] : 0, f = (u - prev) / Math.max(cdf[lo] - prev, 1e-300); return ys[lo] - dy / 2 + f * dy; };
  }
  // a small, seedable random number generator, so that a run of detections can be repeated
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  window.DS = { N, LAMBDA, K0, G, STEPS, makeFFT, fft2, slits, rowY, Sim, huygens, marked, fraunhofer, contrast, sampler, rng };
})();
