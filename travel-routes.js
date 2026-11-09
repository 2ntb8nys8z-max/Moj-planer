// Route controls belong to the destination event; only the inspected pair is connected.
(()=>{
 const style=document.createElement('style');style.textContent=`
 .phone-travel-animation{display:none!important}
 .phone-event-title.has-inline-route[data-route-layout=wide]{padding-right:116px}
 .okti-route-controls{position:absolute;z-index:26;display:flex;align-items:center;gap:3px;box-sizing:border-box;color:#526477;touch-action:pan-y}
 .okti-route-controls button{-webkit-tap-highlight-color:transparent;touch-action:pan-y;font-family:var(--okti-font,sans-serif)}
 .okti-route-badge{position:relative;display:grid;place-items:center;flex:none;width:44px;min-width:44px;height:44px;padding:0;border:0;border-radius:7px;background:transparent;color:#526477!important;box-shadow:none}
 .okti-route-badge:before{content:'';position:absolute;inset:4px;border:1px solid #d9dddf;border-top-color:#fff;border-radius:6px;background:linear-gradient(155deg,#fff,#fafafa);box-shadow:inset 0 1px 1px #fff,inset 0 -1px 1px #dfe2e4,0 3px 5px #263a4d26;transition:transform 160ms ease,box-shadow 160ms ease}
 .okti-route-badge:active:before{transform:translateY(2px);box-shadow:inset 0 1px 2px #263a4d15,0 1px 2px #263a4d19}
 .okti-route-badge>svg{position:relative;width:23px;height:23px}.okti-route-badge>.okti-route-spinner{position:relative}
 .okti-route-duration{min-width:0;min-height:44px;padding:0 2px;border:0;border-radius:4px;box-shadow:none;background:transparent!important;color:#526477;font-size:13px;line-height:16px;font-weight:650;text-align:left;white-space:normal}
 .okti-route-controls[data-risk=late] .okti-route-duration{color:#ac5147}.okti-route-controls[data-risk=tight] .okti-route-duration{color:#97723f}
 .okti-route-controls[data-layout=compact]{flex-direction:column;gap:0}.okti-route-controls[data-layout=compact] .okti-route-duration{min-height:26px;font-size:10px;line-height:12px;text-align:center}
 .okti-route-controls[data-layout=narrow] .okti-route-duration{font-size:11px}.okti-route-controls button:focus-visible{outline:2px solid #bd882a;outline-offset:1px}
 .okti-route-focus{position:fixed;inset:0;z-index:24990;pointer-events:none}
 .okti-route-scrim{position:absolute;inset:0;pointer-events:auto;background:#29323e00;backdrop-filter:blur(0);-webkit-backdrop-filter:blur(0);transition:background-color 520ms cubic-bezier(.4,0,.2,1),backdrop-filter 520ms cubic-bezier(.4,0,.2,1),-webkit-backdrop-filter 520ms cubic-bezier(.4,0,.2,1)}
 .okti-route-focus[data-state=open] .okti-route-scrim{background:#29323e24;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
 .okti-route-focus-copy{position:absolute;pointer-events:none!important;margin:0!important;transform:none!important;transition:none!important;animation:none!important}
 .okti-route-focus-copy.phone-event-title{color:#173b5b}.okti-route-focus-copy.okti-calendar-card{outline:1px solid #c58e2733;outline-offset:0}
 .okti-route-focus-lines{position:absolute;inset:0;overflow:visible;z-index:5;pointer-events:none;transition:opacity 420ms ease}
 .okti-route-focus-lines path{fill:none;stroke:#bf8621;stroke-width:4.5;stroke-linecap:round;filter:drop-shadow(0 0 4px #e4ab3f66)}
 .okti-route-focus-lines circle{fill:#b97e19;stroke:#fff7df;stroke-width:1;filter:drop-shadow(0 0 3px #e4ab3f66)}
 .okti-route-focus[data-state=closing] .okti-route-focus-lines{opacity:0}.okti-route-focus[data-state=closing] .okti-route-focus-copy{opacity:0;transition:opacity 520ms ease!important}
 .okti-route-menu{position:fixed;z-index:25000;box-sizing:border-box;width:300px;max-width:calc(100vw - 20px);padding:10px;display:flex;flex-direction:column;gap:7px;border:1px solid #dadddf;border-top-color:#fff;border-radius:10px;background:linear-gradient(150deg,#fff,#fcfcfc);color:#193b5c;font-family:var(--okti-font,sans-serif);box-shadow:inset 0 1px 1px #fff,0 14px 32px -12px #1f30435c,0 3px 8px #26394b20}
 .okti-route-detail{min-height:35px;display:flex;align-items:center;gap:10px;padding:0 3px}.okti-route-detail-icon{display:grid;place-items:center;color:#69727c}.okti-route-detail-icon svg{width:27px;height:27px}
 .okti-route-detail-duration{font-size:23px;line-height:1.2;font-weight:800;color:#a86f17}.okti-route-close{margin-left:auto;flex:none;width:36px;height:36px;padding:0;border:0;border-radius:5px;background:transparent;color:#193b5c;font-size:27px;line-height:1;box-shadow:none}
 .okti-route-options{display:flex;gap:4px;align-items:stretch;border-top:1px solid #e2e6e8;padding-top:7px}
 .okti-route-options button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;flex:1;min-width:0;min-height:54px;padding:4px 1px;border:1px solid transparent;border-radius:7px;background:transparent;color:#193b5c;box-shadow:none;touch-action:manipulation}
 .okti-route-options button[aria-checked=true]{border-color:#c99842;background:#fbf4e6;color:#a56c13}.okti-route-options svg{width:23px;height:23px}.okti-route-options span{font-size:10px;line-height:12px;font-weight:650}.okti-route-menu button:focus-visible{outline:2px solid #bd882a;outline-offset:1px}
 .okti-route-spinner{width:14px;height:14px;border:2px solid #d4d9dd;border-top-color:#7c8994;border-radius:50%;animation:okti-route-spin .7s linear infinite}@keyframes okti-route-spin{to{transform:rotate(360deg)}}
 @media(prefers-reduced-motion:reduce){.okti-route-scrim,.okti-route-focus-lines,.okti-route-focus-copy{transition:none!important}.okti-route-spinner{animation:none}}
 `;document.head.append(style);
 const icons={
  drive:'<path d="m5 8 1.5-4h11L19 8"/><rect x="3" y="8" width="18" height="11" rx="3"/><path d="M6 19v2m12-2v2M7 15h.01M17 15h.01M10 16h4"/>',
  walk:'<circle cx="13" cy="3" r="2"/><path d="m11 7 4 4 4 1M5 12l4-4 3 5-3 8m3-8 5 8"/>',
  bicycle:'<circle cx="5" cy="17" r="4"/><circle cx="19" cy="17" r="4"/><path d="m5 17 5-9 5 9H5m5-9h7l2 9M8 5h4m4-2h3l1 4"/>',
  transit:'<rect x="5" y="2" width="14" height="18" rx="3"/><path d="M5 12h14M8 5h8M8 20l-2 2m10-2 2 2M9 16h.01M15 16h.01"/>'};
 const names={drive:'Samochód',walk:'Pieszo',bicycle:'Rower',transit:'Komunikacja'},shortNames={drive:'Auto',walk:'Pieszo',bicycle:'Rower',transit:'Komunikacja'};
 const svg=mode=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[mode]+'</svg>';
 const modeKey='okti-route-modes-v1';let saved={};try{saved=JSON.parse(localStorage.getItem(modeKey)||'{}');if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={}}catch(_){}
 const routes=new Map(),closing=new Set();let frame=0,activeMenu=null,menuSerial=0,ignoreScrollUntil=0;
 const pairKey=(from,to)=>String(from.id)+'→'+String(to.id),cacheKey=(key,mode,from,to)=>JSON.stringify([key,mode,...[from,to].map(task=>[plannerLocationKey(plannerLocation(task)),task.googlePlace?.placeId||''])]);
 const motionEnabled=()=>!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const taskCard=id=>[...document.querySelectorAll('#taskList .phone-event')].find(node=>node.dataset.eventId===String(id));
 function durationLabel(minutes){const hours=Math.floor(minutes/60),rest=minutes%60;return hours?hours+' h'+(rest?' '+rest+' min':''):minutes+' min'}
 function cleanup(menu){clearTimeout(menu.closeTimer);menu.focusLayer?.remove();menu.remove();closing.delete(menu)}
 function closeMenu(restoreFocus=false,immediate=false){
  if(immediate)for(const menu of [...closing])cleanup(menu);
  const menu=activeMenu;if(!menu)return;activeMenu=null;
  for(const node of menu.background||[])node.element.inert=node.inert;
  for(const button of menu.routeControls?.querySelectorAll('button')||[])button.setAttribute('aria-expanded','false');
  if(restoreFocus&&menu.routeTrigger?.isConnected)menu.routeTrigger.focus({preventScroll:true});
  menu.inert=true;menu.dataset.state='closing';menu.setAttribute('aria-hidden','true');menu.style.pointerEvents='none';
  for(const animation of menu.getAnimations?.()||[])animation.cancel();
  if(immediate||!motionEnabled()){cleanup(menu);return}
  closing.add(menu);menu.focusLayer.dataset.state='closing';
  if(menu.animate)menu.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(5px)'}],{duration:240,easing:'ease-out',fill:'both'});
  menu.closeTimer=setTimeout(()=>cleanup(menu),540);
 }
 async function calculate(key,from,to,mode){
  const cache=cacheKey(key,mode,from,to);if(routes.get(cache)?.pending)return;routes.set(cache,{pending:true});queue();
  try{const result=await plannerApiRequest('/routes/compute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({origin:plannerLocation(from),destination:plannerLocation(to),mode:mode.toUpperCase()})});routes.set(cache,result.route?.available?{minutes:result.route.durationMinutes,distanceMeters:result.route.distanceMeters}:{hidden:true})}
  catch(error){routes.set(cache,{error:error.message||'Błąd trasy'})}queue();
 }
 function availableGap(from,to,events){let cursor=phoneMinutes(from.endTime||from.time),best=0;const end=phoneMinutes(to.time);for(const task of events){if(task===from||task===to||phoneMinutes(task.time)>=end||phoneMinutes(task.endTime||task.time)<=cursor)continue;const start=phoneMinutes(task.time);best=Math.max(best,start-cursor);cursor=Math.max(cursor,phoneMinutes(task.endTime||task.time))}return Math.max(0,best,end-cursor)}
 function cloneSurface(node,layer,z){
  if(!node)return;const box=node.getBoundingClientRect(),copy=node.cloneNode(true),prefix='route-focus-'+menuSerial+'-'+layer.children.length+'-';
  const ids=new Map();for(const element of [copy,...copy.querySelectorAll('*')]){if(element.id){ids.set(element.id,prefix+element.id);element.id=prefix+element.id}element.removeAttribute('data-event-id');element.removeAttribute('aria-controls');element.removeAttribute('aria-expanded');element.removeAttribute('tabindex')}
  for(const element of [copy,...copy.querySelectorAll('*')])for(const attribute of [...element.attributes]){let value=attribute.value;for(const [old,id] of ids)value=value.replaceAll('url(#'+old+')','url(#'+id+')').replaceAll('"#'+old+'"','"#'+id+'"');if(attribute.name==='href'&&ids.has(value.slice(1)))value='#'+ids.get(value.slice(1));if(value!==attribute.value)element.setAttribute(attribute.name,value)}
  copy.classList.remove('okti-key-pressed','okti-key-moving','okti-event-created');copy.classList.add('okti-route-focus-copy');copy.inert=true;
  Object.assign(copy.style,{left:box.left+'px',top:box.top+'px',width:box.width+'px',height:box.height+'px',maxHeight:'none',right:'auto',bottom:'auto',zIndex:String(z)});layer.append(copy);
 }
 function refreshFocus(menu,animate=false){
  const from=taskCard(menu.routeFrom.id),to=taskCard(menu.routeTo.id);if(!from||!to)return false;
  const layer=menu.focusLayer;layer.querySelectorAll('.okti-route-focus-copy').forEach(node=>node.remove());
  for(const card of [from,to]){cloneSurface(card,layer,2);if(card.nextElementSibling?.matches('.phone-event-title'))cloneSurface(card.nextElementSibling,layer,6);const controls=[...document.querySelectorAll('#taskList .okti-route-controls')].find(node=>node.dataset.destinationEventId===card.dataset.eventId);cloneSurface(controls,layer,6)}
  const a=from.getBoundingClientRect(),b=to.getBoundingClientRect(),x1=a.left+a.width/2,y1=a.top+a.height/2,x2=b.left+b.width/2,y2=b.top+b.height/2;
  const path=layer.querySelector('path'),dots=layer.querySelectorAll('circle'),length=Math.hypot(x2-x1,y2-y1);
  path.setAttribute('d',`M ${x1} ${y1} L ${x2} ${y2}`);dots[0].setAttribute('cx',x1);dots[0].setAttribute('cy',y1);dots[1].setAttribute('cx',x2);dots[1].setAttribute('cy',y2);
  if(animate&&motionEnabled()&&path.animate){dots[0].animate([{opacity:0},{opacity:1}],{duration:180,fill:'both'});path.animate([{'strokeDasharray':String(length),'strokeDashoffset':String(length)},{'strokeDasharray':String(length),'strokeDashoffset':'0'}],{duration:420,delay:140,easing:'cubic-bezier(.4,0,.2,1)',fill:'both'});dots[1].animate([{opacity:0},{opacity:1}],{duration:180,delay:540,fill:'both'})}
  return true;
 }
 function makeFocus(menu){
  const layer=document.createElement('div');layer.className='okti-route-focus';layer.dataset.state='opening';layer.setAttribute('aria-hidden','true');
  const scrim=document.createElement('div');scrim.className='okti-route-scrim';scrim.onpointerdown=event=>{event.preventDefault();closeMenu(true)};layer.append(scrim);
  const drawing=document.createElementNS('http://www.w3.org/2000/svg','svg');drawing.classList.add('okti-route-focus-lines');drawing.setAttribute('width','100%');drawing.setAttribute('height','100%');
  drawing.append(document.createElementNS(drawing.namespaceURI,'path'));for(let i=0;i<2;i++){const dot=document.createElementNS(drawing.namespaceURI,'circle');dot.setAttribute('r','5');drawing.append(dot)}layer.append(drawing);
  menu.focusLayer=layer;document.body.append(layer);refreshFocus(menu,true);
  requestAnimationFrame(()=>{if(activeMenu===menu)layer.dataset.state='open'});
 }
 function showModes(key,from,to,button){
  if(activeMenu?.dataset.routeKey===key){closeMenu(true);return}closeMenu(false,true);
  const menu=document.createElement('div');menu.className='okti-route-menu';menu.id='okti-route-menu-'+(++menuSerial);menu.dataset.routeKey=key;menu.dataset.state='open';menu.routeFrom=from;menu.routeTo=to;
  menu.setAttribute('role','dialog');menu.setAttribute('aria-modal','true');menu.setAttribute('aria-label','Dojazd z '+from.title+' do '+to.title);menu.setAttribute('aria-describedby',menu.id+'-summary');
  const summary=document.createElement('div');summary.className='okti-route-detail';summary.id=menu.id+'-summary';summary.setAttribute('aria-live','polite');summary.innerHTML='<span class="okti-route-detail-icon" aria-hidden="true"></span><strong class="okti-route-detail-duration"></strong>';
  const close=document.createElement('button');close.type='button';close.className='okti-route-close';close.textContent='×';close.setAttribute('aria-label','Zamknij dojazd');close.onclick=()=>closeMenu(true);summary.append(close);menu.append(summary);
  const options=document.createElement('div');options.className='okti-route-options';options.setAttribute('role','radiogroup');options.setAttribute('aria-label','Wybierz środek transportu');menu.append(options);
  for(const mode of Object.keys(icons)){const option=document.createElement('button');option.type='button';option.dataset.mode=mode;option.setAttribute('role','radio');option.setAttribute('aria-label',names[mode]);option.innerHTML=svg(mode)+'<span>'+shortNames[mode]+'</span>';option.onclick=event=>{event.stopPropagation();if(mode===(saved[key]||'drive'))return;saved[key]=mode;try{localStorage.setItem(modeKey,JSON.stringify(saved))}catch(_){}calculate(key,menu.routeFrom,menu.routeTo,mode)};options.append(option)}
  options.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;const buttons=[...options.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);if(index<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length;buttons[next].focus({preventScroll:true});buttons[next].click()};
  menu.onkeydown=event=>{if(event.key!=='Tab')return;const buttons=[close,...options.querySelectorAll('[aria-checked=true]')];if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons.at(-1).focus()}else if(!event.shiftKey&&document.activeElement===buttons.at(-1)){event.preventDefault();close.focus()}};
  // Bring both real cards into the calendar viewport before taking the sharp copies.
  const scroller=$('taskList'),a=taskCard(from.id)?.getBoundingClientRect(),b=taskCard(to.id)?.getBoundingClientRect(),viewport=scroller?.getBoundingClientRect();if(a&&b&&viewport){const top=Math.min(a.top,b.top),bottom=Math.max(a.bottom,b.bottom),safeTop=Math.max(12,parseFloat(getComputedStyle(document.querySelector('.app')||document.body).getPropertyValue('--phone-top-inset'))||0),screenHeight=window.visualViewport?.height||window.innerHeight;if(bottom-top<viewport.height-24){if(top<viewport.top+12)scroller.scrollTop+=top-viewport.top-12;else if(bottom>viewport.bottom-12)scroller.scrollTop+=bottom-viewport.bottom+12}else if(bottom-top<screenHeight-safeTop-166){scroller.scrollTop+=top-safeTop}}
  document.body.append(menu);activeMenu=menu;menu.background=[document.querySelector('.app')||$('taskList')].filter(Boolean).map(element=>({element,inert:element.inert}));for(const node of menu.background)node.element.inert=true;
  updateMenu(menu,button);makeFocus(menu);positionMenu(menu);ignoreScrollUntil=performance.now()+100;
  if(motionEnabled()&&menu.animate)menu.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:360,delay:60,easing:'cubic-bezier(.2,.8,.25,1)',fill:'both'});
  menu.querySelector('[aria-checked=true]')?.focus({preventScroll:true});
 }
 function updateMenu(menu,button){
  menu.routeTrigger=button;menu.routeControls=button.closest('.okti-route-controls');menu.dataset.risk=button.dataset.risk;
  for(const trigger of menu.routeControls?.querySelectorAll('button')||[]){trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-controls',menu.id)}
  const mode=button.dataset.routeMode||'drive',label=button.dataset.routeDuration||'Liczymy…';menu.querySelector('.okti-route-detail-icon').innerHTML=svg(mode);menu.querySelector('.okti-route-detail-duration').textContent=label;
  for(const option of menu.querySelectorAll('[role=radio]')){const selected=option.dataset.mode===mode;option.setAttribute('aria-checked',String(selected));option.tabIndex=selected?0:-1}
 }
 function positionMenu(menu){
  const target=taskCard(menu.routeTo.id),origin=taskCard(menu.routeFrom.id);if(!target||!origin)return;
  const box=target.getBoundingClientRect(),first=origin.getBoundingClientRect(),view=window.visualViewport,leftEdge=view?.offsetLeft||0,topEdge=view?.offsetTop||0,width=view?.width||window.innerWidth,height=view?.height||window.innerHeight;
  const app=document.querySelector('.app')?.getBoundingClientRect();menu.style.width=Math.min(300,Math.max(240,(app?.width||width)-24))+'px';const mw=menu.offsetWidth,mh=menu.offsetHeight;
  let top=box.bottom+10;if(top+mh>topEdge+height-10){const before=Math.min(first.top,box.top)-mh-10;top=before>=topEdge+10?before:topEdge+height-mh-10}
  menu.style.left=Math.max(leftEdge+10,Math.min(leftEdge+width-mw-10,box.right-mw))+'px';menu.style.top=Math.max(topEdge+10,top)+'px';
 }
 function draw(){
  const timeline=document.querySelector('#taskList .phone-timeline');if(!timeline||!timeline.clientWidth){closeMenu(false,true);return}
  timeline.querySelectorAll('.okti-route-lines,.okti-route-nodes,.okti-route-controls,.okti-route-badge').forEach(node=>node.remove());
  const cards=[...timeline.querySelectorAll('.phone-event')].map(node=>({node,task:tasks.find(task=>String(task.id)===node.dataset.eventId)})).filter(item=>item.task).sort((a,b)=>phoneMinutes(a.task.time)-phoneMinutes(b.task.time));
  for(const card of cards){card.node.nextElementSibling?.classList.remove('has-inline-route');card.node.nextElementSibling?.removeAttribute('data-route-layout')}
  const located=cards.filter(card=>plannerLocation(card.task)),bounds=timeline.getBoundingClientRect();let menuTrigger=null;
  for(let i=0;i<located.length-1;i++){
   const a=located[i],b=located[i+1];if(plannerLocationKey(plannerLocation(a.task))===plannerLocationKey(plannerLocation(b.task)))continue;
   const key=pairKey(a.task,b.task),mode=saved[key] in icons?saved[key]:'drive',state=routes.get(cacheKey(key,mode,a.task,b.task));if(state?.hidden)continue;
   const rect=b.node.getBoundingClientRect(),layout=rect.width>=250?'wide':rect.width>=105?'narrow':'compact',gap=availableGap(a.task,b.task,cards.map(card=>card.task)),ready=Number.isFinite(state?.minutes),busy=!state||state.pending,label=ready?durationLabel(state.minutes):state?.error?'Brak trasy':'Liczymy…',risk=ready?(state.minutes>gap?'late':state.minutes+10>gap?'tight':'safe'):state?.error?'error':'tight';
   const controls=document.createElement('div');controls.className='okti-route-controls';controls.dataset.layout=layout;controls.dataset.destinationEventId=String(b.task.id);controls.dataset.risk=risk;
   const controlWidth=layout==='wide'?108:layout==='narrow'?Math.min(102,rect.width-10):Math.max(40,rect.width-8),controlHeight=layout==='compact'?70:44;
   controls.style.width=controlWidth+'px';controls.style.height=controlHeight+'px';controls.style.left=(layout==='wide'?rect.right-bounds.left-controlWidth-8:rect.left-bounds.left+(rect.width-controlWidth)/2)+'px';controls.style.top=(layout==='wide'?rect.top-bounds.top+(rect.height-controlHeight)/2+5:rect.bottom-bounds.top-controlHeight-4)+'px';
   const modeButton=document.createElement('button');modeButton.type='button';modeButton.className='okti-route-badge';modeButton.innerHTML=busy?'<span class="okti-route-spinner" aria-hidden="true"></span>':svg(mode);
   const duration=document.createElement('button');duration.type='button';duration.className='okti-route-duration';duration.textContent=label;
   for(const button of [modeButton,duration]){button.dataset.destinationEventId=String(b.task.id);button.dataset.risk=risk;button.dataset.routeMode=mode;button.dataset.routeDuration=label;button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');button.setAttribute('aria-label',names[mode]+', '+label+'. Dojazd z '+a.task.title+' do '+b.task.title+'. '+(button===modeButton?'Zmień środek transportu':'Pokaż szczegóły dojazdu'));button.disabled=!!busy;button.onclick=event=>{event.stopPropagation();showModes(key,a.task,b.task,button)}}
   duration.title=state?.error?state.error:risk==='late'?'Za mało czasu na dojazd':risk==='tight'?'Mały zapas czasu':'Dojazd z poprzedniego wydarzenia';controls.append(modeButton,duration);timeline.append(controls);
   const copy=b.node.nextElementSibling;if(copy?.matches('.phone-event-title')){copy.classList.add('has-inline-route');copy.dataset.routeLayout=layout}
   if(activeMenu?.dataset.routeKey===key){menuTrigger=activeMenu.routeTrigger?.classList.contains('okti-route-duration')?duration:modeButton;activeMenu.routeFrom=a.task;activeMenu.routeTo=b.task}if(!state)setTimeout(()=>calculate(key,a.task,b.task,mode),0);
  }
  if(activeMenu){if(menuTrigger){updateMenu(activeMenu,menuTrigger);refreshFocus(activeMenu);positionMenu(activeMenu)}else closeMenu(false,true)}
 }
 window.flushPlannerRouteLayout=()=>{closeMenu(false,true);draw()};
 function queue(){cancelAnimationFrame(frame);frame=requestAnimationFrame(draw)}
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&activeMenu){event.preventDefault();event.stopPropagation();closeMenu(true)}},true);
 document.addEventListener('scroll',event=>{if(activeMenu&&performance.now()>=ignoreScrollUntil&&!activeMenu.contains(event.target))closeMenu()},true);
 document.addEventListener('pointerdown',event=>{if(activeMenu&&!activeMenu.contains(event.target)&&!activeMenu.routeControls?.contains(event.target)&&!event.target.closest?.('.okti-route-focus'))closeMenu(true)},true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)closeMenu(false,true)});
 const observer=new MutationObserver(records=>{if(records.some(record=>record.target===$('taskList')||[...record.addedNodes].some(node=>node.classList?.contains('phone-timeline-scroll'))))queue()});observer.observe($('taskList'),{childList:true,subtree:true});
 window.addEventListener('resize',()=>{closeMenu(false,true);queue()});window.visualViewport?.addEventListener('resize',()=>{closeMenu(false,true);queue()});if(typeof ResizeObserver==='function')new ResizeObserver(queue).observe($('taskList'));queue();
})();
