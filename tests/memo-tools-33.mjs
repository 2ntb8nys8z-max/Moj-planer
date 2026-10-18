import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

// Actual Worker/frontend dispatch; external STT, model and microphone are fixtures.
const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'))).default;
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
const nativeFetch=globalThis.fetch;
let transcript='zacznij nagrywać';
globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('/audio/transcriptions')?{text:transcript}:{choices:[{message:{content:JSON.stringify({reply:'Co dodać?',kind:'event',action:'continue',intent:'execute',operations:[],focus:'',ambiguity:null})}}]}));
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,run=code=>vm.runInContext(code,dom.getInternalVMContext()),get=id=>w.document.getElementById(id),saved=new Map();
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,matchMedia:()=>({matches:true}),confirm:()=>true,alert(){},fetch:async()=>new Response('{}')});
w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};
w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
let requested=0,stopped=0,deny=false,release,failSave=false;
const stream=()=>({getTracks:()=>[{stop(){stopped++}}]});
Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>{requested++;if(deny)throw Object.assign(Error('denied'),{name:'NotAllowedError'});if(release)return new Promise(resolve=>release.resolve=resolve);return stream()}}});
w.MediaRecorder=class{
 static isTypeSupported(){return true}state='inactive';mimeType='audio/mp4';
 start(){this.state='recording';this.onstart?.()}pause(){this.state='paused'}resume(){this.state='recording'}
 stop(){this.state='inactive';this.ondataavailable?.({data:new w.Blob(['memo audio'],{type:this.mimeType})});return this.onstop?.()}
};
const settle=()=>new Promise(r=>setTimeout(r,20));
try{
 run(fs.readFileSync('sync-core.js','utf8'));
 for(const s of w.document.querySelectorAll('script'))if(!s.src)run(s.textContent);
 w.testSave=async(id,blob)=>{if(failSave)throw Error('disk full');saved.set(id,blob)};
 w.testLoad=async id=>saved.get(id);w.testDelete=async id=>saved.delete(id);
 w.testApi=async(_path,options)=>{const response=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:options.body}),env);assert.equal(response.status,200);return response.json()};
 run("saveVoiceMemo=testSave;loadVoiceMemo=testLoad;deleteVoiceMemo=testDelete;plannerApiRequest=testApi;plannerAudioPayload=async()=>({base64:'YXVkaW8=',type:'audio/mp4'});tasks=[];ideas=[]");
 run("memoCommandSession=beginVoiceDialogue('main',null,null)");
 run("memoCommandAudio={session:memoCommandSession,mode:'ready',chunks:[new Blob(['start command'],{type:'audio/mp4'})]};plannerRecordings.main=memoCommandAudio");
 await run("sendPlannerRecording('main',memoCommandAudio)");
 assert.equal(run('plannerRecordings.main'),null,'the short command recorder releases ownership before the long memo starts');
 assert.equal(run('memoSession.mode'),'recording');assert.equal(get('memoTools').hidden,false);assert.equal(run('tasks.length+ideas.length'),0,'opening the recorder writes no event or note');
 const before=requested;get('voice').click();await settle();assert.equal(requested,before,'the command microphone cannot overlap a memo');
 run('memoSession.started-=2000');get('memoToolsPause').click();assert.equal(run('memoSession.mode'),'paused');const elapsed=run('memoElapsed()');await settle();assert.equal(run('memoElapsed()'),elapsed,'paused time does not consume the limit');
 get('memoToolsPause').click();assert.equal(run('memoSession.mode'),'recording');get('memoToolsStop').click();await settle();assert.equal(run('memoSession.mode'),'ready');assert.equal(run('ideas.length'),0,'Stop keeps an unsaved recording for explicit save');assert.ok(stopped>0);
 failSave=true;get('memoToolsSave').click();await settle();assert.equal(run('memoSession.mode'),'ready');assert.ok(run('memoSession.blob.size')>0,'a storage failure keeps the audio for retry');assert.equal(run('ideas.length'),0);
 failSave=false;get('memoToolsSave').click();get('memoToolsSave').click();await settle();assert.equal(run('memoSession'),null);assert.equal(run('ideas.length'),1,'double save creates exactly one entry');assert.equal(saved.size,1);assert.ok(run("entryAttachments(ideas[0]).some(a=>a.type==='audio')"));assert.equal(get('memoTools').hidden,true);
 run("clearVoiceDialogue('main');englishSession=beginVoiceDialogue('main',null,null)");
 const english=await run("requestVoiceDialogue(englishSession,'start recording')");assert.equal(english.startVoiceMemo,true);w.english=english;await run('applyVoiceDialogueResult(englishSession,english)');
 get('memoToolsCancel').click();assert.equal(run('memoSession'),null);assert.equal(run('ideas.length'),1,'cancel does not create a note');
 const dock=w.document.querySelector('.octi-dock[data-channel=main]');dock.querySelector('.menu-toggle').click();dock.querySelector('.recorder').click();await settle();assert.equal(run('memoSession.mode'),'recording','large plus opens the same recorder');
 run('memoSession.started-=181000;memoSession.elapsed=0');assert.equal(run('memoElapsed()'),180000);await new Promise(r=>setTimeout(r,300));assert.equal(run('memoSession.mode'),'ready','three-minute limit stops but keeps audio');assert.equal(run('ideas.length'),1);get('memoToolsCancel').click();
 release={};const opening=run('startVoiceMemo()');assert.equal(run('memoSession.mode'),'opening');get('memoToolsCancel').click();const stoppedBefore=stopped;release.resolve(stream());release=null;await opening;assert.equal(run('memoSession'),null);assert.ok(stopped>stoppedBefore,'late permission result releases the microphone after cancel');
 deny=true;await run('startVoiceMemo()');assert.equal(run('memoSession'),null);assert.equal(get('memoTools').hidden,true);deny=false;
 run("guardSession=beginVoiceDialogue('main',null,null)");assert.equal(run("isMemoStartCommand(guardSession,'nie zaczynaj nagrywać')"),false);assert.equal(run("isMemoStartCommand(guardSession,'dodaj notatkę start recording')"),false);
 run("guardSession.history.push({role:'assistant',content:'Jaka godzina?'})");assert.equal(run("isMemoStartCommand(guardSession,'start recording')"),false,'an active dialogue keeps its existing continuation');
 console.log('Memo tools: real Worker/frontend PL audio and EN command, plus action, pause/resume, stop, save retry, duplicate protection, limit, cancel during permission and microphone errors passed (STT/model/microphone mocked).');
}finally{globalThis.fetch=nativeFetch;dom.window.close()}
