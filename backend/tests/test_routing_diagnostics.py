"""Provider diagnostics use fictional responses and dummy credentials only."""

import json
import time
from urllib.parse import quote

import httpx2 as httpx
import pytest
from test_ors_integration import request, settings

from app.routing.base import RoutingFailure
from app.routing.diagnostics import provider_diagnostic
from app.routing.ors import ORSProvider, budget_status

DUMMY = "fictional-server-only-key"


@pytest.mark.parametrize(
    "payload,code,message",
    [
        (
            {"error": "Invalid API key or access disallowed", "code": 5002},
            5002,
            "Invalid API key or access disallowed",
        ),
        ({"error": {"code": 2010, "message": "Point unavailable"}}, 2010, "Point unavailable"),
        (
            {"error": {"code": "PERMISSION_DENIED", "message": "Access denied"}},
            "PERMISSION_DENIED",
            "Access denied",
        ),
    ],
)
def test_provider_error_shapes(payload, code, message):
    response = httpx.Response(403, json=payload)
    data = provider_diagnostic(response, time.monotonic() + 2, (DUMMY,))
    assert data == {
        "http_status": 403,
        "provider_code": code,
        "provider_message": message,
        "body_state": "JSON_FIELDS_ONLY",
    }


@pytest.mark.parametrize("status", [401, 403, 429, 500])
def test_failed_request_retains_only_redacted_diagnostics_and_never_retries(tmp_path, status):
    calls = []

    def handle(r):
        calls.append(1)
        return httpx.Response(
            status,
            json={
                "code": 5002,
                "error": f"Rejected {DUMMY}\nAuthorization: {DUMMY}\nhttps://example.test/?key={DUMMY}",
                "headers": {"Authorization": DUMMY},
                "private_payload": DUMMY,
            },
        )

    s = settings(tmp_path)
    with pytest.raises(RoutingFailure) as caught:
        ORSProvider(s, transport=httpx.MockTransport(handle)).get_route_matrix(request())
    failure = caught.value
    assert failure.provider_error["http_status"] == status
    assert failure.provider_error["provider_code"] == 5002
    assert DUMMY not in json.dumps(failure.provider_error)
    assert "Authorization" not in json.dumps(failure.provider_error)
    assert "https://" not in json.dumps(failure.provider_error)
    assert "private_payload" not in failure.provider_error
    assert str(failure) == failure.code and DUMMY not in repr(failure)
    assert len(calls) == 1 and budget_status(s)["remaining_requests"] == 0


@pytest.mark.parametrize(
    "body,state",
    [
        ("not JSON", "NON_JSON_OR_INVALID"),
        ("x" * 8193, "TOO_LARGE"),
        ('{"error":"first","error":"second"}', "NON_JSON_OR_INVALID"),
        ('["unexpected"]', "UNSUPPORTED_SHAPE"),
    ],
)
def test_unsafe_or_invalid_body_is_not_retained(body, state):
    data = provider_diagnostic(httpx.Response(403, text=body), time.monotonic() + 2)
    assert data == {"http_status": 403, "body_state": state}


def test_secret_redaction_precedes_truncation_and_limits_output():
    secret = "dummy/secret+value=1234567890"
    response = httpx.Response(
        403, json={"error": secret + " " + quote(secret, safe="") + " " + "a " * 2000}
    )
    data = provider_diagnostic(response, time.monotonic() + 2, (secret,))
    assert secret not in json.dumps(data) and quote(secret, safe="") not in json.dumps(data)
    assert len(data["provider_message"]) <= 512


@pytest.mark.parametrize(
    "code,expected", [(2009, "ROUTE_NOT_FOUND"), (2010, "ROUTING_POINT_NOT_FOUND")]
)
def test_existing_ors_bad_request_mapping_stays_compatible(tmp_path, code, expected):
    provider = ORSProvider(
        settings(tmp_path),
        transport=httpx.MockTransport(
            lambda r: httpx.Response(400, json={"error": {"code": code, "message": "Test fixture"}})
        ),
    )
    with pytest.raises(RoutingFailure) as caught:
        provider.get_route_matrix(request())
    assert caught.value.code == expected
    assert caught.value.status == 422
    assert caught.value.provider_error["provider_code"] == code
