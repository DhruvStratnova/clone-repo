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
      <input type="text" name="pob" placeholder="Place of Birth" required>
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
  document.addEventListener("submit", function (e) {
    if (e.target.id === "rudraksha-form") {
      e.preventDefault();

      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());

      console.log("Form Submitted:", data);

      // TODO: Connect with your backend or Shopify app API
      alert("Your Rudraksha details have been submitted successfully!");
    }
  });
});
