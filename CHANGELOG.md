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
- Run analysis on the results screen: average timing, early/late split, per-hand accuracy and the 10-second window with the most misses.
- S/A/B/C/D rank badge on the results screen for finished maps.
- Gameplay modifiers (mirror, no bombs, double lives) for single player; modified runs are not ranked and earn no achievements.
- Practice mode: replay one section of a map, with automatic tempo that rises from 60% after clean runs; never ranked, single player only.
- "Reduce motion" setting that turns off camera shake and the low-HP glitch effect; camera shake now also respects `prefers-reduced-motion`.
- Optional server admin token (`HAND_SABERS_ADMIN_TOKEN` or `adminToken`) protecting map save, import and delete.
- GitHub Actions CI running lint, build, unit tests and the server smoke test.
- Asset and license register and a data inventory with a privacy policy draft (`docs/`).
- Web app manifest and icons, so the game can be installed as an app; `public/` is now served from the site root.

### Changed

- Beat diagnostics no longer sort the entire map for every sample.
- Effective map duration is cached during gameplay.
- Asynchronous task and render-loop failures are isolated and reported without stopping the entire application.
- WebSocket transport failures are isolated to the affected connection instead of the server process.
- Arena detail, portal density, and saber trails now scale with the selected graphics profile.
- The central gameplay lane darkens subtly when notes approach the player.
- Existing arena rails, floor sheen, horizon, and stars now pulse from actual music energy and mapped beats without extra draw calls.
- Custom graphics now include independent saber trail and motion-glow strength control.
- The game page moved from `beat-sabers-3d.html` to `play.html`; the old address redirects with the query string preserved.
- README and package description describe the game by its own features.
- Importing a map whose id already exists asks for confirmation instead of overwriting it silently (the server answers 409 `MAP_EXISTS` unless `?overwrite=1`).
- Map ids derived from titles transliterate Polish characters, and titles with no usable characters get a stable hash id instead of a shared fallback.
- Hard-coded Polish aria-labels and placeholders are translated through i18n.

### Fixed

- Active phone-tracking sessions reconnect after temporary connection loss.
- Multiplayer sends safely handle a WebSocket closing during an operation.
- Camera diagnostics continue after device enumeration or individual metric failures.
- The creator, map library, and previews remain operational after an individual operation or frame fails.
- Error messages are inserted as text without executing HTML content originating from an exception.
- Server audio for a map is retried after a transient network failure instead of being dropped for the session.
- The results score animation can no longer show a negative number on its first frame.
- Settings import failures and rollbacks are now logged instead of silently ignored.

### Security

- Chat messages are normalized server-side and protected by length and rate limits.
- Chat author names come from authenticated room state, and messages are broadcast only to room participants.
- Remote tracking packets are authenticated, validated, and rate-limited before being relayed.
- Unexpected server errors return a generic 500 with a request id instead of a 400 carrying the raw error text.
- Updated `multer` to 2.4.0 (GHSA-3pph-fpjx-jg34, denial of service via orphaned disk writes on aborted uploads).
