const GOOGLE_CLIENT_ID="241609919500-lif1p32j92okqtgmcmi0k3vk2k1825vf.apps.googleusercontent.com";
const GOOGLE_SCOPE="https://www.googleapis.com/auth/calendar.events";
let googleTokenClient=null,googleAccessToken=null;

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
      setGoogleStatus(true,'Połączony');
      toast('✓ Google Calendar połączony');
      await syncGoogleCalendar();
    }});
  }
  return true;
}

function connectGoogleCalendar(){
  if(initGoogleTokenClient())googleTokenClient.requestAccessToken({prompt:'consent'});
}

function disconnectGoogleCalendar(){
  if(googleAccessToken&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(googleAccessToken,()=>{});
  googleAccessToken=null;
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


function googleEventBody(task){
  const endTime=task.endTime||addMinutes(task.time,60);
  const timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {summary:task.title,description:plannerDescription(task),start:{dateTime:`${task.date}T${task.time}:00`,timeZone},end:{dateTime:`${task.date}T${endTime}:00`,timeZone}};
}

async function updateTaskInGoogle(task){
  if(!googleAccessToken||!task?.googleEventId||!task?.date||!task?.time)return false;
  try{
    const response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(task.googleEventId)}`,{method:'PATCH',headers:{Authorization:`Bearer ${googleAccessToken}`,'Content-Type':'application/json'},body:JSON.stringify(googleEventBody(task))});
    if(response.status===401){googleAccessToken=null;setGoogleStatus(false,'Połączenie wygasło');toast('Połącz ponownie Google Calendar');return false;}
    if(response.status===404){task.googleEventId=null;task.googleSynced=false;return false;}
    if(!response.ok)throw new Error(await response.text());
    task.googleSynced=true;return true;
  }catch(err){console.error(err);return false;}
}

async function pushPlannerTasksToGoogle(){
  if(!googleAccessToken)return {created:0,updated:0};
  let created=0,updated=0;
  for(const task of tasks){
    if(!task?.date||!task?.time)continue;
    if(task.googleEventId){
      if(task.source==='google')continue;
      if(await updateTaskInGoogle(task))updated++;
    }else{
      await sendTaskToGoogle(task);
      if(task.googleEventId)created++;
    }
  }
  saveTasks();renderAll();
  return {created,updated};
}

async function syncGoogleCalendar(){
  if(!googleAccessToken)return;
  setGoogleStatus(true,'Synchronizuję…');
  try{
    const pushed=await pushPlannerTasksToGoogle();
    await syncFromGoogle(true);
    setGoogleStatus(true,'Połączony • zsynchronizowano');
    const n=pushed.created+pushed.updated;
    toast(n?`✓ Google: wysłano/odświeżono ${n} wydarzeń`:'✓ Kalendarze zsynchronizowane');
  }catch(err){
    console.error(err);
    setGoogleStatus(true,'Połączony • błąd synchronizacji');
    toast('Nie udało się zsynchronizować kalendarzy');
  }
}

async function sendTaskToGoogle(task){
  if(!googleAccessToken||!task?.date||!task?.time||task.source==='google')return;
  const event=googleEventBody(task);
  try{
    const response=await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events',{method:'POST',headers:{Authorization:`Bearer ${googleAccessToken}`,'Content-Type':'application/json'},body:JSON.stringify(event)});
    if(response.status===401){googleAccessToken=null;setGoogleStatus(false,'Połączenie wygasło');toast('Połącz ponownie Google Calendar');return;}
    if(!response.ok){console.error(await response.text());toast('Nie udało się dodać do Google Calendar');return;}
    const result=await response.json();
    task.googleEventId=result.id;task.googleSynced=true;task.source='planner';saveTasks();renderAll();
    toast('✓ Dodano również do Google Calendar');
  }catch(err){console.error(err);toast('Błąd połączenia z Google Calendar');}
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

function googleReminder(event){
  if(!event.reminders||event.reminders.useDefault)return null;
  const popup=(event.reminders.overrides||[]).find(x=>x.method==='popup');
  return popup&&Number.isFinite(Number(popup.minutes))?{minutesBefore:Number(popup.minutes)}:null;
}

function upsertGoogleEvent(event){
  if(!event?.id||event.status==='cancelled')return false;
  const p=googleDateParts(event);if(!p)return false;
  let task=tasks.find(t=>t.googleEventId===event.id);
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
  task.reminder=googleReminder(event);
  task.source=task.source==='planner'?'planner':'google';
  task.googleEventId=event.id;
  task.googleSynced=true;
  task.googleData={
    location:event.location||'',
    description:event.description||'',
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
  setGoogleStatus(true,'Synchronizuję…');
  try{
    const from=new Date();from.setDate(from.getDate()-30);
    const to=new Date();to.setFullYear(to.getFullYear()+1);
    let pageToken='',changed=0;
    do{
      const params=new URLSearchParams({singleEvents:'true',orderBy:'startTime',timeMin:from.toISOString(),timeMax:to.toISOString(),maxResults:'2500'});
      if(pageToken)params.set('pageToken',pageToken);
      const response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,{headers:{Authorization:`Bearer ${googleAccessToken}`}});
      if(response.status===401){googleAccessToken=null;setGoogleStatus(false,'Połączenie wygasło');toast('Połącz ponownie Google Calendar');return;}
      if(!response.ok)throw new Error(await response.text());
      const data=await response.json();
      (data.items||[]).forEach(event=>{if(upsertGoogleEvent(event))changed++;});
      pageToken=data.nextPageToken||'';
    }while(pageToken);
    saveTasks();renderAll();
    if(!silent){setGoogleStatus(true,'Połączony • zsynchronizowano');toast(changed?'✓ Kalendarz Google zsynchronizowany':'✓ Brak nowych wydarzeń');}
  }catch(err){
    console.error(err);
    setGoogleStatus(true,'Połączony • błąd synchronizacji');
    toast('Nie udało się pobrać wydarzeń z Google');
  }
}

setupGoogleCalendarUI();
const originalAddTask=addTask;
addTask=function(title,date,time='',endTime='',category='Osobiste',notes='',reminder=null,seriesId=null){
  originalAddTask(title,date,time,endTime,category,notes,reminder,seriesId);
  const task=tasks[tasks.length-1];
  if(googleAccessToken)sendTaskToGoogle(task);
  return task;
};