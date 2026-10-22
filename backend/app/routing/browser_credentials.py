"""Separate browser-purpose credential. Storage never enables external requests."""

import getpass
import os
import re
import subprocess
import sys
import tempfile
import warnings
from pathlib import Path

from dotenv import dotenv_values
from pydantic import SecretStr

from app.routing.base import RoutingFailure
from app.routing.credentials import ROOT, load_ors_key, restrict_file
from app.services.google_estimates import key_for as google_server_key_for

PRIVATE_ENV = ROOT / "backend/.env.google-browser.local"


def load_browser_key(settings):
    value = settings.google_maps_browser_key
    if value and value.strip():
        return SecretStr(value.strip())
    try:
        if not PRIVATE_ENV.is_file():
            return None
        if PRIVATE_ENV.stat().st_size > 4096:
            raise RoutingFailure("BROWSER_PRIVATE_ENV_INVALID")
        values = dotenv_values(PRIVATE_ENV, interpolate=False)
        value = values.get("LANNPYA_GOOGLE_MAPS_BROWSER_KEY")
        return SecretStr(value.strip()) if value and value.strip() else None
    except OSError:
        raise RoutingFailure("BROWSER_KEY_UNAVAILABLE") from None


def require_separate_browser_key(value, settings):
    # A public browser credential must never contain a known private routing credential.
    private = (google_server_key_for(settings), load_ors_key(settings))
    if any(
        k and k.get_secret_value().strip() and k.get_secret_value().strip() in value
        for k in private
    ):
        raise RoutingFailure("SEPARATE_BROWSER_CREDENTIAL_REQUIRED")


def store_browser_key(settings):
    if not sys.stdin.isatty():
        raise RoutingFailure("MASKED_INTERACTIVE_TERMINAL_REQUIRED")
    ignored = subprocess.run(
        ["git", "check-ignore", "--quiet", str(PRIVATE_ENV)],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    if ignored.returncode != 0:
        raise RoutingFailure("PRIVATE_ENV_MUST_BE_GIT_IGNORED")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", getpass.GetPassWarning)
            value = getpass.getpass("Separate Google Maps browser credential (hidden): ")
    except (getpass.GetPassWarning, EOFError):
        raise RoutingFailure("HIDDEN_INPUT_UNAVAILABLE") from None
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,200}", value):
        raise RoutingFailure("INVALID_BROWSER_KEY_FORMAT")
    require_separate_browser_key(value, settings)
    descriptor = None
    temporary = None
    try:
        descriptor, name = tempfile.mkstemp(
            prefix=".env.google-browser.local.", suffix=".tmp", dir=PRIVATE_ENV.parent
        )
        temporary = Path(name)
        try:
            restrict_file(temporary)  # Windows ACL / POSIX 0600 BEFORE writing the credential.
        except RoutingFailure:
            raise RoutingFailure("BROWSER_PRIVATE_FILE_PERMISSIONS_FAILED") from None
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
            descriptor = None
            stream.write(
                "# Browser-purpose credential; restrict Websites and Maps JavaScript API.\n"
            )
            stream.write("# Storage does not confirm restrictions or enable any live requests.\n")
            stream.write("LANNPYA_GOOGLE_MAPS_BROWSER_KEY=" + value + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, PRIVATE_ENV)
    except OSError:
        raise RoutingFailure("BROWSER_PRIVATE_ENV_WRITE_FAILED") from None
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if temporary is not None:
            temporary.unlink(missing_ok=True)
