# Inwentarz danych i szkic polityki prywatności

Stan: 2026-10-05, na podstawie kodu w repozytorium. **To szkic roboczy, a nie
opinia prawna ani gotowa polityka prywatności.** Opisuje, co gra faktycznie
przetwarza, żeby można było na tej podstawie przygotować dokument dla graczy
(przed publicznym wydaniem warto go przejrzeć z prawnikiem, zwłaszcza gdy serwer
będzie dostępny dla osób z UE i będzie przechowywał konta).

Pola **DO UZUPEŁNIENIA** wymagają danych, których nie ma w kodzie.

## Administrator i kontakt

- Administrator danych: **DO UZUPEŁNIENIA** (osoba lub podmiot prowadzący serwer).
- Adres kontaktowy do spraw prywatności: **DO UZUPEŁNIENIA**.
- Uwaga: gra jest samodzielnie hostowana. Dane trafiają do serwera, który uruchamia
  dana osoba, więc administratorem jest ten, kto go prowadzi.

## Co jest przetwarzane

### Na urządzeniu gracza (przeglądarka, bez wysyłania na serwer)

| Dane | Klucz / miejsce | Cel |
| --- | --- | --- |
| Ustawienia gry, profil (nazwa, kolor, awatar), język | `hs_settings`, `lang` | działanie gry |
| Lokalne mapy, ich audio i wyniki | `hs_local_maps`, `hs_local_scores`, IndexedDB | gra offline |
| Statystyki i osiągnięcia | `hs_stats`, `hs_achievements` | funkcje gry |
| Znaczniki „widziano" (powitanie, samouczek, rekomendacje) | `hs_welcome_seen`, `hs_tutorial_seen`, `hs_settings_recommendation_seen` | pokazywanie wskazówek raz |
| Identyfikator sesji telemetrii | `hs_telemetry_session` | tylko po zgodzie (patrz niżej) |
| Token administratora (jeśli wpisany) | `hs_admin_token` w `sessionStorage` | autoryzacja zapisu map; znika po zamknięciu karty |

### Kamera i obraz

- Śledzenie dłoni działa **lokalnie w przeglądarce** (MediaPipe); obraz z kamery
  komputera nie jest wysyłany na serwer ani zapisywany.
- Tryb „telefon jako kamera": telefon wysyła klatki lub współrzędne dłoni do
  komputera przez serwer (WebSocket), a serwer jedynie je przekazuje i nie
  zapisuje. Połączenie wymaga ręcznego sparowania kodem.

### Na serwerze

| Dane | Gdzie i jak długo | Cel |
| --- | --- | --- |
| Konto: nazwa użytkownika, skrót hasła (scrypt), skrót PIN-u odzyskiwania, daty | plik `maps/_accounts.json` do usunięcia konta | logowanie |
| Sesja logowania | pamięć serwera, cookie `hand_sabers_session` (HttpOnly, SameSite=Lax, do 30 dni) | utrzymanie logowania |
| Wyniki: nazwa gracza wpisana przy grze, wynik, combo, mapa, data | plik `maps/_scores.json`, bez limitu czasu | ranking |
| Mapy i ich audio dodane przez użytkowników | katalog `maps/` | biblioteka map |
| Pokoje multiplayer, lista graczy, wiadomości czatu | pamięć serwera, do zamknięcia pokoju lub restartu | gra wieloosobowa |
| Telemetria produktowa (stan połączenia, błędy, wydajność, jakość sieci) | pamięć serwera, 24 godziny | diagnostyka; **domyślnie wyłączona, wymaga zgody** |
| Czat głosowy | połączenie WebRTC bezpośrednio między graczami, bez serwerów STUN (`iceServers: []`) | rozmowa w pokoju; serwer nie odbiera dźwięku |

### Czego telemetria nie zawiera

Zgodnie z `/api/telemetry/policy`: adresu IP w zapisach, User-Agenta, obrazu
kamery, dźwięku, treści czatu ani nazwy mapy.

## Usługi zewnętrzne

Przeglądarka gracza łączy się bezpośrednio z innymi dostawcami, którzy w ten
sposób widzą jej adres IP:

| Dostawca | Po co |
| --- | --- |
| Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) | czcionki i ikony |
| jsDelivr (`cdn.jsdelivr.net`) | silnik MediaPipe, a w trybie deweloperskim Tweakpane |
| Google Cloud Storage (`storage.googleapis.com`) | model `hand_landmarker` MediaPipe |

Model i silnik są cache'owane w przeglądarce (Service Worker), więc kolejne
uruchomienia nie wymagają połączenia. Do rozważenia: hostowanie tych zasobów
samodzielnie, jeśli ma być pełna kontrola nad transferem danych do stron trzecich.

## Prawa użytkownika — stan obecny

- **Usunięcie konta:** możliwe w aplikacji (wymaga hasła); usuwa konto i unieważnia sesje.
- **Wyniki:** zapisane pod wpisaną nazwą gracza, nie są powiązane z kontem, więc
  usunięcie konta ich nie usuwa. Jeśli wynik pozwala zidentyfikować osobę,
  usunięcie wymaga ręcznej edycji `maps/_scores.json` przez administratora.
  Do rozważenia: powiązanie wyników z kontem albo narzędzie do ich usuwania.
- **Wgląd i eksport danych:** brak gotowego mechanizmu poza eksportem ustawień
  i map w aplikacji. Do rozważenia przy publicznym wydaniu.
- **Cofnięcie zgody na telemetrię:** przełącznik w ustawieniach (zakładka „Dane").

## Do zrobienia przed publicznym wydaniem

1. Uzupełnić administratora i adres kontaktowy.
2. Określić podstawę prawną i okres przechowywania wyników oraz kont.
3. Zdecydować, czy dołączać regulamin (zasady zachowania w czacie, treść map
   dodawanych przez graczy, odpowiedzialność za cudze utwory w audio map).
4. Rozważyć mechanizm usuwania wyników i eksportu danych.
5. Opublikować finalną politykę w grze (np. w modalu pomocy) i w repozytorium.
