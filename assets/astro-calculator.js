/* assets/astro-calculator.js */

document.addEventListener("DOMContentLoaded", function () {
  const tabs = document.querySelectorAll(".rudraksha-tabs .tab");
  const form = document.getElementById("calculator-form");
  const astroResultsDiv = document.getElementById("astro-results");
  const astroOutputDiv = document.getElementById("astro-output");

  const gemstoneFields = `
    <div class="form-group">
      <input type="text" name="name" placeholder="Enter your name" required>
      <input type="tel" name="phone" placeholder="Enter your phone number">
    </div>
    <div class="form-group">
      <input type="date" name="dob" required>
      <input type="time" name="tob">
      <label><input type="checkbox" name="no_time"> I don't have time of birth</label>
    </div>
    <div class="form-group">
      <input type="text" name="lat" placeholder="Latitude (e.g., 28.6139)" required>
      <input type="text" name="lon" placeholder="Longitude (e.g., 77.2090)" required>
    </div>
  `;

  const rudrakshaFields = `
     <div>
   
     
        <form id="calculator-form">
          <!-- Form fields will be dynamically loaded by astro-calculator.js based on tab selection. -->
          <!-- The initial content below serves as the default 'By Birth' structure before JS fully initializes. -->
          <div class="form-group">
            <input type="text" name="name" placeholder="Enter your name" required>
            <input type="tel" name="phone" placeholder="Enter your phone number">
          </div>

          <div class="form-group">
            <input type="date" name="dob" required>
            <input type="time" name="tob">
            <label><input type="checkbox" name="no_time"> I don't have time of birth</label>
          </div>

          <div class="form-group">
            <input type="text" name="lat" placeholder="Latitude (e.g., 28.6139)" required>
            <input type="text" name="lon" placeholder="Longitude (e.g., 77.2090)" required>
          </div>
        </form>

        <!-- Results Section -->
        <div id="astro-results" class="astro-results" style="display:none;">
          <h3>Recommendation Details</h3>
          <div id="astro-output"></div>
        </div>
      

  </div>
  `;

  function switchTab(tabName) {
    tabs.forEach(tab => tab.classList.remove("active"));
    document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add("active");
    astroResultsDiv.style.display = 'none'; // Hide results when switching tabs
    astroOutputDiv.innerHTML = ''; // Clear previous results

    if (tabName === "by-gemstone") {
      form.innerHTML = gemstoneFields + `<button type="submit" class="rudraksha-btn">Know your Rudraksha</button>`;
    } else {
      form.innerHTML = rudrakshaFields + `<button type="submit" class="rudraksha-btn">Know your Rudraksha</button>`;
    }
  }

  // Default tab on load
  switchTab("by-gemstone");

  // Tab click event
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      switchTab(tab.dataset.tab);
    });
  });

  // Form submit handler
  document.addEventListener("submit", async function (e) {
    let fetchURL = '';
    if (e.target.id === "calculator-form") {
      e.preventDefault();

      const currentTab = document.querySelector(".rudraksha-tabs .tab.active").dataset.tab;

      if (currentTab === "by-rudraksha") {
        fetchURL = "https://json.astrologyapi.com/v1/rudraksha_suggestion";
         if (isNaN(parseFloat(data.lat)) || isNaN(parseFloat(data.lon))) {
            alert("Please enter valid numerical values for Latitude and Longitude.");
            return;
        }

        // alert("The 'By Purpose' feature is not yet integrated with an API. Please use 'By Birth' or implement a separate API call for purpose-based recommendations.");
        // return; // Prevent API call for By Purpose
      }

      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());

      // Validate lat/lon for 'by-gemstone'
      if (currentTab === "by-gemstone") {

        fetchURL = "https://json.astrologyapi.com/v1/basic_gem_suggestion";
        if (isNaN(parseFloat(data.lat)) || isNaN(parseFloat(data.lon))) {
            alert("Please enter valid numerical values for Latitude and Longitude.");
            return;
        }
      }

      // IMPORTANT SECURITY NOTE: Hardcoding API keys in client-side JavaScript is insecure.
      // Anyone can view your source code and extract these keys.
      // For a production Shopify store, you MUST use a server-side proxy (e.g., a Shopify Function,
      // a custom Node.js/PHP proxy, or a service like Netlify Functions/AWS Lambda)
      // to make API calls and keep your API key secure on the server.
      const USER_ID = "642699"; // <<< REPLACE WITH YOUR ACTUAL USER ID
      const API_KEY = "86af5961c6dfcac90d4ae97401a974385dc7c6a3"; // <<< REPLACE WITH YOUR ACTUAL API KEY
      const language = "en"; // Or make this dynamic based on user preference

      const auth = "Basic " + btoa(USER_ID + ":" + API_KEY); // btoa for Base64 encoding

      // Parse date and time inputs
      const dob = new Date(data.dob);
      let hour = 0;
      let min = 0;

      if (data.no_time) {
          hour = 0;
          min = 0;
      } else if (data.tob) {
          const [h, m] = data.tob.split(':').map(Number);
          hour = h;
          min = m;
      }

      // Prepare API payload for json.astrologyapi.com
      const payload = {
        day: dob.getDate(),
        month: dob.getMonth() + 1, // Month is 0-indexed in JS Date
        year: dob.getFullYear(),
        hour: hour,
        min: min,
        lat: parseFloat(data.lat),
        lon: parseFloat(data.lon),
        tzone: 5.5, // Fixed timezone, consider making this dynamic if needed
      };

      try {
        // Display a loading indicator
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
          // Check for specific error messages from the API if available
          const errorMessage = errorData.message || errorData.error || res.statusText;
          throw new Error(`API request failed: ${res.status} - ${errorMessage}`);
        }
        const result = await res.json();
        console.log(result);

        // The response structure from basic_gem_suggestion is usually simpler.
        // It provides 'name', 'gem_suggestion', 'rashi', 'nakshatra', 'planet', 'reason', etc.
        // Adjust displayResult to show relevant information.
        if (result) {
          displayResult(result);
        } else {
          astroOutputDiv.innerHTML = "<p>No valid recommendation found. Please check your input or try different coordinates.</p>";
        }
      } catch (err) {
        console.error("Error during API call:", err);
        astroOutputDiv.innerHTML = `<p>Something went wrong. Please try again. Error: ${err.message || err}</p>`;
      }
    }
  });

  // Updated displayResult function to match json.astrologyapi.com's basic_gem_suggestion response
function displayResult(data) {
  let output = `<div class="gemstone-card-container">`;

  Object.entries(data).forEach(([category, gem]) => {
    output += `
      <div class="gemstone-card">
        <!-- Gem Image -->
        <!-- Content -->
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

        <!-- Footer -->
        <div class="gemstone-footer">
          <button class="view-product-btn">View Product</button>
          <p class="recommend-text">
            <span class="highlight">97.31% astrologers</span> recommended this based on your details
          </p>
        </div>
      </div>
    `;
  });

  output += `</div>`;

  astroOutputDiv.innerHTML = output;
  astroResultsDiv.style.display = 'block';
}


});