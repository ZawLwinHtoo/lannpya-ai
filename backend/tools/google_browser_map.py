"""Hidden browser-key setup and network-free configuration check. Never loads Google SDK."""

import argparse
import json
import sys

from pydantic import ValidationError

from app.core.config import Settings
from app.routing.base import RoutingFailure
from app.routing.browser_credentials import load_browser_key, store_browser_key


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--store-key", action="store_true", help="Hidden terminal entry; no HTTP")
    args = parser.parse_args()
    try:
        settings = Settings()
        if args.store_key:
            store_browser_key(settings)
            print("Browser credential stored privately. Restrictions and live budgets unchanged.")
        else:
            print(
                json.dumps(
                    {
                        "browser_credential_configured": bool(load_browser_key(settings)),
                        "browser_restrictions_confirmed": (
                            settings.google_maps_browser_restrictions_confirmed
                        ),
                        "http_requests_sent": 0,
                        "sdk_loaded": False,
                    },
                    indent=2,
                )
            )
        return 0
    except RoutingFailure as exc:
        print(json.dumps({"error": exc.code, "http_requests_sent": 0}), file=sys.stderr)
        return 1
    except (ValidationError, OSError, KeyboardInterrupt):
        print(
            json.dumps({"error": "BROWSER_KEY_SETUP_FAILED", "http_requests_sent": 0}),
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
