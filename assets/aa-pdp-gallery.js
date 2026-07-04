/* AA PDP revamp gallery behaviour.
   Idempotent + Turbo-safe: all interaction is delegated on document (survives
   Turbo SPA navigation); init() only re-syncs state and binds the variant
   listener once per gallery element. No MutationObservers. Namespaced. */
(function () {
  'use strict';

  var WISH_KEY = 'aa_wishlist';

  function gallery() { return document.querySelector('[data-aa-gallery]'); }
  function slides(g) { return Array.prototype.slice.call(g.querySelectorAll('[data-aa-slide]')); }
  function thumbs(g) { return Array.prototype.slice.call(g.querySelectorAll('[data-aa-thumb]')); }
  function currentIndex(g) { return parseInt(g.getAttribute('data-aa-index') || '0', 10) || 0; }

  function activate(g, index, playVideo) {
    var ss = slides(g);
    if (!ss.length) return;
    if (index < 0) index = ss.length - 1;
    if (index >= ss.length) index = 0;

    ss.forEach(function (s, i) {
      var on = i === index;
      s.classList.toggle('is-active', on);
      if (!on) {
        var v = s.querySelector('video');
        if (v && typeof v.pause === 'function') { try { v.pause(); } catch (e) {} }
      }
    });

    var ts = thumbs(g);
    ts.forEach(function (t, i) { t.classList.toggle('is-active', i === index); });

    var ds = Array.prototype.slice.call(g.querySelectorAll('[data-aa-dot]'));
    ds.forEach(function (d, i) { d.classList.toggle('is-active', i === index); });

    // Center the active thumb WITHIN the thumb strip only — never call
    // scrollIntoView (its block:'nearest' scrolls the whole page vertically).
    var activeThumb = ts[index];
    if (activeThumb) {
      var strip = activeThumb.parentNode;
      if (strip && strip.scrollWidth > strip.clientWidth) {
        var target = activeThumb.offsetLeft - (strip.clientWidth - activeThumb.offsetWidth) / 2;
        strip.scrollTo({ left: target, behavior: 'smooth' });
      }
      // desktop vertical rail: slide the strip so the active thumb stays in view
      if (strip && strip.scrollHeight > strip.clientHeight + 2) {
        var vTarget = activeThumb.offsetTop - (strip.clientHeight - activeThumb.offsetHeight) / 2;
        strip.scrollTo({ top: vTarget, behavior: 'smooth' });
      }
    }

    // mobile scroll-snap stage: bring the active slide into the horizontal view
    var main = g.querySelector('[data-aa-main]');
    if (main && main.scrollWidth > main.clientWidth + 2 && ss[index]) {
      main.scrollTo({ left: ss[index].offsetLeft, behavior: 'smooth' });
    }

    if (playVideo) {
      var vid = ss[index] && ss[index].querySelector('video');
      if (vid && typeof vid.play === 'function') { try { vid.play(); } catch (e) {} }
    }

    g.setAttribute('data-aa-index', String(index));
  }

  function getWish() {
    try { return JSON.parse(localStorage.getItem(WISH_KEY) || '[]'); } catch (e) { return []; }
  }
  function setWish(arr) {
    try { localStorage.setItem(WISH_KEY, JSON.stringify(arr)); } catch (e) {}
  }
  function syncWish(g) {
    if (!g) return;
    var btn = g.querySelector('[data-aa-wish]');
    if (!btn) return;
    var id = btn.getAttribute('data-product-id');
    var on = getWish().indexOf(id) > -1;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var thumb = t.closest('[data-aa-thumb]');
    if (thumb) {
      var gt = thumb.closest('[data-aa-gallery]');
      var idx = parseInt(thumb.getAttribute('data-index'), 10) || 0;
      var slide = gt.querySelectorAll('[data-aa-slide]')[idx];
      var isVideo = slide && slide.getAttribute('data-type') !== 'image' && slide.getAttribute('data-type') !== 'model';
      activate(gt, idx, isVideo);
      return;
    }

    var dot = t.closest('[data-aa-dot]');
    if (dot) {
      var gd = dot.closest('[data-aa-gallery]');
      activate(gd, parseInt(dot.getAttribute('data-index'), 10) || 0, false);
      return;
    }

    var prev = t.closest('[data-aa-prev]');
    if (prev) { var gp = prev.closest('[data-aa-gallery]'); activate(gp, currentIndex(gp) - 1, false); return; }

    var next = t.closest('[data-aa-next]');
    if (next) { var gn = next.closest('[data-aa-gallery]'); activate(gn, currentIndex(gn) + 1, false); return; }

    var wish = t.closest('[data-aa-wish]');
    if (wish) {
      e.preventDefault();
      var pid = wish.getAttribute('data-product-id');
      var arr = getWish();
      var pos = arr.indexOf(pid);
      if (pos > -1) arr.splice(pos, 1); else arr.push(pid);
      setWish(arr);
      syncWish(wish.closest('[data-aa-gallery]'));
      return;
    }

    var share = t.closest('[data-aa-share]');
    if (share) {
      e.preventDefault();
      var url = window.location.href.split('?')[0];
      var title = document.title;
      if (navigator.share) {
        navigator.share({ title: title, url: url }).catch(function () {});
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          share.classList.add('aa-copied');
          setTimeout(function () { share.classList.remove('aa-copied'); }, 1500);
        }).catch(function () {});
      }
      return;
    }

    var chart = t.closest('[data-aa-sizechart]');
    if (chart) {
      e.preventDefault();
      var href = chart.getAttribute('data-href');
      if (href) window.open(href, '_blank', 'noopener');
      return;
    }
  });

  function bindVariantSync(g) {
    if (!g || g.getAttribute('data-aa-vbound') === '1') return;
    var mapEl = g.querySelector('[data-aa-variant-media]');
    var map = {};
    if (mapEl) { try { map = JSON.parse(mapEl.textContent); } catch (e) { map = {}; } }

    var form = document.querySelector('product-form form[action*="/cart/add"], form[action*="/cart/add"]');
    var input = form && form.querySelector('input[name="id"]');
    if (!input) return;

    input.addEventListener('change', function () {
      var mediaId = map[input.value];
      if (!mediaId) return;
      var ss = g.querySelectorAll('[data-aa-slide]');
      for (var i = 0; i < ss.length; i++) {
        if (ss[i].getAttribute('data-media-id') === String(mediaId)) { activate(g, i, false); break; }
      }
    });

    g.setAttribute('data-aa-vbound', '1');
  }

  function bindScrollSync(g) {
    var main = g.querySelector('[data-aa-main]');
    if (!main || main.__aaScrollBound) return;
    main.__aaScrollBound = true;
    var t;
    main.addEventListener('scroll', function () {
      if (main.scrollWidth <= main.clientWidth + 2) return; // not a swipe slider (desktop)
      clearTimeout(t);
      t = setTimeout(function () {
        var ss = slides(g), sl = main.scrollLeft, idx = 0, best = Infinity;
        for (var _i = 0; _i < ss.length; _i++) { var _d = Math.abs(ss[_i].offsetLeft - sl); if (_d < best) { best = _d; idx = _i; } }
        var ts = thumbs(g);
        ts.forEach(function (th, i) { th.classList.toggle('is-active', i === idx); });
        var ds = Array.prototype.slice.call(g.querySelectorAll('[data-aa-dot]'));
        ds.forEach(function (d, i) { d.classList.toggle('is-active', i === idx); });
        g.setAttribute('data-aa-index', String(idx));
      }, 90);
    }, { passive: true });
  }

  function init() {
    var g = gallery();
    if (!g) return;
    if (!g.getAttribute('data-aa-index')) g.setAttribute('data-aa-index', '0');
    syncWish(g);
    bindVariantSync(g);
    bindScrollSync(g);
  }

  document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('turbo:load', init);
  window.addEventListener('pageshow', init);
})();
