// Production travel connector for consecutive located calendar events.
(()=>{
 const style=document.createElement('style');style.textContent=`
 .phone-travel-animation{display:none!important}
 .okti-route-lines{position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:24}
 .okti-route-lines path{stroke:#ac7b48;stroke-width:1.3;stroke-opacity:.88;stroke-dasharray:3 4;stroke-linejoin:round}
 .okti-route-badge,.okti-route-menu{--route-ink:#a5632c;--route-edge:#cf9a68bf}
 .okti-route-badge[data-risk=safe],.okti-route-menu[data-risk=safe]{--route-ink:#4c705d;--route-edge:#b3c6baad}
 .okti-route-badge[data-risk=late],.okti-route-menu[data-risk=late]{--route-ink:#af4b43;--route-edge:#ca8279c7}
 .okti-route-badge[data-risk=error],.okti-route-menu[data-risk=error]{--route-ink:#74695f;--route-edge:#c8c0b7b3}
 /* A 38px glass key inside a 44px touch target; the clock stays off the glyph. */
 .okti-route-badge{position:absolute;z-index:26;width:44px;min-width:44px;height:44px;padding:0;border:0;border-radius:12px;background:transparent;color:#8d572f!important;display:grid;place-items:center;touch-action:manipulation;box-shadow:none;-webkit-tap-highlight-color:transparent}
 .okti-route-badge::before{display:block;content:"";position:absolute;inset:3px;border:1px solid #c7c5bf;border-radius:11px;background:linear-gradient(140deg,#ffffff,#f8f6f2);box-shadow:inset 0 1px 1px #fff,0 3px 4px #33465126,0 1px 1px #3346511a}
 .okti-route-badge:active::before{transform:translateY(1px);box-shadow:inset 0 1px 2px #30486614,0 1px 2px #30486618}
 .okti-route-badge>svg{position:relative;width:23px;height:23px;padding:0;opacity:1}
 .okti-route-clock{position:absolute;left:-3px;top:4px;z-index:1;width:13px;height:13px;display:grid;place-items:center;background:#fffdf9;color:#8d572f;border:1px solid #bba88e;border-radius:50%;box-shadow:0 1px 2px #5f4d2426}
 .okti-route-clock svg{width:12px;height:12px}
 .okti-side-warning{position:absolute;right:0;top:0;display:grid;place-items:center;width:14px;height:14px;border:1px solid #d1a132;border-radius:50%;background:#f7d15d;color:#503d14;font:900 11px/1 system-ui;box-shadow:0 1px 2px #5f4d2426}
 .okti-route-badge>.okti-route-spinner{position:relative}
 .okti-route-badge:focus-visible{outline:2px solid var(--route-ink);outline-offset:0}
 .okti-route-menu{position:fixed;z-index:25000;box-sizing:border-box;width:244px;max-width:calc(100vw - 16px);height:auto;padding:10px;display:flex;flex-direction:column;gap:9px;align-items:stretch;border:1px solid var(--route-edge);border-radius:14px;background:linear-gradient(135deg,#fffffff9,#f5f8f7f5);color:#234253;font-family:var(--okti-font,sans-serif);box-shadow:inset 0 1px 0 #fff,0 8px 24px -10px #193c4e38,0 2px 6px #1f40571a;backdrop-filter:blur(10px) saturate(.95);-webkit-backdrop-filter:blur(10px) saturate(.95)}
 .okti-route-detail{min-height:43px;display:flex;align-items:center;gap:10px;padding:0 4px}
 .okti-route-detail-icon{color:var(--route-ink);display:grid;place-items:center;width:30px;flex:none}.okti-route-detail-icon svg{width:27px;height:27px}
 .okti-route-detail-copy{display:flex;flex-direction:column;gap:3px;min-width:0}.okti-route-detail-duration{font-size:21px;line-height:1.2;font-weight:800;color:var(--route-ink)}.okti-route-detail-mode{font-size:12px;line-height:1.25;color:#526875}
 .okti-route-options{display:flex;gap:3px;align-items:center;border-top:1px solid #dfe7e6;padding-top:7px}
 .okti-route-menu button{width:44px;height:44px;min-width:44px;flex:1;padding:0;border:0;border-radius:9px;background:transparent;color:#80684f;display:grid;place-items:center;touch-action:manipulation}.okti-route-menu button[aria-checked=true]{background:#e4eeebe6;color:#526f6d;box-shadow:inset 0 0 0 1px #b7cdc6a6}.okti-route-options svg{width:24px;height:24px}.okti-route-menu button:focus-visible{outline:2px solid #526f6d}
 .okti-route-spinner{width:15px;height:15px;border:2px solid var(--route-edge,#c8b69b);border-top-color:var(--route-ink,#886847);border-radius:50%;animation:okti-route-spin .7s linear infinite}@keyframes okti-route-spin{to{transform:rotate(360deg)}}
 `;document.head.append(style);
 const icons={
  drive:'<path d="m5 8 1.5-4h11L19 8"/><rect x="3" y="8" width="18" height="11" rx="3"/><path d="M6 19v2m12-2v2M7 15h.01M17 15h.01M10 16h4"/>',
  walk:'<g fill="currentColor" stroke="none"><g transform="rotate(-10 6 15)"><g transform="translate(1.5 6)"><circle cx="6.7" cy="1.8" r="1.4"/><circle cx="4.1" cy="1.5" r="1"/><circle cx="2.1" cy="2.3" r=".9"/><circle cx=".9" cy="3.8" r=".75"/><circle cx=".6" cy="5.6" r=".6"/><path d="M4.7 4.3C2.6 4.4 1.2 6.1 1.5 8.2c.2 1.8 1.4 2.6 1.7 4.4.2 1.3-.3 2.4.2 3.6.4 1 1.1 1.4 2.1 1.3 1.3-.1 1.9-.9 1.7-2.1-.1-1.6-1-2.4-.7-4 .3-1.6 1.6-2.6 1.5-4.4-.1-1.8-1.4-2.9-3.3-2.7Z"/></g></g><g transform="rotate(10 18 8)"><g transform="translate(22 0) scale(-1 1)"><circle cx="6.7" cy="1.8" r="1.4"/><circle cx="4.1" cy="1.5" r="1"/><circle cx="2.1" cy="2.3" r=".9"/><circle cx=".9" cy="3.8" r=".75"/><circle cx=".6" cy="5.6" r=".6"/><path d="M4.7 4.3C2.6 4.4 1.2 6.1 1.5 8.2c.2 1.8 1.4 2.6 1.7 4.4.2 1.3-.3 2.4.2 3.6.4 1 1.1 1.4 2.1 1.3 1.3-.1 1.9-.9 1.7-2.1-.1-1.6-1-2.4-.7-4 .3-1.6 1.6-2.6 1.5-4.4-.1-1.8-1.4-2.9-3.3-2.7Z"/></g></g></g>',
  bicycle:'<circle cx="5" cy="17" r="4"/><circle cx="19" cy="17" r="4"/><path d="m5 17 5-9 5 9H5m5-9h7l2 9M8 5h4m4-2h3l1 4"/>',
  transit:'<rect x="5" y="2" width="14" height="18" rx="3"/><path d="M5 12h14M8 5h8M8 20l-2 2m10-2 2 2M9 16h.01M15 16h.01"/>'};
 const names={drive:'Samochód',walk:'Pieszo',bicycle:'Rower',transit:'Komunikacja miejska'},svg=mode=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[mode]+'</svg>';
 const clock='<span class="okti-route-clock" aria-hidden="true"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="7" cy="7" r="5.5"/><path d="M7 3.8V7l2.2 1.3"/></svg></span>';
 const modeKey='okti-route-modes-v1',saved=JSON.parse(localStorage.getItem(modeKey)||'{}'),routes=new Map();let frame=0,activeMenu=null,menuSerial=0;
 const pairKey=(from,to)=>String(from.id)+'→'+String(to.id),cacheKey=(key,mode,from,to)=>JSON.stringify([key,mode,...[from,to].map(task=>[plannerLocationKey(plannerLocation(task)),task.googlePlace?.placeId||''])]);
 function geometry(first,second,width){const x=Math.max(22,width-26),start=first.top+first.height/2,end=second.top+second.height/2,y=(first.top+first.height+second.top)/2;return{x,start,end,y,firstEdge:first.right+1,secondEdge:second.right+1}}
 // Paint shared geometry once. Collinear overlapping pieces cannot fill each
 // other's dash gaps, including when multiple event anchors share a row.
 function mergeSegments(input){
  const groups=new Map();
  for(const segment of input){const fixed=Math.round(segment.fixed*100)/100,key=segment.axis+':'+fixed,item={...segment,fixed,from:Math.min(segment.from,segment.to),to:Math.max(segment.from,segment.to),ids:new Set(segment.ids||[])};if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item)}
  const result=[];
  for(const pieces of groups.values()){
   pieces.sort((a,b)=>a.from-b.from);let current=null;
   for(const piece of pieces){if(current&&piece.from<=current.to+.01){current.to=Math.max(current.to,piece.to);for(const id of piece.ids)current.ids.add(id)}else{current=piece;result.push(current)}}
  }
  return result;
 }
 function motionEnabled(){return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches}
 function closeMenu(restoreFocus=false){
  const menu=activeMenu;if(!menu)return;activeMenu=null;if(!menu.isConnected)return;
  const trigger=menu.routeTrigger;trigger?.setAttribute('aria-expanded','false');
  if(restoreFocus&&trigger?.isConnected)trigger.focus({preventScroll:true});
  const computed=getComputedStyle(menu),from={opacity:computed.opacity,transform:computed.transform};
  menu.inert=true;menu.dataset.state='closing';menu.setAttribute('aria-hidden','true');menu.style.pointerEvents='none';
  for(const animation of menu.getAnimations?.()||[])animation.cancel();
  if(!motionEnabled()||!menu.animate){menu.remove();return}
  const animation=menu.animate([from,{opacity:0,transform:'translateY(5px) scale(.92)'}],{duration:170,easing:'cubic-bezier(.4,0,.7,1)',fill:'both'});
  animation.finished.catch(()=>{}).finally(()=>menu.remove());
 }
 function durationLabel(minutes){const hours=Math.floor(minutes/60),rest=minutes%60;return hours?hours+' h'+(rest?' '+rest+' min':''):minutes+' min'}
 async function calculate(key,from,to,mode){const cache=cacheKey(key,mode,from,to);if(routes.get(cache)?.pending)return;routes.set(cache,{pending:true});queue();try{const result=await plannerApiRequest('/routes/compute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({origin:plannerLocation(from),destination:plannerLocation(to),mode:mode.toUpperCase()})});routes.set(cache,result.route?.available?{minutes:result.route.durationMinutes,distanceMeters:result.route.distanceMeters}:{hidden:true})}catch(error){routes.set(cache,{error:error.message||'Błąd trasy'})}queue()}
 function availableGap(from,to,events){
  let cursor=phoneMinutes(from.endTime||from.time),best=0;const end=phoneMinutes(to.time);
  for(const task of events){
   if(task===from||task===to||phoneMinutes(task.time)>=end||phoneMinutes(task.endTime||task.time)<=cursor)continue;
   const start=phoneMinutes(task.time);best=Math.max(best,start-cursor);cursor=Math.max(cursor,phoneMinutes(task.endTime||task.time));
  }
  return Math.max(0,best,end-cursor);
 }
 function showModes(key,from,to,button){
  if(activeMenu?.dataset.routeKey===key){closeMenu(true);return}
  closeMenu();
  const menu=document.createElement('div');menu.className='okti-route-menu';menu.id='okti-route-menu-'+(++menuSerial);menu.dataset.routeKey=key;menu.dataset.state='open';menu.routeFrom=from;menu.routeTo=to;
  menu.setAttribute('role','dialog');menu.setAttribute('aria-label','Informacje o dojeździe');menu.setAttribute('aria-describedby',menu.id+'-summary');
  const summary=document.createElement('div');summary.className='okti-route-detail';summary.id=menu.id+'-summary';summary.setAttribute('aria-live','polite');
  summary.innerHTML='<span class="okti-route-detail-icon" aria-hidden="true"></span><span class="okti-route-detail-copy"><strong class="okti-route-detail-duration"></strong><span class="okti-route-detail-mode"></span></span>';menu.append(summary);
  const options=document.createElement('div');options.className='okti-route-options';options.setAttribute('role','radiogroup');options.setAttribute('aria-label','Wybierz środek transportu');menu.append(options);
  for(const mode of Object.keys(icons)){
   const option=document.createElement('button');option.type='button';option.dataset.mode=mode;option.setAttribute('role','radio');option.setAttribute('aria-label',names[mode]);option.title=names[mode];option.innerHTML=svg(mode);
   option.onclick=event=>{event.stopPropagation();if(mode===(saved[key]||'drive'))return;saved[key]=mode;localStorage.setItem(modeKey,JSON.stringify(saved));calculate(key,menu.routeFrom,menu.routeTo,mode)};
   options.append(option);
  }
  options.onkeydown=event=>{
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
   const buttons=[...options.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);if(index<0)return;
   event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length;
   buttons[next].focus({preventScroll:true});buttons[next].click();
  };
  // The popup is outside the scrolling timetable, so a short phone viewport
  // never clips the duration or its four transport choices.
  document.body.append(menu);activeMenu=menu;updateMenu(menu,button);positionMenu(menu,button);
  if(motionEnabled()&&menu.animate)menu.animate([{opacity:0,transform:'translateY(5px) scale(.92)'},{opacity:1,transform:'none'}],{duration:240,easing:'cubic-bezier(.2,.8,.25,1)',fill:'both'});
  menu.querySelector('[aria-checked=true]')?.focus({preventScroll:true});
 }
 function updateMenu(menu,button){
  menu.routeTrigger=button;menu.dataset.risk=button.dataset.risk;
  button.setAttribute('aria-expanded','true');button.setAttribute('aria-controls',menu.id);
  const mode=button.dataset.routeMode||'drive',label=button.dataset.routeDuration||'Liczymy…',signature=mode+'|'+label;
  if(menu.dataset.summary!==signature){
   menu.querySelector('.okti-route-detail-icon').innerHTML=svg(mode);
   menu.querySelector('.okti-route-detail-duration').textContent=label;
   menu.querySelector('.okti-route-detail-mode').textContent=names[mode];menu.dataset.summary=signature;
  }
  for(const option of menu.querySelectorAll('[role=radio]')){const selected=option.dataset.mode===mode;option.setAttribute('aria-checked',String(selected));option.tabIndex=selected?0:-1}
 }
 function positionMenu(menu,button){
  const box=button.getBoundingClientRect(),view=window.visualViewport,leftEdge=view?.offsetLeft||0,topEdge=view?.offsetTop||0,width=view?.width||window.innerWidth,height=view?.height||window.innerHeight,menuWidth=menu.offsetWidth,menuHeight=menu.offsetHeight;
  const left=Math.max(leftEdge+8,Math.min(leftEdge+width-menuWidth-8,box.right-menuWidth)),above=box.bottom+8+menuHeight>topEdge+height-8&&box.top-menuHeight-8>=topEdge+8;
  menu.style.left=left+'px';menu.style.top=Math.max(topEdge+8,Math.min(topEdge+height-menuHeight-8,above?box.top-menuHeight-8:box.bottom+8))+'px';
  menu.style.transformOrigin=Math.max(12,Math.min(menuWidth-12,box.left+box.width/2-left))+'px '+(above?'100%':'0%');
 }

 function draw(){
  const timeline=document.querySelector('.phone-timeline');if(!timeline||!timeline.clientWidth)return;
  timeline.querySelectorAll('.okti-route-lines,.okti-route-nodes,.okti-route-badge').forEach(node=>node.remove());
  const cards=[...timeline.querySelectorAll('.phone-event')].map(node=>({node,task:tasks.find(task=>String(task.id)===node.dataset.eventId)})).filter(item=>item.task).sort((a,b)=>phoneMinutes(a.task.time)-phoneMinutes(b.task.time)),bounds=timeline.getBoundingClientRect(),width=timeline.clientWidth;
  const located=cards.filter(card=>plannerLocation(card.task)),markers=new Map(),railSegments=[];let menuTrigger=null,lastBadgeTop=-Infinity;
  for(let index=0;index<located.length-1;index++){
   const a=located[index],b=located[index+1],origin=plannerLocation(a.task),destination=plannerLocation(b.task);if(!origin||!destination||plannerLocationKey(origin)===plannerLocationKey(destination))continue;
   const box=node=>{const r=node.getBoundingClientRect();return{top:r.top-bounds.top,right:r.right-bounds.left,height:r.height}},g=geometry(box(a.node),box(b.node),width),key=pairKey(a.task,b.task),mode=saved[key]||'drive',state=routes.get(cacheKey(key,mode,a.task,b.task));if(state?.hidden)continue;const gap=availableGap(a.task,b.task,cards.map(card=>card.task)),risk=state?.minutes>gap?'late':state?.minutes+10>gap?'tight':state?.minutes?'safe':state?.error?'error':'tight',color={safe:'#2a9d66',tight:'#ed8b30',late:'#dc4a43',error:'#8b8178'}[risk];
   railSegments.push({axis:'V',fixed:g.x,from:g.start,to:g.end,ids:[]});
   markers.set(String(a.task.id),{edge:g.firstEdge,x:g.x,y:g.start});markers.set(String(b.task.id),{edge:g.secondEdge,x:g.x,y:g.end});
   const button=document.createElement('button');button.type='button';button.className='okti-route-badge';button.dataset.destinationEventId=String(b.task.id);button.dataset.risk=risk;button.dataset.routeMode=mode;button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');button.style.left=Math.max(4,width-48)+'px';const top=Math.max(0,g.y-22,lastBadgeTop+46);button.style.top=top+'px';lastBadgeTop=top;
   const busy=!state||state.pending,label=state?.minutes?durationLabel(state.minutes):state?.error?'Brak trasy':'Liczymy…';button.dataset.routeDuration=label;button.innerHTML=busy?'<span class="okti-route-spinner" aria-hidden="true"></span>':svg(mode)+clock+((risk==='late'||risk==='tight')&&!busy?'<span class="okti-side-warning" aria-hidden="true">!</span>':'');button.setAttribute('aria-label',busy?'Przeliczanie czasu trasy':names[mode]+', '+label+'. Dotknij, aby zobaczyć dojazd i zmienić środek transportu');button.title=state?.error?state.error:risk==='late'?'Nie zdążysz na czas':risk==='tight'?'Mały zapas czasu':'Bezpieczny zapas czasu';button.disabled=busy;button.onclick=()=>showModes(key,a.task,b.task,button);timeline.append(button);
   if(activeMenu?.dataset.routeKey===key){menuTrigger=button;activeMenu.routeFrom=a.task;activeMenu.routeTo=b.task}if(!state)setTimeout(()=>calculate(key,a.task,b.task,mode),0);
  }
  if(markers.size){
   const lines=document.createElementNS('http://www.w3.org/2000/svg','svg');lines.classList.add('okti-route-lines');lines.dataset.anchorCount=String(markers.size);lines.dataset.sharedConnectors='true';lines.setAttribute('width',String(width));lines.setAttribute('height',String(timeline.scrollHeight));lines.setAttribute('aria-hidden','true');
   const segments=[...railSegments,...[...markers].map(([id,p])=>({axis:'H',fixed:p.y,from:p.edge,to:p.x,ids:[id]}))];
   for(const segment of mergeSegments(segments)){
    const path=document.createElementNS(lines.namespaceURI,'path'),vertical=segment.axis==='V',d=vertical?`M ${segment.fixed} ${segment.from} V ${segment.to}`:`M ${segment.from} ${segment.fixed} H ${segment.to}`;
    path.classList.add(vertical?'okti-route-rail':'okti-route-spoke');if(!vertical)path.dataset.eventIds=[...segment.ids].join(',');
    for(const [name,value] of Object.entries({d,fill:'none',stroke:'#ac7b48','stroke-width':'1.3','stroke-dasharray':'3 4','stroke-dashoffset':String(segment.from%7),'stroke-linecap':'butt'}))path.setAttribute(name,value);
    lines.append(path);
   }
   timeline.append(lines);
  }
  if(activeMenu){if(menuTrigger){updateMenu(activeMenu,menuTrigger);positionMenu(activeMenu,menuTrigger)}else closeMenu()}
 }
 // Finalize the existing route presentation before an event flight measures its sheet.
 window.flushPlannerRouteLayout=()=>{closeMenu();draw()};
 function queue(){cancelAnimationFrame(frame);frame=requestAnimationFrame(draw)}
 document.addEventListener('pointerdown',event=>{if(activeMenu&&!activeMenu.contains(event.target)&&!event.target.closest?.('.okti-route-badge'))closeMenu()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&activeMenu){event.preventDefault();closeMenu(true)}});
 document.addEventListener('scroll',()=>closeMenu(),true);
 const observer=new MutationObserver(records=>{if(records.some(record=>record.target===$('taskList')||[...record.addedNodes].some(node=>node.classList?.contains('phone-timeline-scroll'))))queue()});observer.observe($('taskList'),{childList:true,subtree:true});window.addEventListener('resize',queue);if(typeof ResizeObserver==='function')new ResizeObserver(queue).observe($('taskList'));queue();
})();
