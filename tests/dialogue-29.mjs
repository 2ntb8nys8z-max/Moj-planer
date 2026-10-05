import fs from 'node:fs';import assert from 'node:assert/strict';
const src=fs.readFileSync('worker.js','utf8');const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const original={type:'event',title:'Test',date:'2026-10-06',startTime:'13:00',endTime:'13:15',notes:'',location:''};
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
let model={},calls=0;const old=globalThis.fetch;
globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(model)}}]}))};
async function post(text,currentItem=original,state=null,extra={}){const r=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:JSON.stringify({text,currentItem,dialogueState:state,dialogue:[],...extra})}),env);return {status:r.status,...await r.json()}}
const set=(field,value)=>({op:'set',field,value});
try{
model={type:'event',operations:[{op:'revert',field:'startTime'},set('endTime','15:00')]};
let r=await post('Nie od piętnastej, tylko do piętnastej',original,{draft:{...original,startTime:'15:00',endTime:'15:15'}});
// Bare fifteen is unambiguous in a 24-hour clock.
assert.equal(r.item.startTime,'13:00');assert.equal(r.item.endTime,'15:00');
model={type:'event',operations:[set('endTime','15:00')]};r=await post('do 15:00',original,{draft:{...original,title:'Nowy tytuł'}});assert.equal(r.item.title,'Nowy tytuł');
for(const question of ['Ile czasu zarezerwować?','Ile minut ma trwać?','How long?']){r=await post('piętnaście minut',original,{draft:{...original,startTime:'17:00',endTime:''},pendingQuestion:{kind:'duration',question}});assert.equal(r.item.endTime,'17:15')}
model={type:'event',operations:[set('title','Test jutra')]};r=await post('Test jutra',null,{draft:{type:'event',date:'2026-10-06'},pendingQuestion:{kind:'title'}});assert.equal(r.dialogueState.draft.date,'2026-10-06');assert.equal(r.dialogueState.pendingQuestion.kind,'start');
model={type:'event',operations:[set('startTime','15:00'),set('endTime','15:25')]};r=await post('Zmień godzinę na od trzeciej do trzeciej dwadzieścia pięć');assert.equal(r.dialogueState.pendingQuestion.kind,'hour');assert.deepEqual(r.dialogueState.pendingQuestion.choices,['03:00','15:00']);r=await post('po południu',original,r.dialogueState);assert.equal(r.item.startTime,'15:00');assert.equal(r.item.endTime,'15:25');
model={type:'event',operations:[set('endTime','03:00')]};r=await post('do 3');assert.equal(r.dialogueState.pendingQuestion.field,'endTime');
for(const h of [1,2,4,5,6,7,8,9,10,11,12]){model={type:'event',operations:[set('startTime',String(h+12>23?12:h+12).padStart(2,'0')+':00')]};r=await post('od '+h);assert.equal(r.dialogueState.pendingQuestion.kind,'hour')}
r=await post('trzynasta, trzynasta',original,{draft:original,pendingQuestion:{kind:'hour',field:'startTime',choices:['01:00','13:00'],question:'Która?'}});assert.equal(r.item.startTime,'13:00');
r=await post('Nie, zostaw',null,{draft:{...original,title:'Wydarzenie'},pendingQuestion:{kind:'title'}});assert.equal(r.item.title,'Wydarzenie');
model={type:'event',operations:[set('googleEventId','injected')]};r=await post('zmień coś');assert.equal(r.status,502);
r=await post('test',original,null,{dialogue:[null]});assert.equal(r.status,400);
console.log('Dialogue 29: revert, retained draft, typed duration, date, all ambiguous hours, choices, title opt-out, invalid data passed.');
}finally{globalThis.fetch=old;}
