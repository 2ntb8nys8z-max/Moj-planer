# Test rozmowy 32

Snapshot gałęzi conversation-engine-32, commit eb3af7b8b544596a2e8787fd3fb876fa5b35c109.
Adres: /Moj-planer/preview32/.

Ta kopia ma osobne klucze localStorage z prefiksem planner-preview-32:.
Nie migruje danych zwykłej aplikacji ani jej kodu dostępu; użytkownik wpisuje ten sam kod ponownie.
Google OAuth nie jest ładowany; inicjalizacja i przywrócenie połączenia są wyłączone, a warstwa HTTP Google odrzuca operacje.
Główna aplikacja pozostaje wersją 31. Wspólny Worker 32 obsługuje oba silniki: stary klient używa 2, testowy 3.
Limity AI są wspólne. W Cloudflare należy podmienić cały kod Workera na worker.txt z tego folderu; sekrety i D1 pozostają.

Worker nie jest wdrażany przez GitHub Pages. Użytkownik wdraża go ręcznie.
Przed próbą rozmowy można użyć przycisku Sprawdź limit AI, aby sprawdzić połączenie.
Szkic rozmowy jest sesyjny. Nowe zakresy przez północ/wiele dni są jeszcze blokowane.
Resolver lokalizacji korzysta ze starszego przepływu.

Test lokalny z głównego katalogu repo: node tests/preview32.cjs (wymaga npm ci).
