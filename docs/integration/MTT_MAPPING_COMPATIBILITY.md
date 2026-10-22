# Phase 40 compatibility assessment — before porting

Fetched upstream on 2026-10-22. Product baseline: `origin/mtt` at
`497775b0de8736f25f777833a257d8427cf1fbb6`. Mapping source HEAD and
`origin/integration/lannpya-final`: `81a30d726e1a29b9914f0e8f1545ab79cabda45d`.
The source also has uncommitted Phase 32–39 work; HEAD alone does not identify
that work. Its exact files, SHA-256 hashes and patch are preserved privately in
the new worktree's ignored `.tmp/phase40/source-snapshot/`.

## Evidence and decision

`81a30d7` is an ancestor of the latest MTT. MTT already includes the original
GPS, trusted-reference validation, Google single-route budgets, offline matrix,
OR-Tools solver, route preview/commit, stale-plan checks, stop sequences and
SQLite persistence. These must not be ported again.

MTT has since changed 38 files, including substantial order forms, buyer review,
rider tabs, map views, styling, parser behavior and PostgreSQL support. All of
that stays authoritative. No whole-branch merge or historical cherry-pick is
needed. The new worktree and `feature/mtt-final-mapping-port` start directly at
the fetched MTT commit.

| Area | Existing MTT | Local addition | Port strategy |
| --- | --- | --- | --- |
| Product UI, order/buyer/rider workflows | Newer on MTT | Older source UI | Preserve MTT files byte-for-byte |
| Customer map | MTT adds riderView, hubView and viewOne | Independent Leaflet pinning, secure Google SDK loading, stop-only maps | Reconcile functions, retain all MTT exports |
| Routing UI | Shared original planner | ORS consent, budget status, matrix provenance, stop pins | Apply routing-only delta |
| Provider adapters | Original Google/ORS HTTP boundary | HeiGIT endpoint, strict asymmetric matrix validation, diagnostics, no-retry ORS budgets | Apply per-file delta and new routing modules |
| OR-Tools and route service | Mature existing implementation | Pass validated road matrix/provenance/capacity through existing solver | Small additive changes |
| Configuration | MTT adds database URL aliases | ORS limits and browser restriction confirmation | Merge new settings without replacing database settings |
| Local BFF | Same loopback/CSRF/role boundary | Separate browser key, private-key reuse rejection, origin-only referrer | Mapping-specific security changes only |
| Database | MTT's SQLAlchemy/Alembic and driver/pool changes | Additive route JSON fields | Retain models, migrations and session code; no schema migration |
| AI, authentication, merchants | Existing MTT implementations | No required change | Preserve |
| Credentials | Private ignored local files in source | Secure entry utilities | Port utilities, never copy private files |

## Dependency graph

- Buyer pin → MTT customer form → `customer-map.js` Leaflet picker → existing
  buyer authorization/location API → buyer request → dispatcher approval → order
  coordinates/provenance/events. Existing 500 m/reference rules remain server-owned.
- Google route → existing protected Google estimate service → existing secure
  server key/budget → normalized route geometry → routing UI → separately
  restricted browser credential → Google SDK renderer. Google geometry stays off Leaflet.
- ORS preview → protected routing API → settings + private credential + durable
  consent/request budget → HeiGIT matrix HTTP adapter → validated asymmetric
  matrix → existing OR-Tools solver → existing route-plan JSON → preview UI.
- Commit → existing optimistic versions/basis snapshot → existing order/rider
  assignment transaction → stop sequence/events → rider queue/navigation/plans.
- Recorded provider fixtures → mock transport in isolated tests only. No live
  provider calls are part of baseline, port verification or ordinary page loads.

## Boundaries

No Supabase setup or hosted database request. MTT already includes database
developer changes; those are preserved and tested locally. Local environments
are created separately; no source environment, secret file or database is copied.
The original mapping worktree and running manual demo remain untouched.
Verification totals and any discovered incompatibilities are recorded in the final report.
