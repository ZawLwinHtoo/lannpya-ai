"""Browser key handling uses dummy values and owned temporary files only."""

import os
import subprocess
import warnings

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.config import Settings
from app.routing import browser_credentials as keys
from app.routing.base import RoutingFailure
from tools import google_browser_map as cli
from tools.backend_test_dashboard import server

DUMMY = "fictional-browser-test-credential-123456"


@pytest.fixture
def private(tmp_path, monkeypatch):
    target = tmp_path / ".env.google-browser.local"
    monkeypatch.setattr(keys, "PRIVATE_ENV", target)
    monkeypatch.delenv("LANNPYA_GOOGLE_MAPS_BROWSER_KEY", raising=False)
    monkeypatch.delenv("LANNPYA_GOOGLE_MAPS_BROWSER_RESTRICTIONS_CONFIRMED", raising=False)
    monkeypatch.setattr(keys, "google_server_key_for", lambda _: None)
    monkeypatch.setattr(keys, "load_ors_key", lambda _: None)
    monkeypatch.setattr(server, "google_server_key_for", lambda _: None)
    monkeypatch.setattr(server, "load_ors_key", lambda _: None)
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    monkeypatch.setattr(keys.getpass, "getpass", lambda _: DUMMY)
    original = keys.subprocess.run

    def run(args, **kwargs):
        if args[0] == "git":
            return subprocess.CompletedProcess(args, 0)
        return original(args, **kwargs)

    monkeypatch.setattr(keys.subprocess, "run", run)
    return target


def settings():
    return Settings(_env_file=None)


def test_secure_native_storage_and_no_output(private, capsys):
    keys.store_browser_key(settings())
    assert private.read_text().splitlines()[-1] == "LANNPYA_GOOGLE_MAPS_BROWSER_KEY=" + DUMMY
    assert keys.load_browser_key(settings()).get_secret_value() == DUMMY
    assert capsys.readouterr() == ("", "")
    assert not list(private.parent.glob("*.tmp"))
    if os.name == "nt":
        exe = os.path.join(os.environ["SystemRoot"], "System32", "icacls.exe")
        acl = subprocess.run([exe, str(private)], capture_output=True, text=True, check=True)
        assert "(I)" not in acl.stdout
    else:
        assert private.stat().st_mode & 0o777 == 0o600


def test_cli_store_and_status_do_not_expose_dummy_or_enable_requests(private, monkeypatch, capsys):
    monkeypatch.setenv("LANNPYA_GOOGLE_MAPS_BROWSER_RESTRICTIONS_CONFIRMED", "false")
    monkeypatch.setattr("sys.argv", ["google_browser_map", "--store-key"])
    assert cli.main() == 0
    monkeypatch.setattr("sys.argv", ["google_browser_map"])
    assert cli.main() == 0
    output = capsys.readouterr()
    assert DUMMY not in output.out + output.err
    assert '"browser_credential_configured": true' in output.out
    assert '"browser_restrictions_confirmed": false' in output.out
    assert '"http_requests_sent": 0' in output.out
    assert not settings().routing_external_requests_enabled
    assert settings().google_demo_max_requests == settings().ors_max_requests == 0
    assert "RESTRICTIONS_CONFIRMED" not in private.read_text()


@pytest.mark.parametrize("value", ["", "short", "a" * 201, DUMMY + "\nBAD=true", "has spaces"])
def test_invalid_input_is_never_written(private, monkeypatch, value):
    monkeypatch.setattr(keys.getpass, "getpass", lambda _: value)
    with pytest.raises(RoutingFailure, match="INVALID_BROWSER_KEY_FORMAT"):
        keys.store_browser_key(settings())
    assert not private.exists()


@pytest.mark.parametrize("reason", ["redirected", "echo", "unignored"])
def test_unsafe_terminal_and_git_states_fail_closed(private, monkeypatch, reason):
    if reason == "redirected":
        monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    elif reason == "echo":

        def no_hidden(_):
            warnings.warn("Cannot hide input", keys.getpass.GetPassWarning)

        monkeypatch.setattr(keys.getpass, "getpass", no_hidden)
    else:
        monkeypatch.setattr(
            keys.subprocess, "run", lambda *a, **kw: subprocess.CompletedProcess(a, 1)
        )
    with pytest.raises(RoutingFailure):
        keys.store_browser_key(settings())
    assert not private.exists()


@pytest.mark.parametrize("source", ["google", "ors", "lookup-failed"])
def test_private_server_credential_cannot_be_stored_as_browser_key(private, monkeypatch, source):
    if source == "lookup-failed":

        def unavailable(_):
            raise RoutingFailure("ORS_KEY_UNAVAILABLE")

        monkeypatch.setattr(keys, "load_ors_key", unavailable)
    else:
        function = "google_server_key_for" if source == "google" else "load_ors_key"
        monkeypatch.setattr(keys, function, lambda _: SecretStr(DUMMY))
    with pytest.raises(RoutingFailure):
        keys.store_browser_key(settings())
    assert not private.exists()


@pytest.mark.parametrize("failure", ["permissions", "replace"])
def test_failed_replacement_preserves_previous_dummy(private, monkeypatch, failure):
    old = "LANNPYA_GOOGLE_MAPS_BROWSER_KEY=old-fictional-browser-key\n"
    private.write_text(old)
    if failure == "permissions":

        def denied(_):
            raise RoutingFailure("ORS_PRIVATE_FILE_PERMISSIONS_FAILED")

        monkeypatch.setattr(keys, "restrict_file", denied)
    else:
        monkeypatch.setattr(keys.os, "replace", lambda *a: (_ for _ in ()).throw(OSError("denied")))
    with pytest.raises(RoutingFailure):
        keys.store_browser_key(settings())
    assert private.read_text() == old
    assert not list(private.parent.glob("*.tmp"))


def test_loader_precedence_bounds_and_no_interpolation(private, monkeypatch):
    private.write_text("LANNPYA_GOOGLE_MAPS_BROWSER_KEY=${UNEXPANDED}")
    monkeypatch.setenv("UNEXPANDED", "must-not-be-used")
    assert keys.load_browser_key(settings()).get_secret_value() == "${UNEXPANDED}"
    assert "UNEXPANDED" not in repr(keys.load_browser_key(settings()))
    native = Settings(_env_file=None, google_maps_browser_key=DUMMY)
    assert keys.load_browser_key(native).get_secret_value() == DUMMY
    private.write_text("a" * 4097)
    with pytest.raises(RoutingFailure, match="BROWSER_PRIVATE_ENV_INVALID"):
        keys.load_browser_key(settings())


@pytest.mark.parametrize("confirmed", [False, True])
def test_private_browser_file_is_published_only_after_restriction_confirmation(
    private, monkeypatch, confirmed
):
    keys.store_browser_key(settings())
    monkeypatch.setenv("LANNPYA_GOOGLE_MAPS_BROWSER_RESTRICTIONS_CONFIRMED", str(confirmed))
    with TestClient(
        server.create_dashboard(), base_url="http://127.0.0.1:8765", client=("127.0.0.1", 55000)
    ) as client:
        response = client.get("/maps-config.js")
        assert response.status_code == 200
        assert (DUMMY in response.text) == confirmed
        assert '"buyerPinProvider": "google"' in response.text
        assert '"pinProvider"' not in response.text  # Other maps retain their provider.
        assert "no-store" in response.headers["cache-control"]
        assert response.headers["referrer-policy"] == (
            "strict-origin-when-cross-origin" if confirmed else "no-referrer"
        )
