// docs-search.js: the search box of getbrut.app/docs. First-party, no library,
// no third-party load (the site's privacy line depends on it). build-docs.mjs
// writes /docs/search-index.json (one record per page section: the page intro,
// every h2, every h3) and copies this file to /docs/search.js; every docs page
// loads it with `defer`. The index is fetched on the first focus of the box and
// ranked here, in the browser. Keys: "/" or Ctrl+K focus the box, arrows move,
// Enter opens, Esc closes. A result link carries ?q= so the landing page marks
// the matched words (Esc clears the marks).
(function (root) {
  'use strict';

  // Lowercase + strip accents CHARACTER BY CHARACTER, so an offset in the folded
  // copy is the same offset in the original text (the <mark>s rely on it).
  function fold(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var code = s.charCodeAt(i);
      if (code < 128) {
        out.push(code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : s[i]);
        continue;
      }
      var f = s[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      out.push(f.length === 1 ? f : s[i]);
    }
    return out.join('');
  }

  // Query → distinct folded terms. One-letter terms only count when they are
  // the whole query's only term (and then the UI asks for two characters).
  function termsOf(query) {
    var seen = {};
    var raw = fold(query).split(/\s+/).map(function (t) {
      return t.replace(/^["'“”‘’(]+|["'“”‘’),;:!?]+$/g, '');
    });
    var terms = raw.filter(function (t) {
      if (!t || seen[t]) return false;
      seen[t] = true;
      return true;
    });
    var long = terms.filter(function (t) { return t.length > 1; });
    return long.length ? long : terms;
  }

  var WORD = /[\p{L}\p{N}]/u;
  function wordStart(s, i) {
    return i === 0 || !WORD.test(s[i - 1]);
  }

  function countOf(s, term, cap) {
    var n = 0;
    var i = s.indexOf(term);
    while (i >= 0 && n < cap) {
      n++;
      i = s.indexOf(term, i + term.length);
    }
    return n;
  }

  // Every term must appear somewhere in the record (heading, page title or
  // text). Headings weigh most, then the page title, then how often the text
  // says it; word-start matches beat mid-word ones; the whole query as a
  // phrase adds a bonus. At most `perPage` sections of one page make the list,
  // so one long page never floods it.
  function search(records, query, limit, perPage) {
    var terms = termsOf(query);
    if (!terms.length) return [];
    var phrase = terms.length > 1 ? terms.join(' ') : '';
    var hits = [];
    for (var k = 0; k < records.length; k++) {
      var r = records[k];
      var score = 0;
      var titleHit = false;
      var ok = true;
      for (var j = 0; j < terms.length; j++) {
        var t = terms[j];
        var s = 0;
        var i = r.fh.indexOf(t);
        if (i >= 0) s += wordStart(r.fh, i) ? 14 : 7;
        i = r.fp.indexOf(t);
        if (i >= 0) {
          s += wordStart(r.fp, i) ? 9 : 4;
          titleHit = true;
        }
        i = r.ft.indexOf(t);
        if (i >= 0) s += 2 + countOf(r.ft, t, 6) + (wordStart(r.ft, i) ? 2 : 0);
        if (!s) {
          ok = false;
          break;
        }
        score += s;
      }
      if (!ok) continue;
      if (phrase) {
        if (r.fh.indexOf(phrase) >= 0 || r.fp.indexOf(phrase) >= 0) score += 12;
        else if (r.ft.indexOf(phrase) >= 0) score += 8;
      }
      // The page itself outranks its own sections when its title matched.
      if (!r.h && titleHit) score += 6;
      hits.push({ r: r, score: score, n: k });
    }
    hits.sort(function (a, b) {
      return b.score - a.score || a.n - b.n;
    });
    var byPage = {};
    var out = [];
    for (var h = 0; h < hits.length && out.length < limit; h++) {
      var u = hits[h].r.page;
      byPage[u] = (byPage[u] || 0) + 1;
      if (byPage[u] <= perPage) out.push(hits[h]);
    }
    return out;
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Ranges [start, end) of every term inside folded[a, b), merged.
  function rangesIn(folded, a, b, terms) {
    var ranges = [];
    for (var j = 0; j < terms.length; j++) {
      var t = terms[j];
      if (!t) continue;
      var i = folded.indexOf(t, a);
      while (i >= 0 && i + t.length <= b) {
        ranges.push([i, i + t.length]);
        i = folded.indexOf(t, i + t.length);
      }
    }
    ranges.sort(function (x, y) { return x[0] - y[0]; });
    var merged = [];
    for (var k = 0; k < ranges.length; k++) {
      var last = merged[merged.length - 1];
      if (last && ranges[k][0] <= last[1]) last[1] = Math.max(last[1], ranges[k][1]);
      else merged.push(ranges[k].slice());
    }
    return merged;
  }

  function markHtml(text, folded, a, b, terms) {
    var ranges = rangesIn(folded, a, b, terms);
    var out = '';
    var at = a;
    for (var k = 0; k < ranges.length; k++) {
      out += esc(text.slice(at, ranges[k][0])) + '<mark>' + esc(text.slice(ranges[k][0], ranges[k][1])) + '</mark>';
      at = ranges[k][1];
    }
    return out + esc(text.slice(at, b));
  }

  // A window of the section text around its first match, cut on word edges.
  function snippet(r, terms, max) {
    var t = r.t;
    if (!t) return '';
    var pos = -1;
    for (var j = 0; j < terms.length; j++) {
      var i = r.ft.indexOf(terms[j]);
      if (i >= 0 && (pos < 0 || i < pos)) pos = i;
    }
    var start = 0;
    if (pos > 60) {
      start = pos - 60;
      var sp = t.indexOf(' ', start);
      if (sp >= 0 && sp < pos) start = sp + 1;
    }
    var end = Math.min(t.length, start + max);
    if (end < t.length) {
      var sp2 = t.lastIndexOf(' ', end);
      if (sp2 > Math.max(start, pos)) end = sp2;
    }
    return (start > 0 ? '… ' : '') + markHtml(t, r.ft, start, end, terms) + (end < t.length ? ' …' : '');
  }

  // Index file → searchable records (folded copies computed once).
  function prepare(data) {
    return data.r.map(function (x) {
      var pg = data.pages[x[0]];
      return {
        page: pg.u,
        id: x[1],
        p: pg.p,
        g: pg.g,
        h: x[2],
        t: x[3],
        fp: fold(pg.p),
        fh: fold(x[2]),
        ft: fold(x[3]),
      };
    });
  }

  function hrefOf(r, query) {
    return r.page + '?q=' + encodeURIComponent(query.trim()) + (r.id ? '#' + r.id : '');
  }

  var core = { fold: fold, termsOf: termsOf, search: search, snippet: snippet, prepare: prepare, hrefOf: hrefOf, markHtml: markHtml };
  root.BrutDocsSearch = core;
  if (typeof document === 'undefined') return;

  var LIMIT = 15;
  var PER_PAGE = 3;
  var script = document.currentScript;
  var indexUrl = (script && script.getAttribute('data-index')) || '/docs/search-index.json';
  var input = document.getElementById('docs-q');
  var panel = document.getElementById('docs-results');
  if (!input || !panel) return;

  var records = null;
  var loading = null;
  var results = [];
  var active = -1;

  function load() {
    if (!loading) {
      loading = fetch(indexUrl)
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) {
          records = prepare(data);
        })
        .catch(function (err) {
          loading = null;
          throw err;
        });
    }
    return loading;
  }

  function openPanel() {
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function closePanel() {
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function message(text) {
    results = [];
    active = -1;
    panel.innerHTML = '<div class="sr-empty">' + text + '</div>';
    openPanel();
  }

  function paintActive() {
    var items = panel.querySelectorAll('.sr');
    for (var i = 0; i < items.length; i++) {
      var on = i === active;
      items[i].classList.toggle('active', on);
      items[i].setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) {
        input.setAttribute('aria-activedescendant', items[i].id);
        items[i].scrollIntoView({ block: 'nearest' });
      }
    }
  }

  function render() {
    var q = input.value;
    if (q.trim().length < 2) {
      if (q.trim()) message('Type at least two characters.');
      else closePanel();
      return;
    }
    if (!records) {
      message('Loading the index…');
      load().then(render, function () {
        message('The search index could not be loaded. Check your connection and try again.');
      });
      return;
    }
    var terms = termsOf(q);
    results = search(records, q, LIMIT, PER_PAGE);
    if (!results.length) {
      message('Nothing matches “' + esc(q.trim()) + '”. Try fewer or shorter words.');
      return;
    }
    panel.innerHTML =
      results
        .map(function (hit, i) {
          var r = hit.r;
          var title = r.h ? markHtml(r.h, r.fh, 0, r.h.length, terms) : markHtml(r.p, r.fp, 0, r.p.length, terms);
          var path = r.h ? esc(r.g) + ' › ' + esc(r.p) : esc(r.g);
          var snip = snippet(r, terms, 170);
          return (
            '<a class="sr" role="option" id="sr-' + i + '" href="' + esc(hrefOf(r, q)) + '">' +
            '<span class="sr-path">' + path + '</span>' +
            '<span class="sr-title">' + title + '</span>' +
            (snip ? '<span class="sr-snip">' + snip + '</span>' : '') +
            '</a>'
          );
        })
        .join('') +
      '<div class="sr-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>';
    active = 0;
    openPanel();
    paintActive();
  }

  input.addEventListener('input', render);
  input.addEventListener('focus', function () {
    load().catch(function () {});
    if (input.value.trim()) render();
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (panel.hidden) {
        render();
        return;
      }
      if (!results.length) return;
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      paintActive();
    } else if (e.key === 'Enter') {
      if (panel.hidden || active < 0 || !results[active]) return;
      e.preventDefault();
      location.href = hrefOf(results[active].r, input.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (!panel.hidden) closePanel();
      else {
        input.value = '';
        input.blur();
      }
    }
  });
  panel.addEventListener('mousemove', function (e) {
    var item = e.target.closest && e.target.closest('.sr');
    if (!item) return;
    var i = Number(item.id.slice(3));
    if (i !== active) {
      active = i;
      paintActive();
    }
  });
  document.addEventListener('mousedown', function (e) {
    if (!panel.hidden && !e.target.closest('.search')) closePanel();
  });

  // "/" and Ctrl/Cmd+K focus the box from anywhere on the page; Esc outside a
  // field clears the landing marks.
  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey) && !e.altKey) {
      e.preventDefault();
      input.focus();
      input.select();
    } else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      input.focus();
      input.select();
    } else if (e.key === 'Escape' && !typing) {
      clearMarks();
    }
  });

  // --- landing: mark the words the reader searched for --------------------
  var MAX_MARKS = 400;

  function markPage(container, terms) {
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var el = node.parentElement;
        if (!el || el.closest('script,style,.anchor,mark,.faq-controls')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    var total = 0;
    for (var n = 0; n < nodes.length && total < MAX_MARKS; n++) {
      var node = nodes[n];
      var text = node.data;
      var ranges = rangesIn(fold(text), 0, text.length, terms);
      if (!ranges.length) continue;
      var frag = document.createDocumentFragment();
      var at = 0;
      for (var k = 0; k < ranges.length && total < MAX_MARKS; k++) {
        if (ranges[k][0] > at) frag.appendChild(document.createTextNode(text.slice(at, ranges[k][0])));
        var m = document.createElement('mark');
        m.className = 'hit';
        m.textContent = text.slice(ranges[k][0], ranges[k][1]);
        frag.appendChild(m);
        at = ranges[k][1];
        total++;
      }
      if (at < text.length) frag.appendChild(document.createTextNode(text.slice(at)));
      node.parentNode.replaceChild(frag, node);
    }
  }

  function clearMarks() {
    var marks = document.querySelectorAll('mark.hit');
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      var parent = m.parentNode;
      parent.replaceChild(document.createTextNode(m.textContent), m);
      parent.normalize();
    }
  }

  var landed = new URLSearchParams(location.search).get('q');
  if (landed) {
    input.value = landed;
    var content = document.querySelector('.content');
    var terms = termsOf(landed).filter(function (t) { return t.length > 1; });
    if (content && terms.length) markPage(content, terms);
    if (location.hash) {
      var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) {
        var details = target.closest('details');
        if (details) details.open = true;
        target.scrollIntoView();
      }
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
