/* Three qubits: controls, drawings and plots. The physics is in physics.js. */
(function () {
  'use strict';
  const Q = window.Three;
  const $ = id => document.getElementById(id);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const DEG = Math.PI / 180;

  const S = {
    input: 0b110, gates: [{ kind: 'TOF', t: 3 }], t: 1, target: 3, control: 1, preset: 'and',   // tab 1
    theta: 60, phi: 45, v: 1, step: 0, m: null,                                               // tab 2
  };
  let mode = 'gates';
  const shots = new Map();      // tab 1: counts per (input, circuit so far)
  const runs = new Map();       // tab 2: teleportation runs per (message, v)

  // ---------- formatting ----------
  const fixed = (x, d = 2) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const pct = x => (100 * x).toFixed(1) + '%';
  const ket = i => Q.KETS[i];
  const bits = i => i.toString(2).padStart(3, '0');
  // phase as colour: + berry, +i amber, − blue, −i green
  const ANCHORS = [[163, 50, 108], [196, 122, 18], [31, 111, 180], [61, 154, 79]];
  function phaseColor(z) {
    const d = ((Q.carg(z) / DEG) % 360 + 360) % 360, k = Math.floor(d / 90) % 4, t = (d - 90 * Math.floor(d / 90)) / 90;
    const a = ANCHORS[k], b = ANCHORS[(k + 1) % 4];
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
  }
  function coef(z, digits = 3) {
    const m = Q.cabs(z);
    if (m < 5e-4) return null;
    const a = Q.carg(z) / DEG, mag = m.toFixed(digits);
    const near = v => Math.abs(a - v) < 0.06;
    if (near(0)) return mag;
    if (near(180) || near(-180)) return '−' + mag;
    if (near(90)) return mag + 'i';
    if (near(-90)) return '−' + mag + 'i';
    return `${mag} e<sup>${a < 0 ? '−' : ''}i${Math.round(Math.abs(a))}°</sup>`;
  }
  function ketHTML(amps, labels) {
    let s = '';
    amps.forEach((z, i) => {
      const c = coef(z);
      if (c === null) return;
      const neg = c.startsWith('−'), body = (neg ? c.slice(1) : c) + ' ' + labels[i];
      s += s ? (neg ? ' − ' : ' + ') + body : (neg ? '−' : '') + body;
    });
    return s || '0';
  }
  // remove the overall phase so that the first non-zero amplitude is real and positive
  function canonical(amps) {
    const first = amps.find(z => Q.cabs(z) > 1e-9);
    if (!first) return amps;
    const ph = Q.expi(-Q.carg(first));
    return amps.map(z => Q.cmul(z, ph));
  }
  function gateName(g) {
    if (g.kind === 'CNOT') return `CNOT ${g.c}→${g.t}`;
    if (g.kind === 'TOF') return `Toffoli → ${g.t}`;
    if (g.kind === 'FRED') return `Fredkin: ${g.c} swaps ${Q.others(g.c).join(', ')}`;
    if (g.kind === 'CCZ') return 'CCZ';
    return `${g.kind} on ${g.t}`;
  }

  // ---------- shared helpers ----------
  function stats(items) {
    $('stats').innerHTML = items.map(([label, value, sub]) =>
      `<div class="stat"><div class="stat__label">${label}</div><div class="stat__value">${value}</div><div class="stat__sub">${sub}</div></div>`).join('');
  }
  function legend(id, items) {
    $(id).innerHTML = items.map(([color, kind, label]) => `<li style="color:${color}"><span class="swatch ${kind}"></span><span>${label}</span></li>`).join('');
  }
  function typeset(el) { if (window.MathJax && MathJax.typesetPromise && /\\\(/.test(el.innerHTML)) MathJax.typesetPromise([el]).catch(() => {}); }
  // write a live region only when its text changes
  function setHTML(el, html) { if (el.dataset.html === html) return; el.dataset.html = html; el.innerHTML = html; typeset(el); }
  const info = html => setHTML($('info'), html);
  const note = html => setHTML($('takeaway'), html);
  function rows(id, items) {
    $(id).innerHTML = items.map(r => `
      <div class="outcome">
        <span class="outcome__label${r.wide ? ' outcome__label--wide' : ''}">${r.label}</span>
        <span class="outcome__track"><span class="outcome__bar" style="width:${(100 * Math.min(1, r.frac || 0)).toFixed(2)}%;background:${r.color}"></span>${r.pred === undefined ? '' : `<span class="outcome__pred" style="left:${(100 * r.pred).toFixed(2)}%" title="Prediction ${(100 * r.pred).toFixed(1)}%"></span>`}</span>
        <span class="outcome__val">${r.val}</span>
      </div>`).join('');
  }

  // ---------- tab 1: circuit and wiring ----------
  const WY = [24, 64, 104];
  function gateWidth(g) { return g.kind === 'FRED' ? 34 : g.kind === 'CCZ' || g.kind === 'CNOT' || g.kind === 'TOF' ? 32 : 34; }
  function drawGate(g, cx, done) {
    const wy = q => WY[q - 1];
    let s = '';
    const dot = q => `<circle cx="${cx}" cy="${wy(q)}" r="5" class="cg__dot"/>`;
    const targ = q => `<circle cx="${cx}" cy="${wy(q)}" r="11" class="cg__targ"/><line x1="${cx - 11}" y1="${wy(q)}" x2="${cx + 11}" y2="${wy(q)}" class="cg__line"/><line x1="${cx}" y1="${wy(q) - 11}" x2="${cx}" y2="${wy(q) + 11}" class="cg__line"/>`;
    const vline = (q1, q2) => `<line x1="${cx}" y1="${wy(q1)}" x2="${cx}" y2="${wy(q2)}" class="cg__line"/>`;
    const cross = q => { const d = 6, y = wy(q); return `<path d="M${cx - d},${y - d}L${cx + d},${y + d}M${cx + d},${y - d}L${cx - d},${y + d}" class="cg__line cg__x"/>`; };
    if (g.kind === 'CNOT') { s += vline(Math.min(g.c, g.t), Math.max(g.c, g.t)) + dot(g.c) + targ(g.t); }
    else if (g.kind === 'TOF') { const [a, b] = Q.others(g.t); s += vline(1, 3) + dot(a) + dot(b) + targ(g.t); }
    else if (g.kind === 'FRED') { const [a, b] = Q.others(g.c); s += vline(1, 3) + dot(g.c) + cross(a) + cross(b); }
    else if (g.kind === 'CCZ') { s += vline(1, 3) + dot(1) + dot(2) + dot(3); }
    else { const y = wy(g.t); s += `<rect x="${cx - 15}" y="${y - 15}" width="30" height="30" rx="6" class="cg__box"/><text x="${cx}" y="${y + 5}" class="cg__t">${g.kind}</text>`; }
    return s;
  }
  function circuitGates() {
    const n = S.gates.length, x0 = 70, gap = 12, xs = [];
    let x = x0;
    S.gates.forEach(g => { xs.push(x + gateWidth(g) / 2); x += gateWidth(g) + gap; });
    const W = Math.max(x + 30, 300), H = 128;
    let s = '';
    WY.forEach((y, k) => {
      s += `<line x1="${x0 - 14}" y1="${y}" x2="${W - 8}" y2="${y}" class="cw"/>`;
      s += `<text x="6" y="${y + 5}" class="cl">${k + 1} |${(S.input >> (2 - k)) & 1}⟩</text>`;
    });
    if (!n) s += `<text x="${x0 + 6}" y="${WY[1] - 12}" class="ce">Add a gate to start the circuit.</text>`;
    S.gates.forEach((g, i) => {
      const status = i < S.t ? 'done' : 'todo';
      s += `<g class="cg cg--${status}${i === S.t - 1 ? ' cg--now' : ''}" data-i="${i}" role="button" tabindex="0" aria-label="Show the state after gate ${i + 1}: ${gateName(g)}">`;
      s += `<rect x="${xs[i] - gateWidth(g) / 2 - 4}" y="2" width="${gateWidth(g) + 8}" height="${H - 4}" class="cg__hit"/>`;
      s += drawGate(g, xs[i], i < S.t) + '</g>';
    });
    const mx = S.t === 0 ? x0 - 6 : xs[S.t - 1] + gateWidth(S.gates[S.t - 1]) / 2 + gap / 2;
    s += `<line x1="${mx}" y1="4" x2="${mx}" y2="${H - 4}" stroke="${css('--series-amber')}" stroke-width="2"/>`;
    $('circuit').innerHTML = `<svg class="circuit__svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" aria-label="Circuit with ${n} gate${n === 1 ? '' : 's'}">${s}</svg>`;
    $('circuit').querySelectorAll('.cg').forEach(el => {
      const go = () => { S.t = +el.dataset.i + 1; render(); };
      el.addEventListener('click', go);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  // Inputs on the left, outputs on the right; one line per non-zero matrix element.
  function wiringSVG(before, after, g) {
    const W = 400, top = 44, dy = 30, H = top + 8 * dy, xl = 104, xr = 296;
    const y = i => top + i * dy;
    let s = `<text x="${xl}" y="20" text-anchor="middle" class="wl wl--h">before</text><text x="${xr}" y="20" text-anchor="middle" class="wl wl--h">after</text>`;
    s += `<text x="${W / 2}" y="20" text-anchor="middle" class="wl wl--g">${g ? gateName(g) : 'no gate yet'}</text>`;
    const M = g ? Q.matrix(g) : null;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const z = M ? M[j][i] : (i === j ? [1, 0] : [0, 0]);
        const m = Q.cabs(z);
        if (m < 1e-9) continue;
        const same = i === j && Math.abs(z[0] - 1) < 1e-9;
        const col = same ? '#c5d2d9' : phaseColor(z), neg = Math.abs(Q.carg(z)) > Math.PI / 2 + 1e-9;
        s += `<line x1="${xl + 8}" y1="${y(i)}" x2="${xr - 8}" y2="${y(j)}" stroke="${col}" stroke-width="${same ? 1.4 : (1.2 + 1.6 * m).toFixed(2)}"${neg ? ' stroke-dasharray="5 4"' : ''}/>`;
      }
    }
    const dotAt = (x, i, amp) => {
      const p = Q.abs2(amp);
      if (p < 1e-9) return `<circle cx="${x}" cy="${y(i)}" r="3" fill="#fff" stroke="#c5d2d9" stroke-width="1.4"/>`;
      return `<circle cx="${x}" cy="${y(i)}" r="${(3.5 + 7.5 * Math.sqrt(p)).toFixed(2)}" fill="${phaseColor(amp)}"/>`;
    };
    for (let i = 0; i < 8; i++) {
      s += `<text x="${xl - 22}" y="${y(i) + 5}" text-anchor="end" class="wl">${ket(i)}</text><text x="${xr + 22}" y="${y(i) + 5}" class="wl">${ket(i)}</text>`;
      s += dotAt(xl, i, before[i]) + dotAt(xr, i, after[i]);
    }
    return `<svg class="wiring__svg" viewBox="0 0 ${W} ${H + 8}" role="img" aria-label="${g ? gateName(g) : 'No gate'}: how the eight rows are rewired">${s}</svg>`;
  }

  // Which rows a gate exchanges, in words.
  function gateWords(g) {
    if (g.kind === 'H') return `<b>H on qubit ${g.t}</b> splits every row in two: one copy with qubit ${g.t} = 0 and one with it = 1, each with weight 1/√2. The copy that goes from 1 to 1 gets a minus sign (dashed lines).`;
    if (g.kind === 'Z') return `<b>Z on qubit ${g.t}</b> moves nothing; it puts a minus sign on every row where qubit ${g.t} is 1.`;
    if (g.kind === 'CCZ') return '<b>CCZ</b> moves nothing; it puts a minus sign on row |111⟩ only.';
    const pairs = [];
    for (let i = 0; i < 8; i++) { const j = Q.image(g, i); if (j > i) pairs.push(`${ket(i)} ↔ ${ket(j)}`); }
    const what = g.kind === 'X' ? `flips qubit ${g.t} in every row` : g.kind === 'CNOT' ? `flips qubit ${g.t} where qubit ${g.c} is 1` : g.kind === 'TOF' ? `flips qubit ${g.t} where qubits ${Q.others(g.t).join(' and ')} are both 1` : `swaps qubits ${Q.others(g.c).join(' and ')} where qubit ${g.c} is 1`;
    return `<b>${gateName(g)}</b> ${what}: it exchanges ${pairs.join(', ')}${pairs.length < 4 ? ` and leaves the other ${8 - 2 * pairs.length} rows alone` : ''}.`;
  }

  const PRESETS = {
    and: { input: 0b110, gates: [{ kind: 'TOF', t: 3 }], note: '<b>AND:</b> with qubit 3 starting at 0, the Toffoli leaves it holding a AND b. Flip the input bits to read the whole truth table: only 11 changes qubit 3. Unlike a classical AND gate, the inputs a and b are still there.' },
    nand: { input: 0b111, gates: [{ kind: 'TOF', t: 3 }], note: '<b>NAND:</b> start qubit 3 at 1 and it ends up as NOT (a AND b). NAND alone can build any classical circuit, so the Toffoli can too, reversibly.' },
    adder: { input: 0b110, gates: [{ kind: 'TOF', t: 3 }, { kind: 'CNOT', c: 1, t: 2 }], note: '<b>Half adder:</b> the output is |a, a⊕b, ab⟩. Qubit 2 holds the sum bit and qubit 3 the carry: 1 + 1 gives sum 0, carry 1, which is 10 in binary.' },
    cswap: { input: 0b101, gates: [{ kind: 'FRED', c: 1 }], note: '<b>Controlled swap:</b> when qubit 1 is 1, the Fredkin gate swaps qubits 2 and 3. It never changes how many 1s there are, which is why it can model a billiard-ball computer.' },
    undo: { input: 0b110, gates: [{ kind: 'TOF', t: 3 }, { kind: 'TOF', t: 3 }], note: '<b>Undo it:</b> the second Toffoli swaps the rows back. Each row goes to exactly one row and comes from exactly one, so the input can always be recovered.' },
    copy: { input: 0b100, gates: [{ kind: 'CNOT', c: 1, t: 2 }], note: '<b>Copy a bit:</b> CNOT 1→2 with qubit 2 at 0 copies bit 1 into qubit 2. Flip qubit 1: the copy follows.' },
    clone: { input: 0b000, gates: [{ kind: 'H', t: 1 }, { kind: 'CNOT', c: 1, t: 2 }], note: '<b>No cloning:</b> the same CNOT does not copy |+⟩. Instead of two copies spread over four rows, you get a Bell pair on just two rows, and the arrows of qubits 1 and 2 shrink to zero.' },
    parallel: { input: 0b000, gates: [{ kind: 'H', t: 1 }, { kind: 'H', t: 2 }, { kind: 'TOF', t: 3 }], note: '<b>Every input at once:</b> the Toffoli acts on all four input rows in one go. But measuring gives one row at random, so you read one line of the table, not all of it. Algorithms have to use interference to get more out.' },
    kickback: { input: 0b001, gates: [{ kind: 'H', t: 1 }, { kind: 'H', t: 2 }, { kind: 'H', t: 3 }, { kind: 'TOF', t: 3 }, { kind: 'H', t: 3 }], note: '<b>Phase kickback:</b> with qubit 3 in |−⟩, the Toffoli does not change qubit 3 at all. Instead a minus sign lands on row |111⟩: the Toffoli acted as a CCZ on the other qubits.' },
  };

  function shotKey() { return S.input + '|' + JSON.stringify(S.gates.slice(0, S.t)); }

  function renderGates() {
    const n = S.gates.length;
    S.t = Math.min(S.t, n);
    const before = Q.run(S.input, S.gates, Math.max(0, S.t - 1)), after = Q.run(S.input, S.gates, S.t);
    const g = S.t > 0 ? S.gates[S.t - 1] : null;
    circuitGates();
    $('wiring').innerHTML = wiringSVG(S.t > 0 ? before : after, after, g);
    $('dg-title').textContent = 'Circuit';
    $('dg-cap').textContent = 'Click a gate to see the state just after it. Below: how that gate rewires the eight rows, with the state before and after as dots.';
    const p = Q.probs(after), live = p.map((v, i) => [v, i]).filter(([v]) => v > 1e-9);
    const lens = [1, 2, 3].map(k => Math.hypot(...Q.bloch(after, k)));
    const product = lens.every(l => l > 1 - 1e-9);
    stats([
      ['Input', ket(S.input), 'qubits 1, 2, 3 in that order'],
      ['Showing', `${S.t} of ${n} gate${n === 1 ? '' : 's'}`, g ? gateName(g) : 'the input itself'],
      ['State', live.length === 1 ? ket(live[0][1]) : `${live.length} rows`, live.length === 1 ? 'a definite bit string' : 'a superposition'],
      ['Entangled?', product ? 'No' : 'Yes', `arrow lengths ${lens.map(l => fixed(l, 2)).join(' · ')}`],
    ]);
    info(g ? gateWords(g) : '<b>No gate yet:</b> the state is the input bit string, one row with all the weight. Add a gate, or load an example.');
    // plot A: the state, row by row
    const can = canonical(after);
    $('pa-title').textContent = S.t ? `The state after gate ${S.t}` : 'The input state';
    $('pa-cap').textContent = 'Bar length: the probability |c|² of each row. Colour: the phase of its amplitude (overall phase removed).';
    legend('pa-legend', [['rgb(163,50,108)', 'swatch--stem', '+'], ['rgb(196,122,18)', 'swatch--stem', '+i'], ['rgb(31,111,180)', 'swatch--stem', '−'], ['rgb(61,154,79)', 'swatch--stem', '−i']]);
    rows('rows-a', can.map((z, i) => ({ label: ket(i), frac: Q.abs2(z), color: phaseColor(z), val: coef(z) || '0' })));
    // plot B: shots
    const c = shots.get(shotKey()) || new Array(8).fill(0), tot = c.reduce((a, b) => a + b, 0);
    $('pb-title').textContent = 'Measure all three qubits';
    $('pb-cap').textContent = tot ? `Bars: your ${tot} shot${tot === 1 ? '' : 's'} of the state shown. Ticks: the probabilities |c|².` : 'Press +1 shot, +100 or +1000 to measure copies of the state shown. Ticks: the probabilities |c|².';
    legend('pb-legend', []);
    rows('rows-b', p.map((pp, i) => ({ label: ket(i), frac: tot ? c[i] / tot : 0, pred: pp, color: css('--series-1'), val: tot ? `${c[i]} · ${pct(c[i] / tot)}` : pct(pp) })));
    note(S.preset && PRESETS[S.preset] ? PRESETS[S.preset].note
      : '<b>Every gate here undoes itself:</b> add the same gate twice in a row and the state comes back. Try building the examples from scratch.');
    $('step-out').textContent = `after ${S.t} of ${n}`;
    $('back').disabled = S.t === 0; $('next').disabled = S.t >= n;
    return tot;
  }

  // ---------- tab 2: teleportation ----------
  const msgNow = () => Q.fromAngles(S.theta * DEG, S.phi * DEG);
  function teleCircuit() {
    const H = 146, W = 470, x = [104, 154, 214, 264, 330, 392, 440], wy = WY.map(y => y + 12);
    const done = k => S.step >= k, cur = k => S.step === k;
    let s = '';
    s += `<line x1="56" y1="${wy[0]}" x2="${x[4]}" y2="${wy[0]}" class="cw"/><line x1="56" y1="${wy[1]}" x2="${x[4]}" y2="${wy[1]}" class="cw"/><line x1="56" y1="${wy[2]}" x2="${W - 6}" y2="${wy[2]}" class="cw"/>`;
    s += `<text x="6" y="${wy[0] + 5}" class="cl">1 |ψ⟩</text><text x="6" y="${wy[1] + 5}" class="cl">2 |0⟩</text><text x="6" y="${wy[2] + 5}" class="cl">3 |0⟩</text>`;
    // classical wires after the measurements
    const cw = (y1, x1, x2, y2) => `<path d="M${x1},${y1 - 1.6}H${x2 + 1.6}V${y2}M${x1},${y1 + 1.6}H${x2 - 1.6}V${y2}" fill="none" stroke="${done(5) ? css('--plot-text') : '#c5d2d9'}" stroke-width="1.2"/>`;
    s += cw(wy[1], x[4] + 14, x[5], wy[2] - 15) + cw(wy[0], x[4] + 14, x[6], wy[2] - 15);
    const grp = (k, inner) => `<g class="cg ${done(k) ? 'cg--done' : 'cg--todo'}${cur(k) ? ' cg--now' : ''}" data-step="${k}" role="button" tabindex="0" aria-label="Go to step ${k}: ${Q.STEPS[k].name}">${inner}</g>`;
    const box = (cx, y, t) => `<rect x="${cx - 15}" y="${y - 15}" width="30" height="30" rx="6" class="cg__box"/><text x="${cx}" y="${y + 5}" class="cg__t">${t}</text>`;
    const hit = cx => `<rect x="${cx - 22}" y="2" width="44" height="${H - 4}" class="cg__hit"/>`;
    s += grp(1, hit(x[0]) + box(x[0], wy[1], 'H'));
    s += grp(2, hit(x[1]) + `<line x1="${x[1]}" y1="${wy[1]}" x2="${x[1]}" y2="${wy[2] + 11}" class="cg__line"/><circle cx="${x[1]}" cy="${wy[1]}" r="5" class="cg__dot"/><circle cx="${x[1]}" cy="${wy[2]}" r="11" class="cg__targ"/><line x1="${x[1] - 11}" y1="${wy[2]}" x2="${x[1] + 11}" y2="${wy[2]}" class="cg__line"/><line x1="${x[1]}" y1="${wy[2] - 11}" x2="${x[1]}" y2="${wy[2] + 11}" class="cg__line"/>`);
    s += grp(3, hit(x[2]) + `<line x1="${x[2]}" y1="${wy[0]}" x2="${x[2]}" y2="${wy[1] + 11}" class="cg__line"/><circle cx="${x[2]}" cy="${wy[0]}" r="5" class="cg__dot"/><circle cx="${x[2]}" cy="${wy[1]}" r="11" class="cg__targ"/><line x1="${x[2] - 11}" y1="${wy[1]}" x2="${x[2] + 11}" y2="${wy[1]}" class="cg__line"/><line x1="${x[2]}" y1="${wy[1] - 11}" x2="${x[2]}" y2="${wy[1] + 11}" class="cg__line"/>`);
    s += grp(4, hit(x[3]) + box(x[3], wy[0], 'H'));
    const meter = y => `<rect x="${x[4] - 15}" y="${y - 15}" width="30" height="30" rx="6" class="cg__box"/><path d="M${x[4] - 9},${y + 6}A10,10 0 0 1 ${x[4] + 9},${y + 6}" fill="none" class="cg__line"/><line x1="${x[4]}" y1="${y + 6}" x2="${x[4] + 7}" y2="${y - 7}" class="cg__line"/>`;
    s += grp(5, hit(x[4]) + meter(wy[0]) + meter(wy[1]));
    const m = S.m;
    s += grp(6, `<rect x="${x[5] - 22}" y="2" width="${x[6] - x[5] + 44}" height="${H - 4}" class="cg__hit"/>` + box(x[5], wy[2], 'X') + box(x[6], wy[2], 'Z'));
    if (m && S.step >= 5) {
      s += `<text x="${x[4]}" y="${wy[0] - 20}" text-anchor="middle" class="ce">m₁ = ${m[0]}</text><text x="${x[4]}" y="${wy[1] + 32}" text-anchor="middle" class="ce">m₂ = ${m[1]}</text>`;
      s += `<text x="${x[5]}" y="${wy[2] + 32}" text-anchor="middle" class="ce">${m[1] ? 'apply' : 'skip'}</text><text x="${x[6]}" y="${wy[2] + 32}" text-anchor="middle" class="ce">${m[0] ? 'apply' : 'skip'}</text>`;
    } else s += `<text x="${(x[5] + x[6]) / 2}" y="${wy[2] + 32}" text-anchor="middle" class="ce">if m₂ = 1 · if m₁ = 1</text>`;
    const mx = S.step === 0 ? 70 : S.step === 6 ? x[6] + 26 : (x[S.step - 1] + x[S.step]) / 2;
    s += `<line x1="${mx}" y1="4" x2="${mx}" y2="${H - 4}" stroke="${css('--series-amber')}" stroke-width="2"/>`;
    $('circuit').innerHTML = `<svg class="circuit__svg circuit__svg--fit" width="${W}" height="${H + 14}" viewBox="0 0 ${W} ${H + 14}" role="group" aria-label="Teleportation circuit, step ${S.step} of 6">${s}</svg>`;
    $('circuit').querySelectorAll('[data-step]').forEach(el => {
      const go = () => goTo(+el.dataset.step);
      el.addEventListener('click', go);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }
  function goTo(step) {
    step = Math.max(0, Math.min(6, step));
    if (step >= 5 && !S.m) { const mi = Math.floor(Math.random() * 4); S.m = [mi >> 1, mi & 1]; }   // each result has chance 1/4
    if (step < 5) S.m = null;
    S.step = step;
    render();
  }

  const SPH = { labels: {} };
  const spheres = [1, 2, 3].map(k => new BlochSphere($('sphere-' + k)));
  spheres.forEach((sp, i) => { sp.onView = (az, el) => spheres.forEach((o, j) => { if (j !== i) o.setView(az, el, true); }); });
  const runKey = () => [S.theta, S.phi, S.v].join('|');

  function renderTeleport() {
    const msg = msgNow(), rpsi = Q.blochOf(msg), v = S.v, step = S.step, m = S.m;
    teleCircuit();
    const r = Q.teleportView(msg, v, m, step);
    const brand = css('--series-1'), amber = css('--series-amber'), blue = css('--series-re'), ghost = css('--series-ghost');
    // qubit 1
    const a1 = [{ v: r[0], color: brand, width: 3.2 }];
    if (step >= 3) a1.push({ v: rpsi, color: ghost, width: 1.6, dash: [5, 4], alpha: 0.7 });
    spheres[0].draw({ arrows: a1 });
    spheres[1].draw({ arrows: [{ v: r[1], color: brand, width: 3.2 }] });
    // Bob: what he actually holds, and after the measurement what he can know without the bits
    const a3 = [];
    if (step === 5) {
      const parts = Q.bobParts(msg).map(pp => Q.blochOf(pp).map(c => c * v));
      parts.forEach((pv, i) => { if (i !== 2 * m[0] + m[1]) a3.push({ v: pv, color: ghost, width: 1.4, dash: [4, 4], alpha: 0.6 }); });
      a3.push({ v: r[2], color: brand, width: 3.2 });
      a3.push({ v: [0, 0, 0], color: amber, width: 3 });
    } else {
      a3.push({ v: r[2], color: brand, width: 3.2 });
      if (step === 6) a3.push({ v: rpsi, color: ghost, width: 1.6, dash: [5, 4], alpha: 0.7 });
    }
    spheres[2].draw({ arrows: a3 });
    $('dg-title').textContent = 'Teleportation, step by step';
    $('dg-cap').textContent = step === 5
      ? 'Solid arrows: each qubit on its own. On Bob\'s sphere, the solid arrow is what he actually holds; the dashed ones are the other three possibilities, and the amber ring at the centre is all he can know until Alice\'s two bits arrive.'
      : 'Qubits 1 and 2 are Alice\'s; qubit 3 is Bob\'s. Solid arrows: each qubit on its own, from the reduced density matrix; a short arrow means that qubit is entangled with the others. Dashed grey: the message |ψ⟩, for comparison. Click any step in the circuit.';
    const mStr = m ? `${m[0]}${m[1]}` : '—';
    const fix = m ? (m[1] && m[0] ? 'X, then Z' : m[1] ? 'X' : m[0] ? 'Z' : 'nothing') : '—';
    const R = runs.get(runKey());
    stats([
      ['Step', `${step} of 6`, Q.STEPS[step].name],
      ['Alice measured', mStr, m ? `m₁ = ${m[0]}, m₂ = ${m[1]}; each result has chance ¼` : 'not yet'],
      ['Bob applies', step >= 5 ? fix : '—', step === 5 ? 'once the two bits arrive' : step === 6 ? 'done' : 'X if m₂ = 1, then Z if m₁ = 1'],
      ['Fidelity', pct(Q.fidelity(v)), R && R.n ? `measured ${pct(R.pass / R.n)} in ${R.n} runs` : `(1 + v)/2; ${pct(Q.CLASSICAL)} is the best without entanglement`],
    ]);
    const c = canonical(msg), psiTxt = ketHTML(c, ['|0⟩', '|1⟩']);
    const noisy = v < 1 ? ` With v = ${fixed(v, 2)} the pair is mixed with noise, so Bob's final arrow will have length ${fixed(v, 2)}.` : '';
    let txt;
    if (step === 0) txt = `<b>Start:</b> Alice's qubit 1 holds |ψ⟩ = ${psiTxt}. Qubits 2 and 3 start in |0⟩. Nobody needs to know α and β.`;
    else if (step === 1) txt = '<b>H on qubit 2</b> puts it in |+⟩ = (|0⟩ + |1⟩)/√2.';
    else if (step === 2) txt = `<b>CNOT 2→3</b> makes the Bell pair (|00⟩ + |11⟩)/√2 on qubits 2 and 3. Qubit 2 stays with Alice and qubit 3 goes to Bob. Each half alone is a fair coin, so both arrows shrink to the centre.${noisy}`;
    else if (step === 3) txt = '<b>CNOT 1→2</b> links the message to Alice\'s half of the pair. The message qubit\'s arrow loses its sideways part and keeps only its z component, cos θ: the phase information is now spread over all three qubits.';
    else if (step === 4) {
      const parts = Q.bobParts(msg), names = ['|ψ⟩ itself', 'flipped by X', 'flipped by Z', 'flipped by X and Z'];
      txt = `<b>H on qubit 1</b> splits the state into four groups, one per result Alice can get. In each, Bob's qubit is already |ψ⟩ up to a known flip:<br>` +
        parts.map((pp, i) => `<span class="ket__aside">${i >> 1}${i & 1}:</span> ${ketHTML(canonical(pp), ['|0⟩', '|1⟩'])} <span class="ket__aside">(${names[i]})</span>`).join('<br>');
    } else if (step === 5) txt = `<b>Alice measures</b> qubits 1 and 2 and gets ${mStr}. Bob's qubit is now |ψ⟩ ${m[0] || m[1] ? `flipped by ${m[1] ? 'X' : ''}${m[0] && m[1] ? ' and ' : ''}${m[0] ? 'Z' : ''}` : 'itself, by luck'}, but he cannot tell which of the four it is until her two bits arrive. Alice's qubits are now plain bits: the message is gone from her side.`;
    else txt = `<b>Bob corrects</b> with ${fix === 'nothing' ? 'nothing to do' : fix}, and his qubit is |ψ⟩${v < 1 ? `, as well as the noisy pair allows (fidelity ${pct(Q.fidelity(v))})` : ''}. The state moved from Alice to Bob; it was never copied, and it travelled no faster than the two bits.`;
    info(txt);
    // plot A: tallies from many runs
    $('pa-title').textContent = 'Alice\'s results and Bob\'s check';
    $('pa-cap').textContent = R && R.n ? `From ${R.n} runs with this message and pair. Bob measures along the direction of |ψ⟩; a pass means his qubit looked like |ψ⟩.` : 'Press "Teleport 1000 times". Bob measures along the direction of |ψ⟩; a pass means his qubit looked like |ψ⟩.';
    legend('pa-legend', []);
    const n = R ? R.n : 0;
    rows('rows-a', [
      ...[0, 1, 2, 3].map(i => ({ label: `Alice gets ${i >> 1}${i & 1}`, wide: true, frac: n ? R.m[i] / n : 0, pred: 0.25, color: css('--series-1'), val: n ? pct(R.m[i] / n) : '—' })),
      { label: 'Bob passes, after correcting', wide: true, frac: n ? R.pass / n : 0, pred: Q.fidelity(v), color: '#3d9a4f', val: n ? pct(R.pass / n) : '—' },
      { label: 'Bob passes, without the bits', wide: true, frac: n ? R.raw / n : 0, pred: 0.5, color: amber, val: n ? pct(R.raw / n) : '—' },
    ]);
    // plot B: fidelity against pair quality
    const xs = [], ys = [];
    for (let i = 0; i <= 50; i++) { xs.push(i / 50); ys.push(Q.fidelity(i / 50)); }
    const mx = [], my = [];
    runs.forEach((rr, key) => { const [th, ph, vv] = key.split('|').map(Number); if (th === S.theta && ph === S.phi && rr.n) { mx.push(vv); my.push(rr.pass / rr.n); } });
    plotB.opts.xLabel = 'Pair quality v'; plotB.opts.yLabel = 'Fidelity'; plotB.opts.xTicks = 5;
    plotB.setRange([0, 1], [0.4, 1.03]);
    plotB.draw([
      { type: 'vband', x0: 0, x1: 1 / 3, color: 'rgba(196, 122, 18, 0.07)' },
      { type: 'hline', y: Q.CLASSICAL, color: amber, width: 1.6, dash: [6, 4] },
      { type: 'hline', y: 0.5, color: ghost, width: 1.4, dash: [3, 4] },
      { type: 'line', x: xs, y: ys, color: brand, width: 2.4 },
      { type: 'vline', x: v, color: css('--plot-text'), width: 1.2, dash: [] },
      { type: 'dots', x: mx, y: my, color: '#3d9a4f', r: 5 },
    ]);
    $('pb-title').textContent = 'How good is the teleported qubit?';
    $('pb-cap').textContent = 'Line: (1 + v)/2 for any message. Above the dashed line, no strategy without entanglement can match it; the shaded band, v below 1/3, is where the pair is no longer entangled. Green dots: your runs.';
    legend('pb-legend', [[brand, '', 'teleportation'], [amber, 'swatch--dash', 'best without entanglement, 2/3'], [ghost, 'swatch--dot', 'guessing, 1/2'], ['#3d9a4f', 'swatch--stem', 'measured']]);
    note(step < 5 ? '<b>Step through it:</b> watch the arrows. Once the pair is made, qubits 2 and 3 sit at the centre: each is a fair coin on its own. At step 3 the message qubit\'s arrow shrinks as well, because part of its state is now shared with the others. Nobody, not even Alice, learns α or β at any point.'
      : v < 1 / 3 ? '<b>No entanglement, no teleportation:</b> below v = 1/3 the pair is not entangled, and the result is no better than measuring the message and phoning the answer.'
      : '<b>Two bits, one qubit:</b> a qubit\'s state needs two real numbers, θ and φ, to describe, yet Alice sent only two bits. The entangled pair, shared in advance, makes up the difference, and it is used up in the process.');
    $('step-out').textContent = `step ${step} of 6`;
    $('back').disabled = step === 0; $('next').disabled = step === 6;
    $('msg-hint').innerHTML = `|ψ⟩ = ${psiTxt}`;
    return 0;
  }

  // ---------- render ----------
  const plotB = new NanoPlot($('plot-b'), { margin: { l: 58, r: 22, t: 12, b: 42 } });
  function syncControls() {
    document.querySelectorAll('[data-bit]').forEach(b => { const v = (S.input >> (3 - +b.dataset.bit)) & 1; b.querySelector('b').textContent = v; b.setAttribute('aria-pressed', String(!!v)); b.setAttribute('aria-label', `Qubit ${b.dataset.bit} input: ${v}. Click to flip.`); });
    document.querySelectorAll('#target [data-wire]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.wire === S.target)));
    document.querySelectorAll('#control [data-wire]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.wire === S.control)));
    $('add-cnot').textContent = `CNOT ${S.control}→${S.target}`;
    $('add-cnot').disabled = S.control === S.target;
    $('add-tof').textContent = `Toffoli → ${S.target}`;
    $('add-fred').textContent = `Fredkin ${S.control}: swap ${Q.others(S.control).join(', ')}`;
    document.querySelectorAll('[data-add="X"],[data-add="H"],[data-add="Z"]').forEach(b => { b.setAttribute('aria-label', `${b.dataset.add} on qubit ${S.target}`); });
    $('gate-hint').textContent = `X, H and Z act on qubit ${S.target}. Toffoli: qubits ${Q.others(S.target).join(' and ')} control qubit ${S.target}. CNOT and Fredkin use the control.${S.control === S.target ? ' Pick a control different from the target for CNOT.' : ''}`;
    document.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset)));
    $('theta').value = S.theta; $('theta-out').textContent = `${S.theta}°`;
    $('phi').value = S.phi; $('phi-out').textContent = `${S.phi}°`;
    document.querySelectorAll('[data-msg]').forEach(b => { if (b.dataset.msg === 'random') return; const [t, p] = b.dataset.msg.split(',').map(Number); b.setAttribute('aria-pressed', String(t === S.theta && (p === S.phi || t === 0 || t === 180))); });
    $('purity').value = S.v; $('purity-out').textContent = fixed(S.v, 2);
  }
  function render() {
    syncControls();
    if (mode === 'gates') renderGates(); else renderTeleport();
    $('rows-b').hidden = mode !== 'gates'; $('pb-box').hidden = mode === 'gates';
    $('rows-a').classList.toggle('outcomes--wide', mode === 'teleport');
    $('lab-status').textContent = mode === 'gates' ? 'Shots are simulated with the browser\'s random number generator.' : 'Alice\'s result in the step view and the 1000 runs are drawn at random; every run differs.';
  }
  function applyMode() {
    document.querySelectorAll('.tab').forEach(b => { const on = b.dataset.mode === mode; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $('lab').setAttribute('aria-labelledby', 'tab-' + mode);
    document.querySelectorAll('.mode-intro').forEach(el => { el.hidden = el.dataset.for !== mode; });
    document.querySelectorAll('[data-modes]').forEach(el => { el.hidden = !el.dataset.modes.split(' ').includes(mode); });
    render();
  }

  // ---------- controls: tab 1 ----------
  const edited = () => { S.preset = null; };
  document.querySelectorAll('[data-bit]').forEach(b => b.addEventListener('click', () => { S.input ^= 1 << (3 - +b.dataset.bit); render(); }));
  document.querySelectorAll('#target [data-wire]').forEach(b => b.addEventListener('click', () => { S.target = +b.dataset.wire; render(); }));
  document.querySelectorAll('#control [data-wire]').forEach(b => b.addEventListener('click', () => { S.control = +b.dataset.wire; render(); }));
  document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.add;
    const g = k === 'CNOT' ? { kind: 'CNOT', c: S.control, t: S.target } : k === 'TOF' ? { kind: 'TOF', t: S.target } : k === 'FRED' ? { kind: 'FRED', c: S.control } : k === 'CCZ' ? { kind: 'CCZ' } : { kind: k, t: S.target };
    if (S.gates.length >= 14) return;
    S.gates = S.gates.slice(0, S.t).concat([g], S.gates.slice(S.t));   // insert after the gate being shown
    S.t += 1; edited(); render();
  }));
  $('undo').addEventListener('click', () => { if (!S.gates.length) return; S.gates = S.gates.slice(0, -1); S.t = Math.min(S.t, S.gates.length); edited(); render(); });
  $('clear').addEventListener('click', () => { S.gates = []; S.t = 0; edited(); render(); });
  document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
    const p = PRESETS[b.dataset.preset];
    S.input = p.input; S.gates = p.gates.map(g => Object.assign({}, g)); S.t = S.gates.length; S.preset = b.dataset.preset; render();
  }));
  document.querySelectorAll('[data-shots]').forEach(b => b.addEventListener('click', () => {
    const p = Q.probs(Q.run(S.input, S.gates, S.t)), key = shotKey(), c = shots.get(key) || new Array(8).fill(0);
    for (let i = 0; i < +b.dataset.shots; i++) c[Q.sample(p, Math.random)]++;
    shots.set(key, c); render();
  }));

  // ---------- controls: tab 2 ----------
  $('theta').addEventListener('input', e => { S.theta = +e.target.value; render(); });
  $('phi').addEventListener('input', e => { S.phi = +e.target.value; render(); });
  document.querySelectorAll('[data-msg]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.msg === 'random') { S.theta = 5 * Math.round(Math.acos(1 - 2 * Math.random()) / DEG / 5); S.phi = 5 * Math.floor(Math.random() * 72); }
    else [S.theta, S.phi] = b.dataset.msg.split(',').map(Number);
    render();
  }));
  $('purity').addEventListener('input', e => { S.v = +e.target.value; render(); });
  $('to-end').addEventListener('click', () => goTo(6));
  $('restart').addEventListener('click', () => goTo(0));
  $('runs').addEventListener('click', () => {
    const msg = msgNow(), key = runKey(), R = runs.get(key) || { n: 0, m: [0, 0, 0, 0], pass: 0, raw: 0 };
    for (let i = 0; i < 1000; i++) { const r = Q.teleportRun(msg, S.v, Math.random); R.n++; R.m[r.m]++; R.pass += r.pass; R.raw += r.passRaw; }
    runs.set(key, R); render();
  });

  // ---------- shared transport ----------
  $('back').addEventListener('click', () => { if (mode === 'gates') { S.t = Math.max(0, S.t - 1); render(); } else goTo(S.step - 1); });
  $('next').addEventListener('click', () => { if (mode === 'gates') { S.t = Math.min(S.gates.length, S.t + 1); render(); } else goTo(S.step + 1); });
  $('clear-counts').addEventListener('click', () => { if (mode === 'gates') shots.delete(shotKey()); else runs.clear(); render(); });

  const tabs = Array.from(document.querySelectorAll('.tab'));
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => { mode = b.dataset.mode; applyMode(); });
    b.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus(); next.click();
    });
  });

  // ---------- predict-first loaders ----------
  const load = name => { const p = PRESETS[name]; S.input = p.input; S.gates = p.gates.map(g => Object.assign({}, g)); S.preset = name; };
  const QUESTIONS = {
    q1: () => { mode = 'gates'; load('and'); S.t = 0; },
    q2: () => { mode = 'gates'; load('adder'); S.t = 0; },
    q3: () => { mode = 'gates'; load('undo'); S.t = 1; },
    q4: () => { mode = 'gates'; load('parallel'); S.t = 2; },
    q5: () => { mode = 'gates'; load('clone'); S.t = 1; },
    q6: () => { mode = 'teleport'; S.v = 1; S.step = 4; S.m = null; },
    q7: () => { mode = 'teleport'; S.v = 1; S.step = 4; S.m = null; },
    q8: () => { mode = 'teleport'; S.v = 0.5; S.step = 0; S.m = null; },
  };
  document.querySelectorAll('.predict__load[data-q]').forEach(b => b.addEventListener('click', () => {
    QUESTIONS[b.dataset.q]();
    applyMode();
    if (b.dataset.q === 'q7') goTo(5);
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelector('.lab-tabs').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }));

  applyMode();
})();
