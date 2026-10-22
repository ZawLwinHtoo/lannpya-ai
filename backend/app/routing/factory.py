from app.routing.base import RoutingFailure
from app.routing.http import HTTPProvider
from app.routing.offline import OfflineProvider
from app.routing.ors import ORSProvider


def provider_for(settings, allow_simulation=False):
    if settings.routing_provider == "offline":
        if settings.environment not in {"local", "test"}:
            raise RoutingFailure("SIMULATED_ROUTING_FORBIDDEN")
        if not allow_simulation:
            raise RoutingFailure("SIMULATION_ACKNOWLEDGEMENT_REQUIRED", 422)
        return OfflineProvider()
    if settings.routing_provider == "ors":
        return ORSProvider(settings)
    if settings.routing_provider == "google":
        return HTTPProvider(settings)
    raise RoutingFailure("ROUTING_DISABLED")
