/* Homepage labs: show the tracks as tiles, and one track's labs at a time.
   The tiles and the track bar are built from the track list itself, so a new
   lab or track needs no changes here. Each track has its own address
   (index.html#quantum-foundations), so the back button and shared links work;
   #all-labs shows every track at once. Without JavaScript the full list shows. */
(function () {
  'use strict';
  const list = document.querySelector('.tracks'), tiles = document.getElementById('track-tiles'), bar = document.getElementById('track-nav');
  if (!list || !tiles || !bar) return;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slug = s => s.toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const ALL = 'all-labs';

  const tracks = Array.from(list.children).filter(li => li.classList.contains('track')).map(li => {
    const title = li.querySelector('.track__title'), labs = Array.from(li.querySelectorAll('.lab-card__title'));
    return {
      li, key: li.dataset.track, title: title.textContent.trim(), heading: title,
      num: (li.querySelector('.track__num') || {}).textContent || '',
      desc: (li.querySelector('.track__desc') || {}).textContent || '',
      slug: slug(title.textContent), art: li.querySelector('.lab-card__art svg'),
      labs: labs.map(a => a.textContent.split(':')[0].trim()),
    };
  });
  const total = tracks.reduce((s, t) => s + t.labs.length, 0);

  // ---------- the tiles ----------
  tracks.forEach(t => {
    const tile = el('article', 'track-tile'); tile.dataset.track = t.key;
    if (t.art) { const art = el('div', 'track-tile__art'); art.setAttribute('aria-hidden', 'true'); art.appendChild(t.art.cloneNode(true)); tile.appendChild(art); }
    const body = el('div', 'track-tile__body');
    const head = el('div', 'track-tile__head');
    head.appendChild(el('span', 'track-tile__num', t.num.trim()));
    const h = el('h3', 'track-tile__title'), a = el('a', 'track-tile__link', t.title);
    a.href = '#' + t.slug; h.appendChild(a); head.appendChild(h); body.appendChild(head);
    body.appendChild(el('p', 'track-tile__desc', t.desc));
    const ul = el('ul', 'track-tile__labs'); t.labs.forEach(n => ul.appendChild(el('li', '', n))); body.appendChild(ul);
    const go = el('span', 'track-tile__go', `${t.labs.length} lab${t.labs.length === 1 ? '' : 's'} `); go.setAttribute('aria-hidden', 'true');
    go.appendChild(el('span', 'track-tile__arrow', '→')); body.appendChild(go);
    tile.appendChild(body); tiles.appendChild(tile);
  });
  const allLink = el('p', 'track-tiles__all'), al = el('a', '', `Or see all ${total} labs on one page`); al.href = '#' + ALL; allLink.appendChild(al);
  tiles.after(allLink);

  // ---------- the track bar: back to the tiles, every track, and all labs ----------
  const back = el('a', 'track-nav__back', '← All tracks'); back.href = '#labs'; bar.appendChild(back);
  const chips = tracks.map(t => { const c = el('a', 'track-nav__chip', t.title); c.href = '#' + t.slug; c.dataset.track = t.key; bar.appendChild(c); return c; });
  const allChip = el('a', 'track-nav__chip track-nav__chip--all', `All ${total} labs`); allChip.href = '#' + ALL; bar.appendChild(allChip);

  // ---------- switching ----------
  let ready = false;
  function show(hash, scroll) {
    const s = decodeURIComponent((hash || '').replace(/^#/, '')), t = tracks.find(x => x.slug === s), all = s === ALL;
    // another part of the page (#about, #how...): leave the labs as they are, or start on the tiles
    if (!t && !all && s && s !== 'labs' && document.getElementById(s)) { if (ready) return; scroll = false; }
    ready = true;
    const one = !!t || all;
    tiles.hidden = one; allLink.hidden = one; bar.hidden = !one;
    list.hidden = !one; list.classList.toggle('tracks--one', !!t);
    tracks.forEach(x => { x.li.hidden = !(all || x === t); });
    chips.forEach((c, i) => { if (tracks[i] === t) c.setAttribute('aria-current', 'page'); else c.removeAttribute('aria-current'); });
    if (all) allChip.setAttribute('aria-current', 'page'); else allChip.removeAttribute('aria-current');
    if (one && scroll) {
      bar.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      const focusOn = t ? t.heading : bar;
      focusOn.setAttribute('tabindex', '-1'); focusOn.focus({ preventScroll: true });
    }
    if (!one && scroll && s === 'labs') document.getElementById('labs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }
  window.addEventListener('hashchange', () => show(location.hash, true));
  show(location.hash, location.hash.length > 1);
})();
