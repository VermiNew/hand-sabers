# Hand Sabers — uruchomienie na serwerze i multiplayer

Ten dokument opisuje najszybszy sposób uruchomienia pełnej wersji gry z API, mapami, wynikami, WebSocketami i trybem multiplayer.

## Wymagania

- Node.js 22.18 lub nowszy
- npm
- otwarty port TCP (domyślnie `3000`)
- HTTPS, gdy kamera ma działać na urządzeniu innym niż komputer otwierający `localhost`

Przeglądarki traktują `http://localhost` jako bezpieczny wyjątek. Zwykły adres LAN, np. `http://192.168.1.20:3000`, może otworzyć stronę, ale dostęp do kamery zostanie zablokowany. Dlatego samo wysłanie komuś adresu IP zwykle nie wystarczy do gry z kamerą.

## Uruchomienie lokalne

```bash
npm install
npm start
```

Następnie otwórz:

```text
http://localhost:3000
```

Sprawdzenie działania backendu:

```text
http://localhost:3000/api/health
```

Odpowiedź powinna zawierać `"ok": true`.

## Najprostsze udostępnienie na konkursie: tunel HTTPS

Uruchom grę lokalnie poleceniem `npm start`, a następnie wystaw port `3000` przez zaufany tunel HTTPS, np. Cloudflare Tunnel, ngrok lub podobną usługę. Udostępniaj uczestnikom wyłącznie adres zaczynający się od `https://`.

Tunel musi przekazywać zarówno zwykły ruch HTTP, jak i połączenia WebSocket. Popularne usługi tunelujące robią to automatycznie.

Przykładowy przebieg:

1. Uruchom `npm start`.
2. Uruchom tunel kierujący na `http://localhost:3000`.
3. Otwórz wygenerowany adres HTTPS na komputerze hosta.
4. Ten sam adres wyślij pozostałym graczom.
5. W grze wybierz `MULTIPLAYER`, utwórz pokój i udostępnij kod lub link.

Nie mieszaj adresów. Host i wszyscy gracze powinni korzystać z tego samego publicznego originu HTTPS.

## Wbudowany serwer HTTPS

Serwer może sam użyć certyfikatu i klucza TLS. Ustaw ścieżki do plików PEM przed uruchomieniem:

### Linux / macOS

```bash
HAND_SABERS_TLS_CERT=/ścieżka/fullchain.pem \
HAND_SABERS_TLS_KEY=/ścieżka/privkey.pem \
PORT=3000 \
npm start
```

### Windows PowerShell

```powershell
$env:HAND_SABERS_TLS_CERT="C:\certyfikaty\fullchain.pem"
$env:HAND_SABERS_TLS_KEY="C:\certyfikaty\privkey.pem"
$env:PORT="3000"
npm start
```

Następnie otwórz adres zgodny z nazwą znajdującą się w certyfikacie, np.:

```text
https://gra.example.org:3000
```

Certyfikat dla domeny nie będzie poprawny dla surowego adresu IP. Samopodpisany certyfikat może wymagać ręcznego zaufania na każdym urządzeniu i nie jest najlepszym rozwiązaniem na konkurs.

## Reverse proxy (Caddy, Nginx, Traefik)

Możesz pozostawić Hand Sabers na `http://127.0.0.1:3000` i zakończyć TLS w reverse proxy. Proxy musi przekazywać:

- wszystkie ścieżki strony i `/api/*`,
- nagłówki hosta/protokołu,
- upgrade połączeń WebSocket.

Przy pracy za reverse proxy można ustawić:

```bash
HAND_SABERS_TRUST_PROXY=1 npm start
```

Dzięki temu Express ufa informacjom proxy o adresie klienta. Włączaj tę opcję tylko wtedy, gdy aplikacja rzeczywiście stoi za kontrolowanym proxy.

## Multiplayer krok po kroku

1. Każdy gracz otwiera ten sam adres HTTPS gry.
2. Każdy zezwala przeglądarce na użycie kamery i przechodzi kalibrację.
3. Host wybiera `MULTIPLAYER` i tworzy pokój.
4. Host wybiera mapę oraz zasady rundy.
5. Pozostali wpisują kod pokoju lub otwierają udostępniony link.
6. Gracze oznaczają gotowość.
7. Host uruchamia rundę.

Stan pokoju, synchronizacja rundy i dane śledzenia są przesyłane przez WebSocket do tego samego procesu serwera. Pokój nie jest współdzielony między kilkoma niezależnymi instancjami aplikacji.

## Firewall i sieć

Jeżeli nie używasz tunelu, otwórz port ustawiony w `PORT` na firewallu i routerze. Domyślnie serwer nasłuchuje na `0.0.0.0:3000`.

Przy publicznym wystawieniu aplikacji zalecane jest:

- HTTPS,
- reverse proxy lub tunel,
- ograniczenie dostępu do paneli zapisu/importu map,
- regularna kopia katalogu `maps/`.

## Dane trwałe

Domyślnie serwer przechowuje dane w katalogu `maps/`. Możesz wskazać inną lokalizację:

```bash
HAND_SABERS_MAPS_DIR=/srv/hand-sabers/maps npm start
```

Przechowywane są tam mapy, pliki audio i tabela wyników. Katalog musi być zapisywalny dla użytkownika uruchamiającego Node.js.

## Szybka diagnostyka

- Strona działa, ale widzisz komunikat o serwerze: sprawdź `/api/health` i konsolę procesu Node.js.
- Kamera nie uruchamia się na telefonie lub drugim komputerze: użyj HTTPS zamiast adresu `http://IP:3000`.
- Pokój się tworzy, ale gracze nie łączą: sprawdź obsługę WebSocket w tunelu/proxy.
- Link prowadzi do innej instancji: wszyscy muszą używać dokładnie tego samego hosta i portu.
- Po zmianach w kodzie uruchom ponownie `npm start`, aby przebudować frontend i backend.
