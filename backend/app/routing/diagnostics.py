"""Bounded provider-error diagnostics; never retain raw bodies or request headers."""

import base64
import json
import re
import time
from urllib.parse import quote

import httpx2 as httpx

from app.ai.gateway import reject_constant, unique_keys


def sanitized_text(value, secrets):
    if not isinstance(value, str):
        return None
    for secret in secrets:
        if secret:
            variants = (secret, quote(secret, safe=""), base64.b64encode(secret.encode()).decode())
            for variant in sorted(variants, key=len, reverse=True):
                value = value.replace(variant, "[REDACTED]")
    value = re.sub(r"https?://\S+", "[URL REDACTED]", value, flags=re.I)
    value = re.sub(
        r"(?im)(authorization|x-goog-api-key|x-api-key|api_key)\s*[:=][^\r\n]*",
        "[HEADER REDACTED]",
        value,
    )
    # Also remove unknown JWTs/long token-like strings, without decoding any key.
    value = re.sub(r"[A-Za-z0-9_+/=.-]{24,}", "[TOKEN REDACTED]", value)
    value = " ".join("".join(c if c.isprintable() else " " for c in value).split())
    return value[:512] or None


def provider_diagnostic(response, deadline, secrets=()):
    result = {"http_status": response.status_code}
    content = bytearray()
    try:
        for chunk in response.iter_bytes():
            if time.monotonic() > deadline:
                return {**result, "body_state": "DEADLINE_EXCEEDED"}
            if len(content) + len(chunk) > 8192:
                return {**result, "body_state": "TOO_LARGE"}
            content.extend(chunk)
        data = json.loads(content, object_pairs_hook=unique_keys, parse_constant=reject_constant)
    except httpx.HTTPError:
        return {**result, "body_state": "READ_FAILED"}
    except (ValueError, TypeError, RecursionError):
        return {**result, "body_state": "NON_JSON_OR_INVALID"}
    if not isinstance(data, dict):
        return {**result, "body_state": "UNSUPPORTED_SHAPE"}
    error = data.get("error")
    detail = error if isinstance(error, dict) else data
    code = detail.get("code")
    if type(code) is int and 0 <= code <= 2147483647:
        result["provider_code"] = code
    elif isinstance(code, str) and re.fullmatch(r"[A-Z][A-Z0-9_]{0,63}", code):
        safe_code = sanitized_text(code, secrets)
        if safe_code == code:
            result["provider_code"] = code
    message = error if isinstance(error, str) else detail.get("message")
    safe_message = sanitized_text(message, secrets)
    if safe_message:
        result["provider_message"] = safe_message
    result["body_state"] = "JSON_FIELDS_ONLY"
    return result
