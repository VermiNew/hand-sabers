# Model bezpieczeństwa kont

Konto należy do konkretnej instancji serwera Hand Sabers. Nie ma zewnętrznego
dostawcy tożsamości, poczty ani administracyjnego resetu dostępu. Lokalny profil
gry (nazwa wyświetlana, awatar i kolor) pozostaje oddzielony od konta; rejestracja
nie zmienia go automatycznie i nie przypisuje wstecz istniejących wyników.

## Sekrety i zapis danych

- Hasło ma od 10 do 128 znaków.
- PIN odzyskiwania składa się dokładnie z 8 cyfr i jest jedyną metodą odzyskania.
- Hasło i PIN otrzymują osobne, losowe sole 16-bajtowe i osobne skróty `scrypt`
  (`N=32768`, `r=8`, `p=1`, klucz 32-bajtowy). Serwer nie zapisuje ich jawnie.
- Porównanie wyprowadzonych kluczy używa `timingSafeEqual`; brakujące konto również
  wykonuje kosztowną operację, aby ograniczyć proste rozpoznawanie nazw przez czas
  odpowiedzi.
- Rekordy są zapisywane atomowo w `maps/_accounts.json` (albo pod katalogiem
  wskazanym przez `HAND_SABERS_MAPS_DIR`). Uszkodzony format zatrzymuje operację i
  nie jest automatycznie nadpisywany.

Parametry odpowiadają zaleceniom aktualnego API kryptograficznego Node dotyczącym
kosztownej pamięciowo funkcji `scrypt`, unikalnych soli i porównań stałoczasowych:
[Node.js Crypto](https://nodejs.org/api/crypto.html).

## Sesje

- Po rejestracji, logowaniu lub odzyskaniu serwer wydaje losowy token 256-bitowy.
- Przeglądarka przechowuje go w cookie `HttpOnly; SameSite=Lax; Path=/api` przez
  maksymalnie 30 dni. Flaga `Secure` jest dodawana przy połączeniu HTTPS.
- Serwer przechowuje w RAM wyłącznie skrót tokenu. Restart serwera wylogowuje
  wszystkich użytkowników.
- Odzyskanie hasła i usunięcie konta unieważniają wszystkie jego aktywne sesje.
- Usunięcie wymaga aktywnej sesji i ponownego podania bieżącego hasła.

Publiczna instancja powinna używać HTTPS oraz `security: true` z dokładną listą
`allowedOrigins`. Domyślne `security: false` jest przeznaczone do lokalnego
prototypowania i nie powinno być traktowane jako konfiguracja publicznego serwera.

## Limity prób

| Operacja | Limit adresu klienta | Dodatkowa blokada nazwy konta |
| --- | --- | --- |
| Rejestracja | 5/min | — |
| Logowanie | 10/min | 10 błędów w 15 min → blokada 15 min |
| Odzyskiwanie | 5/min | 5 błędów w 15 min → blokada 30 min |
| Usunięcie | 5/min | wymagane hasło i aktywna sesja |

Odpowiedzi błędnego logowania i odzyskiwania nie potwierdzają, czy nazwa konta
istnieje. Limity działają w pamięci procesu i resetują się wraz z serwerem.

## Konsekwencje utraty PIN-u

PIN trzeba zapisać poza grą. Serwer nie potrafi go odczytać ani wyświetlić, a gra
nie oferuje alternatywnego resetu przez e-mail, administratora lub pytanie
bezpieczeństwa. Jeżeli użytkownik utraci jednocześnie hasło i PIN, konto jest
trwale nieodzyskiwalne. Jeżeli nadal ma aktywną sesję, może usunąć konto tylko po
podaniu bieżącego hasła.
