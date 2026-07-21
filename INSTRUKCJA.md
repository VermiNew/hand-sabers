# Hand Sabers — szybkie uruchomienie

## Wymagania

- Node.js 22.18 lub nowszy
- npm
- kamera internetowa
- aktualny Chrome, Edge lub Firefox

## Uruchomienie lokalne

```bash
npm install
npm run dev
```

Otwórz adres pokazany w terminalu, zwykle `http://localhost:3000`.

Przed pierwszą grą:

1. Wejdź w **Ustawienia**.
2. Wybierz język, źródło kamery i odpowiedni profil wydajności.
3. Ustaw odbicie kamery, jeżeli lewa i prawa strona są zamienione.
4. Wykonaj **Kalibrację** w miejscu, w którym będziesz grać.
5. Otwórz **Mapy**, wybierz utwór i naciśnij **Graj**.

## Sterowanie

Stań około 1–1,5 m od kamery. W kadrze powinny być widoczne tułów i całe ręce. Tnij nadlatujące bloki mieczem w odpowiadającym kolorze. Bloki kierunkowe należy ciąć zgodnie ze wskazanym kierunkiem.

- `Esc` — pauza lub powrót
- ustawienia dźwięku i opóźnienia audio znajdują się w zakładce **Audio**
- przy niestabilnym śledzeniu użyj **Diagnostyki kamery**

## Budowanie wersji produkcyjnej

```bash
npm run build
npm run start
```

Po uruchomieniu serwera otwórz adres podany w terminalu.

## Najczęstsze problemy

### Kamera nie działa

Kamera działa na `localhost`. Przy otwieraniu gry z innego urządzenia przeglądarka zwykle wymaga HTTPS. Sprawdź też uprawnienia witryny do kamery i czy kamera nie jest używana przez inny program.

### Bloki i muzyka są przesunięte

W **Ustawienia → Audio** dopasuj offset audio.

### Lewa i prawa ręka są zamienione

W **Ustawienia → Rozgrywka** włącz lub wyłącz odbicie kamery.

### Gra przycina

Obniż profil grafiki. Śledzenie ML może być bardziej obciążające niż sama scena 3D, dlatego zadbaj również o dobre oświetlenie i możliwie czysty obraz kamery.
