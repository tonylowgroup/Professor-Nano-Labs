/* Graphene electrostatics: the pictures, as SVG strings, in the style of the video's slides.
   kgrid: allowed k points (periodic boundary conditions) and the Fermi circle, next to the filled cone.
   cone:  the Dirac cone filled with electrons, fading with the Fermi function, and f(E) beside it.
   gate:  the metal / oxide / graphene capacitor, its charges, and where the gate voltage goes. Needs window.GE. */
(function () {
  'use strict';
  const G = window.GE;
  const FONT = 'Inter, system-ui, sans-serif';
  const BALL = '#2f5fd0', EDGE = '#1c3f99', LINE = '#14232c', EF = '#d9495f', MUTED = '#5f7382', OK = '#2e8b57';
  const fermi = (E, mu, T) => (T <= 0 ? (E < mu ? 1 : E > mu ? 0 : 0.5) : 1 / (1 + Math.exp((E - mu) / G.kT(T))));
  const sub = (a, b, size) => `${a}<tspan font-size="${size || 9}" dy="3">${b}</tspan><tspan dy="-3"></tspan>`;
  const txt = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${o.size || 12.5}" font-weight="${o.weight || 600}" fill="${o.fill || LINE}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.italic ? ' font-style="italic"' : ''}>${s}</text>`;
  const arrow = (x1, y1, x2, y2, col, w = 1.6) => {
    const L = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / L, uy = (y2 - y1) / L, s = 7;
    return `<line x1="${x1}" y1="${y1}" x2="${x2 - ux * s * 0.7}" y2="${y2 - uy * s * 0.7}" stroke="${col}" stroke-width="${w}"/><path d="M${x2},${y2} L${x2 - ux * s - uy * s * 0.5},${y2 - uy * s + ux * s * 0.5} L${x2 - ux * s + uy * s * 0.5},${y2 - uy * s - ux * s * 0.5} z" fill="${col}"/>`;
  };

  // the cone in side view, with balls; box = [x0, y0, w, h], energy range [-Emax, Emax]
  function coneBalls(box, Ef, T, Emax, opts = {}) {
    const [x0, y0, w, h] = box, cx = x0 + w / 2, cy = y0 + h / 2, sE = (h / 2) / Emax, sx = (w / 2) / Emax;
    const Y = E => cy - E * sE;
    let s = '';
    const dE = opts.dE || Emax / 7, r = Math.min(dE * sE / 2 - 0.8, 7.5);
    for (let k = -Math.ceil(Emax / dE); k <= Math.ceil(Emax / dE); k++) {
      const E = (k + (k >= 0 ? 0.5 : -0.5)) * dE;
      if (Math.abs(E) > Emax) continue;
      const f = fermi(E, Ef, T), half = Math.abs(E) * sx - r - 1, nb = Math.max(1, Math.floor((2 * half) / (2 * r + 1.5)) + 1);
      for (let i = 0; i < nb; i++) {
        const x = nb === 1 ? cx : cx - half + 2 * half * i / (nb - 1);
        if (E < 0 && f < 0.97) s += `<circle cx="${x.toFixed(1)}" cy="${Y(E).toFixed(1)}" r="${r.toFixed(1)}" fill="#fff" stroke="${EDGE}" stroke-opacity="${(0.25 + 0.75 * (1 - f)).toFixed(2)}" stroke-width="1.2"/>`;
        if (f > 0.03) s += `<circle cx="${x.toFixed(1)}" cy="${Y(E).toFixed(1)}" r="${r.toFixed(1)}" fill="${BALL}" fill-opacity="${f.toFixed(2)}" stroke="${EDGE}" stroke-opacity="${(0.6 * f).toFixed(2)}" stroke-width="0.8"/>`;
      }
    }
    s += `<path d="M${cx - w / 2},${y0} L${cx + w / 2},${y0 + h} M${cx + w / 2},${y0} L${cx - w / 2},${y0 + h}" stroke="${LINE}" stroke-width="2" fill="none"/>`;
    s += arrow(x0 - 6, cy, x0 + w + 12, cy, '#e07b1f', 1.6) + arrow(cx, y0 + h + 6, cx, y0 - 10, '#c0392b', 1.6);
    s += txt(cx + 6, y0 - 4, 'E', { italic: true, size: 13 }) + txt(x0 + w + 4, cy - 6, 'k', { italic: true, size: 13 });
    if (Math.abs(Ef) <= Emax) {
      s += `<line x1="${x0 - 4}" y1="${Y(Ef)}" x2="${x0 + w + 4}" y2="${Y(Ef)}" stroke="${OK}" stroke-width="1.6" stroke-dasharray="6 4"/>`;
      s += txt(x0 + w + 8, Y(Ef) + 4, sub('E', 'F'), { fill: OK, italic: true, size: 13 });
    }
    return s;
  }

  /* st: { L (nm), Ef (eV), vF, narrow } */
  function kgrid(st) {
    const narrow = !!st.narrow, W = narrow ? 440 : 760, H = narrow ? 560 : 360;
    const kF = G.kF(st.Ef, st.vF), step = 2 * Math.PI / st.L;
    const R = Math.max(1.35 * kF, 3.2 * step);                // half-width of the k window, nm^-1
    const px = narrow ? 210 : 320, ox = narrow ? W / 2 : 24 + px / 2 + 8, oy = narrow ? 28 + px / 2 : H / 2 + 4, sc = px / 2 / R;
    let s = `<rect x="${ox - px / 2}" y="${oy - px / 2}" width="${px}" height="${px}" fill="#f8fafc" stroke="#d9e2e8"/>`;
    const M = Math.floor(R / step), dense = M > 34;
    for (let mx = -M; mx <= M; mx++) for (let my = -M; my <= M; my++) {
      const kx = mx * step, ky = my * step, X = ox + kx * sc, Yp = oy - ky * sc, inside = kx * kx + ky * ky < kF * kF;
      const r = dense ? 1.6 : Math.min(4.2, step * sc * 0.28);
      s += inside ? `<circle cx="${X.toFixed(1)}" cy="${Yp.toFixed(1)}" r="${r.toFixed(1)}" fill="${BALL}"/>` : `<circle cx="${X.toFixed(1)}" cy="${Yp.toFixed(1)}" r="${(r * 0.75).toFixed(1)}" fill="#9fb1ba"/>`;
    }
    // one state's share of k-space, as on the slides
    if (!dense) s += `<rect x="${ox}" y="${oy - step * sc}" width="${step * sc}" height="${step * sc}" fill="rgba(31, 78, 168, 0.25)" stroke="${BALL}" stroke-width="1.2"/>`;
    s += `<circle cx="${ox}" cy="${oy}" r="${(kF * sc).toFixed(1)}" fill="none" stroke="${OK}" stroke-width="2" stroke-dasharray="6 4"/>`;
    s += arrow(ox - px / 2, oy, ox + px / 2 + 6, oy, '#c0392b', 1.4) + arrow(ox, oy + px / 2, ox, oy - px / 2 - 6, '#c0392b', 1.4);
    s += txt(ox + px / 2 - 2, oy - 6, sub('k', 'x'), { italic: true, anchor: 'end' }) + txt(ox + 6, oy - px / 2 + 12, sub('k', 'y'), { italic: true });
    s += `<line x1="${ox}" y1="${oy}" x2="${(ox + kF * sc * 0.707).toFixed(1)}" y2="${(oy + kF * sc * 0.707).toFixed(1)}" stroke="${OK}" stroke-width="1.6"/>` + txt((ox + kF * sc * 0.42).toFixed(1), (oy + kF * sc * 0.42 + 16).toFixed(1), sub('k', 'F'), { fill: OK, italic: true });
    const N = G.count(st.L, kF);
    const cbox = narrow ? [W / 2 - 90, oy + px / 2 + 50, 180, 150] : [ox + px / 2 + 120, oy - 130, 230, 220];
    s += coneBalls(cbox, st.Ef, 0, Math.max(0.12, 1.6 * st.Ef), { dE: Math.max(0.12, 1.6 * st.Ef) / 6 });
    const cxm = cbox[0] + cbox[2] / 2, ty = cbox[1] + cbox[3] + 36;
    s += txt(cxm, ty, `${N} k-points × 4 = ${4 * N} electrons`, { anchor: 'middle', weight: 800 });
    s += txt(cxm, ty + 20, `formula: ${(kF * kF * st.L * st.L / Math.PI).toFixed(1)}`, { anchor: 'middle', fill: MUTED });
    return `<svg class="ge__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Allowed k points in a ${st.L} nm sample: ${N} inside the Fermi circle, ${4 * N} electrons">${s}</svg>`;
  }

  /* st: { Ef, T, Emax, narrow } -> the cone with Fermi-Dirac filling, and f(E) beside it */
  function cone(st) {
    const narrow = !!st.narrow, W = narrow ? 440 : 760, H = 360, Emax = st.Emax || 0.5;
    const fw = narrow ? 120 : 180, cw = narrow ? 230 : 300, gap = narrow ? 40 : 90;
    const x0 = (W - fw - gap - cw) / 2, top = 34, h = H - 70;
    const cy = top + h / 2, sE = (h / 2) / Emax, Y = E => cy - E * sE;
    let s = '';
    // f(E) panel
    const fx = x0, fX = f => fx + f * fw;
    s += arrow(fx, cy, fx + fw + 14, cy, '#e07b1f', 1.4) + arrow(fx, top + h, fx, top - 8, '#c0392b', 1.4);
    s += txt(fx + 6, top - 2, 'E', { italic: true, size: 13 }) + txt(fx + fw + 8, cy - 6, 'f', { italic: true, size: 13 });
    s += `<line x1="${fX(1)}" y1="${cy - 3}" x2="${fX(1)}" y2="${cy + 3}" stroke="${LINE}"/>` + txt(fX(1), cy + 16, '1', { anchor: 'middle', size: 11 }) + txt(fx - 6, cy + 4, '0', { anchor: 'end', size: 11 });
    let d = '';
    for (let i = 0; i <= 200; i++) { const E = -Emax + 2 * Emax * i / 200; d += `${i ? 'L' : 'M'}${fX(fermi(E, st.Ef, st.T)).toFixed(1)},${Y(E).toFixed(1)}`; }
    s += `<path d="${d}" fill="none" stroke="#1f4ea8" stroke-width="2.2"/>`;
    if (Math.abs(st.Ef) <= Emax) s += `<line x1="${fx - 4}" y1="${Y(st.Ef)}" x2="${fx + fw}" y2="${Y(st.Ef)}" stroke="${OK}" stroke-width="1.4" stroke-dasharray="6 4"/>`;
    s += txt(fx + fw / 2, top + h + 30, 'Fermi–Dirac occupation f(E)', { anchor: 'middle', size: 12, fill: MUTED });
    // the cone
    s += coneBalls([x0 + fw + gap, top, cw, h], st.Ef, st.T, Emax, { dE: Emax / 7.5 });
    s += txt(x0 + fw + gap + cw / 2, top + h + 30, 'Blue: electrons. White: holes (empty states).', { anchor: 'middle', size: 12, fill: MUTED });
    return `<svg class="ge__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="The Dirac cone filled up to the Fermi level at ${st.T} K">${s}</svg>`;
  }

  /* st: { V, Ef, net (n - p, per nm^2), Cox (F/m^2), d (nm), er, narrow } */
  function gate(st) {
    const narrow = !!st.narrow, W = narrow ? 440 : 760;
    let H = 360;
    const sx = narrow ? 30 : 40, sw = narrow ? 230 : 330, top = 44;
    const tOx = Math.max(26, Math.min(110, 26 + 28 * Math.log10(st.d)));        // oxide drawn on a log scale of thickness
    const gy = top, oy = gy + 46, cy = oy + tOx, ly = cy + 18;
    let s = '';
    s += `<rect x="${sx}" y="${gy}" width="${sw}" height="44" rx="4" fill="#9aa7b4"/>` + txt(sx + 12, gy + 27, 'Metal gate', { fill: '#fff', weight: 700 });
    s += `<rect x="${sx}" y="${oy}" width="${sw}" height="${tOx}" fill="#f2c59a"/>` + txt(sx + 12, oy + tOx / 2 + 5, `Oxide · ${st.d >= 10 ? st.d.toFixed(0) : st.d.toFixed(1)} nm · ε<tspan font-size="9" dy="3">r</tspan><tspan dy="-3"> = ${st.er.toFixed(1)}</tspan>`, { fill: '#7a4a17', weight: 700 });
    // graphene: a row of hexagons
    let hex = '';
    for (let x = sx; x < sx + sw - 8; x += 15) hex += `M${x},${cy + 8} l4,-6 h7 l4,6 l-4,6 h-7 z`;
    s += `<path d="${hex}" fill="none" stroke="#30404d" stroke-width="1.3"/>` + txt(sx + sw + 10, cy + 13, 'graphene', { weight: 700 });
    // the gate wire and ground
    s += `<line x1="${sx + sw / 2}" y1="${gy}" x2="${sx + sw / 2}" y2="${gy - 22}" stroke="${LINE}" stroke-width="1.6"/><circle cx="${sx + sw / 2}" cy="${gy - 24}" r="3.5" fill="${EF}"/>` + txt(sx + sw / 2 + 10, gy - 18, `V = ${st.V >= 0 ? '+' : '−'}${Math.abs(st.V) >= 10 ? Math.abs(st.V).toFixed(1) : Math.abs(st.V).toFixed(2)} V`, { fill: EF, weight: 800 });
    s += `<line x1="${sx + sw / 2}" y1="${cy + 14}" x2="${sx + sw / 2}" y2="${ly + 26}" stroke="${LINE}" stroke-width="1.6"/><path d="M${sx + sw / 2 - 14},${ly + 26} h28 M${sx + sw / 2 - 9},${ly + 31} h18 M${sx + sw / 2 - 4},${ly + 36} h8" stroke="${LINE}" stroke-width="1.6"/>`;
    // charges: one symbol per unit of |Q|, the same count on both plates
    const nq = Math.min(16, Math.round(Math.abs(st.net) / 0.004));        // one symbol per 4e11 cm^-2, at most 16
    const plus = st.V >= 0;
    for (let i = 0; i < nq; i++) {
      const x = sx + 14 + (sw - 28) * (i + 0.5) / nq;
      s += txt(x, oy + 12, plus ? '+' : '−', { anchor: 'middle', weight: 800, size: 14, fill: plus ? '#c0392b' : '#1f4ea8' });
      s += plus ? `<circle cx="${x.toFixed(1)}" cy="${cy - 6}" r="4" fill="${BALL}"/>` : `<circle cx="${x.toFixed(1)}" cy="${cy - 6}" r="4" fill="#fff" stroke="${EDGE}" stroke-width="1.2"/>`;
    }
    s += txt(sx, ly + 58, nq ? `${plus ? 'Electrons' : 'Holes'} in graphene, ${(100 * Math.abs(st.net)).toFixed(2)} × 10¹² cm⁻² (one symbol ≈ 4 × 10¹¹ cm⁻²)` : 'Neutral: no net charge', { size: 12, fill: MUTED });
    // where the voltage goes: a bar split into the drop across the oxide and E_F / e
    const bx = narrow ? sx + 40 : sx + sw + 110, bTop = narrow ? ly + 90 : top, bH = narrow ? 200 : 250, bw = 46;
    if (narrow) H = bTop + bH + 24;
    const Vabs = Math.abs(st.V) || 1e-9, efFrac = Math.min(1, Math.abs(st.Ef) / Vabs), hEf = bH * efFrac;
    s += `<rect x="${bx}" y="${bTop}" width="${bw}" height="${bH - hEf}" fill="#f2c59a" stroke="#c88a4d"/>`;
    s += `<rect x="${bx}" y="${bTop + bH - hEf}" width="${bw}" height="${hEf}" fill="#b9e3c9" stroke="${OK}"/>`;
    s += txt(bx + bw / 2, bTop - 10, 'Where V goes', { anchor: 'middle', weight: 800 });
    const vox = st.V - st.Ef, fmtV = v => `${v < 0 ? '−' : ''}${Math.abs(v) >= 10 ? Math.abs(v).toFixed(1) : Math.abs(v).toFixed(3)} V`;
    s += txt(bx + bw + 10, bTop + (bH - hEf) / 2 - 4, 'across the oxide', { size: 12.5 }) + txt(bx + bw + 10, bTop + (bH - hEf) / 2 + 12, fmtV(vox), { size: 12.5, weight: 800 });
    const ly2 = Math.min(bTop + bH - Math.max(hEf, 14) / 2, bTop + bH - 4);
    s += txt(bx + bw + 10, ly2 - 4, `Fermi level, E<tspan font-size="9" dy="3">F</tspan><tspan dy="-3">/e</tspan>`, { size: 12.5, fill: OK, weight: 700 }) + txt(bx + bw + 10, ly2 + 12, `${fmtV(st.Ef)} (${(100 * efFrac).toFixed(1)}%)`, { size: 12.5, fill: OK, weight: 800 });
    return `<svg class="ge__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gate capacitor at ${st.V.toFixed(2)} V: ${(100 * efFrac).toFixed(1)} percent of the voltage goes into the Fermi level">${s}</svg>`;
  }

  window.GEViews = { kgrid, cone, gate, coneBalls };
})();
