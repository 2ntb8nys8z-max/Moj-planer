## Preview33 — 33.11-test

Wydanie testowe z `integration/conversation33`. Publikacja kopiuje wyłącznie pliki `preview33/`; produkcyjny `index.html` i moduły w katalogu głównym Pages nie są zmieniane. Preview zawiera własne, identyczne z testowanymi kopie modułów Google Calendar i synchronizacji z identyfikatorami zawartości w URL.

Wpisy poza kalendarzem mają wspólną listę i rozmowę, bez etykiet dawnych typów. Wyszukiwanie obejmuje tytuł, treść, dopiski i produkty, a domyślnie także tytuły i notatki wydarzeń. `scope` rozróżnia tylko wszystkie dane, wpisy i kalendarz; `createdOn` filtruje rzeczywistą datę utworzenia, `scheduledOn` termin wydarzenia. Brak wyników niczego nie tworzy. Stare dane i identyfikatory audio są zachowane. Dawne „Wolne myśli” są przenoszone atomowo do wspólnej kolekcji, bez dopisywania nieznanej daty utworzenia.

Jawne tworzenie wpisu i akceptacja bieżącej propozycji zapisują dane; sukces jest pokazywany po sprawdzeniu zapisu oraz obecności wpisu na liście. Kalendarz zachowuje swój przepływ potwierdzenia. Pełne `npm test` obejmuje dotychczasowe regresje kalendarza, synchronizacji, rozmowy, lokalizacji i pogody oraz `tests/entries-33-11.cjs` (wieloturowy Worker → frontend → zapis/DOM, daty, migracja, produkty, historia i błąd zapisu). AI, Google i audio są w testach zastępowane kontrolowanymi odpowiedziami; nie jest to test rzeczywistego mikrofonu, OAuth ani jakości modelu.

Pełny Worker do ręcznego wdrożenia: `preview33/worker.txt`. Publikacja frontendu nie wdraża Workera do Cloudflare. Po ręcznym wdrożeniu należy porównać `/api-info` z `preview33/release.json`.

# Mój Planer

## Jedno źródło Conversation 33

Gałąź `integration/conversation33` jest jedyną bazą dalszego rozwoju wersji 33.

- Frontend edytujemy wyłącznie w `index.html`.
- Worker edytujemy wyłącznie w `worker.js` oraz w jego blokach źródłowych `dialogue-core.js` i `prompts.js`.
- `npm run build` generuje `preview33/index.html`, oba pliki `worker.txt` oraz manifesty wydania.
- `npm run check:generated` kończy się błędem, jeśli którykolwiek artefakt jest nieaktualny.
- `npm test` zaczyna od tej kontroli, a następnie uruchamia testy aplikacji.
- Push na `integration/conversation33` publikuje na `main` wyłącznie trzy artefakty katalogu `preview33/`. Produkcyjny `main/index.html` pozostaje Planerem 31.

Preview33 używa prefiksu danych `planner-preview-33:`. Google Calendar nie jest izolowany; do testów synchronizacji należy używać konta lub kalendarza testowego.

Planer wydarzeń, zadań i pomysłów z rozmową głosową, pogodą, kopiami danych i opcjonalną synchronizacją Google Calendar.

## Integracja rozmowy 33

Gałąź `integration/conversation33` służy do chirurgicznej migracji sprawdzonej warstwy rozmowy z preview 32.4 do pełnego Planera. Bazą funkcjonalną pozostaje główna aplikacja 31: Google Calendar, synchronizacja, RRULE, konflikty, UI i istniejący model danych nie są zastępowane kodem preview.

### Zakres migracji

1. Przenieść Engine 3 i klasyfikację `execute / modify / propose / accept / reject / continue` wraz z trwałym draftem i `pendingProposal`.
2. Zachować kanały kontekstu `main / event / idea` i przekazywanie aktualnie edytowanego obiektu.
3. Nie przenosić uproszczenia preview `task = idea`. Przed implementacją osobnego `task` ustalić i zachować semantykę istniejących danych produkcyjnych; interpreter nie może sam zmieniać typu obiektu.
4. Zmiany lokalizacji mają unieważniać pochodne metadane miejsca/pogody i uruchamiać ponowne rozpoznanie dla nowej wartości, bez blokowania zapisu wydarzenia przez pogodę.
5. Dopiero po testach lokalnych podłączyć nową rozmowę do istniejącej synchronizacji Google; nie zmieniać kontraktu synchronizacji, kolejek ani obsługi serii w pierwszym etapie.

### Granice odpowiedzialności

AI interpretuje wypowiedź i zwraca intencję oraz operacje na dozwolonych polach. Kod Planera pozostaje właścicielem walidacji, danych, zapisu, pogody, Google Calendar, konfliktów i potwierdzenia operacji. Polecenie sterujące (np. „utwórz zadanie”) nie może automatycznie stać się treścią wpisu.

### Bramka przed scaleniem

Wymagane są regresje: tworzenie i edycja wydarzeń, rozmowa wieloturowa, propozycja/akceptacja/odrzucenie, zadanie kontra wydarzenie, edycja otwartego wpisu, lokalizacja invalid→valid i valid→valid, anulowanie bez przecieku stanu, all-day, RRULE (pojedyncze / od tego miejsca / cała seria), kolejka zmian, konflikty i synchronizacja Google w obu kierunkach. Do czasu przejścia tej bramki gałąź nie jest przeznaczona do wdrożenia produkcyjnego.

## Wydanie 31

AI może zwrócić odpowiedź rozmowną bez operacji zapisu. Pytanie użytkownika nie jest zastępowane stałym pytaniem formularza. Szkic i typ oczekiwanej informacji pozostają zachowane; odpowiedź rozmowna nie może mutować danych. Krótkie jednoznaczne odpowiedzi (np. długość) nadal mogą być rozwiązywane lokalnie. Testy 31 używają podstawionych odpowiedzi modelu; rzeczywistą jakość językową trzeba sprawdzić po wdrożeniu.

### Wydanie 30

Poprawka rozmowy: wybór miejscowości wymaga potwierdzenia lub jednoznacznej nazwy w ostatniej wypowiedzi; odpowiedź modelu sama w sobie nie wystarcza. Komentarze bez danych miejsca pozostawiają pytanie otwarte. Krótkie daty w odpowiedzi na pytanie o tytuł wymagają rozstrzygnięcia tytuł/termin; przypomnienie terminu jest potwierdzane przed kolejnym pytaniem. Synchronizacja pozostaje w wersji 29.

### Podstawa: wydanie 29

Frontend i Worker: `2026.10.06.31`. Moduł synchronizacji: `2026.10.06.29`, protokół 2. W `release.json` zapisany jest identyfikator zbudowanego Workera; `/api-info` wdrożonego Workera musi zwracać ten sam `workerBuildId` jako `buildId`.

### Wdrożenie na iPadzie

1. Otwórz `worker-code.html` na stronie Planera lub pobierz `worker.txt`.
2. W Cloudflare otwórz `moj-planer-api` → **Edit code**. Zastąp cały kod zawartością TXT i wybierz **Deploy**.
3. Zachowaj sekrety `OPENAI_API_KEY`, `PLANNER_ACCESS_TOKEN` oraz binding D1 `API_LIMITS_DB`. Nigdy nie wpisuj sekretów do plików repozytorium.
4. Odśwież Planer. Frontend 30 wymaga protokołu 2; ze starszym Workerem pokaże instrukcję aktualizacji zamiast wysyłać niezgodne nagranie.

Limity Workera: 500 dziennie, 3000 miesięcznie, 10 na minutę. Źródłem obowiązujących limitów jest Worker. Nieudane płatne próby także mogą zużyć wywołanie. Baza liczników inicjalizowana jest przez Worker jak wcześniej.

## Zasady produktu

- Przypomnienia ustawione w Planerze **nie są wysyłane do Google**, aby nie tworzyć podwójnych powiadomień. Istniejące przypomnienia wydarzeń z Google nie są kasowane podczas edycji.
- Edycja synchronizuje tylko zmienione pola. Termin (początek i koniec) porównywany jest jako całość. Rozbieżne zmiany tego samego pola wymagają decyzji.
- Odpowiedź na zapis potwierdza wysłaną migawkę. Późniejsza zmiana pozostaje oczekująca. Kolejka oczekującego zapisu jest przechowywana z wydarzeniem.
- Koniec całodniowego wydarzenia jest datą **wyłączną**, zgodnie z Google. Wydarzenia mają także `endDate` i `timeZone`. Przy zmianie typu lub daty Planer aktualizuje zakres; przy samej zmianie tytułu zachowuje termin.
- Dialog ma szkic i typ pytania; `set`, `clear`, `revert` opisują zmianę, usunięcie i cofnięcie wartości. Tekst pytania nie steruje obsługą odpowiedzi.
- Samo „od trzeciej” wymaga wyboru pory dnia. Godziny zapisane jako `03:00` / `15:00` są jednoznaczne.
- Pogoda dla całodniowego wydarzenia używa 11:00, 12:00 i 13:00 bez nadawania wydarzeniu godziny.

## Pliki i generowanie

- `index.html`: interfejs, lokalny zapis i nagrywanie.
- `google-calendar.js`: integracja Google, kolejki i konflikty.
- `sync-core.js`: porównanie pól i reprezentacja czasu, bez sieci/UI.
- `dialogue-core.js`: operacje na szkicu i typy pytań.
- `prompts.js`: instrukcje interpretacji.
- `worker.js`: samodzielny Worker; oznaczone bloki są generowane z dwóch powyższych plików.
- `worker.txt`: generowana kopia **tego samego** Workera do ręcznego wdrożenia.
- `worker-code.html`: pobiera aktualny TXT; nie zawiera osobnej historycznej kopii kodu.

Po zmianach uruchom `node scripts/build.mjs`. Nie edytuj ręcznie `worker.txt` ani oznaczonych bloków Workera.

## Testy

Z katalogu repozytorium:

```sh
node scripts/build.mjs
node tests/dialogue-28.mjs
node tests/dialogue-29.mjs
node tests/sync-29.mjs
node tests/api-29.mjs
node tests/dialogue-30.mjs
```

Testy używają fikcyjnych odpowiedzi AI i Google. Nie sprawdzają rzeczywistej transkrypcji, zachowania modelu ani OAuth. Stary test 28 zachowano jako regresję, z jego ograniczeniami wycinania fragmentów frontendu. Nowsze testy sprawdzają publiczny handler Workera i błędy współbieżności synchronizacji.

Dodatkowo `tests/dom-29.cjs` uruchamia komplet skryptów w DOM (wymaga pakietu `jsdom`), a `tests/browser-29.cjs` jest scenariuszem dla Playwright/Chromium. Test DOM wykonano; test pełnej przeglądarki w środowisku przygotowania wydania był zablokowany przez niedostępny plik instalacyjny Chromium. Nie jest oznaczony jako zaliczony.

Statyczny frontend można uruchomić przez `python3 -m http.server 8080`. Mikrofon wymaga localhost lub HTTPS. Produkcyjny Worker ogranicza Origin do domeny GitHub Pages; testy lokalne muszą używać mocka lub osobnej konfiguracji testowej, nie rozszerzać CORS produkcji.

Przed szerszą dystrybucją konieczne są testy na osobnym kalendarzu Google: konwersje całodniowe/godzinowe, wielodniowość, edycje równoległe, utrata połączenia i macierz operacji na seriach. Przypomnienia systemowe na telefonie i pełna obsługa języka angielskiego pozostają osobnymi etapami.

## Dane

Wpisy i kolejki są zapisane lokalnie w przeglądarce wraz z poprzednią wersją. Kopia JSON obejmuje dane kalendarza i metadane synchronizacji; może zawierać informacje o uczestnikach. Nie obejmuje sekretu OpenAI ani tokenu Google. Import odłącza Google przed przywróceniem.

Nagranie i ograniczony kontekst rozmowy trafiają do Workera i dostawcy AI. W protokole 2 są w treści żądania, nie w nagłówkach. Worker nie loguje treści wypowiedzi. Kod dostępu prototypu jest przechowywany lokalnie. Pełne konta użytkowników, migracja do IndexedDB i produkcyjna polityka prywatności są dalszymi zadaniami, a nie funkcjami ukończonymi w wydaniu 29.

### Preview33 33.12 — semantic entry search

Engine 3 no longer overrides model intent with Polish creation/search/rename regexes.
Search commands clear the transient draft and return a read-only UI action. An empty
calendar mutation is rejected and retried rather than rendered as a request for an
invented event's date/time. This removes identified failure paths; model intent
accuracy still requires live evaluation.

The frontend applies scope/creation/schedule filters locally. Date-only listing
requires no matching call. Text queries send complete searchable entry content
(title, body, products and additions, or event notes) to the existing authenticated
Worker/OpenAI service for semantic matching. This is a bounded initial implementation,
not an embedding index: up to 80 records / 24,000 serialized characters per batch,
long content in overlapping chunks, maximum eight batches. No top-k truncation.
Oversized searches ask for narrower scope; errors never appear as zero matches.
Each batch is a metered API request and counts against the existing quota. Full
searchable text is sent to the API, not only titles. Audio itself is not sent by
this search path; only any stored searchable text is available.

Matching returns only batch-local keys validated on the Worker and frontend.
Search cannot invoke writes. Changed/deleted/added records during a search invalidate
its results, and cancelled/superseded responses cannot reopen the result window.
All matches are shown for user selection; semantic recall is not guaranteed.

`npm test` includes state transitions in both languages, transport/DOM regressions,
ID rejection, all-eight-list rendering, full-content chunking, date-only listing,
limits and stale-result checks. AI replies in these tests are fixtures, not live
language-quality measurements. Before acceptance, test real PL/EN paraphrases,
shopping and unrelated topics, changed intent, and searches inside long notes.
Install the matching 33.12 Worker before using the published Preview33 frontend.
Production root files on main are not published by this branch's preview workflow.


### Preview33 33.13 — wolny czas w kalendarzu

Dodaje polecenie głosowe do pokazania wolnych przedziałów w wybranym dniu. Planer oblicza przerwy lokalnie z wydarzeń już zapisanych lub zsynchronizowanych, scala nachodzące spotkania, uwzględnia wydarzenia całodniowe i przechodzące przez północ. Domyślne godziny dnia to 08:00–22:00; można je ograniczyć, podając własne granice. Wyszukiwanie nie wysyła treści kalendarza do AI.

### Preview33 33.14 — spotkania do północy

Obsługuje wydarzenia kończące się dokładnie o 00:00 następnego dnia. Data końca jest zapisywana jawnie, pokazywana w podglądzie i synchronizowana z Google Calendar. Dotyczy tworzenia wydarzenia oraz zmiany jego godziny lub czasu trwania.

### Preview33 33.15 — mobilny widok wpisu

Nowy widok wspólnego wpisu ma stały nagłówek, przewijaną treść i stały dolny pasek. Długi wpis zajmuje ekran telefonu; krótkie wpisy zachowują formę mniejszego okna. Tytuł, przyciski i tekst zostały dopasowane do telefonu. Historia rozwija się w obrębie wpisu, a aktywna ikona pozwala ją zamknąć. Rozmowa o zmianach jest wyświetlana w przewijanej treści: użytkownik z lewej, AI z prawej.

Działające funkcje: dotychczasowa rozmowa głosowa, edycja ręczna nazwy/treści/lokalizacji i dodawanie notatek lub produktów, lokalne zdjęcia z aparatu/galerii, wiele lokalnych nagrań (pauza/wznowienie/zapis do 3 minut), odtwarzanie z przesuwaniem o 15 sekund, minutnik, kopiowanie tekstu i udostępnianie tekstu. Błąd zapisu nagrania zachowuje dźwięk w pamięci do ponowienia lub anulowania. Metadane są zapisywane atomowo z wpisem; nieudany zapis metadanych usuwa nowy osierocony blob. Dawne `voiceMemoId` są odczytywane bez migracji. Ręczna edycja odrzuca zapis formularza, jeśli wpis zmienił się w międzyczasie.

Transkrypcja audio, OCR i alarmy systemowe są w tym etapie jawnie niedostępne. Przyciski nie wykonują pozornych operacji. Nie dodano nowego wywołania API ani zmiany Workera — frontend 33.15 współpracuje z Workerem 33.14. Udostępnianie obejmuje tekst, a nie pliki. Lokalne nagrania i zdjęcia w IndexedDB nie są dołączane do istniejącej kopii JSON ani synchronizacji Google. Minutnik korzysta z dotychczasowego mechanizmu otwartej aplikacji; nie gwarantuje alarmu przy zamkniętej aplikacji.

`npm test` obejmuje `tests/entry-view-33-15.cjs`: zapis/rollback/stary formularz, stare i nowe załączniki, opóźnione odczyty, anulowanie dostępu do mikrofonu, pauzę/wznowienie i ponowienie zapisu nagrania, historię, rozmowę i minutnik. `tests/entry-view-browser-33-15.cjs` sprawdza Chromium w rozmiarach 390×844, 320×568 i 844×390; wymaga Playwright (`PLANNER_PLAYWRIGHT` może wskazywać istniejącą instalację). Testy nie zastępują próby prawdziwego mikrofonu, aparatu i natywnego arkusza udostępniania w Safari na iPhonie.


### Preview33 33.16 — produkty, terminy i powiązanie wpisu

Dodawanie produktów do istniejącego wpisu nie zmienia jego nazwy, treści ani załączników. Starsza operacja `replace` bez jawnego `replaceExisting: true` jest bezpiecznie traktowana jako dopisanie. Zastąpienie całej listy wymaga osobnego, jednoznacznego potwierdzenia usunięcia dotychczasowych produktów. Zmiana nazwy ma oddzielną operację `rename`. Zapis produktów wycofuje zmiany w pamięci przy błędzie trwałego zapisu.

„Ustal termin” zapisuje datę i godzinę we wpisie. Terminy są widoczne w dniu, tygodniu i miesiącu z ikoną dłoni; otwierają źródłowy wpis, nie blokują dostępności i nie są wysyłane do Google jako wydarzenia. Formularz pokazuje wolne przedziały całego dnia oraz konflikt wybranej godziny na podstawie lokalnego kalendarza. Można zmienić lub usunąć termin. Głosowe ustalanie terminu (także z dopytaniem) otwiera ten sam podgląd, bez automatycznego zapisu. Powiadomień systemowych jeszcze nie ma.

Wydarzenie utworzone z wpisu przechowuje lokalne `sourceEntryId` i przycisk otwierający wpis; usunięte źródło jest oznaczone bez błędu. Zewnętrzne linki i współdzielenie nie są implementowane. Daty dopisków są drobne i kursywą; jeden przycisk kopiuje cały blok tekstu z dopiskami chronologicznie. Transkrypcje i OCR zachowują osobne kopiowanie.

Wymagany Worker 33.16 (`preview33/worker.txt`), wdrażany oddzielnie w Cloudflare. Testy `npm test` obejmują scenariusz nadpisywania zakupów, zachowanie danych, rollback, termin i konflikt, usuwanie/stare formularze, nawigację do źródła i protokół głosowy z atrapą modelu. Nie potwierdzają rozpoznawania rzeczywistej mowy ani działania urządzeń Safari.


### Preview33 33.17 — rozmowa kalendarzowa i powiadomienia

Szkic tworzenia wydarzenia zachowuje już podane pola między turami; korekta godziny końca nie zeruje nazwy, daty ani początku. Przy konwersji otwartego wpisu domyślnym tytułem jest nazwa wpisu, a jego treść i lokalizacja trafiają do wydarzenia. Po rozpoczęciu konwersji widok wpisu zamyka się, a rozmowa i szkic kalendarza stają się widoczne. Po zapisie otwiera się wybrany dzień; wydarzenie ma lokalny przycisk powrotu do wpisu źródłowego.

„Ustal termin” oznacza punkt w kalendarzu Planera. Jednorazowe „przypomnij mi”/„ustaw powiadomienie”/„alarm” tworzy odrębny wpis z jednym nieblokującym powiadomieniem; można też ustawić alarm na istniejącym wpisie. Ikonka dzwonka odróżnia je od terminu z ikoną dłoni. Gdy Planer jest otwarty, sprawdza termin co 15 sekund i używa powiadomienia przeglądarki, jeśli użytkownik udzielił zgody; jeśli strona była zamknięta, spóźnione powiadomienie pokazuje się po ponownym otwarciu. To nie jest gwarantowany alarm w tle ani wydarzenie Google.

Podpowiedzi przy mikrofonie zachowują dotychczasowe przykłady i dodają: zmianę nazwy, listę/listę zakupów, dopisanie tekstu, lokalizację, minutnik i powiadomienie. Puste nagranie informuje krótko, że nic się nie nagrało. `npm test` pokrywa zachowanie szkicu, komendę powiadomienia, zapis/odroczenie/usunięcie alarmu i jego nieblokujący znacznik w kalendarzu. Worker 33.17 (`preview33/worker.txt`) trzeba wdrożyć oddzielnie w Cloudflare przed testem komend głosowych.

### Preview33 33.18 — ciągłość powiadomień

Powiadomienia zachowują dzień i własną treść przy zmianie samej godziny. Worker przechowuje osobny szkic powiadomienia i akceptuje częściowe poprawki. Rozmowa pozostaje aktywna także w głównym polu, gdy brakuje danych. Zapis nadal wymaga potwierdzenia. Testy obejmują częściowe odpowiedzi, pytanie pośrednie, poprawki i oba kanały interfejsu (odpowiedzi modelu symulowane). Worker 33.18 z preview33/worker.txt wymaga osobnego wdrożenia w Cloudflare.

### Preview33 33.19 — przeniesienie wpisu do kalendarza

Worker dopuszcza polecenie „wrzuć tę notatkę do kalendarza” jako poprawną komendę zmiany rodzaju wpisu na wydarzenie. Tytuł źródłowego wpisu, data i podane godziny przechodzą do formularza wydarzenia. Test obejmuje częściową poprawkę modelu (intent modify) dla otwartej notatki. Worker 33.19 trzeba wdrożyć oddzielnie w Cloudflare.

### Preview33 33.20 — rozmowa z wpisu, minutnik i powiadomienia

Pytania o brakujące dane wydarzenia pozostają w oknie otwartego wpisu; jego tytuł, termin i treść są zachowane. Głosowe „ustaw minutnik” pyta o długość, jeśli jej brakuje, i uruchamia minutnik bez zamykania wpisu. Głosowe usunięcie istniejącego powiadomienia prosi o potwierdzenie i nie usuwa terminu ani wydarzenia. Nieudana interpretacja zwraca krótką prośbę o powtórzenie. Testy obejmują te akcje interfejsu oraz walidację poleceń Engine 3. Worker 33.20 trzeba osobno wkleić i wdrożyć w Cloudflare.

### Preview33 33.21 — krótsze pytania doprecyzowujące

Usunięto powtarzany tekst „Zmiana jest w szkicu”. Planer pyta wprost o brakujące dane. Worker 33.21 trzeba osobno wkleić i wdrożyć w Cloudflare.
