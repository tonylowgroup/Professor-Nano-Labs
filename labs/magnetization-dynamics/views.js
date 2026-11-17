/* Pictures for the magnetization lab: the magnetization sphere (built on the shared BlochSphere) and the MRAM array. */
(function () {
  'use strict';
  const NOLABELS = { z0: '', z1: '', xp: '', xm: '', yp: '', ym: '' };
  const clampX = (x, a, b) => Math.max(a, Math.min(b, x));

  /* The unit sphere of directions for m, as on the video's slides.
     scene = { mags: [{ v, color, width, trail, trailColor, start }], field: { n, size, color }, easy: color,
               torques: [{ from, d, color }], caption } */
  class MagSphere extends BlochSphere {
    constructor(canvas) { super(canvas, { az: 28, el: 14, labels: NOLABELS }); }

    _geom() {
      // leave room at the sides for the field and easy-axis arrows
      const side = this.w > this.h * 1.15 ? 0 : 22, pad = this.w < 300 ? 28 : 32;
      const R = Math.max(40, Math.min(this.w / 2 - side - pad, this.h / 2 - pad));
      return { cx: this.w / 2, cy: this.h / 2 + 4, R };
    }

    // a straight 3D arrow from a to b, with its head drawn on screen
    _vec(a, b, color, width) {
      const c = this.ctx, P = this.project(a), Q = this.project(b);
      const dx = Q.x - P.x, dy = Q.y - P.y, len = Math.hypot(dx, dy);
      if (len < 3) return;
      const head = Math.min(10, 0.5 * len + 2), ux = dx / len, uy = dy / len;
      c.save();
      c.globalAlpha = Q.d < -0.05 ? 0.55 : 1;
      c.strokeStyle = color; c.fillStyle = color; c.lineWidth = width; c.lineCap = 'round';
      c.beginPath(); c.moveTo(P.x, P.y); c.lineTo(Q.x - ux * head * 0.7, Q.y - uy * head * 0.7); c.stroke();
      c.beginPath(); c.moveTo(Q.x, Q.y);
      c.lineTo(Q.x - ux * head - uy * head * 0.45, Q.y - uy * head + ux * head * 0.45);
      c.lineTo(Q.x - ux * head + uy * head * 0.45, Q.y - uy * head - ux * head * 0.45);
      c.closePath(); c.fill();
      c.restore();
    }

    // a fat 2D arrow beside the sphere, centred at (x, y), along the projection of n (the slides' big green arrow), with a label below
    _side(x, y, n, size, color, both, label) {
      const c = this.ctx, O = this.project([0, 0, 0]), P = this.project(n);
      let dx = P.x - O.x, dy = P.y - O.y;
      const l = Math.hypot(dx, dy), full = Math.min(64, this.G.R * 0.55);
      if (l > 1e-6) { dx /= l; dy /= l; }
      const L = l > 1e-6 ? Math.max(14, size * full) * Math.min(1, l / this.G.R + 0.15) : 0;   // foreshortened when n points at you
      c.save();
      if (L >= 6) {
        const head = Math.min(14, 0.45 * L), w = 5;
        const x0 = x - dx * L / 2, y0 = y - dy * L / 2, x1 = x + dx * L / 2, y1 = y + dy * L / 2;
        const tri = (tx, ty, sx, sy) => {
          const bx = tx - sx * head, by = ty - sy * head;
          c.beginPath(); c.moveTo(tx, ty); c.lineTo(bx - sy * w * 1.9, by + sx * w * 1.9); c.lineTo(bx + sy * w * 1.9, by - sx * w * 1.9); c.closePath(); c.fill();
        };
        c.fillStyle = color; c.strokeStyle = color; c.lineWidth = w * 2; c.lineCap = 'butt';
        c.beginPath();
        c.moveTo(both ? x0 + dx * (head - 1) : x0, both ? y0 + dy * (head - 1) : y0);
        c.lineTo(x1 - dx * (head - 1), y1 - dy * (head - 1)); c.stroke();
        tri(x1, y1, dx, dy); if (both) tri(x0, y0, -dx, -dy);
      }
      c.font = '700 12.5px Inter, system-ui, sans-serif'; c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'top';
      const tw = c.measureText(label).width;
      c.fillText(label, clampX(x, tw / 2 + 3, this.w - tw / 2 - 3), y + full / 2 + 10);
      c.restore();
    }

    draw(scene) {
      const S = scene || {};
      const base = { trail: [], arrows: [], marks: [], axis: null };
      (S.mags || []).forEach(m => {
        if (m.trail && m.trail.length > 1) base.trail.push({ pts: m.trail, color: m.trailColor || m.color, width: m.trailWidth || 2 });
        if (m.start) base.marks.push({ v: m.start, color: m.trailColor || m.color, r: 4.5, hollow: true });
      });
      if (S.field && S.field.size > 0) base.axis = { n: S.field.n, color: S.field.color, label: '' };
      (S.mags || []).forEach(m => base.arrows.push({ v: m.v, color: m.color, width: m.width || 3.2, dot: 4 }));
      super.draw(Object.assign(base, { caption: S.caption }));
      this.scene = S;           // so a resize or a drag redraws the full scene
      (S.torques || []).forEach(t => {
        const b = [t.from[0] + t.d[0], t.from[1] + t.d[1], t.from[2] + t.d[2]];
        this._vec(t.from, b, t.color, 2.6);
      });
      const { cx, cy, R } = this.G;
      if (S.field && S.field.size > 0) this._side(Math.max(22, cx - R - 34), cy, S.field.n, S.field.size, S.field.color, false, 'H');
      if (S.easy) this._side(Math.min(this.w - 22, cx + R + 34), cy, [0, 0, 1], 0.9, S.easy, true, 'easy axis');
    }
  }

  /* A 3 x 3 cross-point MRAM array seen from above, as on the video's slides.
     Word lines (rows) carry the current whose field lies along the easy axis (vertical here);
     bit lines (columns) carry the one whose field lies along the hard axis (horizontal).
     o = { he, hx, sel: [row, col], bits: [[{ mx, mz }]] (3 x 3), colors: { sel, row, col }, narrow } */
  function mram(o) {
    const W = 460, H = 300, x0 = 120, y0 = 62, dx = 116, dy = 82;
    const [sr, sc] = o.sel, C = o.colors;
    const ink = '#14232c', muted = '#5f7382', copper = '#b0561b';
    const kind = (r, c) => (r === sr && c === sc ? 'sel' : r === sr ? 'row' : c === sc ? 'col' : 'none');
    const ones = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (o.bits[r][c].mz > 0) ones.push(r === sr && c === sc ? 'the selected bit' : `row ${r + 1}, column ${c + 1}`);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="A three by three MRAM array seen from above, with the selected bit in the middle. ${ones.length ? `Bits now 1: ${ones.join(', ')}.` : 'Every bit is 0.'}">`;
    s += '<defs><marker id="mr-cur" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#fff"/></marker><marker id="mr-fld" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#2e8b57"/></marker></defs>';
    // word lines: rows, under the bits
    for (let r = 0; r < 3; r++) {
      const y = y0 + r * dy, on = r === sr && o.he > 0;
      s += `<rect x="${x0 - 62}" y="${y - 9}" width="${2 * dx + 124}" height="18" rx="4" fill="${on ? copper : '#d9c6b8'}" fill-opacity="${on ? 0.85 : 0.5}"/>`;
      if (on) s += `<path d="M${x0 - 52} ${y}H${x0 - 22}" stroke="#fff" stroke-width="2.2" marker-end="url(#mr-cur)"/>`;
    }
    // bits
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const x = x0 + c * dx, y = y0 + r * dy, k = kind(r, c), b = o.bits[r][c];
      const col = k === 'none' ? '#8a9aa5' : C[k];
      const one = b.mz > 0;
      s += `<rect x="${x - 17}" y="${y - 27}" width="34" height="54" rx="15" fill="${one ? '#e3ebfb' : '#fff'}" stroke="${col}" stroke-width="${k === 'sel' ? 3.2 : k === 'none' ? 1.4 : 2.4}"/>`;
      const L = 19, ex = b.mx * L, ez = -b.mz * L, len = Math.hypot(ex, ez) || 1;
      const hx = ex / len, hz = ez / len;
      s += `<line x1="${(x - ex * 0.85).toFixed(1)}" y1="${(y - ez * 0.85).toFixed(1)}" x2="${(x + ex - hx * 6).toFixed(1)}" y2="${(y + ez - hz * 6).toFixed(1)}" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
      s += `<path d="M${(x + ex).toFixed(1)} ${(y + ez).toFixed(1)}L${(x + ex - hx * 8 - hz * 5).toFixed(1)} ${(y + ez - hz * 8 + hx * 5).toFixed(1)}L${(x + ex - hx * 8 + hz * 5).toFixed(1)} ${(y + ez - hz * 8 - hx * 5).toFixed(1)}z" fill="${ink}"/>`;
      s += `<text x="${x + 24}" y="${y + 25}" font-size="15" font-weight="800" fill="${one ? '#1f4ea8' : muted}">${one ? '1' : '0'}</text>`;
    }
    // bit lines: columns, over the bits (drawn translucent so the bits show through)
    for (let c = 0; c < 3; c++) {
      const x = x0 + c * dx, on = c === sc && o.hx > 0;
      s += `<rect x="${x - 7}" y="${y0 - 52}" width="14" height="${2 * dy + 104}" rx="4" fill="${on ? copper : '#d9c6b8'}" fill-opacity="${on ? 0.55 : 0.35}"/>`;
      if (on) s += `<path d="M${x} ${y0 - 46}V${y0 - 30}" stroke="#fff" stroke-width="2.2" marker-end="url(#mr-cur)"/>`;
    }
    // labels
    const t = (x, y, txt, anchor, color, w) => `<text x="${x}" y="${y}" font-size="13.5" font-weight="${w || 600}" fill="${color || muted}" text-anchor="${anchor || 'start'}">${txt}</text>`;
    s += t(8, y0 + sr * dy - 14, 'word line', 'start', o.he > 0 ? copper : muted, 700);
    s += t(8, y0 + sr * dy + 26, o.he > 0 ? `H<tspan font-size="9" dy="3">e</tspan><tspan dy="-3"> = ${o.he.toFixed(2)} H</tspan><tspan font-size="9" dy="3">K</tspan>` : 'no current', 'start', o.he > 0 ? copper : muted);
    s += t(x0 + sc * dx, H - 8, o.hx > 0 ? `bit line · H<tspan font-size="9" dy="3">x</tspan><tspan dy="-3"> = ${o.hx.toFixed(2)} H</tspan><tspan font-size="9" dy="3">K</tspan>` : 'bit line · no current', 'middle', o.hx > 0 ? copper : muted, 700);
    // field directions at the selected bit
    s += `<g transform="translate(${W - 40} ${y0 - 22})"><path d="M0 34V4" stroke="#2e8b57" stroke-width="3" marker-end="url(#mr-fld)"/><text x="7" y="16" font-size="12.5" font-weight="700" fill="#2e8b57">easy</text>`;
    s += `<path d="M-16 50H12" stroke="#2e8b57" stroke-width="3" marker-end="url(#mr-fld)"/><text x="-22" y="67" font-size="12.5" font-weight="700" fill="#2e8b57">hard</text></g>`;
    s += '</svg>';
    return s;
  }

  window.MagViews = { MagSphere, mram };
})();
