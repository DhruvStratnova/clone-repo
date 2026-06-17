/* AstroAura redesign — add-to-cart -> cart drawer popup */
(function () {
  function $(s, r) { return (r || document).querySelector(s); }
  function applyDrawer(html) {
    if (!html) return;
    var d = $('cart-drawer'); if (!d) return;
    var tmp = document.createElement('div'); tmp.innerHTML = html;
    var fresh = tmp.querySelector('cart-drawer');
    if (!fresh) { var w = tmp.querySelector('[id^="shopify-section-"]'); fresh = w ? w.querySelector('cart-drawer') : null; }
    if (!fresh) return;
    d.innerHTML = fresh.innerHTML;
    d.classList.toggle('is-empty', fresh.classList.contains('is-empty'));
  }
  function applyBubble(html) {
    if (!html) return;
    var cur = $('#cart-icon-bubble'); if (!cur) return;
    var tmp = document.createElement('div'); tmp.innerHTML = html;
    var inner = tmp.querySelector('#cart-icon-bubble');
    cur.innerHTML = inner ? inner.innerHTML : tmp.innerHTML;
  }
  function openDrawer() {
    var d = $('cart-drawer');
    if (d && typeof d.open === 'function') { d.open(); return; }
    if (d) { d.classList.remove('is-empty'); d.classList.add('animate', 'active'); document.body.classList.add('overflow-hidden'); return; }
    window.location.href = '/cart';
  }
  function add(form, btn) {
    var inp = form.querySelector('input[name="id"]'); if (!inp) return;
    if (btn) { btn.classList.add('is-loading'); btn.style.opacity = '.6'; btn.disabled = true; }
    var fd = new FormData();
    fd.append('id', inp.value); fd.append('quantity', '1');
    fd.append('sections', 'cart-icon-bubble,cart-drawer');
    fd.append('sections_url', window.location.pathname);
    fetch('/cart/add.js', { method: 'POST', credentials: 'same-origin', headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: fd })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.status) { window.location.href = inp.closest('article') ? (inp.closest('article').querySelector('a.media') || {}).href || '/cart' : '/cart'; return; }
        var s = (res && res.sections) || {};
        applyDrawer(s['cart-drawer']); applyBubble(s['cart-icon-bubble']);
        document.dispatchEvent(new CustomEvent('cart:added'));
        openDrawer();
      })
      .catch(function () { form.submit(); })
      .finally(function () { if (btn) { btn.classList.remove('is-loading'); btn.style.opacity = ''; btn.disabled = false; } });
  }
  document.addEventListener('submit', function (e) {
    var form = e.target.closest && e.target.closest('.aa-rd-form');
    if (!form) return;
    e.preventDefault(); e.stopPropagation();
    add(form, form.querySelector('.add'));
  }, true);
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.aa-rd-form .add');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    add(b.closest('.aa-rd-form'), b);
  }, true);
})();
