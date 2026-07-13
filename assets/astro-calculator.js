/* AstroAura — Astro Calculator
   Form posts to Supabase Edge Function: public-remedies-api
   Renders intro (markdown), action items, hero product card + more product cards.
*/

function aaCalcInit() {
  var tabs = document.querySelectorAll('.calculator-tabs .tab');
  var form = document.getElementById('calculator-form');
  if (!form || form.dataset.aaCalcReady) return;   /* run only on the calculator page; never double-init under Turbo/prerender */
  form.dataset.aaCalcReady = '1';
  var astroResultsDiv = document.getElementById('astro-results');
  var astroOutputDiv = document.getElementById('astro-output');

  // -----------------------------------------------------------------
  // API config
  // -----------------------------------------------------------------
  var REMEDIES_API_URL = 'https://ieakxiipnpwvyvpsjnkl.supabase.co/functions/v1/public-quiz-remedy-api';
  // Set when the user picks a place from the Geoapify suggestions — carries the
  // lat/lon/timezone the chart engine hard-requires (a typed-only place has none).
  var aaSelectedPlace = null;
  function aaPickPlace(f) {
    var p = (f && f.properties) || {};
    return {
      formatted: p.formatted || '',
      lat: p.lat, lng: p.lon,
      tz_name: (p.timezone && p.timezone.name) || '',
      tz_offset: (p.timezone && typeof p.timezone.offset_STD_seconds === 'number') ? (p.timezone.offset_STD_seconds / 3600) : null
    };
  }
  var REMEDIES_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllYWt4aWlwbnB3dnl2cHNqbmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxOTA4NzcsImV4cCI6MjA3MDc2Njg3N30.R_seea1Eefbitn2ZI-ye0oASLsoazA7lynGTk7B1pH4';
  var GEOAPIFY_API_KEY = '55e9073809d4409fa8c39310584517f9';

  // -----------------------------------------------------------------
  // Form template (rendered per-tab)
  // -----------------------------------------------------------------
  var formFields = '\
    <div class="aa-calc-grid">\
      <div class="form-group">\
        <label for="aa-name">Name</label>\
        <input type="text" id="aa-name" name="name" placeholder="Your full name" required>\
      </div>\
      <div class="form-group">\
        <label for="aa-phone">Phone Number</label>\
        <input type="tel" id="aa-phone" name="phone" placeholder="98xxxxxxxx" inputmode="numeric" required>\
      </div>\
      <div class="form-group">\
        <label for="dob">Date of Birth</label>\
        <div class="aa-input-wrap">\
          <input type="text" id="dob" name="dob" placeholder="DD/MM/YYYY" inputmode="numeric" autocomplete="bday" required>\
          <button type="button" class="aa-input-icon" data-aa-picker="date" aria-label="Pick date">\
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>\
          </button>\
          <input type="date" class="aa-hidden-picker" data-target="dob" tabindex="-1" aria-hidden="true">\
        </div>\
      </div>\
      <div class="form-group">\
        <label for="tob">Time of Birth</label>\
        <div class="aa-input-wrap">\
          <input type="text" id="tob" name="tob" placeholder="HH:MM" inputmode="numeric">\
          <button type="button" class="aa-input-icon" data-aa-picker="time" aria-label="Pick time">\
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>\
          </button>\
          <input type="time" class="aa-hidden-picker" data-target="tob" tabindex="-1" aria-hidden="true">\
        </div>\
        <label class="checkbox-row"><input type="checkbox" name="no_time"> I don\'t have time of birth</label>\
      </div>\
    </div>\
    <div class="form-group">\
      <label for="place">Place of Birth</label>\
      <input type="text" id="place" name="placeName" placeholder="City, Country — e.g. New Delhi, India" required>\
    </div>\
  ';

  function switchTab(tabName) {
    tabs.forEach(function (tab) { tab.classList.remove('active'); });
    var activeTab = document.querySelector('.tab[data-tab="' + tabName + '"]');
    if (activeTab) activeTab.classList.add('active');
    astroResultsDiv.style.display = 'none';
    astroOutputDiv.innerHTML = '';

    var btnLabel = tabName === 'by-rudraksha' ? 'Know your Rudraksha' : 'Know your Gemstone';
    form.innerHTML = formFields + '<button type="submit" class="rudraksha-btn aa-calc-cta">' + btnLabel + '</button>';
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () { switchTab(tab.dataset.tab); });
  });

  // -----------------------------------------------------------------
  // Geoapify place autocomplete (optional — pob is free-form)
  // -----------------------------------------------------------------
  var placeInput, suggestionBox;
  function addSuggestionDropdown() {
    placeInput = form.querySelector('input[name="placeName"]');
    if (!placeInput || placeInput.dataset.suggestInit === 'true') return;
    placeInput.dataset.suggestInit = 'true';

    suggestionBox = document.createElement('div');
    suggestionBox.className = 'location-suggestions';
    suggestionBox.style.cssText = 'position:absolute;background:#fff;border:1px solid #ccc;z-index:9999;display:none;max-height:240px;overflow-y:auto;';
    document.body.appendChild(suggestionBox);

    function updatePosition() {
      var rect = placeInput.getBoundingClientRect();
      suggestionBox.style.width = rect.width + 'px';
      suggestionBox.style.left = (window.scrollX + rect.left) + 'px';
      suggestionBox.style.top = (window.scrollY + rect.bottom) + 'px';
    }

    var debounceTimer;
    var currentIndex = -1;
    var suggestionsData = [];
    var inFlightController = null;

    function renderSuggestions(features) {
      suggestionBox.innerHTML = '';
      currentIndex = -1;
      suggestionsData = features;
      features.forEach(function (feature) {
        var item = document.createElement('div');
        item.className = 'suggestion-item';
        item.textContent = feature.properties.formatted;
        item.style.cssText = 'padding:8px 10px;cursor:pointer;';
        item.addEventListener('mousedown', function (e) {
          e.preventDefault();
          placeInput.value = feature.properties.formatted;
          aaSelectedPlace = aaPickPlace(feature);
          suggestionBox.style.display = 'none';
        });
        suggestionBox.appendChild(item);
      });
      suggestionBox.style.display = features.length ? 'block' : 'none';
    }

    function fetchSuggestions(query) {
      var url = 'https://api.geoapify.com/v1/geocode/autocomplete?text=' + encodeURIComponent(query) + '&limit=5&apiKey=' + GEOAPIFY_API_KEY;
      if (inFlightController) inFlightController.abort();
      inFlightController = new AbortController();
      fetch(url, { signal: inFlightController.signal })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.features && data.features.length > 0) renderSuggestions(data.features);
          else suggestionBox.style.display = 'none';
        })
        .catch(function () {});
    }

    placeInput.addEventListener('input', function () {
      var query = placeInput.value.trim();
      aaSelectedPlace = null; // typing a new place invalidates the previous pick
      updatePosition();
      if (query.length < 3) { suggestionBox.style.display = 'none'; return; }
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () { fetchSuggestions(query); }, 250);
    });
    placeInput.addEventListener('focus', function () {
      var query = placeInput.value.trim();
      updatePosition();
      if (query.length >= 3) fetchSuggestions(query);
    });
    placeInput.addEventListener('keydown', function (e) {
      if (suggestionBox.style.display !== 'block') return;
      var items = Array.prototype.slice.call(suggestionBox.querySelectorAll('.suggestion-item'));
      if (!items.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); currentIndex = (currentIndex + 1) < items.length ? currentIndex + 1 : 0; }
      else if (e.key === 'ArrowUp') { e.preventDefault(); currentIndex = (currentIndex - 1) >= 0 ? currentIndex - 1 : items.length - 1; }
      else if (e.key === 'Enter') {
        if (currentIndex >= 0 && suggestionsData[currentIndex]) {
          e.preventDefault();
          placeInput.value = suggestionsData[currentIndex].properties.formatted;
          aaSelectedPlace = aaPickPlace(suggestionsData[currentIndex]);
          suggestionBox.style.display = 'none';
        }
      }
      items.forEach(function (el, i) { el.classList.toggle('active', i === currentIndex); });
    });
    document.addEventListener('mousedown', function (e) {
      if (!suggestionBox.contains(e.target) && e.target !== placeInput) suggestionBox.style.display = 'none';
    });
    window.addEventListener('scroll', updatePosition, { capture: true, passive: true });
    window.addEventListener('resize', updatePosition);
  }

  function setupMobileDateTimePlaceholders() {
    // DOB and ToB: text inputs with live auto-formatting + a sibling
    // calendar/clock icon that opens the native picker (best of both).
    var dateInput = form.querySelector('#dob');
    var timeInput = form.querySelector('#tob');
    if (dateInput && dateInput.dataset.autoFmtInit !== 'true') {
      dateInput.dataset.autoFmtInit = 'true';
      dateInput.addEventListener('input', function () {
        var digits = dateInput.value.replace(/\D/g, '').slice(0, 8);
        var out = digits;
        if (digits.length > 4) out = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
        else if (digits.length > 2) out = digits.slice(0, 2) + '/' + digits.slice(2);
        dateInput.value = out;
      });
    }
    if (timeInput && timeInput.dataset.autoFmtInit !== 'true') {
      timeInput.dataset.autoFmtInit = 'true';
      timeInput.addEventListener('input', function () {
        var digits = timeInput.value.replace(/\D/g, '').slice(0, 4);
        var out = digits;
        if (digits.length > 2) out = digits.slice(0, 2) + ':' + digits.slice(2);
        timeInput.value = out;
      });
    }
    // Wire icon → hidden picker → visible text input
    form.querySelectorAll('.aa-input-icon').forEach(function (btn) {
      if (btn.dataset.pickerInit === 'true') return;
      btn.dataset.pickerInit = 'true';
      var kind = btn.getAttribute('data-aa-picker');
      var target = form.querySelector('#' + (kind === 'date' ? 'dob' : 'tob'));
      var picker = form.querySelector('.aa-hidden-picker[data-target="' + (kind === 'date' ? 'dob' : 'tob') + '"]');
      if (!target || !picker) return;
      btn.addEventListener('click', function () {
        // Pre-fill the picker if the text field has a valid value
        if (kind === 'date') {
          var iso = parseDateInput(target.value);
          if (iso) picker.value = iso;
        } else {
          var t = parseTimeInput(target.value);
          if (t) picker.value = t;
        }
        if (typeof picker.showPicker === 'function') {
          try { picker.showPicker(); return; } catch (e) {}
        }
        // Fallback: focus the hidden input (mobile shows picker on focus)
        picker.focus();
        picker.click();
      });
      picker.addEventListener('change', function () {
        if (kind === 'date' && picker.value) {
          var parts = picker.value.split('-'); // YYYY-MM-DD
          target.value = parts[2] + '/' + parts[1] + '/' + parts[0];
        } else if (kind === 'time' && picker.value) {
          target.value = picker.value;
        }
      });
    });
  }
  // Parse user-typed DD/MM/YYYY → YYYY-MM-DD for the API
  function parseDateInput(raw) {
    if (!raw) return '';
    var s = String(raw).trim();
    var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
      var d = m[1].padStart(2, '0'), mo = m[2].padStart(2, '0'), y = m[3];
      if (y.length === 2) y = (parseInt(y, 10) > 30 ? '19' : '20') + y;
      return y + '-' + mo + '-' + d;
    }
    // already ISO?
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return '';
  }
  function parseTimeInput(raw) {
    if (!raw) return '';
    var s = String(raw).trim();
    var m = s.match(/^(\d{1,2})[:\.]?(\d{2})\s*(am|pm)?$/i);
    if (m) {
      var h = parseInt(m[1], 10);
      var mn = m[2];
      var ampm = (m[3] || '').toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      return String(h).padStart(2, '0') + ':' + mn;
    }
    return '';
  }

  // Patch switchTab to wire up post-render extras
  var origSwitchTab = switchTab;
  switchTab = function (tabName) {
    origSwitchTab(tabName);
    setTimeout(function () { addSuggestionDropdown(); setupMobileDateTimePlaceholders(); }, 0);
  };
  switchTab('by-gemstone');

  // -----------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------
  // Normalise user phone → E.164. Indian 10-digit auto-prefixed with +91.
  function normalizePhone(raw) {
    if (!raw) return '';
    var s = String(raw).replace(/[^\d+]/g, '');
    if (s.indexOf('+') === 0) return s;
    if (s.length === 10) return '+91' + s;
    if (s.length === 12 && s.indexOf('91') === 0) return '+' + s;
    if (s.length >= 11) return '+' + s;
    return s;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Smarter markdown → HTML.
  // - Lines starting with "- " become structured list items
  // - "- **Label:** value" becomes a key/value row with a styled label
  // - **bold** / *italic* / inline `code` rendered
  // - Blank lines split paragraphs cleanly
  function renderMarkdown(md) {
    if (!md) return '';
    var lines = String(md).split('\n');
    var out = [];
    var inList = false;
    function inline(s) {
      s = escapeHtml(s);
      s = s.replace(/`([^`]+?)`/g, '<code>$1</code>');
      s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>');
      return s;
    }
    function openList() { if (!inList) { out.push('<ul class="aa-md-list">'); inList = true; } }
    function closeList() { if (inList) { out.push('</ul>'); inList = false; } }
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var trim = raw.replace(/\s+$/, '');
      var bulletMatch = trim.match(/^\s*[-•]\s+(.*)$/);
      if (bulletMatch) {
        openList();
        var content = bulletMatch[1];
        // "- **Label:** rest"  →  <li><span class="md-key">Label</span> rest</li>
        var kv = content.match(/^\*\*([^*]+?):\*\*\s*(.*)$/);
        if (kv) {
          out.push('<li class="aa-md-kv"><span class="aa-md-key">' + escapeHtml(kv[1]) + '</span><span class="aa-md-val">' + inline(kv[2]) + '</span></li>');
        } else {
          out.push('<li>' + inline(content) + '</li>');
        }
        continue;
      }
      closeList();
      if (trim === '') { continue; }
      // Lead-paragraph (first non-empty, all-bold) → render as heading
      if (/^\*\*[\s\S]+\*\*$/.test(trim) && out.length === 0) {
        out.push('<h4 class="aa-md-lead">' + inline(trim.replace(/^\*\*|\*\*$/g, '')) + '</h4>');
      } else {
        out.push('<p>' + inline(trim) + '</p>');
      }
    }
    closeList();
    return out.join('\n');
  }

  function inrFormat(amount) {
    if (amount == null) return '';
    try { return '₹' + Number(amount).toLocaleString('en-IN'); } catch (e) { return '₹' + amount; }
  }

  function productCardHtml(p, isHero) {
    if (!p) return '';
    var price = p.price_inr != null ? '<div class="aa-rem-card__price">' + escapeHtml(inrFormat(p.price_inr)) + '</div>' : '';
    var tag = p.tag ? '<span class="aa-rem-card__tag">' + escapeHtml(p.tag) + '</span>' : '';
    var benefits = '';
    if (isHero && p.benefits && p.benefits.length) {
      benefits = '<ul class="aa-rem-card__benefits">' +
        p.benefits.map(function (b) { return '<li>' + escapeHtml(b) + '</li>'; }).join('') + '</ul>';
    }
    var howWear = p.how_to_wear ? '<div class="aa-rem-card__how"><strong>How to wear:</strong> ' + escapeHtml(p.how_to_wear) + '</div>' : '';
    var howSolves = p.how_it_solves ? '<div class="aa-rem-card__how"><strong>How it helps:</strong> ' + escapeHtml(p.how_it_solves) + '</div>' : '';
    var reason = p.reason ? '<div class="aa-rem-card__reason">' + escapeHtml(p.reason) + '</div>' : '';
    var shopBtn = p.shop_url ? '<a href="' + escapeHtml(p.shop_url) + '" class="aa-rem-card__cta">View product</a>' : '';
    // tag rides ON the image (homepage-card format); body keeps it only when no image
    var img = p.image_url ? '<div class="aa-rem-card__media"><img src="' + escapeHtml(p.image_url) + '" alt="' + escapeHtml(p.name || '') + '" loading="lazy">' + tag + '</div>' : '';
    return '<div class="aa-rem-card' + (isHero ? ' aa-rem-card--hero' : '') + '">' +
      img +
      '<div class="aa-rem-card__body">' +
        (p.image_url ? '' : tag) +
        '<div class="aa-rem-card__cat">' + escapeHtml(p.category || '') + '</div>' +
        '<h3 class="aa-rem-card__name">' + escapeHtml(p.name || '') + '</h3>' +
        price +
        reason +
        benefits +
        howWear +
        howSolves +
        shopBtn +
      '</div>' +
    '</div>';
  }

  /* ---- structured astrology sections (parity with the app result UI) ---- */
  function calcSpecRow(label, value) {
    if (!value) return '';
    return '<div style="display:flex;gap:12px;margin-top:7px;align-items:flex-start">' +
      '<span style="flex:0 0 92px;font-weight:700;font-size:9.5px;letter-spacing:.6px;text-transform:uppercase;opacity:.5">' + escapeHtml(label) + '</span>' +
      '<span style="flex:1;font-size:13px;line-height:1.45">' + escapeHtml(value) + '</span></div>';
  }
  function calcTextCard(kicker, body) {
    if (!body) return '';
    return '<div style="margin-top:12px;padding:13px 15px;border:1px solid rgba(128,128,128,.22);border-radius:14px;background:rgba(128,128,128,.06)">' +
      '<div style="font-weight:800;font-size:10px;letter-spacing:1.3px;text-transform:uppercase;opacity:.55;margin-bottom:6px">' + escapeHtml(kicker) + '</div>' +
      '<div style="font-size:13.5px;line-height:1.55">' + escapeHtml(body) + '</div></div>';
  }
  function calcRxCard(kicker, accent, title, subtitle, rows, badge) {
    var specs = rows.map(function (r) { return calcSpecRow(r[0], r[1]); }).join('');
    var badgeHtml = badge ? '<span style="margin-left:8px;padding:2px 8px;border-radius:9px;background:' + accent + ';color:#fff;font-weight:900;font-size:8.5px;letter-spacing:.5px;vertical-align:middle">' + escapeHtml(badge) + '</span>' : '';
    return '<div style="margin-top:12px;padding:15px 16px;border:1.3px solid ' + accent + '66;border-radius:16px;background:rgba(128,128,128,.05);box-shadow:0 4px 14px ' + accent + '18">' +
      '<div style="font-weight:800;font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:' + accent + ';margin-bottom:7px">' + escapeHtml(kicker) + badgeHtml + '</div>' +
      '<div style="font-weight:800;font-size:18px;line-height:1.2">' + escapeHtml(title) + '</div>' +
      (subtitle ? '<div style="font-size:11.5px;opacity:.6;margin-top:2px">' + escapeHtml(subtitle) + '</div>' : '') +
      specs + '</div>';
  }
  function sectionsHtml(sec) {
    if (!sec || typeof sec !== 'object') return '';
    var h = '';
    if (sec.concern) h += '<p style="margin:8px 2px 0;font-size:12.5px;font-style:italic;opacity:.6">' + escapeHtml(sec.concern) + '</p>';
    h += calcTextCard('What your chart shows', sec.chart_shows);
    h += calcTextCard('Why this remedy', sec.why_remedy);
    var pr = sec.primary_remedy;
    if (pr && typeof pr === 'object' && pr.stone) {
      var subs = (pr.substitutes && pr.substitutes.length) ? [].concat(pr.substitutes).join(', ') : '';
      var badge = pr.tier === 'life_stone' ? 'LIFE STONE' : (pr.tier === 'tentative' ? 'TEST-WEAR 7 DAYS' : '');
      h += calcRxCard('Your gemstone prescription', '#E9027A', pr.stone, pr.planet ? ('For ' + pr.planet + ', your strongest wearable planet') : '', [
        ['Metal', pr.metal], ['Wear on', pr.finger],
        ['First wear', pr.day ? (pr.day + ', shukla paksha morning') : ''],
        ['Activation', pr.activation], ['Budget alt.', subs]
      ], badge);
    }
    var rd = sec.rudraksha;
    if (rd && typeof rd === 'object' && rd.mukhi) {
      var mk = ('' + rd.mukhi).replace(/mukhi/i, 'Mukhi');
      h += calcRxCard('Rudraksha support', '#C8860B', mk, rd.planet ? ('Channels ' + rd.planet + ' safely — good for everyone') : '', [
        ['Wear as', rd.wear_as], ['First wear', rd.day], ['Activation', rd.activation]
      ], '');
    }
    return h;
  }

  /* Rudraksha tab ROOT FIX: the engine always returns the gemstone as `hero`
     (the tab only frames copy), so the Rudraksha toggle showed a gemstone
     result. Promote the matching mukhi product from `more` to hero instead. */
  function reorderForTab(data, tab) {
    if (tab !== 'by-rudraksha' || !data || !data.more || !data.more.length) return data;
    var mk = (data.sections && data.sections.rudraksha && data.sections.rudraksha.mukhi)
      ? String(data.sections.rudraksha.mukhi).match(/\d+/) : null;
    var idx = -1, fallback = -1;
    for (var i = 0; i < data.more.length; i++) {
      var p = data.more[i], nm = (p.name || '') + ' ' + (p.category || '');
      if (!/rudraksha|mukhi/i.test(nm)) continue;
      if (fallback < 0) fallback = i;
      if (mk && new RegExp('\\b' + mk[0] + '[ _-]*mukhi', 'i').test(nm)) { idx = i; break; }
    }
    if (idx < 0) idx = fallback;
    if (idx < 0) return data;
    var rud = data.more.splice(idx, 1)[0];
    if (data.hero) data.more.unshift(data.hero);
    data.hero = rud;
    return data;
  }

  function renderRemedies(data) {
    var intro = (data && data.sections)
      ? sectionsHtml(data.sections)
      : (data && data.intro ? '<div class="aa-rem-intro">' + renderMarkdown(data.intro) + '</div>' : '');
    var actions = '';
    if (data && data.action_items && data.action_items.length) {
      actions = '<div class="aa-rem-actions"><h3>Action items</h3><ul>' +
        data.action_items.map(function (a) { return '<li>' + renderMarkdown(a).replace(/^<p>|<\/p>$/g, '') + '</li>'; }).join('') +
        '</ul></div>';
    }
    var hero = data && data.hero ? '<div class="aa-rem-hero-wrap">' + productCardHtml(data.hero, true) + '</div>' : '';
    var moreList = '';
    if (data && data.more && data.more.length) {
      moreList = '<div class="aa-rem-more"><h3>More aligned picks</h3><div class="aa-rem-more__grid">' +
        data.more.map(function (p) { return productCardHtml(p, false); }).join('') +
        '</div></div>';
    }
    var note = (data && data.sections && data.sections.note) ? '<p style="margin:16px 4px 0;font-size:12px;opacity:.6;text-align:center;line-height:1.5">' + escapeHtml(data.sections.note) + '</p>' : '';
    // HERO FIRST: the recommended-product card leads the result, then the reading.
    astroOutputDiv.innerHTML = hero + intro + actions + moreList + note;
    astroResultsDiv.style.display = 'block';
    astroResultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // -----------------------------------------------------------------
  // Submit → call remedies API
  // -----------------------------------------------------------------
  form.addEventListener('submit', function (e) {
    if (e.target && e.target.id !== 'calculator-form') return;
    e.preventDefault();

    var formData = new FormData(e.target);
    var data = Object.fromEntries(formData.entries());
    var currentTab = (document.querySelector('.calculator-tabs .tab.active') || {}).dataset
      ? document.querySelector('.calculator-tabs .tab.active').dataset.tab
      : 'by-gemstone';

    var phone = normalizePhone(data.phone);
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      astroOutputDiv.innerHTML = '<p class="aa-rem-error">Please enter a valid phone number.</p>';
      astroResultsDiv.style.display = 'block';
      return;
    }
    var dobIso = parseDateInput(data.dob);
    if (!dobIso) {
      astroOutputDiv.innerHTML = '<p class="aa-rem-error">Please enter your date of birth as DD/MM/YYYY (e.g. 18/10/1995).</p>';
      astroResultsDiv.style.display = 'block';
      return;
    }
    var tob = '12:00';
    if (!data.no_time && data.tob) {
      var parsed = parseTimeInput(data.tob);
      if (!parsed) {
        astroOutputDiv.innerHTML = '<p class="aa-rem-error">Please enter time of birth as HH:MM (24h, e.g. 14:30).</p>';
        astroResultsDiv.style.display = 'block';
        return;
      }
      tob = parsed;
    }

    if (!aaSelectedPlace || aaSelectedPlace.lat == null || aaSelectedPlace.tz_offset == null) {
      astroOutputDiv.innerHTML = '<p class="aa-rem-error">Please pick your place of birth from the suggestions so we can read your chart.</p>';
      astroResultsDiv.style.display = 'block';
      return;
    }

    var body = {
      phone: phone,
      dob: dobIso,
      tob: tob,
      pob: aaSelectedPlace.formatted || data.placeName || '',
      lat: aaSelectedPlace.lat,
      lng: aaSelectedPlace.lng,
      timezone: aaSelectedPlace.tz_name || '',
      timezone_offset: aaSelectedPlace.tz_offset,
      name: data.name || 'Web user',
      gender: data.gender || 'Any',
      // The calculator has no problem-quiz, so feed the engine a neutral
      // general-wellbeing leaf — it still returns the chart's best overall
      // gemstone + rudraksha (it emits both regardless; the tab just frames copy).
      goal: 'spiritual',
      focus: { value: 'peace', title: 'Inner peace' },
      obstacle: { value: '', title: '' },
      language: 'en'
    };
    // Steer the copy toward gemstone vs rudraksha focus
    if (currentTab === 'by-rudraksha') body.question = 'Which Rudraksha should I wear, and how does it help me?';
    else body.question = 'Which Gemstone suits my chart, and how does it help me?';

    astroOutputDiv.innerHTML = '<div class="aa-rem-loading"><span class="aa-rem-spinner"></span> Generating your personalised recommendation… <em>(may take 20–30 seconds the first time)</em></div>';
    astroResultsDiv.style.display = 'block';

    fetch(REMEDIES_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': REMEDIES_API_KEY,
        'Authorization': 'Bearer ' + REMEDIES_API_KEY
      },
      body: JSON.stringify(body)
    })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            var parsed = null;
            try { parsed = JSON.parse(t); } catch (e) {}
            var error = new Error('API ' + res.status);
            error.status = res.status;
            error.body = parsed || t;
            throw error;
          });
        }
        return res.json();
      })
      .then(function (json) {
        if (!json || json.shown === false) {
          astroOutputDiv.innerHTML = '<p class="aa-rem-error">No recommendation available for this profile. Please try again with valid birth details.</p>';
          return;
        }
        renderRemedies(reorderForTab(json, currentTab));
      })
      .catch(function (err) {
        console.error('[astro-calc] error', err);
        var html;
        var AURA_AI_URL = 'https://play.google.com/store/apps/details?id=com.astroaura.auraai';
        if (err && err.status === 429) {
          html = '<div class="aa-rem-limit">' +
            '<p class="aa-rem-limit__title"><strong>You\'ve reached the hourly limit.</strong></p>' +
            '<div class="aa-rem-limit__cta">' +
              '<p class="aa-rem-limit__pitch">Can\'t wait? Get an instant personalised reading on the <strong>Aura AI</strong> app — <em>your first question is free</em>.</p>' +
              '<a href="' + AURA_AI_URL + '" target="_blank" rel="noopener" class="aa-rem-aura-btn">Open Aura AI →</a>' +
            '</div>' +
          '</div>';
        } else {
          html = '<p class="aa-rem-error">Something went wrong fetching your recommendation. Please try again in a moment.</p>';
        }
        astroOutputDiv.innerHTML = html;
      });
  });
}

/* Bootstrap: the form fields are injected by aaCalcInit(). It must run on the
   first load AND on every Turbo SPA navigation / prerender activation —
   DOMContentLoaded alone never fires on a Turbo visit, which left the form
   empty until a hard reload. The in-function guard makes re-entry a no-op. */
if (document.readyState !== 'loading') aaCalcInit();
else document.addEventListener('DOMContentLoaded', aaCalcInit);
document.addEventListener('turbo:load', aaCalcInit);
document.addEventListener('turbo:render', aaCalcInit);
