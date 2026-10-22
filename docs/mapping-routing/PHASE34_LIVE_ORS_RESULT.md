# Phase 34 — first authorized HeiGIT Matrix request

> Historical source-worktree evidence from Phases 32?39. For the current MTT-based port and its actual test results, see [Phase 40 report](../integration/MTT_MAPPING_PORT_REPORT.md). No live provider verification was repeated during this port.

Date: 2026-10-22. Attempt timestamp: `2026-10-22T07:36:01.774707+00:00`.
Worktree: `LannPya-AI-google-ors`.
Branch: `feature/google-ors-mapping-final`.
HEAD remains `81a30d726e1a29b9914f0e8f1545ab79cabda45d`.

## Observed result

**Exactly one authorized live POST was attempted. HeiGIT returned HTTP 403.
No retry or additional external request was made.**

The existing adapter returned the sanitized error code:

```json
{
  "http_status": 403,
  "sanitized_error": "ROUTING_CREDENTIAL_OR_QUOTA_REJECTED",
  "request_count": 1,
  "retries": 0,
  "remaining_local_request_budget": 0
}
```

This is the application's safe error, not a verbatim provider error body. The
adapter intentionally does not retain provider response bodies for 401/403.
The response included no captured standard rate-limit limit/remaining/reset
headers. The exact provider-side reason is therefore **not established**. HTTP
403 alone does not distinguish key permission, account entitlement or quota
rejection. No invalid-key or exhausted-quota diagnosis is claimed.

## Credential, endpoint and request

The stored key loaded successfully (`credential_configured: true`). Its value,
prefix, suffix and fingerprint were never printed. The private environment file
is Git-ignored. No key was copied into source, command arguments, browser files
or reports. No account settings, paid service or billing configuration changed.

Endpoint:
`POST https://api.heigit.org/openrouteservice/v2/matrix/driving-car`

This is the endpoint prepared in Phase 33 using the
[official HeiGIT migration announcement](https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912).
No additional documentation, quota, account, Directions, Google or geocoding
network request was issued in Phase 34.

The exact JSON body was:

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

Index 0 is the fictional hub; indices 1–3 are fictional deliveries. Coordinates
are longitude, latitude and are not verified customer homes. All sources and
destinations were requested: 4×4, 16 cells, driving-car. The request was not a
simulation; the provider rejected it before supplying usable matrix data.

## Authorization, quota and safety

The user's Phase 34 instruction authorized this one request. A one-process
settings object enabled ORS with a maximum of one request and 16 cells. Saved
environment settings and application defaults were not changed. The existing
durable budget reservation was used; the consumed slot remains consumed after
failure. An additional in-process guard allowed only this endpoint/body and
blocked any second outbound request. The one-shot tool also refuses to rerun
when its result file already exists.

HTTP timeout was 10 seconds, transport retries 0, redirect following disabled,
and environment proxy inheritance disabled. Google request budget stayed 0.
The request originated from a local owner-operated Python invocation of the
existing provider; no public endpoint or authentication boundary was weakened.

The private account dashboard and available free-tier quota could not be
independently checked without another account/API connection. The single 403
and absence of quota headers did not confirm available quota or Matrix
entitlement. Published plan figures are not proof of this account's allowance.
No additional connection was made to investigate, in accordance with the
one-request limit. Local budget consumption is not a claim about provider billing
or how a rejected request counts against the account's quota.

## Matrix validation and optimization

| Requested observation | Actual result |
|---|---|
| HTTP status | **403** |
| Successful live matrix | No |
| Matrix dimensions/values | Not available; no successful response to validate |
| Asymmetric road travel times | Not measurable |
| Unreachable road pairs | Unknown |
| Actual road distance/duration | Not available |
| Live matrix passed to OR-Tools | No; execution stopped on provider failure |
| Live stop sequence / total distance / travel duration | Not calculated |
| `ORS_ROAD_MATRIX` result | Not produced; no valid road matrix was obtained |
| Simulated substitution | None |

It would be misleading to label a rejected request or a mock result
`ORS_ROAD_MATRIX`. The existing adapter will apply that observation label only
after an actual successful, validated non-mocked matrix response. OR-Tools hard
constraints, assignment rules and the existing simulated optimizer remain
unchanged.

## Local regression verification

After the live rejection, local tests exercised dummy credential storage,
Matrix response validation, asymmetric costs, unreachable pairs, one-rider
three-stop optimization, capacities, time windows, multiple riders, plan commits,
stale-plan protection, quota reservation/concurrency and sanitized failures.
Provider responses in these tests use MockTransport; no external retry occurs.

Results: **132 passed, 0 failed**, 43.34 seconds, for
`test_ors_credentials.py`, `test_ors_integration.py`, `test_mapping_release.py`,
`test_routing.py` and `test_routing_evaluation.py`. The three warnings are existing
OR-Tools SWIG type deprecations. Ruff lint passed and all 133 Python files passed
the formatting check. No frontend/browser retest was needed because no
application or frontend code changed. `git diff --check` passed with existing
line-ending informational warnings only.

## Files and remaining limitations

The only new non-ignored Phase 34 file is this report. Ignored execution evidence
is `.tmp/phase34-result.json`; `.tmp/phase34_once.py` is an owner-authorized
one-shot driver, and `.tmp/ors-routing-budget/` retains the consumed slot. These
contain no credentials. Existing Phase 32/33 uncommitted work was preserved.
No database, frontend design, application implementation, branch, commit,
deployment or database provider was changed. No push or merge occurred.

Next step: the account owner needs to verify Matrix access, account/key status
and remaining allowance in the HeiGIT dashboard. Do not paste the key into chat.
Any subsequent live test needs **new explicit authorization** and a separately
reviewed allowance; do not delete/reset the consumed ledger to evade it. Real
Yangon road-matrix optimization remains blocked until a provider accepts a
request. A Matrix response would still supply static estimates, not live traffic
or route geometry. Existing Google renderer/browser-credential and public
authentication limitations are unchanged.
