# Profiling słabszych PC

## Zakres

Pętla gry mierzy koszt logiki, efektów, odbić i końcowego renderu. Panel
deweloperski zestawia te wartości z czasem detekcji MediaPipe i wskazuje
najdroższą fazę. Pomiary faz są aktywne tylko przy włączonym panelu, więc nie
obciążają zwykłej rozgrywki.

## Znalezione wąskie gardła

1. Diagnostyka najbliższych beatów kopiowała i sortowała całą mapę co 250 ms,
   również bez aktywnego panelu. Przy dużych mapach powodowało to cykliczne
   alokacje oraz skoki CPU. Diagnostyka działa teraz tylko w trybie developerskim
   i wybiera trzy elementy w pojedynczym przebiegu bez pełnego sortowania.
2. Efektywna długość mapy była obliczana do trzech razy na klatkę. Dla map bez
   audio i `meta.duration` każde wywołanie skanowało wszystkie beaty. Wynik jest
   teraz cache'owany względem mapy, tablicy beatów i długości audio.
3. Render oraz MediaPipe pozostają kosztami zależnymi od urządzenia. Profile
   Lowest/Very Low ograniczają DPR, rozdzielczość kamery i częstotliwość ML, a
   wyłączone odbicia, glinty i dekoracje kończą aktualizację przed kosztownymi
   operacjami.

## Interpretacja profilera

- `ML detect` — detekcja dłoni na głównym wątku; obniżyć profil lub użyć telefonu.
- `render` — końcowy render WebGL; adaptive quality obniża DPR i profil.
- `game logic` — aktualizacja mapy, bloków i HUD.
- `effects` — światła, odłamki i animacje mieczy.
- `reflection` — dodatkowy render odbicia, aktywny tylko w wysokich profilach.

Testy na konkretnych urządzeniach nadal są potrzebne do dobrania progów, ale
instrumentacja rozdziela już koszty i pozwala wskazać dominującą fazę bez
profilowania całej aplikacji zewnętrznym narzędziem.
