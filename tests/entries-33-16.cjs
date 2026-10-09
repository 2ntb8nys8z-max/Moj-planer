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
  run("openEntryReminder(ideas[0],{date:'2026-10-09',startTime:'23:59',message:'Kupić mleko'})");get('entryReminderSave').click();assert.deepEqual(JSON.parse(JSON.stringify(run('ideas[0].alarm'))),{date:'2026-10-09',time:'23:59',startTime:'23:59',message:'Kupić mleko',deliveredAt:null});assert.equal(run('tasks.length'),1);assert.equal(get('taskList').querySelectorAll('.entry-deadline-row').length,1);assert.match(get('ideaText').textContent,/Powiadomienie: 2026-10-09/);

  assert.equal(run("voiceDialogueCurrent('idea','one').alarm.message"),'Kupić mleko');
  run("openEntryReminder(ideas[0],{startTime:'21:00'})");
  assert.equal(get('entryReminderDate').value,'2026-10-09');
  assert.equal(get('entryReminderMessage').value,'Kupić mleko');
  assert.equal(run('ideas[0].alarm.time'),'23:59');
  run("ideas[0].alarm.time='00:00';ideas[0].alarm.startTime='00:00';ideas[0].alarm.deliveredAt=null;checkDueEntryReminders()");assert.ok(run('ideas[0].alarm.deliveredAt'));assert.equal(get('taskList').querySelectorAll('.entry-deadline-row').length,0);
  run("ideas[0].alarm={date:'2026-11-07',time:'08:00',message:'Weź leki'};clearVoiceDialogue('idea');timerTestSession=beginVoiceDialogue('idea','one',voiceDialogueCurrent('idea','one'));savedStartTimer=startTimer;timerCalls=[];startTimer=(...args)=>timerCalls.push(args)");
  await run("applyVoiceUiAction(timerTestSession,{type:'start_timer',minutes:25})");assert.equal(run('timerCalls[0][0]'),25);assert.equal(run('timerCalls[0][1].id'),'one');assert.equal(run('timerCalls[0][2]'),true);assert.match(get('ideaConversation').textContent,/25 min/);
  await run("applyVoiceUiAction(timerTestSession,{type:'start_timer'})");assert.match(get('ideaConversation').textContent,/Na ile minut/);assert.equal(run('voiceDialogueValid(timerTestSession)'),true);run('startTimer=savedStartTimer;clearVoiceDialogue(\'idea\')');
  run("removeSession=beginVoiceDialogue('idea','one',voiceDialogueCurrent('idea','one'));removeSession.history.push({role:'user',content:'Usuń przypomnienie'});voiceDialogues.idea=removeSession");
  w.confirm=()=>false;await run("applyVoiceUiAction(removeSession,{type:'remove_entry_reminder'})");assert.ok(run('ideas[0].alarm'));assert.equal(run('voiceDialogues.idea'),run('removeSession'));assert.match(get('ideaConversation').textContent,/Anulowano/);w.confirm=()=>true;await run("applyVoiceUiAction(removeSession,{type:'remove_entry_reminder'})");assert.equal(run('ideas[0].alarm'),undefined);assert.ok(run("ideas[0].history.at(-1).conversation.some(m=>m.content==='Usuń przypomnienie')"));
  run("openEntryReminder(ideas[0])");get('entryReminderRemove').click();assert.equal(run('ideas[0].alarm'),undefined);assert.equal(get('taskList').querySelectorAll('.entry-deadline-row').length,0);
  run("const deadlineSession=beginVoiceDialogue('idea','one',voiceDialogueCurrent('idea','one'));clearVoiceDialogue('idea',true);deadlineTestSession=deadlineSession");
  await run("applyVoiceUiAction(deadlineTestSession,{type:'set_entry_deadline',date:'2026-10-10'})");assert.equal(run('voiceDialogues.idea===deadlineTestSession'),true);assert.match(get('ideaConversation').textContent,/godzinę/);
  await run("applyVoiceUiAction(deadlineTestSession,{type:'set_entry_deadline',date:'2026-10-10',startTime:'19:00'})");assert.equal(get('entryDeadlineTime').value,'19:00');assert.equal(run('ideas[0].deadline'),undefined);
  await run("applyVoiceUiAction(deadlineTestSession,{type:'set_entry_reminder',date:'2026-11-07',startTime:'08:00',message:'Lek'} )");assert.equal(get('entryReminderDate').value,'2026-11-07');assert.equal(get('entryReminderTime').value,'08:00');assert.equal(get('entryReminderMessage').value,'Lek');assert.equal(run('ideas[0].alarm'),undefined);

  // Exercise request -> session teardown -> command -> next turn in both UI channels.
  run("savedPlannerApiRequest=plannerApiRequest");
  for(const channel of ['idea','main']){
    run("clearVoiceDialogue('idea');clearVoiceDialogue('main');pendingVoiceItem=null");
    if(channel==='main')run('closeIdeaActions()');
    run(`partialSession=beginVoiceDialogue('${channel}',${channel==='idea'?"'one'":"null"},voiceDialogueCurrent('${channel}', 'one'))`);
    run("plannerApiRequest=async()=>({engine:3,status:'command',uiAction:{type:'set_entry_reminder',date:'2026-11-08',message:'Kup mleko'},dialogueState:{engine:3,mode:'reminder',reminderDraft:{date:'2026-11-08',message:'Kup mleko'}}})");
    await run("requestVoiceDialogue(partialSession,'Przypomnij w niedzielę').then(r=>applyVoiceDialogueResult(partialSession,r))");
    assert.equal(run('voiceDialogueValid(partialSession)'),true);
    assert.ok(get(channel==='idea'?'ideaClarification':'mainClarification'));
    run("plannerApiRequest=async()=>({engine:3,status:'command',uiAction:{type:'set_entry_reminder',startTime:'18:00'},dialogueState:{engine:3,mode:'reminder',reminderDraft:{date:'2026-11-08',startTime:'18:00',message:'Kup mleko'}}})");
    await run("requestVoiceDialogue(partialSession,'O 18').then(r=>applyVoiceDialogueResult(partialSession,r))");
    if(channel==='idea'){
      assert.equal(get('entryReminderDate').value,'2026-11-08');
      assert.equal(get('entryReminderTime').value,'18:00');
      assert.equal(run('ideas[0].alarm'),undefined);
    }else{
      assert.equal(run('pendingVoiceItem.date'),'2026-11-08');
      assert.equal(run('pendingVoiceItem.time'),'18:00');
      assert.equal(run('ideas.length'),1);
    }
  }
  run("plannerApiRequest=savedPlannerApiRequest;pendingVoiceItem=null");
  run("closeIdeaActions();standaloneSession=beginVoiceDialogue('main',null,null);voiceDialogues.main=standaloneSession");await run("applyVoiceUiAction(standaloneSession,{type:'set_entry_reminder',date:'2026-11-07',startTime:'08:00',message:'Weź leki'})");assert.equal(get('previewTitle').textContent,'Weź leki');assert.equal(run('voiceDialogues.main'),null);get('confirmVoice').click();assert.equal(run('ideas[0].text'),'Weź leki');assert.equal(run('ideas[0].alarm.date'),'2026-11-07');assert.equal(run('ideas[0].alarm.time'),'08:00');assert.equal(run('tasks.length'),1);
  // Moving a note to Calendar keeps its title, full text, notes and dated additions in the event draft.
  run("closeIdeaActions();clearVoiceDialogue('idea');ideas=[{id:'one',title:'Odpowiedź na maila',text:'Odpowiedź na maila',content:'Treść właściwa',notes:'Dodatkowa notatka',additions:[{text:'Dopisek po rozmowie',createdAt:'2026-10-09T11:00:00Z'}]}];activeIdea=ideas[0];openIdeaActions(ideas[0]);sourceSession=beginVoiceDialogue('idea','one',voiceDialogueCurrent('idea','one'));sourceSession.history.push({role:'user',content:'Wrzuć tę notatkę do kalendarza na poniedziałek o 6 rano.'})");await run("applyVoiceUiAction(sourceSession,{type:'open_create_event',date:'2026-10-12',startTime:'06:00'})");
  assert.equal(run("voiceDialogues.idea.dialogueState.draft.title"),'Odpowiedź na maila');
  assert.equal(run("voiceDialogues.idea.dialogueState.draft.date"),'2026-10-12');
  assert.equal(run("voiceDialogues.idea.dialogueState.draft.startTime"),'06:00');
  assert.equal(run("document.getElementById('ideaModal').classList.contains('hidden')"),false);assert.match(get('ideaConversation').textContent,/skończyć/);
  const copiedEventNotes=run("voiceDialogues.idea.dialogueState.draft.notes");
  assert.match(copiedEventNotes,/Treść właściwa/);assert.match(copiedEventNotes,/Dodatkowa notatka/);assert.match(copiedEventNotes,/Dopisek po rozmowie/);
  run("savedPlannerApiRequest=plannerApiRequest;eventRequestPayload=null;eventCreateSession=voiceDialogues.idea;plannerApiRequest=async(path,options)=>{eventRequestPayload=JSON.parse(options.body);return {engine:3,status:'review',item:{type:'event',title:'Odpowiedź na maila',date:'2026-10-12',startTime:'06:00',endTime:'07:00',notes:eventRequestPayload.dialogueState.draft.notes}}}");await run("requestVoiceDialogue(eventCreateSession,'Do 7:00').then(r=>r&&applyVoiceDialogueResult(eventCreateSession,r))");
  assert.equal(run('eventRequestPayload.dialogueState.draft.date'),'2026-10-12');assert.equal(run('eventRequestPayload.dialogueState.draft.startTime'),'06:00');assert.equal(run('eventRequestPayload.dialogueState.draft.title'),'Odpowiedź na maila');assert.equal(run('pendingVoiceItem.endTime'),'07:00');assert.equal(run("document.getElementById('ideaModal').classList.contains('hidden')"),true);run("plannerApiRequest=savedPlannerApiRequest");
  run("clearVoiceDialogue('main');clearVoiceDialogue('idea')");
  run("closeIdeaActions();showPlannerWeather=()=>{};tasks[0].sourceEntryId='one';openEventActions(tasks[0])");get('actionMeta').querySelector('button.entry-source-button').click();assert.equal(run('activeIdea.id'),'one');
  run("closeIdeaActions();ideas=[];openEventActions(tasks[0])");assert.equal(get('actionMeta').querySelector('button.entry-source-button').disabled,true);
  console.log('33.20: lists, deadline, reminder, voice timer/removal, in-entry calendar clarification, copy block and source navigation passed.');
 }finally{dom.window.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
