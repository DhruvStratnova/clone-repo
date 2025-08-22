/* assets/astro-calculator.js */

document.addEventListener("DOMContentLoaded", function () {
  const tabs = document.querySelectorAll(".calculator-tabs .tab");
  const form = document.getElementById("calculator-form");
  const astroResultsDiv = document.getElementById("astro-results");
  const astroOutputDiv = document.getElementById("astro-output");

  const gemstoneFields = `
    <div class="form-group">
      <input type="text" name="name" placeholder="Enter your name" required>
    </div>
    <div class="form-group">
      <input type="date" name="dob" required>
      <input type="time" name="tob">
      <label><input type="checkbox" name="no_time"> I don't have time of birth</label>
    </div>
    <div class="form-group">
      <input type="text" name="lat" placeholder="Latitude (e.g., 28.6139)" required>
      <input type="text" name="lon" placeholder="Longitude (e.g., 77.2090)" required>
      <input type="text" name="placeName" placeholder="Enter Birth Place" required>

    </div>
  `;

  const rudrakshaFields = `
    <div class="form-group">
      <input type="text" name="name" placeholder="Enter your name" required>
    </div>
    <div class="form-group">
      <input type="date" name="dob" required>
      <input type="time" name="tob">
      <label><input type="checkbox" name="no_time"> I don't have time of birth</label>
    </div>
    <div class="form-group">
      <input type="text" name="lat" placeholder="Latitude (e.g., 28.6139)" required>
      <input type="text" name="lon" placeholder="Longitude (e.g., 77.2090)" required>
      <input type="text" name="placeName" placeholder="Enter Birth Place" required>
    </div>
  `;

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

      let fetchURL = "";
      if (currentTab === "by-gemstone") {
        fetchURL = "https://json.astrologyapi.com/v1/basic_gem_suggestion";
      } else if (currentTab === "by-rudraksha") {
        fetchURL = "https://json.astrologyapi.com/v1/rudraksha_suggestion";
      }

      // Validate lat/lon
      if (isNaN(parseFloat(data.lat)) || isNaN(parseFloat(data.lon))) {
        alert("Please enter valid numerical values for Latitude and Longitude.");
        return;
      }

      // API auth
      const USER_ID = "642699";
      const API_KEY = "86af5961c6dfcac90d4ae97401a974385dc7c6a3";
      const language = "en";
      const auth = "Basic " + btoa(USER_ID + ":" + API_KEY);


      //GEOCODING API
      const geoapifyKey = "55e9073809d4409fa8c39310584517f9";


      // Date & time
      const dob = new Date(data.dob);
      let hour = 0, min = 0;
      if (!data.no_time && data.tob) {
        [hour, min] = data.tob.split(":").map(Number);
      }

      const payload = {
        day: dob.getDate(),
        month: dob.getMonth() + 1,
        year: dob.getFullYear(),
        hour,
        min,
        lat: parseFloat(data.lat),
        lon: parseFloat(data.lon),
        birthPlace: placeName
        tzone: 5.5
      };

      try {
        astroOutputDiv.innerHTML = '<p>Loading recommendation...</p>';
        astroResultsDiv.style.display = 'block';






        

        const res = await fetch(fetchURL, {
          method: "POST",
          headers: {
            "authorization": auth,
            "Content-Type": "application/json",
            "Accept-Language": language
          },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.message || errorData.error || res.statusText);
        }

        const result = await res.json();
        console.log(result);

        if (currentTab === "by-gemstone") {
          displayResult(result);
        } else if (currentTab === "by-rudraksha") {
          displayRudrakshaResult(result);
        }
      } catch (err) {
        console.error("Error during API call:", err);
        astroOutputDiv.innerHTML = `<p>Something went wrong. Please try again. Error: ${err.message || err}</p>`;
      }
    }
  });

  // Gemstone card display
  function displayResult(data) {
    let output = `<div class="gemstone-card-container">`;
    Object.entries(data).forEach(([category, gem]) => {
      output += `
        <div class="gemstone-card">
          <div class="gemstone-content">
            <h2 class="gemstone-title">${gem.name}</h2>
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
          <a
          href="{{ product.url }}" 
          class="gemstone-footer">
            <button class="view-product-btn">View Product</button>
          </a>
        </div>
      `;
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
