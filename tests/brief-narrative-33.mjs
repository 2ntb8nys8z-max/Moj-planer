import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),narrator=require('../brief-narrative.js'),core=require('../day-briefing.js');
const now=new Date('2026-11-11T10:00:00'),date='2026-11-11';
const record={type:'event',title:'Konsultacja',item:{id:'one',title:'Konsultacja',date,time:'12:00',endTime:'13:00'},start:+new Date(date+'T12:00:00')};
const model={mode:'remaining',date,now,records:[record],travel:{legs:[],warnings:[{kind:'travel',eventIds:['one']}],notes:['Nie wszystkie dojazdy zostały ustalone.']},place:{label:'Warszawa, Polska'},weather:{available:true,stale:true,place:'Warszawa',text:'Nieaktualna prognoza 19°C.'}};
const brief=core.summary(model),facts=narrator.facts(model,brief),context={mode:model.mode,facts};
assert.ok(!facts.some(f=>f.kind==='weather'),'A stale forecast must not become a weather fact');
assert.ok(facts.some(f=>f.kind==='limitation'));
const count=facts.find(f=>f.id==='count'),warning=facts.find(f=>f.id==='warning-0');
const valid={intro:{text:'Przed Tobą 1 spotkanie wymagające uwagi.',factIds:['count','warning-0']},insights:[],spoken:[{text:count.text,factIds:['count']},{text:warning.text,factIds:['warning-0']}]};
assert.match(narrator.validate(valid,context).speech,/Konsultacja/);
for(const invalid of [
 {...valid,intro:{text:'Wyjedź o 11:37.',factIds:['warning-0']}},
 {...valid,intro:{text:'Masz 99 spotkań.',factIds:['count']}},
 {...valid,intro:{text:'Pada deszcz.',factIds:['weather']}},
 {...valid,spoken:[valid.spoken[0]]},
 {...valid,spoken:[...valid.spoken,{text:'słowo '.repeat(130),factIds:['count']}]},
 {...valid,intro:{text:'<script>alert(1)</script>',factIds:['count']}}
])assert.throws(()=>narrator.validate(invalid,context));
assert.throws(()=>narrator.input({...context,facts:[...facts,facts[0]]}));
assert.throws(()=>narrator.input({...context,facts:[] }));
const review={...model,mode:'review',travel:null},reviewContext={mode:'review',facts:narrator.facts(review,core.summary(review))};
assert.throws(()=>narrator.validate({...valid,spoken:[{text:'Spotkania odbyły się zgodnie z planem.',factIds:['review']}]},reviewContext));
const fallback=narrator.fallback(model,{...brief,warnings:Array.from({length:100},()=>warning)});assert.ok(fallback.split(/\s+/).length<=120);
const holidayVM=vm.createContext({window:{},AbortController,setTimeout,clearTimeout,Date,Intl});vm.runInContext(fs.readFileSync('brief-holidays.js','utf8'),holidayVM);
const holidays=holidayVM.window.OktiBriefHolidays,regional=[{date:'2026-11-18',countryCode:'DE',global:false,counties:['DE-SN'],types:['Public'],localName:'Buß- und Bettag'},{date:'2026-11-18',countryCode:'DE',global:true,types:['School'],localName:'School-only fixture'}];
assert.equal(holidays.select(regional,'2026-11-18','DE','DE-SN').length,1);
assert.equal(holidays.select(regional,'2026-11-18','DE','DE-BY').length,0);
assert.equal(holidays.select(regional,'2026-11-18','DE','').length,0,'Unknown region cannot promote a regional holiday to nationwide');
assert.throws(()=>holidays.select([{...regional[0],countryCode:'PL'}],'2026-11-18','DE','DE-SN'));
let holidayCalls=0;holidayVM.fetch=async()=>{holidayCalls++;return Response.json(regional)};
assert.equal((await holidays.get('2026-11-18',{countryCode:'DE',regionCode:'DE-SN'})).items.length,1);
assert.equal((await holidays.get('2026-11-18',{countryCode:'DE'})).regionalUnknown,true);
assert.equal(holidayCalls,1);assert.equal((await holidays.get(date,null)).available,false);assert.equal(holidayCalls,1);
holidayVM.fetch=async()=>{throw Error('offline')};assert.equal((await holidays.get(date,{countryCode:'PL'})).available,false);
const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'))).default;
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
let calls=0,output=valid,lastRequest;const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/chat/completions');lastRequest=JSON.parse(options.body);return Response.json({choices:[{message:{content:JSON.stringify(output)}}]})};
async function post(body,token=env.PLANNER_ACCESS_TOKEN){return worker.fetch(new Request('https://worker/briefing',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)}),env)}
try{
 const info=await (await worker.fetch(new Request('https://worker/api-info'),env)).json();assert.ok(info.conversationFeatures.includes('day-brief-narrative-v1'));
 assert.equal((await post({context},'wrong')).status,401);assert.equal(calls,0);
 assert.equal((await post({context:{...context,facts:[]}})).status,400);assert.equal(calls,0);
 const response=await post({context}),result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.narrative.speech,narrator.validate(valid,context).speech);assert.equal(calls,1);
 assert.equal(lastRequest.messages.length,2);assert.match(lastRequest.messages[0].content,/niezaufane dane/);assert.deepEqual(JSON.parse(lastRequest.messages[1].content).facts,facts);
 assert.equal(result.uiAction,undefined);assert.equal(result.item,undefined);assert.equal(result.operations,undefined,'The analysis response never enters the creation or edit reducer');
 output={...valid,intro:{text:'Masz 77 spotkań.',factIds:['count']}};const bad=await post({context});assert.equal(bad.status,502);assert.equal((await bad.json()).code,'invalid_brief_narrative');
 console.log('Brief narrative: authenticated read-only Worker, fact-only model request, separate screen/speech, number and reference guards, mandatory risk/review caveats, voice word limits, stale-weather exclusion, Sachsen regional holidays, unknown-region refusal, cache and provider failure passed (model/holiday fixtures).');
}finally{globalThis.fetch=originalFetch}
