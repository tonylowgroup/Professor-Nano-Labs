/* Trapped Ions and Phonon Sidebands: SVG level diagrams in the style of the video.
   Columns are phonon numbers n_p; the lower row is |g, n_p>, the upper row |e, n_p>,
   and each column sits hbar*omega_p higher than the last. Yellow dots show populations;
   green, blue and red arrows are the carrier and the two sidebands. */
(function () {
  'use strict';
  const COL = { carrier: '#3d9a4f', blue: '#3f74d6', red: '#d9495f', pop: '#e0a21b', wire: '#8aa0ab', text: '#14232c', muted: '#5f7382' };
  const F = 'Inter, system-ui, sans-serif';

  // |e2, 1p> with subscripts, as SVG tspans
  function ket(a, sub, n) {
    const s = t => `<tspan dy="4" font-size="72%">${t}</tspan><tspan dy="-4">`;
    return `|${a}${sub ? s(sub) : '<tspan>'}, ${n}${s('p')}⟩</tspan></tspan>`;
  }

  function defs(id) {
    return `<defs>${['carrier', 'blue', 'red'].map(k => `<marker id="${id}-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${COL[k]}"/></marker>`).join('')}</defs>`;
  }

  function arrow(id, kind, x1, y1, x2, y2, opacity, width) {
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${COL[kind]}" stroke-width="${width || 2.2}" stroke-opacity="${opacity}" marker-start="url(#${id}-${kind})" marker-end="url(#${id}-${kind})"/>`;
  }

  function wave(x1, y1, x2, y2, color, opacity) {
    const n = 7, pts = [];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    for (let i = 0; i <= 60; i++) {
      const t = i / 60, a = Math.sin(t * n * 2 * Math.PI) * 4;
      pts.push(`${(x1 + dx * t - uy * a).toFixed(1)},${(y1 + dy * t + ux * a).toFixed(1)}`);
    }
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.6" stroke-opacity="${opacity}"/>`;
  }

  /* One ladder. o = { x, y, cols, sub, g, e, arrows: [{kind, n, opacity}], labels, energy, emission: [n], box, colW, dy, gap } */
  function ladder(id, o) {
    const colW = o.colW || 86, w = 50, dy = o.dy || 12, gap = o.gap || 128;
    const xc = n => o.x + 34 + n * colW;
    const yE = n => o.y + 34 - n * dy + (o.cols - 1) * dy;
    const yG = n => yE(n) + gap;
    let s = '';
    if (o.box) {
      const bx = o.x + 4, by = o.y + 4, bw = 34 + (o.cols - 1) * colW + w / 2 + 34, bh = gap + (o.cols - 1) * dy + 66;
      s += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="12" fill="none" stroke="${o.box}" stroke-width="1.4" stroke-dasharray="6 5"/>`;
    }
    // transitions under the levels
    (o.arrows || []).forEach(a => {
      const m = a.n + ({ carrier: 0, blue: 1, red: -1 })[a.kind];
      if (m < 0 || m >= o.cols || a.n >= o.cols) return;
      if (a.kind === 'carrier') s += arrow(id, 'carrier', xc(a.n) - 12, yG(a.n) - 5, xc(a.n) - 12, yE(a.n) + 5, a.opacity);
      else s += arrow(id, a.kind, xc(a.n) + (a.kind === 'blue' ? 10 : -6), yG(a.n) - 5, xc(m) + (a.kind === 'blue' ? -6 : 10), yE(m) + 5, a.opacity);
    });
    (o.emission || []).forEach(n => { if (n >= 0 && n < o.cols) s += wave(xc(n) + 14, yE(n) + 6, xc(n) + 14, yG(n) - 6, COL.carrier, 0.75); });
    for (let n = 0; n < o.cols; n++) {
      [['e', yE(n), o.e], ['g', yG(n), o.g]].forEach(([a, y, pops]) => {
        const p = pops ? pops[n] || 0 : 0;
        s += `<line x1="${xc(n) - w / 2}" y1="${y}" x2="${xc(n) + w / 2}" y2="${y}" stroke="${p > 0.004 ? COL.pop : COL.text}" stroke-opacity="${p > 0.004 ? 0.45 + 0.55 * Math.min(1, p * 2) : 0.75}" stroke-width="${p > 0.004 ? 3 : 1.6}"/>`;
        if (p > 0.004) s += `<circle cx="${xc(n)}" cy="${y}" r="${(2.5 + 9 * Math.sqrt(p)).toFixed(1)}" fill="${COL.pop}" fill-opacity="0.92"/>`;
        if (o.labels !== false) s += `<text x="${xc(n)}" y="${a === 'e' ? y - 10 : y + 20}" text-anchor="middle" font-family="${F}" font-size="12.5" fill="${COL.text}">${ket(a, o.sub, n)}</text>`;
      });
    }
    if (o.energy) {
      const first = (o.arrows || []).find(a => a.opacity > 0.3 && a.n < o.cols);
      if (first) {
        const m = first.n + ({ carrier: 0, blue: 1, red: -1 })[first.kind];
        const lx = first.kind === 'carrier' ? xc(first.n) - 18 : (xc(first.n) + xc(m)) / 2 + (first.kind === 'blue' ? 16 : -16);
        const ly = (yG(first.n) + yE(m)) / 2;
        const lab = first.kind === 'carrier' ? 'ħω₀' : first.kind === 'blue' ? 'ħ(ω₀ + ω<tspan dy="4" font-size="72%">p</tspan><tspan dy="-4">)</tspan>' : 'ħ(ω₀ − ω<tspan dy="4" font-size="72%">p</tspan><tspan dy="-4">)</tspan>';
        s += `<text x="${lx}" y="${ly}" text-anchor="${first.kind === 'red' ? 'end' : first.kind === 'carrier' ? 'end' : 'start'}" font-family="${F}" font-size="13" font-weight="700" fill="${COL[first.kind]}">${lab}</text>`;
      }
      if (o.cols > 1) {
        const x = xc(0) + w / 2 + 8;
        s += `<path d="M${x},${yG(0)} L${x},${yG(1)}" stroke="${COL.pop}" stroke-width="1.6"/><path d="M${x - 3},${yG(0)} h6 M${x - 3},${yG(1)} h6" stroke="${COL.pop}" stroke-width="1.6"/>`;
        s += `<text x="${x + 6}" y="${(yG(0) + yG(1)) / 2 + 4}" font-family="${F}" font-size="12" font-weight="700" fill="${COL.pop}">ħω<tspan dy="4" font-size="72%">p</tspan></text>`;
      }
    }
    return { svg: s, width: 34 + (o.cols - 1) * colW + w / 2 + 40, height: gap + (o.cols - 1) * dy + 72 };
  }

  /* One ion: carrier and sidebands. */
  function single(st) {
    const id = 'lad1';
    const L = ladder(id, { x: 6, y: 6, cols: st.cols, sub: '', g: st.g, e: st.e, arrows: st.arrows, energy: true, emission: st.emission });
    const more = st.more ? `<text x="${L.width + 4}" y="${L.height / 2}" font-family="${F}" font-size="22" fill="${COL.muted}">⋯</text>` : '';
    const W = L.width + (st.more ? 30 : 10);
    return `<svg viewBox="0 0 ${W} ${L.height + 12}" class="diagram__svg" style="max-width:${Math.round(W * 1.3)}px" role="img" aria-label="Ladder of |g, n_p> and |e, n_p> levels">${defs(id)}${L.svg}${more}</svg>`;
  }

  /* Two ions sharing the phonon bus, as in the video's "phonon-mediated coupling". */
  function bus(st) {
    if (st.narrow) return busNarrow(st);
    const id = 'lad2';
    let s = '';
    // ion chain
    const cy = 26, x0 = 250;
    s += `<ellipse cx="${x0 + 150}" cy="${cy}" rx="190" ry="15" fill="#3d9a4f" fill-opacity=".12"/>`;
    s += `<rect x="${x0 + 52}" y="${cy - 20}" width="196" height="40" rx="10" fill="none" stroke="${COL.pop}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    [1, 2, 3, 4].forEach((k, i) => {
      const x = x0 + i * 100;
      const on = k === 2 || k === 3, hit = st.target === k;
      s += `<circle cx="${x}" cy="${cy}" r="11" fill="${on ? (hit ? '#d6f0db' : '#e6f4e9') : '#3d9a4f'}" stroke="${hit ? COL.text : '#3d9a4f'}" stroke-width="${hit ? 2 : 1}"/>`;
      s += `<text x="${x}" y="${cy + 4}" text-anchor="middle" font-family="${F}" font-size="11" font-weight="700" fill="${on ? COL.text : '#fff'}">${k}</text>`;
    });
    const L2 = ladder(id, { x: 20, y: 52, cols: 3, sub: '2', g: st.ion2.g, e: st.ion2.e, arrows: st.target === 2 ? st.arrows : [], box: COL.pop, colW: 80 });
    const L3 = ladder(id, { x: 440, y: 52, cols: 3, sub: '3', g: st.ion3.g, e: st.ion3.e, arrows: st.target === 3 ? st.arrows : [], box: COL.pop, colW: 80 });
    s += L2.svg + L3.svg;
    // bus between the ladders
    const by = 52 + L2.height / 2 + 6;
    let pts = [];
    for (let i = 0; i <= 80; i++) { const t = i / 80; pts.push(`${(L2.width + 26 + t * (440 - L2.width - 18)).toFixed(1)},${(by + Math.sin(t * 7 * Math.PI) * 5).toFixed(1)}`); }
    s += `<polyline points="${pts.join(' ')}" fill="none" stroke="#d9495f" stroke-width="2"/>`;
    s += `<text x="${(L2.width + 440) / 2 + 4}" y="${by - 30}" text-anchor="middle" font-family="${F}" font-size="14" font-weight="800" fill="${COL.pop}">Phonon bus</text>`;
    s += `<text x="${(L2.width + 440) / 2 + 4}" y="${by + 26}" text-anchor="middle" font-family="${F}" font-size="12.5" fill="${COL.text}">${st.busLabel}</text>`;
    const W = 440 + L3.width + 10, H = 52 + Math.max(L2.height, L3.height) + 8;
    return `<svg viewBox="0 0 ${W} ${H}" class="diagram__svg" style="max-width:${Math.round(W * 1.2)}px" role="img" aria-label="Qubits 2 and 3 coupled by the phonon bus">${defs(id)}${s}</svg>`;
  }

  /* Narrow screens: qubit 2 above, the bus across the middle, qubit 3 below. */
  function busNarrow(st) {
    const id = 'lad2n';
    let s = '';
    const cy = 22;
    s += `<ellipse cx="170" cy="${cy}" rx="150" ry="13" fill="#3d9a4f" fill-opacity=".12"/>`;
    s += `<rect x="97" y="${cy - 17}" width="146" height="34" rx="9" fill="none" stroke="${COL.pop}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    [1, 2, 3, 4].forEach((k, i) => {
      const x = 50 + i * 80, on = k === 2 || k === 3, hit = st.target === k;
      s += `<circle cx="${x}" cy="${cy}" r="10" fill="${on ? (hit ? '#d6f0db' : '#e6f4e9') : '#3d9a4f'}" stroke="${hit ? COL.text : '#3d9a4f'}" stroke-width="${hit ? 2 : 1}"/>`;
      s += `<text x="${x}" y="${cy + 4}" text-anchor="middle" font-family="${F}" font-size="11" font-weight="700" fill="${on ? COL.text : '#fff'}">${k}</text>`;
    });
    const L2 = ladder(id, { x: 10, y: 44, cols: 3, sub: '2', g: st.ion2.g, e: st.ion2.e, arrows: st.target === 2 ? st.arrows : [], box: COL.pop, colW: 100 });
    const by = 44 + L2.height + 22;
    const L3 = ladder(id, { x: 10, y: by + 34, cols: 3, sub: '3', g: st.ion3.g, e: st.ion3.e, arrows: st.target === 3 ? st.arrows : [], box: COL.pop, colW: 100 });
    s += L2.svg + L3.svg;
    const W = Math.max(L2.width, 340) + 20;
    const pts = [];
    for (let i = 0; i <= 80; i++) { const t = i / 80; pts.push(`${(20 + t * (W - 40)).toFixed(1)},${(by + Math.sin(t * 9 * Math.PI) * 5).toFixed(1)}`); }
    s += `<polyline points="${pts.join(' ')}" fill="none" stroke="#d9495f" stroke-width="2"/>`;
    s += `<text x="20" y="${by - 10}" font-family="${F}" font-size="13" font-weight="800" fill="${COL.pop}">Phonon bus</text>`;
    s += `<text x="${W - 20}" y="${by - 10}" text-anchor="end" font-family="${F}" font-size="12" fill="${COL.text}">${st.busLabel}</text>`;
    const H = by + 34 + L3.height + 6;
    return `<svg viewBox="0 0 ${W} ${H}" class="diagram__svg diagram__svg--narrow" role="img" aria-label="Qubits 2 and 3 coupled by the phonon bus">${defs(id)}${s}</svg>`;
  }

  /* The calcium ion: |0> = 4S1/2, |1> = 3D5/2 and the short-lived 4P level. */
  function calcium(st) {
    const W = 560, H = 270;
    const yP = 64, yD = 128, yS = 232, xS = 130, xP = 150, xD = 310;
    const mk = (name, color) => `<marker id="ca-${name}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker>`;
    let s = `<defs>${mk('muted', COL.muted)}${mk('blue', COL.blue)}${mk('red', COL.red)}${mk('violet', '#6b4bd1')}</defs>`;
    s += `<line x1="40" y1="${H - 20}" x2="40" y2="20" stroke="${COL.muted}" stroke-width="1.5" marker-end="url(#ca-muted)"/><text x="30" y="${H / 2}" transform="rotate(-90 30 ${H / 2})" text-anchor="middle" font-family="${F}" font-size="12.5" fill="${COL.muted}">Energy</text>`;
    const level = (x1, x2, y, label, ket, pop) => {
      let t = `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${pop > 0.004 ? COL.pop : COL.text}" stroke-width="${pop > 0.004 ? 3.2 : 1.8}" stroke-opacity="${pop > 0.004 ? 0.5 + 0.5 * pop : 0.8}"/>`;
      t += `<text x="${x1}" y="${y + 18}" font-family="${F}" font-size="12.5" fill="${COL.text}">${label}</text>`;
      if (ket) t += `<text x="${x2 + 12}" y="${y + 5}" font-family="${F}" font-size="15" font-weight="700" fill="${COL.text}">${ket}</text>`;
      if (pop > 0.004) t += `<circle cx="${(x1 + x2) / 2}" cy="${y}" r="${(3 + 11 * Math.sqrt(pop)).toFixed(1)}" fill="${COL.pop}"/>`;
      return t;
    };
    s += level(xP - 20, xP + 40, yP, '', '', 0) + `<text x="${xP - 28}" y="${yP + 5}" text-anchor="end" font-family="${F}" font-size="12.5" fill="${COL.text}">4P</text>`;
    s += level(xD - 10, xD + 60, yD, '3D<tspan dy="4" font-size="72%">5/2</tspan>', '|1⟩', st.p1);
    s += level(xS - 20, xD + 60, yS, '4S<tspan dy="4" font-size="72%">1/2</tspan>', '|0⟩', st.p0);
    // 729 nm qubit laser
    s += `<line x1="${xD + 4}" y1="${yS - 6}" x2="${xD + 26}" y2="${yD + 6}" stroke="${COL.blue}" stroke-width="2" marker-start="url(#ca-blue)" marker-end="url(#ca-blue)"/>`;
    s += `<text x="${xD + 34}" y="${(yS + yD) / 2 + 22}" font-family="${F}" font-size="12" font-weight="700" fill="${COL.blue}">729 nm</text><text x="${xD + 34}" y="${(yS + yD) / 2 + 37}" font-family="${F}" font-size="11.5" fill="${COL.muted}">qubit, τ ~ 1 s</text>`;
    // optical pumping
    const pumpOn = st.stage === 'pump';
    s += `<line x1="${xD - 6}" y1="${yD - 4}" x2="${xP + 46}" y2="${yP + 4}" stroke="${COL.red}" stroke-width="${pumpOn ? 2.6 : 1.6}" stroke-opacity="${pumpOn ? 1 : 0.45}" marker-end="url(#ca-red)"/>`;
    s += `<text x="${xD - 4}" y="${yD - 20}" font-family="${F}" font-size="12" font-weight="700" fill="${COL.red}" fill-opacity="${pumpOn ? 1 : 0.6}">optical pumping</text>`;
    if (pumpOn) s += wave(xP + 26, yP + 8, xP + 26, yS - 8, COL.muted, 0.8);
    // readout laser and fluorescence
    const readOn = st.stage === 'read';
    s += `<line x1="${xP}" y1="${yS - 6}" x2="${xP}" y2="${yP + 8}" stroke="#6b4bd1" stroke-width="${readOn ? 6 : 3}" stroke-opacity="${readOn ? 0.75 : 0.35}" marker-end="url(#ca-violet)"/>`;
    s += `<text x="${xP - 10}" y="${(yS + yP) / 2}" text-anchor="end" font-family="${F}" font-size="12" font-weight="700" fill="#6b4bd1" fill-opacity="${readOn ? 1 : 0.6}">readout</text>`;
    const bright = readOn && st.lastBright;
    if (bright) for (let k = 0; k < 3; k++) s += wave(xP + 44, yP - 8 - k * 7, 462, 34 - k * 4, '#6b4bd1', 0.7);
    s += `<path d="M470,38 a26,26 0 0 1 52,0 z" fill="${COL.muted}" fill-opacity=".85"/><text x="496" y="70" text-anchor="middle" font-family="${F}" font-size="12" font-weight="700" fill="${COL.text}">detector</text>`;
    if (st.lastCounts !== null && st.lastCounts !== undefined) s += `<text x="496" y="88" text-anchor="middle" font-family="${F}" font-size="12.5" fill="${bright ? '#6b4bd1' : COL.muted}">${st.lastCounts} click${st.lastCounts === 1 ? '' : 's'}${st.lastCounts >= st.threshold ? ' · bright' : ' · dark'}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="diagram__svg diagram__svg--ca" role="img" aria-label="Calcium ion levels">${s}</svg>`;
  }

  window.IonDiagrams = { COL, single, bus, calcium };
})();
