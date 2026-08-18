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

## Czego to narzędzie nie robi

Nie prognozuje cen, nie daje sygnałów kupna/sprzedaży, nie liczy wskaźników technicznych.
Opisuje strukturę podaży i to, co z niej wynika dla progu opłacalności.
