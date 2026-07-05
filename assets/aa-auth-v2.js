/* ============================================================
   Aura AI — login popup behaviour.
   SAFETY: does nothing on the live store until you set
     window.AA_AUTH_CONFIG = { enabled:true, ... }
   (rendered by snippets/aa-auth-config.liquid from theme settings).
   Until then the account icon behaves exactly as Shopify default.
   ============================================================ */
(function () {
  'use strict';

  function cfg() { return window.AA_AUTH_CONFIG || {}; }

  /* Establish a Supabase session client-side from the magiclink token_hash that
     msg91-verify-token-v1 returns. Persists it in the supabase-js v2 storage key
     so the rest of the site (and a shared-storage app webview) sees the login. */
  function establishSession(c, d) {
    if (!c.supabaseUrl || !d || !d.token_hash) return Promise.resolve();
    return fetch(c.supabaseUrl + '/auth/v1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': c.anonKey },
      body: JSON.stringify({ type: d.type || 'magiclink', token_hash: d.token_hash })
    }).then(function (r) { return r.json(); }).then(function (session) {
      try {
        if (session && session.access_token) {
          localStorage.setItem('sb-' + c.projectRef + '-auth-token', JSON.stringify(session));
        }
        localStorage.setItem('aa_auth_user', JSON.stringify({ id: d.supabase_user_id, phone: d.phone }));
      } catch (e) {}
      return session;
    }).catch(function () { /* session persistence is non-fatal for the UI */ });
  }

  /* ---------- OTP engine (pluggable) -----------------------------------
     Modes:
       demo   : no network. Any 6 digits pass except 000000. For previewing.
       live   : POSTs to your Supabase edge functions, then runs the
                Shopify-session bridge so the customer is logged into the store.
     Returns from verify(): { ok, redirect, error }
  --------------------------------------------------------------------- */
  // MSG91 web widget loader. The verify function (msg91-verify-token-v1) calls
  // MSG91's /widget/verifyOtp, which only accepts a reqId minted by the widget.
  // So when widget creds are configured we SEND via the widget to get a matching reqId.
  // Official MSG91 widget JS integration (otp-provider.js + initSendOTP). The reqId
  // from window.sendOtp's success is what msg91-verify-token-v1 (/widget/verifyOtp) wants.
  var _msg91 = null;
  function loadMsg91(c) {
    if (_msg91) return _msg91;
    _msg91 = new Promise(function (resolve, reject) {
      function init() {
        if (typeof window.initSendOTP !== 'function') { reject(new Error('initSendOTP not found')); return; }
        try {
          window.initSendOTP({
            widgetId: c.msg91WidgetId,
            tokenAuth: c.msg91TokenAuth,
            exposeMethods: true,
            captchaRenderId: '',
            success: function () {},
            failure: function () {}
          });
        } catch (e) { reject(e); return; }
        var tries = 0;
        (function wait() {
          if (typeof window.sendOtp === 'function') { resolve(); return; }
          if (tries++ > 240) { reject(new Error('window.sendOtp not exposed after 12s')); return; }
          setTimeout(wait, 50);
        })();
      }
      if (typeof window.initSendOTP === 'function') { init(); return; }
      var s = document.createElement('script');
      s.src = 'https://verify.msg91.com/otp-provider.js';
      s.onload = init;
      s.onerror = function () { reject(new Error('otp-provider.js failed to load (blocked?)')); };
      document.head.appendChild(s);
    });
    return _msg91;
  }

  var Engine = {
    sendOtp: function (phone) {
      var c = cfg();
      if (c.demo) { return Promise.resolve({ ok: true, reqId: 'demo_' + phone }); }
      // MSG91 widget send -> reqId compatible with the server-side widget verify
      if (c.msg91WidgetId && c.msg91TokenAuth) {
        return loadMsg91(c).then(function () {
          return new Promise(function (resolve) {
            window.sendOtp('91' + phone,
              function (d) {
                var rid = (typeof d === 'string') ? d : (d && (d.message || d.reqId || d.request_id));
                resolve({ ok: true, reqId: rid || null });
              },
              function (e) { resolve({ ok: false, error: (e && (e.message || (typeof e === 'string' ? e : JSON.stringify(e)))) || 'send failed' }); });
          });
        }).catch(function (e) { return { ok: false, error: e.message }; });
      }
      // Fallback: send-otp-v2 edge function (only matches verify if same MSG91 method)
      return fetch(c.sendOtpUrl, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, c.headers || {}),
        body: JSON.stringify({ phone: '+91' + phone, app_signature: c.appSignature || '' })
      }).then(function (r) { return r.json(); })
        .then(function (d) { return { ok: !!d.success, reqId: d.reqId, error: d.error }; })
        .catch(function (e) { return { ok: false, error: e.message }; });
    },

    verify: function (o) {
      var c = cfg();
      if (c.demo) {
        if (o.otp === '000000') return Promise.resolve({ ok: false, error: 'wrong' });
        return Promise.resolve({ ok: true, redirect: c.successUrl || '/account' });
      }
      // 1) verify the OTP with your backend -> Supabase identity + token_hash
      var _status = 0;
      return fetch(c.verifyUrl, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, c.headers || {}),
        body: JSON.stringify({
          msg91_req_id: o.reqId, otp: o.otp, phone: '+91' + o.phone,
          whatsappMarketingOptIn: !!o.wa, variant_name: 'storefront'
        })
      }).then(function (r) { _status = r.status; return r.json().catch(function () { return null; }); })
        .then(function (d) {
          if (!d || !d.success) return { ok: false, error: (d && d.error) ? (d.error + ' (HTTP ' + _status + ')') : ('verify failed (HTTP ' + _status + ')') };
          // 2) establish the Supabase session (app identity) from the token_hash
          return establishSession(c, d).then(function () {
            // optional custom hook (e.g. prime guest-checkout prefill, sync, etc.)
            var hook = (typeof c.bridge === 'function') ? c.bridge(d) : Promise.resolve();
            return Promise.resolve(hook).then(function (b) {
              return { ok: true, redirect: (b && b.redirect) || c.successUrl || '' };
            });
          });
        })
        .catch(function (e) { return { ok: false, error: e.message }; });
    }
  };

  /* ---------- popup open / close --------------------------------------- */
  function pop() { return document.getElementById('aa-au-pop'); }
  function open() {
    var p = pop(); if (!p) return;
    p.classList.add('aa-au-open'); p.setAttribute('aria-hidden', 'false'); // display:block first
    document.documentElement.style.overflow = 'hidden';
    document.body.classList.add('aa-au-locked'); // blurs the page content behind
    void p.offsetWidth; // force reflow so the slide-up transition fires from its start state
    requestAnimationFrame(function () { p.classList.add('aa-au-in'); });
    setTimeout(function () {
      try { if (matchMedia('(min-width:750px)').matches) { var i = p.querySelector('.aa-au-modal [data-phone]'); if (i) i.focus(); } } catch (e) {}
    }, 320);
  }
  function close() {
    var p = pop(); if (!p) return;
    p.classList.remove('aa-au-in'); p.setAttribute('aria-hidden', 'true'); // slide down / fade out
    document.documentElement.style.overflow = '';
    document.body.classList.remove('aa-au-locked');
    setTimeout(function () { if (!p.classList.contains('aa-au-in')) p.classList.remove('aa-au-open'); }, 420);
  }
  window.AAauth = { open: open, close: close };

  /* ---------- post-login: session, dropdown menu, profile/orders ------- */
  function sessionToken() {
    try { var raw = localStorage.getItem('sb-' + cfg().projectRef + '-auth-token'); if (!raw) return null; var s = JSON.parse(raw); return s && s.access_token ? s : null; } catch (e) { return null; }
  }
  function acctUser() { try { return JSON.parse(localStorage.getItem('aa_auth_user') || 'null'); } catch (e) { return null; } }
  // Supabase access tokens expire (~1h). Refresh with the refresh_token when stale.
  function getValidSession() {
    var c = cfg(), sess = sessionToken();
    if (!sess) return Promise.resolve(null);
    var exp = sess.expires_at ? sess.expires_at * 1000 : 0;
    if (!exp || Date.now() < exp - 60000 || !sess.refresh_token) return Promise.resolve(sess);
    return fetch(c.supabaseUrl + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: c.anonKey },
      body: JSON.stringify({ refresh_token: sess.refresh_token })
    }).then(function (r) { return r.json(); }).then(function (ns) {
      if (ns && ns.access_token) { try { localStorage.setItem('sb-' + c.projectRef + '-auth-token', JSON.stringify(ns)); } catch (e) {} return ns; }
      return sess;
    }).catch(function () { return sess; });
  }
  function isLoggedIn() { return !!sessionToken() || !!acctUser(); }
  function menuEl() { return document.getElementById('aa-au-menu'); }
  function viewEl() { return document.getElementById('aa-au-view'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmtPhone(p) { return p ? (String(p).indexOf('+') === 0 ? p : '+' + p) : ''; }

  function fetchUser() {
    var c = cfg(); var sess = sessionToken();
    if (!c.supabaseUrl || !sess) return Promise.resolve(null);
    return fetch(c.supabaseUrl + '/auth/v1/user', { headers: { apikey: c.anonKey, Authorization: 'Bearer ' + sess.access_token } })
      .then(function (r) { return r.json(); }).catch(function () { return null; });
  }

  function openMenu(trigger) {
    var m = menuEl(); if (!m) return;
    var u = acctUser() || {}, sess = sessionToken();
    var meta = (sess && sess.user && sess.user.user_metadata) || {};
    var name = meta.first_name ? (meta.first_name + ' ' + (meta.last_name || '')).trim() : (u.name || 'Aura Member');
    var setT = function (sel, v) { var e = m.querySelector(sel); if (e) e.textContent = v; };
    setT('[data-acct-name]', name);
    setT('[data-acct-phone]', fmtPhone(u.phone || (sess && sess.user && sess.user.phone)));
    setT('[data-acct-initial]', (name || 'A').trim().charAt(0).toUpperCase());
    var card = m.querySelector('.aa-au-menu__card');
    m.hidden = false;
    var r = trigger && trigger.getBoundingClientRect ? trigger.getBoundingClientRect() : { bottom: 56, right: window.innerWidth - 12 };
    card.style.top = Math.round(r.bottom + 8) + 'px';
    card.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
    fetchUser().then(function (full) {
      if (!full) return; var fm = full.user_metadata || {};
      var nm = fm.first_name ? (fm.first_name + ' ' + (fm.last_name || '')).trim() : null;
      if (nm) { setT('[data-acct-name]', nm); setT('[data-acct-initial]', nm.charAt(0).toUpperCase()); }
    });
  }
  function closeMenu() { var m = menuEl(); if (m) m.hidden = true; }

  function logout() {
    var c = cfg();
    try { localStorage.removeItem('sb-' + c.projectRef + '-auth-token'); localStorage.removeItem('aa_auth_user'); } catch (e) {}
    closeMenu(); window.location.href = '/';
  }

  function closeView() { var v = viewEl(); if (!v) return; v.classList.remove('aa-au-in'); setTimeout(function () { if (!v.classList.contains('aa-au-in')) v.hidden = true; }, 420); }
  function row(k, val) { return '<div class="aa-au-pf__row"><span class="aa-au-pf__k">' + k + '</span><span class="aa-au-pf__v">' + esc(val) + '</span></div>'; }

  // Dropdown items navigate to the REAL pages (/pages/account, /pages/orders).
  function openProfile() { closeMenu(); window.location.href = '/pages/account'; }
  function openOrders() { closeMenu(); window.location.href = '/pages/orders'; }
  function ordersEmpty(t, p) { return '<div class="aa-au-empty"><div class="aa-au-empty__ic"><svg viewBox="0 0 24 24" fill="none" stroke="#E9027A" stroke-width="1.6"><path d="M6 2h12l-1 7H7z"/><path d="M5 9h14l1 11H4z"/></svg></div><h3 class="aa-au-serif">' + t + '</h3><p>' + p + '</p></div>'; }

  // Read the user's orders straight from public.shopify_orders via Supabase REST.
  // RLS (user_id = auth.uid()) returns only this user's rows — no backend needed.
  function restGet(path) {
    var c = cfg();
    return getValidSession().then(function (sess) {
      return fetch(c.supabaseUrl + '/rest/v1/' + path, {
        headers: { apikey: c.anonKey, Authorization: 'Bearer ' + (sess ? sess.access_token : c.anonKey) }
      }).then(function (r) { return r.json(); });
    });
  }
  function moneyINR(amt, cur) {
    var n = Math.round(parseFloat(amt || 0));
    var sym = (!cur || cur === 'INR') ? '₹' : (cur + ' ');
    return sym + n.toLocaleString('en-IN');
  }
  function orderStatus(s) {
    s = (s || '').toLowerCase();
    if (s === 'cancelled' || s === 'canceled') return { label: 'Cancelled', pill: 'warn', delivered: false };
    if (s === 'fulfilled') return { label: 'Delivered', pill: 'ok', delivered: true };
    if (s === 'partial') return { label: 'Partially shipped', pill: 'pend', delivered: false };
    if (s === 'restocked') return { label: 'Restocked', pill: 'warn', delivered: false };
    return { label: 'Processing', pill: 'pend', delivered: false };
  }
  function statusIcon(pill) {
    if (pill === 'warn') return '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';
    if (pill === 'ok') return '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M5 8.2 12 4l7 4.2v7.6L12 20l-7-4.2z"/><path d="M9 12l2 2 4-4.2"/></svg>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M5 8.2 12 4l7 4.2v7.6L12 20l-7-4.2z"/><path d="M5 8.2 12 12l7-3.8M12 12v8"/></svg>';
  }
  var STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.2l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 18.9 6.1 21l1.2-6.6L2.5 9.2l6.6-.9z"/></svg>';
  // product_id -> image map from the public /products.json (no token). Cached 7 days.
  function loadProductImages() {
    if (window.__aaPImg) return Promise.resolve(window.__aaPImg);
    var c = cfg();
    return fetch(c.productImagesUrl || '/products.json').then(function (r) { return r.json(); }).then(function (m) {
      if (m && m.products) { var map = {}; m.products.forEach(function (p) { var img = p.images && p.images[0] && p.images[0].src; if (img) { map[p.id] = img; (p.variants || []).forEach(function (v) { map['v' + v.id] = img; }); } }); m = map; }
      window.__aaPImg = m || {}; return window.__aaPImg;
    }).catch(function () { window.__aaPImg = {}; return {}; });
  }
  function fillOrderImages(el) {
    loadProductImages().then(function (map) {
      function rec(pid, vid) { return map[pid] || map['v' + vid] || null; }
      el.querySelectorAll('[data-thumb-pid]').forEach(function (t) {
        var r = rec(t.getAttribute('data-thumb-pid'), t.getAttribute('data-thumb-vid'));
        var src = r && (r.i || r); // supports {i,h} and legacy string maps
        if (src) {
          var u = src + (src.indexOf('?') > -1 ? '&' : '?') + 'width=220';
          t.innerHTML = '<img src="' + u + '" alt="" loading="lazy" onerror="this.style.display=\'none\';this.parentNode.classList.add(\'aa-au-thumb--ph\')">';
        } else { t.classList.add('aa-au-thumb--ph'); }
      });
      // each item row links to its product page (handle resolved from the map)
      el.querySelectorAll('[data-link-pid]').forEach(function (a) {
        var r = rec(a.getAttribute('data-link-pid'), a.getAttribute('data-link-vid'));
        if (r && r.h) { a.setAttribute('href', '/products/' + r.h); }
        else { a.removeAttribute('href'); a.classList.add('aa-au-ditem--nolink'); }
      });
    }).catch(function () {});
  }

  function paymentLabel(raw) {
    var g = (raw.payment_gateway_names && raw.payment_gateway_names[0]) || raw.gateway || '';
    g = String(g);
    if (/cod|cash on delivery/i.test(g)) return 'Cash on Delivery (COD)';
    if (!g) return 'Online payment';
    if (/razorpay/i.test(g)) return 'Razorpay';
    return g.charAt(0).toUpperCase() + g.slice(1);
  }
  function addrHTML(t, a) {
    if (!a || !a.address1) return '';
    var nm = a.name || ((a.first_name || '') + ' ' + (a.last_name || '')).trim();
    var lines = [a.address1, a.address2, a.city, a.province, a.zip, a.country].filter(Boolean).join(', ');
    return '<div class="aa-au-daddr"><div class="aa-au-daddr__h">' + esc(t) + '</div><div class="aa-au-daddr__l"><b>' + esc(nm) + '</b><br>' + esc(lines) + (a.phone ? '<br>' + esc(a.phone) : '') + '</div></div>';
  }

  function normLine(it) {
    return {
      title: it.title || it.name || 'Item',
      variant: (it.variant_title && it.variant_title !== 'Default Title') ? it.variant_title : (it.variant || ''),
      qty: it.quantity || it.qty || 1,
      price: parseFloat(it.price != null ? it.price : (it.line_price != null ? it.line_price : 0)) || 0,
      pid: it.product_id || '', vid: it.variant_id || ''
    };
  }
  // ONE CARD PER PRODUCT — each line item is its own card (shipments/tracking can
  // differ per product with vendor split). Summary shows order number + date (no
  // price, no AWB). Expands inline to the product (clickable to its PDP),
  // payment, delivery and Track. No status, no Buy again.
  function productCardHTML(o, raw, li) {
    var ordName = raw.name || ('#' + (o.order_number || ''));
    var d = o.created_at ? new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    var qtyStr = li.qty > 1 ? ' &middot; Qty ' + li.qty : '';

    var summary = '<button class="aa-au-osum" type="button">'
      + '<span class="aa-au-thumb" data-thumb-pid="' + esc(li.pid) + '" data-thumb-vid="' + esc(li.vid) + '"></span>'
      + '<span class="aa-au-oinfo"><span class="aa-au-otitle">' + esc(li.title) + '</span>'
      + '<span class="aa-au-osub2">' + esc(ordName) + ' &middot; Placed ' + esc(d) + qtyStr + '</span></span>'
      + '<svg class="aa-au-chev2" viewBox="0 0 24 24" fill="none" stroke="#b0a39a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'
      + '</button>';

    var itemRow = '<a class="aa-au-ditem" data-link-pid="' + esc(li.pid) + '" data-link-vid="' + esc(li.vid) + '" href="#">'
      + '<span class="aa-au-thumb aa-au-dthumb" data-thumb-pid="' + esc(li.pid) + '" data-thumb-vid="' + esc(li.vid) + '"></span>'
      + '<span class="aa-au-ditem__i"><span class="aa-au-ditem__t">' + esc(li.title) + '</span>'
      + '<span class="aa-au-ditem__m">' + (li.variant ? esc(li.variant) + ' &middot; ' : '') + 'Qty ' + li.qty + '</span></span>'
      + '<span class="aa-au-ditem__p">' + moneyINR(li.price * (li.qty || 1), o.currency) + '</span>'
      + '<svg class="aa-au-ditem__go" viewBox="0 0 24 24" fill="none" stroke="#c2b3a5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></a>';

    var addrs = addrHTML('Shipping address', raw.shipping_address) + addrHTML('Billing address', raw.billing_address || raw.shipping_address);
    var delivery = addrs ? '<h3 class="aa-au-dsec">Delivery</h3><div class="aa-au-daddrs">' + addrs + '</div>' : '';
    var track = o.tracking_url ? '<div class="aa-au-dacts"><a class="aa-au-dbtn aa-au-dbtn--pri" href="' + esc(o.tracking_url) + '" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h11v8H3z"/><path d="M14 10h4l3 3v2h-7z"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/></svg>Track</a></div>' : '';

    var drop = '<div class="aa-au-dd-in"><div class="aa-au-dd-pad">'
      + '<h3 class="aa-au-dsec">Item</h3>' + itemRow
      + '<h3 class="aa-au-dsec">Payment</h3><div class="aa-au-dkv">' + esc(paymentLabel(raw)) + '</div>'
      + delivery + track
      + '</div></div>';

    return '<div class="aa-au-ocard">' + summary + drop + '</div>';
  }

  function renderOrdersPage(el) {
    if (!sessionToken()) { el.innerHTML = ordersEmpty('Please sign in', 'Sign in to see your orders.'); return; }
    restGet('shopify_orders?select=order_number,amount,currency,items,tracking_url,created_at,raw&order=created_at.desc&limit=50')
      .then(function (list) {
        if (!Array.isArray(list) || !list.length) { el.innerHTML = ordersEmpty('No orders yet', 'Your cosmic journey starts here.'); return; }
        var cards = [];
        list.forEach(function (o) {
          var raw = o.raw || {};
          var srcLines = (Array.isArray(raw.line_items) && raw.line_items.length) ? raw.line_items : (Array.isArray(o.items) ? o.items : []);
          var lines = srcLines.map(normLine);
          if (!lines.length) lines = [{ title: 'Order ' + (o.order_number || ''), variant: '', qty: 1, price: parseFloat(o.amount) || 0, pid: '', vid: '' }];
          lines.forEach(function (li) { cards.push(productCardHTML(o, raw, li)); });
        });
        el.innerHTML = '<div class="aa-au-ogrid">' + cards.join('') + '</div>';
        el.querySelectorAll('.aa-au-osum').forEach(function (b) {
          b.addEventListener('click', function () {
            var card = b.parentNode, dd = card.querySelector('.aa-au-dd-in');
            var open = card.classList.toggle('aa-au-open');
            dd.style.maxHeight = open ? (dd.scrollHeight + 40) + 'px' : '0px';
          });
        });
        fillOrderImages(el);
      }).catch(function () { el.innerHTML = '<div class="aa-au-loading">Could not load orders. Please try again.</div>'; });
  }

  function renderProfilePage(el) {
    var u = acctUser() || {};
    var bag = '<svg viewBox="0 0 24 24"><path d="M6 2h12l-1 7H7z"/><path d="M5 9h14l1 11H4z"/></svg>';
    el.innerHTML =
      '<h1 class="aa-au-h1 aa-au-serif">My Account</h1>' +
      '<div class="aa-au-card-s"><div class="aa-au-proftop">' +
        '<div class="aa-au-avatar" data-pf-initial>A</div>' +
        '<div style="min-width:0"><div class="aa-au-nm" data-pf-name>Aura Member</div>' +
        '<div class="aa-au-meta"><b data-pf-phone></b><span data-pf-email></span></div></div>' +
      '</div></div>' +
      '<div class="aa-au-rows"><a class="aa-au-row" href="/pages/orders">' +
        '<span class="aa-au-ri">' + bag + '</span><div><div class="aa-au-rt">My Orders</div><div class="aa-au-rs">Track &amp; view history</div></div>' +
        '<svg class="aa-au-chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></a></div>' +
      '<div class="aa-au-sech"><h3 class="aa-au-serif">Addresses</h3></div>' +
      '<div class="aa-au-addrs" data-pf-addrs><div class="aa-au-loading">Loading…</div></div>' +
      '<div class="aa-au-signout"><a class="aa-au-so1" href="#" data-pf-logout>Sign out</a></div>';
    var setT = function (s, v) { var e = el.querySelector(s); if (e) e.textContent = v; };
    setT('[data-pf-phone]', fmtPhone(u.phone));
    el.querySelector('[data-pf-logout]').addEventListener('click', function (e) { e.preventDefault(); logout(); });
    if (!sessionToken()) { var b0 = el.querySelector('[data-pf-addrs]'); if (b0) b0.innerHTML = '<div class="aa-au-addr"><div class="aa-au-lines">Sign in to see your details.</div></div>'; return; }
    restGet('shopify_orders?select=raw&order=created_at.desc&limit=40').then(function (rows) {
      rows = Array.isArray(rows) ? rows : [];
      var raw0 = rows[0] && rows[0].raw;
      if (raw0) {
        var sa0 = raw0.shipping_address || {}, c0 = raw0.customer || {};
        var name = sa0.name || ((c0.first_name || '') + ' ' + (c0.last_name || '')).trim() || u.name || 'Aura Member';
        setT('[data-pf-name]', name); setT('[data-pf-initial]', name.trim().charAt(0).toUpperCase());
        var email = raw0.email || c0.email || ''; if (email && email.indexOf('@msg91.temp') < 0) { var em = el.querySelector('[data-pf-email]'); if (em) em.textContent = '   ' + email; }
        if (sa0.phone) setT('[data-pf-phone]', fmtPhone(sa0.phone));
      }
      var seen = {}, addrs = [];
      rows.forEach(function (r) { var a = r.raw && r.raw.shipping_address; if (!a || !a.address1) return; var k = (a.address1 + '|' + (a.zip || '') + '|' + (a.address2 || '') + '|' + (a.name || '')).toLowerCase().replace(/\s+/g, ''); if (seen[k]) return; seen[k] = 1; addrs.push(a); });
      var box = el.querySelector('[data-pf-addrs]'); if (!box) return;
      if (!addrs.length) { box.innerHTML = '<div class="aa-au-addr"><div class="aa-au-lines">No saved addresses yet.</div></div>'; return; }
      box.innerHTML = addrs.map(function (a, i) {
        var lines = [a.address1, a.address2, a.city, a.province, a.zip, a.country].filter(Boolean).join(', ');
        var nm = a.name || ((a.first_name || '') + ' ' + (a.last_name || '')).trim();
        return '<div class="aa-au-addr">' + (i === 0 ? '<span class="aa-au-tag">Default</span>' : '') + '<div class="aa-au-who">' + esc(nm) + '</div><div class="aa-au-lines">' + esc(lines) + (a.phone ? '<br>' + esc(a.phone) : '') + '</div></div>';
      }).join('');
    }).catch(function () { var box = el.querySelector('[data-pf-addrs]'); if (box) box.innerHTML = '<div class="aa-au-addr"><div class="aa-au-lines">Could not load addresses.</div></div>'; });
  }

  function renderAuthPage() {
    var pr = document.querySelector('[data-aa-render]');
    if (!pr || pr.__aaRendered) return; pr.__aaRendered = true;
    if (!isLoggedIn()) {
      pr.innerHTML = '<div class="aa-au-empty"><div class="aa-au-empty__ic"><svg viewBox="0 0 24 24" fill="none" stroke="#E9027A" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg></div><h3 class="aa-au-serif">Please sign in</h3><p>Sign in with your mobile number to view this.</p><a class="aa-au-btn" href="#" data-aa-signin style="max-width:230px;margin:0 auto">Sign in</a></div>';
      var b = pr.querySelector('[data-aa-signin]'); if (b) b.addEventListener('click', function (e) { e.preventDefault(); open(); });
      return;
    }
    if (pr.getAttribute('data-aa-render') === 'profile') renderProfilePage(pr); else renderOrdersPage(pr);
  }

  /* ---------- per-scope step flow -------------------------------------- */
  function show(scope, name) {
    scope.querySelectorAll('[data-step]').forEach(function (s) {
      s.classList.toggle('aa-au-on', s.getAttribute('data-step') === name);
    });
  }
  function fmt(v) { v = (v || '').replace(/\D/g, ''); return v.replace(/(\d{5})(\d{0,5})/, '$1 $2').trim(); }

  function wireScope(scope) {
    if (scope.__aaWired) return; scope.__aaWired = true;
    var phoneInp = scope.querySelector('[data-phone]');
    var waBox = scope.querySelector('[data-wa]');
    var sendBtn = scope.querySelector('[data-send]');
    var otpWrap = scope.querySelector('[data-otp]');
    var boxes = [].slice.call(scope.querySelectorAll('[data-otp] input'));
    var echo = scope.querySelector('[data-echo]');
    var errEl = scope.querySelector('[data-err]');
    var resendEl = scope.querySelector('[data-resend]');
    var changeEl = scope.querySelector('[data-change]');
    var verifyBtn = scope.querySelector('[data-verify]');
    var sendErr = scope.querySelector('[data-send-err]');
    var state = { reqId: null, phone: '', timer: null };

    function showErr(msg) { otpWrap.classList.add('aa-au-err'); errEl.textContent = msg; errEl.classList.add('aa-au-show'); }
    function clrErr() { otpWrap.classList.remove('aa-au-err'); errEl.classList.remove('aa-au-show'); }
    function showSendErr(msg) { if (sendErr) { sendErr.textContent = msg; sendErr.classList.add('aa-au-show'); } }
    function clrSendErr() { if (sendErr) sendErr.classList.remove('aa-au-show'); phoneInp.style.borderColor = ''; }

    if (phoneInp) {
      phoneInp.addEventListener('input', function () { phoneInp.value = phoneInp.value.replace(/\D/g, '').slice(0, 10); clrSendErr(); });
      phoneInp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); sendBtn.click(); } });
    }

    sendBtn.addEventListener('click', function () {
      var raw = (phoneInp.value || '').replace(/\D/g, '');
      if (raw.length !== 10) { phoneInp.focus(); phoneInp.style.borderColor = '#b9472f'; showSendErr('Please enter a valid 10-digit mobile number.'); return; }
      clrSendErr();
      state.phone = raw;
      var label = sendBtn.innerHTML;
      sendBtn.innerHTML = '<span class="aa-au-spin"></span>'; sendBtn.disabled = true;
      Engine.sendOtp(raw).then(function (res) {
        sendBtn.disabled = false; sendBtn.innerHTML = label;
        if (!res.ok) { phoneInp.style.borderColor = '#b9472f'; showSendErr(res.error || 'Could not send OTP. Please try again.'); return; }
        state.reqId = res.reqId;
        if (echo) echo.textContent = fmt(raw);
        show(scope, 'otp'); startTimer(); if (boxes[0]) boxes[0].focus();
      });
    });

    boxes.forEach(function (b, i) {
      b.addEventListener('input', function () { b.value = b.value.replace(/\D/g, ''); if (b.value && i < boxes.length - 1) boxes[i + 1].focus(); clrErr(); });
      b.addEventListener('keydown', function (e) { if (e.key === 'Backspace' && !b.value && i > 0) boxes[i - 1].focus(); else if (e.key === 'Enter') { e.preventDefault(); verifyBtn.click(); } });
      b.addEventListener('paste', function (e) {
        var t = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
        if (t.length) { e.preventDefault(); boxes.forEach(function (x, k) { x.value = t[k] || ''; }); (boxes[Math.min(t.length, 5)] || boxes[5]).focus(); clrErr(); }
      });
    });

    function startTimer() {
      var t = 30; clearInterval(state.timer);
      resendEl.innerHTML = 'Resend in <b>0:30</b>';
      state.timer = setInterval(function () {
        t--; if (t <= 0) { clearInterval(state.timer); resendEl.innerHTML = '<span class="aa-au-change" data-resend-now>Resend code</span>'; var rn = resendEl.querySelector('[data-resend-now]'); if (rn) rn.addEventListener('click', function () { sendBtn.click(); }); return; }
        var bb = resendEl.querySelector('b'); if (bb) bb.textContent = '0:' + (t < 10 ? '0' : '') + t;
      }, 1000);
    }

    if (changeEl) changeEl.addEventListener('click', function () { show(scope, 'phone'); });

    verifyBtn.addEventListener('click', function () {
      var code = boxes.map(function (b) { return b.value; }).join('');
      if (code.length < 6) { showErr('Please enter all 6 digits.'); return; }
      var label = verifyBtn.innerHTML;
      verifyBtn.innerHTML = '<span class="aa-au-spin"></span>'; verifyBtn.disabled = true;
      Engine.verify({ reqId: state.reqId, otp: code, phone: state.phone, wa: waBox && waBox.checked }).then(function (res) {
        verifyBtn.disabled = false; verifyBtn.innerHTML = label;
        if (!res.ok) { showErr(res.error || 'That code didn’t match. Please try again.'); boxes.forEach(function (b) { b.value = ''; }); boxes[0].focus(); return; }
        show(scope, 'done');
        setTimeout(function () {
          if (res.redirect) { window.location.href = res.redirect; }
          else { close(); window.location.reload(); }
        }, 1100);
      });
    });
  }

  /* ---------- bootstrap ------------------------------------------------ */
  function init() {
    var p = pop(); if (!p) return;
    if (!p.__aaClose) {
      p.__aaClose = true;
      p.querySelectorAll('[data-aa-au-close]').forEach(function (el) { el.addEventListener('click', close); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); closeMenu(); closeView(); } });
      // click on empty space (the wrap, not the modal/sheet) closes
      var wrap = p.querySelector('.aa-au-pop__wrap');
      if (wrap) wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    }

    // wire the post-login dropdown + view once
    var menu = menuEl();
    if (menu && !menu.__aaWired) {
      menu.__aaWired = true;
      menu.querySelectorAll('[data-acct-close]').forEach(function (el) { el.addEventListener('click', closeMenu); });
      var pb = menu.querySelector('[data-acct-profile]'); if (pb) pb.addEventListener('click', openProfile);
      var ob = menu.querySelector('[data-acct-orders]'); if (ob) ob.addEventListener('click', openOrders);
      var lb = menu.querySelector('[data-acct-logout]'); if (lb) lb.addEventListener('click', logout);
    }
    // robust outside-click/tap close: any click outside the card AND outside the
    // icon closes the dropdown (the transparent backdrop alone can sit under a
    // higher z-index header). The icon's own click is stopPropagation'd in the
    // capture handler below, so opening never immediately re-closes.
    if (!document.__aaMenuOutside) {
      document.__aaMenuOutside = true;
      document.addEventListener('click', function (e) {
        var m = menuEl(); if (!m || m.hidden) return;
        var t = e.target;
        if (t.closest && (t.closest('.aa-au-menu__card') || t.closest('[data-aa-au-trigger]'))) return;
        closeMenu();
      });
    }
    var view = viewEl();
    if (view && !view.__aaWired) {
      view.__aaWired = true;
      view.querySelectorAll('[data-view-close]').forEach(function (el) { el.addEventListener('click', closeView); });
    }

    // render the real account/orders pages if we're on one
    renderAuthPage();
    p.querySelectorAll('[data-aa-au-scope]').forEach(wireScope);

    // Intercept EVERY route to Shopify's hosted account/login and open our popup
    // instead. Capture phase + stopPropagation so we beat Turbo Drive navigation.
    if (cfg().enabled && !document.__aaTrigger) {
      document.__aaTrigger = true;
      document.addEventListener('click', function (e) {
        var a = e.target.closest ? e.target.closest('a[href], [data-aa-au-trigger]') : null;
        if (!a) return;
        var href = a.getAttribute('href') || '';
        if (/\/account\/logout/.test(href)) return; // let logout pass through
        var isAccount = a.hasAttribute('data-aa-au-trigger')
          || /\/account(\/login|\/register)?($|[/?#])/.test(href)
          || /account_login|customer_authentication/.test(href)
          || /shopify\.com\/[0-9]+\/account/.test(href);
        if (!isAccount) return;
        e.preventDefault(); e.stopPropagation();
        if (isLoggedIn()) {
          // toggle the anchored account dropdown (modal style on tap)
          var mm = menuEl();
          if (mm && !mm.hidden) { closeMenu(); }
          else { if (mm) mm.classList.remove('aa-au-menu--hover'); openMenu(a); }
        } else { open(); }
      }, true);
    }
  }

  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('turbo:load', init);
  document.addEventListener('shopify:section:load', init);
})();
