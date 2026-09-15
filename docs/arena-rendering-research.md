# Kierunek renderowania aren Hand Sabers

Stan analizy: 2026-09-15. Dokument dotyczy Three.js `0.184.x` używanego przez
projekt. Nie jest próbą kopiowania aren, HUD-u ani zasobów *Beat Saber*.

## Stan obecny

Projekt ma już sensowny fundament dla rytmicznej areny przeglądarkowej:

- `WebGLRenderer` z WebGL2, ACES Filmic, wyjściem sRGB, adaptacyjnym DPR i bez
  kosztownych cieni;
- proceduralne tło w jednym `ShaderMaterial`, `FogExp2`, tunel perspektywiczny,
  lekkie odbicie podłogi w render target i siedem profili jakości;
- instancing kostek, odłamków, żeber areny, portali i bocznych equalizerów;
- jeden analizator Web Audio rozdzielający bass, środek i wysokie tony oraz
  wspólna kontrola automatycznej/manualnej intensywności;
- diagnostyka `renderer.info.render.calls/triangles`, czasu renderowania i
  liczby aktywnych obiektów.

Kontrolowany kadr sceny Maximum z wymuszonym pulsem muzycznym wykazał 73 draw
calle i 8566 trójkątów. To punkt kontrolny samej sceny demonstracyjnej, a nie
benchmark pełnej mapy ani obietnica wydajności na urządzeniu użytkownika.

## Co współczesny Three.js daje temu projektowi

1. **Instancing jako podstawowy budulec.** Oficjalna dokumentacja wskazuje
   `InstancedMesh` do wielu obiektów o wspólnej geometrii i materiale właśnie po
   to, by ograniczyć draw calle. Należy kontynuować pule i instancing dla
   powtarzalnych dekoracji, świateł pozornych oraz nut. Źródło:
   [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html).
2. **Proceduralna głębia bez dodatkowych obiektów.** Mgła jest liczona w
   materiale każdego renderowanego piksela; `FogExp2` daje szybkie zagęszczanie
   w oddali, a klasyczny `Fog` pozwala dokładniej wyznaczyć czysty obszar toru.
   Dlatego mgła ma maskować odległy koniec areny, ale nie kontrast nut przy
   graczu. Źródła: [Fog](https://threejs.org/manual/en/fog.html),
   [FogExp2](https://threejs.org/docs/pages/FogExp2.html).
3. **Post-processing, ale za budżetem.** `EffectComposer` renderuje scenę do
   bufora, a kolejne passy przetwarzają pełny obraz. Bloom może podnieść jakość
   świateł, ale dokłada render targety, przepustowość i passy, więc nie powinien
   być bazowym wymaganiem. Źródła:
   [post-processing](https://threejs.org/manual/en/how-to-use-post-processing.html),
   [selective Unreal Bloom](https://threejs.org/examples/webgl_postprocessing_unreal_bloom_selective.html).
4. **Wiarygodne metryki wbudowane w renderer.** `renderer.info` udostępnia draw
   calle, trójkąty, linie, punkty, geometrie i tekstury. W projekcie należy
   traktować je razem z czasem CPU/GPU i percentylami klatki — sama liczba
   trójkątów nie wyjaśnia kosztu przezroczystości lub dodatkowego render passu.
   Źródło: [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html).
5. **Modele środowiska w glTF/GLB.** Three.js rekomenduje glTF jako format
   dostarczania gotowy do renderowania. `GLTFLoader` obsługuje między innymi
   Meshopt, Draco, Basis/KTX2 oraz GPU instancing, więc pojedyncze oryginalne
   moduły architektury mogą później zastąpić część prostych brył bez mnożenia
   transferu i materiałów. Źródła:
   [loading 3D models](https://threejs.org/manual/en/loading-3d-models.html),
   [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html).
6. **Dane częstotliwości są stabilnym Web API.** `getByteFrequencyData()` daje
   wartości 0–255 dla kolejnych zakresów do połowy sample rate i jest szeroko
   dostępne. Obecne wygładzanie i agregowanie do trzech pasm jest lepsze niż
   tworzenie osobnego analizatora dla każdego efektu. Źródło:
   [AnalyserNode.getByteFrequencyData](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getByteFrequencyData).

## Oryginalny kierunek: „Resonance Corridor”

Arena powinna wyglądać jak instrument zbudowany ze światła, nie jak zestaw
przypadkowych ozdób. Czytelność tworzą trzy strefy:

- **strefa gry (0–8 m):** ciemny, spokojny pas, wyraźne nuty i miecze, minimum
  przezroczystych warstw;
- **strefa rytmu (8–22 m):** żebra, portale i pylony poruszające się falą od
  bassu przez środek do wysokich tonów;
- **horyzont:** proceduralny punkt zbiegu, delikatna mgła, chmury i gwiazdy,
  które budują skalę bez ujawniania końca geometrii.

Każdy motyw mapy powinien zmieniać paletę, sylwetę żeber, tempo animacji oraz
2–3 charakterystyczne moduły, ale zachowywać tę samą ciemną „kopertę” toru.
Pozwoli to tworzyć rozpoznawalne światy bez naruszania kontrastu rozgrywki.

## Budżety i zasady akceptacji

Budżety są progami ostrzegawczymi do potwierdzenia pomiarem na urządzeniach,
nie sztywną blokadą rozwoju:

| Obszar | Medium | Maximum | Reguła |
| --- | ---: | ---: | --- |
| Dekoracyjne draw calle | ≤ 8 | ≤ 18 | powtarzalne obiekty tylko jako instancje |
| Pełnoekranowe dodatkowe passy | 0 | ≤ 2 | wyłączane przez presję/DPR i profil |
| Aktywne światła punktowe dekoracji | 0 | ≤ 4 | pozostałe jako emissive/unlit |
| Tekstury areny | ≤ 32 MiB | ≤ 96 MiB | KTX2/Basis, współdzielone materiały |
| Praca JS efektów areny | ≤ 0,35 ms | ≤ 0,75 ms | p95 na docelowym sprzęcie |

Zmiana wizualna nie przechodzi dalej, jeśli pogarsza p95 czasu klatki o więcej
niż 1 ms w scenie z kostkami, zwiększa liczbę alokacji na klatkę albo zasłania
nuty w strefie trafienia. `renderer.info` powinno być mierzone po całej klatce;
przy wielu render passach należy świadomie ustawić/resetować statystyki.

## Kolejność wdrażania

1. **Teraz — WebGL2 i modułowe set pieces.** Pozostać przy obecnym rendererze.
   Dodać 2–3 oryginalne zestawy instancjonowanych żeber/pylonów, sterowane tym
   samym sygnałem muzycznym i istniejącymi profilami. Zero nowych bibliotek.
2. **Po profilowaniu — wariant mgły.** Porównać `Fog` i `FogExp2` na trudnych
   mapach. Gęstość zmieniać bardzo wolno; pulsować kolorem/emisją horyzontu,
   nie zasięgiem widzenia nut.
3. **Eksperyment tylko Ultra/Maximum — selective bloom.** Użyć dodatku z
   obecnego pakietu `three`, renderować w 1/2 rozdzielczości, objąć wyłącznie
   emisję mieczy/portali i automatycznie wyłączyć po przekroczeniu budżetu.
   Wdrożyć tylko po pomiarze A/B; nie zastępować obecnych tanich poświat.
4. **Później — pipeline assetów.** Przy pierwszej ręcznie modelowanej arenie
   ustalić GLB jako format wejściowy, limit materiałów, zastosowanie skali w
   Blenderze oraz obowiązkowy raport rozmiaru GPU/transferu. Kompresję włączać
   dopiero po porównaniu czasu dekodowania na słabszym telefonie/PC.
5. **Osobny prototyp — WebGPU/TSL.** Three.js opisuje `WebGPURenderer` jako
   nowoczesny renderer z fallbackiem WebGL2 i łączonymi passami MRT, ale nadal
   eksperymentalny. Obecne `ShaderMaterial` i klasyczny `EffectComposer` nie są
   z nim bezpośrednio zgodne, więc migracja wymaga portu shaderów i osobnej
   macierzy regresji. Nie zmieniać głównej ścieżki przed prototypem na kilku GPU.
   Źródła: [WebGPURenderer](https://threejs.org/manual/en/webgpurenderer),
   [WebGPU post-processing](https://threejs.org/manual/en/webgpu-postprocessing.html).

## Czego świadomie nie robić

- nie kopiować układu tunelu, bloków, przeszkód, palet ani charakterystycznych
  efektów innej gry;
- nie dodawać globalnego bloom/DoF/motion blur do profilu domyślnego;
- nie tworzyć osobnego `Mesh` dla każdego beatu lub dekoracyjnego światła;
- nie uzależniać ruchu efektów od bieżącego FPS — czas muzyki jest źródłem
  prawdy, a animacja jedynie interpoluje;
- nie migrować renderera „bo WebGPU jest nowsze”; najpierw mierzalny prototyp,
  zgodność shaderów i zachowanie automatycznego fallbacku;
- nie zamrażać Three.js na zawsze. Aktualizacje wykonywać cyklicznie, osobnym
  commitem, po changelogu, lint/build i porównaniu sceny oraz metryk.
