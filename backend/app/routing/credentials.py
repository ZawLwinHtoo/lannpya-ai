"""ORS server credentials. Never log values; storing a key does not authorize HTTP."""

import csv
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

ROOT = Path(__file__).resolve().parents[3]
PRIVATE_ENV = ROOT / "backend/.env.ors.local"


def load_ors_key(settings=None):
    configured = settings.ors_api_key if settings is not None else None
    if configured and configured.get_secret_value().strip():
        return SecretStr(configured.get_secret_value().strip())
    for name in ("LANNPYA_ORS_API_KEY", "ORS_API_KEY"):
        value = os.environ.get(name)
        if value and value.strip():
            return SecretStr(value.strip())
    try:
        if not PRIVATE_ENV.is_file():
            return None
        if PRIVATE_ENV.stat().st_size > 16384:
            raise RoutingFailure("ORS_PRIVATE_ENV_INVALID")
        values = dotenv_values(PRIVATE_ENV, interpolate=False)
        value = values.get("ORS_API_KEY") or values.get("LANNPYA_ORS_API_KEY")
        return SecretStr(value.strip()) if value and value.strip() else None
    except OSError:
        raise RoutingFailure("ORS_KEY_UNAVAILABLE") from None


def restrict_file(path):
    if os.name != "nt":
        os.chmod(path, 0o600)
        return
    # Apply Windows ACLs BEFORE writing the secret. No secret is passed to a subprocess.
    system32 = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32"
    identity = subprocess.run(
        [str(system32 / "whoami.exe"), "/user", "/fo", "csv", "/nh"],
        capture_output=True,
        text=True,
        check=False,
    )
    try:
        sid = next(csv.reader(identity.stdout.splitlines()))[1]
    except (StopIteration, IndexError):
        raise RoutingFailure("ORS_PRIVATE_FILE_PERMISSIONS_FAILED") from None
    if identity.returncode != 0 or not re.fullmatch(r"S-\d+(?:-\d+)+", sid):
        raise RoutingFailure("ORS_PRIVATE_FILE_PERMISSIONS_FAILED")
    secured = subprocess.run(
        [
            str(system32 / "icacls.exe"),
            str(path),
            "/inheritance:r",
            "/grant:r",
            f"*{sid}:(F)",
            "*S-1-5-18:(F)",
            "*S-1-5-32-544:(F)",
        ],
        capture_output=True,
        check=False,
    )
    if secured.returncode != 0:
        raise RoutingFailure("ORS_PRIVATE_FILE_PERMISSIONS_FAILED")


def store_ors_key():
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
            value = getpass.getpass("HeiGIT ORS API key (hidden): ")
    except (getpass.GetPassWarning, EOFError):
        raise RoutingFailure("HIDDEN_INPUT_UNAVAILABLE") from None
    if not re.fullmatch(r"[A-Za-z0-9._~+/=-]{16,4096}", value):
        raise RoutingFailure("INVALID_ORS_KEY_FORMAT")
    temporary = None
    descriptor = None
    try:
        descriptor, name = tempfile.mkstemp(
            prefix=".env.ors.local.", suffix=".tmp", dir=PRIVATE_ENV.parent
        )
        temporary = Path(name)
        restrict_file(temporary)
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
            descriptor = None
            stream.write("# Private server-only ORS credential. No live requests enabled.\n")
            stream.write("ORS_API_KEY=" + value + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, PRIVATE_ENV)
    except OSError:
        raise RoutingFailure("ORS_PRIVATE_ENV_WRITE_FAILED") from None
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if temporary is not None:
            temporary.unlink(missing_ok=True)
