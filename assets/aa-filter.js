/* aa-filter.js — custom collection filter (replaces Dawn facets).
   Reads data-purpose/zodiac/planet/category/price off each #product-grid > li,
   computes live counts, hides zero-count options, filters instantly.
   AND across groups, OR within a group. Price = bucket ranges. */
(function () {
  function init() {
    var root = document.querySelector('.aa-fltr');
    var grid = document.getElementById('product-grid');
    if (!root || !grid || root.dataset.aaBound) return;
    root.dataset.aaBound = '1';

    var items = Array.prototype.slice.call(grid.querySelectorAll(':scope > li.grid__item'));
    var originalOrder = items.slice();
    items.forEach(function (li) {
      li._f = {
        purpose: split(li.getAttribute('data-purpose')),
        zodiac: split(li.getAttribute('data-zodiac')),
        planet: split(li.getAttribute('data-planet')),
        category: split(li.getAttribute('data-category')),
        price: parseFloat(li.getAttribute('data-price') || '0')
      };
      var t = li.querySelector('.aa-pcard__title, .card__heading');
      li._t = (t ? t.textContent : '').trim().toLowerCase();
    });
    function split(s) { return (s || '').split('|').map(function (x) { return x.trim(); }).filter(Boolean); }

    // count per option, write count, hide zero-count
    Array.prototype.slice.call(root.querySelectorAll('.aa-fltr__opt')).forEach(function (opt) {
      var g = opt.getAttribute('data-group'), n;
      if (g === 'price') {
        var lo = +opt.getAttribute('data-lo'), hi = +opt.getAttribute('data-hi');
        n = items.filter(function (li) { return li._f.price >= lo && li._f.price < hi; }).length;
      } else {
        var v = opt.getAttribute('data-value');
        n = items.filter(function (li) { return li._f[g].indexOf(v) > -1; }).length;
      }
      var c = opt.querySelector('.aa-fltr__cnt'); if (c) c.textContent = '(' + n + ')';
      if (n === 0) opt.hidden = true;
    });
    // hide a whole facet group if it has no visible options
    Array.prototype.slice.call(root.querySelectorAll('.aa-fltr__grp')).forEach(function (grp) {
      if (grp.getAttribute('data-group') === 'price') return;
      var any = grp.querySelector('.aa-fltr__opt:not([hidden])');
      if (!any) grp.hidden = true;
    });

    function selectedVals(g) {
      return Array.prototype.slice.call(root.querySelectorAll('.aa-fltr__opt[data-group="' + g + '"] input:checked'))
        .map(function (i) { return i.closest('.aa-fltr__opt'); });
    }

    function apply() {
      var groups = ['purpose', 'zodiac', 'planet', 'category'];
      var sel = {}; groups.forEach(function (g) { sel[g] = selectedVals(g); });
      var priceSel = selectedVals('price');
      var minEl = root.querySelector('[data-aa-min]'), maxEl = root.querySelector('[data-aa-max]');
      var minV = (minEl && minEl.value !== '') ? parseFloat(minEl.value) : null;
      var maxV = (maxEl && maxEl.value !== '') ? parseFloat(maxEl.value) : null;
      var useRange = minV !== null || maxV !== null;
      var rangeLo = minV !== null ? minV : 0, rangeHi = maxV !== null ? maxV : Infinity;
      var priceCount = useRange ? 1 : priceSel.length;
      var totalSel = priceCount; groups.forEach(function (g) { totalSel += sel[g].length; });
      var shown = 0;

      items.forEach(function (li) {
        var ok = true;
        for (var i = 0; i < groups.length && ok; i++) {
          var g = groups[i], s = sel[g];
          if (!s.length) continue;
          var match = s.some(function (o) { return li._f[g].indexOf(o.getAttribute('data-value')) > -1; });
          if (!match) ok = false;
        }
        if (ok && useRange) {
          if (!(li._f.price >= rangeLo && li._f.price <= rangeHi)) ok = false;
        } else if (ok && priceSel.length) {
          ok = priceSel.some(function (o) { return li._f.price >= +o.getAttribute('data-lo') && li._f.price < +o.getAttribute('data-hi'); });
        }
        li.style.display = ok ? '' : 'none';
        if (ok) shown++;
      });

      // per-group headers + pill active state
      ['purpose', 'zodiac', 'planet', 'category', 'price'].forEach(function (g) {
        var cnt = (g === 'price') ? priceCount : sel[g].length;
        var hdr = root.querySelector('.aa-fltr__grp[data-group="' + g + '"] .aa-fltr__selcount');
        if (hdr) hdr.textContent = cnt + ' selected';
        var pill = root.querySelector('.aa-fltr__btn[data-group="' + g + '"]');
        if (pill) pill.classList.toggle('has-sel', cnt > 0);
      });

      // when filtering, reveal all matches (override the View-more row clamp); else restore it
      grid.classList.toggle('aa-fltr-on', totalSel > 0);
      var vm = document.querySelector('[data-aa-viewmore]');
      if (vm) vm.style.display = totalSel > 0 ? 'none' : '';

      var nr = document.getElementById('aa-fltr-noresults');
      if (nr) nr.style.display = (totalSel > 0 && shown === 0) ? '' : 'none';
      var rc = root.querySelector('.aa-fltr__count');
      if (rc) rc.textContent = (totalSel > 0 ? shown : items.length) + ' products';
      buildPills();
    }

    root.addEventListener('change', function (e) { if (e.target.matches('input[type="checkbox"]')) apply(); });

    // reset (per group)
    Array.prototype.slice.call(root.querySelectorAll('[data-aa-reset]')).forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var g = b.getAttribute('data-aa-reset');
        Array.prototype.slice.call(root.querySelectorAll('.aa-fltr__opt[data-group="' + g + '"] input:checked'))
          .forEach(function (i) { i.checked = false; });
        if (g === 'price') { var m1 = root.querySelector('[data-aa-min]'), m2 = root.querySelector('[data-aa-max]'); if (m1) m1.value = ''; if (m2) m2.value = ''; }
        apply();
      });
    });
    // clear all
    var clr = root.querySelector('[data-aa-clearall]');
    if (clr) clr.addEventListener('click', function (e) {
      e.preventDefault();
      Array.prototype.slice.call(root.querySelectorAll('input[type="checkbox"]:checked')).forEach(function (i) { i.checked = false; });
      var m1 = root.querySelector('[data-aa-min]'), m2 = root.querySelector('[data-aa-max]'); if (m1) m1.value = ''; if (m2) m2.value = '';
      apply();
    });

    // dropdown open/close
    Array.prototype.slice.call(root.querySelectorAll('.aa-fltr__btn')).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var grp = btn.closest('.aa-fltr__grp'), isOpen = grp.classList.contains('open');
        Array.prototype.slice.call(root.querySelectorAll('.aa-fltr__grp.open')).forEach(function (g) { g.classList.remove('open'); });
        if (!isOpen) grp.classList.add('open');
      });
    });
    Array.prototype.slice.call(root.querySelectorAll('.aa-fltr__panel')).forEach(function (p) {
      p.addEventListener('click', function (e) { e.stopPropagation(); });
    });
    document.addEventListener('click', function () {
      Array.prototype.slice.call(root.querySelectorAll('.aa-fltr__grp.open')).forEach(function (g) { g.classList.remove('open'); });
    });


    // sort
    var sortSel = document.querySelector('.aa-fltr__sortsel');
    if (sortSel) sortSel.addEventListener('change', function () {
      var m = sortSel.value, arr = originalOrder.slice();
      if (m === 'price-asc') arr.sort(function (a, b) { return a._f.price - b._f.price; });
      else if (m === 'price-desc') arr.sort(function (a, b) { return b._f.price - a._f.price; });
      else if (m === 'title-asc') arr.sort(function (a, b) { return a._t < b._t ? -1 : a._t > b._t ? 1 : 0; });
      else if (m === 'title-desc') arr.sort(function (a, b) { return a._t > b._t ? -1 : a._t < b._t ? 1 : 0; });
      // featured / relevant / manual -> original curated order
      arr.forEach(function (li) { grid.appendChild(li); });
    });
    var _min = root.querySelector('[data-aa-min]'), _max = root.querySelector('[data-aa-max]'), _go = root.querySelector('[data-aa-apply]');
    if (_min) _min.addEventListener('input', apply);
    if (_max) _max.addEventListener('input', apply);
    if (_go) _go.addEventListener('click', function (e) { e.preventDefault(); apply(); });

    function buildPills() {
      var box = document.getElementById('aa-fltr-pills'); if (!box) return;
      var checked = Array.prototype.slice.call(root.querySelectorAll('.aa-fltr__opt input:checked'));
      var minEl = root.querySelector('[data-aa-min]'), maxEl = root.querySelector('[data-aa-max]');
      var hasRange = (minEl && minEl.value !== '') || (maxEl && maxEl.value !== '');
      box.innerHTML = '';
      if (hasRange) {
        var lo = (minEl && minEl.value !== '') ? '\u20b9' + minEl.value : '\u20b90';
        var hi = (maxEl && maxEl.value !== '') ? '\u20b9' + maxEl.value : 'Any';
        var rp = document.createElement('button'); rp.type = 'button'; rp.className = 'aa-fltr__pill';
        rp.innerHTML = lo + ' \u2013 ' + hi + ' <span class="x">\u00d7</span>';
        rp.addEventListener('click', function () { if (minEl) minEl.value = ''; if (maxEl) maxEl.value = ''; apply(); });
        box.appendChild(rp);
      }
      checked.forEach(function (inp) {
        var opt = inp.closest('.aa-fltr__opt');
        var label = opt.querySelector('.aa-fltr__lbl').childNodes[0].textContent.trim();
        var pill = document.createElement('button');
        pill.type = 'button'; pill.className = 'aa-fltr__pill';
        pill.innerHTML = label + ' <span class="x">\u00d7</span>';
        pill.addEventListener('click', function () { inp.checked = false; apply(); });
        box.appendChild(pill);
      });
      if (checked.length || hasRange) {
        var clr = document.createElement('button');
        clr.type = 'button'; clr.className = 'aa-fltr__pillclear'; clr.textContent = 'Clear all';
        clr.addEventListener('click', function () { checked.forEach(function (i) { i.checked = false; }); if (minEl) minEl.value = ''; if (maxEl) maxEl.value = ''; apply(); });
        box.appendChild(clr);
      }
      box.style.display = (checked.length || hasRange) ? '' : 'none';
    }

    apply();
  }
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('turbo:load', init);
})();
