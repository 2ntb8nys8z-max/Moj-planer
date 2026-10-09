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
  run(`ideas=[{id:'one',text:'Pomysł na drony',content:'Nie usuwaj treści',createdAt:'2026-10-09T10:00:00Z',voiceMemoId:'audio',additions:[{text:'Pierwszy dopisek',createdAt:'2026-10-09T11:00:00Z'}],history:[]}];loadVoiceMemo=async()=>null;tasks=[];saveIdeas();openIdeaActions(ideas[0]);`);
  await run("processIdeaVoiceResult({item:{type:'idea',text:'Lista zakupów',listAction:'replace',items:['chleb','pomidory']}},'one')");
  assert.equal(run('ideas[0].text'),'Pomysł na drony');assert.equal(run('ideas[0].list.items.length'),2);
  await run("processIdeaVoiceResult({item:{type:'idea',text:'Nowy pomysł',action:'rename'}},'one')");
  await run("processIdeaVoiceResult({item:{type:'idea',text:'Lista zakupów',listAction:'replace',items:['silnik','olej','mąka']}},'one')");
  assert.equal(run('ideas[0].title'),'Nowy pomysł');assert.equal(run('ideas[0].list.items.length'),5);assert.equal(run('ideas[0].content'),'Nie usuwaj treści');assert.equal(run('ideas[0].voiceMemoId'),'audio');
  await run("processIdeaVoiceResult({item:{type:'idea',text:'ignored',listAction:'replace',replaceExisting:true,items:['kawa']}},'one')");assert.equal(run('ideas[0].list.items.length'),1);assert.equal(run('ideas[0].title'),'Nowy pomysł');
  run("originalSaveIdeas=saveIdeas;saveIdeas=()=>{throw Error('full')}");await assert.rejects(run("processIdeaVoiceResult({item:{type:'idea',text:'x',listAction:'add',items:['utracone']}},'one')"));assert.equal(run('ideas[0].list.items.length'),1);run('saveIdeas=originalSaveIdeas');
  assert.equal([...get('ideaText').querySelectorAll('button')].filter(b=>b.textContent==='Kopiuj całość').length,1);assert.equal(get('ideaText').querySelector('.entry-note-date').style.fontWeight,'');assert.match(run('entryCopyBody(ideas[0])'),/Nie usuwaj treści[\s\S]*Pierwszy dopisek/);
  run("selected=new Date('2026-10-09T12:00:00');monthCursor=new Date(selected);tasks=[{id:'busy',title:'Spotkanie',date:'2026-10-09',time:'17:00',endTime:'18:00'}];openEntryDeadline(ideas[0],{date:'2026-10-09',startTime:'17:00'})");assert.match(get('entryDeadlineError').textContent,/masz wydarzenie/);assert.match(get('entryDeadlineSlots').textContent,/Twój wolny czas/);
  get('entryDeadlineSave').click();assert.equal(run('ideas[0].deadline.time'),'17:00');assert.equal(run('tasks.length'),1);assert.equal(get('taskList').querySelectorAll('.entry-deadline-row').length,1);assert.equal(get('weekGrid').querySelectorAll('.entry-deadline-row').length,1);assert.equal(get('monthGrid').querySelectorAll('.entry-deadline-count').length,1);
  assert.equal(JSON.parse(w.localStorage.getItem('moj-planer-data-v1')).data.ideas[0].deadline.time,'17:00');
  run("openEntryDeadline(ideas[0]);ideas[0].content='Concurrent'");get('entryDeadlineSave').click();assert.match(get('entryDeadlineError').textContent,/zmienił się/);
  run('openEntryDeadline(ideas[0])');get('entryDeadlineRemove').click();assert.equal(run('ideas[0].deadline'),undefined);assert.equal(get('taskList').querySelectorAll('.entry-deadline-row').length,0);
  run("openEntryDeadline(ideas[0],{date:'2026-10-10'})");assert.equal(get('entryDeadlineTime').value,'');get('entryDeadlineSave').click();assert.match(get('entryDeadlineError').textContent,/Podaj/);assert.equal(run('ideas[0].deadline'),undefined);
  run("const deadlineSession=beginVoiceDialogue('idea','one',voiceDialogueCurrent('idea','one'));clearVoiceDialogue('idea',true);deadlineTestSession=deadlineSession");
  await run("applyVoiceUiAction(deadlineTestSession,{type:'set_entry_deadline',date:'2026-10-10'})");assert.equal(run('voiceDialogues.idea===deadlineTestSession'),true);assert.match(get('ideaConversation').textContent,/godzinę/);
  await run("applyVoiceUiAction(deadlineTestSession,{type:'set_entry_deadline',date:'2026-10-10',startTime:'19:00'})");assert.equal(get('entryDeadlineTime').value,'19:00');assert.equal(run('ideas[0].deadline'),undefined);
  run("closeIdeaActions();showPlannerWeather=()=>{};tasks[0].sourceEntryId='one';openEventActions(tasks[0])");get('actionMeta').querySelector('button.entry-source-button').click();assert.equal(run('activeIdea.id'),'one');
  run("closeIdeaActions();ideas=[];openEventActions(tasks[0])");assert.equal(get('actionMeta').querySelector('button.entry-source-button').disabled,true);
  console.log('33.16: list append/rename/explicit replacement, rollback, copy block, deadline persistence/conflict/calendar/stale edit/removal, source navigation passed.');
 }finally{dom.window.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
