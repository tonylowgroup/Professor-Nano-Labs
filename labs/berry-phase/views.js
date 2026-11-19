/* Pictures for the Berry phase lab: a sphere of directions with loops and tangent arrows (built on the shared
   BlochSphere), a dial for phases, and a map of the Brillouin zone (built on NanoPlot) with the Berry curvature,
   the Berry connection and a loop that can be dragged. */
(function () {
  'use strict';
  const NOLABELS = { z0: '', z1: '', xp: '', xm: '', yp: '', ym: '' };
  const INK = '#14232c', MUTED = '#5f7382';
  const FONT = 'Inter, system-ui, sans-serif';

  function fitCanvas(canvas, ctx) {
    const box = canvas.parentElement.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(160, Math.round(box.width)), h = Math.max(160, Math.round(box.height));
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }
  /* scene = { arrows: [{ v, color, label }], trail: [{ pts, color }], curves: [{ pts, color, width, dash }],
               vecs: [{ a, b, color, width, dash }], dots: [{ v, color, r, ring }], tags: [{ v, text, color }], caption } */
  class GeoSphere extends BlochSphere {
    constructor(canvas) { super(canvas, { az: 32, el: 22, labels: NOLABELS }); }
    _vec(a, b, color, width, dash) {
      const c = this.ctx, P = this.project(a), Q = this.project(b);
      const dx = Q.x - P.x, dy = Q.y - P.y, len = Math.hypot(dx, dy);
      if (len < 2) return;
      const head = Math.min(9, 0.45 * len + 2), ux = dx / len, uy = dy / len;
      c.save();
      c.globalAlpha = (a[0] * this.B.f[0] + a[1] * this.B.f[1] + a[2] * this.B.f[2]) < -0.05 ? 0.45 : 1;
      c.strokeStyle = color; c.fillStyle = color; c.lineWidth = width; c.lineCap = 'round';
      if (dash) c.setLineDash(dash);
      c.beginPath(); c.moveTo(P.x, P.y); c.lineTo(Q.x - ux * head * 0.7, Q.y - uy * head * 0.7); c.stroke();
      c.setLineDash([]);
      c.beginPath(); c.moveTo(Q.x, Q.y);
      c.lineTo(Q.x - ux * head - uy * head * 0.45, Q.y - uy * head + ux * head * 0.45);
      c.lineTo(Q.x - ux * head + uy * head * 0.45, Q.y - uy * head - ux * head * 0.45);
      c.closePath(); c.fill();
      c.restore();
    }
    draw(scene) {
      const S = scene || {};
      // the base class draws the sphere, trails and arrows; curves go underneath the arrows, so draw them as trails
      const trails = (S.curves || []).map(q => ({ pts: q.pts, color: q.color, width: q.width || 2, dash: q.dash })).concat(S.trail || []);
      super.draw({ arrows: (S.arrows || []).map(a => ({ v: a.v, color: a.color, width: a.width || 3.2, dot: 3.4 })), trail: trails, caption: S.caption });
      this.scene = S;
      const c = this.ctx;
      (S.dots || []).forEach(d => {
        const P = this.project(d.v);
        c.save(); c.globalAlpha = P.d < -0.05 ? 0.45 : 1;
        c.fillStyle = d.ring ? '#fff' : d.color; c.strokeStyle = d.color; c.lineWidth = 2;
        c.beginPath(); c.arc(P.x, P.y, d.r || 4, 0, 2 * Math.PI); c.fill(); if (d.ring) c.stroke();
        c.restore();
      });
      (S.vecs || []).forEach(v => this._vec(v.a, v.b, v.color, v.width || 2.4, v.dash));
      const labelled = (S.arrows || []).filter(a => a.label).map(a => ({ v: a.v.map(x => x * 1.16), text: a.label, color: a.color, bold: true }));
      labelled.concat(S.tags || []).forEach(t => {
        const P = this.project(t.v);
        c.save(); c.font = `${t.bold === false ? 600 : 700} ${t.size || 12.5}px ${FONT}`; c.fillStyle = t.color || INK;
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.globalAlpha = P.d < -0.2 ? 0.55 : 1;
        c.lineWidth = 3.5; c.strokeStyle = 'rgba(255,255,255,.92)'; c.lineJoin = 'round';
        const x = Math.max(16, Math.min(this.w - 16, P.x + (t.dx || 0))), y = Math.max(10, Math.min(this.h - 10, P.y + (t.dy || 0)));
        c.strokeText(t.text, x, y); c.fillText(t.text, x, y);
        c.restore();
      });
    }
  }

  /* A complex plane for phases: unit circle, arrows, an arc for the phase swept (a spiral when it passes a full turn),
     scene = { arrows: [{ z, color, dash, label }], arc: { to, color, label }, caption } */
  class PhaseDial {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.scene = null;
      Object.assign(this, fitCanvas(canvas, this.ctx));
      const redo = () => { Object.assign(this, fitCanvas(canvas, this.ctx)); this.draw(this.scene); };
      if ('ResizeObserver' in window) new ResizeObserver(redo).observe(canvas.parentElement); else window.addEventListener('resize', redo);
    }
    _arrow(x0, y0, x1, y1, color, width, dash) {
      const c = this.ctx, dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
      if (len < 3) return;
      const head = Math.min(12, 0.4 * len + 2), ux = dx / len, uy = dy / len;
      c.save(); c.strokeStyle = color; c.fillStyle = color; c.lineWidth = width; c.lineCap = 'round';
      if (dash) c.setLineDash(dash);
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1 - ux * head * 0.7, y1 - uy * head * 0.7); c.stroke();
      c.setLineDash([]);
      c.beginPath(); c.moveTo(x1, y1);
      c.lineTo(x1 - ux * head - uy * head * 0.45, y1 - uy * head + ux * head * 0.45);
      c.lineTo(x1 - ux * head + uy * head * 0.45, y1 - uy * head - ux * head * 0.45);
      c.closePath(); c.fill(); c.restore();
    }
    draw(scene) {
      this.scene = scene;
      const c = this.ctx;
      c.clearRect(0, 0, this.w, this.h);
      if (!scene) return;
      const cx = this.w / 2, cy = this.h / 2 + 8, R = Math.max(50, Math.min(this.w, this.h) / 2 - 40);
      const X = z => cx + R * z[0], Y = z => cy - R * z[1];
      c.strokeStyle = '#e3e9ed'; c.lineWidth = 1;
      c.beginPath(); c.arc(cx, cy, R * 0.5, 0, 2 * Math.PI); c.stroke();
      c.strokeStyle = '#a9bcc5';
      c.beginPath(); c.arc(cx, cy, R, 0, 2 * Math.PI); c.stroke();
      c.beginPath(); c.moveTo(cx - R - 10, cy); c.lineTo(cx + R + 10, cy); c.moveTo(cx, cy - R - 10); c.lineTo(cx, cy + R + 10); c.stroke();
      c.fillStyle = MUTED; c.font = `12px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText('Re', cx + R + 13, cy); c.textAlign = 'center'; c.textBaseline = 'bottom'; c.fillText('Im', cx, cy - R - 12);
      c.textBaseline = 'top'; c.fillText('1', cx + R - 7, cy + 4);
      const S = scene;
      if (S.arc && Math.abs(S.arc.to) > 0.02) {
        // a spiral, so that more than a full turn stays readable
        const n = Math.max(12, Math.ceil(Math.abs(S.arc.to) / 0.05)), r0 = 0.24, grow = 0.06;
        c.save(); c.strokeStyle = S.arc.color; c.lineWidth = 2; c.beginPath();
        for (let i = 0; i <= n; i++) { const a = S.arc.to * i / n, r = R * (r0 + grow * Math.abs(a) / (2 * Math.PI)); const x = cx + r * Math.cos(a), y = cy - r * Math.sin(a); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
        c.stroke();
        const a1 = S.arc.to, r1 = R * (r0 + grow * Math.abs(a1) / (2 * Math.PI)), s = Math.sign(a1);
        // a small head on the arc
        const hx = cx + r1 * Math.cos(a1), hy = cy - r1 * Math.sin(a1), tx = -Math.sin(a1) * s, ty = -Math.cos(a1) * s;
        c.fillStyle = S.arc.color; c.beginPath(); c.moveTo(hx + tx * 7, hy + ty * 7); c.lineTo(hx - tx * 2 + Math.cos(a1) * 4.5, hy - ty * 2 - Math.sin(a1) * 4.5); c.lineTo(hx - tx * 2 - Math.cos(a1) * 4.5, hy - ty * 2 + Math.sin(a1) * 4.5); c.closePath(); c.fill();
        if (S.arc.label) {
          const am = a1 / 2, rl = R * (r0 + grow * Math.abs(am) / (2 * Math.PI)) - 14;
          c.font = `italic 700 13px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(S.arc.label, cx + Math.max(10, rl) * Math.cos(am), cy - Math.max(10, rl) * Math.sin(am));
        }
        c.restore();
      }
      (S.arrows || []).forEach(a => {
        this._arrow(cx, cy, X(a.z), Y(a.z), a.color, a.width || 3, a.dash);
        if (a.label) {
          const l = Math.hypot(a.z[0], a.z[1]) || 1, ux = a.z[0] / l, uy = a.z[1] / l;
          c.save(); c.font = `700 13px ${FONT}`; c.fillStyle = a.color; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.lineWidth = 3.5; c.strokeStyle = '#fff'; c.lineJoin = 'round';
          const x = X(a.z) + ux * 16 + (a.dx || 0), y = Y(a.z) - uy * 16 + (a.dy || 0);
          c.strokeText(a.label, x, y); c.fillText(a.label, x, y); c.restore();
        }
      });
      if (S.caption) { c.save(); c.font = `700 13px ${FONT}`; c.fillStyle = INK; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(S.caption, 10, 8); c.restore(); }
    }
  }

  /* Diverging colour for the Berry curvature: red for Ω > 0, blue for Ω < 0, white at zero. s in [−1, 1]. */
  const POS = [194, 55, 47], NEG = [31, 111, 180];
  function divColor(s) {
    const a = Math.min(1, Math.abs(s)), c = s >= 0 ? POS : NEG;
    return [255 + (c[0] - 255) * a, 255 + (c[1] - 255) * a, 255 + (c[2] - 255) * a];
  }
  // a canvas holding f(kx, ky) over the box, coloured with a soft saturation at ref
  function heatCanvas(f, box, nx, ny, ref) {
    const cv = document.createElement('canvas'); cv.width = nx; cv.height = ny;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(nx, ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const kx = box[0] + (box[1] - box[0]) * (i + 0.5) / nx, ky = box[3] - (box[3] - box[2]) * (j + 0.5) / ny;
      const v = f(kx, ky), s = Number.isFinite(v) ? Math.tanh(v / ref) : 0, col = divColor(s), o = 4 * (j * nx + i);
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  /* The zone map: a NanoPlot kept at equal scales in kx and ky, with overlays drawn in pixels.
     overlay = { zone: [[kx, ky], ...] (closed outline), arrows: [{ k, a }] (a in pixels per unit), vortices: [k],
                 loop: { c, r, color }, points: [{ k, text }] } */
  class ZoneMap extends NanoPlot {
    constructor(canvas, opts) { super(canvas, opts); this.overlay = {}; this.want = null; }
    _resize() { super._resize(); if (this.want) { this._fit(); if (this.onFit) this.onFit(); } }
    // show the box [x0, x1] × [y0, y1] at equal scales, padding whichever side is short
    fit(box) { this.want = box; this._fit(); }
    _fit() {
      const [x0, x1, y0, y1] = this.want, m = this.m, W = this.w - m.l - m.r, H = this.h - m.t - m.b;
      const sx = W / (x1 - x0), sy = H / (y1 - y0), s = Math.min(sx, sy), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      this.setRange([cx - W / s / 2, cx + W / s / 2], [cy - H / s / 2, cy + H / s / 2]);
    }
    toK(px, py) {
      const m = this.m;
      return [this.xr[0] + (px - m.l) / (this.w - m.l - m.r) * (this.xr[1] - this.xr[0]), this.yr[0] + (this.h - m.b - py) / (this.h - m.t - m.b) * (this.yr[1] - this.yr[0])];
    }
    draw(layers) {
      super.draw(layers);
      const O = this.overlay || {}, c = this.ctx, m = this.m;
      c.save();
      c.beginPath(); c.rect(m.l, m.t, this.w - m.l - m.r, this.h - m.t - m.b); c.clip();
      if (O.zone) {
        c.strokeStyle = INK; c.lineWidth = 1.4; c.setLineDash([5, 4]); c.beginPath();
        O.zone.forEach((k, i) => { const x = this.px(k[0]), y = this.py(k[1]); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
        c.closePath(); c.stroke(); c.setLineDash([]);
      }
      const scale = (this.w - m.l - m.r) / (this.xr[1] - this.xr[0]);
      (O.arrows || []).forEach(({ k, a }) => {
        const x = this.px(k[0]), y = this.py(k[1]), dx = a[0] * scale, dy = -a[1] * scale, len = Math.hypot(dx, dy);
        if (!(len > 1.2)) return;
        const ux = dx / len, uy = dy / len, head = Math.min(5.5, 0.45 * len + 1.5);
        c.strokeStyle = 'rgba(20, 35, 44, .78)'; c.fillStyle = 'rgba(20, 35, 44, .78)'; c.lineWidth = 1.3;
        c.beginPath(); c.moveTo(x - dx / 2, y - dy / 2); c.lineTo(x + dx / 2 - ux * head * 0.6, y + dy / 2 - uy * head * 0.6); c.stroke();
        c.beginPath(); c.moveTo(x + dx / 2, y + dy / 2);
        c.lineTo(x + dx / 2 - ux * head - uy * head * 0.5, y + dy / 2 - uy * head + ux * head * 0.5);
        c.lineTo(x + dx / 2 - ux * head + uy * head * 0.5, y + dy / 2 - uy * head - ux * head * 0.5);
        c.closePath(); c.fill();
      });
      (O.points || []).forEach(p => {
        const x = this.px(p.k[0]), y = this.py(p.k[1]);
        c.fillStyle = INK; c.beginPath(); c.arc(x, y, 2.6, 0, 2 * Math.PI); c.fill();
        c.font = `700 12.5px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'bottom';
        c.lineWidth = 3.5; c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineJoin = 'round';
        c.strokeText(p.text, x + 4, y - 3); c.fillText(p.text, x + 4, y - 3);
      });
      if (O.loop) {
        const x = this.px(O.loop.c[0]), y = this.py(O.loop.c[1]), r = O.loop.r * scale;
        c.lineWidth = 5.5; c.strokeStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.stroke();
        c.lineWidth = 2.6; c.strokeStyle = O.loop.color || INK; c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.stroke();
        // direction marks: anticlockwise
        for (let q = 0; q < 4; q++) {
          const a = q * Math.PI / 2 + Math.PI / 4, px = x + r * Math.cos(a), py = y - r * Math.sin(a), tx = -Math.sin(a), ty = -Math.cos(a);
          c.fillStyle = O.loop.color || INK; c.beginPath();
          c.moveTo(px + tx * 7, py + ty * 7); c.lineTo(px - tx * 3 + Math.cos(a) * 5, py - ty * 3 - Math.sin(a) * 5); c.lineTo(px - tx * 3 - Math.cos(a) * 5, py - ty * 3 + Math.sin(a) * 5); c.closePath(); c.fill();
        }
        c.fillStyle = '#fff'; c.strokeStyle = O.loop.color || INK; c.lineWidth = 2;
        c.beginPath(); c.arc(x, y, 3.6, 0, 2 * Math.PI); c.fill(); c.stroke();
      }
      (O.vortices || []).forEach(k => {
        const x = this.px(k[0]), y = this.py(k[1]);
        c.strokeStyle = INK; c.fillStyle = '#fff'; c.lineWidth = 2;
        c.beginPath(); c.arc(x, y, 6.5, 0, 2 * Math.PI); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(x - 3.5, y - 3.5); c.lineTo(x + 3.5, y + 3.5); c.moveTo(x + 3.5, y - 3.5); c.lineTo(x - 3.5, y + 3.5); c.stroke();
      });
      c.restore();
    }
  }

  window.BerryViews = { GeoSphere, PhaseDial, ZoneMap, heatCanvas };
})();
