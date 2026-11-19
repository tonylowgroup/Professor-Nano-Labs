/* Pictures for the quantum metric lab that the Berry phase lab does not already have: a shaded 3D surface with
   arrows and curves on it, and a sequential colour map for the quantum metric. */
(function () {
  'use strict';
  const INK = '#14232c', MUTED = '#5f7382', FONT = 'Inter, system-ui, sans-serif', DEG = Math.PI / 180;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  function fitCanvas(canvas, ctx) {
    const box = canvas.parentElement.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(160, Math.round(box.width)), h = Math.max(160, Math.round(box.height));
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  /* A surface drawn as shaded patches, back to front, with curves, arrows and dots laid on top.
     scene = { quads: [{ p: [4 points], n: normal }], extent, curves: [{ pts, color, width, dash }],
               arrows: [{ a, b, color, width, label }], dots: [{ v, color, r, ring }], caption, notes: [text] } */
  class SurfaceView {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.scene = null;
      this.az = 35 * DEG; this.el = 30 * DEG;
      Object.assign(this, fitCanvas(canvas, this.ctx));
      const redo = () => { Object.assign(this, fitCanvas(canvas, this.ctx)); this.draw(this.scene); };
      if ('ResizeObserver' in window) new ResizeObserver(redo).observe(canvas.parentElement); else window.addEventListener('resize', redo);
      let drag = null;
      canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, az: this.az, el: this.el }; canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener('pointermove', e => { if (drag) this.setView(drag.az - (e.clientX - drag.x) * 0.012, drag.el + (e.clientY - drag.y) * 0.012); });
      const end = () => { drag = null; };
      canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
      canvas.addEventListener('keydown', e => {
        const m = { ArrowLeft: [6, 0], ArrowRight: [-6, 0], ArrowUp: [0, 6], ArrowDown: [0, -6] }[e.key];
        if (!m) return;
        e.preventDefault(); this.setView(this.az + m[0] * DEG, this.el + m[1] * DEG);
      });
    }
    setView(az, el) { this.az = az; this.el = Math.max(-85 * DEG, Math.min(85 * DEG, el)); this.draw(this.scene); }
    // look straight at a point from the side its normal faces
    aim(n) { this.setView(Math.atan2(n[1], n[0]), Math.max(-60 * DEG, Math.min(60 * DEG, Math.asin(Math.max(-1, Math.min(1, n[2])))))); }
    _basis() {
      const ca = Math.cos(this.az), sa = Math.sin(this.az), ce = Math.cos(this.el), se = Math.sin(this.el);
      return { r: [-sa, ca, 0], u: [-se * ca, -se * sa, ce], f: [ce * ca, ce * sa, se] };
    }
    project(v) {
      const b = this.B, s = this.S, c = this.C;
      return { x: this.w / 2 + s * (dot(b.r, v) - c[0]), y: this.h / 2 + 8 - s * (dot(b.u, v) - c[1]), d: dot(b.f, v) };
    }
    _arrow(a, b, color, width, dash) {
      const c = this.ctx, P = this.project(a), Q = this.project(b), dx = Q.x - P.x, dy = Q.y - P.y, len = Math.hypot(dx, dy);
      if (len < 2) return;
      const head = Math.min(10, 0.45 * len + 2), ux = dx / len, uy = dy / len;
      c.save(); c.strokeStyle = color; c.fillStyle = color; c.lineWidth = width; c.lineCap = 'round';
      if (dash) c.setLineDash(dash);
      c.beginPath(); c.moveTo(P.x, P.y); c.lineTo(Q.x - ux * head * 0.7, Q.y - uy * head * 0.7); c.stroke();
      c.setLineDash([]);
      c.beginPath(); c.moveTo(Q.x, Q.y);
      c.lineTo(Q.x - ux * head - uy * head * 0.45, Q.y - uy * head + ux * head * 0.45);
      c.lineTo(Q.x - ux * head + uy * head * 0.45, Q.y - uy * head - ux * head * 0.45);
      c.closePath(); c.fill(); c.restore();
      return Q;
    }
    _text(t, x, y, color, size, bold, align) {
      const c = this.ctx;
      c.save(); c.font = `${bold ? 700 : 600} ${size || 12}px ${FONT}`; c.fillStyle = color || INK; c.textAlign = align || 'center'; c.textBaseline = 'middle';
      c.lineWidth = 3.5; c.strokeStyle = 'rgba(255,255,255,.92)'; c.lineJoin = 'round';
      c.strokeText(t, x, y); c.fillText(t, x, y); c.restore();
    }
    draw(scene) {
      this.scene = scene;
      const c = this.ctx;
      c.clearRect(0, 0, this.w, this.h);
      if (!scene) return;
      this.B = this._basis();
      // scale so that the whole surface fits, centred on the middle of its extent
      const ex = scene.extent, mid = [(ex[0] + ex[1]) / 2, (ex[2] + ex[3]) / 2, (ex[4] + ex[5]) / 2], rad = Math.max(0.5, scene.radius || Math.hypot(ex[1] - ex[0], ex[3] - ex[2], ex[5] - ex[4]) / 2);
      const room = (scene.notes && scene.notes.length ? 16 * scene.notes.length + 8 : 0);
      this.S = (Math.min(this.w, this.h - room) / 2 - 18) / rad; this.C = [dot(this.B.r, mid), dot(this.B.u, mid) + room / 2 / this.S];
      // the patches, far ones first, shaded by how squarely they face the light
      const light = [0.35, -0.3, 0.88], L = Math.hypot(...light), quads = scene.quads.map(q => ({ q, d: (dot(this.B.f, q.p[0]) + dot(this.B.f, q.p[2])) / 2 })).sort((a, b) => a.d - b.d);
      quads.forEach(({ q }) => {
        const P = q.p.map(v => this.project(v)), facing = dot(q.n, this.B.f), lam = 0.55 + 0.45 * Math.abs(dot(q.n, light) / L);
        const base = facing >= 0 ? [251, 242, 221] : [238, 228, 206], col = base.map(x => Math.round(x * lam + (1 - lam) * 120));
        c.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; c.strokeStyle = 'rgba(148, 102, 0, .35)'; c.lineWidth = 0.8;
        c.beginPath(); P.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.fill(); c.stroke();
      });
      (scene.curves || []).forEach(k => {
        c.save(); c.strokeStyle = k.color; c.lineWidth = k.width || 2.4; c.lineJoin = 'round'; c.lineCap = 'round'; if (k.dash) c.setLineDash(k.dash);
        c.beginPath(); k.pts.forEach((v, i) => { const P = this.project(v); if (i) c.lineTo(P.x, P.y); else c.moveTo(P.x, P.y); }); c.stroke(); c.restore();
      });
      (scene.dots || []).forEach(d => {
        const P = this.project(d.v);
        c.save(); c.fillStyle = d.ring ? '#fff' : d.color; c.strokeStyle = d.color; c.lineWidth = 2;
        c.beginPath(); c.arc(P.x, P.y, d.r || 4, 0, 2 * Math.PI); c.fill(); if (d.ring) c.stroke(); c.restore();
      });
      (scene.arrows || []).forEach(a => {
        const Q = this._arrow(a.a, a.b, a.color, a.width || 3, a.dash);
        if (Q && a.label) { const P = this.project(a.a), dx = Q.x - P.x, dy = Q.y - P.y, l = Math.hypot(dx, dy) || 1; this._text(a.label, Q.x + 12 * dx / l, Q.y + 12 * dy / l, a.color, 12.5, true); }
      });
      if (scene.caption) { c.save(); c.font = `700 13px ${FONT}`; c.fillStyle = INK; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(scene.caption, 10, 8); c.restore(); }
      (scene.notes || []).forEach((n, i, all) => this._text(n.text || n, 10, this.h - 10 - 16 * (all.length - 1 - i), n.color || INK, 12, !!n.bold, 'left'));
    }
  }

  /* A sequential colour map, white to the track's gold-brown, saturating softly at ref. */
  const LO = [255, 255, 255], HI = [120, 82, 0];
  function seqColor(s) { const a = Math.max(0, Math.min(1, s)); return LO.map((x, i) => x + (HI[i] - x) * a); }
  function seqCanvas(f, box, nx, ny, ref) {
    const cv = document.createElement('canvas'); cv.width = nx; cv.height = ny;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(nx, ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const kx = box[0] + (box[1] - box[0]) * (i + 0.5) / nx, ky = box[3] - (box[3] - box[2]) * (j + 0.5) / ny;
      const v = f(kx, ky), col = seqColor(Number.isFinite(v) ? Math.tanh(v / ref) : 1), o = 4 * (j * nx + i);
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  window.MetricViews = { SurfaceView, seqCanvas, seqColor };
})();
