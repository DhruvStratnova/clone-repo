
document.addEventListener("DOMContentLoaded", function () {
  const tabs = document.querySelectorAll(".calculator-tabs .tab");
  const form = document.getElementById("calculator-form");
  const astroResultsDiv = document.getElementById("astro-results");
  const astroOutputDiv = document.getElementById("astro-output");

  const commonFields = `
    <div class="form-group">
      <input type="text" name="name" placeholder="Enter your name" required>
    </div>
    <div class="form-group">
      <input type="date" name="dob" required>
      <input type="time" name="tob">
      <label><input type="checkbox" name="no_time"> I don't have time of birth</label>
    </div>
    <div class="form-group">
      <input type="text" name="placeName" placeholder="Enter Birth Place (e.g., New Delhi, India)" required>
    </div>
  `;

  const gemstoneFields = commonFields;
  const rudrakshaFields = commonFields;

  function switchTab(tabName) {
    tabs.forEach(tab => tab.classList.remove("active"));
    document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add("active");
    astroResultsDiv.style.display = 'none';
    astroOutputDiv.innerHTML = '';

    if (tabName === "by-gemstone") {
      form.innerHTML = gemstoneFields + `<button type="submit" class="rudraksha-btn">Know your Gemstone</button>`;
    } else {
      form.innerHTML = rudrakshaFields + `<button type="submit" class="rudraksha-btn">Know your Rudraksha</button>`;
    }
  }

  // Default tab
  switchTab("by-gemstone");

  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      switchTab(tab.dataset.tab);
    });
  });

  // Form submit handler
  document.addEventListener("submit", async function (e) {
    if (e.target.id === "calculator-form") {
      e.preventDefault();

      const currentTab = document.querySelector(".calculator-tabs .tab.active").dataset.tab;
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());
      
      // --- DEBUG: Log form data ---
      console.log("1. Form Data Submitted:", data);

      // API auth details
      const ASTRO_USER_ID = "642699";
      const ASTRO_API_KEY = "86af5961c6dfcac90d4ae97401a974385dc7c6a3";
      const GEOAPIFY_API_KEY = "55e9073809d4409fa8c39310584517f9"; // Your actual key
      const auth = "Basic " + btoa(ASTRO_USER_ID + ":" + ASTRO_API_KEY);
      
      astroOutputDiv.innerHTML = '<p>Finding location and generating recommendation...</p>';
      astroResultsDiv.style.display = 'block';

      try {
        const placeName = data.placeName;
        const geoApiUrl = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(placeName)}&apiKey=${GEOAPIFY_API_KEY}`;
        
        const geoResponse = await fetch(geoApiUrl);
        if (!geoResponse.ok) {
          throw new Error("Geocoding API request failed.");
        }
        
        const geoResult = await geoResponse.json();

        // --- DEBUG: Log Geoapify response ---
        console.log("2. Geoapify API Response:", geoResult);

        if (!geoResult.features || geoResult.features.length === 0) {
          throw new Error(`Could not find the location: "${placeName}". Please try a more specific name (e.g., "City, Country").`);
        }

        const properties = geoResult.features[0].properties;
        const latitude = properties.lat;
        const longitude = properties.lon;
        const timezoneOffsetSeconds = properties.timezone.offset_DST_seconds;
        const timezoneOffsetHours = timezoneOffsetSeconds / 3600;
        
        // --- DEBUG: Log extracted coordinates ---
        console.log(`3. Extracted Location: Latitude=${latitude}, Longitude=${longitude}, Timezone=${timezoneOffsetHours}`);

        let fetchURL = "";
        if (currentTab === "by-gemstone") {
          fetchURL = "https://json.astrologyapi.com/v1/basic_gem_suggestion";
        } else if (currentTab === "by-rudraksha") {
          fetchURL = "https://json.astrologyapi.com/v1/rudraksha_suggestion";
        }

        const dob = new Date(data.dob);
        let hour = 0, min = 0;
        if (!data.no_time && data.tob) {
          [hour, min] = data.tob.split(":").map(Number);
        }

        const payload = {
          day: dob.getDate(),
          month: dob.getMonth() + 1,
          year: dob.getFullYear(),
          hour: hour,
          min: min,
          lat: latitude,
          lon: longitude,
          tzone: timezoneOffsetHours
        };
        
        // --- DEBUG: Log the payload for the Astrology API ---
        console.log("4. Payload for Astrology API:", payload);

        const res = await fetch(fetchURL, {
          method: "POST",
          headers: {
            "authorization": auth,
            "Content-Type": "application/json",
            "Accept-Language": "en"
          },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.message || errorData.error || res.statusText);
        }

        const result = await res.json();
        
        // --- DEBUG: Log the final result from the Astrology API ---
        console.log("5. Astrology API Result:", result);

        if (currentTab === "by-gemstone") {
          displayResult(result);
        } else if (currentTab === "by-rudraksha") {
          displayRudrakshaResult(result);
        }
      } catch (err) {
        console.error("Error during API call:", err);
        astroOutputDiv.innerHTML = `<p><strong>An error occurred:</strong> ${err.message || err}. Please check the input and try again.</p>`;
      }
    }
  });

  // Gemstone card display
  function displayResult(data) {
    let output = `<div class="gemstone-card-container">`;
    Object.entries(data).forEach(([category, gem]) => {
      if (gem && gem.name) {
          output += `
          <div class="gemstone-card">
            <div class="gemstone-content">
              <h2 class="gemstone-title">${gem.name} (${category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())})</h2>
              <p class="gemstone-description">
                Represents <strong>${gem.gem_deity}</strong>, helping overcome obstacles 
                and bringing stability. Provides protection and supports personal growth.
              </p>
              <ul class="gemstone-specs">
                <li><strong>Metal:</strong> ${gem.wear_metal || 'N/A'}</li>
                <li><strong>Finger:</strong> ${gem.wear_finger || 'N/A'} finger of right hand</li>
                <li><strong>Wear Day:</strong> ${gem.wear_day || 'N/A'}</li>
                <li><strong>Weight:</strong> ${gem.weight_caret || 'N/A'} carat</li>
                <li><strong>Semi Gem:</strong> ${gem.semi_gem || 'N/A'}</li>
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
    astroOutputDiv.innerHTML = output;
    astroResultsDiv.style.display = 'block';
  }

  // Rudraksha card display
  function displayRudrakshaResult(data) {
    const output = `
      <div class="rudraksha-card">
        <div class="rudraksha-content">
          <h2 class="rudraksha-tabs">${data.name}</h2>
          <p class="rudraksha-recommend">${data.recommend}</p>
          <p class="rudraksha-detail">${data.detail}</p>
        </div>
      </div>
    `;
    astroOutputDiv.innerHTML = output;
    astroResultsDiv.style.display = 'block';
  }
});