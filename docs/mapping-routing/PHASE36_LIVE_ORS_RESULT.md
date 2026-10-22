# Phase 36 — real HeiGIT matrix and OR-Tools verification

> Historical source-worktree evidence from Phases 32?39. For the current MTT-based port and its actual test results, see [Phase 40 report](../integration/MTT_MAPPING_PORT_REPORT.md). No live provider verification was repeated during this port.

Observed at `2026-10-22T08:01:52.685522+00:00`.
Worktree: `LannPya-AI-google-ors`.
Branch: `feature/google-ors-mapping-final`.
HEAD remains `81a30d726e1a29b9914f0e8f1545ab79cabda45d`.

## Result

**One additional authorized request returned HTTP 200. A real 4×4 Matrix response
was validated and passed directly to the existing OR-Tools optimizer.**
Observation: **`ORS_ROAD_MATRIX`**; quality: `ROAD_STATIC`; live traffic: false.
There was no retry, second routing request, Google call or simulated substitution.

The previous 403 did not recur. Its original cause remains unknown because the
Phase 34 provider error body was not retained. Successful access today is not
evidence that the new diagnostic code repaired a credential or permission issue.

## Authentication, configuration and quota checks

The [official HeiGIT migration announcement](https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912)
confirms the current Matrix host and service prefix. The
[official Python client](https://github.com/GIScience/openrouteservice-py/blob/master/openrouteservice/client.py)
uses the API key directly in the Authorization header. The existing adapter does
the same. Current [FAQ](https://giscience.github.io/openrouteservice/frequently-asked-questions)
guidance treats JWT-shaped credentials as ordinary API keys. No endpoint or
authentication configuration defect was confirmed, so neither was changed.

The key loaded through the existing server-side resolver. No value, fingerprint,
private token claim or sensitive request header was printed or retained. The
credential file remains Git-ignored. No credential was copied into frontend code.

Before the request, the owner reported Matrix V2 **500/500 remaining** and
**40 requests/minute** in the private dashboard. This one Matrix operation with
16 cells fits that owner-confirmed allowance; no separate quota/account API call
was made. The successful response supplied these numeric quota headers:

| Header | Value received |
|---|---|
| `x-ratelimit-limit` | `500` |
| `x-ratelimit-remaining` | `499` |
| `x-ratelimit-reset` | `1792656113` |

These values are recorded as returned, without promising a particular future
reset time or interpreting the header as independent verification of account
billing status. No billing settings or paid service were activated.

Only this owner-operated process received an additional authorization allowance.
The durable ledger retained Phase 34's consumed slot; its cumulative ceiling was
2 for this invocation, leaving exactly one new slot before the request and zero
after it. The prior ledger was not erased or reset. A separate one-shot guard
allowed only the exact endpoint/body once and refuses to rerun once its result
artifact exists. Saved application defaults remain external calls disabled,
ORS maximum requests 0 and Google maximum requests 0.

## Request and validated response

`POST https://api.heigit.org/openrouteservice/v2/matrix/driving-car`

```json
{
  "locations": [[96.130,16.825],[96.125,16.815],[96.142,16.810],[96.153,16.800]],
  "metrics": ["distance","duration"],
  "units": "m"
}
```

These are fictional test coordinates, not customer homes. Indices are H (hub),
D1, D2, D3 in that order; positions are longitude, latitude. Omitted source and
destination arrays select all four positions, consistent with the
[official Matrix contract](https://giscience.github.io/openrouteservice/api-reference/endpoints/matrix/).
Timeout: 10 seconds. Retries: 0. Redirect following and environment proxy
inheritance: disabled. Measured adapter response/validation latency: 2,002.31 ms.

Returned road distances in meters:

| From / to | H | D1 | D2 | D3 |
|---|---:|---:|---:|---:|
| H | 0.00 | 2004.79 | 2929.23 | 4252.91 |
| D1 | 1768.12 | 0.00 | 2819.07 | 4142.74 |
| D2 | 3245.66 | 2799.81 | 0.00 | 2047.64 |
| D3 | 4314.88 | 4141.30 | 2170.24 | 0.00 |

Returned estimated travel durations in seconds:

| From / to | H | D1 | D2 | D3 |
|---|---:|---:|---:|---:|
| H | 0.00 | 235.38 | 266.94 | 438.67 |
| D1 | 236.59 | 0.00 | 252.43 | 424.15 |
| D2 | 233.09 | 268.81 | 0.00 | 210.05 |
| D3 | 429.48 | 433.18 | 219.80 | 0.00 |

Both arrays are complete 4×4 matrices, finite and nonnegative, with zero diagonal
and no unreachable pairs. All six opposing duration pairs are asymmetric. For
example, H→D2 is 266.94 seconds whereas D2→H is 233.09 seconds. These are static
provider estimates, not live traffic or independently measured journey times.
Attribution: **openrouteservice / OpenStreetMap contributors**.

## Existing optimizer results

One fictional rider, capacity 3; three one-parcel stops; 180 seconds service per
stop; an eight-hour operating window; return to hub required; duration objective;
two-second solver limit. No separate buyer-specific windows were imposed in this
small live example. Existing capacity, service and scheduling constraints were
preserved, with no real order/assignment/database mutation.

Result: **FEASIBLE**, load/capacity **3/3**, all three stops served, none unassigned.
Route: **H → D1 → D3 → D2 → H**.

| Measurement | Value |
|---|---:|
| Sum of original returned road distances on selected arcs | **11,563.43 m / 11.56343 km** |
| Sum of original returned travel durations | **1,112.42 s / 18.5403 min** |
| Configured stop service time | 540 s / 9 min |
| Original travel estimates plus configured service time | **1,652.42 s / 27.5403 min** |
| Existing integer-normalized solver distance | 11,565 m |
| Existing integer-normalized solver travel duration | 1,115 s / 18.5833 min |
| Solver route duration including service | 1,655 s / 27.5833 min |
| Measured solver runtime | 2,017.719 ms |

The adapter preserves its established conservative normalization: each matrix
arc is rounded upward to integer meters/seconds before optimization. This
explains the small difference between raw provider totals and solver totals.

An offline enumeration of all six feasible delivery permutations confirmed
that the returned route has the lowest **normalized duration cost** for this
specific three-stop example:

| Route between hub departures/returns | Normalized travel seconds |
|---|---:|
| D1 → D2 → D3 | 1130 |
| **D1 → D3 → D2** | **1115** |
| D2 → D1 → D3 | 1391 |
| D2 → D3 → D1 | 1149 |
| D3 → D1 → D2 | 1360 |
| D3 → D2 → D1 | 1165 |

The application retains `globally_optimal:false`; this small exhaustive check
does not establish guaranteed global optimality for general VRP workloads.
No route geometry was requested or generated from the Matrix values.

## Confirmed code improvement

The actual defect was lost diagnostic evidence, rather than a demonstrated
authentication error. New `app/routing/diagnostics.py` reads at most 8 KiB within
the request deadline, accepts only selected JSON code/message fields, limits
messages to 512 characters, strips controls and redacts the loaded key, its
URL/base64 representations, header-like text, URLs and long token-like strings.
Oversized/non-JSON/duplicate-key bodies are omitted with a safe body-state code.
Full payloads and request headers are never attached to exceptions or logs.

`RoutingFailure.provider_error` retains only those bounded sanitized fields for
server-side diagnostics. Exception strings and public API error shapes remain
unchanged. Existing 400/404 point/route mappings and 401/403/429/5xx categories
are preserved. Reading an error response never triggers another request. The
successful Phase 36 response had no provider error to retain; the new failure
paths were tested with fictional responses.

## Verification

Before the live request: **146 focused Python tests passed**, zero failed,
44.25 seconds. This includes **14 new diagnostic regression cases**, checking
flat/nested error formats, secrets echoed in errors, malformed/oversized bodies,
safe output limits, 403/429/500 responses, no retries, quota consumption and
compatible point-not-found mapping. Existing credentials, adapter, optimization,
mapping and guarded evaluation tests were included.

After the authorized request, the complete backend suite passed:
**1,068 passed, 0 failed**, 155.04 seconds. The focused tests are included in
this total and must not be added to it. The only three warnings are existing
OR-Tools SWIG type deprecations. Ruff lint passed; formatting checked 135 files;
`pip check` found no broken requirements. `git diff --check` passed with existing
line-ending informational warnings only. No frontend/build/browser rerun was
needed because Phase 36 changed no frontend code or browser contract.

The final credential-pattern scan of tracked/non-ignored source plus the new
one-shot evidence found zero Google-key, GitHub-token, JWT or private-key matches.
The real credential file and both consumed ledger slots remain Git-ignored.
The ledger was preserved, not reset, and no database files were introduced.

## Scope and remaining boundaries

Phase 36 application changes are confined to `backend/app/routing/base.py`,
`backend/app/routing/http.py`, new `backend/app/routing/diagnostics.py` and new
`backend/tests/test_routing_diagnostics.py`. This report is new. Ignored one-shot
evidence is `.tmp/phase36-result.json` and `.tmp/phase36_once.py`; consumed ledger
entries remain in `.tmp/ors-routing-budget/`. No key or raw request header is
stored in these artifacts. A copied phase-number metadata field was corrected
locally to 36 without executing the request driver again.

No frontend, database, optimizer algorithm, migration, account settings or
database provider was changed. All preceding uncommitted work was preserved.
No push, merge, deployment, Supabase work, billing activation or additional live
call occurred. Routine application live routing remains disabled. This validates
one small Yangon Matrix request and its in-memory optimization, not every route,
production PostgreSQL, continuous live routing or a complete public deployment.
Any further provider request requires separate explicit authorization.
