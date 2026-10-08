import fs from 'node:fs';import assert from 'node:assert/strict';
const load=async path=>(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path,'utf8')).toString('base64'))).default;
const worker=await load('worker.js');
const {command,idea:ideaReply}=await import('./model-fixtures.cjs').then(x=>x.default);
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
let model={},modelCalls=0;const old=globalThis.fetch;
globalThis.fetch=async(u,o)=>{modelCalls++;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(model)}}]}))};
async function post(text,state=null,currentItem=null){const response=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:JSON.stringify({protocolVersion:2,conversationEngine:3,text,currentItem,dialogueState:state,dialogue:[]})}),env);assert.equal(response.status,200);return response.json()}
try{
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
 console.log('Conversation 33: Engine 3 opt-in, persistent draft, review readiness and proposal acceptance passed (mocked AI).');
}finally{globalThis.fetch=old}
