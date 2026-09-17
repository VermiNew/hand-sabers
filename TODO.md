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

## 5. Modele mieczy i picker 3D

- [x] Zaimplementować sześć odrębnych modeli geometrii miecza: Classic, Wide, Thin, Prism, Edge i Pulse — każdy ma własną długość, profil, końcówkę, jelce i akcenty rękojeści.
- [x] Dodać lekki system efektów mieczy: aura i iskry oraz animowany pierścień energii Pulse, respektujące istniejące ustawienie glintów/profile wydajności.
- [x] Pozwolić ustawić inny model dla lewej i prawej dłoni, z migracją starego wspólnego `saberModel` oraz zgodnym importem/eksportem ustawień.
- [x] Zastąpić mały picker pełnoekranowym podglądem 3D z wyborem dłoni, zatwierdzaniem/anulowaniem, drag/touch rotate, zoomem, responsywnością i zwalnianiem kontekstu WebGL po zamknięciu.

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
- [ ] Wybór modelu ML (lekki / dokładny) w ustawieniach — **zablokowane aktualną dystrybucją MediaPipe Tasks**: zweryfikowany 2026-09-10 oficjalny pakiet Web `hand_landmarker/float16/1` zawiera jeden detector oraz wyłącznie pełny model landmarków 5,48 MB; oficjalne adresy kompletnych pakietów `float32`, `int8` i `lite` zwracają 404. Google nadal publikuje starszy, pojedynczy `hand_landmark_lite.tflite`, ale nie kompletny pakiet Task; ręczne złożenie go z detectorem byłoby niewspieranym modelem wymagającym osobnej decyzji eksperymentalnej i testu runtime, a nie bezpiecznym przełącznikiem ustawień.
- [x] Nowa strona/overlay "Pomoc" w menu — instrukcja gry + mini‑tutorial (PL i EN)

## 8. TODO techniczne (backlog)

- [ ] Przetestować `audioOffsetMs` na kilku urządzeniach (Bluetooth, przewodowe, głośniki) — **zablokowane sprzętowo**: wymaga ręcznego odsłuchu i pomiaru na co najmniej trzech fizycznych torach audio; test przeglądarkowy nie odtworzy ich opóźnień.
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
- [x] Przebudować tutorial tak, aby faktycznie wprowadzał do gry — interaktywne kroki z rzeczywistym śledzeniem rąk, testowaniem cięć i feedbackiem na żywo, a nie tylko tekst instrukcji. — siedem kroków prowadzi przez realną kamerę, ustawienia, mapy, istniejącą kalibrację, pomiar ruchu z trackingu, kontrolowaną sesję gry i wskazówki stabilnego śledzenia; przejście jest blokowane do czasu ukończenia wymaganych interakcji.
  - [x] Dodać pierwszy interaktywny krok sprawdzania kamery: dostęp wyłącznie po kliknięciu, lokalny podgląd, wykrycie realnej klatki i rozdzielczości, blokada przejścia do sukcesu oraz bezwarunkowe zatrzymanie ścieżek przy wyjściu. Zweryfikowano w Chromium z wirtualną kamerą: `live` → `ended`, brak błędów i pełny widok bez scrolla przy 1280×900.
  - [x] Połączyć krok tutoriala z istniejącą kalibracją bez duplikowania MediaPipe: akcja uruchamia prawdziwy flow, po ukończeniu wznawia następny krok, a po anulowaniu wraca do kalibracji bez fałszywego zapisu ukończenia. Smoke potwierdził przejście menu→loading→anulowanie→ten sam krok i brak błędów.
  - [x] Połączyć pozycję dłoni i pierwszy ruch z realnym trackingiem: krok respektuje tryb jednej ręki, wymaga stabilnej obecności właściwych dłoni, mierzy przemieszczenie w przestrzeni i odblokowuje się dopiero po ruchu co najmniej 0,35 jednostki. Smoke objął oba tryby, ruch pod/nad progiem i widok 1100×820.
  - [x] Zbudować kontrolowaną sekwencję treningową cięć, timingu, combo, bomb, held beats i pauzy opisaną w szczegółowej checkliście poniżej. — krótka mapa w pamięci wymaga poprawnego kierunku, oceny GOOD/PERFECT, combo ×3, ominięcia bomby, ukończenia held beat oraz ręcznej pauzy i wznowienia. Checklistę aktualizują zdarzenia prawdziwej rozgrywki; niepełna próba wraca z komunikatem retry, a pełna przechodzi dalej. Sesja respektuje tryb jednej ręki, nie zapisuje wyniku ani osiągnięć i odtwarza mapę oraz ustawienia gracza po wyjściu. Zweryfikowano agregację wszystkich zdarzeń, odrzucenie pauzy po utracie dłoni, start, cleanup, retry i widok 1280×900.

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
- [x] Obniżyć koszt renderowania aktywnych kostek bez usuwania obrysu, strzałek, odbić ani mechaniki — korpusy używają lżejszego materiału Phong, elementy poza kadrem są odrzucane, sześć kolców bomby stanowi jedną geometrię, a nuty, ogony held notes i odłamki trafień są instancjonowane. Kontrolowany render obniżył koszt 12 zwykłych nut z 36 do 5 draw calli (około 86%), 12 held notes z 48 do 7, a 28 aktywnych odłamków z 28 do 1, przy zachowanych kolorach, kierunkach, długościach, emisji i zanikaniu; wcześniejszy benchmark materiału 30 kostek obniżył średni czas renderu z 6,27 ms do 4,40 ms. Rzeczywisty FPS pozostaje zależny od GPU i wymaga potwierdzenia na docelowym komputerze.

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
- [x] Dodać timeline w stylu DaVinci Resolve — przewijany suwak czasu z dokładnym pozycjonowaniem, możliwością wpisania czasu ręcznie, zoomowaną osią czasu — kreator pozwala przewijać i zoomować oś, wpisywać czas `MM:SS.cc` lub sekundy oraz dodawać, edytować i usuwać automatyczne kwestie Lyry; znaczniki są widoczne na timeline, a zapisane kwestie odtwarzają się w grze bez przycisków.

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
- [x] Czat głosowy z avatarami podświetlającymi się przy mówieniu + animacje — opt-in WebRTC P2P z sygnalizacją ograniczoną do graczy pokoju, obsługą wyłączenia i zwalniania mikrofonu oraz animowanym wyróżnieniem mówiącego w lobby, czacie i podglądzie podczas gry; bez zewnętrznego STUN/TURN połączenie poza LAN może zależeć od konfiguracji NAT.
- [x] Czat drużynowy podczas gry — zrealizowany jako wspólny czat pokoju dostępny w lobby i podczas rundy; zwijany panel jest po prawej stronie, aby nie zasłaniać HUD-u ani podglądów graczy po lewej.

## 21. Narrator (Lyra)

- [x] Dodać ekspresje twarzy avatara narratora z `.agents/LORA` — sześć obrazów zostało przeniesionych do assetów aplikacji i odpowiada nastrojom neutral/serious/happy/excited/sad/celebrate/encourage.
- [x] Wykorzystać narratora (`?narrator&text=""`) do czegoś pożytecznego w grze — Lyra prowadzi pierwszą konfigurację, wybór języka i mapy, uruchomienie tutorialu, kalibrację metronomu oraz reaguje na progi combo.
- [x] Lyra ma mieć dobre serce i być pomocna w nauce — teksty objaśniają następny krok, oferują szybki przewodnik i ustawienia, a reakcje używają zachęty po błędzie, uśmiechu po sukcesie i ekspresji dopasowanych do sytuacji.
- [x] Powiększyć kontener narratora — rozmiar ma być kalkulowany na początku, nie ma skakać gdy jest dużo tekstu. — stały, przewijany obszar pięciu linii na desktopie i większy na mobile, zweryfikowany smoke długiej rozmowy.
- [x] Każdy znak tekstu narratora ma mieć fade-in (stopniowe pojawianie się) zamiast prostego typewriter effect. — każdy wpisywany znak otrzymuje `.narrator-char` z animacją, z poszanowaniem `prefers-reduced-motion`.
- [x] Gdy na ekranie są przyciski narratora, gra ma zrobić pauzę dopóki gracz nie wybierze opcji. — zdarzenia `hand-sabers:narrator-pause`/`resume` zatrzymują i bezpiecznie wznawiają timeline.
- [x] Dodać tryb narratora bez przycisków — sam tekst z automatycznym przejściem (do użycia w kreatorze map i tutorialu). — `narratorQuick` korzysta z `autoAdvanceMs` bez tworzenia kontrolek.

## 22. Wizualizacje reagujące na muzykę i nowe tryby gry

- [x] Wstępne wizualizacje reaktywne na muzykę (pulsowanie tunelu, areny)
- [x] Podnieść jakość wizualną do efektu "Wow" — arena łączy wielowarstwową mgławicę i gwiazdy z parallaxem, kinowe smugi i poświatę horyzontu, instancjonowane neonowe żebra głębi, portalowy tunel, refleksy podłogi, świetlne miecze i ACES tone mapping; intensywność reaguje na muzykę, beat oraz natłok bloków, a cięższe dekoracje respektują profile jakości. Zweryfikowano wizualnie na profilu Maximum przy 1440×900 bez błędów strony/konsoli.
- [x] Elementy wizualne reagujące na muzykę, częstotliwości i beaty (zgodne z tym, co użytkownik mapuje w kreatorze) — analizator FFT rozdziela bas/środek/górę, a posortowane czasy beatów mapy sterują impulsami portali, tła i efektów trafień.
- [x] Nowe gamemode'y urozmaicające i udoskonalające rozgrywkę — dostępne są `normal`, `no-arrows`, `pro`, `speed-trials` i `spatial`, wraz z zapisem ustawienia oraz synchronizacją zasad w Multiplayerze.

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

- [x] Naprawić uruchamianie MediaPipe WebAssembly przy produkcyjnej CSP — `security: true` stosuje wąskie `'wasm-unsafe-eval'` bez szerokiego `'unsafe-eval'`; izolowany `npm run smoke:csp` sprawdza brak CSP przy domyślnym `false`, dokładną politykę przy `true` i inicjalizuje prawdziwy runtime WASM oraz model 7,5 MiB przez skompilowany serwer produkcyjny. Zweryfikowano na Chromium 151 z zakresu wspieranych aktualnych Chrome/Edge; zgodność tokenu potwierdzają CSP3 i MDN.
- [x] Usunąć zdalny DOM XSS z podglądu graczy Multiplayer: etykieta w `src/multiplayer/remote-preview.ts` jest teraz budowana przez bezpieczne elementy DOM i `textContent`, bez interpretowania nazwy gracza jako HTML.
- [x] Zabezpieczyć uploady przed DoS w zakresie lokalnego serwera bez kont. — limity działają przed body, `diskStorage` ogranicza pamięć uploadu, maksymalnie 4 zaakceptowane importy po 64 MiB wyznaczają przewidywalny sufit 256 MiB dla obecnego JSZip, a byte-rate, limit per IP i globalna quota dysku blokują wolne oraz nieograniczone zajmowanie zasobów. Świadomie nie dodano systemu kont ani nowej zależności tylko dla per-user quota/streamingu; przy przyszłym publicznym hostingu należy ponownie ocenić ten profil zagrożeń.
  - [x] Przenieść istniejący rate limit tras `/api/maps/save` i `/api/maps/import` przed middleware Multer, aby odrzucane żądania multipart nie były wcześniej buforowane w pamięci.
  - [x] Ujednolicić `MAX_IMPORT_BYTES` do 64 MB dla klienta i serwera; limit obejmuje upload Multera, zapis audio i ZIP po dekompresji.
  - [x] Zastąpić `multer.memoryStorage()` `diskStorage` w prywatnym `maps/.uploads`: audio jest przenoszone do docelowego pliku bez `Buffer`, a uploady są usuwane po sukcesie i błędzie.
  - [x] Ograniczyć pamięć akceptowanego importu ZIP/JSON. — pozostawiono sprawdzony JSZip bez dokładania zależności, ale pojedynczy plik ma twardy limit 64 MiB, najwyżej 4 importy mogą wejść równolegle, a slot jest rezerwowany przed body i zwalniany po pełnym cleanupie; daje to jawny maksymalny budżet 256 MiB dla buforów zaakceptowanych importów zamiast nieograniczonego wzrostu.
  - [x] Dodać limity współbieżności, byte-rate oraz quota dysku dla katalogu uploadów odpowiednie do lokalnego serwera bez kont; zakres per-user rozstrzygnięto poniżej bez udawania uwierzytelnionej tożsamości.
    - [x] Ograniczyć aktywne zapisy/importy map przed parserami i Multerem do 4 globalnie oraz 2 per IP; slot obejmuje całe przetwarzanie i wraca po sprzątnięciu uploadu lub błędzie middleware.
    - [x] Dodać minimalny byte-rate 32 KiB/s po 10 s okresu ochronnego, sprawdzany w oknach 5 s; wolny upload kończy się 408, sprzątnięciem pliku tymczasowego i zwolnieniem slotu.
    - [x] Dodać globalną quota 256 MB katalogu `.uploads`: każdy multipart rezerwuje pełne 64 MB przed Multerem, istniejące i niesprzątnięte pliki pomniejszają dostępny budżet, a przekroczenie zwraca 507.
    - [x] Rozstrzygnąć quota per-user dla obecnego modelu aplikacji. — lokalny serwer nie ma kont ani uwierzytelnionych użytkowników, dlatego nie wprowadzono pozornej quota „per-user” opartej na zmiennym/współdzielonym IP; zakres chronią istniejące limity 2 operacji per IP, 4 globalnie i 256 MiB katalogu tymczasowego. Prawdziwa quota per-user pozostaje wymaganiem dopiero wraz z ewentualnym systemem kont/publicznym hostingiem.
  - [x] Zastąpić globalny `express.json({ limit: '100mb' })` limitami per trasa: 25 MB dla zapisu map i 4 KB dla scores, wykonywanymi dopiero po rate limiterze; endpointy bez body nie uruchamiają parsera JSON.
- [x] Zablokować trwały DoS przez `POST /api/scores`: serwer generuje datę, wymaga małego schematu i ogranicza długości pól, `score`, `combo` oraz `progress`, więc klient nie może utrzymywać ogromnych rekordów w top 1000 i rozrastać `_scores.json`.

### P1 — wysoki priorytet

- [x] Naprawić pipeline testów: usunięto osieroczone oczekiwanie wobec nieistniejącego `findClosestSaberColor`; test pokrywa faktyczny kontrakt eksportowanych presetów, a `npm run unit` przechodzi 31/31.
- [x] Nie ufać bezwarunkowo wynikom podawanym przez klienta. — wybrano model lekkiej, wydawanej przez serwer sesji mapy zamiast pełnego przesyłania cięć: przed nietreningową rundą klient pobiera kryptograficzny, jednorazowy bilet wyłącznie dla istniejącej mapy, a zapis bez biletu, po jego ponownym użyciu, dla innej mapy albo ponad limit wyniku/combo wyliczony z liczby grywalnych nut jest odrzucany. Sesje wygasają po 6 godzinach i mają globalny limit pamięci; brak biletu lub mapa lokalna zachowują wynik tylko lokalnie. Smoke potwierdza prawidłowy zapis oraz odrzucenie ponownego użycia. To chroni publiczną tabelę przed dowolnym payloadem i przypisuje wynik do wydanej mapy, lecz bez kont i serwerowej weryfikacji każdego cięcia świadomie nie jest pełnym systemem anty-cheat.
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
- [x] Wzmocnić ręczne parowanie telefonu przeciw przejęciu widocznego kodu (shoulder surfing/race), np. potwierdzeniem po stronie hosta. — wpisanie kodu tworzy pojedynczą prośbę oczekującą; host jawnie zezwala albo odrzuca, a telefon dostaje właściwy token tylko raz i dopiero po zgodzie. QR nadal używa bezpośredniego losowego tokenu. Kod zachowuje TTL 5 minut i limit 6 prób/min/IP.
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

### Pełny audyt bezpieczeństwa — 2026-09-06

- [x] Przeprowadzić pełny, niezależnie weryfikowany audyt aktualnej rewizji `5588661` — skan `f2b9ce58-bde1-4fe0-b0f9-d65bebaa13fd` objął REST, WebSocket, uploady i storage, renderowanie przeglądarkowe, prywatność kamery, konfigurację oraz zależności. Potwierdzono 4 problemy średnie i 1 niski; nie wykryto ścieżki uruchomienia malware, wysyłania surowych klatek kamery, traversal poza katalog map ani stored XSS.
- [x] Zastąpić porównywanie `Origin` z requestowym `Host` jawną listą `allowedOrigins` używaną wspólnie przez REST, `/ws` i `/tracking-ws`. `security: false` nadal pozostaje świadomie lekkim trybem lokalnym bez tej kontroli; po ustawieniu `true` dokładne originy localhost, Vite, LAN lub HTTPS muszą być wpisane w konfiguracji. Test jednostkowy obejmuje normalizację, IPv6 i błędne wpisy, a smoke skompilowanego serwera odrzuca próbę DNS rebinding z pasującymi nagłówkami atakującego bez psucia MediaPipe. — naprawiono **średni priorytet audytu** `csf_816591e5d59f3fa9360b8b17`.
- [x] Ograniczyć stan rate limiterów po przekroczeniu progu: odrzucone requesty i upgrade'y nie powiększają już tablic historii, a `/ws` korzysta ze wspólnego limitera z okresowym wygaszaniem i czyszczeniem przy zamknięciu serwera. Zachowano wszystkie progi, klucze, odpowiedzi 429 i semantykę odrzucania upgrade'ów; test regresyjny potwierdza, że burst odrzuceń nie przedłuża okna. — naprawiono **średni priorytet audytu** `csf_10962182d79879ff7d31a4e9`.
- [x] Dodać globalny limit bajtów i liczby trwałych map/audio, liczony atomowo przy tworzeniu, zastępowaniu i rollbacku. — jawne `config.json` → `mapLibraryQuota` domyślnie dopuszcza 8 GiB, 2000 unikalnych map i 2000 audio przy obecnym użyciu 112,7 MiB / 21 map / 20 audio. Wszystkie ścieżki JSON, kreatora i ZIP zapisują pod globalną blokadą katalogu, sprawdzają rzeczywisty stan przed commitem i przy HTTP 507 przywracają mapę oraz audio z istniejących backupów; DELETE zawsze może zwolnić miejsce, a serwer niczego nie usuwa automatycznie. Izolowany smoke równoległych zapisów potwierdził dokładnie jeden sukces przy ostatnim wolnym slocie, pełny rollback drugiego zapisu mapy i audio oraz ponowny zapis po usunięciu; pełny `npm run smoke` pozostał zielony. Nie zastępuje to osobnego, zablokowanego zadania quota per-user.
- [x] Nie trzymać blokady mapy przez cały transfer audio/ZIP do klienta — mapa i otwarty plik audio tworzą spójny snapshot pod krótkim lockiem, transmisja ma pięciominutowy deadline i cleanup po rozłączeniu/błędzie, a ZIP nie otwiera już leniwie zmiennej ścieżki. Wyszukiwanie po tytule zwalnia globalny lock katalogu przed lockami map. Smoke na Windows zatrzymuje klientów audio i ZIP, równolegle zastępuje tę samą mapę w 2 sekundy oraz potwierdza kompletne stare snapshoty i nowe kolejne odczyty; uwzględniono bezpieczne zastępowanie otwartego celu z istniejącym rollbackiem. — naprawiono **średni priorytet audytu** `csf_d323191e9b1b71e5fda12588`.
- [x] Usunąć fallback `express.static(PROJECT_ROOT)` — Express serwuje wyłącznie zbudowany `dist`, a brak `dist/index.html` zatrzymuje start z instrukcją `npm run build` przed utworzeniem katalogów danych. `dev:server` wykonuje teraz wymagany build, test jednostkowy pilnuje braku fallbacku, a smoke sprawdza również `/server%2Findex.ts` i `/maps%2F_scores.json`. Nie usunięto żadnych plików projektu. — naprawiono **niski priorytet audytu** `csf_1974c087e7021419f042681c`.
- [x] Pozwolić na mikrofon z własnego originu w `Permissions-Policy`, gdy `security: true`, aby opcjonalny czat głosowy nie był blokowany przez nagłówki wdrożeniowe; polityka dopuszcza teraz wyłącznie `(self)`, a czat nadal wymaga jawnego kliknięcia i zgody przeglądarki.
- [x] Dodać proxy `/tracking-ws` do konfiguracji Vite — developerski frontend przekazuje teraz `/api`, `/ws` i kanał telefonu do Expressa na porcie 3000; dokumentacja obu języków opisuje ten sam układ.
- [x] Zaktualizować `SECURITY.md` do faktycznego ręcznego parowania: kod tworzy pending claim, host musi jawnie zatwierdzić, token telefonu jest wydawany jednokrotnie; QR nadal przenosi bezpośredni token telefonu.
- [x] Zaktualizować podatne wersje przechodnie bez dodawania nowych pakietów — lockfile ma teraz `brace-expansion@5.0.9`, `qs@6.16.0`, `nanoid@3.3.18` i `postcss@8.5.28`; pełne `npm audit` zgłasza 0 podatności. Wcześniejszy audyt osiągalności dodatkowo potwierdził, że eksport Archiver dodaje jawne pliki bez globów, a Express używa prostego parsera query i body JSON.

### Pełny audyt bezpieczeństwa — 2026-09-09

- [x] Przeprowadzić pełny audyt rewizji `09df4f4eae2f8bd6d79ef598b924b0e9e231bf79` — potwierdzono pięć problemów średnich; raport nie wykazał ścieżki uruchomienia malware, potajemnego wysyłania obrazu kamery, traversal poza storage ani stored XSS.
- [x] Usunąć nieprzypięty runtime Stats.js: panel deweloperski ładuje teraz lokalny, leniwy addon z zainstalowanego `three`, a CSP nie dopuszcza już `mrdoob.github.io`. Nie zamrożono aplikacji na starej wersji — addon aktualizuje się razem z kontrolowaną zależnością `three`.
- [x] Walidować rzeczywiste wymiary JPEG telefonu przed natywnym dekoderem: parser SOF odrzuca brak lub duplikat nagłówka, uszkodzone segmenty i rozbieżność wymiarów z kopertą przy zachowaniu limitu 64 KiB oraz trybów baseline/progressive.
- [x] Egzekwować backpressure dla wszystkich wiadomości JSON Multiplayer, w tym dużych `voice-signal`: wolny odbiorca jest kontrolowanie zamykany kodem `1013`, a pozostali gracze pozostają połączeni.
- [x] Ograniczyć koszt publicznych odczytów map bez blokowania normalnej gry: maksymalnie dwa równoległe eksporty ZIP i dwa zimne hashe audio, anulowanie hasha po rozłączeniu, cache SHA-256 według metadanych pliku oraz unieważniany indeks tytułów zamiast skanowania katalogu dla każdego zapytania.
- [x] Zamykać każde żądanie HTTP Upgrade spoza dokładnych ścieżek `/ws` i `/tracking-ws`; prawidłowe handshaki z query string nadal działają, a nieznane lub podobne ścieżki są natychmiast kończone.
- [x] Zweryfikować remediację: `npm run lint`, `npm run build`, `npm run server:build`, 54/54 testy jednostkowe, pełny smoke serwera oraz skupione próby raw socket, wolnego WebSocket, JPEG, współbieżnych eksportów/manifestów i indeksu tytułów przeszły. Playwright pominięto, ponieważ te zmiany nie modyfikują UI, a nie udzielono nowej zgody na jego uruchomienie.

### Końcowy audyt jakości — 2026-09-10

- [x] Zweryfikować pełną lokalną ścieżkę jakości: lint i typecheck klienta/serwera, build z budżetem bundla, 54/54 testy jednostkowe, smoke skompilowanego serwera oraz rzeczywisty `npm start`. Endpointy `/`, `/api`, `/api/health` i `/api/maps` odpowiadają 200 przy domyślnym `security: false`.
- [x] Zastąpić przestarzały asynchroniczny loader testów Node synchronicznym `registerHooks()` dostępnym w wymaganym Node 22.18+, bez zmiany sposobu rozwiązywania importów TypeScript i bez ostrzeżenia deprecation.
- [x] Zatrzymywać miernik dB ustawień po zamknięciu panelu lub zmianie zakładki Audio; obserwator uruchamia RAF ponownie dopiero wtedy, gdy miernik jest rzeczywiście widoczny.
- [x] Odroczyć zwolnienie adresów `blob:` eksportu mapy, ZIP i biblioteki do następnego zadania event loop, aby kliknięcie pobierania nie ścigało się z `URL.revokeObjectURL()`; rzeczywiste pobrania obu formatów przeszły w Chromium.
- [x] Zaktualizować istniejący Multer z 2.2.0 do 2.3.0 po wykryciu podatności parsera multipart i sprzątania przerwanych uploadów; `npm audit` zgłasza 0 podatności, bez dodawania nowej zależności.
- [x] Ustabilizować smoke Playwright aplikacji WebGL na maszynach bez fizycznego GPU: sceny są uruchamiane pojedynczym workerem zamiast przeciążać programowy renderer. Pełny zestaw menu, profilu, osiągnięć i Lyry przechodzi 4/4.
- [x] Zakończyć formalny skan bezpieczeństwa aktualnej rewizji i dopisać jego zweryfikowane wyniki. — standardowy Codex Security scan `38b0363f-be97-462d-92ce-cff0ec241863` objął pełny inwentarz 296/296 plików rewizji `f840aa5`, sześć powierzchni (API/storage, Multiplayer/WebRTC, telefon kamera/audio, DOM/URL, konfiguracja/supply chain i limity zasobów) i zakończył się kompletnym raportem bez potwierdzonych podatności. Pełne `npm audit --json` zgłasza 0 podatności w 235 zależnościach lockfile. Ograniczenie: bieżąca sesja nie udostępniała niezależnego audytora delegowanego ani fizycznych urządzeń, więc testy sprzętowe pozostają jawnie zablokowane w swoich punktach.

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
- [ ] Dokończyć i ustabilizować audio na telefonie — **część kodowa gotowa; zablokowane testem sprzętowym iOS/Android**.
  - [x] Obsłużyć i walidować `prepare`/`play`/`pause`/`seek`/`stop`/`volume` oraz przekazywać głośność główną i muzyki.
  - [x] Kompensować czas transmisji i konfigurowalną latencję bez pogarszania działania przy rozjechanych zegarach urządzeń.
  - [x] Po reconnect ponownie przygotować utwór i wznowić go od aktualnej pozycji oraz z aktualnym tempem.
  - [x] Przełączać wyjście podczas działania, wymagać prawdziwej aktywacji audio na telefonie i zawsze przywracać aktualną głośność PC jako fallback.
  - [ ] Przetestować cały przepływ na fizycznych telefonach z iOS i Androidem, również po blokadzie ekranu oraz zmianie głośnika/słuchawek Bluetooth — **zablokowane brakiem dostępu do tych urządzeń w środowisku agenta**.
- [x] Pokazywać jednoznacznie miejsce wykonywania ML dla kamery telefonu: „ML: komputer”, „ML: telefon” albo oczekiwanie na telefon. Etykieta aktualizuje się dla trybu Auto, Kamera PC i Telefon wraz ze stanem połączenia.
- [x] Zbudować jeden kompletny hub „Telefon” dla wspólnego parowania kamery i audio, bez tworzenia oddzielnych, konkurujących sesji. — jedna sesja i jeden kanał obsługują niezależnie kamerę oraz audio, negocjują możliwości telefonu, wybierają miejsce ML i współdzielą zweryfikowany lifecycle połączenia bez konkurujących kodów parowania.
  - [x] Dodać tryb „Telefon jako kamera — ML na komputerze”: telefon przesyła zoptymalizowane klatki, komputer wykonuje HandLandmarker, a UI ostrzega o koszcie kodowania/sieci dla starszych telefonów. — negocjowany tryb nie ładuje MediaPipe na telefonie, koduje maks. 15 kl./s jako JPEG 320×240, korzysta z limitu 64 KiB i backpressure, a komputer dekoduje tylko jedną klatkę naraz i przekazuje wynik do istniejącego Workera pozycji. Smoke z emulowaną kamerą potwierdził prawdziwy JPEG 320×240, walidację i relay host–telefon; wydajność fizycznego starszego telefonu pozostaje do pomiaru sprzętowego.
  - [x] Zachować działający tryb „Telefon jako kamera — ML na telefonie”: telefon wykonuje HandLandmarker i przesyła wyłącznie landmarki.
  - [x] Udostępnić oba miejsca wykonywania ML w nowym hubie jako jasny wybór: komputer dla mocniejszego PC albo telefon dla mocniejszego urządzenia mobilnego. — wspólne, eksportowalne ustawienie jest walidowane i synchronizowane między ustawieniami a hubem; opisy wyjaśniają koszt sieci/kodowania, telefon jawnie zmienia status oraz komunikat prywatności, a zmiana aktywnego pipeline'u zatrzymuje tracking i unieważnia kalibrację zamiast mieszać wyniki.
  - [x] Pozwolić niezależnie włączyć rolę kamery, rolę wyjścia audio albo obie role na tym samym sparowanym telefonie; pokazywać osobny stan każdej roli oraz wspólny stan połączenia. — smoke w Chromium potwierdził sekwencję tylko kamera → kamera+audio → tylko audio, niezależny zapis obu ustawień, osobne stany kart oraz utworzenie dokładnie jednej wspólnej sesji i jednego kodu parowania.
    - [x] Dodać pierwszy etap wspólnego hubu PC: jedna sesja pokazuje osobne karty kamery i audio z niezależnymi, zsynchronizowanymi przełącznikami oraz stanami wyłączone/oczekuje/gotowe/nieobsługiwane; dotychczasowe kontrolki źródła śledzenia i audio pozostają dostępne.
  - [x] Dodać negocjację możliwości telefonu (WebCodecs/media constraints, Web Audio, formaty audio, pamięć/cache) i bezpieczny fallback zamiast pozostawiania użytkownika w nieskończonym ładowaniu. — telefon wysyła po każdym połączeniu wyłącznie walidowany raport techniczny bez identyfikatorów; brak Web Audio lub zgodnego formatu blokuje rolę audio z czytelnym komunikatem i pozostawia dźwięk na PC, a brak Cache Storage nadal korzysta z fallbacku pamięciowego.
  - [x] Ujednolicić rozłączanie, reconnect i wygasanie sesji dla obu ról oraz raportować czytelny kod błędu po stronie telefonu, klienta PC i serwera. — host i telefon korzystają ze wspólnej polityki backoff oraz rozróżniają `SESSION_EXPIRED`, `SESSION_REVOKED`, `UNAUTHORIZED`, `SERVER_BUSY` i lokalne `CONNECTION_LOST`; błędy terminalne usuwają dane sesji, a przejściowe zachowują sesję i ponawiają połączenie. Serwer wysyła typowane kody, PC publikuje kod w stanie sesji, a telefon pokazuje kod i wraca do formularza parowania. Smoke w Chromium potwierdził unieważnienie po obu stronach oraz reconnect `connected → CONNECTION_LOST → connected` bez tworzenia nowego kodu.
    - [x] Zatrzymywać muzykę i raportowanie miernika audio po utracie peer-a, a po reconnect przywracać miernik bez utraty wcześniejszej aktywacji użytkownika; kamera i audio korzystają z tych samych zdarzeń lifecycle sesji.
- [ ] Rozszerzyć „Audio na telefonie” z samej muzyki do kompletnego, synchronizowanego banku dźwięków gry — **część kodowa gotowa; zamknięcie wymaga testu całego banku na fizycznych telefonach i słuchawkach**.
  - [x] Zbudować wersjonowany manifest wszystkich assetów audio (interfejs, muzyka, trafienia, pudła, bomby, combo, milestone i pozostałe efekty) z rozmiarem oraz hashem treści. — endpoint banku zwraca muzykę mapy z faktycznym rozmiarem i SHA-256 oraz kompletny katalog obecnych dźwięków proceduralnych z wersją receptury i osobnym hashem; identyfikator całego banku zmienia się wraz z dowolnym assetem.
  - [x] Preloadować tylko brakujące assety do trwałego cache telefonu, pokazywać postęp w bajtach i liczbie dźwięków oraz weryfikować integralność przed oznaczeniem telefonu jako gotowego. — wdrożone z weryfikacją hasha/rozmiaru, pamięciowym fallbackiem, raportowaniem w hubie i na ekranie przygotowania rundy oraz bezpiecznym powrotem do audio PC.
    - [x] Telefon pobiera manifest, rozpoznaje cache po hashu, weryfikuje rozmiar i SHA-256 także dla wpisu z cache, raportuje ograniczony częstotliwościowo postęp oraz potwierdza gotowość z `requestId`; brak Cache Storage działa jako bezpieczny fallback pamięciowy, a timeout/błąd/rozłączenie pozostawia audio na PC.
    - [x] Pokazać raportowany postęp preloadu w docelowym hubie telefonu: pasek prezentuje bajty/MB i liczbę dźwięków, a wynik pokazuje liczbę zweryfikowanych assetów, trafienia z cache albo walidowany kod fallbacku PC.
    - [x] Pokazać ten sam postęp na ekranie oczekiwania przed rundą. — etap Audio pokazuje liczbę i MB assetów z walidowanych eventów banku, trafienia cache po sukcesie oraz kod fallbacku PC po błędzie/rozłączeniu; Singleplayer czeka wyłącznie na faktyczny preload z istniejącym timeoutem i pozwala bezpiecznie anulować bez późnego uruchomienia rundy.
  - [ ] Zamiast polegać na natychmiastowym evencie WebSocket synchronizować zegary i planować odtwarzanie w Web Audio na konkretny timestamp; mierzyć odchylenie i nie deklarować celu ±20 ms bez pomiaru na realnym urządzeniu — **część kodowa gotowa; zablokowane potwierdzeniem budżetu na fizycznym urządzeniu**.
    - [x] Synchronizować zegar host–telefon próbkami NTP-style: oddzielić czas przetwarzania telefonu od RTT, wybierać medianę trzech próbek o najniższym RTT, przekazywać offset z powrotem na telefon i publikować lokalną diagnostykę. Odtwarzanie muzyki nie zakłada już zgodnych zegarów urządzeń.
    - [x] Dodać telefoniczny renderer Web Audio wszystkich 10 obecnych receptur, planowanie według zsynchronizowanego timestampu, numery sekwencji, bufor deduplikacji oraz potwierdzenia `scheduled`/`late`/`duplicate`/`unavailable`. Efekty PC pozostają aktywne do ukończenia integracji.
    - [x] Podłączyć efekty gameplayu: beat, hit, combo, miss, bomb i milestone przechodzą na telefon dopiero po gotowości banku i co najmniej trzech próbkach zegara; wysłanie niemożliwe, `unavailable`, rozłączenie albo brak ACK uruchamia fallback PC.
    - [x] Podłączyć dźwięki interfejsu głównej strony gry: hover, aktywację, powrót i typing narratora, z tym samym ACK oraz fallbackiem PC; niezależne strony bez sesji telefonu zachowują lokalne audio.
    - [x] Raportować rzeczywisty błąd startu: telefon rozróżnia blokadę autoplay, nieobsługiwany format, przerwanie i błąd silnika efektów; pokazuje czytelny powód z kodem, przesyła go przez walidowany serwer, a klient PC publikuje diagnostykę i zachowuje fallback.
    - [ ] Potwierdzić budżet startu na fizycznych urządzeniach — **zablokowane brakiem dostępu do docelowych telefonów i słuchawek**.
  - [x] Zapewnić idempotentne eventy audio z numerem sekwencji, deduplikacją, potwierdzeniem, obsługą spóźnionych/utraconych eventów oraz bezpiecznym fallbackiem na audio komputera. — telefon deduplikuje ruchomym oknem 256 sekwencji i odsyła wynik planowania; host nie wyłącza lokalnego efektu bez stabilnego zegara, a po wysłaniu przywraca go przy `unavailable`, braku ACK lub rozłączeniu. Diagnostyka ACK pozostaje dostępna jako zdarzenie lokalne.
  - [x] Dodać w ustawieniach test każdego dźwięku osobno oraz miernik dB master/audio telefonu z segmentami zielony–żółty–czerwony i wskaźnikiem przesteru.
    - [x] Dodać miernik master PC oparty na rzeczywistych próbkach wyjścia AudioContext: RMS w dB, peak/clipping, segmenty zielony–żółty–czerwony, dostępne `role="meter"` i responsywny układ. Dźwięk testowy i metronom przechodzą teraz przez globalny master zamiast omijać mikser.
    - [x] Dodać analogiczny miernik telefonu: wspólny analizator muzyki i efektów raportuje do hosta RMS w dB, peak oraz clipping w walidowanych próbkach 8 Hz; ustawienia pokazują dostępny miernik zielony–żółty–czerwony bez sugerowania pomiaru fizycznego wyjścia Bluetooth.
    - [x] Dodać osobne przyciski testowe dla wszystkich 10 receptur, korzystające z tej samej ścieżki telefon/PC i tych samych ustawień głośności co właściwa rozgrywka.
  - [ ] Obsłużyć zmianę głośności, pauzę, seek, tempo, powrót z blokady ekranu i przełączenie słuchawek bez rozjechania timeline'u — **część kodowa gotowa; zablokowane testem blokady ekranu i zmiany wyjścia na fizycznym urządzeniu**.
    - [x] Po `visibilitychange`, `pageshow` lub `devicechange` telefon wysyła walidowaną prośbę o resynchronizację; host ponownie przesyła głośność oraz aktualny stan pauzy albo czas i tempo odtwarzania.
    - [x] Dodać programowy pomiar i okresową korektę dryfu podczas aktywnego odtwarzania: po stabilizacji zegara host wysyła numerowany snapshot co sekundę; telefon ignoruje duplikaty, przy dryfie 15–250 ms łagodnie koryguje tempo maksymalnie o 2,5%, powyżej 250 ms wykonuje seek, wznawia zatrzymany element i raportuje rodzaj korekty oraz zmierzone odchylenie.
    - [ ] Potwierdzić zachowanie po blokadzie ekranu i zmianie słuchawek oraz rzeczywisty budżet opóźnienia na fizycznych urządzeniach — **zablokowane brakiem dostępu do docelowego telefonu/słuchawek; nie deklarować ±20 ms wyłącznie na podstawie pomiaru programowego**.
- [x] Dodać barierę gotowości przed rundą Multiplayer dla mapy, trackingu i audio wszystkich graczy. — klient raportuje postęp każdego zasobu, serwer waliduje trzy jawne flagi i sam wylicza końcowe `ready`; lista graczy pokazuje osobne stany Mapa/Audio/Śledzenie.
  - [x] Serwer ma rozpocząć rundę dopiero po potwierdzeniu gotowości wymaganych zasobów przez wszystkie aktywne sesje; rozłączenie lub zmiana mapy unieważnia poprzednią gotowość. — rzeczywisty test dwóch połączeń WebSocket potwierdził odrzucenie przedwczesnego startu, reset flag po zmianie mapy i start dopiero po komplecie obu graczy; opuszczenie pokoju usuwa sesję razem z jej stanem, a ponowne dołączenie zaczyna od trzech flag `false`.
    - [x] Pokazać ekran „Sesje graczy ładują się… proszę czekać”, spinner, progressbar `gotowi/wszyscy`, stan każdego gracza i przycisk „Opuść lobby”. — karta oczekiwania korzysta z serwerowego pola `ready`, pojawia się już podczas lokalnego przygotowania, pokazuje dla każdego gracza osobne znaczniki Mapa/Audio/Śledzenie i rozłącza przez tę samą ścieżkę co główny przycisk opuszczenia pokoju.
    - [x] Dodać tekst wyjaśniający możliwość wyjścia przy błędzie lub zbyt długim oczekiwaniu 😎, timeouty z czytelnym powodem oraz możliwość ponowienia bez restartu całego lobby. — przygotowanie ma limit 45 s, anulowanie unieważnia spóźniony rezultat, błędy mapy są tłumaczone na czytelny powód, a po błędzie/timeoutcie przycisk „Gotowy” pozwala ponowić próbę w tym samym połączonym pokoju.
  - [x] Użyć spójnego, profesjonalnego ekranu ładowania także w Singleplayerze, z etapami przygotowania mapy, audio, trackingu i sceny. — start rundy pokazuje rzeczywiste etapy na responsywnym overlayu, utrzymuje go podczas `ensureCurrentMapAudio()` i zamyka dopiero bezpośrednio przed `startGameplay()`; anulowanie sprząta stan widoku, a panel kamery nie nachodzi na ekran.
- [x] Dodać telemetrię jakości telefonu: czas pobierania/preloadu, cache hit-rate, RTT/jitter, drift zegara, opóźnienie zaplanowane/rzeczywiste audio, dropy klatek i czas ML; dane diagnostyczne mają być widoczne lokalnie i raportowane do serwera bez tokenów ani surowego obrazu. — panel developerski pokazuje czas preloadu, cache hit-rate, RTT, jitter, offset zegara, drift timeline'u, rzeczywiste spóźnienie schedulera Web Audio oraz istniejące metryki pakietów, dropów, kolejki, kodowania i ML. Serwer agreguje wyłącznie dozwolone pola już zwalidowanych eventów w pamięci sesji i udostępnia hostowi snapshot przez autoryzowane `GET /api/tracking-sessions/:id/quality`; nie przechowuje tokenów ani obrazu i kasuje dane po unieważnieniu sesji. Snapshot zawiera teraz także P50/P95 z ograniczonego okna 2048 próbek dla RTT, bezwzględnego dryfu/spóźnienia audio oraz wieku klatki, ML i kodowania, dzięki czemu test sprzętowy może zapisać wymagane percentyle bez ręcznego liczenia. Panel `SND` eksportuje wersjonowany raport JSON lub CSV z konfiguracją i ścisłą listą dozwolonych metryk; raport jawnie pozostawia testy sprzętowe jako niepotwierdzone i nie zawiera tokenów ani obrazu. Smoke dwóch WebSocketów potwierdził snapshot, 404 bez autoryzacji i brak kontrolnie dosłanych pól `token`/`rawImage`, a smoke UI potwierdził pobranie oraz odczyt obu formatów. Fizyczna latencja głośnika/słuchawek pozostaje zakresem osobnego testu sprzętowego.
- [ ] Zweryfikować cały hub na fizycznych urządzeniach iOS/Android (słabe i mocne), w Wi‑Fi 2,4/5 GHz, z głośnikiem oraz słuchawkami Bluetooth; zapisać P50/P95 i potwierdzić lub skorygować budżet ±20 ms.
- [ ] Zmierzyć i zoptymalizować end-to-end latency remote tracking — **instrumentacja gotowa; zablokowane pomiarami na dwóch klasach fizycznych telefonów**.
  - [x] Dodać diagnostykę etapów: wiek ostatniej klatki kamery, ML i kodowanie na telefonie, częstotliwość oraz rozmiar pakietów, kolejkę WebSocket, lokalne odrzucenia, braki sekwencji, szacowane WS→PC i telefon-send→zastosowanie pozycji. Przy rozbieżnych zegarach wynik sieci jest jawnie ukrywany zamiast fałszowany.
  - [x] Usunąć dodatkowy interwał opóźnienia: wynik Workera jest stosowany natychmiast po odpowiedzi, a nie dopiero przy następnym wykryciu.
  - [ ] Zmierzyć przepływ osobno na fizycznym telefonie słabszym i high-end oraz zapisać wyniki — **zablokowane brakiem dostępu do obu klas urządzeń**.
  - [ ] Na podstawie pomiarów dostroić częstotliwość, kolejki/backpressure, interpolację i odrzucanie spóźnionych danych — **zablokowane wynikami poprzedniego pomiaru; bez nich nie zgadywać progów**.
- [x] Poprawić wyświetlanie landmarków innych graczy: położenie, skalowanie, podpisy, kolory profilu, widoczność w normalnym/dev mode, brak zasłaniania gameplayu oraz płynność przy opóźnieniach i utracie pakietów. — podglądy tworzą zwartą siatkę w lewym dolnym obszarze, zachowują avatar, nazwę i kolor profilu, przenoszą się do panelu kamer w dev mode i nie kolidują z czatem/HUD-em. Zawężono błędny selektor ukrywający pierwszego gracza; brak danych przez 1 s wygasza i czyści obraz, a nowy pakiet go przywraca. Pozycje mieczy korzystają z istniejącego bufora interpolacji 100 ms i progu nieaktualności 750 ms. Zweryfikowano czterech graczy, oba tryby, utratę/powrót pakietów i usunięcie gracza.
- [x] Poprawić kalibrację metronomem: stabilność obliczenia offsetu, wyraźne rozróżnienie warm-up i właściwych próbek, możliwość ponowienia, poprawne zatrzymanie timerów/audio oraz czytelny wynik i ostrzeżenie o niestabilnym pomiarze. — istniejąca implementacja odrzuca 2 próbki rozgrzewkowe, zbiera 8 właściwych, używa mediany/MAD, odrzucania odstających wartości i przyciętej średniej, a UI rozdziela liczniki i pokazuje offset z rozrzutem albo ostrzeżenie. Smoke potwierdził pełny pomiar, wynik niestabilny, retry oraz anulowanie bez pozostawionego overlayu, timera lub handlera klawiatury.
  - [x] Liczyć offset względem każdego tyknięcia co 500 ms, a nie wyłącznie względem akcentu występującego co piąte tyknięcie.
  - [x] Wyświetlać wynik stabilny lub ostrzeżenie o niestabilnym pomiarze przed zamknięciem nakładki.
  - [x] Rozróżnić natychmiastowe anulowanie od opóźnionego zamknięcia wyniku i zabezpieczyć ponowne uruchomienie przed starym timerem nakładki.
  - [x] Synchronizować etykietę przycisku ustawień po anulowaniu z nakładki, ukończeniu pomiaru i braku obsługi AudioContext.
  - [x] Rozdzielić licznik i komunikaty na 2 tapnięcia rozgrzewkowe oraz 8 właściwych próbek pomiarowych, bez błędu off-by-one.
  - [x] Pozostawić wynik na ekranie do decyzji użytkownika: zastosować offset, ponowić pomiar lub zamknąć bez zmian; niestabilny wynik wymaga osobnego „Zastosuj mimo to”.
  - [x] Planować kliknięcia według zegara `AudioContext` z wyprzedzeniem zamiast dokładności timerów JavaScript; start czeka na wznowienie audio, a zamknięcie w trakcie startu anuluje żądanie.
  - [ ] Wykonać ręczny pomiar na realnych wyjściach audio (przewodowe, Bluetooth, głośniki) i ocenić, czy zakres oraz znak zapisanego offsetu odpowiadają odczuciu w grze — **zablokowane sprzętowo**.
  - [x] Pokazać offset, rozrzut i liczbę użytych próbek dla wyniku stabilnego oraz niestabilnego.
  - [x] Czyścić timery animacji i stan wizualny przy anulowaniu, wyniku, zamknięciu oraz ponowieniu pomiaru.
  - [x] Sprawdzić pełny flow UI w Chromium: start, anulowanie, stabilny wynik, niestabilny wynik, zastosowanie, zamknięcie i szybkie ponowienie. Smoke potwierdził stabilny wynik `148 ms / ±31 ms`, zastosowanie, natychmiastowe anulowanie, reset retry do `ROZGRZEWKA 0 / 2` i brak błędów strony; wcześniejszy smoke potwierdził również wynik niestabilny i „Zastosuj mimo to”.
  - [ ] Ręcznie odsłuchać tyknięcia i wynik na realnym wyjściu audio w każdej docelowo obsługiwanej przeglądarce — **zablokowane sprzętowo; automatyczny smoke nie potwierdzi odczuwalnej synchronizacji**.

### Gameplay, grafika i arena

- [x] Naprawić tryb jednej ręki: dla lewej ręki renderować wyłącznie lewy miecz, a prawy ukryć; dla prawej odwrotnie. Ukryć również nieaktywną poświatę, światło, trail, odbicie i pozostałe efekty, bez zmiany logiki aktywnego miecza.
- [x] Naprawić efekt krytycznego HP: pulsujące czerwone obramowanie musi zostać wyłączone lub zamrożone przy pauzie oraz zawsze wyczyszczone po game over, wyjściu do menu, restarcie i zmianie trybu — nie dopiero przy rozpoczęciu nowej gry.
- [x] Dodać więcej ustawień graficznych z podglądem na żywo i bezpiecznymi presetami: osobne sterowanie detalem areny, podłogą/odbiciami, tłem, mgłą, światłami, shaderami, efektami trafień i wizualizacjami muzycznymi. — tryb Custom steruje tymi elementami na żywo, w tym osobno oświetleniem dekoracyjnym; siedem presetów i Auto ograniczają kosztowne efekty na słabszych profilach.
- [x] Przebudować tło areny i podłogę: poprawić czytelność, głębię, odbicia, materiały i zachowanie na różnych profilach wydajności. — warstwowy shader dodaje perspektywę, parallax, mgławicę, gwiazdy i przyciemnienie pasa gry; podłoga ma materiał z połyskiem, siatkę, poświaty mieczy i projekcyjne odbicie renderowane tylko na profilach Ultra/Maximum/Custom.
- [x] Dodać dodatkowe, opcjonalne efekty reagujące na muzykę i pasma częstotliwości, z kontrolą intensywności, ograniczeniem wpływu na czytelność bloków oraz możliwością całkowitego wyłączenia. — portal/tunel, warstwy tła, gwiazdy i odłamki korzystają z energii pasm oraz beatów; ustawienia udostępniają wyłączenie, Auto i ręczne `0–1.5×`, a `gameplayVisualPressure` osłabia dekoracje przy blokach blisko gracza.
- [x] Dodać tryb gry z przestrzennie losowymi pozycjami bloków zamiast stałych wysokości — tryb `spatial` korzysta z deterministycznego generatora wspólnego dla singla i Multiplayera; wykrywa grupy co najmniej 4 bloków w oknie 0,5 s, układa je w przechodnie formacje, ogranicza dystans kolejnych ruchów osobno dla każdej ręki oraz rozdziela pozycje bliskie w czasie. Zweryfikowano deterministyczność, zakres, reachability i separację kontrolowaną sekwencją oraz UI w Chromium.
- [x] Dodać więcej subtelnych mikroanimacji tekstów, nagłówków, przycisków i zmian stanu, z obsługą `prefers-reduced-motion` i bez pogarszania wydajności/czytelności. — krótkie wejścia obejmują nagłówki i sekcje ustawień/modali, komunikaty stanu mają dyskretny pop, a przyciski delikatny feedback `scale`; efekty używają wyłącznie `opacity`/`transform`/`scale`, są ograniczone do UI i wyłączane przy redukcji ruchu.

### Ustawienia i konfiguracja

- [x] Dodać wersjonowany eksport i import ustawień użytkownika. Eksport obejmuje kompletny wspólny model konfiguracji (60/60 pól, w tym język), import używa walidacji schematu, allowlisty, limitu rozmiaru, podglądu zmian, potwierdzenia i rollbacku. Wszystkie moduły korzystają ze stabilnej referencji jednego źródła prawdy; `both` jest migrowane do wewnętrznego trybu obu rąk, a starsze pliki v1 bez języka lub sterowania światłami zachowują bieżące ustawienie urządzenia. Tokeny, sekrety sesji i dane tymczasowe nie są eksportowane.

### Developer tools

- [x] Dokończyć tryb deweloperski jako spójny zestaw narzędzi, usunąć martwe kontrolki i zapewnić poprawne sprzątanie stanu po jego wyłączeniu. — ustawienia i Tweakpane synchronizują się dwukierunkowo, wszystkie widoczne kontrolki mają aktywne handlery, a wyłączenie usuwa panel, Stats, globalne nasłuchy przeciągania, spóźnione inicjalizacje, klasę trybu oraz debugowe hitboxy/wireframe. Przycisk `[dev]` przełącza narzędzia bez przeładowania i usuwa wymuszający parametr URL; zweryfikowano szybkie przełączenie i dwa pełne cykle bez duplikatów lub pozostawionego stanu.
- [x] Dodać do dev panelu średni FPS (AVG FPS) liczony w stabilnym ruchomym oknie obok wartości chwilowej oraz opcjonalnie 1% low, aby chwilowe skoki nie zaciemniały pomiaru. (10-sekundowe okno; 1% low pozostaje opcjonalne.)
- [x] Sprawdzić wszystkie skutki flagi `?testing`; udokumentować je i, jeśli nadal są potrzebne, dodać kontrolowaną możliwość włączenia równoważnego trybu z panelu developerskiego bez ręcznej edycji URL. `?testing` jest wyłącznie historycznym aliasem `?dev`: uruchamia panel deweloperski i debugowe wizualizacje trackingu; odpowiada mu istniejący przełącznik „Tryb developera”, więc nie dodawano osobnego trybu testowego.
- [x] Zapisywać stan zminimalizowania panelu HAND SABERS DEV oraz ostatnio otwartą zakładkę; przywracać je po przeładowaniu z rozsądnym fallbackiem po zmianie wersji UI.
- [x] Zsynchronizować ustawienia dev panelu z ustawieniami gry dwukierunkowo i na żywo: jedna warstwa stanu, brak rozbieżnych wartości, natychmiastowa aktualizacja UI/sceny oraz poprawny reset do domyślnych. — `core/settings` emituje typowane zmiany z jednego współdzielonego obiektu; Tweakpane odświeża się po zmianach zwykłego UI/importu/resetu, a zmiany dev panelu synchronizują kontrolki audio, gameplayu, trackingu i grafiki wraz ze sceną. Smoke potwierdził oba kierunki, localStorage i reset wyłączający domyślnie tryb dev.

### Multiplayer, co-op i czat

- [x] Dodać obok „KOPIUJ LINK” przycisk „KOPIUJ KOD” z feedbackiem sukcesu/błędu i fallbackiem, gdy Clipboard API jest niedostępne.
- [x] Udoskonalić ustawienia zasad Multiplayer tak, aby pokrywały 100% wspieranych możliwości rozgrywki; host ma być źródłem prawdy, a zablokowane lokalne ustawienia muszą jasno pokazywać wartość narzuconą przez pokój. — snapshot pokoju obejmuje tryb multiplayer, trening, No Fail, wszystkie pięć trybów gry i cztery prędkości nut; serwer waliduje wartości, a goście widzą je w zablokowanych polach. Runda używa reguł hosta tylko w pamięci i przywraca profil singleplayer po zakończeniu. Ustawienia zależne od urządzenia (tracking, audio, grafika) świadomie pozostają lokalne, a wybór ręki już wynika z roli przydzielonej przez serwer.
- [x] Poprawić czat pokoju i udostępnić go zarówno w lobby, jak i podczas rozgrywki: wspólna historia ostatnich 50 wiadomości trafia do lobby i zwijanego overlayu w prawym górnym rogu, badge sygnalizuje nowe wiadomości, a formularz izoluje klawisze od sterowania grą i przejmuje focus po rozwinięciu. Istniejący limit 240 znaków i serwerowy rate limit pozostają aktywne. Zweryfikowano dwiema niezależnymi sesjami przeglądarki oraz wizualnie na desktopie i ekranie 390 px.
- [x] Poprawić co-op dla lobby z więcej niż 2 osobami: opcja co-op może pozostać wybrana, ale START ma być zablokowany z jasnym komunikatem o wymaganej liczbie graczy i wskazaniem konieczności usunięcia nadmiarowych osób.
- [x] Dodać hostowi możliwość kickowania graczy oraz banowania. — host widzi przy każdym gościu przycisk z dwuetapowym potwierdzeniem; serwer ponownie sprawdza rolę hosta i przynależność celu, usuwa gościa, zamyka jego WebSocket kodem `1008` i blokuje ponowne wejście tej samej instalacji do końca życia pokoju, również ze współdzielonym tokenem zaproszenia. Identyfikator moderacyjny jest losowym, lokalnym identyfikatorem instalacji przeglądarki, nie trafia do snapshotów ani UI i zachowuje zgodność ze starszym klientem; bez systemu kont nie jest to ban trwały i świadome wyczyszczenie danych przeglądarki pozwala utworzyć nową tożsamość. Przepływ dwóch prawdziwych połączeń WebSocket potwierdził wyrzucenie, zamknięcie `1008`, pozostanie hosta i odrzucenie ponownego wejścia kodem `PLAYER_BANNED`.

### Tutorial i ogólny polish UI

- [x] Zbudować pełny interaktywny tutorial gry: konfiguracja kamery, kalibracja, pozycja dłoni, pierwszy ruch mieczem, prawidłowe cięcie, timing, combo, bomby, held beats, pauza i ukończenie krótkiej kontrolowanej sekwencji z feedbackiem na żywo. — flow łączy realny podgląd kamery, istniejącą kalibrację i tracking z izolowaną mapą treningową oraz sześciopunktowym HUD-em postępu; ukończenie wymaga zaliczenia wszystkich zadań, a przerwanie nie oznacza tutoriala jako ukończonego.
- [x] Ujednolicić i poprawić styl scrollbarów we wszystkich modalach, z obsługą Firefox/Chromium, klawiatury, wysokiego kontrastu i urządzeń dotykowych. — wspólna warstwa stylu obejmuje przewijane powierzchnie ustawień, pomocy, multiplayera, pickerów map, onboardingu i narratora; dodano fokus klawiatury, większe uchwyty dla urządzeń dotykowych, `overscroll-behavior` oraz fallback `forced-colors`.
- [x] Poprawić animacje wejścia i wyjścia wszystkich modali: wspólny mechanizm, prawidłowe oczekiwanie przed `hidden`, focus trap/restore, blokowanie interakcji z tłem oraz `prefers-reduced-motion`. — ustawienia, pomoc, wybór map, Multiplayer z pickerem, parowanie telefonu, onboarding profilu i picker koloru korzystają z `createModalTransition`; kontroler zarządza stosem Escape/fokusu, blokuje wskaźnik podczas wyjścia, czeka przed `hidden`, przywraca widoczny element otwierający i respektuje ograniczenie ruchu.

## 38. Backlog produktu — 2026-09-11

Poniższe pozycje są nowymi wymaganiami. Istniejące, podobne funkcje nie oznaczają
automatycznie ukończenia ich kolejnej iteracji; każda pozycja wymaga osobnej analizy,
implementacji i weryfikacji. Załączone w rozmowie obrazy pokazują obecny HUD oraz
inspirację czytelnością HUD-u i głębią otoczenia z gry *Lockdown Protocol*.

1. [x] Dodać czytelną, kontrolowaną obsługę błędów frontendu i backendu: zachować komunikat techniczny i stack dla diagnostyki, ale pokazywać użytkownikowi zrozumiały opis oraz możliwe rozwiązanie. Obsłużyć między innymi `EADDRINUSE` dla portu `3000` bez surowego zdarzenia `Unhandled 'error' event`.
   - [x] Przechwycić błędy startowego `listen`: `EADDRINUSE` i `EACCES` mają polski opis oraz rozwiązanie, pozostałe błędy zachowują kod, a pełny stack pozostaje pod nagłówkiem diagnostycznym. Nieprawidłowa wartość `PORT` jest odrzucana przed uruchomieniem. Kontrolowany test zajętego portu potwierdził komunikat bez nieobsłużonego zdarzenia i kod wyjścia `1`.
   - [x] Dodać wspólną granicę nieobsłużonych błędów frontendu dla gry, biblioteki map, kreatora, diagnostyki i telefonu. Nie zastępuje precyzyjnych komunikatów funkcji; nieoczekiwany wyjątek pokazuje nieblokującą poradę, rozwijany i ograniczony długością stack oraz zamknięcie usuwające alert z drzewa dostępności. Smoke wymusił odrzuconą Promise na wszystkich pięciu stronach i potwierdził treść, stack oraz zamykanie.
   - [x] Ujednolicić nieobsłużone błędy API: odpowiedzi zawierają polski opis, stabilny `code` i losowy `requestId`, natomiast pełny stack pozostaje w konsoli serwera pod tym samym identyfikatorem. Nieznany endpoint, przekroczony limit danych i uszkodzony JSON zostały sprawdzone na uruchomionym serwerze; szczegóły błędów 500 nie są ujawniane klientowi.
2. [x] Zbudować telemetrię klient–serwer obejmującą stan połączenia, błędy, wydajność i jakość sieci, z jasno określonym zakresem, retencją oraz prywatnością.
   - [x] Dodać ograniczony kontrakt i odbiornik serwera: cztery jawne kategorie, walidowane pola, limit rozmiaru i częstotliwości, maksymalnie 64 ostatnie zdarzenia w sesji oraz 1024 sesje. Dane istnieją wyłącznie w RAM i wygasają po 24 godzinach; endpoint polityki wymienia dane zbierane i wykluczone. Smoke potwierdził politykę, przyjęcie poprawnej próbki i odrzucenie niedozwolonego payloadu.
   - [x] Dodać klienta uruchamianego wyłącznie po świadomej zgodzie w ustawieniach. Raportuje stan online, RTT do własnego serwera, zagregowane FPS/czas klatki/liczbę wolnych klatek i typ nieobsłużonego błędu; awaria telemetrii nigdy nie przerywa gry ani nie generuje rekurencyjnego błędu. Smoke potwierdził brak żądań przed zgodą, próbki po włączeniu i trwałość ustawienia po odświeżeniu.
3. [x] Dodać tryb obserwatora (`spectator`) do Multiplayera. — ekran wejścia ma osobną akcję „Obserwuj”, a serwer przydziela rolę tylko na podstawie prawidłowego tokenu pokoju i utrzymuje osobny limit 16 widzów, którzy nie zajmują miejsc graczy. Obserwator nie może zgłaszać gotowości, wyniku ani pakietów śledzenia, nie blokuje startu/CO-OP i nie uruchamia lokalnej rundy; nadal otrzymuje czat, voice, stan pokoju i wyniki. Lobby pokazuje odliczanie, mapę, stan live/zakończenie, postęp lidera i tabelę wyników, a host może widza usunąć oraz zablokować. Kontrolowany smoke host + gracz + widz potwierdził start wyłącznie dwóch uczestników, aktualizację `42%`, dwa wyniki live, ukrytą gotowość, brak zdarzenia lokalnego startu i zero błędów strony; osobna inspekcja potwierdziła widoki wejścia, oczekiwania i aktywnej rundy.
4. [x] Dodać tryb AUTO pozwalający komputerowi samodzielnie rozgrywać mapę. — szczegóły mapy udostępniają osobny przycisk `AUTO`, który rozpoczyna rundę bez kamery i kalibracji. Komputer korzysta z normalnej ścieżki trafień, punktacji, efektów i held beatów, omija bomby oraz zachowuje odporność na dłuższą klatkę; wynik AUTO jest jawnie oznaczony w HUD-zie i nie trafia do statystyk, osiągnięć ani sesji wyników. Smoke na pełnym przepływie pickera i mapie potwierdził trafienia obu rąk, zero żądań kamery, zero sesji wyniku i zero błędów strony.
5. [x] Sprawić, aby gracz AUTO wykonywał płynne, wiarygodne i lekko ludzkie ruchy zamiast mechanicznego trafiania. — każda ręka śledzi własną najbliższą nutę, przygotowuje zamach po przeciwnej stronie wymaganego cięcia, przechodzi przez cel i wykonuje follow-through; held beat stabilizuje pozycję z lekkim ruchem. Ruch ma ograniczoną prędkość, wygładzanie niezależne od FPS, spokojny stan bez celu i małe deterministyczne odchylenia zamiast losowego drżenia. Smoke próbkował pozycje przez pełną sekwencję: obie ręce wykonały ponad 2,9 jednostki ruchu, maksimum pozostało poniżej 5,4 jednostki/s, zaliczono obie strony bez błędów, a dwa ujęcia potwierdziły wizualnie przygotowanie i przeciwstawne cięcia.
6. [x] Ograniczyć zwykłą konsolę do najważniejszych logów i dodać rozszerzony tryb developerski odblokowywany sekretem skonfigurowanym po stronie serwera oraz zgodną wartością podaną w ustawieniach klienta. — token 12–256 znaków pochodzi wyłącznie z `HAND_SABERS_DEVELOPER_TOKEN`; endpoint stosuje limit 10 prób/min, stałoczasowe porównanie skrótów i `no-store`, nie zwracając sekretu. Ustawienia mają pole `password` i czytelne stany brak konfiguracji/błędny token/dostęp; wartość jest czyszczona po próbie, nie trafia do bundla, URL, storage ani eksportu i po odświeżeniu wymaga ponownej autoryzacji. Zapisane `developerMode`, `?dev`, `?testing`, ręczny event oraz debug hit-plane nie omijają bramki, ale po odblokowaniu zachowują dotychczasowe funkcje. Zwykły klient nie ma `console.log/info/debug`, kontrolowane fallbacki używają warningów tylko po autoryzacji, a istotne `console.error` pozostają widoczne. Smoke potwierdził odmowę, sukces, brak wycieku tokenu, ponowną blokadę po reloadzie, brak czerwonych logów oraz wariant serwera bez skonfigurowanego tokenu; README opisuje konfigurację PL/EN.
7. [x] Dodać rejestrację, logowanie, usuwanie konta i odzyskiwanie dostępu za pomocą ośmiocyfrowego PIN-u jako jedynej metody odzyskiwania. — ustawienia Profil zawierają pełny przepływ gościa i zalogowanego użytkownika, odzyskiwanie ustawia nowe hasło i unieważnia wszystkie stare sesje, a usunięcie wymaga aktywnej sesji, aktualnego hasła i jawnego potwierdzenia. Hasło oraz PIN mają oddzielne sole i skróty `scrypt`; losowy token sesji jest dostępny wyłącznie jako `HttpOnly` cookie, jego skrót żyje w RAM i znika po restarcie. Limity obejmują adres klienta oraz nazwę konta (logowanie: 10 błędów/15 min i blokada 15 min; PIN: 5 błędów/15 min i blokada 30 min), a odpowiedzi nie potwierdzają istnienia użytkownika. [`docs/account-security.md`](docs/account-security.md) opisuje model, wdrożenie HTTPS, brak synchronizacji istniejących wyników i nieodwracalny brak odzyskania po utracie zarówno hasła, jak i PIN-u. Smoke API sprawdził cały cykl i unieważnienie sesji, a Playwright potwierdził rejestrację/usunięcie, stany UI PL i brak błędów strony; przy okazji Lyra przestaje przechwytywać kliknięcia po otwarciu ustawień.
8. [x] Rozpocząć kolejną, opartą na pomiarach optymalizację kostek podczas gry, bez usuwania ich funkcji i wyglądu. — normalne kostki nadal korzystają ze wspólnych instancji, a korpusy i kolce bomb zostały przeniesione z osobnych meshów do dwóch współdzielonych `InstancedMesh`: sześć jednoczesnych bomb wymaga teraz 2 draw calli zamiast 12. Logiczne proxy kolizji nie są już dodawane do sceny, więc prewarm Maximum usuwa z jej traversalu do 84 niewidocznych węzłów, zachowując geometrię, materiały, kolizje, cięcia, held beaty i pooling. Smoke pełnej sekwencji z 15 bombami osiągnął 13 aktywnych obiektów bez błędów strony; ujawnił też i pozwolił naprawić wcześniejszy crash, gdy game over czyścił tablicę w trakcie odwrotnej iteracji trafień. Szczegóły i ograniczenia pomiaru zapisano w [`docs/performance-profiling.md`](docs/performance-profiling.md).
9. [x] Przebudować prezentację Lyry, aby wyglądała profesjonalnie i nie zasłaniała ani nie przerywała rozgrywki wypowiedziami. — dialogi wymagające decyzji zachowują pełny wariant, natomiast wskazówki map i kamienie milowe combo używają kompaktowego toastu `status` w górnym rogu: bez przycisków, przejmowania klawiatury, pauzy, dźwięku pisania i ukrywania diagnostyki. Smoke desktop/mobile potwierdził nieblokujący kontrakt oraz wysokość odpowiednio około 74/64 px.
10. [x] Rozbudować osiągnięcia: poprawić wygląd i satysfakcję z odblokowania, dodać więcej celów oraz trudniejsze osiągnięcia. — katalog wzrósł z 33 do 46 pozycji o długoterminowe cele rozgrywki, perfekcyjnych rund, unikalnych map, multiplayera, co-opu i kreatora (m.in. 10 000 trafień, combo 1000, 25 bezbłędnych zwycięstw, 25 godzin gry, 25 wygranych MP i 50 zapisanych map). Wykorzystano istniejące statystyki, więc zachowano stare zapisy i naliczony postęp. Panel ma teraz pierścień całej kolekcji, postęp oraz liczniki każdego tieru, wyraźniejsze karty i responsywny układ; toast odblokowania dziedziczy kolor rangi, pokazuje warunek i działa jako dostępny `status`. Testy sprawdziły granice wszystkich 46 celów, kolejkę toastów, reset, desktop i 390 px; inspekcja wizualna potwierdziła brak overflow i czytelność bez błędów strony.
11. [x] Przebalansować punktację tak, aby pojedyncza mapa nie przyznawała milionów punktów i wyniki były łatwiejsze do odczytania oraz porównania.
   - [x] Zatrzymać nieograniczony wzrost `basePoints × combo`: mnożnik nadal narasta przez pierwsze trafienia, ale kończy się na `×4`. Idealne 500 nut spada z około 18,7 mln do około 298 tys. bez zmiany combo, jakości trafień, HP ani zasad mapy.
   - [x] Oznaczyć nowe wyniki wersją punktacji i wyraźnie oddzielić zachowane rekordy legacy na leaderboardach bez ich usuwania. — sesja i zapis nowego wyniku wymagają wspólnej wersji `2`, a limit serwera jest liniowy (`600 × liczba grywalnych nut`). Brak wersji w istniejącym rekordzie oznacza zachowaną wersję legacy; leaderboard pobiera osobno obie generacje, pokazuje aktualne zasady przed legacy i nie przyznaje starym wynikom mylących medali aktualnego rankingu. Karty map preferują bieżącą punktację, a przy samych dawnych danych jawnie pokazują badge `LEGACY`. Smoke potwierdził obie sekcje, ich niezależne rankingi, brak badge’a przy wersji 2, oznaczenie starego rekordu, liniowy limit API i brak zmian w istniejących danych.
12. [ ] Przeprojektować panel wyboru map, nadając mu bardziej charakterystyczny, dopracowany kierunek inspirowany jakością interfejsów gier takich jak *Overwatch*, bez kopiowania ich zasobów ani układu 1:1.
13. [x] Dodać diagnostykę sieciową: ping, jitter, minimum, maksimum, średnią oraz pozostałe przydatne statystyki połączenia. — Istniejący ping synchronizacji Multiplayer zasila chronologiczny bufor 30 poprawnych próbek bez dodatkowego ruchu sieciowego. Lobby pokazuje bieżący RTT, jitter jako średnią zmianę kolejnych próbek, minimum, średnią i maksimum oraz sygnalizuje jakość kolorem; kompaktowy odczyt ping/jitter jest dostępny również podczas gry, a pełne podsumowanie zawiera liczbę próbek. Kontrolowany smoke na prawdziwym WebSockecie sprawdził pięć różnych opóźnień, spójność min ≤ avg ≤ max, reset, widoki desktop/390 px i brak błędów przeglądarki.
14. [ ] Zaprojektować od nowa wskaźnik HP i wskaźnik ukończenia mapy, czerpiąc ogólne inspiracje czytelnością HUD-ów *Doom Eternal*, *Overwatch*, *Beat Saber* i *Lockdown Protocol*.
15. [ ] Ulepszyć UX/UI edytora map, aby praca z nim była przyjemniejsza i mniej przypominała generyczny program narzędziowy.
16. [ ] Poprawić płynność postrzeganego renderowania kostek; zbadać między innymi głębię sceny, mgłę i inne subtelne sposoby ograniczenia wrażenia skokowego ruchu.
17. [x] Ukryć lub przeprojektować widoczny w oddali koniec mapy/sceny, wskazany na załączonym obrazie bieżącej rozgrywki. — Ostatnie instancjonowane obręcze przechodzą teraz w proceduralne, logarytmicznie zagęszczone pierścienie punktu zbiegu na istniejącej płaszczyźnie tła, dzięki czemu tunel nie kończy się widoczną ścianą. Efekt reaguje subtelnie na bas/beat, słabnie przy presji wizualnej i jest wyłączany przez niski poziom detali. Nie dodaje geometrii ani draw calli. Zweryfikowano prawdziwy start mapy z emulowaną kamerą, motyw zachodu, końcowy kadr sceny i brak błędów przeglądarki.
18. [ ] Przeprojektować panel diagnostyki kamery pod kątem czytelności, użyteczności i spójności wizualnej.
19. [x] Poprawić obsługę błędów kamery, w szczególności komunikat `Could not start video source`: rozpoznawać zajętą kamerę, jasno wskazywać możliwe przyczyny i umożliwiać ponowienie bez restartowania całej gry. — błędy urządzenia/uprawnień pokazują surowy komunikat wraz z polskim rozwiązaniem oraz przycisk „PONÓW KAMERĘ”; retry korzysta z oczyszczonego lifecycle `initMP`, blokuje równoległe próby i znika podczas inicjalizacji. Smoke wymusił `NotReadableError` za pierwszym razem, a druga próba uruchomiła emulowaną kamerę i przeszła do kalibracji bez błędów strony.
20. [x] Dodać kolejne opcjonalne elementy tła reagujące na muzykę, z kontrolą intensywności i kosztu wydajnościowego. — poza istniejącymi portalami arena ma pary bocznych „equalizer pylons”, których wysokość reaguje naprzemiennie na bass, środek i wysokie tony oraz puls beatu. Wszystkie maksymalnie 16 słupków korzystają z jednego `InstancedMesh` (jeden draw call), pozostają poza torem, słabną przy dużej presji wizualnej i dziedziczą istniejący przełącznik oraz automatyczną/manualną intensywność. Profile Lowest/Very Low/Low nie tworzą aktywnych instancji, kolejne poziomy skalują ich liczbę, a Custom wiąże koszt z `arenaDetail`. Inspekcja sceny potwierdziła rytmiczną kompozycję po bokach toru; smoke potwierdził 16 aktywnych instancji na Maximum oraz natychmiastowe `count: 0 / visible: false` po wyłączeniu i na Low, bez błędów strony.
21. [x] Zbadać aktualne techniki budowania atrakcyjnych aren rytmicznych w Three.js oraz możliwości współczesnego stosu renderowania; przygotować rekomendacje dla własnego, oryginalnego kierunku wizualnego gry. — raport [`docs/arena-rendering-research.md`](docs/arena-rendering-research.md) zestawia stan faktycznie zainstalowanego Three.js 0.184 i obecnej sceny z oficjalną dokumentacją instancingu, fog, post-processingu, WebGPU/TSL, glTF oraz Web Audio. Definiuje oryginalny kierunek „Resonance Corridor”, trzy strefy czytelności, mierzalne budżety Medium/Maximum i pięcioetapową roadmapę. Rekomenduje dalszy WebGL2/instancing i ostrożny półrozdzielczy selective bloom dopiero po A/B; WebGPU pozostaje osobnym prototypem ze względu na eksperymentalność i konieczny port `ShaderMaterial`, bez zamrażania wersji biblioteki na zawsze.
22. [x] Przeprojektować wskaźniki VU: zastąpić nieczytelne częściowo wypełnione gradienty segmentami/kwadratami podświetlanymi płynnie i z czytelnym progiem przesteru. — oba mierniki korzystają z 24 pełnych segmentów (16 zielonych, 5 żółtych, 3 czerwone), krótkiego przejścia jasności i osobnego alarmu clippingu; zachowano wartości dB oraz semantykę `role=meter`. Smoke wymusił `-6.5 dB`, potwierdził 21 zapalonych pól i aktywny próg przesteru, a inspekcja wizualna potwierdziła czytelny podział bez uciętego segmentu.
23. [ ] Dodać poziomy/tryby trudności gry: Newbie, Normal, High i Extreme, z jednoznacznym wpływem na rozgrywkę.
24. [ ] Poprawić tryb przestrzenny tak, aby pozycje pozostawały naturalne dla zasięgu dłoni i stabilności ML oraz nie generowały kostek trudnych do wykrycia lub trafienia na środku kadru.
25. [ ] Przenieść No Fail, trening, zasady Normalny/Bez strzałek/Pro/Speed Trials/Przestrzenny oraz wybór ręki z ustawień do konfiguratora przy wyborze mapy; umożliwić zapis maksymalnie czterech własnych presetów.
26. [x] Dodać dla koloru profilu dopracowany picker zgodny z pickerem kolorów mieczy. — Profil korzysta teraz z tego samego dostępnego modala HSL/RGB/HEX co oba miecze, z etykietą celu „Profil”, bieżącym podglądem koloru i powrotem fokusu. Zachowano dotychczasowe presety i szybki systemowy wybór, a nowy kolor nadal trafia do ustawień dopiero po zapisaniu profilu. Poprawiono też bezstratną obsługę ręcznie wpisanego HEX; smoke zachował dokładnie `#123abc`, sprawdził trwałość zapisu i regresję pickera lewego miecza bez błędów przeglądarki.
27. [x] Dodać odstęp pod przyciskiem „PRZYWRÓĆ PROGI MODELU”, aby zachować czytelny dystans od sekcji „CENTRUM TELEFONU”. — lokalny modyfikator dodaje 16 px marginesu bez wpływu na pozostałe akcje; smoke i inspekcja wizualna potwierdziły rzeczywisty odstęp 17 px oraz brak kolizji układu.
28. [ ] Dodać więcej ustawień graficznych po analizie ich realnego wpływu, bez duplikowania istniejących opcji.
29. [ ] Wykonać wizualny i profilowany przegląd całego projektu pod kątem dalszej optymalizacji oraz spisać konkretne, zmierzone możliwości poprawy.
30. [ ] Rozbudować voice chat o wskaźnik poziomu mikrofonu, wybór urządzenia wejściowego i test mikrofonu podobny funkcjonalnie do rozwiązań komunikatorów głosowych.
31. [ ] Poprawić kompozycję mapy/sceny i rozmieszczenie elementów reagujących na muzykę, zachowując czytelność toru gry.
32. [x] Przedstawić użytkownikowi dokładną, zrozumiałą informację o tym, jaka telemetria jest zbierana, w jakim celu, dokąd trafia i jak długo jest przechowywana. — zakładka „Dane” ma domyślnie wyłączoną zgodę oraz jawny wykaz przesyłanych metryk, wykluczonych treści, celu, miejsca przechowywania i retencji; niezależny endpoint `/api/telemetry/policy` udostępnia ten sam kontrakt klientom.
33. [x] Podnieść ikonę gwiazdki przy „ULUBIONE”, aby była poprawnie wyrównana optycznie względem napisu. — przesunięcie dotyczy wyłącznie ikony filtra i wynosi 1 px; smoke zmierzył środek ikony 1 px nad środkiem etykiety, a inspekcja wizualna potwierdziła czytelne wyrównanie bez wpływu na pozostałe gwiazdki.
34. [x] Uprościć i uczytelnić wybór map oraz dodać funkcję „Rzuć wyzwaniem”, losującą mapę z wybranego zakresu trudności albo ze wszystkich map (`ALL`). — pełnoekranowy picker ma teraz wyróżnioną akcję z jawnym zakresem i liczbą dostępnych map (`ALL · 22`, `ŚREDNI · 1`, itd.). Losowanie korzysta wyłącznie z aktywnej trudności, pomija mapy bez beatów, nie powtarza od razu bieżącego wyboru, jeśli ma alternatywę, czyści ukrywające wynik wyszukiwanie/ulubione i pokazuje szczegóły przed świadomym uruchomieniem gry. Przycisk wyłącza się dla pustego zakresu. Smoke desktop/390 px potwierdził zmianę mapy, poprawny poziom szczegółów, responsywny układ i brak błędów.
35. [x] Dodać dźwięk pisania na czacie oraz dźwięk nowej wiadomości zarówno w lobby, jak i podczas gry, z osobną możliwością wyciszenia. — Oba pola czatu odtwarzają krótki, limitowany dźwięk podczas wpisywania, a wiadomość od innego gracza uruchamia osobny dwutonowy alert bez dublowania go nadawcy. Receptury działają również przez preload audio telefonu. Ustawienia audio zawierają trwały przełącznik wyciszający wyłącznie dźwięki czatu oraz osobny test alertu. Zweryfikowano dwiema sesjami: pisanie 2 impulsy, alert 2 impulsy, po wyciszeniu 0 impulsów i 0 błędów przeglądarki.
36. [ ] Opracować oryginalny kierunek HUD-u inspirowany czytelnością i osadzeniem interfejsu z *Lockdown Protocol*, bez kopiowania chronionych elementów.
37. [x] Zmienić stopkę `[dev] * CAMERA RHYTHM` na `[dev] * MADE BY MICHAEL OSLIZLO`; kliknięcie lub świadoma interakcja ma otwierać dopracowany modal autora z odnośnikami do `https://github.com/VermiNew` i `https://verminew.github.io`. — stopka jest dostępnym przyciskiem z podpowiedzią hover/title, a kliknięcie lub klawiatura otwiera responsywną wizytówkę autora. Wspólny lifecycle modali zapewnia focus trap, Escape i powrót fokusu; linki korzystają z `noopener noreferrer`. Smoke i inspekcja wizualna potwierdziły desktop oraz 390 px.
38. [x] Dodać plik opisujący zasady współpracy open-source dla przyszłych kontrybutorów. — `CONTRIBUTING.md` opisuje zgłoszenia, konfigurację lokalną, zakres zmian, język kodu/UI, prywatność, pełną weryfikację, Conventional Commits i wymagania PR; oba README prowadzą do dokumentu, a kwestie podatności odsyłają do istniejącego `SECURITY.md`.
39. [x] Dodać krótkie FAQ, między innymi odpowiedź, że gra nie zawiera mikropłatności ani modelu subskrypcyjnego. — modal Pomocy zawiera semantyczną listę odpowiedzi o mikropłatnościach/subskrypcjach, wymaganiu VR i przesyłaniu obrazu w obu językach. Smoke potwierdził trzy odpowiedzi, zamykanie modala, brak błędów oraz poprawny układ bez scrolla na desktopie i z kontrolowanym przewijaniem przy 390 px.
40. [ ] Przeanalizować ryzyko prawne nazwy „Hand Sabers” i podobieństwa rozgrywki do *Beat Saber* oraz omówić możliwe działania ograniczające ryzyko. Na tym etapie nie wdrażać zmian nazwy ani produktu.
