/* Entanglement: Correlations No Coin Can Fake. The physics; no DOM access here.

   Two spin-1/2 particles, Alice's and Bob's. Each measures spin along a "dial":
   an axis in the x-z plane at angle theta from z, n(theta) = (sin theta, 0, cos theta).
   Each result is +1 (up along the dial) or -1 (down).

   Sources:
   - 'quantum': the singlet (|ud> - |du>)/sqrt 2, mixed with white noise to purity (visibility) v:
                rho = v |singlet><singlet| + (1 - v) I/4.  P(A, B) = (1 - A B v cos(a - b)) / 4.
   - 'socks':   classically correlated along z only: half (up, down), half (down, up).
                P(A, B) = (1 - A B cos a cos b) / 4.
   - 'arrow':   Bell's hidden-arrow model, the best "answer sheet": each pair carries a random
                direction lambda; Alice answers sign(cos(a - lambda)), Bob -sign(cos(b - lambda)).
                E = -(1 - 2|a - b|/pi) for |a - b| <= pi.
   Angles are in radians.
*/
(function () {
  'use strict';
  const PI = Math.PI;
  const axis = th => [Math.sin(th), 0, Math.cos(th)];

  /* Fold an angle difference into [0, pi]. */
  function gap(a, b) {
    let d = Math.abs(a - b) % (2 * PI);
    return d > PI ? 2 * PI - d : d;
  }

  /* Joint probabilities [P(++), P(+-), P(-+), P(--)] (Alice first). */
  function probs(source, a, b, v) {
    let E;
    if (source === 'quantum') E = -(v === undefined ? 1 : v) * Math.cos(a - b);
    else if (source === 'socks') E = -Math.cos(a) * Math.cos(b);
    else E = -(1 - 2 * gap(a, b) / PI);
    const same = (1 + E) / 4, diff = (1 - E) / 4;
    return [same, diff, diff, same];
  }

  /* Correlation <A B>. */
  function corr(source, a, b, v) {
    const p = probs(source, a, b, v);
    return p[0] - p[1] - p[2] + p[3];
  }

  const sign = x => (x >= 0 ? 1 : -1);

  /* One pair. rand() is a uniform deviate in [0, 1). For the hidden-arrow model the arrow
     lambda is returned as well, so it can be drawn. */
  function shot(source, a, b, v, rand) {
    if (source === 'arrow') {
      const lam = 2 * PI * rand();
      return { A: sign(Math.cos(a - lam)), B: -sign(Math.cos(b - lam)), lambda: lam };
    }
    if (source === 'socks') {
      // the pair really is (up, down) or (down, up) along z; each spin is then measured along its dial
      const sA = rand() < 0.5 ? 1 : -1;
      const pA = (1 + sA * Math.cos(a)) / 2, pB = (1 - sA * Math.cos(b)) / 2;
      return { A: rand() < pA ? 1 : -1, B: rand() < pB ? 1 : -1, zA: sA };
    }
    const p = probs(source, a, b, v);
    const u = rand();
    const k = u < p[0] ? 0 : u < p[0] + p[1] ? 1 : u < p[0] + p[1] + p[2] ? 2 : 3;
    return { A: k < 2 ? 1 : -1, B: k % 2 === 0 ? 1 : -1 };
  }

  /* CHSH combination S = E(a,b) - E(a,b') + E(a',b) + E(a',b'). */
  const chsh = (Eab, Eabp, Eapb, Eapbp) => Eab - Eabp + Eapb + Eapbp;

  /* An answer sheet fixes Alice's answer for a and a' and Bob's for b and b'. Its score is always +-2. */
  const sheetScore = (Aa, Aap, Bb, Bbp) => Aa * Bb - Aa * Bbp + Aap * Bb + Aap * Bbp;

  /* Every one of the 16 answer sheets with its score. */
  function allSheets() {
    const out = [];
    for (const Aa of [1, -1]) for (const Aap of [1, -1]) for (const Bb of [1, -1]) for (const Bbp of [1, -1]) out.push({ Aa, Aap, Bb, Bbp, S: sheetScore(Aa, Aap, Bb, Bbp) });
    return out;
  }

  /* CHSH score for evenly spaced dials a = 0, b = phi, a' = 2 phi, b' = 3 phi. */
  function evenScore(source, phi, v) {
    return chsh(corr(source, 0, phi, v), corr(source, 0, 3 * phi, v), corr(source, 2 * phi, phi, v), corr(source, 2 * phi, 3 * phi, v));
  }

  /* Steering: after Alice gets A along a, Bob's Bloch vector is -A v n(a); averaged over A it is 0. */
  function bobGiven(A, a, v) { const n = axis(a); return n.map(x => -A * v * x); }
  /* Bob's chance of +1 along b, given Alice's result A along a, and with no information about A. */
  const bobPlusGiven = (A, a, b, v) => (1 - A * v * Math.cos(a - b)) / 2;
  const bobPlus = () => 0.5;

  /* Werner states: entangled for v > 1/3; violate CHSH for v > 1/sqrt 2. */
  const ENTANGLED_FROM = 1 / 3, VIOLATES_FROM = Math.SQRT1_2, TSIRELSON = 2 * Math.SQRT2;

  window.Bell = { PI, axis, gap, probs, corr, shot, chsh, sheetScore, allSheets, evenScore, bobGiven, bobPlusGiven, bobPlus, ENTANGLED_FROM, VIOLATES_FROM, TSIRELSON };
})();
