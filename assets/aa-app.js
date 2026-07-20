/* AstroAura app shell — bottom tabs, search, wishlist, haptics, condensing header.
   Version marker so we can verify the live build in one line. */
(function () {
  'use strict';
  try { window.AA_APP_VERSION = 'app-v1'; } catch (e) {}

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function vibe(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) {} }
  function money(cents) { return 'Rs. ' + Math.round((cents || 0) / 100).toLocaleString('en-IN'); }

  /* ---------- Cart badge ----------
     Owned entirely by aa-cart.js (setBubble) — it's the single source of truth
     (optimistic on add + exact after loadCart). No separate fetch here, which
     was causing the laggy/inaccurate count. refreshCart kept as a no-op so any
     old references stay safe. */
  function refreshCart() {}

  /* ---------- Open cart drawer (the cart is ONLY ever this drawer) ---------- */
  function openCart() {
    var d = document.querySelector('cart-drawer');
    if (d && typeof d.open === 'function') { try { d.open(); document.body.classList.add('aa-overlay-open'); return; } catch (e) {} }
    if (d) { d.classList.add('active', 'animate'); d.setAttribute('open', ''); document.body.classList.add('aa-overlay-open'); }
    /* no /cart fallback — the standalone cart page is removed */
  }
  /* Any cart link/icon (header bubble, "view cart", etc.) opens the drawer instead of the /cart page */
  document.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('#cart-icon-bubble, a[href="/cart"], a[href$="/cart"], .header__icon--cart');
    if (!c) return;
    e.preventDefault(); e.stopPropagation();
    vibe(8); openCart();
  }, true);
  /* If we ever land on the cart page (or ?cart=open), open the drawer instead */
  if (/[?&]cart=open/.test(location.search)) { setTimeout(openCart, 350); }

  /* ---------- Tab bar ---------- */
  function markActiveTab() {
    var p = location.pathname;
    var active = { home: (p === '/' || p === ''), shop: /^\/collections/.test(p), account: /^\/account/.test(p) };
    $all('.aa-tab').forEach(function (t) {
      var k = t.getAttribute('data-tab');
      t.classList.toggle('is-active', !!active[k]);
    });
  }
  document.addEventListener('click', function (e) {
    var tab = e.target.closest && e.target.closest('.aa-tab');
    if (!tab) return;
    var k = tab.getAttribute('data-tab');
    if (k === 'cart') { e.preventDefault(); vibe(10); openCart(); }
    else if (k === 'search') { e.preventDefault(); vibe(8); openSearch(); }
    else if (k === 'wishlist') { e.preventDefault(); vibe(8); openWishlist(); }
    else if (k === 'aura') { e.preventDefault(); vibe(10); if (typeof window.AA_openQuiz === 'function') window.AA_openQuiz(); }
    else {
      vibe(6);
      /* move the highlight instantly on tap — don't wait for the page to load */
      $all('.aa-tab').forEach(function (t) { t.classList.remove('is-active'); });
      tab.classList.add('is-active');
    }
  });

  /* ---------- Search overlay ---------- */
  var searchEl, resultsEl, inputEl, headingEl, searchTimer, popular = null;
  function buildSearchRefs() {
    searchEl = $('#aa-search');
    if (!searchEl) return false;
    resultsEl = $('[data-aa-search-results]', searchEl);
    inputEl = $('.aa-search__input', searchEl);
    headingEl = $('[data-aa-search-heading]', searchEl);
    return true;
  }
  function pmoney(v) {
    if (v == null) return '';
    if (typeof v === 'string') { var f = parseFloat(v.replace(/[^0-9.]/g, '')); return isNaN(f) ? '' : 'Rs. ' + Math.round(f).toLocaleString('en-IN'); }
    return 'Rs. ' + Math.round(v / 100).toLocaleString('en-IN');
  }
  function sized(img, w) {
    if (!img) return '';
    if (img.indexOf('//') === 0) img = 'https:' + img;
    return img + (img.indexOf('?') >= 0 ? '&' : '?') + 'width=' + (w || 160);
  }
  function rowHTML(url, img, title, price) {
    var src = sized(img, 160);   /* row thumb is 52px; 160 covers retina, light */
    return '<a class="aa-sr" href="' + url + '">' +
      (src ? '<img class="aa-sr__img" src="' + src + '" alt="" loading="lazy" decoding="async">' : '<span class="aa-sr__img"></span>') +
      '<span class="aa-sr__body"><span class="aa-sr__title">' + title + '</span>' +
      (price ? '<span class="aa-sr__price">' + price + '</span>' : '') + '</span></a>';
  }
  function setHeading(t) { if (headingEl) { headingEl.textContent = t; headingEl.hidden = !t; } }
  function catOf(t) {
    t = (t || '').toLowerCase();
    if (t.indexOf('rudraksha') >= 0 || t.indexOf('mukhi') >= 0) return 'rudraksha';
    if (t.indexOf('bracelet') >= 0) return 'bracelet';
    if (t.indexOf('stone') >= 0 || t.indexOf('gem') >= 0) return 'gemstone';
    if (t.indexOf('mala') >= 0) return 'mala';
    if (t.indexOf('pendant') >= 0) return 'pendant';
    if (t.indexOf('anklet') >= 0) return 'anklet';
    if (t.indexOf('tree') >= 0) return 'tree';
    if (t.indexOf('combo') >= 0 || t.indexOf('trio') >= 0) return 'combo';
    if (t.indexOf('crystal') >= 0) return 'crystal';
    if (t.indexOf('pyramid') >= 0) return 'pyramid';
    return 'other';
  }
  /* popular = a tiny pre-built list of {u,i,t,pr}, cached in localStorage so the
     search panel shows products INSTANTLY (no fetch on open). */
  var POP_KEY = 'aa_pop_v1';
  function popGet() { try { var o = JSON.parse(localStorage.getItem(POP_KEY) || 'null'); if (o && o.t && (Date.now() - o.t) < 21600000 && o.p && o.p.length) return o.p; } catch (e) {} return null; }
  function popSet(p) { try { localStorage.setItem(POP_KEY, JSON.stringify({ t: Date.now(), p: p })); } catch (e) {} }
  function fetchPopular(cb) {
    fetch('/collections/all/products.json?limit=60', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var all = (d.products || []).filter(function (p) { return p.variants && p.variants[0] && p.variants[0].available !== false; });
        for (var i = all.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = all[i]; all[i] = all[j]; all[j] = t; }
        var per = {}, out = [];
        for (var k = 0; k < all.length && out.length < 10; k++) { var c = catOf(all[k].title); per[c] = per[c] || 0; if (per[c] < 2) { out.push(all[k]); per[c]++; } }
        for (var m = 0; m < all.length && out.length < 10; m++) { if (out.indexOf(all[m]) < 0) out.push(all[m]); }
        popular = out.map(function (p) {
          var v = p.variants[0];
          var img = (p.featured_image) || (p.images && p.images[0] && (p.images[0].src || p.images[0])) || '';
          if (img && img.indexOf('//') === 0) img = 'https:' + img;
          if (img) img = img + (img.indexOf('?') >= 0 ? '&' : '?') + 'width=140';
          return { u: (p.url || ('/products/' + p.handle)).split('?')[0], i: img, t: p.title, pr: pmoney(v.price) };
        });
        popSet(popular);
        if (cb) cb();
      }).catch(function () { if (cb) cb(); });
  }
  function loadPopular() {
    if (popular && popular.length) { showPopular(); return; }
    var c = popGet();
    if (c) { popular = c; showPopular(); return; }   /* instant from cache */
    fetchPopular(showPopular);
  }
  function showPopular() {
    if (!popular || !popular.length) { setHeading(''); return; }
    setHeading('Popular right now');
    resultsEl.innerHTML = popular.map(function (p) { return rowHTML(p.u, p.i, p.t, p.pr); }).join('');
  }
  /* warm the cache in the background so the very first open is instant too */
  function primePopular() { if (!popular) popular = popGet(); setTimeout(function () { fetchPopular(); }, 1400); }
  function openSearch() {
    if (!buildSearchRefs()) return;
    searchEl.hidden = false; searchEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('aa-overlay-open');
    requestAnimationFrame(function () { searchEl.classList.add('is-open'); if (inputEl) inputEl.focus(); });
    if (!inputEl.value) loadPopular();
  }
  function closeSearch() {
    if (!searchEl) return;
    searchEl.classList.remove('is-open');
    document.body.classList.remove('aa-overlay-open');
    setTimeout(function () { searchEl.hidden = true; searchEl.setAttribute('aria-hidden', 'true'); }, 180);
  }
  function esc(s) { return String(s).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }
  function rankSearch(q, products) {
    var ql = (q || '').toLowerCase().trim();
    if (!ql) return products;
    var esc2 = function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    var toks = ql.split(/\s+/).filter(Boolean);
    return products.map(function (p, i) {
      var t = (p.title || '').toLowerCase(), s = 0;
      if (t === ql) s += 1000;
      else if (t.indexOf(ql) === 0) s += 600;
      else if (new RegExp('\\b' + esc2(ql)).test(t)) s += 400;
      else if (t.indexOf(ql) > -1) s += 200;
      toks.forEach(function (w) { if (new RegExp('\\b' + esc2(w)).test(t)) s += 40; });
      return { p: p, s: s - i };
    }).sort(function (a, b) { return b.s - a.s; }).map(function (x) { return x.p; });
  }
  function renderSearch(products, q) {
    setHeading('Results');
    if (!products.length) { resultsEl.innerHTML = '<div class="aa-search__empty">No results for &ldquo;' + esc(q) + '&rdquo;</div>'; return; }
    products = rankSearch(q, products);
    var rows = products.map(function (p) {
      var img = (p.featured_image && p.featured_image.url) || p.image || '';
      if (img) img = img + (img.indexOf('?') >= 0 ? '&' : '?') + 'width=140';
      return rowHTML(p.url, img, p.title, pmoney(p.price));
    }).join('');
    /* the suggest API caps at 10 — send the user to the full results page for the rest */
    rows += '<a class="aa-search__all" href="/search?q=' + encodeURIComponent(q) + '&type=product&options[prefix]=last">View all results for &ldquo;' + esc(q) + '&rdquo; &rarr;</a>';
    resultsEl.innerHTML = rows;
  }
  function runSearch(q) {
    if (!q || q.trim().length < 2) { showPopular(); return; }
    fetch('/search/suggest.json?q=' + encodeURIComponent(q) + '&resources[type]=product&resources[limit]=10&resources[options][unavailable_products]=last&resources[options][fields]=title,product_type,variants.title,tag', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var ps = (d.resources && d.resources.results && d.resources.results.products) || [];
        renderSearch(ps, q);
      }).catch(function () {});
  }
  document.addEventListener('input', function (e) {
    if (!e.target.classList || !e.target.classList.contains('aa-search__input')) return;
    var q = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { runSearch(q); }, 160);
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-aa-search-close]')) { e.preventDefault(); closeSearch(); }
    /* header search icon -> our overlay */
    var hs = e.target.closest && e.target.closest('.header__icon--search, summary.header__icon--search, a[href$="/search"]');
    if (hs) { e.preventDefault(); e.stopPropagation(); vibe(8); openSearch(); }
  }, true);

  /* close the search overlay whenever a navigation starts (e.g. tapping a
     result or the View-all link) — the overlay is data-turbo-permanent so it
     would otherwise stay open over the next page */
  document.addEventListener('turbo:before-visit', function () { closeSearch(); });

  /* Re-render Judge.me review widgets after every Turbo SPA navigation / prerender
     activation. Judge.me's JS only initialises on the first DOMContentLoaded, so on
     SPA navigation the product review section rendered empty / disappeared. jdgm can
     also load AFTER turbo:load, so we retry until it's ready (up to ~4.5s). */
  function renderJudgeMe(tries) {
    tries = tries || 0;
    /* Skip review-less pages (homepage, collection, etc.): without this, every
       Turbo navigation polls every 150ms for ~4.5s and scans the DOM even where
       there are no Judge.me widgets — a real per-nav cost in the app webview. */
    if (!document.querySelector('[class*="jdgm"], [data-jdgm-id]')) return;
    if (!window.jdgm) { if (tries < 30) setTimeout(function () { renderJudgeMe(tries + 1); }, 150); return; }
    try {
      if (typeof jdgm.batchRenderBadges === 'function') jdgm.batchRenderBadges();
      if (typeof jdgm.customizeBadges === 'function') jdgm.customizeBadges();
      if (jdgm.SETTINGS && typeof jdgm.docReadyFn === 'function') jdgm.docReadyFn();
    } catch (e) {}
  }
  document.addEventListener('turbo:load', function () { renderJudgeMe(0); });
  document.addEventListener('turbo:render', function () { renderJudgeMe(0); });
  window.addEventListener('pageshow', function () { renderJudgeMe(0); });

  /* ---------- Wishlist ---------- */
  var WKEY = 'aa_wishlist_v1';
  function wishGet() { try { return JSON.parse(localStorage.getItem(WKEY) || '[]'); } catch (e) { return []; } }
  function wishSet(a) { try { localStorage.setItem(WKEY, JSON.stringify(a)); } catch (e) {} }
  function wishHas(h) { return wishGet().some(function (x) { return x.handle === h; }); }
  function setWishBadge() {
    var b = $('[data-aa-wish-badge]'); if (!b) return;
    var n = wishGet().length;
    if (n > 0) { b.textContent = n > 99 ? '99+' : n; b.hidden = false; } else { b.hidden = true; }
  }
  function handleFromUrl(u) { try { return (u.split('/products/')[1] || '').split('?')[0].split('#')[0]; } catch (e) { return ''; } }
  function cardInfo(card) {
    var link = card.querySelector('a[href*="/products/"]');
    var url = link ? link.getAttribute('href') : '';
    var t = card.querySelector('.aa-pcard__title, .nm');
    var pr = card.querySelector('.aa-pcard__price, .price');
    var im = card.querySelector('.aa-pcard__media img, .media img, img');
    var price = '';
    if (pr) { var c = pr.cloneNode(true); $all('s,del', c).forEach(function (n) { n.remove(); }); price = c.textContent.trim(); }
    return { handle: handleFromUrl(url), url: url.split('?')[0], title: t ? t.textContent.trim() : 'Product', price: price, img: im ? (im.getAttribute('src') || im.src) : '' };
  }
  function toggleWish(card, heart) {
    var info = cardInfo(card);
    if (!info.handle) return;
    var list = wishGet();
    var i = -1;
    for (var k = 0; k < list.length; k++) { if (list[k].handle === info.handle) { i = k; break; } }
    if (i >= 0) { list.splice(i, 1); heart.classList.remove('is-wished'); }
    else { list.unshift(info); heart.classList.add('is-wished'); vibe(12); }
    wishSet(list); setWishBadge();
  }
  function markHearts() {
    $all('.aa-pcard').forEach(function (card) {
      var heart = card.querySelector('.aa-pcard__heart');
      if (!heart) return;
      var link = card.querySelector('a[href*="/products/"]');
      var h = handleFromUrl(link ? link.getAttribute('href') : '');
      heart.classList.toggle('is-wished', !!h && wishHas(h));
    });
  }
  document.addEventListener('click', function (e) {
    var heart = e.target.closest && e.target.closest('.aa-pcard__heart');
    if (!heart) return;
    var card = heart.closest('.aa-pcard');
    if (!card) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    toggleWish(card, heart);
  }, true);

  var wishEl, wishResults;
  function openWishlist() {
    wishEl = $('#aa-wishlist'); if (!wishEl) return;
    wishResults = $('[data-aa-wish-results]', wishEl);
    var list = wishGet();
    if (!list.length) { wishResults.innerHTML = '<div class="aa-search__empty">No saved items yet. Tap the &hearts; on any product to save it.</div>'; }
    else {
      wishResults.innerHTML = list.map(function (p) {
        return '<div class="aa-sr" data-h="' + p.handle + '">' +
          '<a class="aa-sr" style="flex:1;padding:0" href="' + p.url + '">' +
            (p.img ? '<img class="aa-sr__img" src="' + p.img + '" alt="">' : '<span class="aa-sr__img"></span>') +
            '<span class="aa-sr__body"><span class="aa-sr__title">' + p.title + '</span><span class="aa-sr__price">' + p.price + '</span></span>' +
          '</a>' +
          '<button type="button" class="aa-sr__remove" data-aa-wish-remove="' + p.handle + '" aria-label="Remove">&times;</button>' +
        '</div>';
      }).join('');
    }
    wishEl.hidden = false; wishEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('aa-overlay-open');
    requestAnimationFrame(function () { wishEl.classList.add('is-open'); });
  }
  function closeWishlist() {
    if (!wishEl) return;
    wishEl.classList.remove('is-open'); document.body.classList.remove('aa-overlay-open');
    setTimeout(function () { wishEl.hidden = true; }, 180);
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-aa-wish-close]')) { e.preventDefault(); closeWishlist(); return; }
    var rm = e.target.closest && e.target.closest('[data-aa-wish-remove]');
    if (rm) {
      e.preventDefault();
      var h = rm.getAttribute('data-aa-wish-remove');
      wishSet(wishGet().filter(function (x) { return x.handle !== h; }));
      var row = rm.closest('[data-h]'); if (row) row.remove();
      setWishBadge(); markHearts();
      if (!wishGet().length && wishResults) wishResults.innerHTML = '<div class="aa-search__empty">No saved items yet.</div>';
    }
  });

  /* ---------- Close cart overlay flag when drawer closes ---------- */
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('#CartDrawer-Overlay, .drawer__close')) {
      document.body.classList.remove('aa-overlay-open');
    }
  }, true);

  /* ---------- Hide the tab bar while the hamburger menu drawer is open ---------- */
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    if (e.target.closest('summary.header__icon--menu, .header__icon--menu, .menu-drawer-container, #menu-drawer')) {
      setTimeout(function () {
        var det = document.querySelector('#Details-menu-drawer-container, details.menu-drawer-container');
        var open = !!(det && det.hasAttribute('open'));
        document.body.classList.toggle('aa-overlay-open', open);
        if (open) {
          var md = document.querySelector('#menu-drawer, .menu-drawer__inner-container, .aa-drawer__inner');
          if (md) md.scrollTop = 0;   /* always open at the top (Categories first) */
        }
      }, 40);
    }
  }, true);

  /* Collection filters: only one dropdown open at a time ('toggle' doesn't
     bubble, so listen in capture phase). */
  document.addEventListener('toggle', function (e) {
    var d = e.target;
    if (!d || !d.matches || !d.matches('details.facets__disclosure') || !d.open) return;
    document.querySelectorAll('details.facets__disclosure[open]').forEach(function (o) {
      if (o !== d) o.removeAttribute('open');
    });
  }, true);

  function initHeader() {
    var header = document.querySelector('.shopify-section-group-header-group') || document.querySelector('.section-header') || document.querySelector('.header-wrapper');
    if (header) header.classList.add('aa-sticky');
  }

  /* ---------- Haptics on add-to-cart ---------- */
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.aa-pcard__cta, .aa-rd-form button, .aa-rec__add, button[name="add"], .product-form__submit')) {
      vibe(14);
      setTimeout(refreshCart, 900);
    }
  });

  /* ---------- Image skeleton: mark media loaded ---------- */
  function initSkeleton() {
    $all('.aa-pcard__media, .aa-rec__img').forEach(function (el) {
      var img = el.tagName === 'IMG' ? el : el.querySelector('img');
      if (!img) { el.classList.add('is-loaded'); return; }
      if (img.complete && img.naturalWidth) el.classList.add('is-loaded');
      else img.addEventListener('load', function () { el.classList.add('is-loaded'); }, { once: true });
    });
  }

  /* ---------- Init ---------- */
  var primed = false;
  function init() {
    markActiveTab();
    setWishBadge();
    markHearts();
    refreshCart();
    initHeader();
    initSkeleton();
    if (!primed) { primed = true; primePopular(); }   /* warm the search list once */
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('turbo:load', init);   /* re-init after every SPA navigation */

  /* ---- navigation loading bar (attached under the header) ---- */
  (function () {
    function bar() { return document.querySelector('[data-loadbar]'); }
    var lbShownAt = 0;
    function headerBottom() {
      var h = document.querySelector('.shopify-section-group-header-group') || document.querySelector('.section-header') || document.querySelector('header.header') || document.querySelector('header');
      return h ? Math.max(0, Math.round(h.getBoundingClientRect().bottom)) : 0;
    }
    function lbShow() {
      var e = bar(); if (!e || e.classList.contains('is-on')) return;   /* CSS pins it at top:0, over the offer bar */
      lbShownAt = Date.now();
      e.style.transition = 'none'; e.style.width = '0%'; e.classList.add('is-on');
      void e.offsetWidth;            /* reflow so the next width animates */
      e.style.transition = '';
      e.style.width = '90%';
    }
    function lbStart() {
      /* show on EVERY navigation immediately (no delay) so the bar is always visible */
      lbShow();
    }
    function lbFinish() {
      var e = bar(); if (!e || !e.classList.contains('is-on')) return;
      e.style.width = '100%';
      setTimeout(function () { e.classList.remove('is-on'); setTimeout(function () { e.style.transition = 'none'; e.style.width = '0%'; }, 240); }, 150);
    }
    function lbDone() {
      if (!bar() || !bar().classList.contains('is-on')) return;   /* never shown → nothing to finish */
      var wait = 480 - (Date.now() - lbShownAt);   /* keep it on screen long enough to be seen, even on instant navs */
      if (wait > 0) setTimeout(lbFinish, wait); else lbFinish();
    }
    /* start as early as the tap/visit; finish on load. lbShow() + window load also
       fire the bar on the FIRST page load and on full-reload landings, so it shows
       on every load, not only Turbo SPA navigations. */
    document.addEventListener('turbo:click', lbStart);
    document.addEventListener('turbo:before-visit', lbStart);
    document.addEventListener('turbo:visit', lbStart);
    document.addEventListener('turbo:load', lbDone);
    document.addEventListener('turbo:fetch-request-error', lbDone);
    lbShow();
    window.addEventListener('load', lbDone);
  })();
  window.addEventListener('pageshow', function () { refreshCart(); setWishBadge(); markHearts(); });
  ['cart:updated', 'cart:added', 'cart:refresh'].forEach(function (ev) { document.addEventListener(ev, refreshCart); });
  if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined' && PUB_SUB_EVENTS.cartUpdate) {
    subscribe(PUB_SUB_EVENTS.cartUpdate, refreshCart);
  }
})();
