# Hand Sabers — multiplayer

## Jak działa multiplayer

Jeden serwer przechowuje pokoje, wybraną mapę i stan graczy. Klienci łączą się z nim przez HTTP oraz WebSocket. Gracz tworzy prywatny pokój, otrzymuje kod, a pozostali dołączają tym kodem.

Każdy gracz uruchamia grę i tracking na swoim urządzeniu. Serwer synchronizuje stan pokoju i rozgrywki; nie zastępuje lokalnego śledzenia dłoni.

## Uruchomienie w sieci lokalnej

Na komputerze hosta:

```bash
npm install
npm run build
npm run start
```

Pozostali gracze mogą otworzyć adres IP hosta, na przykład `http://192.168.1.20:3000`.

Samo udostępnienie adresu IP może jednak nie wystarczyć. Przeglądarki blokują kamerę i część funkcji urządzenia na niezabezpieczonych stronach innych niż `localhost`. Dlatego do gry z kamerą na innych urządzeniach zalecane jest HTTPS.

## HTTPS — zalecane rozwiązania

Możesz użyć:

- tunelu HTTPS, np. Cloudflare Tunnel lub ngrok,
- własnej domeny i reverse proxy z certyfikatem TLS,
- hostingu obsługującego Node.js oraz WebSocket.

Tunel lub proxy musi przekazywać zarówno zwykłe żądania HTTP, jak i połączenia WebSocket (`Upgrade`).

## Typowy przebieg

1. Host uruchamia serwer przez HTTPS.
2. Host otwiera **Multiplayer** i tworzy pokój.
3. Przekazuje pozostałym graczom bezpieczny link i kod pokoju.
4. Każdy gracz otwiera grę, zezwala na kamerę i dołącza kodem.
5. Host wybiera mapę i rozpoczyna rozgrywkę.

## Telefon jako kamera

Funkcja **Phone as camera** jest eksperymentalna, ale działająca. Telefon i komputer muszą mieć dostęp do tego samego serwera. Poza `localhost` wymagane jest HTTPS, inaczej przeglądarka telefonu może odmówić dostępu do kamery.

## Porty i zapora

Domyślny port wynika z konfiguracji projektu, zwykle jest to `3000`. Przy hostowaniu w LAN lub internecie upewnij się, że:

- port jest dostępny w zaporze,
- reverse proxy przekazuje WebSocket,
- adres publiczny prowadzi do właściwego procesu Node.js,
- serwer nie jest wystawiony publicznie bez świadomej konfiguracji bezpieczeństwa.

## Diagnostyka

Gdy pokój się nie łączy:

1. Sprawdź, czy strona otwiera się u drugiego gracza.
2. Sprawdź konsolę przeglądarki pod kątem błędów WebSocket.
3. Upewnij się, że używany jest ten sam protokół: strona HTTPS powinna łączyć się przez bezpieczny WebSocket.
4. Sprawdź konfigurację proxy i obsługę nagłówka `Upgrade`.
5. Przy problemach z kamerą sprawdź HTTPS i uprawnienia witryny.
