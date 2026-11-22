/* The Lorentz transformation: the physics behind the lab. Units with c = 1.
   Tab 1: a light clock whose mirrors are L = 1/2 apart, so one tick (up and back) takes 1 time unit at rest.
   Tab 2: a train of rest length L0 = 1; lightning strikes both its ends, at the same time on the platform.
   Tab 3: a ball thrown forwards at u' inside a train moving at v. */
(function () {
  'use strict';
  const gamma = b => 1 / Math.sqrt(1 - b * b);
  // from the frame where events are (x, t) to a frame moving at b along x
  const boost = (b, x, t) => { const g = gamma(b); return [g * (x - b * t), g * (t - b * x)]; };
  const add = (u, v) => (u + v) / (1 + u * v);
  const rapidity = b => Math.atanh(b);

  // ---------- 1. The light clock ----------
  // the photon's height between the mirrors, 0 at the bottom and 1 at the top, after t ticks of its own clock
  const tri = t => { const f = ((t % 1) + 1) % 1; return f < 0.5 ? 2 * f : 2 - 2 * f; };
  // the muon: mean lifetime at rest, the speed of light, and the height where cosmic rays make it
  const MUON = { tau: 2.1969811e-6, c: 299792458, height: 15000 };
  const muonRange = (b, dilate) => (dilate ? gamma(b) : 1) * b * MUON.c * MUON.tau;
  const survive = (d, b, dilate) => (d <= 0 ? 1 : b <= 0 ? 0 : Math.exp(-d / muonRange(b, dilate)));

  // ---------- 2. The train and the lightning ----------
  // on the platform the moving train is contracted to L0/γ; the strikes hit its ends at t = 0
  function train(b, L0) {
    const L = L0 / gamma(b);
    return {
      L,
      A: [-L / 2, 0],                                    // the strike at the back
      B: [L / 2, 0],                                     // the strike at the front
      mid: t => b * t,
      // when the light from each strike reaches the passenger in the middle of the train (platform time)
      seeFront: L / (2 * (1 + b)), seeBack: L / (2 * (1 - b)),
      // and the platform observer standing where the middle of the train was at t = 0
      seePlatform: L / 2,
    };
  }
  // for an observer moving at u along the platform: time of the back strike minus time of the front strike,
  // and their distance apart
  function strikes(b, u, L0) {
    const T = train(b, L0), [xa, ta] = boost(u, T.A[0], T.A[1]), [xb, tb] = boost(u, T.B[0], T.B[1]);
    return { dt: ta - tb, dx: xb - xa, interval: (xb - xa) ** 2 - (tb - ta) ** 2 };
  }

  window.LT = { gamma, boost, add, rapidity, tri, MUON, muonRange, survive, train, strikes };
})();
