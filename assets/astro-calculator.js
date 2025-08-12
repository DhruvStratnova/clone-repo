document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("rudraksha-form");
  const resultsContainer = document.getElementById("astro-results");
  const output = document.getElementById("astro-output");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    output.innerHTML = "<p>Loading...</p>";
    resultsContainer.style.display = "block";

    const formData = new FormData(form);
    const dob = formData.get("dob"); // YYYY-MM-DD
    const tob = formData.get("tob") || "";
    const place = formData.get("pob");
    const noTime = formData.get("no_time");

    // For now, hardcode lat/lon (You can integrate a geocoding API later)
    const lat = "27.8974";
    const lon = "78.0880";

    try {
      const res = await fetch("https://api.vedicastroapi.com/v3-json/extended-horoscope/gem-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: "khsagdfaouhefou2h32j34hl6erjh",
          dob: formatDateForAPI(dob),
          tob: noTime ? "" : tob,
          lat: lat,
          lon: lon,
          tz: 5.5,
          lang: "en"
        })
      });

      if (!res.ok) throw new Error("Network response was not ok");

      const data = await res.json();
      if (data.status !== 200 || !data.response) {
        output.innerHTML = "<p>Unable to fetch recommendation. Please try again later.</p>";
        return;
      }

      const r = data.response;
      output.innerHTML = `
        <p><strong>Name:</strong> ${r.name}</p>
        <p><strong>Gem:</strong> ${r.gem}</p>
        <p><strong>Planet:</strong> ${r.planet}</p>
        <p><strong>Other Name:</strong> ${r.other_name}</p>
        <p><strong>Description:</strong> ${r.description}</p>
        <p><strong>Good Results:</strong> ${r.good_results.join(", ")}</p>
        <p><strong>Diseases Cure:</strong> ${r.diseases_cure.join(", ")}</p>
        <p><strong>Finger:</strong> ${r.finger}</p>
        <p><strong>Weight:</strong> ${r.weight}</p>
        <p><strong>Day:</strong> ${r.day}</p>
        <p><strong>Metal:</strong> ${r.metal}</p>
        <p><strong>Substitute:</strong> ${r.substitute.join(", ")}</p>
        <p><strong>Not To Wear With:</strong> ${r.not_to_wear_with.join(", ")}</p>
        <p><strong>Time to Wear (Short):</strong> ${r.time_to_wear_short}</p>
        <p><strong>Time to Wear:</strong> ${r.time_to_wear}</p>
        <p><strong>Methods:</strong> ${r.methods}</p>
      `;
    } catch (err) {
      console.error(err);
      output.innerHTML = "<p>Error fetching data. Please try again later.</p>";
    }
  });

  function formatDateForAPI(dateStr) {
    // API expects DD/MM/YYYY
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  }
});
