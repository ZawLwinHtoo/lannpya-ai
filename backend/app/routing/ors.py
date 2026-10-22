"""Development-only ORS operations: one HTTP request, durable opt-in budget, no retries."""

import json
import os

from app.routing.base import RoutingFailure
from app.routing.http import HTTPProvider


def budget_status(settings):
    used = sum((settings.ors_budget_directory / f"slot-{i}.json").exists() for i in range(10))
    return {
        "remaining_requests": max(0, settings.ors_max_requests - used),
        "max_matrix_elements": settings.ors_max_matrix_elements,
    }


def reserve(settings, request):
    if settings.environment not in {"local", "test"} or settings.ors_max_requests == 0:
        raise RoutingFailure("ORS_LIVE_BUDGET_DISABLED")
    if not request.authorize_external_request or request.request_id is None:
        raise RoutingFailure("EXPLICIT_EXTERNAL_CONSENT_REQUIRED", 422)
    directory = settings.ors_budget_directory
    try:
        if (directory / f"request-{request.request_id}.json").exists():
            raise RoutingFailure("ORS_REQUEST_ALREADY_ATTEMPTED", 409)
        if budget_status(settings)["remaining_requests"] == 0:
            raise RoutingFailure("ORS_BUDGET_EXHAUSTED", 429)
        directory.mkdir(parents=True, exist_ok=True)
        # Nonce and slots survive process restarts and sandbox database resets.
        # Failed attempts consume authorization; responses and coordinates are never cached.
        try:
            with (directory / f"request-{request.request_id}.json").open(
                "x", encoding="utf-8"
            ) as f:
                json.dump({"reserved": True}, f)
                f.flush()
                os.fsync(f.fileno())
        except FileExistsError:
            raise RoutingFailure("ORS_REQUEST_ALREADY_ATTEMPTED", 409) from None
        for i in range(settings.ors_max_requests):
            try:
                with (directory / f"slot-{i}.json").open("x", encoding="utf-8") as f:
                    json.dump({"request_id": str(request.request_id)}, f)
                    f.flush()
                    os.fsync(f.fileno())
                return
            except FileExistsError:
                continue
        raise RoutingFailure("ORS_BUDGET_EXHAUSTED", 429)
    except OSError:
        raise RoutingFailure("ORS_BUDGET_UNAVAILABLE") from None


class ORSProvider(HTTPProvider):
    matrix_only_preview = True

    def get_route_matrix(self, request):
        self.ready(request.mode)
        if len(request.locations) > self.settings.routing_max_stops + 1:
            raise RoutingFailure("ROUTING_STOP_LIMIT", 422)
        if len(request.locations) ** 2 > self.settings.ors_max_matrix_elements:
            raise RoutingFailure("ROUTING_MATRIX_LIMIT", 422)
        reserve(self.settings, request)
        return super().get_route_matrix(request)

    def get_route(self, request):
        self.ready(request.mode)
        reserve(self.settings, request)
        return super().get_route(request)
