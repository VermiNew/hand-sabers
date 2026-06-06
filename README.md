# Hand Sabers

Beat Saber bez VR: gra rytmiczna sterowana rękami przez kamerę. Frontend działa na Vite, backend to Express zapisujący mapy, audio i wyniki.

## Wymagania

- Node.js 22.18+
- npm
- Kamera
- Chrome albo Edge z WebGL

## Instalacja

```bash
npm install
```

## Najprostsze uruchomienie

```bash
npm start
```

Otwórz w przeglądarce:

```text
http://localhost:3000
```

To buduje frontend Vite, kompiluje `server.ts` do `dist-server/` i uruchamia skompilowany serwer Express. Ten tryb jest najprostszy do normalnego grania.

## Tryb developerski

Najwygodniej uruchomić backend i Vite razem:

```bash
npm run dev:vite
```

Adresy:

- gra przez Vite: `http://localhost:5173`
- backend/API: `http://localhost:3000`
- Vite proxy przekazuje `/api` do Expressa

Można też uruchomić osobno:

```bash
npm run server
npm run dev
```

`npm run dev` odpala tylko Vite. Bez backendu część funkcji przejdzie w fallback przeglądarkowy.
`npm run server` buduje frontend i backend, a następnie uruchamia Express na porcie 3000.

## Przydatne adresy

| URL | Opis |
| --- | --- |
| `http://localhost:3000` | Gra |
| `http://localhost:3000?dev` | Gra z panelem diagnostycznym |
| `http://localhost:3000/maps.html` | Biblioteka map i leaderboard |
| `http://localhost:3000/map-creator.html` | Kreator map |

W trybie Vite użyj tych samych ścieżek na porcie `5173`.

## Komendy

```bash
npm run build
```

Typecheck frontendu i build produkcyjny Vite.

```bash
npm run typecheck
npm run typecheck:server
```

Sprawdzenie TypeScript dla frontendu i serwera.

```bash
npm run server:build
```

Kompilacja `server.ts` do `dist-server/`.

```bash
npm run check
npm run lint
npm run unit
npm run smoke
npm test
npm run verify
```

`check` sprawdza składnię JS, `lint` jest aliasem na `check`, `unit` odpala testy jednostkowe, a `smoke` uruchamia skompilowany serwer testowy i sprawdza API oraz stronę główną. `npm test` odpala podstawowy zestaw testów, a `npm run verify` pełną bramkę jakości: lint, build, typecheck serwera, build serwera, unit i smoke.

## Sterowanie

| Akcja | Opis |
| --- | --- |
| `Escape` | Pauza |
| Drag & drop `.json` lub `.zip` na grę | Wczytaj mapę |
| Panel ustawień | No Fail, kolory mieczy, tryb jednej ręki, limit beatów, wydajność |

## Dane lokalne

Serwer zapisuje pliki w katalogu `maps/`:

- `maps/beatdata/<id>.json` - mapy
- `maps/audio/<id>.<ext>` - audio map
- `maps/_scores.json` - leaderboard

Jeśli API nie działa, aplikacja używa fallbacku w przeglądarce:

- mapy i wyniki w `localStorage`
- audio kreatora w IndexedDB

## Format mapy

```json
{
  "formatVersion": 1,
  "id": "map-123",
  "meta": {
    "title": "Nazwa utworu",
    "duration": 180
  },
  "beats": [
    { "t": 1.2, "side": "left", "type": "block", "cut": "any" },
    { "t": 1.7, "side": "right", "type": "block", "cut": "down" },
    { "t": 3.1, "side": "left", "type": "bomb", "cut": "any" }
  ]
}
```

Dozwolone wartości:

- `side`: `left`, `right`, `random`
- `type`: `block`, `bomb`
- `cut`: `any`, `down`, `up`, `left`, `right`, `down-left`, `down-right`, `up-left`, `up-right`

## API

| Endpoint | Metoda | Opis |
| --- | --- | --- |
| `/api/health` | GET | Status serwera |
| `/api/maps` | GET | Lista map |
| `/api/maps/:id` | GET | Pobierz mapę |
| `/api/maps/:id/audio` | GET | Pobierz audio mapy |
| `/api/maps/:id/export.zip` | GET | Eksport ZIP |
| `/api/maps` | POST | Zapis mapy JSON |
| `/api/maps/save` | POST | Zapis z kreatora z opcjonalnym audio |
| `/api/maps/import` | POST | Import `.json` albo `.zip` |
| `/api/maps/:id` | DELETE | Usuń mapę |
| `/api/scores` | GET/POST | Leaderboard |

## Wskazówki do kamery

- Stań około 1-1.5 m od kamery.
- Ręce powinny być dobrze widoczne.
- Unikaj mocnego światła za plecami.
- Jeśli strony są zamienione, włącz `Odwróć strony kamery` w ustawieniach.
