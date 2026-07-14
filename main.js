/* Brut landing — vanilla port of the design's interaction logic.
   Everything renders in its final state without JS; animations only
   hide/reveal when they are actually going to run. */
(function () {
  'use strict';

  var timers = [];
  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }

  // --- Scale the fixed-size hero canvas to its container ---
  var wrap = document.querySelector('[data-canvas-wrap]');
  var innerCanvas = document.querySelector('[data-canvas]');
  function scale() {
    if (!wrap || !innerCanvas) return;
    var s = Math.min(1, wrap.clientWidth / 680);
    innerCanvas.style.transform = 'scale(' + s + ')';
    wrap.style.height = 580 * s + 'px';
  }
  scale();
  window.addEventListener('resize', scale);

  // --- Nav bottom border on scroll ---
  var nav = document.querySelector('[data-nav]');
  window.addEventListener('scroll', function () {
    if (nav) nav.style.borderBottomColor = window.scrollY > 40 ? '#262421' : 'transparent';
  }, { passive: true });

  // --- Mobile burger menu ---
  var burger = document.querySelector('.nav-burger');
  var mobileMenu = document.getElementById('mobile-menu');
  if (burger && mobileMenu) {
    burger.addEventListener('click', function () {
      var open = mobileMenu.classList.toggle('open');
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    // Tapping any menu link closes the sheet.
    mobileMenu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        mobileMenu.classList.remove('open');
        burger.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // --- Provider chip flips ---
  document.querySelectorAll('[data-chip]').forEach(function (ch) {
    var front = ch.querySelector('[data-front]');
    var back = ch.querySelector('[data-back]');
    if (!front || !back) return;
    ch.addEventListener('mouseenter', function () { front.style.opacity = '0'; back.style.opacity = '1'; });
    ch.addEventListener('mouseleave', function () { front.style.opacity = '1'; back.style.opacity = '0'; });
  });

  // --- CTA: pulse the beta card on arrival ---
  document.querySelectorAll('[data-cta]').forEach(function (a) {
    a.addEventListener('click', function () {
      var card = document.querySelector('[data-beta-card]');
      if (!card) return;
      setTimeout(function () {
        card.style.boxShadow = '0 0 0 3px var(--accent)';
        setTimeout(function () { card.style.boxShadow = 'none'; }, 1500);
      }, 500);
    });
  });

  // --- Beta form: AJAX to FormSubmit, success state swap ---
  var form = document.getElementById('beta-form');
  var success = document.getElementById('beta-success');
  function showSuccess() {
    if (form) form.style.display = 'none';
    if (success) success.style.display = 'flex';
  }
  if (/[?&]applied=1/.test(location.search)) showSuccess(); // no-JS fallback returns here
  if (form) {
    var fallbackPost = false;
    form.addEventListener('submit', function (e) {
      if (fallbackPost) return; // let the native POST happen
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      var data = new FormData(form);
      fetch('https://formsubmit.co/ajax/1928ea550bd26afd427f7f1be5a94f50', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: data
      }).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      }).then(showSuccess).catch(function () {
        // graceful degradation: plain POST (FormSubmit page flow)
        fallbackPost = true;
        if (btn) { btn.disabled = false; btn.textContent = 'Apply for beta access'; }
        form.submit();
      });
    });
  }

  // --- Animations (skipped for reduced motion; page is complete without them) ---
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Scroll reveals
  var els = document.querySelectorAll('[data-reveal]');
  els.forEach(function (el) {
    el.style.opacity = '0';
    el.style.transform = 'translateY(14px)';
  });
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var el = en.target;
      var delay = parseInt(el.getAttribute('data-reveal-delay') || '0', 10);
      at(delay, function () {
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      });
      io.unobserve(el);
    });
  }, { threshold: 0.12 });
  els.forEach(function (el) { io.observe(el); });

  // Beta card drops in last with overshoot
  var beta = document.querySelector('[data-beta-drop]');
  if (beta) {
    beta.style.opacity = '0';
    beta.style.transform = 'translateY(-18px)';
    var io2 = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        at(420, function () {
          beta.style.transition = 'opacity 0.4s ease, transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)';
          beta.style.opacity = '1';
          beta.style.transform = 'translateY(0)';
        });
        io2.unobserve(beta);
      });
    }, { threshold: 0.3 });
    io2.observe(beta);
  }

  // --- Hero: the self-wiring graph ---
  (function heroTimeline() {
    var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-hnode]'))
      .sort(function (a, b) { return a.getAttribute('data-hnode') - b.getAttribute('data-hnode'); });
    var wires = Array.prototype.slice.call(document.querySelectorAll('[data-hwire]'))
      .sort(function (a, b) { return a.getAttribute('data-hwire') - b.getAttribute('data-hwire'); });
    var ledger = document.querySelector('[data-hledger]');
    if (!nodes.length || !wires.length || !ledger) return;

    var marks = document.querySelectorAll('[data-hnode] [data-mark]');
    var lines = Array.prototype.slice.call(document.querySelectorAll('[data-lline]'));

    nodes.forEach(function (n) {
      n.style.opacity = '0';
      n.style.transform = 'translateY(10px)';
      n.style.transition = 'opacity 0.45s ease, transform 0.45s ease';
    });
    wires.forEach(function (w) {
      var L = w.getTotalLength();
      w.style.strokeDasharray = String(L);
      w.style.strokeDashoffset = String(L);
      w.style.stroke = 'var(--accent)';
    });
    marks.forEach(function (m) {
      m.style.opacity = '0';
      m.style.transform = 'scale(0.6)';
      m.style.transition = 'opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
    });
    ledger.style.opacity = '0';
    ledger.style.transition = 'opacity 0.5s ease';
    var lineData = lines.map(function (line) {
      var label = line.querySelector('[data-t]');
      var amt = line.querySelector('[data-amt]');
      var text = label ? label.getAttribute('data-t') : '';
      if (label) label.textContent = '';
      if (amt) amt.style.opacity = '0';
      line.style.visibility = 'hidden';
      return { line: line, label: label, amt: amt, text: text };
    });

    var STEP = 680;
    function glowOf(n) { return n.querySelector('[data-glow]'); }

    nodes.forEach(function (n, i) {
      at(300 + i * STEP, function () {
        n.style.opacity = '1';
        n.style.transform = 'translateY(0)';
      });
    });
    wires.forEach(function (w, i) {
      at(300 + (i + 1) * STEP - 300, function () {
        w.style.transition = 'stroke-dashoffset 0.55s ease';
        w.style.strokeDashoffset = '0';
      });
      at(300 + (i + 1) * STEP + 700, function () {
        w.style.transition = 'stroke 0.8s ease';
        w.style.stroke = '#4a463f';
      });
    });

    function typeLine(d) {
      if (!d.line) return;
      d.line.style.visibility = 'visible';
      var i = 0;
      var iv = setInterval(function () {
        i += 1;
        if (d.label) d.label.textContent = d.text.slice(0, i);
        if (i >= d.text.length) {
          clearInterval(iv);
          if (d.amt) { d.amt.style.transition = 'opacity 0.3s ease'; d.amt.style.opacity = '1'; }
        }
      }, 20);
    }

    var tMS = 300 + 2 * STEP + 350;
    at(tMS, function () { var g = glowOf(nodes[2]); if (g) g.style.opacity = '1'; });
    at(tMS + 200, function () {
      marks.forEach(function (m, j) {
        at(j * 120, function () { m.style.opacity = '1'; m.style.transform = 'scale(1)'; });
      });
    });
    at(tMS + 1500, function () {
      var g = glowOf(nodes[2]); if (g) { g.style.transition = 'opacity 0.4s ease'; g.style.opacity = '0'; }
    });
    at(tMS + 900, function () { ledger.style.opacity = '1'; });
    at(tMS + 1100, function () { typeLine(lineData[0]); });

    var tV = 300 + 4 * STEP + 350;
    at(tV, function () { var g = glowOf(nodes[4]); if (g) g.style.opacity = '1'; });
    at(tV + 1400, function () {
      var g = glowOf(nodes[4]); if (g) { g.style.transition = 'opacity 0.4s ease'; g.style.opacity = '0'; }
    });
    at(tV + 600, function () { typeLine(lineData[1]); });

    var tEnd = 300 + 5 * STEP + 900;
    at(tEnd, function () { typeLine(lineData[2]); });

    // Idle loop: occasional wire pulse
    at(tEnd + 2500, function () {
      var k = 0;
      setInterval(function () {
        if (document.hidden) return;
        var w = wires[k % wires.length];
        k += 1;
        w.style.transition = 'stroke 0.4s ease';
        w.style.stroke = 'var(--accent)';
        setTimeout(function () { w.style.transition = 'stroke 1.2s ease'; w.style.stroke = '#4a463f'; }, 500);
      }, 6500);
    });
  })();

  // --- Receipt section: lines type on scroll-in ---
  (function receipt() {
    var receipt = document.querySelector('[data-receipt]');
    if (!receipt) return;
    var lines = Array.prototype.slice.call(receipt.querySelectorAll('[data-rline]'));
    var data = lines.map(function (line) {
      var label = line.querySelector('[data-t]');
      var amt = line.querySelector('[data-amt]');
      var text = label ? label.getAttribute('data-t') : '';
      if (label) label.textContent = '';
      if (amt) amt.style.opacity = '0';
      line.style.visibility = 'hidden';
      return { line: line, label: label, amt: amt, text: text };
    });
    function typeSeq(idx) {
      if (idx >= data.length) return;
      var d = data[idx];
      d.line.style.visibility = 'visible';
      var i = 0;
      var iv = setInterval(function () {
        i += 1;
        if (d.label) d.label.textContent = d.text.slice(0, i);
        if (i >= d.text.length) {
          clearInterval(iv);
          if (d.amt) { d.amt.style.transition = 'opacity 0.25s ease'; d.amt.style.opacity = '1'; }
          at(idx === data.length - 2 ? 500 : 120, function () { typeSeq(idx + 1); });
        }
      }, 16);
    }
    var ioR = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        typeSeq(0);
        ioR.unobserve(receipt);
      });
    }, { threshold: 0.45 });
    ioR.observe(receipt);
  })();

  // --- Call-path diagram: pulse + dissolving middleman ---
  (function callpath() {
    var zone = document.querySelector('[data-void]');
    var dot = document.querySelector('[data-pulse-dot]');
    var ghost = document.querySelector('[data-ghost]');
    if (!zone || !dot) return;
    function play() {
      dot.style.transition = 'none';
      dot.style.left = '0%';
      dot.style.opacity = '1';
      requestAnimationFrame(function () {
        dot.style.transition = 'left 1.4s ease-in-out';
        dot.style.left = 'calc(100% - 8px)';
      });
      at(1400, function () { dot.style.transition = 'opacity 0.3s ease'; dot.style.opacity = '0'; });
      if (ghost) {
        at(400, function () { ghost.style.transition = 'opacity 0.5s ease'; ghost.style.opacity = '0.7'; });
        at(1600, function () { ghost.style.transition = 'opacity 0.9s ease'; ghost.style.opacity = '0'; });
      }
    }
    var ioC = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        at(300, play);
        ioC.unobserve(zone);
      });
    }, { threshold: 0.5 });
    ioC.observe(zone);
  })();
})();
