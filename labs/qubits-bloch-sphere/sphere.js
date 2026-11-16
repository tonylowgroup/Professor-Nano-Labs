/* Bloch sphere and phasor drawings on canvas, for the qubit lab.

   const s = new BlochSphere(canvas);
   s.draw({ arrows: [{ v: [x, y, z], color }], trail: [{ pts, color }], axis, marks, measure, angles });

   The view is an orthographic projection. Drag (or use the arrow keys) to turn it.
   Anything behind the sphere's centre plane is drawn fainter and dashed.
*/
(function () {
  'use strict';
  const DEG = Math.PI / 180;

  function cssVar(el, name, fallback) {
    const v = getComputedStyle(el).getPropertyValue(name).trim();
    return v || fallback;
  }
  function rgba(hex, a) { return window.NanoPlot ? NanoPlot.alpha(hex, a) : hex; }

  function fitCanvas(canvas, ctx) {
    const box = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(160, Math.round(box.width)), h = Math.max(160, Math.round(box.height));
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  function observe(canvas, fn) {
    if ('ResizeObserver' in window) new ResizeObserver(fn).observe(canvas.parentElement);
    else window.addEventListener('resize', fn);
  }

  class BlochSphere {
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = Object.assign({ az: 28, el: 16 }, opts || {});
      this.az = this.opts.az * DEG;
      this.el = this.opts.el * DEG;
      this.scene = {};
      this.onView = null;
      this._resize();
      observe(canvas, () => { this._resize(); this.draw(this.scene); });
      this._bind();
    }

    _resize() { Object.assign(this, fitCanvas(this.canvas, this.ctx)); }

    _bind() {
      const c = this.canvas;
      let drag = null;
      c.addEventListener('pointerdown', e => {
        drag = { x: e.clientX, y: e.clientY, az: this.az, el: this.el };
        c.setPointerCapture(e.pointerId);
        c.classList.add('is-dragging');
      });
      c.addEventListener('pointermove', e => {
        if (!drag) return;
        this.setView(drag.az - (e.clientX - drag.x) * 0.012, drag.el + (e.clientY - drag.y) * 0.012);
      });
      const end = () => { drag = null; c.classList.remove('is-dragging'); };
      c.addEventListener('pointerup', end);
      c.addEventListener('pointercancel', end);
      c.addEventListener('keydown', e => {
        const step = 6 * DEG;
        const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (!moves[e.key]) return;
        e.preventDefault();
        this.setView(this.az + moves[e.key][0], this.el + moves[e.key][1]);
      });
    }

    /* Azimuth and elevation of the viewer, in radians. */
    setView(az, el, quiet) {
      this.az = az;
      this.el = Math.max(-89 * DEG, Math.min(89 * DEG, el));
      this.draw(this.scene);
      if (!quiet && this.onView) this.onView(this.az, this.el);
    }

    _basis() {
      const ca = Math.cos(this.az), sa = Math.sin(this.az), ce = Math.cos(this.el), se = Math.sin(this.el);
      return {
        r: [-sa, ca, 0],                 // screen right
        u: [-se * ca, -se * sa, ce],      // screen up
        f: [ce * ca, ce * sa, se],        // toward the viewer
      };
    }

    _geom() {
      const pad = this.w < 300 ? 30 : 40;
      const R = Math.max(40, Math.min(this.w, this.h) / 2 - pad);
      return { cx: this.w / 2, cy: this.h / 2 + 2, R };
    }

    project(v) {
      const b = this.B, g = this.G;
      const dot = a => a[0] * v[0] + a[1] * v[1] + a[2] * v[2];
      return { x: g.cx + g.R * dot(b.r), y: g.cy - g.R * dot(b.u), d: dot(b.f) };
    }

    /* Stroke a 3D polyline, fainter and dashed where it lies behind the centre plane. */
    _poly(pts, color, width, opts) {
      const o = Object.assign({ back: true, front: true, backAlpha: 0.32, backDash: [3, 4], dash: [] }, opts || {});
      const c = this.ctx;
      const P = pts.map(p => this.project(p));
      const run = (front) => {
        c.beginPath();
        let pen = false;
        for (let i = 0; i < P.length; i++) {
          const ok = front ? P[i].d >= -1e-9 : P[i].d <= 1e-9;
          const okPrev = i > 0 && (front ? P[i - 1].d >= -1e-9 : P[i - 1].d <= 1e-9);
          if (ok) {
            if (!pen) {
              if (okPrev || i === 0) c.moveTo(P[i].x, P[i].y);
              else {
                // start at the crossing point with the previous sample
                const a = P[i - 1], b = P[i], t = a.d / (a.d - b.d);
                c.moveTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
                c.lineTo(b.x, b.y);
              }
              pen = true;
            } else c.lineTo(P[i].x, P[i].y);
          } else if (pen) {
            const a = P[i - 1], b = P[i], t = a.d / (a.d - b.d);
            c.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
            pen = false;
          }
        }
      };
      c.lineCap = 'round'; c.lineJoin = 'round';
      if (o.back) {
        c.save();
        c.globalAlpha = o.backAlpha; c.strokeStyle = color; c.lineWidth = width;
        c.setLineDash(o.backDash); run(false); c.stroke();
        c.restore();
      }
      if (o.front) {
        c.save();
        c.strokeStyle = color; c.lineWidth = width; c.setLineDash(o.dash);
        run(true); c.stroke();
        c.restore();
      }
    }

    _circle(n1, n2, r, color, width, opts, t0, t1) {
      const pts = [];
      const a = t0 === undefined ? 0 : t0, b = t1 === undefined ? 2 * Math.PI : t1;
      const steps = Math.max(8, Math.ceil(Math.abs(b - a) / (2 * Math.PI) * 120));
      for (let i = 0; i <= steps; i++) {
        const t = a + (b - a) * i / steps;
        pts.push([r * (Math.cos(t) * n1[0] + Math.sin(t) * n2[0]), r * (Math.cos(t) * n1[1] + Math.sin(t) * n2[1]), r * (Math.cos(t) * n1[2] + Math.sin(t) * n2[2])]);
      }
      this._poly(pts, color, width, opts);
    }

    _label(v, text, color, font, dx, dy) {
      const p = this.project(v), c = this.ctx;
      c.save();
      c.font = font;
      c.fillStyle = color;
      c.globalAlpha = p.d < -0.2 ? 0.55 : 1;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(text, p.x + (dx || 0), p.y + (dy || 0));
      c.restore();
    }

    _arrow(v, color, width, opts) {
      const o = opts || {};
      const c = this.ctx, O = this.project([0, 0, 0]), P = this.project(v);
      const dx = P.x - O.x, dy = P.y - O.y, len = Math.hypot(dx, dy);
      const vlen = Math.hypot(v[0], v[1], v[2]);
      c.save();
      c.globalAlpha = (o.alpha || 1) * (P.d < -0.05 ? 0.6 : 1);
      c.strokeStyle = color; c.fillStyle = color; c.lineWidth = width;
      c.lineCap = 'round';
      if (o.dash) c.setLineDash(o.dash);
      if (vlen < 0.02) {
        // a zero-length arrow: mark the centre with a hollow ring
        c.setLineDash([]);
        c.beginPath(); c.arc(O.x, O.y, 6, 0, 2 * Math.PI); c.lineWidth = 2; c.stroke();
        c.restore();
        return;
      }
      const head = Math.min(13, 0.45 * len + 2);
      const ux = len > 1e-6 ? dx / len : 0, uy = len > 1e-6 ? dy / len : 0;
      c.beginPath(); c.moveTo(O.x, O.y); c.lineTo(P.x - ux * head * 0.7, P.y - uy * head * 0.7); c.stroke();
      c.setLineDash([]);
      if (len > 4) {
        c.beginPath();
        c.moveTo(P.x, P.y);
        c.lineTo(P.x - ux * head - uy * head * 0.45, P.y - uy * head + ux * head * 0.45);
        c.lineTo(P.x - ux * head + uy * head * 0.45, P.y - uy * head - ux * head * 0.45);
        c.closePath();
        if (o.hollow) { c.lineWidth = 1.6; c.stroke(); } else c.fill();
      }
      if (!o.hollow) { c.beginPath(); c.arc(P.x, P.y, o.dot || 3.6, 0, 2 * Math.PI); c.fill(); }
      c.restore();
    }

    draw(scene) {
      this.scene = scene || {};
      const S = this.scene, c = this.ctx, el = this.canvas;
      this.B = this._basis(); this.G = this._geom();
      const { cx, cy, R } = this.G;
      const brand = cssVar(el, '--brand', '#5b45b0');
      const ink = cssVar(el, '--ink', '#14232c');
      const muted = cssVar(el, '--plot-text', '#5f7382');
      const grid = cssVar(el, '--plot-axis', '#a9bcc5');
      c.clearRect(0, 0, this.w, this.h);

      // sphere body
      const grad = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      grad.addColorStop(0, rgba(brand, 0.03));
      grad.addColorStop(1, rgba(brand, 0.13));
      c.fillStyle = grad;
      c.beginPath(); c.arc(cx, cy, R, 0, 2 * Math.PI); c.fill();
      c.strokeStyle = rgba(brand, 0.45); c.lineWidth = 1.4;
      c.beginPath(); c.arc(cx, cy, R, 0, 2 * Math.PI); c.stroke();

      // great circles and axes
      this._circle([1, 0, 0], [0, 1, 0], 1, grid, 1.3, { backAlpha: 0.7 });
      this._circle([1, 0, 0], [0, 0, 1], 1, grid, 1, { backAlpha: 0.55, dash: [] });
      this._circle([0, 1, 0], [0, 0, 1], 1, grid, 0.8, { backAlpha: 0.4, front: true });
      const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      axes.forEach(a => this._poly([[-a[0], -a[1], -a[2]], [0, 0, 0], a], grid, 1.1, { backAlpha: 0.7 }));

      // optional rotation axis
      if (S.axis) {
        const n = S.axis.n, L = 1.22;
        this._poly([[-L * n[0], -L * n[1], -L * n[2]], [0, 0, 0], [L * n[0], L * n[1], L * n[2]]], S.axis.color, 2, { dash: [7, 5], backDash: [7, 5], backAlpha: 0.5 });
        if (S.axis.label) this._label([1.36 * n[0], 1.36 * n[1], 1.36 * n[2]], S.axis.label, S.axis.color, '700 12px Inter, system-ui, sans-serif');
      }

      // measurement axis with outcome poles sized by probability
      if (S.measure) {
        const n = S.measure.n, p = S.measure.pPlus, col = S.measure.color;
        this._poly([[-n[0], -n[1], -n[2]], [0, 0, 0], n], col, 3, { backAlpha: 0.45, backDash: [] });
        [[n, p], [[-n[0], -n[1], -n[2]], 1 - p]].forEach(([v, q]) => {
          const P = this.project(v);
          c.save();
          c.globalAlpha = P.d < -0.05 ? 0.55 : 1;
          c.fillStyle = rgba(col, 0.22); c.strokeStyle = col; c.lineWidth = 1.5;
          c.beginPath(); c.arc(P.x, P.y, 4 + 12 * Math.sqrt(q), 0, 2 * Math.PI); c.fill(); c.stroke();
          c.restore();
        });
      }

      // trails
      (S.trail || []).forEach(t => this._poly(t.pts, t.color, t.width || 2.2, { backAlpha: 0.4, backDash: [2, 4], dash: t.dash || [] }));

      // angle guides for the first arrow
      if (S.angles && S.arrows && S.arrows[0]) {
        const v = S.arrows[0].v, rho = Math.hypot(v[0], v[1]), len = Math.hypot(v[0], v[1], v[2]);
        if (len > 0.2 && rho > 0.02) {
          const phi = Math.atan2(v[1], v[0]), u = [Math.cos(phi), Math.sin(phi), 0];
          const foot = [v[0], v[1], 0];
          const amber = cssVar(el, '--series-amber', '#c47a12');
          this._poly([v, foot], muted, 1, { dash: [3, 3], backAlpha: 0.5 });
          this._poly([[0, 0, 0], foot], muted, 1, { dash: [3, 3], backAlpha: 0.5 });
          const theta = Math.acos(Math.max(-1, Math.min(1, v[2] / len)));
          const r = 0.32;
          this._circle([0, 0, 1], u, r, amber, 1.8, { backAlpha: 0.6, backDash: [] }, 0, theta);
          this._label([r * 1.45 * (Math.sin(theta / 2) * u[0]), r * 1.45 * (Math.sin(theta / 2) * u[1]), r * 1.45 * Math.cos(theta / 2)], 'θ', amber, 'italic 700 13px Inter, system-ui, sans-serif');
          let p = phi < 0 ? phi + 2 * Math.PI : phi;
          if (p > 0.03) {
            const r2 = 0.42;
            this._circle([1, 0, 0], [0, 1, 0], r2, cssVar(el, '--series-re', '#1f6fb4'), 1.8, { backAlpha: 0.6, backDash: [] }, 0, p);
            this._label([r2 * 1.35 * Math.cos(p / 2), r2 * 1.35 * Math.sin(p / 2), 0], 'φ', cssVar(el, '--series-re', '#1f6fb4'), 'italic 700 13px Inter, system-ui, sans-serif');
          }
        }
      }

      // arrows, back ones first
      const arrows = (S.arrows || []).slice().sort((a, b) => this.project(a.v).d - this.project(b.v).d);
      arrows.forEach(a => this._arrow(a.v, a.color, a.width || 3, a));

      (S.marks || []).forEach(m => {
        const P = this.project(m.v);
        c.save();
        c.globalAlpha = P.d < -0.05 ? 0.6 : 1;
        c.strokeStyle = m.color; c.fillStyle = m.color; c.lineWidth = 2;
        c.beginPath(); c.arc(P.x, P.y, m.r || 5, 0, 2 * Math.PI);
        if (m.hollow) c.stroke(); else c.fill();
        c.restore();
      });

      // state labels on the six axis ends
      const small = this.w < 300;
      const kf = (small ? '600 12px' : '600 13.5px') + ' Inter, system-ui, sans-serif';
      const L = 1.2;
      [[[0, 0, L], '|0⟩', 0, -4], [[0, 0, -L], '|1⟩', 0, 4], [[L, 0, 0], '|+⟩'], [[-L, 0, 0], '|−⟩'], [[0, L, 0], '|+i⟩'], [[0, -L, 0], '|−i⟩']]
        .forEach(([v, t, dx, dy]) => this._label(v, t, ink, kf, dx, dy));
      const af = 'italic 600 12px Inter, system-ui, sans-serif';
      [[[1.04, 0, 0], 'x'], [[0, 1.04, 0], 'y'], [[0, 0, 1.04], 'z']].forEach(([v, t]) => this._label(v, t, muted, af, 9, -7));

      if (S.caption) {
        c.save();
        c.font = '700 13px Inter, system-ui, sans-serif'; c.fillStyle = S.captionColor || ink;
        c.textAlign = 'left'; c.textBaseline = 'top';
        c.fillText(S.caption, 10, 8);
        c.restore();
      }
    }
  }

  /* Two complex amplitudes drawn as arrows in one complex plane. */
  class PhasorView {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.data = null;
      Object.assign(this, fitCanvas(canvas, this.ctx));
      observe(canvas, () => { Object.assign(this, fitCanvas(canvas, this.ctx)); this.draw(this.data); });
    }

    draw(data) {
      this.data = data;
      const c = this.ctx, el = this.canvas;
      c.clearRect(0, 0, this.w, this.h);
      if (!data) return;
      const cx = this.w / 2, cy = this.h / 2 + 6, R = Math.min(this.w, this.h) / 2 - 36;
      const muted = cssVar(el, '--plot-text', '#5f7382'), grid = cssVar(el, '--plot-grid', '#e8eef1'), axis = cssVar(el, '--plot-axis', '#a9bcc5');
      c.lineWidth = 1;
      c.strokeStyle = grid;
      [0.5].forEach(f => { c.beginPath(); c.arc(cx, cy, R * f, 0, 2 * Math.PI); c.stroke(); });
      c.strokeStyle = axis;
      c.beginPath(); c.arc(cx, cy, R, 0, 2 * Math.PI); c.stroke();
      c.beginPath(); c.moveTo(cx - R - 12, cy); c.lineTo(cx + R + 12, cy); c.moveTo(cx, cy - R - 12); c.lineTo(cx, cy + R + 12); c.stroke();
      c.fillStyle = muted; c.font = '12px Inter, system-ui, sans-serif';
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText('Re', cx + R + 15, cy);
      c.textAlign = 'center'; c.textBaseline = 'bottom';
      c.fillText('Im', cx, cy - R - 14);
      c.textBaseline = 'top';
      c.textAlign = 'center'; c.fillText('1', cx + R - 6, cy + 4);

      // relative-phase arc between the two arrows
      const [a, b] = data.amps;
      const ra = Math.hypot(a.z[0], a.z[1]), rb = Math.hypot(b.z[0], b.z[1]);
      if (ra > 0.02 && rb > 0.02 && data.arcColor) {
        const ta = Math.atan2(a.z[1], a.z[0]), tb = Math.atan2(b.z[1], b.z[0]);
        let d = tb - ta; while (d < 0) d += 2 * Math.PI;
        if (d > 0.02 && d < 2 * Math.PI - 0.02) {
          const rr = R * Math.min(0.32, 0.8 * Math.min(ra, rb));
          c.strokeStyle = data.arcColor; c.lineWidth = 1.8;
          c.beginPath(); c.arc(cx, cy, rr, -ta, -(ta + d), true); c.stroke();
          const tm = ta + d / 2;
          c.fillStyle = data.arcColor; c.font = 'italic 700 13px Inter, system-ui, sans-serif';
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText('φ', cx + (rr + 12) * Math.cos(tm), cy - (rr + 12) * Math.sin(tm));
        }
      }

      [a, b].forEach(p => {
        const x = cx + R * p.z[0], y = cy - R * p.z[1];
        const dx = x - cx, dy = y - cy, len = Math.hypot(dx, dy);
        c.strokeStyle = p.color; c.fillStyle = p.color; c.lineWidth = 3; c.lineCap = 'round';
        if (len < 3) { c.beginPath(); c.arc(cx, cy, 4, 0, 2 * Math.PI); c.fill(); return; }
        const ux = dx / len, uy = dy / len, head = Math.min(12, 0.4 * len + 2);
        c.beginPath(); c.moveTo(cx, cy); c.lineTo(x - ux * head * 0.7, y - uy * head * 0.7); c.stroke();
        c.beginPath(); c.moveTo(x, y);
        c.lineTo(x - ux * head - uy * head * 0.45, y - uy * head + ux * head * 0.45);
        c.lineTo(x - ux * head + uy * head * 0.45, y - uy * head - ux * head * 0.45);
        c.closePath(); c.fill();
        c.font = '700 14px Inter, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(p.label, x + ux * 14, y + uy * 14);
      });
    }
  }

  window.BlochSphere = BlochSphere;
  window.PhasorView = PhasorView;
})();
