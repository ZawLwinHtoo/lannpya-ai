# Phase 40 — latest MTT foundation with selective mapping port

## Source control and scope

- Final product foundation: `origin/mtt`, `10daf38159ff2d9fb11d9d79333723eb6c70e453`.
- Initial audit baseline: `497775b0de8736f25f777833a257d8427cf1fbb6`.
- Mapping source: `feature/google-ors-mapping-final`, HEAD
  `81a30d726e1a29b9914f0e8f1545ab79cabda45d`, plus its uncommitted Phase 32–39 files.
- Source snapshot manifest SHA-256:
  `f924395454fb18b93fb578f4becdf8dd58012e60c504cd32ae2148c02882d675`.
- Target: local `feature/mtt-final-mapping-port`, worktree
  `C:\Users\ZL_shit_H\Documents\Projects\LannPya-AI-mtt-final-mapping-port`.
- Verified implementation commit: `1ad01380ee49f4fe3dd59773c77fd7c2474835dd`.

The initial MTT already contained `81a30d7` and the Phase 19–31 mapping foundation.
Those features were retained, not copied over again. Only the subsequent local
mapping delta was applied. A final fetch discovered PR #15 while tests ran; the
unpublished mapping checkpoint was replayed onto `10daf38`, preserving the newer
product changes. No branch history was merged wholesale. There were no Git
rebase conflicts. The customer-map export/function reconciliation was reviewed
explicitly to retain MTT's newer map functions.

`origin/integration/lannpya-final` remains `81a30d7`; it was inspected, not used as
the product foundation. Other inspected mapping worktrees were
`LannPya-AI-mtt-integration` (`5ede571`, clean) and
`LannPya-AI-mapping-review` (`81a30d7`, clean). The original Google/ORS worktree's
49 modified/untracked source files are preserved, hash checked, and unchanged.
No source environment, credential, virtual environment or database was copied.
No push, deployment, main/mtt merge or Supabase branch modification occurred.

See the [pre-port compatibility assessment](MTT_MAPPING_COMPATIBILITY.md) and
[complete changed-file classification](MTT_MAPPING_FILE_AUDIT.json).

## Mapping capabilities

| Capability | Implementation/result |
| --- | --- |
| Customer GPS/manual selection/drag | Existing MTT form and Leaflet retained; real Chromium mouse/touch and permission-denial/granted-fixture checks |
| Location authorization and review | Existing buyer sessions, initial-pin review, trusted reference/500 m rules and dispatcher decisions unchanged |
| Google route adapter | Existing single-delivery service retained; generic routing endpoints cannot bypass its consent/budget gate |
| Google route renderer | Secure separate browser-key loader, origin-only referrer, SDK/auth/load failure handling, validated geometry; Google geometry never drawn on Leaflet |
| HeiGIT ORS | Fixed Matrix/Directions endpoint constants, server-only raw Authorization key, no retries, strict dimensions/costs/unreachable validation, asymmetric matrices |
| Usage protection | Default zero live allowance, explicit request UUID/consent, durable one-request slots/deduplication and bounded timeout; no automatic fallback to simulated success |
| Provider diagnostics | Provider error status/code/message retained only after bounded sanitization; no raw bodies or sensitive headers stored |
| OR-Tools | Existing solver/capacity/windows/service times/priorities/fixed assignments/return-to-hub/runtime limits retained; normalized road costs and provenance passed through |
| Dispatcher | Existing route tiles/sheets retained; optimization preview below tiles, capacity/arrival/unassigned details, explicit commit and stale-plan protection |
| Rider | MTT's current screens/tabs, approved pins, ordered stops and navigation retained; matrix-only plans show stop markers without fabricated road lines |
| Persistence/history | Existing plan JSON, optimistic versions, assignments, stop sequences and delivery events reused; restart verification succeeds |
| Real versus simulation | SIMULATED, ORS_MOCK_MATRIX replay and ORS_ROAD_MATRIX transport labels remain distinct; static estimates are not traffic data |

## MTT preservation and necessary exceptions

Latest MTT's Inter/Manrope styling, branding, route-tile navigation, board
deletion/undo, plain-name/COD parser improvements, order-created modal, buyer
request confirmation/review, rider tabs, hub closeout, authentication boundary,
merchant/order services, AI boundary, models, migrations and database developer
changes are retained. There is one frontend and one backend, with no replacement
application or added dashboard. No dependency definition or lockfile changed.

Only these MTT product modules require mapping integration changes:

1. `customer-map.js`: merge safe Google route rendering and ORS stop-only maps
   into the current map module. MTT's `riderView`, `hubView` and `viewOne` remain;
   the rider/hub function blocks are unchanged. Customer pinning defaults to Leaflet.
2. `routing-ui.mjs`: provider budget/consent/provenance and matrix-result UI.
   MTT's removal of Google external-request controls from rider screens is retained;
   the Google request form is dispatcher-only.
3. `functional-app.js`: five lines mount the existing planning component below
   MTT's route tiles. No other product code in this file changes.
4. `live-store.mjs`: remove automatic writes of demo address/township points into
   live canonical latitude/longitude. Those estimates had manual-correction
   provenance despite no buyer/dispatcher selection. Explicit manual coordinates,
   buyer pins, and prototype/parser approximate previews remain supported. A future
   live geocoding estimate needs separate provenance/review fields; it must not
   silently masquerade as an approved doorstep.

Tests follow MTT's current creation modal, saved-request screen, route sheet,
explicit cash-entry requirement and scoped History control. No legitimate test
was removed. The native-dialog test now waits for the asynchronous close event
before asserting detachment. Two new live-store regressions prevent demo geodata
from being persisted and preserve explicit user coordinates.

## API and database contract

The generated OpenAPI still has **45 operations**. No endpoint was renamed or
added. Existing order/buyer/rider response contracts and business services remain.
Routing schemas add optional UUID/consent fields, provider profile/observation,
matrix indices/unreachable metadata and vehicle capacity/load. Old persisted
plans deserialize through defaults. ORS requests now require explicit server
allowance and client consent; callers cannot rely on merely setting an API key.

No model, table, migration or session implementation changed. A fresh isolated
SQLite database migrates to `0005_routing_plans`, contains 15 tables with foreign
keys enabled, and reopens successfully. Process-restart HTTP verification retains
one DELIVERED order, one committed plan, COD 25,000 and 12 events. Confidence
remains AMBER. No hosted PostgreSQL/Supabase request was made.

See [the database developer handoff](MTT_MAPPING_DATABASE_HANDOFF.md) for exact
additive route JSON fields and transaction/concurrency assumptions.

## Verification evidence

All datasets and databases are isolated and fictional. Logs/results are in the
ignored `.tmp/phase40/`; screenshots are in `.tmp/mapping-release/screenshots/`
and `.tmp/phase37/screenshots/`. These generated/private artifacts are excluded
from the publication candidate.

| Check | Observed result |
| --- | --- |
| Original MTT `497775b` Python baseline | 1,030 passed, 1 skipped |
| Original MTT Chromium baseline | 42 passed, 17 failed (mostly stale mapping test navigation; also CSP issue below) |
| Latest MTT `10daf38` frontend baseline | 131 passed |
| Latest MTT TypeScript baseline | 142 passed, 1 failed |
| Latest combined Python | 1,118 passed, 1 skipped; 88 additional cases over original baseline |
| Latest combined frontend Node tests | 141 passed |
| TypeScript regression | 142 passed, 1 inherited failure; type check passes |
| MTT Chromium order-flow Node suite | 6 passed after test-close synchronization fix |
| HTTP integration | 1 passed: admin → native buyer → dispatcher → rider COD closeout |
| Dashboard/client tests | 17 passed |
| Full Playwright Chromium | 79 scenarios: initial final run 76 passed/3 failed; two stale rider-control expectations then corrected and both reruns passed. Final unique coverage: 78 passed/1 inherited CSP failure; no subsequent full-suite rerun |
| Build | 28 validated assets; no credential/environment file bundled |
| Ruff lint | Pass for entire backend |
| Formatting | All 24 changed Python files pass; 3 inherited MTT files fail full-tree formatting |
| Dependencies | `pip check` and `npm ls --all` pass; existing pinned dependencies retained |
| Migrations/restart | Isolated SQLite migration, reopen and process restart pass |

The single skipped Python test is `test_live_supabase_connectivity`, which needs
`TEST_SUPABASE_DATABASE_URL`. OR-Tools emits three existing SWIG deprecation
warnings. No provider accuracy or production-readiness claim is inferred from tests.

Chromium covers all five requested viewport sizes (1440×900, 1366×768,
768×1024, 390×844 and 360×740). The customer/review/route/rider workflow,
recorded ORS journey, stop-only maps, explicit COD completion and state
persistence passed. The two corrected assertions now respect MTT's intentional
removal of rider-side Google request controls; this is a test adaptation, not a
product feature restoration. The remaining raw-import CSP failure is described below.

The recorded Phase 36 ORS 4×4 matrix is replayed through a mock HTTP transport.
The three-stop fixture produces order sequence D1 → D3 → D2, **11.565 km** and
**1,115 seconds travel**, plus explicit service time, while satisfying capacity.
It is labeled ORS_MOCK_MATRIX in the UI; there is no new provider observation.
Google tests replay historical 1.741 km/405 second metrics with **synthetic test
geometry**, because the original Phase 27 geometry was not retained. The Google
SDK is mocked in this port's Chromium tests. Genuine source-worktree Google SDK
verification is historical Phase 39 evidence, not a new live test of this worktree.

## Inherited issues intentionally kept visible

- MTT raw-import rendering emits inline style/event attributes blocked by the
  existing local BFF CSP. Its data/persistence assertions succeed, but the strict
  Chromium console acceptance test fails. This also failed before the port.
  Fix by replacing inline attributes with CSS/JS binding in a separately scoped
  UI change; do not relax script CSP to hide it.
- Latest MTT's TypeScript `redactForAi` test for a phone inside a Burmese address
  line fails: new plain-name extraction removes the whole line instead of retaining
  the address words. Reproduced in an untouched `10daf38` worktree. The TypeScript
  implementation/test is unchanged by this mapping port; Python remains the
  authoritative AI boundary. This is over-redaction, not observed credential leakage.
- Full-tree Ruff formatting still flags `backend/app/db/session.py`,
  `backend/scripts/verify_hosted_persistence.py`, and
  `backend/tests/test_database_compatibility.py`. These database-developer files
  were not reformatted as unrelated churn.

## Security and external services

No Google Routes, ORS Matrix, real Google Maps SDK, paid AI, hosted database or
billing-activation request was made during Phase 40. Live routing flags and
budgets default to false/zero. Dummy credentials are used only in isolated tests.
Source private `.env` files and keys were neither read back nor copied. New key
setup utilities retain hidden input, Git-ignore checks and Windows ACL protection.
The browser credential must be separate from private Routes/ORS credentials and
needs Websites + Maps JavaScript API restrictions before explicit confirmation.

Production authorization remains MTT's existing release boundary. Local BFF roles
are server-bound on loopback with CSRF and exact-origin checks; they are not a
public production authentication system. Persistent filesystem quota ledgers are
development controls, not a distributed production quota service.

## Local launch (Windows PowerShell)

Dependencies are installed in this worktree. From its root:

```powershell
$env:LANNPYA_ENVIRONMENT='local'
$env:LANNPYA_ROUTING_PROVIDER='offline'
$env:LANNPYA_ROUTING_EXTERNAL_REQUESTS_ENABLED='false'
$env:LANNPYA_GOOGLE_DEMO_ENABLED='false'
$env:LANNPYA_GOOGLE_DEMO_MAX_REQUESTS='0'
$env:LANNPYA_ORS_MAX_REQUESTS='0'
npm.cmd start -- --port 8784 --state phase40-review
```

Open `http://127.0.0.1:8784/#/dispatch`, `/#/routes`, `/#/customer`, or `/#/ride`
on the same origin. Generate a buyer link from its order and open that private
link for the buyer workflow. New-order creation confirms in MTT's modal; open the
order from there. Route departure is inside its route tile/sheet. The launcher
owns separate SQLite state under `backend/data/integrated-workspaces/phase40-review/`.
The original worktree/manual demo is not replaced or stopped.

This launch intentionally uses SIMULATED routing. For later authorized credential
setup, run `python -m tools.google_browser_map --store-key` or
`python -m tools.ors_matrix_probe --store-key` from this worktree's backend venv
in an interactive terminal. Storing a key does not enable requests. The historical
browser restriction for port 8783 does not authorize port 8784: the owner must
restrict/confirm the exact chosen origin before enabling a browser renderer.
No live allowance should be enabled without separate bounded authorization.

## Review readiness

The mapping port is a local review candidate with the inherited failures above
explicitly recorded. All new mapping behavior is exercised with isolated/recorded
data; live provider activation and public production deployment remain separate
authorization/release tasks. No Supabase migration work was started. Next steps:
review this selective diff and the safety exception for demo-pin persistence;
address the independent MTT CSP/TypeScript failures; obtain approval before any
publication or live-provider test.
