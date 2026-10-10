import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('let entryOcrLoader='),html.indexOf('function renderEntryPhoto('));
let text='Mleko 4,99\nChleb 3,50',calls=0,terminated=0,failSave=false,resolveRecognition;
const attachment={id:'photo',type:'image'},idea={id:'entry',attachments:[attachment]},button={};
const ctx=vm.createContext({setTimeout,clearTimeout,window:{Tesseract:{createWorker:async()=>({recognize:async()=>{calls++;if(resolveRecognition===true)return new Promise(r=>resolveRecognition=r);return {data:{text}}},terminate:async()=>terminated++})}},PlannerData:{assertWritable(){}},loadVoiceMemo:async()=>({}),ideas:[idea],entryAttachments:x=>x.attachments,entryLocalUpdate:(x,fn)=>{if(failSave)throw Error('Storage failed');fn(x)},activeIdea:null,renderIdeaDetails(){},idea,attachment,button});
vm.runInContext(source,ctx);vm.runInContext('prepareEntryOcrImage=async blob=>blob',ctx);const run=()=>vm.runInContext('captureEntryPhotoText(idea,attachment,button)',ctx);
await run();assert.equal(attachment.ocrText,text);assert.equal(terminated,1);await run();assert.equal(calls,1);
delete attachment.ocrText;text='';await run();assert.equal(attachment.ocrText,undefined);assert.match(vm.runInContext("entryOcrStatus.get('entry:photo')",ctx),/Nie znaleziono/);
text='Retry';failSave=true;await run();assert.equal(attachment.ocrText,undefined);failSave=false;await run();assert.equal(attachment.ocrText,'Retry');
delete attachment.ocrText;resolveRecognition=true;const pending=run();await new Promise(r=>setTimeout(r,0));await run();idea.attachments=[];resolveRecognition({data:{text:'Late'}});await pending;assert.equal(attachment.ocrText,undefined);assert.equal(vm.runInContext('entryOcrPending.size',ctx),0);assert.equal(vm.runInContext('entryOcrBusy',ctx),false);
assert.match(html,/if\(!attachment\.transcript\)section\.append\(transcribe\)/);assert.match(html,/if\(!attachment\.ocrText\)figure\.append\(ocr\)/);
console.log('OCR: correct attachment, repeat protection, empty text, save failure, deleted photo and retry verified with recognition fixture.');

// A stalled initialization restores retry; a late worker is disposed without saving.
idea.attachments=[attachment];
vm.runInContext('entryOcrWaitOriginal=entryOcrWait;entryOcrWait=(promise,ms,message)=>entryOcrWaitOriginal(promise,5,message);window.Tesseract.createWorker=()=>new Promise(resolve=>lateWorkerResolve=resolve)',ctx);
await run();assert.match(vm.runInContext("entryOcrStatus.get('entry:photo')",ctx),/90 sekund/);assert.equal(vm.runInContext('entryOcrBusy',ctx),false);
ctx.lateWorker={terminate:async()=>terminated++};vm.runInContext('lateWorkerResolve(lateWorker)',ctx);await new Promise(r=>setTimeout(r,0));assert.equal(attachment.ocrText,undefined);
await assert.rejects(vm.runInContext("entryOcrWaitOriginal(new Promise(()=>{}),5,'Timeout')",ctx),/Timeout/);
console.log('OCR timeout and late worker cleanup passed.');
