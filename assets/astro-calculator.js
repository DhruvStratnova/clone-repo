<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Astrology Calculator with Location Autocomplete</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }

    body {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
      min-height: 100vh;
      padding: 20px;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .container {
      width: 100%;
      max-width: 800px;
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(10px);
      border-radius: 15px;
      padding: 30px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }

    h1 {
      text-align: center;
      margin-bottom: 30px;
      color: #e94560;
      font-size: 2.5rem;
    }

    .calculator-tabs {
      display: flex;
      margin-bottom: 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .tab {
      padding: 12px 24px;
      cursor: pointer;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 5px 5px 0 0;
      margin-right: 5px;
      transition: all 0.3s ease;
    }

    .tab.active {
      background: rgba(233, 69, 96, 0.2);
      color: #e94560;
      border-bottom: 2px solid #e94560;
    }

    .form-group {
      margin-bottom: 20px;
      position: relative;
    }

    input[type="text"],
    input[type="date"],
    input[type="time"] {
      width: 100%;
      padding: 12px 15px;
      margin-bottom: 10px;
      border: none;
      border-radius: 5px;
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      font-size: 16px;
    }

    input::placeholder {
      color: rgba(255, 255, 255, 0.6);
    }

    label {
      display: flex;
      align-items: center;
      margin-top: 5px;
      font-size: 14px;
      color: rgba(255, 255, 255, 0.7);
    }

    input[type="checkbox"] {
      margin-right: 8px;
    }

    .rudraksha-btn {
      width: 100%;
      padding: 15px;
      background: #e94560;
      color: white;
      border: none;
      border-radius: 5px;
      font-size: 18px;
      cursor: pointer;
      transition: background 0.3s ease;
      margin-top: 10px;
    }

    .rudraksha-btn:hover {
      background: #ff577f;
    }

    #astro-results {
      margin-top: 30px;
      display: none;
    }

    #astro-output {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 10px;
      padding: 20px;
      margin-top: 20px;
    }

    .gemstone-card-container {
      display: grid;
      grid-template-columns: 1fr;
      gap: 20px;
    }

    .gemstone-card, .rudraksha-card {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .gemstone-title, .rudraksha-tabs {
      color: #e94560;
      margin-bottom: 15px;
    }

    .gemstone-description, .rudraksha-recommend {
      margin-bottom: 15px;
      line-height: 1.6;
    }

    .gemstone-specs {
      list-style: none;
      margin-bottom: 20px;
    }

    .gemstone-specs li {
      padding: 5px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .view-product-btn {
      padding: 10px 20px;
      background: #0f3460;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      transition: background 0.3s ease;
    }

    .view-product-btn:hover {
      background: #1a5dad;
    }

    .location-autocomplete {
      position: relative;
    }

    .suggestions-container {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: #1a1a2e;
      border-radius: 0 0 5px 5px;
      max-height: 200px;
      overflow-y: auto;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    }

    .suggestion-item {
      padding: 10px 15px;
      cursor: pointer;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      transition: background 0.2s ease;
    }

    .suggestion-item:hover {
      background: rgba(233, 69, 96, 0.2);
    }

    .suggestion-item:last-child {
      border-bottom: none;
    }

    .loading-indicator {
      padding: 10px 15px;
      color: rgba(255, 255, 255, 0.7);
      font-style: italic;
    }

    @media (min-width: 768px) {
      .gemstone-card-container {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Astrology Calculator</h1>
    
    <div class="calculator-tabs">
      <div class="tab active" data-tab="by-gemstone">Gemstone Recommendation</div>
      <div class="tab" data-tab="by-rudraksha">Rudraksha Recommendation</div>
    </div>
    
    <form id="calculator-form">
      <div class="form-group">
        <input type="text" name="name" placeholder="Enter your name" required>
      </div>
      <div class="form-group">
        <input type="date" name="dob" required>
        <input type="time" name="tob">
        <label><input type="checkbox" name="no_time"> I don't have time of birth</label>
      </div>
      <div class="form-group location-autocomplete">
        <input type="text" name="placeName" id="placeName" placeholder="Enter Birth Place (e.g., New Delhi, India)" required autocomplete="off">
        <div class="suggestions-container" style="display: none;"></div>
      </div>
      <button type="submit" class="rudraksha-btn">Know your Gemstone</button>
    </form>
    
    <div id="astro-results">
      <h2>Your Recommendation</h2>
      <div id="astro-output"></div>
    </div>
  </div>

  <script>
    document.addEventListener("DOMContentLoaded", function () {
      const tabs = document.querySelectorAll(".calculator-tabs .tab");
      const form = document.getElementById("calculator-form");
      const astroResultsDiv = document.getElementById("astro-results");
      const astroOutputDiv = document.getElementById("astro-output");
      const placeInput = document.getElementById("placeName");
      const suggestionsContainer = document.querySelector(".suggestions-container");

      // Debounce function to limit API calls
      function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
          const later = () => {
            clearTimeout(timeout);
            func(...args);
          };
          clearTimeout(timeout);
          timeout = setTimeout(later, wait);
        };
      }

      // Fetch location suggestions
      const fetchSuggestions = debounce(async (query) => {
        if (query.length < 3) {
          suggestionsContainer.style.display = 'none';
          return;
        }

        try {
          suggestionsContainer.innerHTML = '<div class="loading-indicator">Loading suggestions...</div>';
          suggestionsContainer.style.display = 'block';

          // Using Geoapify API for autocomplete
          const GEOAPIFY_API_KEY = "YOUR_GEOAPIFY_API_KEY"; // Replace with your actual key
          const response = await fetch(
            `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(query)}&apiKey=${GEOAPIFY_API_KEY}`
          );

          if (!response.ok) {
            throw new Error("Autocomplete API request failed.");
          }

          const data = await response.json();
          
          if (data.features && data.features.length > 0) {
            suggestionsContainer.innerHTML = '';
            data.features.forEach(feature => {
              const div = document.createElement('div');
              div.className = 'suggestion-item';
              div.textContent = feature.properties.formatted;
              div.addEventListener('click', () => {
                placeInput.value = feature.properties.formatted;
                suggestionsContainer.style.display = 'none';
              });
              suggestionsContainer.appendChild(div);
            });
          } else {
            suggestionsContainer.innerHTML = '<div class="suggestion-item">No results found</div>';
          }
        } catch (error) {
          console.error("Error fetching suggestions:", error);
          suggestionsContainer.innerHTML = '<div class="suggestion-item">Error loading suggestions</div>';
        }
      }, 300);

      // Event listener for place input
      placeInput.addEventListener('input', (e) => {
        fetchSuggestions(e.target.value);
      });

      // Hide suggestions when clicking outside
      document.addEventListener('click', (e) => {
        if (!placeInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
          suggestionsContainer.style.display = 'none';
        }
      });

      const commonFields = `
        <div class="form-group">
          <input type="text" name="name" placeholder="Enter your name" required>
        </div>
        <div class="form-group">
          <input type="date" name="dob" required>
          <input type="time" name="tob">
          <label><input type="checkbox" name="no_time"> I don't have time of birth</label>
        </div>
        <div class="form-group location-autocomplete">
          <input type="text" name="placeName" id="placeName" placeholder="Enter Birth Place (e.g., New Delhi, India)" required autocomplete="off">
          <div class="suggestions-container" style="display: none;"></div>
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
        
        // Reattach event listeners after updating the form
        const newPlaceInput = document.getElementById("placeName");
        const newSuggestionsContainer = document.querySelector(".suggestions-container");
        
        newPlaceInput.addEventListener('input', (e) => {
          fetchSuggestions(e.target.value);
        });
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
          
          // API auth details
          const ASTRO_USER_ID = "642699";
          const ASTRO_API_KEY = "YOUR_ASTRO_API_KEY"; // Replace with your actual key
          const GEOAPIFY_API_KEY = "YOUR_GEOAPIFY_API_KEY"; // Replace with your actual key
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

            if (!geoResult.features || geoResult.features.length === 0) {
              throw new Error(`Could not find the location: "${placeName}". Please try a more specific name (e.g., "City, Country").`);
            }

            const properties = geoResult.features[0].properties;
            const latitude = properties.lat;
            const longitude = properties.lon;
            const timezoneOffsetSeconds = properties.timezone.offset_DST_seconds;
            const timezoneOffsetHours = timezoneOffsetSeconds / 3600;
            
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
                <a href="/collections/all" class="gemstone-footer">
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
  </script>
</body>
</html>