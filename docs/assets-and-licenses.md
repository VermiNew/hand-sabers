# Rejestr assetów i licencji

Stan: 2026-10-05. Rejestr służy do wykazania pochodzenia i licencji wszystkiego,
co gra zawiera lub ładuje, zgodnie z zaleceniami z
[analizy ryzyka prawnego](legal-name-and-gameplay-risk.md). To dokument
organizacyjny, a nie opinia prawna.

Pola oznaczone **DO UZUPEŁNIENIA** wymagają informacji, których nie da się
ustalić z kodu (autor, narzędzie, data, licencja). Dopóki nie zostaną
uzupełnione, asset należy traktować jako o niepotwierdzonym pochodzeniu.

## Kod projektu

| Element | Licencja | Uwagi |
| --- | --- | --- |
| Kod gry i serwera | MIT (`LICENSE`) | autorstwo własne |

## Grafiki dołączone do repozytorium

| Plik | Użycie | Autor / źródło | Licencja | Data powstania |
| --- | --- | --- | --- | --- |
| `src/assets/logo.png` | logo gry | **DO UZUPEŁNIENIA** | **DO UZUPEŁNIENIA** | **DO UZUPEŁNIENIA** |
| `src/assets/lora/01_neutral.png` … `06_sad.png` (6 plików) | awatary narratora Lyra | **DO UZUPEŁNIENIA** (jeśli wygenerowane narzędziem AI: nazwa narzędzia, wersja, prompt i warunki użycia wyników) | **DO UZUPEŁNIENIA** | **DO UZUPEŁNIENIA** |
| `favicon.svg` | ikona strony (dwa skrzyżowane miecze) | **DO UZUPEŁNIENIA** | **DO UZUPEŁNIENIA** | **DO UZUPEŁNIENIA** |
| `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | ikony aplikacji (manifest PWA) | wyrenderowane z `favicon.svg` (wariant maskable: ten sam rysunek na pełnym tle `#05070d`), więc dziedziczą jego autora i licencję | jak `favicon.svg` | 2026-10-09 |

## Dźwięk i muzyka

| Element | Pochodzenie | Licencja |
| --- | --- | --- |
| Efekty trafień, bomb, pudeł, interfejsu, czatu | generowane proceduralnie w Web Audio, bez plików (patrz [audio-samples.md](audio-samples.md)) | brak zewnętrznych zobowiązań |
| Muzyka w grze | repozytorium nie zawiera żadnych utworów; mapy i audio są dodawane przez użytkowników lokalnie (`maps/` jest ignorowany przez git) | licencja utworu leży po stronie osoby, która go dodaje |

Do zrobienia: dodać kilka własnych albo licencjonowanych (CC0 / CC-BY) utworów
demonstracyjnych i wpisać je tutaj wraz z autorem, linkiem do źródła i tekstem
licencji. Nie dołączać cudzej muzyki ani map społeczności bez licencji.

## Czcionki i ikony (ładowane z Google Fonts w czasie działania)

| Rodzina | Użycie | Licencja |
| --- | --- | --- |
| Oxanium | nagłówki i interfejs | SIL Open Font License 1.1 |
| JetBrains Mono | tekst techniczny | SIL Open Font License 1.1 |
| Material Symbols Rounded | ikony interfejsu | Apache License 2.0 |

Czcionki nie są kopiowane do repozytorium, więc nie ma obowiązku ich
redystrybucji; obowiązują warunki Google Fonts. Do weryfikacji przy zmianie
źródła (np. self-hosting): pełne teksty licencji muszą wtedy trafić do
dystrybucji.

## Zależności uruchomieniowe (npm, `dependencies`)

Wersje według `package-lock.json` w dniu sporządzenia rejestru.

| Pakiet | Wersja | Licencja |
| --- | --- | --- |
| archiver | 8.0.0 | MIT |
| express | 5.2.1 | MIT |
| fuse.js | 7.5.0 | Apache-2.0 |
| i18next | 26.3.6 | MIT |
| jszip | 3.10.1 | MIT lub GPL-3.0-or-later (do wyboru; używana opcja MIT) |
| multer | 2.4.0 | MIT |
| qrcode | 1.5.4 | MIT |
| three | 0.184.0 | MIT |
| ws | 8.21.1 | MIT |

## Narzędzia deweloperskie (`devDependencies`)

| Pakiet | Licencja |
| --- | --- |
| @playwright/test | Apache-2.0 |
| typescript | Apache-2.0 |
| vite | MIT |
| @types/express, @types/multer, @types/node, @types/qrcode, @types/three, @types/ws | MIT |

## Zasoby ładowane z sieci w czasie działania

| Zasób | Źródło | Licencja / uwagi |
| --- | --- | --- |
| MediaPipe Tasks Vision (silnik WASM i bundle) | `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision` | Apache-2.0. Uwaga: komputer używa wersji 0.10.0, a tryb telefonu 0.10.35 |
| Model `hand_landmarker` | `storage.googleapis.com/mediapipe-models/hand_landmarker/` | Google; **DO UZUPEŁNIENIA**: potwierdzić warunki licencji w karcie modelu (model card) przed publicznym wydaniem |
| Tweakpane 3.1.10 (panel deweloperski) | `cdn.jsdelivr.net/npm/tweakpane` | MIT; ładowany tylko w trybie deweloperskim |

## Procedura dla nowych assetów

Przed dodaniem pliku graficznego, dźwiękowego, czcionki, modelu lub biblioteki:

1. Ustal autora i źródło oraz zapisz link albo opis procesu twórczego.
2. Sprawdź licencję i to, czy pozwala na użycie komercyjne oraz modyfikację.
3. Dopisz wiersz do tego rejestru w tym samym commicie, w którym asset trafia do repozytorium.
4. Zachowaj pliki źródłowe lub historię powstania własnych assetów, co ułatwia
   wykazanie niezależnego procesu twórczego.
5. Nie dołączaj logo, grafik, dźwięków, muzyki, map ani kodu pochodzących z
   cudzych gier.
