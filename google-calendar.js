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
  card.innerHTML='<div><strong>📅 Google Calendar</strong><div id="googleStatus" style="color:#667085;font-size:14px;margin-top:4px">Niepołączony</div></div><div style="display:flex;gap:8px"><button id="googleConnect" class="secondary" type="button">Połącz z Google Calendar</button><button id="googleDisconnect" class="secondary hidden" type="button">Rozłącz</button></div>';
  subtitle.after(card);
  document.getElementById('googleConnect').onclick=connectGoogleCalendar;
  document.getElementById('googleDisconnect').onclick=disconnectGoogleCalendar;
}

function setGoogleStatus(connected,text){
  const status=document.getElementById('googleStatus'),connect=document.getElementById('googleConnect'),disconnect=document.getElementById('googleDisconnect');
  if(!status)return;
  status.textContent=text;
  status.style.color=connected?'#067647':'#667085';
  status.style.fontWeight=connected?'700':'400';
  connect.classList.toggle('hidden',connected);
  disconnect.classList.toggle('hidden',!connected);
}

function initGoogleTokenClient(){
  if(!window.google?.accounts?.oauth2){toast('Google jeszcze się ładuje');return false;}
  if(!googleTokenClient){
    googleTokenClient=google.accounts.oauth2.initTokenClient({client_id:GOOGLE_CLIENT_ID,scope:GOOGLE_SCOPE,callback:r=>{
      if(r.error){console.error(r);toast('Nie udało się połączyć z Google');return;}
      googleAccessToken=r.access_token;
      setGoogleStatus(true,'Połączony');
      toast('✓ Google Calendar połączony');
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

async function sendTaskToGoogle(task){
  if(!googleAccessToken||!task?.date||!task?.time)return;
  const endTime=task.endTime||addMinutes(task.time,60);
  const timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const event={summary:task.title,description:`Dodano przez Mój Planer • ${task.category||'Osobiste'}`,start:{dateTime:`${task.date}T${task.time}:00`,timeZone},end:{dateTime:`${task.date}T${endTime}:00`,timeZone}};
  try{
    const response=await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events',{method:'POST',headers:{Authorization:`Bearer ${googleAccessToken}`,'Content-Type':'application/json'},body:JSON.stringify(event)});
    if(response.status===401){googleAccessToken=null;setGoogleStatus(false,'Połączenie wygasło');toast('Połącz ponownie Google Calendar');return;}
    if(!response.ok){console.error(await response.text());toast('Nie udało się dodać do Google Calendar');return;}
    const result=await response.json();
    task.googleEventId=result.id;task.googleSynced=true;saveTasks();renderAll();
    toast('✓ Dodano również do Google Calendar');
  }catch(err){console.error(err);toast('Błąd połączenia z Google Calendar');}
}

setupGoogleCalendarUI();
const originalAddTask=addTask;
addTask=function(title,date,time='',endTime='',category='Osobiste'){
  originalAddTask(title,date,time,endTime,category);
  const task=tasks[tasks.length-1];
  if(googleAccessToken)sendTaskToGoogle(task);
  return task;
};