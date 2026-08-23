# ADR 004: Loopback-only personal web API

**Status:** Accepted

## Decision

The v0.1 API binds only to loopback, validates Host, does not enable CORS, and requires a per-vault mutation token.

## Consequences

- Local use is simple and safer than exposing an unauthenticated LAN service.
- Remote and multi-device access are deferred until an explicit authentication and encryption design exists.
