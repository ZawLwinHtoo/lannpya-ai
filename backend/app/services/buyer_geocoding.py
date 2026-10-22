"""Opt-in Google Geocoding v4. Suggestions never mutate canonical order GPS."""

import hashlib
import hmac
import json
import logging
import math
import re
import threading
import time
from collections import OrderedDict
from contextvars import ContextVar
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import quote
from uuid import UUID

import httpx2 as httpx
from dotenv import dotenv_values
from pydantic import SecretStr

from app.ai.gateway import reject_constant, unique_keys
from app.routing.base import RoutingFailure
from app.routing.browser_credentials import load_browser_key
from app.services.google_estimates import reserve

PRIVATE_ENV = Path(__file__).resolve().parents[2] / ".env.google-geocoding.local"
ENDPOINT = "https://geocode.googleapis.com/v4/geocode/address/"
MASK = "results.location,results.granularity,results.types,results.addressComponents"
_private_http = ContextVar("buyer_geocoding_private_http", default=False)


class _PrivateHTTPFilter(logging.Filter):
    def filter(self, record):
        return not _private_http.get()


def load_key(settings):
    """Only a dedicated geocoding credential; no Routes/browser-key fallback."""
    value = settings.google_geocoding_api_key
    if value and value.get_secret_value().strip():
        return SecretStr(value.get_secret_value().strip())
    if not PRIVATE_ENV.is_file():
        return None
    if PRIVATE_ENV.stat().st_size > 4096:
        raise ValueError("Invalid private credential file")
    value = dotenv_values(PRIVATE_ENV, interpolate=False).get("LANNPYA_GOOGLE_GEOCODING_API_KEY")
    return SecretStr(value.strip()) if value and value.strip() else None


def reject_browser_key(key, settings):
    browser = load_browser_key(settings)
    if browser and hmac.compare_digest(key.get_secret_value(), browser.get_secret_value()):
        raise ValueError("A website credential cannot be used for server geocoding")


def _point(a, b):
    return (
        type(a) in (int, float)
        and type(b) in (int, float)
        and math.isfinite(a)
        and math.isfinite(b)
        and abs(a) <= 90
        and abs(b) <= 180
    )


def address_query(details):
    # No buyer name, phone, COD, notes, floor or unit fields are used.
    parts = []
    for field in ("street", "landmark", "township"):
        text = details.get(field) or ""
        text = text.translate(str.maketrans("၀၁၂၃၄၅၆၇၈၉", "0123456789"))
        text = re.sub(r"[\w.+-]+@[\w.-]+", " ", text)
        text = re.sub(r"(?<!\d)(?:\+?95[\s-]*)?0?9(?:[\s-]*\d){7,10}(?!\d)", " ", text)
        text = " ".join("".join(c if c.isprintable() else " " for c in text).split())
        parts.append(text)
    if not parts[2] or not (parts[0] or parts[1]):
        return None
    result = ", ".join(p for p in parts if p) + ", Yangon, Myanmar"
    return result if len(result) <= 1000 and len(quote(result, safe="")) < 3500 else None


def result(status, **extra):
    return {
        "status": status,
        "provider": "GOOGLE_GEOCODING_V4",
        "observation": "NOT_ATTEMPTED",
        "cache_hit": False,
        "suggestion": None,
        **extra,
    }


class BuyerGeocoder:
    def __init__(self, settings, *, transport=None, clock=time.time):
        self.settings, self.transport, self.clock = settings, transport, clock
        self.cache = OrderedDict()
        self.lock = threading.RLock()
        # HTTP libraries can otherwise log private address URLs or debug headers.
        names = {"httpx2"}
        for package in ("httpcore", "httpcore2"):
            names.update(
                package + suffix
                for suffix in ("", ".connection", ".connection_pool", ".http11", ".http2")
            )
        for name in names:
            logger = logging.getLogger(name)
            if not any(isinstance(f, _PrivateHTTPFilter) for f in logger.filters):
                logger.addFilter(_PrivateHTTPFilter())

    def suggest(self, details, scope):
        if details.get("pending_location"):
            return result("PENDING_REVIEW")
        try:
            if details.get("latitude") is not None and details.get("longitude") is not None:
                if _point(float(details["latitude"]), float(details["longitude"])):
                    return result("STORED_COORDINATES")
        except (ValueError, TypeError):
            pass
        if details.get("status") not in {
            "DRAFT",
            "NEEDS_REVIEW",
            "AWAITING_CONFIRMATION",
            "CONFIRMED",
        }:
            return result("NOT_EDITABLE")
        settings = self.settings
        if not (
            settings.environment in {"local", "test"}
            and settings.google_geocoding_external_requests_enabled
            and settings.google_geocoding_permissions_confirmed
            and settings.google_geocoding_max_requests > 0
        ):
            return result("DISABLED")
        query = address_query(details)
        if not query:
            return result("INCOMPLETE_ADDRESS")
        try:
            if not settings.google_maps_browser_restrictions_confirmed or not load_browser_key(
                settings
            ):
                return result("MAP_CONFIGURATION_REQUIRED")
            key = load_key(settings)
            if not key:
                return result("CREDENTIAL_REQUIRED")
            reject_browser_key(key, settings)
        except ValueError:
            return result("BROWSER_KEY_REJECTED")
        except (OSError, RoutingFailure):
            return result("CONFIGURATION_ERROR")
        identity = hashlib.sha256((str(scope) + "\0" + query).encode()).hexdigest()
        # Serialize same-app lookups, including the first network call. A durable
        # reservation additionally bounds concurrent workers and process restarts.
        with self.lock:
            now = self.clock()
            for item, (until, _) in list(self.cache.items()):
                if until <= now:
                    del self.cache[item]
            if identity in self.cache:
                return {**deepcopy(self.cache[identity][1]), "cache_hit": True}
            reservation = settings.model_copy(
                update={
                    "google_demo_budget_directory": settings.google_geocoding_budget_directory,
                    "google_demo_max_requests": settings.google_geocoding_max_requests,
                }
            )
            request_id = UUID(
                hashlib.sha256(
                    f"{identity}:{int(now // settings.google_geocoding_cache_seconds)}".encode()
                ).hexdigest()[:32]
            )
            try:
                reserve(reservation, request_id)
            except RoutingFailure as exc:
                return result(
                    "ALREADY_ATTEMPTED"
                    if exc.code == "GOOGLE_REQUEST_ALREADY_ATTEMPTED"
                    else "BUDGET_EXHAUSTED"
                )
            observation = (
                "GOOGLE_MOCK" if isinstance(self.transport, httpx.MockTransport) else "GOOGLE_LIVE"
            )
            value = self._request(query, key)
            value["observation"] = observation
            # Cache only coordinate suggestions, not provider address/body content.
            # Negative outcomes have a short cooldown and no automatic retries.
            ttl = settings.google_geocoding_cache_seconds if value["suggestion"] else 60
            if value["suggestion"]:
                value["suggestion"]["expires_at"] = datetime.fromtimestamp(now, UTC) + timedelta(
                    seconds=ttl
                )
            self.cache[identity] = (now + ttl, deepcopy(value))
            while len(self.cache) > 256:
                self.cache.popitem(last=False)
            return value

    def _request(self, query, key):
        privacy = _private_http.set(True)
        try:
            with httpx.Client(
                transport=self.transport,
                trust_env=False,
                follow_redirects=False,
                timeout=self.settings.google_geocoding_timeout_seconds,
            ) as client:
                with client.stream(
                    "GET",
                    ENDPOINT + quote(query, safe=""),
                    params={"regionCode": "MM"},
                    headers={
                        "X-Goog-Api-Key": key.get_secret_value(),
                        "X-Goog-FieldMask": MASK,
                    },
                ) as response:
                    if response.status_code in {401, 403}:
                        return result("CREDENTIAL_OR_PERMISSION_DENIED")
                    if response.status_code == 429:
                        return result("RATE_LIMITED")
                    if response.status_code != 200:
                        return result("PROVIDER_UNAVAILABLE")
                    payload = bytearray()
                    for chunk in response.iter_bytes():
                        payload.extend(chunk)
                        if len(payload) > 65536:
                            return result("INVALID_RESPONSE")
            body = json.loads(
                payload, object_pairs_hook=unique_keys, parse_constant=reject_constant
            )
            rows = body.get("results") if isinstance(body, dict) else None
            if not isinstance(rows, list):
                return result("INVALID_RESPONSE")
            if not rows:
                return result("NO_RESULT")
            if len(rows) != 1:
                return result("AMBIGUOUS")
            row = rows[0]
            if not isinstance(row, dict):
                return result("INVALID_RESPONSE")
            place = row.get("location", {})
            if not isinstance(place, dict) or not _point(
                place.get("latitude"), place.get("longitude")
            ):
                return result("INVALID_RESPONSE")
            components, types = row.get("addressComponents", []), row.get("types", [])
            if (
                not isinstance(components, list)
                or not isinstance(types, list)
                or not all(isinstance(t, str) for t in types)
            ):
                return result("INVALID_RESPONSE")
            country = any(
                isinstance(c, dict)
                and c.get("shortText") == "MM"
                and "country" in c.get("types", [])
                for c in components
            )
            if (
                not country
                or row.get("partialMatch")
                or row.get("granularity") not in {"ROOFTOP", "RANGE_INTERPOLATED"}
                or not set(types).intersection({"street_address", "premise", "subpremise"})
            ):
                return result("AMBIGUOUS")
            return result(
                "SUGGESTION",
                suggestion={
                    "latitude": round(place["latitude"], 7),
                    "longitude": round(place["longitude"], 7),
                    "requires_confirmation": True,
                },
            )
        except httpx.TimeoutException:
            return result("TIMEOUT")
        except (ValueError, TypeError, KeyError, UnicodeError):
            return result("INVALID_RESPONSE")
        except httpx.HTTPError:
            return result("PROVIDER_UNAVAILABLE")
        finally:
            _private_http.reset(privacy)
