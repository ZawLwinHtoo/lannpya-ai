# Additive routing API contract

Existing endpoints remain unchanged. Base URL is the local FastAPI/BFF workspace;
the website uses its existing same-origin `/dashboard/api` bridge. Never put the
private dev credential into browser fetch code. Native API callers require the
existing local/test `X-Dev-Access-Token` and server-bound actor. Production fails
closed. All new paths begin `/api`.

Phase 33 provider update: ORS requests use
`https://api.heigit.org/openrouteservice/v2/matrix/driving-car` (the former host
is deprecated). `python -m tools.ors_matrix_probe --store-key` from `backend/`
stores a server-only key with hidden input in ignored `.env.ors.local`. This
does not change live-call permissions or budgets. See
[Phase 33 preparation](PHASE33_ORS_LIVE_VERIFICATION.md); the live matrix test
still requires separate authorization. Public API routes and schemas are unchanged.

Phase 37 UI: Mode B uses this same authorized preview/commit contract. It refreshes
the local provider-status budget after each attempt, disables exhausted/unknown
availability, and never retries automatically. `ORS_ROAD_MATRIX` means a successful
provider observation; `ORS_MOCK_MATRIX` identifies a recorded/mocked replay.
Matrix-only plans show independent approved stop pins on Leaflet, without a
fabricated road polyline. See [final UI verification](PHASE37_FINAL_UI_VERIFICATION.md).

| Method | Path | Authorization / effect |
|---|---|---|
| GET | `/routes/provider-status` | Dispatcher/admin; config booleans, no provider call |
| POST | `/routes/calculate` | Dispatcher/admin; normalized route; consumes budget |
| POST | `/routes/matrix` | Dispatcher/admin; square costs; consumes budget |
| POST | `/routes/optimize` | Dispatcher/admin; 201 persisted preview, no assignments |
| GET | `/routes/plans` | Dispatcher/admin; `page`, `page_size` pagination |
| GET | `/routes/plans/{plan_id}` | Dispatcher/admin; current stale flag |
| POST | `/routes/plans/{plan_id}/commit` | Dispatcher/admin; atomic, idempotent commit |
| GET | `/riders/{rider_id}/route-plans` | Own rider or dispatcher/admin; latest 20 scoped plans |
| GET | `/routes/google-demo/status` | Dispatcher/admin/rider; safe enablement and remaining global budget; no Google call |
| POST | `/routes/google-demo` | Dispatcher/admin or actively assigned rider; explicit one-order external estimate; no assignment mutation |

For the Phase 28 Google estimate request/response, guards, errors, privacy and local
activation boundaries, see [Google dispatcher integration](GOOGLE_DISPATCHER_INTEGRATION.md).

Phase 30 additive plan fields: `orders[].priority` is optional, strict integer 0–5
(default 0). It weights unassigned penalties, not mandatory stop precedence.
`result.vehicles[].capacity` and `load` are nullable for historical plans; new plans
record both. Each planned stop includes `priority` and a nullable resolved
`delivery_window`. Existing endpoints, hard constraints and assignment authorization
are unchanged. See [final mapping release](MAPPING_FINAL_RELEASE.md) for acceptance evidence.

Route request:

```json
{"origin":{"latitude":16.8,"longitude":96.1},"destination":{"latitude":16.82,"longitude":96.12},"mode":"DRIVE","allow_simulation":true}
```

Route response fields: `provider`, `origin`, `destination`, `mode`, integer
`distance_meters`, integer `duration_seconds`, optional GeoJSON `geometry`,
`quality` (SIMULATED or ROAD_STATIC), `traffic_aware:false`, `warnings`,
`attribution`. Offline fixture name is `yangon-synthetic-grid-v1`, not a road-data
provider. Matrix requests use `locations` (2 through configured max-stops+1),
`mode`, `allow_simulation`; responses use square `distances`/`durations` arrays,
paired null unreachable cells and the same provider/quality fields.

Optimization request (replace IDs with actual saved records; dates must cover
the parcel delivery day and end in the future):

```json
{
  "origin":{"latitude":16.8,"longitude":96.1},
  "orders":[{"order_id":"00000000-0000-4000-8000-000000000001","demand":1,"service_seconds":180}],
  "riders":[{"rider_id":"00000000-0000-4000-8000-000000000002","capacity":20}],
  "operating_window":{"start":"2026-12-01T08:00:00+06:30","end":"2026-12-01T18:00:00+06:30"},
  "mode":"DRIVE","objective":"duration","return_to_hub":true,
  "solver_seconds":2,"allow_simulation":true
}
```

Plan response: `id`, `version`, `state` (PREVIEW/COMMITTED), UTC `created_at`,
dynamic `stale`, `origin`, `operating_window`, `routes` (rider ID -> existing
workflow-route ID, populated on commit), `result`.

`result` contains `solver:"OR-Tools"`, `solver_status`, `globally_optimal:false`,
`elapsed_ms`, `provider`, `quality`, `traffic_aware:false`, `matrix_size`,
`vehicles`, `unassigned`, `warnings`, `attribution`. Vehicle entries contain
`rider_id`, `stops`, `distance_meters`, `duration_seconds` (travel+wait+service),
`travel_seconds`, optional `geometry` and `geometry_warning`. Stops contain
`order_id`, `sequence`, timezone-aware `arrival`/`departure`, `demand`, `latitude`,
`longitude`. Unassigned entries contain `order_id` and an explainable `reason`.
Input order coordinates are never accepted in place of canonical stored pins.

Commit request:

```json
{"expected_version":1,"acknowledge_unverified_location":true,"allow_simulation":true}
```

List envelopes use `items`, `total`, `page`, `page_size`. Plan preview expiry is
15 minutes by default. Stale plans cannot be committed; create a fresh preview.
Plan listing is read-only and does not refresh provider data.

Errors preserve `{"error":{"code":"...","message":"...","details":[]}}`.
Important statuses: 401/403 access; 404 missing records; 409 version/stale/
incomplete-active-stop/departed-route conflict; 422 invalid coordinates, limits,
simulation acknowledgement, unsupported mode or no route; 429 actor/provider
rate limit; 502 malformed provider data; 503 disabled/missing key/provider
failure; 504 timeout. No provider body or secret is returned. Budget defaults to
10 expensive requests per actor per minute and persists across restart.

The MTT planner invokes the real local adapter, for example:

```javascript
const plan = await store.previewPlan(request); // Uses server-side credential boundary
// Render result. Preview does not assign anything.
await store.commitPlan(plan, {
  acknowledge_unverified_location: true,
  allow_simulation: plan.result.quality === 'SIMULATED'
}); // Explicit dispatcher action only
```

No new public paid-routing proxy, raw provider-key field or automatic assignment
endpoint was added. Replan means POST a new optimization preview from current
records, review it and commit separately.

## Phase 32: bounded ORS road matrices

Endpoint names remain unchanged. Live ORS calculate/matrix/optimize bodies require
additive `request_id` (UUID) and literal boolean `authorize_external_request: true`.
Offline requests do not require them. The configured server ORS budget defaults
to zero; no request occurs on page load. One preview performs one matrix request,
with no extra Directions requests for geometry. The default cap is 16 matrix cells
(one origin plus three deliveries); provider status reports the effective stop cap.

RoadMatrix adds profile, source/destination indices, unreachable-pair errors and
`observation`. OptimizationResult adds `matrix_observation` and `travel_profile`.
`quality` retains its original SIMULATED/ROAD_STATIC enum for compatibility.
`ORS_MOCK_MATRIX` is test transport data; `ORS_ROAD_MATRIX` is reserved for a valid
actual ORS response. Costs may be asymmetric and null pairs are unreachable.
No ORS matrix includes route geometry. Never display invented road polylines.

```javascript
const plan = await store.previewPlan({
  ...reviewedPlanRequest,
  allow_simulation: false,
  request_id: crypto.randomUUID(),
  authorize_external_request: true
}); // Only after owner approval and server-side key/quota configuration.
```

Keep the same UUID when observing/retrying an uncertain request: duplicate attempts
return 409 rather than consume another HTTP request. Quota exhaustion returns 429;
missing consent/invalid limits 422; disabled or missing credentials 503. Provider
timeouts and malformed responses preserve existing sanitized 504/502 errors.
Failed provider calls consume the locally reserved authorization. No automatic retry
or simulation fallback occurs. Details: [Phase 32](PHASE32_FINAL_GOOGLE_ORS_INTEGRATION.md).

Google Demo routing remains separate: use `/api/routes/google-demo` and its own
explicit consent/budget. A configured Google provider on the general calculate,
matrix or optimize endpoints returns 422 `GOOGLE_DEMO_SINGLE_ROUTE_ONLY`; it cannot
bypass the single-route Demo quota or implicitly activate Compute Route Matrix.
