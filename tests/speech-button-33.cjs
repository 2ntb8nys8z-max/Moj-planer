const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,run=s=>vm.runInContext(s,dom.getInternalVMContext());
 Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,matchMedia:()=>({matches:false}),confirm:()=>true,alert(){},fetch:async()=>Response.json({})});
 w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
 w.HTMLElement.prototype.animate=function(){return {finished:Promise.resolve(),cancel(){}}};
 let gesture=false,blocked=0,resumes=0,voiceError=false;
 const utterances=[];w.SpeechSynthesisUtterance=function(text){this.text=text};
 w.speechSynthesis={paused:false,getVoices(){if(voiceError)throw Error('Voices unavailable');return [{lang:'pl-PL',name:'Polski'}]},cancel(){},resume(){resumes++;this.paused=false},speak(u){if(!gesture){blocked++;throw new w.DOMException('Requires a gesture','NotAllowedError')}utterances.push(u)}};
 for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),read=()=>w.document.querySelector('#oktiDecision [data-speech-read]')||w.document.querySelector('#oktiDecision [aria-label="Odczytaj pytanie"]');
 function show(text='To jest odpowiedź Okti.'){w.testQuestion=text;run("OktiCommunication.showActions('main',testQuestion,[],()=>true)")}
 function pointer(button,type){const e=new w.Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:25,clientY:25});button.dispatchEvent(e)}
 function tap(){const button=read();button.getBoundingClientRect=()=>({left:0,right:50,top:0,bottom:50});pointer(button,'pointerdown');pointer(button,'pointerup');gesture=true;try{button.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true,detail:1}))}finally{gesture=false}}
 try{
  show();tap();assert.equal(utterances.length,1,'Speech must start synchronously in the native click, before any animation await');assert.equal(blocked,0);await wait(650);assert.equal(utterances.length,1,'The delayed glass-key click must not replay the reading');
  const first=utterances[0];assert.equal(first.text,'To jest odpowiedź Okti.');assert.equal(first.lang,'pl-PL');first.onstart();assert.equal(read().getAttribute('aria-pressed'),'true');assert.equal(read().getAttribute('aria-label'),'Zatrzymaj czytanie');tap();assert.equal(utterances.length,1,'A second tap stops the current reading');assert.equal(read().getAttribute('aria-pressed'),'false');
  tap();assert.equal(utterances.length,2);utterances.at(-1).onend();assert.equal(read().getAttribute('aria-label'),'Odczytaj pytanie');
  show();w.speechSynthesis.paused=true;tap();assert.equal(resumes,1,'A paused system queue is resumed without leaving the click gesture');assert.equal(w.speechSynthesis.paused,false);utterances.at(-1).onend();
  voiceError=true;tap();assert.equal(utterances.at(-1).text,'To jest odpowiedź Okti.','Failure to enumerate voices must still use the Polish system default');voiceError=false;
  const failed=utterances.at(-1);failed.onerror({error:'not-allowed'});assert.match(w.document.querySelector('.okti-decision-speech-status').textContent,/Nie udało się/);assert.equal(read().getAttribute('aria-pressed'),'false');tap();assert.equal(utterances.at(-1).lang,'pl-PL');
  const old=utterances.at(-1);show('Nowsza odpowiedź.');old.onerror({error:'synthesis-failed'});old.onstart();assert.equal(w.document.querySelector('.okti-decision-speech-status').hidden,true,'Callbacks from a replaced response cannot change the new reading state');
  // A silently ignored speak() produces feedback, with no out-of-gesture retry.
  const realTimeout=w.setTimeout.bind(w),realClear=w.clearTimeout.bind(w),timers=new Map();let nextTimer=900000;
  w.setTimeout=(fn,ms,...args)=>ms===6000?(timers.set(++nextTimer,fn),nextTimer):realTimeout(fn,ms,...args);w.clearTimeout=id=>timers.delete(id)||realClear(id);
  tap();const starts=utterances.length;assert.equal(timers.size,1);[...timers.values()][0]();assert.equal(utterances.length,starts);assert.match(w.document.querySelector('.okti-decision-speech-status').textContent,/nie wystartowało/);assert.equal(read().getAttribute('aria-busy'),'false');
  tap();const closed=utterances.at(-1);run('OktiCommunication.close()');closed.onerror({error:'canceled'});assert.equal(w.document.getElementById('oktiDecision').hidden,true);assert.equal(blocked,0);
  // Reading does not resolve an hour question, alter its draft or save an event.
  run("testSession=beginVoiceDialogue('main',null,null);testSession.dialogueState={engine:3,mode:'create',revision:2,draft:{title:'Konsultacja',date:'2026-11-11'},activeHourChoice:{field:'startTime',choices:['01:00','13:00']}};testSession.history=[{role:'user',content:'Dodaj konsultację na pierwszą'}];showVoiceClarification(testSession,'01:00 czy 13:00?')");
  const before=run('JSON.stringify({draft:testSession.dialogueState,history:testSession.history,data:PlannerData.snapshot()})');tap();utterances.at(-1).onstart();tap();assert.equal(run('JSON.stringify({draft:testSession.dialogueState,history:testSession.history,data:PlannerData.snapshot()})'),before);
  run('OktiCommunication.close()');w.speechSynthesis=undefined;show();assert.equal(read().disabled,true);w.OktiCommunication.setBusy(undefined,true);w.OktiCommunication.setBusy(undefined,false);assert.equal(read().disabled,true,'Busy-state updates must not enable an unsupported speech button');assert.match(w.document.querySelector('.okti-decision-speech-status').textContent,/niedostępne/);
  console.log('Speech button: synchronous touch activation, no delayed duplicate, start/end/stop, paused queue, voice-list failure, error/retry, stale callbacks, silent-start feedback, unsupported browser and unchanged conversation/hour draft/calendar passed (speech engine and gesture policy simulated).');
 }finally{dom.window.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
