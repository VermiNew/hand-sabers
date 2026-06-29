# Gameplay sound effects

## Decision

Keep hit, bomb, and miss effects procedural for now. Do not bundle or let players
import custom WAV/OGG effects in the current release.

The existing Web Audio implementation starts without a network request, has no
asset licence obligations, and can vary pitch from the current combo. Imported
samples would additionally require validation, decoding and fallback handling,
persistent storage, and a clear policy for sharing maps that reference local
files. Those costs are not justified while the procedural effects already have
separate mixer controls.

## Revisit when

Add a sample-backed layer only after sound design is treated as a release
deliverable. Use project-owned, explicitly licensed assets; decode and cache
them during audio initialization; keep the procedural effects as a fallback;
and preserve the existing per-effect volume controls. User-provided samples
should remain a separate feature because they require file-size limits,
IndexedDB persistence, and an export format.
