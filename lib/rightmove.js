const RIGHTMOVE_BASE_URL = "https://www.rightmove.co.uk";

const SORT_TYPES = {
  newest: "6",
  priceAsc: "1",
  priceDesc: "2",
  relevance: "18"
};

function normalizeRadius(radius) {
  return String(radius) === "0" ? "0.0" : String(radius || "5");
}

function normalizeKeywords(keywords) {
  const canonical = {
    "cash buyers": "Cash Buyers",
    reduced: "Reduced",
    probate: "Probate"
  };

  return (Array.isArray(keywords) ? keywords : [keywords])
    .map(k => String(k || "").trim())
    .filter(Boolean)
    .map(k => canonical[k.toLowerCase()] || k)
    .join(" ");
}

function normalizePropertyTypes(propertyType) {
  if (propertyType === "flat") return "flat";
  if (propertyType === "house") return "detached,semi-detached,terraced";
  if (propertyType === "commercial") return "commercial";
  return "";
}

function fetchFailureMessage(label, url, error) {
  const cause = error?.cause?.code || error?.cause?.message || error?.message || "unknown network error";
  return `${label} fetch failed for ${url}: ${cause}`;
}

const RIGHTMOVE_PAGE_SIZE = 24;
const RIGHTMOVE_RESULT_LIMIT = 25;
const RIGHTMOVE_MAX_PAGES = 8;

function buildRightmoveSearchUrl({ location, locationIdentifier = "", radius = "5", keywords = [], sort = "newest", index = 0, propertyType = "" }) {
  const cleanLocation = String(location || "").trim();
  if (!cleanLocation && !locationIdentifier) {
    throw new Error("A town or postcode is required.");
  }

  const params = new URLSearchParams({
    searchLocation: cleanLocation,
    useLocationIdentifier: locationIdentifier ? "true" : "false",
    locationIdentifier,
    radius: normalizeRadius(radius),
    propertyTypes: normalizePropertyTypes(propertyType),
    _includeSSTC: "on",
    mustHave: "",
    dontShow: "",
    furnishTypes: "",
    sortType: SORT_TYPES[sort] || SORT_TYPES.newest,
    channel: "BUY",
    transactionType: "BUY",
    keywords: normalizeKeywords(keywords)
  });

  if (Number(index) > 0) {
    params.set("index", String(index));
  }

  return `${RIGHTMOVE_BASE_URL}/property-for-sale/find.html?${params.toString()}`;
}

function buildRightmoveApiUrl({ locationIdentifier, radius = "5", keywords = [], sort = "newest", index = 0, propertyType = "" }) {
  const params = new URLSearchParams({
    areaSizeUnit: "sqft",
    channel: "BUY",
    currencyCode: "GBP",
    includeSSTC: "false",
    index: String(index),
    isFetching: "false",
    locationIdentifier,
    numberOfPropertiesPerPage: "24",
    propertyTypes: normalizePropertyTypes(propertyType),
    radius: normalizeRadius(radius),
    sortType: SORT_TYPES[sort] || SORT_TYPES.newest,
    viewType: "LIST",
    keywords: normalizeKeywords(keywords)
  });

  return `${RIGHTMOVE_BASE_URL}/api/_search?${params.toString()}`;
}

function extractNextData(html) {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) {
    throw new Error("Rightmove response did not include __NEXT_DATA__.");
  }
  return JSON.parse(match[1]);
}

function findListingArray(value, depth = 0) {
  if (!value || depth > 8) return null;

  if (Array.isArray(value)) {
    const propertyLikeCount = value.filter((item) => {
      if (!item || typeof item !== "object") return false;
      return Boolean(
        item.id ||
          item.propertyId ||
          item.displayAddress ||
          item.customer ||
          item.price ||
          item.propertyUrl
      );
    }).length;

    if (value.length > 0 && propertyLikeCount >= Math.max(1, Math.floor(value.length * 0.45))) {
      return value;
    }

    for (const item of value) {
      const found = findListingArray(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === "object") {
    const preferredKeys = [
      "properties",
      "propertyCards",
      "results",
      "searchResults",
      "listings"
    ];

    for (const key of preferredKeys) {
      if (Array.isArray(value[key])) {
        const found = findListingArray(value[key], depth + 1);
        if (found) return found;
      }
    }

    for (const key of Object.keys(value)) {
      const found = findListingArray(value[key], depth + 1);
      if (found) return found;
    }
  }

  return null;
}

async function resolveRightmoveLocation(location) {
  const query = String(location || "").trim();
  if (!query) {
    throw new Error("A town or postcode is required.");
  }

  const params = new URLSearchParams({ query });
  const url = `https://los.rightmove.co.uk/typeahead?${params.toString()}`;
  let response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
        Accept: "application/json,text/plain,*/*",
        Origin: RIGHTMOVE_BASE_URL,
        Referer: `${RIGHTMOVE_BASE_URL}/`
      }
    });
  } catch (error) {
    throw new Error(fetchFailureMessage("Rightmove location lookup", url, error));
  }

  if (!response.ok) {
    throw new Error(`Rightmove location lookup returned HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Rightmove location lookup returned a non-JSON response.");
  }

  const data = await response.json();
  const match = data.matches?.find((item) => item.type && item.id) || data.matches?.[0];
  if (!match?.id || !match?.type) {
    throw new Error(`Rightmove could not resolve "${location}" to a location identifier.`);
  }

  return {
    locationIdentifier: `${match.type}^${match.id}`,
    displayName: match.displayName || query
  };
}

function toAbsoluteRightmoveUrl(path) {
  if (!path) return buildRightmoveSearchUrl({ location: "London" });
  if (/^https?:\/\//i.test(path)) return path;
  return `${RIGHTMOVE_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

function parsePrice(rawPrice) {
  if (typeof rawPrice === "number") return rawPrice;
  if (rawPrice && typeof rawPrice === "object") {
    return parsePrice(rawPrice.amount || rawPrice.displayPrice || rawPrice.primaryPrice);
  }
  const match = String(rawPrice || "").replace(/,/g, "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function parsePriceText(rawPrice) {
  if (typeof rawPrice === "string") return rawPrice;
  if (rawPrice && typeof rawPrice === "object") {
    return (
      rawPrice.displayPrice ||
      rawPrice.primaryPrice ||
      rawPrice.displayPrices?.[0]?.displayPrice ||
      ""
    );
  }
  return "";
}

function textFrom(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter(Boolean).join(" ");
  if (value && typeof value === "object") {
    return textFrom(value.text || value.displayAddress || value.displayName || value.description);
  }
  return "";
}

function inferTags(listing) {
  const matchedKeywords = (listing.matchedKeywords || [])
    .map(keyword => String(keyword || "").toLowerCase());
  const haystack = [
    listing.title,
    listing.location,
    listing.summary,
    listing.description,
    listing.addedOrReduced,
    listing.priceText,
    ...(listing.features || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const tags = [];
  if (haystack.includes("reduced") || haystack.includes("price drop") || matchedKeywords.includes("reduced")) tags.push("Reduced");
  if (haystack.includes("cash buyer") || haystack.includes("cash buyers") || haystack.includes("cash only") || matchedKeywords.includes("cash buyers")) tags.push("Cash buyers");
  if (haystack.includes("probate") || matchedKeywords.includes("probate")) tags.push("Probate");
  if (haystack.includes("refurbishment") || haystack.includes("renovat") || haystack.includes("modernisation") || matchedKeywords.includes("refurbishment")) tags.push("Needs Refurbishment");
  return tags;
}

function normalizeRightmoveListing(raw) {
  const priceText = parsePriceText(raw.price);
  const location = textFrom(raw.displayAddress || raw.address || raw.location);
  const summary = textFrom(raw.summary || raw.propertySubType || raw.propertyType);
  const description = textFrom(raw.description || raw.summary || raw.bulletPoints);
  const features = raw.keyFeatures || raw.features || [];
  const matchedKeywords = (raw.keywords || [])
    .filter(keyword => keyword?.matched)
    .map(keyword => keyword.keyword)
    .filter(Boolean);
  const subtype = textFrom(raw.propertySubType || raw.propertyType);
  const title =
    textFrom(raw.title) ||
    [subtype, location].filter(Boolean).join(" in ") ||
    textFrom(raw.heading) ||
    "Rightmove listing";
  const url = toAbsoluteRightmoveUrl(raw.propertyUrl || raw.url);
  const bedrooms = Number(raw.bedrooms || raw.beds || raw.numberOfBedrooms || 0);
  const firstImage =
    raw.propertyImages?.mainImageSrc ||
    raw.propertyImages?.images?.[0]?.srcUrl ||
    raw.images?.[0]?.srcUrl ||
    raw.imageUrl ||
    "";

  const normalized = {
    id: String(raw.id || raw.propertyId || url),
    source: "Rightmove",
    title,
    location,
    price: parsePrice(raw.price),
    priceText,
    beds: Number.isFinite(bedrooms) ? bedrooms : 0,
    propertyType: subtype,
    ageDays: Number(raw.addedOrReducedTimeAgoDays || raw.firstVisibleDateAgeDays || 0),
    description: description || summary,
    summary,
    addedOrReduced: textFrom(raw.addedOrReduced),
    features,
    matchedKeywords,
    tags: [],
    imageUrl: firstImage,
    url
  };

  normalized.tags = inferTags(normalized);
  return normalized;
}

function normalizeRightmovePayload(nextData) {
  const listingArray = nextData?.props?.pageProps?.searchResults?.properties || findListingArray(nextData);
  if (!listingArray) return [];
  return listingArray.map(normalizeRightmoveListing).filter((listing) => listing.url);
}

function normalizeKeywordList(keywords) {
  return (Array.isArray(keywords) ? keywords : [keywords])
    .map(keyword => String(keyword || "").trim().toLowerCase())
    .filter(Boolean);
}

function listingMatchesRequestedKeywords(listing, keywords) {
  const requested = normalizeKeywordList(keywords);
  if (requested.length === 0) return true;

  const tags = (listing.tags || []).map(tag => String(tag).toLowerCase());
  const matchedKeywords = (listing.matchedKeywords || []).map(keyword => String(keyword).toLowerCase());
  const text = [
    listing.title,
    listing.location,
    listing.summary,
    listing.description,
    listing.addedOrReduced,
    ...(listing.features || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return requested.some(keyword => {
    const singularKeyword = keyword.replace(/\s+buyers$/, " buyer");
    return tags.includes(keyword) ||
      matchedKeywords.includes(keyword) ||
      text.includes(keyword) ||
      (singularKeyword !== keyword && text.includes(singularKeyword));
  });
}

async function fetchRightmoveSearchPage({ options, resolvedLocation, index }) {
  const url = buildRightmoveSearchUrl({
    ...options,
    location: resolvedLocation.displayName,
    locationIdentifier: resolvedLocation.locationIdentifier,
    index
  });
  let response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
  } catch (error) {
    throw new Error(fetchFailureMessage("Rightmove search page", url, error));
  }

  if (!response.ok) {
    throw new Error(`Rightmove returned HTTP ${response.status}.`);
  }

  const html = await response.text();
  const nextData = extractNextData(html);
  return {
    url,
    listings: normalizeRightmovePayload(nextData)
  };
}

async function searchRightmove(options) {
  const resolvedLocation = await resolveRightmoveLocation(options.location);
  const sourceUrl = buildRightmoveSearchUrl({
    ...options,
    location: resolvedLocation.displayName,
    locationIdentifier: resolvedLocation.locationIdentifier
  });
  const listings = [];
  const seen = new Set();
  let pagesFetched = 0;

  for (let page = 0; page < RIGHTMOVE_MAX_PAGES && listings.length < RIGHTMOVE_RESULT_LIMIT; page += 1) {
    const index = page * RIGHTMOVE_PAGE_SIZE;
    const pageResult = await fetchRightmoveSearchPage({ options, resolvedLocation, index });
    pagesFetched += 1;

    if (pageResult.listings.length === 0) break;

    let newListingsOnPage = 0;
    for (const listing of pageResult.listings) {
      const key = listing.id || listing.url;
      if (seen.has(key)) continue;
      seen.add(key);
      newListingsOnPage += 1;

      if (listingMatchesRequestedKeywords(listing, options.keywords)) {
        listings.push(listing);
        if (listings.length >= RIGHTMOVE_RESULT_LIMIT) break;
      }
    }

    if (newListingsOnPage === 0) break;
  }

  return {
    sourceUrl,
    apiUrl: buildRightmoveApiUrl({
      ...options,
      locationIdentifier: resolvedLocation.locationIdentifier
    }),
    resolvedLocation,
    total: null,
    pagesFetched,
    listings: listings.slice(0, RIGHTMOVE_RESULT_LIMIT)
  };
}

module.exports = {
  buildRightmoveApiUrl,
  buildRightmoveSearchUrl,
  extractNextData,
  normalizeRightmovePayload,
  resolveRightmoveLocation,
  searchRightmove
};
