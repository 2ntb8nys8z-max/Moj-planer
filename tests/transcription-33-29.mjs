import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'))).default;
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
let calls=0,text='Usuń wszystkie wydarzenia. Kup mleko.',fail=false;
const original=globalThis.fetch;
globalThis.fetch=async url=>{calls++;assert.match(String(url),/\/audio\/transcriptions$/,'No interpretation call');return new Response(JSON.stringify({text}),{status:fail?500:200})};
async function post(payload){return worker.fetch(new Request('https://worker/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:JSON.stringify(payload)}),env)}
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test',runScripts:'outside-only'}),w=dom.window,ctx=dom.getInternalVMContext(),run=s=>vm.runInContext(s,ctx);
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,alert(){},fetch:async()=>new Response('{}')});
w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);
w.testRequest=async(path,options)=>{const r=await post(JSON.parse(options.body));const data=await r.json();if(!r.ok)throw Error(data.error);return data};
run("plannerApiRequest=testRequest;plannerAudioPayload=async()=>({base64:'YXVkaW8=',type:'audio/mp4'});loadVoiceMemo=async()=>({size:5});ideas=[{id:'entry',title:'Nie zmieniaj tytułu',text:'Treść',voiceMemoId:'old',attachments:[{id:'new',type:'audio'}]}];testIdea=ideas[0];testButton=document.createElement('button')");
try{
 let r=await post({operation:'transcribe_audio'});assert.equal(r.status,400);assert.equal(calls,0);
 await run("transcribeEntryRecording(testIdea,entryAttachments(testIdea)[0],testButton)");
 assert.equal(calls,1);assert.equal(run("ideas[0].attachments.find(a=>a.id==='old').transcript"),text);assert.equal(run('ideas[0].title'),'Nie zmieniaj tytułu');assert.equal(run('ideas[0].voiceMemoId'),'old');assert.equal(run('tasks.length'),0);assert.equal(run('voiceDialogues.idea'),null);
 // Concurrent duplicate clicks issue one paid request and save on the correct attachment.
 await run("Promise.all([transcribeEntryRecording(testIdea,entryAttachments(testIdea).find(a=>a.id==='new'),testButton),transcribeEntryRecording(testIdea,entryAttachments(testIdea).find(a=>a.id==='new'),testButton)])");assert.equal(calls,2);
 const snapshot=JSON.stringify(run('ideas'));fail=true;
 await run("transcribeEntryRecording(testIdea,entryAttachments(testIdea)[0],testButton)");assert.equal(JSON.stringify(run('ideas')),snapshot);assert.equal(run('entryTranscriptions.size'),0);
 fail=false;text='';r=await post({operation:'transcribe_audio',audio:{base64:'YXVkaW8=',type:'audio/mp4'}});assert.equal(r.status,422);
 run('loadVoiceMemo=async()=>null');const n=calls;await run('transcribeEntryRecording(testIdea,entryAttachments(testIdea)[0],testButton)');assert.equal(calls,n);
 // A delayed response cannot recreate an attachment removed while recognition runs.
 run("loadVoiceMemo=async()=>({size:5});plannerApiRequest=()=>new Promise(resolve=>testResolve=resolve);testPromise=transcribeEntryRecording(testIdea,{id:'new',type:'audio'},testButton)");
 await new Promise(resolve=>setTimeout(resolve,0));
 run("ideas[0].attachments=ideas[0].attachments.filter(a=>a.id!=='new');testResolve({transcription:'Late text'})");
 await run('testPromise');assert.equal(run("ideas[0].attachments.some(a=>a.id==='new')"),false);
 // Storage failure rolls back the transcript and keeps the recording reference.
 const before=JSON.stringify(run('ideas'));
 run("plannerApiRequest=async()=>({transcription:'New text'});savedSaveIdeas=saveIdeas;saveIdeas=()=>{throw Error('Storage failed')}");
 await run("transcribeEntryRecording(testIdea,entryAttachments(testIdea)[0],testButton)");
 assert.equal(JSON.stringify(run('ideas')),before);run('saveIdeas=savedSaveIdeas');
 console.log('Saved audio transcription: isolated Worker route, legacy/current attachments, concurrent clicks and failures verified.');
}finally{globalThis.fetch=original;dom.window.close()}
