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
assets/img/           Favicon and images
labs/<name>/          One folder per lab: index.html, physics.js, lab.js
```

## Preview locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.
