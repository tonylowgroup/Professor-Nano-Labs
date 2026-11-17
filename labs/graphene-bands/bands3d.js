/* Graphene's two bands over the Brillouin zone in 3D, with plain WebGL (no libraries).
   Both bands are drawn over a disc a little larger than the zone, so the six Dirac cones at its corners are whole.
   A translucent plane marks the Fermi level, and the bands glow white where they cross it (the Fermi contour).
   The hexagon of the first Brillouin zone is drawn on that plane. Needs window.Gr. */
(function () {
  'use strict';
  const G = window.Gr;
  const S3 = Math.sqrt(3);

  const VS = `attribute vec3 p; attribute vec3 nm; attribute float e; uniform mat3 R; uniform vec3 S; varying vec3 vn; varying float ve;
    void main() { vec3 q = R * p; vn = R * nm; ve = e; gl_Position = vec4(q.x * S.x, q.y * S.y, -q.z * S.z, 1.0); }`;
  const FS = `precision mediump float; varying vec3 vn; varying float ve; uniform float ef; uniform float w; uniform float emax;
    vec3 ramp(float x) {            // x in [-1, 1]: deep blue -> pale at 0 -> deep orange
      vec3 lo = vec3(0.12, 0.30, 0.66), mid = vec3(0.86, 0.90, 0.95), hi = vec3(0.80, 0.30, 0.10);
      return x < 0.0 ? mix(mid, lo, pow(-x, 0.7)) : mix(mid, hi, pow(x, 0.7)); }
    void main() { vec3 n = normalize(vn); if (n.z < 0.0) n = -n; vec3 L = normalize(vec3(0.3, 0.6, 1.0));
      float d = max(dot(n, L), 0.0); float s = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 30.0);
      vec3 c = ramp(clamp(ve / emax, -1.0, 1.0)) * (0.38 + 0.66 * d) + vec3(0.22 * s);
      float k = 1.0 - smoothstep(0.0, w, abs(ve - ef)); c = mix(c, vec3(1.0, 0.97, 0.75), 0.92 * k);
      gl_FragColor = vec4(c, 1.0); }`;
  const VS_FLAT = `attribute vec3 p; uniform mat3 R; uniform vec3 S; void main() { vec3 q = R * p; gl_Position = vec4(q.x * S.x, q.y * S.y, -q.z * S.z, 1.0); }`;
  const FS_FLAT = `precision mediump float; uniform vec4 col; void main() { gl_FragColor = col; }`;

  function program(gl, vs, fs) {
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  class BandView {
    constructor(canvas, overlay) {
      this.canvas = canvas; this.overlay = overlay; this.octx = overlay.getContext('2d');
      this.yaw = -0.5; this.pitch = 0.3; this.spin = true; this.onscreen = true;
      this.Rk = 100 / 82 * 2 * G.KK / S3;           // k radius of the disc (|GK| falls on mesh circle 82 of 100), nm^-1
      try {
        const gl = canvas.getContext('webgl', { antialias: true }) || canvas.getContext('experimental-webgl');
        if (!gl) throw new Error('no WebGL');
        this.gl = gl; this.uint = !!gl.getExtension('OES_element_index_uint');
        this.pb = program(gl, VS, FS); this.pf = program(gl, VS_FLAT, FS_FLAT);
        this.buf = {};
      } catch (e) { this.gl = null; }
      this._bind(); this._resize();
      if ('ResizeObserver' in window) new ResizeObserver(() => { this._resize(); this.draw(); }).observe(canvas.parentElement);
      if ('IntersectionObserver' in window) new IntersectionObserver(es => { this.onscreen = es[0].isIntersecting; }).observe(canvas.parentElement);
      this.last = 0; this._loop = this._loop.bind(this); requestAnimationFrame(this._loop);
    }
    get webgl() { return !!this.gl; }

    /* p: { t, tp, D }; Ef in eV */
    set(p, Ef) {
      const key = `${p.t}|${p.tp}|${p.D}`;
      this.Ef = Ef;
      this.emax = 3 * p.t + 9 * Math.abs(p.tp) + Math.abs(p.D);
      this.zs = 0.55 / this.emax;                     // energy -> height in units of the disc radius
      if (this.key !== key && this.gl) { this._mesh(p); this.key = key; }
      this.p = p;
      this.draw();
    }
    _mesh(p) {
      /* a polar mesh: circles of radius r_i = R i / NR and NA spokes. NA is a multiple of 12 and |GK| = R 82 / NR,
         so every K and K' point is a vertex and the cone tips stay sharp; the rim of the disc is smooth. */
      const NR = 100, NA = 360, R = this.Rk, gl = this.gl, zs = this.zs;
      const nv = 1 + NR * NA, at = (i, j) => (i === 0 ? 0 : 1 + (i - 1) * NA + (j % NA));
      const make = band => {
        const P = new Float32Array(3 * nv), Nn = new Float32Array(3 * nv), E = new Float32Array(nv);
        const put = (k, kx, ky) => {
          const e = G.bands(kx, ky, p)[band];
          P[3 * k] = kx / R; P[3 * k + 1] = ky / R; P[3 * k + 2] = e * zs; E[k] = e;
        };
        put(0, 0, 0);
        for (let i = 1; i <= NR; i++) for (let j = 0; j < NA; j++) { const r = R * i / NR, a = 2 * Math.PI * j / NA; put(at(i, j), r * Math.cos(a), r * Math.sin(a)); }
        const I = [];
        for (let j = 0; j < NA; j++) I.push(0, at(1, j), at(1, j + 1));
        for (let i = 1; i < NR; i++) for (let j = 0; j < NA; j++) {
          const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
          I.push(a, b, c, a, c, d);
        }
        // vertex normals: the area-weighted sum of the normals of the triangles that meet there
        for (let q = 0; q < I.length; q += 3) {
          const a = 3 * I[q], b = 3 * I[q + 1], c = 3 * I[q + 2];
          const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }          // all facing up
          for (const v of [a, b, c]) { Nn[v] += nx; Nn[v + 1] += ny; Nn[v + 2] += nz; }
        }
        for (let v = 0; v < Nn.length; v += 3) { const n = Math.hypot(Nn[v], Nn[v + 1], Nn[v + 2]) || 1; Nn[v] /= n; Nn[v + 1] /= n; Nn[v + 2] /= n; }
        return { P, Nn, E, I: new Uint32Array(I) };
      };
      for (const old of this.meshes || []) ['p', 'n', 'e', 'i'].forEach(k => old[k] && gl.deleteBuffer(old[k]));
      this.meshes = [0, 1].map(band => {
        let { P, Nn, E, I } = make(band);
        if (!this.uint) {
          const ex = (a, w) => { const o = new Float32Array(I.length * w); for (let q = 0; q < I.length; q++) for (let k = 0; k < w; k++) o[q * w + k] = a[I[q] * w + k]; return o; };
          P = ex(P, 3); Nn = ex(Nn, 3); E = ex(E, 1); I = null;
        }
        const mk = (d, target = gl.ARRAY_BUFFER) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, d, gl.STATIC_DRAW); return b; };
        return { p: mk(P), n: mk(Nn), e: mk(E), i: I ? mk(I, gl.ELEMENT_ARRAY_BUFFER) : null, count: I ? I.length : P.length / 3 };
      });
    }
    _rot() {
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      return [[cy, -sy, 0], [sp * sy, sp * cy, cp], [-cp * sy, -cp * cy, sp]];
    }
    _scale() { const s = 0.98; return this.W > this.H ? [s * this.H / this.W, s, 0.3] : [s, s * this.W / this.H, 0.3]; }
    project(p) {
      const R = this._rot(), S = this._scale(), v = R.map(r => r[0] * p[0] + r[1] * p[1] + r[2] * p[2]);
      return [(v[0] * S[0] + 1) / 2 * this.W, (1 - v[1] * S[1]) / 2 * this.H];
    }
    _resize() {
      const r = this.canvas.parentElement.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = Math.max(10, r.width); this.H = Math.max(10, r.height); this.dpr = dpr;
      for (const c of [this.canvas, this.overlay]) { c.width = Math.round(this.W * dpr); c.height = Math.round(this.H * dpr); }
    }
    _uni(p) {
      const gl = this.gl, R = this._rot(), S = this._scale();
      gl.uniformMatrix3fv(gl.getUniformLocation(p, 'R'), false, new Float32Array([R[0][0], R[1][0], R[2][0], R[0][1], R[1][1], R[2][1], R[0][2], R[1][2], R[2][2]]));
      gl.uniform3fv(gl.getUniformLocation(p, 'S'), new Float32Array(S));
    }
    _attr(p, name, buf, size) { const gl = this.gl, loc = gl.getAttribLocation(p, name); if (loc < 0) return -1; gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); return loc; }
    draw() {
      if (!this.p || this.W < 20) return;
      if (!this.gl) { this._drawOverlay(); return; }
      const gl = this.gl, zf = this.Ef * this.zs;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0.035, 0.05, 0.09, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(true);
      // the bands
      gl.useProgram(this.pb); this._uni(this.pb);
      gl.uniform1f(gl.getUniformLocation(this.pb, 'ef'), this.Ef);
      gl.uniform1f(gl.getUniformLocation(this.pb, 'w'), 0.012 * this.emax);
      gl.uniform1f(gl.getUniformLocation(this.pb, 'emax'), this.emax);
      for (const mh of this.meshes) {
        const l1 = this._attr(this.pb, 'p', mh.p, 3), l2 = this._attr(this.pb, 'nm', mh.n, 3), l3 = this._attr(this.pb, 'e', mh.e, 1);
        if (mh.i) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mh.i); gl.drawElements(gl.TRIANGLES, mh.count, gl.UNSIGNED_INT, 0); }
        else gl.drawArrays(gl.TRIANGLES, 0, mh.count);
        [l1, l2, l3].forEach(l => l >= 0 && gl.disableVertexAttribArray(l));
      }
      // the Brillouin zone hexagon and axes, on the Fermi plane
      gl.useProgram(this.pf); this._uni(this.pf);
      const hex = [];
      for (let i = 0; i <= 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3, r = 2 * G.KK / S3 / this.Rk; hex.push(r * Math.cos(a), r * Math.sin(a), zf); }
      this._lines(new Float32Array(hex), gl.LINE_STRIP, [1, 1, 1, 0.75]);
      this._lines(new Float32Array([-1.08, 0, zf, 1.08, 0, zf, 0, -1.08, zf, 0, 1.08, zf]), gl.LINES, [0.6, 0.66, 0.74, 0.6]);
      // the translucent Fermi plane
      const disc = [0, 0, zf];
      for (let i = 0; i <= 72; i++) { const a = 2 * Math.PI * i / 72; disc.push(1.04 * Math.cos(a), 1.04 * Math.sin(a), zf); }
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      this._lines(new Float32Array(disc), gl.TRIANGLE_FAN, [0.95, 0.93, 0.8, 0.2]);
      gl.depthMask(true); gl.disable(gl.BLEND);
      this._drawOverlay();
    }
    _lines(data, mode, col) {
      const gl = this.gl;
      if (!this.buf.tmp) this.buf.tmp = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.tmp); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      const loc = this._attr(this.pf, 'p', this.buf.tmp, 3);
      gl.uniform4f(gl.getUniformLocation(this.pf, 'col'), ...col);
      gl.drawArrays(mode, 0, data.length / 3);
      if (loc >= 0) gl.disableVertexAttribArray(loc);
    }
    _drawOverlay() {
      const c = this.octx, d = this.dpr, zf = this.Ef * this.zs;
      c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, this.W, this.H);
      if (!this.gl) {
        c.fillStyle = '#090d17'; c.fillRect(0, 0, this.W, this.H);
        c.fillStyle = '#f4d58d'; c.font = '600 13px Inter, system-ui, sans-serif'; c.textAlign = 'center';
        c.fillText('Your browser cannot draw 3D graphics here (WebGL is off).', this.W / 2, this.H / 2 - 8);
        c.fillText('The map and plots below show the same bands.', this.W / 2, this.H / 2 + 12);
        return;
      }
      c.font = '700 13px Inter, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const lab = (txt, k, z, col) => { const q = this.project([k[0] / this.Rk, k[1] / this.Rk, z]); c.fillStyle = col; c.fillText(txt, q[0], q[1]); };
      const r = 2 * G.KK / S3;
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + i * Math.PI / 3;
        lab(i % 2 ? 'K′' : 'K', [1.1 * r * Math.cos(a), 1.1 * r * Math.sin(a)], zf, 'rgba(255, 240, 200, 0.95)');
      }
      lab('Γ', [0.06 * r, 0.06 * r], zf + 0.02, 'rgba(255, 240, 200, 0.95)');
      c.font = '600 12px Inter, system-ui, sans-serif';
      lab('kx', [1.18 * this.Rk, 0], zf, 'rgba(190, 204, 220, 0.9)'); lab('ky', [0, 1.18 * this.Rk], zf, 'rgba(190, 204, 220, 0.9)');
      c.textAlign = 'left'; c.fillStyle = 'rgba(220, 228, 236, 0.92)';
      c.fillText(`Fermi level ${Math.abs(this.Ef) < 0.005 ? '' : this.Ef > 0 ? '+' : '−'}${Math.abs(this.Ef).toFixed(2)} eV`, 14, this.H - 16);
    }
    _bind() {
      const cv = this.overlay;
      let drag = null;
      cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY }; this.spin = false; cv.classList.add('dragging'); });
      cv.addEventListener('pointermove', e => {
        if (!drag) return;
        this.yaw += (e.clientX - drag.x) * 0.01; this.pitch = Math.max(-0.2, Math.min(1.5, this.pitch + (e.clientY - drag.y) * 0.01));
        drag.x = e.clientX; drag.y = e.clientY; this.draw();
      });
      const end = () => { if (!drag) return; drag = null; cv.classList.remove('dragging'); if (this.onUserRotate) this.onUserRotate(); };
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
      cv.addEventListener('keydown', e => {
        const k = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] }[e.key];
        if (!k) return;
        e.preventDefault(); this.spin = false; this.yaw += k[0]; this.pitch = Math.max(-0.2, Math.min(1.5, this.pitch + k[1])); this.draw();
        if (this.onUserRotate) this.onUserRotate();
      });
    }
    _loop(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      if (this.spin && !this.reduce && !this.paused && this.onscreen && this.p && document.visibilityState === 'visible') { this.yaw += 0.25 * dt; this.draw(); }
      requestAnimationFrame(this._loop);
    }
    resetView() { this.yaw = -0.5; this.pitch = 0.3; this.draw(); }
  }

  window.BandView3D = BandView;
})();
