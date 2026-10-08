const GOOGLE_STORAGE=window.PlannerData?.storage||localStorage;
async function plannerGoogleFetch(url,options={}){
  if(window.PlannerData)PlannerData.assertWritable();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{return await fetch(url,{...options,signal:controller.signal});}
  finally{clearTimeout(timer);}
}

// Bump this version and index.html's script URL whenever this file changes.
const GOOGLE_SYNC_VERSION="2026.10.06.29";
const GOOGLE_CLIENT_ID="241609919500-lif1p32j92okqtgmcmi0k3vk2k1825vf.apps.googleusercontent.com";
const GOOGLE_SCOPE="https://www.googleapis.com/auth/calendar.events";
const GOOGLE_CONNECTED_KEY="moj-planer-google-connected";
let googleTokenClient=null,googleAccessToken=null,googleSyncInProgress=false;window.googleSyncInProgress=false;
const GOOGLE_DELETE_QUEUE_KEY="moj-planer-google-delete-queue";
function googleDeleteQueue(){try{return JSON.parse(GOOGLE_STORAGE.getItem(GOOGLE_DELETE_QUEUE_KEY)||"[]")}catch(e){return []}}
function saveGoogleDeleteQueue(q){GOOGLE_STORAGE.setItem(GOOGLE_DELETE_QUEUE_KEY,JSON.stringify(q))}

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
      const response=await plannerGoogleFetch(url,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
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
          const result=await plannerGoogleFetch(url,options);
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
  const response=await plannerGoogleFetch(url,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
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
  const result=await plannerGoogleFetch(url,options);
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
      const r=await plannerGoogleFetch(url,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
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
      const del=await plannerGoogleFetch(url,{method:"DELETE",headers});
      if(del.ok||del.status===404||del.status===410){tomb.state="done";completed++;}
      else if(del.status===412){
        const latest=await plannerGoogleFetch(url,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
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
    row.innerHTML=`<div><b>${escapeHtml(local.title||remote.summary||"Wydarzenie")}</b><br><small>Usunięte w Planerze; ${t.conflictReason==="missing-baseline"?(t.seriesRange?"brakuje zapisanych danych całej serii do porównania z Google.":"brakuje zapisanych danych tego wydarzenia do porównania z Google."):"zapis Google wymaga sprawdzenia przed usunięciem."}</small></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="danger del-google">Usuń również z Google</button><button class="secondary restore-local">Przywróć do Planera</button></div>`;
    row.querySelector(".del-google").onclick=()=>resolveDeleteConflict(t.googleEventId,"delete");
    row.querySelector(".restore-local").onclick=()=>resolveDeleteConflict(t.googleEventId,"restore");
    box.appendChild(row);
  });
}
async function fetchGoogleSeriesBaseline(parentId){
  const response=await plannerGoogleFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(parentId)}`,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
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
    bindGoogleSeriesMembership(task,parentId);
    task.googleSeriesDeleteBaseline=baseline;
    task.recurrence=googleRecurrenceSummary(event.recurrence);
    const rule=event.recurrence.find(value=>value.startsWith('RRULE:'));
    if(rule)task.seriesMeta={...(task.seriesMeta||{}),rrule:rule};
  }
}
async function refreshGoogleSeriesBaselines(){
  // A Google split changes the original parent's rule without changing its id.
  // Refresh existing snapshots too, so the displayed end/count follows Google.
  const pending=new Set(googleDeleteQueue().filter(item=>item.seriesRange).map(item=>item.googleEventId));
  const parents=new Set(tasks.filter(task=>task.googleSeriesParentId&&!task.googleDirty&&!task.googleSeriesStopPending).map(task=>task.googleSeriesParentId));
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
    const r=await plannerGoogleFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`,{method:"DELETE",headers});
    if(!r.ok&&r.status!==404&&r.status!==410){toast("Nie udało się usunąć z Google");return;}
    saveGoogleDeleteQueue(q.filter(x=>x.googleEventId!==id));
  }else{
    const r=await plannerGoogleFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
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
      GOOGLE_STORAGE.setItem(GOOGLE_CONNECTED_KEY,'1');
      setGoogleStatus(true,'Połączony • synchronizacja ręczna');
      toast('✓ Google Calendar połączony');
    }});
  }
  return true;
}

function connectGoogleCalendar(){
  if(window.PlannerData?.isLocked())return;
  if(initGoogleTokenClient())googleTokenClient.requestAccessToken({prompt:'consent'});
}

function restoreGoogleCalendarConnection(){
  if(window.PlannerData?.isLocked())return;
  if(GOOGLE_STORAGE.getItem(GOOGLE_CONNECTED_KEY)!=='1')return;
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
  GOOGLE_STORAGE.removeItem(GOOGLE_CONNECTED_KEY);
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
  if(!task.endTime)throw new Error('Uzupełnij godzinę zakończenia wydarzenia w Planerze.');
  const endTime=task.endTime;
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
  const body=PlannerSyncCore.body(task,plannerDescription(task));
  // Product policy: Planner reminders never create a second Google notification.
  body.reminders={useDefault:false,overrides:[]};
  if(task.googleSeriesMaster===true&&task.seriesMeta?.rrule)body.recurrence=[task.seriesMeta.rrule];
  return body;
}

async function updateTaskInGoogle(task){return pushEditedTaskToGoogle(task);}

function googleNextDate(date){
  const next=new Date(date+"T12:00:00");
  next.setDate(next.getDate()+1);
  return `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,"0")}-${String(next.getDate()).padStart(2,"0")}`;
}

function googleEditPatch(task){
  const base=task.googleEditBaseline||task.googleDeleteBaseline;
  const description=base&&(task.notes||'')===cleanGoogleDescription(base.description||'')?(base.description||''):task.source==='google'?(task.notes||''):plannerDescription(task);
  const body=PlannerSyncCore.body(task,description);
  if(base&&(base.summary??base.title??'')===''&&task.title==='(Bez tytułu)')body.summary='';
  return body;
}
const googleLocalSchedules=new Map();
function googleScheduleSnapshot(t){return {date:t.date,time:t.time||'',endTime:t.endTime||'',endDate:t.endDate||'',timeZone:t.timeZone||''};}
function preparePlannerSave(){
  for(const t of tasks){
    const old=googleLocalSchedules.get(t.id);
    if(!t.timeZone)t.timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
    if(old&&!!old.time!==!!t.time)t.endDate=PlannerSyncCore.nextDate(t.date,t.time?(t.endTime<=t.time?1:0):1);
    else if(old&&old.date!==t.date&&old.endDate===t.endDate&&t.endDate){const days=Math.round((Date.parse(t.date+'T12:00:00Z')-Date.parse(old.date+'T12:00:00Z'))/86400000);t.endDate=PlannerSyncCore.nextDate(t.endDate,days);}
    else if(old&&t.time&&(old.time!==t.time||old.endTime!==t.endTime)&&(!old.endDate||old.endDate<=PlannerSyncCore.nextDate(old.date))&&old.endDate===t.endDate)t.endDate=PlannerSyncCore.nextDate(t.date,t.endTime<=t.time?1:0);
    if(!t.endDate)t.endDate=PlannerSyncCore.nextDate(t.date,t.time?(t.endTime<=t.time?1:0):1);
    const now=googleScheduleSnapshot(t);
    if(old&&!PlannerSyncCore.equal(old,now))t.localRevision=(Number(t.localRevision)||0)+1;
    googleLocalSchedules.set(t.id,now);
  }
}
window.preparePlannerSave=preparePlannerSave;
function googleLocalSnapshot(task){
  return JSON.parse(JSON.stringify({title:task.title,date:task.date,time:task.time||'',endTime:task.endTime||'',endDate:task.endDate||'',timeZone:task.timeZone||'',notes:task.notes||'',location:task.location||'',seriesMeta:task.seriesMeta||null}));
}
function googleRememberRemote(task,event){
  task.googleDeleteBaseline=googleComparableDeleteContent(event);
  task.googleEditBaseline={summary:event.summary||'',description:event.description||'',location:event.location||'',start:event.start,end:event.end};
  task.googleData={...(task.googleData||{}),etag:event.etag||'',updated:event.updated||'',created:event.created||task.googleData?.created||'',location:event.location||'',description:event.description||'',reminders:event.reminders||null,htmlLink:event.htmlLink||''};
}
function googleAcknowledge(task,event,sent){
  if(!tasks.includes(task)){
    queueGoogleDelete({...task,googleEventId:event.id,googleDeleteBaseline:googleComparableDeleteContent(event),googleData:{etag:event.etag},googleDirty:false});return false;
  }
  const current=googleLocalSnapshot(task),p=googleDateParts(event);if(!p)return false;
  const keys=['date','time','endTime','endDate','timeZone'];
  if(keys.every(k=>PlannerSyncCore.equal(current[k],sent[k])))Object.assign(task,p);
  if(current.title===sent.title)task.title=event.summary||'(Bez tytułu)';
  if(current.notes===sent.notes)task.notes=cleanGoogleDescription(event.description||'');
  if(current.location===sent.location){if(task.location!==(event.location||'')){delete task.weatherPlace;delete task.locationUnresolved;}task.location=event.location||'';}
  googleLocalSchedules.set(task.id,googleScheduleSnapshot(task));
  const changed=!PlannerSyncCore.equal(current,sent);
  googleRememberRemote(task,event);delete task.googlePendingWrite;delete task.googleSyncError;
  task.googleDirty=changed;task.googleSynced=!changed;
  saveTasks();renderAll();return !changed;
}
function googleEditConflict(task,remote,fields){
  task.googleConflict='edited';task.googleDirty=true;task.googleSynced=false;
  task.googleEditConflict={remote,fields};saveTasks();renderAll();return false;
}
async function resolveGoogleEditConflict(task,choice){
  const conflict=task.googleEditConflict;if(!conflict)return;
  if(!confirm(choice==='remote'?'Zastąpić lokalną wersję tego wydarzenia wersją z Google?':'Zachować lokalne wartości konfliktowych pól i ponowić synchronizację?'))return;
  if(choice==='remote'){
    const p=googleDateParts(conflict.remote);Object.assign(task,p,{title:conflict.remote.summary||'(Bez tytułu)',notes:cleanGoogleDescription(conflict.remote.description||''),location:conflict.remote.location||''});
    delete task.weatherPlace;delete task.locationUnresolved;googleRememberRemote(task,conflict.remote);task.googleDirty=false;task.googleSynced=true;
  }else{
    // Rebase only conflicting fields. Unrelated remote changes must still survive.
    const base=task.googleEditBaseline||task.googleDeleteBaseline;
    if(!base){googleRememberRemote(task,conflict.remote)}
    else {const rebased={...base,summary:base.summary??base.title};for(const k of conflict.fields){if(k==='schedule'){rebased.start=conflict.remote.start;rebased.end=conflict.remote.end}else rebased[k]=conflict.remote[k]||'';}task.googleEditBaseline=rebased;}
  }
  delete task.googleConflict;delete task.googleEditConflict;delete task.googlePendingWrite;saveTasks();renderAll();
  if(choice==='local')await pushEditedTaskToGoogle(task);
}
window.resolveGoogleEditConflict=resolveGoogleEditConflict;

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
      const response=await plannerGoogleFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
      if(response.status===401){googleAccessToken=null;setGoogleStatus(false,"Połączenie wygasło");toast("Połącz ponownie Google Calendar");return false;}
      if(!response.ok){console.error(await response.text());return false;}
      const data=await response.json();
      const match=(data.items||[]).find(event=>event.recurringEventId===parentId&&event.status!=="cancelled"&&googleInstanceOriginalKey(event)===wanted);
      if(match){
        task.googleSeriesParentId=parentId;
        task.googleEventId=match.id;
        if(!task.googleDeleteBaseline)googleRememberRemote(task,match);
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
async function googleSyncFailure(response){
  let reason='';
  try{const body=await response.json();reason=String(body.error?.message||'').slice(0,250);}catch(_){}
  return `Google nie zapisało zmiany (HTTP ${response.status}). ${reason||'Spróbuj ponownie.'}`;
}
const googleWritesInFlight=new Set();
async function pushEditedTaskToGoogle(task){
  if(!googleAccessToken||!task?.googleEventId||!task?.date||task.googleConflict||googleWritesInFlight.has(task.id))return false;
  googleWritesInFlight.add(task.id);
  const fail=message=>{if(tasks.includes(task)){task.googleSyncError=message;task.googleDirty=true;task.googleSynced=false;saveTasks();}return false;};
  try{
    const sent=googleLocalSnapshot(task),local=googleEditPatch(task);
    const id=task.googleEventId,url=`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`;
    const response=await plannerGoogleFetch(url,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
    if(!tasks.includes(task)||task.googleEventId!==id)return false;
    if(response.status===401){googleAccessToken=null;setGoogleStatus(false,'Połączenie wygasło');return fail('Połącz ponownie Google Calendar.');}
    if(response.status===404||response.status===410){task.googleConflict='deleted';return fail('Wydarzenie usunięto w Google. Wybierz sposób rozwiązania konfliktu.');}
    if(!response.ok)return fail(await googleSyncFailure(response));
    const remote=await response.json();
    if(remote.status==='cancelled'){task.googleConflict='deleted';return fail('Wydarzenie usunięto w Google.');}
    // Recover a response lost after a successful remote write without losing later edits.
    if(task.googlePendingWrite&&PlannerSyncCore.matches(remote,task.googlePendingWrite.expected))return googleAcknowledge(task,remote,task.googlePendingWrite.sent);
    const base=task.googleEditBaseline||task.googleDeleteBaseline;
    if(!base)return googleEditConflict(task,remote,['summary','description','location','schedule']);
    const merged=PlannerSyncCore.merge(base,local,remote);
    if(merged.conflicts.length)return googleEditConflict(task,remote,merged.conflicts);
    if(!Object.keys(merged.patch).length)return googleAcknowledge(task,remote,sent);
    if(!remote.etag)return fail('Google nie zwróciło wersji wydarzenia. Zmiana pozostaje oczekująca.');
    const expected={...remote,...merged.patch};
    task.googlePendingWrite={operationId:crypto.randomUUID(),sent,expected,patch:merged.patch,etag:remote.etag};saveTasks();
    const result=await plannerGoogleFetch(url,{method:'PATCH',headers:{Authorization:`Bearer ${googleAccessToken}`,'Content-Type':'application/json','If-Match':remote.etag},body:JSON.stringify(merged.patch)});
    if(result.status===412)return fail('Wydarzenie zmieniło się w Google podczas zapisu. Ponów synchronizację, aby porównać zmiany.');
    if(result.status===401){googleAccessToken=null;return fail('Połącz ponownie Google Calendar.');}
    if(result.status===404||result.status===410){task.googleConflict='deleted';return fail('Wydarzenie usunięto w Google.');}
    if(!result.ok)return fail(await googleSyncFailure(result));
    const updated=await result.json();
    if(updated.id!==id||updated.status==='cancelled'||!PlannerSyncCore.matches(updated,expected))return fail('Google nie potwierdziło pełnej wysłanej zmiany. Ponów synchronizację.');
    return googleAcknowledge(task,updated,sent);
  }catch(error){return fail(error.message||'Nie udało się zapisać zmiany w Google.');}
  finally{googleWritesInFlight.delete(task.id);}
}

async function deleteTaskFromGoogle(task){
  if(!task?.googleEventId)return true;
  queueGoogleDelete(task);return true;
}

window.deleteTaskFromGoogle=deleteTaskFromGoogle;
async function restoreConflictToGoogle(task){
  if(!task?.googleConflict||!googleAccessToken)return false;
  const oldId=task.googleEventId;
  task.googleCreateId=task.googleRestoreCreateId||null;
  task.googleEventId=null;task.source='planner';task.googleDirty=false;task.googleSynced=false;task.googleConflict=null;
  saveTasks();renderAll();
  const restored=await sendTaskToGoogle(task,true);
  if(restored){delete task.googleBackupRestored;delete task.googleRestoreCreateId;saveTasks();renderAll();toast('✓ Przywrócono wydarzenie w Google');return true;}
  task.googleRestoreCreateId=task.googleCreateId;
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
          x.googleSynced=!x.googleDirty;
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
  for(const task of tasks.filter(t=>t.googleDirty&&t.googleSyncError&&!t.googleConflict)){
    const row=document.createElement('div');row.style.marginTop='8px';row.textContent=`${task.title||'Bez tytułu'} • ${task.date||''}: ${task.googleSyncError}`;box.appendChild(row);
  }
  for(const task of conflicts){
    const row=document.createElement('div');row.style.marginTop='8px';
    const description=document.createElement('div');
    description.textContent=`${task.title||'Bez tytułu'} • ${task.date||''} ${task.time||''}: ${task.googleConflict==='deleted'?(task.googleBackupRestored?'Odzyskano z kopii; w Google wydarzenie jest usunięte. Wymaga Twojej decyzji.':'Google zgłosił usunięcie; w Planerze pozostała niewysłana zmiana.'):'Zapisany konflikt: '+task.googleConflict}`;
    row.appendChild(description);
    if(task.googleConflict==='edited'){
      const names={summary:'tytuł',description:'notatka',location:'lokalizacja',schedule:'termin'};
      description.textContent=`${task.title}: różne zmiany (${(task.googleEditConflict?.fields||[]).map(k=>names[k]||k).join(', ')}).`;
      for(const [choice,label] of [['local','Zachowaj moje zmiany'],['remote','Przyjmij wersję Google']]){const action=document.createElement('button');action.className='secondary';action.textContent=label;action.onclick=async()=>{action.disabled=true;try{await resolveGoogleEditConflict(task,choice)}finally{renderGoogleSyncResult({})}};row.appendChild(action);}
    }
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
  googleSyncInProgress=true;window.googleSyncInProgress=true;
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
        const check=await plannerGoogleFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(task.googleEventId)}`,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
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
    }else if(tasks.some(t=>t.googleDirty&&t.googleSyncError&&!t.googleConflict)){
      setGoogleStatus(true,'Połączony • błąd zapisu zmian');
      toast('Nie wszystkie zmiany zapisano w Google. Szczegóły pod przyciskiem synchronizacji.');
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
  }finally{googleSyncInProgress=false;window.googleSyncInProgress=false;}
}

async function sendTaskToGoogle(task,silent=false){
  if(!googleAccessToken||!task?.date||task.source==='google')return false;
  if(task.time&&!task.endTime){task.googleSyncError='Uzupełnij godzinę zakończenia wydarzenia w Planerze.';saveTasks();if(!silent)toast(task.googleSyncError);return false;}
  delete task.googleSyncError;
  if(!task.googleCreateId){
    const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);
    task.googleCreateId='mp'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    saveTasks();
  }
  const creation=task.googlePendingCreate||{sent:googleLocalSnapshot(task),event:{...googleEventBody(task),id:task.googleCreateId}};
  task.googlePendingCreate=creation;saveTasks();
  const event=creation.event;
  if(!task.time&&Array.isArray(event.recurrence))event.recurrence=googleAllDayRecurrence(event.recurrence);
  const bindResult=result=>{
    if(task.googleSeriesMaster===true){
      task.googleSeriesParentId=result.id||task.googleCreateId;
      task.googleSeriesDeleteBaseline=googleComparableDeleteContent(result);
      task.googleEventId=null;
    }else task.googleEventId=result.id||task.googleCreateId;
    task.source='planner';
    googleAcknowledge(task,result,creation.sent);delete task.googlePendingCreate;
    task.googleDeleteBaseline=googleComparableDeleteContent(result);
    task.googleData={...(task.googleData||{}),etag:result.etag||'',updated:result.updated||'',location:result.location??task.location??'',description:result.description||'',reminders:result.reminders||null,htmlLink:result.htmlLink||''};
    saveTasks();renderAll();
  };
  try{
    let response=await plannerGoogleFetch('https://www.googleapis.com/calendar/v3/calendars/primary/events',{method:'POST',headers:{Authorization:`Bearer ${googleAccessToken}`,'Content-Type':'application/json'},body:JSON.stringify(event)});
    if(response.status===401){googleAccessToken=null;setGoogleStatus(false,'Połączenie wygasło');toast('Połącz ponownie Google Calendar');return false;}
    if(response.status===409){
      response=await plannerGoogleFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(task.googleCreateId)}`,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
    }
    if(!response.ok){console.error(await response.text());if(!silent)toast('Nie udało się dodać do Google Calendar');return false;}
    const result=await response.json();
    if(result.status==='cancelled')return false;
    if(result.id!==event.id||!PlannerSyncCore.matches(result,event)){task.googleSyncError='Google nie potwierdziło pełnej treści tworzonego wydarzenia.';saveTasks();return false;}
    bindResult(result);
    if(!silent)toast('✓ Dodano również do Google Calendar');
    return true;
  }catch(err){console.error(err);if(!silent)toast('Błąd połączenia z Google Calendar');return false;}
}
function googleDateParts(event){return PlannerSyncCore.parts(event);}

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
  // Backup recovery is an explicit local intention, independent of dirty edits.
  if(task.googleDirty||task.googleBackupRestored){
    task.googleConflict='deleted';task.googleSynced=false;
  }else{
    tasks=tasks.filter(current=>current!==task);
  }
}

function bindGoogleSeriesMembership(task,parentId){
  const previousParent=task.googleSeriesParentId||task.googleData?.recurringEventId||null;
  const sibling=tasks.find(other=>other!==task&&other.googleSeriesParentId===parentId&&other.seriesId);
  // Google splits "this and following" into a new parent. Use that identity,
  // never title or changed time, to keep the two segments separate.
  const changedParent=previousParent&&previousParent!==parentId;
  if(changedParent){
    task.googleSeriesDeleteBaseline=null;task.seriesMeta=null;task.recurrence=null;
    task.googleSeriesMaster=false;task.googleSeriesVirtual=false;
  }
  task.seriesId=sibling?.seriesId||(!changedParent&&task.seriesId)||('google-series:'+parentId);
  if(sibling?.googleSeriesDeleteBaseline&&!task.googleSeriesDeleteBaseline)task.googleSeriesDeleteBaseline=sibling.googleSeriesDeleteBaseline;
  if(sibling?.seriesMeta&&!task.seriesMeta)task.seriesMeta={...sibling.seriesMeta};
  if(sibling?.recurrence&&!task.recurrence)task.recurrence={...sibling.recurrence};
  if(!task.recurrence)task.recurrence={frequency:'google',interval:1};
}
function googleRecurrenceSummary(rules){
  const rule=(rules||[]).find(value=>value.startsWith('RRULE:'));
  if(!rule)return {frequency:'google',interval:1};
  const fields=Object.fromEntries(rule.slice(6).split(';').map(part=>part.split('=')));
  const result={frequency:(fields.FREQ||'google').toLowerCase(),interval:Math.max(1,Number(fields.INTERVAL)||1)};
  if(fields.COUNT)result.count=Number(fields.COUNT);
  if(/^\d{8}/.test(fields.UNTIL||''))result.until=fields.UNTIL.slice(0,4)+'-'+fields.UNTIL.slice(4,6)+'-'+fields.UNTIL.slice(6,8);
  return result;
}
function upsertGoogleEvent(event){
  if(!event?.id||event.status==='cancelled')return false;
  if(googleDeleteQueue().some(x=>x.googleEventId===event.id)||googleEventStoppedLocally(event)||queuedGoogleSeriesDeletion(event))return false;
  const p=googleDateParts(event);if(!p)return false;
  const parentId=event.recurringEventId||"";
  const originalKey=googleInstanceOriginalKey(event);
  let task=tasks.find(t=>t.googleEventId===event.id||t.googleCreateId===event.id);
  if(!task&&parentId&&originalKey){
    task=tasks.find(t=>{
      const sameParent=t.googleSeriesParentId===parentId||(t.googleSeriesMaster&&t.googleEventId===parentId);
      return sameParent&&localOriginalStartKey(t)===originalKey;
    });
  }
  const wasDirty=task?.googleDirty===true||!!task?.googleConflict||!!task?.googlePendingWrite||!!task?.googlePendingCreate;
  if(task)delete task.googleBackupRestored;
  if(!task){
    task={id:Date.now()+Math.random(),done:false};
    tasks.push(task);
  }
  if(!task.createdAt){const created=event.created||task.googleData?.created;if(created&&Number.isFinite(Date.parse(created)))task.createdAt=new Date(created).toISOString()}
  if(!wasDirty)googleRememberRemote(task,event);
  // A live event supersedes a previously observed deletion. Keep local edits.
  if(task.googleConflict==='deleted')task.googleConflict=null;
  if(parentId){
    bindGoogleSeriesMembership(task,parentId);
    if(task.googleSeriesMaster&&task.googleEventId===parentId)task.googleEventId=null;
    task.googleSeriesParentId=parentId;
    task.googleOriginalStart=event.originalStartTime||task.googleOriginalStart||null;
    task.googleEventId=event.id;
  }else{
    task.googleEventId=event.id;
  }
  if(wasDirty)return true;
  task.title=event.summary||'(Bez tytułu)';
  task.date=p.date;task.time=p.time;task.endTime=p.endTime;task.endDate=p.endDate;task.timeZone=p.timeZone;googleLocalSchedules.set(task.id,googleScheduleSnapshot(task));
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
      const response=await plannerGoogleFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
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
    if(refreshSeries&&await refreshGoogleSeriesBaselines()===false)return false;
    saveTasks();renderAll();
    if(!silent){setGoogleStatus(true,'Połączony • zsynchronizowano');toast(changed?'✓ Kalendarz Google zsynchronizowany':'✓ Brak nowych wydarzeń');}
    return true;
  }catch(err){
    console.error(err);setGoogleStatus(true,'Połączony • błąd synchronizacji');
    if(!silent)toast('Nie udało się pobrać wydarzeń z Google');
    throw err;
  }
}
for(const task of tasks){
  const baseline=task.googleDeleteBaseline,p=baseline?googleDateParts(baseline):null;
  if(p&&p.date===task.date&&p.time===(task.time||'')&&p.endTime===(task.endTime||'')){task.endDate=task.endDate||p.endDate;task.timeZone=task.timeZone||p.timeZone;}
}
preparePlannerSave();
setupGoogleCalendarUI();
renderGoogleDeleteConflicts();
// Count complete async operations, including response parsing and final local saves.
window.plannerGoogleOperations=0;
function trackedGoogleOperation(operation){
  return async function(...args){
    if(window.PlannerData)PlannerData.assertWritable();window.plannerGoogleOperations++;
    try{return await operation(...args)}finally{window.plannerGoogleOperations--;}
  };
}
processGoogleSeriesStops=trackedGoogleOperation(processGoogleSeriesStops);
processGoogleSeriesDeletion=trackedGoogleOperation(processGoogleSeriesDeletion);
processGoogleDeleteQueue=trackedGoogleOperation(processGoogleDeleteQueue);
fetchGoogleSeriesBaseline=trackedGoogleOperation(fetchGoogleSeriesBaseline);
refreshGoogleSeriesBaselines=trackedGoogleOperation(refreshGoogleSeriesBaselines);
resolveDeleteConflict=trackedGoogleOperation(resolveDeleteConflict);
updateTaskInGoogle=trackedGoogleOperation(updateTaskInGoogle);
ensureGoogleSeriesInstance=trackedGoogleOperation(ensureGoogleSeriesInstance);
syncEditedTaskToGoogle=trackedGoogleOperation(syncEditedTaskToGoogle);
pushEditedTaskToGoogle=trackedGoogleOperation(pushEditedTaskToGoogle);
deleteTaskFromGoogle=trackedGoogleOperation(deleteTaskFromGoogle);
restoreConflictToGoogle=trackedGoogleOperation(restoreConflictToGoogle);
pushPlannerTasksToGoogle=trackedGoogleOperation(pushPlannerTasksToGoogle);
syncGoogleCalendar=trackedGoogleOperation(syncGoogleCalendar);
sendTaskToGoogle=trackedGoogleOperation(sendTaskToGoogle);
syncFromGoogle=trackedGoogleOperation(syncFromGoogle);
restoreGoogleCalendarConnection();
const originalAddTask=addTask;
addTask=function(title,date,time='',endTime='',category='Osobiste',notes='',reminder=null,seriesId=null,location=''){
  originalAddTask(title,date,time,endTime,category,notes,reminder,seriesId,location);
  const task=tasks[tasks.length-1];
  if(googleAccessToken)sendTaskToGoogle(task);
  return task;
};










