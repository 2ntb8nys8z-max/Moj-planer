import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
let src=fs.readFileSync('worker.js','utf8');const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const c={};vm.createContext(c);vm.runInContext(src.slice(0,src.indexOf('export default')),c);
for(const [s,n] of [['piętnaście minut',15],['No przecież powiedziałem, piętnaście minut.',15],['dwadzieścia pięć minut',25],['dwie godziny i piętnaście minut',135],['kwadrans',15],['półtorej godziny',90]])assert.equal(c.plannerDuration(s),n,s);
assert.equal(c.plannerDuration('dopisz notatkę piętnaście minut'),null);
assert.equal(c.explicitVoiceEventEdit('Nazwij to wydarzenie Spotkanie z psami. Nie, nazwij to wydarzenie Spotkanie. Nie, nazwij to wydarzenie weryfikacja lokalizacji.'),null);
assert.equal(c.explicitVoiceEventEdit('Nazwij to wydarzenie Weryfikacja lokalizacji').title,'Weryfikacja lokalizacji');
const original={type:'event',title:'Test',date:'2026-10-06',startTime:'13:00',endTime:'13:15',notes:'Zabrać dokumenty',location:'Warszawa'};
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
let model=null,calls=0,lastPrompt;
globalThis.fetch=async(u,o)=>{calls++;lastPrompt=JSON.parse(o.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(model)}}]}));};
async function post(text,currentItem=original,dialogue=[],dialogueState=null,extra={}){const r=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:JSON.stringify({text,currentItem,dialogue,dialogueState,...extra})}),env);const j=await r.json();assert.equal(r.status,200,JSON.stringify(j));return j;}
let r=await post('Zrób z tego wydarzenie całodniowe.');assert.equal(r.item.startTime,'');assert.equal(r.item.endTime,'');assert.equal(r.item.title,'Test');assert.equal(calls,0);
// First model turn proposes a new start, server validates missing end and retains draft.
model={...original,startTime:'17:00',endTime:'',changedFields:['startTime']};
r=await post('Niech się zaczyna o godzinie 17:00.',{...original,endTime:''});assert.ok(r.dialogueState);assert.equal(r.dialogueState.draft.startTime,'17:00');
const hist=[{role:'user',content:'Niech się zaczyna o godzinie 17:00.'},{role:'assistant',content:r.clarification.question}];
const n=calls;r=await post('Piętnaście minut.',{...original,endTime:''},hist,r.dialogueState);assert.equal(r.item.endTime,'17:15');assert.equal(r.item.title,'Test');assert.equal(calls,n);
// Both title and duration follow-ups retain a new event's timing.
model={type:'event',title:'Wydarzenie',date:'2026-10-06',startTime:'13:15',endTime:'13:40',timing:{dateEvidence:'we wtorek',startEvidence:'13:15',endEvidence:'13:40'}};
r=await post('Utwórz nowe wydarzenie we wtorek na 13:15 do 13:40.',null);assert.match(r.clarification.question,/nazwać/);assert.equal(r.dialogueState.draft.date,'2026-10-06');
const hist2=[{role:'user',content:'Utwórz nowe wydarzenie we wtorek na 13:15 do 13:40.'},{role:'assistant',content:r.clarification.question}];
r=await post('Nie',null,hist2,r.dialogueState);assert.equal(r.item.title,'Wydarzenie');assert.equal(r.item.endTime,'13:40');
// Model resolves a self-correction; local regex must not overwrite it.
model={...original,title:'Weryfikacja lokalizacji',changedFields:['title']};
r=await post('Nazwij to wydarzenie Spotkanie z psami. Nie, nazwij to wydarzenie Spotkanie. Nie, nazwij to wydarzenie weryfikacja lokalizacji.');assert.equal(r.item.title,'Weryfikacja lokalizacji');
r=await post('Zapisz tylko Wólka',original,[],null,{weatherContext:{location:'Wólka',candidates:[]}});assert.equal(r.weatherAction.action,'raw');
model={...original,startTime:'19:00',changedFields:['startTime']};r=await post('Przesuń początek na dziewiętnastą');assert.equal(r.item.endTime,'19:15');
console.log('Worker: duration, pending state, all-day, optional title, self-correction, raw location and duration preservation passed (model mocked).');
// Frontend helper tests. Engine 3 owns location corrections; weather resolves only after approval.
const html=fs.readFileSync('index.html','utf8');const f={URLSearchParams,Date,Set,Number,console};vm.createContext(f);
const segment=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
vm.runInContext(segment('function plannerWeatherRows','function plannerWeatherSymbol')+segment('function plannerWeatherCityQueries','async function showPlannerWeather')+segment('async function prepareVoiceLocation','async function applyVoiceDialogueResult'),f);
f.iso=d=>d.toISOString().slice(0,10);f.plannerLocationKey=v=>String(v||'').toLowerCase().trim();f.plannerWeatherLabel=p=>[p.name,p.admin1,p.country].join(', ');f.voiceDialogueValid=s=>!s.cancelled;f.showVoiceClarification=(s,q)=>s.question=q;
const times=['2026-10-06T11:00','2026-10-06T12:00','2026-10-06T13:00'];const task={date:'2026-10-06',time:''};assert.deepEqual(Array.from(f.plannerWeatherRows({time:times},task),x=>x.index),[0,1,2]);assert.equal(task.time,'');
let session={currentItem:original},result={item:{...original,location:'Wólka',changedFields:['location']}};
assert.equal(await f.prepareVoiceLocation(session,result),false);assert.equal(result.item.location,'Wólka');assert.equal(session.weatherContext,undefined);
let t={location:'Wólka'},resolved={weatherPlace:{id:1,location:'Wólka',latitude:52,longitude:21}};f.applyVoicePlaceMetadata(t,resolved);assert.equal(t.weatherPlace.id,1);
console.log('Frontend: all-day 11/12/13 and post-approval location metadata passed.');
