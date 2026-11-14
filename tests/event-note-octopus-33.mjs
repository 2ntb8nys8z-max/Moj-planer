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
 run(`plannerApiRequest=testApi;plannerAudioPayload=async()=>({base64:'YXVkaW8=',type:'audio/mp4'});showPlannerWeather=async()=>{};tasks=[{id:'one',title:'Pierwsze',date:'2026-11-06',time:'14:00',endTime:'15:00',notes:''},{id:'two',title:'Drugie',date:'2026-11-06',time:'16:00',endTime:'17:00',notes:''}];`);
 const voice=get('eventVoice'),toggle=w.document.querySelector('.octi-dock[data-channel=event] .action-bubble');
 for(let i=0;i<2;i++){
  run(`openEventActions(tasks[${i}])`);await settle();
  const note=i?'Test kodu, który ma sprawdzić, co powoduje, że blokuje nam się oktopus po dodaniu notatki.':'Krótka notatka';
  transcript='Dodaj notatkę: '+note;
  model={reply:'Dopisuję notatkę.',kind:'idea',action:'continue',intent:'modify',operations:[],focus:'',ambiguity:null,uiAction:null,idea:{text:note,addition:note,action:'append'}};
  await record();
  const response=respond(pending.length-1);
  for(let n=0;n<100&&get('eventChangePreview').classList.contains('hidden');n++)await new Promise(r=>setTimeout(r,5));
  assert.equal(get('eventChangePreview').classList.contains('hidden'),false,'Voice note is reviewed in the open event');
  get('eventChangeConfirm').click();await response;await settle();
  assert.equal(run(`tasks[${i}].notes`),note);
  assert.equal(run(`tasks[${i}].noteCards[0].source`),'audio');
  assert.equal(run(`JSON.parse(PlannerData.storage.getItem(TASK_KEY))[${i}].notes`),note,'Note survives persistence');
  assert.equal(run('plannerRecordings.event'),null);
  assert.equal(run('octiEventRecording'),null);
  assert.equal(run('!!voiceDialogues.event?.busy'),false,'No stale busy state after save');
  assert.equal(voice.disabled,false);assert.equal(toggle.disabled,false);
  const panel=get('eventConversationPanel'),footer=get('eventFooter');
  assert.equal(panel.classList.contains('hidden'),false,'Saved note leaves its conversation visible');
  assert.ok(Number(w.getComputedStyle(footer).zIndex)>Number(w.getComputedStyle(panel).zIndex),'The animated conversation cannot take touch priority over the recorder');
  assert.equal(w.getComputedStyle(footer).pointerEvents,'none','Empty footer area still passes touches through');
  toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'true');toggle.click();
  voice.click();await settle();
  assert.equal(run('plannerRecordings.event.mode'),'recording','The same octopus starts the next recording without closing the event');
  assert.equal(get('eventRecordCancel').classList.contains('hidden'),false);
  toggle.click();await settle();assert.equal(run('plannerRecordings.event'),null,'Existing cancel bubble still cancels');
  get('closeEvent').click();assert.equal(get('eventModal').classList.contains('hidden'),true,'X still closes the event');
  run(`openEventActions(tasks[${i}])`);await settle();voice.click();await settle();
  assert.equal(run('plannerRecordings.event.mode'),'recording','Reopened event with saved note accepts recording');
  run("cancelPlannerRecording('event')");
 }
 assert.equal(audioCalls,2,'Both notes cross the actual Worker audio boundary');
 console.log('Event voice note regression: two events, short/long audio -> real Worker -> review -> persisted note -> idle state -> next octopus recording; plus/cancel/X and reopen passed (external providers mocked).');
}finally{dom.window.close();globalThis.fetch=nativeFetch}
