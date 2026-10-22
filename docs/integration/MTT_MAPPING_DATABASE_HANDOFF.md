# Mapping data contract for the database developer

Phase 40 is based on MTT `497775b`. No database models, SQLAlchemy session code,
Alembic files, driver declarations or database developer tools are changed.
No hosted database is accessed. MTT's existing PostgreSQL URL aliases, JSONB
variant, pooling and migration history remain authoritative.

## Existing storage reused

| Storage | Mapping responsibility |
| --- | --- |
| `orders` | Paired nullable latitude/longitude, current field provenance, status/version, buyer-approved instructions and time windows |
| Buyer request/reference/session tables | Submitted coordinates and request decision, trusted reference, authorization and replay handling |
| `routing_plans` | Dispatcher actor, optimistic version, PREVIEW/COMMITTED, UTC creation timestamp, `data` JSON/JSONB |
| `delivery_assignments` | Rider/order relationship, unique active assignment per order, stop sequence and assignment lifecycle |
| `rider_profiles` | Availability and queue version used in route basis snapshots |
| `delivery_events` | Buyer review, assignment, departure/completion/failure audit events |
| `routing_rate_limits` | Existing protected API operation rate limits |

## Additive route JSON fields

The existing `data.query` now optionally contains `request_id` (UUID string) and
`authorize_external_request` (boolean, default false). They record intent, never
credentials. Existing `basis`, `routes`, snapshots, commit handling and version
checks are unchanged. No new indexed column or migration is required.

`data.result` adds optional `matrix_observation` and `travel_profile` strings.
Examples: `SIMULATED`, `ORS_MOCK_MATRIX` (recorded/mock transport),
`ORS_ROAD_MATRIX` (actual provider transport), and `driving-car`. Vehicle results
also expose load and capacity. Old persisted plans still deserialize through
defaults when these fields are absent. `quality` remains SIMULATED or ROAD_STATIC;
none of these values implies live traffic or independently verified customer GPS.

The normalized matrix response adds source/destination indices, unreachable-pair
metadata, profile and observation. Costs are nonnegative integer metres/seconds
(provider fractions rounded upward); asymmetric cells remain asymmetric. Null
distance and duration together mean unreachable. The raw road matrix is used by
the solver, not added as a new database table.

## Transaction and privacy boundaries

Preview persists a PREVIEW record without assigning orders. Commit rechecks
versions, rider availability and queue snapshots; it writes assignments/order
changes/events atomically. Repeated/stale commits retain existing protections.
Completed stops and assignment history remain under the existing lifecycle.
Buyer-selected pins are subject to existing dispatcher review and never imply GREEN.

ORS consent/deduplication budgets are local filesystem records with UUID and
reservation state only. They contain no key, coordinates or provider response,
and survive SQLite reset/restart. They are a development guard, not a distributed
production quota system. Multi-instance production deployment needs a coordinated
quota store and real role-based authentication; that work is outside this port.

Credentials remain in ignored server-local files or backend environment variables.
Browser Maps credentials are separately restricted, deliberately client-visible
only after restriction confirmation. No credential belongs in route JSON/events.

## Verification handoff

The port exercises fresh isolated SQLite migrations, route preview/commit/reopen,
buyer review, rider sequencing and PostgreSQL dialect compilation through MTT's
existing tests. This does not establish a new live PostgreSQL/Supabase result.
See `MTT_MAPPING_PORT_REPORT.md` for observed totals and limitations.
