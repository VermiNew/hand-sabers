# TODO — Hand Sabers

## 1. Migracja JS → TS

- [x] Przenieść wszystkie `.js` na `.ts` (zostaje tylko `src/vendor/jszip.min.js`)
- [x] Usunąć katalog `src/vendor/` i zastąpić go pakietem npm `jszip` (już jest w `dependencies`) — usunąć `src/jszip-loader.ts`, `scripts/sync-vendor.mjs`, `postinstall` z `package.json`, importować `jszip` bezpośrednio przez ESM

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
- [ ] Wybór modelu ML (lekki / dokładny) w ustawieniach – **zablokowane** (obecnie dostępny tylko model `float16`; brak alternatywnych modeli w MediaPipe)
- [x] Nowa strona/overlay "Pomoc" w menu — instrukcja gry + mini‑tutorial (PL i EN)

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

## 9. i18n — Polski i Angielski

- [x] Wybrać bibliotekę lub prosty system kluczy (np. `t('key')`)
- [x] Wyekstrahować wszystkie ciągi UI do plików tłumaczeń `pl.json` / `en.json`
- [x] Dodać przełącznik języka w ustawieniach
- [x] Przetłumaczyć UI na angielski

## 10. Tutorial

- [x] Zaprojektować flow tutoriala (krok po kroku: kalibracja → ruch → trafienie)
- [x] Overlay z instrukcjami wyświetlany przy pierwszym uruchomieniu
- [x] Możliwość pominięcia i powrotu do tutoriala z menu
- [ ] Przebudować tutorial tak, aby faktycznie wprowadzał do gry — interaktywne kroki z rzeczywistym śledzeniem rąk, testowaniem cięć i feedbackiem na żywo, a nie tylko tekst instrukcji

## 11. Menu pomocy

- [x] Strona/overlay "Jak grać" dostępna z głównego menu
- [x] Sekcje: sterowanie, scoring, ustawienia kamery, FAQ

## 12. Multiplayer

- [x] Architektura: WebSocket server, synchronizacja stanu gry — [projekt](docs/multiplayer.md)
- [x] Tryb współpracy (co‑op) i rywalizacji (score attack)
- [x] Synchronizacja beatów i wyników w czasie rzeczywistym

## 13. Lobby do Multiplayer

- [x] Tworzenie i dołączanie do pokoju (kod/link)
- [x] Lista graczy w lobby z gotowością
- [x] Wybór mapy przez hosta

## 14. Optymalizacja dla słabych PC

- [x] Profilowanie — znaleźć główne wąskie gardła na niskich ustawieniach — [wyniki](docs/performance-profiling.md)
- [x] Dalsze obniżanie jakości grafiki (wyłączenie mgły, siatek, efektów)
- [x] Adaptive quality — automatyczne obniżanie gdy FPS spada poniżej progu

## 15. Kamera/ML na telefon (remote tracking)

- [x] Architektura: telefon jako klient kamery + WebRTC lub WebSocket — [projekt](docs/remote-tracking.md)
- [x] Parowanie QR code lub kod z ekranu – zrealizowane (QR oraz pole ręcznego wpisania kodu w `remote-camera.html`)
- [x] Przekazywanie danych śledzenia rąk z telefonu do przeglądarki PC

## 16. Lepsza rozgrywka

- [ ] Balans trudności — krzywa nauki
- [x] Więcej wzorców sekwencji beatów (subtelne losowe pozycje nowych beatów w kreatorze)
- [x] Efekty trafienia bardziej satysfakcjonujące (shake, flash, dźwięk)

## 17. Edytor map

- [x] Rozbić `map-creator.html` na moduły: audio, ZIP, storage, waveform, UI, input
- [x] Czytelny preview "hit now" na osi czasu
- [x] Lepsze narzędzia do układania beatów (snap do BPM, kopiuj/wklej)
- [x] Podgląd mapy w trybie 3D podczas edycji
- [ ] Dodać timeline w stylu DaVinci Resolve — przewijany suwak czasu z dokładnym pozycjonowaniem, możliwością wpisania czasu ręcznie, zoomowaną osią czasu — celem jest wygodne pisanie tekstu dla narratora (Lyra) bez przycisków wyboru

## 18. Multiplayer — poprawki i co‑op

- [x] Przycisk "Opuść pokój" / "Rozłącz" w trybie Multiplayer
- [x] Wskaźnik stanu kalibracji każdego gracza (kto skalibrowany, kto jeszcze nie)
- [x] Tryb lobby z limitem graczy (2 osoby) → tryb co‑op
- [x] Co‑op: podział mieczy między graczy (host: lewy miecz, gość: prawy miecz)
- [x] Globalne ustawienia rozgrywki kontrolowane przez hosta (tryb treningowy, no fail itd.) — zablokować lokalne zmiany ustawień w Multiplayer
- [x] Wybór mapy przez hosta przez picker wzorowany na `maps.html`, bez opuszczania i rozłączania lobby
- [x] Ustawienie nazwy użytkownika (w ustawieniach lub na ekranie dołączania do Multiplayer)
- [x] Widok rąk/pozycji przeciwników i partnerów z drużyny widoczny na ekranie (poza trybem dev, w dyskretnym miejscu, aby nie zasłaniać obszaru gry)
- [x] Przenieść podgląd rąk ML innych graczy na lewą stronę ekranu (~50px od krawędzi), aby nie przeszkadzał w rozgrywce

## 19. Menu w trakcie gry (pauza)

- [x] Naprawić przycisk `ESC` — panel pauzy nie wyświetla się poprawnie w trakcie gry (Singleplayer i Multiplayer) — obecnie niedziałające
- [x] Singleplayer: Wznów, Restart, Wybierz mapę, Wróć do menu głównego
- [x] Multiplayer: Wróć do gry, Opuść pokój i wróć do menu głównego
- [x] Dodać przycisk "Przerwij" / "Anuluj" podczas wykrywania kamery i inicjalizacji śledzenia — gdy wystąpi problem, gracz nie ma jak przerwać
- [x] Menu pauzy musi pojawić się również gdy wystąpi błąd śledzenia (np. utrata rąk) z opcją ręcznego powrotu

## 20. Czat i komunikacja (backlog)

- [x] Czat tekstowy w Multiplayer
- [ ] Czat głosowy z avatarami podświetlającymi się przy mówieniu + animacje
- [ ] Czat drużynowy podczas gry — w lewym górnym rogu ekranu, odsunięty ~50px od rogu

## 21. Narrator (Lyra)

- [ ] Dodać ekspresje twarzy avatara narratora z `.agents/LORA`
- [ ] Wykorzystać narratora (`?narrator&text=""`) do czegoś pożytecznego w grze — [do ustalenia]
- [ ] Lyra ma mieć dobre serce i być pomocna w nauce — spersonalizować teksty, ton i reakcje
- [ ] Powiększyć kontener narratora — rozmiar ma być kalkulowany na początku, nie ma skakać gdy jest dużo tekstu
- [ ] Każdy znak tekstu narratora ma mieć fade-in (stopniowe pojawianie się) zamiast prostego typewriter effect
- [ ] Gdy na ekranie są przyciski narratora, gra ma zrobić pauzę dopóki gracz nie wybierze opcji
- [ ] Dodać tryb narratora bez przycisków — sam tekst z automatycznym przejściem (do użycia w kreatorze map i tutorialu)

## 22. Wizualizacje reagujące na muzykę i nowe tryby gry

- [x] Wstępne wizualizacje reaktywne na muzykę (pulsowanie tunelu, areny)
- [ ] Podnieść jakość wizualną do efektu "Wow" — cel: wygląd zbliżony do Unreal Engine, nie "basic"
- [ ] Elementy wizualne reagujące na muzykę, częstotliwości i beaty (zgodne z tym, co użytkownik mapuje w kreatorze)
- [ ] Nowe gamemode'y urozmaicające i udoskonalające rozgrywkę — [brak pomysłów, do burzy mózgów]

## 23. Bugi UI / build

- [x] Naprawić edytor map na porcie `:3000` (działa na `:5173`), usunięto błąd `Uncaught TypeError: Cannot read properties of null (reading 'width')` w buildzie gry
- [x] Poprawić łamanie tekstu i rozmieszczenie elementów w panelu ustawień
- [x] Usunąć "Phone camera" z menu głównego (menu zbyt wysokie) i przenieść konfigurację do ustawień jako nowe entry

## 24. Kamera/ML na telefonie — kalibracja (zob. też sekcja 15)

- [x] Kalibracja w trybie remote nie pyta o kamerę komputera, tylko korzysta z telefonu
- [x] Przesyłanie danych ML z telefonu do PC bez obrazu kamery (obraz pozostaje lokalnie na telefonie)

## 25. Mapy i import/export (zrobione)

- [x] Rozszerzyć format mapy o `meta.bpm`, `meta.artist`, `meta.mapper`, `meta.difficulty`, `meta.previewStartSec`
- [x] Dodać `upgradeMapFormat(map)` do automatycznej migracji starszych map
- [x] Zapisywać beatdata po stronie serwera w `maps/beatdata/<id>.json`
- [x] Zapisywać audio z kreatora/importu ZIP w `maps/audio/<id>.<ext>`
- [x] Odczytywać legacy‑mapy z `maps/<id>.json` i legacy‑audio z `maps/_audio/`
- [x] Eksportować ZIP z `map.json` i audio
- [x] Testy dla niepoprawnych ZIP‑ów i walidacja audio
- [x] Limit długości mapy / liczby beatów
- [x] Osobny moduł `server/storage/*`
- [x] Przenieść serwer do `server/index.js`, `server/routes`, `server/storage`
- [x] Testy jednostkowe dla `normalizeMap`, `isSafeZipPath`, `noteZAtSongTime`, `getSongTimeSec`

## 26. Usunięcie vendor i zastąpienie pakietem npm

- [x] Usunąć `src/vendor/jszip.min.js` i cały katalog `src/vendor/`
- [x] Usunąć `src/jszip-loader.ts` — zastąpić bezpośrednim `import JSZip from 'jszip'` w miejscach użycia
- [x] Usunąć `scripts/sync-vendor.mjs` i wpis `postinstall` z `package.json`
- [x] Zaktualizować wszystkie pliki importujące `getJSZip` aby używały bezpośredniego importu ESM

## 27. Wybór map jako modal (nie osobna strona)

- [ ] Przebudować `maps.html` na modal/overlay wewnątrz gry — przejście na osobną stronę rozłącza sesję WS telefonu
- [ ] Map picker ma być dostępny jako overlay z gry i z menu głównego bez przeładowania strony
- [ ] Zachować funkcjonalność leaderboardu, wyszukiwania i podglądu map w modalu
- [ ] Zapewnić że sesja remote tracking (telefon) nie zostaje rozłączona przy wyborze mapy

## 28. Kalibracja — dwa tryby i zapamiętywanie

- [ ] Dodać wybór trybu kalibracji przy wejściu:
  - **Manual Calibration** — gracz klika przyciski ręcznie aby przejść przez kroki
  - **Automatic Calibration** — automatyczne przejście przez kroki z opóźnieniem 2s między nimi (wolniej, z tekstem Lyry)
- [ ] Wydłużyć czas trwania kalibracji (obecnie zbyt krótka)
- [ ] Dodać opcję "Zapamiętaj kalibrację" — pomija kalibrację przy kolejnych uruchomieniach jeśli ustawienia kamery się nie zmieniły
- [ ] Dodać przycisk "Ponów kalibrację" w menu głównym i w ustawieniach gdy kalibracja jest zapamiętana

## 29. Telefon jako wyjście audio

- [ ] Dodać tryb "Audio na telefonie" — muzyka gra na telefonie zamiast na komputerze
- [ ] Dodać ustawienie offsetu audio (ms) w opcjach z przyciskiem "Odtwórz dźwięk testowy"
- [ ] Dodać tryb kalibracji metronomu (styl FL Studio) — gra robi "tik, tik, tik, tik, TIK", gracz klika spację w tempo, gra dopasowuje opóźnienie automatycznie
- [ ] Przesyłać strumień audio przez WebSocket do telefonu (lub WebRTC audio channel)

## 30. Osiągnięcia — pełna przebudowa

- [ ] Całkowicie przebudować system osiągnięć — bardziej satysfakcjonujące, z lepszymi nagrodami wizualnymi
- [ ] Dodać więcej osiągnięć z różnymi poziomami trudności
- [ ] Poprawić prezentację odblokowania osiągnięć (toast, animacje, dźwięki)
- [ ] Dodać kategorie osiągnięć (rozgrywka, multiplayer, kreator map, społeczność)

## 31. Renderowanie wyników gry

- [ ] Przebudować ekran wyników gry (singleplayer) — czytelny, gamingowy, z animacjami
- [ ] Dodać renderowanie wyników drużyny w Multiplayer (co-op i score-attack)
- [ ] Pokazywać statystyki graczy: trafienia, pudła, combo, accuracy, pełny breakdown
- [ ] Animowane liczenie punktów i progresja wyniku na ekranie game over

## 32. Profil użytkownika

- [ ] Dodać ekran profilu przy pierwszym wejściu do gry — wybór nazwy użytkownika i avatara
- [ ] Nazwa użytkownika używana globalnie: leaderboardy, multiplayer, singleplayer, czat
- [ ] Avatar używany w multiplayer, czacie drużynowym, profilu i narratorze
- [ ] Zapisać profil w localStorage i opcjonalnie na serwerze
- [ ] Dodać edycję profilu w ustawieniach

## 33. Refaktoryzacja modułów

- [ ] Rozbić `src/game/main.ts` (2188 linii) na mniejsze moduły bez uszkadzania kodu:
  - Menu główne i nawigacja
  - Pętla gry (render loop)
  - Obsługa pauzy
  - Obsługa kalibracji
  - Obsługa ustawień (bindings)
  - Integracja multiplayer
- [ ] Rozbić `src/game/gameplay.ts` (1015 linii) na logiczne moduły
- [ ] Rozbić `src/game/scene.ts` (720 linii) na moduły sceny
- [ ] Rozbić `src/maps/maps.ts` (723 linii) na moduły
- [ ] Rozbić `src/multiplayer/client.ts` (599 linii) na moduły
- [ ] Rozbić `src/tracking/tracking.ts` (613 linii) na moduły
- [ ] Rozbić `src/creator/input.ts` (619 linii) na moduły
- [ ] Każda refaktoryzacja musi zachować wszystkie funkcje i nie uszkodzić kodu — weryfikacja przez `npm run verify` po każdym kroku

## 34. Balans trudności

- [ ] Zaimplementować krzywą nauki — stopniowe zwiększanie trudności map
- [ ] Dodać system oceny trudności mapy na podstawie gęstości beatów, tempa i wzorców
- [ ] Dodać rekomendacje map dla graczy na podstawie ich postępów
- [ ] Dostosować hitboxy i timing okien dla początkujących vs zaawansowanych
