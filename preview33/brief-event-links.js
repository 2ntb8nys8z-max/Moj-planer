// References belong to one briefing and one conversation; calendar data stays read-only.
window.OktiBriefLinks=(()=>{
 const ttl=10*60*1000,allowed=new Set(['day_brief_complete','brief_event_choices','brief_event_opened','brief_reference_expired']);
 let current=null;
 function operation(session,status){session.lastOperation={status};session.dialogueState={...(session.dialogueState||{}),lastOperation:session.lastOperation}}
 function remember(model,session){
  session=session||(voiceDialogues.main&&voiceDialogueValid(voiceDialogues.main)?voiceDialogues.main:null);
  if(session&&session.channel!=='main')return;
  const referenced=model.displayWarnings||(model.travel?.warnings||[]).slice(0,3);
  const warningIds=[...new Set(referenced.flatMap(w=>w.eventIds||[]))];
  const records=model.records.filter(r=>r.type==='event'&&r.item?.id!=null);
  const ordered=[...records.filter(r=>warningIds.includes(r.item.id)),...records.filter(r=>!warningIds.includes(r.item.id))].slice(0,12);
  const entries=ordered.map((r,i)=>({key:'b'+i,id:r.item.id,snapshot:JSON.stringify(r.item),record:r}));
  const token=crypto.randomUUID(),focusKeys=entries.filter(e=>warningIds.includes(e.id)).map(e=>e.key);
  current={token,owner:session,at:Date.now(),entries,context:{token,candidates:entries.map(e=>({key:e.key,title:String(e.record.title||'Wydarzenie').slice(0,150),date:e.record.item.date,time:e.record.item.time||e.record.item.startTime||''})),focusKeys}};
  if(session){session.lastOperation={status:'day_brief_complete',date:model.date,briefMode:model.mode};session.dialogueState={...(session.dialogueState||{}),lastOperation:session.lastOperation};attach(session)}
 }
 function attach(session){
  if(session?.channel!=='main')return;
  const status=(session.lastOperation||session.dialogueState?.lastOperation)?.status;
  if(!current||current.owner&&current.owner!==session||status&&!allowed.has(status)){
   if(session.dialogueState)delete session.dialogueState.briefEventContext;return;
  }
  if(!current.owner){
   if(session.history?.length||Object.keys(session.dialogueState?.draft||{}).length)return;
   current.owner=session;operation(session,'day_brief_complete');
  }
  const expired=Date.now()-current.at>ttl||Date.now()<current.at;
  session.dialogueState={...(session.dialogueState||{}),briefEventContext:expired?{token:current.token,expired:true}:current.context};
 }
 function entry(key){
  const saved=current?.entries.find(e=>e.key===key);if(!saved)return null;
  const matches=tasks.filter(t=>t.id===saved.id);
  return matches.length===1&&JSON.stringify(matches[0])===saved.snapshot?{...saved.record,item:matches[0]}:null;
 }
 function stale(session){
  window.OktiDayBriefUI?.cancel();$('entryResultsModal').classList.add('hidden');
  operation(session,'brief_reference_expired');showVoiceClarification(session,'To wskazanie jest już nieaktualne. Poproś o nowe podsumowanie.');
 }
 function open(session,key,token=current?.token){
  if(current?.owner!==session||voiceDialogues.main!==session||JSON.stringify(voiceDialogueCurrent('main',session.id))!==session.snapshot)return;
  if(token!==current.token)return stale(session);
  const record=entry(key);if(!record||Date.now()-current.at>ttl||Date.now()<current.at)return stale(session);
  current.context.focusKeys=[key];operation(session,'brief_event_opened');
  window.OktiDayBriefUI?.cancel();$('entryResultsModal').classList.add('hidden');$('mainClarification')?.remove();
  if(activeIdea)closeIdeaActions();showView('day');selected=new Date(record.item.date+'T12:00:00');$('date').value=record.item.date;renderAll();openEventActions(record.item);
  session.history.push({role:'assistant',content:'Otwieram „'+record.title+'”, '+record.item.date+(record.item.time?' o '+record.item.time:'')+'.'});renderVoiceConversation(session);
 }
 function apply(session,action){
  if(session?.channel!=='main')return;
  if(JSON.stringify(voiceDialogueCurrent(session.channel,session.id))!==session.snapshot)return;
  if(voiceDialogues.main&&voiceDialogues.main!==session)return;
  voiceDialogues.main=session;
  if(!current||current.owner!==session||action.token!==current.token||Date.now()-current.at>ttl||Date.now()<current.at||action.type==='stale_brief_event')return stale(session);
  if(action.type==='open_brief_event')return open(session,action.key);
  const keys=Array.isArray(action.keys)?[...new Set(action.keys)].slice(0,12):[];
  const records=keys.map(entry);if(!keys.length||records.some(r=>!r))return stale(session);
  operation(session,'brief_event_choices');current.context.focusKeys=keys;
  showVoiceClarification(session,'Które spotkanie chcesz zobaczyć?');window.OktiCommunication?.clear(session.channel);showEntryResults(records,'Które spotkanie chcesz zobaczyć?');
  // Validate again on tap: a sync or edit may have changed a displayed result.
  $('entryResults').querySelectorAll('.entry-result').forEach((button,i)=>{button.onclick=()=>open(session,keys[i],action.token)});
 }
 return {remember,attach,apply};
})();
