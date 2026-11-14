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
  const weekdays=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'],weekday=weekdays.indexOf(action.day);
  if(action.day&&!['today','tomorrow','yesterday',...weekdays].includes(action.day))throw Error('Nieprawidłowy dzień podsumowania.');
  const shift=weekday<0?(action.day==='tomorrow'?1:action.day==='yesterday'?-1:0):action.briefMode==='review'?-((now.getDay()-weekday+7)%7):(weekday-now.getDay()+7)%7;
  const date=action.date||nextDay(dayKey(now),shift);
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
   if(mode==='review'&&date===dayKey(now)&&(span.hasEnd?span.end>stamp:span.start>stamp))return [];
   if(mode!=='review'&&(item.done||mode==='remaining'&&(span.hasEnd?span.end<=stamp:span.start<stamp)))return [];
   const status=span.allDay?'all-day':mode==='review'?'past':span.start<=stamp&&span.end>stamp?'ongoing':'upcoming';
   const finish=span.hasEnd&&!span.allDay?clock(new Date(span.end))+(dayKey(new Date(span.end))!==date?' ('+dayKey(new Date(span.end))+')':''):'',time=span.allDay?'Cały dzień':(dayKey(new Date(span.start))!==date?'od '+dayKey(new Date(span.start))+' ':'')+clock(new Date(span.start))+(finish?'–'+finish:'');
   return [{type:'event',item,title:title(item),...span,status,summaryMeta:(status==='ongoing'?'Trwa · ':'')+time}];
  }).sort((a,b)=>Number(b.allDay)-Number(a.allDay)||a.start-b.start||a.title.localeCompare(b.title,'pl'));
 }
 function calendarContext(date){
  if(!validDay(date))throw Error('Nieprawidłowa data.');
  const [year,month,day]=date.split('-').map(Number),stamp=Date.UTC(year,month-1,day),start=Date.UTC(year,0,1),end=Date.UTC(year+1,0,1);
  return {dayOfYear:Math.round((stamp-start)/86400000)+1,daysInYear:Math.round((end-start)/86400000),daysRemaining:Math.round((end-stamp)/86400000)-1};
 }
 function dayOverview({date,mode,now=new Date(),records=[],travel}){
  const start=Math.max(+new Date(date+'T00:00:00'),mode==='remaining'?+now:0),end=+new Date(nextDay(date)+'T00:00:00');
  const spans=records.filter(r=>!r.allDay&&r.hasEnd&&Number.isFinite(r.start)&&Number.isFinite(r.end)).map(r=>[Math.max(start,r.start),Math.min(end,r.end)]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]),merged=[];
  for(const [a,b] of spans){const previous=merged.at(-1);if(previous&&a<=previous[1])previous[1]=Math.max(previous[1],b);else merged.push([a,b])}
  const occupiedMinutes=Math.round(merged.reduce((sum,[a,b])=>sum+b-a,0)/60000),longestGapMinutes=Math.round(Math.max(0,...merged.slice(1).map(([a],i)=>a-merged[i][1]))/60000);
  const allDayCount=records.filter(r=>r.allDay).length,unknownEndCount=records.filter(r=>!r.allDay&&!r.hasEnd).length;
  const knownRoutes=(travel?.legs||[]).filter(l=>Number.isFinite(l.route?.minutes)&&l.route.minutes>=0),routeMinutes=Math.ceil(knownRoutes.reduce((sum,l)=>sum+l.route.minutes,0));
  return {occupiedMinutes,longestGapMinutes,allDayCount,unknownEndCount,timedCount:spans.length,routeMinutes,knownRouteCount:knownRoutes.length,firstStart:merged[0]?.[0]??null,lastEnd:merged.at(-1)?.[1]??null};
 }
 function weather(details,date,now=new Date(),mode='remaining'){
  if(!details||!Array.isArray(details.rows))return {text:'Brak aktualnej prognozy dla Twojej lokalizacji.',available:false};
  let from=mode==='remaining'?now.getHours()*60:0,nowMinute=mode==='remaining'?now.getHours()*60+now.getMinutes():0;
  if(mode==='remaining'&&details.timezone){
   try{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:details.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
    if(p.year+'-'+p.month+'-'+p.day!==date)return {text:'Prognoza dotyczy innej daty miejscowej. Sprawdź pogodę dla swojej lokalizacji.',available:false};from=Number(p.hour)*60;nowMinute=from+Number(p.minute);
   }catch(_){}
  }
  const rows=details.rows.filter(r=>validClock(r.time)&&minutes(r.time)>=from&&Number.isFinite(r.temperature)).sort((a,b)=>minutes(a.time)-minutes(b.time));
  if(!rows.length)return {text:'Brak dalszej prognozy godzinowej na ten dzień.',available:false};
  // The headline describes waking hours, rather than overnight extrema.
  // Keep night conditions available for a relevant warning, without calling them daytime weather.
  const dayRows=rows.filter(r=>minutes(r.time)>=8*60&&minutes(r.time)<20*60),main=dayRows.length?dayRows:rows;
  const place=details.place||'Twoja lokalizacja',text=[],first=main[0],peak=main.reduce((a,b)=>b.temperature>a.temperature?b:a),after=main.filter(r=>minutes(r.time)>minutes(peak.time)),low=after.reduce((a,b)=>!a||b.temperature<a.temperature?b:a,null);
  const weekday=new Date(date+'T12:00:00').getDay(),night='w nocy z '+['soboty','niedzieli','poniedziałku','wtorku','środy','czwartku','piątku'][weekday]+' na '+['niedzielę','poniedziałek','wtorek','środę','czwartek','piątek','sobotę'][weekday];
  const period=time=>{const n=minutes(time);return n<5*60&&mode==='plan'?night:n===0?'o północy':n<5*60?'w nocy':n<7*60?'nad ranem':n<11*60?'rano':n<12*60?'przed południem':n<18*60?'po południu':n<22*60?'wieczorem':'późnym wieczorem'};
  const min=Math.round(Math.min(...main.map(r=>r.temperature))),max=Math.round(Math.max(...main.map(r=>r.temperature))),range=min===max?min+'°C':'od '+min+' do '+max+'°C';
  if(mode==='remaining'&&dayRows.length&&low&&peak.temperature-low.temperature>=3){
   const when=period(low.time);text.push(when[0].toUpperCase()+when.slice(1)+' ochłodzi się z '+Math.round(peak.temperature)+' do '+Math.round(low.temperature)+'°C.');
  }else if(mode==='remaining'&&dayRows.length&&peak.temperature-first.temperature>=3){
   const when=period(peak.time);text.push(when[0].toUpperCase()+when.slice(1)+' ociepli się do '+Math.round(peak.temperature)+'°C.');
  }else{
   const label=dayRows.length?(mode==='plan'?'W dzień':'Do wieczora'):minutes(first.time)<7*60?'W nocy':'Wieczorem';text.push(label+' '+range+'.');
  }
  const isWet=r=>Number.isFinite(r.rain)&&r.rain>=50||Number.isFinite(r.amount)&&r.amount>=.1||Number.isFinite(r.code)&&r.code>=51&&r.code<=99;
  const wet=dayRows.find(isWet)||rows.find(isWet),wind=rows.reduce((a,b)=>(b.wind||0)>(a?.wind||0)?b:a,null);
  const feels=main.filter(r=>Number.isFinite(r.apparent)).map(r=>r.apparent),apparentMin=feels.length?Math.round(Math.min(...feels)):null,apparentMax=feels.length?Math.round(Math.max(...feels)):null;
  const counts=new Map();for(const row of main)if(Number.isFinite(row.code))counts.set(row.code,(counts.get(row.code)||0)+1);const conditionCode=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]??null;
  const condition=conditionCode===null?null:conditionCode===0?{code:0,kind:'sun',label:dayRows.length?'Słonecznie':'Bezchmurnie'}:conditionCode===1?{code:1,kind:'partly',label:'Małe zachmurzenie'}:conditionCode===2?{code:2,kind:'partly',label:'Umiarkowane zachmurzenie'}:conditionCode===3?{code:3,kind:'cloud',label:'Duże zachmurzenie'}:[45,48].includes(conditionCode)?{code:conditionCode,kind:'fog',label:'Mgła'}:{code:conditionCode,kind:conditionCode>=95?'storm':[71,73,75,77,85,86].includes(conditionCode)?'snow':'rain',label:conditionCode>=95?'Możliwe burze':[71,73,75,77,85,86].includes(conditionCode)?'Opady śniegu':'Opady i zachmurzenie'};
  const stamp=n=>{const shift=Math.floor(n/1440),minute=((n%1440)+1440)%1440;return nextDay(date,shift)+'T'+pad(Math.floor(minute/60))+':'+pad(minute%60)};
  const kindFor=r=>r.code>=95?'storm':[71,73,75,77,85,86].includes(r.code)?'snow':[68,69,83,84].includes(r.code)?'sleet':[66,67].includes(r.code)?'freezing-rain':[51,53,55,56,57].includes(r.code)?'drizzle':r.code>=61&&r.code<=82?'rain':'precipitation';
  const intensityFor=r=>[51,56,61,66,71,80,85].includes(r.code)?1:[53,63,73,81].includes(r.code)?2:[55,57,65,67,75,82,86].includes(r.code)?3:null;
  const samples=[...rows.map(r=>({...r,minute:minutes(r.time)})),...(details.nextNight?.date===nextDay(date)&&Array.isArray(details.nextNight?.rows)?details.nextNight.rows.filter(r=>validClock(r.time)&&minutes(r.time)<8*60).map(r=>({...r,minute:1440+minutes(r.time)})):[])].sort((a,b)=>a.minute-b.minute),groups=[];
  for(const r of samples){
   if(!isWet(r))continue;
   // Amounts and probabilities describe the preceding hour in Open-Meteo.
   // A code-only sample is instantaneous and is shown as an approximate hour.
   const preceding=Number.isFinite(r.amount)||Number.isFinite(r.rain),start=r.minute-(preceding?60:0),end=r.minute+(preceding?0:60);
   if(mode==='remaining'&&end<=nowMinute)continue;
   const clipped=mode==='remaining'?Math.max(start,nowMinute):start,kind=kindFor(r),intensity=intensityFor(r),night=clipped<7*60?'before':clipped>=20*60?'after':null,last=groups.at(-1);
   if(last&&last.kind===kind&&last.night===night&&clipped<=last.end){last.end=Math.max(last.end,end);last.intensity=last.intensity==null?intensity:intensity==null?last.intensity:Math.max(last.intensity,intensity)}
   else groups.push({start:clipped,end,kind,intensity,night,at:stamp(r.minute)});
  }
  const nightName=after=>{const end=new Date(nextDay(date,after?1:0)+'T12:00:00').getDay();return 'w nocy z '+['soboty','niedzieli','poniedziałku','wtorku','środy','czwartku','piątku'][end]+' na '+['niedzielę','poniedziałek','wtorek','środę','czwartek','piątek','sobotę'][end]};
  const rainPeriods=groups.map(g=>{
   const from=stamp(g.start),to=stamp(g.end),adjective=g.intensity===1?'słaby ':g.intensity===2?'umiarkowany ':g.intensity===3?'silny ':'';
   const description=g.kind==='snow'?'Możliwe '+(g.intensity===1?'słabe ':g.intensity===2?'umiarkowane ':g.intensity===3?'intensywne ':'')+'opady śniegu':g.kind==='drizzle'?'Możliwa '+(g.intensity===1?'słaba ':g.intensity===2?'umiarkowana ':g.intensity===3?'gęsta ':'')+'mżawka':g.kind==='storm'?'Możliwe burze':g.kind==='sleet'?'Możliwy deszcz ze śniegiem':g.kind==='freezing-rain'?'Możliwy '+adjective+'marznący deszcz':g.kind==='rain'?'Możliwy '+adjective+'deszcz':'Możliwe opady';
   const when=g.night?nightName(g.night==='after')+(g.start%1440>=4*60&&g.start%1440<7*60&&g.end%1440<=7*60?' nad ranem':''):period(from.slice(11));
   return {kind:g.kind,intensity:g.intensity===1?'light':g.intensity===2?'moderate':g.intensity===3?'heavy':null,from,to,night:g.night,at:g.at,label:description+' '+when+', około '+from.slice(11)+'–'+to.slice(11)+'.'};
  });
  const precipitationKnown=samples.length>0&&samples.every(r=>Number.isFinite(r.code)||Number.isFinite(r.rain)||Number.isFinite(r.amount));
  if(apparentMin!==null)text.push('Odczuwalna '+(apparentMin===apparentMax?apparentMin+'°C':'od '+apparentMin+' do '+apparentMax+'°C')+'.');
  if(condition)text.push(condition.label+'.');
  if(rainPeriods.length)text.push(...rainPeriods.map(p=>p.label));else text.push(precipitationKnown?'Bez opadów w prognozie.':'Brak danych o opadach.');
  if(wind?.wind>=40)text.push('Wiatr do '+Math.round(wind.wind)+' km/h '+period(wind.time)+'.');
  const stale=!!details.stale,prefix=stale?'Zapisana prognoza z '+new Date(details.at).toLocaleString('pl-PL',{day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'})+'. ':'';
  const rain=rainPeriods.find(p=>!p.night)||rainPeriods[0];
  return {available:true,place,stale,date,timezone:details.timezone||null,period:dayRows.length?'day':minutes(first.time)<7*60?'night':'evening',temperatureMin:min,temperatureMax:max,trendText:/ochłodzi|ociepli/u.test(text[0])?text[0]:null,apparentMin,apparentMax,condition,rainPeriods,precipitationKnown,rain:rain?{kind:rain.kind,at:rain.at}:null,wind:wind?.wind>=40?{kph:Math.round(wind.wind),at:date+'T'+wind.time}:null,rainAt:rain?.at||null,text:prefix+text.join(' ')};
 }
 function freeWindows(start,end,items,excluded=[]){
  if(end<=start)return [];
  const skip=new Set(excluded.map(String)),busy=items.filter(item=>!item.done&&!skip.has(String(item.id))).map(interval).filter(span=>span&&!span.allDay&&span.hasEnd&&span.end>start&&span.start<end).sort((a,b)=>a.start-b.start);
  const windows=[];let cursor=start;for(const span of busy){if(span.start>cursor)windows.push([cursor,Math.min(span.start,end)]);cursor=Math.max(cursor,span.end)}if(cursor<end)windows.push([cursor,end]);return windows;
 }
 const modeNames={drive:'samochodem',walk:'pieszo',bicycle:'rowerem',transit:'komunikacją'};
 const duration=n=>n>=60?Math.floor(n/60)+' godz.'+(n%60?' '+n%60+' min':''):n+' min';
 async function travel(records,all,{now=new Date(),mode='remaining',bufferMinutes=10,origin=null,route=async()=>null,cached=()=>null,getMode=()=> 'drive',maxRequests=8}={}){
  const buffer=[5,10,15].includes(Number(bufferMinutes))?Number(bufferMinutes):10;
  const timed=records.filter(r=>!r.allDay),located=timed.filter(r=>location(r.item)),warnings=[],legs=[],notes=[];
  for(let i=0;i<timed.length;i++)for(let j=i+1;j<timed.length&&timed[j].start<timed[i].end;j++)if(timed[i].hasEnd&&timed[j].hasEnd){const overlap=Math.min(timed[i].end,timed[j].end)-Math.max(timed[i].start,timed[j].start);if(overlap>0){const minutes=Math.ceil(overlap/60000),unit=minutes===1?'minutę':minutes%10>=2&&minutes%10<=4&&(minutes%100<12||minutes%100>14)?'minuty':'minut';warnings.push({kind:'overlap',eventIds:[timed[i].item.id,timed[j].item.id],text:'Terminy wydarzeń „'+timed[i].title+'” i „'+timed[j].title+'” nakładają się o '+minutes+' '+unit+'.'});}}
  const validOrigin=origin&&Number.isFinite(origin.latitude)&&Math.abs(origin.latitude)<=90&&Number.isFinite(origin.longitude)&&Math.abs(origin.longitude)<=180&&Number.isFinite(origin.checkedAt)&&+now-origin.checkedAt<15*60000&&+now-origin.checkedAt>=0&&(!Number.isFinite(origin.accuracy)||origin.accuracy<=1000);
  const next=timed.find(r=>r.status==='upcoming'&&r.start>+now);
  if(mode!=='review'&&next&&location(next.item)&&validOrigin){const target=next,from={id:'@device',location:origin.latitude+','+origin.longitude,title:'Aktualna lokalizacja'};legs.push({from,to:target.item,target,origin:{latitude:origin.latitude,longitude:origin.longitude},current:true,start:+now,end:target.start,mode:getMode(null,target.item)});}
  else if(mode!=='review'&&next&&location(next.item))notes.push('Brak aktualnej, dostatecznie dokładnej lokalizacji — nie oceniam dojazdu od Ciebie do pierwszego spotkania.');
  for(let i=0;i<located.length-1;i++){const from=located[i],to=located[i+1];if(locationKey(location(from.item))===locationKey(location(to.item)))continue;legs.push({from:from.item,to:to.item,target:to,start:Math.max(from.end,mode==='remaining'?+now:from.end),end:to.start,mode:getMode(from.item,to.item)});}
  let requested=0,index=0;
  async function work(){while(index<legs.length){const leg=legs[index++];try{let value=cached(leg.from,leg.to,leg.mode);if(!value&&requested<maxRequests){requested++;value=await route(leg.from,leg.to,{mode:leg.mode,origin:leg.origin});}leg.route=value;}catch(_){leg.route=null}}}
  await Promise.all([work(),work()]);
  for(const leg of legs){
   const r=leg.route;if(!r||!Number.isFinite(r.minutes)||r.minutes<0){leg.text='Nie udało się ustalić czasu dojazdu do „'+title(leg.to)+'”.';continue;}
   const mins=Math.ceil(r.minutes),distance=Number.isFinite(r.distanceMeters)?', '+(r.distanceMeters>=10000?Math.round(r.distanceMeters/1000):Math.round(r.distanceMeters/100)/10)+' km':'';
   leg.text=(leg.current?(mode==='plan'?'Z dzisiejszej lokalizacji':'Z ostatniej lokalizacji')+' do „'+title(leg.to)+'”':'„'+title(leg.from)+'” → „'+title(leg.to)+'”')+': około '+duration(mins)+' '+(modeNames[leg.mode]||modeNames.drive)+distance+'.';
   if(leg.current&&leg.target.status==='ongoing'){leg.risk='ongoing';if(r.distanceMeters>2000)warnings.push({kind:'ongoing-travel',eventIds:[leg.to.id],text:'„'+title(leg.to)+'” według kalendarza już trwa. '+leg.text});continue;}
   const windows=freeWindows(leg.start,leg.end,all,[leg.from.id,leg.to.id]),available=Math.max(0,...windows.map(([a,b])=>(b-a)/60000));
   leg.availableMinutes=Math.floor(available);
   const window=windows.filter(([a,b])=>b-a>=(mins+buffer)*60000).at(-1)||windows.filter(([a,b])=>b-a>=mins*60000).at(-1);
   if(window&&(leg.current||interval(leg.from)?.hasEnd)){
    leg.leaveAt=Math.max(window[0],window[1]-(mins+buffer)*60000);
    leg.bufferMinutes=Math.max(0,Math.min(buffer,Math.floor((window[1]-leg.leaveAt)/60000)-mins));
   }
   if(leg.current&&mode==='plan'){leg.risk='planning';continue;}
   leg.risk=mins>available?'late':mins+buffer>available?'tight':'safe';
   if(leg.risk==='late'){
    const overlap=!leg.current&&warnings.some(w=>w.kind==='overlap'&&w.eventIds.includes(leg.from.id)&&w.eventIds.includes(leg.to.id));
    const reason=overlap?'terminy wydarzeń się nakładają, a dojazd potrwa około ':'za mało czasu na dojazd, który potrwa około ';
    const travelDuration=mins===1?'minuty':mins<60?mins+' minut':duration(mins);
    warnings.push({kind:'travel',eventIds:[leg.to.id],text:'Ryzyko spóźnienia na spotkanie „'+title(leg.to)+'”: '+reason+travelDuration+'.'});
   }
   else if(leg.risk==='tight')warnings.push({kind:'tight',eventIds:[leg.to.id],text:'Mały zapas przed „'+title(leg.to)+'”: po dojeździe zostaje około '+Math.max(0,Math.floor(available-mins))+' min.'});
   if(leg.current&&leg.leaveAt!=null)leg.text+=' '+(leg.leaveAt<=+now?'Warto wyruszyć teraz.':'Zaplanuj wyjazd około '+clock(new Date(leg.leaveAt))+' (z '+leg.bufferMinutes+' min zapasu).');
  }
  if(timed.some(r=>!location(r.item)))notes.push('Wydarzenia bez lokalizacji ograniczają ocenę tras.');
  if(legs.some(l=>!l.route||!Number.isFinite(l.route.minutes)))notes.push('Nie wszystkie dojazdy zostały ustalone.');
  return {legs,warnings,notes};
 }
 // The briefing exposes counts and actionable risks. Detailed routes and
 // weather belong to their existing calendar/event views.
 function summary(model,{allWarnings=false}={}){
  const {mode,date,records=[],travel:journey}=model,now=model.now||new Date(),n=records.length;
  const count=n+' '+(n===1?'spotkanie':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'spotkania':'spotkań');
  const when=date===nextDay(dayKey(now))?'jutro':date===dayKey(now)?'dzisiaj':'tego dnia';
  const pastWhen=date===nextDay(dayKey(now),-1)?'Wczoraj':date===dayKey(now)?'Wcześniej dzisiaj':'Tego dnia';
  const countText=mode==='review'?pastWhen+' w kalendarzu zaplanowano '+count+'.':mode==='remaining'?(n?'Masz dziś jeszcze '+count+'.':'Na dziś nie masz już zaplanowanych spotkań.'):(n?'Masz '+when+' '+count+'.':'Nie masz '+when+' zaplanowanych spotkań.');
  const names=new Map(records.map(r=>[r.item.id,r.title])),starts=new Map(records.map(r=>[r.item.id,r.start]));
  const name=id=>{const text=String(names.get(id)||'Wydarzenie');return '„'+(text.length>80?text.slice(0,80).trimEnd()+'…':text)+'”'};
  const raw=journey?.warnings||[],overlaps=raw.filter(w=>w.kind==='overlap'),covered=new Set(),pairs=new Map();
  for(const warning of raw.filter(w=>w.kind==='travel')){
   const id=warning.eventIds?.[0],leg=journey.legs?.find(l=>l.to.id===id&&l.risk==='late');
   const pair=leg&&!leg.current&&overlaps.find(w=>w.eventIds.includes(id)&&w.eventIds.includes(leg.from.id));
   if(pair){pairs.set(warning,pair);covered.add(pair)}
  }
  const warnings=[];
  for(const warning of raw){
   const ids=warning.eventIds||[],id=ids[0];let text,rank=0;
   if(warning.kind==='travel')text='Ryzyko spóźnienia na spotkanie '+name(id)+' — '+(pairs.has(warning)?'terminy się nakładają.':'za mało czasu na dojazd.');
   else if(warning.kind==='ongoing-travel')text='Spotkanie '+name(id)+' według planu już trwa.';
   else if(warning.kind==='overlap'){if(covered.has(warning))continue;rank=1;text='Nakładają się terminy wydarzeń '+ids.map(name).join(' i ')+'.'}
   else if(warning.kind==='tight'){rank=2;text='Dojazd na spotkanie '+name(id)+' może być na styk.'}
   if(text&&!warnings.some(w=>w.kind===warning.kind&&w.eventIds.join('|')===ids.join('|')))warnings.push({kind:warning.kind,eventIds:[...ids],text,rank});
  }
  warnings.sort((a,b)=>a.rank-b.rank||(starts.get(a.eventIds[0])||0)-(starts.get(b.eventIds[0])||0));
  const visibleWarnings=allWarnings?warnings:warnings.slice(0,2),moreCount=warnings.length-visibleWarnings.length;
  const timed=records.filter(r=>!r.allDay),incomplete=!!journey?.notes?.length||timed.length>1&&timed.some(r=>!r.hasEnd);
  let note='';
  if(n&&mode!=='review'&&!warnings.length){
   if(incomplete)note='Nie udało się ocenić wszystkich dojazdów.';
   else if(mode==='remaining'&&journey?.legs?.some(l=>l.current))note='Nie wykryto ryzyka spóźnienia.';
   else if(mode==='plan'&&timed.length>1)note='Nie wykryto ryzyka między spotkaniami.';
  }
  return {countText,warnings,visibleWarnings,moreCount,note};
 }
 function speech(model,options){
  const brief=summary(model,options);
  return [brief.countText,...brief.visibleWarnings.map(w=>w.text),brief.moreCount?'Pozostałe ostrzeżenia: '+brief.moreCount+'.':'',brief.note].filter(Boolean).join(' ');
 }
 return {target,interval,events,calendarContext,dayOverview,weather,travel,freeWindows,summary,speech,dayKey,clock,duration,location};
});
