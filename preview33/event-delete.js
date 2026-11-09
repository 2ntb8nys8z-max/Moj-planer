// An event is deleted only after a completed left slide and an uninterrupted hold.
(()=>{
 if(window.OktiEventDelete)return;
 const header=document.getElementById('eventHeaderActions'),modal=document.getElementById('eventModal');if(!header||!modal)return;
 const holdMs=800,style=document.createElement('style');style.textContent=`
 #eventModal #eventHeaderActions{width:100%;justify-self:stretch;align-items:flex-start}
 #eventModal .okti-event-delete{position:relative;flex:none;width:min(156px,calc(100% - 92px));height:42px;margin-right:auto;overflow:hidden;isolation:isolate;border:1px solid #ffffffad;border-radius:11px;background:linear-gradient(145deg,#fffdfa,#f4f1ed);box-shadow:inset 0 1px 1px #fff,0 3px 7px #112b3c24;color:#8e3d43;--delete-progress:0}
 .okti-event-delete:after{content:'';position:absolute;inset:auto 0 0;height:3px;transform:scaleX(0);transform-origin:left;background:#b45154;pointer-events:none}
 .okti-event-delete[data-state=holding]:after{transform:scaleX(1);transition:transform 800ms linear}
 .okti-event-delete-label{position:absolute;left:9px;right:45px;top:0;bottom:0;display:flex;align-items:center;justify-content:center;font:750 13px/15px var(--okti-font,sans-serif);pointer-events:none;white-space:normal;text-align:center}
 .okti-event-delete[data-state=holding] .okti-event-delete-label{left:46px;right:5px;font-size:12px}
 #eventModal #eventHeaderActions .okti-event-delete-thumb{position:absolute;right:3px;top:2px;display:grid;place-items:center;width:36px;min-width:36px;height:36px;min-height:36px;margin:0!important;padding:8px!important;border:1px solid #d4b4b7!important;border-top-color:#fff!important;border-radius:8px;background:linear-gradient(145deg,#fff,#fcf3f3)!important;box-shadow:inset 0 1px 1px #fff,0 2px 3px #68434b28!important;color:#9f414a!important;touch-action:none;user-select:none;-webkit-tap-highlight-color:transparent}
 #eventModal #eventHeaderActions .okti-event-delete-thumb svg{width:20px;height:20px;pointer-events:none}
 .okti-event-delete[data-state=idle] .okti-event-delete-thumb{transition:transform 180ms ease}
 .okti-event-delete-thumb:focus-visible{outline:2px solid #a23e48;outline-offset:-2px}
 .okti-event-delete[aria-busy=true]{opacity:.7}
 @media(prefers-reduced-motion:reduce){.okti-event-delete[data-state=idle] .okti-event-delete-thumb{transition:none}}
 `;document.head.append(style);
 const root=document.createElement('div');root.id='eventDeleteControl';root.className='okti-event-delete';root.dataset.state='idle';root.setAttribute('role','group');root.setAttribute('aria-label','Usuwanie wydarzenia');
 const label=document.createElement('span');label.className='okti-event-delete-label';label.setAttribute('aria-live','polite');label.textContent='← Usuń';
 const thumb=document.createElement('button');thumb.type='button';thumb.className='okti-event-delete-thumb';thumb.setAttribute('aria-label','Usuń wydarzenie — przesuń kosz w lewo i przytrzymaj');thumb.title='Przesuń kosz w lewo i przytrzymaj. Klawiatura: przytrzymaj lewą strzałkę lub Enter.';thumb.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></svg>';
 root.append(label,thumb);header.prepend(root);
 let gesture=null,committing=false,suppressClickUntil=0;
 const current=task=>!!task&&activeTask===task&&tasks.includes(task)&&!modal.classList.contains('hidden')&&!document.hidden;
 function reset(){if(gesture?.timer)clearTimeout(gesture.timer);const old=gesture;gesture=null;if(old?.pointerId!=null){try{thumb.releasePointerCapture?.(old.pointerId)}catch(_){}}root.dataset.state='idle';root.removeAttribute('aria-busy');label.textContent='← Usuń';thumb.style.transform='translateX(0px)';thumb.disabled=committing}
 async function finish(state){
  if(gesture!==state||!current(state.task)){reset();return}clearTimeout(state.timer);gesture=null;committing=true;suppressClickUntil=performance.now()+1000;thumb.disabled=true;root.dataset.state='deleting';root.setAttribute('aria-busy','true');label.textContent='Usuwam…';
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
 function arm(state){if(state.timer||gesture!==state)return;root.dataset.state='holding';label.textContent='Przytrzymaj';state.timer=setTimeout(()=>finish(state),holdMs)}
 thumb.onpointerdown=event=>{if(committing||event.button!==0||event.isPrimary===false||!current(activeTask))return;reset();event.preventDefault();gesture={task:activeTask,pointerId:event.pointerId,x:event.clientX,y:event.clientY,travel:Math.max(1,root.getBoundingClientRect().width-thumb.getBoundingClientRect().width-6)};root.dataset.state='sliding';try{thumb.setPointerCapture?.(event.pointerId)}catch(_){}};
 thumb.onpointermove=event=>{const state=gesture;if(!state||state.pointerId!==event.pointerId)return;const dx=state.x-event.clientX,dy=Math.abs(state.y-event.clientY);if(dy>20&&dy>Math.abs(dx)){reset();return}event.preventDefault();const progress=Math.max(0,Math.min(1,dx/state.travel));thumb.style.transform='translateX('+(-progress*state.travel)+'px)';if(progress>=.94)arm(state);else{clearTimeout(state.timer);state.timer=null;root.dataset.state='sliding';label.textContent='← Usuń'}};
 for(const name of ['pointerup','pointercancel','lostpointercapture'])thumb.addEventListener(name,event=>{if(gesture?.pointerId===event.pointerId)reset()});
 thumb.onkeydown=event=>{if(['Escape','ArrowRight'].includes(event.key)){event.preventDefault();reset();return}if(!['Enter',' ','ArrowLeft'].includes(event.key)||event.repeat||committing||!current(activeTask))return;event.preventDefault();reset();gesture={task:activeTask,key:event.key};thumb.style.transform='translateX('+(-Math.max(1,root.getBoundingClientRect().width-thumb.getBoundingClientRect().width-6))+'px)';arm(gesture)};
 thumb.onkeyup=event=>{if(gesture?.key===event.key){event.preventDefault();reset()}};thumb.onblur=()=>{if(gesture)reset()};
 thumb.onclick=event=>{event.preventDefault();event.stopPropagation();if(!committing&&performance.now()>=suppressClickUntil)toast('Przesuń kosz w lewo i przytrzymaj, aby usunąć wydarzenie.')};
 const originalOpen=openEventActions,originalClose=closeEventActions;openEventActions=function(...args){reset();return originalOpen.apply(this,args)};closeEventActions=function(...args){reset();return originalClose.apply(this,args)};
 document.addEventListener('scroll',()=>{if(gesture)reset()},true);document.addEventListener('visibilitychange',()=>{if(document.hidden)reset()});window.addEventListener('blur',reset);
 new MutationObserver(()=>{if(modal.classList.contains('hidden')&&gesture)reset()}).observe(modal,{attributes:true,attributeFilter:['class']});
 window.OktiEventDelete={reset};
})();
