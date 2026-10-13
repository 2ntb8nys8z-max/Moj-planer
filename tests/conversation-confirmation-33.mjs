import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

// Real Worker -> frontend -> main microphone -> next Worker request.
// External model/STT responses and microphone hardware are controlled.
const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'))).default;
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
const nativeFetch=globalThis.fetch;
let model,audioTranscript,lastPayload;
globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('/audio/transcriptions')?{text:audioTranscript}:{choices:[{message:{content:JSON.stringify(model)}}]}));
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,run=code=>vm.runInContext(code,dom.getInternalVMContext()),get=id=>w.document.getElementById(id);
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,matchMedia:()=>({matches:true}),confirm:()=>{throw Error('Unexpected native confirmation')},alert(){},fetch:async()=>new Response('{}')});
w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};
w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
w.testApi=async(path,options)=>{lastPayload=JSON.parse(options.body);const response=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:options.body}),env);assert.equal(response.status,200);return response.json()};
run(fs.readFileSync('sync-core.js','utf8'));
for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);
run("plannerApiRequest=testApi;plannerAudioPayload=async()=>({base64:'YXVkaW8=',type:'audio/mp4'});startPlannerRecording=(channel,makeSession)=>{testSession=makeSession();};tasks=[];ideas=[]");
const eventAnswer=(fields,intent='execute')=>({reply:'Sprawdź wydarzenie.',kind:'event',action:'review',intent,proposalId:null,operations:Object.entries(fields).map(([field,value])=>({op:'set',field,value})),focus:'',ambiguity:null});
const command=(type,fields)=>({reply:'Sprawdź ustalenia.',kind:'command',action:'continue',intent:'execute',operations:[],focus:'',ambiguity:null,uiAction:{type,...fields}});
async function turn(text,answer,audio=false){model=answer;audioTranscript=text;w.testText=text;await run(`requestVoiceDialogue(testSession,${audio?'{}':'testText'}).then(r=>r&&applyVoiceDialogueResult(testSession,r))`)}
function assertReview(title){
 assert.equal(get('aiPreview').classList.contains('hidden'),true,'Legacy panel never opens');
 assert.match(get('mainConversation').textContent,new RegExp(title));
 assert.deepEqual([...get('mainConversation').querySelectorAll('.voice-confirmation button')].map(b=>b.textContent),['Nie','Tak']);
 assert.equal(get('mainClarification'),null,'No clarification controls at review');
 assert.equal(run('tasks.length'),0,'Review never writes an event');
}
try{
 get('voice').click();
 await turn('Dodaj Dentysta',eventAnswer({title:'Dentysta'}));
 assert.ok(get('mainClarification'));
 await turn('4 stycznia 2027 od 15:00 do 15:45',eventAnswer({date:'2027-01-04',startTime:'15:00',endTime:'15:45'},'modify'));
 assertReview('Dentysta');assert.match(get('mainConversation').textContent,/Dodaj Dentysta/);
 // Only the existing main microphone is needed to correct the reviewed draft.
 get('voice').click();assert.equal(get('conversationConfirm'),null,'Stale approval removed while correcting');
 assert.equal(run('testSession.currentItem.title'),'Dentysta');
 await turn('Zmień początek na 7:00',eventAnswer({startTime:'07:00'},'modify'),true);
 assert.equal(lastPayload.currentItem.title,'Dentysta');assert.ok(lastPayload.audio);
 assert.match(get('mainConversation').textContent,/07:00 czy 19:00/,'Normalized audio time still requires clarification');
 assert.equal(get('conversationConfirm'),null);
 await turn('Na dziewiętnastą',eventAnswer({startTime:'07:00'},'modify'));
 assertReview('Dentysta');assert.equal(run('pendingVoiceItem.startTime'),'19:00');
 assert.equal(run('pendingVoiceItem.date'),'2027-01-04');assert.equal(run('pendingVoiceItem.endTime'),'15:45');
 // Double approval reuses the existing save and produces exactly one event.
 const yes=get('conversationConfirm');const save=yes.onclick();await yes.onclick();await save;
 assert.equal(run('tasks.length'),1);assert.equal(run('tasks[0].time'),'19:00');
 assert.equal(get('mainConversation'),null);assert.equal(run('pendingVoiceItem'),null);
 run('tasks=[]');get('voice').click();
 await turn('Utwórz spotkanie 4 stycznia od 15:00 do 16:00',command('open_create_event',{query:'Spotkanie',date:'2027-01-04',startTime:'15:00',endTime:'16:00'}));
 assertReview('Spotkanie');
 const stale=get('conversationConfirm');get('conversationCancel').click();await stale.onclick();
 assert.equal(run('tasks.length'),0);assert.equal(run('pendingVoiceItem'),null);assert.equal(get('mainConversation'),null);
 get('voice').click();assert.equal(run('testSession.currentItem'),null);assert.equal(run('testSession.history.length'),0,'Decline starts a clean conversation');
 await turn('Przypomnij 4 stycznia o 18:00: Test',command('set_entry_reminder',{date:'2027-01-04',startTime:'18:00',message:'Test'}));
 assertReview('Test');await get('conversationConfirm').onclick();assert.equal(run('ideas[0].alarm.time'),'18:00');assert.equal(run('tasks.length'),0);
 // Source-entry conversion and rich event details survive the compact review.
 run("ideas=[{id:'source',title:'Wpis źródłowy',text:'Wpis źródłowy',content:'Treść źródła'}];openIdeaActions(ideas[0]);testSession=beginVoiceDialogue('idea','source',voiceDialogueCurrent('idea','source'))");
 await turn('Utwórz wydarzenie z tego wpisu 4 stycznia od 15:00 do 16:00',command('open_create_event',{query:'Z wpisu',date:'2027-01-04',startTime:'15:00',endTime:'16:00'}));
 assertReview('Z wpisu');assert.match(get('mainConversation').textContent,/Treść źródła/);await get('conversationConfirm').onclick();
 assert.equal(run('tasks[0].sourceEntryId'),'source');assert.equal(run('ideas[0].status'),'calendar');
 run("clearVoicePreview();tasks=[];pendingVoiceItem={type:'event',title:'Długi tytuł '.repeat(30),date:'2027-01-05',startTime:'10:00',endTime:'11:00',location:'Rynek, Dresden',notes:'Długa notatka '.repeat(60),reminder:{minutesBefore:15},recurrence:{type:'daily',count:2}};showVoicePreview(pendingVoiceItem)");
 assert.match(get('mainConversation').textContent,/Rynek, Dresden/);assert.match(get('mainConversation').textContent,/Długa notatka/);assert.match(get('mainConversation').textContent,/15 min wcześniej/);
 assert.equal(get('mainConversation').querySelectorAll('.voice-confirmation').length,1);
 console.log('Conversation approval: Worker/frontend/audio correction, history, ambiguity, single save, decline, reminder and source conversion passed (model/STT mocked).');
}finally{globalThis.fetch=nativeFetch;dom.window.close()}
