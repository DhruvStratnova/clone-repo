document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const tabs = document.querySelectorAll(".calculator-tabs .tab");
  const form = document.getElementById("calculator-form");
  const astroResultsDiv = document.getElementById("astro-results");
  const astroOutputDiv = document.getElementById("astro-output");

  // Config (move secrets to server/proxy in production)
  const ASTRO_USER_ID = "642699"; // never expose real keys in frontend
  const ASTRO_API_KEY = "86af5961c6dfcac90d4ae97401a974385dc7c6a3"; // use a proxy or strict key restrictions
  const GEOAPIFY_API_KEY = "YOUR_GEOAPIFY_KEY"; // public-but-rate-limited; still consider proxy
  const GOOGLE_TZ_API_KEY = ""; // optional: when set, computes DOB-accurate offset

  const ASTRO_BASE = "https://json.astrologyapi.com/v1";
  const ENDPOINTS = {
    gemstone: `${ASTRO_BASE}/basic_gem_suggestion`,
    rudraksha: `${ASTRO_BASE}/rudraksha_suggestion`,
  };

  // State
  let currentTab = "by-gemstone";
  let inFlight = { geo: null, astro: null }; // AbortControllers

  // Helpers
  const authHeader = () =>
    "Basic " + btoa(`${ASTRO_USER_ID}:${ASTRO_API_KEY}`);

  const escapeHTML = (s) =>
    String(s)
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

  // UI: switch tab (no wholesale form re-render; keep stable DOM)
  function switchTab(tabName) {
    tabs.forEach((tab) => tab.classList.remove("active"));
    const btn = document.querySelector(`.tab[data-tab="${tabName}"]`);
    if (btn) btn.classList.add("active");
    currentTab = tabName;
    clearResults();

    // Update submit button label only
    let cta = form.querySelector(".rudraksha-btn");
    if (!cta) {
      cta = document.createElement("button");
      cta.type = "submit";
      cta.className = "rudraksha-btn";
      form.appendChild(cta);
    }
    cta.textContent =
      currentTab === "by-gemstone" ? "Know your Gemstone" : "Know your Rudraksha";

    // Cancel any in-flight requests on tab switch
    if (inFlight.geo) inFlight.geo.abort();
    if (inFlight.astro) inFlight.astro.abort();
  }

  // Initialize: ensure common fields exist in HTML instead of innerHTML swaps
  // Required fields expected in DOM:
  // - input[name="name"], input[type="date" name="dob"], input[type="time" name="tob"]
  // - input[type="checkbox" name="no_time"], input[name="placeName"]
  switchTab("by-gemstone");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  // UX: disable time if "no_time" checked
  const noTimeEl = form.querySelector('input[name="no_time"]');
  const tobEl = form.querySelector('input[name="tob"]');
  if (noTimeEl && tobEl) {
    const syncTimeDisabled = () => {
      tobEl.disabled = noTimeEl.checked;
      if (noTimeEl.checked) tobEl.value = "";
    };
    noTimeEl.addEventListener("change", syncTimeDisabled);
    syncTimeDisabled();
  }

  // Compute tzone (in hours) for DOB
  async function computeTzoneHours({ lat, lon, dobDate, hasTime, signal }) {
    // Prefer precise per-timestamp if Google TZ API key is configured
    if (GOOGLE_TZ_API_KEY) {
      const unixTs = Math.floor(dobDate.getTime() / 1000);
      const url =
        `https://maps.googleapis.com/maps/api/timezone/json` +
        `?location=${lat},${lon}&timestamp=${unixTs}&key=${GOOGLE_TZ_API_KEY}`;
      const r = await fetch(url, { signal });
      if (!r.ok) throw new Error("Timezone API request failed");
      const j = await r.json();
      // total offset in seconds = rawOffset + dstOffset
      const total = (j.rawOffset || 0) + (j.dstOffset || 0);
      return +(total / 3600).toFixed(2);
    }

    // Fallback: use Geoapify timezone (use Standard offset by default)
    // (You can switch to DST offset if you have strong evidence DOB was in DST)
    // Caller must provide properties.timezone
    return null; // computed by caller from Geoapify properties
  }

  // Geocode place name with Geoapify
  async function geocodePlace(placeName, signal) {
    // Request feature collection (default) to access properties and timezone fields
    const url =
      `https://api.geoapify.com/v1/geocode/search?` +
      `text=${encodeURIComponent(placeName)}&apiKey=${GEOAPIFY_API_KEY}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error("Geocoding API request failed");
    const data = await res.json();
    if (!data.features || data.features.length === 0) {
      throw new Error(
        `Could not find the location: "${placeName}". Try a more specific name (e.g., "City, Country").`
      );
    }
    const best = data.features;
    const p = best.properties || {};
    return {
      lat: p.lat,
      lon: p.lon,
      timezone: p.timezone || null, // has offset_STD_seconds and offset_DST_seconds
      label: p.formatted || placeName,
    };
  }

  // Renderers
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

  // Submit handler
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Cancel any prior requests from earlier submit
    if (inFlight.geo) inFlight.geo.abort();
    if (inFlight.astro) inFlight.astro.abort();
    inFlight.geo = new AbortController();
    inFlight.astro = new AbortController();

    try {
      clearResults();
      setResults("<p>Finding location and generating recommendation...</p>");

      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());

      // Basic validation
      const placeName = (data.placeName || "").trim();
      if (!placeName) throw new Error("Please enter a valid place name");
      if (!data.dob) throw new Error("Please select a valid date of birth");

      const dob = new Date(data.dob);
      let hour = 0,
        min = 0;
      const noTime = fd.has("no_time");
      if (!noTime && data.tob) {
        const parts = String(data.tob).split(":");
        if (parts.length === 2) {
          hour = Number(parts) || 0;
          min = Number(parts[1]) || 0;
        }
      }
      dob.setHours(hour, min, 0, 0);

      // 1) Geocoding
      const { lat, lon, timezone } = await geocodePlace(
        placeName,
        inFlight.geo.signal
      );

      if (typeof lat !== "number" || typeof lon !== "number") {
        throw new Error("Geocoding did not return valid coordinates");
      }

      // 2) Compute tzone (hours)
      let tzoneHours;
      if (GOOGLE_TZ_API_KEY) {
        // precise per-DOB timestamp using Google TZ API
        tzoneHours = await computeTzoneHours({
          lat,
          lon,
          dobDate: dob,
          hasTime: !noTime,
          signal: inFlight.geo.signal,
        });
      } else {
        // fallback: use Standard offset from Geoapify timezone
        const std = timezone?.offset_STD_seconds;
        const dst = timezone?.offset_DST_seconds;
        // Choose STD by default; if time provided and STD absent but DST present, fall back to DST
        const useSeconds =
          typeof std === "number"
            ? std
            : typeof dst === "number"
            ? dst
            : 0;
        tzoneHours = +(useSeconds / 3600).toFixed(2);
      }

      // 3) Astrology API
      const fetchURL =
        currentTab === "by-gemstone"
          ? ENDPOINTS.gemstone
          : ENDPOINTS.rudraksha;

      const payload = {
        day: dob.getDate(),
        month: dob.getMonth() + 1,
        year: dob.getFullYear(),
        hour,
        min,
        lat,
        lon,
        tzone: tzoneHours,
      };

      const res = await fetch(fetchURL, {
        method: "POST",
        headers: {
          authorization: authHeader(),
          "Content-Type": "application/json",
          "Accept-Language": "en",
        },
        body: JSON.stringify(payload),
        signal: inFlight.astro.signal,
      });

      if (!res.ok) {
        let errorText = res.statusText;
        try {
          const errorData = await res.json();
          errorText = errorData.message || errorData.error || errorText;
        } catch (_) {
          // ignore
        }
        throw new Error(errorText);
      }

      const result = await res.json();
      if (currentTab === "by-gemstone") {
        renderGemstones(result);
      } else {
        renderRudraksha(result);
      }
    } catch (err) {
      if (err?.name === "AbortError") return; // user navigated / new submit
      setResults(
        `<p><strong>An error occurred:</strong> ${escapeHTML(
          err.message || String(err)
        )}</p>`
      );
    } finally {
      // clear controllers; new interactions will create fresh ones
      inFlight.geo = null;
      inFlight.astro = null;
    }
  });
});
