/* Paul trap lab: the two drawings that are not plots.
   SaddleView: a potential-energy surface over a plane, in 3D, with the ion as a ball. Drag to turn it.
   CrystalView: ions in a linear trap seen from the side, like a camera image of their fluorescence. */
(function () {
  'use strict';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const F = 'Inter, system-ui, sans-serif';
  const LOW = [31, 111, 180], HIGH = [196, 122, 18], MID = [241, 244, 246];
  const mix = (c1, c2, t) => c1.map((v, i) => Math.round(v + (c2[i] - v) * t));

  function fitCanvas(canvas, minH) {
    const box = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(240, Math.round(box.width)), h = Math.max(minH || 200, Math.round(box.height));
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [w, h];
  }

  class SaddleView {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.az = -0.62; this.el = 0.52; this.scene = null;
      this._resize();
      const redraw = () => { this._resize(); if (this.scene) this.draw(this.scene); };
      if ('ResizeObserver' in window) new ResizeObserver(redraw).observe(canvas.parentElement); else window.addEventListener('resize', redraw);
      let drag = null;
      canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, az: this.az, el: this.el }; canvas.setPointerCapture(e.pointerId); canvas.classList.add('is-dragging'); });
      canvas.addEventListener('pointermove', e => {
        if (!drag) return;
        this.az = drag.az + (e.clientX - drag.x) * 0.01;
        this.el = clamp(drag.el + (e.clientY - drag.y) * 0.008, 0.12, 1.3);
        if (this.scene) this.draw(this.scene);
      });
      const end = () => { drag = null; canvas.classList.remove('is-dragging'); };
      canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
      canvas.addEventListener('keydown', e => {
        const k = { ArrowLeft: [-0.15, 0], ArrowRight: [0.15, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] }[e.key];
        if (!k) return;
        e.preventDefault(); this.az += k[0]; this.el = clamp(this.el + k[1], 0.12, 1.3);
        if (this.scene) this.draw(this.scene);
      });
    }
    _resize() {
      [this.w, this.h] = fitCanvas(this.canvas, 220);
      this.s = Math.min(this.w / 3.1, this.h / 2.25);
      this.cx = this.w / 2; this.cy = this.h / 2 + this.s * 0.1;
    }
    P(X, Y, Z) {
      const ca = Math.cos(this.az), sa = Math.sin(this.az), ce = Math.cos(this.el), se = Math.sin(this.el);
      const x1 = X * ca - Y * sa, y1 = X * sa + Y * ca;
      return [this.cx + x1 * this.s, this.cy - (Z * ce + y1 * se) * this.s, -y1 * ce + Z * se];
    }
    /* scene: { f(u, v) -> height, ball: {u, v} | null, trail: [[u, v], ...], labels: ['x', 'y'],
                rods: [{u, v, sign}], tag: 'text', tagColor } */
    draw(scene) {
      this.scene = scene;
      const c = this.ctx, n = 22, f = scene.f;
      c.clearRect(0, 0, this.w, this.h);
      const pts = [];
      for (let i = 0; i <= n; i++) {
        pts.push([]);
        for (let j = 0; j <= n; j++) { const u = -1 + 2 * i / n, v = -1 + 2 * j / n, z = f(u, v); pts[i].push({ u, v, z, p: this.P(u, v, z) }); }
      }
      const items = [];
      const L = [-0.35, -0.45, 0.82], Ln = Math.hypot(...L);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const a = pts[i][j], b = pts[i + 1][j], d = pts[i][j + 1], e = pts[i + 1][j + 1];
        const zm = (a.z + b.z + d.z + e.z) / 4;
        // normal from the two diagonals, for a little shading
        const ux = 2 / n, nx = -(b.z - a.z + e.z - d.z) / 2 / ux, ny = -(d.z - a.z + e.z - b.z) / 2 / ux, nz = 1;
        const lam = (nx * L[0] + ny * L[1] + nz * L[2]) / (Math.hypot(nx, ny, nz) * Ln);
        const t = clamp(zm / 0.24, -1, 1);
        let col = t < 0 ? mix(MID, LOW, -t * 0.85) : mix(MID, HIGH, t * 0.85);
        const sh = 0.78 + 0.22 * lam;
        col = col.map(v => Math.round(clamp(v * sh, 0, 255)));
        items.push({ depth: (a.p[2] + b.p[2] + d.p[2] + e.p[2]) / 4, draw: () => {
          c.beginPath(); c.moveTo(a.p[0], a.p[1]); c.lineTo(b.p[0], b.p[1]); c.lineTo(e.p[0], e.p[1]); c.lineTo(d.p[0], d.p[1]); c.closePath();
          c.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; c.fill();
          c.strokeStyle = 'rgba(20, 35, 44, 0.13)'; c.lineWidth = 0.7; c.stroke();
        } });
      }
      (scene.rods || []).forEach(r => {
        const b = this.P(r.u, r.v, -0.55), t = this.P(r.u, r.v, 0.55), col = r.sign > 0 ? '#d9495f' : '#3f74d6';
        items.push({ depth: (b[2] + t[2]) / 2, draw: () => {
          c.strokeStyle = col; c.lineCap = 'round'; c.lineWidth = Math.max(8, this.s * 0.09);
          c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(t[0], t[1]); c.stroke();
          c.fillStyle = '#fff'; c.font = `800 ${Math.round(Math.max(11, this.s * 0.085))}px ${F}`; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(r.sign > 0 ? '+' : '−', t[0], t[1] + 2);
        } });
      });
      let ballP = null;
      if (scene.ball) {
        const { u, v } = scene.ball;
        ballP = this.P(u, v, f(u, v) + 0.06);
        items.push({ depth: ballP[2] + 0.08, draw: () => {
          const r = Math.max(6, this.s * 0.07), g = c.createRadialGradient(ballP[0] - r * 0.35, ballP[1] - r * 0.4, r * 0.15, ballP[0], ballP[1], r);
          g.addColorStop(0, '#f7d9e8'); g.addColorStop(0.45, '#a3326c'); g.addColorStop(1, '#5a1438');
          c.beginPath(); c.arc(ballP[0], ballP[1], r, 0, Math.PI * 2); c.fillStyle = g; c.fill();
        } });
      }
      items.sort((p, q) => p.depth - q.depth).forEach(it => it.draw());
      // the trail goes on top, fading toward its start
      const tr = scene.trail || [];
      if (tr.length > 1) {
        c.lineWidth = 2; c.lineJoin = 'round'; c.lineCap = 'round';
        for (let k = 1; k < tr.length; k++) {
          const p0 = this.P(tr[k - 1][0], tr[k - 1][1], f(tr[k - 1][0], tr[k - 1][1]) + 0.03), p1 = this.P(tr[k][0], tr[k][1], f(tr[k][0], tr[k][1]) + 0.03);
          c.strokeStyle = `rgba(163, 50, 108, ${(0.12 + 0.75 * k / tr.length).toFixed(3)})`;
          c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.stroke();
        }
      }
      if (ballP) {   // redraw the ball over its own trail
        const r = Math.max(6, this.s * 0.07), g = c.createRadialGradient(ballP[0] - r * 0.35, ballP[1] - r * 0.4, r * 0.15, ballP[0], ballP[1], r);
        g.addColorStop(0, '#f7d9e8'); g.addColorStop(0.45, '#a3326c'); g.addColorStop(1, '#5a1438');
        c.beginPath(); c.arc(ballP[0], ballP[1], r, 0, Math.PI * 2); c.fillStyle = g; c.fill();
      }
      // axis names at the edges of the surface
      const lab = scene.labels || ['x', 'y'];
      c.font = `italic 700 13px ${F}`; c.fillStyle = '#5f7382'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const off = scene.rods && scene.rods.length ? 1.5 : 1.22;
      [[off, 0, lab[0]], [0, off, lab[1]]].forEach(([u, v, t]) => { const p = this.P(u, v, f(Math.min(u, 1), Math.min(v, 1))); c.fillText(t, p[0], p[1]); });
      if (scene.tag) {
        c.font = `700 13px ${F}`; c.textAlign = 'left'; c.textBaseline = 'top';
        const w = c.measureText(scene.tag).width + 16;
        c.fillStyle = 'rgba(255, 255, 255, 0.88)'; c.fillRect(8, 8, w, 24);
        c.fillStyle = scene.tagColor || '#14232c'; c.fillText(scene.tag, 16, 13);
      }
    }
  }

  class CrystalView {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.scene = null;
      this._resize();
      const redraw = () => { this._resize(); if (this.scene) this.draw(this.scene); };
      if ('ResizeObserver' in window) new ResizeObserver(redraw).observe(canvas.parentElement); else window.addEventListener('resize', redraw);
    }
    _resize() { [this.w, this.h] = fitCanvas(this.canvas, 180); }
    /* scene: { ions: [[z, x], ...] in units of l, frame: {z, x} half-widths to fit, lUm: l in micrometres,
                arrows: [[dz, dx], ...] or null, tag } */
    draw(scene) {
      this.scene = scene;
      const c = this.ctx, W = this.w, H = this.h;
      c.clearRect(0, 0, W, H);
      c.fillStyle = '#0b1820'; c.beginPath(); c.roundRect ? c.roundRect(0, 0, W, H, 10) : c.rect(0, 0, W, H); c.fill();
      // electrodes: RF rods above and below, end caps at the ends
      c.fillStyle = 'rgba(176, 196, 206, 0.16)';
      c.fillRect(54, 10, W - 108, 12); c.fillRect(54, H - 22, W - 108, 12);
      c.fillRect(14, H / 2 - 26, 18, 52); c.fillRect(W - 32, H / 2 - 26, 18, 52);
      c.font = `600 11px ${F}`; c.fillStyle = 'rgba(200, 216, 224, 0.55)'; c.textAlign = 'center'; c.textBaseline = 'top';
      c.fillText('RF rod', W / 2, 25); c.textBaseline = 'bottom'; c.fillText('RF rod', W / 2, H - 25);
      c.save(); c.translate(23, H / 2); c.rotate(-Math.PI / 2); c.textBaseline = 'middle'; c.fillText('end cap', 0, 20); c.restore();
      c.save(); c.translate(W - 23, H / 2); c.rotate(Math.PI / 2); c.textBaseline = 'middle'; c.fillText('end cap', 0, 20); c.restore();
      // trap axis
      c.strokeStyle = 'rgba(200, 216, 224, 0.18)'; c.setLineDash([4, 5]); c.lineWidth = 1;
      c.beginPath(); c.moveTo(60, H / 2); c.lineTo(W - 60, H / 2); c.stroke(); c.setLineDash([]);
      const narrow = W < 520, fr = scene.frame, sc = Math.min((W - (narrow ? 96 : 150)) / (2 * fr.z), (H - 80) / (2 * fr.x), 90);
      this.scale = sc;
      const X = z => W / 2 + z * sc, Y = x => H / 2 - x * sc;
      // ions as glowing spots
      scene.ions.forEach(([z, x]) => {
        const px = X(z), py = Y(x);
        if (px < 40 || px > W - 40 || py < 26 || py > H - 26) return;
        const r = clamp(sc * 0.28, 5, 16), g = c.createRadialGradient(px, py, 0, px, py, r * 1.9);
        g.addColorStop(0, 'rgba(232, 240, 255, 1)'); g.addColorStop(0.25, 'rgba(150, 170, 255, 0.95)'); g.addColorStop(0.6, 'rgba(110, 90, 230, 0.35)'); g.addColorStop(1, 'rgba(110, 90, 230, 0)');
        c.fillStyle = g; c.beginPath(); c.arc(px, py, r * 1.9, 0, Math.PI * 2); c.fill();
      });
      // mode shape: one arrow per ion
      if (scene.arrows) {
        c.strokeStyle = '#f2a541'; c.fillStyle = '#f2a541'; c.lineWidth = 2.2;
        scene.ions.forEach(([z, x], i) => {
          const [dz, dx] = scene.arrows[i], L = Math.hypot(dz, dx);
          if (L < 1e-3) return;
          const x0 = X(z), y0 = Y(x), x1 = X(z + dz), y1 = Y(x + dx), ux = (x1 - x0) / Math.hypot(x1 - x0, y1 - y0), uy = (y1 - y0) / Math.hypot(x1 - x0, y1 - y0);
          c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
          c.beginPath(); c.moveTo(x1 + ux * 6, y1 + uy * 6); c.lineTo(x1 - uy * 4.5, y1 + ux * 4.5); c.lineTo(x1 + uy * 4.5, y1 - ux * 4.5); c.closePath(); c.fill();
        });
      }
      // scale bar
      const um = sc / scene.lUm, nice = [1, 2, 5, 10, 20, 50].find(v => v * um >= 50) || 50, bw = nice * um;
      c.fillStyle = 'rgba(232, 240, 255, 0.85)'; c.fillRect(W - 60 - bw, H - 44, bw, 3);
      c.font = `600 11.5px ${F}`; c.textAlign = 'center'; c.textBaseline = 'bottom'; c.fillText(`${nice} µm`, W - 60 - bw / 2, H - 47);
      if (scene.tag) { c.font = `700 12.5px ${F}`; c.textAlign = 'left'; c.textBaseline = narrow ? 'top' : 'bottom'; c.fillStyle = 'rgba(232, 240, 255, 0.9)'; c.fillText(scene.tag, narrow ? 44 : 60, narrow ? 40 : H - 40); }
    }
  }

  window.TrapViews = { SaddleView, CrystalView };
})();
