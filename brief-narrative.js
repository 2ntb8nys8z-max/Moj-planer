// Shared evidence contract for the browser and the read-only Worker endpoint.
const OktiBriefNarrative=(()=>{
 const kinds=new Set(['date','location','count','activity','warning','travel','weather','holiday','limitation','review','load','inspiration']);
 const words=text=>text.trim().split(/\s+/u).filter(Boolean).length;
 const months=['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
 const namedDates=()=>new RegExp('\\b(\\d{1,2})\\s+('+months.join('|')+')(?:\\s+(\\d{4}))?','giu');
 function checkedDateText(text,evidence){
  const allowed=(evidence.match(/\d{4}-\d{2}-\d{2}/g)||[]).map(d=>({year:Number(d.slice(0,4)),month:Number(d.slice(5,7)),day:Number(d.slice(8))}));
  for(const m of evidence.matchAll(namedDates()))allowed.push({year:m[3]?Number(m[3]):null,month:months.indexOf(m[2].toLocaleLowerCase('pl-PL'))+1,day:Number(m[1])});
  return text.replace(namedDates(),(all,day,month,year)=>{if(!allowed.some(d=>d.day===Number(day)&&d.month===months.indexOf(month.toLocaleLowerCase('pl-PL'))+1&&(!year||d.year===Number(year))))throw Error('AI podało datę spoza przekazanych faktów.');return '';});
 }
 const numbers=text=>(text.match(/\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}|-?\d+(?:[.,]\d+)?(?:\s*[–—-]\s*-?\d+(?:[.,]\d+)?)?/g)||[]).flatMap(token=>{
  if(/^\d{4}-\d{2}-\d{2}$/.test(token))return ['date:'+token];
  if(/^\d{1,2}:\d{2}$/.test(token)){const [h,m]=token.split(':');return ['time:'+Number(h)+':'+m]}
  const range=token.match(/^(-?\d+(?:[.,]\d+)?)\s*[–—-]\s*(-?\d+(?:[.,]\d+)?)$/);
  return (range?range.slice(1):[token]).map(value=>String(Number(value.replace(',','.'))));
 });
 const weatherText=model=>String(model.weather?.text||'').replace(/^W dzień /,'W ciągu dnia będzie ');
 const localDay=now=>now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
 const validDay=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&localDay(new Date(date+'T12:00:00'))===date;
 function relativeDay(date,today){const offset=(Date.parse(date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000;return offset===0?'today':offset===1?'tomorrow':offset===-1?'yesterday':'other'}
 function inspirationTitle(model){const relation=relativeDay(model.date,localDay(model.now||new Date()));return 'Inspiracja '+(relation==='today'?'na dziś':relation==='tomorrow'?'na jutro':'na '+new Date(model.date+'T12:00:00').toLocaleDateString('pl-PL',{day:'numeric',month:'long'}))}
 function facts(model,brief){
  const result=[],add=(id,kind,text,priority=0)=>{if(text)result.push({id,kind,text:String(text).slice(0,900),priority})};
  add('date','date',new Date(model.date+'T12:00:00').toLocaleDateString('pl-PL',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+'. Zakres: '+(model.mode==='review'?'przegląd zapisanego planu':model.mode==='remaining'?'pozostała część dnia od '+model.now.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'}):'plan dnia'));
  if(model.calendar){const fact=result[0];fact.text+=' To '+model.calendar.dayOfYear+'. dzień roku. Do końca roku zostało '+model.calendar.daysRemaining+' dni (bez opisywanego dnia).';}
  if(model.place?.label)add('location','location','Ostatnia znana lokalizacja: '+model.place.label+'. To nie jest potwierdzenie miejsca pobytu w opisywanym dniu.');
  add('count','count',brief.countText,2);
  if(model.overview){const o=model.overview;add('day-load','load','Dotyczy tylko zapisów w kalendarzu, a nie wszystkich obowiązków użytkownika. Wpisy godzinowe ze znanym końcem: '+o.timedCount+'. Zajmują łącznie '+o.occupiedMinutes+' minut, bez podwójnego liczenia nakładających się terminów. Najdłuższa przerwa między nimi: '+o.longestGapMinutes+' minut; nie oznacza automatycznie czasu wolnego, bo trzeba uwzględnić dojazdy.'+(o.firstStart!=null?' Pierwszy początek w tym zakresie: '+new Date(o.firstStart).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})+'. Ostatni koniec: '+new Date(o.lastEnd).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})+'.':'')+' Wpisy całodniowe: '+o.allDayCount+'; nie znamy ich zajętości godzinowej. Wpisy bez godziny końca: '+o.unknownEndCount+'. Ustalony czas przejazdów: '+o.routeMinutes+' minut dla '+o.knownRouteCount+' odcinków; pozostałe mogą być nieznane.');}
  brief.warnings.slice(0,8).forEach((w,i)=>add('warning-'+i,'warning',w.text,i<2?3:1));
  (model.records||[]).slice(0,12).forEach((r,i)=>add('event-'+i,'activity','W kalendarzu: „'+String(r.title).slice(0,150)+'”. '+(r.summaryMeta||'')+'. Status: '+r.status+'.'));
  if(model.mode==='review')add('review','review','Opisuj wyłącznie wcześniejszy plan w kalendarzu, np. „'+brief.countText+'”. Nie wyciągaj wniosków o obecności ani wykonaniu. Ograniczenie stosuj w doborze słów, bez dodatkowego komunikatu dla użytkownika.');
  else{
   const legs=model.travel?.legs||[],known=legs.filter(l=>Number.isFinite(l.route?.minutes));
   if(known.length)add('travel-count','travel','Potwierdzono szacunki dla '+known.length+' '+(known.length===1?'odcinka podróży':'odcinków podróży')+'. To odcinki, a nie liczba spotkań.');
   known.slice(0,6).forEach((l,i)=>add('route-'+i,'travel',l.text+(l.leaveAt?' Zalecany wyjazd: '+new Date(l.leaveAt).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})+'.':'')));
   (model.travel?.notes||[]).slice(0,3).forEach((text,i)=>add('travel-limit-'+i,'limitation',text));
   if(brief.note)add('organization','limitation',brief.note);
  }
  if(model.weather?.available&&!model.weather.stale)add('weather','weather',model.weather.text+(model.weather.date?' Prognoza dla daty '+model.weather.date+'.':'')+(model.weather.rainAt?' Opady wskazano na '+model.weather.rainAt+'. Północ 00:00 należy do początku tej daty, a nie nocy po wieczornych wydarzeniach.':''));
  if(model.weather?.stale)add('weather-limit','limitation','Prognoza pogody jest nieaktualna; pomijam wskazówki pogodowe.');
  (model.holidays?.items||[]).slice(0,4).forEach((h,i)=>add('holiday-'+i,'holiday','Święto ustawowe w '+model.holidays.countryLabel+': '+h.localName+'. Źródło: Nager.Date. Święto nie oznacza automatycznie, że użytkownik ma wolne.'));
  if(model.holidays?.regionalUnknown)add('holiday-limit','limitation','Nie ustalono regionu; uwzględniono tylko święta ogólnokrajowe.');
  if(model.inspiration&&model.inspiration.date===model.date&&model.mode!=='review'){const i=model.inspiration;add('inspiration','inspiration','Symboliczna inspiracja według astrologii. Źródło: '+i.source+'. Data: '+i.date+'. Motyw: '+i.label+'. Według źródła: '+i.moon+', '+i.phase+'. Propozycja: '+i.text+' To ogólny motyw kalendarza, nie osobisty horoskop ani prognoza kondycji, zdrowia lub powodzenia.');}
  return result;
 }
 function presentation(model,previous={},detail='auto',allRecords=model.records||[]){
  const now=model.now||new Date(),future=model.date>localDay(now),ended=allRecords.filter(r=>!r.allDay&&r.hasEnd&&r.end<=+now).length;
  if(previous.lastAt&&localDay(new Date(previous.lastAt))!==localDay(now))previous={};
  const morning=now.getHours()<12&&(!allRecords.length||ended/allRecords.length<=.2),explicit=['full','yaga'].includes(detail);
  const includeYaga=model.mode!=='review'&&(explicit||detail!=='update'&&!previous.count&&(future||morning));
  return {kind:model.mode==='review'?'review':explicit?'full':includeYaga?(future?'future':'morning'):'update',includeYaga,previousCount:previous.count||0,lastReportedAt:previous.lastAt||null};
 }
 function structuredFacts(model,brief){
  const result=[],add=(id,kind,values,priority=0)=>result.push({id,kind,text:JSON.stringify(values),priority}),time=stamp=>Number.isFinite(stamp)?new Date(stamp).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'}):null;
  add('date','date',{date:model.date,localTime:time(+model.now),mode:model.mode,calendar:model.calendar||null});
  add('count','count',{meetings:model.records?.length||0,ongoing:model.records?.filter(r=>r.status==='ongoing').length||0},2);
  if(model.overview)add('day-load','load',model.overview);
  if(model.place)add('location','location',{freshFix:model.gpsUpdated===true,checkedAt:time(model.place.checkedAt),accuracyMeters:model.place.accuracy,forecastPlace:model.place.label||null});
  const records=model.records||[];
  records.slice(0,12).forEach((r,i)=>add('event-'+i,'activity',{title:String(r.title).slice(0,180),start:time(r.start),end:r.hasEnd?time(r.end):null,status:r.status,allDay:!!r.allDay,location:String(r.item?.location||r.item?.googleData?.location||'').slice(0,250)}));
  brief.warnings.slice(0,8).forEach((w,i)=>add('warning-'+i,'warning',{risk:w.kind,events:w.eventIds.map(id=>{const r=records.find(r=>String(r.item.id)===String(id));return r?{title:r.title,start:time(r.start),end:time(r.end)}:{id:String(id)}})},i<2?3:1));
  (model.travel?.legs||[]).filter(l=>Number.isFinite(l.route?.minutes)).slice(0,6).forEach((l,i)=>add('route-'+i,'travel',{from:l.current?'currentGPS':l.from.title,to:l.to.title,minutes:Math.ceil(l.route.minutes),mode:l.mode,current:!!l.current,gpsUpdated:!!l.current&&model.gpsUpdated===true,availableMinutes:l.availableMinutes,risk:l.risk,start:time(l.target?.start),leaveAt:time(l.leaveAt),leaveBy:time(l.target?.start-Math.ceil(l.route.minutes)*60000),bufferMinutes:l.leaveAt?10:0}));
  if(model.weather?.available&&!model.weather.stale){const w=model.weather;add('weather','weather',{date:model.date,timezone:w.timezone||null,period:w.period,temperatureMin:w.temperatureMin,temperatureMax:w.temperatureMax,rain:w.rain||null,wind:w.wind||null});}
  (model.holidays?.items||[]).slice(0,4).forEach((h,i)=>add('holiday-'+i,'holiday',{name:h.localName,country:model.holidays.countryLabel,source:'Nager.Date'}));
  if(model.presentation?.includeYaga&&model.inspiration?.date===model.date)add('inspiration','inspiration',{date:model.date,source:'Księga Yagi',theme:model.inspiration.label,...model.inspiration.detail});
  return result;
 }
 function context(model,brief){const display=model.presentation||presentation(model);return {schemaVersion:2,mode:model.mode,date:model.date,today:localDay(model.now||new Date()),presentation:display,speechBudget:model.speechBudget||90,facts:structuredFacts({...model,presentation:display},brief)}}
 // Only values are sent to the writer: legacy UI phrases are never examples
 // or candidate prose for a current briefing.
 function forModel(value){const data=input(value);return data.schemaVersion===2?{...data,facts:data.facts.map(f=>({id:f.id,kind:f.kind,values:JSON.parse(f.text),priority:f.priority}))}:data;}
 function input(value){
  const v2=value?.schemaVersion===2;
  if(!value||!['remaining','plan','review'].includes(value.mode)||!Array.isArray(value.facts)||value.facts.length<2||value.facts.length>47||JSON.stringify(value).length>(v2?50000:24000))throw Error('Nieprawidłowe fakty podsumowania.');
  const dates={};if(value.date!=null||value.today!=null){if(!validDay(value.date)||!validDay(value.today)||value.mode==='remaining'&&value.date!==value.today||value.mode==='review'&&value.date>value.today)throw Error('Nieprawidłowa data podsumowania.');Object.assign(dates,{date:value.date,today:value.today,relativeDay:relativeDay(value.date,value.today)})}
  const ids=new Set();
  const list=value.facts.map(f=>{
   if(!f||!/^[-a-z0-9]{1,40}$/.test(f.id)||ids.has(f.id)||!kinds.has(f.kind)||typeof f.text!=='string'||!f.text.trim()||f.text.length>(v2?6000:900)||![0,1,2,3].includes(f.priority))throw Error('Nieprawidłowy fakt podsumowania.');
   if(v2){const parsed=JSON.parse(f.text);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Nieprawidłowe dane faktu.');}
   ids.add(f.id);return {id:f.id,kind:f.kind,text:f.text,priority:f.priority};
  });
  if(!list.some(f=>f.id==='count'&&f.kind==='count')||!list.some(f=>f.id==='date'&&f.kind==='date'))throw Error('Brak zakresu lub liczby spotkań.');
  const complexity=list.filter(f=>f.kind==='warning').length,budget=complexity>2?120:complexity||list.some(f=>f.kind==='weather'||f.kind==='holiday')?85:45;
  if(v2){const speechBudget=value.speechBudget??value.wordBudget;if(!dates.date||!value.presentation||!['morning','future','update','full','review'].includes(value.presentation.kind)||typeof value.presentation.includeYaga!=='boolean'||!Number.isInteger(speechBudget)||speechBudget<50||speechBudget>110)throw Error('Nieprawidłowy zakres narracji.');return {schemaVersion:2,mode:value.mode,...dates,presentation:{kind:value.presentation.kind,includeYaga:value.presentation.includeYaga,previousCount:Math.max(0,Math.min(1000,Number(value.presentation.previousCount)||0))},facts:list,speechBudget,wordBudget:speechBudget,targetSpeechSeconds:50};}
  return {mode:value.mode,...dates,facts:list,wordBudget:budget};
 }
 function validate(value,context){
  const data=input(context),byId=new Map(data.facts.map(f=>[f.id,f]));
  function sentence(s){
   if(!s||typeof s.text!=='string'||!s.text.trim()||s.text.length>(data.schemaVersion===2?1800:650)||/[<>\u0000-\u0008]/.test(s.text)||!Array.isArray(s.factIds)||!s.factIds.length||s.factIds.length>8||s.factIds.some(id=>!byId.has(id)))throw Error('Niepoparta treść podsumowania.');
   const evidence=s.factIds.map(id=>byId.get(id).text).join(' '),allowed=new Set(numbers(evidence));
   if(numbers(checkedDateText(s.text,evidence)).some(n=>!allowed.has(n)))throw Error('AI podało liczbę spoza przekazanych faktów.');
   const attendance=/odby[łl]|uczestniczy[łl]|zrealizowa[łl]|zrobi[łl]e[śs]|by[łl]e[śs]/i.test(s.text),uncertain=/nie (?:wiem|wiemy|wiadomo|potwierdza(?:my|m)?|mam(?:y)? potwierdzenia)|bez potwierdzenia|brak (?:danych|potwierdzenia)/i.test(s.text);
   if(data.mode==='review'&&attendance&&!uncertain)throw Error('Plan nie potwierdza odbycia spotkań.');
   if(data.mode!=='review'&&s.factIds.some(id=>['count','activity','load'].includes(byId.get(id).kind))&&/(?:^|[\s,.])(?:były|było|miałeś|miałaś)\s[^.!?]*(?:spotkani|wydarze|plan)/iu.test(s.text))throw Error('Aktualny plan nie może być opisany jako zakończone spotkania.');
   return {text:s.text.trim(),factIds:[...new Set(s.factIds)]};
  }
  if(!value||!Array.isArray(value.insights)||value.insights.length>(data.schemaVersion===2?12:5)||!Array.isArray(value.spoken)||!value.spoken.length||value.spoken.length>(data.schemaVersion===2?12:7))throw Error('Nieprawidłowa odpowiedź AI.');
  // Location, date and missing-provider diagnostics remain context. They are not
  // useful standalone findings to repeat in the report or read aloud.
  const emptyDay=data.schemaVersion===2&&JSON.parse(byId.get('count').text).meetings===0;
  const useful=(s,voice=false)=>s.factIds.some(id=>!['date',...(data.schemaVersion===2?[]:['location']),'limitation',...(voice||emptyDay||data.schemaVersion===2&&data.mode==='review'?[]:['count'])].includes(byId.get(id).kind));
  const correctDay=s=>{if(!data.date||!s.factIds.some(id=>byId.get(id).kind==='inspiration'))return true;const text=s.text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();return [[/\b(?:dzis|dzisiaj|dzisiejsz[a-z]*)\b/,'today'],[/\b(?:jutro|jutrzejsz[a-z]*)\b/,'tomorrow'],[/\b(?:wczoraj|wczorajsz[a-z]*)\b/,'yesterday']].every(([pattern,day])=>!pattern.test(text)||data.relativeDay===day)};
  const candidate=value.intro===null?null:sentence(value.intro),intro=candidate&&useful(candidate)?candidate:null,insights=value.insights.map(sentence).filter(s=>useful(s)),spoken=value.spoken.map(sentence).filter(s=>useful(s,true)).filter(correctDay);
  const weather=value.weather==null?null:sentence(value.weather);if(weather&&!weather.factIds.every(id=>byId.get(id).kind==='weather'))throw Error('Opis pogody wymaga aktualnej prognozy.');
  const inspirationCandidate=value.inspiration==null?null:sentence(value.inspiration);if(inspirationCandidate&&(inspirationCandidate.text.length>(data.schemaVersion===2?1800:340)||!inspirationCandidate.factIds.includes('inspiration')||!inspirationCandidate.factIds.every(id=>['inspiration','activity','load','count'].includes(byId.get(id).kind))))throw Error('Niepoparta inspiracja dnia.');
  // An optional inspiration with the wrong day must not discard valid weather
  // or calendar analysis. The UI retains the dated source text instead.
  const inspiration=inspirationCandidate&&correctDay(inspirationCandidate)?inspirationCandidate:null;
  if([...(intro?[intro]:[]),...insights,...(weather?[weather]:[])].some(s=>s.factIds.some(id=>byId.get(id).kind==='inspiration')))throw Error('Inspiracja astrologiczna wymaga osobnej sekcji.');
  if(spoken.some(s=>s.factIds.some(id=>byId.get(id).kind==='inspiration')&&!/astrolog|kalendarz[a-ząćęłńóśźż]* jagi|ksi[eę]g[a-ząćęłńóśźż]* yagi/iu.test(s.text)))throw Error('Głos musi wskazywać astrologiczne źródło inspiracji.');
  if(data.schemaVersion===2){
   if(!data.presentation.includeYaga&&(inspiration||spoken.some(s=>s.factIds.includes('inspiration'))))throw Error('Ta aktualizacja nie obejmuje Księgi Yagi.');
   const prohibited=/między zapisami|mi[eę]dzy wpisami|kalendarz nie wyznacza|rytm[u]? dnia|brak spotkań,? więc/iu;
   if([intro,weather,inspiration,...insights,...spoken].filter(Boolean).some(s=>prohibited.test(s.text)))throw Error('Opis zawiera pusty lub techniczny komentarz.');
   // Ordering is deterministic, wording is entirely the model's.
   spoken.sort((a,b)=>Number(b.factIds.includes('weather'))-Number(a.factIds.includes('weather'))||Number(a.factIds.includes('inspiration'))-Number(b.factIds.includes('inspiration')));
   if(byId.has('weather')&&(!weather||!spoken.some(s=>s.factIds.includes('weather'))))throw Error('Aktualna pogoda musi otwierać opis i odczyt.');
   const visible=[intro,...insights].filter(Boolean),route=data.facts.find(f=>f.kind==='travel'&&JSON.parse(f.text).current);
   if(route&&(!visible.some(s=>s.factIds.includes(route.id))||!spoken.some(s=>s.factIds.includes(route.id))))throw Error('Pomięto dojazd na najbliższe spotkanie.');
   for(const f of data.facts.filter(f=>f.kind==='warning'&&f.priority===3))if(!visible.some(s=>s.factIds.includes(f.id)))throw Error('Pomięto ważne ostrzeżenie na ekranie.');
   const fix=byId.has('location')&&JSON.parse(byId.get('location').text).freshFix;
   if(!fix&&[...visible,...spoken].some(s=>/(?:sprawdziłem|zaktualizowałem|odświeżyłem)[^.!?]*(?:pozycj|lokalizacj)/iu.test(s.text)))throw Error('Brak potwierdzenia aktualizacji GPS.');
  }
  const speech=spoken.map(s=>s.text).join(' ');
  if(!spoken.some(s=>s.factIds.includes('count'))||words(speech)>data.wordBudget||speech.length>3000)throw Error('Zbyt długie lub niepełne podsumowanie głosowe.');
  for(const fact of data.facts.filter(f=>f.kind==='warning'&&f.priority===3))if(!spoken.some(s=>s.factIds.includes(fact.id)))throw Error('W głosie pominięto istotne ostrzeżenie.');
  if(data.mode==='review'&&!spoken.some(s=>/plan|kalendarz/iu.test(s.text)))throw Error('Przegląd musi dotyczyć planu w kalendarzu.');
  return {intro,weather,inspiration,insights,spoken,speech:spoken.map(s=>s.text).join(' '),wordCount:words(spoken.map(s=>s.text).join(' '))};
 }
 function fallback(model,brief){
  const sentences=[brief.countText,...brief.warnings.slice(0,2).map(w=>w.text)];
  if(model.weather?.available&&!model.weather.stale)sentences.push(weatherText(model));
  const holiday=model.holidays?.items?.[0];if(holiday)sentences.push('Święto ustawowe: '+holiday.localName+'.');
  if(model.inspiration&&model.inspiration.date===model.date&&model.mode!=='review')sentences.push('Astrologiczna '+inspirationTitle(model).toLocaleLowerCase('pl-PL')+' z Kalendarza Jagi: '+model.inspiration.text);
  // The voice stays concise even after all on-screen warnings are expanded.
  const kept=[];let length=0;for(const text of sentences){const size=words(text);if(length+size>120)break;kept.push(text);length+=size}return kept.join(' ');
 }
 return {facts,structuredFacts,context,forModel,presentation,input,validate,fallback,weatherText,inspirationTitle};
})();
if(typeof module==='object'&&module.exports)module.exports=OktiBriefNarrative;
if(typeof window!=='undefined')window.OktiBriefNarrative=OktiBriefNarrative;
