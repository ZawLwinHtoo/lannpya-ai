from abc import ABC, abstractmethod

from app.schemas.routing import MatrixQuery, RoadMatrix, RoadRoute, RouteQuery


class RoutingFailure(Exception):
    def __init__(self, code, status=503, *, provider_error=None):
        self.code, self.status = code, status
        self.provider_error = provider_error  # Only bounded, redacted diagnostic fields.
        super().__init__(code)  # Public errors/log strings remain stable safe codes.


class RoadProvider(ABC):
    @abstractmethod
    def get_route(self, request: RouteQuery) -> RoadRoute: ...

    @abstractmethod
    def get_route_matrix(self, request: MatrixQuery) -> RoadMatrix: ...
