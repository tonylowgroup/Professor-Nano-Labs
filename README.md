# Professor Nano Labs

Interactive companion labs for the Professor Nano YouTube channel. The site is
plain HTML, CSS and JavaScript with no build step, so it can be served directly
by GitHub Pages.

## Layout

```
index.html            Homepage
assets/css/site.css   Shared styles: top bar, footer, buttons, cards, colour tokens
assets/css/lab.css    Shared lab components: controls, stat tiles, plots, questions
assets/js/hero.js     Homepage wave-packet animation
assets/js/plot.js     Small canvas plotting helper used by the labs
assets/js/bloch-sphere.js
                      Bloch-sphere drawing shared by the quantum computing labs
assets/img/           Favicon and images
labs/<name>/          One folder per lab: index.html, physics.js, lab.js
```

## Labs

| Track | Lab | Folder |
|---|---|---|
| Quantum foundations | Gaussian Wave Packet | `labs/gaussian-wave-packet/` |
| Quantum foundations | Quantum Harmonic Oscillator: Ladders and Coherent States | `labs/harmonic-oscillator/` |
| Quantum foundations | Blackbody Radiation | `labs/blackbody-radiation/` |
| Quantum computing | Qubits on the Bloch Sphere | `labs/qubits-bloch-sphere/` |
| Quantum computing | Entanglement: Correlations No Coin Can Fake | `labs/entanglement-bell-test/` |
| Quantum computing | Three Qubits: Toffoli Gates and Teleportation | `labs/three-qubits-teleportation/` |
| Quantum computing | Trapped Ions and Phonon Sidebands | `labs/trapped-ion-qubit/` |
| Crystals & energy bands | 14 Bravais Lattices in 3D | `labs/bravais-lattices/` |
| Crystals & energy bands | From Atoms to a Band | `labs/atoms-to-a-band/` |
| Nanoscale transport | Graphene Ballistic Transport | `labs/graphene-ballistic-transport/` |
| Nanoscale transport | Physics of the Nanoscale Transistor | `labs/nanoscale-transistor/` |

Each lab folder holds its page, its JavaScript and its companion Jupyter
notebook (saved without outputs).

## Track colours

Each track has its own accent colour, set in `assets/css/site.css`:
quantum foundations (violet), quantum computing (berry), crystals and
energy bands (emerald) and nanoscale transport (copper). A lab page picks its colour with
`<html data-track="quantum">` (or `computing`, `crystals`, `transport`); on the homepage
each track row carries the same attribute. Everything inside follows the
`--brand` tokens, so new labs need no extra colour work.

## Preview locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.
