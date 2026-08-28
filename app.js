/* ============================================================
   The Resourceful Human — Complete Library (flat static edition)
   No fetch, no build step. Works from file:// and from http://
   Depends on: search-index.js  (defines window.RH_SEARCH)
   ============================================================ */
(function () {
  'use strict';

  var LS = 'rh:';
  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem(LS + k); return v === null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {}
    }
  };

  /* ---------------------------------------------------------- theme */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    var btns = document.querySelectorAll('[data-act="theme"]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].innerHTML = t === 'dark' ? ICON.sun : ICON.moon;
      btns[i].setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
  }

  var ICON = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.5 1.5m11.2 11.2 1.5 1.5m0-14.2-1.5 1.5M6.4 17.6l-1.5 1.5"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 3.6 2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8Z"/></svg>'
  };

  /* ---------------------------------------------------------- init */
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    applyTheme(store.get('theme', 'light'));
    wireTheme();
    wireMoreMenu();
    wireSearch();
    wireProgress();
    wireSave();
    wireFilters();
    wireRail();
    wireReadProgress();
    paintProgressPage();
    paintHomeResume();
    markVisited();
  });

  /* Normalise text for search: lowercase, drop apostrophes so "cant" matches
     "can't", and turn every other punctuation mark into a space. */
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/[\u2019'`]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /* ------------------------------------------------------- nav More menu */

  function wireMoreMenu() {
    var d = document.querySelector('.navmore');
    if (!d) return;
    document.addEventListener('click', function (e) {
      if (d.open && !d.contains(e.target)) d.open = false;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && d.open) d.open = false;
    });
  }

  /* ---------------------------------------------------------- theme toggle */
  function wireTheme() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-act="theme"]');
      if (!b) return;
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      store.set('theme', next);
      applyTheme(next);
    });
  }

  /* ---------------------------------------------------------- search */
  var SEARCH_LIMIT = 40;

  function wireSearch() {
    var ovl = document.getElementById('search-overlay');
    if (!ovl) return;
    var input = ovl.querySelector('input');
    var res = ovl.querySelector('.ovl-res');
    var cur = -1, items = [];

    function open(seed) {
      ovl.classList.add('open');
      document.body.style.overflow = 'hidden';
      input.value = seed || '';
      run();
      setTimeout(function () { input.focus(); input.select(); }, 20);
    }
    function close() {
      ovl.classList.remove('open');
      document.body.style.overflow = '';
    }

    function run() {
      var q = input.value.trim().toLowerCase();
      var docs = (window.RH_SEARCH && window.RH_SEARCH.docs) || [];
      if (!q) {
        res.innerHTML = '<div class="ovl-empty">Type to search ' + docs.length +
          ' lessons, entries, tools and situations.</div>';
        items = []; cur = -1; return;
      }
      // Natural-language tolerant: strip punctuation, drop filler words, and
      // rank by how many query terms a document matches rather than demanding
      // that every single one appears. "boss shouting at me" then still finds
      // "Your boss is shouting at you in front of the team".
      var STOP = { a:1, an:1, the:1, i:1, im:1, me:1, my:1, is:1, are:1, was:1,
                   to:1, of:1, in:1, on:1, at:1, and:1, or:1, it:1, that:1,
                   for:1, with:1, be:1, been:1, do:1, does:1, did:1, you:1,
                   your:1, we:1, they:1, this:1, what:1, how:1, if:1, so:1 };
      var raw = norm(q).split(/\s+/).filter(Boolean);
      var terms = raw.filter(function (t) { return !STOP[t]; });
      if (!terms.length) terms = raw;

      var hits = [];
      for (var i = 0; i < docs.length; i++) {
        var d = docs[i];
        var hay = norm(d.ti + ' ' + (d.su || '') + ' ' + (d.k || '') + ' ' + (d.g || ''));
        var ti = norm(d.ti);
        var score = 0, matched = 0;
        for (var j = 0; j < terms.length; j++) {
          var t = terms[j], p = hay.indexOf(t), exact = true;
          if (p < 0) {
            // Stem tolerance: "suicidal" still finds "suicide",
            // "negotiating" finds "negotiation". Shave the tail to a 4-char root.
            var stem = t;
            while (p < 0 && stem.length > 4) {
              stem = stem.slice(0, -1);
              p = hay.indexOf(stem);
            }
            if (p < 0) continue;
            exact = false;
            t = stem;
          }
          matched++;
          score += exact ? 40 : 22;
          if (ti.indexOf(t) === 0) score += 90;
          else if (ti.indexOf(t) > -1) score += 55;
          if (p < 60) score += 12;
        }
        if (!matched) continue;
        // Reward completeness strongly so full-phrase matches lead.
        score += Math.round(120 * (matched / terms.length));
        if (matched === terms.length && terms.length > 1) score += 60;
        if (ti.indexOf(norm(q)) > -1) score += 130;
        // Someone typing a plain-language problem ("boss shouting", "cant pay
        // rent") almost always wants the situation playbook, not a lesson that
        // happens to share a word.
        if (d.x === 'Situation' && terms.length > 1) score += 34;
        score -= Math.min(20, d.ti.length / 8);
        hits.push([score, d]);
      }
      hits.sort(function (a, b) { return b[0] - a[0]; });
      hits = hits.slice(0, SEARCH_LIMIT);
      if (!hits.length) {
        res.innerHTML = '<div class="ovl-empty">Nothing matched &ldquo;' + escHtml(q) + '&rdquo;.</div>';
        items = []; cur = -1; return;
      }
      var html = '';
      for (var k = 0; k < hits.length; k++) {
        var h = hits[k][1];
        html += '<a href="' + h.u + '"><b>' + escHtml(h.ti) + '</b><span>' +
          escHtml([h.x || '', h.g || '', h.su || ''].filter(Boolean).join(' · ')) + '</span></a>';
      }
      res.innerHTML = html;
      items = res.querySelectorAll('a');
      cur = 0; paintCur();
    }

    function paintCur() {
      for (var i = 0; i < items.length; i++) items[i].classList.toggle('cur', i === cur);
      if (items[cur]) items[cur].scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('input', run);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) { cur = (cur + 1) % items.length; paintCur(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { cur = (cur - 1 + items.length) % items.length; paintCur(); } }
      else if (e.key === 'Enter') { if (items[cur]) { e.preventDefault(); window.location.href = items[cur].getAttribute('href'); } }
      else if (e.key === 'Escape') { close(); }
    });
    ovl.addEventListener('click', function (e) { if (e.target === ovl) close(); });

    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-act="search"]');
      if (t) { e.preventDefault(); open(''); }
    });
    var navInputs = document.querySelectorAll('.navsearch input');
    for (var n = 0; n < navInputs.length; n++) {
      navInputs[n].addEventListener('focus', function () { open(this.value); this.blur(); });
    }
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'k')) { e.preventDefault(); open(''); }
    });
  }

  /* ---------------------------------------------------------- progress ticks */
  function doneSet() { return store.get('done', {}); }

  function wireProgress() {
    var done = doneSet();
    var rows = document.querySelectorAll('.lrow[data-id]');
    for (var i = 0; i < rows.length; i++) {
      if (done[rows[i].getAttribute('data-id')]) rows[i].classList.add('done');
    }
    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('.tick');
      if (!t) return;
      e.preventDefault(); e.stopPropagation();
      var row = t.closest('.lrow');
      var id = row && row.getAttribute('data-id');
      if (!id) return;
      var d = doneSet();
      if (d[id]) { delete d[id]; row.classList.remove('done'); }
      else { d[id] = Date.now(); row.classList.add('done'); }
      store.set('done', d);
      paintTrackBars();
    });
    paintTrackBars();

    // reader "mark complete"
    var mc = document.querySelector('[data-act="complete"]');
    if (mc) {
      var lid = mc.getAttribute('data-id');
      var sync = function () {
        var on = !!doneSet()[lid];
        mc.classList.toggle('on', on);
        mc.innerHTML = (on ? ICON.check + ' Completed' : ICON.check + ' Mark complete');
      };
      sync();
      mc.addEventListener('click', function () {
        var d = doneSet();
        if (d[lid]) delete d[lid]; else d[lid] = Date.now();
        store.set('done', d); sync();
      });
    }
  }

  function paintTrackBars() {
    var d = doneSet();
    var bars = document.querySelectorAll('[data-bar-track]');
    for (var i = 0; i < bars.length; i++) {
      var el = bars[i];
      var ids = (el.getAttribute('data-ids') || '').split(',').filter(Boolean);
      var n = 0;
      for (var j = 0; j < ids.length; j++) if (d[ids[j]]) n++;
      var pct = ids.length ? Math.round(n / ids.length * 100) : 0;
      var fill = el.querySelector('i');
      if (fill) fill.style.width = pct + '%';
      var lab = el.parentNode.querySelector('.pct');
      if (lab) lab.textContent = pct + '%';
      var sub = el.parentNode.querySelector('.sub');
      if (sub) sub.textContent = n + ' of ' + ids.length + ' complete';
    }
  }

  /* ---------------------------------------------------------- bookmarks */
  function savedSet() { return store.get('saved', {}); }

  function wireSave() {
    var b = document.querySelector('[data-act="save"]');
    if (b) {
      var id = b.getAttribute('data-id');
      var title = b.getAttribute('data-title') || id;
      var url = b.getAttribute('data-url') || '';
      var sync = function () {
        var on = !!savedSet()[id];
        b.classList.toggle('on', on);
        b.innerHTML = ICON.star + (on ? ' Saved' : ' Save');
      };
      sync();
      b.addEventListener('click', function () {
        var s = savedSet();
        if (s[id]) delete s[id];
        else s[id] = { t: title, u: url, at: Date.now() };
        store.set('saved', s); sync();
      });
    }
    var box = document.getElementById('saved-list');
    if (box) {
      var s = savedSet();
      var keys = Object.keys(s).sort(function (a, b2) { return s[b2].at - s[a].at; });
      if (!keys.length) {
        box.innerHTML = '<div class="empty">Nothing saved yet. Open any lesson, entry or situation and press Save.</div>';
      } else {
        var h = '<div class="ggrid">';
        for (var i = 0; i < keys.length; i++) {
          h += '<a class="gcard" href="' + s[keys[i]].u + '"><div class="kicker">Saved</div><h3>' +
            escHtml(s[keys[i]].t) + '</h3></a>';
        }
        box.innerHTML = h + '</div>';
      }
    }
  }

  /* ---------------------------------------------------------- filters */
  function wireFilters() {
    var wraps = document.querySelectorAll('[data-filter-scope]');
    for (var w = 0; w < wraps.length; w++) (function (wrap) {
      var cards = wrap.querySelectorAll('[data-f]');
      var btns = wrap.querySelectorAll('.fbtn[data-fval]');
      var input = wrap.querySelector('[data-fsearch]');
      var count = wrap.querySelector('.fcount');
      var empty = wrap.querySelector('.empty-state');
      var active = 'all';

      function apply() {
        var q = input ? norm(input.value) : '';
        // Every non-filler word must appear somewhere in the card.
        var qt = q ? q.split(' ').filter(function (t) { return t.length > 1; }) : [];
        var shown = 0;
        for (var i = 0; i < cards.length; i++) {
          var c = cards[i];
          var okF = active === 'all' || (' ' + c.getAttribute('data-f') + ' ').indexOf(' ' + active + ' ') > -1;
          var okQ = true;
          if (qt.length) {
            var hay = norm(c.getAttribute('data-s') || c.textContent);
            for (var t = 0; t < qt.length; t++) {
              var term = qt[t];
              if (hay.indexOf(term) > -1) continue;
              var stem = term, found = false;
              while (!found && stem.length > 4) {
                stem = stem.slice(0, -1);
                found = hay.indexOf(stem) > -1;
              }
              if (!found) { okQ = false; break; }
            }
          }
          var on = okF && okQ;
          c.classList.toggle('hidden', !on);
          if (on) shown++;
        }
        if (count) count.textContent = shown + (shown === 1 ? ' result' : ' results');
        if (empty) empty.classList.toggle('hidden', shown > 0);
        // hide group wrappers with no visible children
        var groups = wrap.querySelectorAll('[data-fgroup]');
        for (var g = 0; g < groups.length; g++) {
          var vis = groups[g].querySelectorAll('[data-f]:not(.hidden)').length;
          groups[g].classList.toggle('hidden', vis === 0);
        }
      }
      for (var b = 0; b < btns.length; b++) {
        btns[b].addEventListener('click', function () {
          active = this.getAttribute('data-fval');
          for (var k = 0; k < btns.length; k++) btns[k].classList.toggle('on', btns[k] === this);
          apply();
        });
      }
      if (input) input.addEventListener('input', apply);
      apply();
    })(wraps[w]);
  }

  /* ---------------------------------------------------------- reader rail */
  function wireRail() {
    var links = document.querySelectorAll('.rail-list a[href^="#"]');
    if (!links.length || !('IntersectionObserver' in window)) return;
    var map = {};
    for (var i = 0; i < links.length; i++) {
      var id = links[i].getAttribute('href').slice(1);
      var el = document.getElementById(id);
      if (el) map[id] = links[i];
    }
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          for (var k in map) map[k].classList.remove('on');
          var l = map[entries[i].target.id];
          if (l) l.classList.add('on');
        }
      }
    }, { rootMargin: '-25% 0px -65% 0px' });
    for (var k in map) io.observe(document.getElementById(k));
  }

  /* ---------------------------------------------------------- read progress bar */
  function wireReadProgress() {
    var bar = document.querySelector('.readprog');
    if (!bar) return;
    var tick = function () {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
    };
    window.addEventListener('scroll', tick, { passive: true });
    tick();
  }

  /* ---------------------------------------------------------- progress page */
  function paintProgressPage() {
    var el = document.getElementById('progress-summary');
    if (!el) return;
    var d = doneSet();
    var total = parseInt(el.getAttribute('data-total') || '0', 10);
    var n = Object.keys(d).length;
    var pct = total ? Math.round(n / total * 100) : 0;
    el.querySelector('[data-slot="n"]').textContent = n;
    el.querySelector('[data-slot="pct"]').textContent = pct + '%';
    var fill = el.querySelector('.bar i');
    if (fill) fill.style.width = pct + '%';

    var recent = document.getElementById('recent-list');
    if (recent) {
      var lookup = {};
      var docs = (window.RH_SEARCH && window.RH_SEARCH.docs) || [];
      for (var i = 0; i < docs.length; i++) lookup[docs[i].id] = docs[i];
      var keys = Object.keys(d).sort(function (a, b) { return d[b] - d[a]; }).slice(0, 12);
      if (!keys.length) {
        recent.innerHTML = '<div class="empty">No lessons completed yet. Tick one off from any track page.</div>';
      } else {
        var h = '<div class="ggrid">';
        for (var j = 0; j < keys.length; j++) {
          var doc = lookup[keys[j]];
          if (!doc) continue;
          h += '<a class="gcard" href="' + doc.u + '"><div class="kicker">' +
            escHtml(doc.x || 'Completed') + '</div><h3>' + escHtml(doc.ti) + '</h3><p>' +
            new Date(d[keys[j]]).toLocaleDateString() + '</p></a>';
        }
        recent.innerHTML = h + '</div>';
      }
    }
  }

  /* ---------------------------------------------------------- resume card on home */
  function paintHomeResume() {
    var el = document.getElementById('resume-slot');
    if (!el) return;
    var last = store.get('last', null);
    if (!last || !last.u) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = '<a class="gcard" href="' + last.u + '"><div class="kicker">Continue where you left off</div>' +
      '<h3>' + escHtml(last.t) + '</h3><p>' + escHtml(last.x || '') + '</p></a>';
  }

  function markVisited() {
    var m = document.querySelector('[data-track-visit]');
    if (!m) return;
    store.set('last', {
      u: m.getAttribute('data-url'),
      t: m.getAttribute('data-title'),
      x: m.getAttribute('data-kind') || ''
    });
  }

  /* ---------------------------------------------------------- util */
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();
