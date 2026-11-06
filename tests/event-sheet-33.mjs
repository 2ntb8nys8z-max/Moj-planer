import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {JSDOM}=createRequire(import.meta.url)('jsdom');

const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,context=dom.getInternalVMContext(),run=source=>vm.runInContext(source,context),get=id=>w.document.getElementById(id);
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const maps=[];
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,confirm:()=>true,alert(){},fetch:async()=>new Response('{}'),open:(...args)=>maps.push(args)});
w.HTMLElement.prototype.scrollIntoView=function(){};
w.HTMLMediaElement.prototype.pause=function(){};
w.HTMLMediaElement.prototype.load=function(){};
run(fs.readFileSync('sync-core.js','utf8'));
for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);

try{
 w.document.querySelector('.app').inert=false;
 run(`tasks=[{id:'event-sheet',title:'Spotkanie projektowe',date:'2026-10-12',time:'12:00',endTime:'13:00',location:'Rynek 1, Dresden',notes:'Szczegóły wydarzenia'}];showPlannerWeather=async()=>{};openEventActions(tasks[0]);`);
 await settle();
 const sheet=get('eventModal').querySelector('.event-sheet'),header=get('eventHeader'),main=get('eventMainRegion'),content=get('eventContent'),panel=get('eventConversationPanel'),footer=get('eventFooter');
 // A rendered video frame and animated menu hints must not rebuild controls
 // while a finger is down. Header identity is necessary for Safari click delivery.
 const timeIcon=get('eventTime').firstChild,dateText=get('eventDate').firstChild,locationText=get('eventLocationText').firstChild;
 const stage=footer.querySelector('.octi-dock .stage');
 for(let frame=0;frame<12;frame++){stage.classList.add('artwork-frame');await settle()}
 assert.equal(get('eventTime').firstChild,timeIcon,'Artwork frames do not replace the time control');
 assert.equal(get('eventDate').firstChild,dateText,'Artwork frames do not replace the date text');
 assert.equal(get('eventLocationText').firstChild,locationText,'Artwork frames do not replace location text');
 assert.ok(sheet,'the event opens as a dedicated event sheet');
 assert.equal(get('eventModal').getAttribute('role'),'dialog');
 for(const node of [header,main,panel,footer])assert.equal(node.parentElement,sheet,'header, main, conversation and communication footer are separate sheet regions');
 assert.equal(get('actionTitle').parentElement.className,'event-header-top','the event title uses the dedicated opaque top row');
 assert.equal(header.contains(get('actionTitle')),true);
 assert.equal(header.contains(get('closeEvent')),true);assert.equal(get('eventActionsMenu').contains(get('eventConversationToggle')),true,'collapsed conversation can reopen from the secondary actions menu');assert.equal(get('eventHeaderActions').querySelectorAll('button').length,2,'only more and close remain in the event header');
 assert.equal(get('eventDate').textContent,'12 października 2026');
 assert.match(get('eventHeaderMeta').textContent,/12:00.*13:00/);
 for(const id of ['actionMeta','eventWeather','navigateBtn','eventEditBox','timerBox'])assert.equal(content.contains(get(id)),true,`${id} stays in the independently scrolling event content`);
 for(const id of ['eventVoice','eventVoiceCountdown','eventRecordCancel','eventVoiceHint'])assert.equal(footer.contains(get(id)),true,`${id} stays in the stationary communication footer`);
 assert.ok(get('eventVoiceHint').classList.contains('octi-legacy'),'legacy event recording hint remains hidden behind the glass dock');
 assert.equal(panel.contains(get('eventReplyDock')),true,'the dormant typed reply belongs to the glass conversation frame');
 assert.equal(get('eventTextForm').classList.contains('hidden'),true,'the typed event command is not permanently visible');
 assert.equal(w.getComputedStyle(content).overflowY,'auto');
 assert.equal(w.getComputedStyle(get('eventConversationBody')).overflowY,'auto');
 assert.equal(header.contains(get('eventActionsToggle')),true,'secondary event actions use the header more button instead of another plus');
 assert.equal(main.contains(get('eventActionsMenu')),true);
 assert.equal(footer.contains(get('eventActionsToggle')),false);
 assert.equal(panel.contains(get('eventActionsToggle')),false);
 assert.match(get('eventLocationText').textContent,/Rynek 1, Dresden/);
 get('navigateBtn').click();
 assert.equal(maps.length,1,'the existing navigation button handler still executes');
 assert.equal(maps[0][0],'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent('Rynek 1, Dresden'));

 const originalHandlers=Object.fromEntries(['actionDone','actionEdit','actionTimer','actionDelete','eventVoice','eventRecordCancel','navigateBtn'].map(id=>[id,get(id).onclick]));
 for(const [id,handler] of Object.entries(originalHandlers))assert.equal(typeof handler,'function',`${id} retains its original actionable handler`);
 assert.equal(get('eventVoice').classList.contains('event-voice-idle'),true,'the idle microphone receives its presentation label');
 const noteCard=get('eventNotesCards').firstElementChild,noteCopy=noteCard.querySelector('button');
 const artwork=footer.querySelector('.octi-motion-media');
 noteCopy.focus();
 for(let frame=0;frame<5;frame++){artwork.classList.toggle('is-rendered',frame%2===0);await settle()}
 assert.equal(get('eventNotesCards').firstElementChild,noteCard,'Artwork updates must not replace the note during touch');
 assert.equal(w.document.activeElement,noteCopy,'Artwork updates preserve focused copy control');
 run("activeTask.notes='Zmieniona notatka';renderEventContextDetails(activeTask)");await settle();
 assert.match(get('eventNotesCards').textContent,/Zmieniona notatka/,'Real note changes still render');
 assert.notEqual(get('eventNotesCards').firstElementChild,noteCard);
 get('eventVoice').textContent='Wyślij';get('eventVoice').classList.add('recording');await settle();
 assert.equal(get('eventVoice').classList.contains('event-voice-idle'),false,'the recording send button never displays the idle microphone label');
 get('eventVoice').classList.remove('recording');await settle();
 assert.equal(get('eventVoice').classList.contains('event-voice-idle'),false,'a prepared recording keeps the plain send label');
 run(`resetRecordingUi('event');`);await settle();
 assert.equal(get('eventVoice').textContent,'🎤');
 assert.equal(get('eventVoice').classList.contains('event-voice-idle'),true,'the existing recording reset restores the idle microphone presentation');
 get('eventActionsToggle').click();
 assert.equal(get('eventActionsToggle').getAttribute('aria-expanded'),'true');
 assert.equal(get('eventActionsMenu').classList.contains('hidden'),false);
 for(const id of ['actionDone','actionEdit','actionTimer','actionDelete'])assert.equal(get('eventActionsMenu').contains(get(id)),true,`${id} remains the original actionable button`);
 get('actionEdit').click();
 assert.equal(get('eventEditBox').classList.contains('hidden'),false,'the original manual edit action still opens the editor');
 get('eventActionsToggle').click();
 get('actionTimer').click();
 assert.equal(get('timerBox').classList.contains('hidden'),false,'the original timer action still opens the timer');
 assert.equal(get('eventEditBox').classList.contains('hidden'),true);
 for(const [id,handler] of Object.entries(originalHandlers))assert.equal(get(id).onclick,handler,`${id} retains its existing handler`);

 run(`eventSheetSession=beginVoiceDialogue('event',activeTask.id,voiceDialogueCurrent('event',activeTask.id));eventSheetSession.history=[{role:'user',content:'Przesuń spotkanie'},{role:'assistant',content:'Na którą godzinę?'}];eventSheetSession.dialogueState={engine:3,draft:{title:'Spotkanie projektowe'}};showVoiceClarification(eventSheetSession,'Na którą godzinę?');`);
 const conversation=get('eventConversation'),reply=get('eventClarification'),input=reply.querySelector('input'),replyButtons=[...reply.querySelectorAll('button')],replyHandlers=replyButtons.map(button=>button.onclick),session=run('voiceDialogues.event'),history=run('voiceDialogues.event.history'),draft=run('voiceDialogues.event.dialogueState');
 input.value='O 14:30';
 await settle();
 assert.equal(get('eventConversationBody').contains(conversation),true,'the generated conversation node moves into its own scrolling panel');
 assert.equal(get('eventReplyDock').contains(reply),true,'the original clarification node stays in the reply dock');
 assert.equal(panel.classList.contains('hidden'),false,'a new conversation opens the separate conversation panel');assert.equal(panel.contains(get('eventReplyDock')),true,'reply and history share the glass frame');assert.ok(get('eventConversationTools').contains(replyButtons[0]),'original keyboard is moved inside the frame');assert.equal(get('eventConversationTools').contains(get('closeEventConversation')),true);assert.equal(panel.classList.contains('octi-chat-frame'),true);assert.equal(replyButtons[0].onclick,replyHandlers[0]);
 get('closeEventConversation').click();
 await settle();
 assert.equal(panel.classList.contains('hidden'),true,'closing the conversation only collapses its panel');
 assert.equal(run('voiceDialogues.event'),session);
 assert.equal(run('voiceDialogues.event.history'),history);
 assert.equal(run('voiceDialogues.event.dialogueState'),draft);
 assert.equal(get('eventConversation'),conversation,'closing the panel preserves the generated conversation node');
 assert.equal(get('eventClarification'),reply,'closing the panel preserves the generated reply node');
 assert.equal(input.value,'O 14:30');
 get('eventConversationToggle').click();
 await settle();
 assert.equal(panel.classList.contains('hidden'),false,'the footer can reopen the same conversation');
 assert.equal(get('eventClarification').querySelector('input'),input);
 assert.equal(input.value,'O 14:30');
 for(let index=0;index<replyButtons.length;index++)assert.equal(replyButtons[index].onclick,replyHandlers[index],'moving the clarification preserves original reply handlers');
 get('closeEventConversation').click();
 run(`eventSheetSession.history.push({role:'assistant',content:'Nowa wiadomość'});renderVoiceConversation(eventSheetSession);`);
 await settle();
 assert.equal(panel.classList.contains('hidden'),false,'new messages reveal the previously collapsed conversation');
 assert.equal(get('eventConversation'),conversation);
 assert.match(conversation.textContent,/Nowa wiadomość/);

 // The real recurrence transition temporarily replaces the event sheet with its
 // existing confirmation modal. Closing that modal must not strand an inert app.
 run(`tasks[0].endDate=tasks[0].date;clearVoiceDialogue('event');openEventActions(tasks[0]);`);await settle();
 await run(`processEventVoiceResult({item:{type:'event',changedFields:['recurrence'],recurrenceAction:'create',recurrence:{frequency:'weekly',interval:1,count:3}}},tasks[0].id)`);
 await settle();
 assert.equal(get('eventModal').classList.contains('hidden'),false,'event-scoped commands stay in the current event interface');
 assert.equal(get('eventRecurrencePreview').classList.contains('hidden'),true,'a scoped command cannot create a separate recurrence flow');
 assert.equal(run('tasks.length'),1,'only the open event remains');
 assert.match(get('eventConversation').textContent,/tylko to wydarzenie/);

 get('closeEvent').querySelector('path').dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));
 assert.equal(get('eventModal').classList.contains('hidden'),true,'the original event close action still closes the sheet');
 assert.equal(run('voiceDialogues.event'),null,'closing the whole event retains the original dialogue cleanup');
 run(`openEventActions(tasks[0]);`);await settle();
 get('eventActionsToggle').click();get('actionDone').click();
 assert.equal(run('tasks[0].done'),true,'the original completed action still persists the event');
 assert.equal(get('eventModal').classList.contains('hidden'),true);
 run(`openEventActions(tasks[0]);`);await settle();
 get('eventActionsToggle').click();get('actionDelete').click();
 await settle();
 assert.equal(run('tasks.length'),0,'the original delete action still deletes its event');

 run(`tasks=[{id:'google-readonly',title:'Zadanie Google',date:'2026-10-12',time:'12:00',endTime:'13:00',notes:'https://tasks.google.com/task/example'}];openEventActions(tasks[0]);`);await settle();
 assert.equal(footer.classList.contains('hidden'),true,'read-only Google tasks hide the communication footer');
 assert.equal(get('eventActionsToggle').classList.contains('hidden'),false,'read-only Google tasks retain the history menu');assert.equal(get('eventActionsMenu').contains(get('eventHistory')),true,'read-only history stays reachable through more actions');get('eventActionsToggle').click();assert.equal(get('eventHistory').classList.contains('hidden'),false);get('eventHistory').click();assert.equal(get('historyModal').classList.contains('hidden'),false,'the original history handler still works for a read-only Google task');
 assert.equal(panel.classList.contains('hidden'),true);
 for(const id of ['actionDone','actionEdit','actionTimer','actionDelete'])assert.equal(get(id).classList.contains('hidden'),true,`${id} remains hidden for read-only Google tasks`);
 // The flight is presentation only. Closing releases the logical event now;
 // a replacement opening cannot be hidden by an old animation's completion.
 run("closeEventActions();tasks=[{id:'flight-one',title:'Wymiana opon',date:'2026-10-12',time:'17:00',endTime:'18:00'},{id:'flight-two',title:'Drugie',date:'2026-10-12',time:'19:00',endTime:'20:00'}];selected=new Date('2026-10-12T12:00:00');showView('day')");await settle();
 const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height,x:left,y:top});
 sheet.getBoundingClientRect=()=>rect(12,12,366,170);get('taskList').getBoundingClientRect=()=>rect(0,250,390,400);
 for(const tile of get('taskList').querySelectorAll('[data-event-id]')){tile.getBoundingClientRect=()=>rect(80,400,180,67);for(const n of [...tile.querySelectorAll('.task-title,.task-time'),...(tile.nextElementSibling?.querySelectorAll('.phone-event-title-text,.phone-event-time')||[])])n.getBoundingClientRect=()=>rect(90,410,160,20)}
 get('actionTitle').getBoundingClientRect=()=>rect(28,27,240,34);get('eventTime').getBoundingClientRect=()=>rect(28,110,130,36);
 const animations=[];w.HTMLElement.prototype.animate=function(frames,options){let finish;const a={target:this,frames,options,finished:new Promise(resolve=>{finish=resolve}),cancel(){finish()},finish(){finish()}};animations.push(a);return a};
 run('openEventActions(tasks[0])');assert.equal(w.OktiEventMotion.getState().closing,false);assert.ok(animations.some(a=>a.options.duration===1280));assert.ok(get('eventModal').querySelector('.okti-event-flight-label'));
 get('eventModal').querySelector('.okti-event-dim').style.opacity='.4';run('closeEventActions()');assert.equal(animations.filter(a=>a.target.classList.contains('okti-event-dim')).at(-1).frames[0].opacity,.4,'Interrupted opening fades from its current shade');get('eventModal').querySelector('.okti-event-dim').style.opacity='';assert.equal(run('activeTask'),null);assert.equal(get('eventModal').classList.contains('hidden'),true);assert.equal(get('eventModal').classList.contains('okti-event-exiting'),true);assert.equal(get('eventModal').inert,true);assert.equal(w.OktiEventMotion.getState().closing,true);
 run('openEventActions(tasks[1])');await settle();assert.equal(run('activeTask.id'),'flight-two');assert.equal(get('eventModal').classList.contains('hidden'),false);assert.equal(get('eventModal').classList.contains('okti-event-exiting'),false);assert.equal(!!get('eventModal').inert,false);
 w.OktiEventMotion.stop();assert.equal(get('eventModal').querySelector('.okti-event-flight-label'),null);assert.equal(get('actionTitle').style.visibility,'');
 // Accepted presentation contract: event identity controls the whole palette,
 // and the last stage crossfades to the original nodes rather than swapping them.
 const timing=animations.find(a=>a.target.classList.contains('okti-event-flight-band')&&a.frames.some(frame=>frame.opacity===.93));
 assert.ok(timing&&timing.options.duration===280,'the dark title backing arrives at the start of the flight');
 assert.ok(animations.some(a=>a.target.matches('[data-event-id]')&&a.options.delay===970&&a.options.duration===180),'the real tile receives a short handoff before the close completes');
 const panelFlights=animations.filter(a=>a.target.classList.contains('okti-event-flight-panel')&&a.frames.some(frame=>frame.width));
 assert.ok(panelFlights.length>0&&panelFlights.every(a=>a.frames.every(frame=>!frame.transform)),'rounded panel geometry must not be flattened by nonuniform scaling');
 for(const [title,palette] of [['Śniadanie','sand'],['Spacer','blue'],['Telefon','rose'],['Obiad','sage']]){
  w.colorSample={id:'palette-'+palette,title,date:'2026-10-12',time:'12:00',endTime:'13:00'};
  run('openEventActions(colorSample)');assert.equal(get('eventModal').dataset.eventPalette,palette,'the event sheet must retain the tile color family');
  run('closeEventActions()');assert.equal(run('activeTask'),null,'the longer exit never delays logical event cleanup');w.OktiEventMotion.stop();
 }

 run('openEventActions(tasks[1])');w.OktiEventMotion.stop();
 // One main artwork controller stays visible through event context changes
 // and follows the existing event recorder; the second renderer stays asleep.
 const updates=[];w.createOctiListeningArtwork=()=>({update:s=>updates.push(s)});
 run("artRoot=document.createElement('div');artRoot.dataset.channel='main';artRoot.dataset.mode='idle';document.body.append(artRoot);artRoot.getClientRects=()=>[{}];artUpdate=octiMotionArtwork(artRoot,artRoot,null);artUpdate()");assert.equal(updates.at(-1).visible,true);
 run("plannerRecordings.event={mode:'recording'};artUpdate();plannerRecordings.event=null");assert.equal(updates.at(-1).isRecording,true);
 run("artRoot.dataset.channel='event';artUpdate()");assert.equal(updates.at(-1).visible,false);
 w.matchMedia=()=>({matches:true});run('closeEventActions();openEventActions(tasks[0]);closeEventActions()');assert.equal(w.OktiEventMotion.getState(),null);assert.equal(get('eventModal').classList.contains('okti-event-exiting'),false);assert.equal(w.document.body.classList.contains('okti-event-transitioning'),false);
 console.log('Event sheet: preserved controls/dialogue, artwork mutation isolation, notes, navigation, recorder lifecycle, shared-artwork ownership, flight/close/reopen interruption cleanup and reduced motion passed (animation geometry and graphics simulated).');
}finally{dom.window.close()}
