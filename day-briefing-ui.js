// The briefing reads planner data; it never saves, completes, or moves an event.
window.OktiDayBriefUI=(()=>{
 const core=window.OktiDayBriefing,modal=document.getElementById('entryResultsModal'),list=document.getElementById('entryResults');
 let current=null,serial=0;
 const style=document.createElement('style');style.textContent=`
 #entryResultsModal.is-day-brief .action-card{max-height:calc(100dvh - 28px);overflow-y:auto;overscroll-behavior:contain}
 #entryResultsModal.is-day-brief h2{padding-right:32px;margin-bottom:8px}
 .day-brief-section{padding:13px 14px;border:1px solid #dce2e4;border-radius:14px;background:#ffffffd9;color:#193b5c;overflow-wrap:anywhere}
 .day-brief-section h3{margin:0 0 7px;font-size:17px;line-height:1.3}.day-brief-section p{margin:5px 0;font-size:15px;line-height:1.5}
 .day-brief-warning{border-left:4px solid #b76c55}.day-brief-note{color:#5c6d7b}
 .day-brief-read{min-height:44px;width:100%;margin:0 0 5px}.is-day-brief .entry-result-meta{white-space:normal}
 `;document.head.append(style);
 function cancel(){serial++;if(current?.speaking)try{window.speechSynthesis?.cancel()}catch(_){}current=null;modal.classList.remove('is-day-brief')}
 function fingerprint(){return JSON.stringify(tasks.map(t=>[t.id,t.title,t.date,t.time,t.startTime,t.endTime,t.endDate,t.done,plannerLocation(t),t.googlePlace?.placeId]))}
 function owned(state){return current===state&&state.serial===serial&&!modal.classList.contains('hidden')&&(!state.session||voiceDialogues[state.session.channel]===state.session)}
 function speak(state){
  if(!owned(state)||!state.model||!window.speechSynthesis||!window.SpeechSynthesisUtterance)return;
  try{window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(state.model.text);u.lang='pl-PL';u.rate=1;const voice=speechSynthesis.getVoices().find(v=>v.lang?.toLowerCase().startsWith('pl'));if(voice)u.voice=voice;state.speaking=true;u.onend=u.onerror=()=>{if(current===state)state.speaking=false};speechSynthesis.speak(u)}catch(_){state.speaking=false}
 }
 function section(title,lines,warning=false){
  const box=document.createElement('section');box.className='day-brief-section'+(warning?' day-brief-warning':'');const h=document.createElement('h3');h.textContent=title;box.append(h);
  for(const line of lines){const p=document.createElement('p');p.textContent=line;box.append(p)}return box;
 }
 function render(state){
  const model=state.model;showEntryResults(model.records,model.title,'Brak wydarzeń w tym zakresie.',true);modal.classList.add('is-day-brief');
  document.getElementById('entryResultsCount').textContent=new Date(model.date+'T12:00:00').toLocaleDateString('pl-PL',{weekday:'long',day:'numeric',month:'long'})+' · '+(model.mode==='remaining'?'od '+core.clock(model.now):model.mode==='review'?'plan zapisany w kalendarzu':'cały dzień');
  const intro=[];const read=document.createElement('button');read.type='button';read.className='secondary day-brief-read';read.textContent='Odczytaj podsumowanie';read.onclick=()=>speak(state);intro.push(read);
  if(model.mode==='review')intro.push(section('Zapisany plan dnia',['Zaplanowane wydarzenia: '+model.records.length+'. Oznaczone jako wykonane: '+model.records.filter(r=>r.item.done).length+'.','To przegląd zapisów w kalendarzu. Upływ terminu nie potwierdza udziału w spotkaniu.']));
  if(model.travel?.warnings.length){const box=section('Na co zwrócić uwagę',model.travel.warnings.map(w=>w.text),true);box.dataset.briefWarnings='';intro.push(box)}
  if(model.travel?.legs.length){const box=section('Dojazdy',model.travel.legs.map(l=>l.text));box.dataset.briefTravel='';intro.push(box)}
  if(model.weather){const box=section('Pogoda'+(model.weather.place?' · '+model.weather.place:''),[model.weather.text]);box.dataset.briefWeather='';intro.push(box)}
  if(model.travel?.notes.length)intro.push(section('Dostępność danych',model.travel.notes));
  if(model.travel?.legs.some(l=>l.route))intro.push(section('Szacunek podróży',['Czasy tras są orientacyjne, obliczone dla wybranego środka transportu. Ruch na drodze i warunki mogą się zmienić.']));
  list.prepend(...intro);modal.querySelector('h2').tabIndex=-1;modal.querySelector('h2').focus({preventScroll:true});
 }
 async function show(action,session=null,{speak:read=!!session&&session.inputSource==='audio'}={}){
  const spec=core.target(action,new Date());
  if(session){
   if(JSON.stringify(voiceDialogueCurrent(session.channel,session.id))!==session.snapshot)return null;
   if(voiceDialogues[session.channel]&&voiceDialogues[session.channel]!==session)return null;
   voiceDialogues[session.channel]=session;
  }
  showEntryResults([],spec.title,'Sprawdzam kalendarz, pogodę i dojazdy…');modal.classList.add('is-day-brief');
  const state=current={serial,session,action,speaking:false,model:null},version=fingerprint();
  const routeAdapter=window.OktiTravelRoutes;
  try{
   if(spec.mode!=='review'&&OktiLocalWeather.snapshot().enabled)await OktiLocalWeather.refresh(spec.mode==='remaining');
   if(!owned(state))return null;
   if(fingerprint()!==version)throw Error('Plan zmienił się podczas sprawdzania. Poproś o podsumowanie ponownie.');
   let now=new Date();if(spec.mode==='remaining'&&core.dayKey(now)!==spec.date)throw Error('Zmienił się dzień. Poproś o aktualne podsumowanie.');
   let records=core.events(tasks,spec.date,now,spec.mode),journey=null;
   const travelOptions={now,mode:spec.mode,origin:OktiLocalWeather.snapshot().place,route:(a,b,options)=>routeAdapter?.ensure(a,b,options),cached:(a,b,mode)=>routeAdapter?.get(a,b,mode),getMode:(a,b)=>routeAdapter?.mode(a,b)||'drive'};
   if(spec.mode!=='review')journey=await core.travel(records,tasks,travelOptions);
   if(!owned(state))return null;
   if(fingerprint()!==version)throw Error('Plan zmienił się podczas sprawdzania. Poproś o podsumowanie ponownie.');
   // Refresh the time filter after network calls: ended meetings must not leak
   // into a response, even when a provider was slow or midnight passed.
   now=new Date();if(spec.mode==='remaining'&&core.dayKey(now)!==spec.date)throw Error('Zmienił się dzień. Poproś o aktualne podsumowanie.');
   records=core.events(tasks,spec.date,now,spec.mode);
   if(spec.mode!=='review')journey=await core.travel(records,tasks,{...travelOptions,now,maxRequests:0});
   if(!owned(state)||fingerprint()!==version)return null;
   const details=spec.mode!=='review'?OktiLocalWeather.details(new Date(spec.date+'T12:00:00')):null;
   const model=state.model={...spec,now,records,travel:journey,weather:spec.mode!=='review'?core.weather(details,spec.date,now,spec.mode):null};model.text=core.speech(model);
   if(session){const historyText=model.text.length>3500?model.text.slice(0,3400).replace(/[\uD800-\uDBFF]$/,'')+' Pełna wersja jest na ekranie.':model.text;session.history.push({role:'assistant',content:historyText});session.lastOperation={status:'day_brief_complete',date:model.date,briefMode:model.mode};if(session.dialogueState)session.dialogueState.lastOperation=session.lastOperation;}
   window.OktiBriefLinks?.remember(model,session);
   render(state);if(read)speak(state);return model;
  }catch(error){
   if(owned(state)){list.replaceChildren(section('Niepełne podsumowanie',[error.message||'Nie udało się zakończyć podsumowania. Spróbuj ponownie.']));const retry=document.createElement('button');retry.className='secondary day-brief-read';retry.textContent='Sprawdź ponownie';retry.onclick=()=>show(action,session,{speak:read});list.append(retry)}return null;
  }
 }
 modal.addEventListener('click',event=>{if(current&&(event.target===modal||event.target.closest('#closeEntryResults,.entry-result')))cancel()});
 document.addEventListener('keydown',event=>{if(current&&event.key==='Escape'&&!modal.classList.contains('hidden')){event.preventDefault();event.stopPropagation();modal.classList.add('hidden');cancel()}},true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&current){try{speechSynthesis?.cancel()}catch(_){}current.speaking=false}});
 return {show,cancel,getState:()=>current};
})();
