# Security Policy

## Supported Versions

Security support applies only to the latest version of the default branch.
The blocked root `server.js`, older builds and downstream forks are not
supported. The supported backend is compiled from `server.ts`.

## Reporting a Vulnerability

Report vulnerabilities privately through GitHub Security Advisories:

https://github.com/VermiNew/hand-sabers/security/advisories/new

Do not publish secrets, pairing tokens, camera frames or working exploits in a
public issue. Include the affected version or commit, reachable entry point,
reproduction conditions, impact and any suggested mitigation.

## System and Scope

This policy covers the browser application in `src/`, the Express REST and
WebSocket backend in `server/`, build and validation scripts, map/audio storage
and the documented deployment configuration.

Hand Sabers is currently intended for a trusted local network or a small group
of trusted friends. It is not a public multi-tenant service.

## Threat Model and Trust Boundaries

Treat browser clients, REST and WebSocket messages, map metadata, player names,
scores, settings transfers, uploaded JSON/ZIP/audio files and filenames as
attacker-controlled.

The server host, environment variables, TLS private keys, configured reverse
proxy and local map-storage directory are trusted administrative boundaries.
MediaPipe assets loaded from the pinned external CDN execute in the browser
and form an explicitly accepted third-party trust boundary.

## Security Invariants

- Raw camera frames must not be transmitted by remote tracking. Only validated
  landmark or pose data may leave the phone.
- Remote-tracking and multiplayer peers must authenticate before relaying
  packets. Sessions must expire or be revocable as documented.
- Origin checks and IP rate limits must never be described as authorization.
- When deployment security is enabled, browser origins must match the explicit
  configured allowlist and must never be trusted by comparison with request Host.
- Uploads, JSON, ZIP decompression, WebSocket payloads and persistent storage
  must remain bounded. ZIP paths and stored identifiers must not escape their
  configured directories.
- Failed map/audio mutations must not silently destroy the previous consistent
  state.
- Attacker-controlled text must not be interpreted as HTML, script, URLs or
  filesystem paths without validation appropriate to that sink.
- Production static serving must not expose source code, repository metadata,
  dependencies, documentation, temporary uploads or stored private data.
- HTTPS or a correctly configured trusted reverse proxy is required when
  remote camera access is used outside localhost. HSTS must only be emitted for
  requests known to be secure.

Before public deployment, map mutations require an administrator, ownership or
read-only authorization model; scores require server-issued rounds tied to an
authenticated player and map; and disk quotas require a stable authenticated
user identity.

## Reportable Findings and Severity Context

A finding is reportable when it has a realistic path from an attacker-
controlled boundary to unauthorized file access or mutation, browser code
execution, camera or pairing compromise, cross-session data access, secret
disclosure, persistent corruption or resource exhaustion beyond documented
limits.

Severity depends on whether the issue is reachable in the documented trusted
deployment or additionally requires an unsupported public deployment.
Bypasses of an implemented boundary remain reportable even when a related
broader limitation is already documented.

## Known Limitations and Accepted Risk

- Map create, save, import and delete endpoints intentionally have no user
  authorization while deployment is limited to trusted friends. Exposing them
  publicly without adding authorization is unsupported.
- Leaderboard scores are currently supplied by clients and are not bound to a
  server-issued game round.
- The six-character manual phone-pairing code is visible to nearby people and
  therefore only creates a pending claim. It expires with the five-minute
  session, is rate-limited, and requires explicit host confirmation before the
  phone credential can be retrieved once. QR pairing intentionally carries the
  phone credential directly and should only be shown to the intended phone.
- Accepted ZIP imports are still initially read into memory by JSZip, within
  configured size and concurrency limits.
- Upload storage has global and per-IP controls but no authenticated per-user
  quota.
- Pinned MediaPipe `@0.10.0` assets remain on an external CDN. This third-party
  browser-code risk is accepted.

These limitations are not blanket finding suppressions. A bypass, unexpected
exposure, materially larger impact or violation of another invariant remains
reportable.
