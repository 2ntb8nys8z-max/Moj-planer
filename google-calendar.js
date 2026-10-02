const GOOGLE_CLIENT_ID="241609919500-lif1p32j92okqtgmcmi0k3vk2k1825vf.apps.googleusercontent.com";
const GOOGLE_SCOPE="https://www.googleapis.com/auth/calendar.events";
const GOOGLE_CONNECTED_KEY="moj-planer-google-connected";
let googleTokenClient=null,googleAccessToken=null,googleSyncInProgress=false;
const GOOGLE_DELETE_TEST_KEY="moj-planer-google-delete-test";
function googleDeleteTestQueue(){try{return JSON.parse(localStorage.getItem(GOOGLE_DELETE_TEST_KEY)||"[]")}catch(e){return []}}
function saveGoogleDeleteTestQueue(q){localStorage.setItem(GOOGLE_DELETE_TEST_KEY,JSON.stringify(q))}
function queueGoogleDeleteForTest(task){
  const q=googleDeleteTestQueue();
  if(!q.some(x=>x.googleEventId===task.googleEventId))q.push({googleEventId:task.googleEventId,localTaskId:task.id,localSnapshot:JSON.parse(JSON.stringify(task)),baseUpdated:task.googleData?.updated||null,deletedAt:new Date().toISOString(),state:"pending"});
  saveGoogleDeleteTestQueue(q);
}
window.queueGoogleDeleteForTest=queueGoogleDeleteForTest;

async function detectGoogleDeleteTestConflicts(){
  const q=googleDeleteTestQueue();
  let conflicts=0;
  for(const tomb of q){
    if(tomb.state!=="pending")continue;
    try{
      const r=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(tomb.googleEventId)}`,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
      if(!r.ok)continue;
      const ev=await r.json();
      const snap=tomb.localSnapshot||{};
      const p=googleDateParts(ev);
      const changed=!p||ev.summary!==(snap.title||'')||p.date!==snap.date||p.time!==(snap.time||'')||p.endTime!==(snap.endTime||'')||(ev.location||'')!==(snap.location||'');
      if(changed){tomb.state="conflict";tomb.remoteSnapshot=ev;tomb.remoteEtag=ev.etag||null;conflicts++;}
    }catch(e){console.error("Delete conflict check failed",e);}
  }
  saveGoogleDeleteTestQueue(q);
  renderGoogleDeleteTestConflicts();
  return conflicts;
}
function renderGoogleDeleteTestConflicts(){
  let box=document.getElementById("googleDeleteConflicts");
  const conflicts=googleDeleteTestQueue().filter(x=>x.state==="conflict");
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
    row.innerHTML=`<div><b>${local.title||remote.summary||"Wydarzenie"}</b><br><small>Usunięte w Planerze, ale zmienione w Google.</small></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="danger del-google">Usuń również z Google</button><button class="secondary restore-local">Przywróć do Planera</button></div>`;
    row.querySelector(".del-google").onclick=()=>resolveDeleteTestConflict(t.googleEventId,"delete");
    row.querySelector(".restore-local").onclick=()=>resolveDeleteTestConflict(t.googleEventId,"restore");
    box.appendChild(row);
  });
}
async function resolveDeleteTestConflict(id,choice){
  const q=googleDeleteTestQueue(),t=q.find(x=>x.googleEventId===id);if(!t)return;
  if(choice==="delete"){
    const r=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`,{method:"DELETE",headers:{Authorization:`Bearer ${googleAccessToken}`}});
    if(!r.ok&&r.status!==404&&r.status!==410){toast("Nie udało się usunąć z Google");return;}
  }else{
    const r=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
    if(!r.ok){toast("Nie udało się pobrać wydarzenia z Google");return;}
    const ev=await r.json();upsertGoogleEvent(ev);
  }
  saveGoogleDeleteTestQueue(q.filter(x=>x.googleEventId!==id));saveTasks();renderAll();renderGoogleDeleteTestConflicts();
  toast(choice==="delete"?"✓ Usunięto również z Google":"✓ Przywrócono do Planera");
}
window.resolveDeleteTestConflict=resolveDeleteTestConflict;


function setupGoogleCalendarUI(){
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
  const {endTime,endDate,timeZone}=googleDateTimeRange(task);
  return {summary:task.title,description:plannerDescription(task),location:task.location||'',start:{dateTime:`${task.date}T${task.time}:00`,timeZone},end:{dateTime:`${endDate}T${endTime}:00`,timeZone},reminders:{useDefault:false,overrides:[]}};
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

function googleEditPatch(task){
  const {endTime,endDate,timeZone}=googleDateTimeRange(task);
  const patch={summary:task.title,start:{dateTime:`${task.date}T${task.time}:00`,timeZone},end:{dateTime:`${endDate}T${endTime}:00`,timeZone}};
  if(task.source!=='google'){patch.description=plannerDescription(task);patch.location=task.location||'';}
  else{if(task.notes!==undefined)patch.description=task.notes||'';patch.location=task.location||'';}
  return patch;
}

async function syncEditedTaskToGoogle(task){
  if(!task?.googleEventId||!task?.date||!task?.time)return false;
  // Linked edits stay local until the user presses Synchronizuj.
  // This prevents a quick local edit from recreating an event just deleted in Google.
  task.googleDirty=true;
  task.googleSynced=false;
  saveTasks();
  renderAll();
  return true;
}
window.syncEditedTaskToGoogle=syncEditedTaskToGoogle;
async function pushEditedTaskToGoogle(task){
  if(!googleAccessToken||!task?.googleEventId||!task?.date||!task?.time||task.googleConflict)return false;
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
    if(!p||p.date!==task.date||p.time!==task.time){console.error('Google returned different event time',updated);return false;}
    task.googleSynced=true;task.googleDirty=false;
    task.googleData={...(task.googleData||{}),location:updated.location||task.location||'',description:updated.description||'',reminders:updated.reminders||task.googleData?.reminders||null,htmlLink:updated.htmlLink||task.googleData?.htmlLink||''};
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
  const cutoff=new Date();cutoff.setDate(cutoff.getDate()-1);
  const cutoffDate=`${cutoff.getFullYear()}-${String(cutoff.getMonth()+1).padStart(2,'0')}-${String(cutoff.getDate()).padStart(2,'0')}`;
  const dirty=tasks.filter(task=>task?.date&&task?.time&&task.googleEventId&&task.googleDirty&&!task.googleConflict).slice(0,20);
  let updated=0;
  for(const task of dirty){if(await pushEditedTaskToGoogle(task))updated++;}
  const pending=tasks.filter(task=>task?.date&&task?.time&&task.date>=cutoffDate&&task.source!=='google'&&!task.googleEventId).slice(0,20);
  let created=0;
  for(const task of pending){
    await sendTaskToGoogle(task,true);
    if(task.googleEventId)created++;
  }
  saveTasks();renderAll();
  return {created,updated,pending:pending.length,dirty:dirty.length};
}

async function syncGoogleCalendar(){
  if(!googleAccessToken||googleSyncInProgress)return;
  googleSyncInProgress=true;
  setGoogleStatus(true,'Synchronizuję…');
  try{
    const pulled=await syncFromGoogle(true);
    if(!googleAccessToken||pulled===false)return;
    const deleteConflicts=await detectGoogleDeleteTestConflicts();
    const linked=tasks.filter(task=>task.googleEventId&&task.date&&task.time&&!task.googleConflict);
    for(const task of linked){
      try{
        const check=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(task.googleEventId)}`,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
        if(check.status===404||check.status===410){
          task.googleConflict='deleted';task.googleDirty=true;task.googleSynced=false;
        }else if(check.ok){
          const ev=await check.json();
          if(ev.status==='cancelled'){
            task.googleConflict='deleted';task.googleDirty=true;task.googleSynced=false;
          }
        }
      }catch(err){console.error('Google event existence check failed',err);}
    }
    saveTasks();renderAll();
    const pushed=await pushPlannerTasksToGoogle();
    setGoogleStatus(true,'Połączony • zsynchronizowano');
    const n=pushed.created+pushed.updated;
    toast(deleteConflicts?`⚠️ Wykryto konflikt synchronizacji`:(n?`✓ Google: wysłano/odświeżono ${n} wydarzeń`:'✓ Kalendarze zsynchronizowane'));
  }catch(err){
    console.error(err);
    setGoogleStatus(true,'Połączony • błąd synchronizacji');
    toast('Nie udało się zsynchronizować kalendarzy');
  }finally{googleSyncInProgress=false;}
}

async function sendTaskToGoogle(task,silent=false){
  if(!googleAccessToken||!task?.date||!task?.time||task.source==='google')return;
  const event=googleEventBody(task);
  try{
    const response=await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events',{method:'POST',headers:{Authorization:`Bearer ${googleAccessToken}`,'Content-Type':'application/json'},body:JSON.stringify(event)});
    if(response.status===401){googleAccessToken=null;setGoogleStatus(false,'Połączenie wygasło');toast('Połącz ponownie Google Calendar');return false;}
    if(!response.ok){console.error(await response.text());if(!silent)toast('Nie udało się dodać do Google Calendar');return;}
    const result=await response.json();
    task.googleEventId=result.id;task.googleSynced=true;task.googleDirty=false;task.source='planner';saveTasks();renderAll();
    if(!silent)toast('✓ Dodano również do Google Calendar');
  }catch(err){console.error(err);if(!silent)toast('Błąd połączenia z Google Calendar');}
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

function upsertGoogleEvent(event){
  if(!event?.id||event.status==='cancelled')return false;
  if(googleDeleteTestQueue().some(x=>x.googleEventId===event.id))return false;
  const p=googleDateParts(event);if(!p)return false;
  let task=tasks.find(t=>t.googleEventId===event.id);
  if(task?.googleDirty)return false;
  if(!task){
    task={id:Date.now()+Math.random(),done:false};
    tasks.push(task);
  }
  task.title=event.summary||'(Bez tytułu)';
  task.date=p.date;
  task.time=p.time;
  task.endTime=p.endTime;
  task.category=task.category||'Osobiste';
  task.notes=cleanGoogleDescription(event.description||'');
  task.location=event.location||'';
  // reminder belongs only to Mój Planer. Google reminders are informational metadata.
  task.googleHasReminder=googleHasReminder(event);
  task.source=task.source==='planner'?'planner':'google';
  task.googleEventId=event.id;
  task.googleSynced=true;task.googleDirty=false;
  task.googleData={
    location:event.location||'',
    description:event.description||'',
    updated:event.updated||'',
    attendees:Array.isArray(event.attendees)?event.attendees:[],
    hangoutLink:event.hangoutLink||'',
    conferenceData:event.conferenceData||null,
    recurrence:event.recurrence||null,
    recurringEventId:event.recurringEventId||null,
    reminders:event.reminders||null,
    organizer:event.organizer||null,
    creator:event.creator||null,
    htmlLink:event.htmlLink||'',
    allDay:p.allDay
  };
  return true;
}

async function syncFromGoogle(silent=false){
  if(!googleAccessToken)return;
  if(!silent)setGoogleStatus(true,'Synchronizuję…');
  try{
    const from=new Date();from.setDate(from.getDate()-7);
    const to=new Date();to.setMonth(to.getMonth()+6);
    const params=new URLSearchParams({singleEvents:'true',showDeleted:'true',orderBy:'updated',timeMin:from.toISOString(),timeMax:to.toISOString(),maxResults:'250'});
    const response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
    if(response.status===401){googleAccessToken=null;setGoogleStatus(false,'Połączenie wygasło');toast('Połącz ponownie Google Calendar');return;}
    if(!response.ok)throw new Error(await response.text());
    const data=await response.json();
    let changed=0;
    (data.items||[]).forEach(event=>{
      if(event?.status==='cancelled'&&event.id){
        const before=tasks.length;
        const conflict=tasks.find(task=>task.googleEventId===event.id);
        if(conflict){conflict.googleConflict='deleted';conflict.googleDirty=true;conflict.googleSynced=false;}
        if(tasks.length!==before||conflict)changed++;
        return;
      }
      if(upsertGoogleEvent(event))changed++;
    });
    saveTasks();renderAll();
    if(!silent){setGoogleStatus(true,'Połączony • zsynchronizowano');toast(changed?'✓ Kalendarz Google zsynchronizowany':'✓ Brak nowych wydarzeń');}
    return true;
  }catch(err){
    console.error(err);
    setGoogleStatus(true,'Połączony • błąd synchronizacji');
    if(!silent)toast('Nie udało się pobrać wydarzeń z Google');
    throw err;
  }
}

setupGoogleCalendarUI();
renderGoogleDeleteTestConflicts();
restoreGoogleCalendarConnection();
const originalAddTask=addTask;
addTask=function(title,date,time='',endTime='',category='Osobiste',notes='',reminder=null,seriesId=null,location=''){
  originalAddTask(title,date,time,endTime,category,notes,reminder,seriesId,location);
  const task=tasks[tasks.length-1];
  if(googleAccessToken)sendTaskToGoogle(task);
  return task;
};