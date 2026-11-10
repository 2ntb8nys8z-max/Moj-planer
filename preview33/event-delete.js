// An event is deleted only after a completed left slide and an uninterrupted hold.
(()=>{
 if(window.OktiEventDelete)return;
 const header=document.getElementById('eventHeaderActions'),modal=document.getElementById('eventModal');if(!header||!modal)return;
 const holdMs=800,style=document.createElement('style');style.textContent=`
 #eventModal #eventHeaderActions{width:100%;justify-self:stretch;align-items:flex-start;position:relative;z-index:5;pointer-events:auto}
 #eventModal .okti-event-delete{position:relative;flex:none;width:min(156px,calc(100% - 102px));height:46px;margin-right:auto;overflow:hidden;isolation:isolate;border:1px solid #ffffff38;border-radius:24px;background:#ffffff0a;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:inset 0 1px #ffffff24,0 2px 9px #14162410;color:#fff;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
 .okti-event-delete:after{content:'';position:absolute;inset:auto 12px 5px;height:2px;transform:scaleX(0);transform-origin:right;background:#ffffffa6;pointer-events:none}
 .okti-event-delete[data-state=holding]:after{transform:scaleX(1);transition:transform 800ms linear}
 .okti-event-delete-label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);pointer-events:none}
 #eventModal #eventHeaderActions .okti-event-delete-thumb{position:absolute;right:0;top:0;width:44px;min-width:44px;height:44px;min-height:44px;padding:11px;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;z-index:2}
 #eventModal #eventHeaderActions .okti-event-delete-thumb:before{inset:3px;border-radius:20px;background:#ffffff17}
 #eventModal #eventHeaderActions .okti-event-delete-thumb:active{cursor:grabbing}
 #eventModal #eventHeaderActions .okti-event-delete-thumb svg{width:19px;height:19px;pointer-events:none}
 .okti-event-delete[data-state=idle] .okti-event-delete-thumb{transition:transform 180ms ease}
 .okti-event-delete[aria-busy=true]{opacity:.7}
 @media(prefers-reduced-motion:reduce){.okti-event-delete[data-state=idle] .okti-event-delete-thumb{transition:none}}
 `;document.head.append(style);
 const root=document.createElement('div');root.id='eventDeleteControl';root.className='okti-event-delete';root.dataset.state='idle';root.setAttribute('role','group');root.setAttribute('aria-label','Usuwanie wydarzenia');
 const label=document.createElement('span');label.className='okti-event-delete-label';label.setAttribute('aria-live','polite');label.textContent='';
 const thumb=document.createElement('button');thumb.type='button';thumb.className='okti-event-delete-thumb';thumb.setAttribute('aria-label','Usuń wydarzenie — przesuń kosz w lewo i przytrzymaj');thumb.title='Przesuń kosz w lewo i przytrzymaj. Klawiatura: przytrzymaj lewą strzałkę lub Enter.';thumb.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></svg>';
 root.append(label,thumb);header.prepend(root);
 let gesture=null,committing=false;
 const current=task=>!!task&&activeTask===task&&tasks.includes(task)&&!modal.classList.contains('hidden')&&!document.hidden;
 function reset(){if(gesture?.timer)clearTimeout(gesture.timer);const old=gesture;gesture=null;if(old?.pointerId!=null){try{thumb.releasePointerCapture?.(old.pointerId)}catch(_){}}root.dataset.state='idle';root.removeAttribute('aria-busy');label.textContent='';thumb.style.transform='translateX(0px)';thumb.disabled=committing}
 async function finish(state){
  if(gesture!==state||!current(state.task)){reset();return}clearTimeout(state.timer);gesture=null;committing=true;thumb.disabled=true;root.dataset.state='deleting';root.setAttribute('aria-busy','true');label.textContent='';
  try{
   if(state.task.seriesId){await document.getElementById('actionDelete').onclick();return}
   const snapshot=PlannerData.snapshot(),remaining=tasks.filter(task=>task!==state.task),queue=[...snapshot.deleteQueue],task=state.task;
   if(task.googleEventId&&!queue.some(item=>item.googleEventId===task.googleEventId))queue.push({googleEventId:task.googleEventId,localTaskId:task.id,localSnapshot:structuredClone(task),baseContent:task.googleDeleteBaseline||null,baseEtag:task.googleData?.etag||null,baseUpdated:task.googleData?.updated||null,deletedAt:new Date().toISOString(),state:'pending',reason:'delete'});
   // One durable write owns the local removal and its pending Google deletion.
   // A failed save therefore leaves both the event and the sync queue untouched.
   PlannerData.commit({...snapshot,tasks:remaining,deleteQueue:queue});tasks=remaining;renderAll();if(activeTask===task)closeEventActions();toast(task.googleEventId?'Wydarzenie usunięte • oczekuje na synchronizację':'Wydarzenie usunięte');
  }catch(error){toast('Nie udało się usunąć wydarzenia. '+(error.message||''))}
  finally{committing=false;reset()}
 }
 function arm(state){if(state.timer||gesture!==state)return;root.dataset.state='holding';label.textContent='';state.timer=setTimeout(()=>finish(state),holdMs)}
 thumb.onpointerdown=event=>{if(committing||event.button!==0||event.isPrimary===false||!current(activeTask))return;reset();event.preventDefault();gesture={task:activeTask,pointerId:event.pointerId,x:event.clientX,y:event.clientY,travel:Math.max(1,root.getBoundingClientRect().width-thumb.getBoundingClientRect().width-2)};root.dataset.state='sliding';try{thumb.setPointerCapture?.(event.pointerId)}catch(_){}};
 const movePointer=event=>{const state=gesture;if(!state||state.pointerId!==event.pointerId)return;const dx=state.x-event.clientX,dy=Math.abs(state.y-event.clientY);if(dy>30){reset();return}event.preventDefault();const progress=Math.max(0,Math.min(1,dx/state.travel));thumb.style.transform='translateX('+(-progress*state.travel)+'px)';if(progress>=.98)arm(state);else{clearTimeout(state.timer);state.timer=null;root.dataset.state='sliding';label.textContent=''}};
 // Capture preserves the target outside the handle; document listeners also
 // cover a browser refusing capture without creating another gesture owner.
 document.addEventListener('pointermove',movePointer,{passive:false});
 for(const name of ['pointerup','pointercancel'])document.addEventListener(name,event=>{if(gesture?.pointerId===event.pointerId)reset()});
 thumb.addEventListener('lostpointercapture',event=>{if(gesture?.pointerId===event.pointerId)reset()});
 thumb.onkeydown=event=>{if(['Escape','ArrowRight'].includes(event.key)){event.preventDefault();reset();return}if(!['Enter',' ','ArrowLeft'].includes(event.key)||event.repeat||committing||!current(activeTask))return;event.preventDefault();reset();gesture={task:activeTask,key:event.key};thumb.style.transform='translateX('+(-Math.max(1,root.getBoundingClientRect().width-thumb.getBoundingClientRect().width-2))+'px)';arm(gesture)};
 thumb.onkeyup=event=>{if(gesture?.key===event.key){event.preventDefault();reset()}};thumb.onblur=()=>{if(gesture)reset()};
 thumb.onclick=event=>{event.preventDefault();event.stopPropagation()};
 // Exactly one input path per browser. Modern iOS uses Pointer Events;
 // legacy Touch Events are installed only when Pointer Events are unavailable.
 if(!window.PointerEvent){
  const point=(event,id)=>[...event.changedTouches].find(t=>id==null||t.identifier===id);
  thumb.addEventListener('touchstart',event=>{
   if(event.touches.length!==1){reset();return}const t=point(event);if(!t)return;
   thumb.onpointerdown({pointerId:t.identifier,button:0,isPrimary:true,clientX:t.clientX,clientY:t.clientY,preventDefault:()=>event.preventDefault()});
  },{passive:false});
  document.addEventListener('touchmove',event=>{if(!gesture||gesture.key)return;if(event.touches.length!==1){reset();return}const t=point(event,gesture.pointerId);if(t)movePointer({pointerId:t.identifier,clientX:t.clientX,clientY:t.clientY,preventDefault:()=>event.preventDefault()})},{passive:false});
  for(const type of ['touchend','touchcancel'])document.addEventListener(type,event=>{if(gesture&&point(event,gesture.pointerId))reset()},{passive:true});
 }
 document.addEventListener('pointerdown',event=>{if(gesture&&!gesture.key&&event.pointerId!==gesture.pointerId)reset()},{passive:true});
 thumb.addEventListener('contextmenu',event=>event.preventDefault());
 const originalOpen=openEventActions,originalClose=closeEventActions;openEventActions=function(...args){reset();return originalOpen.apply(this,args)};closeEventActions=function(...args){reset();return originalClose.apply(this,args)};
 // Backgrounding always cancels the hold.
 document.addEventListener('visibilitychange',()=>{if(document.hidden)reset()});window.addEventListener('blur',reset);
 new MutationObserver(()=>{if(modal.classList.contains('hidden')&&gesture)reset()}).observe(modal,{attributes:true,attributeFilter:['class']});
 window.OktiEventDelete={reset};
})();
