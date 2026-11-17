/* Graphene: the honeycomb lattice coloured by the Bloch wavefunction, and the pseudospin texture near K and K'.
   Both return SVG strings. Needs window.Gr. */
(function () {
  'use strict';
  const G = window.Gr;
  const FONT = 'Inter, system-ui, sans-serif';
  const S3 = Math.sqrt(3);
  function hue(phase, light) {               // phase -> css colour on a colour wheel (0 = red), as in the legend
    const h = ((phase * 180 / Math.PI) % 360 + 360) % 360;
    return `hsl(${h.toFixed(0)}, 78%, ${light || 52}%)`;
  }
  const arrow = (x1, y1, x2, y2, col, w, head) => {
    const L = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / L, uy = (y2 - y1) / L, s = head || 7;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${(x2 - ux * s * 0.8).toFixed(1)}" y2="${(y2 - uy * s * 0.8).toFixed(1)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>` +
      `<path d="M${x2.toFixed(1)},${y2.toFixed(1)} L${(x2 - ux * s - uy * s * 0.5).toFixed(1)},${(y2 - uy * s + ux * s * 0.5).toFixed(1)} L${(x2 - ux * s + uy * s * 0.5).toFixed(1)},${(y2 - uy * s - ux * s * 0.5).toFixed(1)} z" fill="${col}"/>`;
  };
  const sub = (a, b, size) => `${a}<tspan font-size="${size || 9}" dy="3">${b}</tspan><tspan dy="-3"></tspan>`;

  /* st: { k: [kx, ky], p, upper, narrow } */
  function lattice(st) {
    const narrow = !!st.narrow, W = narrow ? 440 : 760, H = narrow ? 360 : 380;
    const span = narrow ? 1.25 : 2.1, sc = W / span, cx = W / 2, cy = H / 2 + 6;
    const X = x => cx + x * sc, Y = y => cy - y * sc;
    const [kx, ky] = st.k, v = G.eigvec(kx, ky, st.p, st.upper);
    const amp = [Math.hypot(v[0][0], v[0][1]), Math.hypot(v[1][0], v[1][1])], ph = [Math.atan2(v[0][1], v[0][0]), Math.atan2(v[1][1], v[1][0])];
    const big = Math.max(amp[0], amp[1]) || 1;
    let bonds = '', atoms = '';
    const inside = (x, y) => Math.abs(X(x) - cx) < W / 2 - 12 && Math.abs(Y(y) - cy) < H / 2 - 16;
    const r0 = narrow ? 11 : 13;
    for (let n1 = -9; n1 <= 9; n1++) for (let n2 = -9; n2 <= 9; n2++) {
      const ax = n1 * G.A1[0] + n2 * G.A2[0], ay = n1 * G.A1[1] + n2 * G.A2[1];
      for (const [dx, dy] of G.DEL) if (inside(ax, ay) || inside(ax + dx, ay + dy)) bonds += `<line x1="${X(ax).toFixed(1)}" y1="${Y(ay).toFixed(1)}" x2="${X(ax + dx).toFixed(1)}" y2="${Y(ay + dy).toFixed(1)}"/>`;
      for (const s of [0, 1]) {
        const x = ax + (s ? G.DEL[0][0] : 0), y = ay + (s ? G.DEL[0][1] : 0);
        if (!inside(x, y)) continue;
        const phase = ph[s] + kx * x + ky * y, r = r0 * (0.35 + 0.65 * amp[s] / big);
        atoms += `<circle cx="${X(x).toFixed(1)}" cy="${Y(y).toFixed(1)}" r="${r.toFixed(1)}" fill="${amp[s] > 1e-6 ? hue(phase) : '#e8edf1'}" stroke="${s ? '#14232c' : '#14232c'}" stroke-width="${s ? 1.6 : 0.8}"${s ? ' stroke-dasharray="2.5 2"' : ''}/>`;
      }
    }
    let s = `<g stroke="#b7c4cc" stroke-width="2.4">${bonds}</g>`;
    // the unit cell and the lattice vectors
    const c0 = [0, 0], c1 = G.A1, c2 = [G.A1[0] + G.A2[0], G.A1[1] + G.A2[1]], c3 = G.A2;
    s += `<path d="M${X(c0[0])},${Y(c0[1])} L${X(c1[0])},${Y(c1[1])} L${X(c2[0])},${Y(c2[1])} L${X(c3[0])},${Y(c3[1])} z" fill="rgba(18, 122, 94, 0.07)" stroke="#127a5e" stroke-width="1.4" stroke-dasharray="6 4"/>`;
    s += atoms;
    // the three neighbour vectors from the A atom at the origin
    const DCOL = ['#c2410c', '#7c3aed', '#0e7490'];
    G.DEL.forEach(([dx, dy], j) => {
      s += arrow(X(0), Y(0), X(dx * 0.86), Y(dy * 0.86), DCOL[j], 2.6, 8);
      s += `<text x="${(X(dx * 0.55) + (j === 2 ? 0 : 12)).toFixed(1)}" y="${(Y(dy * 0.55) + (j === 2 ? -9 : j === 0 ? -2 : 12)).toFixed(1)}" font-family="${FONT}" font-size="13" font-weight="800" font-style="italic" fill="${DCOL[j]}" paint-order="stroke" stroke="#fff" stroke-width="4">${sub('δ', j + 1, 10)}</text>`;
    });
    s += arrow(X(0), Y(0), X(G.A1[0]), Y(G.A1[1]), '#127a5e', 1.6, 7) + arrow(X(0), Y(0), X(G.A2[0]), Y(G.A2[1]), '#127a5e', 1.6, 7);
    s += `<text x="${X(G.A1[0]) + 6}" y="${Y(G.A1[1]) - 4}" font-family="${FONT}" font-size="13" font-weight="800" font-style="italic" fill="#127a5e" paint-order="stroke" stroke="#fff" stroke-width="4">${sub('a', 1, 10)}</text>`;
    s += `<text x="${X(G.A2[0]) + 6}" y="${Y(G.A2[1]) + 14}" font-family="${FONT}" font-size="13" font-weight="800" font-style="italic" fill="#127a5e" paint-order="stroke" stroke="#fff" stroke-width="4">${sub('a', 2, 10)}</text>`;
    // key: sublattices
    s += `<g font-family="${FONT}" font-size="12" font-weight="600" fill="#14232c"><circle cx="18" cy="18" r="7" fill="#e8edf1" stroke="#14232c" stroke-width="0.8"/><text x="31" y="22">A atoms</text><circle cx="104" cy="18" r="7" fill="#e8edf1" stroke="#14232c" stroke-width="1.6" stroke-dasharray="2.5 2"/><text x="117" y="22">B atoms</text></g>`;
    s += `<text x="${W - 12}" y="${H - 10}" text-anchor="end" font-family="${FONT}" font-size="12" fill="#5f7382" paint-order="stroke" stroke="#fff" stroke-width="5">a = 0.142 nm</text>`;
    // the colour wheel: phase of the wavefunction
    const wx = W - 30, wy = 30, wr = 15;
    for (let i = 0; i < 24; i++) { const a0 = 2 * Math.PI * i / 24, a1 = 2 * Math.PI * (i + 1) / 24; s += `<path d="M${wx},${wy} L${(wx + wr * Math.cos(a0)).toFixed(1)},${(wy - wr * Math.sin(a0)).toFixed(1)} A${wr},${wr} 0 0 0 ${(wx + wr * Math.cos(a1)).toFixed(1)},${(wy - wr * Math.sin(a1)).toFixed(1)} z" fill="${hue(a0 + Math.PI / 24)}"/>`; }
    s += `<text x="${wx - wr - 6}" y="${wy + 4}" text-anchor="end" font-family="${FONT}" font-size="12" font-weight="600" fill="#14232c">phase</text><text x="${wx + wr + 3}" y="${wy + 4}" font-family="${FONT}" font-size="10" fill="#5f7382">0</text>`;
    return `<svg class="lat__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Honeycomb lattice coloured by the phase of the wavefunction">${s}</svg>`;
  }

  /* st: { p, E, narrow } -> pseudospin texture of the upper band near K and K' */
  function pseudospin(st) {
    const narrow = !!st.narrow, W = narrow ? 440 : 760, H = narrow ? 610 : 330;
    const panels = narrow ? [[W / 2, 150], [W / 2, 455]] : [[W * 0.27, H / 2 + 8], [W * 0.73, H / 2 + 8]];
    const R = narrow ? 118 : 128;
    const qE = Math.sqrt(Math.max(0, st.E * st.E - st.p.D * st.p.D)) / G.hv(st.p), Q = Math.max(0.12, 1.7 * qE);   // nm^-1 from the centre to the edge
    let s = '';
    const said = [];
    ['K', 'Kp'].forEach((v, idx) => {
      const [px, py] = panels[idx], [Kx, Ky] = G.PTS[v], sc = R / Q;
      s += `<circle cx="${px}" cy="${py}" r="${R + 4}" fill="#f7f9fb" stroke="#d9e2e8"/>`;
      // contours of the upper band: a quarter, half, three quarters of E (thin), and E itself (bold), with the Dirac circle
      const ring = (E, n) => {
        const q = G.contour(v, E, st.p, n);
        if (q.some(x => !Number.isFinite(x))) return '';
        return q.map((r, i) => { const a = 2 * Math.PI * i / n; return `${i ? 'L' : 'M'}${(px + r * sc * Math.cos(a)).toFixed(1)},${(py - r * sc * Math.sin(a)).toFixed(1)}`; }).join(' ') + ' z';
      };
      [0.25, 0.5, 0.75].forEach(f => { const d = ring(f * st.E, 90); if (d) s += `<path d="${d}" fill="none" stroke="#c4cfd6" stroke-width="1"/>`; });
      const dE = ring(st.E, 180);
      if (Math.abs(st.p.D) < st.E) s += `<circle cx="${px}" cy="${py}" r="${(Math.sqrt(st.E ** 2 - st.p.D ** 2) / G.hv(st.p) * sc).toFixed(1)}" fill="none" stroke="#5f7382" stroke-width="1.4" stroke-dasharray="5 4"/>`;
      if (dE) s += `<path d="${dE}" fill="none" stroke="#127a5e" stroke-width="2.6"/>`;
      // pseudospin arrows on a grid inside the disc
      const n = narrow ? 7 : 9;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const qx = -Q + 2 * Q * (i + 0.5) / n, qy = -Q + 2 * Q * (j + 0.5) / n;
        if (qx * qx + qy * qy > 0.92 * Q * Q) continue;
        const d = G.dvec(Kx + qx, Ky + qy, st.p), m = Math.hypot(d[0], d[1], d[2]), inPlane = m > 1e-9 ? Math.hypot(d[0], d[1]) / m : 0;
        const L = 0.42 * (2 * R / n) * inPlane, ang = Math.atan2(d[1], d[0]), x0 = px + qx * sc, y0 = py - qy * sc;
        const ux = Math.cos(ang), uy = Math.sin(ang);
        if (L < 2) { s += `<circle cx="${x0.toFixed(1)}" cy="${y0.toFixed(1)}" r="2.6" fill="#14232c"/>`; continue; }
        s += arrow(x0 - ux * L, y0 + uy * L, x0 + ux * L, y0 - uy * L, hue(ang, 44), 2.2, 6);
      }
      s += `<circle cx="${px}" cy="${py}" r="3.5" fill="#14232c"/>`;
      // the direction towards Gamma from this corner
      const toG = Math.atan2(-Ky, -Kx);
      s += `<text x="${(px + (R - 14) * Math.cos(toG)).toFixed(1)}" y="${(py - (R - 14) * Math.sin(toG) + 4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11.5" font-weight="700" fill="#5f7382">→Γ</text>`;
      s += `<text x="${px}" y="${py - R - 12}" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="800" fill="#14232c">${v === 'K' ? 'Valley K' : 'Valley K′'}</text>`;
      // winding: does the pseudospin turn with or against a loop around the corner?
      const w = G.winding(v, st.p, Math.min(Q, 0.5 * Q + 0.05));
      const wind = w === 1 ? 'turns once anticlockwise' : w === -1 ? 'turns once clockwise' : `turns ${w} times`;
      s += `<text x="${px}" y="${py + R + 22}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="#14232c">Loop anticlockwise: the pseudospin ${wind}</text>`;
      said.push(`round ${v === 'K' ? 'K' : 'K′'} the pseudospin ${wind}`);
    });
    return `<svg class="ps__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pseudospin direction around the two Dirac points. For an anticlockwise loop, ${said.join('; ')}.">${s}</svg>`;
  }

  window.GrViews = { lattice, pseudospin, hue };
})();
