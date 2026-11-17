/* Pictures for the TMR lab: the sphere of spin directions (built on the shared BlochSphere), the Fermi circles with
   the tunnelling window, and the four spin channels. */
(function () {
  'use strict';
  const NOLABELS = { z0: '', z1: '', xp: '', xm: '', yp: '', ym: '' };
  const INK = '#14232c', MUTED = '#5f7382', MAJ = '#d23b2e', MIN = '#1f6fb4';

  /* scene = { arrows: [{ v, color, width, label }], from: [{ a, b, color }], caption } */
  class SpinSphere extends BlochSphere {
    constructor(canvas) { super(canvas, { az: 28, el: 16, labels: NOLABELS }); }
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
    draw(scene) {
      const S = scene || {};
      super.draw({ arrows: (S.arrows || []).map(a => ({ v: a.v, color: a.color, width: a.width || 3.2, dot: 3.6 })), trail: S.trail || [], caption: S.caption });
      this.scene = S;
      (S.from || []).forEach(f => this._vec(f.a, f.b, f.color, f.width || 2.4));
      // labels at the arrow tips
      const c = this.ctx;
      (S.arrows || []).forEach(a => {
        if (!a.label) return;
        const len = Math.hypot(...a.v); if (len < 0.15) return;
        const P = this.project(a.v.map(x => x * (1 + 0.16 / len)));
        c.save(); c.font = '700 12.5px Inter, system-ui, sans-serif'; c.fillStyle = a.color; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.globalAlpha = P.d < -0.2 ? 0.6 : 1;
        const O = this.project([0, 0, 0]), dx = P.x - O.x, dy = P.y - O.y, l = Math.hypot(dx, dy) || 1;
        // beside the tip, pushed sideways so it clears the axis labels
        const lx = P.x + 16 * (-dy / l) * (a.side || 1), ly = P.y + 16 * (dx / l) * (a.side || 1) - 4;
        c.fillText(a.label, Math.max(14, Math.min(this.w - 14, lx)), Math.max(10, Math.min(this.h - 10, ly)));
        c.restore();
      });
    }
  }

  /* A cut through the two Fermi spheres (k_x across the barrier, k∥ along it), with the band of k∥ that tunnels.
     o = { ku, kd, kw, narrow } (Å⁻¹) */
  function fermi(o) {
    const W = 460, H = 300, cx = 230, cy = 150, km = Math.max(o.ku, 0.3) * 1.18, s = 125 / km;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cross-section of the Fermi spheres: majority radius ${o.ku.toFixed(2)} per ångström, minority ${o.kd > 0 ? `radius ${o.kd.toFixed(2)}` : 'absent'}; electrons with transverse wavevector below about ${o.kw.toFixed(2)} tunnel">`;
    svg += '<style>text{paint-order:stroke;stroke:#fff;stroke-width:3.5px;stroke-linejoin:round}</style>';
    const band = Math.min(o.kw, km) * s;
    svg += `<rect x="${cx - 140}" y="${cy - band}" width="${W - 8 - (cx - 140)}" height="${2 * band}" fill="#2e8b57" fill-opacity=".12"/>`;
    svg += `<line x1="${cx - 140}" y1="${cy - band}" x2="${cx + 140}" y2="${cy - band}" stroke="#2e8b57" stroke-dasharray="4 3"/><line x1="${cx - 140}" y1="${cy + band}" x2="${cx + 140}" y2="${cy + band}" stroke="#2e8b57" stroke-dasharray="4 3"/>`;
    svg += `<line x1="${cx - 150}" y1="${cy}" x2="${cx + 150}" y2="${cy}" stroke="#9fb3bd"/><line x1="${cx}" y1="${cy - 140}" x2="${cx}" y2="${cy + 140}" stroke="#9fb3bd"/>`;
    svg += `<text x="${cx + 152}" y="${cy + 4}" font-size="13" fill="${MUTED}" font-style="italic">k<tspan font-size="9" dy="3">x</tspan></text><text x="${cx + 6}" y="${cy - 132}" font-size="13" fill="${MUTED}" font-style="italic">k<tspan font-size="9" dy="3">∥</tspan></text>`;
    svg += `<circle cx="${cx}" cy="${cy}" r="${(o.ku * s).toFixed(1)}" fill="${MAJ}" fill-opacity=".05" stroke="${MAJ}" stroke-width="2.4"/>`;
    if (o.kd > 0) svg += `<circle cx="${cx}" cy="${cy}" r="${(o.kd * s).toFixed(1)}" fill="${MIN}" fill-opacity=".07" stroke="${MIN}" stroke-width="2.4"/>`;
    // the tunnelling states: the right-moving arcs inside the band
    const arc = (k, col) => {
      if (!(k > 0)) return '';
      const r = k * s, h = Math.min(band, r), a = Math.asin(h / r);
      const x1 = cx + r * Math.cos(a), y1 = cy - h, x2 = cx + r * Math.cos(a), y2 = cy + h;
      return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round"/>`;
    };
    svg += arc(o.ku, MAJ) + arc(o.kd, MIN);
    svg += `<text x="${cx - o.ku * s * 0.71 - 4}" y="${cy - o.ku * s * 0.71 - 6}" font-size="13" font-weight="700" fill="${MAJ}" text-anchor="end">majority, k↑ = ${o.ku.toFixed(2)} Å⁻¹</text>`;
    if (o.kd > 0) svg += `<text x="${cx - 8}" y="${cy + o.kd * s + 18}" font-size="13" font-weight="700" fill="${MIN}" text-anchor="end">minority, k↓ = ${o.kd.toFixed(2)}</text>`;
    else svg += `<text x="${cx - 8}" y="${cy + 22}" font-size="13" font-weight="700" fill="${MIN}" text-anchor="end">no minority states at E<tspan font-size="9" dy="3">F</tspan></text>`;
    svg += `<text x="${W - 8}" y="${cy - band - 6}" font-size="12.5" font-weight="700" fill="#2e8b57" text-anchor="end">tunnels: |k∥| ≲ ${o.kw.toFixed(2)} Å⁻¹</text>`;
    svg += '</svg>';
    return svg;
  }

  /* The four spin channels at angle θ: ribbons from the fixed layer's majority/minority to the free layer's,
     with widths proportional to their share of the conductance. ch[out][in] in S/µm². */
  function channels(o) {
    const W = 460, H = 300, x0 = 120, x1 = 340, y = [95, 205], tot = o.ch[0][0] + o.ch[0][1] + o.ch[1][0] + o.ch[1][1];
    const col = [MAJ, MIN], nm = ['majority', 'minority'];
    const share = (t, s) => (tot > 0 ? (100 * o.ch[t][s] / tot).toFixed(1) : '0');
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Shares of the conductance at θ = ${o.th.toFixed(0)}°: majority to majority ${share(0, 0)}%, minority to minority ${share(1, 1)}%, majority to minority ${share(1, 0)}%, minority to majority ${share(0, 1)}%">`;
    svg += '<style>text{paint-order:stroke;stroke:#fff;stroke-width:3.5px;stroke-linejoin:round}</style>';
    svg += `<text x="${x0}" y="26" font-size="13" font-weight="700" fill="${INK}" text-anchor="middle">fixed layer</text><text x="${x1}" y="26" font-size="13" font-weight="700" fill="${INK}" text-anchor="middle">free layer</text>`;
    svg += `<text x="${x0}" y="42" font-size="11.5" fill="${MUTED}" text-anchor="middle">spins along m₁</text><text x="${x1}" y="42" font-size="11.5" fill="${MUTED}" text-anchor="middle">spins along m₂</text>`;
    const maxw = 60;
    for (let s = 0; s < 2; s++) for (let t = 0; t < 2; t++) {
      const f = tot > 0 ? o.ch[t][s] / tot : 0;
      if (f < 0.002) continue;
      const w = Math.max(1.5, maxw * Math.sqrt(f)), ya = y[s], yb = y[t];
      svg += `<path d="M${x0 + 18} ${ya}C${(x0 + x1) / 2} ${ya} ${(x0 + x1) / 2} ${yb} ${x1 - 18} ${yb}" fill="none" stroke="${col[s]}" stroke-opacity="${s === t ? 0.45 : 0.3}" stroke-width="${w.toFixed(1)}"/>`;
      // straight channels are labelled above (majority) or below (minority) their ribbon; the crossed ones in a line underneath
      if (s === t) svg += `<text x="${(x0 + x1) / 2}" y="${ya + (s ? 1 : -1) * (w / 2 + 9) + (s ? 4 : 0)}" font-size="12.5" font-weight="700" fill="${col[s]}" text-anchor="middle">${(100 * f).toFixed(f < 0.1 ? 1 : 0)}%</text>`;
    }
    for (let s = 0; s < 2; s++) {
      svg += `<circle cx="${x0}" cy="${y[s]}" r="16" fill="#fff" stroke="${col[s]}" stroke-width="2.6"/><text x="${x0 - 24}" y="${y[s] + 4}" font-size="12.5" font-weight="700" fill="${col[s]}" text-anchor="end">${nm[s]}</text>`;
      svg += `<circle cx="${x1}" cy="${y[s]}" r="16" fill="#fff" stroke="${col[s]}" stroke-width="2.6"/><text x="${x1 + 24}" y="${y[s] + 4}" font-size="12.5" font-weight="700" fill="${col[s]}">${nm[s]}</text>`;
    }
    const fx = (t, s) => { const f = tot > 0 ? o.ch[t][s] / tot : 0; return `${(100 * f).toFixed(f < 0.1 ? 1 : 0)}%`; };
    svg += `<text x="${(x0 + x1) / 2}" y="${H - 34}" font-size="12.5" font-weight="700" text-anchor="middle"><tspan fill="${MAJ}">majority → minority ${fx(1, 0)}</tspan><tspan fill="${MUTED}"> · </tspan><tspan fill="${MIN}">minority → majority ${fx(0, 1)}</tspan></text>`;
    svg += `<text x="${(x0 + x1) / 2}" y="${H - 14}" font-size="12" fill="${MUTED}" text-anchor="middle">ribbon width: share of the conductance at θ = ${o.th.toFixed(0)}°</text>`;
    svg += '</svg>';
    return svg;
  }

  window.TMRViews = { SpinSphere, fermi, channels };
})();
