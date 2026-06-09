const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const sessions = new Map();
const oauthStates = new Map();

function loadEnvFile(root) {
  const filePath = path.join(root, ".env");
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function authConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    baseUrl: (process.env.AUTH_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ""),
    allowedEmails: (process.env.AUTH_ALLOWED_EMAILS || "")
      .split(",")
      .map(email => email.trim().toLowerCase())
      .filter(Boolean)
  };
}

function isConfigured() {
  const config = authConfig();
  return Boolean(config.clientId && config.clientSecret);
}

function parseCookies(request) {
  const header = request.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map(cookie => cookie.trim())
      .filter(Boolean)
      .map(cookie => {
        const index = cookie.indexOf("=");
        return [
          decodeURIComponent(cookie.slice(0, index)),
          decodeURIComponent(cookie.slice(index + 1))
        ];
      })
  );
}

function cookieHeader(name, value, options = {}) {
  const parts = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax"
  ];

  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function getSessionUser(request) {
  const cookies = parseCookies(request);
  const session = cookies.property_session ? sessions.get(cookies.property_session) : null;
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(cookies.property_session);
    return null;
  }
  return session.user;
}

function createSession(response, user) {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, {
    user,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
  });
  response.setHeader("Set-Cookie", cookieHeader("property_session", token, { maxAge: 7 * 24 * 60 * 60 }));
}

function clearSession(request, response) {
  const cookies = parseCookies(request);
  if (cookies.property_session) sessions.delete(cookies.property_session);
  response.setHeader("Set-Cookie", cookieHeader("property_session", "", { maxAge: 0 }));
}

function createLoginUrl() {
  const config = authConfig();
  const state = crypto.randomBytes(24).toString("base64url");
  oauthStates.set(state, Date.now() + 10 * 60 * 1000);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: `${config.baseUrl}/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function consumeState(state) {
  const expiresAt = oauthStates.get(state);
  oauthStates.delete(state);
  return Boolean(expiresAt && expiresAt > Date.now());
}

function isAllowedUser(user) {
  const allowedEmails = authConfig().allowedEmails;
  if (allowedEmails.length === 0) return true;
  return allowedEmails.includes(String(user.email || "").toLowerCase());
}

async function exchangeCodeForUser(code) {
  const config = authConfig();
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: `${config.baseUrl}/auth/google/callback`,
      grant_type: "authorization_code"
    })
  });

  const tokenPayload = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(tokenPayload.error_description || tokenPayload.error || "Google token exchange failed.");
  }

  const userResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` }
  });
  const user = await userResponse.json();
  if (!userResponse.ok) {
    throw new Error(user.error_description || user.error || "Google profile lookup failed.");
  }
  if (user.email_verified === false) {
    throw new Error("Google account email is not verified.");
  }

  return {
    email: user.email,
    name: user.name || user.email,
    picture: user.picture || ""
  };
}

module.exports = {
  authConfig,
  clearSession,
  consumeState,
  createLoginUrl,
  createSession,
  exchangeCodeForUser,
  getSessionUser,
  isAllowedUser,
  isConfigured,
  loadEnvFile
};
