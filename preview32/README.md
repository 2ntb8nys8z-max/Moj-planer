# Test rozmowy 32.2

Wersja 32.2 na gałęzi fix/conversation32-save-truth. Baza porównania 32.1: commit 76305b46f0d947ed8565e419800fd9bb28600d27.
Adres: /Moj-planer/preview32/.

Ta kopia ma osobne klucze localStorage z prefiksem planner-preview-32:.
Nie migruje danych zwykłej aplikacji ani jej kodu dostępu; użytkownik wpisuje ten sam kod ponownie.
Google OAuth nie jest ładowany; inicjalizacja i przywrócenie połączenia są wyłączone, a warstwa HTTP Google odrzuca operacje.
Główna aplikacja pozostaje wersją 31. Wspólny Worker 32.2 obsługuje oba silniki: stary klient używa 2, testowy 3.
Limity AI są wspólne. W Cloudflare należy podmienić cały kod Workera na worker.txt z tego folderu; sekrety i D1 pozostają.

Worker nie jest wdrażany przez GitHub Pages. Użytkownik wdraża go ręcznie.
Przed próbą rozmowy można użyć przycisku Sprawdź limit AI, aby sprawdzić połączenie.
Szkic rozmowy jest sesyjny. Nowe zakresy przez północ/wiele dni są jeszcze blokowane.
Resolver lokalizacji korzysta ze starszego przepływu.

## Eksperyment 32.2

Jedyna zmiana zachowania Engine 3: model gpt-6-luna z reasoning_effort none,
zamiast gpt-4o-mini. Prompt, reducer, routing draft/review, resolver lokalizacji
(gpt-4o-mini) i transkrypcja (gpt-4o-mini-transcribe) pozostają bez zmian.
Frontend i Worker deklarują 2026.10.06.32.2, Worker build b80e64291534f8c3.
Poprawiono też zakres zmiennej w teście DOM, dodano test kontraktu modelu
z podstawionymi odpowiedziami oraz zaktualizowano oznaczenia pobierania TXT.

Test lokalny z głównego katalogu repo: npm ci, następnie npm run test:preview32.
Testy nie wykonują płatnych wywołań API i nie dowodzą jakości językowej modelu.

Przed porównaniem sprawdź w aplikacji wersję wdrożonego Workera i build ID.
Powtarzaj te same wpisane wypowiedzi względem tej samej migawki wydarzenia,
co najmniej po 5 razy na model. Dopiero później porównaj nagrania głosowe.
Scenariusze: akceptacja uzgodnionej nazwy; odrzucenie propozycji; poprawka nazwy
po kilku turach; pytanie o możliwość zmiany bez zgody; niejednoznaczna godzina;
korekta pisowni Wólka Kosowska przed resolverem i w trakcie jego działania.
Oceniaj poprawność podglądu, zachowanie pozostałych pól, liczbę tur,
czas odpowiedzi, ponowienia oraz koszt całego poprawnie zakończonego zadania.
Znane błędy resolvera, w tym skrót „zapisz tylko …” bez location, nie są
naprawiane w tym eksperymencie.

## Źródło Workera testowego

preview32/worker.txt jest obecnie samodzielnym plikiem eksperymentalnym.
scripts/build.mjs generuje tylko głównego Workera 31, nie tę kopię.
Nie używaj głównego builda do przygotowania Workera 32.2.
Po zmianie pliku testowego oblicz BUILD_ID jako pierwsze 16 znaków SHA-256
całej treści z deklaracją const BUILD_ID="development"; przed wstawieniem ID.
Test preview32-model.cjs sprawdza tę tożsamość.


