# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Text chat for Multiplayer rooms, including a lobby panel, Polish and English messages, and a 240-character limit.
- A Multiplayer map picker based on the map library interface.
- Host-controlled gameplay rules, including Training Mode and No Fail.
- Tracking source selection: automatic, computer camera, or paired phone.
- Secure phone pairing, hand landmark relay, and automatic reconnection.
- Remote hand previews for other Multiplayer participants.
- A synchronized 3D preview in the map creator.
- Frame-phase profiling and performance bottleneck documentation.
- Trusted HTTPS certificate configuration for the server.
- Lightweight saber motion trails with quality-preset and custom controls.

### Changed

- Beat diagnostics no longer sort the entire map for every sample.
- Effective map duration is cached during gameplay.
- Asynchronous task and render-loop failures are isolated and reported without stopping the entire application.
- WebSocket transport failures are isolated to the affected connection instead of the server process.
- Arena detail, portal density, and saber trails now scale with the selected graphics profile.
- The central gameplay lane darkens subtly when notes approach the player.
- Existing arena rails, floor sheen, horizon, and stars now pulse from actual music energy and mapped beats without extra draw calls.

### Fixed

- Active phone-tracking sessions reconnect after temporary connection loss.
- Multiplayer sends safely handle a WebSocket closing during an operation.
- Camera diagnostics continue after device enumeration or individual metric failures.
- The creator, map library, and previews remain operational after an individual operation or frame fails.
- Error messages are inserted as text without executing HTML content originating from an exception.

### Security

- Chat messages are normalized server-side and protected by length and rate limits.
- Chat author names come from authenticated room state, and messages are broadcast only to room participants.
- Remote tracking packets are authenticated, validated, and rate-limited before being relayed.
