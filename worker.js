function explicitVoiceEventEdit(text){
  const command=String(text||'').trim().replace(/^(?:proszę|prosze)\s*,?\s*/i,'');
  const rules=[
    ['title',/^(?:zmień|zmien|ustaw|popraw|zastąp)\s+(?:nazwę|nazwe|tytuł|tytul|nagłówek|naglowek)(?:\s+(?:tego\s+)?(?:wydarzenia|spotkania))?\s*(?:na\s+|[:—-]\s*)(.+)$/i],
    ['title',/^nazwij\s+(?:(?:to|te|ten)\s+|(?:wydarzenie|spotkanie)\s+)?(.+)$/i],
    ['title',/^(?:nazwa|tytuł|tytul|nagłówek|naglowek)(?:\s+(?:tego\s+)?(?:wydarzenia|spotkania))?\s+(?:ma\s+być|ma\s+byc|powinna\s+być|powinien\s+być|to)\s+(.+)$/i],
    ['append',/^(?:dodaj|dopisz)\s+(?:(?:do|w)\s+)?(?:notatkę|notatke|notatki|notatce)(?:\s+(?:do|dla)\s+(?:tego\s+)?(?:wydarzenia|spotkania))?\s*[:—-]?\s*(.+)$/i],
    ['replace',/^(?:zmień|zmien|ustaw|zastąp)\s+(?:treść\s+)?(?:notatkę|notatke|notatki)(?:\s+(?:tego\s+)?(?:wydarzenia|spotkania))?\s*(?:na\s+|[:—-]\s*)(.+)$/i]
  ];
  if(/^(?:usuń|usun|wyczyść|wyczysc|skasuj)\s+(?:(?:tę|te|całą|cala|obecną)\s+)?(?:notatkę|notatke)[.!?]*$/i.test(command))return {changedFields:['notes'],notesAction:'clear',notes:''};
  for(const [action,pattern] of rules){
    const match=command.match(pattern);if(!match)continue;
    const value=match[1].trim();
    // Multiple operations belong to the AI interpreter, not a partial local match.
    if(/\s+(?:i|oraz)\s+(?:dodaj|dopisz|zmień|zmien|ustaw|usuń|usun)\s/i.test(value))return null;
    if(action==='title')return {changedFields:['title'],title:value};
    return {changedFields:['notes'],notesAction:action,notes:action==='replace'?value:undefined,notesAddition:action==='append'?value:undefined};
  }
  return null;
}
function appendVoiceNotes(existing,addition){return existing?existing+'\n'+addition:addition;}
function normalizeEventVoiceResult(current,parsed,transcription){
  const direct=explicitVoiceEventEdit(transcription);
  const edit=direct||parsed;
  const allowed=['title','date','startTime','endTime','notes','location','reminder','recurrence'];
  if(!Array.isArray(edit.changedFields))throw new Error('AI nie określiło pól zmiany');
  const fields=[...new Set(edit.changedFields)];
  if(fields.some(field=>!allowed.includes(field)))throw new Error('Nieprawidłowe pole zmiany');
  const result={type:'event',title:current.title,date:current.date,startTime:current.startTime||'',endTime:current.endTime||'',notes:current.notes||'',location:current.location||'',reminder:current.reminder??null,recurrence:current.recurrence??null,changedFields:fields,recurrenceAction:null};
  for(const field of fields){if(edit[field]!==undefined)result[field]=edit[field];else if(field!=='notes'||edit.notesAction!=='append')throw new Error('Brak wartości zmienianego pola');}
  if(fields.includes('notes')){
    result.notesAction=edit.notesAction||'replace';
    if(result.notesAction==='append'){
      if(typeof edit.notesAddition!=='string'||!edit.notesAddition.trim())throw new Error('Brak treści do dopisania');
      result.notesAddition=edit.notesAddition;result.notes=appendVoiceNotes(current.notes||'',edit.notesAddition);
    }else if(result.notesAction==='clear')result.notes='';
    else if(result.notesAction!=='replace')throw new Error('Nieprawidłowa operacja notatki');
  }
  if(fields.includes('recurrence'))result.recurrenceAction=edit.recurrenceAction||null;
  result.applyToSeries=parsed.applyToSeries===true;
  return result;
}
export default {
  async fetch(request, env) {

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Current-Item, X-Voice-Dialogue",
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

      let spokenText = "", dialogue = [];
      let bodyCurrent = null;
      if ((request.headers.get("Content-Type") || "").includes("application/json")) {
        const body = await request.json();
        if (typeof body.text !== "string" || body.text.length > 4000) throw new Error("Nieprawidłowa odpowiedź tekstowa");
        spokenText = body.text.trim();
        dialogue = body.dialogue || [];
        bodyCurrent = body.currentItem || null;
      } else {
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

      spokenText =
        (transcription.text || "").trim();

      }
      const dialogueHeader = request.headers.get("X-Voice-Dialogue");
      if (dialogueHeader) dialogue = JSON.parse(decodeURIComponent(dialogueHeader));
      if (!Array.isArray(dialogue) || dialogue.length > 24 || dialogue.some(m => !["user","assistant"].includes(m.role) || typeof m.content !== "string" || m.content.length > 4000)) throw new Error("Nieprawidłowy kontekst rozmowy");
      let currentItem = bodyCurrent;
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

DOPYTYWANIE — priorytet dla tworzenia oraz edycji wydarzeń i pomysłów/zadań:
Jeśli brakuje informacji koniecznej do wykonania polecenia albo nie wiadomo, jakie pole zmienić, zwróć WYŁĄCZNIE {"type":"clarification","question":"jedno konkretne krótkie pytanie po polsku"}. Nie zwracaj wtedy propozycji zmiany ani nie wykonuj części polecenia.
Historia rozmowy to to samo polecenie; następna odpowiedź uzupełnia pierwotną operację na AKTUALNYM WPISIE. Uwzględnij wszystkie wcześniejsze odpowiedzi, a changedFields i notesAddition opisują całą uzgodnioną operację, nie tylko ostatnią odpowiedź.
Nie pytaj o opcjonalne informacje ani nie wymagaj terminu dla zwykłego pomysłu/zadania. Jeśli użytkownik chce wydarzenie lub przeniesienie do kalendarza, ale nie określił daty i nie ma jej w aktualnym wpisie, zapytaj o datę. Brak godziny może oznaczać wydarzenie całodniowe.
Nie zgaduj, czy „o pierwszej” znaczy 01:00 czy 13:00; zapytaj, chyba że użytkownik wskazał porę dnia albo format 24-godzinny. Nie analizuj w ten sposób godzin będących tylko treścią notatki.
Jeśli polecenie korekty nazwy nie określa, czy chodzi o tytuł czy lokalizację, zapytaj. Wyraźne polecenie poprawienia pisowni, przeliterowanie lub „napisz po niemiecku” pozwala poprawić wskazane pole. Gdy zapis nie jest jasny, poproś o przeliterowanie. Nie twierdź, że miejscowość nie istnieje; nie masz dostępu do weryfikacji mapowej. Nie sprawdzaj każdego adresu ani nie pytaj przy jasnym poleceniu.
Przykład: „dodaj notatkę” bez treści → pytanie „Co dopisać do notatki?”; odpowiedź „Zabrać dokumenty” → zmiana notes z notesAction append, notesAddition „Zabrać dokumenty”, pozostałe pola bez zmian.

Dzisiejsza data w strefie Europe/Berlin:
${currentDate}

Jeżeli poniżej przekazano AKTUALNY WPIS, wypowiedź użytkownika jest poprawką do tego wpisu.
W takim przypadku zmień WYŁĄCZNIE informacje wskazane przez użytkownika, zachowaj wszystkie pozostałe pola i zwróć kompletny poprawiony JSON.
Nie twórz nowego wydarzenia i nie usuwaj informacji, których użytkownik nie koryguje.
PRIORYTET PRZY EDYCJI WYDARZENIA: wynik ma type event, także gdy poprawka nie zawiera daty ani godziny. Zasady tworzenia krótkiego tytułu i domyślnych pustych pól dotyczą wyłącznie NOWYCH wpisów.
Zwróć changedFields: tablicę nazw WYŁĄCZNIE pól, o których zmianę poprosił użytkownik: title, date, startTime, endTime, notes, location, reminder, recurrence. Nie dodawaj innych pól. Jeśli nie rozpoznajesz zmiany, zwróć changedFields: [].
Polecenia „nazwij to”, „zmień nazwę”, „zmień tytuł”, „ustaw nagłówek”, „tytuł ma być” to zmiana title. Zachowaj CAŁĄ podaną nazwę, nawet długą. Nie skracaj jej, nie przeredagowuj i nie przenoś fragmentów do notes. Zachowaj poprzednią notatkę.
Polecenia „dodaj notatkę”, „dopisz do notatki”, „dodaj w notatce” oznaczają notesAction: append. W notesAddition podaj WYŁĄCZNIE nową treść; nie dodawaj słów komendy ani instrukcji zakresu, np. „dla całej serii”. Notes ma być pełną notatką po dopisaniu, z zachowaniem wcześniejszej treści.
„Zmień notatkę na”, „zastąp notatkę”, „ustaw treść notatki” oznaczają notesAction: replace i notes z nową pełną treścią. „Usuń notatkę” oznacza notesAction: clear i notes: "".
NotesAction jest null i notesAddition jest null, gdy notatka nie jest zmieniana.
Przykład: aktualny title „Spotkanie”, notes „Zabrać dokumenty”; użytkownik „zmień nagłówek na Spotkanie dotyczące nowej umowy i omówienia wszystkich warunków współpracy” → changedFields: ["title"], title: pełna podana nazwa, notes: „Zabrać dokumenty”.
Przykład: użytkownik „dodaj notatkę zabrać wyniki badań” → changedFields: ["notes"], notesAction: "append", notesAddition: "zabrać wyniki badań". Zachowaj nazwę, datę, godziny, lokalizację, przypomnienie i cykliczność.
Przykład: użytkownik „zmień notatkę na przyjść dziesięć minut wcześniej” → changedFields: ["notes"], notesAction: "replace", notes: "przyjść dziesięć minut wcześniej". Nie zmieniaj godziny wydarzenia: te słowa są treścią notatki.
Przy przesuwaniu godziny i zachowaniu długości wydarzenia dodaj do changedFields startTime i endTime. Przy zmianie cykliczności dodaj recurrence. Zachowaj nietknięte wartości dokładnie jak w aktualnym wpisie, również reminder i recurrence.

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
  "notes": "wszystkie istotne szczegóły wypowiedzi poza datą, godziną, lokalizacją i krótkim tytułem",
  "location": "",
  "reminder": null,
  "recurrence": null,
  "applyToSeries": false,
  "recurrenceAction": null,
  "changedFields": [],
  "notesAction": null,
  "notesAddition": null
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
- NIE usuwaj informacji takich jak osoba, miejsce, dokładny adres lub cel spotkania.\n- Dokładny adres lub lokalizację docelową zapisuj WYŁĄCZNIE w polu "location", a nie w "notes".\n- Jeśli użytkownik podaje miejsce bez pełnego adresu, ale ma ono służyć jako cel nawigacji, również zapisz je w "location".\n- Osobę, cel spotkania i pozostałe istotne szczegóły zapisuj w "notes".\n- Nie zgaduj nazw własnych, ulic i adresów. Zachowaj zapis z transkrypcji, chyba że użytkownik wyraźnie prosi o korektę pisowni; uwzględnij wtedy podany język i literowanie.
- WAŻNE PRZY EDYCJI ISTNIEJĄCEGO WYDARZENIA: jeśli użytkownik mówi „dodaj lokalizację ...”, „dodaj adres ...”, „ustaw lokalizację ...”, „zmień adres na ...” lub podobnie, jest to bezpośrednie polecenie zmiany pola "location". Wpisz do "location" wszystko, co użytkownik podał po takim poleceniu, zachowując pozostałe pola bez zmian.
- Przykład: AKTUALNY WPIS jest wydarzeniem, użytkownik mówi „dodaj lokalizację Lublin” → zachowaj pozostałe pola i ustaw "location":"Lublin".
- Przykład: użytkownik mówi „dodaj adres Warszawa, Wyszogrodzka 1” → ustaw "location":"Warszawa, Wyszogrodzka 1".
- Jeśli AKTUALNY WPIS ma już location i użytkownik NIE mówi nic o lokalizacji, adresie ani miejscu, zachowaj istniejące location. Nie zamieniaj go na pusty string.\n- Przy tworzeniu NOWEGO wpisu: jeśli lokalizacji lub notatki nie podano, zwróć pusty string. Przy edycji zachowaj istniejące wartości, chyba że użytkownik każe je usunąć.\n- Jeśli użytkownik prosi o przypomnienie, ustaw "reminder": {"minutesBefore": liczba_minut}. Przykład: "15 minut wcześniej" = 15, "godzinę wcześniej" = 60, "dwie godziny wcześniej" = 120.\n- Przy NOWYM wpisie bez prośby o przypomnienie ustaw "reminder": null. Przy EDYCJI bez zmiany przypomnienia zachowaj obecne reminder i nie dodawaj reminder do changedFields.
- Jeśli wydarzenie ma się powtarzać, ustaw "recurrence" jako:
  {"frequency":"daily|weekly|monthly","interval":1,"until":"YYYY-MM-DD","count":null}
- "co tydzień" = weekly / interval 1; "co dwa tygodnie" = weekly / interval 2; "codziennie" = daily; "co miesiąc" = monthly.
- Jeśli użytkownik mówi "przez dwa miesiące", "przez 6 tygodni" itp., oblicz konkretną datę końcową i wpisz ją w "until".
- Jeśli mówi "5 razy", ustaw count=5 i until=null.
- Pole "date" dla serii oznacza datę pierwszego wystąpienia. Jeśli mówi np. "w każdy czwartek", wyznacz najbliższy przyszły czwartek jako pierwszą datę.
- Przy NOWYM wpisie bez cykliczności ustaw "recurrence": null. Przy EDYCJI bez zmiany cykliczności zachowaj obecną recurrence.
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

- Przy NOWYM wpisie bez końca ani czasu trwania: endTime = "". Przy EDYCJI bez zmiany czasu zachowaj endTime.

- Przy NOWYM wpisie bez godziny: startTime = "". Przy EDYCJI bez zmiany czasu zachowaj startTime.

- Jeżeli AKTUALNY WPIS ma type "idea", traktuj wypowiedź jako operację na tym konkretnym pomyśle.
- Dla istniejącego pomysłu przy zwykłej edycji pole "text" jest jego pełną treścią po zmianie.
- Gdy użytkownik mówi "dopisz", "dodaj do tego", "uzupełnij" lub podobnie, NIE PRZEREDAGOWUJ ani nie zwracaj zmienionej wcześniejszej treści. Ustaw "action":"append" i w polu "addition" zwróć WYŁĄCZNIE nową informację do dopisania. Pole "text" pozostaw dokładnie takie jak w AKTUALNYM WPISIE.
- Gdy użytkownik mówi "zmień", "popraw", "usuń fragment" lub podobnie, ustaw "action":"replace", "addition":null, zmodyfikuj tylko wskazany fragment w polu "text" i zachowaj resztę.
- WAŻNE: jeśli użytkownik poprawia istniejący pomysł i mówi „popraw na ...”, „zmień na ...”, „tytuł ma być ...”, „miało być ...” lub podobnie, potraktuj tekst po tej komendzie jako NOWĄ PEŁNĄ TREŚĆ pomysłu. Nie próbuj zachowywać błędnie rozpoznanej wcześniejszej treści.
- Przykład: AKTUALNY WPIS = {"type":"idea","text":"Działać normalną test kandydacji"}, użytkownik mówi „popraw na test lokalizacji” → {"type":"idea","text":"Test lokalizacji","action":"replace","addition":null}.
- Dla nowego pomysłu ustaw "action":"replace" i "addition":null.
- Gdy użytkownik każe przenieść, wpisać, dodać lub zamienić TEN POMYSŁ na wydarzenie w kalendarzu i podaje termin, zwróć type "event". Użyj treści aktualnego pomysłu do utworzenia krótkiego sensownego title, zachowaj istotne szczegóły w notes i ustaw podaną datę/godzinę. Nie wymagaj, aby użytkownik powtarzał treść pomysłu.
- Przykład: AKTUALNY WPIS = {"type":"idea","text":"Sprawdzić nowego dentystę na Mokotowie"}, użytkownik mówi "przenieś to do kalendarza jutro na 15" → zwróć event na jutro 15:00 dotyczący sprawdzenia dentysty.
- Jeśli przy istniejącym pomyśle użytkownik nie prosi o przeniesienie do kalendarza, wynik ma pozostać type "idea".

- Jeżeli NOWA wypowiedź nie ma konkretnego terminu i jest rzeczą do zapamiętania, klasyfikuj ją jako "idea". EDYCJA aktualnego wydarzenia pozostaje event.

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

              ...dialogue,
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
      if (parsed.type === "clarification") {
        if (typeof parsed.question !== "string" || !parsed.question.trim() || parsed.question.length > 500) throw new Error("Nieprawidłowe pytanie AI");
        return json({success:true, transcription:spokenText, clarification:{question:parsed.question.trim()}});
      }
      if (parsed.type === "event" && !parsed.date && !currentItem?.date) {
        return json({success:true, transcription:spokenText, clarification:{question:"Na jaki dzień zapisać to wydarzenie?"}});
      }
      const operationText = dialogue.filter(m => m.role === "user").map(m => m.content).concat(spokenText).join("\n");


      /* ===== 5. ODPOWIEDŹ ===== */

      if (parsed.type === "idea" && currentItem?.type !== "event") {

        return json({
          success: true,
          transcription: operationText,

          item: {
            type: "idea",
            text: parsed.text || spokenText,
            action: parsed.action || "replace",
            addition: parsed.addition || null
          }
        });
      }


      const eventResult=currentItem?.type==='event'?normalizeEventVoiceResult(currentItem,parsed,dialogue.length ? "" : spokenText):parsed;
      return json({
        success: true,
        transcription: operationText,

        item: {
          type: "event",
          title: eventResult.title || spokenText,
          date: eventResult.date || "",
          startTime: eventResult.startTime || "",
          endTime: eventResult.endTime || "",
          notes: eventResult.notes || "",
          location: eventResult.location || "",
          reminder: eventResult.reminder || null,
          recurrence: eventResult.recurrence || null,
          applyToSeries: eventResult.applyToSeries === true,
          recurrenceAction: eventResult.recurrenceAction || null,
          ...(currentItem?.type==='event'?{changedFields:eventResult.changedFields,notesAction:eventResult.notesAction||null,notesAddition:eventResult.notesAddition||null}:{})
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


