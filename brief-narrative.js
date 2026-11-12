// Shared evidence contract for the browser and the read-only Worker endpoint.
const OktiBriefNarrative=(()=>{
 const kinds=new Set(['date','location','count','activity','warning','travel','weather','holiday','limitation','review']);
 const words=text=>text.trim().split(/\s+/u).filter(Boolean).length;
 const numbers=text=>(text.match(/\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}|-?\d+(?:[.,]\d+)?(?:\s*[–—-]\s*-?\d+(?:[.,]\d+)?)?/g)||[]).flatMap(token=>{
  if(/^\d{4}-\d{2}-\d{2}$/.test(token))return ['date:'+token];
  if(/^\d{1,2}:\d{2}$/.test(token)){const [h,m]=token.split(':');return ['time:'+Number(h)+':'+m]}
  const range=token.match(/^(-?\d+(?:[.,]\d+)?)\s*[–—-]\s*(-?\d+(?:[.,]\d+)?)$/);
  return (range?range.slice(1):[token]).map(value=>String(Number(value.replace(',','.'))));
 });
 function facts(model,brief){
  const result=[],add=(id,kind,text,priority=0)=>{if(text)result.push({id,kind,text:String(text).slice(0,900),priority})};
  add('date','date',new Date(model.date+'T12:00:00').toLocaleDateString('pl-PL',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+'. Zakres: '+(model.mode==='review'?'przegląd zapisanego planu':model.mode==='remaining'?'pozostała część dnia od '+model.now.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'}):'plan dnia'));
  if(model.place?.label)add('location','location','Ostatnia znana lokalizacja: '+model.place.label+'. To nie jest potwierdzenie miejsca pobytu w opisywanym dniu.');
  add('count','count',brief.countText,2);
  brief.warnings.slice(0,8).forEach((w,i)=>add('warning-'+i,'warning',w.text,i<2?3:1));
  (model.records||[]).slice(0,12).forEach((r,i)=>add('event-'+i,'activity','W kalendarzu: „'+String(r.title).slice(0,150)+'”. '+(r.summaryMeta||'')+'. Status: '+r.status+'. To plan, bez potwierdzenia obecności.'));
  if(model.mode==='review')add('review','review','Kalendarz opisuje zamiary. Nie potwierdza obecności, odbycia spotkań ani realizacji zadań.',3);
  else{
   const legs=model.travel?.legs||[],known=legs.filter(l=>Number.isFinite(l.route?.minutes));
   if(known.length)add('travel-count','travel','Potwierdzono szacunki dla '+known.length+' '+(known.length===1?'odcinka podróży':'odcinków podróży')+'. To odcinki, a nie liczba spotkań.');
   known.slice(0,6).forEach((l,i)=>add('route-'+i,'travel',l.text+(l.leaveAt?' Zalecany wyjazd: '+new Date(l.leaveAt).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})+'.':'')));
   (model.travel?.notes||[]).slice(0,3).forEach((text,i)=>add('travel-limit-'+i,'limitation',text));
   if(brief.note)add('organization','limitation',brief.note);
  }
  if(model.weather?.available&&!model.weather.stale)add('weather','weather',model.weather.text);
  if(model.weather?.stale)add('weather-limit','limitation','Prognoza pogody jest nieaktualna; pomijam wskazówki pogodowe.');
  (model.holidays?.items||[]).slice(0,4).forEach((h,i)=>add('holiday-'+i,'holiday','Święto ustawowe w '+model.holidays.countryLabel+': '+h.localName+'. Źródło: Nager.Date. Święto nie oznacza automatycznie, że użytkownik ma wolne.'));
  if(model.holidays?.regionalUnknown)add('holiday-limit','limitation','Nie ustalono regionu; uwzględniono tylko święta ogólnokrajowe.');
  return result;
 }
 function input(value){
  if(!value||!['remaining','plan','review'].includes(value.mode)||!Array.isArray(value.facts)||value.facts.length<2||value.facts.length>44||JSON.stringify(value).length>24000)throw Error('Nieprawidłowe fakty podsumowania.');
  const ids=new Set();
  const list=value.facts.map(f=>{
   if(!f||!/^[-a-z0-9]{1,40}$/.test(f.id)||ids.has(f.id)||!kinds.has(f.kind)||typeof f.text!=='string'||!f.text.trim()||f.text.length>900||![0,1,2,3].includes(f.priority))throw Error('Nieprawidłowy fakt podsumowania.');
   ids.add(f.id);return {id:f.id,kind:f.kind,text:f.text,priority:f.priority};
  });
  if(!list.some(f=>f.id==='count'&&f.kind==='count')||!list.some(f=>f.id==='date'&&f.kind==='date'))throw Error('Brak zakresu lub liczby spotkań.');
  const complexity=list.filter(f=>f.kind==='warning').length,budget=complexity>2?120:complexity||list.some(f=>f.kind==='weather'||f.kind==='holiday')?85:45;
  return {mode:value.mode,facts:list,wordBudget:budget};
 }
 function validate(value,context){
  const data=input(context),byId=new Map(data.facts.map(f=>[f.id,f]));
  function sentence(s){
   if(!s||typeof s.text!=='string'||!s.text.trim()||s.text.length>650||/[<>\u0000-\u0008]/.test(s.text)||!Array.isArray(s.factIds)||!s.factIds.length||s.factIds.length>8||s.factIds.some(id=>!byId.has(id)))throw Error('Niepoparta treść podsumowania.');
   const evidence=s.factIds.map(id=>byId.get(id).text).join(' '),allowed=new Set(numbers(evidence));
   if(numbers(s.text).some(n=>!allowed.has(n)))throw Error('AI podało liczbę spoza przekazanych faktów.');
   const attendance=/odby[łl]|uczestniczy[łl]|zrealizowa[łl]|zrobi[łl]e[śs]|by[łl]e[śs]/i.test(s.text),uncertain=/nie (?:wiem|wiemy|wiadomo|potwierdza(?:my|m)?|mam(?:y)? potwierdzenia)|bez potwierdzenia|brak (?:danych|potwierdzenia)/i.test(s.text);
   if(data.mode==='review'&&attendance&&!uncertain)throw Error('Plan nie potwierdza odbycia spotkań.');
   return {text:s.text.trim(),factIds:[...new Set(s.factIds)]};
  }
  if(!value||!Array.isArray(value.insights)||value.insights.length>5||!Array.isArray(value.spoken)||!value.spoken.length||value.spoken.length>7)throw Error('Nieprawidłowa odpowiedź AI.');
  // Location, date and missing-provider diagnostics remain context. They are not
  // useful standalone findings to repeat in the report or read aloud.
  const useful=(s,voice=false)=>s.factIds.some(id=>!['date','location','limitation',...(voice?[]:['count'])].includes(byId.get(id).kind));
  const candidate=value.intro===null?null:sentence(value.intro),intro=candidate&&useful(candidate)?candidate:null,insights=value.insights.map(sentence).filter(s=>useful(s)),spoken=value.spoken.map(sentence).filter(s=>useful(s,true));
  const speech=spoken.map(s=>s.text).join(' ');
  if(!spoken.some(s=>s.factIds.includes('count'))||words(speech)>data.wordBudget||speech.length>3000)throw Error('Zbyt długie lub niepełne podsumowanie głosowe.');
  for(const fact of data.facts.filter(f=>f.kind==='warning'&&f.priority===3))if(!spoken.some(s=>s.factIds.includes(fact.id)))throw Error('W głosie pominięto istotne ostrzeżenie.');
  if(data.mode==='review'&&!spoken.some(s=>s.factIds.includes('review')))throw Error('Brak zastrzeżenia dotyczącego zapisanego planu.');
  return {intro,insights,spoken,speech:spoken.map(s=>s.text).join(' '),wordCount:words(spoken.map(s=>s.text).join(' '))};
 }
 function fallback(model,brief){
  const sentences=[brief.countText,...brief.warnings.slice(0,2).map(w=>w.text)];
  if(model.mode==='review')sentences.push('To zapisany plan, bez potwierdzenia, czy spotkania się odbyły.');
  if(model.weather?.available&&!model.weather.stale)sentences.push(model.weather.text);
  const holiday=model.holidays?.items?.[0];if(holiday)sentences.push('Święto ustawowe: '+holiday.localName+'.');
  // The voice stays concise even after all on-screen warnings are expanded.
  const kept=[];let length=0;for(const text of sentences){const size=words(text);if(length+size>120)break;kept.push(text);length+=size}return kept.join(' ');
 }
 return {facts,input,validate,fallback};
})();
if(typeof module==='object'&&module.exports)module.exports=OktiBriefNarrative;
if(typeof window!=='undefined')window.OktiBriefNarrative=OktiBriefNarrative;
