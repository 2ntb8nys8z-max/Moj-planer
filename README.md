# Mój Planer

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
