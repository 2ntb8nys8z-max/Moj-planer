# Zakupy Okti · etap 1 · audyt i przygotowanie migracji

Stan z 25 listopada 2026 r. Wersja próby migracji `etap1.1`. Dotyczy obecnych danych zakupowych. Nowy model kartek będzie wprowadzany w kolejnych etapach.

## Punkt odniesienia

| Odczyt | Wynik |
| --- | --- |
| Publiczny manifest GitHub Pages | Frontend 33.370, build `914b23ceeaff1219` |
| Publiczne API Cloudflare | Worker 33.68, build `0864843d0f0560df`, protokół 2 |
| Publiczny HTML aplikacji i strony odbiorcy | Oba porównane bajt po bajcie przez SHA-256 z plikami na `main` w `03a912517d3c8c67509114cf606b24ecc9076b33` |
| Gałąź integracyjna | `952c1fc`, manifest 33.306. Bazą prac jest nowszy kod produkcyjny. |
| Gałąź robocza | `work/shopping-phase1-migration-audit`. Publikację aplikacji i Workera obsługują osobne procesy na innych gałęziach. |

[Publiczny manifest](https://2ntb8nys8z-max.github.io/Moj-planer/release.json) · [Informacja o działającym API](https://moj-planer-api.yd7ynvj864.workers.dev/api-info)

## Gdzie są dane

| Miejsce | Stan w 33.370 | Znaczenie dla migracji |
| --- | --- | --- |
| Telefon właściciela | Zbiorcza kartka pochodzi z `ideas[].list.items` w bieżącym zapisie Planera lub ze starszego magazynu wpisów. Identyczne napisy mogą oznaczać różne pozycje. | Zachować wpis źródłowy, identyfikator, kolejność, podpisy, historię i powtórzenia. Kopiując pozycję na nową kartkę, nadać nowy identyfikator. |
| Stan synchronizacji właściciela | Jedno powiązanie z listą, jeden tytuł i jedna zapisana podstawa porównania na ścieżkę instalacji. `syncSharedShopping` publikuje zbiorczą kartkę i zapisuje zmiany odbiorców we wpisach telefonu. | Odczytać ten stan przed zmianą. Stara podstawa porównania może różnić się od telefonu i od serwera. Nie traktować jej jako aktualnej listy. |
| Produkty dopisane przez gości | `importGuestShopping` umieszcza je w lokalnym wpisie zakupowym. W tym samym wpisie mogą być ręcznie dodane produkty właściciela. | Rozpoznawać pochodzenie każdego produktu, zachować elementy niejednoznaczne. Cały wpis nie nadaje się do automatycznego usunięcia. |
| Cloudflare D1 | Każda lista ma osobny rekord z identyfikatorem, rewizją i JSON. Są w nim produkty, podpisy, dane uczestników, zaproszenia oraz informacje potrzebne przy ponowieniach zapisu. | Zachować dokładne bajty każdej zastanej rewizji, również nieznane pola. Rejestr dołączeń jest ograniczony do ostatnich 100 zdarzeń. Historia wszystkich dawnych zakupów i cofnięć nigdy nie była osobnym dziennikiem. |
| Telefon uczestnika | Aktualny magazyn tożsamości ma klucz zależny od listy. Urządzenie zapisuje swój losowy sekret przed próbą dołączenia. | Zachować powrót na tę samą kartkę. Nowa kartka wymaga samodzielnej rejestracji, pustego pola nicka i nowego sekretu. Dotyczy to także podpowiedzi przeglądarki. |
| Powiadomienia | Klucz podpisujący jest po stronie serwera. Subskrypcje urządzeń są przypisane do listy. | Pozostawić istniejące subskrypcje i tożsamość push na miejscu. Kopia zakupów przeznaczona dla telefonu ich nie zawiera. |

## Dostęp i zgodność starszych list

- **Własność.** Działający model ma jednego aktywowanego właściciela i wspólną dla jego operacji weryfikację. Rekord listy nie przechowuje dowodu przynależności do konta. Przed obsługą osobnych właścicieli przypisać istniejące listy do zweryfikowanego właściciela. Odczyt, zapis, panel, push i archiwum muszą sprawdzać właściciela konkretnej listy. Sam identyfikator z lokalnej kopii nie potwierdza własności.
- **Trzy rodzaje dostępu.** Istnieją starsze kartki dostępne przed rejestracją, indywidualne lub grupowe zaproszenia z miejscami oraz otwarte zaproszenia. Obecny interfejs udostępnia otwarty link. Na jednej liście różne rodzaje zaproszeń mogą współistnieć. Migracja ma zachować dostęp potwierdzonych uczestników oraz ochronić zawartość przed pokazaniem jej nowej osobie przed wpisaniem nicka.
- **Członkostwo.** Można ponownie wykorzystać zapis z warunkiem zgodnej rewizji, przypisanie odhaczenia do kupującego, rejestrację dołączenia, odbieranie i przywracanie dostępu. Brakuje atomowej rezerwacji unikalnej nazwy. Automatyczne numerowanie skrótów autorów rozróżniało identyczne nazwy wyłącznie na ekranie. Przy nowych dołączeniach trzeba zarezerwować znormalizowaną nazwę także wobec właściciela i osób z odebranym dostępem. Istniejących osób o tych samych nazwach nie scalać, nie przenosić zakupów, nie nadawać nowego nicka bez ich udziału. Przy nierozstrzygalnym dawnym podpisie zachować tekst bez przyznawania prawa cofnięcia.
- **Miejsca i wymiana linku.** Obecny zapis miejsc po odebraniu dostępu zależy od rodzaju zaproszenia. Docelowo zajęte miejsce pozostaje przypisane do tożsamości również po blokadzie. Obejrzenie zaproszenia ma być bez zapisu. Przy wymianie linku wyświetlić liczbę oczekujących i uprzedzić właściciela o konieczności przesłania im nowego linku. Po zatwierdzeniu przenieść na nowy link sumę wolnych i dodatkowych miejsc, a starszy wyłączyć dla nowych dołączeń w tej samej operacji. Dotychczasowi uczestnicy wracają swoim sekretem. Ochrona przed serią automatycznych rejestracji wymaga osobnego limitu serwerowego. Przekazany link nie potwierdza tożsamości adresata.
- **Izolacja.** Strona odbiorcy ma osobny dokument, pobiera dane zakupowe, a tekst produktów i podpisów wstawia przez `textContent`. API używa przypisanych parametrów SQL, HTTPS, ograniczenia wielkości treści i odpowiedzi `no-store`. Osobna ścieżka w tej samej domenie współdzieli magazyn przeglądarki. Dla docelowej izolacji wybrać odrębne pochodzenie strony odbiorcy, przed wysyłką zbudować jawny widok listy dla jego roli i zrezygnować z kluczy pozycji ujawniających strukturę prywatnego wpisu. Zakres tokena gościa kończy się na jednej liście. Sprawdzanie pochodzenia żądania stanowi dodatkową warstwę.
- **Tożsamość i cofanie dostępu.** Dziś sekret gościa powstaje w przeglądarce, a jego skrót służy też do rozpoznawania osoby. Kolejny model potrzebuje niezależnego identyfikatora uczestnika, odwoływalnego sekretu ograniczonego do listy i bezpiecznego magazynu sesji. Tokenów właściciela ani uczestnika nie należy przenosić w przenośnej kopii. Serwer odmawia kolejnych operacji zablokowanemu członkowi listy z zaproszeniami. Odświeżanie otwartego widoku odbywa się okresowo.
- **Archiwum i zakończenie.** Zamknięcie dołączania jest już dostępne. Trwałe zamknięcie całej listy, archiwum właściciela i identyfikator kolejnego ukończenia zakupów wymagają nowego stanu. Wspólny filtr statusu musi objąć także stare ścieżki zapisu i panel. Ukończenie i numer ukończenia powinny zmieniać się razem z zakupem w jednej rewizji. Odtworzenie efektu zapisywać osobno dla danej osoby, listy i ukończenia.

## Kopia telefonu

Narzędzie `kopia-zakupow.html` można otworzyć lokalnie. Przycisk „Sprawdź na przykładzie” pokazuje wynik dla dwóch fikcyjnych wpisów. Po wybraniu zwykłej kopii Okti narzędzie wyodrębnia pola zakupowe i zapisuje osobny plik na wyraźne żądanie. Kopię zakupów można ponownie otworzyć i sprawdzić. Oryginalną kopię Planera należy zachować, zawiera też resztę wpisów i ich treści.

Przy uruchomieniu z katalogu danej instalacji Okti na dotychczasowym originie dostępny jest również przycisk „Odczytaj zakupy z tego urządzenia”. Ten tryb kopiuje lokalny identyfikator, tytuł i podstawę porównania starszej listy. Obsługuje odrębne magazyny głównej instalacji i preview. Na osobnej domenie podglądu dostępne są przykład i import z pliku. Dostęp do faktycznych danych Safari lub PWA zależy od profilu, w którym są zapisane. Sekrety aktywacji i logowania oraz dane push pozostają w oryginalnym magazynie. Identyfikatory dawnych list i zawartość pliku są prywatne.

## Próba migracji serwera

`migrations/shopping/001-checkpoint.sql` dodaje osobną tabelę punktów odzyskiwania i kopiuje cały aktualny zbiór list jednym poleceniem. Ponowienie tej samej rewizji jest bezpieczne. Kolejna rewizja daje kolejny zapis. Sprzeczna treść przy tym samym identyfikatorze i rewizji zatrzymuje operację. Polecenie nie interpretuje zawartości list i zachowuje również uszkodzone rekordy do diagnozy. Żaden workflow ani żądanie użytkownika nie wykonuje tej migracji.

Próbę wykonuje się w prywatnym katalogu na osobnej, lokalnej bazie SQLite z zaufanej kopii tabeli `shared_shopping`. Do prób w tej gałęzi dołączono wyłącznie fikcyjne dane testowe. Przed przełączeniem wskazane są niezależny eksport tabeli zakupów i aktualny punkt odzyskiwania D1. D1 służy też innym funkcjom Planera. Odtwarzanie całej bazy cofnęłoby również ich zapisy. Przy dużej tabeli czas eksportu uwzględnić w oknie serwisowym. [Eksport pojedynczej tabeli D1](https://developers.cloudflare.com/d1/best-practices/import-export-data/) · [Punkty odzyskiwania D1](https://developers.cloudflare.com/d1/reference/time-travel/)

Poniższe polecenia uruchamia się z katalogu repozytorium na lokalnej replice odtworzonej z prywatnego eksportu.

```sh
sqlite3 /prywatny-katalog/proba.sqlite < migrations/shopping/001-checkpoint.sql
node scripts/check-shopping-migration.mjs /prywatny-katalog/proba.sqlite
```

Inspektor otwiera replikę tylko do odczytu. Pokazuje liczby rekordów, produktów, zakupów, osób, miejsc, linków bez limitu, potencjalnych kolizji nazw i kopii zgodnych z aktualną rewizją. Nazwy porównuje w obrębie jednej listy po normalizacji NFKC, uporządkowaniu odstępów i zmianie wielkości liter według ustawień polskich. To inwentaryzacja przed wdrożeniem ostatecznej polityki nicków. Kod wyjścia 2 wskazuje brak aktualnej kopii lub podstawową niezgodność formatu, 1 oznacza błąd odczytu. Poprawny odczyt nie rozstrzyga niejednoznacznej historii. Test odtwarza listy z tabeli kopii do drugiej, pustej bazy i sprawdza dokładną zgodność każdego rekordu. Kopia w tej samej bazie nie chroni przed utratą całej bazy.

## Przełączenie w kolejnych etapach

1. Zachować prywatne produkty i przypisanie do źródeł na urządzeniu. Osobno zabezpieczyć aktualną rewizję każdego dokumentu serwerowego. Stan telefonu, ostatnią synchronizację i stan serwera porównać z uwzględnieniem zakupów wykonanych od ostatniej synchronizacji.
2. Zbudować równoległy katalog list. Istniejący dokument wspólny zachowuje ID, historię, uprawnienia i oczekujące miejsca. Prywatna kartka pozostaje lokalna. Zwykłe tworzenie nowej listy tworzy nowe ID oraz nowe kopie jedynie wybranych produktów. Tworzenie i ponowienie migracji muszą rozpoznawać już przeniesiony dokument.
3. Sprawdzić zgodność rewizji i liczebności przed aktywacją. Jeśli lista zmieniła się w trakcie, ponowić z aktualnej rewizji. Wyłączyć dawną dwukierunkową synchronizację tej listy po obu stronach, w tym dla starych wersji klienta. Dopiero wtedy dopuścić zapis do nowego modelu. Obsługa powrotu przez stare linki potrzebuje ścieżki zgodności i jasnej informacji dla właściciela o losie niewykorzystanych miejsc.
4. W razie błędu przed przełączeniem zachować bieżący model i ponowić próbę. Po pojawieniu się zapisów w nowej wersji najpierw zabezpieczyć i uzgodnić te zmiany. Przywracanie starego punktu wprost utraciłoby najnowsze zakupy.

## Granice weryfikacji

Etap obejmuje audyt kodu, porównanie publicznych artefaktów oraz testy na danych fikcyjnych. Lokalny SQLite sprawdza zapis, ponowienie i odtworzenie rekordów. Testy przeglądarkowe oraz dotychczasowa regresja zakupów obejmują zachowanie wersji bazowej. Produkcyjne rekordy D1 i pamięć konkretnych telefonów pozostają poza zakresem tego odczytu. Równoczesne operacje nowego modelu, rotacja linków, archiwum, konfetti i fizyczne Safari wymagają sprawdzenia wraz z odpowiednimi etapami.
