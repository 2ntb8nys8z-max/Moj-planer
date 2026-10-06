import fs from 'node:fs';import assert from 'node:assert/strict';
const load=async path=>(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path,'utf8')).toString('base64'))).default;
const worker=await load('worker.js');
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
const place={location:'Warszawa',candidates:[{id:'1',label:'Warszawa, Województwo mazowieckie, Polska'}],proposedId:'1'};
let model={},lastPrompt;const old=globalThis.fetch;
globalThis.fetch=async(u,o)=>{lastPrompt=JSON.parse(o.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(model)}}]}))};
async function post(text,state=null,extra={}){const response=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:JSON.stringify({text,currentItem:null,dialogueState:state,dialogue:[],...extra})}),env);assert.equal(response.status,200);return response.json()}
try{
 model={action:'choose',id:'1'};
 const comment='Teraz musi potwierdzić, czy rzeczywiście to wszystko dobrze działa, a następnie idę spać.';
 let r=await post(comment,null,{weatherContext:place});assert.equal(r.weatherAction.action,'clarify');assert.match(r.weatherAction.question,/Warszawa/);
 for(const text of ['Nie','Nie wiem','Czy Warszawa?','Muszę sprawdzić Warszawa','Wcześniej powiedziałem tak','Nie potwierdzam','Anuluj']){r=await post(text,null,{weatherContext:place});assert.equal(r.weatherAction.action,'clarify',text)}
 for(const text of ['Tak','Zgadza się','Tak, to ta miejscowość','Chodzi o Warszawa','Warszawa']){r=await post(text,null,{weatherContext:place});assert.equal(r.weatherAction.action,'choose',text);assert.equal(r.weatherAction.id,'1')}
 r=await post('Warszawa',null,{weatherContext:{...place,candidates:[...place.candidates,{id:'2',label:'Warszawa, Inny region, Polska'}]}});assert.equal(r.weatherAction.action,'clarify');
 model={action:'query',city:'Warszawa',countryCode:'PL'};r=await post(comment,null,{weatherContext:place});assert.equal(r.weatherAction.action,'clarify');
 model={action:'query',city:'Warszawa',countryCode:'PL',postcode:'03-337'};r=await post('Kod 03-337',null,{weatherContext:place});assert.equal(r.weatherAction.action,'query');
 r=await post('Zapisz tylko Wólka',null,{weatherContext:place});assert.equal(r.weatherAction.action,'raw');
 let state={draft:{type:'event'},pendingQuestion:{kind:'title'}};
 r=await post('na jutro',state);assert.equal(r.dialogueState.pendingQuestion.kind,'titleOrDate');assert.equal(r.dialogueState.draft.date,undefined);const ambiguous=r.dialogueState;
 r=await post('Tak',ambiguous);assert.equal(r.dialogueState.pendingQuestion.kind,'titleOrDate');assert.equal(r.dialogueState.draft.date,undefined);
 r=await post('Chodzi o tytuł',ambiguous);assert.equal(r.dialogueState.draft.title,'na jutro');assert.equal(r.dialogueState.pendingQuestion.kind,'date');
 r=await post('Chodzi o termin',ambiguous);assert.equal(r.dialogueState.draft.date,ambiguous.pendingQuestion.proposedDate);assert.equal(r.dialogueState.pendingQuestion.kind,'title');assert.match(r.clarification.question,/Termin mam zapisany/);
 state={draft:{type:'event',title:'Test',date:ambiguous.pendingQuestion.proposedDate},pendingQuestion:{kind:'start'}};
 r=await post('Ale to musi być jutro',state);assert.equal(r.dialogueState.draft.date,state.draft.date);assert.equal(r.dialogueState.pendingQuestion.kind,'start');assert.match(r.clarification.question,/Tak, mam zapisany termin/);
 model={type:'clarification',questionKind:'meaning',question:'Czy Na piątek to tytuł, czy termin?',operations:[]};r=await post('na piątek',{draft:{type:'event'},pendingQuestion:{kind:'title'}});assert.match(r.clarification.question,/Czy Na piątek/);
 model={type:'event',operations:[{op:'set',field:'title',value:'Dentysta'},{op:'set',field:'date',value:'2026-10-09'}]};r=await post('Nazwij Dentysta i przesuń na piątek',state);assert.equal(r.dialogueState.draft.title,'Dentysta');assert.equal(r.dialogueState.draft.date,'2026-10-09');
 assert.ok(lastPrompt.messages[0].content.includes('DOPRECYZOWANIE ZNACZENIA'));
 console.log('Dialogue 30: ungrounded model choices/queries blocked; confirmations, refusal, raw location, title/date ambiguity, date acknowledgement and multiple fields passed (mocked AI).');
}finally{globalThis.fetch=old}
