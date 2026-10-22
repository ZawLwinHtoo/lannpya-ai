# Phase 33: HeiGIT ORS preparation — live test not executed

> Historical source-worktree evidence from Phases 32?39. For the current MTT-based port and its actual test results, see [Phase 40 report](../integration/MTT_MAPPING_PORT_REPORT.md). No live provider verification was repeated during this port.

Date: 2026-10-22. Worktree: `LannPya-AI-google-ors`.
Branch: `feature/google-ors-mapping-final`.
HEAD: `81a30d726e1a29b9914f0e8f1545ab79cabda45d`.
Existing uncommitted Phase 32 work was preserved. No branch change, commit,
push, merge, deployment, database migration or Supabase work occurred.

## Credential configuration and safe entry

The plan-only check reports `credential_configured: false`. No real ORS key was
read back, displayed or generated. Dummy credentials in owned temporary files
were used for all storage tests.

Run this in a real Windows Terminal/PowerShell console:

```powershell
cd C:\Users\ZL_shit_H\Documents\Projects\LannPya-AI-google-ors\backend
.\.venv\Scripts\python.exe -m tools.ors_matrix_probe --store-key
```

For Command Prompt, use `cd /d` with the same directory, then the same Python
command. Enter the key only at the hidden prompt; no characters should appear.
Do not put the key in command arguments, command history, screenshots or chat.
The command refuses redirected input and refuses getpass's echoing fallback.
It uses Python's native console getpass implementation; interactive Windows
Terminal/CMD entry was not manually exercised by automation.

The destination is **`backend/.env.ors.local`**, verified Git-ignored before
prompting. A temporary file receives non-inherited Windows ACLs for the current
user, SYSTEM and Administrators **before** writing any secret, then is flushed,
fsynced and atomically replaced. Native Windows ACL creation was executed using
a dummy key. Permission/replacement failures preserve the prior file and clean
up the owned temporary file. POSIX uses mode 0600. No `Path.open(opener=...)`
call is used. The command prints only a generic success or sanitized error code.

Only the credential is stored. No live flags, budgets, database files or browser
configuration are modified. Resolution order is a nonempty settings key,
`LANNPYA_ORS_API_KEY`, `ORS_API_KEY`, then the dedicated private file. The loader
uses `SecretStr`, disables dotenv interpolation and never serializes the value.
Both the backend adapter and plan-only tool use this resolver. Restart a running
local workspace after changing credentials if needed; external gates remain off.

## Endpoint and planned request

The adapter still used the deprecated host. It now uses the official HeiGIT
endpoint below, along with the matching Directions path. Test fixtures and the
independent guarded evaluation allowlist were updated. No public API route,
response schema, optimizer constraint or frontend application file was changed
in Phase 33.

`POST https://api.heigit.org/openrouteservice/v2/matrix/driving-car`

```json
{
  "locations": [
    [96.130, 16.825],
    [96.125, 16.815],
    [96.142, 16.810],
    [96.153, 16.800]
  ],
  "metrics": ["distance", "duration"],
  "units": "m"
}
```

These are explicitly fictional test points: one hub and three deliveries, not
verified customer homes. Coordinate ordering is longitude, latitude. Omitting
sources/destinations requests all four origins against all four destinations:
**4×4 = 16 cells in one HTTP request**. Distance units are meters; durations are
seconds. No geometry, Directions, geocoding, traffic, Google or matrix retry is
proposed. Timeout: 10 seconds. Redirect following and HTTP retries are disabled.
The network-free plan command is `python -m tools.ors_matrix_probe` from backend/.
It has no live-execution switch.

## Authorization and usage controls

**Live request authorization: pending. External ORS requests sent: 0. Google
requests sent: 0. Matrix HTTP status: not obtained.**

Defaults remain `LANNPYA_ROUTING_EXTERNAL_REQUESTS_ENABLED=false`,
`LANNPYA_ORS_MAX_REQUESTS=0`, Google budget 0 and matrix cap 16. After separate
owner approval, one bounded operation would require the existing local/test
dispatcher authorization, ORS provider selection, enabled external gate, budget
exactly 1, explicit request consent and a UUID request ID. Saving a key alone
cannot satisfy these conditions. Failed attempts consume a durable slot;
duplicate request IDs cannot retry, and parallel callers share the ledger.
Do not delete that ledger to evade a consumed budget. The ordinary server rate
limiter and safe provider errors remain in place.

The [official migration announcement](https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912)
confirms the new host/path and says dashboard quotas apply to it. It also notes
that quota structure has been simplified. Current private account entitlement,
remaining daily/minute allowance and billing status were **not** verifiable from
the public plans SPA. The previously published Standard reference listed 500
Matrix requests/day and 40/minute; those figures are historical reference only,
not a verified current account guarantee. Do not enable billing or a paid plan.
The owner must confirm their free Standard Matrix entitlement and remaining
allowance on the [HeiGIT account plans/dashboard](https://account.heigit.org/info/plans)
before approving the request. No account login or quota API call was attempted.

Provider guidance counts Matrix quota by request, while service size limits
also apply to source–destination cells. This plan consumes one Matrix operation
with 16 cells, not 16 HTTP requests. Local limits do not prove provider allowance.
Official references: [Matrix semantics](https://giscience.github.io/openrouteservice/api-reference/endpoints/matrix/),
[FAQ and usage windows](https://giscience.github.io/openrouteservice/frequently-asked-questions),
[staff quota clarification](https://ask.openrouteservice.org/t/is-the-matrix-quota-counted-by-element-or-by-call/4318).
Keep required openrouteservice/OpenStreetMap attribution and applicable service
terms; do not expose keys in browser code or use extra accounts to bypass limits.

## OR-Tools readiness and test evidence

The new four-point regression sends the exact fictional locations to a
MockTransport adapter, validates an asymmetric 4×4 response, then uses its
distance/time values for one rider and three stops. It asserts all three stops,
capacity 3, return-to-hub arc sums, and travel plus service duration. It remains
**ORS_MOCK_MATRIX**, not a live road observation. Existing tests cover unreachable
cells, malformed dimensions/values, hard capacities/windows, two-rider commit,
rider queue updates, stale plans, concurrency, quota exhaustion, timeouts and
sanitized 403/429/500 handling with no retries.

Actual live distances, durations, asymmetry, reachable locations and optimized
sequence are **not available yet**. A separately authorized successful response
will be labeled `ORS_ROAD_MATRIX` and fed through the same validated boundary.
No real-world route efficiency or Yangon road coverage claim is made here.

Observed verification results:

| Check | Result |
|---|---|
| Focused credentials, adapter, optimizer, evaluation and mapping regression tests | 131 passed before the additional three-stop case |
| Additional exact four-point / one-rider solver regression | 1 passed |
| Complete Python suite after all code changes | **1,054 passed, 0 failed**, 151.86 seconds |
| New tests in Phase 33 | **16**: 15 credential/security cases plus the three-stop solver case |
| Real Chromium ORS workflow, mocked provider, desktop 1440 px and mobile 390 px | **2 passed, 0 failed**, 21.0 seconds |
| Ruff lint | Passed |
| Ruff formatting | 133 files already formatted |
| Python dependency consistency (`pip check`) | No broken requirements |
| `git diff --check` | Passed; existing CRLF-to-LF informational warnings only |
| Tracked + non-ignored source secret-pattern scan | 0 files matched Google/GitHub/private-key patterns |
| Tracked private environment/database files | 0 |
| Default live ORS ledger created | No |

The full-suite count includes the focused tests; these counts must not be added
together. The only three Python warnings are existing OR-Tools SWIG type
deprecations. Browser tests launch real Chromium against an isolated SQLite/API
workspace, but replace provider transport; they do not verify HeiGIT availability
or actual road distances. No full frontend regression/build was repeated because
Phase 33 did not modify product frontend source. The preceding Phase 32 report
contains its separate frontend/build results.

Changed/added Phase 33 files: `backend/app/routing/credentials.py`,
`backend/app/routing/endpoints.py`, `backend/app/routing/http.py`,
`backend/app/api/routing.py`, `backend/tools/ors_matrix_probe.py`,
`backend/tools/routing_evaluation/evaluate.py`, `backend/.env.example`,
`backend/tests/test_ors_credentials.py`, `backend/tests/test_ors_integration.py`,
`backend/tests/test_mapping_release.py`, `backend/tests/test_routing.py`,
`backend/tests/test_routing_evaluation.py`, `tests/browser/fixtures.cjs`,
`docs/mapping-routing/API_CONTRACT.md`, this report and
`docs/mapping-routing/PHASE33_ORS_REQUEST_PLAN.json`.
Existing Phase 32 optimizer, schema, map UI, dashboard and Google renderer changes
were retained. Recorded pre-task hashes confirmed those unrelated source files
were unchanged by Phase 33. Nothing was staged or committed.

## Remaining boundaries

Store the real key using the hidden command, confirm the free account quota,
then explicitly authorize exactly one 4×4 Matrix request. No live call will be
made based only on credential presence. Unreachable test points or a provider
rejection must be reported without retrying or silently substituting simulation.
Matrix data does not supply route geometry or live traffic. Google's separate
browser-renderer credential and public-deployment authentication remain existing
blockers; they were not altered. SQLite and the existing OR-Tools hard constraints
remain authoritative. Phase 32 endpoint references are historical; this report
and `PHASE33_ORS_REQUEST_PLAN.json` supersede the old-host request plan.
