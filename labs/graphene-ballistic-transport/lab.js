/* Graphene Ballistic Transport: controls, presets and drawing.
   The physics is the notebook's GrapheneEngine (engine.js), used unchanged. */
(function () {
  'use strict';
  // engine.js declares a top-level const, which is global but not a window property.
  const G = GrapheneEngine;
  const $ = id => document.getElementById(id);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // Device defaults: the notebook's Device() dataclass.
  const DEVICE = {
    dirac_source_eV: -0.20, dirac_channel_eV: 0.20, dirac_drain_eV: -0.20,
    channel_length_nm: 40, buffer_length_nm: 12, hopping_eV: 2.7, carbon_bond_nm: 0.142,
    valley: 1, eta_transmission_eV: 1e-9, eta_ldos_eV: 1e-3,
  };
  const EGRID = Float64Array.from({ length: 451 }, (_, j) => -0.45 + 0.002 * j);
  const REF_KY = [0, 0.12, 0.24];

  // Presets from the notebook's laboratory, plus the shifted device for Question 6.
  const PRESETS = {
    npn: {},
    uniform: { dirac_channel_eV: -0.20 },
    nnn: { dirac_channel_eV: -0.08, ky: 0.12 },
    neutral: { dirac_channel_eV: 0, ky: 0.06 },
    asymmetric: { dirac_drain_eV: 0.05 },
    bound: { dirac_source_eV: 0, dirac_channel_eV: -0.20, dirac_drain_eV: 0, ky: 0.24 },
  };
  const QUESTIONS = {
    q1: ['uniform', {}],
    q2: ['npn', { ky: 0 }],
    q3: ['npn', {}],
    q4: ['neutral', {}],
    q5: ['bound', {}],
    q6: [null, { dirac_source_eV: -0.15, dirac_channel_eV: 0.25, dirac_drain_eV: -0.15, energy: 0.05 }],
  };

  // Matplotlib's viridis, 256 entries, as in the notebook's laboratory.
  const VIRIDIS = (function (hex) {
    const out = [];
    for (let i = 0; i < hex.length; i += 6) out.push([parseInt(hex.substr(i, 2), 16), parseInt(hex.substr(i + 2, 2), 16), parseInt(hex.substr(i + 4, 2), 16)]);
    return out;
  })('44015444025645045745055946075a46085c460a5d460b5e470d60470e6147106347116447136548146748166848176948186a481a6c481b6d481c6e481d6f481f70482071482173482374482475482576482677482878482979472a7a472c7a472d7b472e7c472f7d46307e46327e46337f463480453581453781453882443983443a83443b84433d84433e85423f854240864241864142874144874045884046883f47883f48893e49893e4a893e4c8a3d4d8a3d4e8a3c4f8a3c508b3b518b3b528b3a538b3a548c39558c39568c38588c38598c375a8c375b8d365c8d365d8d355e8d355f8d34608d34618d33628d33638d32648e32658e31668e31678e31688e30698e306a8e2f6b8e2f6c8e2e6d8e2e6e8e2e6f8e2d708e2d718e2c718e2c728e2c738e2b748e2b758e2a768e2a778e2a788e29798e297a8e297b8e287c8e287d8e277e8e277f8e27808e26818e26828e26828e25838e25848e25858e24868e24878e23888e23898e238a8d228b8d228c8d228d8d218e8d218f8d21908d21918c20928c20928c20938c1f948c1f958b1f968b1f978b1f988b1f998a1f9a8a1e9b8a1e9c891e9d891f9e891f9f881fa0881fa1881fa1871fa28720a38620a48621a58521a68522a78522a88423a98324aa8325ab8225ac8226ad8127ad8128ae8029af7f2ab07f2cb17e2db27d2eb37c2fb47c31b57b32b67a34b67935b77937b87838b9773aba763bbb753dbc743fbc7340bd7242be7144bf7046c06f48c16e4ac16d4cc26c4ec36b50c46a52c56954c56856c66758c7655ac8645cc8635ec96260ca6063cb5f65cb5e67cc5c69cd5b6ccd5a6ece5870cf5773d05675d05477d1537ad1517cd2507fd34e81d34d84d44b86d54989d5488bd6468ed64590d74393d74195d84098d83e9bd93c9dd93ba0da39a2da37a5db36a8db34aadc32addc30b0dd2fb2dd2db5de2bb8de29bade28bddf26c0df25c2df23c5e021c8e020cae11fcde11dd0e11cd2e21bd5e21ad8e219dae319dde318dfe318e2e418e5e419e7e419eae51aece51befe51cf1e51df4e61ef6e620f8e621fbe723fde725');

  let p = { ...DEVICE }, ky = 0.18, E0 = 0, preset = 'npn';
  let spectral = null, curves = [], geomKey = '', mapKey = '';
  const curveCache = new Map();

  const FMT = (x, n = 3) => (Math.abs(x) < Math.pow(10, -n) / 2 ? 0 : x).toFixed(n).replace('-', '−');

  // ---------- plots ----------
  const plotProfile = new NanoPlot($('plot-profile'), { xLabel: 'Position x (nm)', yLabel: 'Energy (eV)' });
  const plotBands = new NanoPlot($('plot-bands'), { xLabel: 'qₓ from the valley (nm⁻¹)', yLabel: 'Energy (eV)' });
  const plotTrans = new NanoPlot($('plot-trans'), { xLabel: 'Energy E (eV)', yLabel: 'Transmission T' });
  const plotLdos = new NanoPlot($('plot-ldos'), { xLabel: 'Position x (nm)', yLabel: 'Energy E (eV)' });
  const plotSlice = new NanoPlot($('plot-slice'), { xLabel: 'Position x (nm)', yLabel: 'ρ at E₀ (states/eV·nm)' });

  const COLORS = () => ({
    brand: css('--series-1'), blue: css('--series-re'), green: '#2a8f6a', violet: '#7d5fc4',
    ghost: css('--series-ghost'), guide: '#647783',
  });

  function legend(id, items) {
    $(id).innerHTML = items.map(([color, kind, label]) =>
      `<li style="color:${color}"><span class="swatch ${kind}"></span><span>${label}</span></li>`).join('');
  }

  // ---------- calculation ----------
  function recompute() {
    const t0 = performance.now();
    const key = JSON.stringify({ ...p, eta_ldos_eV: 0 });
    if (key !== geomKey) { curveCache.clear(); geomKey = key; }
    curves = [...REF_KY, ky].map(q => {
      const k = q.toFixed(6);
      if (!curveCache.has(k)) curveCache.set(k, G.solve(EGRID, q, p, p.eta_transmission_eV, false));
      return curveCache.get(k);
    });
    const mk = key + '|' + ky + '|' + p.eta_ldos_eV;
    if (mk !== mapKey) { spectral = G.solve(EGRID, ky, p, p.eta_ldos_eV, true); mapKey = mk; mapImage = null; }
    drawAll();
    $('lab-status').textContent = `Calculated ${EGRID.length} energies × ${spectral.geometry.n} cells in ${Math.round(performance.now() - t0)} ms. The leads are semi-infinite; the shaded ends of the plots are their first ${p.buffer_length_nm} nm.`;
  }

  let rafPending = 0;
  function schedule() {
    if (rafPending) return;
    rafPending = requestAnimationFrame(() => { rafPending = 0; recompute(); });
  }

  // ---------- drawing ----------
  function profileXY(g, offset) {
    const xx = [g.xmin, 0, 0, g.L, g.L, g.xmax];
    const u = [p.dirac_source_eV, p.dirac_source_eV, p.dirac_channel_eV, p.dirac_channel_eV, p.dirac_drain_eV, p.dirac_drain_eV];
    return [xx, u.map(v => v + offset)];
  }

  function drawProfile(C) {
    const g = spectral.geometry, hg = spectral.halfGap;
    plotProfile.setRange([g.xmin, g.xmax], [-0.65, 0.65]);
    const [xx, u] = profileXY(g, 0);
    const layers = [
      { type: 'vband', x0: g.xmin, x1: 0, color: NanoPlot.alpha(C.ghost, 0.12) },
      { type: 'vband', x0: g.L, x1: g.xmax, color: NanoPlot.alpha(C.ghost, 0.12) },
    ];
    if ($('edges').checked) {
      layers.push({ type: 'line', x: xx, y: profileXY(g, hg)[1], color: C.blue, width: 1.5, dash: [6, 4] });
      layers.push({ type: 'line', x: xx, y: profileXY(g, -hg)[1], color: C.blue, width: 1.5, dash: [6, 4] });
    }
    layers.push({ type: 'line', x: xx, y: u, color: C.brand, width: 2.6 });
    layers.push({ type: 'hline', y: E0, color: C.guide, dash: [2, 3] });
    layers.push({ type: 'text', x: g.xmin / 2, text: 'S' }, { type: 'text', x: g.L / 2, text: 'channel' }, { type: 'text', x: (g.L + g.xmax) / 2, text: 'D' });
    plotProfile.draw(layers);
  }

  function drawBands(C) {
    const t = p.hopping_eV, b = G.hopping(ky, p), cell = spectral.geometry.a;
    const q = Float64Array.from({ length: 241 }, (_, j) => -0.8 + 1.6 * j / 240);
    const off = q.map(x => Math.sqrt((t - b) ** 2 + 4 * t * b * Math.sin(x * cell / 2) ** 2));
    const regions = [[p.dirac_source_eV, C.blue, []], [p.dirac_channel_eV, C.brand, [7, 4]], [p.dirac_drain_eV, C.green, [2, 4]]];
    plotBands.setRange([-0.8, 0.8], [-0.85, 0.85]);
    const layers = [];
    for (const [u, color, dash] of regions) {
      layers.push({ type: 'line', x: q, y: off.map(v => u + v), color, width: 2, dash });
      layers.push({ type: 'line', x: q, y: off.map(v => u - v), color, width: 2, dash });
    }
    layers.push({ type: 'hline', y: E0, color: C.guide, dash: [2, 3] });
    plotBands.draw(layers);
    legend('band-legend', [[C.blue, '', 'source'], [C.brand, 'swatch--dash', 'channel'], [C.green, 'swatch--dot', 'drain']]);
  }

  function drawTransmission(C) {
    const colors = [C.blue, C.green, C.violet, C.brand];
    plotTrans.setRange([-0.45, 0.45], [0, 1.04]);
    const layers = curves.map((r, j) => ({ type: 'line', x: EGRID, y: r.T, color: colors[j], width: j === 3 ? 2.4 : 1.5, dash: j === 3 ? [6, 3] : [] }));
    layers.push({ type: 'vline', x: E0, color: C.guide, dash: [3, 3], label: 'E₀' });
    plotTrans.draw(layers);
    legend('trans-legend', curves.map((r, j) => [colors[j], j === 3 ? 'swatch--dash' : '', `k<sub>y</sub> = ${FMT(r.ky)} nm⁻¹${j === 3 ? ' (selected)' : ''}`]));
  }

  let mapImage = null, mapLog = null;
  function ldosImage() {
    const log = $('log').checked;
    if (mapImage && mapLog === log) return mapImage;
    const g = spectral.geometry, nE = EGRID.length;
    const off = document.createElement('canvas');
    off.width = g.n; off.height = nE;
    const ctx = off.getContext('2d'), img = ctx.createImageData(g.n, nE), px = img.data;
    const lo = log ? Math.log10(0.001) : 0, hi = log ? Math.log10(5) : 5;
    for (let ie = 0; ie < nE; ie++) for (let j = 0; j < g.n; j++) {
      let v = Math.max(spectral.rho[ie * g.n + j], 1e-300);
      v = log ? Math.log10(v) : v;
      const f = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
      const rgb = VIRIDIS[Math.min(255, Math.floor(f * 255))];
      const k = ((nE - 1 - ie) * g.n + j) * 4;
      px[k] = rgb[0]; px[k + 1] = rgb[1]; px[k + 2] = rgb[2]; px[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    mapImage = off; mapLog = log;
    drawColorbar(log);
    return off;
  }

  function drawColorbar(log) {
    const stops = [];
    for (let i = 0; i <= 16; i++) { const c = VIRIDIS[Math.round(i * 255 / 16)]; stops.push(`rgb(${c.join(',')}) ${(i * 100 / 16).toFixed(1)}%`); }
    $('colorbar').style.background = `linear-gradient(to right, ${stops.join(', ')})`;
    const ticks = log ? [0.001, 0.01, 0.1, 1, 5] : [0, 1, 2, 3, 4, 5];
    const lo = log ? Math.log10(0.001) : 0, hi = log ? Math.log10(5) : 5;
    $('colorbar-ticks').innerHTML = ticks.map(v => {
      const f = ((log ? Math.log10(v) : v) - lo) / (hi - lo);
      return `<span style="left:${(f * 100).toFixed(2)}%">${v}</span>`;
    }).join('') + `<span class="colorbar__label">states/(eV·nm), ${log ? 'log' : 'linear'} scale</span>`;
  }

  function drawLdos(C) {
    const g = spectral.geometry;
    plotLdos.setRange([g.xmin, g.xmax], [-0.45, 0.45]);
    const layers = [{ type: 'image', canvas: ldosImage(), x0: g.xmin, x1: g.xmax, y0: -0.45, y1: 0.45 }];
    if ($('edges').checked) {
      const [xx] = profileXY(g, 0);
      layers.push({ type: 'line', x: xx, y: profileXY(g, spectral.halfGap)[1], color: '#ffffff', width: 1.4, dash: [6, 4] });
      layers.push({ type: 'line', x: xx, y: profileXY(g, -spectral.halfGap)[1], color: '#ffffff', width: 1.4, dash: [6, 4] });
    }
    layers.push({ type: 'vline', x: 0, color: '#ffffff', dash: [2, 3] }, { type: 'vline', x: g.L, color: '#ffffff', dash: [2, 3] });
    layers.push({ type: 'hline', y: E0, color: '#ffd166', width: 1.4, dash: [3, 3] });
    plotLdos.draw(layers);
  }

  function drawSlice(C) {
    const one = G.solve([E0], ky, p, p.eta_ldos_eV, true), g = one.geometry;
    let max = 0.7; for (const v of one.rho) max = Math.max(max, v * 1.12);
    plotSlice.setRange([g.xmin, g.xmax], [0, max]);
    plotSlice.draw([
      { type: 'vband', x0: g.xmin, x1: 0, color: NanoPlot.alpha(C.ghost, 0.12) },
      { type: 'vband', x0: g.L, x1: g.xmax, color: NanoPlot.alpha(C.ghost, 0.12) },
      { type: 'line', x: g.x, y: one.rho, color: C.brand, width: 2, fill: NanoPlot.alpha(C.brand, 0.10) },
    ]);
  }

  function modeLabel(U, gap) {
    const e = E0 - U;
    if (Math.abs(e) < gap - 1e-12) return 'evanescent';
    if (Math.abs(e) < 1e-10) return 'at the Dirac crossing';
    return e > 0 ? 'conduction band, propagating' : 'valence band, propagating';
  }

  function stats() {
    const g = spectral.geometry, gap = spectral.halfGap;
    const T = G.solve([E0], ky, p, p.eta_transmission_eV, false).T[0];
    $('st-length').textContent = FMT(g.L, 2) + ' nm';
    $('st-gap').textContent = FMT(2 * gap * 1000, 1) + ' meV';
    $('st-T').textContent = T < 1e-4 && T > 0 ? T.toExponential(2) : FMT(T, 4);
    const regions = [p.dirac_source_eV, p.dirac_channel_eV, p.dirac_drain_eV];
    $('st-type').textContent = regions.map(u => Math.abs(E0 - u) < 1e-9 ? '0' : (E0 > u ? 'n' : 'p')).join(' – ');
    const labels = regions.map(u => modeLabel(u, gap));
    $('mode-status').innerHTML = `<b>At E₀:</b> source ${labels[0]}; channel ${labels[1]}; drain ${labels[2]}.`;
    let msg = '<b>Read the physics:</b> in a propagating channel, reflections from the two interfaces form Fabry–Pérot resonances. Compare the transmission peaks with the standing waves in the LDOS.';
    if (labels[0] === 'evanescent' || labels[2] === 'evanescent') msg = '<b>Read the physics:</b> a lead has no propagating state for this k<sub>y</sub> at E₀, so the transmission is zero. A non-zero LDOS is not enough for current: the states must also connect to propagating modes in both leads.';
    else if (labels[1] === 'evanescent') msg = '<b>Read the physics:</b> the channel is evanescent for this k<sub>y</sub>, but it is short. The leads\' wavefunctions leak in from both sides and electrons tunnel through. Increase L or |k<sub>y</sub>| to cut their overlap.';
    else if (Math.abs(ky) < 1e-4) msg = '<b>Read the physics:</b> at normal incidence, the ideal low-energy Dirac model transmits perfectly through any scalar barrier (Klein tunnelling). The lattice model keeps small corrections at finite energy instead of forcing T = 1.';
    $('insight').innerHTML = msg;
  }

  function drawAll() {
    if (!spectral) return;
    const C = COLORS();
    drawProfile(C); drawBands(C); drawTransmission(C); drawLdos(C); drawSlice(C); stats();
  }

  // ---------- controls ----------
  const SLIDERS = [
    ['eds', 'dirac_source_eV', v => FMT(v) + ' eV'],
    ['edc', 'dirac_channel_eV', v => FMT(v) + ' eV'],
    ['edd', 'dirac_drain_eV', v => FMT(v) + ' eV'],
    ['length', 'channel_length_nm', v => FMT(v, 0) + ' nm'],
  ];

  function labels() {
    for (const [id, key, f] of SLIDERS) $(id + '-out').textContent = f(p[key]);
    $('ky-out').textContent = FMT(ky) + ' nm⁻¹';
    $('energy-out').textContent = FMT(E0) + ' eV';
    $('energy2-out').textContent = FMT(E0) + ' eV';
    document.querySelectorAll('.preset').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.preset === preset)));
  }

  function setControls() {
    for (const [id, key] of SLIDERS) $(id).value = p[key];
    $('ky').value = ky; $('energy').value = E0; $('energy2').value = E0;
    $('valley').value = String(p.valley); $('eta').value = String(p.eta_ldos_eV);
    labels();
  }

  function applyPreset(name, extra = {}) {
    stop();
    const base = name ? PRESETS[name] : {};
    const all = { ...base, ...extra };
    p = { ...DEVICE };
    for (const k of Object.keys(all)) if (k in p) p[k] = all[k];
    ky = 'ky' in all ? all.ky : 0.18;
    E0 = 'energy' in all ? all.energy : 0;
    preset = name && !Object.keys(extra).length ? name : null;
    setControls();
    schedule();
  }

  for (const [id, key] of SLIDERS) {
    $(id).addEventListener('input', e => { stop(); p = { ...p, [key]: +e.target.value }; preset = null; labels(); schedule(); });
  }
  $('ky').addEventListener('input', e => { stop(); ky = +e.target.value; preset = null; labels(); schedule(); });
  $('valley').addEventListener('change', e => { stop(); p = { ...p, valley: +e.target.value }; schedule(); });
  $('eta').addEventListener('change', e => { stop(); p = { ...p, eta_ldos_eV: +e.target.value }; schedule(); });
  $('log').addEventListener('change', () => { mapImage = null; drawAll(); });
  $('edges').addEventListener('change', drawAll);

  function setEnergy(v) {
    E0 = Math.max(-0.45, Math.min(0.45, +v));
    $('energy').value = E0; $('energy2').value = E0;
    labels(); drawAll();
  }
  $('energy').addEventListener('input', e => { stop(); setEnergy(e.target.value); });
  $('energy2').addEventListener('input', e => { stop(); setEnergy(e.target.value); });

  document.querySelectorAll('.preset').forEach(b => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
  $('reset').addEventListener('click', () => applyPreset('npn'));
  document.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
    const [name, extra] = QUESTIONS[b.dataset.q];
    applyPreset(name, extra);
    document.querySelector('.lab-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  // ---------- energy sweep ----------
  let timer = null;
  function stop() { if (timer) { clearInterval(timer); timer = null; } $('play').textContent = '▶ Sweep'; }
  $('play').addEventListener('click', () => {
    if (timer) { stop(); return; }
    $('play').textContent = '❚❚ Pause';
    timer = setInterval(() => { const next = E0 + 0.006; setEnergy(next > 0.45 ? -0.45 : +next.toFixed(3)); }, 130);
  });
  window.addEventListener('pagehide', stop);

  // ---------- CSV export ----------
  function exportCSV(kind) {
    if (!spectral) return;
    const lines = ['# Graphene ballistic transport; energies in eV, lengths in nm, ky in 1/nm', '# ' + JSON.stringify(p), '# selected_ky_per_nm=' + ky];
    if (kind === 'T') {
      lines.push('energy_eV,' + curves.map((r, j) => 'T_ky_' + r.ky.toFixed(3) + (j === 3 ? '_selected' : '')).join(','));
      for (let i = 0; i < EGRID.length; i++) lines.push(EGRID[i].toPrecision(10) + ',' + curves.map(r => r.T[i].toPrecision(12)).join(','));
    } else {
      lines.push('# LDOS per spin and valley mode; states/(eV nm)', 'energy_eV,x_nm,ldos_per_eV_nm');
      const g = spectral.geometry;
      for (let ie = 0; ie < EGRID.length; ie++) for (let j = 0; j < g.n; j++)
        lines.push(EGRID[ie].toPrecision(10) + ',' + g.x[j].toPrecision(10) + ',' + spectral.rho[ie * g.n + j].toPrecision(12));
    }
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = kind === 'T' ? 'graphene_transmission.csv' : 'graphene_ldos.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('export-T').addEventListener('click', () => exportCSV('T'));
  $('export-rho').addEventListener('click', () => exportCSV('rho'));

  // For checks in the browser console.
  window.GrapheneLab = { engine: G, getState: () => ({ p: { ...p }, ky, E0, spectral, curves }) };

  setControls();
  recompute();
})();
