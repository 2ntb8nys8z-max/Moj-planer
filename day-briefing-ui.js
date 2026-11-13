// Read-only report: all mutations remain in the existing, explicit event editor.
window.OktiDayBriefUI=(()=>{
 const core=window.OktiDayBriefing,narrator=window.OktiBriefNarrative,modal=document.getElementById('entryResultsModal'),list=document.getElementById('entryResults');
 let current=null,serial=0;
 const prefix=typeof PREVIEW33_PREFIX==='string'?PREVIEW33_PREFIX:'',historyKey=prefix+'okti-brief-history-v2',voiceKey=prefix+'okti-brief-voice-v2';
 const readSaved=key=>{try{return JSON.parse(localStorage.getItem(key)||'{}')||{}}catch(_){return {}}};
 const historyFor=date=>readSaved(historyKey)[date]||{};
 function rememberReport(model){try{const all=readSaved(historyKey),old=all[model.date]||{},sameDay=old.lastAt&&core.dayKey(new Date(old.lastAt))===core.dayKey(model.now);all[model.date]={count:Math.min(1000,(sameDay?old.count||0:0)+1),lastAt:+model.now};const kept=Object.fromEntries(Object.entries(all).sort((a,b)=>(b[1].lastAt||0)-(a[1].lastAt||0)).slice(0,40));localStorage.setItem(historyKey,JSON.stringify(kept))}catch(_){}}
 function voiceBudget(){const rate=Number(readSaved(voiceKey).wordsPerMinute)||120;return Math.max(50,Math.min(105,Math.floor(rate*.72)))}
 function learnVoice(words,seconds){if(seconds<5||seconds>150||words<8)return;const old=Number(readSaved(voiceKey).wordsPerMinute)||120,rate=Math.max(70,Math.min(190,words*60/seconds));try{localStorage.setItem(voiceKey,JSON.stringify({wordsPerMinute:Math.min(old,old*.35+rate*.65)}))}catch(_){}}

 const style=document.createElement('style');style.textContent=`
 #entryResultsModal.is-day-brief{padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));align-items:center;justify-content:center;background:#14202e65}
 #entryResultsModal.is-day-brief .action-card{position:relative;box-sizing:border-box;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;width:min(100%,680px);max-width:680px;height:calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom));max-height:980px;overflow:hidden;padding:0;border:1px solid #e1e4e7;border-radius:24px;background:#fff;box-shadow:0 22px 65px #16202c30;color:#23323e}
 #entryResultsModal.is-day-brief h2{margin:0;padding:26px 68px 10px 24px;font-size:27px;line-height:1.2;letter-spacing:-.025em;color:#243540}
 #entryResultsModal.is-day-brief #entryResults{display:flex;flex-direction:column;gap:24px;min-height:0;max-height:none;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:22px 24px;margin:0;border:0}
 #entryResultsModal.is-day-brief #entryResultsCount{font-size:18px;line-height:1.5;color:#52636f;padding:0 24px 18px;margin:0;border-bottom:1px solid #e7eaec;white-space:normal}.day-brief-date,.day-brief-year{display:block}.day-brief-year{margin-top:9px;font-size:17px;line-height:1.5;color:#445b68}
 #entryResultsModal.is-day-brief #closeEntryResults{position:absolute;z-index:2;left:auto;bottom:auto;width:44px;height:44px;right:12px;top:12px;font-size:28px;color:#4f5a64;background:#f3f4f5;border:1px solid #e6e8eb;border-radius:12px;box-shadow:none}
 .day-brief-section{padding:0;color:#263743;overflow-wrap:anywhere}
 .day-brief-section h3{margin:0 0 9px;font-size:21px;line-height:1.35}.day-brief-section p{margin:8px 0 0;font-size:19px;line-height:1.6}
 .day-brief-warning{padding:16px 18px;border-left:4px solid #ac6545;border-radius:0 14px 14px 0;background:#fffcf9}.day-brief-intro{margin:0;font-size:22px;line-height:1.55;font-weight:500;color:#293e4b;overflow-wrap:anywhere}
 #entryResultsModal.is-day-brief .day-brief-count{margin:0;padding:15px 18px;color:#233b4b;font-size:22px;font-weight:650;line-height:1.4;background:#f7f8f8;border:1px solid #e8eaec;border-radius:16px}
 button.day-brief-count{display:flex;align-items:center;justify-content:space-between;gap:14px;width:100%;text-align:left;touch-action:manipulation;cursor:pointer}button.day-brief-count:active{background:#eceff1}.day-brief-count-arrow{flex:none;font-size:30px;line-height:1;color:#627783}
 .day-brief-read{box-sizing:border-box;min-height:52px;width:100%;margin:0;padding:13px 15px;font-size:17px;font-weight:700;line-height:1.4;border-radius:15px;white-space:normal;touch-action:manipulation}
 #entryResultsModal.is-day-brief .day-brief-primary{background:#274b5d!important;color:#fff!important;border:1px solid #274b5d;box-shadow:0 4px 10px #16202c12}
 #entryResultsModal.is-day-brief .day-brief-read::before,#entryResultsModal.is-day-brief .day-brief-read::after{display:none}.day-brief-footer{padding:14px 24px 18px;border-top:1px solid #e7eaec;background:#fff}.day-brief-footer .day-brief-status:empty{display:none}.day-brief-footer .day-brief-status{margin-top:8px}
 #entryResultsModal.is-day-brief .entry-result{min-height:52px;font-size:17px}.is-day-brief .entry-result-meta{white-space:normal}
 .day-card-footer{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.day-card-footer .day-brief-read{font-size:15px;padding:12px 10px}.day-card-footer .day-brief-read:only-child{grid-column:1/-1}
 .day-brief-status{margin:0;font-size:14px;line-height:1.5;color:#64717c}.day-brief-sources{font-size:14px;line-height:1.5;color:#64717c}.day-brief-sources summary{min-height:36px;cursor:pointer}.day-brief-sources p{margin:7px 0}.day-brief-sources a{color:#375a6c;text-decoration:underline}
 #entryResultsModal.is-day-brief button:focus-visible,#entryResultsModal.is-day-brief summary:focus-visible{outline:3px solid #567889;outline-offset:3px}
 @media(max-width:360px){#entryResultsModal.is-day-brief .action-card{border-radius:20px}#entryResultsModal.is-day-brief h2{padding-left:18px}#entryResultsModal.is-day-brief #entryResultsCount{padding-left:18px;padding-right:18px}#entryResultsModal.is-day-brief #entryResults{padding:20px 18px}.day-brief-footer{padding:12px 18px 14px}}
 `;document.head.append(style);
 const fingerprint=()=>JSON.stringify(tasks);
 const owned=state=>current===state&&state.serial===serial&&!modal.classList.contains('hidden')&&(!state.session||voiceDialogues[state.session.channel]===state.session);
 function stop(state){if(!state)return;const active=state.speechToken;state.speechToken=null;clearTimeout(state.speechStartTimer);clearTimeout(state.speechEndTimer);if(active)try{window.speechSynthesis?.cancel()}catch(_){}state.speaking=false;if(state.readButton){state.readButton.textContent=state.readLabel||'Odczytaj podsumowanie';state.readButton.setAttribute('aria-pressed','false');state.readButton.setAttribute('aria-busy','false')}}
 function cancel({keepFooter=false}={}){serial++;if(current){stop(current);current.controller.abort();if(current.view==='day-card')document.getElementById('phoneDateButton')?.setAttribute('aria-expanded','false')}current=null;if(!keepFooter)modal.querySelector('[data-brief-footer]')?.remove();modal.classList.remove('is-day-brief');modal.removeAttribute('role');modal.removeAttribute('aria-modal');modal.removeAttribute('aria-labelledby')}
 function close(){const state=current,card=modal.querySelector('.action-card');cancel({keepFooter:true});if(card.animate&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){modal.classList.add('is-day-brief');const motion=card.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(12px)'}],{duration:150,easing:'ease-in'});motion.onfinish=()=>{if(!current){modal.classList.add('hidden');modal.classList.remove('is-day-brief');modal.querySelector('[data-brief-footer]')?.remove();state?.returnFocus?.focus?.({preventScroll:true})}}}else{modal.classList.add('hidden');modal.querySelector('[data-brief-footer]')?.remove();state?.returnFocus?.focus?.({preventScroll:true})}}
 function speak(state){
  if(!owned(state)||!state.model||fingerprint()!==state.version||!window.speechSynthesis||!window.SpeechSynthesisUtterance)return;
  if(state.speechToken){stop(state);return}
  const text=state.speechText||state.model.narrative?.speech;if(!text){if(state.statusNode)state.statusNode.textContent='Najpierw przygotuj skrót do odczytu.';return;}
  const token=state.speechToken={},finish=message=>{if(state.speechToken!==token)return;stop(state);if(message&&owned(state)&&state.statusNode)state.statusNode.textContent=message};
  try{
   window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='pl-PL';u.rate=1;
   try{const voice=speechSynthesis.getVoices().find(v=>v.lang?.toLowerCase().startsWith('pl'));if(voice)u.voice=voice}catch(_){}
   if(state.readButton){state.readButton.textContent='Zatrzymaj odczyt';state.readButton.setAttribute('aria-busy','true')}
   u.onstart=()=>{if(state.speechToken!==token)return;state.speaking=true;state.voiceStartedAt=Date.now();clearTimeout(state.speechStartTimer);state.readButton?.setAttribute('aria-busy','false');state.readButton?.setAttribute('aria-pressed','true')};
   u.onend=()=>{if(state.speechToken===token&&state.voiceStartedAt)learnVoice(text.trim().split(/\s+/).length,(Date.now()-state.voiceStartedAt)/1000);finish('')};u.onerror=()=>finish('Czytanie nie wystartowało. Dotknij „'+(state.readLabel||'Odczytaj podsumowanie')+'”, aby spróbować ponownie.');
   state.speechStartTimer=setTimeout(()=>finish('Dotknij „'+(state.readLabel||'Odczytaj podsumowanie')+'”, aby uruchomić głos.'),6000);state.speechEndTimer=setTimeout(()=>finish(''),180000);
   // Stay in the native button callback: Safari requires the tap for manual TTS.
   if(speechSynthesis.paused)speechSynthesis.resume?.();speechSynthesis.speak(u);
  }catch(_){finish('Nie udało się uruchomić odczytu. Spróbuj ponownie.')}
 }
 function section(title,lines,warning=false){
  const box=document.createElement('section');box.className='day-brief-section'+(warning?' day-brief-warning':'');const h=document.createElement('h3');h.textContent=title;box.append(h);
  for(const line of lines){const p=document.createElement('p');p.textContent=line;box.append(p)}return box;
 }
 function button(text,handler,primary=false){const b=document.createElement('button');b.type='button';b.className='secondary day-brief-read'+(primary?' day-brief-primary':'');b.textContent=text;b.onclick=handler;return b}
 function unavailableWeather(state){
  const model=state.model,box=section('Pogoda',[model.weatherIssue||(model.weatherEnabled?'Nie mam aktualnej prognozy dla tego dnia.':'Pogoda jest wyłączona. Możesz ją włączyć, aby dodać prognozę do podsumowania.')]);box.dataset.briefWeatherUnavailable='';
  const label=model.weatherEnabled?'Odśwież pogodę':'Włącz pogodę',retry=button(label,async()=>{
   if(!owned(state)||fingerprint()!==state.version)return;retry.disabled=true;retry.textContent='Sprawdzam pogodę…';
   const beforeFix=OktiLocalWeather.snapshot().place?.fixId;
   try{if(OktiLocalWeather.snapshot().enabled)await OktiLocalWeather.refresh(true,{freshGPS:true});else await OktiLocalWeather.enable();const afterFix=OktiLocalWeather.snapshot().place?.fixId;if(owned(state)&&fingerprint()===state.version)return show(state.action,state.session,{speak:false,refreshWeather:false,gpsFixId:afterFix!==beforeFix?afterFix:null});}
   catch(_){if(owned(state)){box.querySelector('p').textContent='Nie udało się odświeżyć pogody. Spróbuj ponownie.';retry.disabled=false;retry.textContent=label}}
  });retry.dataset.briefWeatherRetry='';box.append(retry);return box;
 }
 function decorate(){modal.classList.add('is-day-brief');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','entryResultsTitle')}
 function meetings(state){
  if(!owned(state)||fingerprint()!==state.version)return;
  showEntryResults(state.model.records,'Spotkania · '+new Date(state.model.date+'T12:00:00').toLocaleDateString('pl-PL'));
  state.serial=serial;state.controller=new AbortController();state.view='events';current=state;decorate();
  list.prepend(button('Wróć do podsumowania',()=>{if(owned(state))render(state)}));
 }
 async function freshDevicePosition(){
  return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(Error('Przeglądarka nie udostępnia lokalizacji.'));navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,checkedAt:Date.now(),fixId:'brief-'+Date.now()+'-'+serial}),e=>reject(Error(e.code===1?'Telefon nie udostępnił lokalizacji. Sprawdź zgodę dla Okti w ustawieniach przeglądarki.':'Nie udało się odświeżyć lokalizacji. Spróbuj ponownie.')),{enableHighAccuracy:true,maximumAge:0,timeout:12000})});
 }
 async function locationAlreadyAllowed(){
  const status=window.OktiPermissions?.getState().location;if(['skipped','denied'].includes(status))return false;if(status==='ready')return true;
  try{return (await navigator.permissions?.query({name:'geolocation'}))?.state==='granted'}catch(_){return false}
 }
 function travelStatus(state){
  const model=state.model,next=model.records.find(r=>!r.allDay&&r.status==='upcoming'&&r.start>+model.now);if(!next||model.mode==='review')return null;
  const currentRoute=model.travel?.legs?.find(l=>l.current),known=Number.isFinite(currentRoute?.route?.minutes),box=section('Dojazd do najbliższego spotkania',[]);box.dataset.briefTravel='';
  if(model.gpsUpdated){const p=document.createElement('p');p.dataset.briefGPS='';p.className='day-brief-status';p.textContent='Pozycja GPS odświeżona · '+new Date(model.place.checkedAt).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});box.append(p)}
  if(known){const p=document.createElement('p');p.textContent=next.title+' · około '+Math.ceil(currentRoute.route.minutes)+' min '+({drive:'samochodem',walk:'pieszo',bicycle:'rowerem',transit:'komunikacją'}[currentRoute.mode]||'');box.append(p);if(currentRoute.leaveAt){const leave=document.createElement('p');leave.className='day-brief-status';leave.textContent='Wyjazd około '+new Date(currentRoute.leaveAt).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})+' · 10 min zapasu';box.append(leave)}if(model.mode==='plan'){const assumption=document.createElement('p');assumption.className='day-brief-status';assumption.textContent='Szacunek z obecnego miejsca — jeśli stąd będziesz ruszać tego dnia.';box.append(assumption)}}
  else{const p=document.createElement('p');p.textContent=!core.location(next.item)?'Dodaj adres spotkania „'+next.title+'”, aby sprawdzić dojazd.':model.gpsUpdated?'Nie udało się ustalić czasu dojazdu do „'+next.title+'”.':model.gpsIssue||'Udostępnij aktualne położenie, aby sprawdzić dojazd do „'+next.title+'”.';box.append(p);if(core.location(next.item))box.append(button(model.gpsUpdated?'Sprawdź dojazd ponownie':'Sprawdź położenie i dojazd',()=>owned(state)?show(state.action,state.session,{speak:false,requestLocation:true}):null))}
  return box;
 }
 function render(state,{focus=false}={}){
  const model=state.model,brief=core.summary(model,{allWarnings:state.showAllWarnings}),scroll=list.scrollTop;model.displayWarnings=brief.visibleWarnings;state.view='brief';
  showEntryResults([],model.title,'',true);decorate();list.replaceChildren();
  const meta=document.getElementById('entryResultsCount'),date=document.createElement('span'),year=document.createElement('span'),calendar=model.calendar||core.calendarContext(model.date);date.className='day-brief-date';date.textContent=new Date(model.date+'T12:00:00').toLocaleDateString('pl-PL',{weekday:'long',day:'numeric',month:'long',year:'numeric'});year.className='day-brief-year';year.dataset.briefCalendar='';year.textContent=calendar.dayOfYear+'. dzień roku. Do końca roku '+(calendar.daysRemaining===1?'został 1 dzień.':'zostało '+calendar.daysRemaining+' dni.');meta.replaceChildren(date,year);
  if(model.weather?.available&&!model.weather.stale){const w=model.weather,plain=Number.isFinite(w.temperatureMin)?(w.temperatureMin===w.temperatureMax?w.temperatureMin+'°C':w.temperatureMin+'–'+w.temperatureMax+'°C')+(w.rain?' · '+({rain:'Opady',snow:'Śnieg',storm:'Burze'}[w.rain.kind]||'Opady')+' '+w.rain.at.slice(11,16):''):'';const box=section('Pogoda',[model.narrative?.weather?.text||plain]);box.dataset.briefWeather='';list.append(box)}
  else if(model.mode!=='review')list.append(unavailableWeather(state));
  if(model.narrative?.intro?.text){const intro=document.createElement('p');intro.className='day-brief-intro';intro.dataset.briefIntro='';intro.textContent=model.narrative.intro.text;list.append(intro)}
  const n=model.records.length;
  if(n>=1){const count=document.createElement('button');count.className='day-brief-count';count.dataset.briefCount='';count.dataset.briefEvents='';count.type='button';count.textContent=brief.countText;count.setAttribute('aria-label',brief.countText+' Zobacz spotkania.');count.onclick=()=>meetings(state);const arrow=document.createElement('span');arrow.className='day-brief-count-arrow';arrow.setAttribute('aria-hidden','true');arrow.textContent='›';count.append(arrow);list.append(count);if(n===1){const r=model.records[0],box=section(r.title,[r.summaryMeta]);box.dataset.briefSingle='';list.append(box)}}
  else if(!model.narrative?.intro){const empty=document.createElement('p');empty.className='day-brief-status';empty.dataset.briefEmpty='';empty.textContent=brief.countText;list.append(empty)}
  const routeBox=travelStatus(state);if(routeBox)list.append(routeBox);
  if(brief.visibleWarnings.length){const lines=[...new Set(brief.visibleWarnings.map(w=>{const id='warning-'+brief.warnings.indexOf(w);return model.narrative?.insights?.find(s=>s.factIds.includes(id))?.text||(model.narrative?.intro?.factIds.includes(id)?null:w.text)}).filter(Boolean))];if(lines.length){const box=section('Zwróć uwagę',lines,true);box.dataset.briefWarnings='';list.append(box)}}
  if(brief.moreCount){const more=button('Pokaż pozostałe ostrzeżenia ('+brief.moreCount+')',()=>{if(owned(state)){state.showAllWarnings=true;render(state);window.OktiBriefLinks?.remember(model,state.session)}});more.dataset.briefMore='';list.append(more)}
  const insights=model.narrative?.insights?.filter(s=>!s.factIds.some(id=>/^warning-/.test(id)))||[];
  if(insights.length){const box=section('Twój plan',insights.map(s=>s.text));box.dataset.briefInsights='';list.append(box)}
  if(model.holidays?.items?.length){const box=section('Święto',model.holidays.items.map(h=>h.localName));box.dataset.briefHoliday='';list.append(box)}
  if(model.presentation?.includeYaga&&model.inspiration?.date===model.date){const box=section('Księga Yagi',[]);box.dataset.briefInspiration='';box.dataset.briefInspirationDate=model.date;if(window.OktiYagaCard)box.append(OktiYagaCard.render(model.inspiration));list.append(box)}
  modal.querySelector('[data-brief-footer]')?.remove();const footer=document.createElement('div');footer.className='day-brief-footer';footer.dataset.briefFooter='';
  state.readButton=button(state.speechToken?'Zatrzymaj odczyt':model.narrative?.speech?'Odczytaj podsumowanie':'Ponów analizę',async()=>{if(model.narrative?.speech)return speak(state);if(!owned(state)||state.analyzing)return;state.analyzing=true;render(state);try{await analyze(state);state.aiError=''}catch(_){state.aiError='Nie udało się przygotować opisu AI. Spróbuj ponownie.'}finally{state.analyzing=false;if(owned(state))render(state)}},true);state.readButton.disabled=state.analyzing&&!model.narrative?.speech;state.readButton.setAttribute('aria-pressed',String(!!state.speaking));state.readButton.setAttribute('aria-busy',String(!!state.speechToken&&!state.speaking));footer.append(state.readButton);
  const status=state.statusNode=document.createElement('p');status.className='day-brief-status';status.dataset.briefStatus='';status.setAttribute('role','status');status.textContent=state.analyzing?'Chwilę, układam podsumowanie…':state.aiError?'Opis AI jest chwilowo niedostępny. Możesz ponowić analizę.':'';footer.append(status);modal.querySelector('.action-card').append(footer);
  const sources=document.createElement('details');sources.className='day-brief-sources';const summary=document.createElement('summary');summary.textContent='Źródła i dostępność danych';sources.append(summary);
  const notes=[...(model.travel?.notes||[])];if(state.aiError)notes.push(state.aiError);
  if(!model.place)notes.push('Brak aktualnej lokalizacji.');
  if(model.mode!=='review'&&!model.weather?.available)notes.push('Brak aktualnej prognozy dla tego dnia.');
  if(model.weather?.stale)notes.push('Zapisana prognoza jest nieaktualna.');
  if(!model.holidays?.available)notes.push('Nie potwierdzono lokalnych świąt.');
  if(model.holidays?.regionalUnknown)notes.push('Nie ustalono regionu: uwzględniono tylko święta ogólnokrajowe.');
  if(model.mode==='plan'&&model.place)notes.push('Pogoda i święta dotyczą ostatniej znanej lokalizacji, bez potwierdzenia miejsca pobytu tego dnia.');
  for(const text of [...new Set(notes)]){const p=document.createElement('p');p.textContent=text;sources.append(p)}
  for(const [label,url,show] of [['Pogoda: Open-Meteo','https://open-meteo.com/',model.weather?.available],['Święta: Nager.Date',model.holidays?.source,model.holidays?.available],['Trasy: Google Maps','https://maps.google.com/',model.travel?.legs?.some(l=>l.route)]])if(show){const p=document.createElement('p'),a=document.createElement('a');a.textContent=label;a.href=url;a.target='_blank';a.rel='noopener noreferrer';p.append(a);sources.append(p)}
  list.append(sources);list.scrollTop=focus?0:scroll;
  if(focus){modal.querySelector('h2').tabIndex=-1;modal.querySelector('h2').focus({preventScroll:true})}
 }
 async function analyze(state){
  const model=state.model,context=narrator.context(model,core.summary(model));
  const info=await getApiInfo();if(!owned(state))return;
  if(!info.conversationFeatures?.includes('day-brief-narrative-v1')){state.aiError='Podsumowanie na podstawie danych · serwer AI czeka na aktualizację.';return}
  const timer=setTimeout(()=>state.controller.abort(),22000);
  try{const result=await plannerApiRequest('/briefing',{method:'POST',headers:{'Content-Type':'application/json'},signal:state.controller.signal,body:JSON.stringify({context})});if(!owned(state))return;model.narrative=narrator.validate(result.narrative,context);model.narrativeEventIds=[...new Set([...model.narrative.spoken,...model.narrative.insights,...(model.narrative.intro?[model.narrative.intro]:[])].flatMap(s=>s.factIds).filter(id=>/^event-\d+$/.test(id)).map(id=>model.records[Number(id.slice(6))]?.item.id).filter(id=>id!=null))]}
  finally{clearTimeout(timer)}
 }
 async function show(action,session=null,{speak:read=!!session&&session.inputSource==='audio',refreshWeather=true,gpsFixId=null,requestLocation=false}={}){
  const spec=core.target(action,new Date()),returnFocus=document.activeElement;
  if(session){if(JSON.stringify(voiceDialogueCurrent(session.channel,session.id))!==session.snapshot)return null;if(voiceDialogues[session.channel]&&voiceDialogues[session.channel]!==session)return null;voiceDialogues[session.channel]=session}
  cancel();showEntryResults([],spec.title,'Sprawdzam plan i dojazdy…',true);decorate();
  const state=current={serial,session,action,speaking:false,model:null,controller:new AbortController(),version:fingerprint(),returnFocus,view:'brief'};
  const card=modal.querySelector('.action-card');if(card.animate&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)card.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:230,easing:'cubic-bezier(.2,.7,.2,1)'});
  const routeAdapter=window.OktiTravelRoutes,started=new Date(),initialRecords=core.events(tasks,spec.date,started,spec.mode),firstFuture=initialRecords.find(r=>!r.allDay&&r.status==='upcoming'&&r.start>+started),needsGPS=spec.mode!=='review'&&!!firstFuture&&!!core.location(firstFuture.item),fixBefore=OktiLocalWeather.snapshot().place?.fixId;
  try{
   if(refreshWeather&&spec.mode!=='review'&&OktiLocalWeather.snapshot().enabled)await OktiLocalWeather.refresh(needsGPS,{freshGPS:needsGPS});
   if(!owned(state))return null;let deviceFix=null,gpsIssue='';if(needsGPS&&!OktiLocalWeather.snapshot().enabled){if(requestLocation||await locationAlreadyAllowed()){try{deviceFix=await freshDevicePosition()}catch(error){gpsIssue=error.message}}}
   if(!owned(state))return null;
   if(fingerprint()!==state.version)throw Error('Plan zmienił się podczas sprawdzania. Poproś o podsumowanie ponownie.');
   let now=new Date();if(spec.mode==='remaining'&&core.dayKey(now)!==spec.date)throw Error('Zmienił się dzień. Poproś o aktualne podsumowanie.');
   let records=core.events(tasks,spec.date,now,spec.mode),journey=null;
   const saved=OktiLocalWeather.snapshot(),fresh=saved.enabled&&saved.place&&Number.isFinite(saved.place.checkedAt)&&+now-saved.place.checkedAt>=0&&+now-saved.place.checkedAt<15*60000;
   const place=deviceFix||(spec.mode!=='review'&&fresh?saved.place:null),gpsUpdated=!!needsGPS&&place?.fixId!=null&&(place.fixId!==fixBefore||place.fixId===gpsFixId);
   const requestedRoutes=new Map(),routeKey=(a,b,mode)=>JSON.stringify([a.id,a.location,b.id,core.location(b),mode]);
   const travelOptions={now,mode:spec.mode,origin:gpsUpdated?place:null,route:async(a,b,options)=>{const value=await routeAdapter?.ensure(a,b,options);if(value)requestedRoutes.set(routeKey(a,b,options.mode),value);return value},cached:(a,b,mode)=>requestedRoutes.get(routeKey(a,b,mode))||routeAdapter?.get(a,b,mode),getMode:(a,b)=>routeAdapter?.mode(a,b)||'drive'};
   const holidayPromise=place&&window.OktiBriefHolidays?OktiBriefHolidays.get(spec.date,place,{signal:state.controller.signal}):Promise.resolve(null);
   const results=await Promise.all([spec.mode!=='review'?core.travel(records,tasks,travelOptions):null,holidayPromise]);journey=results[0];
   if(!owned(state))return null;
   if(fingerprint()!==state.version)throw Error('Plan zmienił się podczas sprawdzania. Poproś o podsumowanie ponownie.');
   now=new Date();if(spec.mode==='remaining'&&core.dayKey(now)!==spec.date)throw Error('Zmienił się dzień. Poproś o aktualne podsumowanie.');
   records=core.events(tasks,spec.date,now,spec.mode);if(spec.mode!=='review')journey=await core.travel(records,tasks,{...travelOptions,now,maxRequests:0});
   if(!owned(state)||fingerprint()!==state.version)return null;
   const weather=spec.mode!=='review'&&place?core.weather(OktiLocalWeather.details(new Date(spec.date+'T12:00:00')),spec.date,now,spec.mode):null;
   const model=state.model={...spec,now,records,travel:journey,place,weather,weatherEnabled:!!saved.enabled,weatherIssue:saved.error||'',gpsIssue:gpsIssue||saved.error||'',holidays:results[1],calendar:core.calendarContext(spec.date),overview:core.dayOverview({...spec,now,records,travel:journey}),inspiration:spec.mode!=='review'?window.OktiDayInspiration?.day(spec.date)||null:null,gpsUpdated,speechBudget:voiceBudget()};model.presentation=narrator.presentation(model,historyFor(spec.date),action.briefDetail||'auto',core.events(tasks,spec.date,now,'plan'));state.analyzing=!!narrator;render(state,{focus:true});window.OktiBriefLinks?.remember(model,session);
   try{if(narrator)await analyze(state)}catch(_){state.aiError='Analiza AI jest chwilowo niedostępna. Pokazuję sprawdzone dane kalendarza.'}finally{state.analyzing=false}
   if(!owned(state))return null;
   if(fingerprint()!==state.version)throw Error('Plan zmienił się podczas analizy. Poproś o podsumowanie ponownie.');
   const finished=new Date();if(spec.mode==='remaining'&&(core.dayKey(finished)!==spec.date||JSON.stringify(core.events(tasks,spec.date,finished,spec.mode).map(r=>[r.item.id,r.status]))!==JSON.stringify(model.records.map(r=>[r.item.id,r.status]))))throw Error('Plan w międzyczasie się zmienił. Sprawdź aktualne podsumowanie.');
   model.text=model.narrative?.speech||'Podsumowanie planu dla '+model.date;rememberReport(model);
   if(session){session.history.push({role:'assistant',content:model.text});session.lastOperation={status:'day_brief_complete',date:model.date,briefMode:model.mode};if(session.dialogueState)session.dialogueState.lastOperation=session.lastOperation}
   if(state.view==='brief')render(state);window.OktiBriefLinks?.remember(model,session);if(read&&state.view==='brief'&&!state.speechToken)speak(state);return model;
  }catch(error){
   if(owned(state)){stop(state);state.model=null;list.replaceChildren(section('Sprawdź aktualny plan',[error.message||'Nie udało się zakończyć podsumowania. Spróbuj ponownie.']),button('Sprawdź ponownie',()=>show(action,session,{speak:read})))}return null;
  }
 }
 async function showInspiration(action,session=null){
  const source=window.OktiDayInspiration;if(!source)throw Error('Odśwież aplikację, aby wczytać inspiracje dnia.');
  if(session){if(JSON.stringify(voiceDialogueCurrent(session.channel,session.id))!==session.snapshot)return null;if(voiceDialogues[session.channel]&&voiceDialogues[session.channel]!==session)return null;voiceDialogues[session.channel]=session}
  const returnFocus=document.activeElement;cancel();showEntryResults([],'Dobry moment na '+({work:'pracę',rest:'odpoczynek',relax:'relaks'}[action.topic]||'Twój plan'),'',true);decorate();list.replaceChildren();
  const card=modal.querySelector('.action-card');if(card.animate&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)card.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:230,easing:'cubic-bezier(.2,.7,.2,1)'});
  const now=new Date(),state=current={serial,session,action,version:fingerprint(),controller:new AbortController(),returnFocus,view:'inspiration-search',model:{date:core.dayKey(now),mode:'plan',now,records:[]}};
  try{
   const result=source.search(action,tasks,now);state.result=result;state.speechText=source.message(result);state.model.text=state.speechText;
   const meta=document.getElementById('entryResultsCount'),origin=document.createElement('span'),period=document.createElement('span');origin.className='day-brief-date';origin.textContent='Według astrologii · Księga Yagi';period.className='day-brief-year';period.textContent=source.dateLabel(result.from)+' – '+source.dateLabel(result.to);meta.replaceChildren(origin,period);
   if(result.status!=='found')list.append(section('Sprawdzony zakres',[state.speechText]));
   for(const candidate of result.candidates){
    const reason=action.topic==='relax'&&candidate.inspiration.theme!=='rest'?'Wpis astrologiczny na ten dzień wymienia relaksujące aktywności.':'Motyw astrologiczny: '+candidate.inspiration.label+'.';
    const box=section(source.dateLabel(candidate.date),[reason,source.calendarText(candidate.calendar)]);box.dataset.inspirationDate=candidate.date;box.append(button('Zobacz plan tego dnia',()=>{if(owned(state)&&fingerprint()===state.version)show({date:candidate.date,briefMode:candidate.date===core.dayKey(new Date())?'remaining':'plan'},session,{speak:false})}));list.append(box);
   }
   if(result.missing)list.append(section('Dostępność danych',['W bazie są dane dla '+result.checked+' dni tego zakresu. Pozostałe daty pomijam.']));
   const details=document.createElement('details');details.className='day-brief-sources';const summary=document.createElement('summary');summary.textContent='Jak powstała propozycja';details.append(summary);
   for(const text of ['Motyw pochodzi z astrologicznej Księgi Yagi autorstwa Zofii Rende. To symboliczna inspiracja, nie prognoza Twojej energii ani powodzenia.','Spośród pasujących dni pierwszeństwo ma dzień z dłuższą przerwą między spotkaniami. Przerwy liczone są od 08:00 do 22:00, dla dzisiaj od bieżącej chwili. Nie potwierdzają czasu wolnego od innych obowiązków i nie uwzględniają nieznanych dojazdów.','Nic nie jest zapisywane ani przesuwane.']){const p=document.createElement('p');p.textContent=text;details.append(p)}list.append(details);
   const footer=document.createElement('div');footer.className='day-brief-footer';footer.dataset.briefFooter='';state.readLabel='Odczytaj propozycję';state.readButton=button(state.readLabel,()=>speak(state),true);state.readButton.setAttribute('aria-pressed','false');footer.append(state.readButton);state.statusNode=document.createElement('p');state.statusNode.className='day-brief-status';state.statusNode.setAttribute('role','status');footer.append(state.statusNode);modal.querySelector('.action-card').append(footer);list.scrollTop=0;
   if(session){session.history.push({role:'assistant',content:state.speechText});session.lastOperation={status:'inspiration_days_complete',topic:action.topic,...(action.fromDate?{fromDate:result.from,toDate:result.to}:{period:action.period||'this_week'})};if(session.dialogueState)session.dialogueState.lastOperation=session.lastOperation;}
   const heading=modal.querySelector('h2');heading.tabIndex=-1;heading.focus({preventScroll:true});if(session?.inputSource==='audio')speak(state);return result;
  }catch(error){state.model=null;list.replaceChildren(section('Sprawdź zakres',[error.message||'Nie udało się sprawdzić inspiracji.']));return null;}
 }
 function showDay(date,{chooseDay=null,openCalendar=null}={}){
  const spec=core.target({date},new Date()),source=window.OktiDayInspiration?.day(date),returnFocus=document.activeElement;
  cancel();showEntryResults([],'Karta dnia','',true);decorate();list.replaceChildren();document.getElementById('phoneDateButton')?.setAttribute('aria-expanded','true');
  const state=current={serial,session:null,controller:new AbortController(),version:fingerprint(),returnFocus,view:'day-card',model:{...spec,now:new Date(),records:[]}};
  document.getElementById('entryResultsCount').textContent=new Date(date+'T12:00:00').toLocaleDateString('pl-PL',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  if(source&&window.OktiYagaCard)list.append(OktiYagaCard.render(source));else list.append(section('Księga Yagi',['Brak danych dla tego dnia w przekazanej księdze.']));
  const footer=document.createElement('div');footer.className='day-brief-footer day-card-footer';footer.dataset.briefFooter='';footer.append(button('Zobacz plan tego dnia',()=>{if(!owned(state))return;if(openCalendar){cancel();modal.classList.add('hidden');openCalendar(date)}else show({date},null,{speak:false})},true));
  footer.firstElementChild.setAttribute('aria-label','Zobacz plan tego dnia');footer.firstElementChild.textContent='Plan dnia';
  if(chooseDay)footer.append(button('Wybierz inny dzień',()=>{if(!owned(state))return;cancel();modal.classList.add('hidden');chooseDay()}));
  if(chooseDay){footer.lastElementChild.setAttribute('aria-label','Wybierz inny dzień');footer.lastElementChild.textContent='Zmień dzień'}
  modal.querySelector('.action-card').append(footer);list.scrollTop=0;const heading=modal.querySelector('h2');heading.tabIndex=-1;heading.focus({preventScroll:true});return state;
 }
 modal.addEventListener('click',event=>{if(!current)return;if(event.target===modal||event.target.closest('#closeEntryResults')){event.preventDefault();event.stopImmediatePropagation();close()}else if(event.target.closest('.entry-result'))cancel()},true);
 document.addEventListener('keydown',event=>{
  if(!current||modal.classList.contains('hidden'))return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close()}
  if(event.key==='Tab'){const focusable=[...modal.querySelectorAll('button,a[href],summary')].filter(n=>!n.disabled),first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&(document.activeElement===first||!focusable.includes(document.activeElement))){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}
 },true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&current)stop(current)});
 return {show,showDay,showInspiration,cancel,getState:()=>current};
})();
