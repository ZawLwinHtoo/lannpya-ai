"""Recorded Phase 36 road data; transport stays mocked and all SQLite data is isolated."""

import json
from pathlib import Path
from uuid import UUID, uuid4

import httpx2 as httpx
import pytest
from pydantic import SecretStr
from test_ors_integration import settings
from test_routing import query
from test_three_role_workflow import day, manual, save
from test_three_role_workflow import workspace as source_workspace

from app.db.routing_models import RoutingPlan
from app.db.session import Database
from app.routing.ors import ORSProvider

RECORDING = Path(__file__).parent / "fixtures/routing/ors_yangon_phase36.json"


@pytest.fixture
def workspace(tmp_path):
    yield from source_workspace.__wrapped__(tmp_path)


def test_recorded_road_preview_commit_queue_and_database_reopen(workspace, tmp_path):
    c, ids, db = workspace
    record = json.loads(RECORDING.read_text(encoding="utf-8"))
    orders = []
    for i, (lon, lat) in enumerate(record["locations"][1:], 1):
        orders.append(
            save(
                c["admin"].post(
                    "/api/orders",
                    json={
                        "structured": {
                            "customer_name": f"Fictional recorded D{i}",
                            "customer_phone": "09790000000",
                            "township": "Hlaing",
                            "street": "Fictional test street",
                            "cod_amount": "25000",
                            "delivery_time_window": "Any time",
                            "latitude": str(lat),
                            "longitude": str(lon),
                        },
                        "parcel": {
                            "item": "Synthetic road parcel",
                            "hub_received": True,
                            "delivery_day": day(),
                        },
                    },
                ),
                201,
            )
        )
    missing = manual(workspace, coordinates=False)
    s = c["admin"].app.state.settings
    for name, value in settings(tmp_path).model_dump().items():
        if name.startswith(("ors_", "routing_")):
            setattr(s, name, value)
    calls = []

    def response(request):
        calls.append(1)
        assert json.loads(request.content)["locations"] == record["locations"]
        return httpx.Response(200, json={k: record[k] for k in ("distances", "durations")})

    c["admin"].app.state.routing_provider_override = ORSProvider(
        s, transport=httpx.MockTransport(response)
    )
    body = query(
        orders + [missing],
        [ids["rider"]],
        allow_simulation=False,
        request_id=str(uuid4()),
        authorize_external_request=True,
    )
    body["origin"] = {"longitude": record["locations"][0][0], "latitude": record["locations"][0][1]}
    body["riders"][0]["capacity"] = 3
    assert c["rider"].post("/api/routes/optimize", json=body).status_code == 403
    assert not calls
    plan = save(c["admin"].post("/api/routes/optimize", json=body), 201)
    vehicle = plan["result"]["vehicles"][0]
    expected = [orders[i]["id"] for i in (0, 2, 1)]
    assert plan["result"]["matrix_observation"] == "ORS_MOCK_MATRIX"
    assert [s["order_id"] for s in vehicle["stops"]] == expected
    assert vehicle["travel_seconds"] == 1115 and vehicle["distance_meters"] == 11565
    assert vehicle["load"] == vehicle["capacity"] == 3
    assert plan["result"]["unassigned"] == [
        {"order_id": missing["id"], "reason": "MISSING_DELIVERY_PIN"}
    ]
    assert all(
        save(c["admin"].get("/api/orders/" + o["id"]))["status"] != "ASSIGNED" for o in orders
    )
    assert c["admin"].post("/api/routes/optimize", json=body).status_code == 409
    assert len(calls) == 1
    commit_body = {
        "expected_version": plan["version"],
        "acknowledge_unverified_location": True,
        "allow_simulation": False,
    }
    saved = save(c["admin"].post(f"/api/routes/plans/{plan['id']}/commit", json=commit_body))
    assert saved["state"] == "COMMITTED"
    again = save(c["admin"].post(f"/api/routes/plans/{plan['id']}/commit", json=commit_body))
    assert saved["routes"] == again["routes"]
    assert [
        i["order_id"] for i in save(c["rider"].get(f"/api/riders/{ids['rider']}/queue"))["items"]
    ] == expected
    db.dispose()
    reopened = Database(str(db.engine.url))
    try:
        with reopened.sessions() as session:
            persisted = session.get(RoutingPlan, UUID(plan["id"]))
            assert persisted.state == "COMMITTED"
            assert persisted.data["result"]["matrix_observation"] == "ORS_MOCK_MATRIX"
            assert [
                s["order_id"] for s in persisted.data["result"]["vehicles"][0]["stops"]
            ] == expected
    finally:
        reopened.dispose()
    assert len(calls) == 1


@pytest.mark.parametrize(
    "source", ["google-private-file", "ors-private-file", "read-failure", "embedded-private-file"]
)
def test_browser_configuration_cannot_publish_a_private_file_credential(monkeypatch, source):
    from fastapi.testclient import TestClient

    from app.routing.base import RoutingFailure
    from tools.backend_test_dashboard import server

    dummy = "fictional-private-file-routing-key"
    monkeypatch.setenv(
        "LANNPYA_GOOGLE_MAPS_BROWSER_KEY",
        "prefix-" + dummy if source == "embedded-private-file" else dummy,
    )
    monkeypatch.setenv("LANNPYA_GOOGLE_MAPS_BROWSER_RESTRICTIONS_CONFIRMED", "true")
    monkeypatch.delenv("LANNPYA_GOOGLE_ROUTES_API_KEY", raising=False)
    monkeypatch.setattr(
        server,
        "google_server_key_for",
        lambda _: (
            SecretStr(dummy) if source in {"google-private-file", "embedded-private-file"} else None
        ),
    )

    def ors(_):
        if source == "read-failure":
            raise RoutingFailure("ORS_KEY_UNAVAILABLE")
        return SecretStr(dummy) if source == "ors-private-file" else None

    monkeypatch.setattr(server, "load_ors_key", ors)
    with TestClient(
        server.create_dashboard(), base_url="http://127.0.0.1:8765", client=("127.0.0.1", 55000)
    ) as client:
        response = client.get("/maps-config.js")
        assert response.status_code == 200 and dummy not in response.text
        assert response.headers["referrer-policy"] == "no-referrer"
