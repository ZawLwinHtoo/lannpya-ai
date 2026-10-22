# Automatic buyer address-to-pin: Google Geocoding v4

Implemented in the current MTT-based `feature/mtt-final-mapping-port` worktree.
No live Google API request was made. Google API enablement is owner-confirmed;
project-specific credential/version access is not yet live-verified.

## Version and credential findings

- The adapter targets **v4 only**:
  `GET https://geocode.googleapis.com/v4/geocode/address/{encoded_address}`.
  It requests location, granularity, result types and address components using
  `X-Goog-FieldMask`; the dedicated key is in `X-Goog-Api-Key`, never the URL.
- [Google's current Demo Key documentation](https://developers.google.com/maps/demo-key)
  lists Geocoding API v4 as supported. The enabled Cloud service is Geocoding API,
  service name `geocoding-backend.googleapis.com`; enabling it does not select an
  API version or prove a particular restricted key can call v4. The application
  never silently substitutes legacy v3 or the browser JavaScript Geocoder.
- The owner confirmed Geocoding API under Enabled APIs & Services. No authenticated
  Cloud administration connection was used to inspect key restrictions. An actual
  v4 acceptance test requires a configured server credential and separate approval.
- The network-free command `python -m tools.google_geocoding` reports:

```json
{
  "configured_api_version": "v4",
  "project_version_access": "UNVERIFIED_WITHOUT_AUTHORIZED_REQUEST",
  "dedicated_server_key_configured": false,
  "distinct_from_browser_key": null,
  "permissions_confirmed": false,
  "external_requests_enabled": false,
  "maximum_requests": 0,
  "reserved_requests": 0,
  "http_requests_sent": 0
}
```

The existing website-restricted Maps credential remains browser-only. There is
no fallback to it, Google Routes keys or ORS credentials. An exact match with the
known browser key is rejected both at secure storage and request readiness checks.
Distinguishing key values alone does not prove Cloud restrictions: the owner must
confirm the new credential's server-purpose restrictions before enabling requests.

## Data flow

1. Merchant address fields persist through the existing order endpoint/model.
2. The public buyer card exposes no private address, suggestion or coordinates.
3. Valid phone verification/authorization unlocks existing `GET /api/confirm/{token}/details`.
4. Pending buyer pins and valid canonical order coordinates bypass geocoding.
   Completed/assigned deliveries and insufficient addresses do not invoke Google.
5. Otherwise, an enabled, separately authorized server lookup uses street,
   landmark and township plus Yangon/Myanmar context. Customer name, COD, phone,
   instructions, floor and room fields are excluded. Embedded mobile/email values
   are removed from query fields. Original order text is not sent wholesale.
6. The order/link transaction is committed **before** a provider request so network
   latency does not hold the order's write lock.
7. A single finite, credible Myanmar street/premise result at rooftop or interpolated
   granularity becomes an **unconfirmed approximate suggestion**. Area-only,
   partial, conflicting/multiple or foreign-country results create no exact pin.
   Provider granularity is not independent doorstep or township verification.
8. Verified details add `geocoding` with status/provider/observation/cache metadata
   and an optional suggestion. Existing response fields and 45 endpoint operations
   remain backward compatible. Both checked-in OpenAPI snapshots were regenerated.
9. The Google buyer picker initializes a draggable pin from the suggestion only
   when no stored/pending pin exists. UI labels distinguish `GOOGLE_MOCK` responses
   from live observations. Missing/expired suggestions retain manual/GPS selection.
   If the Google SDK fails, Google-derived suggestion coordinates are withheld
   instead of being shown on Leaflet or mistaken for independently selected GPS.
10. Explicit buyer submission continues through existing location request records.
    Suggestions alone never write canonical GPS, increment order versions or create
    buyer-confirmation events. Dispatcher review is still required for untrusted
    pins. Approval uses existing buyer provenance and does not grant GREEN.

## Cache and quotas

- Successful coordinate suggestions use a bounded **in-memory, per-app cache**.
  Its key hashes the buyer-link scope and sanitized address. It is not shared
  across different buyer links. Address changes invalidate the key; floor-only
  changes do not incur another lookup.
- Default TTL is **900 seconds**, configurable from 60 to 86,400 seconds. Expired
  entries are purged before lookups, and the cache holds at most 256 entries.
  Only coordinates, expiry and known provenance/status are retained, not full
  provider responses or Google formatted addresses.
- The cache survives browser refresh, not backend process restart. No new table
  or migration was introduced. Expired suggestions are also rejected by the UI.
  [Google's service terms](https://cloud.google.com/maps-platform/terms/maps-service-terms)
  provide temporary latitude/longitude caching allowances; this short-lived cache
  does not claim indefinite provider-content storage rights.
- Same-process lookups are serialized to deduplicate concurrent initial calls.
  Durable request reservations additionally limit separate workers and restarts.
  Hashed request IDs/slots live in ignored `.tmp/google-geocoding-budget`; the
  ledger has no raw address or key. It is separate from Google Routes/ORS budgets.
- Failed lookups have a 60-second local cooldown. There are **no HTTP retries or
  redirect following**. The durable address/window reservation prevents repeated
  attempts in the same request window even if the local cache is lost.
- Live flags are false and the total request allowance is **zero by default**.
  Limits are explicit finite allowances (maximum 10), not an asserted Google free
  quota or a periodically replenished credit pool. Never reset a ledger to evade
  a provider quota or a previously approved request limit.

## Exact remaining setup

1. In the existing no-billing Demo project, configure a **separate server-purpose
   credential** restricted to **Geocoding API only**, with appropriate backend
   public-egress IP restrictions where supported. Do not remove website restrictions
   from the browser key or silently broaden the existing Routes credential. If
   the Demo project cannot provide this securely without billing, stop and report it.
2. Store that dedicated credential using hidden terminal input. From this worktree's
   `backend` directory in Windows Terminal or Command Prompt:

```powershell
.venv\Scripts\python.exe -m tools.google_geocoding --store-key
.venv\Scripts\python.exe -m tools.google_geocoding
```

The tool writes only Git-ignored `backend/.env.google-geocoding.local`, applies
Windows ACLs before writing, rejects echoing/noninteractive fallback and browser
key reuse, and never logs the value. The file is read by the backend only.
`LANNPYA_GOOGLE_GEOCODING_API_KEY` (or `GOOGLE_GEOCODING_API_KEY`) is also supported
as a server environment variable. Do not use a `VITE_`/browser configuration value.

3. Confirm the actual Geocoding API restriction, application/IP restriction and
   Demo free quota without sending key values in chat. Storage alone does not
   set `LANNPYA_GOOGLE_GEOCODING_PERMISSIONS_CONFIRMED` or permit requests.
4. For the map, confirm that the separate browser key allows the **current** origin
   `http://127.0.0.1:8784/*` with Maps JavaScript API-only permission. The last
   confirmed restriction was port 8783. Its local restriction-confirmation flag
   remains false; geocoding requires a configured, confirmed Google map surface.
5. Obtain **separate explicit authorization** for a bounded fictional-address
   live test. Only then enable permission/live flags with a maximum request budget
   of one for the initial test. No live test is attempted merely because the API
   is enabled or a key is stored. Do not enable billing.

Relevant settings in the safe `.env.example`:

```dotenv
LANNPYA_GOOGLE_GEOCODING_API_KEY=
LANNPYA_GOOGLE_GEOCODING_PERMISSIONS_CONFIRMED=false
LANNPYA_GOOGLE_GEOCODING_EXTERNAL_REQUESTS_ENABLED=false
LANNPYA_GOOGLE_GEOCODING_MAX_REQUESTS=0
LANNPYA_GOOGLE_GEOCODING_TIMEOUT_SECONDS=5
LANNPYA_GOOGLE_GEOCODING_CACHE_SECONDS=900
```

## Verification actually executed

| Check | Result |
| --- | --- |
| New standalone geocoding tests | 39 passed |
| Combined geocoding/buyer/browser-credential Python tests | 135 passed |
| Complete Python regression | **1,164 passed, 1 skipped**, 148.33 seconds |
| Frontend Node regression | **144 passed** |
| Buyer geocoding/prefill Chromium | **9 passed** |
| Mapping/Google-display/MTT-map Chromium regressions | **17 passed** |
| Build, changed Python lint/format, JS syntax | Passed |
| API contract snapshots | Generated from app; still 45 operations |

The single Python skip requires hosted Supabase credentials; no hosted request was
made. Three existing OR-Tools SWIG deprecation warnings remain. One initial unit
test collection hit Windows filename limits because a 65 KB malformed-response
fixture became a generated pytest parameter ID; short explicit IDs fixed the test
harness. Import-order/line-length checks were corrected without behavioral changes.

Tests cover stored/zero coordinates before geocoding, missing server credentials,
rejection of browser-key reuse, opt-in gates, sanitized query/headers, TTL expiry,
cache isolation and concurrency, durable request budgets, malformed/oversized JSON,
ambiguous results, country/coordinate validation, timeout, 403/429 responses, no
retries, private endpoint authorization and no suggestion-to-order mutation.

Real Chromium exercises merchant creation → buyer link/phone verification →
suggested draggable pin → cached revisit → explicit submission → dispatcher
approval → persistent canonical order coordinates. Both Google v4 HTTP transport
and Maps SDK are **mocked**, using clearly fictional Yangon fixtures. Other mapping
regressions include five viewport sizes, rider sequences, COD completion and stale
route handling. No live geocoding accuracy or real Google map rendering is claimed.

## Current result

Implementation and offline integration verification are complete. Live activation
is blocked by the missing dedicated server key, confirmation of its restrictions,
current browser-origin confirmation and separately approved API usage. Local
manual/device entry remains available. No database provider, AI, non-map business
logic, billing, remote branches or deployment configuration was changed. No push
or merge occurred.
