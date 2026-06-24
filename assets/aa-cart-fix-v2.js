/* AstroAura: Cart variant dropdown — v5 (smooth, no reload)
 *
 * Fixed the v3 bug (old variant id was always 0 because scan() couldn't run
 * on the dropdown before the user opened the drawer). Reads the original
 * variant from the HTML `selected` attribute which doesn't mutate when the
 * user picks a new option. Then does a smooth DOM swap of items + footer,
 * plus a belt-and-suspenders direct text patch on the total.
 */
(function () {
  let inflight = false;

  function getOldVariantId(select) {
    // The HTML [selected] attribute stays on the originally-selected option
    // even after the user changes the dropdown — the browser only mutates the
    // .selected DOM property, not the attribute. So this gives us the variant
    // that was in the cart BEFORE this change.
    const selOpt = select.querySelector('option[selected]');
    if (selOpt) {
      const v = parseInt(selOpt.getAttribute('value') || '0', 10);
      if (v) return v;
    }
    if (select.dataset.previousValue) {
      return parseInt(select.dataset.previousValue, 10) || 0;
    }
    return 0;
  }

  function formatMoney(cents) {
    return 'Rs. ' + (cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  async function swapVariant(select, e) {
    if (inflight) return;
    if (e) {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }

    let oldVariantId = getOldVariantId(select);
    // Last resort: fetch cart and look up by line index
    if (!oldVariantId) {
      try {
        const r = await fetch('/cart.js');
        const cart = await r.json();
        const lineIdx = parseInt(select.dataset.lineIndex || '1', 10) - 1;
        if (cart.items && cart.items[lineIdx]) oldVariantId = cart.items[lineIdx].variant_id;
      } catch (e) { /* ignore */ }
    }
    const newVariantId = parseInt(select.value, 10);
    const quantity = parseInt(select.dataset.quantity || '1', 10);
    if (!oldVariantId || !newVariantId || oldVariantId === newVariantId) {
      return;
    }

    inflight = true;
    select.disabled = true;
    select.classList.add('aa-variant-select--loading');

    try {
      const body = {
        updates: {},
        sections: ['cart-drawer', 'cart-icon-bubble'],
        sections_url: window.location.pathname,
      };
      body.updates[oldVariantId] = 0;
      body.updates[newVariantId] = quantity;

      const resp = await fetch('/cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error('update failed: ' + resp.status);
      const data = await resp.json();

      // Manual DOM swap of items area + footer (smooth, no page reload)
      if (data.sections && data.sections['cart-drawer']) {
        const parsed = new DOMParser().parseFromString(data.sections['cart-drawer'], 'text/html');

        const newItems = parsed.querySelector('#CartDrawer-CartItems');
        const currentItems = document.querySelector('#CartDrawer-CartItems');
        if (newItems && currentItems) currentItems.innerHTML = newItems.innerHTML;

        const newFooter = parsed.querySelector('.drawer__footer');
        const currentFooter = document.querySelector('.drawer__footer');
        if (newFooter && currentFooter) currentFooter.innerHTML = newFooter.innerHTML;

        const cartDrawerEl = document.querySelector('cart-drawer');
        if (cartDrawerEl) cartDrawerEl.classList.toggle('is-empty', data.item_count === 0);
      }

      // Cart icon bubble
      if (data.sections && data.sections['cart-icon-bubble']) {
        const bubbleEl = document.getElementById('cart-icon-bubble');
        if (bubbleEl) {
          const parsed = new DOMParser().parseFromString(data.sections['cart-icon-bubble'], 'text/html');
          const innerEl = parsed.querySelector('.shopify-section') || parsed.body;
          if (innerEl) bubbleEl.innerHTML = innerEl.innerHTML;
        }
      }

      // Belt-and-suspenders: force the total text in case section render missed it
      if (typeof data.total_price === 'number') {
        const totalEls = document.querySelectorAll('.totals__total-value, .totals__subtotal-value');
        const formatted = formatMoney(data.total_price);
        totalEls.forEach((el) => { el.textContent = formatted; });
      }
    } catch (err) {
      console.error('[aa-cart-variant-swap]', err);
    } finally {
      inflight = false;
      // The dropdown may have been re-rendered by the section swap above —
      // any old reference to `select` is now detached from the DOM, so we
      // don't need to remove disabled / loading class.
    }
  }

  document.addEventListener(
    'change',
    (e) => {
      const sel = e.target.closest('.aa-variant-select');
      if (!sel) return;
      swapVariant(sel, e);
    },
    true,
  );
})();
