# TODO — Hand Sabers

## Najbliższe kroki

- [ ] Przetestować `audioOffsetMs` na kilku urządzeniach: laptopowe głośniki, słuchawki przewodowe, Bluetooth. Jeśli Bluetooth mocno odstaje, dodać preset offsetu.
- [ ] Dodać wizualny marker `hit plane` w trybie `?dev`, żeby było widać dokładne miejsce trafienia kostki.
- [ ] Dodać w dev panelu podgląd najbliższych 3 beatów: czas nuty, delta ms, strona, typ.
- [ ] Ujednolicić creator i gameplay wokół jednego modułu `src/core/timing.js`; podstawy już są, ale edytor może jeszcze dostać czytelny preview „hit now”.
- [x] Dodać testy jednostkowe dla `normalizeMap`, `isSafeZipPath`, `noteZAtSongTime` i `getSongTimeSec`.

## Mapy i import/export

- [x] Rozszerzyć format mapy o formalne `meta.bpm`, `meta.artist`, `meta.mapper`, `meta.difficulty`, `meta.previewStartSec`.
- [x] Dodać `upgradeMapFormat(map)`, żeby stare mapy można było automatycznie migrować przy ładowaniu.
- [x] Zapisywać beatdata po stronie serwera w `maps/beatdata/<id>.json`.
- [x] Zapisywać audio z kreatora/importu ZIP w `maps/audio/<id>.<ext>`.
- [x] Odczytywać legacy mapy z `maps/<id>.json` i legacy audio z `maps/_audio/`.
- [x] Eksportować ZIP z `map.json` i audio, jeśli audio jest zapisane na serwerze.
- [ ] Dodać komunikat UI przy pliku >100 MB zamiast samego alertu/błędu technicznego.

## Stabilność i bezpieczeństwo

- [x] Dodać testy dla złych ZIP-ów: brak `map.json`, złe ścieżki, niepoprawny JSON, brak beatów.
- [x] Dodać walidację audio w creatorze: obsługiwany format, czy dekodowanie przeszło, duration > 0.
- [x] Dodać limit długości mapy / liczby beatów, żeby przypadkowa mapa z milionem obiektów nie zabiła przeglądarki.
- [x] Zrobić osobny moduł `server/storage/*` dla map, wyników i późniejszego audio.
- [ ] Dodać bardziej precyzyjne komunikaty błędów w `maps.html` i `map-creator.html`.

## Gameplay / feel

- [ ] Dodać ustawienie prędkości nut lub difficulty presets, ale bez zmiany znaczenia czasu nuty — `beat.t` zawsze musi oznaczać moment trafienia.
- [ ] Dodać tryb treningowy z wolniejszym tempem i bez zapisu wyniku.
- [ ] Dodać lepsze feedbacki trafienia: kierunek cięcia, accuracy ms, osobny efekt perfect/good/bad.
- [ ] Rozważyć własne sample audio w ustawieniach, np. import pliku `.wav/.ogg` dla trafienia, bomby i pudła. Obecnie wszystkie dźwięki mają osobne suwaki głośności.
- [ ] Przejrzeć hitboxy mieczy po kalibracji i dodać opcję czułości hitboxów niezależną od tracking sensitivity.
- [ ] Dodać osobny ekran diagnostyczny kamery także bez `?dev`.

## Refactor

- [ ] Rozbić `map-creator.html` na moduły: audio, ZIP, storage, waveform, UI, input.
- [ ] Przenieść CSS dużych overlayów/menu do mniejszych sekcji lub plików.
- [x] Przenieść serwer do `server/index.js`, `server/routes`, `server/storage`.
- [ ] Po stabilizacji przejść pełniej na Vite, ale dopiero gdy mapy/audio/timing są już przewidywalne.
