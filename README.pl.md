# Hand Sabers

Beat Saber bez VR: gra rytmiczna sterowana rękami przez kamerę. Frontend działa na Vite, backend to Express zapisujący mapy, audio i wyniki.

> **English version:** [README.md](README.md)

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

```plaintext
http://localhost:3000
```

To buduje frontend Vite, kompiluje `server.ts` do `dist-server/` i uruchamia skompilowany serwer Express. Ten tryb jest najprostszy do normalnego grania.

## Tryb developerski

Najwygodniej uruchomić backend i Vite razem:

```bash
npm run dev:vite
```

Adresy:

| Adres | Opis |
| --- | --- |
| `http://localhost:5173` | Gra (przez serwer Vite) |
| `http://localhost:3000` | Backend / API |

Vite proxy przekazuje wszystkie żądania `/api` do Expressa.

Można też uruchomić osobno:

```bash
npm run server   # buduje frontend + backend, uruchamia Express na porcie 3000
npm run dev      # tylko Vite (bez backendu — część funkcji przejdzie w fallback)
```

## Przydatne adresy

| URL | Opis |
| --- | --- |
| `http://localhost:3000` | Gra |
| `http://localhost:3000?dev` | Gra z panelem diagnostycznym |
| `http://localhost:3000/maps.html` | Biblioteka map i leaderboard |
| `http://localhost:3000/map-creator.html` | Kreator map (edytor w stylu DAW) |

W trybie Vite użyj tych samych ścieżek na porcie `5173`.

## Komendy

| Komenda | Opis |
| --- | --- |
| `npm run build` | Sprawdzenie TypeScript + produkcyjny build Vite |
| `npm run typecheck` | Sprawdzenie TypeScript (frontend) |
| `npm run typecheck:server` | Sprawdzenie TypeScript (serwer) |
| `npm run server:build` | Kompilacja `server.ts` → `dist-server/` |
| `npm run check` / `npm run lint` | Sprawdzenie składni JS |
| `npm run unit` | Testy jednostkowe |
| `npm run smoke` | Smoke test: uruchom skompilowany serwer, sprawdź API i stronę główną |
| `npm test` | Podstawowy zestaw testów |
| `npm run verify` | Pełna bramka jakości: lint → build → typecheck serwera → build serwera → unit → smoke |

## Sterowanie

| Akcja | Opis |
| --- | --- |
| `Escape` | Pauza / wznowienie |
| Drag & drop `.json` lub `.zip` na grę | Wczytaj mapę |
| Panel ustawień | No Fail, kolory mieczy, tryb jednej ręki, limit beatów, wydajność |

### Skróty klawiszowe kreatora map

| Skrót | Akcja |
| --- | --- |
| `Space` | Play / Pause |
| `Shift+Space` | Dodaj bombę |
| `F` / `J` | Tap lewy / prawy blok |
| `1`–`9` | Ustaw kierunek cięcia (lub zastosuj do zaznaczenia) |
| `R` | Następny kierunek cięcia |
| `Shift+R` | Stop (wróć do początku) |
| `Home` / `End` | Skocz na początek / koniec |
| `Tab` / `Shift+Tab` | Skocz do następnego / poprzedniego beatu |
| `[` / `]` | Ustaw LOOP START / END w bieżącej pozycji |
| `Delete` | Usuń zaznaczone (lub nearest beat do kursora) |
| `Escape` | Odznacz wszystko |
| `Ctrl+Z` / `Y` | Undo / Redo |
| `Ctrl+A` | Zaznacz wszystko |
| `Ctrl+C` / `V` | Kopiuj / Wklej |
| `Ctrl+D` | Duplikuj zaznaczenie |
| `Ctrl+S` | Zapisz |
| `+` / `−` | Zoom in / out |
| `Ctrl+Wheel` | Zoom wycentrowany na kursorze |
| Środkowy przycisk + drag | Przewijanie widoku timeline |
| PPM (puste miejsce) | Menu kontekstowe (seek, loop markers, wklej) |
| PPM (beat) | Usuń beat |
| `?` | Pokaż/ukryj ściągawkę skrótów |

## Dane lokalne

Serwer zapisuje pliki w katalogu `maps/`:

- `maps/beatdata/<id>.json` — dane mapy
- `maps/audio/<id>.<ext>` — audio mapy
- `maps/_scores.json` — leaderboard

Jeśli API nie działa, aplikacja używa fallbacku w przeglądarce:

- Mapy i wyniki w `localStorage`
- Audio kreatora w IndexedDB

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
    { "t": 1.2, "side": "left",  "type": "block", "cut": "any"  },
    { "t": 1.7, "side": "right", "type": "block", "cut": "down" },
    { "t": 3.1, "side": "left",  "type": "bomb",  "cut": "any"  }
  ]
}
```

Dozwolone wartości:

- `side`: `left`, `right`, `random`
- `type`: `block`, `bomb`
- `cut`: `any`, `down`, `up`, `left`, `right`, `down-left`, `down-right`, `up-left`, `up-right`

## REST API

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
| `/api/scores` | GET / POST | Leaderboard |

## Wskazówki do kamery

- Stań około 1–1.5 m od kamery.
- Ręce powinny być dobrze widoczne.
- Unikaj mocnego światła za plecami.
- Jeśli strony są zamienione, włącz **Odwróć strony kamery** w ustawieniach.
