# Phase 39 — Genuine Google Maps browser acceptance

> Historical source-worktree evidence from Phases 32?39. For the current MTT-based port and its actual test results, see [Phase 40 report](../integration/MTT_MAPPING_PORT_REPORT.md). No live provider verification was repeated during this port.

Date: 2026-10-22
Worktree: `LannPya-AI-google-ors`
Branch: `feature/google-ors-mapping-final`
HEAD: `81a30d726e1a29b9914f0e8f1545ab79cabda45d`

## Result

**PASS — the real Google Maps JavaScript renderer loaded in Chromium at the
configured local origin.** The cloud restrictions supplied by the project owner
match this acceptance run: Websites restriction for
`http://127.0.0.1:8783/*` and API restriction to Maps JavaScript API. Chromium
loaded the real SDK and its map assets successfully at that exact origin. This
verifies that the configured browser credential is authorized for Maps
JavaScript at this origin; it does not inspect or expose the credential itself.

The confirmation flag was set only in the environment of the temporary local
test server. No `.env` setting or ordinary development default was changed. The
browser key remains in the existing Git-ignored private browser-key file and is
intentionally delivered to the browser through `/maps-config.js`; that key is
restricted as above. The private Routes and ORS keys were not used or included
in browser assets.

## Chromium evidence

- Local application: `http://127.0.0.1:8783`, temporary test mode; `/health`
  returned HTTP 200.
- Genuine `maps.googleapis.com/maps/api/js` SDK response: HTTP 200; SDK modules
  also returned HTTP 200.
- Google map tile/viewport resources returned HTTP 200, including successful
  `maps.googleapis.com/maps/vt` responses. Chromium showed rendered street-map
  tiles for the fictional Yangon test area.
- The production `LannPyaCustomerMap.routeView` completed with the real SDK.
  Its Google map displayed the red route polyline and three route markers
  (start, end, and approved stop). Google logo and map-data attribution remained
  visible. The route geometry was drawn on Google Maps; Leaflet customer pinning
  was not changed.
- Mobile viewport: 390 × 844; map content width 348 px, height 560 px; no
  horizontal page overflow.
- No Google Routes, Compute Route Matrix, or ORS Matrix endpoint was requested.
  Google Maps JavaScript SDK and map-rendering resources were the only Google
  network traffic. No route-estimation or optimization calls were made.
- One Google Maps JavaScript warning reported that legacy
  `google.maps.Marker` is deprecated in favor of Advanced Markers. The current
  markers rendered correctly; Google has not scheduled the legacy class for
  immediate removal. This is a follow-up maintenance item, not a render failure.
- Chromium console/page errors: none observed. The one SDK deprecation warning
  above was observed and recorded.

Screenshots captured from the genuine Chromium session (actual Google tiles,
renderer, markers, polyline and attribution; replayed test geometry):

- [Desktop 1440 × 900](../../.tmp/phase39/screenshots/google-real-sdk-desktop.png)
- [Mobile 390 × 844](../../.tmp/phase39/screenshots/google-real-sdk-mobile-390.png)

The screenshots and machine-readable evidence are in the ignored `.tmp`
directory and are not source-controlled. Evidence file:
`.tmp/phase39/screenshots/acceptance-evidence.json`.

## Route-data provenance

Phase 27 recorded one real Google Compute Routes observation: 1.741 km and 405
seconds (6.75 minutes), with 31 decoded points. The raw encoded polyline and
coordinates were deliberately not persisted. Therefore this browser test used
those historical measurements as labeled metadata and a separate, explicitly
synthetic three-point Yangon test shape to exercise the renderer. **The map
tiles and rendering SDK were live Google content; the displayed test line was
not the historical Phase 27 route and is not a newly calculated road route.**
No delivery/customer coordinates were used.

## Restrictions and request boundaries

The supplied website pattern covers the local test origin on port 8783; the
application sends a strict-origin referrer for cross-origin SDK loading. The
Maps JavaScript API-only restriction matches the features exercised (map,
markers, and polyline). The genuine HTTP 200 SDK and map-tile responses confirm
the key worked under the configured origin/API restrictions. No billing
settings were inspected or changed.

The temporary server used an isolated SQLite sandbox. Google Routes and ORS
budgets were both zero, and general live routing was disabled. The server was
stopped after verification. No database migration, credential display, push,
merge, deployment, or Supabase change occurred.

## Verification commands and results

- Genuine real-SDK Chromium acceptance: **passed**; script:
  `node scripts/phase39-google-live-browser.cjs` with the explicit one-process
  environment switch `LANNPYA_GOOGLE_LIVE_BROWSER_ACCEPTANCE=true`.
- Browser credential safety tests: **18 passed** (3 unrelated interpreter
  deprecation warnings).
- Frontend routing UI tests: **18 passed**.
- Google renderer safety/regression browser tests using mocked SDKs:
  **10 passed**. These are separate from and do not substitute for the genuine
  SDK acceptance above.
- Actual external Route/Matrix calls: **0**.

The opt-in acceptance script logs host/path and response status only; it does
not record the SDK query string, browser key, HAR, or trace. It is limited to
the local `127.0.0.1:8783` app and requires an explicit process flag. The
credential confirmation was not made a persistent or production default.

## Remaining note

The map renderer is verified for this restricted local origin and a recorded
test shape. Replaying the exact historical Google road line remains unavailable
because its geometry was not stored. Legacy Google marker deprecation can be
addressed separately; it did not block the current renderer. This does not
verify Google route estimation, ORS matrices, traffic-aware ETAs, production
origins, billing, or other credentials.
