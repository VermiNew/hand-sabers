# TODO — Hand Sabers

## 1. Migracja JS → TS
- [x] Przenieść wszystkie `.js` na `.ts` (zostaje tylko `src/vendor/jszip.min.js`)

## 2. UX całości gry
- [x] Przejrzeć i poprawić flow każdego ekranu (menu, kalibracja, gameplay, game over)
- [x] Spójne animacje przejść między ekranami
- [x] Lepszy feedback dla gracza (dźwięki, wibracje wizualne)

## 3. Ustawienia
- [x] Przeprojektować panel ustawień — czytelne sekcje (audio, grafika, sterowanie, gameplay)
- [x] Podgląd zmian na żywo (np. głośność, kolor mieczy) bez restartu
- [x] Zapisywanie i resetowanie ustawień do domyślnych

## 4. Panel debugowania
- [x] Podstawowy dev panel (FPS, timing, pool)
- [x] Dodać wizualny marker `hit plane` w trybie `?dev`
- [x] Podgląd najbliższych 3 beatów: czas nuty, delta ms, strona, typ

## 5. Trzy modele mieczy
- [x] Zaimplementować wybór spośród 3 modeli geometrii miecza (np. klasyczny, szeroki, cienki)
- [x] Picker modelu w ustawieniach z podglądem 3D

## 6. Więcej kolorów i lepszy picker
- [x] Zastąpić prosty input[type=color] pełnym color pickerem (HSL/HEX/RGB)
- [x] Więcej presetów kolorów dla mieczy

## 7. UX / Animacje (backlog)
- [x] Animacje fade-in/fade-out przy otwieraniu i zamykaniu paneli (ustawienia, game over, pauza, overlay)
- [x] Przeprojektować panel game over (czytelny, gamingowy styl)
- [x] Poprawić pasek zdrowia (animacje, stany: full/mid/low/critical)
- [x] Pasek timera/postępu utworu — wyraźniejszy, z timecodem
- [x] Wskaźnik rytmu: feedback czy gracz cina za wcześnie / za późno (accuracy ms na ekranie)
- [x] Komunikat "zgubiono ręce": pokazać podgląd ML, auto-resume po 1s stabilności z timerem!
- [x] Poprawić kontenery KAMERA RAW / ŚLEDZENIE ML w trybie dev (prawy dolny róg)
- [x] Całkowity remake systemu cieni i odbić w scenie 3D (subtelne, nieprzesadzone)
- [x] Poprawić system wydajności (profile, adaptive quality)
- [ ] Architektura remote tracking: obliczenia ML na telefonie → WebRTC/WebSocket → PC
- [ ] Cacheowanie modelu ML w przeglądarce (Service Worker / IndexedDB)
- [ ] Wybór modelu ML (lekki / dokładny) w ustawieniach
- [ ] Nowa strona/overlay "Pomoc" w menu — instrukcja gry + mini-tutorial (PL i EN)

## 8. TODO techniczne (backlog)
- [ ] Przetestować `audioOffsetMs` na kilku urządzeniach (Bluetooth, przewodowe, głośniki)
- [x] Ujednolicić creator i gameplay wokół `src/core/timing.ts`
- [x] Dodać komunikat UI przy pliku >100 MB zamiast alertu
- [x] Dodać bardziej precyzyjne komunikaty błędów w `maps.html` i `map-creator.html`
- [ ] Dodać ustawienie prędkości nut / difficulty presets (bez zmiany `beat.t`)
- [ ] Dodać tryb treningowy (wolniejsze tempo, bez zapisu wyniku)
- [ ] Dodać lepsze feedbacki trafienia: kierunek cięcia, accuracy ms
- [ ] Rozważyć własne sample audio (import `.wav/.ogg`) dla trafienia/bomby/pudła
- [ ] Przejrzeć hitboxy po kalibracji; dodać opcję czułości niezależną od tracking sensitivity
- [ ] Dodać osobny ekran diagnostyczny kamery bez `?dev`

## 8. i18n — Polski i Angielski
- [x] Wybrać bibliotekę lub prosty system kluczy (np. `t('key')`)
- [x] Wyekstrahować wszystkie ciągi UI do plików tłumaczeń `pl.json` / `en.json`
- [x] Dodać przełącznik języka w ustawieniach
- [x] Przetłumaczyć UI na angielski

## 9. Tutorial
- [ ] Zaprojektować flow tutoriala (krok po kroku: kalibracja → ruch → trafienie)
- [ ] Overlay z instrukcjami wyświetlany przy pierwszym uruchomieniu
- [ ] Możliwość pominięcia i powrotu do tutoriala z menu

## 10. Menu pomocy
- [ ] Strona/overlay "Jak grać" dostępna z głównego menu
- [ ] Sekcje: sterowanie, scoring, ustawienia kamery, FAQ

## 11. Multiplayer
- [ ] Architektura: WebSocket server, synchronizacja stanu gry
- [ ] Tryb współpracy (co-op) i rywalizacji (score attack)
- [ ] Synchronizacja beatów i wyników w czasie rzeczywistym

## 12. Lobby do Multiplayer
- [ ] Tworzenie i dołączanie do pokoju (kod/link)
- [ ] Lista graczy w lobby z gotowością
- [ ] Wybór mapy przez hosta

## 13. Optymalizacja dla słabych PC
- [ ] Profilowanie — znaleźć główne wąskie gardła na niskich ustawieniach
- [ ] Dalsze obniżanie jakości grafiki (wyłączenie mgły, siatek, efektów)
- [x] Adaptive quality — automatyczne obniżanie gdy FPS spada poniżej progu

## 14. Kamera/ML na telefon (remote tracking)
- [ ] Architektura: telefon jako klient kamery + WebRTC lub WebSocket
- [ ] Parowanie przez QR code lub kod z ekranu
- [ ] Przekazywanie danych śledzenia rąk z telefonu do przeglądarki PC

## 15. Lepsza rozgrywka
- [ ] Balans trudności — krzywa nauki
- [ ] Więcej wzorców sekwencji beatów
- [x] Efekty trafienia bardziej satysfakcjonujące (shake, flash, dźwięk)

## 16. Edytor map
- [x] Rozbić `map-creator.html` na moduły: audio, ZIP, storage, waveform, UI, input
- [ ] Czytelny preview "hit now" na osi czasu
- [ ] Lepsze narzędzia do układania beatów (snap do BPM, kopiuj/wklej)
- [ ] Podgląd mapy w trybie 3D podczas edycji

## Mapy i import/export (zrobione)
- [x] Rozszerzyć format mapy o `meta.bpm`, `meta.artist`, `meta.mapper`, `meta.difficulty`, `meta.previewStartSec`
- [x] Dodać `upgradeMapFormat(map)` do automatycznej migracji starych map
- [x] Zapisywać beatdata po stronie serwera w `maps/beatdata/<id>.json`
- [x] Zapisywać audio z kreatora/importu ZIP w `maps/audio/<id>.<ext>`
- [x] Odczytywać legacy mapy z `maps/<id>.json` i legacy audio z `maps/_audio/`
- [x] Eksportować ZIP z `map.json` i audio
- [x] Testy dla złych ZIP-ów i walidacja audio
- [x] Limit długości mapy / liczby beatów
- [x] Osobny moduł `server/storage/*`
- [x] Przenieść serwer do `server/index.js`, `server/routes`, `server/storage`
- [x] Testy jednostkowe dla `normalizeMap`, `isSafeZipPath`, `noteZAtSongTime`, `getSongTimeSec`
