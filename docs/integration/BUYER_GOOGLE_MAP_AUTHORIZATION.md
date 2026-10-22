# Buyer Google map: implementation and authorization boundary

Historical setup boundary: automatic server-side v4 geocoding has subsequently
been implemented behind disabled gates. See `BUYER_AUTOMATIC_GEOCODING.md` for
the current implementation, cache behavior, credential findings and test results.
No later live authorization or provider success is implied by this note.

## Implemented locally

The existing buyer picker now explicitly selects Google Maps JavaScript. This is
buyer-only configuration (`buyerPinProvider: "google"`); it does not change the
global `pinProvider`, rider maps, hub maps, route geometry renderer, ORS or optimizer.
The existing Google SDK loader and separately restricted browser-key mechanism
are reused. No second map application or UI redesign was introduced.

- Previously stored order coordinates center the map and initialize a draggable
  marker after buyer verification. Pending buyer submissions remain separate and
  are restored on revisits through the preceding buyer-prefill fix.
- Without coordinates, the Google map is a broad browsing view with no exact pin.
  Map click, drag, device GPS or manually entered coordinates update the same form.
- Showing or moving a marker does not save/confirm the location. Explicit submit
  uses existing buyer authorization, dispatcher review and provenance persistence.
- Missing credentials, SDK load failure or Google authorization failure show an
  explicit error, retain known coordinates and allow manual/device entry. The
  buyer does **not** silently switch to OpenStreetMap. OSM controls are hidden on
  the Google buyer form. Other independently sourced Leaflet maps are unchanged.
- Buyer rendering does not implicitly request Places, legacy JavaScript Geocoder,
  Google Routes, ORS or an address-geocoding endpoint.

## Current local credential state

The current MTT worktree initially had no browser credential. The existing
browser-purpose credential was securely reused from the older local Google/ORS
worktree into this worktree's Git-ignored `backend/.env.google-browser.local`.
Its file ACL was restricted before writing; it was never printed or committed.
The source credential file was not modified. No private Routes/ORS key was copied.

Network-free configuration check:

```json
{
  "browser_credential_configured": true,
  "browser_restrictions_confirmed": false,
  "http_requests_sent": 0,
  "sdk_loaded": false
}
```

The last user-confirmed Cloud restriction was `http://127.0.0.1:8783/*` with
Maps JavaScript API only. This application uses `http://127.0.0.1:8784`.
Current Cloud Console settings were not inspected through an authenticated admin
connection, and the stored key itself cannot prove its permissions. Consequently
the confirmation flag remains false, the server does not publish the credential,
and no live Google SDK request was attempted for the new origin.

## Official compatibility findings

Reviewed Google documentation on 2026-10-22:

- [Maps Demo Key supported features](https://developers.google.com/maps/demo-key)
  list Maps JavaScript map rendering, markers/events and **Geocoding API v4**.
  Demo compatibility does not prove this particular credential authorizes geocoding.
- [Maps JavaScript service restrictions](https://developers.google.com/maps/api-security-best-practices)
  identify Geocoding API as a separate permission for the JavaScript geocoding
  service. Maps JavaScript-only authorization is insufficient evidence of it.
- [Geocoding v4 getting started](https://developers.google.com/maps/documentation/geocoding/start-v4)
  warns against calling v4 directly from browser JavaScript. The intended future
  integration is server-side; do not expose a private geocoding key to the browser.
- [Geocoding v4 reference](https://developers.google.com/maps/documentation/geocoding/reference/rest)
  identifies service `geocoding-backend.googleapis.com`, with endpoint
  `https://geocode.googleapis.com/v4/geocode/address/...`.
- [Geocoding policies](https://developers.google.com/maps/documentation/geocoding/policies)
  govern display, attribution, privacy and result retention. Google geocoding
  content must not be placed on an unrelated Leaflet map.

The general production setup pages discuss billing; the Demo Key page describes
the no-billing demo exception. If the actual demo project cannot expose this API
without billing, stop rather than following production billing instructions.

## Exact configuration needing owner confirmation

### Browser rendering only

In the existing demo project's **APIs & Services → Credentials**, inspect the
separate browser credential:

1. Application restriction: **Websites**.
2. Allowed website: **`http://127.0.0.1:8784/*`** for the currently running app.
   Keep other specifically authorized localhost origins only if still needed;
   do not use a blanket wildcard website restriction.
3. API restriction: **Maps JavaScript API only**. Keep private server keys separate.
4. Confirm those actual settings before enabling
   `LANNPYA_GOOGLE_MAPS_BROWSER_RESTRICTIONS_CONFIRMED=true` for this local launch.

No key re-entry is necessary: the existing browser-purpose key is already stored
privately here. The flag was **not** enabled automatically, and no Cloud restriction
was changed. After confirmation, a genuine map-SDK acceptance test can be performed
without requesting Compute Routes, ORS or geocoding.

### Text-address geocoding

In the **same no-billing Demo project**:

1. Inspect **APIs & Services → Enabled APIs & services** for **Geocoding API**
   (`geocoding-backend.googleapis.com`) and confirm v4 is available under the Demo
   allowance. Inspect its actual quota; no quota value is assumed here.
2. Confirm a separate server-purpose credential can be restricted to **Geocoding
   API only**, with appropriate backend-egress IP restrictions where supported.
   Do not reuse the public browser credential, remove restrictions, or silently
   broaden the existing private Routes credential. If the demo account cannot
   provide this securely without billing, report that restriction and stop.
3. Confirm configuration without sending credential values in chat. Secure local
   storage/server wiring can then be prepared for that separately authorized
   credential. There is no new geocoding environment switch falsely claiming an
   implementation in this patch.
4. Separately authorize a bounded fictional-address test, specifying request count
   and quota impact, before any live geocoding request. No such approval has been
   inferred from this task.

Per the requested stop condition, live geocoding and its adapter implementation
are paused at this configuration boundary. No additional Google API was enabled,
no credential permission broadened, and no billing setting changed.

## Geocoding acceptance design once authorized

Use the existing verified order address: street and landmark, township, Yangon and
Myanmar context. Exclude phone, recipient name, COD, instructions, floor and room
from the external geocoding query. Floor/unit stay visible to buyer/rider as delivery
details; they are not geographic evidence.

Prefer stored valid coordinates without a geocoding request. For text-only input,
a bounded server-side v4 lookup may return an ephemeral suggestion. Validate finite
coordinates, Myanmar address components, result granularity and ambiguity. A
single credible street/premise-level result can be labeled **Suggested approximate
location — confirm or adjust**; rooftop granularity alone is not proof of a buyer's
door. Locality/township-only or multiple incompatible results must not create an
exact delivery marker. Use an area viewport and ask for manual selection instead.

Do not persist geocoded suggestions as canonical order GPS. Any future retention
must follow provider policies. Explicit buyer selection continues into existing
buyer-request records and dispatcher review, not a parallel address model or an
automatic trusted-location/GREEN upgrade.

## Actual tests and limitations

- Relevant Python: **94 passed** (buyer authorization/review and secure browser
  credential suites); three existing SWIG warnings.
- Frontend Node: **143 passed**; dashboard/client Node: **17 passed**.
- Chromium: **21 unique scenarios verified passing**. Initial combined run had
  18 passes and three mobile failures in the synthetic SDK's touch handler. Adding
  `touch-action: none` to that **test fixture only** corrected pointer cancellation;
  all three affected mobile journeys then passed. No tests were removed.
- The Chromium tests exercise actual application pages and isolated SQLite HTTP
  APIs: merchant creation → buyer link → verification → stored/manual pin → drag →
  explicit submission → dispatcher review → approved persistence. Full mapping
  regressions include rider/COD/optimizer journeys and five viewport sizes.
- Google SDK, marker events and drag behavior in those tests are **mocked**. Google
  route geometry tests use synthetic fixtures. These tests are not genuine Google
  tiles or evidence of real geocoding quality. Non-buyer Leaflet preservation and
  Google route display/error tests passed.
- Build, JavaScript syntax, changed Python lint/format and diff whitespace checks
  pass. No full backend suite was repeated for this renderer-only follow-up; the
  preceding buyer-prefill change recorded 1,123 passes/one skip separately.
- Automatic text geocoding was **neither executed nor simulated as a successful
  implemented feature**. That full text→geocoded-suggestion journey is blocked by
  unconfirmed API permission, server credential setup and separate live approval.

No live SDK, geocoding, Google Routes or ORS requests were made. Documentation
lookups are the only external browsing. No database migration, cloud configuration,
unrelated product changes, push, merge or deployment occurred.
