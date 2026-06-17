/* AstroAura: Cart variant dropdown — v3 (manual DOM swap for items + footer)
 * bump: 2026-06-03T20:35
 */
console.log('[aa-cart-variant-swap] v3 loaded — manual footer swap');
(function () {
  let inflight = false;

  async function swapVariant(select, e) {
    if (inflight) return;
    // CRITICAL: stop Dawn's cart-items.onChange from firing — it expects a
    // quantity input and crashes on getAttribute(null) for a <select>.
    if (e) {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
    const oldVariantId = parseInt(select.dataset.previousValue || '0', 10);
    const newVariantId = parseInt(select.value, 10);
    const quantity = parseInt(select.dataset.quantity || '1', 10);
    if (!oldVariantId || !newVariantId || oldVariantId === newVariantId) return;

    inflight = true;
    select.disabled = true;
    select.classList.add('aa-variant-select--loading');

    try {
      const body = {
        updates: {},
        sections: ['cart-drawer', 'cart-icon-bubble'],
        sections_url: window.location.pathname,
      };
      // Remove old variant, add new variant with same quantity.
      // Atomic: Shopify processes both updates server-side in one transaction.
      body.updates[oldVariantId] = 0;
      body.updates[newVariantId] = quantity;

      const resp = await fetch('/cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error('cart/update failed: ' + resp.status + ' — ' + errBody.slice(0, 200));
      }
      const data = await resp.json();

      console.log('[aa-swap] response keys:', Object.keys(data || {}));
      console.log('[aa-swap] sections keys:', data.sections ? Object.keys(data.sections) : '(no sections)');
      console.log('[aa-swap] item_count:', data.item_count, 'total_price:', data.total_price);

      if (data.sections && data.sections['cart-drawer']) {
        const drawerHtml = data.sections['cart-drawer'];
        console.log('[aa-swap] cart-drawer html length:', drawerHtml.length);
        const parsed = new DOMParser().parseFromString(drawerHtml, 'text/html');

        const newItems = parsed.querySelector('#CartDrawer-CartItems');
        const currentItems = document.querySelector('#CartDrawer-CartItems');
        console.log('[aa-swap] items in response:', !!newItems, '| on page:', !!currentItems);
        if (newItems && currentItems) currentItems.innerHTML = newItems.innerHTML;

        const newFooter = parsed.querySelector('.drawer__footer');
        const currentFooter = document.querySelector('.drawer__footer');
        console.log('[aa-swap] footer in response:', !!newFooter, '| on page:', !!currentFooter);
        if (newFooter) console.log('[aa-swap] response footer text:', newFooter.querySelector('.totals__total-value')?.textContent);
        if (newFooter && currentFooter) {
          currentFooter.innerHTML = newFooter.innerHTML;
          console.log('[aa-swap] footer SWAPPED. New total displayed:', document.querySelector('.totals__total-value')?.textContent);
        }

        const cartDrawerEl = document.querySelector('cart-drawer');
        if (cartDrawerEl) cartDrawerEl.classList.toggle('is-empty', data.item_count === 0);
      } else {
        console.warn('[aa-swap] NO cart-drawer in response. Full data:', data);
      }
      if (data.sections && data.sections['cart-icon-bubble']) {
        const bubbleEl = document.getElementById('cart-icon-bubble');
        if (bubbleEl) {
          const parsed = new DOMParser().parseFromString(data.sections['cart-icon-bubble'], 'text/html');
          const innerEl = parsed.querySelector('.shopify-section') || parsed.body;
          if (innerEl) bubbleEl.innerHTML = innerEl.innerHTML;
        }
      }

      // BELT-AND-SUSPENDERS: directly patch the estimated-total node from
      // data.total_price (in cents). Runs unconditionally so even if the
      // section re-render missed it, the visible total is always correct.
      try {
        if (typeof data.total_price === 'number') {
          const totalEls = document.querySelectorAll('.totals__total-value, .totals__subtotal-value, .cart-drawer__footer .totals__total-value');
          const formatted = 'Rs. ' + (data.total_price / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          totalEls.forEach((el) => { el.textContent = formatted; });
          console.log('[aa-swap] direct total patched to:', formatted, '(across', totalEls.length, 'elements)');
        }
      } catch (e) {
        console.warn('[aa-swap] direct total patch failed:', e);
      }
      scan();
    } catch (err) {
      console.error('[aa-cart-variant-swap]', err);
      // Revert UI on failure
      if (select.dataset.previousValue) select.value = select.dataset.previousValue;
    } finally {
      inflight = false;
      select.disabled = false;
      select.classList.remove('aa-variant-select--loading');
    }
  }

  function scan() {
    document.querySelectorAll('.aa-variant-select').forEach((sel) => {
      if (!sel.dataset.previousValue) {
        const opt = sel.querySelector('option[selected]') || sel.options[sel.selectedIndex];
        if (opt) sel.dataset.previousValue = opt.value;
      }
    });
  }

  // Capture-phase listener so we get the event BEFORE Dawn's cart-items
  // change listener (which is on cart-items/cart-drawer-items). This lets us
  // call stopImmediatePropagation cleanly.
  document.addEventListener(
    'change',
    (e) => {
      const sel = e.target.closest('.aa-variant-select');
      if (!sel) return;
      swapVariant(sel, e);
    },
    true, // useCapture = true
  );

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
})();
