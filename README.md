# Hand Sabers

Beat Saber without VR: a rhythm game controlled by your hands via webcam. The frontend runs on Vite, the backend is an Express server that stores maps, audio and scores.

> **Polish version:** [README.pl.md](README.pl.md)

## Requirements

- Node.js 22.18+
- npm
- Webcam
- Chrome or Edge with WebGL

## Installation

```bash
npm install
```

## Quickstart

```bash
npm start
```

Open in your browser:

```plaintext
http://localhost:3000
```

This builds the Vite frontend, compiles `server.ts` to `dist-server/` and starts the compiled Express server. This is the simplest way to play the game.

## Development mode

The easiest way to run both the backend and Vite together:

```bash
npm run dev:vite
```

URLs:

| Address | Description |
| --- | --- |
| `http://localhost:5173` | Game (via Vite dev server) |
| `http://localhost:3000` | Backend / API |

Vite proxies all `/api` requests to Express.

You can also run them separately:

```bash
npm run server   # build frontend + backend, then start Express on port 3000
npm run dev      # Vite only (no backend — some features fall back to browser storage)
```

## URLs

| URL | Description |
| --- | --- |
| `http://localhost:3000` | Game |
| `http://localhost:3000?dev` | Game with diagnostics panel |
| `http://localhost:3000/maps.html` | Map library and leaderboard |
| `http://localhost:3000/map-creator.html` | Map creator (DAW-style editor) |

In Vite mode use the same paths on port `5173`.

## Commands

| Command | Description |
| --- | --- |
| `npm run build` | TypeScript check + production Vite build |
| `npm run typecheck` | TypeScript check (frontend) |
| `npm run typecheck:server` | TypeScript check (server) |
| `npm run server:build` | Compile `server.ts` → `dist-server/` |
| `npm run check` / `npm run lint` | JS syntax check |
| `npm run unit` | Unit tests |
| `npm run smoke` | Smoke test: start compiled server, check API + homepage |
| `npm test` | Core test suite |
| `npm run verify` | Full quality gate: lint → build → typecheck server → server build → unit → smoke |

## Controls

| Action | Description |
| --- | --- |
| `Escape` | Pause / resume |
| Drag & drop `.json` or `.zip` onto the game | Load a map |
| Settings panel | No Fail mode, saber colors, one-hand mode, beat limit, performance |

### Map creator keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Space` | Play / Pause |
| `Shift+Space` | Place bomb |
| `F` / `J` | Tap left / right block |
| `1`–`9` | Set cut direction (or apply to selection) |
| `R` | Cycle cut direction |
| `Shift+R` | Stop (return to start) |
| `Home` / `End` | Jump to start / end |
| `Tab` / `Shift+Tab` | Jump to next / previous beat |
| `[` / `]` | Set loop start / end at play position |
| `Delete` | Delete selection (or nearest beat to cursor) |
| `Escape` | Clear selection |
| `Ctrl+Z` / `Y` | Undo / Redo |
| `Ctrl+A` | Select all |
| `Ctrl+C` / `V` | Copy / Paste |
| `Ctrl+D` | Duplicate selection |
| `Ctrl+S` | Save |
| `+` / `−` | Zoom in / out |
| `Ctrl+Wheel` | Zoom centered on cursor |
| Middle-click drag | Scroll timeline |
| Right-click (empty) | Context menu (seek, loop markers, paste) |
| Right-click (beat) | Delete beat |
| `?` | Toggle keyboard shortcut cheatsheet |

## Local data

The server writes files to the `maps/` directory:

- `maps/beatdata/<id>.json` — map data
- `maps/audio/<id>.<ext>` — map audio
- `maps/_scores.json` — leaderboard

If the API is unavailable, the app falls back to browser storage:

- Maps and scores in `localStorage`
- Creator audio in IndexedDB

## Map format

```json
{
  "formatVersion": 1,
  "id": "map-123",
  "meta": {
    "title": "Song title",
    "duration": 180
  },
  "beats": [
    { "t": 1.2, "side": "left",  "type": "block", "cut": "any"  },
    { "t": 1.7, "side": "right", "type": "block", "cut": "down" },
    { "t": 3.1, "side": "left",  "type": "bomb",  "cut": "any"  }
  ]
}
```

Allowed values:

- `side`: `left`, `right`, `random`
- `type`: `block`, `bomb`
- `cut`: `any`, `down`, `up`, `left`, `right`, `down-left`, `down-right`, `up-left`, `up-right`

## REST API

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/health` | GET | Server status |
| `/api/maps` | GET | List all maps |
| `/api/maps/:id` | GET | Get a map |
| `/api/maps/:id/audio` | GET | Get map audio |
| `/api/maps/:id/export.zip` | GET | Export as ZIP |
| `/api/maps` | POST | Save map JSON |
| `/api/maps/save` | POST | Save from creator (with optional audio) |
| `/api/maps/import` | POST | Import `.json` or `.zip` |
| `/api/maps/:id` | DELETE | Delete a map |
| `/api/scores` | GET / POST | Leaderboard |

## Camera tips

- Stand about 1–1.5 m from the camera.
- Make sure your hands are clearly visible.
- Avoid strong backlighting.
- If left and right sides are swapped, enable **Flip camera sides** in Settings.

## OpenAI Build Week 2026

During OpenAI Build Week, I used Codex with GPT-5.6 to extend Hand Sabers
with new tracking, multiplayer, editor, visual, performance, and reliability
improvements.

Codex helped me inspect the codebase, implement focused changes, refactor
larger systems, investigate bugs, and validate the result. I remained
responsible for product decisions, code review, and gameplay testing.

The dated commit history documents the work completed during the submission period.
