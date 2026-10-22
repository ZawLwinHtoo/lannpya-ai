"""Fictional fixtures, MockTransport only; never contacts a routing provider."""

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4

import httpx2 as httpx
import pytest
from pydantic import ValidationError
from test_mapping_release import case
from test_routing import commit, query
from test_three_role_workflow import manual, save
from test_three_role_workflow import workspace as source_workspace

from app.core.config import Settings
from app.routing import credentials
from app.routing.base import RoutingFailure
from app.routing.optimizer import optimize
from app.routing.ors import ORSProvider, budget_status
from app.schemas.routing import Coordinate, MatrixQuery, PlanQuery, RoadMatrix, TimeWindow
from tools.ors_matrix_probe import POINTS
from tools.ors_matrix_probe import plan as probe_plan


@pytest.fixture
def workspace(tmp_path):
    yield from source_workspace.__wrapped__(tmp_path)


@pytest.fixture(autouse=True)
def isolate_private_credential(monkeypatch, tmp_path):
    monkeypatch.setattr(credentials, "PRIVATE_ENV", tmp_path / "absent-private.env")
    monkeypatch.delenv("LANNPYA_ORS_API_KEY", raising=False)
    monkeypatch.delenv("ORS_API_KEY", raising=False)


def points(n=2):
    return [Coordinate(latitude=16.8 + i / 1000, longitude=96.1 + i / 1000) for i in range(n)]


def settings(tmp_path, **changes):
    return Settings(
        _env_file=None,
        environment="test",
        routing_provider="ors",
        routing_external_requests_enabled=True,
        ors_api_key="fictional-server-only-key",
        ors_budget_directory=tmp_path / "ledger",
        **{"ors_max_requests": 1, **changes},
    )


def matrix_response(request):
    body = json.loads(request.content)
    assert request.url.path == "/openrouteservice/v2/matrix/driving-car"
    assert body["units"] == "m" and body["metrics"] == ["distance", "duration"]
    assert request.headers["Authorization"] == "fictional-server-only-key"
    n = len(body["locations"])
    return httpx.Response(
        200,
        json={
            "distances": [
                [0 if i == j else 1000 + i * 100 + j for j in range(n)] for i in range(n)
            ],
            "durations": [[0 if i == j else 60 + i * 10 + j for j in range(n)] for i in range(n)],
        },
    )


def request(n=2, **changes):
    return MatrixQuery(
        locations=points(n),
        **{"request_id": uuid4(), "authorize_external_request": True, **changes},
    )


def test_normalized_asymmetric_matrix_and_one_request(tmp_path):
    calls = []

    def handle(r):
        calls.append(r)
        assert json.loads(r.content)["locations"][0] == [96.1, 16.8]
        return matrix_response(r)

    matrix = ORSProvider(
        settings(tmp_path), transport=httpx.MockTransport(handle)
    ).get_route_matrix(request())
    assert len(calls) == 1
    assert matrix.observation == "ORS_MOCK_MATRIX" and matrix.profile == "driving-car"
    assert matrix.quality == "ROAD_STATIC" and not matrix.traffic_aware
    assert matrix.durations[0][1] == 61 and matrix.durations[1][0] == 70
    assert matrix.distances[0][1] == 1001 and matrix.distances[1][0] == 1100
    assert matrix.source_indices == matrix.destination_indices == [0, 1]
    assert matrix.unreachable_pairs == []


def test_planned_yangon_four_point_matrix_reaches_one_rider_solver(tmp_path):
    q, _, _ = case(capacity=3)
    data = q.model_dump()
    data.update(
        origin=Coordinate(longitude=POINTS[0][0], latitude=POINTS[0][1]),
        orders=[{"order_id": uuid4()} for _ in range(3)],
        allow_simulation=False,
        return_to_hub=True,
    )
    q = PlanQuery.model_validate(data)
    locations = [Coordinate(longitude=lon, latitude=lat) for lon, lat in POINTS]
    stops = [
        {
            "order_id": str(order.order_id),
            "coordinate": locations[i],
            "service_seconds": 180,
            "demand": 1,
            "rider_id": None,
            "window": None,
        }
        for i, order in enumerate(q.orders, 1)
    ]
    calls = []

    def handle(r):
        calls.append(r)
        assert str(r.url) == "https://api.heigit.org/openrouteservice/v2/matrix/driving-car"
        assert json.loads(r.content)["locations"] == POINTS
        return matrix_response(r)

    matrix = ORSProvider(
        settings(tmp_path), transport=httpx.MockTransport(handle)
    ).get_route_matrix(
        MatrixQuery(locations=locations, request_id=uuid4(), authorize_external_request=True)
    )
    result = optimize(q, matrix, stops, q.riders)
    assert len(calls) == 1 and matrix.durations[0][1] != matrix.durations[1][0]
    assert result.solver_status == "FEASIBLE" and not result.unassigned
    assert result.matrix_observation == "ORS_MOCK_MATRIX"
    assert len(result.vehicles) == 1
    vehicle = result.vehicles[0]
    assert len(vehicle.stops) == vehicle.load == vehicle.capacity == 3
    index_by_order = {s["order_id"]: i for i, s in enumerate(stops, 1)}
    indices = [0] + [index_by_order[str(s.order_id)] for s in vehicle.stops] + [0]
    assert vehicle.travel_seconds == sum(
        matrix.durations[a][b] for a, b in zip(indices, indices[1:])
    )
    assert vehicle.distance_meters == sum(
        matrix.distances[a][b] for a, b in zip(indices, indices[1:])
    )
    assert vehicle.duration_seconds == vehicle.travel_seconds + 3 * 180


@pytest.mark.parametrize(
    "config,body,code",
    [
        ({"ors_max_requests": 0}, {}, "DISABLED"),
        ({"environment": "production"}, {}, "DISABLED"),
        ({"routing_external_requests_enabled": False}, {}, "DISABLED"),
        ({"ors_api_key": None}, {}, "KEY_MISSING"),
        ({}, {"authorize_external_request": False}, "CONSENT"),
        ({}, {"request_id": None}, "CONSENT"),
        ({"ors_max_matrix_elements": 4}, {"n": 3}, "MATRIX_LIMIT"),
        ({"routing_max_stops": 1}, {"n": 3}, "STOP_LIMIT"),
        ({}, {"mode": "TWO_WHEELER"}, "MODE_UNSUPPORTED"),
    ],
)
def test_gates_send_nothing(tmp_path, config, body, code):
    values = settings(tmp_path).model_copy(update=config)
    provider = ORSProvider(values, transport=httpx.MockTransport(lambda r: pytest.fail("HTTP")))
    with pytest.raises(RoutingFailure, match=code):
        provider.get_route_matrix(request(**body))
    assert not values.ors_budget_directory.exists()


def test_duplicate_and_restart_budget_do_not_repeat_http(tmp_path):
    values, body, calls = settings(tmp_path), request(), []

    def handle(r):
        calls.append(1)
        return matrix_response(r)

    def new():
        return ORSProvider(values, transport=httpx.MockTransport(handle))

    new().get_route_matrix(body)
    with pytest.raises(RoutingFailure, match="ALREADY_ATTEMPTED"):
        new().get_route_matrix(body)
    with pytest.raises(RoutingFailure, match="EXHAUSTED"):
        new().get_route_matrix(request())
    assert len(calls) == 1 and budget_status(values)["remaining_requests"] == 0
    assert "fictional" not in "".join(p.read_text() for p in values.ors_budget_directory.iterdir())


def test_concurrent_requests_share_one_durable_slot(tmp_path):
    values, calls = settings(tmp_path), []

    def handle(r):
        calls.append(1)
        return matrix_response(r)

    def attempt(_):
        try:
            ORSProvider(values, transport=httpx.MockTransport(handle)).get_route_matrix(request())
            return "OK"
        except RoutingFailure as e:
            return e.code

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(attempt, range(4)))
    assert results.count("OK") == 1 and len(calls) == 1


def test_unwritable_budget_fails_closed(tmp_path):
    values = settings(tmp_path)
    values.ors_budget_directory.write_text("Owned fixture: not a directory")
    with pytest.raises(RoutingFailure, match="BUDGET_UNAVAILABLE"):
        ORSProvider(
            values, transport=httpx.MockTransport(lambda r: pytest.fail("HTTP"))
        ).get_route_matrix(request())


@pytest.mark.parametrize("failure", ["timeout", "malformed"])
def test_ors_timeout_and_malformed_response_consume_budget_without_retry(tmp_path, failure):
    calls = []
    values = settings(tmp_path)

    def handle(r):
        calls.append(1)
        if failure == "timeout":
            raise httpx.ReadTimeout("fictional private payload")
        return httpx.Response(200, text="not valid JSON")

    with pytest.raises(RoutingFailure, match="TIMEOUT|INVALID_RESPONSE"):
        ORSProvider(values, transport=httpx.MockTransport(handle)).get_route_matrix(request())
    assert len(calls) == 1 and budget_status(values)["remaining_requests"] == 0


@pytest.mark.parametrize(
    "status,code", [(403, "QUOTA"), (429, "RATE_LIMITED"), (500, "UNAVAILABLE")]
)
def test_failure_consumes_slot_and_never_retries_or_leaks(tmp_path, status, code):
    values, calls = settings(tmp_path), []

    def handle(r):
        calls.append(1)
        return httpx.Response(status, text="fictional-server-only-key private payload")

    with pytest.raises(RoutingFailure, match=code) as caught:
        ORSProvider(values, transport=httpx.MockTransport(handle)).get_route_matrix(request())
    assert "private" not in str(caught.value) and len(calls) == 1
    assert budget_status(values)["remaining_requests"] == 0


@pytest.mark.parametrize(
    "distances,durations",
    [
        ([[0, 1]], [[0, 1]]),
        ([[0, True], [1, 0]], [[0, 1], [1, 0]]),
        ([[0, 1], [1, 0]], [[0, None], [1, 0]]),
        ([[0, -1], [1, 0]], [[0, 1], [1, 0]]),
        ([[0, "1"], [1, 0]], [[0, 1], [1, 0]]),
        ([[0, 10**400], [1, 0]], [[0, 1], [1, 0]]),
    ],
)
def test_invalid_provider_matrices_are_rejected(tmp_path, distances, durations):
    provider = ORSProvider(
        settings(tmp_path),
        transport=httpx.MockTransport(
            lambda r: httpx.Response(200, json={"distances": distances, "durations": durations})
        ),
    )
    with pytest.raises(RoutingFailure, match="INVALID_RESPONSE"):
        provider.get_route_matrix(request())


def test_matrix_model_rejects_coerced_bool_and_retains_unreachable():
    data = dict(
        provider="ors",
        locations=points(),
        mode="DRIVE",
        quality="ROAD_STATIC",
        attribution="ORS / OSM",
        distances=[[0, None], [20, 0]],
        durations=[[0, None], [2, 0]],
    )
    matrix = RoadMatrix(**data)
    assert matrix.unreachable_pairs == [
        {"origin_index": 0, "destination_index": 1, "code": "UNREACHABLE"}
    ]
    with pytest.raises(ValidationError):
        RoadMatrix(**{**data, "distances": [[0, True], [20, 0]]})


def test_probe_is_one_matrix_plan_with_no_secrets_or_http(tmp_path, monkeypatch):
    monkeypatch.setattr(ORSProvider, "post", lambda *a: pytest.fail("Unexpected HTTP"))
    result = probe_plan(settings(tmp_path))
    assert result["proposed_requests"] == 1 and result["matrix_elements"] == 16
    assert result["matrix_shape"] == [4, 4] and result["http_requests_sent"] == 0
    assert result["google_requests_proposed"] == result["google_request_budget"] == 0
    assert "fictional-server-only-key" not in json.dumps(result)


def test_google_general_api_cannot_bypass_demo_budget(workspace):
    c, _, _ = workspace
    c["admin"].app.state.settings.routing_provider = "google"
    response = c["admin"].post(
        "/api/routes/matrix", json={"locations": [p.model_dump() for p in points()]}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "GOOGLE_DEMO_SINGLE_ROUTE_ONLY"


@pytest.mark.parametrize("reason", ["unreachable", "capacity", "window"])
def test_ors_costs_respect_hard_constraints_and_exclude_infeasible_stop(tmp_path, reason):
    q, stops, _ = case(capacity=2)
    stops[0]["window"] = TimeWindow(
        start=q.operating_window.start + timedelta(seconds=60),
        end=q.operating_window.start + timedelta(minutes=10),
    )

    def handle(r):
        data = json.loads(matrix_response(r).content)
        if reason == "unreachable":
            for name in ("distances", "durations"):
                for i in (0, 1):
                    data[name][i][2] = data[name][2][i] = None
        return httpx.Response(200, json=data)

    matrix = ORSProvider(
        settings(tmp_path), transport=httpx.MockTransport(handle)
    ).get_route_matrix(
        MatrixQuery(
            locations=[q.origin] + [s["coordinate"] for s in stops],
            request_id=uuid4(),
            authorize_external_request=True,
        )
    )
    if reason == "capacity":
        stops[1]["demand"] = 3
    if reason == "window":
        stops[1]["window"] = TimeWindow(
            start=q.operating_window.start + timedelta(seconds=10),
            end=q.operating_window.start + timedelta(seconds=20),
        )
    result = optimize(q, matrix, stops, q.riders)
    assert len(result.vehicles) == len(result.unassigned) == 1
    vehicle = result.vehicles[0]
    assert vehicle.load <= vehicle.capacity and vehicle.travel_seconds == 131
    assert vehicle.stops[0].arrival >= stops[0]["window"].start
    assert vehicle.stops[0].departure <= stops[0]["window"].end
    assert result.matrix_observation == "ORS_MOCK_MATRIX" and not result.globally_optimal


@pytest.mark.parametrize(
    "confirmed,same_key,exposed", [(False, False, False), (True, True, False), (True, False, True)]
)
def test_browser_key_requires_restrictions_and_must_differ_from_server(
    monkeypatch, confirmed, same_key, exposed
):
    from fastapi.testclient import TestClient

    from tools.backend_test_dashboard.server import create_dashboard

    public = "fictional-public-browser-credential"
    monkeypatch.setenv("LANNPYA_GOOGLE_MAPS_BROWSER_KEY", public)
    monkeypatch.setenv("LANNPYA_GOOGLE_MAPS_BROWSER_RESTRICTIONS_CONFIRMED", str(confirmed))
    monkeypatch.setenv("LANNPYA_GOOGLE_ROUTES_API_KEY", public if same_key else "fictional-private")
    with TestClient(
        create_dashboard(), base_url="http://127.0.0.1:8765", client=("127.0.0.1", 55000)
    ) as client:
        response = client.get("/maps-config.js")
        assert response.status_code == 200
        assert (public in response.text) == exposed
        assert "fictional-private" not in response.text
        assert response.headers["referrer-policy"] == (
            "strict-origin-when-cross-origin" if exposed else "no-referrer"
        )


def test_real_api_uses_matrix_costs_two_riders_commits_and_updates_queue(workspace, tmp_path):
    c, ids, db = workspace
    orders = [manual(workspace) for _ in range(2)]
    rider = save(
        c["admin"].post(
            "/api/riders", json={"name": "Fictional ORS rider", "operational_status": "AVAILABLE"}
        ),
        201,
    )
    s = c["admin"].app.state.settings
    for k, v in settings(tmp_path).model_dump().items():
        if k.startswith("ors_") or k.startswith("routing_"):
            setattr(s, k, v)
    calls = []

    def handle(r):
        calls.append(r.url.path)
        return matrix_response(r)

    c["admin"].app.state.routing_provider_override = ORSProvider(
        s, transport=httpx.MockTransport(handle)
    )
    body = query(
        orders,
        [ids["rider"], rider["id"]],
        allow_simulation=False,
        request_id=str(uuid4()),
        authorize_external_request=True,
    )
    for r in body["riders"]:
        r["capacity"] = 1
    plan = save(c["admin"].post("/api/routes/optimize", json=body), 201)
    result = plan["result"]
    assert (
        result["matrix_observation"] == "ORS_MOCK_MATRIX"
        and result["travel_profile"] == "driving-car"
    )
    assert len(result["vehicles"]) == 2 and not result["unassigned"]
    # Each single-stop return uses asymmetric outward + inward costs, not offline fixture values.
    assert sorted(v["travel_seconds"] for v in result["vehicles"]) == [131, 142]
    assert all(
        v["load"] == v["capacity"] == 1 and v["geometry"] is None for v in result["vehicles"]
    )
    assert calls == ["/openrouteservice/v2/matrix/driving-car"]
    saved = commit(c, plan)
    assert saved["state"] == "COMMITTED"
    queue = save(c["rider"].get(f"/api/riders/{ids['rider']}/queue"))
    assert len(queue["items"]) == 1
    assert (
        save(c["admin"].get(f"/api/routes/plans/{plan['id']}"))["result"]["matrix_observation"]
        == "ORS_MOCK_MATRIX"
    )
    assert c["other"].post(
        "/api/routes/matrix", json={"locations": [p.model_dump() for p in points()]}
    ).status_code in {403, 422}


def test_ors_preview_cannot_overwrite_a_new_order_correction(workspace, tmp_path):
    c, ids, _ = workspace
    order = manual(workspace)
    s = c["admin"].app.state.settings
    for k, v in settings(tmp_path).model_dump().items():
        if k.startswith("ors_") or k.startswith("routing_"):
            setattr(s, k, v)
    c["admin"].app.state.routing_provider_override = ORSProvider(
        s, transport=httpx.MockTransport(matrix_response)
    )
    body = query(
        [order],
        [ids["rider"]],
        allow_simulation=False,
        request_id=str(uuid4()),
        authorize_external_request=True,
    )
    plan = save(c["admin"].post("/api/routes/optimize", json=body), 201)
    corrected = save(
        c["admin"].patch(
            "/api/orders/" + order["id"],
            json={
                "expected_version": order["version"],
                "delivery_instructions": "Fictional revised note",
            },
        )
    )
    assert commit(c, plan, 409)["error"]["code"] == "ROUTE_PLAN_STALE"
    assert corrected["status"] != "ASSIGNED"
