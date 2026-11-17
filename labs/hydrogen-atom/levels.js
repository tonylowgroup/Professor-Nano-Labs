/* Hydrogen spectrum: the energy-level diagram (SVG) with the four series of the video, and the colour of light.
   Level n sits at a height proportional to 1/n (n = 1 at the bottom, the ionisation limit at the top), so that the
   upper levels stay apart; their energies are written beside them. Needs window.Hyd. */
(function () {
  'use strict';
  const H = window.Hyd;
  const FONT = 'Inter, system-ui, sans-serif';
  const SERIES_COL = { 1: '#d9861c', 2: '#2e8b57', 3: '#2f7fc4', 4: '#c8453a' };      // as on the video's slide
  const GREEK = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η'];
  const NMAX = 8;

  // approximate colour of a wavelength in nm (visible: 380-750 nm); outside the visible, null
  function wlColor(nm) {
    if (nm < 380 || nm > 750) return null;
    let r = 0, g = 0, b = 0;
    if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
    else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
    else r = 1;
    const f = nm < 420 ? 0.3 + 0.7 * (nm - 380) / 40 : nm > 700 ? 0.3 + 0.7 * (750 - nm) / 50 : 1;
    const c = v => Math.round(255 * Math.pow(v * f, 0.8));
    return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
  }
  const lineName = (ni, nf) => {
    const k = ni - nf - 1, s = H.SERIES[nf];
    if (nf === 2 && k < 5) return `H${GREEK[k]}`;
    return k < 7 ? `${s} ${GREEK[k]}` : `${s}, n = ${ni}`;
  };

  /* st: { ni, nf, narrow } -> SVG string. Arrows carry data-ni / data-nf for clicks. */
  function draw(st) {
    const narrow = !!st.narrow;
    const W = narrow ? 360 : 760, Hh = narrow ? 430 : 400;
    const x0 = narrow ? 56 : 128, x1 = W - (narrow ? 76 : 168), top = 40, bot = Hh - 56;
    const y = n => top + (bot - top) / n;
    const fs = 12;
    let s = '';
    // levels
    for (let n = 1; n <= NMAX; n++) {
      const Y = y(n).toFixed(1), main = n <= 5;
      s += `<line x1="${x0}" y1="${Y}" x2="${x1}" y2="${Y}" stroke="#1d2b53" stroke-width="${main ? 1.8 : 1}" stroke-opacity="${main ? 1 : 0.55}"/>`;
      const eTxt = `${H.energy(n).toFixed(2).replace('-', '−')} eV`;
      if (n <= 5 && !narrow) s += `<text x="${x0 - 8}" y="${+Y + 4}" text-anchor="end" font-family="${FONT}" font-size="${fs}" fill="#14232c"><tspan font-weight="700">n = ${n}</tspan><tspan fill="#5f7382"> ${eTxt}</tspan></text>`;
      else if (n <= 5) s += `<text x="${x0 - 6}" y="${+Y + 4}" text-anchor="end" font-family="${FONT}" font-size="${fs}" font-weight="700" fill="#14232c">n=${n}</text>` + (n <= 3 ? `<text x="${x0 - 6}" y="${+Y + 17}" text-anchor="end" font-family="${FONT}" font-size="10" fill="#5f7382">${eTxt.replace(' eV', '')}</text>` : '');
    }
    if (!narrow) s += `<text x="${x0 - 8}" y="${(y(6) + y(NMAX)) / 2 + 4}" text-anchor="end" font-family="${FONT}" font-size="10" fill="#5f7382">n = 6 … ${NMAX}</text>`;
    s += `<line x1="${x0}" y1="${top}" x2="${x1}" y2="${top}" stroke="#1d2b53" stroke-width="1.2" stroke-dasharray="5 4"/>`;
    s += `<text x="${x0 - (narrow ? 6 : 8)}" y="${top + 4}" text-anchor="end" font-family="${FONT}" font-size="${fs}" fill="#14232c"><tspan font-weight="700">${narrow ? 'n=∞' : 'n → ∞'}</tspan>${narrow ? '' : '<tspan fill="#5f7382"> 0 eV</tspan>'}</text>`;
    s += `<text x="${(x0 + x1) / 2}" y="${top - 10}" text-anchor="middle" font-family="${FONT}" font-size="${fs - 1}" fill="#5f7382">${narrow ? 'free electron above (ionised)' : 'free electron above this line (ionised)'}</text>`;
    // arrows, grouped by series as on the slide
    const groups = [1, 2, 3, 4].map(nf => ({ nf, list: Array.from({ length: NMAX - nf }, (_, i) => nf + 1 + i) }));
    const count = groups.reduce((a, g) => a + g.list.length, 0), gap = narrow ? 9 : 26;
    const step = (x1 - x0 - 20 - 3 * gap) / (count - 1);
    let x = x0 + 10, sel = null;
    for (const g of groups) {
      const xa = x, col = SERIES_COL[g.nf], on = g.nf === st.nf;
      for (const ni of g.list) {
        const isSel = on && ni === st.ni, yi = y(ni), yf = y(g.nf);
        const nm = H.wavelength(ni, g.nf);
        s += `<g class="lv-arrow" tabindex="0" role="button" data-ni="${ni}" data-nf="${g.nf}" aria-label="n = ${ni} to ${g.nf}, ${nm.toFixed(1)} nm"${isSel ? ' aria-pressed="true"' : ''}>`;
        s += `<line x1="${x.toFixed(1)}" y1="${yi}" x2="${x.toFixed(1)}" y2="${yf}" stroke="transparent" stroke-width="${Math.max(10, step)}"/>`;
        s += `<line x1="${x.toFixed(1)}" y1="${yi + 2}" x2="${x.toFixed(1)}" y2="${yf - 7}" stroke="${col}" stroke-width="${isSel ? 3.4 : 1.6}" stroke-opacity="${isSel ? 1 : on ? 0.85 : 0.32}"/>`;
        s += `<path d="M${x.toFixed(1)},${yf} l-${isSel ? 5.5 : 4},-9 h${isSel ? 11 : 8} z" fill="${col}" fill-opacity="${isSel ? 1 : on ? 0.85 : 0.32}"/>`;
        s += '</g>';
        if (isSel) sel = { x, yi, yf, nm, col };
        x += step;
      }
      const xm = (xa + x - step) / 2, region = { 1: 'UV', 2: 'visible', 3: 'IR', 4: 'IR' }[g.nf];
      s += `<text x="${xm.toFixed(1)}" y="${bot + 20}" text-anchor="middle" font-family="${FONT}" font-size="${narrow ? 10 : fs}" font-weight="700" fill="${col}" fill-opacity="${on ? 1 : 0.6}">${H.SERIES[g.nf]}</text>`;
      s += `<text x="${xm.toFixed(1)}" y="${bot + 35}" text-anchor="middle" font-family="${FONT}" font-size="${fs - 1}" fill="#5f7382">${narrow ? '' : 'n → ' + g.nf + ' · '}${region}</text>`;
      x += gap;
    }
    // the emitted photon: a wave whose wiggles shorten with the wavelength, in its colour (grey outside the visible)
    if (sel) {
      const c = wlColor(sel.nm) || '#8792a2', ym = (sel.yi + sel.yf) / 2, xs = x1 + 10, xe = W - 12;
      const per = Math.max(5, Math.min(26, 3.2 * Math.log(sel.nm / 40) * (narrow ? 1.3 : 2.2))), amp = narrow ? 5 : 8;
      let d = `M${xs},${ym}`;
      for (let t = 0; t <= xe - xs - 12; t += 1.5) d += ` L${(xs + t).toFixed(1)},${(ym - amp * Math.sin(2 * Math.PI * t / per)).toFixed(1)}`;
      s += `<line x1="${sel.x + 6}" y1="${ym}" x2="${xs - 4}" y2="${ym}" stroke="${sel.col}" stroke-width="1.2" stroke-dasharray="2 3"/>`;
      s += `<path class="photon" d="${d}" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/>`;
      s += `<path d="M${xe},${ym} l-10,-6 v12 z" fill="${c}"/>`;
      const lab = (yy, txt, w = 700) => `<text x="${(xs + xe) / 2}" y="${yy}" text-anchor="middle" font-family="${FONT}" font-size="${fs}" font-weight="${w}" fill="#14232c">${txt}</text>`;
      s += lab(ym - amp - 22, lineName(st.ni, st.nf)) + lab(ym - amp - 8, `${sel.nm >= 1000 ? (sel.nm / 1000).toFixed(3) + ' µm' : sel.nm.toFixed(1) + ' nm'}`, 600);
      s += lab(ym + amp + 18, `${H.photon(st.ni, st.nf).toFixed(2)} eV`, 600) + lab(ym + amp + 32, H.region(sel.nm), 500);
    }
    return `<svg class="levels__svg${narrow ? ' levels__svg--narrow' : ''}" viewBox="0 0 ${W} ${Hh}" role="group" aria-label="Energy levels of hydrogen and the transitions between them">${s}</svg>`;
  }

  window.Levels = { draw, wlColor, lineName, SERIES_COL, NMAX };
})();
