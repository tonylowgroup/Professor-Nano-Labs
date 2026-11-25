/* Space groups: the symmetry algebra behind the lab. No DOM access.
   Each operation is a pair (W, w) acting on fractional coordinates, x -> Wx + w. The classification follows the
   International Tables for Crystallography, Vol. A, Part 1.2: the type of W from its determinant and trace, the
   intrinsic (screw or glide) translation as the average of w over one cycle of W, and the location of the symmetry
   element as the fixed points of what remains. The data (window.SG_DATA) come from data.js. */
(function () {
  'use strict';
  const DATA = window.SG_DATA, EPS = 1e-6;
  const CEN = {
    P: [[0, 0, 0]], A: [[0, 0, 0], [0, 0.5, 0.5]], B: [[0, 0, 0], [0.5, 0, 0.5]], C: [[0, 0, 0], [0.5, 0.5, 0]],
    I: [[0, 0, 0], [0.5, 0.5, 0.5]], F: [[0, 0, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [0.5, 0.5, 0]],
    R: [[0, 0, 0], [2 / 3, 1 / 3, 1 / 3], [1 / 3, 2 / 3, 2 / 3]],
  };

  // ---------- small linear algebra ----------
  const I3 = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const mm = (A, B) => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  const mv = (A, v) => A.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => Math.sqrt(dot(a, a));
  const det3 = A => A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
  const tr3 = A => A[0][0] + A[1][1] + A[2][2];
  const T = A => [0, 1, 2].map(i => [0, 1, 2].map(j => A[j][i]));
  function inv3(A) {
    const d = det3(A), C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const r = [0, 1, 2].filter(k => k !== i), c = [0, 1, 2].filter(k => k !== j);
      C[j][i] = ((i + j) % 2 ? -1 : 1) * (A[r[0]][c[0]] * A[r[1]][c[1]] - A[r[0]][c[1]] * A[r[1]][c[0]]) / d;
    }
    return C;
  }
  // a basis of the null space of A (3 x 3), and one solution of A x = b (free variables set to zero)
  function rref(A, b) {
    const M = A.map((r, i) => r.concat([b ? b[i] : 0])), piv = [];
    let row = 0;
    for (let col = 0; col < 3 && row < 3; col++) {
      let best = row; for (let r = row + 1; r < 3; r++) if (Math.abs(M[r][col]) > Math.abs(M[best][col])) best = r;
      if (Math.abs(M[best][col]) < EPS) continue;
      [M[row], M[best]] = [M[best], M[row]];
      const p = M[row][col]; for (let k = 0; k < 4; k++) M[row][k] /= p;
      for (let r = 0; r < 3; r++) if (r !== row) { const f = M[r][col]; for (let k = 0; k < 4; k++) M[r][k] -= f * M[row][k]; }
      piv.push(col); row++;
    }
    return { M, piv };
  }
  function nullspace(A) {
    const { M, piv } = rref(A), free = [0, 1, 2].filter(c => !piv.includes(c));
    return free.map(f => { const v = [0, 0, 0]; v[f] = 1; piv.forEach((c, r) => { v[c] = -M[r][f]; }); return v; });
  }
  function solve(A, b) {
    const { M, piv } = rref(A, b), x = [0, 0, 0];
    piv.forEach((c, r) => { x[c] = M[r][3]; });
    return x;
  }
  // a direction as the smallest integer vector, pointing "forwards" (first non-zero component positive)
  function intDir(v) {
    const m = Math.max(...v.map(Math.abs)); let u = v.map(c => c / m);
    for (let k = 1; k <= 12; k++) { const w = u.map(c => c * k); if (w.every(c => Math.abs(c - Math.round(c)) < 1e-6)) { u = w.map(Math.round); break; } }
    const f = u.find(c => Math.abs(c) > EPS); if (f < 0) u = u.map(c => -c);
    return u.map(c => (Math.abs(c) < EPS ? 0 : c));
  }

  // ---------- parsing ----------
  function parseOp(s) {
    const W = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], w = [0, 0, 0];
    s.replace(/\s/g, '').split(',').forEach((part, i) => {
      const re = /([+-]?)(\d+\/\d+|\d+|[xyz])/g; let m;
      while ((m = re.exec(part))) {
        const sg = m[1] === '-' ? -1 : 1, t = m[2];
        if ('xyz'.includes(t)) W[i]['xyz'.indexOf(t)] += sg;
        else { const [a, b] = t.split('/'); w[i] += sg * Number(a) / (b ? Number(b) : 1); }
      }
    });
    return { W, w };
  }
  const wrap = v => v.map(c => { const r = c - Math.floor(c + EPS); return Math.abs(r) < EPS || Math.abs(r - 1) < EPS ? 0 : r; });

  // ---------- fractions and coordinate triplets for display ----------
  function frac(v) {
    if (Math.abs(v) < 1e-6) return '0';
    for (const q of [1, 2, 3, 4, 6, 8, 12, 24]) { const p = Math.round(v * q); if (Math.abs(v * q - p) < 1e-5) return q === 1 ? String(p) : `${p}/${q}`; }
    return v.toFixed(3);
  }
  // a line x0 + s u, or a plane x0 + s v1 + r v2, written the International Tables way: 0,0,z or x,1/4,z
  function linear(coef, c) {
    // coef: coefficients of the free letters (object letter -> number), c: the constant
    let s = '';
    for (const [L, k] of Object.entries(coef)) {
      if (Math.abs(k) < EPS) continue;
      const a = Math.abs(k), term = (Math.abs(a - 1) < EPS ? '' : frac(a)) + L;
      s += (k < 0 ? '-' : s ? '+' : '') + term;
    }
    if (Math.abs(c) > EPS || !s) s += (s && c > 0 ? '+' : '') + frac(c);
    return s.replace('+-', '-');
  }
  function lineText(x0, u) {
    // the free parameter runs along the smallest component, so the others are whole multiples of it (x,2x,0 rather than x,1/2x,0);
    // it is named after the first coordinate that varies
    const nzi = [0, 1, 2].filter(k => Math.abs(u[k]) > EPS), im = nzi.reduce((b, k) => (Math.abs(u[k]) < Math.abs(u[b]) ? k : b), nzi[0]), L = 'xyz'[nzi[0]];
    return [0, 1, 2].map(j => linear({ [L]: u[j] / u[im] }, x0[j] - u[j] / u[im] * x0[im])).join(',');
  }
  function planeText(x0, n) {
    // the dependent coordinate: the last one whose normal component makes all the coefficients whole numbers (x,-x,z; x,2x,z)
    const nzi = [0, 1, 2].filter(k => Math.abs(n[k]) > EPS), d = dot(n, x0);
    const whole = i => nzi.every(k => Math.abs(n[k] / n[i] - Math.round(n[k] / n[i])) < EPS);
    const i = nzi.slice().reverse().find(whole) ?? nzi.reduce((b, k) => (Math.abs(n[k]) > Math.abs(n[b]) ? k : b), nzi[0]);
    return [0, 1, 2].map(j => {
      if (j !== i) return 'xyz'[j];
      const coef = {}; [0, 1, 2].filter(k => k !== i).forEach(k => { coef['xyz'[k]] = -n[k] / n[i]; });
      return linear(coef, d / n[i]);
    }).join(',');
  }
  const pointText = x => x.map(frac).join(',');

  // ---------- the default cells used for the pictures (not part of the group) ----------
  const CELLS = {
    triclinic: [1, 1.1, 1.2, 80, 75, 70], monoclinic: [1, 1.15, 0.95, 90, 105, 90], orthorhombic: [1, 1.22, 0.86, 90, 90, 90],
    tetragonal: [1, 1, 1.35, 90, 90, 90], trigonal: [1, 1, 1.25, 90, 90, 120], hexagonal: [1, 1, 1.25, 90, 90, 120], cubic: [1, 1, 1, 90, 90, 90],
  };
  // columns are the cell vectors a, b, c in Cartesian coordinates
  function cellMatrix(a, b, c, al, be, ga) {
    const r = Math.PI / 180, ca = Math.cos(al * r), cb = Math.cos(be * r), cg = Math.cos(ga * r), sg = Math.sin(ga * r);
    const cx = c * cb, cy = c * (ca - cb * cg) / sg, cz = Math.sqrt(Math.max(0, c * c - cx * cx - cy * cy));
    return [[a, b * cg, cx], [0, b * sg, cy], [0, 0, cz]];
  }

  // ---------- one operation, classified ----------
  function inLattice(t, cv) { return cv.some(c => sub(t, c).every(x => Math.abs(x - Math.round(x)) < 1e-6)); }
  function classify(op, cv, M) {
    const { W, w } = op, d = det3(W), t = Math.round(tr3(W));
    const kind = d > 0 ? { 3: '1', [-1]: '2', 0: '3', 1: '4', 2: '6' }[t] : { [-3]: '-1', 1: 'm', 0: '-3', [-1]: '-4', [-2]: '-6' }[t];
    const k = { 1: 1, 2: 2, 3: 3, 4: 4, 6: 6, '-1': 2, m: 2, '-3': 6, '-4': 4, '-6': 6 }[kind];
    // the intrinsic translation: w averaged over one cycle of W (zero for inversions and rotoinversions)
    let tin = [0, 0, 0];
    if (d > 0 || kind === 'm') { let P = I3(); for (let j = 0; j < k; j++) { tin = add(tin, mv(P, w)); P = mm(P, W); } tin = scl(tin, 1 / k); }
    // the location: fixed points of x -> Wx + (w - tin)
    const A = W.map((r, i) => r.map((v, j) => v - (i === j ? 1 : 0))), x0 = solve(A, scl(sub(w, tin), -1));
    const out = { W, w, kind, order: k, tin, x0, det: d };
    const Mi = inv3(M), Wc = mm(mm(M, W), Mi);
    if (kind === '1') {
      out.trans = !inLattice(w, [[0, 0, 0]]);
      out.name = out.trans ? 'translation' : 'identity';
      out.sym = out.trans ? 't' : '1'; out.desc = out.trans ? `a centring translation by (${pointText(wrap(w))})` : 'leaves everything where it is';
      out.where = '';
      return out;
    }
    if (kind === 'm') {
      const ker = nullspace(A); out.n = intDir(cross(ker[0], ker[1]));
      // the glide vector, reduced by lattice translations lying in the plane: the conventional description wins
      // (a mirror if the glide is itself a lattice translation, then a, b or c, then n, d, and any other glide last), then the shortest
      const half = v => Math.abs(Math.abs(v) - 0.5) < EPS, q = v => Math.abs(Math.abs(v) - 0.25) < EPS;
      const letterOf = g => {
        const nz = g.map(v => Math.abs(v) > EPS);
        if (!nz.some(Boolean)) return 'm';
        if (g.some(q) && g.every(v => Math.abs(v) < EPS || q(v))) return 'd';
        if (nz.filter(Boolean).length === 1 && half(g[nz.indexOf(true)])) return 'abc'[nz.indexOf(true)];
        if (g.every(v => Math.abs(v) < EPS || half(v))) return 'n';
        return 'g';
      };
      const rank = { m: 0, a: 1, b: 1, c: 1, n: 2, d: 3, g: 4 };
      let best = null;
      for (const c of cv) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) {
        const L = add(c, [a, b, e]); if (Math.abs(dot(out.n, L)) > 1e-6) continue;
        const r = sub(tin, L).map(v => (Math.abs(v) < 1e-9 ? 0 : v)), lt = letterOf(r), l = norm(mv(M, r));
        if (!best || rank[lt] < rank[best.lt] || (rank[lt] === rank[best.lt] && l < best.l - 1e-9)) best = { r, lt, l };
      }
      out.glide = best.r;
      const g = out.glide, letter = best.lt;
      out.letter = letter; out.sym = letter;
      out.name = letter === 'm' ? 'mirror plane' : `${letter}-glide plane`;
      out.where = planeText(x0, out.n);
      out.desc = letter === 'm' ? `reflects through the plane ${out.where}` : `reflects through the plane ${out.where}, then slides by (${pointText(g)})`;
      return out;
    }
    if (kind === '-1') { out.name = 'inversion centre'; out.sym = '-1'; out.where = pointText(wrap(x0)); out.desc = `sends every point through ${out.where} to the opposite side`; return out; }
    // rotations and rotoinversions: the axis, the rotation sense, and for rotations the screw part
    const R = d > 0 ? W : scl3(W, -1), Rc = d > 0 ? Wc : scl3(Wc, -1);
    let u = intDir(nullspace(R.map((r, i) => r.map((v, j) => v - (i === j ? 1 : 0))))[0]);
    const uc = mv(M, u), un = scl(uc, 1 / norm(uc));
    const sinT = 0.5 * dot(un, [Rc[2][1] - Rc[1][2], Rc[0][2] - Rc[2][0], Rc[1][0] - Rc[0][1]]);
    out.u = u; out.sense = Math.abs(sinT) < 1e-6 ? 0 : sinT > 0 ? 1 : -1;
    const n = d > 0 ? k : { '-3': 3, '-4': 4, '-6': 6 }[kind];
    if (d > 0) {
      // screw index: translation along the axis, in units of the shortest lattice period along it, for a positive rotation
      let s = 1; for (const m of [6, 4, 3, 2]) if (inLattice(scl(u, 1 / m), cv)) { s = 1 / m; break; }
      const lam = dot(tin, u) / dot(u, u), j = ((Math.round((out.sense < 0 ? -lam : lam) * n / s) % n) + n) % n;
      out.screw = j; out.period = s;
      const sub_ = '₀₁₂₃₄₅₆'[j];
      out.sym = `${n}${j ? sub_ : ''}`; out.name = j ? `${n}${sub_} screw axis` : `${n}-fold rotation axis`;
      out.where = lineText(x0, u);
      const ang = 360 / n;
      out.desc = j ? `turns ${n === 2 ? '180' : ang}° about the axis ${out.where}, then slides by (${pointText(tin)})` : `turns ${n === 2 ? '180' : ang}° about the axis ${out.where}`;
      if (n > 2) out.sym += out.sense > 0 ? '⁺' : '⁻';
    } else {
      out.sym = `-${n}${out.sense > 0 ? '⁺' : '⁻'}`; out.name = `${n}-fold rotoinversion axis`;
      out.where = `${lineText(x0, u)}; centre ${pointText(wrap(x0))}`;
      out.desc = `turns ${360 / n}° about the axis ${lineText(x0, u)}, then inverts through ${pointText(wrap(x0))}`;
    }
    return out;
  }
  function scl3(A, s) { return A.map(r => r.map(v => v * s)); }

  // ---------- a group ----------
  const SUBS = '₀₁₂₃₄₅₆₇₈₉';
  function prettyTokens(xhm, system) {
    let toks = xhm.replace(/:.*$/, '').trim().split(/\s+/);
    if ((system === 'monoclinic' || system === 'triclinic') && toks.length > 2) toks = [toks[0]].concat(toks.slice(1).filter(t => t !== '1'));
    return toks;
  }
  // text (with -3 for 3-bar) and HTML (with an overline) versions of the Hermann-Mauguin symbol
  function symbolText(xhm, system) { return prettyTokens(xhm, system).map(t => t.replace(/^(\d)(\d)/, (m, a, b) => a + SUBS[b]).replace(/\/(\d)(\d)/, (m, a, b) => '/' + a + SUBS[b])).join(''); }
  function symbolHTML(xhm, system) {
    return prettyTokens(xhm, system).map(t => t.replace(/^(\d)(\d)/, (m, a, b) => `${a}<sub>${b}</sub>`).replace(/\/(\d)(\d)/, (m, a, b) => `/${a}<sub>${b}</sub>`).replace(/-(\d)/g, '<span class="ovl">$1</span>')).join('');
  }
  const MODERN = { 39: 'Aem2', 41: 'Aea2', 64: 'Cmce', 67: 'Cmme', 68: 'Ccce' };
  const cache = new Map();
  function group(n) {
    if (cache.has(n)) return cache.get(n);
    const [num, xhm, pg, system, cen, ops] = DATA[n - 1];
    const cv = CEN[cen], cell = CELLS[system], M = cellMatrix(...cell);
    const reps = ops.map(s => Object.assign(parseOp(s), { text: s }));
    const classified = reps.map(op => Object.assign(classify(op, cv, M), { text: op.text }));
    const all = [];
    for (const c of cv) for (const op of reps) all.push({ W: op.W, w: wrap(add(op.w, c)) });
    // five orthorhombic symbols changed in 2002 (e for double glide planes); the data use the older ones
    const modern = MODERN[num];
    const g = { n: num, xhm, pg, system, cen, cv, cell, M, reps: classified, all, setting: /:2$/.test(xhm) ? 'origin choice 2' : /:H$/.test(xhm) ? 'hexagonal axes' : '',
      text: modern || symbolText(xhm, system), html: modern || symbolHTML(xhm, system), old: modern ? symbolText(xhm, system) : '' };
    g.symmorphic = classified.every(o => !(o.screw > 0) && !(o.letter && o.letter !== 'm'));
    cache.set(n, g);
    return g;
  }

  // the images of a point under every operation of the group, brought into the unit cell
  function orbit(g, x) {
    const pts = [];
    for (const op of g.all) {
      const y = add(mv(op.W, x), op.w), f = wrap(y);
      if (!pts.some(p => sub(p.f, f).every(v => Math.abs(v - Math.round(v)) < 1e-5))) pts.push({ f, op, det: det3(op.W) });
    }
    return pts;
  }
  // a crystal from its asymmetric unit: every atom's images, without duplicates
  function expand(g, atoms) {
    const out = [];
    for (const a of atoms) for (const p of orbit(g, a.f)) out.push({ el: a.el, f: p.f, label: a.label || a.el });
    return out;
  }

  window.SG = { DATA, CEN, CELLS, group, classify, parseOp, orbit, expand, wrap, frac, pointText, cellMatrix, det3, mv, mm, inv3, add, sub, scl, dot, cross, norm, T };
})();
