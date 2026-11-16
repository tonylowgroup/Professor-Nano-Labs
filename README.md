# Professor Nano Labs

Interactive companion labs for the Professor Nano YouTube channel. The site is
plain HTML, CSS and JavaScript with no build step, so it can be served directly
by GitHub Pages.

## Layout

```
index.html            Homepage
assets/css/site.css   Shared styles: top bar, footer, buttons, colour tokens
assets/js/hero.js     Homepage wave-packet animation
assets/img/           Favicon and images
labs/<name>/          One folder per lab (added as each lab is finished)
```

## Preview locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.
