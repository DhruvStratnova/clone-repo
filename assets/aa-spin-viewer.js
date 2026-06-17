/* AstroAura 360 Spin Viewer
   Activates on any .aa-spin-viewer element. Drag (mouse) or swipe (touch)
   horizontally to cycle through pre-rendered spin frames. */
(function () {
  function init(viewer) {
    if (viewer.dataset.aaBound) return;
    viewer.dataset.aaBound = '1';

    var frames = viewer.querySelectorAll('.aa-spin-viewer__frame');
    var frameCount = frames.length;
    if (frameCount < 2) return;

    var currentFrame = 0;
    var dragging = false;
    var startX = 0;
    var startFrame = 0;
    var pixelsPerFrame = 0;

    function setFrame(idx) {
      var next = ((idx % frameCount) + frameCount) % frameCount;
      if (next === currentFrame) return;
      frames[currentFrame].classList.remove('is-active');
      frames[next].classList.add('is-active');
      currentFrame = next;
    }

    function getX(e) {
      return e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
    }

    function recalcSensitivity() {
      // One full 360 = drag the viewer width worth of pixels
      var width = viewer.getBoundingClientRect().width;
      pixelsPerFrame = Math.max(4, Math.floor(width / frameCount));
    }

    function onStart(e) {
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true;
      startX = getX(e);
      startFrame = currentFrame;
      recalcSensitivity();
      viewer.classList.add('aa-spin-viewer--dragging', 'aa-spin-viewer--touched');
    }

    function onMove(e) {
      if (!dragging) return;
      var x = getX(e);
      if (x === undefined) return;
      // Prevent the page / slider from scrolling horizontally while spinning
      if (e.cancelable) e.preventDefault();
      var deltaX = x - startX;
      var frameDelta = Math.round(deltaX / pixelsPerFrame);
      setFrame(startFrame + frameDelta);
    }

    function onEnd() {
      if (!dragging) return;
      dragging = false;
      viewer.classList.remove('aa-spin-viewer--dragging');
    }

    function onKey(e) {
      if (e.key === 'ArrowLeft') { setFrame(currentFrame - 1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { setFrame(currentFrame + 1); e.preventDefault(); }
    }

    viewer.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    viewer.addEventListener('touchstart', onStart, { passive: true });
    viewer.addEventListener('touchmove', onMove, { passive: false });
    viewer.addEventListener('touchend', onEnd);
    viewer.addEventListener('touchcancel', onEnd);

    viewer.addEventListener('keydown', onKey);

    window.addEventListener('resize', recalcSensitivity);
  }

  function scan() {
    document.querySelectorAll('.aa-spin-viewer').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  // Re-scan after Shopify Section Rendering API swaps (e.g. variant change)
  document.addEventListener('shopify:section:load', scan);
  document.addEventListener('shopify:block:select', scan);
})();
