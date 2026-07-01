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
- [x] Architektura remote tracking: obliczenia ML na telefonie → WebRTC/WebSocket → PC — [projekt](docs/remote-tracking.md)
- [x] Cacheowanie modelu ML w przeglądarce (Service Worker / IndexedDB)
- [ ] Wybór modelu ML (lekki / dokładny) w ustawieniach
- [x] Nowa strona/overlay "Pomoc" w menu — instrukcja gry + mini-tutorial (PL i EN)

## 8. TODO techniczne (backlog)
- [ ] Przetestować `audioOffsetMs` na kilku urządzeniach (Bluetooth, przewodowe, głośniki)
- [x] Ujednolicić creator i gameplay wokół `src/core/timing.ts`
- [x] Dodać komunikat UI przy pliku >100 MB zamiast alertu
- [x] Dodać bardziej precyzyjne komunikaty błędów w `maps.html` i `map-creator.html`
- [x] Dodać ustawienie prędkości nut / difficulty presets (bez zmiany `beat.t`)
- [x] Dodać tryb treningowy (wolniejsze tempo, bez zapisu wyniku)
- [x] Dodać lepsze feedbacki trafienia: kierunek cięcia, accuracy ms
- [x] Rozważyć własne sample audio (import `.wav/.ogg`) dla trafienia/bomby/pudła — [decyzja](docs/audio-samples.md)
- [x] Przejrzeć hitboxy po kalibracji; dodać opcję czułości niezależną od tracking sensitivity
- [x] Dodać osobny ekran diagnostyczny kamery bez `?dev`
- [x] Naprawić build kreatora map tak, aby nie ładował entry gry i nie uruchamiał canvas/Three poza ekranem gry

## 8. i18n — Polski i Angielski
- [x] Wybrać bibliotekę lub prosty system kluczy (np. `t('key')`)
- [x] Wyekstrahować wszystkie ciągi UI do plików tłumaczeń `pl.json` / `en.json`
- [x] Dodać przełącznik języka w ustawieniach
- [x] Przetłumaczyć UI na angielski

## 9. Tutorial
- [x] Zaprojektować flow tutoriala (krok po kroku: kalibracja → ruch → trafienie)
- [x] Overlay z instrukcjami wyświetlany przy pierwszym uruchomieniu
- [x] Możliwość pominięcia i powrotu do tutoriala z menu

## 10. Menu pomocy
- [x] Strona/overlay "Jak grać" dostępna z głównego menu
- [x] Sekcje: sterowanie, scoring, ustawienia kamery, FAQ

## 11. Multiplayer
- [x] Architektura: WebSocket server, synchronizacja stanu gry — [projekt](docs/multiplayer.md)
- [x] Tryb współpracy (co-op) i rywalizacji (score attack)
- [x] Synchronizacja beatów i wyników w czasie rzeczywistym

## 12. Lobby do Multiplayer
- [x] Tworzenie i dołączanie do pokoju (kod/link)
- [x] Lista graczy w lobby z gotowością
- [x] Wybór mapy przez hosta

## 13. Optymalizacja dla słabych PC
- [ ] Profilowanie — znaleźć główne wąskie gardła na niskich ustawieniach
  - [x] Dodać profiler p95 z korelacją klatek zawierających detekcję ML
  - [x] Pomiar referencyjny na obecnym PC: frame p95 20,0 ms, render p95 1,7 ms, detect p95 2,3 ms
  - [ ] Powtórzyć pomiar (`Frame+ML p95` / `Frame base p95`) na słabym PC
- [x] Dalsze obniżanie jakości grafiki (wyłączenie mgły, siatek, efektów)
- [x] Adaptive quality — automatyczne obniżanie gdy FPS spada poniżej progu

## 14. Kamera/ML na telefon (remote tracking)
- [x] Architektura: telefon jako klient kamery + WebRTC lub WebSocket — [projekt](docs/remote-tracking.md)
- [x] Parowanie przez QR code lub kod z ekranu
- [ ] Przekazywanie danych śledzenia rąk z telefonu do przeglądarki PC

## 15. Lepsza rozgrywka
- [x] Balans trudności — krzywa nauki w trybie losowym
- [x] Więcej wzorców sekwencji beatów (subtelne losowe pozycje nowych beatów w kreatorze)
- [x] Efekty trafienia bardziej satysfakcjonujące (shake, flash, dźwięk)

## 16. Edytor map
- [x] Rozbić `map-creator.html` na moduły: audio, ZIP, storage, waveform, UI, input
- [x] Czytelny preview "hit now" na osi czasu
- [x] Lepsze narzędzia do układania beatów (snap do BPM, kopiuj/wklej)
- [ ] Podgląd mapy w trybie 3D podczas edycji

## 17. Multiplayer — poprawki i co-op
- [x] Przycisk "Opuść pokój" / "Rozłącz" w trybie Multiplayer
- [x] Wskaźnik stanu kalibracji każdego gracza (kto skalibrowany, kto jeszcze nie)
- [x] Tryb lobby z limitem graczy (np. 2 osoby) → tryb co-op
- [x] Co-op: podział mieczy między graczy (jeden gracz lewy miecz, drugi prawy; lub jeden gracz prawy miecz, a drugi lewy)
- [x] Globalne ustawienia rozgrywki kontrolowane przez hosta (tryb treningowy, no fail itd.) — zablokować lokalne zmiany ustawień w Multiplayer
- [x] Wybór mapy przez hosta przez `map.html` (otwiera picker, wybór utworu wraca do lobby bez wyrzucania/rozłączania) zamiast wyboru po identyfikatorze `map-*`
- [x] Ustawienie nazwy użytkownika (w ustawieniach lub na ekranie dołączania do Multiplayer)

## 18. Menu w trakcie gry (pauza)
- [x] Naprawić przycisk `ESC` — panel pauzy nie wyświetla się w trakcie gry (Singleplayer i Multiplayer)
- [x] Singleplayer: Wznów, Restart, Wróć do menu głównego, Koniec
- [x] Multiplayer: Wróć do gry, Opuść pokój i wróć do menu głównego

## 19. Czat i komunikacja (backlog)
- [ ] Czat tekstowy w Multiplayer
- [ ] (przyszłość) Czat głosowy z avatarami podświetlającymi się przy mówieniu + animacje

## 20. Narrator (Lora)
- [x] Dodać ekspresje twarzy avatara narratora z `.agents/LORA`
- [x] Wykorzystać narratora (`?narrator&text=""`) do czegoś pożytecznego związanego z grą — coaching po rundzie singleplayer

## 21. Wizualizacje reagujące na muzykę i nowe tryby gry
- [ ] Elementy wizualne reagujące na muzykę, częstotliwości i beaty (zgodne z tym, co użytkownik mapuje w kreatorze)
- [ ] Nowe gamemode urozmaicające i udoskonalające rozgrywkę

## 22. Bugi UI / build
- [x] Naprawić edytor map na porcie `:3000` (na `:5173` działa) — błąd `Uncaught TypeError: Cannot read properties of null (reading 'width')` w buildzie gry (`game-*.js`); przez serwer produkcyjny na `:3000` edytor map się nie ładuje
- [x] Poprawić łamanie tekstu i rozmieszczenie elementów w panelu ustawień
- [x] Usunąć "Phone camera" z menu głównego (menu zbyt wysokie — nie dodawać nowych entry) i przenieść konfigurację do ustawień jako nowe entry

## 23. Kamera/ML na telefonie — kalibracja (zob. też sekcja 14)
- [ ] Kalibracja w trybie remote nie powinna pytać o kamerę komputera, tylko o telefon
- [ ] Przesyłanie obrazu z kamery i danych ML z telefonu do PC — [do rozwiązania]

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
