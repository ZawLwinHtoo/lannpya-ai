# Phase 37 — dispatcher and rider road-matrix integration

> Historical source-worktree evidence from Phases 32?39. For the current MTT-based port and its actual test results, see [Phase 40 report](../integration/MTT_MAPPING_PORT_REPORT.md). No live provider verification was repeated during this port.

Date: 2026-10-22. Worktree: `LannPya-AI-google-ors`.
Branch: `feature/google-ors-mapping-final`.
HEAD remains `81a30d726e1a29b9914f0e8f1545ab79cabda45d`.
Existing uncommitted work was preserved. No push, merge, deployment, Supabase
development, database-provider change or new live ORS/Google request occurred.

## What works and what was tested

The dispatcher browser journey works through real local FastAPI APIs and isolated
SQLite persistence using **recorded Phase 36 road values**: buyer submits a pin,
dispatcher approves it, selects approved deliveries/rider/origin, authorizes an
ORS preview, inspects road costs/ordered stops/constraints/exclusions, separately
authorizes commit, dispatches the saved route, and the rider receives that stop
sequence and completes a COD delivery. Browser actions performed these writes;
read-only API inspection checked the resulting state.

**No fresh live browser-to-ORS operation was executed.** Phase 36's single
HTTP-200 matrix remains the real provider observation. Its recorded response is
replayed through MockTransport, and previews/persisted plans correctly say
`ORS_MOCK_MATRIX`, never falsely `ORS_ROAD_MATRIX` or `SIMULATED`. The production
adapter's successful non-mocked path still emits `ORS_ROAD_MATRIX`. The historical
live observation and current recorded browser evidence are separate facts.

Fixture: `backend/tests/fixtures/routing/ors_yangon_phase36.json`. It contains
only the four fictional coordinates, provider costs, observation timestamp and
attribution. No key, customer home, account identifier or authorization header is
included. Recorded floats still pass through the existing conservative
integer-per-arc normalization and unchanged OR-Tools constraints.

For the fixture's three approved deliveries, the UI and API agree on
**H → D1 → D3 → D2 → H**, **11.565 km**, **18.58 minutes travel**, capacity **3/3**,
and **27.58 minutes including stop service**. These are normalized solver totals;
the original Phase 36 floating totals were 11.56343 km and 18.5403 travel minutes.
An extra selected parcel without GPS is explicitly excluded as
`MISSING_DELIVERY_PIN`, without changing the valid three-stop matrix. Matrix
estimates are static and do not represent live traffic.

## Integration changes and confirmed fixes

- The existing ORS preview/commit APIs and provider-independent optimizer were
  reused. No endpoint, request/response schema, assignment rule or database model
  was renamed or replaced.
- After every ORS preview attempt, the UI refreshes **local provider status only**.
  Exhausted, disabled, missing-key and unavailable-status states disable live
  preview with an explicit reason. A finished attempt cannot be automatically
  repeated; another attempt needs changed inputs, fresh explicit consent and
  remaining separately approved server budget. Failed live requests never turn
  into simulated successes. Inputs are locked while the preview is in flight.
- The preview button previously re-enabled using stale budget data. It now stays
  disabled after exhaustion or an availability-read failure. When recalculation
  is unavailable, the current saved plan remains visible rather than being erased.
- Previewing still creates no assignments. Commit remains a separate form with
  required geospatial-review acknowledgement, version checks, stale-plan rejection
  and backend idempotency. Simulated plans retain their separate test-data consent.
- Matrix-only plans now show read-only, numbered approved stop pins plus the
  dispatcher-selected hub using existing Leaflet styling. **No road line is drawn
  from a matrix.** Stop-marker order does not claim road geometry. Street tiles
  remain an explicit, attributed OpenStreetMap load; no tile/SDK call occurs merely
  because a plan is displayed. Rider plans use the same ordered-pin view.
- Result panels explain recorded/mock versus real-road versus simulated data and
  show provider/profile, capacity/load, operating period, stop windows/arrivals,
  travel/service totals, warnings and unassigned reasons. Distance/time formatting
  now retains meaningful decimal precision.
- A new real-browser failure reproduced a buyer acknowledgement click missing its
  target: blurring manually entered coordinates enlarged map-feedback text and
  shifted the checkbox between pointer events. Feedback now updates on input,
  before that click, while retaining existing coordinate validation and review
  rules. The regression performs immediate coordinate entry followed by checking
  the acknowledgement, with no forced DOM mutation or artificial delay.
- The browser-credential audit found a guard checked only the configured native
  Google server key, missing the ignored private-file fallback. The local BFF now
  checks both Google and ORS server credential resolvers, including private-file
  fallbacks, before publishing a browser key. Known private values embedded within
  a misconfigured browser value are also blocked. Credential-read errors fail
  closed. Dummy-key regressions verify these cases; no actual exposure was found.

## Security and usage boundaries

Defaults remain `LANNPYA_ROUTING_EXTERNAL_REQUESTS_ENABLED=false`,
`LANNPYA_ORS_MAX_REQUESTS=0`, and Google budget 0. The real consumed Phase 34/36
ledger was preserved. No budget slot was cleared or new allowance enabled.
The normal dispatcher role guard, loopback BFF session/CSRF controls, bounded
durable provider budget, per-actor rate limit, request UUID deduplication and
no-retry transport remain authoritative. Browser checkboxes cannot grant a
server allowance or bypass location approval.

The test runner uses an isolated temporary provider ledger and dummy credentials.
Its ORS transport accepts only the fixture endpoint/coordinates; page contexts
also block unmocked remote HTTP(S) traffic. Test-specific Google/ORS fixtures
remain mocked. Reading safe local provider status, opening saved plans, refreshing
the website and committing plans never contacts a routing provider.

Private keys are server-only. `/maps-config.js` may publish a separately restricted
**public-purpose browser credential**, but refuses known private routing keys.
Direct private API reads and forged/missing CSRF are rejected; riders cannot
create dispatcher plans. Rider results remain scoped to assigned stops. No
continuous GPS tracking, arbitrary buyer disclosure or production authentication
was introduced. The local single-user BFF is still not production authorization.

## Google browser renderer — exact remaining setup

This is a configuration audit, not a new live Google renderer verification.
No Google account connection, SDK load, routing call, billing change or credential
creation occurred. The existing renderer has mocked Chromium coverage; actual
project permissions and a real restricted browser credential remain unverified.

1. The owner needs a **separate browser-purpose Maps JavaScript credential** in
   an authorized project/demo arrangement. Do not reuse the private Routes Demo
   key, ORS key, AI key or development access token. A browser key is visible to
   browsers by design; the private backend key must never become that value.
2. In the provider's credential controls, restrict this browser credential to
   **Maps JavaScript API only**, and application type **Websites / HTTP referrers**.
   Places is not needed by this route loader. The loader uses
   `auth_referrer_policy=origin`; allow the exact origin without a path, such as
   `http://127.0.0.1:8780`. Add other explicitly approved local ports/origins
   separately. Do not authorize all websites, file URLs or entire wildcard hosts.
   This local launcher itself accepts the exact `127.0.0.1` origin.
3. Only after the owner verifies these restrictions, configure
   `LANNPYA_GOOGLE_MAPS_BROWSER_KEY` and set
   `LANNPYA_GOOGLE_MAPS_BROWSER_RESTRICTIONS_CONFIRMED=true` in the server process
   environment or ignored backend configuration. Never hardcode it in source or
   a bundle. The default confirmed flag stays false. Private server routing keys
   retain their separate API/server restrictions and dedicated ignored files.
4. Restart the loopback workspace. It serves the approved browser value through
   `/maps-config.js`, adjusts CSP for Google hosts, and sends
   `strict-origin-when-cross-origin` so cross-origin SDK authorization gets the
   origin without a buyer token/path. Customer pinning remains Leaflet.
5. A separate owner authorization is still needed before loading the real SDK or
   making another Google estimate. Google geometry is drawn only after the
   explicit **Show route on Google map** action, on a Google map with attribution.
   It is never drawn on Leaflet. Missing credentials, timeout/auth failures and
   invalid geometry have explicit fallbacks.

Official references already reviewed in the preceding phases:
[Demo Key supported features](https://developers.google.com/maps/demo-key),
[key security restrictions](https://developers.google.com/maps/api-security-best-practices),
[origin-only loader authorization](https://developers.google.com/maps/documentation/javascript/load-maps-js-api),
[Routes display policies](https://developers.google.com/maps/documentation/routes/policies).
Documented Demo Key feature support is not proof that this owner's account can
create a separate appropriately restricted credential. If the demo arrangement
does not provide it without billing, the embedded viewer remains blocked. Keep
the key-free **Open this route in Google Maps** navigation fallback rather than
enabling billing or exposing the server key. ORS matrix optimization/Leaflet stop
pins do not depend on a Google browser key.

## Running the existing local application

From the repository root in PowerShell:

```powershell
npm.cmd start -- --port 8780
```

Open `http://127.0.0.1:8780/#/routes`. The normal launcher builds the existing
frontend and starts loopback FastAPI with its dedicated persistent SQLite
workspace, separate from the normal development database. No server is exposed
publicly. Default Mode B is explicitly simulated/offline. Setting only
`LANNPYA_ROUTING_PROVIDER=ors` without opening live gates displays the disabled
ORS state; it does not authorize a live call.

After **future separate approval**, an operator can deliberately select ORS,
enable the process external gate and increase the cumulative durable allowance
by the approved number of requests, retaining the existing ledger. The hidden
`python -m tools.ors_matrix_probe --store-key` command from backend/ remains the
private credential entry mechanism. Do not reset a consumed budget to make the
button work. Configure the matrix cap to the approved size; its default 16 cells
supports one hub plus three eligible stops. Client consent and actual backend
dispatcher authorization are required independently of key presence.

For a network-free replay of the browser journey:

```powershell
npx.cmd playwright test tests/browser/ors-recorded.spec.cjs
```

This creates temporary isolated databases, injects MockTransport and uses the
recording; it does not enable a browser fallback/demo success path in the product.

## Verification results and limitations

| Final check | Observed result |
|---|---|
| Complete Python regression after final credential-guard changes | **1,073 passed, 0 failed**, 143.49 seconds |
| Frontend Node tests | **125 passed, 0 failed** |
| Dashboard/client Node tests | **17 passed, 0 failed** |
| Native local HTTP integration test | **1 passed, 0 failed** |
| Preserved TypeScript parser tests | **141 passed, 0 failed** across 9 files |
| TypeScript type-check | Passed |
| Full real Chromium suite | **72 passed, 0 failed**, 431.94 seconds; 0 skipped/flaky |
| Affected recorded ORS browser scenarios after final availability refinements | **6 passed, 0 failed**, 76.97 seconds |
| Existing process-restart mapping tool | PASS; isolated SQLite, 12 events and committed stop order retained; provider SIMULATED, 0 external calls |
| Recorded ORS database reopen | PASS; real API preview/commit and rider order retained after engine disposal and a fresh SQLite connection |
| Ruff lint and formatting | Passed; 136 Python files formatted |
| Python dependency consistency | `pip check`: no broken requirements |
| Frontend production build | Passed; 27 validated assets, no environment files or API keys bundled |
| Final diff whitespace check | Passed; existing CRLF/LF informational warnings only |
| Credential-pattern scan of tracked/non-ignored source and built frontend | 0 matches for checked Google/GitHub/JWT/private-key patterns |
| Tracked private environment/database files | 0 |
| New live ORS/Google/SDK calls in Phase 37 | **0** |

Reruns overlap the full suites; do not add them to distinct test totals.
**18 tests were added in Phase 37**: 5 Python, 7 frontend Node and 6 Chromium.
An initial new browser case repeatedly reproduced the coordinate-blur checkbox
shift. It was investigated with event observations, fixed in the picker, and
the unmodified user action then passed in the full suite and targeted rerun.
Temporary debugging listeners were removed. Final runs have no failed tests.

All five new recorded-data journeys passed at **1440×900, 1366×768, 768×1024,
390×844 and 360×740**, including dispatcher and rider stop-pin rendering, no
horizontal overflow, missing-GPS exclusion, consent/commit boundaries, preserved
queue sequence, COD completion, persisted events and page-refresh recovery.
The full suite also covers real Leaflet marker dragging, synthetic GPS permission
grant/denial, touch interaction, stale-plan protection and simulated-route
labeling. Maps use real Chromium/Leaflet, but remote provider/SDK/tile behavior is
fixture-controlled. No actual Google browser renderer success is inferred.

Ten current dispatcher/rider screenshots are in ignored
`.tmp/phase37/screenshots/`; the 390-pixel dispatcher screenshot was visually
reviewed in addition to browser overflow/visibility assertions. Machine-readable
full and targeted browser evidence is `.tmp/phase37-full-browser.json` and
`.tmp/phase37-affected-browser.json`; safe final evidence is
`.tmp/phase37-final-evidence.json`. Two legacy tracked screenshots rewritten by
the existing tests were restored to their unchanged pre-task versions; current
evidence remains in the isolated output directory.

The three Python warnings are existing OR-Tools SWIG deprecations. Root `npm ls`
passed. The existing order-parser dependency junction reports extraneous
transitive entries, but declared dependency versions are present and tests,
type-checking and build passed. No pruning, install, upgrade or lockfile change
was made to the shared existing environment.

Final normal configuration was checked without printing secrets: provider
`offline`, external routing false, ORS and Google maximum requests 0, remaining
ORS allowance 0, and the two historical consumed slots preserved. No Google
browser key is configured and the restriction-confirmation flag remains false.

Remaining boundaries: no new live UI-to-provider test was authorized; ORS Matrix
does not supply road geometry; Google embedded rendering still needs a separate
restricted browser credential and authorization; production authentication,
tenant isolation, public deployment and PostgreSQL/Supabase are separate work.
No independently verified township boundary data was added. Buyer/dispatcher
confirmation does not automatically produce GREEN classification. Polling and
explicit refresh provide updates, not instantaneous WebSockets.

Phase 37 source changes are limited to the two existing map/planner JS modules,
their planner unit tests, the local BFF private-key guard, recorded test fixtures,
new recorded browser/backend tests and routing documentation/configuration
comments. Existing backend routing APIs, OR-Tools algorithm, migrations and
product design remain intact. Prior phase reports remain historical; this report
supersedes their earlier UI/ORS-readiness limitations where explicitly verified.

Exact Phase 37 changed/added paths:

- `frontend/js/routing-ui.mjs`
- `frontend/js/customer-map.js`
- `frontend/tests/routing-ui.test.mjs`
- `backend/tools/backend_test_dashboard/server.py`
- `backend/tests/test_ors_recorded.py`
- `backend/tests/fixtures/routing/ors_yangon_phase36.json`
- `tests/browser/fixtures.cjs`
- `tests/browser/ors-recorded.spec.cjs`
- `backend/.env.example` (comments only)
- `docs/mapping-routing/API_CONTRACT.md`
- `docs/mapping-routing/PHASE37_FINAL_UI_VERIFICATION.md`

Git status also includes the pre-existing uncommitted Phase 32–36 work; it was
not discarded, staged or committed during this task. The branch/HEAD are
unchanged. The mapping UI is ready for local recorded-road demonstrations.
Fresh end-to-end browser/provider validation remains an explicit authorization
boundary, not a feature claimed from the replay.
