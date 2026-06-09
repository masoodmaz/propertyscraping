
const form = document.querySelector("#searchForm");
const locationInput = document.querySelector("#locationInput");
const radiusSelect = document.querySelector("#radiusSelect");
const resultCount = document.querySelector("#resultCount");
const sourceCount = document.querySelector("#sourceCount");
const sourceLinks = document.querySelector("#sourceLinks");
const locationResolution = document.querySelector("#locationResolution");
const propertyGrid = document.querySelector("#propertyGrid");
const emptyState = document.querySelector("#emptyState");
const resultsHeading = document.querySelector("#resultsHeading");
const sortSelect = document.querySelector("#sortSelect");
const minPrice = document.querySelector("#minPrice");
const maxPrice = document.querySelector("#maxPrice");
const minBeds = document.querySelector("#minBeds");
const maxBeds = document.querySelector("#maxBeds");
const propertyType = document.querySelector("#propertyType");
const modePill = document.querySelector("#modePill");
const applyFiltersButton = document.querySelector("#applyFiltersButton");
const authStatus = document.querySelector("#authStatus");
const saveSearchButton = document.querySelector("#saveSearchButton");
const savedSearchStatus = document.querySelector("#savedSearchStatus");
const savedSearchList = document.querySelector("#savedSearchList");
const savedNotifyFrequency = document.querySelector("#savedNotifyFrequency");

let activeListings = [];
let latestSearchId = 0;
let currentUser = null;

const PRICE_OPTIONS = [
  50000, 60000, 70000, 80000, 90000, 100000, 110000, 120000, 125000, 130000,
  140000, 150000, 160000, 170000, 175000, 180000, 190000, 200000, 210000,
  220000, 230000, 240000, 250000, 260000, 270000, 280000, 290000, 300000,
  325000, 350000, 375000, 400000, 425000, 450000, 475000, 500000, 550000,
  600000, 650000, 700000, 800000, 900000, 1000000, 1250000, 1500000,
  1750000, 2000000, 2500000, 3000000, 4000000, 5000000, 7500000, 10000000,
  15000000, 20000000
];

function currency(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0
  }).format(value);
}

function populatePriceSelect(select, emptyLabel) {
  select.innerHTML = "";
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = emptyLabel;
  select.appendChild(emptyOption);

  PRICE_OPTIONS.forEach((price) => {
    const option = document.createElement("option");
    option.value = String(price);
    option.textContent = currency(price);
    select.appendChild(option);
  });
}

populatePriceSelect(minPrice, "No min");
populatePriceSelect(maxPrice, "No max");

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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || "Unexpected server response." };
  }
}

function selectedValues(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function currentSearchCriteria() {
  const selectedMinBeds = Number.parseInt(minBeds.value, 10) || 0;
  return {
    name: locationInput.value.trim() || "Untitled search",
    location: locationInput.value.trim(),
    radius: radiusSelect.value,
    criteria: selectedValues("criteria"),
    sources: selectedValues("source"),
    minPrice: minPrice.value === "" ? "" : Number.parseInt(minPrice.value, 10),
    maxPrice: maxPrice.value === "" ? "" : Number.parseInt(maxPrice.value, 10),
    beds: selectedMinBeds,
    minBeds: selectedMinBeds,
    maxBeds: maxBeds.value === "" ? "" : Number.parseInt(maxBeds.value, 10),
    propertyType: propertyType.value,
    sort: sortSelect.value,
    notifyFrequency: savedNotifyFrequency.value
  };
}

function setCheckedValues(name, values) {
  const wanted = new Set(values || []);
  document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.checked = wanted.has(input.value);
  });
}

function setSelectNumberValue(select, value) {
  select.value = Number.isFinite(value) ? String(value) : "";
}

function applySavedSearch(search) {
  locationInput.value = search.location || "";
  radiusSelect.value = search.radius || "5";
  setCheckedValues("criteria", search.criteria || []);
  setCheckedValues("source", search.sources || ["Rightmove"]);
  setSelectNumberValue(minPrice, search.minPrice);
  setSelectNumberValue(maxPrice, search.maxPrice);
  minBeds.value = String(search.minBeds ?? search.beds ?? 0);
  maxBeds.value = Number.isFinite(search.maxBeds) ? String(search.maxBeds) : "";
  propertyType.value = search.propertyType || "";
  sortSelect.value = search.sort || "relevance";
  savedNotifyFrequency.value = search.notifyFrequency || "off";
  savedSearchStatus.textContent = "Saved search loaded and executing...";
  
  // Directly run the search
  runSearch();
}

function rightmovePropertyTypes(value) {
  if (value === "flat") return "flat";
  if (value === "house") return "detached,semi-detached,terraced";
  if (value === "commercial") return "commercial";
  return "";
}

function buildSourceUrl(source, location, radius, criteria, selectedPropertyType = "") {
  const keyword = criteria.map((criterion) => criterion === "Cash buyers" ? "Cash Buyers" : criterion).join(" ");
  const rightmoveRadius = radius === "0" ? "0.0" : radius;
  const params = new URLSearchParams({
    searchLocation: location,
    radius: rightmoveRadius,
    keywords: keyword,
    sortType: "18",
    propertyTypes: rightmovePropertyTypes(selectedPropertyType),
    _includeSSTC: "on",
    channel: "BUY",
    transactionType: "BUY"
  });
  return `https://www.rightmove.co.uk/property-for-sale/find.html?${params.toString()}`;
}

function inferTags(listing) {
  if (Array.isArray(listing.tags) && listing.tags.length > 0) return listing.tags;
  const featureText = Array.isArray(listing.features) ? listing.features.join(" ") : "";
  const text = `${listing.title} ${listing.description} ${featureText}`.toLowerCase();
  const tags = [];
  if (text.includes("reduced") || text.includes("below previous")) tags.push("Reduced");
  if (text.includes("cash")) tags.push("Cash buyers");
  if (text.includes("probate")) tags.push("Probate");
  if (text.includes("refurbishment") || text.includes("renovat") || text.includes("modernisation")) tags.push("Needs Refurbishment");
  return tags;
}

function listingMatches(listing, criteria, sources, min, max, selectedMinBeds, selectedMaxBeds, selectedPropertyType) {
  const tags = inferTags(listing);
  const type = String(listing.propertyType || "").toLowerCase();
  const matchesCriteria = criteria.length === 0 || criteria.some((criterion) => tags.includes(criterion));
  const matchesSource = sources.includes(listing.source);
  const matchesMin = Number.isNaN(min) || listing.price >= min;
  const matchesMax = Number.isNaN(max) || listing.price <= max;
  const matchesMinBeds = listing.beds >= selectedMinBeds;
  const matchesMaxBeds = Number.isNaN(selectedMaxBeds) || listing.beds <= selectedMaxBeds;
  const matchesPropertyType = !selectedPropertyType ||
    (selectedPropertyType === "flat" && type.includes("flat")) ||
    (selectedPropertyType === "house" && /(house|detached|semi-detached|terraced|bungalow|cottage)/.test(type)) ||
    (selectedPropertyType === "commercial" && type.includes("commercial"));
  return matchesCriteria && matchesSource && matchesMin && matchesMax && matchesMinBeds && matchesMaxBeds && matchesPropertyType;
}

function sortListings(listings) {
  const sorted = [...listings];
  if (sortSelect.value === "priceAsc") sorted.sort((a, b) => a.price - b.price);
  if (sortSelect.value === "priceDesc") sorted.sort((a, b) => b.price - a.price);
  if (sortSelect.value === "newest") sorted.sort((a, b) => a.ageDays - b.ageDays);
  return sorted;
}

function renderSourceLinks(location, radius, criteria, sources, resolvedUrls = {}) {
  sourceLinks.innerHTML = "";
  sources.forEach((source) => {
    const link = document.createElement("a");
    link.href = resolvedUrls[source] || buildSourceUrl(source, location, radius, criteria, propertyType.value);
    link.target = "_blank";
    link.rel = "noreferrer";
    link.innerHTML = `<span>${source}</span><span aria-hidden="true">↗</span>`;
    sourceLinks.appendChild(link);
  });
}

function renderLocationResolution(resolvedLocation) {
  if (!resolvedLocation) {
    locationResolution.textContent = "Resolving location through Rightmove...";
    return;
  }

  locationResolution.innerHTML = `
    <strong>${resolvedLocation.displayName}</strong><br>
    ${resolvedLocation.locationIdentifier}
  `;
}

function canUseApi() {
  return location.protocol === "http:" || location.protocol === "https:";
}

function normalizeApiListing(listing) {
  return {
    ...listing,
    source: listing.source || "Rightmove",
    title: listing.title || "Property listing",
    location: listing.location || "Location not shown",
    price: Number(listing.price || 0),
    priceText: listing.priceText || "",
    beds: Number(listing.beds || 0),
    propertyType: listing.propertyType || "",
    ageDays: Number(listing.ageDays || 0),
    description: listing.description || listing.summary || "",
    features: listing.features || [],
    url: listing.url || "#"
  };
}

async function fetchRightmoveListings({ location, radius, criteria, sort, propertyType }) {
  const params = new URLSearchParams({
    location,
    radius,
    sort,
    keywords: criteria.join(","),
    propertyType
  });
  const response = await fetch(`/api/rightmove/search?${params.toString()}`);
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload.error || "Rightmove search failed.");
  }

  return payload;
}

function renderListings() {
  const sorted = sortListings(activeListings);
  propertyGrid.innerHTML = "";
  emptyState.classList.toggle("hidden", sorted.length > 0);

  sorted.forEach((listing) => {
    const tags = inferTags(listing);
    const card = document.createElement("article");
    card.className = "property-card";
    const imageStyle = listing.imageUrl ? ` style="background-image: linear-gradient(rgba(0,0,0,0), rgba(0,0,0,.18)), url('${listing.imageUrl}');"` : "";
    card.innerHTML = `
      <div class="property-image"${imageStyle}><span>${listing.source}</span></div>
      <div class="property-main">
        <a class="property-title" href="${listing.url}" target="_blank" rel="noreferrer">${listing.title}</a>
        <div class="property-meta">
          <span>${listing.location}</span>
          <span>${listing.beds} bed${listing.beds === 1 ? "" : "s"}</span>
          <span>${listing.ageDays} day${listing.ageDays === 1 ? "" : "s"} ago</span>
        </div>
        <p>${listing.description}</p>
        <div class="tag-row">
          ${tags.map((tag) => `<span class="tag ${tag.toLowerCase().split(" ")[0]}">${tag}</span>`).join("")}
          <span class="tag source">${listing.source}</span>
        </div>
      </div>
      <div class="property-actions">
        <div class="price">${listing.price ? currency(listing.price) : listing.priceText || "POA"}</div>
        <a class="view-link" href="${listing.url}" target="_blank" rel="noreferrer">View source</a>
      </div>
    `;
    propertyGrid.appendChild(card);
  });
}

function renderSavedSearches(searches) {
  savedSearchList.innerHTML = "";
  if (!searches.length) {
    savedSearchList.innerHTML = `<div class="saved-search-status">No saved searches yet.</div>`;
    return;
  }

  searches.forEach((search) => {
    const locationMeta = `${search.radius === "0" ? "Exact area" : `${escapeHtml(search.radius)} miles`}`;
    const keywordMeta = escapeHtml((search.criteria || []).join(", ") || "No keyword filters");
    const priceMeta = escapeHtml(priceRangeLabel(search.minPrice, search.maxPrice));
    const bedsMeta = escapeHtml(bedroomRangeLabel(search.minBeds ?? search.beds, search.maxBeds));
    const typeMeta = escapeHtml(propertyTypeLabel(search.propertyType));
    const item = document.createElement("div");
    item.className = "saved-search-item";
    item.innerHTML = `
      <div>
        <div class="saved-search-name">${escapeHtml(search.name)}</div>
        <div class="saved-search-meta">
          ${escapeHtml(search.location)} · ${locationMeta} · ${keywordMeta}
          <br>${priceMeta} · ${bedsMeta}
          <br>Property type: ${typeMeta}
          <br>Notifications: ${escapeHtml(search.notifyFrequency || "off")}
        </div>
      </div>
      <div class="saved-search-actions">
        <button class="small-button load" type="button">Load</button>
        <button class="small-button rename" type="button">Rename</button>
        <button class="small-button delete" type="button">Delete</button>
      </div>
    `;

    item.querySelector(".load").addEventListener("click", () => applySavedSearch(search));
    item.querySelector(".rename").addEventListener("click", () => renameSavedSearch(search));
    item.querySelector(".delete").addEventListener("click", () => deleteSavedSearch(search.id));
    savedSearchList.appendChild(item);
  });
}

async function loadSavedSearches() {
  if (!currentUser) return;
  try {
    const response = await fetch("/api/saved-searches");
    const payload = await readJsonResponse(response);
    if (!response.ok) throw new Error(payload.error || "Could not load saved searches.");
    renderSavedSearches(payload.searches || []);
  } catch (error) {
    savedSearchStatus.textContent = error.message;
  }
}

async function saveCurrentSearch() {
  const criteria = currentSearchCriteria();
  if (!criteria.location) {
    savedSearchStatus.textContent = "Enter a town or postcode before saving.";
    return;
  }

  try {
    savedSearchStatus.textContent = "Saving...";
    const response = await fetch("/api/saved-searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(criteria)
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) throw new Error(payload.error || "Could not save search.");
    if (payload.notification?.sent) {
      savedSearchStatus.textContent = `Saved and sent ${payload.notification.count} Telegram match${payload.notification.count === 1 ? "" : "es"}.`;
    } else if (criteria.notifyFrequency === "now") {
      savedSearchStatus.textContent = `Saved. Telegram not sent: ${payload.notification?.reason || "No matches."}`;
    } else {
      savedSearchStatus.textContent = "Saved.";
    }
    await loadSavedSearches();
  } catch (error) {
    savedSearchStatus.textContent = error.message;
  }
}

async function deleteSavedSearch(id) {
  try {
    savedSearchStatus.textContent = "Deleting...";
    const response = await fetch(`/api/saved-searches/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) throw new Error(payload.error || "Could not delete search.");
    savedSearchStatus.textContent = "Deleted.";
    await loadSavedSearches();
  } catch (error) {
    savedSearchStatus.textContent = error.message;
  }
}

async function renameSavedSearch(search) {
  const nextName = window.prompt("Rename saved search", search.name || search.location || "");
  if (nextName === null) return;

  const name = nextName.trim();
  if (!name) {
    savedSearchStatus.textContent = "Enter a name for the saved search.";
    return;
  }

  try {
    savedSearchStatus.textContent = "Renaming...";
    const response = await fetch(`/api/saved-searches/${encodeURIComponent(search.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) throw new Error(payload.error || "Could not rename search.");
    savedSearchStatus.textContent = "Renamed.";
    await loadSavedSearches();
  } catch (error) {
    savedSearchStatus.textContent = error.message;
  }
}



async function runSearch() {
  const location = locationInput.value.trim();
  const radius = radiusSelect.value;
  const criteria = selectedValues("criteria");
  const sources = selectedValues("source");
  const min = Number.parseInt(minPrice.value, 10);
  const max = Number.parseInt(maxPrice.value, 10);
  const selectedMinBeds = Number.parseInt(minBeds.value, 10) || 0;
  const selectedMaxBeds = Number.parseInt(maxBeds.value, 10);
  const selectedPropertyType = propertyType.value;
  const searchId = ++latestSearchId;

  renderSourceLinks(location, radius, criteria, sources);
  if (sources.includes("Rightmove") && canUseApi()) {
    renderLocationResolution(null);
  } else {
    locationResolution.textContent = "Rightmove source is not selected.";
  }
  sourceCount.textContent = sources.length;
  modePill.textContent = canUseApi() && sources.includes("Rightmove") ? "Searching Rightmove" : "No API connection";
  resultsHeading.textContent = "Searching...";

  try {
    const liveListings = [];

    if (canUseApi() && sources.includes("Rightmove")) {
      const payload = await fetchRightmoveListings({
        location,
        radius,
        criteria,
        sort: sortSelect.value,
        propertyType: selectedPropertyType
      });
      liveListings.push(...payload.listings.map(normalizeApiListing));
      renderLocationResolution(payload.resolvedLocation);
      renderSourceLinks(location, radius, criteria, sources, {
        Rightmove: payload.sourceUrl
      });
    }

    activeListings = liveListings.filter((listing) =>
      listingMatches(listing, criteria, sources, min, max, selectedMinBeds, selectedMaxBeds, selectedPropertyType)
    );

    modePill.textContent = canUseApi() && sources.includes("Rightmove") ? "Live data" : "No API connection";
  } catch (error) {
    if (searchId !== latestSearchId) return;
    activeListings = [];
    modePill.textContent = "Search failed";
    console.warn(error);
  }

  if (searchId !== latestSearchId) return;

  resultCount.textContent = activeListings.length;
  resultsHeading.textContent = `${activeListings.length} result${activeListings.length === 1 ? "" : "s"} within ${radius === "0" ? "the exact area" : `${radius} miles`}`;
  renderListings();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch();
});

applyFiltersButton.addEventListener("click", () => {
  if (locationInput.value.trim()) runSearch();
});

sortSelect.addEventListener("change", () => {
  if (locationInput.value.trim()) runSearch();
});

saveSearchButton.addEventListener("click", saveCurrentSearch);


renderSourceLinks("Leeds", "5", selectedValues("criteria"), selectedValues("source"));

const profileBtn = document.querySelector("#profileBtn");
const profileModal = document.querySelector("#profileModal");
const profileTelegramChatId = document.querySelector("#profileTelegramChatId");
const closeProfileBtn = document.querySelector("#closeProfileBtn");
const saveProfileBtn = document.querySelector("#saveProfileBtn");

let currentUserProfile = null;

if (profileBtn) {
  profileBtn.addEventListener("click", async () => {
    if (!currentUser) return alert("Please sign in first.");
    try {
      const res = await fetch("/api/profile");
      if (res.ok) {
        const payload = await res.json();
        currentUserProfile = payload.profile;
        if (currentUserProfile) {
          profileTelegramChatId.value = currentUserProfile.telegramChatId || "";
        }
      }
    } catch(err) {
      console.error(err);
    }
    profileModal.showModal();
  });
}

if (closeProfileBtn) {
  closeProfileBtn.addEventListener("click", () => profileModal.close());
}

if (saveProfileBtn) {
  saveProfileBtn.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramChatId: profileTelegramChatId.value.trim() })
      });
      if (res.ok) {
        profileModal.close();
        alert("Profile saved!");
      } else {
        alert("Error saving profile");
      }
    } catch(err) {
      console.error(err);
    }
  });
}

fetch("/api/me")
  .then((response) => response.ok ? response.json() : null)
  .then((payload) => {
    if (payload?.user?.email) {
      currentUser = payload.user;
      authStatus.textContent = payload.user.email;
      loadSavedSearches().then(() => {
        // Check if we arrived here to load a specific search
        const urlParams = new URLSearchParams(window.location.search);
        const loadSearchId = urlParams.get("loadSearchId");
        if (loadSearchId) {
          fetch("/api/saved-searches")
            .then(res => res.json())
            .then(data => {
              const autoSearch = data.searches?.find(s => s.id === loadSearchId);
              if (autoSearch) applySavedSearch(autoSearch);
            });
          
          // Clean up URL without reloading
          const newUrl = window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);
        }
      });
    }
  })
  .catch(() => {});
