# Phase 35 — HeiGIT HTTP 403 diagnosis without another API call

> Historical source-worktree evidence from Phases 32?39. For the current MTT-based port and its actual test results, see [Phase 40 report](../integration/MTT_MAPPING_PORT_REPORT.md). No live provider verification was repeated during this port.

Date: 2026-10-22. Worktree: `LannPya-AI-google-ors`.
Branch: `feature/google-ors-mapping-final`.

## Conclusion

The endpoint, HTTP method, JSON structure, coordinate ordering and matrix size
match the documented Matrix contract. **The saved evidence cannot establish the
exact reason for HTTP 403.** It does not prove an invalid key, missing Matrix
permission, exhausted quota, a geographic restriction or a paid-plan requirement.
No application request correction is justified by the available evidence.

Phase 35 made **zero routing, quota, authentication or account API requests**.
Public official documentation pages were reviewed separately. No retry, account
login, deprecated-endpoint probe, key regeneration or service change occurred.

## What was actually saved

Inspected `.tmp/phase34-result.json`, `.tmp/phase34_once.py`, the Phase 34 report,
the provider's HTTP handling, credential resolver and endpoint constants.

| Evidence | Finding |
|---|---|
| Phase 34 response status | HTTP 403 |
| Application error | `ROUTING_CREDENTIAL_OR_QUOTA_REJECTED` |
| Saved `body` field | **Outgoing request JSON**, not the provider's response body |
| Raw/sanitized provider error body | **Not retained** |
| Complete response headers | **Not retained** |
| Filtered quota header values | Empty object, `{}` |
| Number of Phase 34 requests | 1; retries 0 |

`backend/app/routing/http.py` raises the same safe application error immediately
for both 401 and 403, before reading the response body. Consequently, that label
contains no provider-specific diagnosis. The Phase 34 observer retained only six
allowlisted rate-limit header names, and only values matching a restrictive
character pattern. Empty saved quota headers mean **no acceptable allowlisted
values were retained**, not proof that the full HTTP response contained no
headers. No request ID, gateway code, content type or provider error message can
be recovered from the existing artifact. The response stream has already closed.

This clarifies the limits of the Phase 34 report's wording about missing headers.
Do not reconstruct or invent an ORS error body such as “access disallowed” or
“quota exceeded”; neither was saved from this request.

## Endpoint and schema review

Actual endpoint and method:

`POST https://api.heigit.org/openrouteservice/v2/matrix/driving-car`

The [official HeiGIT migration announcement](https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912)
maps Matrix v2 to this host and service prefix. The old host is deprecated;
switching back is not a recommended correction.

The saved request contains four numeric `[longitude, latitude]` locations,
`metrics: ["distance", "duration"]`, and `units: "m"`. All coordinates have valid
WGS84 ranges and fall within the fictional Yangon test region. There are no
dynamic options. With sources and destinations omitted, all locations are used
for both axes, giving **4×4 = 16 cells**. The
[official Matrix documentation](https://giscience.github.io/openrouteservice/api-reference/endpoints/matrix/)
describes these defaults and metrics; duration units are seconds. The
[official FAQ](https://giscience.github.io/openrouteservice/frequently-asked-questions)
confirms longitude-first input. The published API restrictions reference lists
3,500 ordinary Matrix cells and 25 with dynamic arguments; 16 is below both.
Its [public restrictions page](https://openrouteservice.org/restrictions/) was
available in search indexing but direct retrieval returned 404, so account-specific
current limits still require dashboard confirmation.

Source inspection shows the adapter supplies the server-side credential in the
Authorization header and uses the HTTP client's JSON serializer. An offline
request build with a dummy credential confirmed `application/json` content type.
No real sensitive header was displayed or retained. “Basic Key” is an account
credential label; it is not a reason to switch to username/password Basic auth.
No evidence supports adding a Bearer prefix. Existing raw-key header usage is
consistent with [ORS staff guidance](https://ask.openrouteservice.org/t/error-with-responsedata/3561).

These checks establish a documented, locally valid request. They do not prove
that this account is authorized or that each fictional point snaps to a road.

## Basic Key access rights and candidate causes

In the [official account-interface explanation](https://ask.openrouteservice.org/t/new-ors-account-site/7115),
ORS staff identify Basic Key as the default key supplied to an account and point
users to the openrouteservice section for remaining quota. The
[current FAQ](https://giscience.github.io/openrouteservice/frequently-asked-questions)
also explains that newer JWT-shaped values remain ordinary HeiGIT API keys.
Neither source says that the Basic Key label itself excludes Matrix or requires
a paid upgrade. Conversely, a label is not proof of a specific account's active
service entitlement. The public [plans page](https://account.heigit.org/info/plans)
provided no extractable entitlement information in this review.

The local private file exists and is Git-ignored. Neither supported process
environment variable currently contains an override, so no current environment
shadowing was found. This does not prove the exact credential provenance at the
time of Phase 34, nor that the stored value matches the owner's current dashboard
key. Phase 35 did not display, decode or inspect private token claims. Account
activation, revocation/expiry, enabled Matrix access and remaining quota cannot
be established from a file's presence or the Basic Key label.

| Candidate cause | Evidence and confidence |
|---|---|
| Invalid, revoked, expired or wrong credential | Possible; successful loading only establishes presence. Provider error body is missing. Not confirmed. |
| Matrix entitlement/account permission missing | Possible; private dashboard state is unavailable. Basic Key does not by itself demonstrate this. Not confirmed. |
| Daily quota exhausted | Documented cause of 403; saved quota values are absent. Not confirmed for this account. |
| Minute-rate limit | The official FAQ documents 429 for this limit. Less consistent with the observed 403, but not an absolute exclusion of gateway behavior. |
| Provider/gateway restriction | Possible; full headers/error body were not retained. No specific provider restriction is established. |
| Myanmar/geographic ban | No supporting evidence. Do not infer a region ban from a generic 403. |
| Wrong method, swapped coordinates or oversized request | No such defect found in the saved request. |
| Local request budget exhausted | The slot was consumed by the attempted request. It did not cause the remote 403; local reservation succeeded before HTTP. |

The FAQ explicitly associates daily-limit exhaustion with 403 and minute-limit
exhaustion with 429. It does not make every 403 a quota diagnosis. A
[2026 ORS support thread](https://ask.openrouteservice.org/t/error-access-to-this-api-has-been-disallowed/7937)
also discusses a 403 reported despite apparently valid credentials and allowance;
that separate incident is not proof of this request's cause.

## Smallest recommended correction and another test

1. **Keep the endpoint, request JSON, optimizer, frontend and paid-service settings
   unchanged.** No request defect or need for a paid plan was demonstrated.
2. The account owner should privately confirm account/key status, the
   openrouteservice Matrix entitlement, remaining allowance and any dashboard
   restriction. No key should be posted in chat, a report or a public support
   request. Only replace the stored value using the existing hidden-input command
   if a wrong/revoked/expired value is actually confirmed; do not rotate it blindly.
3. For any later separately authorized attempt, first add bounded diagnostic
   capture of safe provider error codes and reviewed messages, response content
   type and selected quota/request identifiers. Redact against the loaded secret,
   never retain request Authorization headers, and avoid full raw payload dumps.
   The missing diagnostics are a confirmed investigation limitation, not proof
   of the provider-side cause. This recommendation was **not implemented** in the
   application during this documentation-only task.
4. A further one-request test would be justified after entitlement/quota/key
   verification or a confirmed correction, with the diagnostic capture prepared
   and **new explicit authorization**. Repeating the identical request now would
   not establish a correction and is not recommended. The consumed Phase 34 ledger
   must remain intact; do not delete it or silently reset the budget.

## Local verification and changes

Offline checks validated the saved endpoint/method, four coordinate pairs,
metrics, units, 16 cells, absence of dynamic options and JSON serialization.
Saved defaults remain external calls disabled, ORS maximum requests 0, remaining
local budget 0. These checks used saved synthetic data and a dummy request header;
they did not load or display the real credential.

Focused mock-only tests: **5 passed, 0 failed**, 2.92 seconds. They cover provider
403/429/500 rejection, consumed budget/no retry/no leakage, the network-free plan,
and the four-point asymmetric matrix passed to the existing one-rider optimizer.
Three existing OR-Tools SWIG deprecation warnings remain. No full regression was
repeated because no application code changed.

Only this report was added as a non-ignored Phase 35 file. Offline check output is
in ignored `.tmp/phase35-offline-checks.json`. Existing uncommitted work, the
private credential file, durable ledger, database, frontend and branch were
preserved. No push, merge, deployment, paid activation or live API retry occurred.
