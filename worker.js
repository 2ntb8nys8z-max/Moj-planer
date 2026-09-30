export default {
  async fetch(request, env) {

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
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
  "notes": "wszystkie istotne szczegóły wypowiedzi poza datą, godziną i krótkim tytułem"
}

Dla pomysłu:

{
  "type": "idea",
  "text": "Przeczytać książkę Solaris Stanisława Lema"
}

ZASADY:

- Zachowuj istotny sens wypowiedzi.
- NIE usuwaj informacji takich jak osoba, miejsce, dokładny adres lub cel spotkania.\n- Dokładny adres lub nazwę miejsca zapisuj w polu "location", a nie tylko w tytule.\n- Dodatkowe informacje, np. cel spotkania, numer pokoju, nazwisko kontaktu lub rzecz do zabrania, zapisuj w "notes".\n- Jeśli lokalizacji lub notatki nie podano, zwróć pusty string.
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
            text: parsed.text || spokenText
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
          notes: parsed.notes || ""
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
