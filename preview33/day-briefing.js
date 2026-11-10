// Read-only calendar briefing. Provider calls and UI remain in their adapters.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OktiDayBriefing=api;})(globalThis,()=>{
 const pad=n=>String(n).padStart(2,'0');
 const dayKey=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
 const clock=d=>pad(d.getHours())+':'+pad(d.getMinutes());
 const validDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&dayKey(new Date(s+'T12:00:00'))===s;
 const validClock=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
 const minutes=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
 const title=item=>String(item.title||item.text||'Bez nazwy');
 const location=item=>String(item.location??item.googleData?.location??'').trim();
 const locationKey=s=>s.toLocaleLowerCase('pl').replace(/\s+/g,' ').trim();
 function nextDay(day,shift=1){const d=new Date(day+'T12:00:00');d.setDate(d.getDate()+shift);return dayKey(d)}
 function target(action={},now=new Date()){
  const date=action.date||nextDay(dayKey(now),action.day==='tomorrow'?1:action.day==='yesterday'?-1:0);
  if(!validDay(date))throw Error('Nieprawidłowy dzień podsumowania.');
  const mode=action.briefMode||(date<dayKey(now)?'review':date>dayKey(now)?'plan':'remaining');
  if(!['remaining','plan','review'].includes(mode)||mode==='remaining'&&date!==dayKey(now)||mode==='review'&&date>dayKey(now))throw Error('Nieprawidłowy zakres podsumowania.');
  return {date,mode,title:mode==='review'?'Podsumowanie dnia':date===dayKey(now)?'Co jeszcze dziś':date===nextDay(dayKey(now))?'Plan na jutro':'Plan dnia'};
 }
 function interval(item){
  if(!validDay(item.date))return null;
  const time=item.startTime??item.time??'';
  if(!time){const end=validDay(item.endDate)&&item.endDate>item.date?item.endDate:nextDay(item.date);return {start:+new Date(item.date+'T00:00:00'),end:+new Date(end+'T00:00:00'),allDay:true,hasEnd:true};}
  if(!validClock(time))return null;
  const start=+new Date(item.date+'T'+time+':00');
  if(!validClock(item.endTime))return {start,end:start,allDay:false,hasEnd:false};
  const endDate=validDay(item.endDate)?item.endDate:nextDay(item.date,item.endTime<=time?1:0),end=+new Date(endDate+'T'+item.endTime+':00');
  return end>=start?{start,end,allDay:false,hasEnd:true}:null;
 }
 function events(items,date,now=new Date(),mode='remaining'){
  const start=+new Date(date+'T00:00:00'),end=+new Date(nextDay(date)+'T00:00:00'),stamp=+now;
  return items.flatMap(item=>{
   const span=interval(item);if(!span||span.start>=end||span.end<start||span.end===start&&span.start<start)return [];
   if(mode!=='review'&&(item.done||mode==='remaining'&&(span.hasEnd?span.end<=stamp:span.start<stamp)))return [];
   const status=span.allDay?'all-day':mode==='review'?'past':span.start<=stamp&&span.end>stamp?'ongoing':'upcoming';
   const finish=span.hasEnd&&!span.allDay?clock(new Date(span.end))+(dayKey(new Date(span.end))!==date?' ('+dayKey(new Date(span.end))+')':''):'',time=span.allDay?'Cały dzień':(dayKey(new Date(span.start))!==date?'od '+dayKey(new Date(span.start))+' ':'')+clock(new Date(span.start))+(finish?'–'+finish:'');
   return [{type:'event',item,title:title(item),...span,status,summaryMeta:(status==='ongoing'?'Trwa · ':'')+time+(mode==='review'&&item.done?' · oznaczone jako wykonane':'')}];
  }).sort((a,b)=>Number(b.allDay)-Number(a.allDay)||a.start-b.start||a.title.localeCompare(b.title,'pl'));
 }
 function weather(details,date,now=new Date(),mode='remaining'){
  if(!details||!Array.isArray(details.rows))return {text:'Brak aktualnej prognozy dla Twojej lokalizacji.',available:false};
  let from=mode==='remaining'?now.getHours()*60:0;
  if(mode==='remaining'&&details.timezone){
   try{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:details.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
    if(p.year+'-'+p.month+'-'+p.day!==date)return {text:'Prognoza dotyczy innej daty miejscowej. Sprawdź pogodę dla swojej lokalizacji.',available:false};from=Number(p.hour)*60;
   }catch(_){}
  }
  const rows=details.rows.filter(r=>validClock(r.time)&&minutes(r.time)>=from&&Number.isFinite(r.temperature)).sort((a,b)=>minutes(a.time)-minutes(b.time));
  if(!rows.length)return {text:'Brak dalszej prognozy godzinowej na ten dzień.',available:false};
  const place=details.place||'Twoja lokalizacja',text=[],first=rows[0],peak=rows.reduce((a,b)=>b.temperature>a.temperature?b:a),after=rows.filter(r=>minutes(r.time)>minutes(peak.time)),low=after.reduce((a,b)=>!a||b.temperature<a.temperature?b:a,null);
  if(mode==='plan'){const min=Math.min(...rows.map(r=>r.temperature)),max=Math.max(...rows.map(r=>r.temperature));text.push('Temperatura od '+Math.round(min)+' do '+Math.round(max)+'°C.');}
  if(low&&peak.temperature-low.temperature>=3){
   text.push((mode==='remaining'&&peak.temperature-first.temperature<2?'Do '+low.time+' ochłodzi się z '+Math.round(first.temperature)+' do '+Math.round(low.temperature)+'°C.':'Około '+peak.time+' do '+Math.round(peak.temperature)+'°C, później spadek do '+Math.round(low.temperature)+'°C około '+low.time+'.'));
  }else if(mode==='remaining'){
   const min=Math.round(Math.min(...rows.map(r=>r.temperature))),max=Math.round(Math.max(...rows.map(r=>r.temperature)));
   text.push(peak.temperature-first.temperature>=3?'Do '+peak.time+' ociepli się do '+Math.round(peak.temperature)+'°C.':rows.length===1?'Najbliższa prognoza: '+Math.round(first.temperature)+'°C.':'Bez dużej zmiany temperatury: '+(min===max?min:min+'–'+max)+'°C.');
  }
  const wet=rows.find(r=>Number.isFinite(r.rain)&&r.rain>=50||Number.isFinite(r.code)&&r.code>=51&&r.code<=99),wind=rows.reduce((a,b)=>(b.wind||0)>(a?.wind||0)?b:a,null);
  if(wet){const kind=wet.code>=95?'burze':wet.code>=71&&wet.code<=77||wet.code===85||wet.code===86?'śnieg':'opady';text.push('Możliwe '+kind+(mode==='remaining'&&minutes(wet.time)<=now.getHours()*60?' w najbliższej godzinie':' około '+wet.time)+(Number.isFinite(wet.rain)?' (prawdopodobieństwo '+Math.round(wet.rain)+'%)':'')+'.');}
  if(wind?.wind>=40)text.push('Wiatr do '+Math.round(wind.wind)+' km/h około '+wind.time+'.');
  const stale=!!details.stale,prefix=stale?'Zapisana prognoza z '+new Date(details.at).toLocaleString('pl-PL',{day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'})+'. ':'';
  return {available:true,place,stale,text:prefix+text.join(' ')};
 }
 function freeWindows(start,end,items,excluded=[]){
  if(end<=start)return [];
  const skip=new Set(excluded.map(String)),busy=items.filter(item=>!item.done&&!skip.has(String(item.id))).map(interval).filter(span=>span&&!span.allDay&&span.hasEnd&&span.end>start&&span.start<end).sort((a,b)=>a.start-b.start);
  const windows=[];let cursor=start;for(const span of busy){if(span.start>cursor)windows.push([cursor,Math.min(span.start,end)]);cursor=Math.max(cursor,span.end)}if(cursor<end)windows.push([cursor,end]);return windows;
 }
 const modeNames={drive:'samochodem',walk:'pieszo',bicycle:'rowerem',transit:'komunikacją'};
 const duration=n=>n>=60?Math.floor(n/60)+' godz.'+(n%60?' '+n%60+' min':''):n+' min';
 async function travel(records,all,{now=new Date(),mode='remaining',origin=null,route=async()=>null,cached=()=>null,getMode=()=> 'drive',maxRequests=8}={}){
  const timed=records.filter(r=>!r.allDay),located=timed.filter(r=>location(r.item)),warnings=[],legs=[],notes=[];
  for(let i=0;i<timed.length;i++)for(let j=i+1;j<timed.length&&timed[j].start<timed[i].end;j++)if(timed[i].hasEnd&&timed[j].hasEnd){const overlap=Math.min(timed[i].end,timed[j].end)-Math.max(timed[i].start,timed[j].start);if(overlap>0)warnings.push({kind:'overlap',text:'Terminy „'+timed[i].title+'” i „'+timed[j].title+'” nakładają się o '+Math.ceil(overlap/60000)+' min.'});}
  const validOrigin=origin&&Number.isFinite(origin.latitude)&&Math.abs(origin.latitude)<=90&&Number.isFinite(origin.longitude)&&Math.abs(origin.longitude)<=180&&Number.isFinite(origin.checkedAt)&&+now-origin.checkedAt<15*60000&&+now-origin.checkedAt>=0&&(!Number.isFinite(origin.accuracy)||origin.accuracy<=1000);
  if(located.length&&validOrigin){const target=located[0],from={id:'@device',location:origin.latitude+','+origin.longitude,title:'Twoja ostatnia lokalizacja'};legs.push({from,to:target.item,target,origin:{latitude:origin.latitude,longitude:origin.longitude},current:true,start:+now,end:target.start,mode:getMode(null,target.item)});}
  else if(located.length)notes.push('Brak aktualnej, dostatecznie dokładnej lokalizacji — nie oceniam dojazdu od Ciebie do pierwszego spotkania.');
  for(let i=0;i<located.length-1;i++){const from=located[i],to=located[i+1];if(locationKey(location(from.item))===locationKey(location(to.item)))continue;legs.push({from:from.item,to:to.item,target:to,start:Math.max(from.end,mode==='remaining'?+now:from.end),end:to.start,mode:getMode(from.item,to.item)});}
  let requested=0,index=0;
  async function work(){while(index<legs.length){const leg=legs[index++];try{let value=cached(leg.from,leg.to,leg.mode);if(!value&&requested<maxRequests){requested++;value=await route(leg.from,leg.to,{mode:leg.mode,origin:leg.origin});}leg.route=value;}catch(_){leg.route=null}}}
  await Promise.all([work(),work()]);
  for(const leg of legs){
   const r=leg.route;if(!r||!Number.isFinite(r.minutes)||r.minutes<0){leg.text='Nie udało się ustalić czasu dojazdu do „'+title(leg.to)+'”.';continue;}
   const mins=Math.ceil(r.minutes),distance=Number.isFinite(r.distanceMeters)?', '+(r.distanceMeters>=10000?Math.round(r.distanceMeters/1000):Math.round(r.distanceMeters/100)/10)+' km':'';
   leg.text=(leg.current?(mode==='plan'?'Z dzisiejszej lokalizacji':'Z ostatniej lokalizacji')+' do „'+title(leg.to)+'”':'„'+title(leg.from)+'” → „'+title(leg.to)+'”')+': około '+duration(mins)+' '+(modeNames[leg.mode]||modeNames.drive)+distance+'.';
   if(leg.current&&mode==='plan'){leg.risk='planning';continue;}
   if(leg.current&&leg.target.status==='ongoing'){leg.risk='ongoing';if(r.distanceMeters>2000)warnings.push({kind:'ongoing-travel',text:'„'+title(leg.to)+'” według kalendarza już trwa. '+leg.text});continue;}
   const windows=freeWindows(leg.start,leg.end,all,[leg.from.id,leg.to.id]),available=Math.max(0,...windows.map(([a,b])=>(b-a)/60000));
   leg.availableMinutes=Math.floor(available);leg.risk=mins>available?'late':mins+10>available?'tight':'safe';
   if(leg.risk==='late')warnings.push({kind:'travel',text:'Ryzyko spóźnienia do „'+title(leg.to)+'”: dojazd około '+duration(mins)+', a wolna przerwa tylko '+Math.floor(available)+' min. Brakuje około '+Math.ceil(mins-available)+' min.'});
   else if(leg.risk==='tight')warnings.push({kind:'tight',text:'Mały zapas przed „'+title(leg.to)+'”: po dojeździe zostaje około '+Math.max(0,Math.floor(available-mins))+' min.'});
   if(leg.current&&leg.risk!=='late'){const window=windows.filter(([a,b])=>b-a>=mins*60000).at(-1);if(window){const leave=window[1]-(mins+10)*60000;leg.leaveAt=Math.max(+now,leave);leg.text+=' '+(leave<=+now?'Warto wyruszyć teraz.':'Zaplanuj wyjazd około '+clock(new Date(leave))+' (z 10 min zapasu).');}}
  }
  if(timed.some(r=>!location(r.item)))notes.push('Wydarzenia bez lokalizacji ograniczają ocenę tras.');
  if(legs.some(l=>!l.route||!Number.isFinite(l.route.minutes)))notes.push('Nie wszystkie dojazdy zostały ustalone.');
  return {legs,warnings,notes};
 }
 function speech(model){
  const {mode,date,records,entry,weather:forecast,travel:journey}=model,parts=[];
  const count=(n,one,few,many)=>n+' '+(n===1?one:n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?few:many);
  const finish=()=>{let text=parts.join(' ');for(const r of records)if(r.title.length>110)text=text.split(r.title).join(r.title.slice(0,110).trimEnd()+'…');return text};
  if(mode==='review'){
   parts.push('Podsumowanie '+new Date(date+'T12:00:00').toLocaleDateString('pl-PL',{day:'numeric',month:'long'})+'.');
   parts.push('W kalendarzu: '+count(records.length,'zaplanowane wydarzenie','zaplanowane wydarzenia','zaplanowanych wydarzeń')+'. Oznaczone jako wykonane: '+records.filter(r=>r.item.done).length+'.');
   if(records.length)parts.push('W planie: '+records.slice(0,4).map(r=>r.title).join(', ')+(records.length>4?' i '+(records.length-4)+' dalsze wydarzenia':'')+'.');
   // A future task module can provide its own dated completion adapter.
   if(entry?.complete?.length)parts.push('Wykonane zadania: '+entry.complete.slice(0,4).map(r=>r.title).join(', ')+'.');
   if(entry?.pending?.length)parts.push('Do zrobienia pozostaje '+entry.pending.length+' zadań z terminem tego dnia.');return finish();
  }
  parts.push((mode==='remaining'?'Jeszcze dzisiaj':'Plan na '+new Date(date+'T12:00:00').toLocaleDateString('pl-PL',{day:'numeric',month:'long'}))+': '+(records.length?count(records.length,'wydarzenie','wydarzenia','wydarzeń')+' w kalendarzu.':'brak kolejnych wydarzeń w kalendarzu.'));
  const spokenOrder=[...records.filter(r=>!r.allDay),...records.filter(r=>r.allDay)];
  for(const r of spokenOrder.slice(0,4))parts.push((r.status==='ongoing'?'Trwa ':r.allDay?'Cały dzień: ':'O '+clock(new Date(r.start))+': ')+r.title+'.');
  if(records.length>4)parts.push('Pozostałe '+(records.length-4)+' wydarzeń pokazuję na ekranie.');
  if(entry?.pending?.length)parts.push('Do zrobienia także: '+entry.pending.slice(0,3).map(r=>r.title).join(', ')+(entry.pending.length>3?' i '+(entry.pending.length-3)+' dalsze wpisy':'')+'.');
  for(const warning of (journey?.warnings||[]).slice(0,3))parts.push(warning.text);
  if(journey?.warnings.length>3)parts.push('Pozostałe ostrzeżenia: '+(journey.warnings.length-3)+'. Pokazuję je na ekranie.');
  const first=journey?.legs.find(l=>l.current&&l.route);if(first&&!journey.warnings.some(w=>w.kind==='ongoing-travel'))parts.push(first.text);
  for(const leg of (journey?.legs||[]).filter(l=>!l.current&&l.route&&(l.route.minutes>=45||l.route.distanceMeters>=50000)).slice(0,2))parts.push('Dłuższy dojazd: '+leg.text);
  if(journey?.notes.length)parts.push(journey.notes.join(' '));
  if(forecast)parts.push((forecast.place?'Pogoda dla '+forecast.place+'. ':'')+forecast.text);
  return finish();
 }
 return {target,interval,events,weather,travel,freeWindows,speech,dayKey,clock,duration};
});
