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
| Quantum foundations | Blackbody Radiation | `labs/blackbody-radiation/` |
| Quantum foundations | Gaussian Wave Packet | `labs/gaussian-wave-packet/` |
| Quantum computing | Qubits on the Bloch Sphere | `labs/qubits-bloch-sphere/` |
| Quantum computing | Trapped-Ion Qubit | `labs/trapped-ion-qubit/` |
| Crystals & energy bands | 14 Bravais Lattices in 3D | `labs/bravais-lattices/` |
| Crystals & energy bands | From Atoms to a Band | `labs/atoms-to-a-band/` |
| Nanoscale transport | Graphene Ballistic Transport | `labs/graphene-ballistic-transport/` |

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
