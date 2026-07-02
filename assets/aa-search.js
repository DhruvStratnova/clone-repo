/* aa-search.js — DESKTOP header search: slide-down panel + live type-ahead.
   Replaces the Dawn modal popup on desktop only (mobile keeps its modal).
   Uses Shopify /search/suggest.json, then re-ranks (prefix/word-start boost)
   for far better relevance than the default. */
(function () {
  var DESKTOP = function () { return window.innerWidth > 749; };
  var panel, input, results, open = false, timer, lastQ = '', ctrl;

  function build() {
    if (document.getElementById('aa-search')) return;
    panel = document.createElement('div');
    panel.id = 'aa-search';
    panel.className = 'aa-search';
    panel.innerHTML =
      '<div class="aa-search__inner">' +
        '<div class="aa-search__bar">' +
          '<svg class="aa-search__ico" viewBox="0 0 24 24" width="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>' +
          '<input type="search" class="aa-search__input" placeholder="Search bracelets, gemstones, rudraksha…" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">' +
          '<button type="button" class="aa-search__clear" aria-label="Clear" hidden>&times;</button>' +
        '</div>' +
        '<div class="aa-search__results" id="aa-search-results"></div>' +
      '</div>';
    document.body.appendChild(panel);
    input = panel.querySelector('.aa-search__input');
    results = panel.querySelector('.aa-search__results');
    var clear = panel.querySelector('.aa-search__clear');

    input.addEventListener('input', function () {
      clear.hidden = !input.value;
      schedule(input.value.trim());
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var q = input.value.trim(); if (q) location.href = '/search?q=' + encodeURIComponent(q) + '&options[prefix]=last'; }
      if (e.key === 'Escape') close();
    });
    clear.addEventListener('click', function () { input.value = ''; clear.hidden = true; results.innerHTML = ''; input.focus(); });
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { if (open) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) close(); });
  }

  function toggle(e) { if (e) { e.preventDefault(); e.stopPropagation(); } open ? close() : show(); }
  function show() {
    build(); open = true;
    var hdr = document.querySelector('.section-header, #shopify-section-header, header.header, .header-wrapper');
    var hh = hdr ? Math.round(hdr.getBoundingClientRect().bottom) : 74;
    panel.style.setProperty('--aa-hh', (hh > 0 ? hh : 74) + 'px');
    panel.classList.add('is-open');
    document.documentElement.classList.add('aa-search-open');
    setTimeout(function () { input.focus(); }, 60);
  }
  function close() { open = false; if (panel) panel.classList.remove('is-open'); document.documentElement.classList.remove('aa-search-open'); }

  function schedule(q) {
    clearTimeout(timer);
    if (q.length < 2) { results.innerHTML = ''; lastQ = ''; return; }
    timer = setTimeout(function () { run(q); }, 160);
  }

  function run(q) {
    if (q === lastQ) return; lastQ = q;
    if (ctrl) ctrl.abort(); ctrl = ('AbortController' in window) ? new AbortController() : null;
    results.innerHTML = '<div class="aa-search__loading">Searching…</div>';
    var url = '/search/suggest.json?q=' + encodeURIComponent(q) +
      '&resources[type]=product,collection&resources[limit]=10&resources[options][unavailable_products]=last&resources[options][fields]=title,product_type,vendor,variants.title';
    fetch(url, { signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (d) { render(q, d.resources.results); })
      .catch(function (e) { if (e.name !== 'AbortError') results.innerHTML = '<div class="aa-search__empty">Something went wrong. Try again.</div>'; });
  }

  // re-rank: exact > title-startsWith > word-startsWith > (suggest order)
  function rank(q, products) {
    var ql = q.toLowerCase();
    return products.map(function (p, i) {
      var t = (p.title || '').toLowerCase();
      var s = 0;
      if (t === ql) s = 100;
      else if (t.indexOf(ql) === 0) s = 80;
      else if (new RegExp('\\b' + ql.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(t)) s = 60;
      else if (t.indexOf(ql) > -1) s = 40;
      return { p: p, s: s - i * 0.1 };
    }).sort(function (a, b) { return b.s - a.s; }).map(function (x) { return x.p; });
  }

  function money(cents) { return '₹' + Math.round((cents || 0) / 100).toLocaleString('en-IN'); }

  function render(q, res) {
    var products = rank(q, res.products || []);
    var colls = res.collections || [];
    if (!products.length && !colls.length) { results.innerHTML = '<div class="aa-search__empty">No matches for &ldquo;' + esc(q) + '&rdquo;</div>'; return; }
    var html = '';
    if (colls.length) {
      html += '<div class="aa-search__sec">Collections</div><div class="aa-search__chips">';
      colls.slice(0, 5).forEach(function (c) { html += '<a class="aa-search__chip" href="' + c.url + '">' + esc(c.title) + '</a>'; });
      html += '</div>';
    }
    html += '<div class="aa-search__sec">Products</div><div class="aa-search__grid">';
    products.slice(0, 8).forEach(function (p) {
      var img = (p.featured_image && p.featured_image.url) || p.image || '';
      var price = p.price_min != null ? money(p.price_min) : (p.price != null ? money(p.price) : '');
      html += '<a class="aa-search__item" href="' + p.url + '">' +
        '<span class="aa-search__thumb"' + (img ? ' style="background-image:url(' + img + ')"' : '') + '></span>' +
        '<span class="aa-search__meta"><span class="aa-search__title">' + esc(p.title) + '</span>' +
        '<span class="aa-search__price">' + price + '</span></span></a>';
    });
    html += '</div>';
    html += '<a class="aa-search__all" href="/search?q=' + encodeURIComponent(q) + '&options[prefix]=last">View all results for &ldquo;' + esc(q) + '&rdquo; &rarr;</a>';
    results.innerHTML = html;
  }
  function esc(s) { return (s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function wire() {
    if (!DESKTOP()) return;
    // intercept the header search icon(s) -> open our slide-down instead of the Dawn modal
    var triggers = document.querySelectorAll('.header__icon--search, summary.header__icon--search, .header__search summary');
    triggers.forEach(function (t) {
      if (t.dataset.aaSearch) return; t.dataset.aaSearch = '1';
      t.addEventListener('click', toggle, true);
    });
  }
  function init() { if (DESKTOP()) { build(); wire(); } }
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('turbo:load', function () { close(); wire(); });
})();
