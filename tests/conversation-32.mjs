import fs from 'node:fs';import assert from 'node:assert/strict';
const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'))).default;
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
let queue=[],requests=[];const old=globalThis.fetch;
globalThis.fetch=async(u,o)=>{requests.push(JSON.parse(o.body));assert.ok(queue.length,'Unexpected extra model call');const v=queue.shift();return new Response(JSON.stringify({choices:[{message:{content:typeof v==='string'?v:JSON.stringify(v)}}]}))};
const answer=(reply,operations=[],action='continue',extra={})=>({reply,operations,action,kind:'event',focus:'Długość spotkania',ambiguity:null,...extra});
const set=(field,value)=>({op:'set',field,value});
async function post(text,state={},original=null,lastOperation=null){const response=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:JSON.stringify({conversationEngine:3,text,dialogueState:state,currentItem:original,lastOperation,dialogue:[]})}),env);const r=await response.json();assert.equal(response.status,200,JSON.stringify(r));assert.equal(r.engine,3);return r;}
try{
 let state={};
 // Four turns with no required answer: context persists and every utterance reaches AI.
 queue=[answer('Jak nazwać to spotkanie?',[set('date','2026-10-09')]),answer('Co masz na myśli przez tę nazwę?',[]),answer('Tak, możemy ustalić godzinę później.',[]),answer('Jaką godzinę wybierasz?',[set('title','Test rozmowy')])];
 for(const text of ['Utwórz za trzy dni','Muszę się zastanowić','Czy godzinę można podać potem?','Nazwij Test rozmowy']){const r=await post(text,state);assert.equal(r.status,'continue');assert.equal(r.item,undefined);state=r.dialogueState;assert.equal(state.draft.date,'2026-10-09');}
 assert.equal(requests.length,4);assert.equal(state.draft.title,'Test rozmowy');
 queue=[answer('Pierwsza w nocy czy trzynasta?',[], 'continue',{ambiguity:{field:'startTime',choices:['01:00','13:00']}}),answer('Wieczorem to inna pora niż trzynasta. O której?',[],'continue',{ambiguity:{field:'startTime',choices:['01:00','13:00']}}),answer('Mamy 17:00. Ile czasu przeznaczamy?',[set('startTime','17:00')])];
 for(const text of ['O pierwszej','Wieczorem','Jednak o siedemnastej']){const r=await post(text,state);assert.equal(r.item,undefined);state=r.dialogueState;}
 assert.equal(state.draft.startTime,'17:00');
 queue=[answer('Do rezerwacji czasu potrzebujemy końca; możesz podać długość.'),answer('Czy chcesz zarezerwować całe półtorej dnia, czy dopiero oceniasz?'),answer('Rozumiem, możemy ustalić długość po omówieniu szczegółów.')];
 for(const text of ['A musi być określony czas?','Może nawet półtorej dnia','Jeszcze nie wiem']){const before=JSON.stringify(state.draft);const r=await post(text,state);assert.equal(JSON.stringify(r.dialogueState.draft),before);assert.equal(r.item,undefined);state=r.dialogueState;}
 queue=[answer('Przygotowałem podgląd półgodzinnego spotkania.',[set('durationMinutes',30)],'review')];let r=await post('No dobra, trzydzieści minut',state);assert.equal(r.item.endTime,'17:30');assert.equal(r.item.title,'Test rozmowy');assert.equal(r.item.date,'2026-10-09');
 // Arbitrary duration is data, not a regex matching Polish surface forms.
 state={draft:{type:'event',title:'Siedem godzin',date:'2026-10-09',startTime:'13:00',endTime:''}};
 queue=[answer('Zakres do sprawdzenia: 13:00–20:00.',[set('durationMinutes',420)],'review')];r=await post('No dobra, jakieś siedem godzin',state);assert.equal(r.item.endTime,'20:00');
 // Unsupported operation is repaired without partially applying its valid sibling.
 queue=[answer('Błędna propozycja',[set('title','NIE WOLNO'),set('duration',420)],'review'),answer('Sprawdź zakres 13:00–20:00.',[set('durationMinutes',420)],'review')];r=await post('Siedem godzin',state);assert.equal(r.item.title,'Siedem godzin');assert.equal(r.item.endTime,'20:00');assert.match(JSON.stringify(requests.at(-1)),/invalid_or_duplicate_operation/);
 queue=[answer('36 godzin',[set('durationMinutes',2160)],'review'),answer('Zapis zakresu przez kilka dni nie jest jeszcze dostępny. Ustalenia pozostają w tej rozmowie.')];r=await post('Zarezerwuj półtorej dnia',state);assert.equal(r.item,undefined);assert.equal(r.dialogueState.draft.endTime,'');assert.match(JSON.stringify(requests.at(-1)),/multi_day_write_not_supported/);
 // Invalid responses fail closed after two attempts and their failure is visible next turn.
 queue=['not json',answer('bad',[set('googleEventId','attack')],'review')];r=await post('Zmień',state);assert.equal(r.item,undefined);assert.equal(r.dialogueState.lastOperation.status,'failed');assert.equal(r.dialogueState.draft.title,state.draft.title);
 queue=[answer('Poprzednia próba się nie udała. Nie mam potwierdzenia zapisu.')];r=await post('Masz problem techniczny?',r.dialogueState);assert.match(JSON.stringify(requests.at(-1)),/failed/);
 // Incomplete review becomes a natural follow-up, not a hardcoded question.
 queue=[answer('Gotowe',[],'review'),answer('O której ma się zakończyć to spotkanie?')];r=await post('To wszystko',state);assert.equal(r.status,'continue');assert.equal(r.reply,'O której ma się zakończyć to spotkanie?');
 // Edits preserve unrelated fields, and all-day is an operation, not speech heuristics.
 const original={type:'event',title:'Oryginał',date:'2026-10-09',startTime:'13:00',endTime:'14:00',notes:'ważne',location:'Warszawa'};
 queue=[answer('Sprawdź przesunięcie na 15:00–16:00.',[set('startTime','15:00')],'review')];r=await post('Przesuń na piętnastą',{},original);assert.equal(r.item.endTime,'16:00');assert.equal(r.item.notes,'ważne');assert.deepEqual(r.item.changedFields,['startTime','endTime']);
 queue=[answer('Sprawdź wydarzenie całodniowe.',[set('allDay',true)],'review')];r=await post('Usuń godziny',{},original);assert.equal(r.item.startTime,'');assert.equal(r.item.endTime,'');assert.equal(r.item.title,original.title);
 // Every partial turn validates values, not just final save.
 queue=[answer('bad',[set('date','2026-02-30')]),answer('Który dzień masz na myśli?')];r=await post('30 lutego',{},original);assert.equal(r.dialogueState.draft.date,original.date);
 // Rejected non-positive, overnight, and conflicting durations never create a preview.
 for(const ops of [[set('durationMinutes',0)],[set('durationMinutes',800)],[set('durationMinutes',30),set('endTime','18:00')],[set('allDay',true),set('startTime','15:00')]]){queue=[answer('bad',ops,'review'),answer('Doprecyzujmy zakres.')];r=await post('Zmień',{},original);assert.equal(r.item,undefined);assert.equal(r.dialogueState.draft.startTime,'13:00');}
 queue=[answer('Sprawdź nowy tytuł.',[set('title','Nowy tytuł')],'review')];r=await post('Zmień tytuł',{}, {...original,startTime:'23:00',endTime:'01:00'});assert.deepEqual(r.item.changedFields,['title']);
 assert.equal(queue.length,0);
 console.log('Conversation 32: multi-turn discussion; every turn to AI; draft preservation; semantic ambiguity; duration; atomic repair; invalid output; operation feedback; edits; all-day; date validation. Mock model only.');
}finally{globalThis.fetch=old}
