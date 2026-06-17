/* AstroAura — Turbo Drive config for instant SPA-style navigation.
   Turbo intercepts internal link taps and swaps only the <body> (no full
   reload) = instant on iOS + Android. We keep forms on normal submit and force
   a full load for dynamic / off-theme routes so nothing breaks. */
(function () {
  function configure() {
    if (typeof Turbo === 'undefined') return false;
    // Do NOT let Turbo hijack form submits — cart adds are AJAX (our handler),
    // and newsletter/localization/checkout forms must submit normally.
    try { if (Turbo.config && Turbo.config.forms) Turbo.config.forms.mode = 'off'; } catch (e) {}
    try { if (typeof Turbo.setFormMode === 'function') Turbo.setFormMode('off'); } catch (e) {}
    // Suppress Turbo's native progress bar — we drive our own .aa-loadbar (with a
    // 180ms delay so instant navs never flash). Avoids two bars on slow loads.
    try { if (Turbo.config && Turbo.config.drive) Turbo.config.drive.progressBarDelay = 86400000; } catch (e) {}
    try { window.AA_TURBO = true; } catch (e) {}
    return true;
  }
  if (!configure()) {
    document.addEventListener('DOMContentLoaded', configure);
    window.addEventListener('load', configure);
  }

  // Routes that MUST do a real full navigation (dynamic state / off-theme).
  // /products is included because the Judge.me review widget only renders on a
  // real page load (DOMContentLoaded) — it does NOT re-render on a Turbo
  // body-swap, so product pages must full-load. They're still prefetched, so the
  // full load is served from cache and stays fast.
  var FULL_LOAD = /(\/products\/)|((\/cart|\/checkout|\/account|\/orders|\/tools\/|\/challenge|\/[a-z]{2}(-[a-z]{2})?\/cart)(\/|$|\?|#))/i;

  document.addEventListener('turbo:before-visit', function (e) {
    var url = (e.detail && e.detail.url) || '';
    var sameOrigin = false;
    try { sameOrigin = new URL(url, location.href).origin === location.origin; } catch (err) {}
    if (!sameOrigin || FULL_LOAD.test(url)) {
      e.preventDefault();
      window.location.href = url;
    }
  });

  // Safety: if Turbo ever errors loading a page, fall back to a full load.
  document.addEventListener('turbo:fetch-request-error', function (e) {
    if (e.detail && e.detail.request && e.detail.request.url) window.location.href = e.detail.request.url;
  });
})();
