# Remote hand tracking architecture

## Decision

The phone is a tracking client, not a remote webcam. It runs MediaPipe locally
and sends normalized hand poses to the PC. Raw camera frames never leave the
phone.

The Express server creates and revokes short-lived sessions through REST.
Tracking and the small audio/control protocol use one authenticated WebSocket
endpoint at `/tracking-ws`; there is no WebRTC or DataChannel transport.

## Session flow

1. The PC creates an in-memory session with separate random host and phone
   bearer tokens. The session expires five minutes after creation.
2. The PC displays a six-character manual code and a QR URL. The QR stores the
   phone credential in its URL fragment, which the phone removes from the
   address bar immediately after reading it.
3. A phone that uses the manual code creates one pending request through REST
   and polls it with a separate random claim token. The host must allow or
   reject that request; the phone credential is returned exactly once and only
   after approval. A QR link already contains that credential and does not need
   the manual-code confirmation.
4. Host and phone open `/tracking-ws` and authenticate their role, session ID
   and token within ten seconds.
5. MediaPipe runs locally on the phone. The server validates and rate-limits
   each binary packet before relaying it to the authenticated host, where it
   enters the same detection/calibration path as local tracking.
6. The host can revoke the session. Expiry or revocation closes connected
   sockets; disconnecting the host stops the phone camera. Either peer may
   reconnect with its token before the fixed expiry time.

## Tracking packet

The phone sends a versioned binary packet (currently 96 or 528 bytes). The
server accepts at most 60 packets per second per authenticated phone:

- protocol version, session sequence and monotonic phone timestamp;
- left/right active flags and confidence values;
- normalized wrist position and compact blade orientation for each hand;
- optional diagnostic values such as source frame time.

Only current poses are useful. The server rejects invalid versions, layouts,
flags, timestamps and non-finite or out-of-range values. It does not relay data
after session expiry and drops excess packets instead of queueing them.

## Security and privacy

- Require HTTPS/WSS outside localhost because phone camera access needs a
  secure context.
- QR pairing uses the random phone bearer token. Manual pairing uses a
  six-character, roughly 30-bit code and is limited to six attempts per minute
  per transport IP. Entering it creates a single pending request; the host sees
  explicit allow/reject controls, and the phone receives its role-bound bearer
  token only after approval. The private claim token can retrieve that
  credential once and becomes invalid after rejection or successful retrieval.
- Sessions are memory-only and expire exactly five minutes after creation,
  including while both peers are connected.
- Host and phone tokens are role-bound. WebSocket upgrades enforce same-origin
  checks, small pending-handshake pools, a 1 KiB payload cap, message allowlists,
  packet/message rate limits and 64 KiB outgoing-buffer backpressure.
- Do not log pose packets, camera frames or pairing secrets.

## HTTPS in a local network

Mobile browsers require a secure context before granting camera access. The
production Express server can serve HTTPS directly when both certificate paths
are provided:

```powershell
$env:HAND_SABERS_TLS_CERT='C:\certs\hand-sabers.pem'
$env:HAND_SABERS_TLS_KEY='C:\certs\hand-sabers-key.pem'
npm start
```

The certificate must be trusted by the phone and contain the LAN hostname or IP
used in the QR link. Do not commit private keys or generated certificates. When
TLS terminates in a reverse proxy, set `HAND_SABERS_TRUST_PROXY=1` so Express
uses the forwarded HTTPS protocol while generating pairing links.

## Integration boundary

`src/tracking/tracking.ts` selects the local camera or connected phone from the
tracking-source setting. Remote landmark packets are decoded and passed to the
same detection-result processing used by local MediaPipe output. Calibration
remains on the PC because it maps normalized phone coordinates to the current
game space.
