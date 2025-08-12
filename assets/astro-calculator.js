/* assets/rudraksha-calculator.js */

document.addEventListener("DOMContentLoaded", function () {
  const tabs = document.querySelectorAll(".rudraksha-tabs .tab");
  const form = document.getElementById("rudraksha-form");

  const byBirthFields = `
    <div class="form-group">
      <input type="text" name="name" placeholder="Enter your name" required>
      <input type="tel" name="phone" placeholder="Enter your phone number" required>
    </div>
    <div class="form-group">
      <input type="date" name="dob" required>
      <input type="time" name="tob">
      <label><input type="checkbox" name="no_time"> I don't have time of birth</label>
    </div>
    <div class="form-group">
      <input type="text" name="lat" placeholder="Latitude" required>
      <input type="text" name="lon" placeholder="Longitude" required>
    </div>
  `;

  const byPurposeFields = `
    <div class="form-group">
      <input type="text" name="name" placeholder="Enter your name" required>
      <input type="tel" name="phone" placeholder="Enter your phone number" required>
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

    if (tabName === "by-birth") {
      form.innerHTML = byBirthFields + `<button type="submit" class="rudraksha-btn">Know your Rudraksha</button>`;
    } else {
      form.innerHTML = byPurposeFields + `<button type="submit" class="rudraksha-btn">Know your Rudraksha</button>`;
    }
  }

  // Default tab
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

      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());

      // Prepare API payload
      const payload = {
        api_key: "khsagdfaouhefou2h32j34hl6erjh",
        dob: data.dob,
        tob: data.no_time ? "" : data.tob || "",
        lat: data.lat,
        lon: data.lon,
        tz: 5.5,
        lang: "en"
      };

      try {
        const res = await fetch("https://api.vedicastroapi.com/v3-json/extended-horoscope/gem-suggestion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error("API request failed");
        const result = await res.json();

        if (result.status === 200 && result.response) {
          const r = result.response;
          const filtered = {
            name: r.name,
            gem: r.gem,
            planet: r.planet,
            other_name: r.other_name,
            description: r.description,
            good_results: r.good_results,
            diseases_cure: r.diseases_cure,
            finger: r.finger,
            weight: r.weight,
            day: r.day,
            metal: r.metal,
            substitute: r.substitute,
            not_to_wear_with: r.not_to_wear_with,
            time_to_wear_short: r.time_to_wear_short,
            time_to_wear: r.time_to_wear,
            methods: r.methods
          };

          displayResult(filtered);
        } else {
          alert("No valid recommendation found.");
        }
      } catch (err) {
        console.error(err);
        alert("Something went wrong. Please try again.");
      }
    }
  });

  function displayResult(data) {
    let output = `
      <div class="rudraksha-result">
        <h3>Recommended Gemstone: ${data.name} (${data.other_name})</h3>
        <p><strong>Gem:</strong> ${data.gem}</p>
        <p><strong>Planet:</strong> ${data.planet}</p>
        <p><strong>Description:</strong> ${data.description}</p>
        <p><strong>Good Results:</strong> ${data.good_results.join(", ")}</p>
        <p><strong>Diseases Cure:</strong> ${data.diseases_cure.join(", ")}</p>
        <p><strong>Finger:</strong> ${data.finger}</p>
        <p><strong>Weight:</strong> ${data.weight}</p>
        <p><strong>Day:</strong> ${data.day}</p>
        <p><strong>Metal:</strong> ${data.metal}</p>
        <p><strong>Substitute:</strong> ${data.substitute.join(", ")}</p>
        <p><strong>Not to Wear With:</strong> ${data.not_to_wear_with.join(", ")}</p>
        <p><strong>Time to Wear (short):</strong> ${data.time_to_wear_short}</p>
        <p><strong>Time to Wear:</strong> ${data.time_to_wear}</p>
        <p><strong>Methods:</strong> ${data.methods}</p>
      </div>
    `;

    // Append result below the form
    form.insertAdjacentHTML("afterend", output);
  }
});
