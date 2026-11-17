/* Nanoscale transistor: the band diagram, drawn as SVG in the style of the video.
   Source on the left (band edge at 0), the gate-controlled barrier U0 in the channel, the drain on the right
   (band edge at -eV_D). Electrons fill each side up to its Fermi level, fading with the Fermi function.
   Over the barrier, streaks moving left to right show where in energy the current flows. */
(function () {
  'use strict';
  const FONT = 'Inter, system-ui, sans-serif';
  const C = {
    band: '#1d2b53', ef: '#d9495f', ball: '#2f5fd0', ballEdge: '#1c3f99', ink: '#14232c', muted: '#5f7382',
    hot: 'rgba(240, 160, 140, 0.26)', cold: 'rgba(250, 210, 110, 0.32)', hotInk: '#c0563f', coldInk: '#9a6b08',
    flow: '#b0561b', bounce: '#e07b1f', gate: '#3b4757',
  };
  const fermi = (E, mu, kT) => 1 / (1 + Math.exp((E - mu) / kT));
  const arrowHead = (x, y, ux, uy, col, s) => `<path d="M${x},${y} L${x - ux * s - uy * s * 0.55},${y - uy * s + ux * s * 0.55} L${x - ux * s + uy * s * 0.55},${y - uy * s - ux * s * 0.55} z" fill="${col}"/>`;
  const dbl = (x1, y1, x2, y2, col) => {
    const L = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / L, uy = (y2 - y1) / L;
    return `<line x1="${x1 + ux * 6}" y1="${y1 + uy * 6}" x2="${x2 - ux * 6}" y2="${y2 - uy * 6}" stroke="${col}" stroke-width="1.8"/>` + arrowHead(x2, y2, ux, uy, col, 7) + arrowHead(x1, y1, -ux, -uy, col, 7);
  };
  const halo = 'paint-order="stroke" stroke="#fbfcfd" stroke-width="4" stroke-linejoin="round"';
  const sub = (a, b, size) => `${a}<tspan font-size="${size}" dy="3">${b}</tspan><tspan dy="-3"></tspan>`;

  /* st: { U0, VD, EF, kT (eV), Lnm, gateText, spectrum: [[E, share 0..1], ...] sorted by E, narrow, windows } */
  function draw(st) {
    const narrow = !!st.narrow;
    const W = narrow ? 440 : 760, H = narrow ? 380 : 400;
    const U0 = st.U0, VD = st.VD, EF = st.EF, kT = st.kT, EFd = EF - VD;
    // the energy window zooms out only when the drain, the barrier or the Fermi level needs the room
    const Emin = Math.min(-0.2, -VD - 0.07), Emax = Math.max(0.36, U0 + 0.12, EF + 4 * kT + 0.03), top = 46, bot = H - 40;
    const pxE = (bot - top) / (Emax - Emin), y = E => top + (Emax - Math.min(Math.max(E, Emin - 0.05), Emax + 0.05)) * pxE;
    const xs0 = narrow ? 30 : 44, res = narrow ? 98 : 166, ramp = narrow ? 28 : 46;
    const xs1 = xs0 + res, xd1 = W - (narrow ? 42 : 56), xd0 = xd1 - res;
    const p0 = xs1 + ramp, p1 = xd0 - ramp, xm = (p0 + p1) / 2;      // the plateau, length L
    const fs = narrow ? 11.5 : 12.5;
    let s = '';

    // energy windows across the device: "hot" just above E_F, "cold" between the two Fermi levels
    if (st.windows) {
      s += `<rect x="${xs0}" y="${y(EF + 3 * kT)}" width="${xd1 - xs0}" height="${y(EF) - y(EF + 3 * kT)}" fill="${C.hot}"/>`;
      if (VD > 0.004) s += `<rect x="${xs0}" y="${y(EF)}" width="${xd1 - xs0}" height="${y(EFd) - y(EF)}" fill="${C.cold}"/>`;
    }

    // electrons as balls, filling each reservoir up to its Fermi level, fading as f(E)
    function reservoir(xa, xb, edge, mu) {
      const dE = 14.5 / pxE, r = 6.1, step = 2 * r + 1.6;      // one row of balls every 14.5 px, whatever the zoom
      let out = '';
      for (let k = 0; ; k++) {
        const E = edge + dE * (k + 0.5);
        if (E > Emax || E > mu + 6 * kT) break;
        const f = fermi(E, mu, kT);
        if (f < 0.04) continue;
        const yy = y(E), off = k % 2 ? step / 2 : 0;
        for (let x = xa + r + off; x <= xb - r; x += step) out += `<circle cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="${r.toFixed(1)}" fill="${C.ball}" fill-opacity="${(0.12 + 0.88 * f).toFixed(2)}" stroke="${C.ballEdge}" stroke-opacity="${(0.5 * f).toFixed(2)}" stroke-width="0.8"/>`;
      }
      return out;
    }
    s += reservoir(xs0 + 3, xs1 - 4, 0, EF);
    s += reservoir(xd0 + 4, xd1 - 3, -VD, EFd);

    // the band profile: flat source, smooth ramps, barrier plateau, flat drain
    const ease = u => 0.5 - 0.5 * Math.cos(Math.PI * u);
    const pts = [[xs0, 0], [xs1, 0]];
    for (let i = 1; i <= 16; i++) { const u = i / 16; pts.push([xs1 + ramp * u, U0 * ease(u)]); }
    pts.push([p1, U0]);
    for (let i = 1; i <= 16; i++) { const u = i / 16; pts.push([p1 + ramp * u, U0 + (-VD - U0) * ease(u)]); }
    pts.push([xd1, -VD]);
    s += `<polyline points="${pts.map(([x, E]) => `${x.toFixed(1)},${y(E).toFixed(1)}`).join(' ')}" fill="none" stroke="${C.band}" stroke-width="2.6" stroke-linejoin="round"/>`;

    // where the current flows: streaks every ~3 px of energy over the plateau, opacity = share of the current there
    const spec = st.spectrum || [];
    if (spec.length > 1) {
      const lane = 3 / pxE, share = E => {
        if (E < spec[0][0] || E > spec[spec.length - 1][0]) return 0;
        let i = 1;
        while (i < spec.length - 1 && spec[i][0] < E) i++;
        const [Ea, a] = spec[i - 1], [Eb, b] = spec[i];
        return Eb > Ea ? a + (b - a) * (E - Ea) / (Eb - Ea) : a;
      };
      let best = -1, bestE = 0;
      for (let k = 0, E = spec[0][0]; E <= Math.min(Emax, spec[spec.length - 1][0]); k++, E = spec[0][0] + k * lane) {
        const w = share(E);
        if (w > best) { best = w; bestE = E; }
        if (w < 0.03) continue;
        const delay = ((k * 0.618034) % 1) * 0.8;                     // scatter the phases so the streaks do not line up
        s += `<line class="flow-line" style="animation-delay:-${delay.toFixed(2)}s" x1="${p0 + 4}" y1="${y(E).toFixed(1)}" x2="${p1 - 4}" y2="${y(E).toFixed(1)}" stroke="${C.flow}" stroke-opacity="${Math.min(1, 0.2 + 0.8 * w).toFixed(2)}" stroke-width="2.2"/>`;
      }
      if (best > 0.03) s += arrowHead(p1 + 12, y(bestE), 1, 0, C.flow, 11);
    }

    // electrons below the barrier top bounce back off the ramp (as on the slides)
    if (U0 > 0.06) {
      const Eb = Math.min(U0, Math.max(EF, 0.08)) * 0.5, yb = y(Eb);
      const xr = xs1 + ramp * Math.acos(1 - 2 * Eb / U0) / Math.PI;
      const len = narrow ? 34 : 50;
      s += `<path d="M${xr - len},${yb - 6} H${xr - 6} A6,6 0 0 1 ${xr - 6},${yb + 6} H${xr - len + 4}" fill="none" stroke="${C.bounce}" stroke-width="3" stroke-linecap="round"/>` + arrowHead(xr - len - 4, yb + 6, -1, 0, C.bounce, 8);
    }

    // Fermi levels, labelled in the side columns
    s += `<line x1="${xs0}" y1="${y(EF)}" x2="${p0}" y2="${y(EF)}" stroke="${C.ef}" stroke-width="1.8" stroke-dasharray="6 4"/>`;
    s += `<line x1="${p1}" y1="${y(EFd)}" x2="${xd1}" y2="${y(EFd)}" stroke="${C.ef}" stroke-width="1.8" stroke-dasharray="6 4"/>`;
    s += `<text x="${xs0 - 5}" y="${y(EF) + 4}" text-anchor="end" font-family="${FONT}" font-size="13.5" font-weight="700" font-style="italic" fill="${C.ef}">${sub('E', 'F', 10)}</text>`;
    s += `<text x="${xd1 + 5}" y="${y(EFd) + 4}" font-family="${FONT}" font-size="13.5" font-weight="700" font-style="italic" fill="${C.ef}">${sub('E′', 'F', 10)}</text>`;
    if (st.windows) {
      const lab = (E, txt, col) => `<text x="${xd1 + 5}" y="${y(E) + 4}" font-family="${FONT}" font-size="${narrow ? 10.5 : 11.5}" font-weight="700" fill="${col}">${txt}</text>`;
      if (y(EFd) - y(EF + 1.5 * kT) > 13) s += lab(EF + 1.5 * kT, 'hot', C.hotInk);
      if (VD >= 0.08) s += lab(EF - VD / 2, 'cold', C.coldInk);
    }

    // barrier height and channel length
    if (U0 > 0.035) {
      s += dbl(xm, y(0), xm, y(U0), C.ef);
      s += `<text x="${xm + 8}" y="${(y(0) + y(U0)) / 2 + 5}" font-family="${FONT}" font-size="14" font-weight="800" font-style="italic" fill="${C.ef}" ${halo}>${sub('U', '0', 10)}</text>`;
    }
    s += dbl(p0, H - 12, p1, H - 12, C.ef);
    s += `<text x="${xm}" y="${H - 19}" text-anchor="middle" font-family="${FONT}" font-size="${fs}" font-weight="700" fill="${C.ink}">L = ${st.Lnm >= 10 ? Math.round(st.Lnm) : st.Lnm.toFixed(1)} nm</text>`;
    // gate and contacts
    s += `<rect x="${p0 + 8}" y="20" width="${p1 - p0 - 16}" height="10" rx="2" fill="${C.gate}"/>`;
    s += `<text x="${xm}" y="14" text-anchor="middle" font-family="${FONT}" font-size="${fs}" font-weight="700" fill="${C.ink}">gate${st.gateText ? ' · ' + st.gateText.replace(/_(\w)/g, (m, c) => `<tspan font-size="9" dy="3">${c}</tspan><tspan dy="-3"></tspan>`) : ''}</text>`;
    s += `<text x="${(xs0 + xs1) / 2}" y="${y(0) + 19}" text-anchor="middle" font-family="${FONT}" font-size="${fs}" font-weight="700" fill="${C.ink}">source</text>`;
    s += `<text x="${(xd0 + xd1) / 2}" y="${Math.min(H - 30, y(-VD) + 19)}" text-anchor="middle" font-family="${FONT}" font-size="${fs}" font-weight="700" fill="${C.ink}">drain · ${VD.toFixed(2)} V</text>`;
    return `<svg class="band__svg${narrow ? ' band__svg--narrow' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Band diagram: barrier ${U0.toFixed(3)} eV, drain bias ${VD.toFixed(2)} V">${s}</svg>`;
  }

  window.BandView = { draw, C };
})();
