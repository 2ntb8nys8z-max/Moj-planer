const {JSDOM}=require('jsdom');
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,ctx=dom.getInternalVMContext(),run=s=>vm.runInContext(s,ctx),get=id=>w.document.getElementById(id);
 Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,confirm:()=>true,alert(){},fetch:async()=>new Response('{}')});
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
 const revoked=[];w.URL.createObjectURL=()=> 'blob:test-'+Math.random();w.URL.revokeObjectURL=url=>revoked.push(url);
 for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);
 try{
  run(`ideas=[{id:'one',title:'Plan ogrodu',text:'Pierwotna treść',content:'Bieżąca treść',notes:'Zachowaj notatki',createdAt:'2026-10-09T10:00:00Z',voiceMemoId:'old-audio',custom:{keep:true},additions:[],history:[],list:{type:'shopping',items:[{id:'milk',text:'mleko',done:true}]}},{id:'two',text:'Drugi wpis',history:[]}];loadVoiceMemo=async()=>null;saveIdeas();renderIdeas();openIdeaActions(ideas[0]);`);
  assert.equal(get('entryTitle').textContent,'Plan ogrodu');assert.equal(get('ideaModal').getAttribute('role'),'dialog');assert.equal(get('entryScroll').contains(get('ideaText')),true);assert.equal(get('entryScroll').contains(get('ideaVoice')),false);
  assert.equal(w.getComputedStyle(get('entryScroll')).overflowY,'auto');assert.equal(w.document.body.classList.contains('entry-open'),true);
  get('ideaHistory').click();assert.equal(get('ideaHistory').getAttribute('aria-expanded'),'true');get('ideaHistory').click();assert.equal(get('entryHistoryPanel').classList.contains('hidden'),true);
  get('entryManual').click();get('entryEditTitle').value='Nowa nazwa';get('entryEditBody').value='Dłuższa treść';get('entryAddKind').value='list';get('entryAddText').value='chleb\nmasło';get('entrySave').click();
  assert.equal(run('ideas[0].title'),'Nowa nazwa');assert.equal(run('ideas[0].content'),'Dłuższa treść');assert.equal(run('ideas[0].notes'),'Zachowaj notatki');assert.equal(run('ideas[0].voiceMemoId'),'old-audio');assert.equal(run('ideas[0].custom.keep'),true);assert.equal(run('ideas[0].list.items[0].done'),true);assert.equal(run('ideas[0].list.items.length'),3);
  assert.equal(JSON.parse(w.localStorage.getItem('moj-planer-data-v1')).data.ideas[0].title,'Nowa nazwa');
  get('entryManual').click();get('entryEditTitle').value='Stale';run("ideas[0].content='Concurrent change'");get('entrySave').click();assert.equal(run('ideas[0].title'),'Nowa nazwa');assert.match(get('entryEditError').textContent,/zmienił się/);
  get('entryManual').click();get('entryEditTitle').value='Cannot save';run("originalSaveIdeas=saveIdeas;saveIdeas=()=>{throw Error('full')}");get('entrySave').click();assert.equal(run('ideas[0].title'),'Nowa nazwa');assert.match(get('entryEditError').textContent,/Nie udało/);run('saveIdeas=originalSaveIdeas');
  run("storedBlobs=new Map;deletedBlobs=[];saveVoiceMemo=async(id,blob)=>storedBlobs.set(id,blob);deleteVoiceMemo=async id=>{deletedBlobs.push(id);storedBlobs.delete(id)}");
  await run("attachEntryBlob(ideas[0],new Blob(['audio'],{type:'audio/webm'}),'audio',{duration:31})");await run("attachEntryBlob(ideas[0],new Blob(['photo'],{type:'image/png'}),'image',{name:'Zdjęcie.png'})");
  assert.equal(run('entryAttachments(ideas[0]).length'),3);assert.equal(run('ideas[1].attachments'),undefined);assert.equal(get('ideaText').querySelectorAll('audio').length,2);assert.equal(get('ideaText').querySelectorAll('figure').length,1);
  const oldCount=run('ideas[0].attachments.length');run("saveIdeas=()=>{throw Error('full')}");await assert.rejects(run("attachEntryBlob(ideas[0],new Blob(['bad']),'image')"));assert.equal(run('ideas[0].attachments.length'),oldCount);assert.equal(run('deletedBlobs.length'),1);run('saveIdeas=originalSaveIdeas');
  // Delayed blob reads may never attach a previous entry's media to the new entry.
  run("loadVoiceMemo=()=>new Promise(resolve=>{pendingBlobResolve=resolve});openIdeaActions(ideas[0]);openIdeaActions(ideas[1]);pendingBlobResolve(new Blob(['late']))");await new Promise(r=>setImmediate(r));assert.equal(get('ideaText').querySelectorAll('audio').length,0);
  // A cancelled getUserMedia request must release its late stream.
  let resolveMedia,stopped=false;Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:()=>new Promise(r=>resolveMedia=r)},configurable:true});
  const pending=run('startEntryRecording()');run('cancelEntryRecording()');resolveMedia({getTracks:()=>[{stop(){stopped=true}}]});await pending;assert.equal(stopped,true);assert.equal(run('entryRecording'),null);
  // Actual metadata save plus pause/resume lifecycle, no network needed.
  class Recorder {static isTypeSupported(){return true}constructor(){this.state='inactive';this.mimeType='audio/webm'}start(){this.state='recording'}pause(){this.state='paused'}resume(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable({data:new w.Blob(['real audio'],{type:this.mimeType})});this.onstop()}}
  w.MediaRecorder=Recorder;Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})},configurable:true});
  await run('startEntryRecording()');get('entryPauseRecord').click();assert.equal(run('entryRecording.recorder.state'),'paused');get('entryPauseRecord').click();assert.equal(run('entryRecording.recorder.state'),'recording');get('entrySaveRecord').click();await new Promise(r=>setImmediate(r));assert.equal(run('ideas[1].attachments.length'),1);assert.equal(run('entryRecording'),null);
  // Failed recorder persistence keeps the audio available for retry.
  run("saveIdeas=()=>{throw Error('storage full')}");await run('startEntryRecording()');get('entrySaveRecord').click();await new Promise(r=>setImmediate(r));assert.equal(run('entryRecording.mode'),'ready');assert.equal(get('entrySaveRecord').disabled,false);run('saveIdeas=originalSaveIdeas');get('entrySaveRecord').click();await new Promise(r=>setImmediate(r));assert.equal(run('entryRecording'),null);assert.equal(run('ideas[1].attachments.length'),2);
  run("const session=beginVoiceDialogue('idea',activeIdea.id,voiceDialogueCurrent('idea',activeIdea.id));session.history=[{role:'user',content:'Zmień nazwę'},{role:'assistant',content:'Na jaką?'}];renderVoiceConversation(session)");assert.equal(get('entryConversation').contains(get('ideaConversation')),true);assert.equal(get('ideaConversation').querySelectorAll('.assistant').length,1);
  get('ideaTimer').click();get('entryTimerMinutes').value='20';get('entryStartTimer').click();assert.equal(run('timerIdea.id'),'two');assert.equal(get('ideaModal').classList.contains('hidden'),false);get('entryPauseTimer').click();assert.equal(run('interval'),null);
  get('closeIdea').click();assert.equal(get('ideaModal').classList.contains('hidden'),true);assert.equal(w.document.body.classList.contains('entry-open'),false);assert.equal(w.document.querySelector('.app').inert,false);
  console.log('Entry view 33.15: layout structure, history toggle, persisted edits, stale edit rejection, storage rollback, legacy + multiple attachments, late media cancellation, recorder pause/save, scoped dialogue and timer passed.');
 }finally{dom.window.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
