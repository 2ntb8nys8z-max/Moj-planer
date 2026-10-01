export default {
  async fetch(request, env) {

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Current-Item",
    };

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...cors,
          "Content-Type": "application/json; charset=utf-8"
        }
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "POST") {
      return new Response("Moj Planer API działa", {
        status: 200,
        headers: cors
      });
    }

    try {

      if (!env.OPENAI_API_KEY) {
        throw new Error("Brak OPENAI_API_KEY");
      }

      /* ===== 1. AUDIO ===== */

      const audioBlob = await request.blob();

      if (!audioBlob.size) {
        throw new Error("Plik audio jest pusty");
      }

      let extension = "mp4";

      if (audioBlob.type.includes("webm")) extension = "webm";
      else if (audioBlob.type.includes("wav")) extension = "wav";
      else if (audioBlob.type.includes("mpeg")) extension = "mp3";

      const formData = new FormData();

      formData.append(
        "file",
        audioBlob,
        `audio.${extension}`
      );

      formData.append(
        "model",
        "gpt-4o-mini-transcribe"
      );

      formData.append("language", "pl");


      /* ===== 2. MOWA → TEKST ===== */

      const transcriptionResponse = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`
          },
          body: formData
        }
      );

      const transcriptionText =
        await transcriptionResponse.text();

      if (!transcriptionResponse.ok) {
        return json({
          success: false,
          stage: "transcription",
          error: transcriptionText
        }, transcriptionResponse.status);
      }

      const transcription =
        JSON.parse(transcriptionText);

      const spokenText =
        (transcription.text || "").trim();

      let currentItem = null;
      const currentItemHeader = request.headers.get("X-Current-Item");
      if (currentItemHeader) {
        try { currentItem = JSON.parse(decodeURIComponent(currentItemHeader)); } catch (_) {}
      }

      if (!spokenText) {
        throw new Error("Nie rozpoznano wypowiedzi");
      }


      /* ===== 3. DZISIEJSZA DATA ===== */

      const now = new Date();

      const currentDate =
        new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Europe/Berlin",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).format(now);


      /* ===== 4. AI ROZUMIE WYPOWIEDŹ ===== */

      const aiResponse = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },

          body: JSON.stringify({

            model: "gpt-4o-mini",
            temperature: 0,

            response_format: {
              type: "json_object"
            },

            messages: [

              {
                role: "system",

                content:
`Jesteś inteligentnym parserem polskiego planera.

Dzisiejsza data w strefie Europe/Berlin:
${currentDate}

Jeżeli poniżej przekazano AKTUALNY WPIS, wypowiedź użytkownika jest poprawką do tego wpisu.
W takim przypadku zmień WYŁĄCZNIE informacje wskazane przez użytkownika, zachowaj wszystkie pozostałe pola i zwróć kompletny poprawiony JSON.
Nie twórz nowego wydarzenia i nie usuwaj informacji, których użytkownik nie koryguje.

AKTUALNY WPIS:
${currentItem ? JSON.stringify(currentItem) : "brak — utwórz nowy wpis"}

Musisz ustalić, czy wypowiedź użytkownika jest:

1. "event" — wydarzeniem, spotkaniem, wizytą lub zadaniem związanym z konkretną datą/czasem.

2. "idea" — pomysłem, luźną myślą, rzeczą do zapamiętania, książką lub filmem do sprawdzenia, planem na przyszłość bez konkretnego terminu.

Zwróć WYŁĄCZNIE JSON.

Dla wydarzenia:

{
  "type": "event",
  "title": "Wizyta u dentysty",
  "date": "YYYY-MM-DD",
  "startTime": "HH:MM",
  "endTime": "HH:MM",
  "notes": "wszystkie istotne szczegóły wypowiedzi poza datą, godziną i krótkim tytułem",
  "reminder": null,
  "recurrence": null,
  "applyToSeries": false,
  "recurrenceAction": null
}

Dla pomysłu:

{
  "type": "idea",
  "text": "Przeczytać książkę Solaris Stanisława Lema",
  "action": "replace",
  "addition": null
}

ZASADY:

- Zachowuj istotny sens wypowiedzi.
- NIE usuwaj informacji takich jak osoba, miejsce, dokładny adres lub cel spotkania.\n- Osoby, miejsca, adresy, cel spotkania i pozostałe istotne szczegóły zapisuj w "notes".\n- Nie zgaduj ani nie poprawiaj nazw własnych, ulic i adresów.\n- Jeśli notatki nie podano, zwróć pusty string.\n- Jeśli użytkownik prosi o przypomnienie, ustaw "reminder": {"minutesBefore": liczba_minut}. Przykład: "15 minut wcześniej" = 15, "godzinę wcześniej" = 60, "dwie godziny wcześniej" = 120.\n- Jeśli użytkownik nie prosi o przypomnienie, ustaw "reminder": null.
- Jeśli wydarzenie ma się powtarzać, ustaw "recurrence" jako:
  {"frequency":"daily|weekly|monthly","interval":1,"until":"YYYY-MM-DD","count":null}
- "co tydzień" = weekly / interval 1; "co dwa tygodnie" = weekly / interval 2; "codziennie" = daily; "co miesiąc" = monthly.
- Jeśli użytkownik mówi "przez dwa miesiące", "przez 6 tygodni" itp., oblicz konkretną datę końcową i wpisz ją w "until".
- Jeśli mówi "5 razy", ustaw count=5 i until=null.
- Pole "date" dla serii oznacza datę pierwszego wystąpienia. Jeśli mówi np. "w każdy czwartek", wyznacz najbliższy przyszły czwartek jako pierwszą datę.
- Jeśli wydarzenie nie jest cykliczne, ustaw "recurrence": null.
- Przy poprawianiu istniejącego wydarzenia należącego do serii domyślnie zmieniaj TYLKO to jedno wystąpienie i ustaw "applyToSeries": false.
- Pole "recurrenceAction" służy WYŁĄCZNIE do zmiany cykliczności istniejącego wydarzenia.
- Gdy użytkownik zmienia zwykłe istniejące wydarzenie na cykliczne (np. "powtarzaj to co tydzień przez dwa miesiące", "zmień to na cykliczne"), ustaw recurrence na żądaną regułę oraz "recurrenceAction":"create". Zachowaj datę aktualnego wydarzenia jako pierwsze wystąpienie, chyba że użytkownik wyraźnie poda inną datę.
- Gdy użytkownik mówi "usuń cykliczność", "wyłącz cykliczność", "nie powtarzaj już tego spotkania" lub podobnie dla istniejącej serii, ustaw "recurrenceAction":"remove". Zachowaj pozostałe dane wydarzenia. Nie usuwaj samego bieżącego wydarzenia. Ta operacja oznacza: bieżące wydarzenie zostaje, a późniejsze wystąpienia serii mają zostać usunięte.
- W pozostałych przypadkach ustaw "recurrenceAction": null.
- Ustaw "applyToSeries": true WYŁĄCZNIE gdy użytkownik wyraźnie mówi, że zmiana ma dotyczyć całej serii, wszystkich spotkań lub wszystkich powtórzeń.
- Przykład: "przypomnij mi 15 minut wcześniej" = tylko to wydarzenie. "Ustaw to przypomnienie dla całej serii" = applyToSeries true.
- Gdy użytkownik mówi "zmień przypomnienie na przypomnienie cykliczne", "zrób to przypomnienie cykliczne", "ustaw przypomnienie cykliczne" lub podobnie, zachowaj OBECNE reminder bez zmiany i ustaw applyToSeries=true. Nie ustawiaj reminder=null. Oznacza to zastosowanie istniejącego przypomnienia do całej serii.
- "spotkanie dentysta" interpretuj jako np. "Wizyta u dentysty".
- "spotkanie z Tomkiem" → "Spotkanie z Tomkiem".
- "spotkanie w banku" → "Spotkanie w banku".

- Rozpoznawaj: dzisiaj, jutro, pojutrze oraz dni tygodnia.
- Rozpoznawaj naturalnie wypowiedziane daty.

- "pół godziny" = 30 minut.
- "godzina" = 60 minut.
- "półtorej godziny" = 90 minut.
- Jeśli podano zakres od X do Y, zachowaj obie godziny.

- Jeżeli nie podano końca ani czasu trwania:
  endTime = "".

- Jeżeli nie podano godziny:
  startTime = "".

- Jeżeli AKTUALNY WPIS ma type "idea", traktuj wypowiedź jako operację na tym konkretnym pomyśle.
- Dla istniejącego pomysłu przy zwykłej edycji pole "text" jest jego pełną treścią po zmianie.
- Gdy użytkownik mówi "dopisz", "dodaj do tego", "uzupełnij" lub podobnie, NIE PRZEREDAGOWUJ ani nie zwracaj zmienionej wcześniejszej treści. Ustaw "action":"append" i w polu "addition" zwróć WYŁĄCZNIE nową informację do dopisania. Pole "text" pozostaw dokładnie takie jak w AKTUALNYM WPISIE.
- Gdy użytkownik mówi "zmień", "popraw", "usuń fragment" lub podobnie, ustaw "action":"replace", "addition":null, zmodyfikuj tylko wskazany fragment w polu "text" i zachowaj resztę.
- Dla nowego pomysłu ustaw "action":"replace" i "addition":null.
- Gdy użytkownik każe przenieść, wpisać, dodać lub zamienić TEN POMYSŁ na wydarzenie w kalendarzu i podaje termin, zwróć type "event". Użyj treści aktualnego pomysłu do utworzenia krótkiego sensownego title, zachowaj istotne szczegóły w notes i ustaw podaną datę/godzinę. Nie wymagaj, aby użytkownik powtarzał treść pomysłu.
- Przykład: AKTUALNY WPIS = {"type":"idea","text":"Sprawdzić nowego dentystę na Mokotowie"}, użytkownik mówi "przenieś to do kalendarza jutro na 15" → zwróć event na jutro 15:00 dotyczący sprawdzenia dentysty.
- Jeśli przy istniejącym pomyśle użytkownik nie prosi o przeniesienie do kalendarza, wynik ma pozostać type "idea".

- Jeżeli wypowiedź nie ma konkretnego terminu i jest rzeczą do zapamiętania, klasyfikuj ją jako "idea".

Przykłady:

"Jutro o 17 idę do dentysty na godzinę."
→ event / Wizyta u dentysty / jutro / 17:00–18:00

"W piątek o 10 spotkanie z Tomkiem."
→ event / Spotkanie z Tomkiem

"Chciałbym przeczytać Solaris Lema."
→ idea / Przeczytać Solaris Lema

"Zapamiętaj pomysł, żeby pojechać kiedyś do Norwegii."
→ idea / Pojechać kiedyś do Norwegii

"Chcę obejrzeć film Interstellar."
→ idea / Obejrzeć film Interstellar`
              },

              {
                role: "user",
                content: spokenText
              }

            ]
          })
        }
      );

      const aiText = await aiResponse.text();

      if (!aiResponse.ok) {
        return json({
          success: false,
          stage: "interpretation",
          transcription: spokenText,
          error: aiText
        }, aiResponse.status);
      }

      const aiResult = JSON.parse(aiText);

      const content =
        aiResult.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("Brak interpretacji AI");
      }

      const parsed = JSON.parse(content);


      /* ===== 5. ODPOWIEDŹ ===== */

      if (parsed.type === "idea") {

        return json({
          success: true,
          transcription: spokenText,

          item: {
            type: "idea",
            text: parsed.text || spokenText,
            action: parsed.action || "replace",
            addition: parsed.addition || null
          }
        });
      }


      return json({
        success: true,
        transcription: spokenText,

        item: {
          type: "event",
          title: parsed.title || spokenText,
          date: parsed.date || "",
          startTime: parsed.startTime || "",
          endTime: parsed.endTime || "",
          notes: parsed.notes || "",
          reminder: parsed.reminder || null,
          recurrence: parsed.recurrence || null,
          applyToSeries: parsed.applyToSeries === true,
          recurrenceAction: parsed.recurrenceAction || null
        }
      });


    } catch (error) {

      console.log("WORKER ERROR:", error.message);

      return json({
        success: false,
        error: error.message
      }, 500);
    }
  }
};
