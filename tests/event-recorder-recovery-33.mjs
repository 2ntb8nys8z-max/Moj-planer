import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

// Actual recorder -> Worker -> frontend -> next turn. Only microphone,
// transcription and model providers are controlled.
const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'))).default;
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
const nativeFetch=globalThis.fetch;
let transcript='Ustaw przypomnienie.',model={kind:'command',intent:'execute',action:'continue',reply:'Sprawdź.',operations:[],focus:'',ambiguity:null,uiAction:{type:'set_event_reminder'}},audioCalls=0;
globalThis.fetch=async url=>{
 if(String(url).includes('/audio/transcriptions')){audioCalls++;return Response.json({text:transcript})}
 return Response.json({choices:[{message:{content:JSON.stringify(model)}}]});
};
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,run=s=>vm.runInContext(s,dom.getInternalVMContext()),get=id=>w.document.getElementById(id),settle=()=>new Promise(r=>setTimeout(r,260));
const pending=[];
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,matchMedia:()=>({matches:true}),confirm:()=>true,alert(){},fetch:async()=>Response.json({})});
w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});
w.MediaRecorder=class{static isTypeSupported(){return true}state='inactive';start(){this.state='recording';this.onstart()}stop(){this.state='inactive';this.ondataavailable({data:new w.Blob(['audio'],{type:'audio/mp4'})});this.onstop()}};
w.testApi=(_path,options)=>new Promise((resolve,reject)=>pending.push({payload:JSON.parse(options.body),resolve,reject}));
async function respond(index){const request=pending[index],response=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:JSON.stringify(request.payload)}),env);assert.equal(response.status,200);request.resolve(await response.json());await settle()}
async function record(){await get('eventVoice').onclick();assert.equal(run('plannerRecordings.event.mode'),'recording');get('eventVoice').click();await settle();assert.equal(run('plannerRecordings.event.mode'),'sending')}
try{
 run(fs.readFileSync('sync-core.js','utf8'));
 for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);
 run(`plannerApiRequest=testApi;plannerAudioPayload=async()=>({base64:'YXVkaW8=',type:'audio/mp4'});showPlannerWeather=async()=>{};tasks=[{id:'one',title:'Pierwsze',date:'2026-11-06',time:'14:00',endTime:'15:00',notes:'plac Konstytucji 5, Warszawa'},{id:'two',title:'Drugie',date:'2026-11-06',time:'16:00',endTime:'17:00'}];openEventActions(tasks[0]);`);
 const toggle=w.document.querySelector('.octi-dock[data-channel=event] .action-bubble');
 await record();assert.equal(get('eventVoice').disabled,true);assert.equal(toggle.disabled,true);
 run('oldState=plannerRecordings.event;closeEventActions();openEventActions(tasks[1])');await settle();
 assert.equal(run('plannerRecordings.event'),null,'Closing a sending event releases its recorder instead of stranding the next event');
 assert.equal(get('eventVoice').disabled,false);assert.equal(toggle.disabled,false,'The plus becomes usable again');
 toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'true');toggle.click();
 await get('eventVoice').onclick();assert.equal(run('plannerRecordings.event.mode'),'recording');
 run('newState=plannerRecordings.event');
 await respond(0);
 assert.equal(run('plannerRecordings.event===newState'),true,'A late response cannot clear the new recording');
 assert.equal(run('tasks.some(t=>!!t.reminder)'),false,'A closed event never applies a late response');
 get('eventVoice').click();await settle();
 await respond(1);
 assert.match(get('eventConversation').textContent,/Ile minut przed wydarzeniem/);
 assert.equal(run('voiceDialogues.event.dialogueState.eventReminderDraft.eventId'),'two');
 transcript='15 minut przed';model={...model,uiAction:{type:'set_event_reminder',minutesBefore:15}};
 await record();assert.equal(pending[2].payload.dialogueState.pendingField,'eventReminderMinutes');assert.equal(pending[2].payload.currentItem.eventId,'two');
 await respond(2);
 assert.equal(run('tasks[1].reminder.minutesBefore'),15);assert.equal(run('tasks[0].reminder'),undefined);assert.equal(audioCalls,3,'Normalized audio crosses the actual Worker on each completed request');

 // Switching without closing has the same cleanup, including late failures.
 await record();run('openEventActions(tasks[0])');await settle();
 assert.equal(run('plannerRecordings.event'),null);assert.equal(toggle.disabled,false);
 await get('eventVoice').onclick();run('newState=plannerRecordings.event');
 pending[3].reject(Error('Late network error'));await settle();
 assert.equal(run('plannerRecordings.event===newState'),true);assert.doesNotMatch(get('eventVoiceHint').textContent,/Late network error/);
 run("cancelPlannerRecording('event')");
 console.log('Event recorder recovery: close/reopen and switch release mic/plus; late success/error preserve new audio; real Worker audio -> follow-up -> event-only reminder passed (external providers mocked).');
}finally{dom.window.close();globalThis.fetch=nativeFetch}
