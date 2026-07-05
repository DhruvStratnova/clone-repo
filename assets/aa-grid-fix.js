/* aa-grid-fix.js — non-cart layout helpers extracted from aa-cart-v12.js so the
   lean cart (aa-cart.js) can fully own cart behaviour without us losing these:
     1) force a real 2-col CSS grid on collection / search pages (Dawn's slider
        classes sometimes beat the CSS-only override)
     2) strip any leaked .aa-img-stamp overlay from inside an open drawer
   Cart logic intentionally lives ONLY in aa-cart.js now. */
(function () {
  function isGridPage() {
    var b = document.body;
    return b && (b.classList.contains('template-collection') || b.classList.contains('template-search'));
  }
  function nuke() {
    if (!isGridPage()) return;
    var isMobile = window.innerWidth < 750;
    document.querySelectorAll('ul.product-grid, ul#product-grid').forEach(function (g) {
      ['slider', 'slider--tablet', 'slider--desktop', 'grid--peek'].forEach(function (c) { g.classList.remove(c); });
      Array.from(g.classList).forEach(function (c) { if (/^grid--\d+-col-/.test(c)) g.classList.remove(c); });
      g.style.setProperty('display', 'grid', 'important');
      g.style.setProperty('grid-template-columns', isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(230px, 1fr))', 'important');
      g.style.setProperty('overflow-x', 'visible', 'important');
      g.style.setProperty('scroll-snap-type', 'none', 'important');
      g.style.setProperty('transform', 'none', 'important');
      g.style.setProperty('flex-direction', 'row', 'important');
      g.style.setProperty('flex-wrap', 'wrap', 'important');
      g.style.setProperty('width', '100%', 'important');
      g.style.setProperty('max-width', '100%', 'important');
      g.style.setProperty('margin', '0', 'important');
      g.style.setProperty('box-sizing', 'border-box', 'important');
      g.querySelectorAll(':scope > li, :scope > .grid__item').forEach(function (it) {
        it.style.setProperty('width', '100%', 'important');
        it.style.setProperty('max-width', '100%', 'important');
        it.style.setProperty('min-width', '0', 'important');
        it.style.setProperty('flex', 'none', 'important');
        it.style.setProperty('margin', '0', 'important');
        it.style.setProperty('padding', '0', 'important');
        it.style.setProperty('scroll-snap-align', 'none', 'important');
        var card = it.querySelector('.aa-pcard, .card-wrapper, .card');
        if (card) {
          card.style.setProperty('width', '100%', 'important');
          card.style.setProperty('max-width', '100%', 'important');
          card.style.setProperty('min-width', '0', 'important');
        }
      });
    });
  }
  function killStampInDrawer() {
    document.querySelectorAll('header-drawer .aa-img-stamp, .menu-drawer .aa-img-stamp, cart-drawer .aa-img-stamp, .aa-drawer .aa-img-stamp')
      .forEach(function (s) { s.remove(); });
  }
  function run() { nuke(); killStampInDrawer(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
  window.addEventListener('load', run);
  window.addEventListener('resize', nuke);
  document.addEventListener('turbo:load', run);
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('summary.header__icon--menu, header-drawer, .menu-drawer-container')) {
      setTimeout(killStampInDrawer, 50); setTimeout(killStampInDrawer, 300);
    }
  }, true);
})();
