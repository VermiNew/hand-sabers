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
- [x] Potwierdzenie rozłączenia telefonu — przycisk „Rozłącz" z panelem potwierdzenia (TAK/ANULUJ)
- [x] Zapamiętany stan połączenia — zamknięcie modala nie rozłącza telefonu; UI odtwarza stan po ponownym otwarciu
- [x] Przycisk „Utwórz nowy kod" widoczny po rozłączeniu (zamiast natychmiastowego generowania)

## 16. Lepsza rozgrywka

- [x] Balans trudności — krzywa nauki
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
- [x] Powiększyć kontener narratora — rozmiar ma być kalkulowany na początku, nie ma skakać gdy jest dużo tekstu. — stały, przewijany obszar pięciu linii na desktopie i większy na mobile, zweryfikowany smoke długiej rozmowy.
- [x] Każdy znak tekstu narratora ma mieć fade-in (stopniowe pojawianie się) zamiast prostego typewriter effect. — każdy wpisywany znak otrzymuje `.narrator-char` z animacją, z poszanowaniem `prefers-reduced-motion`.
- [x] Gdy na ekranie są przyciski narratora, gra ma zrobić pauzę dopóki gracz nie wybierze opcji. — zdarzenia `hand-sabers:narrator-pause`/`resume` zatrzymują i bezpiecznie wznawiają timeline.
- [x] Dodać tryb narratora bez przycisków — sam tekst z automatycznym przejściem (do użycia w kreatorze map i tutorialu). — `narratorQuick` korzysta z `autoAdvanceMs` bez tworzenia kontrolek.

## 22. Wizualizacje reagujące na muzykę i nowe tryby gry

- [x] Wstępne wizualizacje reaktywne na muzykę (pulsowanie tunelu, areny)
- [ ] Podnieść jakość wizualną do efektu "Wow" — cel: wygląd zbliżony do Unreal Engine, nie "basic"
- [x] Elementy wizualne reagujące na muzykę, częstotliwości i beaty (zgodne z tym, co użytkownik mapuje w kreatorze) — analizator FFT rozdziela bas/środek/górę, a posortowane czasy beatów mapy sterują impulsami portali, tła i efektów trafień.
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

- [x] Przebudować `maps.html` na modal/overlay wewnątrz gry — przejście na osobną stronę rozłącza sesję WS telefonu
- [x] Map picker ma być dostępny jako overlay z gry i z menu głównego bez przeładowania strony
- [x] Zachować funkcjonalność leaderboardu, wyszukiwania i podglądu map w modalu
- [x] Zapewnić że sesja remote tracking (telefon) nie zostaje rozłączona przy wyborze mapy

## 28. Kalibracja — dwa tryby i zapamiętywanie

- [x] Dodać wybór trybu kalibracji przy wejściu:
  - **Manual Calibration** — gracz klika przyciski ręcznie aby przejść przez kroki
  - **Automatic Calibration** — automatyczne przejście przez kroki z opóźnieniem 2s między nimi (wolniej, z tekstem Lyry)
- [x] Wydłużyć czas trwania kalibracji (obecnie zbyt krótka)
- [x] Dodać opcję "Zapamiętaj kalibrację" — pomija kalibrację przy kolejnych uruchomieniach jeśli ustawienia kamery się nie zmieniły
- [x] Dodać przycisk "Ponów kalibrację" w menu głównym i w ustawieniach gdy kalibracja jest zapamiętana

## 29. Telefon jako wyjście audio

- [x] Dodać tryb "Audio na telefonie" — muzyka gra na telefonie zamiast na komputerze (ustawienie + wyciszenie PC)
- [x] Dodać ustawienie offsetu audio (ms) w opcjach z przyciskiem "Odtwórz dźwięk testowy"
- [x] Dodać tryb kalibracji metronomu (styl FL Studio) — gra robi "tik, tik, tik, tik, TIK", gracz klika spację w tempo, gra dopasowuje opóźnienie automatycznie
- [x] Przesyłać sterowanie audio przez WebSocket do telefonu — host wysyła komendy `audio-prepare`/`audio-play`/`audio-pause`/`audio-stop`/`audio-volume`/`audio-seek`, telefon odtwarza z URL, wyciszenie PC po `audio-ready`, fallback na PC przy rozłączeniu

## 30. Osiągnięcia — pełna przebudowa

- [x] Całkowicie przebudować system osiągnięć — bardziej satysfakcjonujące, z lepszymi nagrodami wizualnymi
- [x] Dodać więcej osiągnięć z różnymi poziomami trudności (kategorie: rozgrywka, multiplayer, kreator, społeczność; tiery: bronze/silver/gold/diamond)
- [x] Poprawić prezentację odblokowania osiągnięć (toast z tier-kolorami, animacje, kategorie w gridzie)
- [x] Dodać kategorie osiągnięć (rozgrywka, multiplayer, kreator map, społeczność)

## 31. Renderowanie wyników gry

- [x] Przebudować ekran wyników gry (singleplayer) — czytelny, gamingowy, z animacjami — logika renderowania wyekstrahowana do `src/game/results.ts`
- [x] Dodać renderowanie wyników drużyny w Multiplayer (co-op i score-attack) — coop: wynik zespołu + karty graczy; score-attack: ranking z pozycjami, avatarami, medalami
- [x] Pokazywać statystyki graczy: trafienia, pudła, combo, accuracy, pełny breakdown — SP: accuracy, combo, hits, misses, perfects; MP: score, combo, progress, pozycja, DNF
- [x] Animowane liczenie punktów i progresja wyniku na ekranie game over — wynik singleplayer płynnie rośnie do wartości końcowej, zachowuje pełną wartość w ARIA i natychmiastowy rendering przy `prefers-reduced-motion`.

## 32. Profil użytkownika

- [x] Dodać ekran profilu przy pierwszym wejściu do gry — wybór nazwy użytkownika i avatara
- [x] Nazwa użytkownika używana globalnie: leaderboardy, multiplayer, singleplayer, czat
- [x] Avatar używany w multiplayer, czacie drużynowym, profilu i narratorze — avatar zintegrowany z protokołem (lobby, czat, podgląd rąk), walidacja allowlistą, aktualizacja na żywo przez `set-profile`
- [x] Zapisać profil w localStorage (ustawienia `playerName`, `avatar`, `profileCompleted`)
- [x] Dodać edycję profilu w ustawieniach — sekcja profilu z nazwą i avatarem, zapis z feedbackiem, event `profile-updated` do aktualizacji multiplayera na żywo

## 33. Refaktoryzacja modułów

- [x] Rozbić `src/game/main.ts` (obecnie 1357 linii) na mniejsze moduły bez uszkadzania kodu:
  - [x] Wydzielić kontroler wersjonowanego eksportu/importu ustawień do `src/ui/settings-transfer.ts`
  - [x] Wydzielić kontrolki wyboru języka do `src/ui/language-settings.ts`
  - [x] Wydzielić pełną obsługę edycji profilu w ustawieniach do `src/game/profile.ts`
  - [x] Wydzielić pełną obsługę ustawień audio, metronomu i audio telefonu do `src/game/audio-settings.ts`
  - [x] Wydzielić pełną obsługę ustawień rozgrywki do `src/game/gameplay-settings.ts` (no-fail, trening, limit beatów, jedna ręka, prędkość nut, hitboxy i tryb gry)
  - [x] Wydzielić wygląd mieczy do `src/game/saber-settings.ts` (presety i własne kolory, kolory bloków, podglądy, modele i reset)
  - [x] Wydzielić wybór i aplikowanie motywu areny do `src/game/arena-settings.ts`, wraz z poprawną synchronizacją po resecie
  - [x] Wydzielić ustawienia efektów reagujących na muzykę do `src/game/music-reactive-settings.ts` oraz wspólną obsługę stylowanych suwaków do `src/ui/settings-range.ts`
  - [x] Wydzielić profile wydajności i pełny zestaw ustawień custom graphics do `src/game/graphics-settings.ts`, z aktualizacją sceny na żywo i synchronizacją resetu
  - [x] Wydzielić ustawienia źródła trackingu i odwrócenia kamery do `src/game/tracking-settings.ts`, z jawnym callbackiem zatrzymującym aktywny tracking po zmianie źródła
  - [x] Wydzielić ustawienia trybu deweloperskiego, akcentu i wejścia przez `?dev` do `src/game/developer-settings.ts`
  - [x] Wydzielić powłokę menu głównego i nawigację ustawień do `src/game/main-menu-shell.ts` (animacje, focus, zakładki, backdrop, Escape i akcje przez callbacki)
  - [x] Wydzielić toast, statystyki, siatkę i progres osiągnięć do `src/game/achievement-ui.ts`, bez budowania dynamicznych kart przez `innerHTML`
  - [x] Pętla gry (render loop)
    - [x] Wydzielić obliczanie delta time, limit kroku symulacji i wygładzanie profilu do `src/game/frame-timing.ts`
    - [x] Wydzielić aktualizację shaderów areny reagujących na muzykę do `src/game/arena-reactive-frame.ts`
    - [x] Wydzielić światła, traile, odłamki, odbicia, drgania i ruch kamery do `src/game/frame-effects.ts`
    - [x] Wydzielić render WebGL, adaptive quality i raportowanie panelu dev do `src/game/frame-renderer.ts`
    - [x] Wydzielić obsługę fazy klatki dla menu, rozgrywki, pauzy i bezczynności do `src/game/frame-game-phase.ts`
  - [x] Obsługa pauzy
    - [x] Wydzielić komunikaty, tłumaczenia, stan przycisku wznowienia i warianty akcji SP/MP do `src/game/pause-ui.ts`
    - [x] Zamknąć timer focus guard i ochronę przed równoległym wznowieniem w `src/game/pause-resume-guard.ts`
    - [x] Wydzielić ochronę blur/focus/visibility i wariant ostrzeżenia Multiplayer do `src/game/gameplay-focus-protection.ts`
    - [x] Wydzielić timery utraty/powrotu dłoni, regułę jednej ręki i auto-resume do `src/game/hands-pause-controller.ts`
    - [x] Rozdzielić UX pauzy ręcznej od pauzy po utracie trackingu ML: ręczna pauza ma pokazywać zwykłe menu akcji, a utrata dłoni dedykowany stan z podglądem kamery/ML, informacją o brakujących dłoniach, progressem stabilizacji i auto-resume. Stan trackingu zachowuje bezpieczne wyjście do menu bez pokazywania pełnego modala pauzy.
    - [x] Wydzielić zdarzenia pauzy/wznowienia wywoływane przez przyciski narratora do `src/game/narrator-pause-events.ts`
  - [x] Obsługa kalibracji
    - [x] Wydzielić panel, selektor auto/manual, widoczność kroków i opcję zapamiętania do `src/game/calibration-ui.ts`
    - [x] Wydzielić stan gotowości, przebieg auto/manual, kolejne kroki i zapis zakresów do `src/game/calibration-controller.ts`
    - [x] Zablokować przejście kroku przed wyborem trybu oraz równoległe/dwukrotne zakończenie kroku przez auto-advance, przycisk lub skrót
  - [x] Obsługa ustawień (bindings) — inicjalizacja kontrolerów ustawień i obsługa resetu są w `src/game/settings-bindings.ts`
  - [x] Wydzielić rejestrację zdarzeń zdalnego audio telefonu i fallback głośności PC do `src/game/phone-audio-events.ts`
  - [x] Wydzielić startowy wybór języka, rekomendację ustawień i otwieranie tutoriala do `src/game/startup-guidance.ts`
  - [x] Wydzielić zdarzenie wyboru mapy i feedback Lyry do `src/game/map-selection-events.ts`
  - [x] Integracja multiplayer
    - [x] Wydzielić walidację i rejestrację zdarzeń przygotowania, startu oraz wyników rundy do `src/game/multiplayer-events.ts`
    - [x] Wydzielić stan sesji, przygotowanie mapy, start zsynchronizowanej rundy, wynik końcowy i powrót do reguł singleplayer do `src/game/multiplayer-round-session.ts`
- [x] Rozbić `src/game/gameplay.ts` (1015 linii) na logiczne moduły
  - [x] Wydzielić reguły prędkości nut, trybu treningowego i czasu podejścia do `src/game/gameplay-speed.ts`
  - [x] Wydzielić geometrię hitboxu ostrza, pomiar swingu i czułość trafień do `src/game/saber-hitbox.ts`
  - [x] Wydzielić geometrie, materiały, kolory i pule bloków oraz bomb do `src/game/gameplay-block-pool.ts`, zachowując eksporty kolorów w `gameplay.ts`
  - [x] Wydzielić odłamki trafień, fallback pyłu, prewarm, animację, reset i zwalnianie efektów do `src/game/gameplay-hit-effects.ts`, zachowując eksport `updateSparks` w `gameplay.ts`
- [x] Rozbić `src/game/scene.ts` (720 linii) na moduły sceny
  - [x] Wydzielić stan, wygaszanie i aplikowanie drgań kamery do `src/game/camera-shake.ts`, zachowując publiczne API sceny
  - [x] Wydzielić geometrię, uniformy, shadery i aplikowanie palety tła do `src/game/arena-background.ts`, zachowując publiczne `bgMat` i `applyBackgroundTheme` w scenie
  - [x] Wydzielić fabrykę geometrii mieczy, ich dane wizualne i warianty modeli do `src/game/saber-visual.ts`, zachowując publiczne API sceny
- [x] Rozbić `src/maps/maps.ts` (723 linii) na moduły
  - [x] Wydzielić typy biblioteki oraz komunikację z API map i wyników do `src/maps/library-api.ts`
  - [x] Wydzielić odczyt autosave oraz łączenie map serwerowych i lokalnych do `src/maps/library-sources.ts`
  - [x] Wydzielić bezpieczne formatowanie HTML, atrybutów, czasu i linków dev do `src/maps/library-format.ts`
  - [x] Wydzielić wyszukiwanie Fuse, filtry, sortowanie i trwałe ulubione do `src/maps/library-filter.ts`
  - [x] Wydzielić import z fallbackiem serwer/lokalnie oraz eksport ZIP/JSON z audio do `src/maps/library-transfer.ts`
  - [x] Wydzielić czyste renderowanie szkieletu, kart map i dekoracyjnej fali do `src/maps/library-list-view.ts`
  - [x] Wydzielić czyste renderowanie panelu szczegółów mapy i wyników do `src/maps/library-detail-view.ts`, pozostawiając zdarzenia w kontrolerze
- [x] Rozbić `src/multiplayer/client.ts` (599 linii) na moduły
  - [x] Wydzielić obsługę odpowiedzi HTTP, tłumaczenie błędów, kopiowanie i budowę URL WebSocket do `src/multiplayer/client-utils.ts`
  - [x] Wydzielić próbki RTT, estymację offsetu i konwersję czasu serwera do `src/multiplayer/clock-sync.ts`
  - [x] Wydzielić bezpieczne renderowanie, stan i wysyłanie czatu do `src/multiplayer/chat-view.ts`
  - [x] Wydzielić bezpieczne renderowanie wyników coop i score attack dla lobby oraz HUD do `src/multiplayer/score-view.ts`
  - [x] Wydzielić bezpieczne renderowanie listy graczy, ról, szabli i stanów gotowości do `src/multiplayer/room-player-list.ts`
- [x] Rozbić `src/tracking/tracking.ts` (613 linii) na moduły
  - [x] Wydzielić renderowanie obrazu kamery i landmarków dłoni do `src/tracking/landmark-canvas.ts`
  - [x] Wydzielić prezentację źródła kalibracji kamery/telefonu do `src/tracking/calibration-source-ui.ts`
  - [x] Wydzielić pobieranie modelu, raportowanie postępu i inicjalizację MediaPipe do `src/tracking/mediapipe-loader.ts`
  - [x] Wydzielić zbieranie próbek, głosowanie i wyliczanie pewności automatycznego odwrócenia kamery do `src/tracking/auto-flip.ts`
  - [x] Wydzielić definicje kroków oraz prezentację instrukcji, postępu i tracka kalibracji do `src/tracking/calibration-step-ui.ts`, zachowując eksporty kompatybilności
- [x] Rozbić `src/creator/input.ts` (619 linii) na moduły
  - [x] Wydzielić historię undo/redo i kontrolę nakładania beatów do `src/creator/history.ts`
  - [x] Wydzielić obliczenia i kontrolki siatki snap do `src/creator/snap.ts`, zachowując eksporty kompatybilności w `input.ts`
  - [x] Wydzielić timer, animację i sterowanie odliczaniem przed odtwarzaniem do `src/creator/precount.ts`
  - [x] Wydzielić rejestrowanie tapów, bomb i held beats, kierunek cięcia, flash oraz pętlę do `src/creator/beat-input.ts`, zachowując eksporty kompatybilności w `input.ts`
  - [x] Wydzielić skróty klawiaturowe, blokadę auto-repeat i kończenie held beats po `keyup` do `src/creator/keyboard-input.ts`
- [x] Każda refaktoryzacja musi zachować wszystkie funkcje i nie uszkodzić kodu — weryfikacja przez `npm run verify` po każdym kroku
  - [x] Dodać zatwierdzony Playwright smoke głównego menu: brak krytycznych błędów strony/konsoli oraz otwarcie i zamknięcie pickera map z kontrolą focusu

## 34. Balans trudności

- [x] Zaimplementować doradczą krzywą nauki — rekomendować kolejną mapę bez blokowania pozostałej zawartości
- [x] Dodać system oceny trudności mapy na podstawie gęstości beatów, tempa i wzorców
- [x] Dodać rekomendacje map dla aktywnego profilu na podstawie lokalnego postępu, z sugestią startu, kontynuacji, awansu lub utrwalenia
- [x] Dostosować hitboxy, wymagany swing, okna `PERFECT/GOOD` oraz held beats dla poziomów Easy–Expert; trening korzysta z profilu Easy, `speed-trials` co najmniej Hard, `pro` z Expert, a ręczna czułość hitboxu pozostaje respektowana

## 35. Panele deweloperskie, scena i eksport konfiguracji

- [x] Zapamiętywać w `localStorage`, czy panel `Hand Sabers Dev` jest zwinięty czy rozwinięty; przy pierwszym uruchomieniu panel ma być widoczny
- [x] Dodać możliwość minimalizacji panelu `KAMERA RAW / ŚLEDZENIE ML` w prawym dolnym rogu i zapamiętywać jego stan; przy pierwszym uruchomieniu panel ma być widoczny
- [x] Poprawić tło mapy/areny, aby było czytelniejsze, nowocześniejsze i spójne z efektami reagującymi na muzykę
- [x] Poprawić odbicia świetlne na podłodze — usunąć nienaturalne zachowanie i zsynchronizować je ze światłami oraz ustawieniami jakości grafiki
- [x] Dodać w ustawieniach eksport konfiguracji do wersjonowanego pliku JSON (m.in. kolory i modele mieczy, audio, rozgrywka, grafika, profil oraz kalibracja), bez danych sesji, tokenów i innych danych tymczasowych

## 36. Audyt produkcyjny — 2026-08-19

Poniższe zadania pochodzą z pełnego review kodu i skanu bezpieczeństwa. Pozycje P0 powinny blokować publiczne wdrożenie.

### P0 — blokery wydania

- [ ] Naprawić uruchamianie MediaPipe WebAssembly przy produkcyjnej CSP: obecne `script-src` blokuje `WebAssembly.instantiate()` i kończy inicjalizację komunikatem „Nie udało się załadować modelu lub zależności”. Zastosować najmniejsze potrzebne rozszerzenie polityki (preferować `'wasm-unsafe-eval'`, nie szerokie `'unsafe-eval'`), sprawdzić zgodność obsługiwanych przeglądarek i dodać smoke ładowania modelu pod nagłówkami produkcyjnymi.
- [x] Usunąć zdalny DOM XSS z podglądu graczy Multiplayer: etykieta w `src/multiplayer/remote-preview.ts` jest teraz budowana przez bezpieczne elementy DOM i `textContent`, bez interpretowania nazwy gracza jako HTML.
- [ ] Zabezpieczyć uploady przed DoS: uwierzytelniać i limitować przed buforowaniem body, zastąpić `multer.memoryStorage()` strumieniowaniem do ograniczonego pliku tymczasowego, dodać limity współbieżności, byte-rate oraz globalne/per-user quota dysku.
  - [x] Przenieść istniejący rate limit tras `/api/maps/save` i `/api/maps/import` przed middleware Multer, aby odrzucane żądania multipart nie były wcześniej buforowane w pamięci.
  - [x] Ujednolicić `MAX_IMPORT_BYTES` do 64 MB dla klienta i serwera; limit obejmuje upload Multera, zapis audio i ZIP po dekompresji.
  - [x] Zastąpić `multer.memoryStorage()` `diskStorage` w prywatnym `maps/.uploads`: audio jest przenoszone do docelowego pliku bez `Buffer`, a uploady są usuwane po sukcesie i błędzie.
  - [ ] Ograniczyć pamięć akceptowanego importu ZIP/JSON: obecny `JSZip` oraz `readFile` wciąż wczytują zaakceptowany plik do 64 MB RAM; pełne rozwiązanie wymaga parsera strumieniowego albo innej zaakceptowanej architektury.
  - [ ] Dodać limity współbieżności, byte-rate oraz globalne/per-user quota dysku dla katalogu uploadów.
    - [x] Ograniczyć aktywne zapisy/importy map przed parserami i Multerem do 4 globalnie oraz 2 per IP; slot obejmuje całe przetwarzanie i wraca po sprzątnięciu uploadu lub błędzie middleware.
    - [x] Dodać minimalny byte-rate 32 KiB/s po 10 s okresu ochronnego, sprawdzany w oknach 5 s; wolny upload kończy się 408, sprzątnięciem pliku tymczasowego i zwolnieniem slotu.
    - [x] Dodać globalną quota 256 MB katalogu `.uploads`: każdy multipart rezerwuje pełne 64 MB przed Multerem, istniejące i niesprzątnięte pliki pomniejszają dostępny budżet, a przekroczenie zwraca 507.
    - [ ] Dodać quota per-user po zdefiniowaniu i uwierzytelnieniu tożsamości użytkownika (IP jest tylko przybliżeniem per-client).
  - [x] Zastąpić globalny `express.json({ limit: '100mb' })` limitami per trasa: 25 MB dla zapisu map i 4 KB dla scores, wykonywanymi dopiero po rate limiterze; endpointy bez body nie uruchamiają parsera JSON.
- [x] Zablokować trwały DoS przez `POST /api/scores`: serwer generuje datę, wymaga małego schematu i ogranicza długości pól, `score`, `combo` oraz `progress`, więc klient nie może utrzymywać ogromnych rekordów w top 1000 i rozrastać `_scores.json`.

### P1 — wysoki priorytet

- [x] Naprawić pipeline testów: usunięto osieroczone oczekiwanie wobec nieistniejącego `findClosestSaberColor`; test pokrywa faktyczny kontrakt eksportowanych presetów, a `npm run unit` przechodzi 31/31.
- [ ] Nie ufać wynikom podawanym przez klienta. Powiązać leaderboard i wyniki Multiplayer z uwierzytelnionym graczem, mapą oraz wydaną przez serwer rundą; obecnie można przesłać dowolny wynik i combo.
- [x] Ograniczyć niezalogowane połączenia `/tracking-ws` per IP i wydzielić małą pulę handshake: maksymalnie 8 oczekujących globalnie, 2 per adres transportowy, zwalniane twardo po 10 s; limit 64 pozostaje dla uwierzytelnionych peerów.
- [x] Egzekwować pięciominutowe wygaśnięcie sesji remote tracking również dla już połączonych socketów: zamykać je przy expiry/revoke i sprawdzać aktywność sesji przed relayem.
- [x] Usunąć zmienny skrypt Lucide `@latest` z `beat-sabers-3d.html`: nieużywany skrypt CDN został usunięty, a ikony nadal korzystają z Material Symbols.
- [x] Nie zachowywać arbitralnego `meta.audioUrl` z importowanej mapy. URL jest wyliczany z walidowanego ID także na telefonie; zewnętrzne adresy audio nie są obsługiwane.
- [x] Zapewnić atomowość zapisu mapy i audio.
  - [x] Zapisać/przenieść nowe audio przed usuwaniem starego rozszerzenia, aby błąd zapisu nie kasował poprzedniego pliku.
  - [x] Dodać blokadę per map ID i rollback/commit całej operacji mapy oraz audio, aby równoległe zapisy nie mogły pozostawić niespójnego stanu. — odczyty i mutacje współdzielą blokady zgodne z semantyką filesystemu, usuwanie izoluje katalog, a dyskowe backupy przywracają mapę i audio po błędzie; gwarancja dotyczy jednego procesu serwera, bez crash journala.
- [x] Naprawić logikę osiągnięć w `src/core/achievements.ts`: `no_miss_game` zależy od dożywotniej liczby pudeł, `five_streak`/`fifteen_streak` sprawdzają combo 30/75 zamiast serii zwycięstw, a `maps_10` liczy powtórzenia i przegrane zamiast dziesięciu różnych ukończonych map. — nowe metryki nie mogą być wiarygodnie odtworzone ze starych zbiorczych danych, więc zaczynają się od zera po migracji.
- [x] Zatrzymywać MediaStream, czyścić `video.srcObject` i anulować pętlę detekcji po rozłączeniu hosta/wygaśnięciu sesji telefonu oraz po błędzie inicjalizacji trackingu PC już po uzyskaniu kamery. — naprawione w kodzie; wymaga jeszcze ręcznej próby na urządzeniu z kamerą.
- [x] Dodać import `.zip`/`.json` bezpośrednio do używanego w grze `mapPickerOverlay`. Import istnieje na osobnej stronie `maps.html`, ale normalne wejścia z menu, pauzy i game over otwierają `src/game/map-picker.ts`, gdzie nie ma przycisku ani obsługi importu. Współdzielić jedną implementację importu zamiast kopiować logikę.

### P2 — poprawność i odporność

- [x] Nie wygaszać aktywnego pokoju Multiplayer wyłącznie 30 minut po jego utworzeniu. TTL jest odświeżany przez join, uwierzytelnione wiadomości, pakiety realtime i heartbeat; socket jest kontrolowanie zamykany, jeśli pokój zdążył wygasnąć.
- [ ] Wzmocnić ręczne parowanie telefonu przeciw przejęciu widocznego kodu (shoulder surfing/race), np. potwierdzeniem po stronie hosta. Nie traktować tego jako realnego brute-force: kod ma około 30 bitów entropii, TTL 5 minut, single-use i limit 6 prób/min/IP.
- [x] Dodać allowlistę typów, limity wiadomości/częstotliwości i kontrolę `bufferedAmount` dla tekstowego kanału remote tracking. — host i telefon mają osobne allowlisty z walidacją pól, token bucket 20 wiadomości/s z burstem 40 i zamknięciem po powtarzanych naruszeniach; relay oraz wiadomości serwera zamykają wolnego odbiorcę po przekroczeniu 64 KiB bufora.
- [x] Dodać limity liczby wpisów, pojedynczego wpisu, łącznego rozmiaru i rzeczywistego outputu po dekompresji ZIP w trzech ścieżkach klienckich: gra (`src/game/maploader.ts`), biblioteka (współdzielony importer `src/core/map-import.ts` wywoływany przez `src/maps/maps.ts`) i kreator (`src/creator/storage.ts`). — wspólny strumieniowy odczyt dopuszcza maksymalnie 128 wpisów, 64 MiB na wpis i 64 MiB łącznie, z osobnym limitem 25 MiB dla `map.json`; te same kontrole obejmują import serwerowy i mierzą rzeczywiście wypuszczone bajty mapy oraz wybranego audio.
- [x] Naprawić obsługę auto-repeat w `src/creator/input.ts`: gałąź `e.repeat` nie wykonywała `return`, więc akcje takie jak undo/redo/zoom mogły powtarzać się mimo komentarza o blokadzie.
- [x] Ujednolicić skrót usuwania w kreatorze: akcja `deleteSelected` jest wystawiona jako konfigurowalna i wykonuje usuwanie wyłącznie przez aktualny bind (domyślnie Delete).
- [x] Rozszerzyć hit-test bloków held na cały pasek czasu trwania, nie tylko punkt startowy (`src/creator/timeline.ts`), aby dało się zaznaczyć środek długiego bloku.
- [x] Ograniczać czas wklejanych/duplikowanych beatów oraz końce held beats do `[0, map.meta.duration]`; grupy wklejane przy końcu utworu są przesuwane maksymalnie do tyłu zamiast wychodzić poza mapę.
- [x] Uodpornić autosave kreatora: poza debounce 5 s dodać maksymalny interwał zapisu lub flush na `visibilitychange/pagehide`, a błędów `localStorage` (zwłaszcza quota exceeded) nie połykać bez komunikatu. Mapa jest zapisywana synchronicznie; audio w IndexedDB przy zamknięciu strony pozostaje best-effort.
- [x] Usunąć lub jednoznacznie zablokować legacy `server.js`. — plik i historyczna implementacja pozostają w repo, ale entrypoint kończy się natychmiast kodem 1 z instrukcją użycia `npm run dev:server`/`npm start`; nie ładuje zależności, nie dotyka dysku i nie otwiera portu.
- [x] Dodać opcjonalne produkcyjne nagłówki bezpieczeństwa: CSP, `X-Content-Type-Options`, ochronę przed framingiem, `Permissions-Policy` oraz HSTS na warstwie HTTPS/reverse proxy. — są włączane jawnie przez `config.json` → `security: true`; lokalne ustawienie domyślne `false` nie narzuca CSP ani kontroli Origin. Przy włączonej ochronie CSP ogranicza zasoby do aplikacji i jawnie używanych dostawców, framing jest blokowany przez `frame-ancestors 'none'` i `X-Frame-Options: DENY`, a HSTS jest wysyłany tylko dla HTTPS (również za proxy po `HAND_SABERS_TRUST_PROXY=1`).
- [x] Dodać i commitować lockfile zależności; wersje z `^` bez `package-lock.json` nie dają reprodukowalnego builda produkcyjnego.
- [x] Poprawić narzędzia kontroli: `scripts/check-js.mjs` nie analizuje kodu TypeScript, a `scripts/check-i18n-keys.mjs` wbrew opisowi skanuje tylko HTML i nie jest włączony do skryptów npm. — `npm run lint` uruchamia teraz typecheck frontendu i serwera oraz parserową kontrolę statycznych `t('…')` w TypeScript i atrybutów `data-i18n-*` w HTML; sprawdza też symetrię scalonych drzew PL/EN.
- [x] Uzupełnić testy krytycznych ścieżek: autoryzacja i limity uploadu, WebSocket/expiry/backpressure, osiągnięcia, operacje kreatora i regresja DOM XSS. — testy obejmują rozdzielenie tokenów host/telefon, TTL sesji i pokoi, próg bufora WebSocket, limity równoległości i pojemności uploadów, semantykę osiągnięć, granice czasu beatów kreatora oraz escaping metadanych map i wyników.
- [x] Zaktualizować dokumentację do implementacji: `npm run dev` uruchamia serwer i Vite, remote tracking korzysta obecnie z WebSocket (nie DataChannel), a opis parowania i gwarancji TTL musi odpowiadać faktycznym kontrolom. — README rozróżnia wspólny i osobne procesy developerskie, a projekt remote tracking opisuje REST + `/tracking-ws`, bearer tokeny, QR/manual claim, brak potwierdzenia hosta i stałe pięć minut także dla aktywnych połączeń.

### P3 — jakość produkcyjna

- [x] Ograniczyć rozmiar początkowego bundla Three.js (około 723 kB / 184 kB gzip) przez świadome ładowanie ekranów/modułów i budżet rozmiaru w CI. — jawne importy diagnostyki umożliwiły tree-shaking do około 528 kB / 132 kB gzip, podgląd 3D kreatora ładuje się leniwie bez `modulepreload`, a każdy build egzekwuje budżet 550 KiB raw / 140 KiB gzip i brak ponownego preloadu.
- [x] Ujednolicić polskie teksty UI, diakrytykę oraz format czasu w kreatorze; dodać rzeczywisty check kompletności i18n dla wywołań `t()`. — kreator, diagnostyka kamery i fallbacki HTML używają spójnych polskich terminów z diakrytyką; wszystkie zegary kreatora, łącznie z tooltipem waveformy, korzystają ze wspólnego formatu `MM:SS` / `MM:SS.cc`; `npm run lint` sprawdza symetrię scalonych drzew PL/EN oraz statyczne `t('…')` i `data-i18n-*` (obecnie 1052 klucze i 739 użyć).
- [x] Dodać `SECURITY.md` z zakresem wsparcia, kanałem zgłoszeń i właściwościami bezpieczeństwa wymaganymi dla wdrożenia publicznego. — rootowa polityka wskazuje prywatne GitHub Security Advisories, granice zaufania, invariants, kontekst severity, wymagania przed wdrożeniem publicznym oraz znane i zaakceptowane ograniczenia bez blanket suppression.

### Świadomie zaakceptowane ryzyka i decyzje wdrożeniowe

- [x] Na obecnym etapie nie dodawać uwierzytelniania mutacji map (`POST /api/maps`, `/save`, `/import`, `DELETE /api/maps/:id`), ponieważ serwer jest przeznaczony wyłącznie dla zaufanych znajomych. Kontrola `Origin` i limity IP nie są autoryzacją, dlatego tego wariantu nie wolno wystawiać publicznie bez ponownego otwarcia zadania i dodania modelu admin/ownership/read-only.
- [x] Pozostawić MediaPipe `@0.10.0` na zewnętrznym CDN ze względu na koszt transferu dużych assetów. Ryzyko kodu strony trzeciej mającego dostęp do `HTMLVideoElement` jest zaakceptowane; nadal należy utrzymywać dokładnie przypiętą wersję i wąski zakres cache Service Workera.

## 37. Rozszerzony backlog produktu — 2026-08-19

### Mapy i kreator

- [x] Dodać lub naprawić preview audio w używanym w grze modalu map: play/pause, pasek postępu, czas, bezpieczne zatrzymanie przy zmianie mapy i zamknięciu modala oraz czytelny stan braku audio.
- [x] Dodać ustalanie poziomu trudności mapy: ręczny wybór w kreatorze oraz sugestia na podstawie BPM, gęstości beatów, kierunków, rozrzutu pozycji, held beats i sekwencji multi-cube. Sugestia jest wyłącznie informacją i nigdy nie nadpisuje wyboru autora.
- [x] Dodać oznaczanie map gwiazdką jako ulubione, trwały zapis per profil/przeglądarka, filtr „Ulubione” i sortowanie z ulubionymi na górze.
- [x] Przeprowadzić osobny pełny audyt UX kreatora map i dopracować cały flow: tworzenie, edycja, odsłuch, timeline, undo/redo, autosave, walidacja, import, eksport i obsługa błędów bez utraty pracy. — audyt kodu i smoke pełnego przepływu potwierdziły ładowanie WAV, odtwarzanie, edycję timeline, historię oraz ponownie otwieralny eksport ZIP z mapą i audio; poprawiono autosave undo/redo i BPM, izolację historii importowanych map, rollback uszkodzonego ZIP-a, odporność na awarie lokalnego cache audio/map oraz dostępne stany przycisków historii.
- [x] Dokończyć modal wyboru map: komplet funkcji biblioteki, preview audio, import, animacje, prawidłowy focus/keyboard navigation, responsywność i spójne zamykanie. — picker udostępnia wyszukiwanie, filtry trudności i ulubionych, sortowanie, rekomendację, wyniki, preview oraz import z czytelnym stanem; widok mobilny przełącza listę i szczegóły, a zamykanie ma animację z obsługą `prefers-reduced-motion`.
  - [x] Zamknąć focus w aktywnym pickerze, przywracać go do widocznego elementu otwierającego oraz przechwytywać Escape przed pauzą/modałem Multiplayer.
  - [x] Zweryfikować ręcznie focus, Tab i Escape na wszystkich wejściach do pickera; następnie dopracować animacje oraz responsywność. — smoke Playwright objął wejścia z menu głównego, narratora, ekranów końca/ładowania oraz pauzy, desktop i mobile, pomijanie ukrytych kontrolek, przywracanie focusu, Escape, mobilne szczegóły i animowane zamykanie.
- [x] Naprawić nakładanie modali Multiplayer i wyboru mapy: style pickera gry są ograniczone do `#mapPickerOverlay`, więc nie podnoszą już całego modala Multiplayer do warstwy 9000 ani nie nadpisują kart jego pickera.

### Osiągnięcia, narrator i profil

- [x] Dopracować cały system osiągnięć po naprawieniu błędnej semantyki: warunki, progres, prezentację, nagrody, czytelność i testy regresyjne każdego osiągnięcia. — podłączono zdarzenia telefonu, multiplayera i kreatora; rozdzielono zwycięstwa co-op/score-attack, unikalne mapy oraz bezpieczną migrację; wszystkie 33 definicje mają wspólny model progresu i test granicy, a panel pokazuje kategorie, tiery, opisy i dostępne paski postępu. Nagrody wizualne są kolejkowane zamiast nadpisywane, zapisane odblokowania są zachowywane, reset odświeża statystyki i karty, a smoke objął desktop oraz mobile.
- [x] Poprawić layout statystyki „ŁĄCZNY WYNIK”: bardzo duże liczby nie mogą wychodzić poza kontener; zastosować osobne szersze pole, format skrócony lub responsywną typografię z pełną wartością dostępną w tooltipie/ARIA.
- [x] Dopracować kontener rozmowy Lyry: stabilny rozmiar, brak skoków layoutu, poprawne zawijanie i przewijanie, responsywność, animacje znaków/przycisków oraz prawidłowe zachowanie dla długiego tekstu. — stały obszar tekstu automatycznie przewija wpisywanie, długie słowa nie wychodzą poza kartę, przyciski zawijają się na mobile, animacje respektują `prefers-reduced-motion`, a panel kamery czasowo nie zasłania aktywnego dialogu; smoke Playwright obejmuje długi tekst, desktop/mobile i zamknięcie dialogu.
- [x] Poprawić flow tworzenia profilu użytkownika: walidacja i komunikaty błędów, wybór nazwy i avatara, podgląd, nawigacja klawiaturą, responsywność oraz spójna późniejsza edycja profilu. — pusta nazwa jest blokowana z komunikatem i ARIA, nazwa jest normalizowana, onboarding ma podgląd nazwy/awatara, a awatary są radiogroupem sterowanym kliknięciem, strzałkami i Home/End; zmiany z onboardingu synchronizują bez odświeżania ustawienia i Multiplayer. Smoke obejmuje walidację, mobile, klawiaturę i późniejszą edycję.
- [x] Dodać do profilu własny kolor użytkownika: presety oraz pełny picker jak dla mieczy, walidowany zapis w ustawieniach i bezpieczne użycie koloru w lobby, czacie, wynikach i podglądach.
- [x] Odświeżyć wygląd oznaczenia „EKSPERYMENTALNE, ALE DZIAŁA”, aby było spójne z resztą UI, czytelne i mniej prowizoryczne. — wspólny znacznik śledzenia telefonu ma teraz ikonę laboratorium, mocniejszy kontrast, subtelny gradient i cień oraz bezpieczne łamanie na mobile; inspekcja wizualna objęła ustawienia śledzenia.

### Tracking, kamera i audio telefonu

- [x] Udostępnić zaawansowane ustawienia modelu śledzenia dłoni po uprzednim zinwentaryzowaniu opcji MediaPipe. Zachować obecne wartości jako domyślne, walidować zakresy, dodać reset i opisy wpływu na dokładność, opóźnienie oraz wydajność. — zinwentaryzowano faktycznie wspierane progi HandLandmarker: wykrycie, obecność i śledzenie; są walidowane w ustawieniach, transferze i protokole telefonu, zachowują domyślne 42%, mają opisy kompromisów oraz atomowy reset wysyłający jedną konfigurację do sparowanego telefonu.
  - [x] Zinwentaryzować lokalnie używane opcje: 2 dłonie, delegat GPU oraz progi wykrycia, obecności i śledzenia — wszystkie z dotychczasową wartością 0,42.
  - [x] Dodać trzy walidowane suwaki modelu dla kamery PC, pełny eksport/import i reset do wartości 0,42; wartości są stosowane przy kolejnym uruchomieniu lokalnego trackingu.
  - [x] Dodać bezpieczne przekazywanie konfiguracji do telefonu: host przesyła wyłącznie trzy walidowane progi po sparowaniu i po zmianie suwaka, a telefon zapisuje je bez przerywania bieżącej detekcji i stosuje przy kolejnym uruchomieniu kamery.
- [ ] Dokończyć i ustabilizować audio na telefonie.
  - [x] Obsłużyć i walidować `prepare`/`play`/`pause`/`seek`/`stop`/`volume` oraz przekazywać głośność główną i muzyki.
  - [x] Kompensować czas transmisji i konfigurowalną latencję bez pogarszania działania przy rozjechanych zegarach urządzeń.
  - [x] Po reconnect ponownie przygotować utwór i wznowić go od aktualnej pozycji oraz z aktualnym tempem.
  - [x] Przełączać wyjście podczas działania, wymagać prawdziwej aktywacji audio na telefonie i zawsze przywracać aktualną głośność PC jako fallback.
  - [ ] Przetestować cały przepływ na fizycznych telefonach z iOS i Androidem, również po blokadzie ekranu oraz zmianie głośnika/słuchawek Bluetooth.
- [x] Pokazywać jednoznacznie miejsce wykonywania ML dla kamery telefonu: „ML: komputer”, „ML: telefon” albo oczekiwanie na telefon. Etykieta aktualizuje się dla trybu Auto, Kamera PC i Telefon wraz ze stanem połączenia.
- [ ] Zmierzyć i zoptymalizować end-to-end latency remote tracking: timestampy etapów kamera→ML→kodowanie→WS→PC→render, częstotliwość pakietów, wielkość payloadu, kolejki/backpressure, interpolacja i odrzucanie spóźnionych danych. Przetestować osobno telefon słabszy i high-end.
- [x] Poprawić wyświetlanie landmarków innych graczy: położenie, skalowanie, podpisy, kolory profilu, widoczność w normalnym/dev mode, brak zasłaniania gameplayu oraz płynność przy opóźnieniach i utracie pakietów. — podglądy tworzą zwartą siatkę w lewym dolnym obszarze, zachowują avatar, nazwę i kolor profilu, przenoszą się do panelu kamer w dev mode i nie kolidują z czatem/HUD-em. Zawężono błędny selektor ukrywający pierwszego gracza; brak danych przez 1 s wygasza i czyści obraz, a nowy pakiet go przywraca. Pozycje mieczy korzystają z istniejącego bufora interpolacji 100 ms i progu nieaktualności 750 ms. Zweryfikowano czterech graczy, oba tryby, utratę/powrót pakietów i usunięcie gracza.
- [x] Poprawić kalibrację metronomem: stabilność obliczenia offsetu, wyraźne rozróżnienie warm-up i właściwych próbek, możliwość ponowienia, poprawne zatrzymanie timerów/audio oraz czytelny wynik i ostrzeżenie o niestabilnym pomiarze. — istniejąca implementacja odrzuca 2 próbki rozgrzewkowe, zbiera 8 właściwych, używa mediany/MAD, odrzucania odstających wartości i przyciętej średniej, a UI rozdziela liczniki i pokazuje offset z rozrzutem albo ostrzeżenie. Smoke potwierdził pełny pomiar, wynik niestabilny, retry oraz anulowanie bez pozostawionego overlayu, timera lub handlera klawiatury.
  - [x] Liczyć offset względem każdego tyknięcia co 500 ms, a nie wyłącznie względem akcentu występującego co piąte tyknięcie.
  - [x] Wyświetlać wynik stabilny lub ostrzeżenie o niestabilnym pomiarze przed zamknięciem nakładki.
  - [x] Rozróżnić natychmiastowe anulowanie od opóźnionego zamknięcia wyniku i zabezpieczyć ponowne uruchomienie przed starym timerem nakładki.
  - [x] Synchronizować etykietę przycisku ustawień po anulowaniu z nakładki, ukończeniu pomiaru i braku obsługi AudioContext.
  - [x] Rozdzielić licznik i komunikaty na 2 tapnięcia rozgrzewkowe oraz 8 właściwych próbek pomiarowych, bez błędu off-by-one.
  - [x] Pozostawić wynik na ekranie do decyzji użytkownika: zastosować offset, ponowić pomiar lub zamknąć bez zmian; niestabilny wynik wymaga osobnego „Zastosuj mimo to”.
  - [x] Planować kliknięcia według zegara `AudioContext` z wyprzedzeniem zamiast dokładności timerów JavaScript; start czeka na wznowienie audio, a zamknięcie w trakcie startu anuluje żądanie.
  - [ ] Wykonać ręczny pomiar na realnych wyjściach audio (przewodowe, Bluetooth, głośniki) i ocenić, czy zakres oraz znak zapisanego offsetu odpowiadają odczuciu w grze.
  - [x] Pokazać offset, rozrzut i liczbę użytych próbek dla wyniku stabilnego oraz niestabilnego.
  - [x] Czyścić timery animacji i stan wizualny przy anulowaniu, wyniku, zamknięciu oraz ponowieniu pomiaru.
  - [x] Sprawdzić pełny flow UI w Chromium: start, anulowanie, stabilny wynik, niestabilny wynik, zastosowanie, zamknięcie i szybkie ponowienie. Smoke potwierdził stabilny wynik `148 ms / ±31 ms`, zastosowanie, natychmiastowe anulowanie, reset retry do `ROZGRZEWKA 0 / 2` i brak błędów strony; wcześniejszy smoke potwierdził również wynik niestabilny i „Zastosuj mimo to”.
  - [ ] Ręcznie odsłuchać tyknięcia i wynik na realnym wyjściu audio w każdej docelowo obsługiwanej przeglądarce.

### Gameplay, grafika i arena

- [x] Naprawić tryb jednej ręki: dla lewej ręki renderować wyłącznie lewy miecz, a prawy ukryć; dla prawej odwrotnie. Ukryć również nieaktywną poświatę, światło, trail, odbicie i pozostałe efekty, bez zmiany logiki aktywnego miecza.
- [x] Naprawić efekt krytycznego HP: pulsujące czerwone obramowanie musi zostać wyłączone lub zamrożone przy pauzie oraz zawsze wyczyszczone po game over, wyjściu do menu, restarcie i zmianie trybu — nie dopiero przy rozpoczęciu nowej gry.
- [ ] Dodać więcej ustawień graficznych z podglądem na żywo i bezpiecznymi presetami: osobne sterowanie detalem areny, podłogą/odbiciami, tłem, mgłą, światłami, shaderami, efektami trafień i wizualizacjami muzycznymi.
- [ ] Przebudować tło areny i podłogę: poprawić czytelność, głębię, odbicia, materiały i zachowanie na różnych profilach wydajności.
- [x] Dodać dodatkowe, opcjonalne efekty reagujące na muzykę i pasma częstotliwości, z kontrolą intensywności, ograniczeniem wpływu na czytelność bloków oraz możliwością całkowitego wyłączenia. — portal/tunel, warstwy tła, gwiazdy i odłamki korzystają z energii pasm oraz beatów; ustawienia udostępniają wyłączenie, Auto i ręczne `0–1.5×`, a `gameplayVisualPressure` osłabia dekoracje przy blokach blisko gracza.
- [ ] Dodać tryb gry z przestrzennie losowymi pozycjami bloków zamiast stałych wysokości. Wykrywać grupy multi-cube (więcej niż 3 bloki w oknie około 0,5 s) i zachowywać dla nich wspólny/przechodni układ, aby sekwencja pozostała fizycznie możliwa do wykonania. Generator musi sprawdzać reachability i kolizje czasowo-przestrzenne.
- [x] Dodać więcej subtelnych mikroanimacji tekstów, nagłówków, przycisków i zmian stanu, z obsługą `prefers-reduced-motion` i bez pogarszania wydajności/czytelności. — krótkie wejścia obejmują nagłówki i sekcje ustawień/modali, komunikaty stanu mają dyskretny pop, a przyciski delikatny feedback `scale`; efekty używają wyłącznie `opacity`/`transform`/`scale`, są ograniczone do UI i wyłączane przy redukcji ruchu.

### Ustawienia i konfiguracja

- [x] Dodać wersjonowany eksport i import ustawień użytkownika. Eksport obejmuje kompletny wspólny model konfiguracji (59/59 pól, w tym język), import używa walidacji schematu, allowlisty, limitu rozmiaru, podglądu zmian, potwierdzenia i rollbacku. Wszystkie moduły korzystają ze stabilnej referencji jednego źródła prawdy; `both` jest migrowane do wewnętrznego trybu obu rąk, a starsze pliki v1 bez języka zachowują bieżący język. Tokeny, sekrety sesji i dane tymczasowe nie są eksportowane.

### Developer tools

- [x] Dokończyć tryb deweloperski jako spójny zestaw narzędzi, usunąć martwe kontrolki i zapewnić poprawne sprzątanie stanu po jego wyłączeniu. — ustawienia i Tweakpane synchronizują się dwukierunkowo, wszystkie widoczne kontrolki mają aktywne handlery, a wyłączenie usuwa panel, Stats, globalne nasłuchy przeciągania, spóźnione inicjalizacje, klasę trybu oraz debugowe hitboxy/wireframe. Przycisk `[dev]` przełącza narzędzia bez przeładowania i usuwa wymuszający parametr URL; zweryfikowano szybkie przełączenie i dwa pełne cykle bez duplikatów lub pozostawionego stanu.
- [x] Dodać do dev panelu średni FPS (AVG FPS) liczony w stabilnym ruchomym oknie obok wartości chwilowej oraz opcjonalnie 1% low, aby chwilowe skoki nie zaciemniały pomiaru. (10-sekundowe okno; 1% low pozostaje opcjonalne.)
- [x] Sprawdzić wszystkie skutki flagi `?testing`; udokumentować je i, jeśli nadal są potrzebne, dodać kontrolowaną możliwość włączenia równoważnego trybu z panelu developerskiego bez ręcznej edycji URL. `?testing` jest wyłącznie historycznym aliasem `?dev`: uruchamia panel deweloperski i debugowe wizualizacje trackingu; odpowiada mu istniejący przełącznik „Tryb developera”, więc nie dodawano osobnego trybu testowego.
- [x] Zapisywać stan zminimalizowania panelu HAND SABERS DEV oraz ostatnio otwartą zakładkę; przywracać je po przeładowaniu z rozsądnym fallbackiem po zmianie wersji UI.
- [x] Zsynchronizować ustawienia dev panelu z ustawieniami gry dwukierunkowo i na żywo: jedna warstwa stanu, brak rozbieżnych wartości, natychmiastowa aktualizacja UI/sceny oraz poprawny reset do domyślnych. — `core/settings` emituje typowane zmiany z jednego współdzielonego obiektu; Tweakpane odświeża się po zmianach zwykłego UI/importu/resetu, a zmiany dev panelu synchronizują kontrolki audio, gameplayu, trackingu i grafiki wraz ze sceną. Smoke potwierdził oba kierunki, localStorage i reset wyłączający domyślnie tryb dev.

### Multiplayer, co-op i czat

- [x] Dodać obok „KOPIUJ LINK” przycisk „KOPIUJ KOD” z feedbackiem sukcesu/błędu i fallbackiem, gdy Clipboard API jest niedostępne.
- [x] Udoskonalić ustawienia zasad Multiplayer tak, aby pokrywały 100% wspieranych możliwości rozgrywki; host ma być źródłem prawdy, a zablokowane lokalne ustawienia muszą jasno pokazywać wartość narzuconą przez pokój. — snapshot pokoju obejmuje tryb multiplayer, trening, No Fail, wszystkie cztery tryby gry i cztery prędkości nut; serwer waliduje wartości, a goście widzą je w zablokowanych polach. Runda używa reguł hosta tylko w pamięci i przywraca profil singleplayer po zakończeniu. Ustawienia zależne od urządzenia (tracking, audio, grafika) świadomie pozostają lokalne, a wybór ręki już wynika z roli przydzielonej przez serwer.
- [x] Poprawić czat pokoju i udostępnić go zarówno w lobby, jak i podczas rozgrywki: wspólna historia ostatnich 50 wiadomości trafia do lobby i zwijanego overlayu w prawym górnym rogu, badge sygnalizuje nowe wiadomości, a formularz izoluje klawisze od sterowania grą i przejmuje focus po rozwinięciu. Istniejący limit 240 znaków i serwerowy rate limit pozostają aktywne. Zweryfikowano dwiema niezależnymi sesjami przeglądarki oraz wizualnie na desktopie i ekranie 390 px.
- [x] Poprawić co-op dla lobby z więcej niż 2 osobami: opcja co-op może pozostać wybrana, ale START ma być zablokowany z jasnym komunikatem o wymaganej liczbie graczy i wskazaniem konieczności usunięcia nadmiarowych osób.
- [ ] Dodać hostowi możliwość kickowania graczy oraz banowania. Przed implementacją ustalić zakres bana (pokój, sesja serwera czy trwały), identyfikator gracza bez systemu kont, czas ważności, sposób cofnięcia oraz ochronę przed ponownym dołączeniem tym samym tokenem.

### Tutorial i ogólny polish UI

- [ ] Zbudować pełny interaktywny tutorial gry: konfiguracja kamery, kalibracja, pozycja dłoni, pierwszy ruch mieczem, prawidłowe cięcie, timing, combo, bomby, held beats, pauza i ukończenie krótkiej kontrolowanej sekwencji z feedbackiem na żywo.
- [x] Ujednolicić i poprawić styl scrollbarów we wszystkich modalach, z obsługą Firefox/Chromium, klawiatury, wysokiego kontrastu i urządzeń dotykowych. — wspólna warstwa stylu obejmuje przewijane powierzchnie ustawień, pomocy, multiplayera, pickerów map, onboardingu i narratora; dodano fokus klawiatury, większe uchwyty dla urządzeń dotykowych, `overscroll-behavior` oraz fallback `forced-colors`.
- [x] Poprawić animacje wejścia i wyjścia wszystkich modali: wspólny mechanizm, prawidłowe oczekiwanie przed `hidden`, focus trap/restore, blokowanie interakcji z tłem oraz `prefers-reduced-motion`. — ustawienia, pomoc, wybór map, Multiplayer z pickerem, parowanie telefonu, onboarding profilu i picker koloru korzystają z `createModalTransition`; kontroler zarządza stosem Escape/fokusu, blokuje wskaźnik podczas wyjścia, czeka przed `hidden`, przywraca widoczny element otwierający i respektuje ograniczenie ruchu.
