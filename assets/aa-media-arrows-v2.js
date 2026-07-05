/* AstroAura desktop media arrows (approved wireframe 2026-06-12).
   One delegated controller for all three contexts:
   1. product cards  — cycle the card's photos in place (data-aa-imgs)
   2. quick view     — advance the .qv-slider inside .qv-stage
   3. PDP gallery    — drive Dawn's thumbnail selection + "n / N" counter
   Singleton on window: survives Turbo navigations (inline/section scripts
   do not re-execute on SPA swaps — listeners live on document). */
(function () {
  if (window.__aaMediaArrows) return;
  window.__aaMediaArrows = true;

  function pdpThumbs(gal) {
    return [].slice.call(gal.querySelectorAll('.thumbnail-list .thumbnail'));
  }
  function pdpCurrent(thumbs) {
    for (var i = 0; i < thumbs.length; i++) {
      if (thumbs[i].getAttribute('aria-current') === 'true') return i;
    }
    return 0;
  }
  function pdpCount(gal) {
    var c = gal.querySelector('.aa-mcount');
    if (!c) return;
    var thumbs = pdpThumbs(gal);
    if (thumbs.length) c.textContent = (pdpCurrent(thumbs) + 1) + ' / ' + thumbs.length;
  }

  /* PDP: the slider-component can be taller than the visible media (thumbs,
     stacked layouts) — anchor arrows + counter to the ACTIVE media's box */
  function alignPdp() {
    if (!window.matchMedia('(min-width: 750px)').matches) return;
    [].forEach.call(document.querySelectorAll('media-gallery'), function (gal) {
      var l = gal.querySelector('.aa-marr--l'), r = gal.querySelector('.aa-marr--r');
      if (!l || !r) return;
      var item = gal.querySelector('.product__media-item.is-active') || gal.querySelector('.product__media-item');
      if (!item || !item.offsetHeight) return;
      var mid = item.offsetTop + item.offsetHeight / 2;
      l.style.top = mid + 'px';
      r.style.top = mid + 'px';
      var c = gal.querySelector('.aa-mcount');
      if (c) { c.style.top = (item.offsetTop + item.offsetHeight - 14) + 'px'; c.style.bottom = 'auto'; c.style.transform = 'translateY(-100%)'; }
    });
  }
  ['turbo:load', 'turbo:render'].forEach(function (ev) { document.addEventListener(ev, function () { setTimeout(alignPdp, 60); }); });
  window.addEventListener('resize', function () { requestAnimationFrame(alignPdp); });
  window.addEventListener('load', alignPdp);
  if (document.readyState !== 'loading') setTimeout(alignPdp, 0);
  else document.addEventListener('DOMContentLoaded', alignPdp);

  document.addEventListener('click', function (e) {
    var t = e.target;

    /* keep the PDP counter honest when thumbs are clicked directly */
    var th = t.closest && t.closest('media-gallery .thumbnail-list .thumbnail');
    if (th) {
      var g = th.closest('media-gallery');
      if (g) requestAnimationFrame(function () { pdpCount(g); alignPdp(); });
      return;
    }

    var b = t.closest && t.closest('.aa-marr');
    if (!b) return;
    /* arrows own their clicks completely — no card link, no quick view open */
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var dir = b.classList.contains('aa-marr--r') ? 1 : -1;

    /* 1 · product card: swap the img through the product's photos.
       The new image is fully DECODED before the swap (no blank/half-paint
       flash), and non-first images get .aa-cycled which neutralises the
       card zoom (infographics were being cropped by scale(1.16+)). */
    var media = b.closest('[data-aa-imgs]');
    if (media) {
      var imgs;
      try { imgs = JSON.parse(media.getAttribute('data-aa-imgs')); } catch (_) { imgs = null; }
      var img = media.querySelector('img');
      if (!imgs || imgs.length < 2 || !img) return;
      var len = imgs.length;
      var idx = (parseInt(media.dataset.aaIdx || '0', 10) + dir + len) % len;
      var url = imgs[idx];
      var cache = media.__aaPre = media.__aaPre || {};
      var seq = (media.__aaSeq = (media.__aaSeq || 0) + 1);
      function apply() {
        if (media.__aaSeq !== seq) return; /* a newer click superseded this one */
        media.dataset.aaIdx = String(idx);
        media.classList.toggle('aa-cycled', idx !== 0);
        img.removeAttribute('srcset');
        img.src = url;
        var warm = imgs[(idx + dir + len) % len];
        if (!cache[warm]) { cache[warm] = new Image(); cache[warm].src = warm; }
      }
      var pre = cache[url] = cache[url] || new Image();
      if (!pre.src) pre.src = url;
      if (pre.complete) { apply(); }
      else if (pre.decode) { pre.decode().catch(function () {}).then(apply); }
      else { pre.onload = apply; pre.onerror = apply; }
      return;
    }

    /* 2 · quick view stage */
    var stage = b.closest('.qv-stage');
    if (stage) {
      var s = stage.querySelector('.qv-slider');
      if (!s || !s.clientWidth) return;
      var w = s.clientWidth;
      var count = Math.max(1, Math.round(s.scrollWidth / w));
      var n = (Math.round(s.scrollLeft / w) + dir + count) % count;
      s.scrollTo({ left: n * w, behavior: 'smooth' });
      return;
    }

    /* 3 · PDP gallery (desktop thumbnail layout) */
    var gal = b.closest('media-gallery');
    if (gal) {
      var thumbs = pdpThumbs(gal);
      if (!thumbs.length) return;
      var ni = (pdpCurrent(thumbs) + dir + thumbs.length) % thumbs.length;
      thumbs[ni].click();
      requestAnimationFrame(function () { pdpCount(gal); alignPdp(); });
    }
  }, true);
})();
