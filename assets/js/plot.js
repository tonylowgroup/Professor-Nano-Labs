/* NanoPlot: a small canvas plotting helper shared by the labs.
   Draws axes, ticks, a light grid and any number of layers, keeps text at a
   constant pixel size at every screen width, and redraws on resize.

   const p = new NanoPlot(canvas, { xLabel: 'x (nm)', yLabel: '...' });
   p.setRange([xmin, xmax], [ymin, ymax]);
   p.draw([{ type: 'line', x, y, color, width, dash, fill }, ...]);
*/
(function () {
  'use strict';

  function niceStep(span, target) {
    const raw = span / Math.max(1, target);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
    return step * mag;
  }

  function ticks(min, max, target) {
    if (!(max > min)) return [min];
    const step = niceStep(max - min, target);
    const out = [];
    const start = Math.ceil(min / step - 1e-9) * step;
    for (let v = start; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  }

  function fmt(v, step) {
    if (v === 0) return '0';
    const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    const a = Math.abs(v);
    if (a >= 1e4 || a < 1e-3) return v.toExponential(1).replace('e', 'e');
    return v.toFixed(Math.min(decimals, 4));
  }

  function cssVar(el, name, fallback) {
    const v = getComputedStyle(el).getPropertyValue(name).trim();
    return v || fallback;
  }

  class NanoPlot {
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = Object.assign({
        xLabel: '', yLabel: '', margin: { l: 58, r: 14, t: 12, b: 42 },
        xTicks: 7, yTicks: 5, zeroLine: false,
      }, opts || {});
      this.xr = [0, 1];
      this.yr = [0, 1];
      this.layers = [];
      this.w = 0; this.h = 0;
      this._resize();
      if ('ResizeObserver' in window) {
        new ResizeObserver(() => { this._resize(); this.draw(this.layers); }).observe(canvas.parentElement);
      } else {
        window.addEventListener('resize', () => { this._resize(); this.draw(this.layers); });
      }
    }

    _resize() {
      const box = this.canvas.parentElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      this.w = Math.max(200, Math.round(box.width));
      this.h = Math.max(140, Math.round(box.height));
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.canvas.style.width = this.w + 'px';
      this.canvas.style.height = this.h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const narrow = this.w < 420;
      this.m = Object.assign({}, this.opts.margin, narrow ? { l: 50, r: 8 } : {});
    }

    setRange(xr, yr) { this.xr = xr.slice(); this.yr = yr.slice(); }

    px(x) { const m = this.m; return m.l + (x - this.xr[0]) / (this.xr[1] - this.xr[0]) * (this.w - m.l - m.r); }
    py(y) { const m = this.m; return this.h - m.b - (y - this.yr[0]) / (this.yr[1] - this.yr[0]) * (this.h - m.t - m.b); }

    _axes() {
      const c = this.ctx, m = this.m, el = this.canvas;
      const text = cssVar(el, '--plot-text', '#5f7382');
      const grid = cssVar(el, '--plot-grid', '#e6edf1');
      const axis = cssVar(el, '--plot-axis', '#9fb3bd');
      c.font = '12px Inter, system-ui, sans-serif';
      c.fillStyle = text;
      c.strokeStyle = grid;
      c.lineWidth = 1;

      const xt = ticks(this.xr[0], this.xr[1], this.w < 420 ? 4 : this.opts.xTicks);
      const yt = ticks(this.yr[0], this.yr[1], this.opts.yTicks);
      const xs = xt.length > 1 ? xt[1] - xt[0] : 1, ys = yt.length > 1 ? yt[1] - yt[0] : 1;

      c.textAlign = 'center'; c.textBaseline = 'top';
      xt.forEach(v => {
        const X = Math.round(this.px(v)) + .5;
        c.beginPath(); c.moveTo(X, m.t); c.lineTo(X, this.h - m.b); c.stroke();
        c.fillText(fmt(v, xs), X, this.h - m.b + 7);
      });
      c.textAlign = 'right'; c.textBaseline = 'middle';
      yt.forEach(v => {
        const Y = Math.round(this.py(v)) + .5;
        c.beginPath(); c.moveTo(m.l, Y); c.lineTo(this.w - m.r, Y); c.stroke();
        c.fillText(fmt(v, ys), m.l - 7, Y);
      });

      c.strokeStyle = axis;
      c.beginPath();
      c.moveTo(m.l + .5, m.t); c.lineTo(m.l + .5, this.h - m.b + .5); c.lineTo(this.w - m.r, this.h - m.b + .5);
      c.stroke();
      if (this.opts.zeroLine && this.yr[0] < 0 && this.yr[1] > 0) {
        const Y = Math.round(this.py(0)) + .5;
        c.beginPath(); c.moveTo(m.l, Y); c.lineTo(this.w - m.r, Y); c.stroke();
      }

      c.textAlign = 'center'; c.textBaseline = 'bottom';
      c.fillText(this.opts.xLabel, m.l + (this.w - m.l - m.r) / 2, this.h - 2);
      c.save();
      c.translate(13, m.t + (this.h - m.t - m.b) / 2);
      c.rotate(-Math.PI / 2);
      c.textBaseline = 'middle';
      c.fillText(this.opts.yLabel, 0, 0);
      c.restore();
    }

    draw(layers) {
      this.layers = layers || [];
      const c = this.ctx, m = this.m;
      c.clearRect(0, 0, this.w, this.h);
      this._axes();
      c.save();
      c.beginPath();
      c.rect(m.l, m.t - 2, this.w - m.l - m.r, this.h - m.t - m.b + 2);
      c.clip();
      for (const L of this.layers) {
        if (L.type === 'line') this._line(L);
        else if (L.type === 'stems') this._stems(L);
        else if (L.type === 'vline') this._vline(L);
      }
      c.restore();
    }

    _line(L) {
      const c = this.ctx, n = L.x.length;
      if (!n) return;
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const X = this.px(L.x[i]), Y = this.py(L.y[i]);
        if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
      }
      if (L.fill) {
        c.save();
        const base = this.py(L.fillTo || 0);
        c.lineTo(this.px(L.x[n - 1]), base);
        c.lineTo(this.px(L.x[0]), base);
        c.closePath();
        c.fillStyle = L.fill;
        c.fill();
        c.restore();
        c.beginPath();
        for (let i = 0; i < n; i++) {
          const X = this.px(L.x[i]), Y = this.py(L.y[i]);
          if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
        }
      }
      c.strokeStyle = L.color; c.lineWidth = L.width || 2;
      c.lineJoin = 'round';
      c.setLineDash(L.dash || []);
      c.stroke();
      c.setLineDash([]);
    }

    _stems(L) {
      const c = this.ctx, base = this.py(0);
      c.strokeStyle = L.color; c.fillStyle = L.color; c.lineWidth = L.width || 1.5;
      for (let i = 0; i < L.x.length; i++) {
        const X = this.px(L.x[i]), Y = this.py(L.y[i]);
        c.beginPath(); c.moveTo(X, base); c.lineTo(X, Y); c.stroke();
        c.beginPath(); c.arc(X, Y, L.r || 3, 0, Math.PI * 2); c.fill();
      }
    }

    _vline(L) {
      const c = this.ctx, X = Math.round(this.px(L.x)) + .5;
      c.strokeStyle = L.color; c.lineWidth = L.width || 1;
      c.setLineDash(L.dash || [4, 4]);
      c.beginPath(); c.moveTo(X, this.m.t); c.lineTo(X, this.h - this.m.b); c.stroke();
      c.setLineDash([]);
      if (L.label) {
        c.fillStyle = L.color; c.font = '600 11.5px Inter, system-ui, sans-serif';
        c.textAlign = X > this.w - 90 ? 'right' : 'left'; c.textBaseline = 'top';
        c.fillText(L.label, X + (c.textAlign === 'left' ? 5 : -5), this.m.t + 4);
      }
    }
  }

  window.NanoPlot = NanoPlot;
})();
