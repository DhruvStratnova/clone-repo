/* assets/astro-calculator.js */

document.addEventListener("DOMContentLoaded", function () {
  const tabs = document.querySelectorAll(".rudraksha-tabs .tab");
  const form = document.getElementById("rudraksha-form");
  const astroResultsDiv = document.getElementById("astro-results");
  const astroOutputDiv = document.getElementById("astro-output");

  const byBirthFields = `
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

  // Note: The "By Purpose" tab currently collects data but does not interact with the 'gem-suggestion' API,
  // which requires birth details. You might need a different API endpoint or logic for this tab.
  const byPurposeFields = `
    <div class="form-group">
      <input type="text" name="name" placeholder="Enter your name" required>
      <input type="tel" name="phone" placeholder="Enter your phone number">
    </div>
    <div class="form-group">
      <select name="purpose" required>
        <option value="">Select your purpose</option>
        <option value="health">Health & Wellness</option>
        <option value="career">Career Growth</option>
        <option value="spiritual">Spiritual Upliftment</option>
        <option value="relationships">Better Relationships</option>
      </select>
    </div>
  `;

  function switchTab(tabName) {
    tabs.forEach(tab => tab.classList.remove("active"));
    document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add("active");
    astroResultsDiv.style.display = 'none'; // Hide results when switching tabs
    astroOutputDiv.innerHTML = ''; // Clear previous results

    if (tabName === "by-birth") {
      form.innerHTML = byBirthFields + `<button type="submit" class="rudraksha-btn">Know your Rudraksha</button>`;
    } else {
      form.innerHTML = byPurposeFields + `<button type="submit" class="rudraksha-btn">Find by Purpose</button>`;
    }
  }

  // Default tab on load
  switchTab("by-birth");

  // Tab click event
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      switchTab(tab.dataset.tab);
    });
  });

  // Form submit handler
  document.addEventListener("submit", async function (e) {
    if (e.target.id === "rudraksha-form") {
      e.preventDefault();

      const currentTab = document.querySelector(".rudraksha-tabs .tab.active").dataset.tab;

      if (currentTab === "by-purpose") {
        alert("The 'By Purpose' feature is not yet integrated with an API. Please use 'By Birth' or implement a separate API call for purpose-based recommendations.");
        return; // Prevent API call for By Purpose
      }

      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());

      // Validate lat/lon for 'by-birth'
      if (currentTab === "by-birth") {
        if (isNaN(parseFloat(data.lat)) || isNaN(parseFloat(data.lon))) {
            alert("Please enter valid numerical values for Latitude and Longitude.");
            return;
        }
      }

      // IMPORTANT SECURITY NOTE: Hardcoding API keys in client-side JavaScript is insecure.
      // For a production Shopify store, consider using a server-side proxy (e.g., a Shopify Function,
      // a Node.js/PHP proxy, or a service like Netlify Functions/AWS Lambda)
      // to make API calls and keep your API key secure on the server.
      const API_KEY = "khsagdfaouhefou2h32j34hl6erjh"; // This should be securely handled

      // Prepare API payload for 'by-birth'
      const payload = {
        api_key: API_KEY,
        dob: data.dob,
        tob: data.no_time ? "" : data.tob || "", // Send empty string if no_time is checked
        lat: parseFloat(data.lat), // Ensure latitude is a number
        lon: parseFloat(data.lon), // Ensure longitude is a number
        tz: 5.5, // Fixed timezone, consider making this dynamic if needed
        lang: "en"
      };

      try {
        // Display a loading indicator
        astroOutputDiv.innerHTML = '<p>Loading recommendation...</p>';
        astroResultsDiv.style.display = 'block';

        const res = await fetch("https://api.vedicastroapi.com/v3-json/extended-horoscope/gem-suggestion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(`API request failed: ${res.status} - ${errorData.message || res.statusText}`);
        }
        const result = await res.json();

        if (result.status === 200 && result.response) {
          const r = result.response;
          const filtered = {
            name: r.name,
            gem: r.gem,
            planet: r.planet,
            other_name: r.other_name,
            description: r.description,
            // Ensure these are arrays, as .join() expects them
            good_results: Array.isArray(r.good_results) ? r.good_results : [r.good_results].filter(Boolean),
            diseases_cure: Array.isArray(r.diseases_cure) ? r.diseases_cure : [r.diseases_cure].filter(Boolean),
            finger: r.finger,
            weight: r.weight,
            day: r.day,
            metal: r.metal,
            substitute: Array.isArray(r.substitute) ? r.substitute : [r.substitute].filter(Boolean),
            not_to_wear_with: Array.isArray(r.not_to_wear_with) ? r.not_to_wear_with : [r.not_to_wear_with].filter(Boolean),
            time_to_wear_short: r.time_to_wear_short,
            time_to_wear: r.time_to_wear,
            methods: r.methods
          };

          displayResult(filtered);
        } else {
          astroOutputDiv.innerHTML = "<p>No valid recommendation found. Please check your input.</p>";
        }
      } catch (err) {
        console.error("Error during API call:", err);
        astroOutputDiv.innerHTML = `<p>Something went wrong. Please try again. Error: ${err.message}</p>`;
      }
    }
  });

  function displayResult(data) {
    let output = `
      <div class="rudraksha-result">
        <h3>Recommended Gemstone: ${data.name || 'N/A'} (${data.other_name || 'N/A'})</h3>
        <p><strong>Gem:</strong> ${data.gem || 'N/A'}</p>
        <p><strong>Planet:</strong> ${data.planet || 'N/A'}</p>
        <p><strong>Description:</strong> ${data.description || 'N/A'}</p>
        <p><strong>Good Results:</strong> ${data.good_results.length ? data.good_results.join(", ") : 'N/A'}</p>
        <p><strong>Diseases Cure:</strong> ${data.diseases_cure.length ? data.diseases_cure.join(", ") : 'N/A'}</p>
        <p><strong>Finger:</strong> ${data.finger || 'N/A'}</p>
        <p><strong>Weight:</strong> ${data.weight || 'N/A'}</p>
        <p><strong>Day:</strong> ${data.day || 'N/A'}</p>
        <p><strong>Metal:</strong> ${data.metal || 'N/A'}</p>
        <p><strong>Substitute:</strong> ${data.substitute.length ? data.substitute.join(", ") : 'N/A'}</p>
        <p><strong>Not to Wear With:</strong> ${data.not_to_wear_with.length ? data.not_to_wear_with.join(", ") : 'N/A'}</p>
        <p><strong>Time to Wear (short):</strong> ${data.time_to_wear_short || 'N/A'}</p>
        <p><strong>Time to Wear:</strong> ${data.time_to_wear || 'N/A'}</p>
        <p><strong>Methods:</strong> ${data.methods || 'N/A'}</p>
      </div>
    `;

    astroOutputDiv.innerHTML = output;
    astroResultsDiv.style.display = 'block'; // Make results visible
  }
});