# Multiplayer architecture

## Authority and transport

Use an authoritative room service attached to the existing Express server.
Clients communicate through a versioned WebSocket protocol. The server owns
room membership, readiness, selected map identity, start time and final score
records. It does not simulate hand movement or block collisions.

Gameplay stays local and deterministic from the map beat list. Clients send
validated gameplay events and periodic score snapshots; the server broadcasts
the canonical room state. This avoids streaming camera or hand-tracking data
and keeps bandwidth low.

Spectator pose updates and opt-in developer landmark previews use the bounded
[binary realtime protocol](realtime-protocol.md). Raw camera frames are never
relayed.

## Clock and song synchronization

Each client estimates its offset to the server monotonic clock using repeated
ping/pong samples and keeps the lowest-latency samples. The host starts a game
by asking the server for a start at least three seconds in the future. Every
client schedules the same map timeline against that server timestamp.

During play, clients report their current song time. Small drift is corrected
gradually through the timeline/playback rate; large drift pauses the affected
client and requests a room-state resync. Network timestamps never modify
`beat.t`.

## Room lifecycle

1. A player creates a short-lived room and receives an unguessable join token
   plus a human-readable confirmation code.
2. Joining clients receive the map metadata and current room revision.
3. The host selects a map available to every client.
4. Each client marks itself ready only after the map and audio are loaded.
5. The server schedules the start when all required players are ready.
6. Results are finalized once per player and the room expires after inactivity.

Reconnects use a private player token and the last acknowledged room revision.
The server sends a full snapshot if incremental history is no longer available.

## Protocol shape

All messages contain a protocol version, type, room ID, monotonically
increasing room revision and request/event ID. Define separate schemas for:

- create, join, leave and reconnect;
- room snapshot and host/map changes;
- ready state and scheduled start;
- score/combo/progress updates and final result;
- ping/pong, resync request and structured errors.

Reject unknown message types, oversized payloads, stale revisions and invalid
state transitions. Apply per-connection rate limits and origin checks.

## Modes

Co-op and score attack share room/clock infrastructure but use different score
reducers. Co-op combines progress and failures; score attack ranks independent
local results. Mode rules belong in pure server-side reducers so they can be
verified without a browser.

Score attack rooms accept up to eight players. Co-op requires exactly two
players before the host can start the round.
