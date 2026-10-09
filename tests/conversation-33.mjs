import fs from 'node:fs';import assert from 'node:assert/strict';
const load=async path=>(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path,'utf8')).toString('base64'))).default;
const worker=await load('worker.js');
const {command,idea:ideaReply}=await import('./model-fixtures.cjs').then(x=>x.default);
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
let model={},modelCalls=0;const old=globalThis.fetch;
globalThis.fetch=async(u,o)=>{modelCalls++;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(model)}}]}))};
async function post(text,state=null,currentItem=null){const response=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:JSON.stringify({protocolVersion:2,conversationEngine:3,text,currentItem,dialogueState:state,dialogue:[]})}),env);assert.equal(response.status,200);return response.json()}
try{
 const entry={type:'idea',text:'Pomysł na drony',list:{type:'shopping',items:[{text:'chleb',done:false}]}};
 for(const action of [{type:'set_entry_deadline'},{type:'set_entry_deadline',date:'2026-10-10'},{type:'set_entry_deadline',date:'2026-10-10',startTime:'17:00'}]){
  model={reply:'Sprawdź termin.',kind:'command',intent:'execute',operations:[],focus:'',ambiguity:null,uiAction:action};
  const result=await post('Ustal termin',null,entry);assert.equal(result.status,'command');assert.deepEqual(result.uiAction,action);
 }
 model={reply:'Przypomnienie przygotowane.',kind:'command',intent:'execute',operations:[],focus:'',ambiguity:null,uiAction:{type:'set_entry_reminder',date:'2026-10-10',startTime:'17:00',message:'Kupić mleko'}};
 const reminder=await post('Przypomnij mi jutro o 17:00, żeby kupić mleko.',null,entry);assert.equal(reminder.status,'command');assert.deepEqual(reminder.uiAction,{type:'set_entry_reminder',date:'2026-10-10',startTime:'17:00',message:'Kupić mleko'});
 const standaloneReminder=await post('Przypomnij mi jutro o 17:00, żeby kupić mleko.',null,null);assert.equal(standaloneReminder.status,'command');assert.equal(standaloneReminder.uiAction.type,'set_entry_reminder');

 // Partial reminder turns must retain a structured draft, including custom saved content.
 const alarmEntry={type:'idea',title:'List',text:'List',alarm:{date:'2026-11-07',time:'09:00',message:'Wyślij polecony'}};
 const reminderAnswer=(fields,intent='execute')=>({reply:'Sprawdź powiadomienie.',kind:'command',intent,operations:[],focus:'',ambiguity:null,uiAction:{type:'set_entry_reminder',...fields}});
 model=reminderAnswer({startTime:'13:00'},'modify');
 const edited=await post('Zmień godzinę na 13',null,alarmEntry);
 assert.equal(edited.status,'command');
 assert.equal(edited.uiAction.date,'2026-11-07');
 assert.equal(edited.uiAction.message,'Wyślij polecony');
 for(const current of [entry,null]){
  model=reminderAnswer({date:'2026-11-08',message:'Kup mleko'});
  const day=await post('Przypomnij w niedzielę',null,current);
  model={reply:'Tak, to jednorazowe powiadomienie.',kind:'idea',intent:'continue',operations:[],focus:'godzina',ambiguity:null,idea:null};
  const aside=await post('Czy to jednorazowe?',day.dialogueState,current);
  assert.equal(aside.dialogueState.reminderDraft.date,'2026-11-08');
  model=reminderAnswer({startTime:'18:00',date:null,message:null},'modify');
  const hour=await post('O 18',aside.dialogueState,current);
  assert.equal(hour.status,'command');
  assert.equal(hour.uiAction.date,'2026-11-08');
  assert.equal(hour.uiAction.message,'Kup mleko');
  assert.equal(hour.uiAction.startTime,'18:00');
  model=reminderAnswer({date:'2026-11-09'},'modify');
  const correction=await post('Jednak w poniedziałek',hour.dialogueState,current);
  assert.equal(correction.uiAction.startTime,'18:00');
  assert.equal(correction.uiAction.date,'2026-11-09');
 }
 model={reply:'Nowa nazwa.',kind:'idea',intent:'execute',operations:[],focus:'',ambiguity:null,idea:{type:'idea',action:'rename',text:'Projekt drona'}};
 const rename=await post('Zmień nazwę',null,entry);assert.equal(rename.status,'review');assert.equal(rename.item.action,'rename');
 model={reply:'Zastąp produkty.',kind:'idea',intent:'execute',operations:[],focus:'',ambiguity:null,idea:{type:'idea',text:'Pomysł na drony',listAction:'replace',replaceExisting:true,items:['kawa']}};
 const replace=await post('Zastąp całą listę kawą',null,entry);assert.equal(replace.item.replaceExisting,true);

 model={reply:'Ustalam nazwę.',kind:'event',action:'continue',intent:'execute',proposalId:null,operations:[{op:'set',field:'title',value:'Dentysta'}],focus:'termin i godziny',ambiguity:null};
 let r=await post('Nazwij Dentysta');assert.equal(r.engine,3);assert.equal(r.status,'continue');assert.equal(r.dialogueState.draft.title,'Dentysta');assert.match(r.reply,/Zmiana jest w szkicu/);
 model={reply:'Ustalam termin i godziny.',kind:'event',action:'continue',intent:'modify',proposalId:null,operations:[{op:'set',field:'date',value:'2026-10-08'},{op:'set',field:'startTime',value:'15:00'},{op:'set',field:'endTime',value:'15:45'}],focus:'',ambiguity:null};
 r=await post('Jutro od 15 do 15:45',r.dialogueState);assert.equal(r.status,'review');assert.equal(r.item.title,'Dentysta');assert.equal(r.item.startTime,'15:00');
 model={reply:'Przygotowałem wydarzenie do północy.',kind:'event',action:'review',intent:'execute',proposalId:null,operations:[{op:'set',field:'title',value:'Kolacja'},{op:'set',field:'date',value:'2026-10-08'},{op:'set',field:'startTime',value:'23:00'},{op:'set',field:'endTime',value:'00:00'}],focus:'',ambiguity:null};
 r=await post('Kolacja dziś od 23:00 do północy.');assert.equal(r.status,'review');assert.equal(r.item.endTime,'00:00');assert.equal(r.item.endDate,'2026-10-09');
 model={reply:'Wyliczyłem koniec spotkania.',kind:'event',action:'review',intent:'modify',proposalId:null,operations:[{op:'set',field:'startTime',value:'23:30'},{op:'set',field:'durationMinutes',value:30}],focus:'',ambiguity:null};
 r=await post('Zacznij o 23:30 i zarezerwuj pół godziny.',{engine:3,revision:1,draft:{type:'event',title:'Kolacja',date:'2026-10-08'}});assert.equal(r.status,'review');assert.equal(r.item.endTime,'00:00');assert.equal(r.item.endDate,'2026-10-09');
 const overnight={type:'event',title:'Kolacja',date:'2026-10-08',startTime:'23:00',endTime:'23:30',endDate:'2026-10-08'};
 model={reply:'Zmieniłem godzinę zakończenia.',kind:'event',action:'review',intent:'modify',proposalId:null,operations:[{op:'set',field:'endTime',value:'00:00'}],focus:'',ambiguity:null};
 r=await post('Przesuń koniec na północ.',null,overnight);assert.equal(r.status,'review');assert.equal(r.item.endDate,'2026-10-09');assert.ok(r.item.changedFields.includes('endDate'));
 model={reply:'Może Zielona Góra?',kind:'event',action:'continue',intent:'propose',proposalId:null,operations:[{op:'set',field:'location',value:'Zielona Góra'}],focus:'potwierdzenie lokalizacji',ambiguity:null};
 const original={type:'event',title:'Test',date:'2026-10-08',startTime:'15:00',endTime:'15:45',location:''};
 r=await post('Może Zielona Góra',null,original);assert.equal(r.status,'continue');assert.ok(r.dialogueState.pendingProposal?.id);assert.equal(r.dialogueState.draft.location,'Zielona Góra');
 const pid=r.dialogueState.pendingProposal.id;
 model={reply:'Tak.',kind:'event',action:'continue',intent:'accept',proposalId:pid,operations:[],focus:'',ambiguity:null};
 r=await post('Tak',r.dialogueState,original);assert.equal(r.status,'review');assert.equal(r.item.location,'Zielona Góra');

 model={reply:'Przygotowałem listę zakupów.',kind:'idea',action:'continue',intent:'execute',proposalId:null,operations:[],focus:'',ambiguity:null,uiAction:null,idea:{type:'idea',text:'Lista zakupów',action:'replace',addition:null,listAction:'replace',items:['jajka','awokado','chleb','masło','kefir','pomidory']}};
 r=await post('Zrób mi listę zakupów. Potrzebuję kupić jajka, awokado, chleb, masło, kefir, pomidory.');assert.equal(r.status,'review');assert.equal(r.item.type,'idea');assert.deepEqual(r.item.items.slice(0,2),['jajka','awokado']);
 model={reply:'Przygotowałem pustą listę zakupów.',kind:'idea',action:'continue',intent:'execute',proposalId:null,operations:[],focus:'',ambiguity:null,uiAction:null,idea:{type:'idea',text:'Lista zakupów',action:'replace',addition:null,listAction:'replace',items:[]}};
 r=await post('Utwórz pustą listę zakupów.');assert.equal(r.status,'review');assert.equal(r.item.listAction,'replace');assert.deepEqual(r.item.items,[]);

 // Explicit task titles are complete tasks and skip the idea/calendar clarification loop.
 model={reply:'Pytanie testowe powinno zostać zastąpione regułą deterministyczną.',kind:'event',action:'continue',intent:'continue',proposalId:null,operations:[],focus:'',ambiguity:null};
 model=ideaReply('Test 33.6');r=await post('Utwórz mi task pod tytułem Test 33.6.');assert.equal(r.status,'review');assert.equal(r.item.type,'idea');assert.equal(r.item.entryType,undefined);assert.equal(r.item.text,'Test 33.6');
 // Creation-date list requests become typed list actions instead of a single-entry search.
 model=command({type:'list_entries',scope:'entries',createdOn:'today'});r=await post('Pokaż mi pomysły, które dzisiaj utworzyłem.');assert.equal(r.status,'command');assert.deepEqual(r.uiAction,{type:'list_entries',scope:'entries',createdOn:'today'});
 model=command({type:'list_entries',scope:'entries',createdOn:'today'});r=await post('Pokaż mi pomysły z dnia dzisiejszego.');assert.equal(r.status,'command');assert.deepEqual(r.uiAction,{type:'list_entries',scope:'entries',createdOn:'today'});
 model=command({type:'list_entries',scope:'entries',createdOn:'today'});r=await post('Wymień wszystkie wpisy utworzone dzisiaj.');assert.equal(r.status,'command');assert.deepEqual(r.uiAction,{type:'list_entries',scope:'entries',createdOn:'today'});
 model=command({type:'list_entries',scope:'calendar',createdOn:'today',scheduledOn:new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Berlin'})});r=await post('Pokaż wydarzenia z dnia dzisiejszego, utworzone w dniu dzisiejszym.');assert.equal(r.status,'command');assert.deepEqual(r.uiAction,{type:'list_entries',scope:'calendar',createdOn:'today',scheduledOn:new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Berlin'})});
 const tomorrow=new Date(new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Berlin'})+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);const tomorrowIso=tomorrow.toISOString().slice(0,10);
 model=command({type:'list_entries',scope:'calendar',scheduledOn:tomorrowIso});r=await post('Pokaż wydarzenia zaplanowane na jutro.');assert.equal(r.status,'command');assert.deepEqual(r.uiAction,{type:'list_entries',scope:'calendar',scheduledOn:tomorrowIso});
 model=command({type:'find_free_time',date:tomorrowIso});r=await post('Pokaż mi wolny czas jutro.');assert.equal(r.status,'command');assert.deepEqual(r.uiAction,{type:'find_free_time',date:tomorrowIso});
 model=command({type:'list_entries',scope:'entries',createdOn:'today'});r=await post('Pokaż mi dzisiaj utworzone zadania.');assert.equal(r.status,'command');assert.deepEqual(r.uiAction,{type:'list_entries',scope:'entries',createdOn:'today'});
 model=command({type:'list_entries',scope:'calendar',createdOn:'today'});r=await post('Pokaż wydarzenia w kalendarzu utworzone dzisiaj.');assert.equal(r.status,'command');assert.deepEqual(r.uiAction,{type:'list_entries',scope:'calendar',createdOn:'today'});

 // A clear shopping-list rename must not be turned into an incomplete calendar event, when the model identifies an entry rename.
 model={reply:'Ustalam nazwę wydarzenia.',kind:'event',action:'continue',intent:'modify',proposalId:null,operations:[{op:'set',field:'title',value:'Lista zakupów'}],focus:'termin i godziny',ambiguity:null};
 model=ideaReply('Lista zakupów');r=await post('Zmień nazwę na lista zakupów.',{engine:3,revision:1,draft:{type:'event',title:'Wydarzenie'},pendingProposal:null});assert.equal(r.status,'review');assert.equal(r.item.type,'idea');assert.equal(r.item.text,'Lista zakupów');assert.doesNotMatch(r.reply,/dzień wydarzenia|godzina rozpoczęcia/);
 const existingShoppingIdea={type:'idea',text:'Zakupy',list:{type:'shopping',items:[{id:'1',text:'mleko',done:false}]},additions:[]};
 model=ideaReply('Lista zakupów');r=await post('Zmień nazwę na lista zakupów.',null,existingShoppingIdea);assert.equal(r.status,'review');assert.equal(r.item.type,'idea');assert.equal(r.item.text,'Lista zakupów');assert.equal(r.item.listAction,undefined);

 const idea={type:'idea',text:'Wyjazd',additions:[]};
 model={reply:'Dodaję lokalizację jako dopisek.',kind:'idea',action:'continue',intent:'modify',proposalId:null,operations:[],focus:'',ambiguity:null,uiAction:null,idea:{type:'idea',text:'Wyjazd',action:'append',addition:'Lokalizacja: Czechowice-Dziedzice, Polska'}};
 r=await post('Dodaj lokalizację Czechowice-Dziedzice w Polsce.',null,idea);assert.equal(r.status,'review');assert.equal(r.item.action,'append');assert.equal(r.item.addition,'Lokalizacja: Czechowice-Dziedzice, Polska');

 model={reply:'Otwieram tworzenie nowego wydarzenia.',kind:'command',action:'continue',intent:'execute',proposalId:null,operations:[],focus:'',ambiguity:null,uiAction:{type:'open_create_event',query:null}};
 r=await post('Otwórz nowe wydarzenie.');assert.equal(r.status,'command');assert.deepEqual(r.uiAction,{type:'open_create_event',query:null});assert.equal(r.item,undefined);
 model={reply:'Przygotowuję formularz wydarzenia.',kind:'command',action:'continue',intent:'execute',proposalId:null,operations:[],focus:'',ambiguity:null,uiAction:{type:'open_create_event',query:'Spotkanie o wynajmie mieszkania',date:'2026-10-09'}};
 r=await post('Utwórz spotkanie o wynajmie mieszkania 9 października.');assert.equal(r.status,'command');assert.deepEqual(r.uiAction,{type:'open_create_event',query:'Spotkanie o wynajmie mieszkania',date:'2026-10-09'});

 model={reply:'Szukam spotkania z Zosią.',kind:'command',action:'continue',intent:'execute',proposalId:null,operations:[],focus:'',ambiguity:null,uiAction:{type:'open_event',query:'Spotkanie z Zosią'}};
 model=command({type:'find_entry',query:'spotkanie z Zosią',scope:'calendar'});r=await post('Otwórz spotkanie z Zosią.');assert.equal(r.status,'command');assert.deepEqual(r.uiAction,{type:'find_entry',query:'spotkanie z Zosią',scope:'calendar'});

 model={reply:'Szukam spotkania z Wojtkiem z 9 października.',kind:'command',action:'continue',intent:'execute',proposalId:null,operations:[],focus:'',ambiguity:null,uiAction:{type:'find_entry',query:'spotkanie z Wojtkiem',entryType:'event',date:'2026-10-09'}};
 model=command({type:'find_entry',query:'spotkanie z Wojtkiem',scope:'calendar',scheduledOn:'2026-10-09'});r=await post('Znajdź spotkanie z Wojtkiem 9 października.');assert.equal(r.status,'command');assert.deepEqual(r.uiAction,{type:'find_entry',query:'spotkanie z Wojtkiem',scope:'calendar',scheduledOn:'2026-10-09'});
 model={reply:'Nie mogę teraz wyświetlić listy.',kind:'event',action:'continue',intent:'continue',proposalId:null,operations:[],focus:'',ambiguity:null};
 model=command({type:'find_entry',query:'Masaż pleców',scope:'entries'});r=await post('Pokaż zadanie Masaż pleców.');assert.equal(r.status,'command');assert.deepEqual(r.uiAction,{type:'find_entry',query:'Masaż pleców',scope:'entries'});

 // Engine 3 must receive short turns before legacy Engine 2 shortcuts.
 for(const test of [
  {text:'Jutro',operations:[{op:'set',field:'date',value:'2026-10-08'}]},
  {text:'Od 15:00 do 16:00',operations:[{op:'set',field:'startTime',value:'15:00'},{op:'set',field:'endTime',value:'16:00'}]},
  {text:'Zrób z tego wydarzenie całodniowe.',operations:[{op:'clear',field:'startTime'},{op:'clear',field:'endTime'}]}
 ]){
  model={reply:'Wprowadzam zmianę.',kind:'event',action:'continue',intent:'modify',proposalId:null,operations:test.operations,focus:'',ambiguity:null};
  const before=modelCalls,short=await post(test.text,null,original);assert.equal(short.engine,3);assert.equal(modelCalls,before+1);
 }
 // A follow-up answer may correct only the missing end time. Model-generated
 // clears of the already agreed title/date/start must not reset the creation draft.
 let creationState={engine:3,mode:'create',revision:0,draft:{type:'event',title:'Do exercise',date:'2026-10-10',startTime:'20:00',endTime:''},pendingField:'endTime'};
 model={reply:'Ustawiłem koniec na 23:00.',kind:'event',action:'continue',intent:'modify',proposalId:null,operations:[{op:'set',field:'endTime',value:'23:00'},{op:'clear',field:'title'},{op:'clear',field:'date'},{op:'clear',field:'startTime'}],focus:'',ambiguity:null};
 let retained=await post('Tak, do dwudziestej trzeciej.',creationState===null?null:creationState,null);assert.equal(retained.status,'review');assert.equal(retained.item.title,'Do exercise');assert.equal(retained.item.date,'2026-10-10');assert.equal(retained.item.startTime,'20:00');assert.equal(retained.item.endTime,'23:00');
 creationState=retained.dialogueState;
 model={reply:'Poprawiłem koniec na 20:30.',kind:'event',action:'continue',intent:'modify',proposalId:null,operations:[{op:'set',field:'endTime',value:'20:30'},{op:'clear',field:'title'},{op:'clear',field:'date'},{op:'clear',field:'startTime'}],focus:'',ambiguity:null};
 retained=await post('Nie, do 20:30.',creationState);assert.equal(retained.status,'review');assert.equal(retained.item.title,'Do exercise');assert.equal(retained.item.date,'2026-10-10');assert.equal(retained.item.startTime,'20:00');assert.equal(retained.item.endTime,'20:30');
 console.log('Conversation 33: Engine 3 opt-in, persistent draft, review readiness and proposal acceptance passed (mocked AI).');
}finally{globalThis.fetch=old}
