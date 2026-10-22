# Phase 32 — Google viewer and bounded ORS matrix integration

> Historical source-worktree evidence from Phases 32?39. For the current MTT-based port and its actual test results, see [Phase 40 report](../integration/MTT_MAPPING_PORT_REPORT.md). No live provider verification was repeated during this port.

Date: 2026-10-22. Baseline: latest fetched `origin/integration/lannpya-final`,
`81a30d726e1a29b9914f0e8f1545ab79cabda45d`.
New local branch: `feature/google-ors-mapping-final`.
Worktree: `LannPya-AI-google-ors`. Existing worktrees and uncommitted work were preserved.
No merge, push, deployment, billing activation or database-provider change occurred.

## Result and external boundaries

The Google viewer and ORS-to-OR-Tools integration are implemented and exercised in
real Chromium/local API tests with **mock provider responses**. They are not new live
provider observations. No Google Routes, Google Maps SDK, ORS Matrix, Directions or
AI service call was made. Reading public official documentation is separate from
calling those services. The historical Phase 27 Google route success remains the
only recorded live routing observation.

Actual embedded Google map verification still needs an appropriately restricted,
separate browser credential and owner authorization to load Google's SDK. Actual
Yangon road-matrix verification still needs an ORS key, current account entitlement
and quota verification, followed by separate approval for one request. These
requirements are not bypassed with the private Google server key or synthetic data.

## Google Demo Key and renderer

The current [official Demo Key page](https://developers.google.com/maps/demo-key)
explicitly lists Maps JavaScript 2D/3D rendering, markers/events, polylines and
Compute Routes. It describes a no-cost prototyping facility without billing details,
with changeable provider-controlled daily limits. Compute Route Matrix is **not**
listed. This establishes documented feature support, not the permissions or browser
restrictions of this user's actual credential/project.

The existing dispatcher Mode A panel retains distance, static travel duration,
Google Maps attribution and the key-free external Google Maps directions link.
Only a deliberate **Show route on Google map** action loads the configured SDK.
The renderer converts GeoJSON `[longitude, latitude]` into Google LatLng literals,
draws a Google Polyline on a Google Map, marks endpoints/approved stops and fits its
bounds. It never draws Google route geometry on Leaflet. The SDK's attribution is
not removed or overlaid. [Routes policies](https://developers.google.com/maps/documentation/routes/policies)
remain applicable, including display and storage restrictions.

Concrete fixes:

- A timeout previously left the shared SDK-loading promise permanently resolved
  to unavailable. Failure now releases that loader for a deliberate user retry.
- SDK authorization failure removes/withholds geometry, provides an explicit
  navigation fallback, and prevents automatic reloading in the same page.
- Invalid geometry is rejected before loading the SDK; constructor/render failures
  produce an explicit fallback. Missing browser credentials produce no SDK request.
- Places is no longer loaded for basic route rendering. Customer pinning and saved
  independent pins remain Leaflet by default even when a route-view key is configured.
- The local proxy previously sent `no-referrer` even when Maps was enabled, conflicting
  with website-restricted browser authentication. Configured Maps pages now send
  `strict-origin-when-cross-origin`; the script also requests origin-only authorization.
  Default pages retain `no-referrer`. Cross-origin requests do not disclose buyer paths.

### Browser credential restrictions and setup boundary

The [official security guidance](https://developers.google.com/maps/api-security-best-practices)
supports Websites/HTTP-referrer application restrictions and API restrictions.
Use a **separate browser-purpose credential**, restricted to **Maps JavaScript API**
and the exact approved HTTP(S) origin(s), including the development port.
For this loader's `auth_referrer_policy=origin`, Google requires an allowed referrer
matching the domain/origin **without a path**, e.g. `http://127.0.0.1:8780`.
Add `http://localhost:8780` separately only if actually used. Do not authorize every
website or use file://. See [loader requirements](https://developers.google.com/maps/documentation/javascript/load-maps-js-api).
Server web-service credentials instead use appropriate server IP/API restrictions;
one key cannot simultaneously use incompatible application restriction types.

Configure only after the owner verifies the credential and restrictions in their
Google account, without enabling billing:

```dotenv
# Browser-visible by design; must NOT be the private Routes key.
LANNPYA_GOOGLE_MAPS_BROWSER_KEY=
LANNPYA_GOOGLE_MAPS_BROWSER_RESTRICTIONS_CONFIRMED=false
```

The server publishes no browser key until restrictions are explicitly confirmed.
It also refuses to publish a browser value equal to the configured private server
Routes value. It never copies or reads the ignored private Google key file for
this purpose. We did not inspect Cloud account settings or prove that the owner
can create an additional restricted credential in this Demo project. If that is
unavailable, the supported fallback is the explicit Google Maps navigation link.
Do not add an unrestricted credential or enable billing to remove this blocker.

## ORS matrix and optimizer

The existing [official Matrix contract](https://giscience.github.io/openrouteservice/api-reference/endpoints/matrix/)
is reused: POST `https://api.openrouteservice.org/v2/matrix/driving-car`,
server-side Authorization header, locations in `[longitude, latitude]` order,
`metrics: ["distance", "duration"]`, `units: "m"`. Durations are seconds.
Full square row/column ordering follows the supplied location indices. Reverse
costs are not assumed equal. `null` pairs remain unreachable, not zero-cost roads.
Float provider costs are rounded up to integer solver units; negative, boolean,
string, malformed, non-square, mismatched-null and nonzero-diagonal matrices fail
validation. The original strict model accidentally accepted bools through integer
coercion; StrictInt now rejects them.
An oversized provider integer also reproduced an uncaught `OverflowError` in the
finite-number check. Checking magnitude before float conversion now rejects it as
the existing sanitized invalid-response error; a regression fixture covers it.

Normalized RoadMatrix adds `profile`, `observation`, `source_indices`,
`destination_indices` and explicit `unreachable_pairs` with `UNREACHABLE` codes.
OptimizationResult adds `matrix_observation` and `travel_profile`; historical
plans without these fields remain readable. Existing `quality` values remain
compatible: SIMULATED or ROAD_STATIC.

| Source | Observation | Meaning |
|---|---|---|
| Offline fixture graph | SIMULATED | Synthetic costs; not Yangon road data |
| Injected ORS HTTP transport | ORS_MOCK_MATRIX | Tests only; no live service observation |
| Valid successful actual ORS transport | ORS_ROAD_MATRIX | Road static matrix; not live traffic |

The mature OR-Tools engine consumes these exact asymmetric arrays. Multi-rider
capacities, buyer windows, service times, fixed active assignments, completed-stop
exclusion, return-to-hub options and bounded heuristic search are preserved.
There is no claim of global optimality. Tests assert exact travel sums from the
mock matrix, hard constraint compliance and explicit unassignment of impossible
stops. Preview, commit, rider scope and stale-plan checks use the existing services.

ORS previews are **matrix-only**. Previously previewing could fetch one Directions
leg after another to assemble geometry, exceeding a proposed single request. Now
the ORS preview makes one matrix call and no Directions/geometry requests. Its
ordered stops, distance/duration and attribution remain available; road geometry
is explicitly unavailable. No lines are manufactured from matrix costs. Independent
customer pins and external navigation remain available. Google and ORS results
are not combined or described as equivalent.

## Two user-facing modes

- **Mode A: Google road estimate** remains the existing separately consented,
  single-delivery endpoint and quota. It does not change optimizer costs or assignments.
- **Mode B: Multi-stop optimization** clearly shows ORS driving-car versus SIMULATED
  fixture data, matrix provenance/profile, available budget, capacities and windows.
  ORS submits explicit consent and a request UUID. Repeated unchanged submissions
  retain that UUID. Input changes require renewed consent. Missing key, disabled
  external access or spent budget disables ORS submission.

## API and quota safeguards

No endpoint is renamed or added; OpenAPI still has **45 operations**. Both checked-in
snapshots are regenerated. `/api/routes/calculate`, `/api/routes/matrix` and
`/api/routes/optimize` accept additive optional `request_id` and strict boolean
`authorize_external_request` fields. Offline calls remain unchanged. ORS requires
both UUID and literal true, plus existing dispatcher authorization.

```dotenv
LANNPYA_ROUTING_PROVIDER=offline
LANNPYA_ROUTING_EXTERNAL_REQUESTS_ENABLED=false
LANNPYA_ORS_API_KEY=
LANNPYA_ORS_MAX_REQUESTS=0
LANNPYA_ORS_MAX_MATRIX_ELEMENTS=16
LANNPYA_ROUTING_REQUEST_TIMEOUT_SECONDS=10
LANNPYA_GOOGLE_DEMO_ENABLED=false
LANNPYA_GOOGLE_DEMO_MAX_REQUESTS=0
```

An ORS operation is local/test-only, one POST, zero retries/redirects, with bounded
timeout/response size and matrix/stop limits. The initial cap is 16 cells: one hub
plus at most three deliveries. The UI's effective stop limit reflects both caps.
No fallback is silently substituted after a provider failure.

The default server-owned `.tmp/ors-routing-budget` ledger uses exclusive UUID and
slot files, flushed/fsynced before HTTP. It survives process restarts and sandbox
database resets, and is shared across actors/workers. Failures consume reservations.
Duplicate UUIDs return 409; exhausted local authorization returns 429. Files contain
only authorization identifiers, never keys, responses or customer coordinates.
Unwritable storage fails closed. Do not delete/change this directory to bypass spent
authorization; only a reviewed owner decision can increase a configured budget.

Provider 403 quota/credential rejection, 429, timeouts and invalid output return
sanitized existing error formats. To close a separate bypass around the Demo budget,
the general API rejects configured Google calculate/matrix/optimization with
`GOOGLE_DEMO_SINGLE_ROUTE_ONLY` (422). The existing `/api/routes/google-demo` is the
authorized Google route path; it retains its own persistent quota/consent handling.
The general Google adapter remains for isolated contract/research tests; no Google
matrix request is authorized or activated.

## Current ORS account, quota and attribution evidence

The current [official ORS home page](https://openrouteservice.org/) reports a temporary
PHP website outage and directs users to [HeiGIT Account](https://account.heigit.org/)
for a free Standard key. Its old `/plans/` and `/terms-of-service/` URLs returned
404, while staging versions returned 403. The account pages require JavaScript;
we did not log in or inspect this user's account. Cached staging search results
mention 500 matrix requests/day and 40/minute, but those are **not accepted as a
verified current entitlement**. Verify current limits and available quota in the
owner's dashboard before authorizing a test.

The accessible [technical restrictions page](https://openrouteservice.org/restrictions/)
lists 3,500 source×destination cells per ordinary matrix request, with a lower limit
for dynamic arguments. This integration uses no dynamic arguments and defaults much
lower. The [official FAQ](https://giscience.github.io/openrouteservice/frequently-asked-questions)
explains server-side key handling, quota resets, 403 daily rejection and 429 rate
limits. It does not establish this account's remaining quota or Yangon reachability.

Output retains `openrouteservice / OpenStreetMap contributors` attribution in API,
dispatcher and rider results. The owner must review current service terms and data
licensing before a public demonstration; the account terms were not readable here.
No fees, extra account or billing resource has been created or assumed necessary.

## Exactly one proposed Yangon matrix test — NOT EXECUTED

`ORS_YANGON_MATRIX_PLAN.json` contains one fictional hub and three explicitly
synthetic points. They are not verified customer homes. Proposed operation:

- One POST to `/v2/matrix/driving-car`.
- 4 sources × 4 destinations = **16 cells**, including diagonal entries.
- One matrix endpoint request against the account's matrix quota; no separate
  Directions, geocoding, geometry, Google or matrix-per-pair calls.
- DRIVE/driving-car; static estimates, no live traffic; ten-second timeout, no retries.
- Credentials: server-side `LANNPYA_ORS_API_KEY`; no browser key or customer names/phones.

From `backend/`, `python -m tools.ors_matrix_probe` only prints this plan and safe
configuration booleans. It has no live-execution option. Do not enter keys in chat.
Private process-environment entry can use Windows PowerShell `Read-Host -AsSecureString`
and `System.Net.NetworkCredential` to set the process variable without displaying it;
do not store the value in Git, browser settings or a command-line argument.

Before any actual test the owner must provide a valid Standard key privately,
verify current free-tier/terms/remaining quota, approve exactly this one request,
then deliberately enable a one-request ORS budget and external-request flag.
Google budget must remain zero. No such approval is inferred from this phase.

## Verification

Baseline targeted regression: **60 passed** before implementation. New dedicated
ORS backend checks: **35 passed**. These include one oversized-integer rejection
regression added after reproducing the finite-check overflow.

| Check | Actual result |
|---|---|
| Final full Python backend | 1,038 passed, 0 failed; 134.37 seconds; three upstream OR-Tools SWIG deprecation warnings |
| Full Chromium regression | 66 passed, 0 failed on final sequential run; 5.3 minutes |
| Frontend Node | 118 passed, 0 failed |
| Dashboard/client Node | 17 passed, 0 failed |
| Preserved TypeScript/Vitest | 141 passed, 0 failed |
| Native HTTP integration | 1 passed, 0 failed |
| Real HTTP backend restart/persistence | Passed; DELIVERED order, COMMITTED route, stop and 12 events persisted; COD 25000 |
| Type checking | Passed |
| Production static build | 27 validated assets; no private environment/key bundled |
| Existing single-command launcher | Actual loopback HTTP startup and graceful shutdown passed with owned temporary SQLite |
| JavaScript syntax | 43 files passed |
| Ruff lint / formatting | Passed; 130 Python files already formatted |
| Python dependencies | pip check passed |
| npm dependencies | Existing pinned install reused; lockfiles unchanged and physical install's direct tree valid |

The first concurrent full run passed 1,037 Python tests. Its Chromium run passed
64/66: one teardown exceeded the ten-second shutdown deadline; one test observed
Chromium `ERR_NO_BUFFER_SPACE`. These were infrastructure symptoms, not failed
delivery/authorization assertions. No errors were whitelisted or assertions
relaxed. Repeating the browser suite without concurrent backend load passed
**all 66**. The exact cause of those transient host symptoms was not established;
run these heavy suites sequentially on this Windows workstation.

The final full Python rerun includes the additional overflow regression. Tests use the existing pinned
Python environment with this worktree's backend on PYTHONPATH (import path checked),
and ignored Python/Node dependency junctions to existing verified installs. npm inspecting
the parser via a junction reports transitive packages as extraneous; inspecting
the physical install gives the valid locked direct dependency tree. No package
upgrade or new dependency was required.

The simulation-only acknowledgement is now shown on simulated commits only,
so a road-matrix commit is not presented as an assertion that it used synthetic
road costs. The two ORS and three existing routing browser cases are rerun after
that final UI-only change, along with frontend Node tests and the build. Full
66-case evidence is retained in `.tmp/phase32-full-browser.json` separately from
the affected-case rerun output.
All **five affected browser cases passed** (44.5 seconds), and all 118 frontend
Node tests and the static build passed again. In total this phase adds 43 tests:
35 Python, seven Chromium and one Node case.

Seven new browser cases cover SDK loading/timeout/authentication, malformed geometry,
independent Leaflet pinning and actual ORS-preview/commit/rider REST flows on desktop
and mobile. Existing acceptance cases cover all five requested viewport sizes,
GPS permissions, 500-meter policies, stale previews, COD and persisted history.

Early test failures were corrected: the new two-rider test originally created a
rider without marking them AVAILABLE; the new browser navigation test originally
omitted buyer confirmation. Production availability/navigation rules were preserved,
and the tests now perform the required workflow. Loopback boundary tests also use
the actual permitted peer and Host rather than the TestClient default identity.

All datasets and databases are isolated and fictional. Real Chromium is used, but
the Google SDK and ORS transport are mocked. Passing these tests does **not** prove
that a real Google map rendered or that ORS can route the chosen Yangon points.

Security checks found no key/token/private-key pattern in tracked or new sources
or built assets, and no tracked private environment/database/virtual-environment
artifacts. The private Google file was not copied or read. Neither default live
quota directory was created. These bounded scans cannot detect every secret
format. No model or migration files changed. Generated changes to the two existing
routing screenshots are restored before handoff; test reports remain ignored.

## Files and local use

- `backend/app/routing/ors.py`: consent, durable quotas, deduplication and bounded
  ORS operations; factory/API integration and provider status updated.
- `backend/app/schemas/routing.py`, `http.py`, `optimizer.py` and route planning:
  strict costs, provenance and matrix-only ORS planning.
- `frontend/js/customer-map.js`, `routing-ui.mjs` and local proxy server:
  Google failure handling, referrer/credential boundary and two-mode UI.
- `backend/tools/ors_matrix_probe.py`: zero-network evaluation plan utility.
- `backend/tests/test_ors_integration.py`, browser ORS/display cases and Node
  request-mapping regression; existing browser fixture adds a fail-closed mocked ORS mode.
- Example environment, both generated OpenAPI snapshots, primary mapping contract,
  this report and the fictional `ORS_YANGON_MATRIX_PLAN.json`.

Existing local launcher remains `npm.cmd start -- --temporary --port 8791` from
the worktree. Use the existing verified Python environment via `LANNPYA_PYTHON`
when a local `.venv` is unavailable; the launcher starts the backend from this
worktree's `backend/`. All live providers remain disabled by default. The
`--temporary` option owns a separate disposable SQLite database and uses fictional
actors; do not enter real buyer information. No new server is left running by
these acceptance tests.

## Remaining blockers

1. Separate restricted browser credential, owner-confirmed restrictions and explicit
   approval to load the real Google SDK. Until then embedded Google rendering remains
   provider-unverified; the navigation fallback works.
2. ORS credential, current account entitlement/terms/quota verification and explicit
   authorization for the proposed one matrix request. No live ORS observation exists.
3. ORS matrix-only mode provides costs/stop order, not road polylines. Extra geometry
   needs separate bounded Directions authorization and is not part of the first test.
4. Provider coverage, snapping and missing roads around Yangon remain unmeasured.
5. Production identity/tenancy/authentication and PostgreSQL are outside this phase.

The local hackathon workflow remains usable with clearly labeled simulation or
mocked-provider demonstrations. A fully live Google-map plus ORS road-optimization
demonstration is not yet verified or authorized.
