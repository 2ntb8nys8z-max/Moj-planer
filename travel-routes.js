// Production travel connector for consecutive located calendar events.
(()=>{
 const style=document.createElement('style');style.textContent=`
 .phone-travel-animation{display:none!important}
 .okti-route-lines{position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:24}
 .okti-route-badge{position:absolute;z-index:26;width:auto;min-width:84px;height:32px;padding:0 8px;border:1px solid currentColor;border-radius:11px;background:#fffaf5;color:#ed7215;display:flex;align-items:center;justify-content:center;gap:6px;touch-action:manipulation;font:700 12px/1 var(--okti-font,sans-serif);box-shadow:0 3px 9px #a957151f}
 .okti-route-badge[data-risk=safe]{color:#208454}.okti-route-badge[data-risk=late]{color:#c93631}.okti-route-badge[data-risk=error]{color:#74695f}
 .okti-route-badge svg{width:20px;height:19px;flex:none}.okti-route-badge:focus-visible{outline:2px solid #d47826;outline-offset:2px}
 .okti-route-menu{position:absolute;z-index:28;height:38px;padding:3px;display:flex;gap:2px;align-items:center;border:1px solid #f0b77f;border-radius:12px;background:#fffaf5f2;box-shadow:0 5px 18px #68411d2b;backdrop-filter:blur(8px)}
 .okti-route-menu button{width:34px;height:30px;padding:0;border:0;border-radius:9px;background:transparent;color:#b66525;display:grid;place-items:center;touch-action:manipulation}.okti-route-menu button[aria-checked=true]{background:#ffe5ca;color:#e66f12}.okti-route-menu svg{width:22px;height:21px}.okti-route-menu button:focus-visible{outline:2px solid #d47826}
 .okti-route-spinner{width:15px;height:15px;border:2px solid #f5c28f;border-top-color:#e66f12;border-radius:50%;animation:okti-route-spin .7s linear infinite}@keyframes okti-route-spin{to{transform:rotate(360deg)}}
 `;document.head.append(style);
 const icons={
  drive:'<path d="m7 10 2-5h10l2 5M5 11h18v9H5z"/><path d="M5 15H3m20 0h2M7 20v3m14-3v3"/><circle cx="8" cy="15" r="1" fill="currentColor" stroke="none"/><circle cx="20" cy="15" r="1" fill="currentColor" stroke="none"/><path d="M12 17h4"/>',
  walk:'<circle cx="16" cy="4" r="2"/><path d="m12 10 4-3 3 5 4 1M15 8l-3 8-5 7m5-7 5 2 2 6M12 10l-4 5-4-1"/>',
  transit:'<rect x="6" y="3" width="16" height="20" rx="4"/><path d="M6 13h16M10 23l-2 3m10-3 2 3M11 6h6"/><circle cx="10" cy="18" r="1"/><circle cx="18" cy="18" r="1"/>'};
 const names={drive:'Samochód',walk:'Pieszo',transit:'Komunikacja miejska'},svg=mode=>'<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[mode]+'</svg>';
 const modeKey='okti-route-modes-v1',saved=JSON.parse(localStorage.getItem(modeKey)||'{}'),routes=new Map();let frame=0,activeMenu=null;
 const pairKey=(from,to)=>String(from.id)+'→'+String(to.id),cacheKey=(key,mode,from,to)=>JSON.stringify([key,mode,...[from,to].map(task=>[plannerLocationKey(plannerLocation(task)),task.googlePlace?.placeId||''])]);
 function geometry(first,second,width){const inset=18,x=Math.max(18,Math.min(width-110,Math.min(first.right,second.right)-inset)),start=first.top+first.height/2,end=second.top+second.height/2;return{x,start,end,y:(start+end)/2,path:`M ${x} ${start} V ${end}`}}
 function closeMenu(){activeMenu?.remove();activeMenu=null}
 async function calculate(key,from,to,mode){const cache=cacheKey(key,mode,from,to);if(routes.get(cache)?.pending)return;routes.set(cache,{pending:true});queue();try{const result=await plannerApiRequest('/routes/compute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({origin:plannerLocation(from),destination:plannerLocation(to),mode:mode.toUpperCase()})});routes.set(cache,result.route?.available?{minutes:result.route.durationMinutes,distanceMeters:result.route.distanceMeters}:{hidden:true})}catch(error){routes.set(cache,{error:error.message||'Błąd trasy'})}queue()}
 function availableGap(from,to,events){
  let cursor=phoneMinutes(from.endTime||from.time),best=0;const end=phoneMinutes(to.time);
  for(const task of events){
   if(task===from||task===to||phoneMinutes(task.time)>=end||phoneMinutes(task.endTime||task.time)<=cursor)continue;
   const start=phoneMinutes(task.time);best=Math.max(best,start-cursor);cursor=Math.max(cursor,phoneMinutes(task.endTime||task.time));
  }
  return Math.max(0,best,end-cursor);
 }
 function showModes(key,from,to,button,x,y){closeMenu();const timeline=button.parentElement,menu=document.createElement('div');menu.className='okti-route-menu';menu.setAttribute('role','radiogroup');menu.setAttribute('aria-label','Wybierz środek transportu');menu.style.left=Math.max(4,x-113)+'px';menu.style.top=(y-19)+'px';for(const mode of Object.keys(icons)){const option=document.createElement('button');option.type='button';option.setAttribute('role','radio');option.setAttribute('aria-label',names[mode]);option.setAttribute('aria-checked',String(mode===(saved[key]||'drive')));option.innerHTML=svg(mode);option.onclick=event=>{event.stopPropagation();saved[key]=mode;localStorage.setItem(modeKey,JSON.stringify(saved));closeMenu();calculate(key,from,to,mode)};menu.append(option)}timeline.append(menu);activeMenu=menu;menu.querySelector('[aria-checked=true]')?.focus()}
 function draw(){
  const timeline=document.querySelector('.phone-timeline');if(!timeline||!timeline.clientWidth)return;
  closeMenu();timeline.querySelectorAll('.okti-route-lines,.okti-route-badge').forEach(node=>node.remove());
  const cards=[...timeline.querySelectorAll('.phone-event')].map(node=>({node,task:tasks.find(task=>String(task.id)===node.dataset.eventId)})).filter(item=>item.task).sort((a,b)=>phoneMinutes(a.task.time)-phoneMinutes(b.task.time)),bounds=timeline.getBoundingClientRect(),width=timeline.clientWidth;
  const located=cards.filter(card=>plannerLocation(card.task));
  for(let index=0;index<located.length-1;index++){
   const a=located[index],b=located[index+1],origin=plannerLocation(a.task),destination=plannerLocation(b.task);if(!origin||!destination||plannerLocationKey(origin)===plannerLocationKey(destination))continue;
   const box=node=>{const r=node.getBoundingClientRect();return{top:r.top-bounds.top,right:r.right-bounds.left,height:r.height}},g=geometry(box(a.node),box(b.node),width),key=pairKey(a.task,b.task),mode=saved[key]||'drive',state=routes.get(cacheKey(key,mode,a.task,b.task));if(state?.hidden)continue;const gap=availableGap(a.task,b.task,cards.map(card=>card.task)),risk=state?.minutes>gap?'late':state?.minutes+10>gap?'tight':state?.minutes?'safe':state?.error?'error':'tight',color={safe:'#2a9d66',tight:'#ed8b30',late:'#dc4a43',error:'#8b8178'}[risk];
   const lines=document.createElementNS('http://www.w3.org/2000/svg','svg');lines.classList.add('okti-route-lines');lines.setAttribute('width',String(width));lines.setAttribute('height',String(timeline.scrollHeight));lines.setAttribute('aria-hidden','true');const path=document.createElementNS(lines.namespaceURI,'path');for(const [name,value] of Object.entries({d:g.path,fill:'none',stroke:color,'stroke-width':'1.7','stroke-dasharray':'4 5','stroke-linecap':'round'}))path.setAttribute(name,value);lines.append(path);for(const cy of [g.start,g.end])for(const [r,fill] of [[8,'#fffaf5'],[4.5,color]]){const dot=document.createElementNS(lines.namespaceURI,'circle');dot.setAttribute('cx',g.x);dot.setAttribute('cy',cy);dot.setAttribute('r',r);dot.setAttribute('fill',fill);if(r===8){dot.setAttribute('stroke',color);dot.setAttribute('stroke-width','1.7')}lines.append(dot)}timeline.append(lines);
   const button=document.createElement('button');button.type='button';button.className='okti-route-badge';button.dataset.risk=risk;button.style.left=(g.x+13)+'px';button.style.top=(g.y-18)+'px';const busy=!state||state.pending,label=state?.minutes?(state.minutes>=60?Math.floor(state.minutes/60)+' godz.'+(state.minutes%60?' '+(state.minutes%60)+' min':''):state.minutes+' min'):state?.error?'Brak trasy':'Liczymy…';button.innerHTML=busy?'<span class="okti-route-spinner" aria-hidden="true"></span><span>Liczymy…</span>':svg(mode)+'<span>'+label+'</span>';button.setAttribute('aria-label',busy?'Przeliczanie czasu trasy':names[mode]+', '+label+'. Dotknij, aby zmienić środek transportu');button.title=state?.error?state.error:risk==='late'?'Nie zdążysz na czas':risk==='tight'?'Mały zapas czasu':'Bezpieczny zapas czasu';button.disabled=busy;button.onclick=()=>showModes(key,a.task,b.task,button,g.x,g.y);timeline.append(button);if(!state)setTimeout(()=>calculate(key,a.task,b.task,mode),0);
  }
 }
 function queue(){cancelAnimationFrame(frame);frame=requestAnimationFrame(draw)}
 document.addEventListener('pointerdown',event=>{if(activeMenu&&!activeMenu.contains(event.target)&&!event.target.closest?.('.okti-route-badge'))closeMenu()});
 const observer=new MutationObserver(records=>{if(records.some(record=>record.target===$('taskList')||[...record.addedNodes].some(node=>node.classList?.contains('phone-timeline-scroll'))))queue()});observer.observe($('taskList'),{childList:true,subtree:true});window.addEventListener('resize',queue);if(typeof ResizeObserver==='function')new ResizeObserver(queue).observe($('taskList'));queue();
})();
