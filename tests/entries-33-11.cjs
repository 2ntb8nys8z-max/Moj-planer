const {JSDOM}=require('jsdom');const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');
(async()=>{
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'))).default;
 const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
 let model={reply:'Na który dzień wydarzenie?',kind:'event',action:'continue',intent:'continue',proposalId:null,operations:[],focus:'',ambiguity:null};
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(model)}}]}));
 const html=fs.readFileSync('index.html','utf8');
 function boot(initial={}){
  const dom=new JSDOM(html,{url:'https://planner.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,ctx=dom.getInternalVMContext();
  Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,confirm:()=>true,alert(){},fetch:async()=>new Response('{}')});
  w.HTMLElement.prototype.scrollIntoView=function(){};w.URL.createObjectURL=()=> 'blob:test-recording';w.URL.revokeObjectURL=()=>{};
  for(const [k,v] of Object.entries(initial))w.localStorage.setItem(k,v);
  for(const script of w.document.querySelectorAll('script'))if(!script.src)vm.runInContext(script.textContent,ctx);
  w.testApi=async(path,opts)=>{const response=await worker.fetch(new Request('https://worker/',{...opts,headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN}}),env);assert.equal(response.status,200);return response.json()};
  vm.runInContext('plannerApiRequest=testApi',ctx);
  const run=code=>vm.runInContext(code,ctx),json=code=>JSON.parse(run('JSON.stringify('+code+')'));
  async function turn(text){w.testText=text;return run(`(async()=>{const session=voiceDialogues.main||beginVoiceDialogue('main',null,null);const result=await requestVoiceDialogue(session,testText);if(result)await applyVoiceDialogueResult(session,result);return result;})()`)}
  return {dom,w,run,json,turn};
 }
 const app=boot(),{w,run,json,turn}=app;
 try{
  // Full transport + reducer + persistent client state + real DOM save, with a deliberately wrong model reply.
  assert.equal(await turn('Utwórz nowe zadanie, nie w kalendarzu'),null);
  assert.match(w.document.querySelector('#mainConversation').textContent,/Jak nazwać wpis/);
  assert.doesNotMatch(w.document.querySelector('#mainConversation').textContent,/dzień wydarzenia|godzin|Zmiana jest w szkicu/);
  assert.equal(await turn('Masaż pleców'),null);assert.match(w.document.querySelector('#mainConversation').textContent,/Utworzyć wpis „Masaż pleców”/);
  await turn('tak');assert.equal(json('ideas').length,1);assert.equal(json('ideas')[0].text,'Masaż pleców');assert.ok(json('ideas')[0].createdAt);assert.equal(json('tasks').length,0);
  assert.match(w.document.querySelector('#ideasList').textContent,/Masaż pleców/);assert.equal(w.document.querySelector('#toast').textContent,'Wpis zapisany');assert.equal(w.document.querySelectorAll('#ideasList .entry-result-type').length,0);
  assert.equal(JSON.parse(w.localStorage.getItem('moj-planer-data-v1')).data.ideas[0].text,'Masaż pleców');
  await turn('utwórz notatkę Dokumenty do księgowej');await turn('utwórz pomysł Weekend w górach');
  assert.ok(json('ideas').some(x=>x.text==='Dokumenty do księgowej'));assert.ok(json('ideas').some(x=>x.text==='Weekend w górach'));
  run("clearVoiceDialogue('main');const correctionSession=beginVoiceDialogue('main',null,null);correctionSession.dialogueState={engine:3,draft:{type:'event',title:'Poprawiony masaż',date:'2026-10-09',startTime:'10:00'}}");
  await turn('Nie w kalendarzu');assert.ok(json('ideas').some(x=>x.text==='Poprawiony masaż'));assert.equal(json('tasks').length,0);
  model={reply:'Informacyjna odpowiedź bez szukania wpisów.',kind:'event',action:'continue',intent:'continue',proposalId:null,operations:[],focus:'',ambiguity:null};
  for(const text of ['Sprawdź pogodę na jutro','Pokaż jak korzystać z minutnika','Sprawdź ile trwa dzień']){run("clearVoiceDialogue('main')");assert.equal(await turn(text),null);assert.match(w.document.querySelector('#mainConversation').textContent,/Informacyjna odpowiedź/);}
  run("clearVoiceDialogue('main')");
  model={reply:'Utworzyć wpis Propozycja?',kind:'idea',action:'continue',intent:'propose',proposalId:null,operations:[],focus:'zgoda',ambiguity:null,idea:{type:'idea',text:'Propozycja',action:'replace'}};
  await turn('Może dodamy to później?');const proposalId=run('voiceDialogues.main.dialogueState.pendingProposal.id');
  model={reply:'Przyjmuję.',kind:'idea',action:'continue',intent:'accept',proposalId,operations:[],focus:'',ambiguity:null};
  await turn('tak');assert.ok(json('ideas').some(x=>x.text==='Propozycja'),'accepting the current model proposal persists the entry');
  model={reply:'Sprawdzam.',kind:'command',action:'continue',intent:'execute',proposalId:null,operations:[],focus:'',ambiguity:null,uiAction:{type:'list_entries',scope:'entries',createdOn:'2026-10-06'}};
  const historical=await turn('Pokaż wpisy utworzone przedwczoraj');assert.equal(historical.uiAction.createdOn,'2026-10-06','unrecognized phrasing retains the model date filter');
  model={reply:'Na który dzień wydarzenie?',kind:'event',action:'continue',intent:'continue',proposalId:null,operations:[],focus:'',ambiguity:null};
  // Exactly two shopping titles amid 302 unrelated entries, plus calendar data. Old types cannot change results.
  run(`ideas=[];for(let i=0;i<302;i++)ideas.push({id:'noise'+i,type:'idea',entryType:'shopping',text:'Inny wpis '+i,done:false});ideas.push({id:'shop1',entryType:'task',text:'Lista zakupów',createdAt:'2026-10-08T12:00:00Z',list:{type:'shopping',items:[{id:'milk',text:'mleko',done:true}]},additions:[{text:'Kod rabatowy bursztyn',createdAt:'2026-10-08T12:00:00Z'}],history:[]},{id:'shop2',entryType:'voice',text:'Lista zakupów',createdAt:'2026-10-07T12:00:00Z',list:{type:'shopping',items:[]},history:[]});tasks=[{id:'event',title:'Wizyta',notes:'Kontrola bursztyn',date:'2026-10-08',createdAt:'2026-10-07T12:00:00Z'}];saveIdeas();saveTasks();`);
  await turn('Pokaż wszystkie listy zakupów, które mam');assert.equal(w.document.querySelectorAll('#entryResults .entry-result').length,2);
  assert.equal(w.getComputedStyle(w.document.querySelector('#entryResults')).overflowY,'auto');
  await turn('Wyszukaj listy zakupów');assert.equal(w.document.querySelectorAll('#entryResults .entry-result').length,2);
  await turn('znajdź mleko');assert.equal(w.document.querySelectorAll('#entryResults .entry-result').length,1);
  await turn('znajdź bursztyn');assert.equal(w.document.querySelectorAll('#entryResults .entry-result').length,2,'default includes entry additions and calendar notes');
  run("applyVoiceUiAction({}, {type:'find_entry',query:'mleko',entryType:'note'})");assert.equal(w.document.querySelectorAll('#entryResults .entry-result').length,1,'legacy entryType never blocks a match');
  // Separate creation and schedule filters, historical dates and unknown dates.
  await turn('Pokaż wpisy utworzone 8 października 2026');assert.equal(w.document.querySelectorAll('#entryResults .entry-result').length,1);assert.match(w.document.querySelector('#entryResults').textContent,/Lista zakupów/);
  await turn('Pokaż wydarzenia 8 października 2026');assert.equal(w.document.querySelectorAll('#entryResults .entry-result').length,1);assert.match(w.document.querySelector('#entryResults').textContent,/Wizyta/);
  await turn('Pokaż wydarzenia utworzone 8 października 2026');assert.equal(w.document.querySelectorAll('#entryResults .entry-result').length,0);
  run("ideas.push({id:'today',text:'Dzisiejszy',createdAt:new Date().toISOString(),done:false});saveIdeas()");
  const actualToday=run('iso(today())');await turn('Pokaż wpisy utworzone dzisiaj');assert.equal(w.document.querySelectorAll('#entryResults .entry-result').length,json(`ideas.filter(x=>x.createdAt&&iso(new Date(x.createdAt))===${JSON.stringify(actualToday)})`).length);
  await turn('Pokaż wpisy utworzone 07.10.2026');assert.equal(w.document.querySelectorAll('#entryResults .entry-result').length,1);
  const before=json('({ideas,tasks})');await turn('Znajdź zadanie Nieistniejący pingwin');assert.equal(w.document.querySelectorAll('#entryResults .entry-result').length,0);assert.deepEqual(json('({ideas,tasks})'),before);assert.equal(run('pendingVoiceItem'),null);
  await turn('Znajdź wydarzenie Nieistniejący pingwin');assert.deepEqual(json('({ideas,tasks})'),before);assert.equal(run('pendingVoiceItem'),null);
  // Checkbox and subsequent product edit preserve completion, additions and history.
  run("openIdeaActions(ideas.find(x=>x.id==='shop1'))");const checkbox=w.document.querySelector('#ideaText input[type=checkbox]');assert.equal(checkbox.checked,true);checkbox.checked=false;checkbox.dispatchEvent(new w.Event('change'));
  await run("processIdeaVoiceResult({item:{type:'idea',text:'Lista zakupów',listAction:'add',items:['chleb']}},'shop1')");assert.deepEqual(json("ideas.find(x=>x.id==='shop1').list.items.map(x=>[x.text,x.done])"),[['mleko',false],['chleb',false]]);assert.equal(json("ideas.find(x=>x.id==='shop1').additions").length,1);assert.equal(json("ideas.find(x=>x.id==='shop1').history").length,2);
  // Persistence errors roll back the in-memory insertion and never report success.
  const failing=boot();try{failing.run("PlannerData.storage.setItem=()=>{throw Error('storage full')}");await failing.turn('utwórz wpis Niezapisany');assert.equal(failing.json('ideas').length,0);assert.match(failing.w.document.querySelector('#toast').textContent,/Nie udało się zapisać/);assert.equal(failing.w.localStorage.getItem('moj-planer-data-v1'),null);}finally{failing.dom.window.close()}
  // Legacy read and atomic migration preserve arbitrary metadata and audio references, without inventing createdAt.
  const legacy={id:0,type:'idea',entryType:'note',title:'Archiwum',text:'Treść osobna od tytułu',notes:'Notatka wewnętrzna',voiceMemoId:'audio-old',custom:{keep:true},list:{type:'shopping',items:[{id:'legacy-product',text:'kawa',done:true}]},additions:[{text:'Dopisek',createdAt:'2025-05-01T12:00:00Z'}],history:[{at:'2025-05-01T12:00:00Z',kind:'change',summary:'Stara zmiana'}]};
  const migrated=boot({'moj-planer-ideas':JSON.stringify([legacy]),'moj-planer-note':'Starsze wolne myśli'});try{
   assert.deepEqual(migrated.json('ideas.find(x=>x.id===0)'),legacy);assert.equal(migrated.json('ideas').length,2);assert.equal(migrated.run('ideas.find(x=>x.id===0).createdAt'),undefined);assert.equal(migrated.run('normalizeIdea(ideas.find(x=>x.id===0)).createdAt'),undefined);
   migrated.run("loadVoiceMemo=async id=>new Blob(['old audio']);openIdeaActions(ideas.find(x=>x.id===0))");await new Promise(resolve=>setImmediate(resolve));assert.ok(migrated.w.document.querySelector('#ideaText audio'));assert.match(migrated.w.document.querySelector('#ideaText').textContent,/Treść osobna od tytułu/);assert.match(migrated.w.document.querySelector('#ideaText').textContent,/Notatka wewnętrzna/);
   const reload=boot({'moj-planer-data-v1':migrated.w.localStorage.getItem('moj-planer-data-v1')});try{assert.equal(reload.json('ideas').length,2);assert.deepEqual(reload.json('ideas.find(x=>x.id===0)'),legacy);assert.equal(reload.json('ideas').find(x=>x.title==='Wolne myśli').createdAt,undefined);}finally{reload.dom.window.close()}
  }finally{migrated.dom.window.close()}
  console.log('33.11 entries: full multi-turn Worker→frontend→save/render, search scope/content/dates/no-hit, storage failure, legacy migration, audio reference, checkbox and product-history regressions passed (AI mocked).');
 }finally{app.dom.window.close();globalThis.fetch=oldFetch}
})().catch(error=>{console.error(error);process.exitCode=1});
