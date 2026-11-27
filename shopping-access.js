let pendingShoppingAccess=null;
let shoppingRevokeKey=null,shoppingHighlightKey=null,shoppingAlertKey=null,shoppingTone=null;
let shoppingPushDevice=null,shoppingPushBusy=false,shoppingPushGeneration=0;
function armShoppingTone(){
  if(!shoppingOwner||!shoppingCreated||shoppingTone?.state==='running')return;
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(Audio){shoppingTone ||= new Audio();shoppingTone.resume().catch(()=>{})}
  }catch{}
}
function announceShoppingJoins(data){
  const id=shoppingStore('id');if(!id||!Array.isArray(data.joinEvents))return;
  const storageKey='seen-joins:'+id,previous=shoppingStore(storageKey);
  if(previous!==null && Number(previous)>=data.revision)return;
  saveShopping(storageKey,String(data.revision));
  if(previous===null)return;
  const news=data.joinEvents.filter(event=>event.revision>Number(previous));
  if(!news.length)return;
  shoppingAlertKey=news.at(-1).key;
  const alert=$('shoppingJoinAlert');
  alert.textContent='Do zakupów '+(news.length===1?'dołącza ':'dołączają ')+news.map(e=>e.nick).join(', ')+'. Zobacz uczestników';
  if($('shoppingAccessDialog').open){
    shoppingHighlightKey=shoppingAlertKey;$('shoppingAccessStatus').textContent=alert.textContent.split('. Zobacz')[0]+'.';
  }else{
    alert.hidden=false;
    if($('shoppingInviteDialog').open)$('shoppingInviteStatus').textContent=alert.textContent;
  }
  if(document.hidden||shoppingTone?.state!=='running')return;
  try{
    const tone=shoppingTone.createOscillator(),gain=shoppingTone.createGain(),t=shoppingTone.currentTime;
    tone.frequency.setValueAtTime(710,t);tone.frequency.exponentialRampToValueAtTime(510,t+.16);
    gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.045,t+.012);gain.gain.exponentialRampToValueAtTime(.0001,t+.21);
    tone.connect(gain);gain.connect(shoppingTone.destination);tone.start(t);tone.stop(t+.22);
    tone.onended=()=>{tone.disconnect();gain.disconnect()};
  }catch{}
}
function updateShoppingInvitations(data){
  if(!Array.isArray(data.invitations)||data.revision<shoppingInviteState.revision)return;
  const label=$('shoppingSharedLabel');
  if(data.shoppersLabel && label.textContent!==data.shoppersLabel)label.textContent=data.shoppersLabel;
  announceShoppingJoins(data);
  const removed=data.removedParticipants || [];
  const changed=JSON.stringify(shoppingInviteState.invitations)!==JSON.stringify(data.invitations) ||
    JSON.stringify(shoppingInviteState.removedParticipants)!==JSON.stringify(removed);
  shoppingInviteState={revision:data.revision,generation:data.inviteGeneration||0,inviteOnly:data.inviteOnly,invitations:data.invitations,joiningOpen:data.joiningOpen,removedParticipants:removed};
  if($('shoppingInviteDialog').open)setShoppingInviteCount(shoppingInviteCount);
  $('shoppingInviteMigration').hidden=data.inviteOnly;
  $('shoppingLegacyAccess').hidden=data.inviteOnly;
  $('shoppingCloseJoining').hidden=!data.joiningOpen;
  if(changed || !$('shoppingInviteMembers').querySelector('li'))renderShoppingMembers();
}
function renderShoppingMembers(){
  const ul=$('shoppingInviteMembers').querySelector('ul');ul.replaceChildren();
  const seats=shoppingInviteState.invitations,batches=new Map(),shown=new Set();
  for(const seat of seats)if(seat.group){
    const batch=batches.get(seat.group)||{total:0,joined:0};batch.total++;if(seat.nick)batch.joined++;batches.set(seat.group,batch);
  }
  for(const seat of seats){
    if(seat.group&&!shown.has(seat.group)){
      shown.add(seat.group);const batch=batches.get(seat.group),heading=document.createElement('li');
      heading.className='shopping-batch-label';heading.textContent='Wspólny link · zajęte miejsca '+batch.joined+'/'+batch.total;ul.append(heading);
    }
    const row=document.createElement('li'),name=document.createElement('span'),bin=document.createElement('button');
    row.classList.toggle('is-new',seat.key===shoppingHighlightKey);
    name.textContent=seat.nick||'Oczekujące zaproszenie';bin.type='button';bin.className='shopping-member-remove';
    bin.setAttribute('aria-label',seat.nick?'Usuń dostęp: '+seat.nick:'Anuluj oczekujące zaproszenie');
    bin.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16M9 6V3h6v3M6 7l1 14h10l1-14M10 10v8m4-8v8"/></svg>';
    bin.onclick=()=>{
      shoppingRevokeKey=seat.key;
      $('shoppingRevokeQuestion').textContent=seat.nick?'Odebrać dostęp osobie „'+seat.nick+'”?':'Anulować to zaproszenie?';
      $('shoppingRevokeClose').hidden=!shoppingInviteState.joiningOpen||!seat.nick;
      $('shoppingRevokeBox').hidden=false;$('shoppingConfirmRevoke').focus();
    };
    row.append(name,bin);ul.append(row);
  }
  for(const person of shoppingInviteState.removedParticipants || []){
    const row=document.createElement('li'),name=document.createElement('s'),restore=document.createElement('button');
    name.textContent=person.nick;
    restore.type='button';restore.className='shopping-member-restore';restore.textContent='Przywróć';
    restore.setAttribute('aria-label','Przywróć dostęp: '+person.nick);
    restore.onclick=()=>changeShoppingAccess('restore-access',false,person.key);
    row.append(name,restore);ul.append(row);
  }
}
async function changeShoppingAccess(action,closeJoining=false,key=shoppingRevokeKey){
  const status=$('shoppingAccessStatus'),id=shoppingStore('id');
  const controls=[$('shoppingConfirmRevoke'),$('shoppingRevokeClose'),$('shoppingCloseJoining')];
  if(controls.some(b=>b.disabled))return;
  controls.forEach(b=>b.disabled=true);
  try{
    const data=await shoppingRequest(action,{id,key,closeJoining},shoppingStore('owner'));
    shoppingRevokeKey=null;$('shoppingRevokeBox').hidden=true;updateShoppingInvitations(data);resetPreparedInvite();
    status.textContent=action==='restore-access'?'Dostęp przywrócony.':action==='close-joining'?'Dołączanie zamknięte.':closeJoining?'Dostęp cofnięty. Dołączanie zamknięte.':'Dostęp cofnięty.';
    await syncSharedShopping();
  }catch(error){status.textContent=error.message}
  finally{controls.forEach(b=>b.disabled=false)}
}
function openShoppingAccess(key){
  if(!shoppingOwner||!shoppingStore('id'))return;
  if(!legacyShoppingActive&&!showingLegacyPaper()){
    openStoredSharedPaper();
    if(!showingLegacyPaper())return;
  }
  if($('shoppingInviteDialog').open)$('shoppingInviteDialog').close();
  shoppingHighlightKey=key||null;shoppingRevokeKey=null;
  $('shoppingRevokeBox').hidden=true;$('shoppingAccessStatus').textContent='';
  $('shoppingJoinAlert').hidden=true;renderShoppingMembers();
  const dialog=$('shoppingAccessDialog');
  if(!dialog.open)dialog.showModal();
  syncSharedShopping();prepareShoppingPush();
}
function openShoppingAccessFromLink(){
  if(pendingShoppingAccess){
    const requested=pendingShoppingAccess;pendingShoppingAccess=null;
    if(requested.id===shoppingStore('id'))openShoppingAccess(requested.key);
  }
  const hash=new URLSearchParams(location.hash.slice(1));
  if(hash.get('uczestnicy')!==shoppingStore('id')||!hash.has('uczestnicy'))return;
  history.replaceState(null,'',location.pathname+location.search);
  openShoppingAccess(hash.get('osoba'));
}
function applicationKey(value){
  const bytes=atob(value.replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from(bytes,c=>c.charCodeAt(0));
}
async function prepareShoppingPush(){
  if(shoppingPushBusy)return;
  const toggle=$('shoppingPushToggle'),generation=++shoppingPushGeneration,id=shoppingStore('id');
  shoppingPushDevice=null;toggle.hidden=false;toggle.disabled=true;
  if(!('serviceWorker' in navigator)||!window.PushManager||!window.Notification){
    toggle.textContent='Powiadomienia systemowe niedostępne w tym widoku';return;
  }
  if(Notification.permission==='denied'){
    toggle.textContent='Powiadomienia zablokowane w ustawieniach urządzenia';return;
  }
  toggle.textContent='Przygotowywanie powiadomień…';
  try{
    await navigator.serviceWorker.register('./shopping-access-sw.js');
    const reg=await navigator.serviceWorker.ready;
    const [sub,keys]=await Promise.all([reg.pushManager.getSubscription(),shoppingRequest('push-key',{id},shoppingStore('owner'))]);
    if(generation!==shoppingPushGeneration)return;
    const enabled=!!sub&&shoppingStore('push:'+id)==='on';
    if(enabled)await shoppingRequest('push-on',{id,subscription:sub.toJSON()},shoppingStore('owner'));
    shoppingPushDevice={reg,key:applicationKey(keys.publicKey),sub,id,enabled};
    toggle.textContent=enabled?'Wyłącz powiadomienia na tym urządzeniu':'Włącz powiadomienia na tym urządzeniu';
  }catch{toggle.textContent='Ponów przygotowanie powiadomień'}
  finally{if(generation===shoppingPushGeneration)toggle.disabled=false}
}
async function toggleShoppingPush(){
  const d=shoppingPushDevice;
  if(!d){await prepareShoppingPush();return}
  const toggle=$('shoppingPushToggle');if(shoppingPushBusy)return;
  shoppingPushBusy=toggle.disabled=true;
  try{
    if(d.enabled){
      await shoppingRequest('push-off',{id:d.id,subscription:{endpoint:d.sub.endpoint}},shoppingStore('owner'));
      saveShopping('push:'+d.id,'off');
    }else{
      // Subscribe directly from the button gesture (required for Home Screen web apps).
      const sub=d.sub||await d.reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:d.key});
      await shoppingRequest('push-on',{id:d.id,subscription:sub.toJSON()},shoppingStore('owner'));
      saveShopping('push:'+d.id,'on');
    }
    $('shoppingAccessStatus').textContent=d.enabled?'Powiadomienia wyłączone.':'Powiadomienia włączone.';
  }catch{$('shoppingAccessStatus').textContent='Nie udało się zmienić powiadomień. Sprawdź zgodę w ustawieniach urządzenia.'}
  finally{shoppingPushBusy=false;await prepareShoppingPush()}
}
function initializeShoppingAccess(){
  $('shoppingAccess').onclick=()=>openShoppingAccess();
  $('shoppingManageAccess').onclick=()=>openShoppingAccess();
  $('shoppingAccessDone').onclick=()=>$('shoppingAccessDialog').close();
  $('shoppingJoinAlert').onclick=()=>openShoppingAccess(shoppingAlertKey);
  $('shoppingConfirmRevoke').onclick=()=>changeShoppingAccess('revoke');
  $('shoppingRevokeClose').onclick=()=>changeShoppingAccess('revoke',true);
  $('shoppingCancelRevoke').onclick=()=>$('shoppingRevokeBox').hidden=true;
  $('shoppingInviteMore').onclick=()=>openShoppingInvitations(true);
  $('shoppingCloseJoining').onclick=()=>changeShoppingAccess('close-joining');
  $('shoppingPushToggle').onclick=toggleShoppingPush;
  document.addEventListener('pointerdown',armShoppingTone,{passive:true});
  navigator.serviceWorker?.addEventListener('message',e=>{
    if(e.data?.type!=='shopping-participants' || e.data.id!==shoppingStore('id'))return;
    if(shoppingOwner)openShoppingAccess(e.data.key);
    else pendingShoppingAccess=e.data;
  });
}
