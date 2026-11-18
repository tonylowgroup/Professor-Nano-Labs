/* Berry phase, connection and curvature: a spin-1/2 carried around loops, and two-band crystals.
   Conventions (as in the video): A = i<u|∇u>, the Berry phase of a loop γ = ∮A·dk, Ω = ∂x A_y − ∂y A_x,
   and on a discrete loop γ = −arg Π <u_j|u_{j+1}>, which is gauge invariant.
   Spinors are [re0, im0, re1, im1]. */
(function () {
  'use strict';
  const TAU = 2 * Math.PI;

  // ---------- spinors ----------
  const angles = n => [Math.acos(Math.max(-1, Math.min(1, n[2]))), Math.atan2(n[1], n[0])];
  // |+n> (spin along n) in the north gauge, smooth except at the south pole
  function up(n) { const [t, p] = angles(n), c = Math.cos(t / 2), s = Math.sin(t / 2); return [c, 0, s * Math.cos(p), s * Math.sin(p)]; }
  // |−n> (spin against n: the lower band of d·σ). Gauge N, (−e^{−iφ} sin θ/2, cos θ/2), is smooth where n is near +z;
  // gauge S, (sin θ/2, −e^{iφ} cos θ/2), where n is near −z.
  function low(n, gauge) {
    const [t, p] = angles(n), c = Math.cos(t / 2), s = Math.sin(t / 2), cp = Math.cos(p), sp = Math.sin(p);
    return gauge === 'S' ? [s, 0, -c * cp, -c * sp] : [-s * cp, s * sp, c, 0];
  }
  const ov = (u, v) => [u[0] * v[0] + u[1] * v[1] + u[2] * v[2] + u[3] * v[3], u[0] * v[1] - u[1] * v[0] + u[2] * v[3] - u[3] * v[2]];   // <u|v>
  const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const phase = (u, ch) => { const c = Math.cos(ch), s = Math.sin(ch); return [u[0] * c - u[1] * s, u[0] * s + u[1] * c, u[2] * c - u[3] * s, u[2] * s + u[3] * c]; };
  const wrap = a => { let x = (a + Math.PI) % TAU; if (x < 0) x += TAU; return x - Math.PI; };

  // phases of a chain of states: each link's −arg<u_j|u_{j+1}> and the loop's γ = −arg Π (closed) or the open-path sum
  function links(states, closed) {
    const N = states.length, out = [];
    let prod = [1, 0];
    for (let j = 0; j < (closed ? N : N - 1); j++) { const o = ov(states[j], states[(j + 1) % N]); out.push(-Math.atan2(o[1], o[0])); prod = cmul(prod, o); }
    return { link: out, gamma: -Math.atan2(prod[1], prod[0]) };
  }
  // the same loop phase from projectors only: γ = −arg Tr[P_1 P_2 ... P_N] (P_j = |u_j><u_j|), manifestly gauge invariant
  function projectorPhase(states) {
    let M = [[1, 0], [0, 0], [0, 0], [1, 0]];       // 2×2 complex identity, row-major
    const mm = (A, B) => [cadd(cmul(A[0], B[0]), cmul(A[1], B[2])), cadd(cmul(A[0], B[1]), cmul(A[1], B[3])), cadd(cmul(A[2], B[0]), cmul(A[3], B[2])), cadd(cmul(A[2], B[1]), cmul(A[3], B[3]))];
    states.forEach(u => {
      const a = [u[0], u[1]], b = [u[2], u[3]], ac = [u[0], -u[1]], bc = [u[2], -u[3]];
      M = mm(M, [cmul(a, ac), cmul(a, bc), cmul(b, ac), cmul(b, bc)]);
    });
    const tr = cadd(M[0], M[3]);
    return -Math.atan2(tr[1], tr[0]);
  }
  const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];

  // a state's phase drawn as a direction: the "flag" Re[ψᵀ(iσy)σψ], a unit vector at right angles to n that turns by 2χ
  // (clockwise, seen from outside) when the state is multiplied by e^{iχ}
  function flag(u) {
    const [a, b, c, d] = u;
    return [(a * a - b * b) - (c * c - d * d), -2 * (a * b + c * d), -2 * (a * c - b * d)];
  }
  // solid angle of the polygon joining unit vectors by great-circle arcs, positive when anticlockwise seen from outside
  // (a fan of triangles from the first vertex, each by Van Oosterom and Strackee's formula)
  function polySolid(pts) {
    const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    let s = 0;
    const a = pts[0];
    for (let j = 1; j < pts.length - 1; j++) {
      const b = pts[j], c = pts[j + 1], bc = [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]];
      s += 2 * Math.atan2(dot(a, bc), 1 + dot(a, b) + dot(b, c) + dot(c, a));
    }
    return s;
  }

  // ---------- loops on the sphere ----------
  // a circle of latitude at polar angle thc, traversed with increasing φ (anticlockwise seen from +z): solid angle 2π(1 − cos thc)
  function circle(thc, N) { return Array.from({ length: N }, (_, j) => { const p = TAU * j / N; return [Math.sin(thc) * Math.cos(p), Math.sin(thc) * Math.sin(p), Math.cos(thc)]; }); }
  // an orange slice: from the north pole down φ = 0 to the equator, along it to φ = dphi, and back up: solid angle dphi
  function lune(dphi, N) {
    const L = [Math.PI / 2, dphi, Math.PI / 2], tot = L[0] + L[1] + L[2], pts = [];
    for (let j = 0; j < N; j++) {
      let s = tot * j / N;
      if (s < L[0]) pts.push([Math.sin(s), 0, Math.cos(s)]);
      else if ((s -= L[0]) < L[1]) pts.push([Math.cos(s), Math.sin(s), 0]);
      else { s -= L[1]; const t = Math.PI / 2 - s; pts.push([Math.sin(t) * Math.cos(dphi), Math.sin(t) * Math.sin(dphi), Math.cos(t)]); }
    }
    return pts;
  }

  /* ---------- a spin carried slowly around the circle: exact time evolution ----------
     H(t) = −(ħω0/2) n(t)·σ, n turning about z once in a time T (ω = 2π/T). In the frame turning with n the Hamiltonian
     is constant, H' = H(0) − (ħω/2)σz, so ψ(t) = e^{−iωtσz/2} e^{−iH't} ψ(0) exactly. Time in units of 1/ω0. */
  function spinAt(thc, T, t) {
    const w = TAU / T, n0 = [Math.sin(thc), 0, Math.cos(thc)];
    // H' = a·σ with a = −n0/2 − (w/2)z
    const a = [-n0[0] / 2, 0, -n0[2] / 2 - w / 2], A = Math.hypot(a[0], a[1], a[2]);
    const c = Math.cos(A * t), s = Math.sin(A * t) / A;
    // e^{−iH't} = c I − i s (a·σ);  a has no y part
    const U = [[c, -s * a[2]], [0, -s * a[0]], [0, -s * a[0]], [c, s * a[2]]];      // [[U00 re,im],[U01],[U10],[U11]]
    const p0 = up(n0);
    const x0 = [p0[0], p0[1]], x1 = [p0[2], p0[3]];
    const y0 = cadd(cmul(U[0], x0), cmul(U[1], x1)), y1 = cadd(cmul(U[2], x0), cmul(U[3], x1));
    // rotate back by e^{−iωtσz/2}
    const r = w * t / 2, e0 = [Math.cos(-r), Math.sin(-r)], e1 = [Math.cos(r), Math.sin(r)];
    const z0 = cmul(e0, y0), z1 = cmul(e1, y1);
    const psi = [z0[0], z0[1], z1[0], z1[1]];
    const n = [Math.sin(thc) * Math.cos(w * t), Math.sin(thc) * Math.sin(w * t), Math.cos(thc)];
    // spin vector <σ>
    const cr = cmul([psi[0], -psi[1]], [psi[2], psi[3]]);
    const spin = [2 * cr[0], 2 * cr[1], psi[0] ** 2 + psi[1] ** 2 - psi[2] ** 2 - psi[3] ** 2];
    // phase relative to the instantaneous eigenstate (north gauge), with the dynamical phase +ω0 t/2 removed
    const o = ov(up(n), psi);
    return { psi, n, spin, fid: o[0] ** 2 + o[1] ** 2, geo: Math.atan2(o[1], o[0]) - t / 2 };
  }
  // the whole run, with the geometric phase unwrapped along the way
  function spinRun(thc, T, nOut) {
    const out = { t: [], n: [], spin: [], geo: [], fid: [] };
    let prev = 0, acc = 0;
    for (let i = 0; i <= nOut; i++) {
      const t = T * i / nOut, r = spinAt(thc, T, t);
      if (i === 0) acc = r.geo; else acc += wrap(r.geo - prev);
      prev = r.geo;
      out.t.push(t); out.n.push(r.n); out.spin.push(r.spin); out.geo.push(acc); out.fid.push(r.fid);
    }
    return out;
  }
  // the geometric phase left after one full loop (mod 2π) and the probability of still being in the eigenstate
  function spinFinal(thc, T) { const r = spinAt(thc, T, T); return { geo: wrap(r.geo), fid: r.fid }; }

  // ---------- two-band crystals: H(k) = d0(k) + d(k)·σ ----------
  const S3 = Math.sqrt(3);
  const DEL = [[0, 1], [-S3 / 2, -0.5], [S3 / 2, -0.5]];                           // nearest neighbours (C–C distance 1)
  const BB = [[DEL[1][0] - DEL[2][0], DEL[1][1] - DEL[2][1]], [DEL[2][0] - DEL[0][0], DEL[2][1] - DEL[0][1]], [DEL[0][0] - DEL[1][0], DEL[0][1] - DEL[1][1]]];
  const KPT = [4 * Math.PI / (3 * S3), 0];                                            // a Dirac point K; K' = −K
  // reciprocal vectors of A1 = (√3/2, 3/2), A2 = (−√3/2, 3/2)
  const G1 = [2 * Math.PI / S3, 2 * Math.PI / 3], G2 = [-2 * Math.PI / S3, 2 * Math.PI / 3];

  /* d(k), d0(k) and ∂d/∂kx, ∂d/∂ky. Models:
     qwz: Qi–Wu–Zhang, d = (sin kx, sin ky, m − cos kx − cos ky)
     hex: graphene with a staggered mass M and Haldane's complex next-nearest hopping t2 e^{iφ} (t1 = 1) */
  function dvec(model, k) {
    const [kx, ky] = k;
    if (model.type === 'qwz') {
      const m = model.m;
      return { d: [Math.sin(kx), Math.sin(ky), m - Math.cos(kx) - Math.cos(ky)], d0: 0, dx: [Math.cos(kx), 0, Math.sin(kx)], dy: [0, Math.cos(ky), Math.sin(ky)] };
    }
    const { M, t2, phi } = model;
    const d = [0, 0, M], dx = [0, 0, 0], dy = [0, 0, 0];
    let d0 = 0;
    DEL.forEach(([ax, ay]) => { const q = kx * ax + ky * ay, c = Math.cos(q), s = Math.sin(q); d[0] += c; d[1] += s; dx[0] -= ax * s; dy[0] -= ay * s; dx[1] += ax * c; dy[1] += ay * c; });
    BB.forEach(([bx, by]) => { const q = kx * bx + ky * by, c = Math.cos(q), s = Math.sin(q); d0 += 2 * t2 * Math.cos(phi) * c; d[2] -= 2 * t2 * Math.sin(phi) * s; dx[2] -= 2 * t2 * Math.sin(phi) * bx * c; dy[2] -= 2 * t2 * Math.sin(phi) * by * c; });
    return { d, d0, dx, dy };
  }
  const unit = d => { const r = Math.hypot(d[0], d[1], d[2]); return r > 0 ? d.map(v => v / r) : [0, 0, 1]; };
  // Berry curvature of the lower band: Ω = d·(∂x d × ∂y d) / 2|d|³  (= ½ n·(∂x n × ∂y n))
  function omega(model, k) {
    const { d, dx, dy } = dvec(model, k), r = Math.hypot(d[0], d[1], d[2]);
    const cx = dx[1] * dy[2] - dx[2] * dy[1], cy = dx[2] * dy[0] - dx[0] * dy[2], cz = dx[0] * dy[1] - dx[1] * dy[0];
    return (d[0] * cx + d[1] * cy + d[2] * cz) / (2 * r * r * r);
  }
  // Berry connection of the lower band in gauge N or S: A_N = sin²(θ/2)∇φ, A_S = A_N − ∇φ  (φ = arg(dx + i dy))
  function connection(model, k, gauge) {
    const { d, dx, dy } = dvec(model, k), r = Math.hypot(d[0], d[1], d[2]), rho2 = d[0] * d[0] + d[1] * d[1];
    if (!(rho2 > 1e-30)) return [NaN, NaN];
    const gp = [(d[0] * dx[1] - d[1] * dx[0]) / rho2, (d[0] * dy[1] - d[1] * dy[0]) / rho2];
    const s2 = (1 - d[2] / r) / 2, f = gauge === 'S' ? s2 - 1 : s2;
    return [f * gp[0], f * gp[1]];
  }
  const lowerState = (model, k, gauge) => low(unit(dvec(model, k).d), gauge);

  // the reciprocal unit cell used for sums over the zone: origin and two edge vectors
  const cell = model => (model.type === 'qwz' ? [[-Math.PI, -Math.PI], [TAU, 0], [0, TAU]] : [[0, 0], G1, G2]);
  const cellArea = model => { const [, a, b] = cell(model); return Math.abs(a[0] * b[1] - a[1] * b[0]); };

  /* Chern number of the lower band, C = (1/2π) ∫ Ω d²k, by Fukui, Hatsugai and Suzuki: the zone is cut into N × N
     plaquettes and each contributes its (gauge-invariant) Berry phase; the sum is exactly an integer. */
  function chern(model, N) {
    const [o, a, b] = cell(model), U = [];
    for (let i = 0; i < N; i++) { U.push([]); for (let j = 0; j < N; j++) U[i].push(lowerState(model, [o[0] + a[0] * i / N + b[0] * j / N, o[1] + a[1] * i / N + b[1] * j / N], 'N')); }
    const sgn = Math.sign(a[0] * b[1] - a[1] * b[0]);
    let F = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const p = U[i][j], q = U[(i + 1) % N][j], r = U[(i + 1) % N][(j + 1) % N], s = U[i][(j + 1) % N];
      const pr = cmul(cmul(ov(p, q), ov(q, r)), cmul(ov(r, s), ov(s, p)));
      F -= Math.atan2(pr[1], pr[0]);                 // the plaquette's Berry phase, −arg Π
    }
    return sgn * F / TAU;
  }

  // a loop in k-space: a circle of radius rad about c, anticlockwise. Its Berry phase from the overlaps of the states...
  function loopPhase(model, c, rad, N) {
    const st = Array.from({ length: N }, (_, j) => lowerState(model, [c[0] + rad * Math.cos(TAU * j / N), c[1] + rad * Math.sin(TAU * j / N)], 'N'));
    return links(st, true).gamma;
  }
  // ... and the flux of Ω through it (Stokes), by Gauss–Legendre in r and the trapezium rule in angle
  const GLX = [-0.9739065285171717, -0.8650633666889845, -0.6794095682990244, -0.4333953941292472, -0.1488743389816312, 0.1488743389816312, 0.4333953941292472, 0.6794095682990244, 0.8650633666889845, 0.9739065285171717];
  const GLW = [0.0666713443086881, 0.1494513491505806, 0.2190863625159820, 0.2692667193099963, 0.2955242247147529, 0.2955242247147529, 0.2692667193099963, 0.2190863625159820, 0.1494513491505806, 0.0666713443086881];
  function loopFlux(model, c, rad, nr, na) {
    let F = 0, gmin = Infinity;
    const NR = nr || 4, NA = na || 96;
    for (let seg = 0; seg < NR; seg++) for (let i = 0; i < 10; i++) {
      const r = rad * (seg + (1 + GLX[i]) / 2) / NR, w = GLW[i] / 2 * rad / NR;
      for (let j = 0; j < NA; j++) {
        const a = TAU * j / NA, k = [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
        F += omega(model, k) * r * w * TAU / NA;
        gmin = Math.min(gmin, 2 * Math.hypot(...dvec(model, k).d));
      }
    }
    return { flux: F, gapMin: gmin };
  }
  // the bands E± = d0 ± |d| along a path of k points
  const bands = (model, ks) => ks.map(k => { const { d, d0 } = dvec(model, k), r = Math.hypot(d[0], d[1], d[2]); return [d0 - r, d0 + r]; });

  window.BP = { TAU, up, low, ov, phase, wrap, links, projectorPhase, flag, polySolid, circle, lune, spinAt, spinRun, spinFinal, S3, DEL, BB, KPT, G1, G2, dvec, unit, omega, connection, lowerState, cell, cellArea, chern, loopPhase, loopFlux, bands };
})();
