import fs from 'node:fs';import assert from 'node:assert/strict';
const load=async path=>(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path,'utf8')).toString('base64'))).default;
const worker=await load('worker.js');
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
const place={location:'Warszawa',candidates:[{id:'1',label:'Warszawa, Województwo mazowieckie, Polska'}],proposedId:'1'};
let model={},lastPrompt;const old=globalThis.fetch;
globalThis.fetch=async(u,o)=>{lastPrompt=JSON.parse(o.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(model)}}]}))};
async function post(text,state=null,extra={}){const response=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:JSON.stringify({text,currentItem:null,dialogueState:state,dialogue:[],...extra})}),env);assert.equal(response.status,200);return response.json()}
try{
 const draft={type:'event',title:'Test',date:'2026-10-08',startTime:'17:00',endTime:''};
 let state={draft,pendingQuestion:{kind:'duration'}};
 model={type:'conversation',reply:'Tak, spotkanie godzinowe potrzebuje końca. Możesz podać długość albo godzinę zakończenia.',operations:[{op:'set',field:'title',value:'NIE ZAPISUJ'}]};
 let r=await post('A musi być określony czas?',state);assert.equal(r.clarification.question,model.reply);assert.equal(r.dialogueState.pendingQuestion.kind,'duration');assert.equal(r.dialogueState.draft.title,'Test');assert.equal(r.item,undefined);
 r=await post('30 minut',r.dialogueState);assert.equal(r.item.startTime,'17:00');assert.equal(r.item.endTime,'17:30');assert.equal(r.item.date,'2026-10-08');
 state={draft:{...draft,startTime:''},pendingQuestion:{kind:'hour',field:'startTime',choices:['05:00','17:00'],question:'Która?'}};
 model={type:'conversation',reply:'Piąta może oznaczać rano albo po południu. Dlatego pytam o porę dnia.'};r=await post('Dlaczego o to pytasz?',state);assert.equal(r.clarification.question,model.reply);assert.deepEqual(r.dialogueState.pendingQuestion.choices,['05:00','17:00']);
 r=await post('po południu',r.dialogueState);assert.equal(r.dialogueState.draft.startTime,'17:00');assert.equal(r.dialogueState.pendingQuestion.kind,'duration');
 state={draft,pendingQuestion:{kind:'duration'}};model={type:'conversation',reply:'Możesz zdecydować później. Zachowuję ustalenia w tej rozmowie.'};r=await post('Muszę się zastanowić',state);assert.equal(r.clarification.question,model.reply);assert.equal(r.dialogueState.draft.date,draft.date);
 model={type:'clarification',questionKind:'duration',question:'Mamy początek o 17:00. Ile czasu chcesz na to przeznaczyć?',operations:[]};r=await post('Co teraz?',state);assert.equal(r.clarification.question,model.question);assert.equal(r.dialogueState.pendingQuestion.kind,'duration');
 model={type:'conversation',reply:''};const response=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:JSON.stringify({text:'Dlaczego?',dialogueState:state})}),env);assert.equal(response.status,502);
 assert.ok(lastPrompt.messages[0].content.includes('ROZMOWA:'));
 console.log('Conversation 31: explanations preserve draft and typed follow-up; no writes from conversation; duration/hour continuation; model wording and invalid reply checked.');
}finally{globalThis.fetch=old}
