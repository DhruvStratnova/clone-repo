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
            success: function (data) { console.log('[aa-auth] MSG91 success cb:', data); },
            failure: function (err) { console.log('[aa-auth] MSG91 failure cb:', err); }
          });
        } catch (e) { reject(e); return; }
        var tries = 0;
        (function wait() {
          if (typeof window.sendOtp === 'function') { console.log('[aa-auth] window.sendOtp ready'); resolve(); return; }
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
                console.log('[aa-auth] sendOtp success:', d);
                var rid = (typeof d === 'string') ? d : (d && (d.message || d.reqId || d.request_id));
                resolve({ ok: true, reqId: rid || null });
              },
              function (e) { console.error('[aa-auth] sendOtp failure:', e); resolve({ ok: false, error: (e && (e.message || (typeof e === 'string' ? e : JSON.stringify(e)))) || 'send failed' }); });
          });
        }).catch(function (e) { console.error('[aa-auth] widget load error:', e); return { ok: false, error: e.message }; });
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
          console.log('[aa-auth] verify HTTP ' + _status + ' response:', d);
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

  function openView(title, html) {
    var v = viewEl(); if (!v) return;
    v.querySelector('[data-view-title]').textContent = title;
    v.querySelector('[data-view-body]').innerHTML = html;
    v.hidden = false; void v.offsetWidth; requestAnimationFrame(function () { v.classList.add('aa-au-in'); });
  }
  function closeView() { var v = viewEl(); if (!v) return; v.classList.remove('aa-au-in'); setTimeout(function () { if (!v.classList.contains('aa-au-in')) v.hidden = true; }, 420); }
  function row(k, val) { return '<div class="aa-au-pf__row"><span class="aa-au-pf__k">' + k + '</span><span class="aa-au-pf__v">' + esc(val) + '</span></div>'; }

  // Dropdown items navigate to the REAL pages (/pages/account, /pages/orders).
  function openProfile() { closeMenu(); window.location.href = '/pages/account'; }
  function openOrders() { closeMenu(); window.location.href = '/pages/orders'; }
  function ordersEmpty(t, p) { return '<div class="aa-au-empty"><div class="aa-au-empty__ic"><svg viewBox="0 0 24 24" fill="none" stroke="#E9027A" stroke-width="1.6"><path d="M6 2h12l-1 7H7z"/><path d="M5 9h14l1 11H4z"/></svg></div><h3 class="aa-au-serif">' + t + '</h3><p>' + p + '</p></div>'; }

  function orderCardHTML(o) {
    var img = o.image || o.thumbnail || (o.line_items && o.line_items[0] && (o.line_items[0].image || o.line_items[0].image_url));
    var title = o.title || o.product_title || (o.line_items && o.line_items[0] && o.line_items[0].title) || ('Order ' + (o.order_number || o.name || o.id || ''));
    var num = o.name || ('Order ' + (o.order_number || o.id || ''));
    var status = o.status || o.fulfillment_status || o.financial_status || 'Order';
    var pill = /cancel|refund/i.test(status) ? 'warn' : (/deliver|fulfil|complete|paid/i.test(status) ? 'ok' : 'pend');
    var total = o.total || o.amount || o.total_price || '';
    return '<div class="aa-au-order"><div class="aa-au-order__top"><span class="aa-au-pill aa-au-' + pill + '"><span class="aa-au-dot"></span>' + esc(status) + '</span><span class="aa-au-order__date">' + esc(o.date || o.created_at || '') + '</span></div>'
      + '<div class="aa-au-order__body"><span class="aa-au-thumb">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '') + '</span>'
      + '<div class="aa-au-order__info"><div class="aa-au-ti">' + esc(title) + '</div><div class="aa-au-osub">' + esc(num) + '</div><div class="aa-au-pr">' + esc(total) + '</div></div></div></div>';
  }

  function renderOrdersPage(el) {
    var c = cfg(), sess = sessionToken(), u = acctUser() || {};
    if (!c.ordersUrl) { el.innerHTML = ordersEmpty('Orders coming soon', 'Your order history will appear here.'); return; }
    fetch(c.ordersUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: c.anonKey, Authorization: 'Bearer ' + (sess ? sess.access_token : c.anonKey) }, body: JSON.stringify({ phone: u.phone }) })
      .then(function (r) { return r.json(); }).then(function (d) {
        var list = (d && (d.orders || d.data || (Array.isArray(d) ? d : null))) || [];
        if (!list.length) { el.innerHTML = ordersEmpty('No orders yet', 'Your cosmic journey starts here.'); return; }
        el.innerHTML = '<div class="aa-au-grid">' + list.map(orderCardHTML).join('') + '</div>';
      }).catch(function () { el.innerHTML = '<div class="aa-au-loading">Could not load orders. Please try again.</div>'; });
  }

  function renderProfilePage(el) {
    var u = acctUser() || {};
    var bag = '<svg viewBox="0 0 24 24"><path d="M6 2h12l-1 7H7z"/><path d="M5 9h14l1 11H4z"/></svg>';
    el.innerHTML =
      '<h1 class="aa-au-h1 aa-au-serif">My Account</h1>' +
      '<div class="aa-au-card-s"><div class="aa-au-proftop">' +
        '<div class="aa-au-avatar" data-pf-initial>A</div>' +
        '<div><div class="aa-au-nm" data-pf-name>Aura Member</div>' +
        '<div class="aa-au-meta"><b data-pf-phone></b><span data-pf-email></span></div></div>' +
      '</div></div>' +
      '<div class="aa-au-rows"><a class="aa-au-row" href="/pages/orders">' +
        '<span class="aa-au-ri">' + bag + '</span>' +
        '<div><div class="aa-au-rt">My Orders</div><div class="aa-au-rs">Track &amp; view history</div></div>' +
        '<svg class="aa-au-chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></a></div>' +
      '<div data-pf-addr></div>' +
      '<div class="aa-au-signout"><a class="aa-au-so1" href="#" data-pf-logout>Sign out</a></div>';
    var set = function (sel, v) { var e = el.querySelector(sel); if (e) e.textContent = v; };
    function fill(name, phone, email, addresses) {
      name = name || 'Aura Member';
      set('[data-pf-name]', name); set('[data-pf-initial]', name.trim().charAt(0).toUpperCase());
      var ph = el.querySelector('[data-pf-phone]'); if (ph) ph.textContent = fmtPhone(phone);
      var em = el.querySelector('[data-pf-email]'); if (em) em.textContent = email ? ('   ' + email) : '';
      if (addresses && addresses.length) {
        var h = '<div class="aa-au-sech"><h3 class="aa-au-serif">Addresses</h3></div><div class="aa-au-addrs">';
        addresses.forEach(function (a) {
          var lines = [a.address1, a.address2, a.city, a.province, a.zip, a.country].filter(Boolean).join(', ');
          h += '<div class="aa-au-addr">' + (a.default ? '<span class="aa-au-tag">Default</span>' : '') + '<div class="aa-au-who">' + esc(a.name || name) + '</div><div class="aa-au-lines">' + esc(lines) + '</div></div>';
        });
        el.querySelector('[data-pf-addr]').innerHTML = h + '</div>';
      }
    }
    fill(u.name, u.phone, '', null);
    var c = cfg();
    if (c.profileUrl) {
      fetch(c.profileUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: c.anonKey, Authorization: 'Bearer ' + (sessionToken() ? sessionToken().access_token : c.anonKey) }, body: JSON.stringify({ phone: u.phone }) })
        .then(function (r) { return r.json(); }).then(function (d) {
          var cu = (d && (d.customer || d.profile || d)) || {};
          var nm = cu.name || ((cu.first_name || '') + ' ' + (cu.last_name || '')).trim();
          fill(nm || u.name, cu.phone || u.phone, cu.email, cu.addresses);
        }).catch(function () {});
    } else {
      fetchUser().then(function (full) { if (!full) return; var m = full.user_metadata || {}; var nm = m.first_name ? (m.first_name + ' ' + (m.last_name || '')).trim() : null; var email = (full.email && full.email.indexOf('@msg91.temp') < 0) ? full.email : ''; if (nm || email) fill(nm || u.name, u.phone, email, null); });
    }
    var lo = el.querySelector('[data-pf-logout]'); if (lo) lo.addEventListener('click', function (e) { e.preventDefault(); logout(); });
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

    if (phoneInp) phoneInp.addEventListener('input', function () { phoneInp.value = phoneInp.value.replace(/\D/g, '').slice(0, 10); clrSendErr(); });

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
      b.addEventListener('keydown', function (e) { if (e.key === 'Backspace' && !b.value && i > 0) boxes[i - 1].focus(); });
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
        if (isLoggedIn()) { openMenu(a); } else { open(); }
      }, true);
    }
  }

  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('turbo:load', init);
  document.addEventListener('shopify:section:load', init);
})();
