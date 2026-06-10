const container = document.getElementById("savedSearchesContainer");

async function loadSearches() {
  try {
    const res = await fetch("/api/saved-searches");
    if (!res.ok) {
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      throw new Error("Failed to load searches.");
    }
    const data = await res.json();
    renderSearches(data.searches);
  } catch (err) {
    container.innerHTML = `<p style="color: red;">Error: ${err.message}</p>`;
  }
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function currency(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0
  }).format(value);
}

function priceRangeLabel(minPriceValue, maxPriceValue) {
  const min = Number(minPriceValue);
  const max = Number(maxPriceValue);
  const hasMin = Number.isFinite(min) && min > 0;
  const hasMax = Number.isFinite(max) && max > 0;

  if (hasMin && hasMax) return `${currency(min)} - ${currency(max)}`;
  if (hasMin) return `${currency(min)}+`;
  if (hasMax) return `Up to ${currency(max)}`;
  return "Any price";
}

function bedroomLabel(value) {
  const beds = Number(value || 0);
  return beds > 0 ? `${beds}+ bed${beds === 1 ? "" : "s"}` : "Any beds";
}

function bedroomRangeLabel(minValue, maxValue) {
  const min = Number(minValue || 0);
  const max = Number(maxValue || 0);
  if (min > 0 && max > 0) return `${min}-${max} beds`;
  if (min > 0) return `${min}+ bed${min === 1 ? "" : "s"}`;
  if (max > 0) return `Up to ${max} bed${max === 1 ? "" : "s"}`;
  return "Any beds";
}

function propertyTypeLabel(value) {
  const labels = {
    flat: "Flat",
    house: "House",
    commercial: "Commercial"
  };
  return labels[value] || "Any type";
}

function formatSearchDetails(search) {
  const parts = [];
  if (search.location) parts.push(`Location: ${escapeHtml(search.location)}`);
  if (search.radius) parts.push(`Radius: ${search.radius === "0" ? "Exact area" : `${escapeHtml(search.radius)} miles`}`);
  parts.push(`Price: ${escapeHtml(priceRangeLabel(search.minPrice, search.maxPrice))}`);
  parts.push(`Beds: ${escapeHtml(bedroomRangeLabel(search.minBeds ?? search.beds, search.maxBeds))}`);
  parts.push(`Type: ${escapeHtml(propertyTypeLabel(search.propertyType))}`);
  if (search.criteria && search.criteria.length) {
    parts.push(`Criteria: ${escapeHtml(search.criteria.join(", "))}`);
  }
  return parts.join(" | ");
  if (search.location) parts.push(`Location: ${escapeHtml(search.location)}`);
  if (search.radius) parts.push(`Radius: ${search.radius} miles`);
  if (search.minPrice || search.maxPrice) {
    parts.push(`Price: £${search.minPrice || 0} - ${search.maxPrice ? '£' + search.maxPrice : 'Any'}`);
  }
  if (search.beds) parts.push(`Beds: ${search.beds}+`);
  if (search.criteria && search.criteria.length) {
    parts.push(`Criteria: ${search.criteria.join(", ")}`);
  }
  return parts.join(" | ");
}

function renderSearches(searches) {
  if (searches.length === 0) {
    container.innerHTML = "<p>No saved searches found.</p>";
    return;
  }

  container.innerHTML = "";
  for (const search of searches) {
    const card = document.createElement("div");
    card.className = "search-card";

    const isNotifying = search.notifyFrequency && search.notifyFrequency !== "off";
    const currentFreq = isNotifying ? search.notifyFrequency : "daily"; // default if they turn it on but didn't have one

    card.innerHTML = `
      <div class="search-card-header">
        <div>
          <h3 class="search-title">${escapeHtml(search.location) || "Global Search"}</h3>
          <p class="search-details">${formatSearchDetails(search)}</p>
        </div>
        <div>
          <button class="delete-btn load-btn" data-id="${search.id}" style="color: var(--primary); border-color: var(--primary); margin-right: 0.5rem;">Load & Run</button>
          <button class="delete-btn" data-id="${search.id}">Delete</button>
        </div>
      </div>
      <div class="notification-controls">
        <label>
          <input type="checkbox" class="notify-checkbox" data-id="${search.id}" ${isNotifying ? "checked" : ""}>
          Enable Notifications
        </label>
        <select class="select-schedule" data-id="${search.id}" ${!isNotifying ? "disabled" : ""}>
          <option value="now" ${currentFreq === "now" ? "selected" : ""}>Now</option>
          <option value="daily" ${currentFreq === "daily" ? "selected" : ""}>Daily</option>
          <option value="weekly" ${currentFreq === "weekly" ? "selected" : ""}>Weekly</option>
        </select>
        <span class="status-indicator" id="status-${search.id}" style="font-size:0.8rem; color: green; margin-left: auto;"></span>
      </div>
    `;
    container.appendChild(card);
  }

  // Attach delete listeners
  document.querySelectorAll(".delete-btn:not(.load-btn)").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      if (!confirm("Are you sure you want to delete this search?")) return;
      const id = e.target.getAttribute("data-id");
      await fetch(`/api/saved-searches/${encodeURIComponent(id)}`, { method: "DELETE" });
      loadSearches();
    });
  });

  // Attach load listeners
  document.querySelectorAll(".load-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.target.getAttribute("data-id");
      window.location.href = `/?loadSearchId=${encodeURIComponent(id)}`;
    });
  });

  // Attach patch listeners
  document.querySelectorAll(".notify-checkbox, .select-schedule").forEach(el => {
    el.addEventListener("change", async (e) => {
      const id = e.target.getAttribute("data-id");
      const card = e.target.closest(".search-card");
      
      const checkbox = card.querySelector(".notify-checkbox");
      const select = card.querySelector(".select-schedule");
      const indicator = card.querySelector(`#status-${id}`);

      select.disabled = !checkbox.checked;

      const notifyFrequency = checkbox.checked ? select.value : "off";
      
      indicator.textContent = "Saving...";
      
      try {
        const res = await fetch(`/api/saved-searches/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notifyFrequency })
        });
        
        if (res.ok) {
          indicator.textContent = "Saved ✓";
          setTimeout(() => indicator.textContent = "", 2000);
        } else {
          indicator.textContent = "Error saving";
          indicator.style.color = "red";
        }
      } catch (err) {
        indicator.textContent = "Error saving";
        indicator.style.color = "red";
      }
    });
  });
}

loadSearches();
