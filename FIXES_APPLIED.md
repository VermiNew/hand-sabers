# Zmiany wykonane w tej wersji

- Dodano przełącznik **Odwróć strony kamery** w menu ustawień, żeby szybko naprawić przypadek, gdy lewy miecz wpada na prawy tor i odwrotnie.
- Przekazano etykietę `handedness` z MediaPipe do workera i użyto jej do stabilniejszego przypisywania dłoni do lewego/prawego miecza, z fallbackiem na pozycję w świecie gry.
- Odświeżono menu główne: mocniejszy glassmorphism, większe przyciski, panel statusu po prawej, bardziej nowoczesne zaokrąglenia i głębia.
- Zamieniono emoji/symbole UI na **Material Symbols Rounded** w menu, overlayach, kreatorze i bibliotece map.
- Powiększono i poprawiono czytelność HUD: licznik HP, pasek HP, pozostały czas utworu i pasek postępu muzyki.
- Uruchomiono testy: `npm run check`, `npm run smoke`, `npm run build` — wszystkie przeszły.

## Uwaga do kamery

Jeżeli po zmianach kamera nadal pokazuje strony odwrotnie na Twoim urządzeniu, wejdź w **Ustawienia → Odwróć strony kamery**. Różne przeglądarki/kamery potrafią inaczej zwracać obraz z kamerki przedniej.

# Drugi pakiet poprawek — gameplay, kreator i wydajność

## Gameplay

- Rozdzielono pauzę rękami od pauzy ręcznej `Escape` przez `pauseReason` (`hands` / `manual`). Automatyczny powrót działa tylko po pauzie spowodowanej zgubieniem rąk.
- Combo zaczyna się od `0`, rośnie po trafieniach i zapisuje osobne `maxCombo` na ekran końca gry oraz do wyników.
- Przeniesiono komunikaty combo/milestone z centrum ekranu do prawej górnej części HUD, żeby nie zasłaniały nut.
- Dodano `getEffectiveMapDuration()`: mapa bez audio kończy się po `meta.duration`, a jeśli go nie ma — po ostatnim beacie + ogon bezpieczeństwa.
- Dodano feedback `PERFECT` / `GOOD` / `BAD` zależny od timingu, środka trafienia i poprawności cięcia.
- Dodano kierunki cięcia (`cut`) w mapach: `any`, `down`, `up`, `left`, `right`, `down-left`, `down-right`, `up-left`, `up-right`. Stare mapy bez pola `cut` nadal działają jako `any`.
- Spawn mapy używa posortowanej kolejki i indeksu następnego beatu zamiast przechodzić po całej tablicy beatów w każdej klatce.

## Kamera i kalibracja

- Dodano krok auto-kalibracji stron kamery: użytkownik podnosi lewą rękę, a gra potrafi zasugerować/ustawić właściwe odwrócenie stron.
- Ręczny przełącznik „Odwróć strony kamery” zostaje jako fallback.

## Kreator i biblioteka map

- Rozbito `map-creator.html`: HTML ma teraz głównie markup/style, a główna logika jest w `src/creator/main.js`; dodatkowo wydzielono dialogi/toasty, walidację audio i UI kierunków cięcia.
- Zamieniono klasyczne `alert()` i `confirm()` na własne modale/toasty w kreatorze i bibliotece map.
- Dodano walidację audio przed importem/dekodowaniem: format, rozmiar, długość i poprawność zdekodowanego bufora.
- Kreator map pozwala ustawiać kierunek cięcia dla nowych oraz zaznaczonych beatów.

## Stabilność i wydajność

- Dodano adaptacyjne obniżanie/podnoszenie pixel ratio renderera pod obciążeniem.
- Poprawiono czyszczenie zasobów przy zamknięciu: tracking, audio, gameplay entities, geometrie, materiały, renderer/scene resources.
- Zostawiono pule obiektów między restartami gry, żeby uniknąć zbędnych alokacji i użycia zwolnionych shared geometry.

## Testy

- Dodano testy jednostkowe Node `node:test` dla timingu map, combo, jakości trafień, kierunków cięcia, pauzy, walidacji map/ZIP i walidacji audio.
- `npm test` uruchamia teraz: `check`, `unit`, `smoke`.
- Sprawdzono także produkcyjny build: `npm run build`.

## Zmiany UI / developer / rendering

- Usunięto panel z menu głównego zawierający komunikaty `CAMERA TRACKING READY`, tor ruchu ręki oraz kafelki `LEWY / PRAWY / MAPY`.
- Dodano `meta name="color-scheme" content="dark"` oraz CSS `color-scheme: dark`, żeby natywne kontrolki przeglądarki, np. listy rozwijane, używały ciemnego motywu.
- W ustawieniach dodano przełącznik **Tryb developera** zapisujący się w `localStorage`.
- W ustawieniach dodano informację o obecnym/aktywnym trybie graficznym, także dla trybu Auto.
- Panel developera pokazuje więcej danych renderowania: aktywny tryb graficzny, profil, DPR, rozmiar CSS canvasu, rozmiar bufora renderowania, renderer GPU, antyaliasing, odbicia, cienie, draw calls, trójkąty i szacowaną pamięć VRAM.
- Odsunięto znacznik `LIVE` w panelu developera, aby nie nachodził na ikonę zwijania panelu.
- Przeniesiono combo pod punktację na środku HUD-u.
- Dodano prewarming/pooling obiektów gameplay zależny od profilu graficznego, aby część zasobów była wcześniej przygotowana w GPU/VRAM i nie alokowała się dopiero podczas gry.

## Graphics presets: Very Low / Lowest
- Added two extra graphics modes to Settings → Wydajność: `Very Low` and `Lowest`.
- Both modes are real performance profiles, not only UI labels: they reduce render DPR, disable decorative effects, lower camera/tracking workload, and use smaller gameplay prewarm pools.
- Auto graphics scaling can now step down below `Low` to `Very Low` and `Lowest` on very weak/software-rendered devices.
