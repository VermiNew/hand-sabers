# Remote hand tracking architecture

## Decision

The phone is a tracking client, not a remote webcam. It runs MediaPipe locally
and sends normalized hand poses to the PC. Raw camera frames never leave the
phone.

Use the existing Express server plus WebSocket for room creation, short-lived
pairing and WebRTC signaling. After negotiation, tracking packets travel over
an unordered WebRTC DataChannel with limited retransmission. This keeps old
packets from delaying current hand positions. WebSocket is a fallback when a
peer-to-peer connection cannot be established.

## Session flow

1. The PC creates a random, expiring session and displays its code as text and
   a QR link.
2. The phone opens that link, confirms the PC name, and requests camera access.
3. Both clients exchange WebRTC offer, answer and ICE candidates through the
   signaling server.
4. The phone starts tracking only after the user explicitly confirms pairing.
5. The PC validates each packet, applies clock-offset compensation, then feeds
   poses into the same smoothing/calibration boundary used by local tracking.
6. Either side can revoke the session; disconnecting stops the phone camera.

## Tracking packet

Use a versioned binary packet at up to 30 Hz:

- protocol version, session sequence and monotonic phone timestamp;
- left/right active flags and confidence values;
- normalized wrist position and compact blade orientation for each hand;
- optional diagnostic values such as source frame time.

Only the newest packet is useful. The PC discards duplicates, packets older
than the last accepted sequence, invalid numbers, values outside conservative
bounds, and sessions whose token has expired.

## Security and privacy

- Require HTTPS/WSS outside localhost; camera and WebRTC need a secure context.
- Pair using at least 128 bits of random entropy. A short displayed code is a
  confirmation value, not the session secret.
- Keep sessions memory-only, single-use and short-lived.
- Do not log pose packets, camera frames, SDP bodies or pairing secrets.
- Apply origin checks, message-size limits and per-session rate limits to the
  signaling endpoint.

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

Introduce a `TrackingProvider` interface only when implementing transport.
Both `LocalMediaPipeProvider` and `RemotePhoneProvider` should publish the same
timestamped pose shape. Gameplay must not know which provider is active.
Calibration remains on the PC because it maps normalized phone coordinates to
the current game space.
