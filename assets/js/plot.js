/* NanoPlot: a small canvas plotting helper shared by the labs.
   Draws axes, ticks, a light grid and any number of layers, keeps text at a
   constant pixel size at every screen width, and redraws on resize.

   const p = new NanoPlot(canvas, { xLabel: 'x (nm)', yLabel: '...' });
   p.setRange([xmin, xmax], [ymin, ymax]);
   p.draw([{ type: 'line', x, y, color, width, dash, fill }, ...]);

   Layer types: line (non-finite points break the curve), stems, dots,
   vline, hline, vband (x0..x1 shaded), hband (y0..y1 shaded),
   image (a canvas stretched over x0..x1, y0..y1), text (a label at x, y)
   and poly (a closed polygon through x, y, filled with fill).
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
        else if (L.type === 'dots') this._dots(L);
        else if (L.type === 'vline') this._vline(L);
        else if (L.type === 'hline') this._hline(L);
        else if (L.type === 'vband' || L.type === 'hband') this._band(L);
        else if (L.type === 'image') this._image(L);
        else if (L.type === 'text') this._text(L);
        else if (L.type === 'poly') this._poly(L);
      }
      c.restore();
    }

    _trace(L) {
      const c = this.ctx;
      let pen = false;
      c.beginPath();
      for (let i = 0; i < L.x.length; i++) {
        if (!Number.isFinite(L.x[i]) || !Number.isFinite(L.y[i])) { pen = false; continue; }
        const X = this.px(L.x[i]), Y = this.py(L.y[i]);
        if (pen) c.lineTo(X, Y); else { c.moveTo(X, Y); pen = true; }
      }
    }

    _line(L) {
      const c = this.ctx, n = L.x.length;
      if (!n) return;
      this._trace(L);
      if (L.fill) {
        c.save();
        const base = this.py(L.fillTo || 0);
        c.lineTo(this.px(L.x[n - 1]), base);
        c.lineTo(this.px(L.x[0]), base);
        c.closePath();
        c.fillStyle = L.fill;
        c.fill();
        c.restore();
        this._trace(L);
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

    _dots(L) {
      const c = this.ctx, r = L.r || 3;
      for (let i = 0; i < L.x.length; i++) {
        c.fillStyle = L.colors ? L.colors[i] : L.color;
        c.beginPath(); c.arc(this.px(L.x[i]), this.py(L.y[i]), r, 0, Math.PI * 2); c.fill();
      }
    }

    _hline(L) {
      const c = this.ctx, Y = Math.round(this.py(L.y)) + .5;
      c.strokeStyle = L.color; c.lineWidth = L.width || 1;
      c.setLineDash(L.dash || [4, 4]);
      c.beginPath(); c.moveTo(this.m.l, Y); c.lineTo(this.w - this.m.r, Y); c.stroke();
      c.setLineDash([]);
    }

    _band(L) {
      const c = this.ctx;
      c.fillStyle = L.color;
      if (L.type === 'vband') {
        const a = this.px(L.x0), b = this.px(L.x1);
        c.fillRect(Math.min(a, b), this.m.t, Math.abs(b - a), this.h - this.m.t - this.m.b);
      } else {
        const a = this.py(L.y0), b = this.py(L.y1);
        c.fillRect(this.m.l, Math.min(a, b), this.w - this.m.l - this.m.r, Math.abs(b - a));
      }
    }

    _image(L) {
      const c = this.ctx, x0 = this.px(L.x0), x1 = this.px(L.x1), y0 = this.py(L.y0), y1 = this.py(L.y1);
      c.save();
      c.imageSmoothingEnabled = false;
      c.drawImage(L.canvas, Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      c.restore();
    }

    _text(L) {
      const c = this.ctx;
      c.fillStyle = L.color || cssVar(this.canvas, '--plot-text', '#5f7382');
      c.font = (L.weight || '600') + ' ' + (L.size || 11.5) + 'px Inter, system-ui, sans-serif';
      c.textAlign = L.align || 'center'; c.textBaseline = 'top';
      c.fillText(L.text, this.px(L.x), L.y === undefined ? this.m.t + 5 : this.py(L.y));
    }

    _poly(L) {
      const c = this.ctx;
      if (!L.x.length) return;
      this._trace(L);
      c.closePath();
      if (L.fill) { c.fillStyle = L.fill; c.fill(); }
      if (L.color) { c.strokeStyle = L.color; c.lineWidth = L.width || 1; c.setLineDash(L.dash || []); c.stroke(); c.setLineDash([]); }
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

  /* '#5b45b0' + alpha -> 'rgba(91, 69, 176, alpha)' (for fills derived from CSS tokens). */
  NanoPlot.alpha = function (hex, a) {
    const h = String(hex).trim().replace('#', '');
    const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const n = parseInt(v, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };

  window.NanoPlot = NanoPlot;
})();
