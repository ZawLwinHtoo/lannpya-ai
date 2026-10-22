"""Print one proposed fictional Yangon matrix evaluation. This tool never sends HTTP."""

import argparse
import json
import sys

from app.core.config import Settings
from app.routing.base import RoutingFailure
from app.routing.credentials import load_ors_key, store_ors_key
from app.routing.endpoints import ORS_MATRIX
from app.routing.ors import budget_status

POINTS = [
    [96.130, 16.825],  # Fictional test hub, not a customer home.
    [96.125, 16.815],
    [96.142, 16.810],
    [96.153, 16.800],
]


def plan(settings=None):
    settings = settings or Settings(_env_file=None)
    return {
        "status": "PLAN_ONLY_AUTHORIZATION_REQUIRED",
        "notice": "FICTIONAL TEST COORDINATES; not verified doorstep locations",
        "credential_configured": bool(load_ors_key(settings)),
        "method": "POST",
        "endpoint": ORS_MATRIX,
        "proposed_requests": 1,
        "matrix_shape": [4, 4],
        "matrix_elements": 16,
        "http_requests_sent": 0,
        "google_requests_proposed": 0,
        "google_request_budget": settings.google_demo_max_requests,
        "request_timeout_seconds": settings.routing_request_timeout_seconds,
        "retries": 0,
        "body": {"locations": POINTS, "metrics": ["distance", "duration"], "units": "m"},
        "server_budget": budget_status(settings),
        "requirements": [
            "Owner stores a Standard key using --store-key or a server-only ORS_API_KEY",
            "Owner verifies current plan, matrix entitlement, quota and terms in dashboard",
            "Owner explicitly authorizes exactly one 4x4 request before enabling any live gate",
            "Keep Google budget zero; no Directions, geocoding or geometry request is proposed",
        ],
        "cost": "No verified current account quota or billing status inferred from a key",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--store-key", action="store_true", help="Hidden terminal entry; no HTTP")
    args = parser.parse_args()
    try:
        if args.store_key:
            store_ors_key()
            print("ORS key stored privately. Live requests and budgets remain unchanged.")
        else:
            print(json.dumps(plan(), indent=2))
        return 0
    except RoutingFailure as exc:
        print(json.dumps({"error": exc.code, "http_requests_sent": 0}), file=sys.stderr)
        return 1
    except (OSError, KeyboardInterrupt):
        print(
            json.dumps({"error": "ORS_KEY_SETUP_FAILED", "http_requests_sent": 0}), file=sys.stderr
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
