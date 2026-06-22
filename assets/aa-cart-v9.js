/* AA Cart — minimal, bulletproof AJAX add-to-cart + qty controls */

/* AA Layout — JS guarantee: force 2-col grid on collection/search pages
   (CSS-only override sometimes loses to Dawn's slider classes). */
(function () {
  function isGridPage() {
    var b = document.body;
    // Strict: only single-collection product grid OR search results.
    // NEVER list-collections (the /collections index) — that broke its tiles.
    return b && (
      b.classList.contains('template-collection') ||
      b.classList.contains('template-search')
    );
  }
  function nuke() {
    if (!isGridPage()) return;
    var w = window.innerWidth;
    var isMobile = w < 750;
    document.querySelectorAll('ul.product-grid, ul#product-grid').forEach(function (g) {
      // Strip slider classes that turn it into a horizontal carousel
      ['slider', 'slider--tablet', 'slider--desktop', 'grid--peek'].forEach(function (c) {
        g.classList.remove(c);
      });
      // Strip Dawn's grid--N-col-* classes which set fixed column widths via flex
      Array.from(g.classList).forEach(function (c) {
        if (/^grid--\d+-col-/.test(c)) g.classList.remove(c);
      });
      // Force grid via inline style — beats any external CSS.
      // NOTE: gap + padding are NOT set here so the section's inline <style>
      // block (in main-search.liquid / main-collection-product-grid.liquid)
      // controls horizontal spacing. Inline JS styles with !important
      // were beating stylesheet !important and overriding spacing.
      g.style.setProperty('display', 'grid', 'important');
      g.style.setProperty('grid-template-columns',
        isMobile
          ? 'repeat(2, minmax(0, 1fr))'
          : 'repeat(auto-fill, minmax(230px, 1fr))',
        'important');
      g.style.setProperty('overflow-x', 'visible', 'important');
      g.style.setProperty('scroll-snap-type', 'none', 'important');
      g.style.setProperty('transform', 'none', 'important');
      g.style.setProperty('flex-direction', 'row', 'important');
      g.style.setProperty('flex-wrap', 'wrap', 'important');
      g.style.setProperty('width', '100%', 'important');
      g.style.setProperty('max-width', '100%', 'important');
      g.style.setProperty('margin', '0', 'important');
      g.style.setProperty('box-sizing', 'border-box', 'important');
      // Reset each item — kill Dawn's flex sizing and force grid cell to fill
      g.querySelectorAll(':scope > li, :scope > .grid__item').forEach(function (it) {
        it.style.setProperty('width', '100%', 'important');
        it.style.setProperty('max-width', '100%', 'important');
        it.style.setProperty('min-width', '0', 'important');
        it.style.setProperty('flex', 'none', 'important');
        it.style.setProperty('margin', '0', 'important');
        it.style.setProperty('padding', '0', 'important');
        it.style.setProperty('scroll-snap-align', 'none', 'important');
        // Card inside the cell — ensure it fills its grid cell
        var card = it.querySelector('.aa-pcard, .card-wrapper, .card');
        if (card) {
          card.style.setProperty('width', '100%', 'important');
          card.style.setProperty('max-width', '100%', 'important');
          card.style.setProperty('min-width', '0', 'important');
        }
      });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', nuke);
  } else {
    nuke();
  }

  // Nuclear approach to kill the CERTIFIED stamp on the Rudraksha drawer tile.
  // 1) Mark any tile labeled rudraksha (CSS swaps to Om-on-gradient)
  // 2) Also remove every <img> in the drawer whose src looks rudraksha-related —
  //    forces fallback rendering even if (1) misses by label.
  function killStampInDrawer() {
    // Original tile images stay — only nuke any CSS-overlay .aa-img-stamp
    // that leaks into a drawer (e.g. from the product page underneath).
    document.querySelectorAll('header-drawer .aa-img-stamp, .menu-drawer .aa-img-stamp, cart-drawer .aa-img-stamp, .aa-drawer .aa-img-stamp').forEach(function (s) {
      s.remove();
    });
  }
  var killRudrakshaInDrawer = killStampInDrawer;
  // Run on key lifecycle events only — no persistent MutationObserver (was
  // causing infinite mutation loops because killRudrakshaInDrawer itself
  // mutates DOM, triggering more observer callbacks → site crash).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', killRudrakshaInDrawer);
  } else {
    killRudrakshaInDrawer();
  }
  window.addEventListener('load', killRudrakshaInDrawer);
  // Re-run only when the hamburger / drawer is clicked
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('summary.header__icon--menu, header-drawer, .menu-drawer-container')) {
      setTimeout(killRudrakshaInDrawer, 50);
      setTimeout(killRudrakshaInDrawer, 300);
    }
  }, true);
  // Re-run on resize + load. NO MutationObserver — caused infinite mutation
  // loops since nuke() itself writes inline styles → triggers more callbacks.
  window.addEventListener('resize', nuke);
  window.addEventListener('load', nuke);
})();

/* AA Cart — minimal, bulletproof AJAX add-to-cart + qty controls */
(function () {
  'use strict';
  var TAG = '[AA-CART]';
  function log() { try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }
  function err() { try { console.error.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }

  try { window.AA_CART_VERSION = 'v9.1-qtyfix'; } catch (e) {}
  log('aa-cart.js loaded at', new Date().toISOString(), 'version', 'v9.1-qtyfix');

  var state = {}; // String(variant_id) -> qty
  var busy = {};  // variant_id -> bool

  function toast(msg, isError) {
    var t = document.getElementById('aa-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'aa-toast';
      t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);background:#1F0820;color:#fff;padding:12px 22px;border-radius:999px;font-family:"Plus Jakarta Sans",system-ui,sans-serif;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 16px 40px rgba(0,0,0,.25);opacity:0;transition:opacity 200ms ease,transform 200ms ease;pointer-events:none;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = isError ? '#b41d09' : '#1F0820';
    requestAnimationFrame(function () {
      t.style.opacity = '1';
      t.style.transform = 'translateX(-50%) translateY(0)';
    });
    clearTimeout(t._h);
    t._h = setTimeout(function () {
      t.style.opacity = '0';
      t.style.transform = 'translateX(-50%) translateY(20px)';
    }, 1800);
  }

  function setBubble(count) {
    // Bottom tab-bar badge — single source of truth (optimistic on add, exact
    // after loadCart). Always update it, even if the header bubble is absent.
    var n = count > 99 ? '99+' : count;
    document.querySelectorAll('[data-aa-cart-badge]').forEach(function (b) {
      if (count > 0) { b.textContent = n; b.hidden = false; } else { b.hidden = true; b.textContent = ''; }
    });
    // Header bubble (Section Rendering API fallback).
    var anchor = document.getElementById('cart-icon-bubble');
    if (!anchor) return;
    var bubble = anchor.querySelector('.cart-count-bubble');
    if (count > 0) {
      if (!bubble) {
        bubble = document.createElement('div');
        bubble.className = 'cart-count-bubble';
        var s = document.createElement('span');
        s.setAttribute('aria-hidden', 'true');
        bubble.appendChild(s);
        anchor.appendChild(bubble);
      }
      var span = bubble.querySelector('span[aria-hidden]') || bubble.querySelector('span');
      if (span) span.textContent = count;
      bubble.style.display = '';
    } else if (bubble) {
      bubble.parentNode.removeChild(bubble);
    }
  }

  function applyCartIconSection(html) {
    // Replace #cart-icon-bubble anchor contents with the freshly rendered
    // sections/cart-icon-bubble.liquid HTML returned by Shopify.
    if (!html) return;
    var anchor = document.getElementById('cart-icon-bubble');
    if (!anchor) return;
    // Strip Shopify's outer <div id="shopify-section-..."> wrapper if present
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    var inner = tmp.querySelector('#shopify-section-cart-icon-bubble') || tmp;
    anchor.innerHTML = inner.innerHTML;
  }

  function setCard(card, qty) {
    if (!card) return;
    var numEl = card.querySelector('.aa-pcard__qty-num');
    // Visibility is driven entirely by .aa-in-cart class (CSS in aa-wireframe.css).
    // No inline display/background/etc — keeps state reset clean.
    if (qty > 0) {
      card.classList.add('aa-in-cart');
      if (numEl) numEl.textContent = String(qty);
    } else {
      card.classList.remove('aa-in-cart');
      if (numEl) numEl.textContent = '1';
    }
  }

  function syncAll() {
    document.querySelectorAll('.aa-pcard').forEach(function (card) {
      var inp = card.querySelector('input[name="id"]');
      if (!inp) return;
      var q = state[String(inp.value)] || 0;
      setCard(card, q);
    });
  }

  function loadCart() {
    log('loadCart()');
    return fetch('/cart.js', { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        state = {};
        cartTypes = [];
        (cart.items || []).forEach(function (it) {
          state[String(it.variant_id)] = it.quantity;
          if (it.product_type) cartTypes.push(it.product_type);
        });
        log('cart loaded; items:', state, 'count:', cart.item_count);
        syncAll();
        setBubble(cart.item_count);
        updateCheckoutTotal(cart);
        return cart;
      })
      .catch(function (e) { err('loadCart failed', e); });
  }

  function postAdd(id, qty) {
    // FormData + sections param → response includes freshly-rendered
    // cart-icon-bubble AND cart-drawer HTML so we can swap them in atomically.
    var fd = new FormData();
    fd.append('id', String(id));
    fd.append('quantity', String(qty || 1));
    fd.append('sections', 'cart-icon-bubble,cart-drawer');
    fd.append('sections_url', window.location.pathname);
    return fetch('/cart/add.js', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: fd
    });
  }

  function applyCartDrawerSection(html) {
    // Replace the entire drawer's innerHTML with the freshly-rendered server
    // version. Simple, reliable — guarantees items + totals are in sync.
    if (!html) return;
    var drawer = document.querySelector('cart-drawer');
    if (!drawer) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    var fresh = tmp.querySelector('cart-drawer');
    if (!fresh) {
      var wrap = tmp.querySelector('[id^="shopify-section-"]');
      fresh = wrap ? wrap.querySelector('cart-drawer') : null;
    }
    if (!fresh) return;
    drawer.innerHTML = fresh.innerHTML;
    drawer.classList.toggle('is-empty', fresh.classList.contains('is-empty'));
    // The swap recreated an empty recs container — repaint it instantly from
    // the in-memory pool (no network) so it never disappears or lags.
    renderRecs();
  }

  function postUpdate(id, qty) {
    // /cart/update.js with updates map handles line-item-properties cleanly
    // (option-plus app injects them). Returns the full updated cart.
    var updates = {};
    updates[String(id)] = qty;
    return fetch('/cart/update.js?sections=cart-icon-bubble', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ updates: updates, sections: 'cart-icon-bubble', sections_url: window.location.pathname })
    });
  }

  function readCardInfo(card) {
    // Grab product info from the card DOM (works for BOTH the .aa-pcard
    // collection cards AND the .pcard homepage slider/grid cards) so we can
    // render an optimistic line item instantly while the response is in flight.
    if (!card) return null;
    var titleEl = card.querySelector('.aa-pcard__title, .nm a, .nm, .pcard__title') || card.querySelector('.product__title, h1');
    var priceEl = card.querySelector('.aa-pcard__price, .price-row .price, .price') || card.querySelector('.price-item--regular, .price-item--sale');
    var imgEl = card.querySelector('.aa-pcard__media img, .media img') || card.querySelector('.product__media img, .product__media-item img, img');
    var linkEl = card.querySelector('a.aa-pcard__media, .nm a, a[href*="/products/"]');
    // strip any struck-through compare price so we keep just the current price
    var price = '';
    if (priceEl) {
      var clone = priceEl.cloneNode(true);
      clone.querySelectorAll('s, del').forEach(function (n) { n.remove(); });
      price = clone.textContent.trim();
    }
    return {
      title: titleEl ? titleEl.textContent.trim() : 'Product',
      price: price,
      img: imgEl ? (imgEl.getAttribute('src') || imgEl.src || '') : '',
      url: linkEl ? linkEl.href : '#'
    };
  }

  function optimisticInsertLineItem(card) {
    // Insert a temporary <tr> into the cart-drawer's items table so the user
    // sees the new product instantly — no waiting for the section render.
    var info = readCardInfo(card);
    if (!info) return;
    var drawer = document.querySelector('cart-drawer');
    if (!drawer) return;

    // If drawer is in is-empty state, swap to populated layout
    drawer.classList.remove('is-empty');
    var emptyBlock = drawer.querySelector('.drawer__inner-empty');
    if (emptyBlock) emptyBlock.style.display = 'none';

    var tbody = drawer.querySelector('cart-drawer-items tbody');
    var table = drawer.querySelector('cart-drawer-items table.cart-items');

    // If table doesn't exist yet (empty cart on page load), create a minimal one
    if (!tbody) {
      var items = drawer.querySelector('cart-drawer-items') ||
                  drawer.querySelector('#CartDrawer-CartItems');
      if (!items) return;
      var wrap = document.createElement('div');
      wrap.className = 'drawer__cart-items-wrapper';
      wrap.innerHTML = '<table class="cart-items" role="table"><tbody role="rowgroup"></tbody></table>';
      items.insertBefore(wrap, items.firstChild);
      tbody = wrap.querySelector('tbody');
    }

    var tr = document.createElement('tr');
    tr.className = 'cart-item aa-optimistic-row';
    tr.setAttribute('data-aa-optimistic', '1');
    // Loading placeholder: product image with a round buffer spinner over it +
    // "Adding…" — the real interactive row replaces this when the server responds.
    tr.innerHTML =
      '<td class="cart-item__media" role="cell">' +
        '<div class="aa-opt-media">' +
          (info.img ? '<img class="cart-item__image" src="' + info.img + '" alt="">' : '') +
          '<span class="aa-opt-spinner" aria-hidden="true"></span>' +
        '</div>' +
      '</td>' +
      '<td class="cart-item__details" role="cell">' +
        '<a href="' + info.url + '" class="cart-item__name h4 break">' + info.title + '</a>' +
        '<div class="aa-opt-note">Adding to cart&hellip;</div>' +
      '</td>' +
      '<td class="cart-item__totals right" role="cell"></td>' +
      '<td class="cart-item__quantity" role="cell"></td>';
    tbody.appendChild(tr);
  }

  function clearOptimisticRows() {
    document.querySelectorAll('cart-drawer [data-aa-optimistic]').forEach(function (n) { n.remove(); });
  }

  // Indeterminate "beam" loader pinned to the top of the open drawer. Shows the
  // instant the drawer opens and stays until the server-rendered items swap in
  // (applyCartDrawerSection replaces the drawer innerHTML, which removes it).
  function showCartLoader() {
    var inner = document.querySelector('cart-drawer .drawer__inner');
    if (!inner || inner.querySelector('.aa-cart-loader')) return;
    var bar = document.createElement('div');
    bar.className = 'aa-cart-loader';
    bar.innerHTML = '<span class="aa-cart-loader__beam"></span>';
    inner.insertBefore(bar, inner.firstChild);
  }
  function hideCartLoader() {
    document.querySelectorAll('cart-drawer .aa-cart-loader').forEach(function (n) { n.remove(); });
  }

  function fmtCents(cents) {
    var n = Math.round((cents || 0) / 100);
    return 'Rs. ' + n.toLocaleString('en-IN');
  }

  // Keep the rich checkout-bar total in sync (it is a custom element Dawn's
  // section render doesn't know to update on every path).
  function updateCheckoutTotal(cart) {
    if (!cart) return;
    document.querySelectorAll('.aa-checkout-btn__total').forEach(function (el) {
      el.textContent = fmtCents(cart.total_price);
    });
  }


  /* ---- In-cart upsell carousel (Shopify product recommendations) ---- */
  // Money helper that copes with BOTH endpoint shapes: /recommendations gives
  // integer cents (62000), /collections/all/products.json gives decimal strings
  // ("620.00").
  function recMoney(val) {
    var n = (typeof val === 'string') ? parseFloat(val) : (val / 100);
    if (isNaN(n)) return '';
    return 'Rs. ' + Math.round(n).toLocaleString('en-IN');
  }
  function recMoneyNum(val) {
    return (typeof val === 'string') ? parseFloat(val) : (val / 100);
  }
  function recImg(p) {
    var img = p.featured_image || '';
    if (!img && p.images && p.images.length) {
      img = (typeof p.images[0] === 'string') ? p.images[0] : (p.images[0].src || '');
    }
    if (img && img.indexOf('//') === 0) img = 'https:' + img;
    if (img) img = img + (img.indexOf('?') >= 0 ? '&' : '?') + 'width=220'; /* card is ~90px; 220 covers retina, far lighter than full-size */
    return img;
  }

  function shuffleArr(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // The "you may also like" pool is fetched ONCE on page load and kept in
  // memory. Rendering is then 100% synchronous (no network at add/open time)
  // and always reflects the CURRENT cart (filters out what's already in it),
  // so it shows instantly and never flashes stale, product-specific recs.
  var recsPool = null;
  var recsPoolPromise = null;
  var cartTypes = [];   // product_type of each cart line (for relevance ranking)
  function ensureRecsPool() {
    if (recsPoolPromise) return recsPoolPromise;
    recsPoolPromise = fetch('/collections/all/products.json?limit=250', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { recsPool = (d.products || []).slice(); return recsPool; })
      .catch(function () { recsPool = []; return recsPool; });
    return recsPoolPromise;
  }

  // Turn the cart's product types into title keywords (the catalog JSON does not
  // expose product_type, but titles do contain the category word).
  function relevanceKeywords() {
    var kw = {};
    cartTypes.forEach(function (t) {
      t = (t || '').toLowerCase().trim();
      if (!t) return;
      kw[t] = true;
      if (t.indexOf('gem') >= 0 || t.indexOf('stone') >= 0) { kw['stone'] = true; kw['gem'] = true; }
      if (t.indexOf('crystal') >= 0) { kw['crystal'] = true; }
      if (t.indexOf('tree') >= 0) { kw['tree'] = true; }
    });
    return Object.keys(kw);
  }

  function recCardHTML(p) {
    var v = p.variants && p.variants[0];
    var img = recImg(p);
    var priceHtml = recMoney(v.price);
    if (v.compare_at_price && recMoneyNum(v.compare_at_price) > recMoneyNum(v.price)) {
      priceHtml += '<s>' + recMoney(v.compare_at_price) + '</s>';
    }
    var url = (p.url || ('/products/' + p.handle) || '#').split('?')[0];
    return '<div class="aa-rec">' +
      '<a href="' + url + '"><img class="aa-rec__img" src="' + img + '" alt="" loading="lazy" width="150" height="150"></a>' +
      '<a href="' + url + '" class="aa-rec__title">' + (p.title || '') + '</a>' +
      '<div class="aa-rec__price">' + priceHtml + '</div>' +
      '<button type="button" class="aa-rec__add" data-rec-add data-variant="' + v.id + '">Add</button>' +
      '</div>';
  }

  function renderRecs() {
    var wrap = document.getElementById('aa-cart-recs');
    var track = document.getElementById('aa-cart-recs-track');
    if (!wrap || !track) return;
    if (!recsPool || !recsPool.length) { wrap.setAttribute('hidden', ''); return; }
    var kws = relevanceKeywords();
    var relevant = [], others = [];
    recsPool.forEach(function (p) {
      var v = p.variants && p.variants[0];
      if (!v || v.available === false) return;
      if (state[String(v.id)]) return; // already in cart
      var title = (p.title || '').toLowerCase();
      var isRel = kws.length && kws.some(function (k) { return title.indexOf(k) >= 0; });
      (isRel ? relevant : others).push(p);
    });
    // Relevant (same category) first, then fill the rest so it is never empty.
    var list = shuffleArr(relevant).concat(shuffleArr(others)).slice(0, 10);
    if (!list.length) { wrap.setAttribute('hidden', ''); track.innerHTML = ''; return; }
    var html = '';
    list.forEach(function (p) { html += recCardHTML(p); });
    track.innerHTML = html;
    wrap.removeAttribute('hidden');
  }

  function loadRecommendations() {
    if (recsPool) { renderRecs(); return; }
    ensureRecsPool().then(function () { renderRecs(); });
  }

  function formField(form, name) {
    // form.elements includes controls associated via the `form` attribute even
    // when they live OUTSIDE the <form> (Dawn's product quantity input does this).
    var el = form.elements && form.elements.namedItem ? form.elements.namedItem(name) : null;
    return el || form.querySelector('[name="' + name + '"]');
  }

  function handleAdd(card, form) {
    var inp = formField(form, 'id');
    if (!inp || !inp.value) { err('no variant id'); toast('Error: no variant', true); return; }
    var id = String(inp.value);
    if (busy[id]) { log('busy, skipping', id); return; }
    busy[id] = true;
    log('ADD click for', id);
    try { if (navigator.vibrate) navigator.vibrate([40, 30, 80]); } catch (e) {} /* heavy buzz on add */

    // Quantity (product page can add >1; cards always add 1). The qty input may
    // be outside the form (linked via the form attribute) — formField finds it.
    var qtyInput = formField(form, 'quantity');
    var addQty = (qtyInput && qtyInput.value) ? Math.max(1, parseInt(qtyInput.value, 10) || 1) : 1;

    // Optimistic state for card / bubble
    var prev = state[id] || 0;
    state[id] = prev + addQty;
    setCard(card, state[id]);
    var totalNow = 0; for (var k in state) totalNow += state[k];
    setBubble(totalNow);

    // Put the loading placeholder in FIRST (so the drawer slides up already
    // showing the product loading), THEN trigger the slide-open animation.
    var drawer = document.querySelector('cart-drawer');
    var wasOpen = drawer && drawer.classList.contains('active');
    optimisticInsertLineItem(card);
    if (drawer && !wasOpen) {
      if (typeof drawer.open === 'function') {
        try { drawer.open(); } catch (e2) { drawer.classList.add('active', 'animate'); }
      } else {
        drawer.classList.add('active', 'animate');
        drawer.setAttribute('open', '');
      }
    }
    loadRecommendations();

    // ONE network round trip. No chained extra /?sections fetch. State sync and
    // free-gift cleanup run AFTER, in the background, without blocking the UI.
    postAdd(id, addQty).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ' ' + t); });
      return r.json();
    }).then(function (data) {
      if (data && data.sections) {
        if (data.sections['cart-icon-bubble']) applyCartIconSection(data.sections['cart-icon-bubble']);
        if (data.sections['cart-drawer']) applyCartDrawerSection(data.sections['cart-drawer']);
      }
      var drawerEl = document.querySelector('cart-drawer');
      if (drawerEl) drawerEl.classList.remove('is-empty');
      // background — does not block the item being visible
      loadCart();
      stripFreeGifts();
    }).catch(function (e) {
      err('add failed', e.message || e);
      toast('Could not add — ' + (e.message || 'error'), true);
      state[id] = prev;
      if (state[id] <= 0) delete state[id];
      clearOptimisticRows();
      syncAll();
      var t2 = 0; for (var k2 in state) t2 += state[k2];
      setBubble(t2);
    }).finally(function () { busy[id] = false; });
  }

  function handleQty(card, form, delta) {
    var inp = form.querySelector('input[name="id"]');
    if (!inp) return;
    var id = String(inp.value);
    if (busy[id]) { log('busy, skipping qty', id); return; }
    busy[id] = true;
    var prev = state[id] || 0;
    var next = Math.max(0, prev + delta);
    // Optimistic UI: update state + every card showing this variant
    state[id] = next;
    if (next === 0) delete state[id];
    syncAll();
    var t2 = 0; for (var k2 in state) t2 += state[k2];
    setBubble(t2);
    log('QTY', delta > 0 ? '+' : '-', 'for', id, '->', next);

    postUpdate(id, next).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (cart) {
      // Re-sync from server response (no extra round trip)
      state = {};
      (cart.items || []).forEach(function (it) { state[String(it.variant_id)] = it.quantity; });
      syncAll();
      if (cart.sections && cart.sections['cart-icon-bubble']) {
        applyCartIconSection(cart.sections['cart-icon-bubble']);
      } else {
        setBubble(cart.item_count);
      }
    }).catch(function (e) {
      err('qty failed', e); loadCart();
    }).finally(function () { busy[id] = false; });
  }

  // Combined handler: capture-phase so we beat Dawn's product-form
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var qtyBtn = t.closest('.aa-pcard__qty-btn');
    if (qtyBtn) {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      var form1 = qtyBtn.closest('.aa-pcard__form');
      var card1 = qtyBtn.closest('.aa-pcard');
      if (form1 && card1) handleQty(card1, form1, qtyBtn.dataset.aaQty === 'inc' ? 1 : -1);
      return;
    }

    var addBtn = t.closest('.aa-pcard__cta');
    if (addBtn && !addBtn.classList.contains('aa-pcard__cta--sold')) {
      var form2 = addBtn.closest('.aa-pcard__form');
      var card2 = addBtn.closest('.aa-pcard');
      if (form2 && card2) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        handleAdd(card2, form2);
      }
      return;
    }

    // Homepage product cards (sliders / grids) use a different form: .aa-rd-form.
    // Wire them into the SAME instant-open + slide + buffer flow.
    var rdBtn = t.closest('.aa-rd-form button, [data-aa-rd-cart] button');
    if (rdBtn && rdBtn.type !== 'button') {
      var rdForm = rdBtn.closest('form');
      if (rdForm && rdForm.querySelector('input[name="id"]')) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        var rdCard = rdBtn.closest('.pcard, .aa-rd-card, .card-wrapper, article');
        handleAdd(rdCard || rdForm, rdForm);
      }
    }
  }, true);

  // Intercept ALL add-to-cart submits (cards + the product page) before Dawn's
  // product-form handler runs, so every Add routes through the instant flow.
  document.addEventListener('submit', function (e) {
    var form = e.target && e.target.closest && e.target.closest(
      '.aa-pcard__form, .aa-rd-form, [data-aa-rd-cart], product-form form, form[action*="/cart/add"]'
    );
    if (!form || !form.querySelector('[name="id"]')) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    var card = form.closest('.aa-pcard, .pcard, .aa-rd-card, .card-wrapper');
    if (!card) card = form.closest('[id^="MainProduct"], section, main') || document.body; // product page
    handleAdd(card, form);
  }, true);

  // The product page ADD TO CART is a real submit button — clicking it fires the
  // submit above. But guard against any handler that calls preventDefault first:
  // intercept the click on the add button directly too (not BUY NOW / checkout).
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('button[name="add"], .product-form__submit');
    if (!btn || btn.getAttribute('name') === 'checkout') return;
    var form = btn.closest('form');
    if (!form || !form.querySelector('[name="id"]')) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    var card = form.closest('.aa-pcard, .pcard, .aa-rd-card, .card-wrapper') ||
               form.closest('[id^="MainProduct"], section, main') || document.body;
    handleAdd(card, form);
  }, true);

  // Upsell carousel: ADD adds the recommended product, refreshes drawer + recs
  document.addEventListener('click', function (e) {
    var rb = e.target && e.target.closest && e.target.closest('[data-rec-add]');
    if (!rb) return;
    e.preventDefault(); e.stopPropagation();
    var vid = rb.getAttribute('data-variant');
    if (!vid || rb.disabled) return;
    rb.disabled = true;
    try { if (navigator.vibrate) navigator.vibrate([40, 30, 80]); } catch (e) {}
    rb.innerHTML = '<span class="aa-cta-spinner" aria-hidden="true"></span>';
    // Mark it as in-cart NOW so renderRecs drops it from the row instantly.
    state[String(vid)] = (state[String(vid)] || 0) + 1;
    // Single round trip: postAdd already returns the rendered cart-drawer +
    // bubble sections, so the item shows the moment it responds. Everything
    // else (state sync, free-gift strip) runs in the background and does NOT
    // block the item appearing.
    postAdd(vid).then(function (r) { return r.json(); }).then(function (data) {
      if (data && data.sections) {
        if (data.sections['cart-icon-bubble']) applyCartIconSection(data.sections['cart-icon-bubble']);
        if (data.sections['cart-drawer']) applyCartDrawerSection(data.sections['cart-drawer']);
      }
      // background — not awaited
      loadCart();
      stripFreeGifts();
    }).catch(function () { state[String(vid)] = Math.max(0, (state[String(vid)] || 1) - 1); rb.disabled = false; rb.innerHTML = 'Add'; });
  }, true);

  // Populate the carousel + sync the total whenever the cart drawer is opened
  document.addEventListener('click', function (e) {
    var opener = e.target && e.target.closest && e.target.closest('#cart-icon-bubble, a[href="/cart"], a[href$="/cart"], .header__icon--cart, [aria-controls="CartDrawer"], [data-tab="cart"]');
    if (opener) { setTimeout(loadRecommendations, 350); }
  }, true);

  ['cart:updated', 'cart:added', 'cart:refresh'].forEach(function (ev) {
    document.addEventListener(ev, loadCart);
  });

  // Cart drawer minus button: when qty is 1 and user clicks "-", remove the
  // line item instead of bouncing back to 1. Dawn's default validateQuantity
  // rejects qty < data-min (usually 1), so we intercept BEFORE the change fires.
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('cart-drawer-items .quantity__button[name="minus"], cart-items .quantity__button[name="minus"]');
    if (!btn) return;
    var qtyInput = btn.parentElement && btn.parentElement.querySelector && btn.parentElement.querySelector('input.quantity__input');
    if (!qtyInput) return;
    var current = parseInt(qtyInput.value, 10);
    if (current === 1) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      var line = qtyInput.dataset.index;
      var cartItems = btn.closest('cart-drawer-items') || btn.closest('cart-items');
      if (cartItems && typeof cartItems.updateQuantity === 'function') {
        cartItems.updateQuantity(line, 0, e);
      } else {
        // Fallback — manual /cart/change.js
        fetch('/cart/change.js', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ line: parseInt(line, 10), quantity: 0 })
        }).then(function () {
          // Refresh the drawer section
          return fetch('/?sections=cart-drawer,cart-icon-bubble', { credentials: 'same-origin' });
        }).then(function (r) { return r.json(); }).then(function (sections) {
          if (sections && sections['cart-drawer']) applyCartDrawerSection(sections['cart-drawer']);
          if (sections && sections['cart-icon-bubble']) applyCartIconSection(sections['cart-icon-bubble']);
        });
      }
    }
  }, true);

  // Auto-remove zero-priced "free gift" line items the Shopify auto-discount
  // (or any app) injects. The free Rudraksha keeps re-adding itself — strip
  // it after every cart load.
  function stripFreeGifts() {
    return fetch('/cart.js', { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        var killLines = [];
        (cart.items || []).forEach(function (it, idx) {
          // price is in cents; key is the line key Shopify uses for update
          if (it.final_price === 0 || it.price === 0) killLines.push(it.key);
        });
        if (killLines.length === 0) return;
        // /cart/update.js accepts updates by line key → set qty to 0 to remove
        var updates = {};
        killLines.forEach(function (k) { updates[k] = 0; });
        return fetch('/cart/update.js', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ updates: updates })
        });
      })
      .catch(function () {});
  }

  /* Public add-by-id (used by the quiz results) — reuses the full drawer flow. */
  window.AA_addToCart = function (id, qty) {
    id = String(id || ''); if (!id || busy[id]) return;
    busy[id] = true;
    try { if (navigator.vibrate) navigator.vibrate([40, 30, 80]); } catch (e) {}
    var drawer = document.querySelector('cart-drawer');
    if (drawer) { if (typeof drawer.open === 'function') { try { drawer.open(); } catch (e2) {} } else { drawer.classList.add('active', 'animate'); drawer.setAttribute('open', ''); } }
    postAdd(id, qty || 1).then(function (r) { return r.json(); }).then(function (data) {
      if (data && data.sections) {
        if (data.sections['cart-icon-bubble']) applyCartIconSection(data.sections['cart-icon-bubble']);
        if (data.sections['cart-drawer']) applyCartDrawerSection(data.sections['cart-drawer']);
      }
      var d2 = document.querySelector('cart-drawer'); if (d2) d2.classList.remove('is-empty');
      loadCart(); stripFreeGifts(); loadRecommendations();
    }).catch(function () {}).finally(function () { busy[id] = false; });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { loadCart(); stripFreeGifts(); });
  } else {
    loadCart();
    stripFreeGifts();
  }
  window.addEventListener('pageshow', function () { loadCart(); stripFreeGifts(); });
  document.addEventListener('turbo:load', function () { loadCart(); });   /* re-sync after SPA navigation */
  ['cart:updated', 'cart:added', 'cart:refresh'].forEach(function (ev) {
    document.addEventListener(ev, stripFreeGifts);
  });

  // Dawn re-renders the whole .drawer__inner when a line is removed / qty
  // changed in the drawer (CartDrawerItems), which blanks our recs container.
  // Subscribe to Dawn's pub/sub cart update so we repaint the carousel + resync.
  if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined' && PUB_SUB_EVENTS.cartUpdate) {
    subscribe(PUB_SUB_EVENTS.cartUpdate, function () {
      renderRecs();
      loadCart();
    });
  }

  /* ---- App-style draggable bottom sheet (mobile) ----
     The cart opens full-height; drag the header/handle down to move it and
     release past a threshold to dismiss. Gives a native app feel inside the
     Aura webview. */
  (function aaSheetDrag() {
    var dragging = false, startY = 0, lastY = 0, sheet = null, height = 0, moved = false;
    function isMobile() { return window.innerWidth <= 749; }
    function getDrawer() { return document.querySelector('cart-drawer.active, .drawer.active'); }
    function closeCart() {
      var cd = document.querySelector('cart-drawer');
      if (cd && typeof cd.close === 'function') { try { cd.close(); return; } catch (e) {} }
      if (cd) cd.classList.remove('active');
    }
    function onStart(e) {
      if (!isMobile()) return;
      var t = e.target;
      if (!t || !t.closest || !t.closest('.drawer__header')) return; // only from the header/handle
      var drawer = getDrawer();
      if (!drawer) return;
      sheet = drawer.querySelector('.drawer__inner');
      if (!sheet) return;
      dragging = true; moved = false;
      startY = lastY = e.touches ? e.touches[0].clientY : e.clientY;
      height = sheet.offsetHeight || window.innerHeight;
      sheet.classList.add('aa-dragging');
    }
    function onMove(e) {
      if (!dragging || !sheet) return;
      lastY = e.touches ? e.touches[0].clientY : e.clientY;
      var dy = Math.max(0, lastY - startY);
      if (dy > 4) moved = true;
      sheet.style.transform = 'translateY(' + dy + 'px)';
      if (e.cancelable) e.preventDefault();
    }
    function onEnd() {
      if (!dragging || !sheet) return;
      dragging = false;
      var dy = Math.max(0, lastY - startY);
      var s = sheet; sheet = null;
      s.classList.remove('aa-dragging');
      var threshold = Math.min(160, height * 0.28);
      if (moved && dy > threshold) {
        s.style.transform = 'translateY(100%)';        // animate down from finger position
        setTimeout(function () { closeCart(); s.style.transform = ''; }, 360);
      } else {
        s.style.transform = '';                          // snap back up to full
      }
    }
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
  })();
})();
