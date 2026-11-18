// Presentation only: press, release, then hand off to the existing event opener.
window.OktiEventKey=(()=>{
 const list=document.getElementById('taskList');
 if(!list)return{getState:()=>null,cancel:()=>{}};
 const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const suppressed=new WeakMap();let current=null;
 function tileAt(target){
  const tile=target?.closest?.('.okti-calendar-card');
  if(!tile||!list.contains(tile)||target.closest('input,select,textarea,a'))return null;
  const button=target.closest('button');return button&&button!==tile?null:tile;
 }
 function taskFor(tile){return tasks.find(task=>String(task.id)===tile.dataset.eventId)}
 function surfaces(tile){const copy=tile.nextElementSibling;return copy?.matches('.phone-event-title')?[tile,copy]:[tile]}
 function restore(record){
  for(const animation of record.animations)animation.cancel();record.animations=[];
  for(const node of record.nodes)node.classList.remove('okti-key-pressed','okti-key-moving','okti-key-copy');
 }
 function cancel(){
  if(!current)return;const record=current;current=null;record.cancelled=true;
  suppressed.set(record.tile,performance.now()+500);restore(record);
 }
 function begin(tile,extra={}){
  if(current||!taskFor(tile))return null;
  const nodes=surfaces(tile),record={tile,nodes,phase:'pressed',at:performance.now(),animations:[],cancelled:false,...extra};
  suppressed.delete(tile);current=record;
  for(const node of nodes){node.classList.add('okti-key-pressed');if(node!==tile)node.classList.add('okti-key-copy')}
  return record;
 }
 function valid(record){return current===record&&!record.cancelled&&record.tile.isConnected&&!!taskFor(record.tile)&&!document.hidden}
 async function release(record){
  if(current!==record||record.phase!=='pressed')return;
  record.phase='releasing';record.pointerId=null;
  try{
   const minimum=reduced()?0:Math.max(0,160-(performance.now()-record.at));
   if(minimum)await pause(minimum);
   if(!valid(record))return;
   const starts=record.nodes.map(node=>getComputedStyle(node).transform);
   for(const node of record.nodes)node.classList.remove('okti-key-pressed');
   record.tile.classList.add('okti-key-moving');
   if(record.tile.animate){
    record.animations=record.nodes.map((node,index)=>node.animate([
     {transform:starts[index]},
     {transform:'translateY(-2px)',offset:.67},
     {transform:'translateY(0)'}
    ],{duration:reduced()?1:280,easing:'cubic-bezier(.22,.65,.25,1)',fill:'both'}));
    await Promise.all(record.animations.map(animation=>animation.finished));
   }else if(!reduced())await pause(280);
   if(!valid(record))return;
   for(const animation of record.animations)animation.cancel();record.animations=[];
   if(!reduced())await pause(70);
   if(!valid(record))return;
   const task=taskFor(record.tile);restore(record);current=null;
   // Read the live opener here so all existing media, people and flight wrappers
   // retain ownership of their behavior. No event data or recorder code changes.
   openEventActions(task);
  }catch(error){if(error?.name!=='AbortError')console.error('Event key animation:',error)}
  finally{if(current===record){restore(record);current=null}}
 }
 list.addEventListener('pointerdown',event=>{
  if(event.isPrimary===false||(event.pointerType==='mouse'&&event.button!==0))return;
  const tile=tileAt(event.target);if(!tile)return;
  begin(tile,{pointerId:event.pointerId,x:event.clientX,y:event.clientY});
 },true);
 document.addEventListener('pointermove',event=>{
  const record=current;if(!record||record.phase!=='pressed'||record.pointerId!==event.pointerId)return;
  if(Math.hypot(event.clientX-record.x,event.clientY-record.y)>14)cancel();
 },true);
 document.addEventListener('pointerup',event=>{
  const record=current;if(!record||record.phase!=='pressed'||record.pointerId!==event.pointerId)return;
  const box=record.tile.getBoundingClientRect();
  if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom){cancel();return}
  release(record);
 },true);
 document.addEventListener('pointercancel',event=>{if(current?.pointerId===event.pointerId)cancel()},true);
 list.addEventListener('click',event=>{
  const tile=tileAt(event.target);if(!tile)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(current||(event.detail!==0&&(suppressed.get(tile)||0)>performance.now()))return;
  const record=begin(tile);if(record)release(record);
 },true);
 list.addEventListener('keydown',event=>{
  if(event.key!==' '&&event.key!=='Enter')return;
  const tile=tileAt(event.target);if(!tile)return;
  event.preventDefault();if(!event.repeat)begin(tile,{key:event.key});
 },true);
 document.addEventListener('keyup',event=>{
  if(current?.phase==='pressed'&&current.key===event.key){event.preventDefault();release(current)}
 },true);
 list.addEventListener('contextmenu',event=>{if(tileAt(event.target))event.preventDefault()});
 document.addEventListener('scroll',cancel,true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel()});
 window.addEventListener('blur',cancel);
 return{getState:()=>current?{phase:current.phase,eventId:current.tile.dataset.eventId}:null,cancel};
})();
