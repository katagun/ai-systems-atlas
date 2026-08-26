"""Shared validation and identity helpers for official discovery sources."""
from __future__ import annotations

import ipaddress
import re
import urllib.parse

SOURCE_ID_PATTERN = re.compile(r"[a-z0-9][a-z0-9-]*")
HOST_LABEL_PATTERN = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?")
REQUIRED_SOURCE_FIELDS = {"id", "name", "hub_url", "feed_url", "item_hosts"}
TRACKING_QUERY_KEYS = {"fbclid", "gclid", "mc_cid", "mc_eid"}


def valid_public_hostname(value: object) -> bool:
    """Return whether value is an exact, public-looking lowercase DNS name."""
    if not isinstance(value, str) or value != value.lower() or value.endswith("."):
        return False
    if len(value) > 253 or "." not in value or any(character.isspace() for character in value):
        return False
    try:
        ipaddress.ip_address(value)
    except ValueError:
        pass
    else:
        return False
    if value == "localhost" or value.endswith((".localhost", ".local", ".internal")):
        return False
    return all(HOST_LABEL_PATTERN.fullmatch(label) for label in value.split("."))


def https_url_host(value: object) -> str | None:
    """Return a validated HTTPS URL hostname, otherwise None."""
    if not isinstance(value, str):
        return None
    try:
        parsed = urllib.parse.urlsplit(value)
        hostname = parsed.hostname
        _ = parsed.port
    except ValueError:
        return None
    if (
        parsed.scheme != "https"
        or not hostname
        or parsed.username is not None
        or parsed.password is not None
        or not valid_public_hostname(hostname.lower())
    ):
        return None
    return hostname.lower()


def validate_discovery_sources(document: object) -> list[str]:
    """Validate the strict discovery-source registry schema."""
    errors: list[str] = []
    if not isinstance(document, dict):
        return ["discovery-sources.json: document must be an object"]
    if set(document) != {"version", "sources"}:
        errors.append("discovery-sources.json: fields must be version and sources")
    if document.get("version") != "1.0":
        errors.append("discovery-sources.json: unsupported version")
    sources = document.get("sources")
    if not isinstance(sources, list):
        return errors + ["discovery-sources.json: sources must be a list"]

    source_ids: list[str] = []
    for source in sources:
        prefix = (
            f"discovery source {source.get('id', 'unknown')}"
            if isinstance(source, dict)
            else "discovery source unknown"
        )
        if not isinstance(source, dict) or set(source) != REQUIRED_SOURCE_FIELDS:
            errors.append(f"{prefix}: fields do not match discovery-source schema")
            continue
        source_id = source["id"]
        if not isinstance(source_id, str) or not SOURCE_ID_PATTERN.fullmatch(source_id):
            errors.append(f"{prefix}: invalid id")
        else:
            source_ids.append(source_id)
        if not isinstance(source["name"], str) or not source["name"].strip():
            errors.append(f"{prefix}: name must be a non-empty string")

        hosts = source["item_hosts"]
        hosts_valid = (
            isinstance(hosts, list)
            and bool(hosts)
            and all(valid_public_hostname(host) for host in hosts)
            and len(hosts) == len(set(hosts))
        )
        if not hosts_valid:
            errors.append(
                f"{prefix}: item_hosts must be a non-empty unique list of lowercase public DNS hosts"
            )
            allowed_hosts: set[str] = set()
        else:
            allowed_hosts = set(hosts)

        for field in ("hub_url", "feed_url"):
            host = https_url_host(source[field])
            if host is None:
                errors.append(f"{prefix}: {field} must be an HTTPS URL on a public DNS host")
            elif hosts_valid and host not in allowed_hosts:
                errors.append(f"{prefix}: {field} host must appear in item_hosts")

    if len(source_ids) != len(set(source_ids)):
        errors.append("discovery-sources.json: source ids must be unique")
    if source_ids != sorted(source_ids):
        errors.append("discovery-sources.json: sources must be sorted by id")
    return errors


def canonical_url_key(value: object) -> str:
    """Return a conservative comparison key for an HTTP(S) URL."""
    text = str(value or "").strip()
    try:
        parsed = urllib.parse.urlsplit(text)
        hostname = parsed.hostname
        port = parsed.port
    except ValueError:
        return text.lower()
    if parsed.scheme.lower() not in {"http", "https"} or not hostname:
        return text.lower()

    scheme = parsed.scheme.lower()
    host = hostname.lower()
    default_port = (scheme == "https" and port == 443) or (scheme == "http" and port == 80)
    netloc = host if port is None or default_port else f"{host}:{port}"
    path = parsed.path or "/"
    if path != "/":
        path = path.rstrip("/")
    retained_query_parts: list[str] = []
    for part in parsed.query.split("&") if parsed.query else []:
        raw_key = part.partition("=")[0]
        key = urllib.parse.unquote_plus(raw_key).lower()
        if key.startswith("utm_") or key in TRACKING_QUERY_KEYS:
            continue
        retained_query_parts.append(part)
    query = "&".join(retained_query_parts)
    return urllib.parse.urlunsplit((scheme, netloc, path, query, ""))
