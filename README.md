# Property Finder

A local web app for searching and reviewing property listings from Rightmove and Zoopla-style searches.

## Open the app

For live Rightmove searches, run:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

You can still open `index.html` directly in a browser, but direct file mode uses the demo fallback because the page has no local API server.

## Google Sign-In

The local server protects the app with Google OAuth. Google credentials are read from OS environment variables:

```powershell
$env:GOOGLE_CLIENT_ID="your-google-oauth-client-id.apps.googleusercontent.com"
$env:GOOGLE_CLIENT_SECRET="your-google-oauth-client-secret"
```

Optionally set `AUTH_BASE_URL` as an OS environment variable if you are not using the default local URL:

```powershell
$env:AUTH_BASE_URL="http://localhost:3000"
```

The `.env` file is only for the email allow-list. Create it from `.env.example`:

```bash
copy .env.example .env
```

Then fill in:

```text
AUTH_ALLOWED_EMAILS=
```

In Google Cloud Console, create an OAuth Client ID for a web application and add this authorized redirect URI:

```text
http://localhost:3000/auth/google/callback
```

`AUTH_ALLOWED_EMAILS` is optional. Leave it blank to allow any verified Google account, or set a comma-separated allow-list:

```text
AUTH_ALLOWED_EMAILS=you@gmail.com,other@gmail.com
```

Restart the server after changing `.env` or OS environment variables.

## What it does now

- Searches by town or postcode.
- Supports radius options up to 40 miles.
- Filters for motivated-sale phrases:
  - Reduced
  - Cash buyers
  - Probate
- Filters by Rightmove and Zoopla.
- Filters by price and minimum bedrooms.
- Creates source-search links using the selected location, radius, and keywords.
- Shows demo listings in the results view so the workflow can be used immediately.
- Provides a Rightmove data connector through `/api/rightmove/search`.
- Builds Rightmove URLs with the upstream `keywords` parameter, so Rightmove does the first pass of matching.
- Resolves town/postcode searches through Rightmove's current location service before building the search URL.
- Extracts listing data from Rightmove's `__NEXT_DATA__` JSON and normalizes it for the app.
- Returns a `uk-property-cli` compatible envelope: `portal`, `fetched_at`, `count`, and `properties`.
- Requires Google sign-in before serving the app or API routes.
- Lets signed-in users save, load, and delete their own search criteria.

## Saved Searches

Saved searches are stored in `saved-searches.json` and scoped to the signed-in Google email. A saved search includes:

- Location or postcode
- Radius
- Criteria keywords
- Selected source
- Price range
- Minimum bedrooms
- Sort order
- Telegram chat ID
- Telegram notification frequency: Off, Now, Daily, or Weekly

`Now` sends a Telegram digest immediately after saving and then stores the search with notifications off. `Daily` and `Weekly` are checked by the server once per hour and only send newly seen matching listings.


## Scraper Note (Implementation Details)

Live scraping is handled through a server-side connector that should be used in line with each site's terms, rate limits, robots rules, and data-use requirements. Rightmove is implemented first because its search page exposes listing state through `__NEXT_DATA__`; Zoopla remains represented by demo fallback records until a compliant connector is added.

Rightmove flow:

1. Resolve the typed location with `https://los.rightmove.co.uk/typeahead?query=...`.
2. Build the Rightmove `find.html` URL with `locationIdentifier`, `radius`, `sortType`, and `keywords`.
3. Fetch that page server-side.
4. Extract and parse the `__NEXT_DATA__` script.
5. Normalize the property cards for the front end.

## uk-property-cli

The reference repo is vendored under `vendor/uk-property-cli-main`. Its core convention is that each portal parser emits normalized JSON:

```json
{
  "portal": "rightmove",
  "fetched_at": "2026-06-07T00:00:00.000Z",
  "count": 1,
  "properties": []
}
```

This app's `/api/rightmove/search` now returns that same envelope, plus a `listings` field for the web UI.

Suggested normalized listing shape:

```json
{
  "source": "Rightmove",
  "title": "Three bedroom semi-detached house",
  "location": "Leeds",
  "price": 235000,
  "beds": 3,
  "ageDays": 1,
  "description": "Reduced this week. No onward chain.",
  "url": "https://example.com/listing"
}
```
