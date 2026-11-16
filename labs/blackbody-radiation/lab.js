/* Blackbody Radiation lab: controls, sweep and drawing. Physics is in physics.js. */
(function () {
  'use strict';
  const BB = window.Blackbody;
  const $ = id => document.getElementById(id);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const T_MIN = 300, T_MAX = 20000;
  const tFromSlider = v => T_MIN * Math.pow(T_MAX / T_MIN, v / 1000);
  const sliderFromT = T => Math.round(1000 * Math.log(T / T_MIN) / Math.log(T_MAX / T_MIN));

  const PRESETS = {
    default: { T: 4000, range: '3000' },
    sun: { T: 5772, range: '3000' },
    bulb: { T: 2800, range: '3000' },
    body: { T: 310, range: 'auto' },
    redhot: { T: 1000, range: '10000' },
    star: { T: 9940, range: '3000' },
  };
  const QUESTIONS = {
    q1: { T: 4000, range: '3000', rj: true, pin: null },
    q2: { T: 5772, range: '3000', rj: true, pin: null },
    q3: { T: 4000, range: '3000', rj: true, pin: null },
    q4: { T: 310, range: 'auto', rj: true, pin: null },
    q5: { T: 3000, range: '3000', rj: false, pin: 3000 },
    q6: { T: 4000, range: '10000', rj: true, pin: null },
  };

  const state = { T: 4000, qty: 'radiance', range: '3000', rj: true, visible: true, peak: true, pin: null, preset: 'default' };

  const plotSpec = new NanoPlot($('plot-spec'), { xLabel: '', yLabel: '' });
  const plotMode = new NanoPlot($('plot-mode'), { xLabel: '', yLabel: 'Energy per mode / kBT' });

  // ---------- formatting ----------
  const PREFIX = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  function prefixFor(v) { for (const [f, p] of PREFIX) if (Math.abs(v) >= f) return [f, p]; return [1e-12, 'p']; }
  function withPrefix(v, unit, digits = 3) {
    const [f, p] = prefixFor(v);
    return Number((v / f).toPrecision(digits)).toLocaleString('en-US') + ' ' + p + unit;
  }
  const fmtT = T => Math.round(T).toLocaleString('en-US') + ' K';
  function fmtLambda(m) {
    const nm = m * 1e9;
    return nm >= 10000 ? (nm / 1000).toPrecision(3) + ' µm' : Math.round(nm).toLocaleString('en-US') + ' nm';
  }
  function fmtFraction(f) {
    if (f >= 0.01) return (100 * f).toFixed(1) + '%';
    if (f >= 1e-4) return (100 * f).toPrecision(2) + '%';
    if (f <= 0) return '0%';
    const e = Math.floor(Math.log10(f)), m = f / Math.pow(10, e);
    return `${m.toFixed(1)} × 10<sup>${e}</sup>`;
  }
  const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');

  // ---------- quantities ----------
  const value = (lam, T) => state.qty === 'radiance' ? BB.planck(lam, T) : BB.toEnergyDensity(BB.planck(lam, T));
  const valueRJ = (lam, T) => state.qty === 'radiance' ? BB.rayleighJeans(lam, T) : BB.toEnergyDensity(BB.rayleighJeans(lam, T));
  // Per nanometre for display.
  const UNIT = () => state.qty === 'radiance' ? 'W·m⁻²·sr⁻¹·nm⁻¹' : 'J·m⁻³·nm⁻¹';

  function niceCeil(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 5 ? 5 : 10) * p;
  }
  function xMaxNm() {
    if (state.range !== 'auto') return +state.range;
    return Math.min(100000, Math.max(1000, niceCeil(5 * BB.peakWavelength(state.T) * 1e9)));
  }
  // Highest value of the curve inside [0, xmax]: the peak, or the right edge if the peak lies beyond.
  function maxInWindow(T, xmaxNm) {
    const lp = BB.peakWavelength(T), lx = xmaxNm * 1e-9;
    return value(Math.min(lp, lx), T) * 1e-9;
  }

  // Visible band drawn once as a 400 x 1 image.
  const band = document.createElement('canvas');
  band.width = 400; band.height = 1;
  (function () {
    const ctx = band.getContext('2d'), img = ctx.createImageData(400, 1);
    for (let i = 0; i < 400; i++) {
      const [r, g, b] = BB.spectralColour(380 + i);
      img.data[4 * i] = r; img.data[4 * i + 1] = g; img.data[4 * i + 2] = b; img.data[4 * i + 3] = 70;
    }
    ctx.putImageData(img, 0, 0);
  })();

  // ---------- drawing ----------
  function draw() {
    const T = state.T, xmax = xMaxNm(), micro = xmax > 5000, xs = micro ? 1e-3 : 1;   // axis in nm or µm
    const n = 700, lam = new Float64Array(n), xAxis = new Float64Array(n);
    for (let i = 0; i < n; i++) { const nm = xmax * (i + 1) / n; lam[i] = nm * 1e-9; xAxis[i] = nm * xs; }

    let ymax = maxInWindow(T, xmax);
    if (state.pin) ymax = Math.max(ymax, maxInWindow(state.pin, xmax));
    ymax *= 1.22;
    const [f, p] = prefixFor(ymax);
    const scale = 1e-9 / f;                         // per metre -> per nm, then prefix
    const yTop = ymax / f;

    const brand = css('--series-1'), im = css('--series-im'), ghost = css('--series-ghost'), amber = css('--series-amber');
    const layers = [];
    if (state.visible) layers.push({ type: 'image', canvas: band, x0: 380 * xs, x1: 780 * xs, y0: 0, y1: yTop });
    if (state.pin) {
      layers.push({ type: 'line', x: xAxis, y: Array.from(lam, l => value(l, state.pin) * scale), color: ghost, width: 2, dash: [6, 4] });
    }
    if (state.rj) {
      layers.push({ type: 'line', x: xAxis, y: Array.from(lam, l => Math.min(valueRJ(l, T) * scale, yTop * 10)), color: im, width: 2, dash: [7, 4] });
    }
    layers.push({ type: 'line', x: xAxis, y: Array.from(lam, l => value(l, T) * scale), color: brand, width: 2.6, fill: NanoPlot.alpha(brand, 0.12) });
    const lp = BB.peakWavelength(T) * 1e9;
    if (state.peak && lp <= xmax) layers.push({ type: 'vline', x: lp * xs, color: amber, dash: [4, 3], width: 1.4, label: 'λmax' });

    const sym = state.qty === 'radiance' ? 'B' : 'u';
    plotSpec.opts.xLabel = micro ? 'Wavelength λ (µm)' : 'Wavelength λ (nm)';
    plotSpec.opts.yLabel = `${sym}λ (${p}${UNIT()})`;
    plotSpec.setRange([0, xmax * xs], [0, yTop]);
    plotSpec.draw(layers);

    const legend = [[brand, '', `Planck, ${fmtT(T)}`]];
    if (state.rj) legend.push([im, 'swatch--dash', 'Rayleigh–Jeans (classical)']);
    if (state.pin) legend.push([ghost, 'swatch--dash', `Planck, pinned at ${fmtT(state.pin)}`]);
    $('spec-legend').innerHTML = legend.map(([c, k, t]) => `<li style="color:${c}"><span class="swatch ${k}"></span><span>${t}</span></li>`).join('');
    $('p1-title').innerHTML = state.qty === 'radiance' ? 'Spectral radiance B<sub>λ</sub>(T)' : 'Energy density u<sub>λ</sub>(T)';

    // Average energy per mode.
    const lhalf = BB.HC_K / (1.2564312086261697 * T) * 1e9;
    plotMode.opts.xLabel = plotSpec.opts.xLabel;
    plotMode.setRange([0, xmax * xs], [0, 1.1]);
    const ml = [
      { type: 'hline', y: 1, color: im, dash: [7, 4], width: 1.5 },
      { type: 'line', x: xAxis, y: Array.from(lam, l => BB.energyPerMode(l, T)), color: brand, width: 2.4, fill: NanoPlot.alpha(brand, 0.10) },
    ];
    if (lhalf <= xmax) ml.push({ type: 'vline', x: lhalf * xs, color: amber, dash: [4, 3], width: 1.4, label: '½ kBT' });
    plotMode.draw(ml);

    readouts(xmax);
  }

  function readouts(xmax) {
    const T = state.T, lpk = BB.peakWavelength(T);
    $('T-out').textContent = fmtT(T);
    $('T-big').textContent = fmtT(T);
    $('st-peak').textContent = fmtLambda(lpk);
    const pv = value(lpk, T) * 1e-9;
    $('st-peakval').textContent = withPrefix(pv, state.qty === 'radiance' ? 'W' : 'J');
    $('st-peakval-sub').textContent = state.qty === 'radiance' ? 'per m² · sr · nm, at λmax' : 'per m³ · nm, at λmax';
    $('st-power').textContent = withPrefix(BB.exitance(T), 'W/m²');
    const vis = BB.bandFraction(T, 380e-9, 750e-9);
    $('st-visible').innerHTML = fmtFraction(vis);
    $('st-rj').textContent = (BB.rayleighJeans(lpk, T) / BB.planck(lpk, T)).toFixed(1) + '×';
    // Below the Draper point (about 800 K) there is no visible glow to show.
    const faint = T < 800, colour = faint ? '#1d1418' : hex(BB.glowColour(T));
    $('st-colour-chip').style.background = colour;
    $('glow').style.background = colour;
    $('st-colour').textContent = faint ? 'not visible' : colour;
    $('st-colour-sub').textContent = faint ? 'too faint to see below about 800 K' : 'hue only, brightness scaled';

    let msg = '';
    if (lpk * 1e9 > xmax) msg = 'The peak lies beyond this window. Choose a wider wavelength range, or Auto.';
    else if (T < 800) msg = 'Below about 800 K (the Draper point) the visible part is too faint for the eye. The object still radiates strongly in the infrared.';
    else if (state.rj) msg = 'The classical curve keeps climbing toward short wavelengths. Integrated over all wavelengths it predicts infinite power: the ultraviolet catastrophe.';
    $('note').textContent = msg;

    document.querySelectorAll('.preset').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.preset === state.preset)));
    document.querySelectorAll('[data-qty]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.qty === state.qty)));
    $('pin').textContent = state.pin ? `Unpin ${fmtT(state.pin)}` : 'Pin this curve';
  }

  // ---------- controls ----------
  function sync() {
    $('T').value = sliderFromT(state.T);
    $('T-num').value = Math.round(state.T);
    $('range').value = state.range;
    $('rj').checked = state.rj; $('visible').checked = state.visible; $('peak').checked = state.peak;
  }
  function apply(values, preset = null) {
    stop();
    Object.assign(state, values, { preset });
    sync(); draw();
  }

  $('T').addEventListener('input', e => { stop(); state.T = tFromSlider(+e.target.value); state.preset = null; $('T-num').value = Math.round(state.T); draw(); });
  $('T-num').addEventListener('change', e => {
    const v = +e.target.value;
    if (!(v >= T_MIN && v <= T_MAX)) { e.target.value = Math.round(state.T); return; }
    stop(); state.T = v; state.preset = null; $('T').value = sliderFromT(v); draw();
  });
  document.querySelectorAll('[data-qty]').forEach(b => b.addEventListener('click', () => { state.qty = b.dataset.qty; draw(); }));
  $('range').addEventListener('change', e => { state.range = e.target.value; draw(); });
  for (const id of ['rj', 'visible', 'peak']) $(id).addEventListener('change', e => { state[id] = e.target.checked; draw(); });
  $('pin').addEventListener('click', () => { state.pin = state.pin ? null : state.T; draw(); });
  document.querySelectorAll('.preset').forEach(b => b.addEventListener('click', () => apply({ ...PRESETS[b.dataset.preset], pin: null }, b.dataset.preset)));
  $('reset').addEventListener('click', () => apply({ ...PRESETS.default, qty: 'radiance', rj: true, visible: true, peak: true, pin: null }, 'default'));
  document.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
    apply(QUESTIONS[b.dataset.q]);
    document.querySelector('.lab-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  // ---------- heat-up sweep ----------
  let raf = 0, playing = false, last = 0;
  function tick(now) {
    if (!playing) return;
    const dt = Math.min(64, now - last); last = now;
    state.T *= Math.pow(T_MAX / T_MIN, dt / 9000);   // 300 K to 20,000 K in about 9 s
    if (state.T > T_MAX) state.T = T_MIN;
    $('T').value = sliderFromT(state.T);
    $('T-num').value = Math.round(state.T);
    draw();
    raf = requestAnimationFrame(tick);
  }
  function stop() { playing = false; cancelAnimationFrame(raf); $('play').textContent = '▶ Heat up'; }
  $('play').addEventListener('click', () => {
    if (playing) { stop(); return; }
    playing = true; state.preset = null; last = performance.now();
    $('play').textContent = '❚❚ Pause';
    raf = requestAnimationFrame(tick);
  });

  sync();
  draw();
})();
