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

  document.addEventListener('click', function (e) {
    var t = e.target;

    /* keep the PDP counter honest when thumbs are clicked directly */
    var th = t.closest && t.closest('media-gallery .thumbnail-list .thumbnail');
    if (th) {
      var g = th.closest('media-gallery');
      if (g) requestAnimationFrame(function () { pdpCount(g); });
      return;
    }

    var b = t.closest && t.closest('.aa-marr');
    if (!b) return;
    /* arrows own their clicks completely — no card link, no quick view open */
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var dir = b.classList.contains('aa-marr--r') ? 1 : -1;

    /* 1 · product card: swap the img through the product's photos */
    var media = b.closest('[data-aa-imgs]');
    if (media) {
      var imgs;
      try { imgs = JSON.parse(media.getAttribute('data-aa-imgs')); } catch (_) { imgs = null; }
      var img = media.querySelector('img');
      if (!imgs || imgs.length < 2 || !img) return;
      var idx = (parseInt(media.dataset.aaIdx || '0', 10) + dir + imgs.length) % imgs.length;
      media.dataset.aaIdx = String(idx);
      img.removeAttribute('srcset');
      img.src = imgs[idx];
      /* warm the next image so the following click is instant */
      var pre = new Image();
      pre.src = imgs[(idx + dir + imgs.length) % imgs.length];
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
      requestAnimationFrame(function () { pdpCount(gal); });
    }
  }, true);
})();
