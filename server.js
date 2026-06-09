const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");
const { buildRightmoveSearchUrl, searchRightmove } = require("./lib/rightmove");
const { createSavedSearchStore } = require("./lib/savedSearchStore");
const { toUkPropertyCliOutput } = require("./lib/ukPropertyCliAdapter");
const {
  clearSession,
  consumeState,
  createLoginUrl,
  createSession,
  exchangeCodeForUser,
  getSessionUser,
  isAllowedUser,
  isConfigured,
  loadEnvFile
} = require("./lib/auth");

const root = __dirname;
loadEnvFile(root);
const port = Number(process.env.PORT || 3000);

const TELEGRAM_BOT_API = process.env.TELEGRAM_BOT_API || "YOUR_TELEGRAM_BOT_TOKEN";
const dataRoot = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : root;
fs.mkdir(dataRoot, { recursive: true }).catch(error => {
  console.error("Could not create data directory:", error.message);
});

const SUBSCRIPTIONS_FILE = path.join(dataRoot, "subscriptions.json");
const LEGACY_SAVED_SEARCHES_FILE = path.join(dataRoot, "saved-searches.json");

const LEGACY_USER_PROFILES_FILE = path.join(dataRoot, "user-profiles.json");
const savedSearchStore = createSavedSearchStore({
  dataRoot,
  legacyJsonPath: LEGACY_SAVED_SEARCHES_FILE,
  legacyProfilesPath: LEGACY_USER_PROFILES_FILE
});

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": contentTypes[".json"] });
  response.end(JSON.stringify(payload, null, 2));
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || "Unexpected server response." };
  }
}

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

function sendHtml(response, status, html) {
  response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

function loginPage(message = "") {
  const setupMessage = isConfigured()
    ? ""
    : `<div class="notice">Google OAuth is not configured yet. Create a <code>.env</code> file from <code>.env.example</code>, then restart the server.</div>`;
  const messageHtml = message ? `<div class="notice error">${message}</div>` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sign in - Property Finder</title>
    <style>
      :root {
        color: #f7fbf9;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #10241f;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
      }

      body::before {
        background:
          linear-gradient(90deg, rgba(11, 30, 26, 0.92), rgba(11, 30, 26, 0.68) 46%, rgba(11, 30, 26, 0.22)),
          url("https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1800&q=80") center / cover;
        content: "";
        inset: 0;
        position: fixed;
        z-index: -2;
      }

      body::after {
        background: rgba(0, 0, 0, 0.18);
        content: "";
        inset: 0;
        position: fixed;
        z-index: -1;
      }

      main {
        display: grid;
        min-height: 100vh;
        padding: 32px clamp(20px, 6vw, 76px);
      }

      .landing {
        align-content: center;
        display: grid;
        gap: 30px;
        max-width: 760px;
      }

      .brand {
        align-items: center;
        display: inline-flex;
        gap: 12px;
        font-weight: 900;
        letter-spacing: 0;
      }

      .mark {
        align-items: center;
        background: #d9f99d;
        border-radius: 8px;
        color: #10241f;
        display: inline-flex;
        font-weight: 900;
        height: 42px;
        justify-content: center;
        width: 42px;
      }

      h1 {
        font-size: clamp(2.5rem, 6vw, 5.8rem);
        letter-spacing: 0;
        line-height: 0.95;
        margin: 0;
        max-width: 720px;
      }

      .lead {
        color: rgba(247, 251, 249, 0.86);
        font-size: clamp(1.05rem, 2vw, 1.28rem);
        line-height: 1.55;
        margin: 0;
        max-width: 640px;
      }

      .actions {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
      }

      a.button {
        align-items: center;
        background: #f7fbf9;
        border-radius: 8px;
        color: #10241f;
        display: inline-flex;
        font-weight: 900;
        gap: 12px;
        min-height: 54px;
        padding: 0 22px;
        text-decoration: none;
      }

      .google {
        align-items: center;
        background: white;
        border-radius: 50%;
        color: #4285f4;
        display: inline-flex;
        font-weight: 900;
        height: 28px;
        justify-content: center;
        width: 28px;
      }

      .trust {
        color: rgba(247, 251, 249, 0.72);
        font-size: 0.95rem;
        font-weight: 700;
      }

      .feature-row {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        max-width: 720px;
      }

      .feature {
        border-left: 3px solid #d9f99d;
        color: rgba(247, 251, 249, 0.82);
        line-height: 1.4;
        padding-left: 14px;
      }

      .feature strong {
        color: #ffffff;
        display: block;
        margin-bottom: 4px;
      }

      .notice {
        background: rgba(255, 255, 255, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.7);
        border-radius: 8px;
        color: #385047;
        line-height: 1.4;
        max-width: 640px;
        padding: 12px 14px;
      }

      .error {
        border-color: #f7c4c4;
        color: #8a2d2b;
      }

      code {
        color: #10241f;
        font-weight: 800;
      }

      @media (max-width: 760px) {
        body::before {
          background:
            linear-gradient(180deg, rgba(11, 30, 26, 0.94), rgba(11, 30, 26, 0.76)),
            url("https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1100&q=80") center / cover;
        }

        main {
          padding: 24px 18px;
        }

        .feature-row {
          grid-template-columns: 1fr;
        }

        a.button {
          justify-content: center;
          width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="landing" aria-label="Property Finder sign in">
        <div class="brand"><span class="mark">PF</span><span>Property Finder</span></div>
        <h1>Find motivated property opportunities faster.</h1>
        <p class="lead">Search Rightmove listings by location, radius, price, bedrooms, and buying signals like cash buyers, probate, and reduced properties. Save searches and receive Telegram alerts when new matches appear.</p>
        ${setupMessage}
        ${messageHtml}
        <div class="actions">
          <a class="button" href="/auth/google"><span class="google">G</span> Continue with Google</a>
          <span class="trust">Private access for approved accounts only</span>
        </div>
        <div class="feature-row" aria-label="App highlights">
          <div class="feature"><strong>Focused search</strong>Location, radius, price, beds, and property type in one workflow.</div>
          <div class="feature"><strong>Deal signals</strong>Filter for reduced, cash buyer, probate, and refurbishment language.</div>
          <div class="feature"><strong>Saved alerts</strong>Store criteria and get Telegram notifications on your schedule.</div>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => body += chunk.toString());
    request.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(e); }
    });
  });
}

async function getSubscriptions() {
  try {
    const data = await fs.readFile(SUBSCRIPTIONS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveSubscriptions(subs) {
  await fs.writeFile(SUBSCRIPTIONS_FILE, JSON.stringify(subs, null, 2));
}

async function getUserProfiles() {
  return savedSearchStore.getProfiles();
}

async function saveUserProfiles(profiles) {
  savedSearchStore.saveProfiles(profiles);
}

async function getSavedSearches() {
  return savedSearchStore.getAll();
}

async function saveSavedSearches(searches) {
  savedSearchStore.saveAll(searches);
}

function cleanSavedSearch(body) {
  const location = String(body.location || "").trim();
  if (!location) throw new Error("Location is required before saving a search.");
  const notifyFrequency = ["off", "now", "minutely", "5min", "daily", "weekly", "monthly"].includes(String(body.notifyFrequency))
    ? String(body.notifyFrequency)
    : "off";
  const telegramChatId = String(body.telegramChatId || "").trim();
  const minBeds = Number(body.minBeds ?? body.beds ?? 0);
  const propertyType = ["", "flat", "house", "commercial"].includes(String(body.propertyType || ""))
    ? String(body.propertyType || "")
    : "";

  return {
    name: String(body.name || location).trim().slice(0, 80),
    location,
    radius: String(body.radius || "5"),
    criteria: Array.isArray(body.criteria) ? body.criteria.map(String) : [],
    sources: Array.isArray(body.sources) ? body.sources.map(String) : [],
    minPrice: body.minPrice === "" || body.minPrice === null ? "" : Number(body.minPrice),
    maxPrice: body.maxPrice === "" || body.maxPrice === null ? "" : Number(body.maxPrice),
    beds: minBeds,
    minBeds,
    maxBeds: body.maxBeds === "" || body.maxBeds === null ? "" : Number(body.maxBeds),
    propertyType,
    sort: String(body.sort || "relevance"),
    telegramChatId,
    notifyFrequency,
    lastNotifiedAt: body.lastNotifiedAt || null,
    seenProperties: Array.isArray(body.seenProperties) ? body.seenProperties : []
  };
}

function savedSearchKeywords(search) {
  return [...(search.criteria || [])];
}

function listingMatchesSavedSearch(listing, search) {
  const min = search.minPrice === "" ? NaN : Number(search.minPrice);
  const max = search.maxPrice === "" ? NaN : Number(search.maxPrice);
  const minBeds = Number(search.minBeds ?? search.beds ?? 0);
  const maxBeds = search.maxBeds === "" ? NaN : Number(search.maxBeds);
  const type = String(listing.propertyType || "").toLowerCase();
  const minOk = Number.isNaN(min) || listing.price >= min;
  const maxOk = Number.isNaN(max) || listing.price <= max;
  const bedsOk = listing.beds >= minBeds && (Number.isNaN(maxBeds) || listing.beds <= maxBeds);
  const propertyTypeOk = !search.propertyType ||
    (search.propertyType === "flat" && type.includes("flat")) ||
    (search.propertyType === "house" && /(house|detached|semi-detached|terraced|bungalow|cottage)/.test(type)) ||
    (search.propertyType === "commercial" && type.includes("commercial"));

  const sources = search.sources || [];
  const sourceOk = sources.length === 0 || sources.includes(listing.source);

  const criteria = search.criteria || [];
  const tags = listing.tags || [];
  const criteriaOk = criteria.length === 0 || criteria.some(criterion => tags.includes(criterion));

  return minOk && maxOk && bedsOk && propertyTypeOk && sourceOk && criteriaOk;
}

async function sendTelegramMessage(chatId, text) {
  if (TELEGRAM_BOT_API !== "YOUR_TELEGRAM_BOT_TOKEN") {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_API}/sendMessage`;
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text })
      });
    } catch (error) {
      const cause = error?.cause?.code || error?.cause?.message || error?.message || "unknown network error";
      throw new Error(`Telegram send fetch failed: ${cause}`);
    }

    if (!response.ok) {
      const payload = await readJsonResponse(response);
      throw new Error(`Telegram send returned HTTP ${response.status}: ${payload.description || payload.error || "Unknown Telegram response"}`);
    }
  } else {
    console.log(`[Telegram Simulation to ${chatId}]`, text.replace(/\n/g, " "));
  }
}

function formatTelegramDigest(search, listings, sourceUrl) {
  const heading = `Property matches for "${search.name}" (${listings.length})`;
  const lines = listings.slice(0, 10).map((listing, index) =>
    `${index + 1}. ${listing.title}\n${listing.location}\n${listing.priceText || listing.price || "POA"} · ${listing.beds} bed${listing.beds === 1 ? "" : "s"}\n${listing.url}`
  );
  const more = listings.length > 10 ? `\n\nAnd ${listings.length - 10} more:\n${sourceUrl}` : "";
  return `${heading}\n\n${lines.join("\n\n")}${more}`;
}

async function notifySavedSearch(search, options = {}) {
  const profiles = await getUserProfiles();
  const profile = profiles.find(p => p.email === (search.userEmail || "").toLowerCase());
  const chatToUse = search.telegramChatId || (profile ? profile.telegramChatId : null);

  if (!chatToUse) return { sent: false, reason: "No Telegram chat ID." };

  const result = await searchRightmove({
    location: search.location,
    radius: search.radius,
    keywords: savedSearchKeywords(search),
    sort: search.sort || "relevance",
    propertyType: search.propertyType || ""
  });

  const seen = new Set(search.seenProperties || []);
  const matches = result.listings
    .filter(listing => listingMatchesSavedSearch(listing, search))
    .filter(listing => options.includeSeen || !seen.has(listing.id));

  if (matches.length === 0) {
    return { sent: false, reason: "No new matching properties." };
  }

  await sendTelegramMessage(chatToUse, formatTelegramDigest(search, matches, result.sourceUrl));
  search.lastNotifiedAt = new Date().toISOString();
  search.seenProperties = Array.from(new Set([...(search.seenProperties || []), ...matches.map(listing => listing.id)]));
  return { sent: true, count: matches.length };
}

async function handleProfile(request, response, user) {
  const profiles = await getUserProfiles();
  const userEmail = user.email.toLowerCase();
  let profile = profiles.find(p => p.email === userEmail);
  
  if (!profile) {
    profile = { email: userEmail, telegramChatId: "" };
    profiles.push(profile);
  }

  if (request.method === "GET") {
    sendJson(response, 200, { profile });
    return;
  }

  if (request.method === "POST" || request.method === "PATCH") {
    try {
      const body = await readBody(request);
      if (body.telegramChatId !== undefined) {
        profile.telegramChatId = String(body.telegramChatId).trim();
      }
      await saveUserProfiles(profiles);
      sendJson(response, 200, { profile });
    } catch (e) {
      sendJson(response, 400, { error: e.message });
    }
    return;
  }

  sendJson(response, 405, { error: "Method not allowed" });
}

async function handleSavedSearches(request, requestUrl, response, user) {
  const searches = await getSavedSearches();
  const userEmail = user.email.toLowerCase();

  if (request.method === "GET") {
    sendJson(response, 200, {
      searches: searches
        .filter(search => search.userEmail === userEmail)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    });
    return;
  }

  if (request.method === "POST") {
    try {
      const body = await readBody(request);
      const now = new Date().toISOString();
      const search = {
        id: crypto.randomUUID(),
        userEmail,
        createdAt: now,
        updatedAt: now,
        ...cleanSavedSearch(body)
      };
      searches.push(search);
      await saveSavedSearches(searches);

      let notification = null;
      if (search.notifyFrequency === "now") {
        notification = await notifySavedSearch(search, { includeSeen: true });
        search.notifyFrequency = "off";
        await saveSavedSearches(searches);
      }

      sendJson(response, 201, { search, notification });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "DELETE") {
    const id = requestUrl.pathname.split("/").pop();
    const next = searches.filter(search => !(search.id === id && search.userEmail === userEmail));
    await saveSavedSearches(next);
    sendJson(response, 200, { success: true });
    return;
  }

  if (request.method === "PATCH") {
    const id = requestUrl.pathname.split("/").pop();
    const index = searches.findIndex(s => s.id === id && s.userEmail === userEmail);
    if (index === -1) {
      sendJson(response, 404, { error: "Not found" });
      return;
    }
    
    try {
      const body = await readBody(request);
      if (body.name !== undefined) {
        const name = String(body.name || "").trim().slice(0, 80);
        if (!name) throw new Error("Saved search name is required.");
        searches[index].name = name;
      }
      if (body.notifyFrequency !== undefined) {
        searches[index].notifyFrequency = body.notifyFrequency;
      }
      if (body.telegramChatId !== undefined) {
        searches[index].telegramChatId = body.telegramChatId;
      }
      searches[index].updatedAt = new Date().toISOString();
      await saveSavedSearches(searches);
      sendJson(response, 200, { search: searches[index] });
    } catch (e) {
      sendJson(response, 400, { error: e.message });
    }
    return;
  }

  sendJson(response, 405, { error: "Method not allowed." });
}

async function handleSubscribe(request, response) {
  try {
    const body = await readBody(request);
    if (!body.chatId) {
      return sendJson(response, 400, { error: "Chat ID required" });
    }
    const subs = await getSubscriptions();
    body.seen_properties = [];
    subs.push(body);
    await saveSubscriptions(subs);
    return sendJson(response, 200, { success: true });
  } catch (e) {
    return sendJson(response, 500, { error: e.message });
  }
}

async function handleRightmoveSearch(requestUrl, response) {
  const location = requestUrl.searchParams.get("location") || "";
  const radius = requestUrl.searchParams.get("radius") || "5";
  const sort = requestUrl.searchParams.get("sort") || "newest";
  const propertyType = requestUrl.searchParams.get("propertyType") || "";
  const keywords = requestUrl.searchParams
    .getAll("keyword")
    .concat((requestUrl.searchParams.get("keywords") || "").split(","))
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  if (!location.trim()) {
    sendJson(response, 400, { error: "Town or postcode is required." });
    return;
  }

  try {
    const result = await searchRightmove({ location, radius, keywords, sort, propertyType });
    sendJson(response, 200, {
      ...toUkPropertyCliOutput({ portal: "rightmove", listings: result.listings }),
      sourceUrl: result.sourceUrl,
      apiUrl: result.apiUrl,
      resolvedLocation: result.resolvedLocation,
      pagesFetched: result.pagesFetched,
      listings: result.listings
    });
  } catch (error) {
    sendJson(response, 502, {
      ...toUkPropertyCliOutput({ portal: "rightmove", listings: [] }),
      error: error.message,
      sourceUrl: buildRightmoveSearchUrl({ location, radius, keywords, sort, propertyType }),
      listings: []
    });
  }
}

async function serveStatic(requestUrl, response) {
  const requestedPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = path.normalize(path.join(root, requestedPath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    const extension = path.extname(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream"
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

async function handleGoogleCallback(requestUrl, response) {
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const error = requestUrl.searchParams.get("error");

  if (error) {
    sendHtml(response, 400, loginPage(`Google sign-in failed: ${error}`));
    return;
  }
  if (!code || !state || !consumeState(state)) {
    sendHtml(response, 400, loginPage("The sign-in session expired. Please try again."));
    return;
  }

  try {
    const user = await exchangeCodeForUser(code);
    if (!isAllowedUser(user)) {
      sendHtml(response, 403, loginPage("This Google account is not allowed to access the app."));
      return;
    }
    createSession(response, user);
    redirect(response, "/");
  } catch (error) {
    sendHtml(response, 500, loginPage(error.message));
  }
}

function isPublicRoute(pathname) {
  return pathname === "/login" ||
    pathname === "/auth/google" ||
    pathname === "/auth/google/callback";
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || `localhost:${port}`}`);
  const user = getSessionUser(request);

  if (requestUrl.pathname === "/login") {
    if (user) redirect(response, "/");
    else sendHtml(response, 200, loginPage());
    return;
  }

  if (requestUrl.pathname === "/auth/google") {
    if (!isConfigured()) {
      sendHtml(response, 500, loginPage("Google OAuth is not configured yet."));
      return;
    }
    redirect(response, createLoginUrl());
    return;
  }

  if (requestUrl.pathname === "/auth/google/callback") {
    await handleGoogleCallback(requestUrl, response);
    return;
  }

  if (requestUrl.pathname === "/logout") {
    clearSession(request, response);
    redirect(response, "/login");
    return;
  }

  if (!user && !isPublicRoute(requestUrl.pathname)) {
    if (requestUrl.pathname.startsWith("/api/")) {
      sendJson(response, 401, { error: "Authentication required." });
    } else {
      redirect(response, "/login");
    }
    return;
  }

  if (requestUrl.pathname === "/api/me") {
    sendJson(response, 200, { user });
    return;
  }

  if (requestUrl.pathname === "/api/profile") {
    await handleProfile(request, response, user);
    return;
  }

  if (requestUrl.pathname === "/api/saved-searches" || requestUrl.pathname.startsWith("/api/saved-searches/")) {
    await handleSavedSearches(request, requestUrl, response, user);
    return;
  }

  if (requestUrl.pathname === "/api/subscribe" && request.method === "POST") {
    await handleSubscribe(request, response);
    return;
  }

  if (requestUrl.pathname === "/api/rightmove/search") {
    await handleRightmoveSearch(requestUrl, response);
    return;
  }

  if (requestUrl.pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: "API route not found." });
    return;
  }

  await serveStatic(requestUrl, response);
});

async function checkSubscriptions() {
  const subs = await getSubscriptions();
  let updated = false;
  
  for (const sub of subs) {
    try {
      const keywords = [...(sub.criteria || [])];
      if (sub.customKeyword) keywords.push(sub.customKeyword);
      
      const res = await searchRightmove({
        location: sub.location,
        radius: sub.radius,
        keywords,
        sort: "newest"
      });
      
      const newlySeen = [];
      for (const listing of res.listings) {
        if (sub.seen_properties.includes(listing.id)) continue;
        
        const bedsOk = !sub.beds || listing.beds >= sub.beds;
        const minOk = isNaN(sub.min) || listing.price >= sub.min;
        const maxOk = isNaN(sub.max) || listing.price <= sub.max;
        
        const criteria = sub.criteria || [];
        const tags = listing.tags || [];
        const criteriaOk = criteria.length === 0 || criteria.some(criterion => tags.includes(criterion));
        
        if (bedsOk && minOk && maxOk && criteriaOk) {
          const msg = `🏠 New Property Match!\n\n${listing.title}\n${listing.location}\nPrice: ${listing.priceText}\nBeds: ${listing.beds}\n\n${listing.url}`;
          
          if (TELEGRAM_BOT_API !== "YOUR_TELEGRAM_BOT_TOKEN") {
             const url = `https://api.telegram.org/bot${TELEGRAM_BOT_API}/sendMessage`;
             await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: sub.chatId, text: msg })
             }).catch(err => console.error("Telegram error:", err));
          } else {
             console.log(`[Telegram Simulation to ${sub.chatId}]`, msg.replace(/\n/g, " "));
          }
          newlySeen.push(listing.id);
        }
      }
      
      if (newlySeen.length > 0) {
        sub.seen_properties.push(...newlySeen);
        updated = true;
      }
    } catch (err) {
      console.error("Error checking subscription for", sub.chatId, err.message);
    }
  }
  
  if (updated) await saveSubscriptions(subs);
}

function notificationDue(search, now = new Date()) {
  if (!["minutely", "5min", "daily", "weekly", "monthly"].includes(search.notifyFrequency)) return false;
  if (!search.lastNotifiedAt) return true;

  const last = new Date(search.lastNotifiedAt);
  const elapsedMs = now.getTime() - last.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  
  if (search.notifyFrequency === "minutely") return elapsedMs >= 60 * 1000; // 1 minute
  if (search.notifyFrequency === "5min") return elapsedMs >= 5 * 60 * 1000; // 5 minutes
  if (search.notifyFrequency === "daily") return elapsedMs >= dayMs;
  if (search.notifyFrequency === "weekly") return elapsedMs >= 7 * dayMs;
  if (search.notifyFrequency === "monthly") return elapsedMs >= 30 * dayMs; // Approximate a month as 30 days
  return false;
}

async function checkSavedSearchNotifications() {
  const searches = await getSavedSearches();
  let updated = false;

  for (const search of searches) {
    if (!notificationDue(search)) continue;
    try {
      const result = await notifySavedSearch(search);
      if (result.sent) updated = true;
    } catch (error) {
      console.error(
        "Saved search notification error for",
        search.userEmail,
        `[${search.name || search.location || search.id}]`,
        error.stack || error.message
      );
    }
  }

  if (updated) await saveSavedSearches(searches);
}

// Run the background checker every 1 minute (60000ms) for testing and quick minutely alerts
setInterval(checkSubscriptions, 60000);
setInterval(checkSavedSearchNotifications, 60000);

server.listen(port, () => {
  console.log(`Property Finder running at http://localhost:${port}`);
  console.log(`Telegram alerts: ${TELEGRAM_BOT_API !== "YOUR_TELEGRAM_BOT_TOKEN" ? "Enabled" : "Mock Mode"}`);
});
