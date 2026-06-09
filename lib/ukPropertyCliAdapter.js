function postcodeFromAddress(address) {
  const match = String(address || "").match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
  return match ? match[1].toUpperCase() : "";
}

function normalizeAddress(address) {
  return String(address || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\bstreet\b/g, "st")
    .replace(/\broad\b/g, "rd")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\s+/g, " ")
    .trim();
}

function categoryFor(listing) {
  if (listing.price && listing.price < 250000) return "investment";
  if (listing.beds >= 4) return "family";
  return "other";
}

function toUkPropertyCliProperty(listing) {
  const address = listing.location || listing.address || "";
  const images = listing.imageUrl ? [listing.imageUrl] : listing.images || [];

  return {
    id: String(listing.id || listing.url || ""),
    title: listing.title || `${listing.beds || 0}-bed property`,
    price: Number(listing.price || 0),
    price_text: listing.priceText || "",
    beds: Number(listing.beds || 0),
    baths: Number(listing.baths || 0),
    property_type: String(listing.propertyType || listing.property_type || "property").toLowerCase(),
    address,
    postcode: listing.postcode || postcodeFromAddress(address),
    norm_addr: normalizeAddress(address),
    description: listing.description || "",
    url: listing.url || "",
    image_url: listing.imageUrl || images[0] || "",
    images,
    features: listing.features || [],
    portal: String(listing.portal || listing.source || "rightmove").toLowerCase(),
    category: listing.category || categoryFor(listing),
    tags: listing.tags || []
  };
}

function toUkPropertyCliOutput({ portal = "rightmove", listings = [], fetchedAt = new Date() }) {
  const properties = listings.map(toUkPropertyCliProperty);
  return {
    portal,
    fetched_at: fetchedAt.toISOString(),
    count: properties.length,
    properties
  };
}

module.exports = {
  toUkPropertyCliOutput,
  toUkPropertyCliProperty
};
