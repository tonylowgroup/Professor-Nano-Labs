/* Hero illustration: a free-electron Gaussian wave packet drifting over a
   graphene lattice. Uses the exact free-particle form: the envelope moves at
   the group velocity, the carrier moves at half that (the phase velocity),
   and the packet spreads as sigma(t) = sigma0 * sqrt(1 + (t/tau)^2). */
(function () {
  const wave = document.getElementById('heroWave');
  const env = document.getElementById('heroEnvelope');
  const dens = document.getElementById('heroDensity');
  if (!wave || !env || !dens) return;

  const X0 = 20, X1 = 500, STEP = 2;        // drawing range (SVG units)
  const BASE = 230;                          // baseline y
  const START = 95, END = 425;               // packet centre travels START -> END
  const DURATION = 9000;                     // ms per pass
  const SIGMA0 = 24;                         // initial width (std of |psi|^2)
  const TAU = DURATION / Math.sqrt(3);       // width doubles by the end of a pass
  const K = 2 * Math.PI / 19;                // carrier wavenumber
  const AMP = 72;                            // Re psi and |psi|^2 share a peak height at t = 0

  function frame(t) {
    const s = t / TAU;                       // dimensionless time
    const sigma = SIGMA0 * Math.sqrt(1 + s * s);
    const c = START + (END - START) * (t / DURATION);
    const vg = (END - START) / DURATION;
    const scale = Math.sqrt(SIGMA0 / sigma);
    const gouy = -0.5 * Math.atan(s);

    let dW = '', dEtop = '', dEbot = '', dD = `M${X0} ${BASE}`;
    for (let x = X0; x <= X1; x += STEP) {
      const u = x - c;
      const e = AMP * scale * Math.exp(-(u * u) / (4 * sigma * sigma));
      const phase = K * (x - START) - K * vg * t / 2 + (u * u) * s / (4 * sigma * sigma) + gouy;
      const y = BASE - e * Math.cos(phase);
      const yd = BASE - AMP * (SIGMA0 / sigma) * Math.exp(-(u * u) / (2 * sigma * sigma));
      dW += (x === X0 ? 'M' : 'L') + x + ' ' + y.toFixed(2);
      dEtop += (x === X0 ? 'M' : 'L') + x + ' ' + (BASE - e).toFixed(2);
      dEbot += (x === X0 ? 'M' : 'L') + x + ' ' + (BASE + e).toFixed(2);
      dD += 'L' + x + ' ' + yd.toFixed(2);
    }
    dD += `L${X1} ${BASE}Z`;
    wave.setAttribute('d', dW);
    env.setAttribute('d', dEtop + dEbot);
    dens.setAttribute('d', dD);

    // Fade in at the start of a pass and out at the end.
    const p = t / DURATION;
    const edge = 0.12;
    const fade = Math.min(1, p / edge, (1 - p) / edge);
    const o = fade * fade * (3 - 2 * fade);
    wave.style.opacity = env.style.opacity = dens.style.opacity = o.toFixed(3);
  }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce.matches) { frame(DURATION * 0.4); return; }

  let running = true, start = null, raf = 0;
  function loop(now) {
    if (start === null) start = now;
    frame((now - start) % DURATION);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  // Pause while the hero is off screen.
  const art = document.querySelector('.hero__art');
  if ('IntersectionObserver' in window && art) {
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !running) { running = true; start = null; raf = requestAnimationFrame(loop); }
      else if (!entry.isIntersecting && running) { running = false; cancelAnimationFrame(raf); }
    }).observe(art);
  }
})();
