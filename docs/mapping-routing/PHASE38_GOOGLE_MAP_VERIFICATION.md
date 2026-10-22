# Phase 38 — Google browser map verification

> Historical source-worktree evidence from Phases 32?39. For the current MTT-based port and its actual test results, see [Phase 40 report](../integration/MTT_MAPPING_PORT_REPORT.md). No live provider verification was repeated during this port.

Date: 2026-10-22. Worktree: `LannPya-AI-google-ors`.
Branch: `feature/google-ors-mapping-final`.
HEAD remains `81a30d726e1a29b9914f0e8f1545ab79cabda45d`.

## Result and stopping boundary

**Local preparation and fixture verification passed. Genuine Google Maps rendering
is NOT verified: a separate, restricted browser credential is missing.**

The network-free configuration check reports browser credential absent and
restriction confirmation false. No browser credential file was created with a
placeholder. The owner must supply the separate browser-purpose credential
locally before live SDK verification can proceed. The private Routes key was not
reused. No account settings or billing were changed.

## Current official support

Reviewed the following public official pages during this task:

- [Maps Demo Key](https://developers.google.com/maps/demo-key): lists Maps
  JavaScript 2D/3D rendering, markers, events, shapes/polylines and Compute Routes.
  It is a no-billing-information prototyping facility with changeable daily caps,
  not a production credential. Compute Route Matrix is not listed. This establishes
  documented feature availability, not this account's current permissions or quotas.
- [API security guidance](https://developers.google.com/maps/api-security-best-practices):
  separate browser/server credentials; use Websites application restrictions and
  Maps JavaScript API restrictions for the browser credential.
- [SDK loading](https://developers.google.com/maps/documentation/javascript/load-maps-js-api):
  direct asynchronous loading with callback is supported. The existing
  `auth_referrer_policy=origin` requires a matching origin restriction without a path.
- [Routes policies](https://developers.google.com/maps/documentation/routes/policies):
  Google route content displayed on a map belongs on a Google map; attribution
  must remain visible. Routes content storage restrictions still apply. This task
  added no provider-response cache or persisted Google route geometry.

The Demo Key page does **not** establish whether this owner's demo project permits
a second key with both required restriction types without billing. That must be
checked in the owner's console. If unavailable, stop; do not reuse the private
server key, remove restrictions, enable billing or infer support from older tests.

## Secure local browser credential setup

The only required owner action is credential provisioning and restriction verification
in their own Google console, followed by hidden local entry. Do not send a key in chat.

1. Obtain a **separate browser-purpose** Maps Demo credential if the console permits
   it without billing. Leave the backend Routes credential unchanged.
2. Configure Websites/HTTP-referrer application restrictions for the exact local
   origin `http://127.0.0.1:8780`, without a path, matching the SDK's origin-only
   authorization. Add another local origin/port only when deliberately used.
   Restrict APIs to **Maps JavaScript API**. This viewer needs no Places API.
   Verify the restrictions can actually be saved in this demo project.
3. In Windows Terminal PowerShell, run:

   ```powershell
   Set-Location C:\Users\ZL_shit_H\Documents\Projects\LannPya-AI-google-ors\backend
   .\.venv\Scripts\python.exe -m tools.google_browser_map --store-key
   ```

   In Command Prompt, change to that same `backend` directory and run the same
   Python command. Standard-library `getpass` hides terminal input. The command
   refuses redirected input and fails rather than falling back to echoed entry.
   Do not put the value in command arguments, environment-setting commands,
   transcripts or screenshots.
4. Storage writes only Git-ignored `backend/.env.google-browser.local` using an
   atomic replacement. Windows ACLs are applied **before** writing; POSIX uses
   mode 0600. Failed writes retain the previous file. Known private Google/ORS
   credential reuse is rejected; inability to perform that comparison fails closed.
5. Only after owner verification of the provider restrictions, set the non-secret
   assertion in the launcher's PowerShell session:

   ```powershell
   $env:LANNPYA_GOOGLE_MAPS_BROWSER_RESTRICTIONS_CONFIRMED = 'true'
   ```

   Command Prompt equivalent:

   ```bat
   set LANNPYA_GOOGLE_MAPS_BROWSER_RESTRICTIONS_CONFIRMED=true
   ```

   This assertion does not configure Google restrictions; it records that the owner
   checked them. Neither key storage nor this flag enables Compute Routes or ORS.
6. A safe status-only check, from `backend`, is:

   ```powershell
   .\.venv\Scripts\python.exe -m tools.google_browser_map
   ```

   It returns booleans and zero HTTP requests, never the value or a fingerprint.
   Restart a local workspace after credential/configuration changes. For an isolated
   workspace the existing root launcher is `npm.cmd start -- --temporary --port 8780`.
   Do not click an external route-estimation action for the upcoming viewer test;
   it will use a local recorded-response fixture instead.

A browser key necessarily reaches the browser through `/maps-config.js` and the
Google SDK request. It is not a private server secret once used there. Protection
depends on provider-enforced application/API restrictions and demo quotas.
This local tool avoids logging, committing or embedding it into static bundles;
it cannot make a browser key invisible to the browser. Avoid network traces/HARs
containing real SDK request URLs. The BFF still checks against private routing
credentials, sends no-store headers, and enables Google CSP/referrer rules only
after restriction confirmation and a distinct credential.

## Changes made in this phase

- Added `backend/app/routing/browser_credentials.py`: dedicated loader and hidden,
  permission-restricted storage. It does not touch either private routing key file.
- Added `backend/tools/google_browser_map.py`: storage/status CLI without HTTP paths.
- Wired the existing local BFF to the separate ignored browser credential file.
  Native `LANNPYA_GOOGLE_MAPS_BROWSER_KEY` configuration remains supported.
- Added explicit viewer loading feedback; constructor/load/auth failures continue
  withholding geometry and offering Google Maps navigation guidance.
- Corrected browser-key configuration comments: basic route display needs Maps JS,
  not Places. No endpoint, optimizer, ORM model or migration changed.
- Added 18 Python credential tests and six Chromium tests. The browser fixture can
  now start a server with a dummy browser credential and matching existing CSP.

Phase 38 source paths: the three new Python files above; existing
`backend/tools/backend_test_dashboard/server.py`, `backend/app/core/config.py`
(comment only), `backend/.env.example` (comments only),
`frontend/js/customer-map.js`, `tests/browser/fixtures.cjs`,
`tests/browser/google-route-display.spec.cjs`,
`tests/browser/google-workflow.spec.cjs`, and this report. Pre-existing uncommitted
Phase 32–37 changes were preserved and remain separate from these additions.

## Actual tests and outcomes

| Check | Result | What it proves |
|---|---:|---|
| Full Python suite | **1,091 passed**, 0 failed, 146.72 s | Includes 18 new credential tests; isolated application/database regressions |
| Initial targeted Python run | **59 passed**, 0 failed | Browser credentials, ORS recorded/integration cases; overlaps full suite |
| Frontend Node tests | **125 passed**, 0 failed | Existing frontend/API behavior |
| Dashboard Node/HTTP tests | **17 passed**, 0 failed | Isolated delivery, authorization, buyer and COD flows |
| TypeScript parser tests | **141 passed**, 0 failed | Existing parser behavior |
| TypeScript type check | Passed | `tsc --noEmit` |
| Chromium Google display tests | **10 passed** | SDK stub, coordinate conversion, endpoints/stops, loading, timeout, constructor/auth failure, Leaflet separation |
| Chromium Google dispatcher tests | **9 distinct tests passed** | Four existing cases plus five responsive fixture-SDK journeys |
| Chromium recorded ORS regressions | **6 passed** | Dispatcher review/preview/commit/rider/COD/persistence and failure boundaries |
| Ruff lint / formatting | Passed, **139 files formatted** | Backend checks |
| Dependency check | Passed | `pip check`: no broken requirements |
| Frontend build | Passed, **27 assets** | No environment files bundled |
| JS syntax / Git whitespace checks | Passed | Changed JS parses; `git diff --check` has no errors |
| Credential-pattern / tracking check | Passed | 60 changed/built files scanned; no strong credential patterns; no tracked private environment/database files |
| Genuine Google SDK/map tiles | **NOT RUN** | Blocked by missing separate browser credential |

There are **25 distinct passing Chromium cases** in the three selected suites,
not a new full-browser-suite count. Initial execution passed 20 and failed the
five new responsive cases because the test server had no browser key, so its CSP
correctly blocked even the intercepted SDK script. The fixture was corrected to
use a dummy browser key and confirmed-restrictions state. Those five affected
cases then all passed in 23.2 seconds. No production CSP was loosened. There are
no unresolved failures from the executed cases. The three Python warnings are
the existing OR-Tools SWIG deprecations; Node also reports a color-environment warning.

Responsive Chromium sizes: **1440×900, 1366×768, 768×1024, 390×844, 360×740**.
The tests assert visible map containers, no horizontal overflow, marker titles,
longitude/latitude conversion, polyline inputs, 1.741 km / 6.75 min display,
explicit SDK-loading action, one mocked estimate and no Leaflet Google overlay.
Five screenshots are in ignored `.tmp/phase38/screenshots/`; the 390-pixel image
was visually inspected. JSON evidence for the corrected five-case run is
`.tmp/phase38/fixture-responsive-browser.json`.

**Mock boundary:** Chromium itself launched and drove the real local frontend and
BFF. Google SDK classes were replaced by local fixtures; no genuine Google map,
tiles, provider authentication, SDK-generated attribution or provider mobile
behavior was verified. The distance and duration match the historical Phase 27
observation. Test geometry is explicitly synthetic, not a stored/replayed copy
of its 31-point Google polyline, which was intentionally not persisted. The
ORS regression replays Phase 36's recorded real matrix, without a fresh ORS call.

Commands used, from their appropriate root/backend directories:

```text
python -m pytest tests/test_google_browser_credentials.py tests/test_ors_recorded.py tests/test_ors_integration.py -q
python -m pytest -q
python -m ruff check .
python -m ruff format --check .
python -m pip check
npm.cmd run test:frontend
npm.cmd run test:dashboard
npm.cmd run test:parser
npm.cmd --prefix order-parser run typecheck
npm.cmd run build
npx.cmd playwright test tests/browser/google-route-display.spec.cjs tests/browser/google-workflow.spec.cjs tests/browser/ors-recorded.spec.cjs
npx.cmd playwright test tests/browser/google-workflow.spec.cjs --grep "fixture SDK"
```

## Preserved behavior and next verification

Leaflet customer pinning and the ORS/OR-Tools dispatcher/rider workflow remain
intact. Google geometry stays exclusively in the Google map branch. Default
provider is offline, external routing is false, and Google/ORS maximum request
budgets are both zero. No new Compute Routes, ORS, SDK, map-tile, AI or billing
service requests were sent. Public documentation was read separately.

Normal databases, schemas, credential files, branches and remote history were
not modified. No push, commit, merge or deployment occurred. All test records
were isolated and test servers were stopped.

After the owner stores a suitable browser credential and confirms restrictions,
the remaining test is to launch genuine Chromium against an isolated workspace,
intercept only the route-estimate response with the test fixture, deliberately
load the real Google SDK, and verify actual map rendering, endpoint markers,
polyline, provider attribution, distance/duration and responsive behavior. Keep
Compute Routes and ORS budgets at zero. Capture screenshots without real key
URLs, traces or HARs; stop on credential, restriction or quota rejection.
That test has **not** happened in Phase 38. Account-specific demo restriction
availability and genuine SDK rendering are the remaining blockers.
