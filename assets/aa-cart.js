/* aa-cart.js — lean AstroAura cart drawer (DeDawn). Vanilla, no deps.
   Replaces Dawn cart.js + cart-drawer.js + quantity-popover + notification.
   Idempotent + Turbo-safe: guarded element, all behaviour delegated on document.
   AJAX Cart API: GET /cart.js (truth), POST /cart/add.js, POST /cart/change.js.
   Preserves: <cart-drawer>.open()/.close(), #cart-icon-bubble .cart-count-bubble,
   [data-aa-cart-badge], .aa-checkout-btn__total, window.AA_addToCart. */
(function () {
  'use strict';
  if (window.__aaCartLean) return;
  window.__aaCartLean = true;
  var DEBOUNCE = 250;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function money(cents) { return 'Rs. ' + Math.round((cents || 0) / 100).toLocaleString('en-IN'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function drawer() { return document.querySelector('cart-drawer'); }
  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
  var busy = {};            // variantId -> bool (cards / add)
  var pending = {};         // key -> timeout (debounced line change)
  var byVariant = {};       // variantId -> qty (for product card state)
  var cartProductIds = {};  // productId -> 1 (recommendation filtering)
  var recsCache = {};       // productId -> rendered rail HTML ('' = none); persists across Turbo navs
  var productCache = {};     // handle -> variants[] (for the in-cart variant changer)
  var lastTotal = 0;        // cents, last known subtotal (optimistic)
  function cartCount() { var t = 0; for (var k in byVariant) t += byVariant[k]; return t; }
  function setCount(n) { var d = drawer(); var c = d && $('[data-aac-count]', d); if (c) c.textContent = n; }
  function setSubtotal(cents) { var d = drawer(); var s = d && $('[data-aac-subtotal]', d); if (s) s.textContent = money(cents); updateTotalBar({ total_price: cents }); }
  function rowHTML(it) {
    var opt;
    if (it.product_type === 'Gemstone' && it.options_with_values) {
      // 143-variant products: labelled setting lines, no in-cart switcher
      var specs = [];
      it.options_with_values.forEach(function (o) {
        var v = (o.value || '').trim();
        if (o.name === 'Type') { specs.push('<b>Type:</b> ' + (v === 'Gemstone' ? 'Loose Stone' : esc(v))); return; }
        if (o.name.indexOf('Carat') >= 0) { specs.push('<b>Carat:</b> ' + esc(v) + ' ct'); return; }
        if (o.name === 'Material' && v !== 'No Setting') { specs.push('<b>Material:</b> ' + esc(v)); }
      });
      opt = '<div class="aac__props">' + specs.map(function (t) { return '<span class="aac__prop">' + t + '</span>'; }).join('') + '</div>';
    } else if (it.product_has_only_default_variant || it.variant_title == null) {
      opt = '';
    } else {
      opt = '<label class="aac__variant">' +
          '<span class="aac__variant-lbl">Variant:</span>' +
          '<select class="aac__variant-sel" data-aac-variant data-key="' + esc(it.key) + '" data-handle="' + esc(it.handle) + '" data-current="' + it.variant_id + '">' +
            '<option value="' + it.variant_id + '" selected>' + esc(it.variant_title) + ' &middot; ' + money(it.final_price) + '</option>' +
          '</select>' +
        '</label>';
    }
    var props = '';
    if (it.properties) {
      var kept = [];
      Object.keys(it.properties).forEach(function (k) {
        var v = it.properties[k];
        if (v && k.charAt(0) !== '_') kept.push('<span class="aac__prop"><b>' + esc(k) + ':</b> ' + esc(String(v)) + '</span>');
      });
      if (kept.length) props = '<div class="aac__props">' + kept.join('') + '</div>';
    }
    opt = opt + props;
    var src = it.image ? (it.image + (it.image.indexOf('?') >= 0 ? '&' : '?') + 'width=180') : '';
    var img = src ? '<img src="' + esc(src) + '" alt="" width="90" height="90" loading="lazy">' : '';
    return '<li class="aac__item" data-aac-line data-key="' + esc(it.key) + '" data-variant="' + it.variant_id + '">' +
        '<a class="aac__thumb" href="' + esc(it.url) + '" tabindex="-1" aria-hidden="true">' + img + '</a>' +
        '<div class="aac__info">' +
          '<a class="aac__name" href="' + esc(it.url) + '">' + esc(it.product_title) + '</a>' +
          opt +
          '<div class="aac__ctl">' +
            '<div class="aac__stepper">' +
              '<button type="button" class="aac__step" data-aac-dec aria-label="Decrease quantity">' +
                '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
              '<span class="aac__qty" data-aac-qty>' + it.quantity + '</span>' +
              '<button type="button" class="aac__step" data-aac-inc aria-label="Increase quantity">' +
                '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
            '</div>' +
            '<button type="button" class="aac__remove" data-aac-remove aria-label="Remove ' + esc(it.product_title) + '">Remove</button>' +
          '</div>' +
        '</div>' +
        '<div class="aac__linetotal" data-aac-linetotal>' + money(it.final_line_price) + '</div>' +
      '</li>';
  }
  function render(cart) {
    var d = drawer();
    if (!d || !cart) return;
    byVariant = {};
    cartProductIds = {};
    lastTotal = cart.total_price || 0;
    (cart.items || []).forEach(function (it) { byVariant[String(it.variant_id)] = it.quantity; cartProductIds[it.product_id] = 1; });
    var items = $('[data-aac-items]', d);
    if (items) items.innerHTML = (cart.items || []).map(rowHTML).join('');
    var cnt = $('[data-aac-count]', d); if (cnt) cnt.textContent = cart.item_count;
    var sub = $('[data-aac-subtotal]', d); if (sub) sub.textContent = money(cart.total_price);
    d.classList.toggle('is-empty', (cart.item_count || 0) === 0);
    updateBubble(cart.item_count);
    updateTotalBar(cart);
    syncCards();
    renderRecs(cart);
    hydrateVariants();
  }
  function updateBubble(count) {
    var n = count > 99 ? '99+' : count;
    $$('[data-aa-cart-badge]').forEach(function (b) {
      if (count > 0) { b.textContent = n; b.hidden = false; } else { b.hidden = true; b.textContent = ''; }
    });
    var anchor = document.getElementById('cart-icon-bubble');
    if (!anchor) return;
    var bubble = anchor.querySelector('.cart-count-bubble');
    if (count > 0) {
      if (!bubble) {
        bubble = document.createElement('div');
        bubble.className = 'cart-count-bubble';
        bubble.innerHTML = '<span aria-hidden="true"></span>';
        anchor.appendChild(bubble);
      }
      var span = bubble.querySelector('span'); if (span) span.textContent = count;
      bubble.style.display = '';
    } else if (bubble) {
      bubble.parentNode.removeChild(bubble);
    }
  }
  function updateTotalBar(cart) {
    $$('.aa-checkout-btn__total').forEach(function (el) { el.textContent = money(cart.total_price); });
  }
  function syncCards() {
    $$('.aa-pcard').forEach(function (card) {
      var inp = card.querySelector('input[name="id"]');
      if (!inp) return;
      var q = byVariant[String(inp.value)] || 0;
      var num = card.querySelector('.aa-pcard__qty-num');
      if (q > 0) { card.classList.add('aa-in-cart'); if (num) num.textContent = String(q); }
      else { card.classList.remove('aa-in-cart'); if (num) num.textContent = '1'; }
    });
  }
  function announce(msg) { var l = $('[data-aac-live]', drawer()); if (l) l.textContent = msg; }
  function working(on) { var p = $('.aac__panel', drawer()); if (p) p.classList.toggle('aac-working', !!on); }
  var cartReq = null;
  function loadCart() {
    if (cartReq) return cartReq;  // coalesce duplicate calls (turbo:load + pageshow + events)
    cartReq = fetch('/cart.js', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (cart) { render(cart); return cart; })
      .catch(function () {})
      .then(function (c) { cartReq = null; return c; });
    return cartReq;
  }
  // Add-to-cart pipeline hooks (used by the gemstone PDP):
  //   AA_addGuards: fn(form) -> false blocks the add (validation, e.g. ring size)
  //   AA_addHooks:  fn(form) run after the main line is posted (e.g. ritual add-on line)
  window.AA_addGuards = window.AA_addGuards || [];
  window.AA_addHooks = window.AA_addHooks || [];
  // AA_addResolvers: fn(form) -> variantId. Dawn re-renders the product form
  // section on variant change and clobbers input[name="id"], so a component
  // that owns its own selection state must be able to override the id.
  window.AA_addResolvers = window.AA_addResolvers || [];
  function resolveId(form, fallback) {
    for (var i = 0; i < window.AA_addResolvers.length; i++) {
      try { var v = window.AA_addResolvers[i](form); if (v) return String(v); } catch (_) {}
    }
    return fallback;
  }
  function runGuards(form) {
    for (var i = 0; i < window.AA_addGuards.length; i++) {
      try { if (window.AA_addGuards[i](form) === false) return false; } catch (_) {}
    }
    return true;
  }
  function runHooks(form) {
    window.AA_addHooks.forEach(function (f) { try { f(form); } catch (_) {} });
  }
  function collectProps(form) {
    // form.elements includes external controls associated via the form="" attribute,
    // which is how the gemstone snippets attach Ring Size + sankalpa properties.
    var o = {};
    if (!form || !form.elements) return o;
    for (var i = 0; i < form.elements.length; i++) {
      var el = form.elements[i];
      if (el.disabled || !el.name) continue;
      var m = el.name.match(/^properties\[(.+)\]$/);
      if (m && el.value) o[m[1]] = el.value;
    }
    return o;
  }
  window.AA_collectProps = collectProps;
  function addToCart(id, qty, card, props) {
    id = String(id || ''); if (!id) return;
    if (busy[id]) return; busy[id] = true;
    qty = Math.max(1, parseInt(qty, 10) || 1);
    vibrate([30, 20, 50]);
    var prev = byVariant[id] || 0;
    byVariant[id] = prev + qty;
    updateBubble(cartCount());
    setCount(cartCount());
    if (card) syncCards();
    openDrawer();
    var li = optimisticRow(card);
    var fd = new FormData();
    fd.append('id', id);
    fd.append('quantity', String(qty));
    if (props) { Object.keys(props).forEach(function (k) { fd.append('properties[' + k + ']', props[k]); }); }
    fetch('/cart/add.js', {
      method: 'POST', credentials: 'same-origin',
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: fd
    })
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) {
          var msg = '';
          try { msg = (JSON.parse(t) || {}).description || (JSON.parse(t) || {}).message || ''; } catch (_) { msg = ''; }
          var err = new Error(msg || 'Could not add to cart'); err.aaMessage = msg; throw err;
        });
        return r.json();
      })
      .then(function (item) {
        // Render straight from the add response — no second /cart.js round-trip.
        var d = drawer(); if (d) d.classList.remove('is-empty');
        var items = d && $('[data-aac-items]', d);
        if (items && item && item.key) {
          var existing = null;
          $$('[data-aac-line]', items).forEach(function (r) {
            if (r.getAttribute('data-key') === item.key && r.getAttribute('data-aac-optimistic') == null) existing = r;
          });
          if (existing) { existing.outerHTML = rowHTML(item); if (li && li.parentNode) li.parentNode.removeChild(li); }
          else if (li) { li.outerHTML = rowHTML(item); }
          else { items.insertAdjacentHTML('beforeend', rowHTML(item)); }
        }
        if (item && item.product_id) { cartProductIds[item.product_id] = 1; renderRecsFor(item.product_id); }
        lastTotal += qty * (item.final_price || 0);
        setSubtotal(lastTotal);
        setCount(cartCount());
        announce('Item added to cart');
        // Amplitude: the custom cart bypasses the Shopify plugin's automatic
        // add-to-cart capture, so fire the plugin-shaped event here (the one
        // source all ATC paths funnel through: PDP, cards, quickview).
        try {
          if (window.aaHeatmap && item) window.aaHeatmap.track('Web_Shopify_Product_Added', {
            '[Amplitude] Product ID': item.product_id,
            '[Amplitude] Product Variant ID': item.variant_id || id,
            '[Amplitude] Product Name': item.product_title || item.title,
            '[Amplitude] Product Price': (item.final_price || item.price || 0) / 100,
            '[Amplitude] Product Quantity': qty,
            '[Amplitude] Product URL': item.url
          });
        } catch (e) {}
      })
      .catch(function (err) {
        byVariant[id] = prev;
        if (li && li.parentNode) li.parentNode.removeChild(li);
        showAddError(err && err.aaMessage ? err.aaMessage
          : 'Sorry, we could not add that to your cart. Please try again.');
        loadCart();
      })
      .then(function () { busy[id] = false; });
  }
  function showAddError(msg) {
    var d = drawer(); if (!d) return;
    var body = $('[data-aac-body]', d) || $('.aac__panel', d); if (!body) return;
    var box = $('[data-aac-error]', d);
    if (!box) {
      box = document.createElement('div');
      box.className = 'aac__error';
      box.setAttribute('data-aac-error', '');
      box.setAttribute('role', 'alert');
      body.insertBefore(box, body.firstChild);
    }
    box.textContent = msg;
    box.hidden = false;
    announce(msg);
    clearTimeout(showAddError._t);
    showAddError._t = setTimeout(function () { if (box) box.hidden = true; }, 6000);
  }
  function optimisticRow(card) {
    var d = drawer(); if (!d) return null;
    d.classList.remove('is-empty');
    var items = $('[data-aac-items]', d); if (!items) return null;
    var title = 'Adding…', img = '';
    if (card) {
      var t = card.querySelector('.aa-pcard__title, .nm a, .pcard__title, .product__title, h1');
      var i = card.querySelector('.aa-pcard__media img, .media img, .product__media img, img');
      if (t) title = t.textContent.trim();
      if (i) img = i.getAttribute('src') || i.src || '';
    }
    var li = document.createElement('li');
    li.className = 'aac__item aac-busy';
    li.setAttribute('data-aac-optimistic', '1');
    li.innerHTML = '<span class="aac__thumb">' + (img ? '<img src="' + esc(img) + '" alt="">' : '') + '</span>' +
      '<div class="aac__info"><span class="aac__name">' + esc(title) + '</span><div class="aac__unit">Adding…</div></div>' +
      '<div class="aac__linetotal"></div>';
    items.appendChild(li);
    return li;
  }
  function hydrateVariants() {
    var d = drawer(); if (!d) return;
    $$('[data-aac-variant]:not([data-hydrated])', d).forEach(function (sel) {
      var handle = sel.getAttribute('data-handle'); if (!handle) return;
      sel.setAttribute('data-hydrated', '1');
      var cur = sel.getAttribute('data-current');
      var fill = function (variants) {
        if (!variants || variants.length < 2) return;
        sel.innerHTML = variants.map(function (v) {
          return '<option value="' + v.id + '"' + (String(v.id) === String(cur) ? ' selected' : '') +
            (v.available ? '' : ' disabled') + '>' + esc(v.title) + ' · ' + money(v.price) + '</option>';
        }).join('');
      };
      if (productCache[handle]) { fill(productCache[handle]); return; }
      fetch('/products/' + handle + '.js', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (p) { productCache[handle] = p.variants || []; fill(productCache[handle]); })
        .catch(function () {});
    });
  }
  function swapVariant(key, newId, qty) {
    working(true);
    fetch('/cart/change.js', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ id: key, quantity: 0 })
    })
      .then(function () {
        var fd = new FormData(); fd.append('id', newId); fd.append('quantity', String(qty));
        return fetch('/cart/add.js', {
          method: 'POST', credentials: 'same-origin',
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: fd
        });
      })
      .then(function () { return loadCart(); })
      .then(function () { announce('Variant updated'); })
      .catch(function () { loadCart(); })
      .then(function () { working(false); });
  }
  function recsHost() { var d = drawer(); return d && $('[data-aac-recs]', d); }
  function renderRecs(cart) {
    var items = (cart && cart.items) || [];
    var host = recsHost();
    if (!items.length) { if (host) { host.hidden = true; host.innerHTML = ''; host.dataset.pid = ''; } return; }
    renderRecsFor(items[0].product_id);
  }
  function paintRecs(host, pid, html) {
    host.dataset.pid = pid;
    if (html === '') { host.hidden = true; host.innerHTML = ''; }
    else { host.innerHTML = html; host.hidden = false; }
  }
  function renderRecsFor(pid) {
    var host = recsHost(); if (!host || !pid) return;
    pid = String(pid);
    if (host.dataset.pid === pid && host.innerHTML) { host.hidden = false; return; }  // already painted
    if (recsCache[pid] != null) { paintRecs(host, pid, recsCache[pid]); return; }      // cached (instant, survives navs)
    host.dataset.pid = pid;
    fetch('/recommendations/products.json?product_id=' + pid + '&limit=12&intent=related',
      { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var ps = (d.products || []).filter(function (p) { return !cartProductIds[p.id]; }).slice(0, 10);
        var html = ps.length
          ? '<div class="aac__recs-h">You may also like</div><div class="aac__recs-rail" role="list">' + ps.map(recCard).join('') + '</div>'
          : '';
        recsCache[pid] = html;
        paintRecs(host, pid, html);
      })
      .catch(function () { host.hidden = true; host.dataset.pid = ''; });
  }
  function recCard(p, i) {
    var v = p.variants && p.variants[0]; if (!v) return '';
    var im = p.featured_image || '';
    if (im) im = im + (im.indexOf('?') >= 0 ? '&' : '?') + 'width=220';
    return '<div class="aac__rec" role="listitem">' +
        '<a class="aac__rec-img" href="' + esc(p.url) + '" tabindex="-1" aria-hidden="true">' +
          (im ? '<img src="' + esc(im) + '" alt="" width="144" height="144" decoding="async" loading="eager" fetchpriority="' + (i < 4 ? 'high' : 'auto') + '">' : '') + '</a>' +
        '<a class="aac__rec-name" href="' + esc(p.url) + '">' + esc(p.title) + '</a>' +
        '<div class="aac__rec-foot">' +
          '<span class="aac__rec-price">' + money(p.price) + '</span>' +
          '<button type="button" class="aac__rec-add" data-aac-rec data-variant="' + v.id + '" aria-label="Add ' + esc(p.title) + '">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';
  }
  /* Surgically update cart meta (count / subtotal / bubble / empty) WITHOUT
     rebuilding the rows — so in-progress row animations are never wiped. */
  function applyMeta(cart) {
    var d = drawer(); if (!d || !cart) return;
    byVariant = {}; cartProductIds = {};
    (cart.items || []).forEach(function (it) { byVariant[String(it.variant_id)] = it.quantity; cartProductIds[it.product_id] = 1; });
    lastTotal = cart.total_price || 0;
    var cnt = $('[data-aac-count]', d); if (cnt) cnt.textContent = cart.item_count;
    var sub = $('[data-aac-subtotal]', d); if (sub) sub.textContent = money(cart.total_price);
    d.classList.toggle('is-empty', (cart.item_count || 0) === 0);
    updateBubble(cart.item_count); updateTotalBar(cart); syncCards();
    if ((cart.item_count || 0) === 0) { var items = $('[data-aac-items]', d); if (items) items.innerHTML = ''; renderRecs(cart); }
  }
  function cartChange(body) {
    return fetch('/cart/change.js', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }
  /* One line mutation at a time. Rapid removes queue up; each plays a confirm
     progress bar, then the row collapses and is removed surgically (no full
     re-render) — so back-to-back deletes never race or resurrect rows. */
  var opQ = [], opBusy = false;
  function pump() { if (opBusy || !opQ.length) return; opBusy = true; opQ.shift()(function () { opBusy = false; pump(); }); }
  function removeLine(key, row) {
    if (row.getAttribute('data-aac-doomed')) return;   // already queued for removal
    row.setAttribute('data-aac-doomed', '1');
    row.classList.add('aac-confirming');
    opQ.push(function (done) {
      var t0 = Date.now();
      cartChange({ id: key, quantity: 0 })
        .then(function (cart) {
          var wait = Math.max(0, 560 - (Date.now() - t0));   // let the shimmer sweep finish
          setTimeout(function () {
            var h = row.offsetHeight; row.style.maxHeight = h + 'px';
            requestAnimationFrame(function () { row.classList.remove('aac-confirming'); row.classList.add('aac-removing'); });
            setTimeout(function () { if (row.parentNode) row.parentNode.removeChild(row); applyMeta(cart); announce('Item removed'); done(); }, 300);
          }, wait);
        })
        .catch(function () { row.classList.remove('aac-confirming'); row.removeAttribute('data-aac-doomed'); loadCart(); done(); });
    });
    pump();
  }
  var qtyT = {};
  function qtyChange(key, qty, row) {
    if (row) row.classList.add('aac-busy');
    if (qtyT[key]) clearTimeout(qtyT[key]);
    qtyT[key] = setTimeout(function () {
      delete qtyT[key];
      opQ.push(function (done) {
        cartChange({ id: key, quantity: qty })
          .then(function (cart) {
            if (row) {
              row.classList.remove('aac-busy');
              var it = (cart.items || []).filter(function (i) { return i.key === key; })[0];
              var lt = $('[data-aac-linetotal]', row); if (lt && it) lt.textContent = money(it.final_line_price);
            }
            applyMeta(cart); announce('Cart updated'); done();
          })
          .catch(function () { if (row) row.classList.remove('aac-busy'); loadCart(); done(); });
      });
      pump();
    }, DEBOUNCE);
  }
  function changeLine(key, qty, row) {
    qty = Math.max(0, qty);
    if (qty <= 0) { if (row) removeLine(key, row); }
    else qtyChange(key, qty, row);
  }
  function changeVariant(id, qty) {
    id = String(id);
    fetch('/cart/change.js', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ id: id, quantity: Math.max(0, qty) })
    })
      .then(function (r) { return r.json(); })
      .then(render)
      .catch(function () { loadCart(); });
  }
  var focusReturn = null;
  function focusable(panel) {
    return $$('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])', panel)
      .filter(function (el) { return el.offsetParent !== null; });
  }
  function openDrawer() {
    var d = drawer(); if (!d) return;
    if (d.classList.contains('active')) return;   // already open
    focusReturn = document.activeElement;
    var panel = $('.aac__panel', d);
    // Two-step so the slide transition actually fires: .active makes it visible at the
    // CLOSED position (painted this frame), then .aac-in (next frame) moves the transform
    // -> the browser has a start state to transition FROM. (Combining them makes the
    // panel snap in because visibility + transform change in the same frame.)
    d.classList.add('active');
    document.body.classList.add('overflow-hidden', 'aa-overlay-open');
    requestAnimationFrame(function () { requestAnimationFrame(function () { d.classList.add('aac-in'); }); });
    setTimeout(function () { var f = $('[data-aac-close]', d) || panel; if (f) f.focus(); }, 60);
  }
  function closeDrawer() {
    var d = drawer(); if (!d) return;
    d.classList.remove('active', 'aac-in');   // CSS transition drives the slide-out
    document.body.classList.remove('overflow-hidden', 'aa-overlay-open');
    if (focusReturn && focusReturn.focus) { try { focusReturn.focus(); } catch (e) {} }
  }
  function defineElement() {
    if (customElements.get('cart-drawer')) return;
    customElements.define('cart-drawer', class extends HTMLElement {
      open() { openDrawer(); }
      close() { closeDrawer(); }
    });
  }
  document.addEventListener('click', function (e) {
    var d = drawer(); if (!d || !d.classList.contains('active')) return;
    if (e.target.closest('[data-aac-close]')) { e.preventDefault(); closeDrawer(); return; }
    // backdrop click: anything inside the drawer chrome but outside the panel
    if (d.contains(e.target) && !e.target.closest('.aac__panel')) { e.preventDefault(); closeDrawer(); }
  });
  document.addEventListener('keydown', function (e) {
    var d = drawer(); if (!d || !d.classList.contains('active')) return;
    if (e.key === 'Escape') { closeDrawer(); return; }
    if (e.key === 'Tab') {
      var panel = $('.aac__panel', d); if (!panel) return;
      var f = focusable(panel); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener('click', function (e) {
    var row = e.target.closest && e.target.closest('[data-aac-line]');
    if (!row) return;
    var key = row.getAttribute('data-key');
    var qEl = row.querySelector('[data-aac-qty]');
    var cur = parseInt(qEl && qEl.textContent, 10) || 1;
    if (e.target.closest('[data-aac-inc]')) {
      e.preventDefault(); cur += 1; if (qEl) qEl.textContent = cur; changeLine(key, cur, row);
    } else if (e.target.closest('[data-aac-dec]')) {
      e.preventDefault(); cur -= 1;
      if (cur <= 0) { changeLine(key, 0, row); }
      else { if (qEl) qEl.textContent = cur; changeLine(key, cur, row); }
    } else if (e.target.closest('[data-aac-remove]')) {
      e.preventDefault(); changeLine(key, 0, row);
    }
  });
  document.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('[data-aac-checkout]');
    if (!c) return;
    if (c.classList.contains('aac-loading')) { e.preventDefault(); return; }
    c.classList.add('aac-loading');
  });
  document.addEventListener('change', function (e) {
    var sel = e.target.closest && e.target.closest('[data-aac-variant]');
    if (!sel) return;
    var key = sel.getAttribute('data-key');
    var newId = sel.value;
    var cur = sel.getAttribute('data-current');
    if (!newId || newId === cur) return;
    var row = sel.closest('[data-aac-line]');
    var qEl = row && row.querySelector('[data-aac-qty]');
    var qty = parseInt(qEl && qEl.textContent, 10) || 1;
    swapVariant(key, newId, qty);
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-aac-rec]');
    if (!b) return;
    e.preventDefault();
    var vid = b.getAttribute('data-variant'); if (!vid) return;
    var card = b.closest('.aac__rec'); if (card) card.remove();
    addToCart(vid, 1, null);
  });
  document.addEventListener('click', function (e) {
    var qb = e.target.closest && e.target.closest('.aa-pcard__qty-btn');
    if (!qb) return;
    e.preventDefault(); e.stopPropagation();
    var card = qb.closest('.aa-pcard');
    var inp = card && card.querySelector('input[name="id"]');
    if (!inp) return;
    var id = String(inp.value);
    var next = Math.max(0, (byVariant[id] || 0) + (qb.dataset.aaQty === 'inc' ? 1 : -1));
    byVariant[id] = next; if (next === 0) delete byVariant[id];
    syncCards();
    var t = 0; for (var k in byVariant) t += byVariant[k]; updateBubble(t);
    changeVariant(id, next);
  }, true);
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t.closest) return;
    var addBtn = t.closest('.aa-pcard__cta');
    if (addBtn && !addBtn.classList.contains('aa-pcard__cta--sold')) {
      var card = addBtn.closest('.aa-pcard');
      var inp = card && card.querySelector('input[name="id"]');
      if (inp) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); addToCart(inp.value, 1, card); }
      return;
    }
    var btn = t.closest('button[name="add"], .product-form__submit');
    if (!btn || btn.getAttribute('name') === 'checkout') return;
    if (btn.classList.contains('aa-buy-now-btn') || btn.hasAttribute('data-rzp-magic-checkout')) return; // Buy Now owns its flow
    var form = btn.closest('form');
    var fid = form && (form.querySelector('[name="id"]') || (form.elements && form.elements.namedItem && form.elements.namedItem('id')));
    if (!fid || !fid.value) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (!runGuards(form)) { closeDrawer(); return; }
    var qf = form.elements && form.elements.namedItem ? form.elements.namedItem('quantity') : form.querySelector('[name="quantity"]');
    addToCart(resolveId(form, fid.value), qf && qf.value ? qf.value : 1, form.closest('.aa-pcard, .pcard, .card-wrapper'), collectProps(form));
    runHooks(form);
  }, true);
  document.addEventListener('submit', function (e) {
    var form = e.target.closest && e.target.closest('form[action*="/cart/add"], .aa-pcard__form, .aa-rd-form, product-form form');
    if (!form) return;
    var fid = form.querySelector('[name="id"]') || (form.elements && form.elements.namedItem && form.elements.namedItem('id'));
    if (!fid || !fid.value) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (!runGuards(form)) { closeDrawer(); return; }
    var qf = form.querySelector('[name="quantity"]');
    addToCart(resolveId(form, fid.value), qf && qf.value ? qf.value : 1, form.closest('.aa-pcard, .pcard, .card-wrapper'), collectProps(form));
    runHooks(form);
  }, true);
  window.AA_addToCart = function (id, qty) { addToCart(id, qty || 1, null); };
  defineElement();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadCart);
  } else { loadCart(); }
  window.addEventListener('pageshow', loadCart);
  document.addEventListener('turbo:load', function () { defineElement(); loadCart(); });
  ['cart:updated', 'cart:added', 'cart:refresh'].forEach(function (ev) { document.addEventListener(ev, loadCart); });
})();
