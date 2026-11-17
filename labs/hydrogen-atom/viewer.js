/* Hydrogen orbitals in 3D, with plain WebGL (no libraries).
   Surface: the boundary |psi|^2 = c that encloses a chosen share of the probability, found on a grid and meshed
   with surface nets. A real orbital gets two surfaces, psi = +sqrt(c) and psi = -sqrt(c), coloured by sign;
   a complex one gets |psi|^2 = c, coloured by the phase of psi.
   Cloud: points drawn at random from |psi|^2, so their density is the probability density.
   Without WebGL the cloud is drawn on a 2D canvas instead. Needs window.Hyd (physics.js). */
(function () {
  'use strict';
  const H = window.Hyd;
  const POS = [0.91, 0.33, 0.25], NEG = [0.86, 0.89, 0.93];      // + lobes red, - lobes pale, as in the video
  function hue(phase) {                                          // phase -> rgb on a colour wheel (0 = red)
    const h = ((phase / (2 * Math.PI)) % 1 + 1) % 1 * 6, i = Math.floor(h), f = h - i;
    const q = [[1, f, 0], [1 - f, 1, 0], [0, 1, f], [0, 1 - f, 1], [f, 0, 1], [1, 0, 1 - f]][i % 6];
    return q.map(v => 0.18 + 0.78 * v);
  }

  // ---------- the field on a grid ----------
  function gridSize(n) { return [0, 60, 68, 76, 84, 92][n] || 92; }
  function buildField(o) {
    const { n, l, m, real } = o, N = gridSize(n), B = 1.06 * H.radiusFor(n, l, 0.997), h = 2 * B / (N - 1);
    const f = new Float32Array(N * N * N);         // psi (real) or |psi|^2 (complex)
    const Rr = new Float64Array(4 * N);             // R(r) tabulated finely for speed
    const rmax = Math.sqrt(3) * B, dr = rmax / (Rr.length - 1);
    for (let i = 0; i < Rr.length; i++) Rr[i] = H.R(n, l, i * dr);
    const Rat = r => { const t = r / dr, i = Math.min(Rr.length - 2, Math.floor(t)), w = t - i; return Rr[i] * (1 - w) + Rr[i + 1] * w; };
    let idx = 0;
    for (let k = 0; k < N; k++) {
      const z = -B + k * h;
      for (let j = 0; j < N; j++) {
        const y = -B + j * h;
        for (let i = 0; i < N; i++, idx++) {
          const x = -B + i * h, r = Math.sqrt(x * x + y * y + z * z), ct = r > 0 ? z / r : 1, ph = Math.atan2(y, x), rad = Rat(r);
          if (real) f[idx] = rad * H.Yr(l, m, ct, ph);
          else { const [a, b] = H.Yc(l, m, ct, ph); f[idx] = rad * rad * (a * a + b * b); }
        }
      }
    }
    return { o, N, B, h, f };
  }
  // the density level c whose region |psi|^2 > c holds a share q of the probability on the grid (log histogram)
  function levelFor(F, q) {
    const d = F.f, real = F.o.real, NB = 4000;
    let max = 0, tot = 0;
    for (let i = 0; i < d.length; i++) { const v = real ? d[i] * d[i] : d[i]; if (v > max) max = v; tot += v; }
    const lo = Math.log(max) - 30, w = 30 / NB, hist = new Float64Array(NB);
    for (let i = 0; i < d.length; i++) {
      const v = real ? d[i] * d[i] : d[i];
      if (v <= 0) continue;
      const b = Math.floor((Math.log(v) - lo) / w);
      if (b >= 0) hist[Math.min(NB - 1, b)] += v;
    }
    let acc = 0;
    for (let b = NB - 1; b >= 0; b--) {
      if (acc + hist[b] >= q * tot) { const frac = (q * tot - acc) / hist[b]; return Math.exp(lo + (b + 1 - frac) * w); }
      acc += hist[b];
    }
    return Math.exp(lo);
  }

  /* surface nets: one vertex per cell the surface crosses, at the mean of the edge crossings; a quad for every grid
     edge that crosses. g(i) gives the field (inside where g > t); cut(x, y, z) removes a region (the cutaway). */
  function field(o, sign, x, y, z) {
    const w = H.psi(o.n, o.l, o.m, x, y, z, o.real);
    return o.real ? sign * w : w[0] * w[0] + w[1] * w[1];
  }
  const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  function surfaceNets(F, sign, t, cut, color) {
    const { N, B, h } = F, src = F.f, real = F.o.real;
    const val = new Float32Array(N * N * N), cutAt = new Uint8Array(N * N * N);
    for (let k = 0, idx = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++, idx++) {
      const v = real ? sign * src[idx] : src[idx];
      if (cut && cut(-B + i * h, -B + j * h, -B + k * h)) { cutAt[idx] = 1; val[idx] = -1; } else val[idx] = v - t;      // > 0 inside
    }
    const at = (i, j, k) => val[i + N * (j + N * k)];
    const cellV = new Int32Array((N - 1) * (N - 1) * (N - 1)).fill(-1);
    const P = [], Nn = [], C = [], I = [];
    const c8 = new Float32Array(8);
    for (let k = 0; k < N - 1; k++) for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      let mask = 0, capped = false;
      for (let c = 0; c < 8; c++) { const q = CORNERS[c], id = i + q[0] + N * (j + q[1] + N * (k + q[2])); c8[c] = val[id]; if (c8[c] > 0) mask |= 1 << c; if (cutAt[id]) capped = true; }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, cnt = 0;
      for (const [a, b] of EDGES) {
        const va = c8[a], vb = c8[b];
        if ((va > 0) === (vb > 0)) continue;
        const s = va / (va - vb), A = CORNERS[a], Bc = CORNERS[b];
        sx += A[0] + s * (Bc[0] - A[0]); sy += A[1] + s * (Bc[1] - A[1]); sz += A[2] + s * (Bc[2] - A[2]); cnt++;
      }
      cellV[i + (N - 1) * (j + (N - 1) * k)] = P.length / 3;
      const x = -B + (i + sx / cnt) * h, y = -B + (j + sy / cnt) * h, z = -B + (k + sz / cnt) * h;
      // the normal is minus the gradient of the exact field (central differences), so the shading is smooth
      const e = 0.25 * h, fx = (a, b, c) => field(F.o, sign, a, b, c);
      let gx = fx(x + e, y, z) - fx(x - e, y, z), gy = fx(x, y + e, z) - fx(x, y - e, z), gz = fx(x, y, z + e) - fx(x, y, z - e);
      let gl = capped ? 0 : Math.hypot(gx, gy, gz);
      if (!(gl > 0)) {      // on the cut faces (and if the exact gradient vanishes) use the grid gradient across the cell
        gx = (c8[1] - c8[0]) + (c8[3] - c8[2]) + (c8[5] - c8[4]) + (c8[7] - c8[6]);
        gy = (c8[2] - c8[0]) + (c8[3] - c8[1]) + (c8[6] - c8[4]) + (c8[7] - c8[5]);
        gz = (c8[4] - c8[0]) + (c8[5] - c8[1]) + (c8[6] - c8[2]) + (c8[7] - c8[3]);
        gl = Math.hypot(gx, gy, gz) || 1;
      }
      P.push(x, y, z); Nn.push(-gx / gl, -gy / gl, -gz / gl);
      if (color) C.push(...color);
      else { const w = H.psi(F.o.n, F.o.l, F.o.m, x, y, z, false); C.push(...hue(Math.atan2(w[1], w[0]))); }
    }
    const cv = (i, j, k) => cellV[i + (N - 1) * (j + (N - 1) * k)];
    const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) I.push(a, c, b, a, d, c); else I.push(a, b, c, a, c, d); };
    for (let k = 1; k < N - 1; k++) for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const s0 = at(i, j, k) > 0;
      if (s0 !== (at(i + 1, j, k) > 0)) quad(cv(i, j - 1, k - 1), cv(i, j, k - 1), cv(i, j, k), cv(i, j - 1, k), !s0);
      if (s0 !== (at(i, j + 1, k) > 0)) quad(cv(i - 1, j, k - 1), cv(i - 1, j, k), cv(i, j, k), cv(i, j, k - 1), !s0);
      if (s0 !== (at(i, j, k + 1) > 0)) quad(cv(i - 1, j - 1, k), cv(i, j - 1, k), cv(i, j, k), cv(i - 1, j, k), !s0);
    }
    return { pos: new Float32Array(P), nor: new Float32Array(Nn), col: new Float32Array(C), idx: new Uint32Array(I) };
  }

  // ---------- WebGL ----------
  const VS_MESH = `attribute vec3 p; attribute vec3 nm; attribute vec3 c; uniform mat3 R; uniform vec3 S; varying vec3 vn; varying vec3 vc;
    void main() { vec3 q = R * p; vn = R * nm; vc = c; gl_Position = vec4(q.x * S.x, q.y * S.y, -q.z * S.z, 1.0); }`;
  const FS_MESH = `precision mediump float; varying vec3 vn; varying vec3 vc;
    void main() { vec3 n = normalize(vn); if (n.z < 0.0) n = -n; vec3 L = normalize(vec3(0.35, 0.55, 1.0));
      float d = max(dot(n, L), 0.0); float s = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0);
      gl_FragColor = vec4(vc * (0.3 + 0.72 * d) + vec3(0.32 * s), 1.0); }`;
  const VS_PT = `attribute vec3 p; attribute vec3 c; uniform mat3 R; uniform vec3 S; uniform float size; varying vec3 vc;
    void main() { vec3 q = R * p; vc = c; gl_PointSize = size; gl_Position = vec4(q.x * S.x, q.y * S.y, -q.z * S.z, 1.0); }`;
  const FS_PT = `precision mediump float; varying vec3 vc; uniform float alpha;
    void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard; gl_FragColor = vec4(vc, alpha * (1.0 - 3.2 * r)); }`;
  const VS_LINE = `attribute vec3 p; uniform mat3 R; uniform vec3 S; void main() { vec3 q = R * p; gl_Position = vec4(q.x * S.x, q.y * S.y, -q.z * S.z, 1.0); }`;
  const FS_LINE = `precision mediump float; uniform vec4 col; void main() { gl_FragColor = col; }`;

  function program(gl, vs, fs) {
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  class OrbitalView {
    constructor(canvas, overlay) {
      this.canvas = canvas; this.overlay = overlay; this.octx = overlay.getContext('2d');
      this.yaw = -0.62; this.pitch = 0.38; this.spin = true; this.mode = 'surface'; this.q = 0.9; this.cutaway = false; this.zoom = 1;
      this.F = null; this.meshes = []; this.cloud = null; this.key = '';
      try {
        const gl = canvas.getContext('webgl', { antialias: true, premultipliedAlpha: false }) || canvas.getContext('experimental-webgl');
        if (!gl) throw new Error('no WebGL');
        this.uint = !!gl.getExtension('OES_element_index_uint');
        this.gl = gl;
        this.pm = program(gl, VS_MESH, FS_MESH); this.pp = program(gl, VS_PT, FS_PT); this.pl = program(gl, VS_LINE, FS_LINE);
        this.buf = { axes: gl.createBuffer() };
      } catch (e) { this.gl = null; this.ctx2d = canvas.getContext('2d'); }
      this._bind();
      this._resize();
      if ('ResizeObserver' in window) new ResizeObserver(() => { this._resize(); this.draw(); }).observe(canvas.parentElement);
      this.onscreen = true;       // spin only while the view is on screen
      if ('IntersectionObserver' in window) new IntersectionObserver(es => { this.onscreen = es[0].isIntersecting; }).observe(canvas.parentElement);
      this._loop = this._loop.bind(this);
      this.last = 0; this.raf = requestAnimationFrame(this._loop);
    }
    get webgl() { return !!this.gl; }

    /* o: { n, l, m, real }; opts: { mode, q, cutaway } */
    set(o, opts) {
      Object.assign(this, opts || {});
      const t0 = performance.now();
      const fkey = `${o.n}|${o.l}|${o.m}|${o.real}`;
      if (!this.F || this.fkey !== fkey) { this.F = buildField(o); this.fkey = fkey; this.cloud = null; this.meshKey = ''; this.o = o; }
      if (this.mode === 'surface' && this.gl) {
        const mkey = `${this.q}|${this.cutaway}`;
        if (this.meshKey !== mkey) { this._meshes(); this.meshKey = mkey; }
      } else if (!this.cloud) this._cloud();
      this.buildMs = performance.now() - t0;
      this.draw();
    }
    _cut() { return this.cutaway ? (x, y) => x > 0 && y < 0 : null; }
    _meshes() {
      const F = this.F, c = levelFor(F, this.q), cut = this._cut();
      this.level = c;
      const parts = F.o.real ? [surfaceNets(F, 1, Math.sqrt(c), cut, POS), surfaceNets(F, -1, Math.sqrt(c), cut, NEG)] : [surfaceNets(F, 1, c, cut, null)];
      const gl = this.gl;
      this.meshes.forEach(mh => ['p', 'n', 'c', 'i'].forEach(k => gl.deleteBuffer(mh[k])));
      this.meshes = parts.filter(s => s.idx.length).map(s => {
        let { pos, nor, col, idx } = s;
        if (!this.uint) {             // no 32-bit indices: expand the triangles
          const ex = (a, w) => { const out = new Float32Array(idx.length * w); for (let i = 0; i < idx.length; i++) for (let k = 0; k < w; k++) out[i * w + k] = a[idx[i] * w + k]; return out; };
          pos = ex(pos, 3); nor = ex(nor, 3); col = ex(col, 3); idx = null;
        }
        const mk = (data, target = gl.ARRAY_BUFFER) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; };
        return { p: mk(pos), n: mk(nor), c: mk(col), i: idx ? mk(idx, gl.ELEMENT_ARRAY_BUFFER) : null, count: idx ? idx.length : pos.length / 3, tris: (idx ? idx.length : pos.length / 3) / 3 };
      });
      this.triangles = this.meshes.reduce((s, mh) => s + mh.tris, 0);
    }
    _cloud() {
      this.cutIdx = null;
      const o = this.F.o, N = 20000, s = H.sample(o.n, o.l, o.m, o.real, N, 1000 * o.n + 100 * o.l + 10 * (o.m + 5) + (o.real ? 1 : 0));
      const col = new Float32Array(3 * N);
      for (let k = 0; k < N; k++) { const c = o.real ? (s.val[k] > 0 ? POS : NEG) : hue(s.val[k]); col[3 * k] = c[0]; col[3 * k + 1] = c[1]; col[3 * k + 2] = c[2]; }
      this.cloud = { pos: s.pos, col, N };
      if (this.gl) {
        const gl = this.gl;
        if (this.cbuf) { gl.deleteBuffer(this.cbuf.p); gl.deleteBuffer(this.cbuf.c); }
        const mk = d => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW); return b; };
        this.cbuf = { p: mk(s.pos), c: mk(col) };
      }
    }

    // ---------- view ----------
    _rot() {   // world -> view: spin about z, then tilt; world z is up on the screen, world y goes into the screen
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      // rows of R: view x, view y, view z (toward the viewer)
      return [[cy, -sy, 0], [sp * sy, sp * cy, cp], [-cp * sy, -cp * cy, sp]];
    }
    _scale() { const W = this.W, Hh = this.Hh, s = 0.93 * this.zoom / this.F.B; return W > Hh ? [s * Hh / W, s, 0.5 / this.F.B / 1.8] : [s, s * W / Hh, 0.5 / this.F.B / 1.8]; }
    project(p) {
      const R = this._rot(), S = this._scale(), v = R.map(r => r[0] * p[0] + r[1] * p[1] + r[2] * p[2]);
      return [(v[0] * S[0] + 1) / 2 * this.W, (1 - v[1] * S[1]) / 2 * this.Hh, v[2]];
    }
    _resize() {
      const r = this.canvas.parentElement.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = Math.max(10, r.width); this.Hh = Math.max(10, r.height); this.dpr = dpr;
      for (const c of [this.canvas, this.overlay]) { c.width = Math.round(this.W * dpr); c.height = Math.round(this.Hh * dpr); }
    }
    draw() {
      if (!this.F || this.W < 20) return;
      if (this.gl) this._drawGL(); else this._draw2D();
      this._drawOverlay();
    }
    _uniforms(p) {
      const gl = this.gl, R = this._rot(), S = this._scale();
      gl.uniformMatrix3fv(gl.getUniformLocation(p, 'R'), false, new Float32Array([R[0][0], R[1][0], R[2][0], R[0][1], R[1][1], R[2][1], R[0][2], R[1][2], R[2][2]]));
      gl.uniform3fv(gl.getUniformLocation(p, 'S'), new Float32Array(S));
    }
    _attr(p, name, buf, size) { const gl = this.gl, loc = gl.getAttribLocation(p, name); if (loc < 0) return; gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); }
    _drawGL() {
      const gl = this.gl, B = this.F.B;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0.035, 0.05, 0.09, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // axes
      gl.useProgram(this.pl); this._uniforms(this.pl);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.axes);
      const A = 0.98 * B;
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-A, 0, 0, A, 0, 0, 0, -A, 0, 0, A, 0, 0, 0, -A, 0, 0, A]), gl.DYNAMIC_DRAW);
      this._attr(this.pl, 'p', this.buf.axes, 3);
      gl.uniform4f(gl.getUniformLocation(this.pl, 'col'), 0.55, 0.62, 0.7, 0.55);
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.drawArrays(gl.LINES, 0, 6);
      { const loc = gl.getAttribLocation(this.pl, 'p'); if (loc >= 0) gl.disableVertexAttribArray(loc); }
      if (this.mode === 'surface') {
        gl.useProgram(this.pm); this._uniforms(this.pm);
        for (const mh of this.meshes) {
          this._attr(this.pm, 'p', mh.p, 3); this._attr(this.pm, 'nm', mh.n, 3); this._attr(this.pm, 'c', mh.c, 3);
          if (mh.i) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mh.i); gl.drawElements(gl.TRIANGLES, mh.count, gl.UNSIGNED_INT, 0); }
          else gl.drawArrays(gl.TRIANGLES, 0, mh.count);
        }
        ['p', 'nm', 'c'].forEach(nm => { const loc = gl.getAttribLocation(this.pm, nm); if (loc >= 0) gl.disableVertexAttribArray(loc); });
      } else if (this.cbuf) {
        gl.useProgram(this.pp); this._uniforms(this.pp);
        this._attr(this.pp, 'p', this.cbuf.p, 3); this._attr(this.pp, 'c', this.cbuf.c, 3);
        gl.uniform1f(gl.getUniformLocation(this.pp, 'size'), 2.4 * this.dpr);
        gl.uniform1f(gl.getUniformLocation(this.pp, 'alpha'), 0.7);
        gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        // the cutaway hides the points in the cut wedge by drawing only those outside it
        if (this.cutaway) { if (!this.cutIdx) this._cutCloud(); this._attr(this.pp, 'p', this.cutIdx.p, 3); this._attr(this.pp, 'c', this.cutIdx.c, 3); gl.drawArrays(gl.POINTS, 0, this.cutIdx.n); }
        else gl.drawArrays(gl.POINTS, 0, this.cloud.N);
        ['p', 'c'].forEach(nm => { const loc = gl.getAttribLocation(this.pp, nm); if (loc >= 0) gl.disableVertexAttribArray(loc); });
        gl.disable(gl.BLEND);
      }
    }
    _cutCloud() {
      const { pos, col, N } = this.cloud, P = [], C = [];
      for (let k = 0; k < N; k++) if (!(pos[3 * k] > 0 && pos[3 * k + 1] < 0)) { P.push(pos[3 * k], pos[3 * k + 1], pos[3 * k + 2]); C.push(col[3 * k], col[3 * k + 1], col[3 * k + 2]); }
      const gl = this.gl, mk = d => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d), gl.STATIC_DRAW); return b; };
      this.cutIdx = { p: mk(P), c: mk(C), n: P.length / 3, src: this.cloud };
    }
    _draw2D() {
      const c = this.ctx2d, d = this.dpr;
      c.setTransform(d, 0, 0, d, 0, 0);
      c.fillStyle = '#090d17'; c.fillRect(0, 0, this.W, this.Hh);
      if (!this.cloud) this._cloud();
      const { pos, col, N } = this.cloud;
      for (let k = 0; k < N; k += 1) {
        if (this.cutaway && pos[3 * k] > 0 && pos[3 * k + 1] < 0) continue;
        const q = this.project([pos[3 * k], pos[3 * k + 1], pos[3 * k + 2]]);
        c.fillStyle = `rgba(${Math.round(255 * col[3 * k])},${Math.round(255 * col[3 * k + 1])},${Math.round(255 * col[3 * k + 2])},0.4)`;
        c.fillRect(q[0] - 1, q[1] - 1, 2, 2);
      }
    }
    _drawOverlay() {
      const c = this.octx, d = this.dpr, B = this.F.B;
      c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, this.W, this.Hh);
      c.font = '700 13px Inter, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const [lab, p] of [['x', [1.04 * B, 0, 0]], ['y', [0, 1.04 * B, 0]], ['z', [0, 0, 1.04 * B]]]) {
        const q = this.project(p);
        c.fillStyle = 'rgba(200, 214, 228, 0.9)'; c.fillText(lab, q[0], q[1]);
      }
      // scale bar: a round number of Bohr radii
      const pxPerA = this._scale()[1] * this.Hh / 2, target = 70 / pxPerA, nice = [1, 2, 5, 10, 20, 50, 100].find(v => v >= target) || 100;
      const L = nice * pxPerA, x0 = 16, y0 = this.Hh - 18;
      c.strokeStyle = 'rgba(200, 214, 228, 0.85)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + L, y0); c.moveTo(x0, y0 - 4); c.lineTo(x0, y0 + 4); c.moveTo(x0 + L, y0 - 4); c.lineTo(x0 + L, y0 + 4); c.stroke();
      c.textAlign = 'left'; c.font = '600 12px Inter, system-ui, sans-serif'; c.fillStyle = 'rgba(200, 214, 228, 0.9)';
      c.fillText(`${nice} a = ${(nice * H.A0 * 10).toFixed(nice * H.A0 * 10 < 10 ? 2 : 1)} Å`, x0 + L + 8, y0);
    }

    // ---------- interaction ----------
    _bind() {
      const cv = this.overlay;
      let drag = null;
      cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, spin: this.spin }; this.spin = false; cv.classList.add('dragging'); });
      cv.addEventListener('pointermove', e => {
        if (!drag) return;
        this.yaw += (e.clientX - drag.x) * 0.01; this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch + (e.clientY - drag.y) * 0.01));
        drag.x = e.clientX; drag.y = e.clientY; this.draw();
      });
      const end = () => { if (!drag) return; drag = null; cv.classList.remove('dragging'); if (this.onUserRotate) this.onUserRotate(); };
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
      cv.addEventListener('keydown', e => {
        const k = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.12], ArrowDown: [0, 0.12] }[e.key];
        if (!k) return;
        e.preventDefault(); this.spin = false; this.yaw += k[0]; this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch + k[1])); this.draw();
        if (this.onUserRotate) this.onUserRotate();
      });
    }
    _loop(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      if (this.spin && !this.reduce && !this.paused && this.onscreen && this.F && document.visibilityState === 'visible') { this.yaw += 0.35 * dt; this.draw(); }
      this.raf = requestAnimationFrame(this._loop);
    }
    resetView() { this.yaw = -0.62; this.pitch = 0.38; this.draw(); }
  }

  window.OrbitalView = OrbitalView;
  window.OrbitalView._internals = { buildField, levelFor, surfaceNets, hue };
})();
