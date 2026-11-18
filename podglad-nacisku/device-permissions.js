// Device permissions are requested before first use; no recording is created here.
window.OktiPermissions=(()=>{
 const key=(typeof PREVIEW33_PREFIX==='string'?PREVIEW33_PREFIX:'')+'okti-device-permissions-v1';
 const read=()=>{try{const value=JSON.parse(localStorage.getItem(key)||'{}');return value&&typeof value==='object'?value:{}}catch(_){return {}}};
 let saved=read(),locationBusy=false,micBusy=false,opening=null,revision=0;
 const statuses={location:'unknown',microphone:'unknown'};
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(saved))}catch(_){}};
 const dialog=document.createElement('dialog');dialog.id='oktiPermissionsDialog';dialog.setAttribute('aria-labelledby','oktiPermissionsTitle');
 dialog.innerHTML='<div class="okti-permissions-card"><h2 id="oktiPermissionsTitle">Przygotuj Okti</h2><p class="okti-permissions-intro">Ustaw dostęp teraz, aby łatwiej korzystać z Okti.</p><section><h3>Twoje położenie</h3><p>Pogoda i czas dojazdu z miejsca, w którym jesteś.</p><p id="oktiLocationPermissionStatus" role="status"></p><button id="oktiAllowLocation" type="button">Udostępnij położenie</button><button id="oktiSkipLocation" type="button" class="okti-permissions-skip">Pomiń</button></section><section><h3>Mikrofon</h3><p>Rozmowa z Okti. Nagrywanie uruchomisz przyciskiem mikrofonu.</p><p id="oktiMicrophonePermissionStatus" role="status"></p><button id="oktiAllowMicrophone" type="button">Zezwól na mikrofon</button><button id="oktiSkipMicrophone" type="button" class="okti-permissions-skip">Pomiń</button></section><button id="oktiFinishPermissions" type="button" class="okti-permissions-finish">Na razie pomiń</button></div>';
 const style=document.createElement('style');style.textContent=`
 #oktiPermissionsDialog{box-sizing:border-box;width:min(390px,calc(100vw - 24px));max-height:calc(100dvh - 32px);padding:0;border:1px solid #e2e6e8;border-radius:22px;background:#fff;color:#193b5c;font-family:var(--okti-font,sans-serif);box-shadow:0 18px 55px #24394c36;overflow:auto}
 #oktiPermissionsDialog::backdrop{background:#24394c60;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
 .okti-permissions-card{padding:21px}.okti-permissions-card h2{font-size:24px;line-height:1.2;margin:0 0 9px}.okti-permissions-card h3{font-size:18px;margin:0 0 6px}.okti-permissions-card p{font-size:15px;line-height:1.45;margin:5px 0 10px}.okti-permissions-intro{color:#687785}.okti-permissions-card section{padding:15px 0;border-top:1px solid #e6e9eb}
 .okti-permissions-card button{min-height:44px;padding:10px 13px;margin:3px 5px 3px 0;border:1px solid #c7d6dd;border-radius:11px;background:#eef4f6;color:#193b5c;font:650 15px/1.3 var(--okti-font,sans-serif);box-shadow:none;touch-action:manipulation}
 .okti-permissions-card .okti-permissions-skip{background:#fff;border-color:transparent;color:#697887}.okti-permissions-card .okti-permissions-finish{width:100%;margin:7px 0 0;background:#fff}.okti-permissions-card button:focus-visible{outline:2px solid #4a7893;outline-offset:2px}.okti-permissions-card button:disabled{opacity:.65}.okti-permissions-card [role=status]{color:#5c6c7a;font-size:13px}.okti-permissions-card [role=status]:empty{display:none}
 `;document.head.append(style);document.body.append(dialog);
 const get=id=>document.getElementById(id);
 const text={unknown:'',ready:'Gotowe.',skipped:'Pominięto. Możesz wrócić do tej zgody w Ustawieniach.',denied:'Dostęp jest zablokowany. Zmień zgodę w ustawieniach witryny w przeglądarce.',unavailable:'Nie udało się uzyskać dostępu. Możesz spróbować ponownie.',unsupported:'Ta przeglądarka nie udostępnia tej funkcji.'};
 function paint(){
  for(const [name,label,busy] of [['location','Location',locationBusy],['microphone','Microphone',micBusy]]){
   const status=statuses[name],button=get(name==='location'?'oktiAllowLocation':'oktiAllowMicrophone');
   get('okti'+label+'PermissionStatus').textContent=busy?'Oczekuję na zgodę telefonu…':text[status]||'';
   button.disabled=busy||status==='ready'||status==='unsupported';
   button.textContent=busy?'Oczekuję…':status==='ready'?'Dostęp włączony':name==='location'?'Udostępnij położenie':'Zezwól na mikrofon';
   const skip=get(name==='location'?'oktiSkipLocation':'oktiSkipMicrophone');skip.hidden=status==='ready';skip.disabled=busy;
  }
  get('oktiFinishPermissions').textContent=Object.values(statuses).every(s=>s==='unknown')?'Na razie pomiń':'Gotowe';
 }
 async function permission(name){try{return (await navigator.permissions?.query({name}))?.state||'unknown'}catch(_){return 'unknown'}}
 async function reconcile(){
  const [location,microphone]=await Promise.all([permission('geolocation'),permission('microphone')]);
  const enabled=window.OktiLocalWeather?.snapshot().enabled;
  statuses.location=location==='denied'?'denied':enabled&&(location==='granted'||location==='unknown'&&saved.location==='ready')?'ready':saved.location==='skipped'?'skipped':'unknown';
  statuses.microphone=microphone==='granted'?'ready':microphone==='denied'?'denied':microphone==='unknown'&&saved.microphone==='ready'?'ready':saved.microphone==='skipped'?'skipped':'unknown';
  if(!navigator.geolocation||!window.OktiLocalWeather)statuses.location='unsupported';
  if(!navigator.mediaDevices?.getUserMedia)statuses.microphone='unsupported';paint();
 }
 function finish(){
  revision++;for(const name of ['location','microphone'])if(!(name==='location'?locationBusy:micBusy))saved[name]=statuses[name]==='unknown'?'skipped':statuses[name];
  saved.reviewed=true;save();if(dialog.open){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open')}
 }
 async function open(force=false){
  if(dialog.open)return;if(opening)return opening;
  opening=(async()=>{
   const previous={...saved};await reconcile();
   if(!force&&previous.reviewed&&!['location','microphone'].some(name=>previous[name]==='ready'&&statuses[name]!=='ready'))return;
   if(!force&&Object.values(statuses).every(s=>s==='ready')){saved={reviewed:true,...statuses};save();return}
   if(document.hidden)return;revision++;if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  })();
  try{await opening}finally{opening=null}
 }
 async function allowLocation(){
  if(locationBusy)return;locationBusy=true;paint();
  try{
   await window.OktiLocalWeather.enable();const weather=window.OktiLocalWeather.snapshot(),allowed=await permission('geolocation');
   statuses.location=allowed==='denied'||/Brak zgody/.test(weather.error||'')?'denied':allowed==='granted'||weather.enabled&&weather.place&&Date.now()-weather.place.checkedAt<60000?'ready':'unavailable';
   saved.location=statuses.location;save();
  }catch(_){statuses.location='unavailable'}finally{locationBusy=false;paint()}
 }
 async function allowMicrophone(){
  if(micBusy)return;micBusy=true;paint();const run=revision;
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});
   try{for(const track of stream.getTracks())track.stop()}finally{saved.microphone='ready';save()}
   if(run===revision)statuses.microphone='ready';
  }catch(error){if(run===revision){statuses.microphone=error.name==='NotAllowedError'||error.name==='SecurityError'?'denied':'unavailable';saved.microphone=statuses.microphone;save()}}
  finally{micBusy=false;paint()}
 }
 get('oktiAllowLocation').onclick=allowLocation;get('oktiAllowMicrophone').onclick=allowMicrophone;
 for(const name of ['location','microphone'])get(name==='location'?'oktiSkipLocation':'oktiSkipMicrophone').onclick=()=>{statuses[name]='skipped';saved[name]='skipped';save();paint()};
 get('oktiFinishPermissions').onclick=finish;dialog.addEventListener('cancel',event=>{event.preventDefault();finish()});
 dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish()}else if(event.key==='Tab')event.stopPropagation()});
 dialog.addEventListener('close',()=>{if(!saved.reviewed){saved.reviewed=true;save()}});
 const settings=document.getElementById('phoneSettingsModal')?.querySelector('.phone-settings')||document.getElementById('localWeatherSettings')?.parentElement;
 if(settings){const section=document.createElement('section');section.className='card';section.innerHTML='<h2>Lokalizacja i mikrofon</h2><button type="button" class="secondary" id="oktiManagePermissions">Zmień zgody</button>';settings.append(section);get('oktiManagePermissions').onclick=()=>open(true)}
 window.addEventListener('okti-authenticated',()=>open());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!saved.reviewed)open()});
 queueMicrotask(()=>open());
 return {open:()=>open(true),afterLogin:()=>open(),close:finish,getState:()=>({...statuses,reviewed:!!saved.reviewed,locationBusy,micBusy})};
})();
