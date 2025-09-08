
document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("calculator-form");

  form.addEventListener("keyup", async (e) => {
    if (e.target.name === "placeName") {
      const placeInput = e.target;
      const suggestionsDiv = document.getElementById("place-suggestions");
      const GEOAPIFY_API_KEY = "55e9073809d4409fa8c39310584517f9";

      if (placeInput.value.length >= 3) {
        const geoApiUrl = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(placeInput.value)}&apiKey=${GEOAPIFY_API_KEY}`;
        try {
          const geoResponse = await fetch(geoApiUrl);
          if (geoResponse.ok) {
            const geoResult = await geoResponse.json();
            if (geoResult.features && geoResult.features.length > 0) {
              suggestionsDiv.innerHTML = "";
              geoResult.features.forEach(feature => {
                const suggestion = document.createElement("div");
                suggestion.classList.add("suggestion-item");
                suggestion.textContent = feature.properties.formatted;
                suggestion.addEventListener("click", () => {
                  placeInput.value = feature.properties.formatted;
                  suggestionsDiv.innerHTML = "";
                });
                suggestionsDiv.appendChild(suggestion);
              });
            }
          }
        } catch (error) {
          console.error("Error fetching place suggestions:", error);
        }
      } else {
        suggestionsDiv.innerHTML = "";
      }
    }
  });
});
