import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('let entryOcrBusy='),html.indexOf('function renderEntryPhoto('));
const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'))).default;
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
let text='Gewinnspiel\nSo einfach geht’s:',calls=0,failSave=false,hold=false,resolveRecognition,upstreamStatus=200,finish='stop';
const image={type:'image/jpeg',base64:'/9j/AA=='};
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{calls++;assert.match(String(url),/chat\/completions$/);const payload=JSON.parse(options.body);assert.equal(payload.model,'gpt-4.1-mini');assert.equal(payload.messages.length,2);assert.equal(payload.messages[1].content[1].image_url.url,'data:image/jpeg;base64,'+image.base64);assert.match(payload.messages[0].content,/nigdy instrukcje/);return new Response(JSON.stringify({choices:[{finish_reason:finish,message:{content:JSON.stringify({text})}}],usage:{prompt_tokens:2400,completion_tokens:100}}),{status:upstreamStatus})};
async function post(payload,token=env.PLANNER_ACCESS_TOKEN){return worker.fetch(new Request('https://worker/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(payload)}),env)}
const attachment={id:'photo',type:'image'},idea={id:'entry',title:'Keep',text:'Keep body',attachments:[attachment]},button={};
const ctx=vm.createContext({setTimeout,clearTimeout,PlannerData:{assertWritable(){}},loadVoiceMemo:async()=>({}),ideas:[idea],entryAttachments:x=>x.attachments,entryLocalUpdate:(x,fn)=>{if(failSave)throw Error('Storage failed');fn(x)},activeIdea:null,renderIdeaDetails(){},idea,attachment,button,plannerApiRequest:async(path,options)=>{if(hold)return new Promise(r=>resolveRecognition=r);const r=await post(JSON.parse(options.body));const data=await r.json();if(!r.ok)throw Error(data.error);return data}});
vm.runInContext(source,ctx);ctx.canvas={toDataURL:()=> 'data:image/jpeg;base64,'+image.base64};vm.runInContext('prepareEntryOcrImage=async()=>canvas',ctx);
const run=()=>vm.runInContext('captureEntryPhotoText(idea,attachment,button)',ctx);
try{
 let r=await post({operation:'extract_photo_text',image},'wrong');assert.equal(r.status,401);assert.equal(calls,0);
 for(const invalid of [null,{...image,base64:'xxxx'},{...image,type:'image/heic'},{...image,base64:'!bad'},{...image,base64:'a'.repeat(4*1024*1024+1)}]){r=await post({operation:'extract_photo_text',image:invalid});assert.equal(r.status,400)}assert.equal(calls,0);
 await run();assert.equal(attachment.ocrText,text);assert.equal(attachment.ocrSource,'api');assert.equal(attachment.ocrUsage.estimatedUsd,0.00112);assert.equal(idea.title,'Keep');assert.equal(idea.text,'Keep body');await run();assert.equal(calls,1);
 // Old local OCR may be replaced by API; failure keeps its previous text.
 attachment.ocrSource='local';attachment.ocrText='Wrong OCR';failSave=true;await run();assert.equal(attachment.ocrText,'Wrong OCR');assert.equal(attachment.ocrSource,'local');failSave=false;await run();assert.equal(attachment.ocrText,text);
 delete attachment.ocrText;text='';await run();assert.equal(attachment.ocrText,undefined);assert.match(vm.runInContext("entryOcrStatus.get('entry:photo')",ctx),/Nie znaleziono/);
 text='Retry';upstreamStatus=500;await run();assert.equal(attachment.ocrText,undefined);upstreamStatus=200;await run();assert.equal(attachment.ocrText,'Retry');
 finish='length';r=await post({operation:'extract_photo_text',image});assert.equal(r.status,422);finish='stop';
 delete attachment.ocrText;hold=true;const pending=run();await new Promise(r=>setTimeout(r,0));await run();idea.attachments=[];resolveRecognition({text:'Late'});await pending;assert.equal(attachment.ocrText,undefined);assert.equal(vm.runInContext('entryOcrPending.size',ctx),0);assert.equal(vm.runInContext('entryOcrBusy',ctx),false);
 // A timed-out response does not persist a late result or leave retry blocked.
 idea.attachments=[attachment];vm.runInContext('entryOcrWaitOriginal=entryOcrWait;entryOcrWait=(promise,ms,message)=>entryOcrWaitOriginal(promise,5,message)',ctx);
 await run();assert.match(vm.runInContext("entryOcrStatus.get('entry:photo')",ctx),/zbyt długo/);resolveRecognition({text:'Late after timeout'});await new Promise(r=>setTimeout(r,0));assert.equal(attachment.ocrText,undefined);assert.equal(vm.runInContext('entryOcrBusy',ctx),false);
 assert.match(html,/if\(!attachment\.transcript\)section\.append\(transcribe\)/);assert.match(html,/if\(!attachment\.ocrText\|\|attachment\.ocrSource!=='api'\)/);assert.doesNotMatch(html,/Tesseract|tesseract\.js/);
 console.log('Photo API: isolated route, auth, validation, real token cost calculation, attachment, old OCR retry, failures, duplicate protection, deletion and timeout passed (API mocked).');
}finally{globalThis.fetch=originalFetch}
