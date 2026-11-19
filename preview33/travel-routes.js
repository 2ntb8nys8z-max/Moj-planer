// Route controls belong to the destination event; only the inspected pair is connected.
(()=>{
 const style=document.createElement('style');style.textContent=`
 .phone-travel-animation{display:none!important}
 .phone-event-title.has-inline-route:not([data-card-layout=rows])[data-route-layout=wide]{padding-right:112px}
 .okti-route-controls{position:absolute;z-index:26;display:flex;flex-direction:row-reverse;align-items:center;gap:3px;box-sizing:border-box;color:#526477;touch-action:pan-y;pointer-events:none}
 #taskList .okti-route-controls button{pointer-events:auto}
 .okti-route-controls button{-webkit-tap-highlight-color:transparent;touch-action:pan-y;font-family:var(--okti-font,sans-serif)}
 .okti-route-badge{position:relative;display:grid;place-items:center;flex:none;width:44px;min-width:44px;height:44px;padding:0;border:0;border-radius:9px;background:transparent;color:#465f70!important;box-shadow:none}
 .okti-route-badge:before{content:'';position:absolute;inset:5px;border:1px solid #b9c8ce;border-top-color:#fff;border-left-color:#e5edf0;border-radius:7px;background:linear-gradient(145deg,#fff 12%,#fdfefe 62%,#edf1f2);box-shadow:inset 0 1px 2px #fff,inset 0 -2px 1px #a9b8c342,1px 4px 2px -1px #32495738,1px 7px 9px -3px #3249572e;transition:transform 160ms ease,box-shadow 160ms ease}
 .okti-route-badge:active:before{transform:translateY(2px);box-shadow:inset 0 1px 2px #263a4d15,0 1px 2px #263a4d19}
 .okti-route-badge>svg{position:relative;width:26px;height:26px}.okti-route-badge>.okti-route-spinner{position:relative}
 .okti-route-duration{min-width:0;min-height:44px;padding:0 2px;border:0;border-radius:4px;box-shadow:none;background:transparent!important;color:#526477;font-size:13px;line-height:17px;font-weight:700;text-align:right;white-space:normal}
 .okti-route-controls[data-risk=late] .okti-route-duration{color:#ac5147}.okti-route-controls[data-risk=tight] .okti-route-duration{color:#97723f}
 .okti-route-controls[data-layout=compact]{flex-direction:column;gap:0}.okti-route-controls[data-layout=compact] .okti-route-duration{min-height:30px;font-size:12px;line-height:15px;text-align:center}
 .okti-route-controls[data-layout=narrow] .okti-route-duration{font-size:12px;line-height:16px}.okti-route-controls button:focus-visible{outline:2px solid #bd882a;outline-offset:1px}
 .okti-route-focus{position:fixed;inset:0;z-index:24990;pointer-events:none}
 .okti-route-scrim{position:absolute;inset:0;pointer-events:auto;background:#29323e00;backdrop-filter:blur(0);-webkit-backdrop-filter:blur(0);transition:background-color 520ms cubic-bezier(.4,0,.2,1),backdrop-filter 520ms cubic-bezier(.4,0,.2,1),-webkit-backdrop-filter 520ms cubic-bezier(.4,0,.2,1)}
 .okti-route-focus[data-state=open] .okti-route-scrim{background:#29323e24;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
 .okti-route-focus-copy{position:absolute;pointer-events:none!important;margin:0!important;transform:none!important;transition:none!important;animation:none!important}
 .okti-route-focus-copy.phone-event-title{color:#173b5b}.okti-route-focus-copy.okti-calendar-card{outline:1px solid #c58e2733;outline-offset:0}
 .okti-route-focus-lines{position:absolute;inset:0;overflow:visible;z-index:5;pointer-events:none;transition:opacity 420ms ease}
 .okti-route-focus-lines{color:var(--okti-route-accent,#4d95c3)}
 .okti-route-person{position:absolute;width:32px;height:40px;overflow:hidden;z-index:6;pointer-events:none;visibility:hidden}
 .okti-route-person img{display:block;width:1568px;height:40px;max-width:none;transform:translateX(-1536px)}
 .okti-route-person.is-ready{visibility:visible}
 @media(prefers-reduced-motion:no-preference){
  .okti-route-person.is-ready{animation:okti-person-approach .8s ease-out both}
  .okti-route-person.is-ready img{animation:okti-person-poses 1.6s steps(48,end) both}
 }
 @keyframes okti-person-approach{from{transform:translateX(-26px)}to{transform:none}}
 @keyframes okti-person-poses{from{transform:translateX(0)}to{transform:translateX(-1536px)}}
 .okti-route-solid{fill:none;stroke:currentColor;stroke-width:6.6;stroke-linecap:round}
 .okti-route-particle,.okti-route-dot{fill:currentColor}
 .okti-route-ring{fill:#fbfcfe;stroke:currentColor;stroke-width:2.2}
 .okti-route-halo{fill:none;stroke:currentColor;stroke-width:1.5}
 /* 1.5 s travel, then 3 s from arrival to the next departure. */
 .okti-route-streak,.okti-route-arrival-light{opacity:0}
 @media(prefers-reduced-motion:no-preference){
  .okti-route-focus-lines[data-state=complete] .okti-route-streak{animation:okti-route-glide 4.5s linear infinite}
  .okti-route-focus-lines[data-state=complete] .okti-route-arrival-light{animation:okti-route-arrival 4.5s linear infinite}
 }
 @keyframes okti-route-glide{
  0%{transform:translateY(0);opacity:0}
  4%{opacity:1}
  33.3333%{transform:translateY(var(--okti-route-length));opacity:1}
  36%,100%{transform:translateY(var(--okti-route-length));opacity:0}
 }
 @keyframes okti-route-arrival{
  0%,33.3333%,52%,100%{opacity:0}
  36%,39%{opacity:1}
 }
 .okti-route-focus[data-state=closing] .okti-route-focus-lines{opacity:0}.okti-route-focus[data-state=closing] .okti-route-focus-copy{opacity:0;transition:opacity 520ms ease!important}
 .okti-route-menu{position:fixed;z-index:25000;box-sizing:border-box;width:300px;max-width:calc(100vw - 20px);padding:10px;display:flex;flex-direction:column;gap:7px;border:1px solid #dadddf;border-top-color:#fff;border-radius:10px;background:linear-gradient(150deg,#fff,#fcfcfc);color:#193b5c;font-family:var(--okti-font,sans-serif);box-shadow:inset 0 1px 1px #fff,0 14px 32px -12px #1f30435c,0 3px 8px #26394b20}
 .okti-route-detail{min-height:35px;display:flex;align-items:center;gap:10px;padding:0 3px}.okti-route-detail-icon{display:grid;place-items:center;color:#69727c}.okti-route-detail-icon svg{width:30px;height:30px}
 .okti-route-detail-icon svg[data-transport]{width:36px;height:36px}
 .okti-route-detail-duration{font-size:23px;line-height:1.2;font-weight:800;color:var(--okti-route-accent,#4d95c3)}.okti-route-close{margin-left:auto;flex:none;width:36px;height:36px;padding:0;border:0;border-radius:5px;background:transparent;color:#193b5c;font-size:27px;line-height:1;box-shadow:none}
 .okti-route-options{display:flex;gap:4px;align-items:stretch;border-top:1px solid #e2e6e8;padding-top:7px}
 .okti-route-options button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;flex:1;min-width:0;min-height:54px;padding:4px 1px;border:1px solid transparent;border-radius:7px;background:transparent;color:#193b5c;box-shadow:none;touch-action:manipulation}
 .okti-route-options button[aria-checked=true]{border-color:var(--okti-route-accent,#4d95c3);background:color-mix(in srgb,var(--okti-route-accent,#4d95c3) 10%,#fff);color:var(--okti-route-accent,#4d95c3)}.okti-route-options svg{width:26px;height:26px}.okti-route-options [data-mode=drive] svg{width:44px;height:44px}.okti-route-options [data-mode=transit] svg{width:42px;height:42px}.okti-route-options [data-mode=bicycle] svg{width:38px;height:38px}.okti-route-menu button:focus-visible{outline:2px solid var(--okti-route-accent,#4d95c3);outline-offset:1px}
 .okti-route-spinner{width:14px;height:14px;border:2px solid #d4d9dd;border-top-color:#7c8994;border-radius:50%;animation:okti-route-spin .7s linear infinite}@keyframes okti-route-spin{to{transform:rotate(360deg)}}
 @media(prefers-reduced-motion:reduce){.okti-route-scrim,.okti-route-focus-lines,.okti-route-focus-copy{transition:none!important}.okti-route-spinner{animation:none}}
 `;document.head.append(style);
 const icons={
  drive:'<path d="m5 8 1.5-4h11L19 8"/><rect x="3" y="8" width="18" height="11" rx="3"/><path d="M6 19v2m12-2v2M7 15h.01M17 15h.01M10 16h4"/>',
  walk:'<g fill="currentColor" stroke="none"><g transform="rotate(-10 6 15)"><g transform="translate(1.5 6)"><circle cx="6.7" cy="1.8" r="1.4"/><circle cx="4.1" cy="1.5" r="1"/><circle cx="2.1" cy="2.3" r=".9"/><circle cx=".9" cy="3.8" r=".75"/><circle cx=".6" cy="5.6" r=".6"/><path d="M4.7 4.3C2.6 4.4 1.2 6.1 1.5 8.2c.2 1.8 1.4 2.6 1.7 4.4.2 1.3-.3 2.4.2 3.6.4 1 1.1 1.4 2.1 1.3 1.3-.1 1.9-.9 1.7-2.1-.1-1.6-1-2.4-.7-4 .3-1.6 1.6-2.6 1.5-4.4-.1-1.8-1.4-2.9-3.3-2.7Z"/></g></g><g transform="rotate(10 18 8)"><g transform="translate(22 0) scale(-1 1)"><circle cx="6.7" cy="1.8" r="1.4"/><circle cx="4.1" cy="1.5" r="1"/><circle cx="2.1" cy="2.3" r=".9"/><circle cx=".9" cy="3.8" r=".75"/><circle cx=".6" cy="5.6" r=".6"/><path d="M4.7 4.3C2.6 4.4 1.2 6.1 1.5 8.2c.2 1.8 1.4 2.6 1.7 4.4.2 1.3-.3 2.4.2 3.6.4 1 1.1 1.4 2.1 1.3 1.3-.1 1.9-.9 1.7-2.1-.1-1.6-1-2.4-.7-4 .3-1.6 1.6-2.6 1.5-4.4-.1-1.8-1.4-2.9-3.3-2.7Z"/></g></g></g>',
  bicycle:'<circle cx="5" cy="17" r="4"/><circle cx="19" cy="17" r="4"/><path d="m5 17 5-9 5 9H5m5-9h7l2 9M8 5h4m4-2h3l1 4"/>',
  transit:'<rect x="5" y="2" width="14" height="18" rx="3"/><path d="M5 12h14M8 5h8M8 20l-2 2m10-2 2 2M9 16h.01M15 16h.01"/>'};
 const names={drive:'Samochód',walk:'Pieszo',bicycle:'Rower',transit:'Komunikacja'};
 const iconBase=new URL('.',document.currentScript?.src||location.href),iconAssets={drive:'porsche',bicycle:'road-bike',transit:'bus'};let iconSerial=0;
 const svg=mode=>{
  if(!iconAssets[mode])return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[mode]+'</svg>';
  const id='okti-route-icon-'+(++iconSerial),asset=new URL('assets/transport/'+iconAssets[mode]+'-33-314.webp',iconBase).href;
  return `<svg viewBox="0 0 24 24" data-transport="${mode}" aria-hidden="true"><defs><mask id="${id}" x="0" y="0" width="24" height="24" maskUnits="userSpaceOnUse" style="mask-type:alpha"><image href="${asset}" width="24" height="24" preserveAspectRatio="xMidYMid meet"/></mask></defs><rect width="24" height="24" fill="currentColor" mask="url(#${id})"/></svg>`;
 };
 const modeKey='okti-route-modes-v1';let saved={};try{saved=JSON.parse(localStorage.getItem(modeKey)||'{}');if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={}}catch(_){}
 const routes=new Map(),inflight=new Map(),closing=new Set();let frame=0,activeMenu=null,menuSerial=0;
 const pairKey=(from,to)=>String(from.id)+'→'+String(to.id),cacheKey=(key,mode,from,to)=>JSON.stringify([key,mode,...[from,to].map(task=>[plannerLocationKey(plannerLocation(task)),task.googlePlace?.placeId||''])]);
 const motionEnabled=()=>!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const taskCard=id=>[...document.querySelectorAll('#taskList .phone-event')].find(node=>node.dataset.eventId===String(id));
 function durationLabel(minutes){const hours=Math.floor(minutes/60),rest=minutes%60;return hours?hours+' h'+(rest?' '+rest+' min':''):minutes+' min'}
 function stopConnection(menu){cancelAnimationFrame(menu.routeFrame);menu.routeFrame=0}
 function cleanup(menu){stopConnection(menu);clearTimeout(menu.closeTimer);menu.focusLayer?.remove();menu.remove();closing.delete(menu)}
 function closeMenu(restoreFocus=false,immediate=false){
  if(immediate)for(const menu of [...closing])cleanup(menu);
  const menu=activeMenu;if(!menu)return;activeMenu=null;stopConnection(menu);
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
 function readRoute(from,to,mode){const value=routes.get(cacheKey(pairKey(from,to),mode,from,to));return value&&Number.isFinite(value.minutes)&&Date.now()-value.at<15*60000?{...value}:null}
 async function calculate(key,from,to,mode,origin){
  const cache=cacheKey(key,mode,from,to);if(inflight.has(cache))return inflight.get(cache);routes.set(cache,{pending:true});queue();
  const work=(async()=>{
   try{const result=await plannerApiRequest('/routes/compute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({origin:origin||from.deviceOrigin||plannerLocation(from),destination:plannerLocation(to),mode:mode.toUpperCase()})});routes.set(cache,result.route?.available?{minutes:result.route.durationMinutes,distanceMeters:result.route.distanceMeters,at:Date.now()}:from.deviceOrigin?{error:'Brak trasy',at:Date.now()}:{hidden:true})}
   catch(error){routes.set(cache,{error:error.message||'Błąd trasy',at:Date.now()})}
   finally{inflight.delete(cache);queue()}return routes.get(cache);
  })();inflight.set(cache,work);return work;
 }
 function availableGap(from,to,events){let cursor=phoneMinutes(from.endTime||from.time),best=0;const end=phoneMinutes(to.time);for(const task of events){if(task===from||task===to||phoneMinutes(task.time)>=end||phoneMinutes(task.endTime||task.time)<=cursor)continue;const start=phoneMinutes(task.time);best=Math.max(best,start-cursor);cursor=Math.max(cursor,phoneMinutes(task.endTime||task.time))}return Math.max(0,best,end-cursor)}
 function cloneSurface(node,layer,z){
  if(!node)return;const box=node.getBoundingClientRect(),copy=node.cloneNode(true),prefix='route-focus-'+menuSerial+'-'+layer.children.length+'-';
  const ids=new Map();for(const element of [copy,...copy.querySelectorAll('*')]){if(element.id){ids.set(element.id,prefix+element.id);element.id=prefix+element.id}element.removeAttribute('data-event-id');element.removeAttribute('aria-controls');element.removeAttribute('aria-expanded');element.removeAttribute('tabindex')}
  for(const element of [copy,...copy.querySelectorAll('*')])for(const attribute of [...element.attributes]){let value=attribute.value;for(const [old,id] of ids)value=value.replaceAll('url(#'+old+')','url(#'+id+')').replaceAll('"#'+old+'"','"#'+id+'"');if(attribute.name==='href'&&ids.has(value.slice(1)))value='#'+ids.get(value.slice(1));if(value!==attribute.value)element.setAttribute(attribute.name,value)}
  copy.classList.remove('okti-key-pressed','okti-key-moving','okti-event-created');copy.classList.add('okti-route-focus-copy');copy.inert=true;
  Object.assign(copy.style,{left:box.left+'px',top:box.top+'px',width:box.width+'px',height:box.height+'px',maxHeight:'none',right:'auto',bottom:'auto',zIndex:String(z)});layer.append(copy);
 }
 const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
 const smooth=value=>{const t=clamp(value);return t*t*(3-2*t)};
 function settleConnection(menu){
  const drawing=menu.routeDrawing;if(!drawing)return;
  drawing.svg.dataset.state='complete';drawing.line.style.strokeDasharray='none';drawing.line.style.strokeDashoffset='0';drawing.line.style.opacity='.9';
  for(const point of drawing.points){point.dot.style.opacity='1';point.dot.setAttribute('r','4.5');point.ring.style.opacity='1';point.ring.style.strokeDasharray='none';point.ring.style.strokeDashoffset='0';point.halo.setAttribute('opacity','0')}
  for(const particle of drawing.particles)particle.setAttribute('opacity','0');
 }
 function paintConnection(menu,elapsed){
  const drawing=menu.routeDrawing,geometry=menu.routeGeometry;if(!drawing||!geometry)return;
  const flowStart=650,flowDuration=2200,arrivalTime=flowStart+flowDuration/1.36,progress=clamp((elapsed-flowStart)/flowDuration)*1.36;
  const front=clamp(progress-.36);drawing.line.style.strokeDasharray='1';drawing.line.style.strokeDashoffset=String(1-front);drawing.line.style.opacity=front>0?'.9':'0';
  drawing.points.forEach((point,index)=>{
   const ringProgress=index?clamp((elapsed-arrivalTime-50)/430):clamp((elapsed-216)/432);
   point.ring.style.opacity=String(clamp(ringProgress*4));point.ring.style.strokeDasharray='1';point.ring.style.strokeDashoffset=String(1-ringProgress);
   point.dot.style.opacity=String(index?smooth((progress-.98)/.035):clamp(elapsed/216));point.dot.setAttribute('r',String(index?3.3+1.2*smooth((progress-1)/.06):4.5));
   const haloTime=index?(elapsed-flowStart-flowDuration)/500:(elapsed-96)/768,p=clamp(haloTime);
   point.halo.setAttribute('r',String(11+p*12));point.halo.setAttribute('opacity',haloTime>=0&&haloTime<=1?String((1-p)*.45):'0');
  });
  drawing.particles.forEach((particle,index)=>{
   const position=progress-index*.09,visible=position>0&&position<1;particle.setAttribute('opacity',visible?'.9':'0');if(!visible)return;
   const x=geometry.x1+(geometry.x2-geometry.x1)*position,y=geometry.y1+(geometry.y2-geometry.y1)*position;
   particle.setAttribute('transform',`translate(${x} ${y}) rotate(${geometry.angle})`);
   const rear=index/(drawing.particles.length-1),stretch=Math.max(3.3,Math.min(11,.09*geometry.length*.5));particle.setAttribute('ry',String(3.3+(stretch-3.3)*rear*rear));
  });
 }
 function startConnection(menu){
  stopConnection(menu);if(!motionEnabled()){settleConnection(menu);return}
  menu.routeStarted=performance.now()+(menu.routePerson?1600:0);menu.routeDrawing.svg.dataset.state='drawing';paintConnection(menu,0);
  const tick=now=>{if(activeMenu!==menu)return;const elapsed=now-menu.routeStarted;paintConnection(menu,elapsed);if(elapsed<3400)menu.routeFrame=requestAnimationFrame(tick);else{menu.routeFrame=0;settleConnection(menu)}};
  menu.routeFrame=requestAnimationFrame(tick);
 }
 function refreshFocus(menu,animate=false){
  const from=taskCard(menu.routeFrom.id),to=taskCard(menu.routeTo.id);if((!from&&!menu.routeFrom.deviceOrigin)||!to)return false;
  const layer=menu.focusLayer;layer.querySelectorAll('.okti-route-focus-copy').forEach(node=>node.remove());
  for(const card of [from,to].filter(Boolean)){cloneSurface(card,layer,2);if(card.nextElementSibling?.matches('.phone-event-title'))cloneSurface(card.nextElementSibling,layer,6);const controls=[...document.querySelectorAll('#taskList .okti-route-controls')].find(node=>node.dataset.destinationEventId===card.dataset.eventId);cloneSurface(controls,layer,6)}
  const b=to.getBoundingClientRect(),x2=b.left+b.width/2,y2=b.top+b.height/2;
  const a=from?.getBoundingClientRect(),x1=a?a.left+a.width/2:x2;
  const y1=a?a.top+a.height/2:Math.max((window.visualViewport?.offsetTop||0)+22,b.top-58);
  if(menu.routePerson){menu.routePerson.style.left=(x1-46)+'px';menu.routePerson.style.top=(y1-20)+'px'}
  menu.routeGeometry={x1,y1,x2,y2,length:Math.hypot(x2-x1,y2-y1),angle:Math.atan2(y2-y1,x2-x1)*180/Math.PI-90};
  const accent=getComputedStyle(to).getPropertyValue('--key-rim-deep').trim()||getComputedStyle(to).getPropertyValue('--key-rim').trim()||'#4d95c3';
  menu.style.setProperty('--okti-route-accent',accent);layer.style.setProperty('--okti-route-accent',accent);
  const drawing=menu.routeDrawing;drawing.line.setAttribute('d',`M ${x1} ${y1} L ${x2} ${y2}`);
  drawing.points[0].group.setAttribute('transform',`translate(${x1} ${y1})`);drawing.points[1].group.setAttribute('transform',`translate(${x2} ${y2})`);
  drawing.beam.setAttribute('transform',`translate(${x1} ${y1}) rotate(${menu.routeGeometry.angle})`);
  drawing.beam.style.setProperty('--okti-route-length',menu.routeGeometry.length+'px');
  if(menu.waitForPerson)return true;
  if(animate)startConnection(menu);else if(menu.routeFrame)paintConnection(menu,performance.now()-menu.routeStarted);else settleConnection(menu);
  return true;
 }
 let nextActor=0;
 function makeFocus(menu){
  const layer=document.createElement('div');layer.className='okti-route-focus';layer.dataset.state='opening';layer.setAttribute('aria-hidden','true');
  const scrim=document.createElement('div');scrim.className='okti-route-scrim';scrim.onpointerdown=event=>{event.preventDefault();closeMenu(true)};layer.append(scrim);
  const drawing=document.createElementNS('http://www.w3.org/2000/svg','svg');drawing.classList.add('okti-route-focus-lines');drawing.setAttribute('width','100%');drawing.setAttribute('height','100%');
  const node=(name,className,attributes={})=>{const element=document.createElementNS(drawing.namespaceURI,name);element.setAttribute('class',className);for(const [key,value] of Object.entries(attributes))element.setAttribute(key,String(value));return element};
  const line=node('path','okti-route-solid',{pathLength:1});drawing.append(line);
  const particles=Array.from({length:5},()=>{const particle=node('ellipse','okti-route-particle',{rx:3.3,ry:3.3,opacity:0});drawing.append(particle);return particle});
  const points=Array.from({length:2},()=>{const group=node('g','okti-route-point'),halo=node('circle','okti-route-halo',{r:11,opacity:0}),ring=node('circle','okti-route-ring',{r:11,pathLength:1}),dot=node('circle','okti-route-dot',{r:4.5});group.append(halo,ring,dot);drawing.append(group);return {group,halo,ring,dot}});
  const glowId='okti-route-light-'+menuSerial;
  const defs=node('defs',''),glow=node('radialGradient','',{id:glowId});
  for(const [offset,colour,opacity] of [['0%','#fffef2',1],['32%','#fff4c9',.96],['67%','#ffd687',.62],['100%','#ffd687',0]]){
   glow.append(node('stop','',{offset,'stop-color':colour,'stop-opacity':opacity}));
  }
  defs.append(glow);drawing.prepend(defs);
  const light='url(#'+glowId+')',beam=node('g',''),streak=node('g','okti-route-streak');
  streak.append(node('ellipse','',{cy:-5.5,rx:4.6,ry:10,fill:light}),node('ellipse','',{rx:3.3,ry:3.8,fill:light}));
  beam.append(streak);drawing.append(beam);
  const arrival=node('g','okti-route-arrival-light');
  arrival.append(node('circle','',{r:16,fill:light}),node('circle','',{r:11,fill:'none',stroke:'#ffe2a5','stroke-width':2.2}),node('circle','',{r:4.5,fill:'#fff4cd'}));
  points[1].group.append(arrival);
  menu.routeDrawing={svg:drawing,line,particles,points,beam};layer.append(drawing);
  menu.focusLayer=layer;
  if(menu.routeFrom.deviceOrigin){
   const person=document.createElement('div'),image=new Image();person.className='okti-route-person';
   image.alt='';menu.routePerson=person;menu.waitForPerson=true;drawing.style.visibility='hidden';
   person.append(image);layer.append(person);
   const reveal=loaded=>{
    if(activeMenu!==menu)return;
    menu.waitForPerson=false;drawing.style.visibility='';
    if(loaded)person.classList.add('is-ready');else{person.remove();menu.routePerson=null}
    refreshFocus(menu,true);
   };
   image.onload=()=>reveal(true);image.onerror=()=>reveal(false);
   const actor=['hiker','dancer'][nextActor++%2];
   image.src=new URL('assets/transport/'+actor+'-walk-v1.webp',iconBase).href;
  }
  document.body.append(layer);refreshFocus(menu,true);
  requestAnimationFrame(()=>{if(activeMenu===menu)layer.dataset.state='open'});
 }
 function showModes(key,from,to,button){
  if(activeMenu?.dataset.routeKey===key){closeMenu(true);return}closeMenu(false,true);
  const menu=document.createElement('div');menu.className='okti-route-menu';menu.id='okti-route-menu-'+(++menuSerial);menu.dataset.routeKey=key;menu.dataset.state='open';menu.routeFrom=from;menu.routeTo=to;
  menu.setAttribute('role','dialog');menu.setAttribute('aria-modal','true');menu.setAttribute('aria-label','Dojazd z '+from.title+' do '+to.title);menu.setAttribute('aria-describedby',menu.id+'-summary');
  const summary=document.createElement('div');summary.className='okti-route-detail';summary.id=menu.id+'-summary';summary.setAttribute('aria-live','polite');summary.innerHTML='<span class="okti-route-detail-icon" aria-hidden="true"></span><strong class="okti-route-detail-duration"></strong>';
  const close=document.createElement('button');close.type='button';close.className='okti-route-close';close.textContent='×';close.setAttribute('aria-label','Zamknij dojazd');close.onclick=()=>closeMenu(true);summary.append(close);menu.append(summary);
  const options=document.createElement('div');options.className='okti-route-options';options.setAttribute('role','radiogroup');options.setAttribute('aria-label','Wybierz środek transportu');menu.append(options);
  for(const mode of Object.keys(icons)){const option=document.createElement('button');option.type='button';option.dataset.mode=mode;option.setAttribute('role','radio');option.setAttribute('aria-label',names[mode]);option.innerHTML=svg(mode);option.onclick=event=>{event.stopPropagation();if(mode===(saved[key]||'drive'))return;saved[key]=mode;try{localStorage.setItem(modeKey,JSON.stringify(saved))}catch(_){}calculate(key,menu.routeFrom,menu.routeTo,mode)};options.append(option)}
  options.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;const buttons=[...options.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);if(index<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length;buttons[next].focus({preventScroll:true});buttons[next].click()};
  menu.onkeydown=event=>{if(event.key!=='Tab')return;const buttons=[close,...options.querySelectorAll('[aria-checked=true]')];if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons.at(-1).focus()}else if(!event.shiftKey&&document.activeElement===buttons.at(-1)){event.preventDefault();close.focus()}};
  document.body.append(menu);activeMenu=menu;menu.background=[document.querySelector('.app')||$('taskList')].filter(Boolean).map(element=>({element,inert:element.inert}));for(const node of menu.background)node.element.inert=true;
  updateMenu(menu,button);positionMenu(menu);makeFocus(menu);
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
  const target=taskCard(menu.routeTo.id);if(!target)return;
  const view=window.visualViewport,leftEdge=view?.offsetLeft||0,topEdge=view?.offsetTop||0,width=view?.width||window.innerWidth,height=view?.height||window.innerHeight;
  const app=document.querySelector('.app')?.getBoundingClientRect();menu.style.width=Math.min(300,Math.max(240,(app?.width||width)-24))+'px';menu.style.maxHeight=Math.max(60,height-20)+'px';menu.style.overflowY='auto';const mw=menu.offsetWidth,mh=menu.offsetHeight;
  let box=target.getBoundingClientRect();const overflow=box.bottom+10+mh-(topEdge+height-10),scroller=$('taskList');
  if(overflow>0&&scroller){
   // The end of the day needs scroll room too. This changes only the visible
   // timeline's tail; event dates and the piecewise time axis remain intact.
   const missing=Math.max(0,overflow-(scroller.scrollHeight-scroller.clientHeight-scroller.scrollTop)),timeline=target.closest('.phone-timeline');
   if(missing>0&&timeline)timeline.style.height=(Math.max(parseFloat(timeline.style.height)||0,timeline.scrollHeight)+missing+2)+'px';
   scroller.scrollTop+=overflow;box=target.getBoundingClientRect();
  }
  menu.style.left=Math.max(leftEdge+10,Math.min(leftEdge+width-mw-10,box.right-mw))+'px';menu.style.top=(box.bottom+10)+'px';
  // Ignore delayed scroll events only while they still describe this exact
  // programmatic position. A real user scroll changes it and closes the menu.
  menu.anchorScroll=scroller?{element:scroller,top:scroller.scrollTop,left:scroller.scrollLeft}:null;
 }

 function draw(){
  const timeline=document.querySelector('#taskList .phone-timeline');if(!timeline||!timeline.clientWidth){closeMenu(false,true);return}
  timeline.querySelectorAll('.okti-route-lines,.okti-route-nodes,.okti-route-controls,.okti-route-badge').forEach(node=>node.remove());
  const cards=[...timeline.querySelectorAll('.phone-event')].map(node=>({node,task:tasks.find(task=>String(task.id)===node.dataset.eventId)})).filter(item=>item.task).sort((a,b)=>phoneMinutes(a.task.time)-phoneMinutes(b.task.time));
  for(const card of cards){const copy=card.node.nextElementSibling;copy?.classList.remove('has-inline-route');copy?.removeAttribute('data-route-layout');const clock=copy?.querySelector?.('.phone-event-time');if(clock)clock.style.maxWidth=''}
  const located=cards.filter(card=>plannerLocation(card.task)),bounds=timeline.getBoundingClientRect();let menuTrigger=null;
  const now=new Date(),todayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const first=located[0],usePhone=first && new Date(first.task.date+'T00:00')>=todayStart;
  const weather=usePhone&&window.OktiLocalWeather?.snapshot(),fix=weather?.place;
  const fresh=weather?.enabled && Number.isFinite(fix?.latitude) && Number.isFinite(fix?.longitude) && Date.now()-fix.checkedAt<900000;
  const device={task:{id:'@device',title:'Moja lokalizacja',location:fresh?fix.latitude+','+fix.longitude:'',deviceOrigin:fresh?{latitude:fix.latitude,longitude:fix.longitude}:null}};
  if(usePhone && weather?.enabled && !fresh && !weather.busy && !weather.error)window.OktiLocalWeather.refresh();
  for(let i=0;i<located.length;i++){
   const b=located[i],firstTrip=usePhone && i===0,a=firstTrip?device:located[i-1];
   if(!a || (!firstTrip && plannerLocationKey(plannerLocation(a.task))===plannerLocationKey(plannerLocation(b.task))))continue;
   const needsFix=firstTrip&&!fresh,key=pairKey(a.task,b.task),mode=saved[key] in icons?saved[key]:'drive',state=routes.get(cacheKey(key,mode,a.task,b.task));
   if(state?.hidden)continue;
   const rect=b.node.getBoundingClientRect();if(rect.width<44)continue;const layout=rect.width>=220?'wide':rect.width>=105?'narrow':'compact',gap=firstTrip?(new Date(b.task.date+'T'+b.task.time)-now)/60000:availableGap(a.task,b.task,cards.map(card=>card.task)),ready=Number.isFinite(state?.minutes),busy=needsFix?!!weather?.busy:!state||state.pending,label=needsFix?(weather?.busy?'Ustalam…':weather?.enabled?'Odśwież GPS':'Włącz GPS'):ready?durationLabel(state.minutes):state?.error?'Brak trasy':'Liczymy…',risk=ready&&firstTrip&&gap<=0?'safe':ready?(state.minutes>gap?'late':state.minutes+10>gap?'tight':'safe'):state?.error?'error':'tight';
   const controls=document.createElement('div');controls.className='okti-route-controls';controls.dataset.layout=layout;controls.dataset.destinationEventId=String(b.task.id);controls.dataset.risk=risk;
   const inset=Math.min(8,Math.max(0,(rect.width-44)/2)),controlWidth=layout==='wide'?Math.min(144,Math.max(96,rect.width-116)):layout==='compact'?Math.min(76,rect.width-inset*2):Math.min(104,rect.width-inset*2),controlHeight=layout==='compact'?74:44;
   controls.style.width=controlWidth+'px';controls.style.height=controlHeight+'px';controls.style.left=(rect.right-bounds.left-controlWidth-inset)+'px';controls.style.top=(rect.bottom-bounds.top-controlHeight-6)+'px';
   const caption=b.node.nextElementSibling,clock=caption?.querySelector?.('.phone-event-time');if(caption?.dataset.cardLayout==='rows'&&clock){clock.style.maxWidth=Math.max(44,rect.width-17-controlWidth-inset-6)+'px';const line=clock.getBoundingClientRect();controls.style.top=(line.top-bounds.top+(line.height-controlHeight)/2)+'px';}
   const modeButton=document.createElement('button');modeButton.type='button';modeButton.className='okti-route-badge';modeButton.innerHTML=busy?'<span class="okti-route-spinner" aria-hidden="true"></span>':svg(mode);
   const displayMinutes=ready?Math.round(state.minutes):0,duration=document.createElement('button');duration.type='button';duration.className='okti-route-duration';duration.textContent=layout==='compact'&&ready&&displayMinutes>=60?Math.floor(displayMinutes/60)+':'+String(displayMinutes%60).padStart(2,'0'):label;
   for(const button of [modeButton,duration]){button.dataset.destinationEventId=String(b.task.id);button.dataset.risk=risk;button.dataset.routeMode=mode;button.dataset.routeDuration=label;button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');button.setAttribute('aria-label',names[mode]+', '+label+'. Dojazd z '+a.task.title+' do '+b.task.title+'. '+(button===modeButton?'Zmień środek transportu':'Pokaż szczegóły dojazdu'));button.disabled=!!busy;button.onclick=event=>{event.stopPropagation();showModes(key,a.task,b.task,button)}}
   if(needsFix){
    const action=weather?.enabled?'Odśwież położenie telefonu':'Udostępnij położenie';
    for(const button of [modeButton,duration]){
     button.setAttribute('aria-label',action+'. Dojazd do '+b.task.title);
     button.onclick=event=>{event.stopPropagation();if(weather?.enabled)window.OktiLocalWeather.refresh(true,{freshGPS:true});else window.OktiPermissions?.open()};
    }
   }
   duration.title=state?.error?state.error:risk==='late'?'Za mało czasu na dojazd':risk==='tight'?'Mały zapas czasu':(a.task.deviceOrigin?'Dojazd z mojej lokalizacji':'Dojazd z poprzedniego wydarzenia');controls.append(modeButton,duration);timeline.append(controls);
   const copy=b.node.nextElementSibling;if(copy?.matches('.phone-event-title')){copy.classList.add('has-inline-route');copy.dataset.routeLayout=layout}
   if(!needsFix&&activeMenu?.dataset.routeKey===key){menuTrigger=activeMenu.routeTrigger?.classList.contains('okti-route-duration')?duration:modeButton;activeMenu.routeFrom=a.task;activeMenu.routeTo=b.task}if(!needsFix&&!state)setTimeout(()=>calculate(key,a.task,b.task,mode),0);
  }
  if(activeMenu){if(menuTrigger){updateMenu(activeMenu,menuTrigger);positionMenu(activeMenu);refreshFocus(activeMenu)}else closeMenu(false,true)}
 }
 window.flushPlannerRouteLayout=()=>{closeMenu(false,true);draw()};
 window.OktiTravelRoutes={
  get:readRoute,
  mode(from,to){if(!from)from=tasks.filter(t=>t!==to&&t.date===to.date&&t.time&&t.time<to.time&&plannerLocation(t)).sort((a,b)=>a.time.localeCompare(b.time)).at(-1);const value=from?saved[pairKey(from,to)]:null;return value in icons?value:'drive'},
  async ensure(from,to,{mode='drive',origin}={}){if(!(mode in icons))mode='drive';return readRoute(from,to,mode)||calculate(pairKey(from,to),from,to,mode,origin)}
 };
 function queue(){cancelAnimationFrame(frame);frame=requestAnimationFrame(draw)}
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&activeMenu){event.preventDefault();event.stopPropagation();closeMenu(true)}},true);
 document.addEventListener('scroll',event=>{if(!activeMenu||activeMenu.contains(event.target))return;const own=activeMenu.anchorScroll;if(event.target===own?.element&&Math.abs(own.element.scrollTop-own.top)<1&&Math.abs(own.element.scrollLeft-own.left)<1)return;closeMenu()},true);
 document.addEventListener('pointerdown',event=>{if(activeMenu&&!activeMenu.contains(event.target)&&!activeMenu.routeControls?.contains(event.target)&&!event.target.closest?.('.okti-route-focus'))closeMenu(true)},true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)closeMenu(false,true)});
 window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change',()=>{if(activeMenu&&!motionEnabled()){stopConnection(activeMenu);settleConnection(activeMenu)}});
 const observer=new MutationObserver(records=>{if(records.some(record=>record.target===$('taskList')||[...record.addedNodes].some(node=>node.classList?.contains('phone-timeline-scroll'))))queue()});observer.observe($('taskList'),{childList:true,subtree:true});
 window.addEventListener('okti-local-weather',queue);
 window.addEventListener('resize',()=>{closeMenu(false,true);queue()});window.visualViewport?.addEventListener('resize',()=>{closeMenu(false,true);queue()});if(typeof ResizeObserver==='function')new ResizeObserver(queue).observe($('taskList'));queue();
})();
