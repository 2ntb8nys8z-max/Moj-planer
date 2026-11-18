/* Shared, deterministic calendar contract. No network or UI. */
globalThis.PlannerSyncCore = (() => {
  const stable = v => Array.isArray(v) ? '['+v.map(stable).join(',')+']' : v && typeof v==='object' ? '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}' : JSON.stringify(v);
  const equal = (a,b) => stable(a)===stable(b);
  const nextDate = (s,n=1) => {const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
  function wall(value,zone) {
    const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(x=>[x.type,x.value]));
    return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};
  }
  function instant(date,time,zone) {
    const target=Date.parse(`${date}T${time}:00Z`);let guess=target;
    for(let i=0;i<4;i++){const p=wall(guess,zone),shown=Date.parse(`${p.date}T${p.time}:00Z`);if(shown===target)return new Date(guess).toISOString();guess+=target-shown;}
    throw Error('Ta godzina nie istnieje w wybranej strefie czasowej. Wybierz inną godzinę.');
  }
  function parts(e) {
    if(e.start?.date)return {date:e.start.date,time:'',endTime:'',endDate:e.end?.date||nextDate(e.start.date),timeZone:e.start.timeZone||'UTC',allDay:true};
    if(!e.start?.dateTime||!e.end?.dateTime)return null;
    const zone=e.start.timeZone||e.end.timeZone||'UTC',s=wall(e.start.dateTime,zone),t=wall(e.end.dateTime,zone);
    return {date:s.date,time:s.time,endDate:t.date,endTime:t.time,timeZone:zone,allDay:false};
  }
  function canonical(e) {
    const point=p=>p?.date?{date:p.date}:p?.dateTime?{instant:new Date(p.dateTime).toISOString()}:null;
    return {summary:e.summary??e.title??'',description:e.description||'',location:e.location||'',schedule:{start:point(e.start),end:point(e.end)}};
  }
  function body(t,description) {
    const zone=t.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
    const b={summary:t.title,description,location:t.location||''};
    if(t.time){
      if(!t.endTime)throw Error('Uzupełnij godzinę zakończenia wydarzenia.');
      const endDate=t.endDate&&t.endDate>=t.date?t.endDate:nextDate(t.date,t.endTime<=t.time?1:0);
      b.start={dateTime:instant(t.date,t.time,zone),timeZone:zone};b.end={dateTime:instant(endDate,t.endTime,zone),timeZone:zone};
      if(Date.parse(b.end.dateTime)<=Date.parse(b.start.dateTime))throw Error('Koniec wydarzenia musi następować po początku.');
    }else {b.start={date:t.date};b.end={date:t.endDate&&t.endDate>t.date?t.endDate:nextDate(t.date)}}
    return b;
  }
  function merge(base,local,remote) {
    const b=canonical(base),l=canonical(local),r=canonical(remote),patch={},conflicts=[];
    for(const k of Object.keys(l)) {
      if(equal(l[k],b[k]))continue;
      if(!equal(r[k],b[k])&&!equal(r[k],l[k])){conflicts.push(k);continue;}
      if(equal(r[k],l[k]))continue;
      if(k==='schedule'){
        patch.start={date:null,dateTime:null,timeZone:null,...local.start};
        patch.end={date:null,dateTime:null,timeZone:null,...local.end};
      }else patch[k]=local[k];
    }
    return {patch,conflicts};
  }
  function matches(actual,expected,keys=['summary','description','location','schedule']) {const a=canonical(actual),b=canonical(expected);return keys.every(k=>equal(a[k],b[k]))}
  return {stable,equal,nextDate,wall,instant,parts,canonical,body,merge,matches};
})();
