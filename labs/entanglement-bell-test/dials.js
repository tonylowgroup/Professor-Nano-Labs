/* Entanglement lab: the source and the two dials, drawn as SVG.
   A dial is a measurement axis in the x-z plane, at angle theta from z (up) toward x (right).
   Its + end is "spin up along the dial". After a shot, a thick arrow shows the result. */
(function () {
  'use strict';
  const C = { ink: '#14232c', muted: '#5f7382', ring: '#b9c7cf', plus: '#a3326c', minus: '#1f6fb4', amber: '#c47a12', amberFill: 'rgba(224, 162, 27, 0.16)' };
  const F = 'Inter, system-ui, sans-serif';
  const dir = th => [Math.sin(th), -Math.cos(th)];      // screen direction, y down
  const deg = th => Math.round(th * 180 / Math.PI) + '°';

  function arrowHead(x, y, ux, uy, color, size) {
    const s = size || 9;
    return `<path d="M${x},${y} L${x - ux * s - uy * s * 0.5},${y - uy * s + ux * s * 0.5} L${x - ux * s + uy * s * 0.5},${y - uy * s - ux * s * 0.5} z" fill="${color}"/>`;
  }

  /* Shade the half of the dial whose directions lie within 90 degrees of angle phi. */
  function halfDisc(cx, cy, R, phi) {
    const [ux, uy] = dir(phi);
    const px = -uy, py = ux;                                // perpendicular
    return `<path d="M${cx + px * R},${cy + py * R} A${R},${R} 0 0 0 ${cx - px * R},${cy - py * R} Z" fill="${C.amberFill}" transform="rotate(0)"/>` +
      `<line x1="${cx}" y1="${cy}" x2="${cx + ux * R * 0.92}" y2="${cy + uy * R * 0.92}" stroke="${C.amber}" stroke-width="1.6" stroke-dasharray="4 3"/>`;
  }

  function dial(cx, cy, R, o) {
    let s = '';
    s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#fff" stroke="${C.ring}" stroke-width="1.6"/>`;
    // axis names sit just inside the rim, so the dial's own +/- labels outside never collide with them
    s += `<line x1="${cx}" y1="${cy - R}" x2="${cx}" y2="${cy - R + 6}" stroke="${C.ring}" stroke-width="1.5"/><line x1="${cx + R}" y1="${cy}" x2="${cx + R - 6}" y2="${cy}" stroke="${C.ring}" stroke-width="1.5"/>`;
    s += `<text x="${cx + 8}" y="${cy - R + 14}" font-family="${F}" font-size="11" fill="${C.muted}" font-style="italic">z</text>`;
    s += `<text x="${cx + R - 14}" y="${cy - 6}" font-family="${F}" font-size="11" fill="${C.muted}" font-style="italic">x</text>`;
    if (o.lambda !== undefined && o.lambda !== null) s += halfDisc(cx, cy, R - 2, o.lambda);
    // the other setting (CHSH): faint dashed axis
    if (o.alt !== undefined && o.alt !== null) {
      const [ux, uy] = dir(o.alt);
      s += `<line x1="${cx - ux * R}" y1="${cy - uy * R}" x2="${cx + ux * R}" y2="${cy + uy * R}" stroke="${C.ink}" stroke-opacity="${o.altActive ? 0.9 : 0.3}" stroke-width="${o.altActive ? 2.2 : 1.4}" stroke-dasharray="6 4"/>`;
      s += `<text x="${cx + ux * (R + 14)}" y="${cy + uy * (R + 14) + 4}" text-anchor="middle" font-family="${F}" font-size="12" font-weight="700" fill="${C.ink}" fill-opacity="${o.altActive ? 1 : 0.5}">${o.altLabel}</text>`;
    }
    const [ux, uy] = dir(o.theta);
    const on = o.altActive ? 0.3 : 1;
    s += `<line x1="${cx - ux * R}" y1="${cy - uy * R}" x2="${cx + ux * R}" y2="${cy + uy * R}" stroke="${C.ink}" stroke-opacity="${on}" stroke-width="2.2"/>`;
    s += `<text x="${cx + ux * (R + 14)}" y="${cy + uy * (R + 14) + 4}" text-anchor="middle" font-family="${F}" font-size="12" font-weight="700" fill="${C.plus}" fill-opacity="${on}">+${o.label ? ' ' + o.label : ''}</text>`;
    s += `<text x="${cx - ux * (R + 12)}" y="${cy - uy * (R + 12) + 4}" text-anchor="middle" font-family="${F}" font-size="12" font-weight="700" fill="${C.minus}" fill-opacity="${on}">−</text>`;
    // the result of the last shot: a spin arrow along +n or -n of the dial that was used
    if (o.result) {
      const th = o.altActive ? o.alt : o.theta;
      const [vx, vy] = dir(th);
      const sgn = o.result, col = sgn > 0 ? C.plus : C.minus, L = R * 0.78;
      s += `<line x1="${cx}" y1="${cy}" x2="${cx + sgn * vx * L}" y2="${cy + sgn * vy * L}" stroke="${col}" stroke-width="5" stroke-linecap="round"/>`;
      s += arrowHead(cx + sgn * vx * (L + 8), cy + sgn * vy * (L + 8), sgn * vx, sgn * vy, col, 13);
    }
    s += `<circle cx="${cx}" cy="${cy}" r="4" fill="${C.ink}"/>`;
    s += `<text x="${cx}" y="${cy + R + 34}" text-anchor="middle" font-family="${F}" font-size="13" font-weight="700" fill="${C.ink}">${o.name}</text>`;
    s += `<text x="${cx}" y="${cy + R + 52}" text-anchor="middle" font-family="${F}" font-size="12.5" fill="${o.result ? (o.result > 0 ? C.plus : C.minus) : C.muted}">${o.result ? (o.result > 0 ? '+1: up along the dial' : '−1: down along the dial') : 'no result yet'}</text>`;
    return s;
  }

  function draw(st) {
    // narrow screens get a tighter layout at the same text size instead of a scaled-down drawing
    const narrow = !!st.narrow;
    const W = narrow ? 372 : 660, H = narrow ? 236 : 270, R = narrow ? 48 : 66, cy = narrow ? 84 : 110;
    const ax = narrow ? 70 : 130, bx = narrow ? 302 : 530, sx = narrow ? 186 : 330;
    let s = '';
    // beams
    s += `<line x1="${sx - (narrow ? 28 : 34)}" y1="${cy}" x2="${ax + R + 6}" y2="${cy}" stroke="${C.ring}" stroke-width="2" stroke-dasharray="5 5"/>`;
    s += `<line x1="${sx + (narrow ? 28 : 34)}" y1="${cy}" x2="${bx - R - 6}" y2="${cy}" stroke="${C.ring}" stroke-width="2" stroke-dasharray="5 5"/>`;
    s += arrowHead(ax + R + 6, cy, -1, 0, C.ring, 9) + arrowHead(bx - R - 6, cy, 1, 0, C.ring, 9);
    // source
    s += `<circle cx="${sx}" cy="${cy}" r="${narrow ? 26 : 32}" fill="#fbf7ee" stroke="${C.amber}" stroke-width="1.6"/>`;
    const last = st.last || {};
    if (st.source === 'arrow' && last.lambda !== undefined) {
      const [ux, uy] = dir(last.lambda);
      s += `<line x1="${sx - ux * 18}" y1="${cy - uy * 18}" x2="${sx + ux * 18}" y2="${cy + uy * 18}" stroke="${C.amber}" stroke-width="3"/>` + arrowHead(sx + ux * 22, cy + uy * 22, ux, uy, C.amber, 10);
      s += `<text x="${sx}" y="${cy + (narrow ? 44 : 52)}" text-anchor="middle" font-family="${F}" font-size="12" font-weight="700" fill="${C.amber}">hidden arrow λ</text>`;
    } else if (st.source === 'socks') {
      const up = last.zA === undefined ? 1 : last.zA;
      s += `<text x="${sx - 10}" y="${cy + 9}" text-anchor="middle" font-family="${F}" font-size="26" font-weight="700" fill="${C.ink}">${up > 0 ? '↑' : '↓'}</text><text x="${sx + 10}" y="${cy + 9}" text-anchor="middle" font-family="${F}" font-size="26" font-weight="700" fill="${C.ink}">${up > 0 ? '↓' : '↑'}</text>`;
      s += `<text x="${sx}" y="${cy + (narrow ? 44 : 52)}" text-anchor="middle" font-family="${F}" font-size="12" font-weight="700" fill="${C.amber}">socks: opposite along z</text>`;
    } else if (st.source === 'sheet') {
      s += `<text x="${sx}" y="${cy + 5}" text-anchor="middle" font-family="${F}" font-size="13" font-weight="800" fill="${C.amber}">sheet</text>`;
      s += `<text x="${sx}" y="${cy + (narrow ? 44 : 52)}" text-anchor="middle" font-family="${F}" font-size="12" font-weight="700" fill="${C.amber}">my answer sheet</text>`;
    } else {
      s += `<text x="${sx}" y="${cy + 6}" text-anchor="middle" font-family="${F}" font-size="15" font-weight="800" fill="${C.plus}">|Ψ⁻⟩</text>`;
      s += `<text x="${sx}" y="${cy + (narrow ? 44 : 52)}" text-anchor="middle" font-family="${F}" font-size="12" font-weight="700" fill="${C.plus}">entangled pair</text>`;
    }
    s += dial(ax, cy, R, { name: 'Alice', theta: st.a, label: st.aLabel, alt: st.aAlt, altLabel: st.aAltLabel, altActive: st.aAltActive, result: last.A, lambda: st.source === 'arrow' ? last.lambda : null });
    s += dial(bx, cy, R, { name: 'Bob', theta: st.b, label: st.bLabel, alt: st.bAlt, altLabel: st.bAltLabel, altActive: st.bAltActive, result: last.B, lambda: st.source === 'arrow' && last.lambda !== undefined ? last.lambda + Math.PI : null });
    return `<svg viewBox="0 0 ${W} ${H}" class="diagram__svg dials__svg${narrow ? ' dials__svg--narrow' : ''}" role="img" aria-label="Alice's dial at ${deg(st.a)}, Bob's at ${deg(st.b)}">${s}</svg>`;
  }

  window.Dials = { draw, C };
})();
