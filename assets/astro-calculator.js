// assets/astro-calculator.js
document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("astro-calculator");
  const proxyURL = root?.dataset?.proxyUrl || "/apps/astro/suggest"; // optional backend proxy
  const tabs = root.querySelectorAll(".calculator-tabs .tab");
  const form = document.getElementById("calculator-form");
  const astroResultsDiv = document.getElementById("astro-results");
  const astroOutputDiv = document.getElementById("astro-output");

  // IMPORTANT: prefer server-side proxy for AstrologyAPI; Geoapify key may also be proxied or tightly restricted
  const GEOAPIFY_API_KEY = "YOUR_GEOAPIFY_KEY";

  const ASTRO_BASE = "https://json.astrologyapi.com/v1";
  const ENDPOINTS = {
    gemstone: `${ASTRO_BASE}/basic_gem_suggestion`,
    rudraksha: `${ASTRO_BASE}/rudraksha_suggestion`,
  };

  let currentTab = "by-gemstone";
  let inFlight = { submit: null }; // AbortController

  const escapeHTML = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const setResults = (html) => {
    astroOutputDiv.innerHTML = html;
    astroResultsDiv.style.display = "block";
  };
  const clearResults = () => {
    astroOutputDiv.innerHTML = "";
    astroResultsDiv.style.display = "none";
  };

  function switchTab(tabName) {
    tabs.forEach((t) => t.classList.remove("active"));
    const el = root.querySelector(`.tab[data-tab="${tabName}"]`);
    if (el) el.classList.add("active");
    currentTab = tabName;
    clearResults();
    const cta = form.querySelector(".rudraksha-btn");
    if (cta) cta.textContent =
      currentTab === "by-gemstone" ? "Know your Gemstone" : "Know your Rudraksha";
    if (inFlight.submit) inFlight.submit.abort();
  }

  // Default
  switchTab("by-gemstone");
  tabs.forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));

  // UX: disable time when no_time checked
  const noTimeEl = form.querySelector('input[name="no_time"]');
  const tobEl = form.querySelector('input[name="tob"]');
  if (noTimeEl && tobEl) {
    const sync = () => {
      tobEl.disabled = noTimeEl.checked;
      if (noTimeEl.checked) tobEl.value = "";
    };
    noTimeEl.addEventListener("change", sync);
    sync();
  }

  // Geoapify forward geocoding by placeName
  async function geocodePlace(placeName, signal) {
    const url =
      `https://api.geoapify.com/v1/geocode/search?` +
      `text=${encodeURIComponent(placeName)}&apiKey=${GEOAPIFY_API_KEY}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error("Geocoding API request failed");
    const data = await res.json();
    if (!data.features || data.features.length === 0) {
      throw new Error(`Could not find the location: "${placeName}". Try a more specific name (e.g., "City, Country").`);
    }
    const best = data.features;
    const p = best.properties || {};
    if (typeof p.lat !== "number" || typeof p.lon !== "number") {
      throw new Error("Geocoding did not return valid coordinates");
    }
    return { lat: p.lat, lon: p.lon, timezone: p.timezone || null, label: p.formatted || placeName };
  }

  // Compute tzone hours using Geoapify timezone offsets (STD preferred)
  function computeTzoneHoursFromGeoapifyTZ(tz) {
    const std = tz?.offset_STD_seconds;
    const dst = tz?.offset_DST_seconds;
    const useSeconds = typeof std === "number" ? std : typeof dst === "number" ? dst : 0;
    return +(useSeconds / 3600).toFixed(2);
  }

  function renderGemstones(result) {
    let output = `<div class="gemstone-card-container">`;
    Object.entries(result || {}).forEach(([category, gem]) => {
      if (gem && gem.name) {
        const catTitle = escapeHTML(
          category.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())
        );
        output += `
          <div class="gemstone-card">
            <div class="gemstone-content">
              <h2 class="gemstone-title">${escapeHTML(gem.name)} (${catTitle})</h2>
              <p class="gemstone-description">
                Represents <strong>${escapeHTML(gem.gem_deity || "N/A")}</strong>, helping overcome obstacles 
                and bringing stability. Provides protection and supports personal growth.
              </p>
              <ul class="gemstone-specs">
                <li><strong>Metal:</strong> ${escapeHTML(gem.wear_metal || "N/A")}</li>
                <li><strong>Finger:</strong> ${escapeHTML(gem.wear_finger || "N/A")} finger of right hand</li>
                <li><strong>Wear Day:</strong> ${escapeHTML(gem.wear_day || "N/A")}</li>
                <li><strong>Weight:</strong> ${escapeHTML(gem.weight_caret || "N/A")} carat</li>
                <li><strong>Semi Gem:</strong> ${escapeHTML(gem.semi_gem || "N/A")}</li>
              </ul>
            </div>
            <a href="#" class="gemstone-footer">
              <button class="view-product-btn">View Product</button>
            </a>
          </div>
        `;
      }
    });
    output += `</div>`;
    setResults(output);
  }

  function renderRudraksha(result) {
    const name = escapeHTML(result?.name || "Rudraksha");
    const recommend = escapeHTML(result?.recommend || "");
    const detail = escapeHTML(result?.detail || "");
    const output = `
      <div class="rudraksha-card">
        <div class="rudraksha-content">
          <h2 class="rudraksha-tabs">${name}</h2>
          <p class="rudraksha-recommend">${recommend}</p>
          <p class="rudraksha-detail">${detail}</p>
        </div>
      </div>
    `;
    setResults(output);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (inFlight.submit) inFlight.submit.abort();
    inFlight.submit = new AbortController();

    clearResults();
    setResults("<p>Finding location and generating recommendation...</p>");

    try {
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());

      const name = (data.name || "").trim();
      const dobStr = (data.dob || "").trim();
      const placeName = (data.placeName || "").trim();
      const no_time = fd.has("no_time");
      const tob = no_time ? "" : (data.tob || "").trim();

      if (!name) throw new Error("Please enter a valid name");
      if (!dobStr) throw new Error("Please select a valid date of birth");
      if (!placeName) throw new Error("Please enter a birth place");

      const dob = new Date(dobStr);
      let hour = 0, min = 0;
      if (!no_time && tob) {
        const [h, m] = tob.split(":").map(Number);
        hour = h || 0; min = m || 0;
      }

      // 1) Geocode via Geoapify
      const { lat, lon, timezone } = await geocodePlace(placeName, inFlight.submit.signal);

      // 2) Compute tzone hours (prefer Standard offset)
      const tzone = computeTzoneHoursFromGeoapifyTZ(timezone);

      // 3) Call AstrologyAPI (ideally via server proxy to protect credentials)
      const endpoint = currentTab === "by-gemstone" ? ENDPOINTS.gemstone : ENDPOINTS.rudraksha;

      // If using a server proxy: POST to proxyURL with all inputs and let the server call AstrologyAPI securely
      // Otherwise: call AstrologyAPI directly here (NOT recommended on public storefront)

      const useProxy = true; // set false only for local testing
      if (useProxy) {
        const res = await fetch(proxyURL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept-Language": "en" },
          body: JSON.stringify({
            type: currentTab === "by-gemstone" ? "gemstone" : "rudraksha",
            name,
            day: dob.getDate(),
            month: dob.getMonth() + 1,
            year: dob.getFullYear(),
            hour, min, lat, lon, tzone
          }),
          signal: inFlight.submit.signal
        });
        if (!res.ok) {
          let msg = res.statusText;
          try { const err = await res.json(); msg = err.message || err.error || msg; } catch {}
          throw new Error(msg);
        }
        const result = await res.json();
        currentTab === "by-gemstone" ? renderGemstones(result) : renderRudraksha(result);
      } else {
        // Direct call example (requires Basic auth in headers; move to server in production)
        // ...
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
      setResults(`<p><strong>An error occurred:</strong> ${escapeHTML(err.message || String(err))}</p>`);
    } finally {
      inFlight.submit = null;
    }
  });
});
