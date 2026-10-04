// Bump this version and index.html's script URL whenever this file changes.
const GOOGLE_SYNC_VERSION="2026.10.04.8";
const GOOGLE_CLIENT_ID="241609919500-lif1p32j92okqtgmcmi0k3vk2k1825vf.apps.googleusercontent.com";
const GOOGLE_SCOPE="https://www.googleapis.com/auth/calendar.events";
const GOOGLE_CONNECTED_KEY="moj-planer-google-connected";
let googleTokenClient=null,googleAccessToken=null,googleSyncInProgress=false;
const GOOGLE_DELETE_QUEUE_KEY="moj-planer-google-delete-queue";
function googleDeleteQueue(){try{return JSON.parse(localStorage.getItem(GOOGLE_DELETE_QUEUE_KEY)||"[]")}catch(e){return []}}
function saveGoogleDeleteQueue(q){localStorage.setItem(GOOGLE_DELETE_QUEUE_KEY,JSON.stringify(q))}

function googleComparableDeleteContent(event){
  return {
    title:event.summary||'(Bez tytułu)',start:event.start||null,end:event.end||null,
    description:event.description||'',location:event.location||'',
    reminders:event.reminders||null,attendees:event.attendees||[],
    recurrence:event.recurrence||null,extendedProperties:event.extendedProperties||null
  };
}
function stableGoogleValue(value){
  if(Array.isArray(value))return '['+value.map(stableGoogleValue).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stableGoogleValue(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
function googleDeleteContentMatches(tomb,event){
  if(tomb.baseContent)return stableGoogleValue(tomb.baseContent)===stableGoogleValue(googleComparableDeleteContent(event));
  // Older queue entries have no full snapshot. Only accept an unchanged,
  // synchronized local copy with the same visible Google fields.
  const snapshot=tomb.localSnapshot||{},parts=googleDateParts(event),data=snapshot.googleData;
  if(!parts||!data||snapshot.googleDirty||!snapshot.title||!snapshot.date)return false;
  if(snapshot.title!==(event.summary||'(Bez tytułu)')||snapshot.date!==parts.date||
     (snapshot.time||'')!==parts.time||(snapshot.endTime||'')!==parts.endTime)return false;
  if(cleanGoogleDescription(data.description??snapshot.notes??'')!==cleanGoogleDescription(event.description||'')||
     (data.location??snapshot.location??'')!==(event.location||''))return false;
  if(stableGoogleValue(data.reminders||null)!==stableGoogleValue(event.reminders||null)||
     stableGoogleValue(data.attendees||[])!==stableGoogleValue(event.attendees||[])||
     stableGoogleValue(data.recurrence||null)!==stableGoogleValue(event.recurrence||null))return false;
  // All-day durations were not saved by older builds; do not guess their baseline.
  if(event.start?.date&&!event.end?.date)return false;
  if(event.start?.date&&event.end.date!==googleNextDate(snapshot.date))return false;
  return true;
}

function queueGoogleDelete(task,options={}){
  const q=googleDeleteQueue();
  if(!q.some(x=>x.googleEventId===task.googleEventId))q.push({googleEventId:task.googleEventId,localTaskId:task.id,localSnapshot:JSON.parse(JSON.stringify(task)),baseContent:task.googleDeleteBaseline||null,baseEtag:task.googleData?.etag||null,baseUpdated:task.googleData?.updated||null,deletedAt:new Date().toISOString(),state:"pending",reason:options.reason||"delete"});
  saveGoogleDeleteQueue(q);
}
window.queueGoogleDelete=queueGoogleDelete;
window.queueGoogleRecurrenceConversionDelete=task=>queueGoogleDelete(task,{reason:"recurrence-conversion"});


function googleStopBoundary(value){
  if(value?.date)return Date.parse(value.date+'T00:00:00Z');
  return value?.dateTime?Date.parse(value.dateTime):NaN;
}
function googleEventStoppedLocally(event){
  const boundary=googleStopBoundary(event.originalStartTime);
  return tasks.some(task=>{
    const stop=task.googleSeriesStopPending||task.googleStoppedSeries;
    return stop&&stop.parentId===event.recurringEventId&&boundary>=googleStopBoundary(stop.originalStart);
  });
}
function stopPlannerSeries(task){
  const sid=task.seriesId;
  const parentId=task.googleSeriesParentId||task.googleData?.recurringEventId||
    (task.googleSeriesMaster?task.googleEventId:null);
  const originalStart=task.googleOriginalStart||task.googleData?.originalStartTime||
    (task.time?{dateTime:`${task.date}T${task.time}:00`}:{date:task.date});
  const boundary=googleStopBoundary(originalStart);
  if(!Number.isFinite(boundary))throw new Error('Nieprawidłowy początek wystąpienia serii');
  tasks=tasks.filter(current=>current.seriesId!==sid||current.id===task.id||
    googleStopBoundary(current.googleOriginalStart||current.googleData?.originalStartTime||
      (current.time?{dateTime:`${current.date}T${current.time}:00`}:{date:current.date}))<boundary);
  const earlier=tasks.filter(current=>current.seriesId===sid&&current.id!==task.id);
  for(const current of earlier){
    if(current.seriesMeta?.rrule){
      const shortened=truncatedGoogleRecurrence({recurrence:[current.seriesMeta.rrule]},originalStart)[0];
      current.seriesMeta={...current.seriesMeta,rrule:shortened};
    }
  }
  task.seriesId=null;task.recurrence=null;task.seriesReminder=false;
  task.googleSynced=false;
  if(parentId){
    task.googleSeriesStopPending={parentId,originalStart};
    task.googleDirty=false;
  }else{
    // The series has never reached Google; export the retained event as a singleton.
    detachStoppedGoogleSeries(task);
  }
  saveTasks();renderAll();
}
window.stopPlannerSeries=stopPlannerSeries;
function detachStoppedGoogleSeries(task){
  task.googleEventId=null;task.googleSeriesParentId=null;task.googleSeriesMaster=false;
  task.googleSeriesVirtual=false;task.googleOriginalStart=null;task.seriesMeta=null;
  task.googleCreateId=null;task.googleData=null;task.googleConflict=null;
  task.googleDirty=false;task.googleSynced=false;task.source='planner';
}
function truncatedGoogleRecurrence(event,originalStart){
  const boundary=googleStopBoundary(originalStart);
  const until=originalStart.date?
    new Date(boundary-86400000).toISOString().slice(0,10).replaceAll('-',''):
    new Date(boundary-1000).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  if(!event.recurrence?.some(rule=>rule.startsWith('RRULE:')))
    throw new Error('Google nie zwrócił reguły serii');
  // Keep rule constraints and exclusions, replace the previous end/count.
  return event.recurrence.map(rule=>rule.startsWith('RRULE:')?
    rule.split(';').filter(part=>!part.startsWith('COUNT=')&&!part.startsWith('UNTIL=')).join(';')+';UNTIL='+until:rule);
}
async function processGoogleSeriesStops(){
  for(const task of tasks.filter(task=>task.googleSeriesStopPending)){
    const stop=task.googleSeriesStopPending;
    try{
      const url=`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(stop.parentId)}`;
      const response=await fetch(url,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
      if(response.status===401){googleAccessToken=null;setGoogleStatus(false,'Połączenie wygasło');return;}
      let finished=response.status===404||response.status===410;
      if(!finished){
        if(!response.ok)throw new Error('Google: '+response.status);
        const event=await response.json();
        finished=event.status==='cancelled';
        if(!finished){
          const first=googleStopBoundary(event.start),boundary=googleStopBoundary(stop.originalStart);
          if(!Number.isFinite(first))throw new Error('Brak daty początku serii Google');
          const method=boundary<=first?'DELETE':'PATCH';
          const headers={Authorization:`Bearer ${googleAccessToken}`,'Content-Type':'application/json'};
          if(event.etag)headers['If-Match']=event.etag;
          const options={method,headers};
          if(method==='PATCH')options.body=JSON.stringify({recurrence:truncatedGoogleRecurrence(event,stop.originalStart)});
          const result=await fetch(url,options);
          if(result.status===401){googleAccessToken=null;setGoogleStatus(false,'Połączenie wygasło');return;}
          finished=result.ok||result.status===404||result.status===410;
          if(!finished)throw new Error('Google: '+result.status);
        }
      }
      if(finished){
        detachStoppedGoogleSeries(task);
        task.googleStoppedSeries=stop;
        delete task.googleSeriesStopPending;
      }
    }catch(error){stop.lastError=String(error);console.error('Google series stop failed',error);}
    saveTasks();renderAll();
  }
}


function plannerOriginalStart(task){
  return task.googleOriginalStart||task.googleData?.originalStartTime||
    (task.time?{dateTime:`${task.date}T${task.time}:00`}:{date:task.date});
}
function deletePlannerSeriesRange(task,scope){
  const parentId=task.googleSeriesParentId||task.googleData?.recurringEventId||
    (task.googleSeriesMaster?task.googleEventId:null);
  const originalStart=plannerOriginalStart(task),boundary=googleStopBoundary(originalStart);
  const removed=tasks.filter(current=>current.seriesId===task.seriesId&&
    (scope==='all'||googleStopBoundary(plannerOriginalStart(current))>=boundary));
  if(parentId){
    const q=googleDeleteQueue();
    const previous=q.find(item=>item.googleEventId===parentId&&item.seriesRange);
    if(previous){
      if(scope==='all')previous.seriesRange='all';
      else if(previous.seriesRange!=='all'&&boundary<googleStopBoundary(previous.originalStart))previous.originalStart=originalStart;
      previous.state='pending';
    }else{
      q.push({googleEventId:parentId,localTaskId:task.id,localSnapshot:JSON.parse(JSON.stringify(task)),
        baseContent:task.googleSeriesDeleteBaseline||null,localSnapshots:JSON.parse(JSON.stringify(removed)),seriesRange:scope,originalStart,
        deletedAt:new Date().toISOString(),state:'pending',reason:'series-delete'});
    }
    saveGoogleDeleteQueue(q);
  }else{
    // Legacy flat series: delete its known individual Google events.
    removed.filter(current=>current.googleEventId).forEach(current=>queueGoogleDelete(current));
  }
  const ids=new Set(removed.map(current=>current.id));
  tasks=tasks.filter(current=>!ids.has(current.id));
  if(scope!=='all'){
    tasks.filter(current=>current.seriesId===task.seriesId&&current.seriesMeta?.rrule).forEach(current=>{
      current.seriesMeta={...current.seriesMeta,rrule:truncatedGoogleRecurrence({recurrence:[current.seriesMeta.rrule]},originalStart)[0]};
    });
  }
  saveTasks();renderAll();
}
window.deletePlannerSeriesRange=deletePlannerSeriesRange;
function googleAllDayRecurrence(rules){
  return (rules||[]).map(rule=>rule.replace(/;UNTIL=(\d{8})T235959Z(?=;|$)/, ";UNTIL=$1"));
}
function googleSeriesDeleteContentMatches(tomb,event){
  if(tomb.baseContent)return stableGoogleValue(tomb.baseContent)===stableGoogleValue(googleComparableDeleteContent(event));
  const snapshot=tomb.localSnapshot||{},data=snapshot.googleData||{};
  // Compatibility for series created before parent baselines were saved.
  // Compare the known series rule and shared content, not an instance's ETag.
  return !!snapshot.seriesMeta?.rrule&&
    stableGoogleValue(event.start?.date?googleAllDayRecurrence(event.recurrence):event.recurrence||[])===stableGoogleValue(event.start?.date?googleAllDayRecurrence([snapshot.seriesMeta.rrule]):[snapshot.seriesMeta.rrule])&&
    (event.summary||'(Bez tytułu)')===snapshot.title&&
    cleanGoogleDescription(event.description||'')===cleanGoogleDescription(data.description??snapshot.notes??'')&&
    (event.location||'')===(data.location??snapshot.location??'')&&
    stableGoogleValue(event.reminders||null)===stableGoogleValue(data.reminders||null)&&
    stableGoogleValue(event.attendees||[])===stableGoogleValue(data.attendees||[]);
}
async function processGoogleSeriesDeletion(tomb){
  const url=`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(tomb.googleEventId)}`;
  const response=await fetch(url,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
  if(response.status===404||response.status===410){tomb.state='done';return;}
  if(response.status===401){googleAccessToken=null;setGoogleStatus(false,'Połączenie wygasło');tomb.lastError='401';return;}
  if(!response.ok){tomb.lastError=String(response.status);return;}
  const event=await response.json();
  if(event.status==='cancelled'){tomb.state='done';return;}
  let first=googleStopBoundary(event.start),boundary=googleStopBoundary(tomb.originalStart);
  const desired=tomb.seriesRange==='following'?truncatedGoogleRecurrence(event,tomb.originalStart):null;
  const alreadyShortened=desired&&stableGoogleValue(event.recurrence)===stableGoogleValue(desired);
  if(alreadyShortened){tomb.state='done';return;}
  if(!googleSeriesDeleteContentMatches(tomb,event)){
    tomb.state='conflict';tomb.conflictReason=tomb.baseContent?'remote-content-changed':'missing-baseline';
    tomb.remoteSnapshot=event;tomb.remoteEtag=event.etag||null;return;
  }
  if(!Number.isFinite(first)||!Number.isFinite(boundary)){tomb.lastError='Nieprawidłowa data serii';return;}
  const method=tomb.seriesRange==='all'||boundary<=first?'DELETE':'PATCH';
  const headers={Authorization:`Bearer ${googleAccessToken}`,'Content-Type':'application/json'};
  if(event.etag)headers['If-Match']=event.etag;
  const options={method,headers};
  if(method==='PATCH')options.body=JSON.stringify({recurrence:desired});
  const result=await fetch(url,options);
  if(result.ok||result.status===404||result.status===410){
    if(result.ok&&method==='PATCH'){
      const shortened={...event,recurrence:desired};
      tasks.filter(task=>task.googleSeriesParentId===tomb.googleEventId).forEach(task=>{
        task.googleSeriesDeleteBaseline=googleComparableDeleteContent(shortened);
      });
      saveTasks();
    }
    tomb.state='done';return;
  }
  if(result.status===401){googleAccessToken=null;setGoogleStatus(false,'Połączenie wygasło');}
  tomb.state='pending';tomb.lastError=String(result.status);
}
function queuedGoogleSeriesDeletion(event){
  return googleDeleteQueue().some(tomb=>tomb.seriesRange&&event.recurringEventId===tomb.googleEventId&&
    (tomb.seriesRange==='all'||googleStopBoundary(event.originalStartTime)>=googleStopBoundary(tomb.originalStart)));
}

async function processGoogleDeleteQueue(){
  const q=googleDeleteQueue();
  let conflicts=0,completed=0;
  for(const tomb of q){
    if(tomb.state!=="pending"&&tomb.state!=="conflict")continue;
    try{
      if(tomb.seriesRange){await processGoogleSeriesDeletion(tomb);continue;}
      const url=`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(tomb.googleEventId)}`;
      const r=await fetch(url,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
      if(r.status===401){tomb.lastError="401";continue;}
      if(r.status===404||r.status===410){tomb.state="done";completed++;continue;}
      if(!r.ok){tomb.lastError=String(r.status);continue;}
      const ev=await r.json();
      if(ev.status==="cancelled"){tomb.state="done";completed++;continue;}
      const sameVersion=!!tomb.baseEtag&&tomb.baseEtag===ev.etag;
      const sameContent=sameVersion||googleDeleteContentMatches(tomb,ev);
      if(tomb.state==="conflict"&&!sameContent){tomb.remoteSnapshot=ev;tomb.remoteEtag=ev.etag||null;continue;}
      if(tomb.state==="conflict"&&sameContent){tomb.state="pending";delete tomb.conflictReason;}
      const snap=tomb.localSnapshot||{},p=googleDateParts(ev);
      const baseEtag=tomb.baseEtag||snap.googleData?.etag||null;
      const baseUpdated=tomb.baseUpdated||snap.googleData?.updated||null;
      // Converting a Planner singleton into an RRULE series intentionally replaces
      // the old Google event. It is not a user delete and must not surface as a
      // delete/edit conflict while the replacement series is being created.
      const recurrenceConversion=tomb.reason==="recurrence-conversion";
      if(!recurrenceConversion&&!sameContent&&!baseEtag&&!baseUpdated){tomb.conflictReason="missing-baseline";tomb.state="conflict";tomb.remoteSnapshot=ev;tomb.remoteEtag=ev.etag||null;conflicts++;continue;}
      const changed=baseEtag?ev.etag!==baseEtag:(baseUpdated?ev.updated!==baseUpdated:false);
      if(!recurrenceConversion&&!sameContent&&changed){tomb.conflictReason="remote-content-changed";tomb.state="conflict";tomb.remoteSnapshot=ev;tomb.remoteEtag=ev.etag||null;conflicts++;continue;}
      const headers={Authorization:`Bearer ${googleAccessToken}`};
      const deleteEtag=ev.etag||baseEtag;
      if(deleteEtag)headers["If-Match"]=deleteEtag;
      const del=await fetch(url,{method:"DELETE",headers});
      if(del.ok||del.status===404||del.status===410){tomb.state="done";completed++;}
      else if(del.status===412){
        const latest=await fetch(url,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
        if(latest.ok){
          const remote=await latest.json();
          if(remote.status==='cancelled'){tomb.state='done';completed++;}
          else if(googleDeleteContentMatches(tomb,remote)){tomb.state='pending';tomb.lastError='Wersja zmieniła się podczas usuwania; ponowię przy synchronizacji';}
          else{tomb.conflictReason='remote-content-changed';tomb.state='conflict';tomb.remoteSnapshot=remote;tomb.remoteEtag=remote.etag||null;conflicts++;}
        }else if(latest.status===404||latest.status===410){tomb.state='done';completed++;}
      }else tomb.lastError=String(del.status);
    }catch(e){tomb.lastError=String(e);console.error("Delete queue failed",e);}
  }
  const remaining=q.filter(x=>x.state!=="done");
  const addedWhileSyncing=googleDeleteQueue().filter(item=>!q.some(previous=>previous.googleEventId===item.googleEventId));
  saveGoogleDeleteQueue([...remaining,...addedWhileSyncing]);
  renderGoogleDeleteConflicts();
  return remaining.filter(x=>x.state==="conflict").length;
}
function renderGoogleDeleteConflicts(){
  let box=document.getElementById("googleDeleteConflicts");
  const conflicts=googleDeleteQueue().filter(x=>x.state==="conflict");
  if(!box){
    box=document.createElement("div");box.id="googleDeleteConflicts";box.className="card";box.style.cssText="margin-top:12px";
    const card=document.getElementById("googleCalendarCard");if(card)card.after(box);
  }
  if(!box)return;
  if(!conflicts.length){box.classList.add("hidden");box.innerHTML="";return;}
  box.classList.remove("hidden");
  box.innerHTML="<strong>⚠️ Konflikty synchronizacji</strong>";
  conflicts.forEach(t=>{
    const row=document.createElement("div");row.style.cssText="margin-top:10px;padding-top:10px;border-top:1px solid #ddd";
    const remote=t.remoteSnapshot||{},local=t.localSnapshot||{};
    row.innerHTML=`<div><b>${local.title||remote.summary||"Wydarzenie"}</b><br><small>Usunięte w Planerze; ${t.conflictReason==="missing-baseline"?(t.seriesRange?"brakuje zapisanych danych całej serii do porównania z Google.":"brakuje zapisanych danych tego wydarzenia do porównania z Google."):"zapis Google wymaga sprawdzenia przed usunięciem."}</small></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="danger del-google">Usuń również z Google</button><button class="secondary restore-local">Przywróć do Planera</button></div>`;
    row.querySelector(".del-google").onclick=()=>resolveDeleteConflict(t.googleEventId,"delete");
    row.querySelector(".restore-local").onclick=()=>resolveDeleteConflict(t.googleEventId,"restore");
    box.appendChild(row);
  });
}
async function fetchGoogleSeriesBaseline(parentId){
  const response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(parentId)}`,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
  if(response.status===401){googleAccessToken=null;setGoogleStatus(false,'Połączenie wygasło');}
  if(!response.ok)throw new Error('Nie udało się pobrać danych serii: '+response.status);
  const event=await response.json();
  if(event.id!==parentId||!event.start||!event.end||!Array.isArray(event.recurrence)||event.status==='cancelled')throw new Error('Niepełne dane serii Google');
  return event;
}
function applyGoogleSeriesBaseline(parentId,event){
  // Instance snapshots cannot stand in for the parent: dates, rule and ETag differ.
  const baseline=googleComparableDeleteContent(event);
  for(const task of tasks){
    if(task.googleSeriesParentId!==parentId||task.googleDirty||task.googleSeriesStopPending)continue;
    task.googleSeriesDeleteBaseline=baseline;
    const rule=event.recurrence.find(value=>value.startsWith('RRULE:'));
    if(rule)task.seriesMeta={...(task.seriesMeta||{}),rrule:rule};
  }
}
async function fillMissingGoogleSeriesBaselines(){
  const pending=new Set(googleDeleteQueue().filter(item=>item.seriesRange).map(item=>item.googleEventId));
  const parents=new Set(tasks.filter(task=>task.googleSeriesParentId&&!task.googleSeriesDeleteBaseline&&!task.googleDirty&&!task.googleSeriesStopPending).map(task=>task.googleSeriesParentId));
  for(const parentId of parents){
    if(pending.has(parentId))continue;
    try{applyGoogleSeriesBaseline(parentId,await fetchGoogleSeriesBaseline(parentId));}
    catch(error){console.error('Google series baseline fetch failed',error);}
    if(!googleAccessToken)return false;
  }
  return true;
}
async function resolveDeleteConflict(id,choice){
  let q=googleDeleteQueue(),t=q.find(x=>x.googleEventId===id);if(!t)return;
  if(t.seriesRange){
    if(choice==='delete'){
      // Keep the chosen range: resolving "following" must never delete earlier events.
      t.baseContent=t.remoteSnapshot?googleComparableDeleteContent(t.remoteSnapshot):t.baseContent;
      t.state='pending';saveGoogleDeleteQueue(q);
      await processGoogleDeleteQueue();
      const waiting=googleDeleteQueue().some(item=>item.googleEventId===id);
      saveTasks();renderAll();renderGoogleDeleteConflicts();
      toast(waiting?'Usunięcie serii nadal oczekuje':'✓ Usunięto wybrany zakres również z Google');
      return;
    }
    // Restore the linked occurrences, not the Google parent as a fake singleton.
    const saved=t.localSnapshots||[t.localSnapshot];
    try{
      const parent=await fetchGoogleSeriesBaseline(id);
      saveGoogleDeleteQueue(googleDeleteQueue().filter(item=>item.googleEventId!==id));
      if(await syncFromGoogle(true,false)===false)throw new Error('Przerwano przywracanie serii');
      for(const snapshot of saved){
        if(!snapshot)continue;
        const restored=tasks.find(task=>(snapshot.googleEventId&&task.googleEventId===snapshot.googleEventId)||
          (task.googleSeriesParentId===id&&localOriginalStartKey(task)===localOriginalStartKey(snapshot)));
        if(restored){
          restored.seriesId=snapshot.seriesId;restored.recurrence=snapshot.recurrence;
          restored.seriesMeta=snapshot.seriesMeta;restored.reminder=snapshot.reminder;
        }
      }
      applyGoogleSeriesBaseline(id,parent);
      saveTasks();renderAll();renderGoogleDeleteConflicts();toast('✓ Przywrócono serię do Planera');
    }catch(error){const remaining=googleDeleteQueue();if(!remaining.some(item=>item.googleEventId===id))remaining.push(t);saveGoogleDeleteQueue(remaining);renderGoogleDeleteConflicts();toast('Nie udało się przywrócić serii');}
    return;
  }
  if(choice==="delete"){
    const headers={Authorization:`Bearer ${googleAccessToken}`};if(t.remoteEtag)headers["If-Match"]=t.remoteEtag;
    const r=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`,{method:"DELETE",headers});
    if(!r.ok&&r.status!==404&&r.status!==410){toast("Nie udało się usunąć z Google");return;}
    saveGoogleDeleteQueue(q.filter(x=>x.googleEventId!==id));
  }else{
    const r=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
    if(!r.ok){toast("Nie udało się pobrać wydarzenia z Google");return;}
    const ev=await r.json();
    if(ev.status==='cancelled'||!googleDateParts(ev)){toast("Wydarzenie nie jest już dostępne w Google");return;}
    let parent=null;
    if(ev.recurringEventId){
      try{parent=await fetchGoogleSeriesBaseline(ev.recurringEventId);}
      catch(error){toast("Nie udało się pobrać danych serii do przywrócenia");return;}
    }
    const snapshot=t.localSnapshot||{};
    saveGoogleDeleteQueue(googleDeleteQueue().filter(x=>x.googleEventId!==id));
    upsertGoogleEvent(ev);
    const restored=tasks.find(x=>x.googleEventId===id);
    if(restored&&snapshot.seriesId)restored.seriesId=snapshot.seriesId;
    if(restored&&snapshot.recurrence)restored.recurrence=snapshot.recurrence;
    if(restored&&snapshot.reminder!==undefined)restored.reminder=snapshot.reminder;
    if(parent)applyGoogleSeriesBaseline(ev.recurringEventId,parent);
  }
  saveTasks();renderAll();renderGoogleDeleteConflicts();
  toast(choice==="delete"?"✓ Usunięto również z Google":"✓ Przywrócono do Planera");
}
window.resolveDeleteConflict=resolveDeleteConflict;


function setupGoogleCalendarUI(){
  const version=document.getElementById('appVersion');
  if(version)version.textContent=version.textContent.replace(/Synchronizacja: .*/, 'Synchronizacja: '+GOOGLE_SYNC_VERSION);
  const subtitle=document.querySelector('.subtitle');
  if(!subtitle||document.getElementById('googleCalendarCard'))return;
  const card=document.createElement('div');
  card.id='googleCalendarCard';
  card.className='card';
  card.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;flex-wrap:wrap';
  card.innerHTML='<div><strong>📅 Google Calendar</strong><div id="googleStatus" style="color:#667085;font-size:14px;margin-top:4px">Niepołączony</div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button id="googleSync" class="secondary hidden" type="button">↻ Synchronizuj</button><button id="googleConnect" class="secondary" type="button">Połącz z Google Calendar</button><button id="googleDisconnect" class="secondary hidden" type="button">Rozłącz</button></div>';
  subtitle.after(card);
  document.getElementById('googleConnect').onclick=connectGoogleCalendar;
  document.getElementById('googleDisconnect').onclick=disconnectGoogleCalendar;
  document.getElementById('googleSync').onclick=()=>{toast('↻ Uruchamiam synchronizację');syncGoogleCalendar();};
}

function setGoogleStatus(connected,text){
  const status=document.getElementById('googleStatus'),connect=document.getElementById('googleConnect'),disconnect=document.getElementById('googleDisconnect'),sync=document.getElementById('googleSync');
  if(!status)return;
  status.textContent=text;
  status.style.color=connected?'#067647':'#667085';
  status.style.fontWeight=connected?'700':'400';
  connect.classList.toggle('hidden',connected);
  disconnect.classList.toggle('hidden',!connected);
  if(sync)sync.classList.toggle('hidden',!connected);
}

function initGoogleTokenClient(){
  if(!window.google?.accounts?.oauth2){toast('Google jeszcze się ładuje');return false;}
  if(!googleTokenClient){
    googleTokenClient=google.accounts.oauth2.initTokenClient({client_id:GOOGLE_CLIENT_ID,scope:GOOGLE_SCOPE,callback:async r=>{
      if(r.error){console.error(r);toast('Nie udało się połączyć z Google');return;}
      googleAccessToken=r.access_token;
      localStorage.setItem(GOOGLE_CONNECTED_KEY,'1');
      setGoogleStatus(true,'Połączony • synchronizacja ręczna');
      toast('✓ Google Calendar połączony');
    }});
  }
  return true;
}

function connectGoogleCalendar(){
  if(initGoogleTokenClient())googleTokenClient.requestAccessToken({prompt:'consent'});
}

function restoreGoogleCalendarConnection(){
  if(localStorage.getItem(GOOGLE_CONNECTED_KEY)!=='1')return;
  let tries=0;
  const attempt=()=>{
    if(initGoogleTokenClient()){
      setGoogleStatus(false,'Łączę z Google…');
      googleTokenClient.requestAccessToken({prompt:''});
      return;
    }
    if(++tries<20)setTimeout(attempt,250);
  };
  attempt();
}

function disconnectGoogleCalendar(){
  if(googleAccessToken&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(googleAccessToken,()=>{});
  googleAccessToken=null;
  localStorage.removeItem(GOOGLE_CONNECTED_KEY);
  setGoogleStatus(false,'Niepołączony');
  toast('Google Calendar rozłączony');
}

function addMinutes(time,minutes){
  const [h,m]=time.split(':').map(Number),d=new Date(2000,0,1,h,m+minutes);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function plannerDescription(task){
  return `${task.notes?task.notes+'\n\n':''}Dodano przez Mój Planer • ${task.category||'Osobiste'}`;
}

function googleDateTimeRange(task){
  const endTime=task.endTime||addMinutes(task.time,60);
  const timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  let endDate=task.date;
  if(endTime<=task.time){
    const d=new Date(task.date+"T12:00:00");
    d.setDate(d.getDate()+1);
    endDate=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  return {timeZone,endTime,endDate};
}


function googleEventBody(task){
  const body={summary:task.title,description:plannerDescription(task),location:task.location||'',reminders:{useDefault:false,overrides:[]}};
  if(task.time){
    const {endTime,endDate,timeZone}=googleDateTimeRange(task);
    body.start={dateTime:`${task.date}T${task.time}:00`,timeZone};
    body.end={dateTime:`${endDate}T${endTime}:00`,timeZone};
  }else{
    const next=new Date(task.date+"T12:00:00");next.setDate(next.getDate()+1);
    const nextDate=`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;
    body.start={date:task.date};body.end={date:nextDate};
  }
  if(task.googleSeriesMaster===true&&task.seriesMeta?.rrule)body.recurrence=[task.seriesMeta.rrule];
  return body;
}

async function updateTaskInGoogle(task){
  if(!googleAccessToken||!task?.googleEventId||!task?.date||!task?.time)return false;
  try{
    const response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(task.googleEventId)}`,{method:'PATCH',headers:{Authorization:`Bearer ${googleAccessToken}`,'Content-Type':'application/json'},body:JSON.stringify(googleEventBody(task))});
    if(response.status===401){googleAccessToken=null;setGoogleStatus(false,'Połączenie wygasło');toast('Połącz ponownie Google Calendar');return false;}
    if(response.status===404){task.googleEventId=null;task.googleSynced=false;return false;}
    if(!response.ok)throw new Error(await response.text());
    task.googleSynced=true;task.googleDirty=false;return true;
  }catch(err){console.error(err);return false;}
}

function googleNextDate(date){
  const next=new Date(date+"T12:00:00");
  next.setDate(next.getDate()+1);
  return `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,"0")}-${String(next.getDate()).padStart(2,"0")}`;
}

function googleEditPatch(task){
  let patch;
  if(task.time){
    const {endTime,endDate,timeZone}=googleDateTimeRange(task);
    patch={summary:task.title,start:{dateTime:`${task.date}T${task.time}:00`,timeZone},end:{dateTime:`${endDate}T${endTime}:00`,timeZone}};
  }else{
    patch={summary:task.title,start:{date:task.date},end:{date:googleNextDate(task.date)}};
  }
  if(task.source!=='google'){patch.description=plannerDescription(task);patch.location=task.location||'';}
  else{if(task.notes!==undefined)patch.description=task.notes||'';patch.location=task.location||'';}
  return patch;
}

async function ensureGoogleSeriesInstance(task){
  const parentId=task?.googleSeriesParentId||(task?.googleSeriesMaster?task?.googleEventId:null);
  if(!parentId||!googleAccessToken)return false;
  const wanted=localOriginalStartKey(task);
  if(!wanted)return false;
  try{
    let pageToken="";
    do{
      const params=new URLSearchParams({singleEvents:"true",showDeleted:"false",maxResults:"250"});
      if(pageToken)params.set("pageToken",pageToken);
      const response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
      if(response.status===401){googleAccessToken=null;setGoogleStatus(false,"Połączenie wygasło");toast("Połącz ponownie Google Calendar");return false;}
      if(!response.ok){console.error(await response.text());return false;}
      const data=await response.json();
      const match=(data.items||[]).find(event=>event.recurringEventId===parentId&&event.status!=="cancelled"&&googleInstanceOriginalKey(event)===wanted);
      if(match){
        task.googleSeriesParentId=parentId;
        task.googleEventId=match.id;
        task.googleDeleteBaseline=googleComparableDeleteContent(match);
        task.googleOriginalStart=match.originalStartTime||task.googleOriginalStart||null;
        task.googleData={...(task.googleData||{}),etag:match.etag||"",updated:match.updated||"",recurringEventId:parentId,originalStartTime:match.originalStartTime||null};
        saveTasks();return true;
      }
      pageToken=data.nextPageToken||"";
    }while(pageToken);
    return false;
  }catch(err){console.error("Google series instance lookup failed",err);return false;}
}

async function syncEditedTaskToGoogle(task){
  if(!task?.date)return false;
  task.googleDirty=true;
  task.googleSynced=false;
  if(task.seriesId&&(task.googleSeriesParentId||task.googleSeriesMaster)){
    if(!await ensureGoogleSeriesInstance(task)){
      saveTasks();renderAll();
      toast("Nie udało się odnaleźć tego wystąpienia serii w Google");
      return false;
    }
  }
  if(!task.googleEventId){saveTasks();renderAll();return false;}
  // Linked edits stay local until the user presses Synchronizuj.
  // This prevents a quick local edit from recreating an event just deleted in Google.
  saveTasks();
  renderAll();
  return true;
}
window.syncEditedTaskToGoogle=syncEditedTaskToGoogle;
async function pushEditedTaskToGoogle(task){
  if(!googleAccessToken||!task?.googleEventId||!task?.date||task.googleConflict)return false;
  try{
    const url=`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(task.googleEventId)}`;
    const exists=await fetch(url,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
    if(exists.status===401){googleAccessToken=null;setGoogleStatus(false,'Połączenie wygasło');toast('Połącz ponownie Google Calendar');return false;}
    if(exists.status===404||exists.status===410){
      task.googleConflict='deleted';task.googleDirty=true;task.googleSynced=false;saveTasks();renderAll();return false;
    }
    if(!exists.ok){console.error(await exists.text());return false;}
    const existing=await exists.json();
    if(existing.status==='cancelled'){
      task.googleConflict='deleted';task.googleDirty=true;task.googleSynced=false;saveTasks();renderAll();return false;
    }
    const response=await fetch(url,{method:'PATCH',headers:{Authorization:`Bearer ${googleAccessToken}`,'Content-Type':'application/json'},body:JSON.stringify(googleEditPatch(task))});
    if(response.status===401){googleAccessToken=null;setGoogleStatus(false,'Połączenie wygasło');toast('Połącz ponownie Google Calendar');return false;}
    if(response.status===404||response.status===410){task.googleConflict='deleted';task.googleDirty=true;task.googleSynced=false;saveTasks();renderAll();return false;}
    if(!response.ok){console.error(await response.text());return false;}
    const updated=await response.json();
    if(updated.status==='cancelled'){task.googleConflict='deleted';task.googleDirty=true;task.googleSynced=false;saveTasks();renderAll();return false;}
    const p=googleDateParts(updated);
    if(!p||p.date!==task.date||(task.time?(p.time!==task.time):!!p.time)){console.error('Google returned different event time',updated);return false;}
    task.googleSynced=true;task.googleDirty=false;
    task.googleDeleteBaseline=googleComparableDeleteContent(updated);
    task.googleData={...(task.googleData||{}),etag:updated.etag||task.googleData?.etag||'',updated:updated.updated||task.googleData?.updated||'',location:updated.location||task.location||'',description:updated.description||'',reminders:updated.reminders||task.googleData?.reminders||null,htmlLink:updated.htmlLink||task.googleData?.htmlLink||''};
    saveTasks();renderAll();return true;
  }catch(err){console.error('Google event update failed',err);return false;}
}

async function deleteTaskFromGoogle(task){
  if(!task?.googleEventId)return true;
  if(!googleAccessToken){toast('Połącz Google Calendar przed usunięciem tego wydarzenia');return false;}
  try{
    const response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(task.googleEventId)}`,{method:'DELETE',headers:{Authorization:`Bearer ${googleAccessToken}`}});
    if(response.status===401){googleAccessToken=null;setGoogleStatus(false,'Połączenie wygasło');toast('Połącz ponownie Google Calendar');return false;}
    if(response.status===404||response.status===410)return true;
    if(!response.ok){console.error(await response.text());toast('Nie udało się usunąć wydarzenia z Google');return false;}
    return true;
  }catch(err){console.error(err);toast('Błąd połączenia z Google Calendar');return false;}
}
window.deleteTaskFromGoogle=deleteTaskFromGoogle;
async function restoreConflictToGoogle(task){
  if(!task?.googleConflict||!googleAccessToken)return false;
  const oldId=task.googleEventId;
  task.googleEventId=null;task.source='planner';task.googleDirty=false;task.googleSynced=false;task.googleConflict=null;
  saveTasks();renderAll();
  await sendTaskToGoogle(task,true);
  if(task.googleEventId){saveTasks();renderAll();toast('✓ Przywrócono wydarzenie w Google');return true;}
  task.googleEventId=oldId;task.googleDirty=true;task.googleSynced=false;task.googleConflict='deleted';saveTasks();renderAll();toast('Nie udało się przywrócić wydarzenia w Google');return false;
}
window.restoreConflictToGoogle=restoreConflictToGoogle;


async function pushPlannerTasksToGoogle(){
  if(!googleAccessToken)return {created:0,updated:0};
  const dirty=tasks.filter(task=>task?.date&&task.googleEventId&&task.googleDirty&&!task.googleConflict&&!task.googleSeriesStopPending);
  let updated=0;
  for(const task of dirty){if(await pushEditedTaskToGoogle(task))updated++;}
  // Every local event without a Google id is pending. Do not hide older starts:
  // a recurring series may legitimately begin before today and still contain future occurrences.
  const pending=tasks.filter(task=>task?.date&&task.source!=='google'&&!task.googleEventId&&!task.googleSeriesParentId&&!task.googleSeriesVirtual&&!task.googleSeriesStopPending);
  let created=0;
  for(const task of pending){
    if(!tasks.some(current=>current===task||current.id===task.id))continue;
    await sendTaskToGoogle(task,true);
    if(task.googleEventId||task.googleSeriesParentId){
      created++;
      if(task.googleSeriesMaster&&task.seriesId&&task.googleSeriesParentId){
        tasks.filter(x=>x.seriesId===task.seriesId&&x.id!==task.id&&x.googleSeriesVirtual).forEach(x=>{
          x.googleSeriesParentId=task.googleSeriesParentId;
          x.googleSeriesDeleteBaseline=task.googleSeriesDeleteBaseline||null;
          x.googleSynced=true;
          x.googleDirty=false;
          x.source='planner';
        });
      }
    }
  }
  const remaining=tasks.filter(task=>task?.date&&task.source!=='google'&&!task.googleEventId&&!task.googleSeriesParentId&&!task.googleSeriesVirtual&&!task.googleSeriesStopPending).length;
  saveTasks();renderAll();
  return {created,updated,pending:pending.length,remaining,dirty:dirty.length};
}

function renderGoogleSyncResult(pushed){
  const card=document.getElementById('googleCalendarCard');
  if(!card)return;
  let box=document.getElementById('googleSyncResult');
  if(!box){
    box=document.createElement('div');box.id='googleSyncResult';
    box.style.cssText='flex-basis:100%;border-top:1px solid #ddd;padding-top:10px;font-size:14px';
    card.appendChild(box);
  }
  box.textContent='';
  const conflicts=tasks.filter(task=>task.googleConflict);
  const deletions=googleDeleteQueue().filter(item=>item.state==='conflict');
  const pendingDeletes=googleDeleteQueue().filter(item=>item.state==='pending').length;
  const pendingStops=tasks.filter(task=>task.googleSeriesStopPending).length;
  const summary=document.createElement('div');
  summary.textContent=`Ostatnia synchronizacja: wysłano ${pushed.created||0}, zaktualizowano ${pushed.updated||0}. Konflikty: ${conflicts.length+deletions.length}.`+(pendingDeletes+pendingStops?` Oczekujące usunięcia lub zmiany cykliczności: ${pendingDeletes+pendingStops}.`:'');
  box.appendChild(summary);
  for(const task of conflicts){
    const row=document.createElement('div');row.style.marginTop='8px';
    const description=document.createElement('div');
    description.textContent=`${task.title||'Bez tytułu'} • ${task.date||''} ${task.time||''}: ${task.googleConflict==='deleted'?'Google zgłosił usunięcie; w Planerze pozostała niewysłana zmiana.':'Zapisany konflikt: '+task.googleConflict}`;
    row.appendChild(description);
    const button=document.createElement('button');button.className='secondary';button.textContent='Pokaż wydarzenie';
    button.onclick=()=>openEventActions(task);row.appendChild(button);box.appendChild(row);
  }
  for(const item of deletions){
    const row=document.createElement('div');row.style.marginTop='8px';
    row.textContent=`${item.localSnapshot?.title||item.remoteSnapshot?.summary||'Bez tytułu'} • ${item.localSnapshot?.date||''}: usunięte w Planerze; Google nadal zwraca wydarzenie. ${item.reason==='recurrence-conversion'?'Zastępowanie wydarzenia serią.':'Oczekuje na decyzję o usunięciu.'}`;
    box.appendChild(row);
  }
  const version=document.createElement('small');version.style.color='#667085';
  version.textContent='Wersja synchronizacji: '+GOOGLE_SYNC_VERSION;box.appendChild(version);
}

async function syncGoogleCalendar(){
  if(!googleAccessToken||googleSyncInProgress)return;
  googleSyncInProgress=true;
  setGoogleStatus(true,'Synchronizuję…');
  try{
    await processGoogleSeriesStops();
    if(!googleAccessToken)return;
    await processGoogleDeleteQueue();
    if(!googleAccessToken)return;
    const pulled=await syncFromGoogle(true);
    if(!googleAccessToken||pulled===false)return;
    const linked=tasks.filter(task=>task.googleEventId&&task.date&&!task.googleConflict&&!task.googleSeriesStopPending);
    for(const task of linked){
      try{
        const check=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(task.googleEventId)}`,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
        if(check.status===404||check.status===410){
          reconcileGoogleDeletedTask(task);
        }else if(check.ok){
          const ev=await check.json();
          if(ev.status==='cancelled'){
            reconcileGoogleDeletedTask(task);
          }else if(task.googleConflict==='deleted'){
            task.googleConflict=null;
          }
        }
      }catch(err){console.error('Google event existence check failed',err);}
    }
    saveTasks();renderAll();
    const pushed=await pushPlannerTasksToGoogle();
    // A newly-created RRULE parent has no instance IDs in the local model yet.
    // Pull once more in the same sync so Google instances bind by parent + originalStart.
    if(pushed.created>0&&googleAccessToken){
      const rebound=await syncFromGoogle(true);
      if(!googleAccessToken||rebound===false)return;
    }
    setGoogleStatus(true,'Połączony • zsynchronizowano');
    const n=pushed.created+pushed.updated;
    const conflicts=tasks.filter(task=>task.googleConflict).length;
    const waiting=tasks.filter(task=>!task.googleConflict&&(task.googleDirty||task.googleSynced===false||task.googleSeriesStopPending )).length+pushed.remaining+googleDeleteQueue().filter(item=>item.state==='pending').length;
    // Only surface conflicts that still exist after the full sync/rebind pass.
    // processGoogleDeleteQueue() runs earlier, so its returned count can be stale
    // by the time a newly-created RRULE series has been rebound.
    const currentDeleteConflicts=googleDeleteQueue().filter(x=>x.state==="conflict").length;
    renderGoogleSyncResult(pushed);
    if(conflicts||currentDeleteConflicts){
      setGoogleStatus(true,`Połączony • konflikt synchronizacji`);
      toast(`⚠️ Konflikt synchronizacji • wymaga decyzji`);
    }else if(waiting){
      setGoogleStatus(true,`Połączony • ${waiting} oczekuje`);
      toast(`⏳ Oczekuje na synchronizację • ${waiting} wydarzeń`);
    }else{
      toast(n?`✓ Google: wysłano/odświeżono ${n} wydarzeń`:'✓ Kalendarze zsynchronizowane');
    }
  }catch(err){
    console.error(err);
    setGoogleStatus(true,'Połączony • błąd synchronizacji');
    toast('Nie udało się zsynchronizować kalendarzy');
  }finally{googleSyncInProgress=false;}
}

async function sendTaskToGoogle(task,silent=false){
  if(!googleAccessToken||!task?.date||task.source==='google')return false;
  if(!task.googleCreateId){
    const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);
    task.googleCreateId='mp'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    saveTasks();
  }
  const event={...googleEventBody(task),id:task.googleCreateId};
  if(!task.time&&Array.isArray(event.recurrence))event.recurrence=googleAllDayRecurrence(event.recurrence);
  const bindResult=result=>{
    if(task.googleSeriesMaster===true){
      task.googleSeriesParentId=result.id||task.googleCreateId;
      task.googleSeriesDeleteBaseline=googleComparableDeleteContent(result);
      task.googleEventId=null;
    }else task.googleEventId=result.id||task.googleCreateId;
    task.googleSynced=true;task.googleDirty=false;task.source='planner';
    task.googleDeleteBaseline=googleComparableDeleteContent(result);
    task.googleData={...(task.googleData||{}),etag:result.etag||'',updated:result.updated||'',location:result.location||task.location||'',description:result.description||'',reminders:result.reminders||null,htmlLink:result.htmlLink||''};
    saveTasks();renderAll();
  };
  try{
    let response=await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events',{method:'POST',headers:{Authorization:`Bearer ${googleAccessToken}`,'Content-Type':'application/json'},body:JSON.stringify(event)});
    if(response.status===401){googleAccessToken=null;setGoogleStatus(false,'Połączenie wygasło');toast('Połącz ponownie Google Calendar');return false;}
    if(response.status===409){
      response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(task.googleCreateId)}`,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
    }
    if(!response.ok){console.error(await response.text());if(!silent)toast('Nie udało się dodać do Google Calendar');return false;}
    const result=await response.json();bindResult(result);
    if(!silent)toast('✓ Dodano również do Google Calendar');
    return true;
  }catch(err){console.error(err);if(!silent)toast('Błąd połączenia z Google Calendar');return false;}
}
function googleDateParts(event){
  if(event.start?.date){
    return {date:event.start.date,time:'',endTime:'',allDay:true};
  }
  if(!event.start?.dateTime)return null;
  const start=new Date(event.start.dateTime),end=event.end?.dateTime?new Date(event.end.dateTime):null;
  const date=`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
  const time=`${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`;
  const endTime=end?`${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`:'';
  return {date,time,endTime,allDay:false};
}

function cleanGoogleDescription(description=''){
  return description.replace(/\n*Dodano przez Mój Planer • [^\n]*\s*$/,'').trim();
}

function googleHasReminder(event){
  if(!event.reminders)return false;
  if(event.reminders.useDefault)return true;
  return Array.isArray(event.reminders.overrides)&&event.reminders.overrides.length>0;
}

function googleOriginalStartKey(value){
  if(!value)return "";
  const raw=typeof value==="string"?value:(value.dateTime||value.date||"");
  if(!raw)return "";
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return "date:"+raw;
  const ms=Date.parse(raw);
  return Number.isFinite(ms)?"datetime:"+String(ms):"datetime:"+raw;
}
function localOriginalStartKey(task){
  const saved=googleOriginalStartKey(task?.googleOriginalStart);
  if(saved)return saved;
  if(!task?.date)return "";
  if(!task.time)return "date:"+task.date;
  const local=new Date(`${task.date}T${task.time}:00`);
  return "datetime:"+String(local.getTime());
}
function googleInstanceOriginalKey(event){
  return googleOriginalStartKey(event?.originalStartTime);
}

function reconcileGoogleDeletedTask(task){
  // Only an unsent local edit conflicts with a remote deletion.
  if(task.googleDirty){
    task.googleConflict='deleted';task.googleSynced=false;
  }else{
    tasks=tasks.filter(current=>current!==task);
  }
}

function upsertGoogleEvent(event){
  if(!event?.id||event.status==='cancelled')return false;
  if(googleDeleteQueue().some(x=>x.googleEventId===event.id)||googleEventStoppedLocally(event)||queuedGoogleSeriesDeletion(event))return false;
  const p=googleDateParts(event);if(!p)return false;
  const parentId=event.recurringEventId||"";
  const originalKey=googleInstanceOriginalKey(event);
  let task=tasks.find(t=>t.googleEventId===event.id);
  if(!task&&parentId&&originalKey){
    task=tasks.find(t=>{
      const sameParent=t.googleSeriesParentId===parentId||(t.googleSeriesMaster&&t.googleEventId===parentId);
      return sameParent&&localOriginalStartKey(t)===originalKey;
    });
  }
  const wasDirty=task?.googleDirty===true;
  if(!task){
    task={id:Date.now()+Math.random(),done:false};
    tasks.push(task);
  }
  task.googleDeleteBaseline=googleComparableDeleteContent(event);
  // A live event supersedes a previously observed deletion. Keep local edits.
  if(task.googleConflict==='deleted')task.googleConflict=null;
  if(parentId){
    if(task.googleSeriesMaster&&task.googleEventId===parentId)task.googleEventId=null;
    task.googleSeriesParentId=parentId;
    task.googleOriginalStart=event.originalStartTime||task.googleOriginalStart||null;
    task.googleEventId=event.id;
  }else{
    task.googleEventId=event.id;
  }
  if(wasDirty){
    task.googleData={...(task.googleData||{}),etag:event.etag||task.googleData?.etag||"",updated:event.updated||task.googleData?.updated||"",recurringEventId:parentId||task.googleData?.recurringEventId||null,originalStartTime:event.originalStartTime||task.googleData?.originalStartTime||null};
    return true;
  }
  task.title=event.summary||'(Bez tytułu)';
  task.date=p.date;task.time=p.time;task.endTime=p.endTime;
  task.category=task.category||'Osobiste';
  task.notes=cleanGoogleDescription(event.description||'');
  task.location=event.location||'';
  task.googleHasReminder=googleHasReminder(event);
  task.source=task.source==='planner'?'planner':'google';
  task.googleSynced=true;task.googleDirty=false;
  task.googleData={
    location:event.location||'',description:event.description||'',etag:event.etag||'',updated:event.updated||'',
    attendees:Array.isArray(event.attendees)?event.attendees:[],hangoutLink:event.hangoutLink||'',conferenceData:event.conferenceData||null,
    recurrence:event.recurrence||null,recurringEventId:parentId||null,originalStartTime:event.originalStartTime||null,
    reminders:event.reminders||null,organizer:event.organizer||null,creator:event.creator||null,htmlLink:event.htmlLink||'',allDay:p.allDay
  };
  return true;
}

async function syncFromGoogle(silent=false,refreshSeries=true){
  if(!googleAccessToken)return false;
  if(!silent)setGoogleStatus(true,'Synchronizuję…');
  try{
    const from=new Date();from.setDate(from.getDate()-7);
    const to=new Date();to.setFullYear(to.getFullYear()+1);
    let pageToken='',changed=0;
    do{
      const params=new URLSearchParams({singleEvents:'true',showDeleted:'true',orderBy:'updated',timeMin:from.toISOString(),timeMax:to.toISOString(),maxResults:'250'});
      if(pageToken)params.set('pageToken',pageToken);
      const response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
      if(response.status===401){googleAccessToken=null;setGoogleStatus(false,'Połączenie wygasło');toast('Połącz ponownie Google Calendar');return false;}
      if(!response.ok)throw new Error(await response.text());
      const data=await response.json();
      (data.items||[]).forEach(event=>{
        if(event?.status==='cancelled'&&event.id){
          const conflict=tasks.find(task=>task.googleEventId===event.id&&!task.googleSeriesStopPending);
          if(conflict){reconcileGoogleDeletedTask(conflict);changed++;}
          return;
        }
        if(upsertGoogleEvent(event))changed++;
      });
      pageToken=data.nextPageToken||'';
    }while(pageToken);
    if(refreshSeries&&await fillMissingGoogleSeriesBaselines()===false)return false;
    saveTasks();renderAll();
    if(!silent){setGoogleStatus(true,'Połączony • zsynchronizowano');toast(changed?'✓ Kalendarz Google zsynchronizowany':'✓ Brak nowych wydarzeń');}
    return true;
  }catch(err){
    console.error(err);setGoogleStatus(true,'Połączony • błąd synchronizacji');
    if(!silent)toast('Nie udało się pobrać wydarzeń z Google');
    throw err;
  }
}
setupGoogleCalendarUI();
renderGoogleDeleteConflicts();
restoreGoogleCalendarConnection();
const originalAddTask=addTask;
addTask=function(title,date,time='',endTime='',category='Osobiste',notes='',reminder=null,seriesId=null,location=''){
  originalAddTask(title,date,time,endTime,category,notes,reminder,seriesId,location);
  const task=tasks[tasks.length-1];
  if(googleAccessToken)sendTaskToGoogle(task);
  return task;
};


