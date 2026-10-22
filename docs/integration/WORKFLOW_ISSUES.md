# Workflow issues collected before implementation

Application: latest-MTT selective mapping port, `feature/mtt-final-mapping-port`.
This records the collected issue and original implementation plan. The subsequent
explicit request authorized implementation of Issue #1; other collected issues
still require their own scope.

## Issue #1 — Prefill buyer confirmation map from the existing order address

Status: **DOCUMENTED — NOT IMPLEMENTED**.

### Requested behavior

1. Load the merchant-provided delivery address and stored coordinates.
2. If usable existing delivery coordinates are present, center the map there and
   show a preselected draggable pin. Keep their actual source/verification label.
3. If only address text exists, attempt geocoding only through an already supported,
   authorized provider. A routing key or Maps JavaScript permission alone does not
   establish geocoding authorization.
4. Label any usable geocoding result as an approximate suggested location and ask
   the buyer to confirm or adjust it.
5. If no usable geocoding result exists, center on a known township/area when a
   suitable independent reference is available, with **no exact delivery marker**.
   Explain that the buyer must select the doorstep. If even the area is unknown,
   use a clearly described broad map view, not a made-up delivery location.
6. Display the merchant-provided address above the map.
7. Offer explicit actions to confirm the suggestion, adjust it, or use the device
   location. Device permission must be requested only after user interaction.
8. Never treat displaying, preselecting or dragging a suggested pin as a persisted
   buyer confirmation. Require an explicit submission.
9. Preserve merchant/geocoded suggestions separately from buyer submissions and
   approved canonical coordinates, retaining provenance and verification status.
10. Send buyer-selected coordinates through existing dispatcher review and routing
    eligibility rules. No automatic GREEN or independent verification upgrade.

### Current code observations

- `frontend/js/customer-map.js` already initializes its Leaflet picker from valid
  latitude/longitude form values and supports click selection and marker dragging.
  With empty fields it uses a broad Yangon view without a delivery marker. Reuse it.
- `frontend/js/live-store.mjs` projects buyer coordinates from authenticated buyer
  details, but its buyer order projection currently includes street and landmark
  without the complete merchant address context. Review projection and form binding
  before assuming a backend geocoding defect.
- `frontend/js/functional-app.js` owns the existing customer form, device-location
  interaction and location-review feedback; extend these components minimally.
- `backend/app/api/buyer_confirmation.py` already separates public card, verified
  details, location submission, location references and dispatcher review. Reuse
  those authorization and persistence boundaries.
- No dedicated authorized backend address-geocoding service was identified in the
  inspected code. The map module contains optional Google Places widget hooks;
  their presence is not evidence that Places/geocoding is configured, permitted,
  or usable with the current browser credential. Google/ORS road-routing adapters
  must not be treated as geocoders.
- The recent mapping safety fix intentionally stopped saving demo township/address
  estimates as canonical delivery coordinates. This issue must not restore that
  behavior or label a township center as a confirmed doorstep.

### Proposed implementation approach (pending collection of other issues)

**Data loading and privacy:** after successful buyer verification, reuse verified
details to obtain the address and coordinate context. Inspect the actual response
schema and add only missing fields if necessary. Do not expose home addresses or
coordinates through the pre-verification public card. Show the address above the
verified map and escape merchant-provided text.

**Selection precedence:** use the current approved/canonical delivery pin first,
with its existing verification label. Show a pending buyer submission separately
as pending when relevant; it must not replace approved routing data. Otherwise
consider an authorized geocoded suggestion; otherwise use an area-only view.
The reference for movement validation must remain the server's trusted reference,
not whichever point is currently shown in the browser.

**Geocoding gate:** inventory configured provider capabilities, permissions, costs,
privacy and map-display terms before implementation. If none is authorized, show
the area/manual-selection fallback. Do not add a new external service, enable a
paid API, send customer data externally, or make a new provider request under this
documentation task. Future permitted requests need bounded timeouts, deduplication,
minimal address disclosure and an explicit unavailable/ambiguous outcome. Google
results must not be rendered on Leaflet unless applicable terms permit it.

**Provenance and storage:** inspect existing `orders.field_sources`, buyer location
reference and submitted-request records before choosing storage. Reuse existing
records/metadata when their contracts support source, verification state and
coordinate separation; do not invent parallel address models. A suggestion must
not overwrite order latitude/longitude. Explicit buyer submission should retain
the prior reference and create/update the existing review record transactionally.
Dispatcher approval updates canonical routing coordinates through existing rules.
If current metadata cannot preserve required distinctions, document the smallest
additive change for review before implementing a schema migration.

**UI:** initialize existing form/map with the selected context and distinguish
"Existing delivery pin", "Suggested approximate location", "Pending review" and
"Approved location". Use the existing layout and controls; no duplicate customer
screen. Clearly show submission success, pending review, rejection and retryable
failure. Refresh must restore persisted state rather than unsaved browser guesses.

### Planned acceptance tests

- Verified buyer sees escaped merchant address and an existing valid draggable pin.
- Pre-verification card does not disclose address/coordinates.
- Approved, merchant-entered, geocoded and buyer-submitted points keep distinct
  provenance; preselection alone creates no event or database mutation.
- Text-only address: authorized geocoder returns a labeled suggestion; ambiguous,
  missing, unauthorized, timed-out or failed geocoding uses an area/manual fallback.
- An area center affects viewport only, never canonical coordinates or pin fields.
- Device permission denial/timeout keeps manual selection usable.
- Explicit confirmation submits the chosen values; invalid coordinates and expired
  or missing buyer authorization are rejected without mutation.
- Initial/untrusted pins require review; 500-meter policy uses only a trusted
  server-side reference. Confirmation never proves township boundaries or GREEN.
- Dispatcher receives the pending values; approval persists after refresh/restart
  and reaches the assigned rider/routing workflow. Rejection preserves prior data.
- Browser tests cover mobile/desktop, click/drag, existing-coordinate prefill and
  network failures using mocked geocoding responses, without live provider calls.

### Open decisions to resolve with the remaining workflow issues

- Which existing provider, if any, is authorized for address geocoding and allowed
  on the selected map surface?
- Exact trust/provenance labels and precedence for existing versus pending pins.
- Whether existing metadata fully supports suggestion retention without a migration.

No application code, configuration, database or running-server behavior changed
when originally recording this issue. The subsequent implementation is documented
separately. No automated tests were run for this documentation-only
change; the acceptance tests above are planned, not claimed results.
