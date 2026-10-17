import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,run=source=>vm.runInContext(source,dom.getInternalVMContext()),get=id=>w.document.getElementById(id);
const settle=()=>new Promise(resolve=>setImmediate(resolve)),nativeDialogs=[],copies=[];
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,confirm:message=>{nativeDialogs.push(message);return true},alert:message=>nativeDialogs.push(message),fetch:async()=>new Response('{}')});
Object.defineProperty(w,'matchMedia',{value:query=>({matches:!query.includes('min-width'),media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}),configurable:true});
Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async value=>copies.push(value)},configurable:true});
w.HTMLElement.prototype.scrollIntoView=function(){};
w.HTMLMediaElement.prototype.pause=function(){};
w.HTMLMediaElement.prototype.load=function(){};
run(fs.readFileSync('sync-core.js','utf8'));
for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);

const openSession=()=>run(`clearVoiceDialogue('event');openEventActions(tasks[0]);testEventSession=beginVoiceDialogue('event',activeTask.id,voiceDialogueCurrent('event',activeTask.id));testEventSession`);
const assertNoDetachedReminder=message=>{
 assert.equal(run('tasks.length'),2,message+': no separate calendar event');
 assert.equal(run('ideas.length'),1,message+': no separate note/alarm');
 assert.equal(JSON.stringify(run('ideas')),ideaSnapshot,message+': existing note is untouched');
 assert.equal(run('pendingVoiceItem'),null,message+': no separate reminder proposal');
 assert.equal(get('aiPreview').classList.contains('hidden'),true,message+': day-axis reminder preview stays closed');
 assert.equal(run('tasks[1].reminder??null'),null,message+': another calendar event is untouched');
};
let ideaSnapshot;

try{
 run(`showPlannerWeather=async()=>{};selected=new Date('2026-10-12T12:00:00');tasks=[{id:'open-event',title:'Spotkanie projektowe',date:'2026-10-12',time:'12:00',endTime:'13:00',location:'Rynek 1, Dresden',notes:'Starsza zachowana notatka',createdAt:'2026-10-11T09:05:00.000Z'},{id:'other-event',title:'Nie zmieniaj',date:'2026-10-12',time:'16:00',endTime:'17:00'}];ideas=[{id:'untouched-entry',title:'Wpis poza wydarzeniem',text:'Treść',alarm:{date:'2026-10-12',time:'18:00',message:'Nie zmieniaj'}}];pendingVoiceItem=null;renderAll();showView('day');openEventActions(tasks[0]);`);
 await settle();ideaSnapshot=JSON.stringify(run('ideas'));
 assert.equal(get('eventHeader').contains(get('eventHistory')),true,'the original history button is beside the event close button in the header');
 assert.equal(typeof get('eventHistory').onclick,'function','the existing history handler remains actionable');
 assert.match(get('eventHeaderMeta').textContent,/2026-10-12/);
 assert.match(get('eventHeaderMeta').textContent,/12:00.*13:00/);
 assert.equal(get('eventReminderBadge').classList.contains('hidden'),true,'events without an assigned reminder hide the large bell');
 assert.equal(get('eventContent').contains(get('eventNotesCards')),true,'note cards stay in the event content scroll region');
 const legacyCard=get('eventNotesCards').querySelector('.event-note-card');
 assert.ok(legacyCard,'old notes remain visible as a rounded note card');
 assert.match(legacyCard.querySelector('.event-note-text').textContent,/Starsza zachowana notatka/);
 assert.ok(legacyCard.querySelector('.event-note-date').textContent.trim(),'legacy notes retain an available timestamp');
 legacyCard.querySelector('.event-note-copy').click();await settle();
 assert.equal(copies.at(-1),'Starsza zachowana notatka','the single copy button copies all available note text');

 openSession();
 await run(`applyVoiceUiAction(testEventSession,{type:'set_event_reminder',eventId:'open-event',minutesBefore:15},'Ustawiono przypomnienie.')`);await settle();
 assert.equal(run('tasks[0].reminder.minutesBefore'),15,'an explicit event reminder is saved immediately');
 assertNoDetachedReminder('Immediate event reminder');
 assert.equal(get('eventReminderBadge').classList.contains('hidden'),false);
 assert.match(get('eventReminderBadge').textContent,/15/);
 assert.equal(w.document.querySelectorAll('.phone-event-reminder-icon').length,1,'only the event with an assigned reminder gets a small time-row bell');
 const a=w.document.querySelector('.phone-event[data-event-id="open-event"]').nextElementSibling;
 assert.ok(a.querySelector('.phone-event-time .phone-event-reminder-icon'),'the bell is next to the event hours');
 assert.ok(a.querySelector('.phone-event-time .phone-event-location-icon'),'the location icon stays beside the hours for an event with location');
 assert.equal(w.document.querySelector('.phone-event[data-event-id="other-event"]').nextElementSibling.querySelector('.phone-event-location-icon'),null,'events without location never show the pin');

 // The unknown offset is the only question; the same conversation owns the
 // following answer and never asks for date, clock time or reminder text.
 openSession();
 await run(`applyVoiceUiAction(testEventSession,{type:'set_event_reminder'})`);await settle();
 assert.equal(run('testEventSession.history.at(-1).content'),'Ile minut przed wydarzeniem mam przypomnieć?');
 assertNoDetachedReminder('Missing event reminder offset');
 assert.ok(get('eventReplyDock').contains(get('eventClarification')),'the follow-up answer uses the event footer');
 await run(`applyVoiceUiAction(testEventSession,{type:'set_event_reminder',eventId:'open-event',minutesBefore:30},'Zmieniono przypomnienie.')`);await settle();
 assert.equal(run('tasks[0].reminder.minutesBefore'),30,'the next turn changes the reminder on the same event');
 assertNoDetachedReminder('Multi-turn event reminder');

 // Legacy Workers may still return a note-reminder action. The event context
 // must bind it to the active event, despite the unrelated supplied message.
 openSession();
 await run(`applyVoiceUiAction(testEventSession,{type:'set_entry_reminder',date:'2026-10-12',startTime:'11:45',message:'Nie twórz osobnego alarmu'})`);await settle();
 assert.equal(run('tasks[0].reminder.minutesBefore'),15,'legacy absolute reminder clock time is converted to an event offset');
 assertNoDetachedReminder('Legacy set_entry_reminder event guard');

 openSession();
 await run(`applyVoiceUiAction(testEventSession,{type:'remove_event_reminder'})`);await settle();
 assert.equal(run('tasks[0].reminder??null'),null,'reminder removal affects the current event');
 assert.equal(get('eventReminderBadge').classList.contains('hidden'),true,'removing the assigned reminder hides the detail bell');
 assert.equal(w.document.querySelectorAll('.phone-event-reminder-icon').length,0,'removing the reminder also removes the day-card bell');
 assertNoDetachedReminder('Event reminder removal');

 // A delayed/stale response naming another event cannot use its identifier as
 // a way to change an event outside the currently open window.
 openSession();
 await run(`applyVoiceUiAction(testEventSession,{type:'set_event_reminder',eventId:'other-event',minutesBefore:10})`);await settle();
 assert.equal(run('tasks[0].reminder??null'),null,'a stale response with a different event ID cannot change the open event');
 assertNoDetachedReminder('Wrong event ID reminder guard');

 // Every event-context action is guarded, including a stale navigation/create
 // response from an older Worker. It cannot create another entry or leave the
 // active calendar event for another result.
 for(const action of [{type:'open_create_event',query:'Osobne wydarzenie'},{type:'shopping_summary'},{type:'find_entry',query:'Wpis poza wydarzeniem'}]){
  openSession();w.testGuardedAction=action;
  await run(`applyVoiceUiAction(testEventSession,testGuardedAction)`);await settle();
  assertNoDetachedReminder('Event-context '+action.type);
  assert.equal(run('activeTask.id'),'open-event','an unrelated action keeps the active event');
  assert.equal(get('eventModal').classList.contains('hidden'),false,'an unrelated action does not close the event');
 }

 // The existing note is missing endDate. It is nevertheless a valid same-day
 // event, and the proposed append is confirmed inline without a legacy popup.
 const priorNotes=run('tasks[0].notes');
 run(`testNoteChange=processEventVoiceResult({transcription:'Dopisz notatkę: Nowa notatka głosowa',item:{type:'event',changedFields:['notes'],notesAction:'append',notesAddition:'Nowa notatka głosowa'}},tasks[0].id)`);
 await settle();
 assert.equal(get('eventChangePreview').classList.contains('hidden'),false,'the ordinary note proposal appears inside the current event');
 assert.equal(get('eventContent').contains(get('eventChangePreview')),true,'the inline proposal belongs to the event body');
 assert.equal(get('eventModal').classList.contains('hidden'),false,'the event stays open while confirming its change');
 assert.equal(get('eventRecurrencePreview').classList.contains('hidden'),true,'an ordinary note never opens the old recurrence popup');
 assert.equal(run('tasks[0].notes'),priorNotes,'the note is unchanged before its inline confirmation');
 get('eventChangeConfirm').click();await run('testNoteChange');await settle();
 assert.match(run('tasks[0].notes'),/Starsza zachowana notatka\nNowa notatka głosowa/);
 assert.equal(run('tasks.length'),2,'the new voice note remains attached to its event');
 assert.equal(JSON.stringify(run('ideas')),ideaSnapshot,'the new voice note creates no separate idea');
 const noteCards=[...get('eventNotesCards').querySelectorAll('.event-note-card')],noteItems=[...get('eventNotesCards').querySelectorAll('.event-note-item')];
 assert.equal(noteCards.length,1,'all note additions share one glass card');
 const added=noteItems.find(item=>item.querySelector('.event-note-text').textContent==='Nowa notatka głosowa');
 assert.ok(added,'the appended note receives its own separated entry');
 assert.match(added.querySelector('.event-note-date').textContent,/\d{1,2}[:.]\d{2}/,'the new entry displays a readable added time');
 noteCards[0].querySelector('.event-note-copy').click();await settle();
 assert.equal(copies.at(-1),'Starsza zachowana notatka\n\nNowa notatka głosowa');
 assert.ok(run('tasks[0].noteCards.length>=2'),'modern note metadata includes both preserved and new content');
 const afterConfirm=run('tasks[0].notes');
 run(`testNoteCancel=processEventVoiceResult({item:{type:'event',changedFields:['notes'],notesAction:'append',notesAddition:'Nie zapisuj tej notatki'}},tasks[0].id)`);await settle();
 get('eventChangeCancel').click();await run('testNoteCancel');await settle();
 assert.equal(run('tasks[0].notes'),afterConfirm,'inline cancellation does not append a note');
 assert.deepEqual(nativeDialogs,[],'event reminders and ordinary notes never use native alert/confirm dialogs');

 // The original history button still opens history after its visual relocation.
 get('eventHistory').click();assert.equal(get('historyModal').classList.contains('hidden'),false);
 console.log('Event reminder UI 33.57: immediate set/change/remove, sole missing-offset question, same-event multi-turn ownership, legacy note-reminder guard, no detached alarm/note, header/history, conditional tile icons, timestamped copyable note cards, legacy endDate and inline confirm/cancel passed.');
}finally{dom.window.close()}
