"""Hidden entry and secure files tested only with synthetic credentials and owned temp files."""

import os
import subprocess
import warnings

import pytest
from pydantic import SecretStr

from app.core.config import Settings
from app.routing import credentials as keys
from app.routing.base import RoutingFailure
from tools import ors_matrix_probe as cli

DUMMY = "dummy-ors-key-for-automated-tests-123456"


@pytest.fixture
def private(tmp_path, monkeypatch):
    target = tmp_path / ".env.ors.local"
    monkeypatch.setattr(keys, "PRIVATE_ENV", target)
    monkeypatch.delenv("LANNPYA_ORS_API_KEY", raising=False)
    monkeypatch.delenv("ORS_API_KEY", raising=False)
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    monkeypatch.setattr(keys.getpass, "getpass", lambda prompt: DUMMY)
    original = keys.subprocess.run

    def run(args, **kwargs):
        if args[0] == "git":
            return subprocess.CompletedProcess(args, 0)
        return original(args, **kwargs)

    monkeypatch.setattr(keys.subprocess, "run", run)
    return target


def test_hidden_storage_real_native_permissions_and_no_output(private, capsys):
    keys.store_ors_key()
    assert private.read_text().splitlines()[-1] == "ORS_API_KEY=" + DUMMY
    assert keys.load_ors_key().get_secret_value() == DUMMY
    assert capsys.readouterr() == ("", "")
    assert not list(private.parent.glob("*.tmp"))
    if os.name == "nt":
        executable = os.path.join(os.environ["SystemRoot"], "System32", "icacls.exe")
        acl = subprocess.run([executable, str(private)], capture_output=True, text=True, check=True)
        assert "(I)" not in acl.stdout  # No inherited ACEs on the replacement key file.
    else:
        assert private.stat().st_mode & 0o777 == 0o600


def test_cli_store_uses_hidden_prompt_and_does_not_enable_live_calls(private, monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["ors_matrix_probe", "--store-key"])
    assert cli.main() == 0
    captured = capsys.readouterr()
    assert DUMMY not in captured.out + captured.err
    assert "Live requests and budgets remain unchanged" in captured.out
    assert "ENABLED" not in private.read_text()
    settings = Settings(_env_file=None)
    assert not settings.routing_external_requests_enabled
    assert settings.ors_max_requests == settings.google_demo_max_requests == 0


@pytest.mark.parametrize(
    "value", ["", "short", "a" * 5000, DUMMY + "\nBAD=true", "invalid key with spaces"]
)
def test_invalid_values_never_create_file(private, monkeypatch, value):
    monkeypatch.setattr(keys.getpass, "getpass", lambda _: value)
    with pytest.raises(RoutingFailure, match="INVALID_ORS_KEY"):
        keys.store_ors_key()
    assert not private.exists()


def test_redirected_input_is_rejected_before_prompt(private, monkeypatch):
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    monkeypatch.setattr(keys.getpass, "getpass", lambda _: pytest.fail("Prompt must not run"))
    with pytest.raises(RoutingFailure, match="INTERACTIVE_TERMINAL"):
        keys.store_ors_key()


def test_echo_fallback_is_forbidden(private, monkeypatch):
    def no_hidden_terminal(_):
        warnings.warn("Cannot hide input", keys.getpass.GetPassWarning)

    monkeypatch.setattr(keys.getpass, "getpass", no_hidden_terminal)
    with pytest.raises(RoutingFailure, match="HIDDEN_INPUT_UNAVAILABLE"):
        keys.store_ors_key()
    assert not private.exists()


def test_unignored_file_is_rejected_before_prompt(private, monkeypatch):
    monkeypatch.setattr(keys.subprocess, "run", lambda *a, **kw: subprocess.CompletedProcess(a, 1))
    monkeypatch.setattr(keys.getpass, "getpass", lambda _: pytest.fail("Prompt must not run"))
    with pytest.raises(RoutingFailure, match="GIT_IGNORED"):
        keys.store_ors_key()


def test_permission_failure_does_not_write_or_replace_existing_key(private, monkeypatch):
    private.write_text("ORS_API_KEY=previous-dummy-value\n")

    def denied(_):
        raise RoutingFailure("ORS_PRIVATE_FILE_PERMISSIONS_FAILED")

    monkeypatch.setattr(keys, "restrict_file", denied)
    with pytest.raises(RoutingFailure, match="PERMISSIONS_FAILED"):
        keys.store_ors_key()
    assert private.read_text() == "ORS_API_KEY=previous-dummy-value\n"
    assert not list(private.parent.glob("*.tmp"))


def test_replace_failure_retains_existing_dummy(private, monkeypatch):
    private.write_text("ORS_API_KEY=previous-dummy-value\n")
    monkeypatch.setattr(keys.os, "replace", lambda *a: (_ for _ in ()).throw(OSError("denied")))
    with pytest.raises(RoutingFailure, match="WRITE_FAILED"):
        keys.store_ors_key()
    assert private.read_text() == "ORS_API_KEY=previous-dummy-value\n"
    assert not list(private.parent.glob("*.tmp"))


def test_key_precedence_and_secret_wrapper(private, monkeypatch):
    private.write_text("ORS_API_KEY=" + DUMMY)
    assert isinstance(keys.load_ors_key(), SecretStr)
    monkeypatch.setenv("ORS_API_KEY", "dummy-environment-key")
    assert keys.load_ors_key().get_secret_value() == "dummy-environment-key"
    monkeypatch.setenv("LANNPYA_ORS_API_KEY", "dummy-native-key")
    assert keys.load_ors_key().get_secret_value() == "dummy-native-key"
    s = Settings(_env_file=None, ors_api_key="dummy-settings-key")
    assert keys.load_ors_key(s).get_secret_value() == "dummy-settings-key"
    assert DUMMY not in repr(keys.load_ors_key())


def test_key_file_does_not_interpolate_environment(private, monkeypatch):
    monkeypatch.setenv("SECRET_VARIABLE", "must-not-be-expanded")
    private.write_text("ORS_API_KEY=${SECRET_VARIABLE}")
    assert keys.load_ors_key().get_secret_value() == "${SECRET_VARIABLE}"


def test_default_plan_uses_new_endpoint_and_never_opens_http(private, monkeypatch, capsys):
    import httpx2 as httpx

    monkeypatch.setattr(
        httpx.Client, "stream", lambda *a, **k: pytest.fail("No live HTTP permitted")
    )
    monkeypatch.setattr("sys.argv", ["ors_matrix_probe"])
    assert cli.main() == 0
    output = capsys.readouterr().out
    assert "https://api.heigit.org/openrouteservice/v2/matrix/driving-car" in output
    assert '"matrix_elements": 16' in output and '"http_requests_sent": 0' in output
