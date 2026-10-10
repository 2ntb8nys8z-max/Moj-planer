# Instrukcje pracy nad Mój Planer

## Ochrona działającej mechaniki rozmowy

Ustalenie użytkownika z 10 października 2026: wersja 33.28 działa poprawnie i stanowi bazę zachowania mechaniki konwersacji. Commit integracji: 163973041249682ccef7769954217150fe48d54c.

- Przy zmianach wyglądu i innych funkcji zachowuj istniejącą mechanikę rozmowy. Nie zmieniaj jej przy okazji ani nie wykonuj niezamówionego refaktoru.
- Jeśli zadanie wymaga zmiany tej mechaniki, PRZED edycją poinformuj użytkownika: co musi się zmienić, dlaczego i jaki wpływ może mieć na dotychczasowe działanie. To obowiązek informacji, a nie automatyczne wymaganie ponownej zgody na już zleconą pracę.
- Chroń zachowanie danych między turami, rozróżnienie głosu i tekstu, wybór niejednoznacznych godzin, AM/PM, przypomnienia oraz tworzenie wydarzeń. Przy głosowym 1–12 bez pory także transkrypcja HH:MM wymaga dopytania; odpowiedź na aktywne opcje rozstrzyga godzinę. Formularz ręczny przypomnienia otwiera się po jawnej edycji ręcznej; rozmowa kończy się podsumowaniem do zatwierdzenia.
- Przed publikacją zmian kodu uruchom istniejący zestaw testów regresyjnych. Dla koniecznej zmiany rozmowy dodaj odpowiednie testy pełnego przepływu Worker → frontend → kolejna tura, również dla audio z normalizowaną transkrypcją. Nie osłabiaj testów, żeby ukryć regresję.
- Zgłoś użytkownikowi wykryte regresje i ograniczenia weryfikacji. Nie przedstawiaj testów z imitowaną odpowiedzią modelu jako potwierdzenia działania żywego modelu lub Workera Cloudflare.
