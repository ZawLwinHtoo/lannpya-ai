"""Synthetic v4 response; no real addresses, credentials or external HTTP."""

import json
import logging
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import unquote

import httpx2 as httpx
import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.schemas.buyer import BuyerGeocodingResult
from app.services import buyer_geocoding as geo
from tools import google_geocoding as cli

DUMMY = "fictional-server-geocoding-credential"
PUBLIC = "fictional-browser-geocoding-fixture"
RECORDING = Path(__file__).parent / "fixtures/geocoding/google_yangon_v4.json"
ADDRESS = {
    "status": "NEEDS_REVIEW",
    "township": "Hlaing",
    "street": "Synthetic street",
    "landmark": "Test gate",
    "floor": "Floor 3",
}


def configured(tmp_path, **overrides):
    return Settings(
        _env_file=None,
        **{
            "environment": "test",
            "google_geocoding_api_key": DUMMY,
            "google_geocoding_permissions_confirmed": True,
            "google_geocoding_external_requests_enabled": True,
            "google_geocoding_max_requests": 10,
            "google_geocoding_budget_directory": tmp_path / "budget",
            "google_maps_browser_key": PUBLIC,
            "google_maps_browser_restrictions_confirmed": True,
            **overrides,
        },
    )


def provider(tmp_path, body=None, status=200, **overrides):
    calls = []

    def handle(request):
        calls.append(request)
        return httpx.Response(
            status, json=body if body is not None else json.loads(RECORDING.read_text())
        )

    instance = geo.BuyerGeocoder(
        configured(tmp_path, **overrides), transport=httpx.MockTransport(handle)
    )
    return instance, calls


@pytest.mark.parametrize(
    "changes,expected",
    [
        ({"google_geocoding_external_requests_enabled": False}, "DISABLED"),
        ({"google_geocoding_permissions_confirmed": False}, "DISABLED"),
        ({"google_geocoding_max_requests": 0}, "DISABLED"),
        ({"google_maps_browser_restrictions_confirmed": False}, "MAP_CONFIGURATION_REQUIRED"),
        ({"google_geocoding_api_key": PUBLIC}, "BROWSER_KEY_REJECTED"),
        ({"environment": "production"}, "DISABLED"),
    ],
)
def test_default_and_credential_authorization_gates(tmp_path, changes, expected):
    p, calls = provider(tmp_path, **changes)
    assert p.suggest(ADDRESS, "buyer-link")["status"] == expected
    assert not calls


@pytest.mark.parametrize(
    "changes,expected",
    [
        ({"latitude": "0", "longitude": "0"}, "STORED_COORDINATES"),
        ({"latitude": "16.8", "longitude": "96.1"}, "STORED_COORDINATES"),
        ({"pending_location": {"latitude": 16.8}}, "PENDING_REVIEW"),
        ({"status": "DELIVERED"}, "NOT_EDITABLE"),
        ({"status": "ASSIGNED"}, "NOT_EDITABLE"),
        ({"street": None, "landmark": None}, "INCOMPLETE_ADDRESS"),
        ({"street": "x" * 5000}, "INCOMPLETE_ADDRESS"),
    ],
)
def test_existing_coordinates_and_ineligible_addresses_never_call(tmp_path, changes, expected):
    p, calls = provider(tmp_path)
    assert p.suggest({**ADDRESS, **changes}, "buyer-link")["status"] == expected
    assert not calls


def test_v4_request_privacy_cache_concurrency_and_scope(tmp_path, caplog):
    p, calls = provider(tmp_path)
    caplog.set_level(logging.DEBUG)
    address = {
        **ADDRESS,
        "street": "Synthetic street 09790000000",
        "customer_name": "Do not send name",
        "floor": "Do not send floor",
        "unit": "Do not send room",
    }
    with ThreadPoolExecutor(max_workers=6) as pool:
        rows = list(pool.map(lambda _: p.suggest(address, "buyer-link"), range(6)))
    assert len(calls) == 1
    request = calls[0]
    assert request.method == "GET" and request.url.host == "geocode.googleapis.com"
    assert request.url.path.startswith("/v4/geocode/address/")
    assert request.headers["X-Goog-Api-Key"] == DUMMY
    assert "location" in request.headers["X-Goog-FieldMask"]
    query = unquote(str(request.url))
    for private in ("09790000000", "Do not send", DUMMY):
        assert private not in query and private not in caplog.text
    assert "Synthetic street" not in caplog.text
    assert sum(row["cache_hit"] for row in rows) == 5
    assert all(
        BuyerGeocodingResult.model_validate(row).suggestion.requires_confirmation for row in rows
    )
    assert rows[0]["observation"] == "GOOGLE_MOCK"
    rows[0]["suggestion"]["latitude"] = 0
    assert p.suggest(address, "buyer-link")["suggestion"]["latitude"] != 0
    assert p.suggest(address, "another-link")["status"] == "SUGGESTION"
    assert len(calls) == 2  # Cache is not shared across buyer links.


def test_cache_expiry_and_address_change(tmp_path):
    p, calls = provider(tmp_path)
    now = [1700000000.0]
    p.clock = lambda: now[0]
    first = p.suggest(ADDRESS, "buyer")
    assert p.suggest({**ADDRESS, "floor": "Changed floor"}, "buyer")["cache_hit"]
    assert p.suggest({**ADDRESS, "street": "Changed street"}, "buyer")["status"] == "SUGGESTION"
    now[0] += 901
    second = p.suggest(ADDRESS, "buyer")
    assert (
        not second["cache_hit"]
        and second["suggestion"]["expires_at"] > first["suggestion"]["expires_at"]
    )
    assert len(calls) == 3


@pytest.mark.parametrize(
    "status,expected",
    [
        (403, "CREDENTIAL_OR_PERMISSION_DENIED"),
        (429, "RATE_LIMITED"),
        (500, "PROVIDER_UNAVAILABLE"),
        (302, "PROVIDER_UNAVAILABLE"),
    ],
)
def test_http_failure_has_no_retries_or_provider_body_leak(tmp_path, status, expected):
    p, calls = provider(tmp_path, body={"error": {"message": DUMMY}}, status=status)
    value = p.suggest(ADDRESS, "buyer")
    assert value["status"] == expected and DUMMY not in json.dumps(value)
    assert p.suggest(ADDRESS, "buyer")["cache_hit"]
    assert len(calls) == 1


@pytest.mark.parametrize(
    "change,expected",
    [
        ({"granularity": "APPROXIMATE", "types": ["locality"]}, "AMBIGUOUS"),
        ({"granularity": "GEOMETRIC_CENTER"}, "AMBIGUOUS"),
        ({"partialMatch": True}, "AMBIGUOUS"),
        ({"addressComponents": [{"shortText": "US", "types": ["country"]}]}, "AMBIGUOUS"),
        ({"location": {"latitude": 91, "longitude": 96.1}}, "INVALID_RESPONSE"),
        ({"location": {"latitude": True, "longitude": 96.1}}, "INVALID_RESPONSE"),
        ({"location": {"latitude": "16.8", "longitude": 96.1}}, "INVALID_RESPONSE"),
        ({"types": {}}, "INVALID_RESPONSE"),
    ],
)
def test_imprecise_or_malformed_results_never_create_pin(tmp_path, change, expected):
    body = json.loads(RECORDING.read_text())
    body["results"][0].update(change)
    p, _ = provider(tmp_path, body=body)
    value = p.suggest(ADDRESS, "buyer")
    assert value["status"] == expected and value["suggestion"] is None


@pytest.mark.parametrize(
    "body,expected",
    [
        ({}, "INVALID_RESPONSE"),
        ({"results": []}, "NO_RESULT"),
        ({"results": [None]}, "INVALID_RESPONSE"),
        ({"results": [{}, {}]}, "AMBIGUOUS"),
    ],
)
def test_missing_and_ambiguous_results(tmp_path, body, expected):
    p, _ = provider(tmp_path, body=body)
    assert p.suggest(ADDRESS, "buyer")["status"] == expected


def test_durable_budget_prevents_other_process_retries(tmp_path):
    p, calls = provider(tmp_path, google_geocoding_max_requests=1)
    assert p.suggest(ADDRESS, "buyer")["status"] == "SUGGESTION"
    other, other_calls = provider(tmp_path, google_geocoding_max_requests=1)
    assert other.suggest(ADDRESS, "buyer")["status"] == "BUDGET_EXHAUSTED"
    assert len(calls) == 1 and not other_calls


@pytest.mark.parametrize(
    "content",
    [b'{"results": [], "results": []}', b'{"results": NaN}', b"x" * 65537],
    ids=["duplicate-json", "nonfinite-json", "oversized"],
)
def test_invalid_json_and_oversized_response(tmp_path, content):
    p = geo.BuyerGeocoder(
        configured(tmp_path),
        transport=httpx.MockTransport(lambda _: httpx.Response(200, content=content)),
    )
    assert p.suggest(ADDRESS, "buyer")["status"] == "INVALID_RESPONSE"


def test_timeout_is_safe_and_not_retried(tmp_path):
    calls = []

    def fail(request):
        calls.append(request)
        raise httpx.ReadTimeout(DUMMY, request=request)

    p = geo.BuyerGeocoder(configured(tmp_path), transport=httpx.MockTransport(fail))
    assert p.suggest(ADDRESS, "buyer")["status"] == "TIMEOUT"
    assert len(calls) == 1


def test_missing_server_key_never_uses_browser_credential(tmp_path, monkeypatch):
    monkeypatch.setattr(geo, "PRIVATE_ENV", tmp_path / ".env.google-geocoding.local")
    p, calls = provider(tmp_path, google_geocoding_api_key=None)
    assert p.suggest(ADDRESS, "buyer")["status"] == "CREDENTIAL_REQUIRED"
    assert not calls


def test_hidden_storage_with_dummy_server_key(tmp_path, monkeypatch, capsys):
    target = tmp_path / ".env.google-geocoding.local"
    monkeypatch.setattr(cli, "PRIVATE_ENV", target)
    monkeypatch.setattr(geo, "PRIVATE_ENV", target)
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    monkeypatch.setattr(cli.getpass, "getpass", lambda _: DUMMY)
    original = cli.subprocess.run
    monkeypatch.setattr(
        cli.subprocess,
        "run",
        lambda args, **kw: (
            subprocess.CompletedProcess(args, 0) if args[0] == "git" else original(args, **kw)
        ),
    )
    settings = configured(tmp_path, google_geocoding_api_key=None)
    cli.store(settings)
    assert geo.load_key(settings).get_secret_value() == DUMMY
    assert not capsys.readouterr().out and not list(tmp_path.glob("*.tmp"))
    monkeypatch.setattr(cli.getpass, "getpass", lambda _: PUBLIC)
    with pytest.raises(ValueError):
        cli.store(settings)
    assert geo.load_key(settings).get_secret_value() == DUMMY


def test_settings_bound_retention_and_usage():
    for values in (
        {"google_geocoding_cache_seconds": 86401},
        {"google_geocoding_max_requests": 11},
        {"google_geocoding_timeout_seconds": 100},
    ):
        with pytest.raises(ValidationError):
            Settings(_env_file=None, **values)
