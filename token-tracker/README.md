# FDV Tracker — portfel świadomy rozwodnienia

Jeden plik: **`index.html`**. Otwierasz go bezpośrednio z dysku (`file://`), bez serwera,
bez builda, bez npm. Cały CSS i JS jest w środku.

## Zależności zewnętrzne

Tylko z `cdnjs.cloudflare.com`, ładowane w czasie działania:

| Biblioteka | Do czego | Gdy brak sieci |
|---|---|---|
| Chart.js 4.4.1 | wykresy | aplikacja działa dalej, w miejscu każdego wykresu jest tabela z tymi samymi danymi |
| PDF.js 3.11.174 | wyciąganie tekstu z PDF | ładowana dopiero po kliknięciu „Wczytaj i przeanalizuj”; bez niej zostaje wklejanie tekstu |

Ceny pobiera CoinGecko (`/api/v3/simple/price`). Gdy API odmówi (limit, brak sieci),
ceny i podaż wpisujesz ręcznie w widoku „Codzienna aktualizacja”.

## Dane

Stan trzyma się w pamięci, autozapis idzie do `localStorage` w `try/catch` — jeśli przeglądarka
go zablokuje, aplikacja działa dalej i mówi o tym wprost na górze ekranu. Data ostatniego zapisu
jest zawsze widoczna w pasku nagłówka. Kopia zapasowa: **Dane i ustawienia → Pobierz dane (JSON)**.

Historia notowań w danych startowych jest **wygenerowana demonstracyjnie** — pokazuje, jak działa
sygnał odbudowy, zanim uzbierasz własne odczyty. Usuwa się ją jednym przyciskiem
(Dane i ustawienia → „Usuń historię demonstracyjną”). Ceny, wolumeny, harmonogramy odblokowań
i podaże docelowe w danych startowych też wymagają weryfikacji — pole „źródło podaży”
i data aktualizacji są widoczne w interfejsie właśnie po to.

## Znana rozbieżność w specyfikacji (scenariusz ATH nr 2)

Kryteria akceptacji podają dla PEAQ trzy wartości: **390 300 zł / 125 100 zł / 42 800 zł**,
przy podaży w obiegu 2 414 494 570 i podaży docelowej 5 667 620 228.

Te dane nie są ze sobą zgodne:

* scenariusz 1 (`holdings × athPrice`) → **390 296 zł** ✔
* scenariusz 3 (`holdings × athMarketCap / totalSupply`) → **42 810 zł** ✔
* scenariusz 2 (`holdings × athMarketCap / circulatingSupply`) → **100 490 zł**, nie 125 100 zł

Wartość 125 100 zł wychodzi dopiero przy podaży w obiegu ≈ **1,94 mld** — czyli z innej,
wcześniejszej podaży niż ta podana w danych startowych. Wzór jest zaimplementowany dokładnie
tak, jak w specyfikacji; różni się dana wejściowa, nie formuła. Widok **Testy** pokazuje tę
rozbieżność wprost i wylicza, jaka podaż dałaby oczekiwaną liczbę. Zmiana podaży w obiegu
na 1 939 500 000 sprawia, że test przechodzi — ale wtedy przestaje się zgadzać kryterium
„cena ×5,4 / kapitał ×12,6”, które zakłada podaż 2,41 mld.

## Widoki

1. **Pulpit** — sygnał realnej odbudowy, wartość portfela, główny wykres FDV z linią progu, podaż w czasie, tabela tokenów.
2. **Token** — trzy scenariusze ATH, kalkulator scenariuszy, oś odblokowań, rozkład podaży, scoring ryzyka, projekcja rozwodnienia.
3. **Dodaj / edytuj** — ręcznie, z PDF, z linku lub wklejonego tekstu. Wynik parsowania nigdy nie zapisuje się sam.
4. **Codzienna aktualizacja** — pobranie cen, ręczna korekta, zapis odczytu do historii.
5. **Porównanie** — sortowalne zestawienie struktury podaży wszystkich tokenów.
6. **Dane i ustawienia** — eksport/import JSON, kurs USD/PLN, horyzont, źródła podaży.
7. **Testy** — kryteria akceptacji liczone na żywo z bieżących danych.

## Kalkulator scenariuszy z osią czasu

Kalkulator ma trzy wejścia: **datę**, **liczbę tokenów uwolnionych do tej daty** i **wycenę**.

Liczba uwolnionych tokenów wylicza się sama z harmonogramu odblokowań plus emisji
(inflacja maleje o `inflationDecayPct` rocznie z podłogą `inflationFloorPct`, ostatni
niepełny rok liczony proporcjonalnie), ale można ją nadpisać ręcznie — przycisk
„Przelicz z harmonogramu” wraca do wartości automatycznej.

Wycenę zadaje się w jednym z dwóch trybów, i to jest sedno:

* **Zadaję FDV** — cena = FDV ÷ podaż docelowa, więc **nie zależy od daty**. Udział
  w podaży jest stały, więc wartość pozycji też się nie zmienia. Od daty zależy co innego:
  ile realnego kapitału musi wtedy siedzieć w tokenie, żeby ta cena się utrzymała
  (kafelek „kapitał w tokenie w tym dniu”) i ile z tego to pieniądze potrzebne wyłącznie
  na wchłonięcie świeżo uwolnionych tokenów.
* **Zadaję kapitał w tokenie** — cena = kapitał ÷ podaż w obiegu w tym dniu. Tu czas
  kosztuje wprost: ta sama kwota rozłożona na większą podaż daje niższą cenę i mniejszą
  pozycję. Dla PEAQ przy 1 mld $ kapitału: luty 2027 → ok. 200 tys. zł, luty 2032 → ok. 169 tys. zł.

Dodatkowy kafelek **„cena przy dzisiejszym kapitale”** pokazuje, gdzie wyląduje cena, jeśli
do tokena nie dojdzie ani dolar, a podaż urośnie zgodnie z założeniem.

Suwak (10 mln – 10 mld $, skala logarytmiczna) i pole na dokładną kwotę są zsynchronizowane;
kwota wpisana ręcznie może wyjść poza zakres suwaka — wtedy suwak stoi na krańcu, a liczby
liczą się z wpisanej wartości.

## Cztery warstwy poza podażą

Sama tokenomia mówi, *ile* musi się stać, żeby wyjść na zero — nie mówi, *dlaczego* miałoby.
Te warstwy dokładają resztę. Wszystkie pola są opcjonalne: puste znaczy „nie wiem”, a nie „zero”,
i tak też są opisane w interfejsie.

### Czas i koszt kapitału

Kalkulator scenariuszy zwraca wartość bieżącą pozycji (dyskonto ustawialne, domyślnie 10% r/r),
**IRR od dziś** oraz **IRR całej inwestycji** — ta druga liczy też czas już przetrzymany, jeśli
wpisałeś transakcje. Do tego wynik po podatku od zysku.

Uwaga na częsty błąd: **podatek nie podnosi progu opłacalności**. Przy 19% od zysku warunek
`pozycja − 0,19 × (pozycja − wkład) = wkład` upraszcza się do `pozycja = wkład`. Podatek zjada
wyłącznie górkę powyżej progu. Próg naprawdę przesuwa co innego — kurs (niżej).

### Efektywny float i benchmark

Pola: podaż w stakingu, w skarbcu, saldo na giełdach, głębokość księgi ±2%.
`efektywny float = (podaż w obiegu − staking − skarbiec) / podaż docelowa`. Gdy te dane są wpisane,
scoring płynności mierzy obrót względem podaży **płynnej**, a nie całej kapitalizacji — bo tokeny
w stakingu nie stoją po drugiej stronie księgi. To sufit, nie gwarancja: staking można odwinąć,
i tak jest to opisane w karcie tokena.

Benchmark (kapitalizacja całego rynku krypto, pobierana z `/api/v3/global` albo wpisywana ręcznie)
daje **siłę względną**: `(1 + zmiana FDV) / (1 + zmiana rynku) − 1`. Bez tego zielony kafelek
„realna odbudowa” myli betę rynku z siłą projektu.

### Fundamenty sieci

Pola: roczny przychód, jaka jego część trafia do tokena, wartość emisji rozdanej dostawcom,
liczba węzłów. Z tego liczą się:

* **P/S** = FDV ÷ przychód — jedyny mnożnik porównywalny między sieciami, i P/S po value capture
* **pokrycie subsydium** = przychód od klientów ÷ emisja rozdana dostawcom; poniżej 100% sieć
  dopłaca do siebie drukiem (osobna czerwona flaga)
* **przychód wymagany do progu** = próg FDV ÷ docelowy mnożnik P/S — ile sieć musiałaby robić rocznie,
  żeby dzisiejszy próg opłacalności był uzasadniony fundamentami
* przychód i FDV na węzeł, tempo wzrostu przychodu i węzłów z migawek historycznych

### Księga transakcji

Lista kupna i sprzedaży z **kursem USD/PLN z dnia zakupu**. Gdy jest niepusta, pozycja, średnia cena
i wkład liczą się z niej, a pola „ile sztuk” i „średnia cena zakupu” przestają być używane.
Koszt metodą średniej ważonej; sprzedaż zdejmuje koszt proporcjonalnie i zamyka zysk zrealizowany.

Efekt uboczny, który wyszedł dopiero na testach i jest teraz osobnym ostrzeżeniem w karcie tokena:
**próg w złotówkach to nie to samo, co próg w dolarach.** Kupując po 4,00 i 4,20 zł za dolara przy
dzisiejszym kursie 3,71, musisz dojść do ceny o ~12% wyższej niż średnia cena zakupu w USD, żeby
w ogóle wyjść na zero w PLN.

## Wersja artefaktowa

`build-artifact.py` robi z `index.html` plik do opublikowania jako artefakt na claude.ai.
Artefakty mają ostre CSP — żaden skrypt z zewnętrznego hosta się nie załaduje — więc skrypt
wkleja Chart.js i PDF.js prosto do pliku (razem ~1,7 MB) i zdejmuje ramkę
`<!DOCTYPE>/<html>/<head>/<body>`, bo platforma dokłada własną.

```
npm i chart.js@4.4.1 pdfjs-dist@3.11.174
mkdir vendor && cp node_modules/chart.js/dist/chart.umd.js node_modules/pdfjs-dist/build/pdf.min.js node_modules/pdfjs-dist/build/pdf.worker.min.js vendor/
python3 build-artifact.py vendor artifact.html
```

Czego w wersji artefaktowej nie ma i mieć nie może: pobierania cen z CoinGecko i zapisu pliku
JSON — przeglądarka blokuje jedno i drugie w ramce podglądu. Aplikacja to wykrywa i mówi wprost:
zamiast cichego przycisku „Pobierz dane” podstawia JSON do skopiowania, a przy cenach kieruje do
pól ręcznych. Wykresy, parser PDF i cała reszta działają, bo biblioteki siedzą w pliku.

Motyw ma trzy stany: „jak w systemie” (domyślny, bez stempla — podąża za `prefers-color-scheme`
albo za motywem strony, w której ramce siedzi), jasny i ciemny. Przycisk w nagłówku przechodzi
po kolei.

## Czego to narzędzie nie robi

Nie prognozuje cen, nie daje sygnałów kupna/sprzedaży, nie liczy wskaźników technicznych.
Opisuje strukturę podaży i to, co z niej wynika dla progu opłacalności.
