/* Divergence and curl: the physics behind the lab.
   Lengths and fields are in arbitrary units. In tab 2, charges are point charges in 3D, with q/ε0 = 1,
   and wires are infinite straight wires along z, with μ0 I = 1; the picture is the plane z = 0. */
(function () {
  'use strict';
  const TAU = 2 * Math.PI;

  // ---------- Gauss–Legendre nodes on [-1, 1] ----------
  function gaussLegendre(n) {
    const x = [], w = [];
    for (let i = 1; i <= n; i++) {
      let z = Math.cos(Math.PI * (i - 0.25) / (n + 0.5)), pp = 1;
      for (let it = 0; it < 100; it++) {
        let p1 = 1, p2 = 0;
        for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
        pp = n * (z * p1 - p2) / (z * z - 1);
        const z1 = z; z = z1 - p1 / pp;
        if (Math.abs(z - z1) < 1e-15) break;
      }
      x.push(z); w.push(2 / ((1 - z * z) * pp * pp));
    }
    return { x, w };
  }
  const GL = gaussLegendre(24);

  // ---------- 1. The gallery: each field with its divergence and curl, worked out by hand ----------
  const gauss = (x, y) => Math.exp(-(x * x + y * y) / 2);
  const FIELDS = {
    source: { F: (x, y) => [x, y], div: () => 2, curl: () => 0 },
    vortex: { F: (x, y) => [-y, x], div: () => 0, curl: () => 2 },
    shear: { F: (x, y) => [y, 0], div: () => 0, curl: () => -1 },
    saddle: { F: (x, y) => [x, -y], div: () => 0, curl: () => 0 },
    river: { F: (x, y) => [1 - y * y / 4, 0], div: () => 0, curl: (x, y) => y / 2 },
    fading: { F: (x, y) => [1.5 * x * gauss(x, y), 1.5 * y * gauss(x, y)], div: (x, y) => 1.5 * (2 - x * x - y * y) * gauss(x, y), curl: () => 0 },
    // a line charge seen end-on, and a whirlpool: zero divergence and curl everywhere except at the centre
    charge: { F: (x, y) => { const r2 = x * x + y * y; return [x / r2, y / r2]; }, div: () => 0, curl: () => 0, point: 'div' },
    drain: { F: (x, y) => { const r2 = x * x + y * y; return [-y / r2, x / r2]; }, div: () => 0, curl: () => 0, point: 'curl' },
  };

  // the flux across a straight segment (normal to the right of the direction of travel, so outward on an
  // anticlockwise loop) and the line integral along it
  // a side that runs through the centre, or ends on it, sees the field only along itself there: it adds no angle,
  // so a box whose edge holds the centre gets half the total (a quarter at a corner), the symmetric value
  const angle = (x1, y1, x2, y2) => { const cr = x1 * y2 - y1 * x2, dt = x1 * x2 + y1 * y2; return Math.abs(cr) < 1e-12 && dt <= 1e-12 ? 0 : Math.atan2(cr, dt); };
  // the logarithmic parts cancel round any closed box; a side ending on the centre gets none
  const logr = (x1, y1, x2, y2) => { const a = Math.hypot(x1, y1), b = Math.hypot(x2, y2); return a < 1e-12 || b < 1e-12 ? 0 : Math.log(b / a); };
  function seg(fd, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    if (fd.point === 'div') return [angle(x1, y1, x2, y2), logr(x1, y1, x2, y2)];
    if (fd.point === 'curl') return [-logr(x1, y1, x2, y2), angle(x1, y1, x2, y2)];
    let flux = 0, circ = 0;
    for (let i = 0; i < GL.x.length; i++) {
      const s = (1 + GL.x[i]) / 2, [fx, fy] = fd.F(x1 + s * dx, y1 + s * dy);
      flux += GL.w[i] * (fx * dy - fy * dx) / 2;
      circ += GL.w[i] * (fx * dx + fy * dy) / 2;
    }
    return [flux, circ];
  }
  // a square box of half-side h: its four sides (bottom, right, top, left), anticlockwise
  function corners(cx, cy, h) { return [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]]; }
  function box(fd, cx, cy, h) {
    const c = corners(cx, cy, h), sides = [];
    for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; sides.push(seg(fd, a[0], a[1], b[0], b[1])); }
    const flux = sides.reduce((s, v) => s + v[0], 0), circ = sides.reduce((s, v) => s + v[1], 0), area = 4 * h * h;
    return { sides, flux, circ, area, div: flux / area, curl: circ / area };
  }
  // walk round the box from its bottom-left corner: the running totals of flux out and of F·dl
  function walk(fd, cx, cy, h, per) {
    const c = corners(cx, cy, h), s = [0], flux = [0], circ = [0];
    let f = 0, g = 0;
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4];
      for (let k = 0; k < per; k++) {
        const p = [a[0] + (b[0] - a[0]) * k / per, a[1] + (b[1] - a[1]) * k / per], q = [a[0] + (b[0] - a[0]) * (k + 1) / per, a[1] + (b[1] - a[1]) * (k + 1) / per];
        const v = seg(fd, p[0], p[1], q[0], q[1]); f += v[0]; g += v[1];
        s.push(2 * h * (i + (k + 1) / per)); flux.push(f); circ.push(g);
      }
    }
    return { s, flux, circ };
  }

  // ---------- 2. Gauss and Ampère: charges in 3D, wires along z ----------
  const SOURCES = {
    one: { kind: 'charge', items: [{ x: 0, y: 0, q: 1 }] },
    pair: { kind: 'charge', items: [{ x: -0.6, y: 0, q: 1 }, { x: 0.6, y: 0, q: -1 }] },
    wire: { kind: 'wire', items: [{ x: 0, y: 0, q: 1 }] },
    wires: { kind: 'wire', items: [{ x: -0.6, y: 0, q: 1 }, { x: 0.6, y: 0, q: -1 }] },
  };
  // the field in the plane z = 0: Coulomb's law for the charges, the field of a long wire for the wires
  function field2(src, x, y) {
    let fx = 0, fy = 0;
    for (const s of src.items) {
      const dx = x - s.x, dy = y - s.y, r2 = dx * dx + dy * dy;
      if (src.kind === 'charge') { const k = s.q / (2 * TAU * r2 * Math.sqrt(r2)); fx += k * dx; fy += k * dy; }
      else { const k = s.q / (TAU * r2); fx -= k * dy; fy += k * dx; }
    }
    return [fx, fy];
  }
  // the outward flux of one point charge through a sphere of radius R whose centre is a distance s away.
  // By symmetry about the line from the centre to the charge, the surface integral is one integral over u = cos θ:
  // Φ = (q/2) ∫ R² (R − s u) / (R² + s² − 2 R s u)^{3/2} du. Near u = 1 the integrand peaks sharply when s ≈ R,
  // so the integral is done in t = (1 − u)^{1/2}, on panels that halve in width towards t = 0, 24 points each.
  const PANELS = 34;
  function chargeFlux(q, s, R) {
    if (s < 1e-12) return q;
    // with u = 1 − t², written so that nothing cancels when s ≈ R: w = (R − s)² + 2Rst², R − su = (R − s) + st²
    const f = t => { const w = (R - s) * (R - s) + 2 * R * s * t * t; return w <= 0 ? 0 : 2 * t * R * R * ((R - s) + s * t * t) / Math.pow(w, 1.5); };
    let tot = 0;
    for (let k = 0; k < PANELS; k++) {
      const a = k === PANELS - 1 ? 0 : Math.SQRT2 * Math.pow(2, -(k + 1)), b = Math.SQRT2 * Math.pow(2, -k), m = (a + b) / 2, h = (b - a) / 2;
      for (let i = 0; i < GL.x.length; i++) tot += GL.w[i] * h * f(m + h * GL.x[i]);
    }
    return q / 2 * tot;
  }
  // the circulation of B round a circle: each straight piece of a fine polygon sees a wire at an angle,
  // and ∫B·dl along it is exactly μ0 I × angle / 2π, so the sum is exact for the polygon
  function wireCirc(I, wx, wy, cx, cy, R, M) {
    let tot = 0;
    for (let k = 0; k < M; k++) {
      const a = TAU * k / M, b = TAU * (k + 1) / M;
      tot += angle(cx + R * Math.cos(a) - wx, cy + R * Math.sin(a) - wy, cx + R * Math.cos(b) - wx, cy + R * Math.sin(b) - wy);
    }
    return I * tot / TAU;
  }
  function surface(src, cx, cy, R) {
    let total = 0, inside = 0, on = 0, onQ = [];
    for (const s of src.items) {
      const d = Math.hypot(s.x - cx, s.y - cy);
      // a charge or wire exactly on the surface: the field blows up there and the total is not defined;
      // taken symmetrically, half of it counts
      if (Math.abs(d - R) < 1e-9) { total += s.q / 2; on++; onQ.push(s.q); continue; }
      total += src.kind === 'charge' ? chargeFlux(s.q, d, R) : wireCirc(s.q, s.x, s.y, cx, cy, R, 1440);
      if (d < R) inside += s.q;
    }
    return { total, inside, on, onQ };
  }
  // the outward (charges) or along-the-loop (wires) field round the circle where the sphere or loop meets the plane
  function rim(src, cx, cy, R, M) {
    const th = [], v = [];
    for (let k = 0; k <= M; k++) {
      const a = TAU * k / M, x = cx + R * Math.cos(a), y = cy + R * Math.sin(a), [fx, fy] = field2(src, x, y);
      th.push(360 * k / M);
      const val = src.kind === 'charge' ? fx * Math.cos(a) + fy * Math.sin(a) : -fx * Math.sin(a) + fy * Math.cos(a);
      v.push(Number.isFinite(val) ? val : NaN);
    }
    return { th, v };
  }

  // ---------- 3. Two zeros: a landscape φ, its gradient and its curl ----------
  const BUMPS = [{ x: -0.8, y: 0.5, a: 1.2 }, { x: 0.9, y: -0.45, a: -1 }], SIG = 0.6;
  function land(x, y) {
    let p = 0, px = 0, py = 0, lap = 0;
    for (const b of BUMPS) {
      const dx = x - b.x, dy = y - b.y, d2 = dx * dx + dy * dy, e = b.a * Math.exp(-d2 / (2 * SIG * SIG));
      p += e; px -= e * dx / (SIG * SIG); py -= e * dy / (SIG * SIG); lap += e * (d2 / SIG ** 4 - 2 / SIG ** 2);
    }
    return { p, px, py, lap };
  }
  const ZEROS = {
    // F = −∇φ, as E = −∇V: downhill, never swirling
    grad: { F: (x, y) => { const l = land(x, y); return [-l.px, -l.py]; }, div: (x, y) => -land(x, y).lap, curl: () => 0 },
    // F = ∇ × (φ ẑ) = (∂φ/∂y, −∂φ/∂x), as B = ∇ × A: along the contours, never starting or ending
    curl: { F: (x, y) => { const l = land(x, y); return [l.py, -l.px]; }, div: () => 0, curl: (x, y) => -land(x, y).lap },
  };

  window.DC = { TAU, FIELDS, ZEROS, SOURCES, BUMPS, SIG, land, seg, box, corners, walk, field2, chargeFlux, wireCirc, surface, rim, gaussLegendre };
})();
