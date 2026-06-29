# Realtime tracking protocol

WebSocket `/ws` uses protocol version `1`. Lobby messages are JSON objects with
`v: 1`. Tracking and developer-preview messages are fixed-size little-endian
binary packets so their allocation and validation cost stays bounded.

## Client packet header

Every client binary packet starts with 16 bytes:

| Offset | Type | Meaning |
| --- | --- | --- |
| 0 | `uint8` | protocol version (`1`) |
| 1 | `uint8` | packet kind (`1` pose, `2` landmarks) |
| 2 | `uint8` | active-hand flags: bit 0 left, bit 1 right |
| 3 | `uint8` | reserved, must be zero |
| 4 | `uint32` | monotonically increasing sequence |
| 8 | `float64` | client monotonic timestamp in milliseconds |

Kind `1` is exactly 96 bytes. After the header it contains 10 `float32`
values for the left hand and then 10 for the right hand: confidence, normalized
position XYZ, blade direction XYZ and roll direction XYZ.

Kind `2` is exactly 528 bytes. After the header it contains left and right
confidence followed by 21 XYZ `float32` landmarks for the left hand and then
21 for the right hand. This packet is the developer ML preview; it contains no
camera pixels.

## Server packet

The server prepends a four-byte `uint32` stream ID to an accepted client packet
and relays it to the other room members. The room snapshot maps every player to
its stream ID.

Each sender has a sustained budget of 120 binary packets per second and a burst
budget of 180. Normal 30 or 60 Hz tracking therefore does not hit the limiter.
Control messages have a separate budget.

If a recipient has more than 256 KiB queued, the server skips pose packets for
that recipient until its buffer recovers. Tracking packets represent current
state, so delivering a newer packet is correct; retaining an old queue would
make a spectator progressively less live.
