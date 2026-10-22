"""Hidden server-only Geocoding v4 key setup/status. Never sends HTTP requests."""

import argparse
import getpass
import json
import os
import re
import subprocess
import sys
import tempfile
import warnings
from pathlib import Path

from pydantic import SecretStr, ValidationError

from app.core.config import Settings
from app.routing.base import RoutingFailure
from app.routing.credentials import restrict_file
from app.services.buyer_geocoding import PRIVATE_ENV, load_key, reject_browser_key


def store(settings):
    if not sys.stdin.isatty():
        raise ValueError("Interactive terminal required")
    if (
        subprocess.run(
            ["git", "check-ignore", "--quiet", str(PRIVATE_ENV)], capture_output=True, check=False
        ).returncode
        != 0
    ):
        raise ValueError("Private credential file must be ignored")
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        value = getpass.getpass("Dedicated server Google Geocoding v4 key (hidden): ")
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,200}", value):
        raise ValueError("Invalid key format")
    reject_browser_key(SecretStr(value), settings)
    fd, name = tempfile.mkstemp(
        prefix=".env.google-geocoding.local.", suffix=".tmp", dir=PRIVATE_ENV.parent
    )
    temporary = Path(name)
    try:
        restrict_file(temporary)
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            fd = None
            stream.write("# Dedicated server-only Geocoding key. Storage never enables requests.\n")
            stream.write("LANNPYA_GOOGLE_GEOCODING_API_KEY=" + value + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, PRIVATE_ENV)
    finally:
        if fd is not None:
            os.close(fd)
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--store-key", action="store_true")
    args = parser.parse_args()
    try:
        settings = Settings()
        if args.store_key:
            store(settings)
            print(
                "Dedicated geocoding key stored privately. Permissions and live requests unchanged."
            )
        else:
            key = load_key(settings)
            separate = None
            if key:
                try:
                    reject_browser_key(key, settings)
                    separate = True
                except ValueError:
                    separate = False
            print(
                json.dumps(
                    {
                        "configured_api_version": "v4",
                        "project_version_access": "UNVERIFIED_WITHOUT_AUTHORIZED_REQUEST",
                        "dedicated_server_key_configured": bool(key),
                        "distinct_from_browser_key": separate,
                        "permissions_confirmed": settings.google_geocoding_permissions_confirmed,
                        "external_requests_enabled": (
                            settings.google_geocoding_external_requests_enabled
                        ),
                        "maximum_requests": settings.google_geocoding_max_requests,
                        "reserved_requests": sum(
                            (settings.google_geocoding_budget_directory / f"slot-{i}.json").exists()
                            for i in range(10)
                        ),
                        "http_requests_sent": 0,
                    },
                    indent=2,
                )
            )
        return 0
    except (
        ValueError,
        ValidationError,
        OSError,
        RoutingFailure,
        EOFError,
        KeyboardInterrupt,
        getpass.GetPassWarning,
    ):
        print(
            json.dumps({"error": "GEOCODING_KEY_SETUP_FAILED", "http_requests_sent": 0}),
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
