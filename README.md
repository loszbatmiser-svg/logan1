# Kalkulator PPM + CAC – Gleba

Kalkulator składników odżywczych i analizy gleby dla upraw glebowych/w podłożu organicznym,
oparty o metodologię Logan Labs / Albrecht (Mehlich III, Saturated Paste, CAC — Cation Anion
Compatibility). Jeden plik `index.html`, zero zależności zewnętrznych, działa offline z `file://`.

## Uruchomienie

Otwórz `index.html` w przeglądarce. To wszystko — nie ma buildu, serwera ani `npm install`.
Plik zawiera w sobie bibliotekę [pdf.js](https://mozilla.github.io/pdf.js/) zakodowaną w base64
(dwa bloki `<script type="text/plain">` pod koniec pliku), więc wczytywanie raportów PDF też
działa bez internetu.

## Co to robi

Cztery zakładki, które razem prowadzą od testu glebowego do konkretnej dawki w gramach/mililitrach:

| Zakładka | Pytanie, na które odpowiada |
|---|---|
| **PPM (roztwór)** | Jaki profil PPM (N, P, K, Ca, S, Mg) da mój roztwór nawozowy + woda startowa + kompost? |
| **CAC / Gleba** | Jak wapniowanie zmieni pH, TCEC i nasycenie kationowe mojej gleby? |
| **Nawożenie gleby** | Czego brakuje do celu Mehlich III na dany etap wzrostu i ile danego produktu dosypać? |
| **Kompost** | Co faktycznie jest w moim kompoście (z dwóch raportów Logan Labs) i ile go dodać? |

Import raportów PDF (Mehlich III i Saturated Paste) wypełnia pola automatycznie — nie trzeba
przepisywać liczb z PDF-a ręcznie.

---

## Filozofia obliczeń

To jest sekcja, którą warto przeczytać przed edycją kodu. Większość poprawek w historii tego
projektu to nie nowe funkcje, tylko naprawianie miejsc, gdzie te zasady zostały złamane.

### 1. Jedna wartość, jedna droga obliczenia — nigdy dwie kopiowane osobno

Ilekroć ta sama liczba jest potrzebna w dwóch miejscach UI, oba miejsca muszą wołać tę samą
funkcję, a nie przeliczać jej niezależnie. Historyczny przykład: dawkowanie automatyczne
(krok 2, dopłata wg proporcji) kiedyś liczyło „ile dodać” inną formułą niż tabela „Kontrola
proporcji” — dawało to dwie różne liczby dla tego samego pierwiastka. Naprawa: obie strony
korzystają teraz z `getRatioAddRequirements()` / `getBindingRatioNeed()`. Jeśli zmieniasz
sposób liczenia proporcji, zmieniasz go w jednym miejscu, i **obie** tabele reagują.

Ta sama zasada stoi za tym, że masa gleby (`objętość × gęstość nasypowa`) jest czytana z tych
samych dwóch pól (`lime_volume_l`, `lime_bd`) w zakładce CAC przez `getSoilMassKg()` — używanego
identycznie w zakładce „Nawożenie gleby” i w zakładce „Kompost”. Zmiana gęstości gleby w jednym
miejscu przelicza dawki wszędzie, bo nigdzie nie ma drugiej, ukrytej kopii tej liczby.

### 2. Nic nie jest „na sztywno”, jeśli może się zmienić

Żadna wartość pochodząca z innego pola formularza albo z wczytanego raportu nie jest zamrażana
w momencie dodania do listy/koszyka. Dawki w koszyku „Nawożenie gleby” (`getCartItemGrams()`)
przeliczają się na żywo z aktualnej masy gleby, aktualnego etapu wzrostu i aktualnych targetów —
nie z tego, co było w polu w chwili kliknięcia „+ Dodaj”. To samo dotyczy kompostu: skład w
zakładce „Kompost” (`getCompostContent()`) jest budowany na bieżąco z wczytanego raportu, więc
wczytanie nowego pliku PDF przelicza wszystkie dawki bez dotykania kodu.

Wyjątek świadomy: profile fazy zapisywane w „PPM (roztwór)” (`savePhaseProfile()`) *są*
zamrożonym zrzutem stanu — to jest ich cel (zapisać „jak wyglądała faza wegetacji wtedy”), więc
tu zamrażanie jest zamierzone, nie przeoczeniem.

### 3. Jednostka fizyczna dyktuje formułę — nie odwrotnie

Konkurencja kationów o miejsca na kompleksie sorpcyjnym (Ca:Mg, Ca:K, Mg:K) zachodzi na
**jednostkę ładunku**, więc te trzy proporcje liczone są w miliekwiwalentach (meq), nie na
wadze (ppm). Reszta proporcji (K:P, Fe:Mn, Zn:Cu, K:Fe, B:Ca, P:Zn, Ca:N) to klasyczne stosunki
wagowe z praktyki Mehlich III i zostają na ppm. `TARGET_RATIOS` niesie pole `unit: 'meq' | 'ppm'`
per wiersz, a `ratioUnitValue()` / `ratioUnitToPpm()` to jedyne miejsce w kodzie, gdzie następuje
konwersja — zawsze tymi samymi zaokrąglonymi dzielnikami (`MEQ_DIV = {Ca:200, Mg:120, K:390,
Na:230}`), bo tych samych dzielników używa sam Logan Labs w swoich wydrukach. **Nie zamieniać
na „dokładniejsze” 200,39 / 121,53 / 390,98 / 229,90** — to by przestało odtwarzać wydruk
laboratorium.

Podobnie: twardość wody podaje się jako ekwiwalent CaCO₃, więc nie dzieli się jej wprost na
wapń i magnez proporcją wagową — trzeba zejść do czystych pierwiastków przez masy molowe
(`CACO3_PER_CA`, `CACO3_PER_MG` w `calculatePPM()`). Dzielenie na wprost `Ca = ppm × R/(R+1)`
zawyżało kiedyś wapń ~3×, bo mylило jednostkę „ppm jako CaCO₃” z „ppm jako czysty pierwiastek”.

### 4. Wariant wodny i wariant glebowy to dwa różne pytania, nie zakres niepewności

Wszędzie tam, gdzie tabela pokazuje kolumny „Minimum (wodne)” / „Maksimum (glebowe)”, to **nie
jest** przedział błędu pomiaru — to dwie różne, uzasadnione interpretacje tego samego materiału:

- **Wariant wodny** = to, co jest już rozpuszczone i natychmiast dostępne (np. Saturated Paste
  dla kompostu, `S:1 water_min` dla nawozów łatwo rozpuszczalnych).
- **Wariant glebowy** = cała pula, łącznie z tym, co uwalnia się stopniowo z materii organicznej
  (Mehlich III dla kompostu, wolniej rozpuszczalne minerały dla nawozów).

Ta sama zasada napędza dwa raporty w zakładce „Kompost” (Mehlich III → glebowy, Saturated
Paste → wodny, `getCompostContent()` zwraca `{min, max}` z obu) i dwa raporty importowane w
zakładce CAC. Jeśli dodajesz nowy produkt/składnik, zapytaj: czy to jest „już w roztworze”, czy
„cała pula w materiale” — to determinuje, do której kolumny trafia liczba.

### 5. Dwuetapowe dawkowanie automatyczne: najpierw target, potem proporcje — w tej kolejności

`computeAutoDoseGroups()` liczy dawkę w dwóch krokach, celowo w tej kolejności:

1. **Krok 1** — dociągnięcie każdego pierwiastka do jego targetu Mehlich III dla wybranego
   etapu wzrostu (`getPostTargetTotals()`).
2. **Krok 2** — dopiero *po* kroku 1, dopłata wynikająca z kontroli proporcji, licząca się od
   profilu **już podciągniętego** przez krok 1 (nie od profilu wyjściowego). Przykład z kodu:
   Fe przy 50 ppm i targecie 250 ppm → krok 1 daje +200 ppm; jeśli sama proporcja (np. K:Fe)
   żądałaby poziomu 280 ppm, krok 2 dokłada tylko +30 ppm, a nie ponownie całe 280.

Rozdzielenie tych kroków jest zamierzone i historycznie było źródłem najtrudniejszego błędu w
tym projekcie (mieszanie profilu „przed” i „po” między krokami dawało zawyżone, niespójne
dawki). Jeśli dotykasz `getRatioAddRequirements()` albo `getPostTargetTotals()`, zachowaj ten
podział.

### 6. „Blocked” zamiast fałszywej dawki

Kontrola proporcji nie zawsze da się naprawić dosypaniem — czasem rozjazd bierze się z nadmiaru
partnera (`kind: 'excess'`), a czasem sama tabela proporcji i tabela targetów są ze sobą
sprzeczne nawet przy obu pierwiastkach dokładnie na celu (`kind: 'conflict'`). W obu
przypadkach `getRatioAddRequirements()` **nie generuje dawki** — zwraca wpis do `blocked` z
wyjaśnieniem, zamiast produkować liczbę, która wygląda wiarygodnie, ale jest bez sensu. Nie
usuwaj tego rozróżnienia w imię „zawsze pokaż jakąś liczbę” — to świadoma bariera bezpieczeństwa.

### 7. Skąd biorą się liczby docelowe — i kiedy to jest wybór, nie wynik

`MEHLICH3_STAGES` (targety ppm per etap: `soil` / `veg` / `flo`) i `CATION_SAT_TARGETS`
(nasycenie kationowe % z zakładki CAC) to dwa **niezależne** źródła prawdy w tym narzędziu —
jedno z praktyki Mehlich III, drugie z metody Albrechta. `TARGET_RATIOS` dla proporcji
kationowych jest *wyprowadzone* z `CATION_SAT_TARGETS` (żeby nie wymyślać trzeciej, oderwanej
liczby), ale oba systemy nie muszą być idealnie zgodne — i mechanizm `conflict` z punktu 6
istnieje właśnie po to, żeby to pokazywać, a nie ukrywać.

Osobny przypadek: para „nasycenie wapniem ↔ pH po wapnowaniu” (zakładka CAC, sekcja
wapnowania) **nie jest** wyznaczona jednoznacznie przez model Logan Labs — przy danym pH każde
nasycenie wapniem poniżej sumy zasad jest z nim zgodne, różni je tylko ilość wapnia. Dlatego
`PH_ANCHORS` to punkty do interpolacji (68%→6,5 / 72%→6,7 / 75%→6,8), oparte na konwencji
Albrechta, a nie coś wyliczalnego z samych danych — jeśli masz własny pomiar, wpisz go zamiast
ufać domyślnym kotwicom.

---

## Struktura pliku

Wszystko w jednym `index.html`, żeby narzędzie zostało pojedynczym plikiem bez budowania:

```
<head>                    style (jeden blok <style>, bez frameworków CSS)
<body>
  <div class="tabs">      przełącznik 4 zakładek
  <div id="tab-ppm">       Zakładka 1: PPM (roztwór)      — linie  91–224
  <div id="tab-cac">       Zakładka 2: CAC / Gleba         — linie 225–425
  <div id="tab-nawoz">     Zakładka 3: Nawożenie gleby     — linie 426–628
  <div id="tab-kompost">   Zakładka 4: Kompost             — linie 629–754

  <script type="text/plain" id="pdfjs-lib-b64">     biblioteka pdf.js, base64
  <script type="text/plain" id="pdfjs-worker-b64">  worker pdf.js, base64

  <script>                 cała logika aplikacji — ok. 2500 linii
    ...
  </script>
```

**Nigdy nie czytaj/edytuj bloków `pdfjs-*-b64` bezpośrednio** — to pojedyncze linie po kilkaset
KB base64, które zapchają dowolny edytor czy narzędzie tekstowe. `ensurePdfjs()` dekoduje je
leniwie (dopiero przy pierwszym imporcie PDF) do prawdziwego skryptu i Blob URL dla workera.

### Główny blok `<script>` — mapa funkcji

**PDF / parsowanie** (współdzielone między głównym importem i importem kompostu)
- `ensurePdfjs()` — leniwa inicjalizacja biblioteki z base64
- `pdfItemsToRows()` — grupuje pozycje tekstu PDF w wiersze po współrzędnej Y
- `rowNumbers(row, minX)` — wyciąga liczby z wiersza; jedyne miejsce, gdzie to się dzieje
  (patrz „Filozofia”, punkt 1) — jeśli parser czegoś nie łapie, zacznij tutaj
- `findValuesFor()`, `valueColumnMinX()` — lokalizują właściwy wiersz/kolumnę mimo że układ
  raportów Logan Labs bywa niespójny (czasem wartość jest przed etykietą, czasem po)
- `parseLoganReport()` — parser głównego importu (Mehlich III, zakładka CAC)
- `parseCompostReport()` — parser obu raportów kompostu (Mehlich III + Saturated Paste)

**Zakładka PPM (roztwór)**
- `calculatePPM()` — liczy profil N/P/K/Ca/S/Mg z dawek produktów + wody startowej + kompostu
- `computeSolutionRatios()` — proporcje N:K, Ca:Mg, K:Ca, N:S w roztworze
- `savePhaseProfile()` / `loadPhaseProfile()` — zapisane profile faz w `localStorage`

**Zakładka CAC / Gleba**
- `calculateCAC()` — TCEC, nasycenie kationowe z Value Found (Ca/Mg/K/Na)
- `getOtherBases()`, `getExH()` — wzory Logan Labs na „Other Bases” i wymienny wodór z pH
- `getLimeScenario()`, `calculateLime()` — dawka wapna do zadanego nasycenia wapniem

**Zakładka Nawożenie gleby**
- `MEHLICH3_STAGES` — targety ppm per etap wzrostu (soil/veg/flo)
- `TARGET_RATIOS`, `ratioUnitValue()`/`ratioUnitToPpm()` — proporcje międzypierwiastkowe (patrz
  „Filozofia”, punkt 3)
- `getCurrentTotals()` — bieżący profil gleby (baza z CAC + wapnowanie + koszyk produktów)
- `getPostTargetTotals()`, `getRatioAddRequirements()`, `getBindingRatioNeed()`,
  `computeAutoDoseGroups()` — silnik dawkowania dwuetapowego (patrz „Filozofia”, punkty 5–6)
- `AMENDMENTS` — baza produktów (nawozy mineralne/organiczne) z zawartością % pierwiastków

**Zakładka Kompost**
- `getCompostContent()` — zawartość pierwiastka w kompoście, `{min, max}` z dwóch raportów
- `renderCompostSoilDose()` — ile ml podniesie pierwiastek o zadane ppm w glebie
- `renderCompostExtract()` — profil PPM wyciągu wodnego (jak zakładka PPM, ale dla kompostu)
- `renderCompostCalibration()` — kalibracja przelicznika wyciągu na podstawie zmierzonego TDS

### Konwencje kodu

- **Polskie komentarze i etykiety UI** — to narzędzie dla polskojęzycznego użytkownika, kod
  komentowany jest w tym samym języku.
- **Komentarz = dlaczego, nie co** — commity w historii tego repo trzymają się zasady: nie
  opisuj co robi kod (widać z nazw), opisuj dlaczego akurat tak, jeśli to nieoczywiste (ukryte
  założenie, obejście konkretnego formatu raportu, konwencja zgodna z zewnętrznym źródłem).
- **Weryfikacja na prawdziwych danych** — każda zmiana dotykająca chemii albo parsera powinna
  być sprawdzona względem realnego raportu PDF, nie tylko przez czytanie kodu. Rozbieżność
  między tym, co kod „powinien” liczyć, a tym, co faktycznie liczy, była źródłem większości
  poprawek w historii tego projektu.
