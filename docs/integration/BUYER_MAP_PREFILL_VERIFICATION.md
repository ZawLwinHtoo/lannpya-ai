# Buyer confirmation map prefill fix

Subsequent renderer-only work switches buyer pinning to Google, with configuration
and live geocoding blocked pending owner confirmation. This report records the
earlier Leaflet-prefill verification; see `BUYER_GOOGLE_MAP_AUTHORIZATION.md` for
the current renderer and newer mocked-SDK Chromium results.

Branch: `feature/mtt-final-mapping-port`, based on the Phase 40 MTT port.
Scope: existing customer map, verified buyer details, persistence projection and
regression tests. No new address model, table, migration or external service.

## Traced flow and cause

1. MTT's merchant form sends township, street, landmark, floor and optional explicit
   coordinates through `createLiveStore.execute('create_manual')` to `POST /api/orders`.
2. The order service persists these fields on the existing SQLAlchemy order. Text
   alone deliberately does not generate doorstep coordinates.
3. A protected order action generates the buyer link. The public card remains
   minimal; private address/coordinates require phone verification and a valid
   server-bound buyer authorization.
4. `BuyerConfirmationService.details()` already returned canonical coordinates.
   The Leaflet picker already supports centering and a draggable marker when its
   latitude/longitude inputs are initialized. That existing capability is retained
   and now covered by an actual merchant-to-buyer Chromium regression.
5. The missing revisit path was substantive: initial pins awaiting review live in
   `buyer_requests`, not canonical order coordinates, and previously were not
   returned in verified details. The browser also loaded only the public card on
   revisit instead of reusing valid buyer authorization to restore details.
6. The buyer projection omitted township and separate floor/building/unit context.
   The verified address is now rendered, escaped, above the map.

## Changes

- Verified details add nullable `building`, `floor`, `unit`, `coordinate_source`
  and `pending_location`. No changes to the pre-verification public card.
- Pending prefill is restricted to the current link/order's latest unresolved
  LOCATION request. Rejection removes that suggestion; it does not resurrect older
  pending pins. Canonical coordinates remain separate until dispatcher approval.
- On revisit, the browser requests verified details using existing authorization.
  Expired authorization clears private projections and returns to verification;
  there is no privileged-order fallback.
- The buyer map initializes from its pending submitted pin, otherwise the stored
  order pin. Zero is valid; blank, nonfinite and out-of-range pairs are not pins.
- Existing pins are labeled as requiring explicit buyer submission; pending pins
  are labeled as awaiting review. Rendering/prefill creates no confirmation event.
- Text-only addresses display their address and explain manual/device selection.
  Click selection, dragging, existing GPS permission handling and explicit submit
  continue through the existing component and review endpoint.
- Existing dispatcher approval writes buyer provenance and updates canonical order
  coordinates. No independent geospatial verification or GREEN upgrade is inferred.
- The API contract and both generated OpenAPI snapshots reflect additive fields;
  the application still exposes 45 operations.

## Geocoding limitation

There is no configured authorized text-address geocoding service in this worktree.
Google Compute Routes and HeiGIT Matrix are road-routing services, not address
geocoders. The existing optional Places widget code is not proof of authorized
Places/geocoding access; the previously described browser restriction is Maps
JavaScript only. No new geocoder, paid request or unauthorized provider call was
introduced. The unavailable-geocoding/manual fallback is tested. Successful or
timed-out live geocoding is not claimed or simulated as implemented functionality.

Consequently, text-only addresses cannot yet automatically suggest an exact pin.
Enabling a suitable geocoder with permitted display/privacy/usage terms remains
an explicit separate provider configuration decision. Township/demo centers are
not saved as delivery coordinates.

## Verification

- Targeted buyer backend suite: **76 passed**, including five new parameterized
  cases for missing/existing/zero coordinates, pending restoration, approval and
  rejection. Public privacy, token, lockout and geofence regressions remain intact.
- Frontend Node suite: **143 passed**, including two new projection/authorization
  regressions. Dedicated live-store subset: **15 passed** (overlapping coverage).
- Actual Chromium: **8 passed**. Two new tests exercise merchant creation, buyer
  link/phone verification, existing-pin prefill, complete address, refresh, text-only
  fallback, manual pin selection, submission, dispatcher review and approved-pin
  restoration. Six mapping regressions cover the full delivery workflow at all five
  viewport sizes and rider reconnect handling. Real Leaflet is used; no mocked
  picker or bypass of user actions. Read-only API inspections assert persistence.
- Build, changed Python lint/format and JavaScript syntax checks pass.
- Full backend final result: **1,123 passed, 1 skipped**, zero failures in
  141.57 seconds. The skipped test requires separately configured hosted Supabase;
  three existing OR-Tools SWIG deprecation warnings remain. No hosted database
  was contacted. This full run includes the 76 targeted buyer tests above.

The first new Chromium run had one incorrect test expectation for MTT's normalized
`floor: Floor 3` display text; the assertion was corrected and both tests passed.
An initial full backend run encountered one OpenAPI snapshot mismatch while the
second generated snapshot was still being synchronized: 1,122 passed, one failed,
one skipped. Both snapshots now match the app; the targeted contract suite passed
all three tests. The final full-suite rerun passed with the totals above.

No live Google, ORS or geocoding requests occurred. All tests use isolated fictional
data. The separate running review database was not used by the automated tests.
The local application was gracefully restarted on `http://127.0.0.1:8784` with its
existing review state and zero live-routing allowance; Chromium startup produced
no uncaught JavaScript errors. Refresh the browser to load the fix. No push or merge.
