# Test rozmowy 32.4

Gałąź fix/conversation32-save-truth. Baza: b96a557da176843a23a73ddb7394c240a5796d74 (32.2).
Frontend: 2026.10.07.32.4. Kompatybilny Worker pozostaje w wersji 2026.10.06.32.3,
build 4280e57cf622290b — ta zmiana nie wymaga ponownego wdrożenia Workera.
Engine 3: gpt-6-luna, reasoning_effort none. Transkrypcja bez zmian.

## Zmiany

Model klasyfikuje znaczenie jako execute, modify, propose, accept, reject albo continue.
Kod wybiera review po jednoznacznym poleceniu lub poprawce, jeśli szkic jest kompletny.
Propozycja pozostaje w pendingProposal; accept/reject muszą wskazać aktualny proposalId.
Odrzucenie przywraca szkic sprzed propozycji. Pytanie nie może stosować operacji.
Gotowy podgląd i komunikaty wykonania polecenia pochodzą z programu, nie swobodnej odpowiedzi modelu.
Zapis nadal następuje tylko po potwierdzeniu przyciskiem we frontendzie.

Pogoda nie przejmuje rozmowy i nie blokuje podglądu. Wyszukiwanie następuje po otwarciu
wydarzenia. Geocoder dostaje prostą nazwę oraz osobny countryCode; region nie jest dopisywany
do tekstu zapytania. Dokładna nazwa ma pierwszeństwo, a podobna nazwa nie jest automatycznie
akceptowana. Nazwa użytkownika pozostaje bez zmian, a współrzędne są osobnymi metadanymi.
Prognoza jest zapisywana przy wydarzeniu na 2 godziny. Zmiana lokalizacji unieważnia stare
współrzędne i prognozę. Nieudane geokodowanie jest ponawiane po godzinie.
Stary resolver Workera pozostaje dla klienta Engine 2.

## Izolacja i wdrożenie

Osobne dane localStorage z prefiksem planner-preview-32:. Google wyłączony.
Główna aplikacja pozostaje 31. Nie zmieniać main.
Worker wdraża się ręcznie do Cloudflare; zachować sekrety i D1.
Frontend preview32/index.html trzeba opublikować jako kopię testową, niezależnie od Workera.
Samo wdrożenie Workera nie aktualizuje strony z GitHub Pages.

## Testy

npm ci, następnie npm run test:preview32.
Testy z podstawionym API obejmują usunięcie lokalizacji, review, propozycję/akceptację,
odrzucenie, nieaktualną zgodę, pytanie bez mutacji, brakujące dane i odrzucenie błędnej próby.
Test DOM sprawdza izolację danych oraz brak rozmowy i zmiany nazwy przy niepewnym geokoderze.
Nie wykonują płatnych wywołań; jakość klasyfikacji Luny wymaga testów rzeczywistych.

preview32/worker.txt jest samodzielnym źródłem eksperymentu, nie wynikiem głównego builda.
scripts/build.mjs generuje tylko głównego Workera 31.
BUILD_ID to pierwsze 16 znaków SHA-256 pliku z const BUILD_ID="development"; przed wstawieniem ID.
Numer wersji jest także w pierwszej linii pliku.
