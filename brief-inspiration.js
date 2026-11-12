// Symbolic day guidance. Selection and calendar calculations remain read-only.
(function(root,factory){const node=typeof module==='object'&&module.exports,api=factory(node?require('./brief-inspiration-data.js'):root.OktiInspirationData,node?require('./day-briefing.js'):root.OktiDayBriefing);if(node)module.exports=api;else root.OktiDayInspiration=api;})(globalThis,(data,core)=>{
 data=data?.schemaVersion===1?data:{source:'Kalendarz Jagi',from:null,to:null,days:[]};
 const themes={
  creative:{label:'twórczość',text:'Znajdź chwilę na własny pomysł. Pierwsza próba nie musi być idealna.'},
  organize:{label:'porządkowanie',text:'Wybierz jedną drobną zaległość i uporządkuj ją bez pośpiechu. Nie musisz nadrabiać wszystkiego naraz.'},
  relationships:{label:'uważne rozmowy',text:'Jeśli jest coś, co chcesz komuś powiedzieć, znajdź spokojną chwilę na rozmowę. Zostaw też miejsce na słuchanie.'},
  honesty:{label:'szczere rozmowy',text:'Możesz potraktować ten dzień jako okazję do spokojnej, szczerej rozmowy. Zacznij od tego, co jest dla Ciebie ważne.'},
  travel:{label:'ciekawość i nowe perspektywy',text:'Zrób miejsce na coś, co poszerza perspektywę: krótką lekturę, spacer lub nowy pomysł. Wybierz to, co pasuje do Twojego planu.'},
  work:{label:'praca i konsekwencja',text:'Wybierz jedną sprawę, którą chcesz ruszyć do przodu, i zrób spokojny pierwszy krok. Nie stawiaj sobie od razu zbyt wysokiej poprzeczki.'},
  social:{label:'kontakt z innymi',text:'Jeśli masz na to ochotę, odezwij się do kogoś, z kim dobrze Ci się rozmawia. Krótki kontakt też się liczy.'},
  rest:{label:'odpoczynek',text:'Jeśli w planie znajdzie się chwila, zostaw ją na odpoczynek bez dokładania sobie kolejnego zadania. Wybierz spokojne tempo.'},
  start:{label:'pierwszy krok',text:'Możesz zrobić pierwszy mały krok w sprawie, którą chcesz rozpocząć. Nie potrzebujesz od razu gotowego planu na wszystko.'},
  finances:{label:'porządkowanie codziennych spraw',text:'Jeśli chcesz uporządkować codzienne sprawy, zacznij od jednej drobnej rzeczy. Daj sobie czas na spokojne decyzje.'},
  conversation:{label:'rozmowy i wymiana pomysłów',text:'Znajdź chwilę na rozmowę lub wymianę pomysłów. Jedno dobrze postawione pytanie może być dobrym początkiem.'},
  home:{label:'dom i bliskość',text:'Zwróć uwagę na to, co daje Ci poczucie spokoju w domu. Wystarczy mały gest, który pasuje do Twojego dnia.'}
 };
 const rows=new Map((data?.days||[]).map(row=>[row[0],row])),dayKey=core.dayKey;
 function day(date){const row=rows.get(date);if(!row)return null;const theme=themes[row[1]];if(!theme)return null;return {date,theme:row[1],label:theme.label,text:theme.text,moon:row[2],phase:row[3],relax:row[4]===true,source:data.source,attribution:'Według astrologii · Kalendarz Jagi'};}
 function shift(date,n){const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return dayKey(d)}
 function validDate(date){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&dayKey(new Date(date+'T12:00:00'))===date;}
 function range(action={},now=new Date()){
  const today=dayKey(now),period=action.period||'this_week';let from,to;
  if(action.fromDate!=null||action.toDate!=null){from=action.fromDate;to=action.toDate;if(!validDate(from)||!validDate(to)||to<from)throw Error('Podaj poprawny zakres dat.');}
  else{if(!['this_week','next_week','next_7_days'].includes(period))throw Error('Nieznany zakres inspiracji.');const monday=shift(today,-((now.getDay()+6)%7));from=period==='next_week'?shift(monday,7):today;to=period==='next_7_days'?shift(today,6):shift(monday,period==='next_week'?13:6);}
  if((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000>30)throw Error('Sprawdzę najwyżej 31 dni naraz.');
  return {from:to>=today&&from<today?today:from,to,today,period,past:to<today};
 }
 function availability(items,date,now){
  const same=date===dayKey(now),records=core.events(items,date,now,same?'remaining':'plan'),overview=core.dayOverview({date,mode:same?'remaining':'plan',now,records});
  const start=Math.max(+new Date(date+'T08:00:00'),same?+now:0),end=+new Date(date+'T22:00:00'),unknown=records.some(r=>r.allDay||!r.hasEnd),windows=start<end&&!unknown?core.freeWindows(start,end,items):[];
  const longest=windows.reduce((best,p)=>!best||p[1]-p[0]>best[1]-best[0]?p:best,null);
  return {count:records.length,occupiedMinutes:overview.occupiedMinutes,unknown,windowClosed:start>=end,longest:longest?{from:core.clock(new Date(longest[0])),to:core.clock(new Date(longest[1])),minutes:Math.floor((longest[1]-longest[0])/60000)}:null};
 }
 function search(action,items,now=new Date()){
  if(!['work','rest','relax'].includes(action.topic))throw Error('Wybierz pracę, odpoczynek lub relaks.');
  const span=range(action,now),result={...span,topic:action.topic,source:data.source,coverage:{from:data.from,to:data.to},checked:0,missing:0,closed:0,candidates:[]};
  if(span.past){result.status='past';return result;}
  const matches=[];for(let date=span.from;date<=span.to;date=shift(date,1)){const inspiration=day(date);if(!inspiration){result.missing++;continue;}result.checked++;
   const match=action.topic==='work'?inspiration.theme==='work'||inspiration.theme==='organize':action.topic==='rest'?inspiration.theme==='rest':inspiration.relax;
   if(match){const calendar=availability(items,date,now);if(calendar.windowClosed)result.closed++;else matches.push({date,inspiration,calendar});}
  }
  matches.sort((a,b)=>Number(a.calendar.unknown)-Number(b.calendar.unknown)||(b.calendar.longest?.minutes||0)-(a.calendar.longest?.minutes||0)||a.calendar.occupiedMinutes-b.calendar.occupiedMinutes||a.date.localeCompare(b.date));
  result.candidates=matches.slice(0,2);result.status=result.checked===0?'no_data':matches.length?'found':result.closed?'no_future_window':'no_match';return result;
 }
 const dateLabel=date=>new Date(date+'T12:00:00').toLocaleDateString('pl-PL',{weekday:'long',day:'numeric',month:'long'});
 function calendarText(calendar){
  const n=calendar.count,unit=n===1?'wydarzenie':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'wydarzenia':'wydarzeń',count=n===0?'Nie ma zapisanych wydarzeń.':'W kalendarzu: '+n+' '+unit+'.';
  return count+' '+(calendar.unknown?'Wpis całodniowy lub bez końca nie pozwala pewnie ocenić przerw.':calendar.longest?'Najdłuższa przerwa w zapisach: '+calendar.longest.from+'–'+calendar.longest.to+'.':'W tym zakresie nie ma przerwy między zapisami.');
 }
 function message(result){
  if(result.status==='past')return 'Ten okres już minął. Wybierz obecny lub przyszły tydzień.';
  if(result.status==='no_data')return !data.from?'Dane inspiracji nie zostały wczytane. Odśwież aplikację, aby spróbować ponownie.':'Nie mam danych astrologicznych dla tego okresu. Kalendarz Jagi obejmuje okres od '+dateLabel(data.from)+' '+data.from.slice(0,4)+' do '+dateLabel(data.to)+' '+data.to.slice(0,4)+'.';
  if(result.status==='no_future_window')return 'Motyw astrologiczny pasuje do dzisiejszego dnia, ale sprawdzany zakres godzin już się skończył. Możesz zapytać o przyszły tydzień.';
  if(result.status==='no_match')return 'We wskazanym okresie nie znalazłem w Kalendarzu Jagi motywu pasującego do '+({work:'pracy',rest:'odpoczynku',relax:'relaksu'}[result.topic])+'. Możesz wybrać termin według własnych potrzeb i planu.';
  return 'Według astrologicznego Kalendarza Jagi pasuje '+dateLabel(result.candidates[0].date)+'. '+calendarText(result.candidates[0].calendar);
 }
 return {day,search,range,availability,calendarText,dateLabel,message,coverage:{from:data.from,to:data.to},source:data.source};
});
