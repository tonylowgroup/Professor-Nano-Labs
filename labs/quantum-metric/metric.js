/* The quantum metric lab: the geometry of curved surfaces, the distance between quantum states, and the quantum metric
   of graphene's Bloch states. The graphene model itself (d-vector, curvature, states) comes from the Berry phase lab's
   physics.js (window.BP), so that both cards compute the same graphene. */
(function () {
  'use strict';
  const B = window.BP, TAU = 2 * Math.PI;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const add = (a, b, s = 1) => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]];
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]); return l > 0 ? scale(a, 1 / l) : a; };

  /* ---------- 1. Curved surfaces r(u¹, u²) in 3D ----------
     Each surface has coordinates (u¹, u²), drawn as a chart: u¹ across, u² up. */
  const SURFACES = {
    plane: { name: 'Plane', u: ['x', 'y'], box: [-2, 2, -2, 2], wrap: [false, false], r: (x, y) => [x, y, 0], K: () => 0 },
    cylinder: { name: 'Cylinder', u: ['angle around, φ', 'height, h'], box: [-Math.PI, Math.PI, -1.6, 1.6], wrap: [true, false], r: (p, h) => [Math.cos(p), Math.sin(p), h], K: () => 0 },
    // longitude φ across and latitude λ up, like a world map
    sphere: { name: 'Sphere', u: ['longitude, φ', 'latitude, λ'], box: [-Math.PI, Math.PI, -1.35, 1.35], wrap: [true, false], r: (p, l) => [Math.cos(l) * Math.cos(p), Math.cos(l) * Math.sin(p), Math.sin(l)], K: () => 1 },
    saddle: { name: 'Saddle', u: ['x', 'y'], box: [-1.5, 1.5, -1.5, 1.5], wrap: [false, false], r: (x, y) => [x, y, (x * x - y * y) / 2], K: (x, y) => -1 / Math.pow(1 + x * x + y * y, 2) },
  };
  const H = 1e-4;
  // tangent vectors e_i = ∂r/∂u^i, the unit normal, the metric g_ij = e_i·e_j and the Gaussian curvature
  function frame(S, u) {
    const [a, b] = u, r = S.r(a, b);
    const e1 = scale(add(S.r(a + H, b), S.r(a - H, b), -1), 1 / (2 * H)), e2 = scale(add(S.r(a, b + H), S.r(a, b - H), -1), 1 / (2 * H));
    const N = norm(cross(e1, e2)), g = [[dot(e1, e1), dot(e1, e2)], [dot(e1, e2), dot(e2, e2)]];
    return { r, e1, e2, N, g };
  }
  // K = det(second fundamental form) / det(metric), from second derivatives of r
  function curvature(S, u) {
    const [a, b] = u, F = frame(S, u), h = 1e-3, r0 = F.r;
    const r11 = scale(add(add(S.r(a + h, b), S.r(a - h, b)), r0, -2), 1 / (h * h));
    const r22 = scale(add(add(S.r(a, b + h), S.r(a, b - h)), r0, -2), 1 / (h * h));
    const r12 = scale(add(add(S.r(a + h, b + h), S.r(a - h, b - h)), add(S.r(a + h, b - h), S.r(a - h, b + h)), -1), 1 / (4 * h * h));
    const L = dot(r11, F.N), M = dot(r12, F.N), Nn = dot(r22, F.N), g = F.g;
    return (L * Nn - M * M) / (g[0][0] * g[1][1] - g[0][1] * g[0][1]);
  }
  // g^(-1/2) for a 2×2 symmetric positive matrix
  function invSqrt(g) {
    const a = g[0][0], b = g[0][1], d = g[1][1], tr = a + d, det = a * d - b * b, s = Math.sqrt(det), t = Math.sqrt(tr + 2 * s);
    // sqrt(g) = (g + s I)/t, so g^(-1/2) = (g + s I)^(-1) t
    const m = [[a + s, b], [b, d + s]], dm = (a + s) * (d + s) - b * b;
    return [[t * m[1][1] / dm, -t * m[0][1] / dm], [-t * m[1][0] / dm, t * m[0][0] / dm]];
  }
  // the metric ellipse around u: the coordinate steps du with g_ij du^i du^j = eps², at angle t
  function ellipse(S, u, eps, n) {
    const W = invSqrt(frame(S, u).g);
    return Array.from({ length: n }, (_, j) => { const t = TAU * j / n, c = eps * Math.cos(t), s = eps * Math.sin(t); return [u[0] + W[0][0] * c + W[0][1] * s, u[1] + W[1][0] * c + W[1][1] * s]; });
  }
  // rotate v by the smallest rotation taking unit vector a to unit vector b (Rodrigues)
  function carry(v, a, b) {
    const k = cross(a, b), s = Math.hypot(k[0], k[1], k[2]), c = dot(a, b);
    if (s < 1e-15) return v;
    const ax = scale(k, 1 / s), th = Math.atan2(s, c);
    return add(add(scale(v, Math.cos(th)), scale(cross(ax, v), Math.sin(th))), scale(ax, dot(ax, v) * (1 - Math.cos(th))));
  }
  /* Parallel transport of a tangent arrow around the loop of coordinates pts (closed): at each step the arrow is turned
     with the tangent plane, by the rotation that takes one normal to the next, and so never turns within the surface.
     Returns the arrow at each point and its turn so far, measured from the start against the transported frame. */
  function transport(S, pts) {
    const F0 = frame(S, pts[0]), v0 = norm(F0.e1), out = [{ v: v0, N: F0.N, r: F0.r }];
    let v = v0, N = F0.N;
    for (let j = 1; j <= pts.length; j++) {
      const F = frame(S, pts[j % pts.length]);
      v = norm(carry(v, N, F.N)); N = F.N;
      out.push({ v, N, r: F.r });
    }
    const vEnd = out[out.length - 1].v;
    return { steps: out, turn: Math.atan2(dot(F0.N, cross(v0, vEnd)), dot(v0, vEnd)) };
  }
  // ∫K dA over the inside of the metric ellipse (Gauss–Legendre in the radius, trapezium rule in angle)
  const GX = [-0.9061798459386640, -0.5384693101056831, 0, 0.5384693101056831, 0.9061798459386640];
  const GW = [0.2369268850561891, 0.4786286704993665, 0.5688888888888889, 0.4786286704993665, 0.2369268850561891];
  function curvatureInside(S, u, eps) {
    const W = invSqrt(frame(S, u).g), detW = W[0][0] * W[1][1] - W[0][1] * W[1][0];
    let sum = 0;
    const NR = 6, NA = 96;
    for (let seg = 0; seg < NR; seg++) for (let i = 0; i < 5; i++) {
      const s = (seg + (1 + GX[i]) / 2) / NR, ws = GW[i] / 2 / NR;
      for (let j = 0; j < NA; j++) {
        const t = TAU * j / NA, c = eps * s * Math.cos(t), sn = eps * s * Math.sin(t), q = [u[0] + W[0][0] * c + W[0][1] * sn, u[1] + W[1][0] * c + W[1][1] * sn];
        const g = frame(S, q).g, dA = Math.sqrt(g[0][0] * g[1][1] - g[0][1] * g[0][1]);
        sum += curvature(S, q) * dA * eps * eps * s * detW * ws * TAU / NA;
      }
    }
    return sum;
  }

  /* ---------- 2. The distance between two quantum states ----------
     Fubini–Study: d² = 1 − |⟨ψ|φ⟩|² for two nearby states, and arccos|⟨ψ|φ⟩| as the length of the shortest path
     between them. For a spin-½, the states live on the Bloch sphere and the quantum metric is that of a sphere of
     radius ½: ds² = ¼(dθ² + sin²θ dφ²). */
  const overlap2 = (u, v) => { const o = B.ov(u, v); return o[0] * o[0] + o[1] * o[1]; };
  const fsAngle = (u, v) => Math.acos(Math.min(1, Math.sqrt(overlap2(u, v))));
  // the length of a chain of states, adding up arccos|⟨u_j|u_{j+1}⟩| (exact for each short step)
  function odometer(states) {
    const out = [0];
    for (let j = 1; j < states.length; j++) out.push(out[j - 1] + fsAngle(states[j - 1], states[j]));
    return out;
  }

  /* ---------- 3. The quantum metric of a two-band crystal ----------
     For the lower band of d0 + d·σ, with n = d/|d|: g_ij = ¼ ∂_i n·∂_j n and Ω = ½ n·(∂_x n × ∂_y n), so that
     √det g = |Ω|/2 exactly, and tr g ≥ |Ω|. */
  function metric(model, k) {
    const { d, dx, dy } = B.dvec(model, k), r = Math.hypot(d[0], d[1], d[2]);
    if (!(r > 1e-12)) return { g: [[Infinity, 0], [0, Infinity]], tr: Infinity, det: Infinity, omega: NaN };
    const n = scale(d, 1 / r), nx = scale(add(dx, n, -dot(n, dx)), 1 / r), ny = scale(add(dy, n, -dot(n, dy)), 1 / r);
    const g = [[dot(nx, nx) / 4, dot(nx, ny) / 4], [dot(nx, ny) / 4, dot(ny, ny) / 4]];
    return { g, tr: g[0][0] + g[1][1], det: g[0][0] * g[1][1] - g[0][1] * g[0][1], omega: dot(n, cross(nx, ny)) / 2 };
  }
  // eigenvalues and eigenvectors of a 2×2 symmetric matrix (for the metric's ellipses)
  function eig2(g) {
    const a = g[0][0], b = g[0][1], d = g[1][1], m = (a + d) / 2, q = Math.hypot((a - d) / 2, b), l1 = m + q, l2 = m - q;
    const th = 0.5 * Math.atan2(2 * b, a - d);
    return { l: [l1, l2], v: [[Math.cos(th), Math.sin(th)], [-Math.sin(th), Math.cos(th)]] };
  }
  // the states along a path of k points, and the quantum distance travelled
  function pathStates(model, ks) { const st = ks.map(k => B.lowerState(model, k, 'N')); return { states: st, dist: odometer(st) }; }

  window.QM = { SURFACES, frame, curvature, invSqrt, ellipse, carry, transport, curvatureInside, overlap2, fsAngle, odometer, metric, eig2, pathStates };
})();
