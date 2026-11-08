const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="taskList"><div class="phone-timeline"></div></div>',{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
let spacing=95,width=350,positions=null,minutes=18;
const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
const records=step=>Array.from({length:5},(_,i)=>({id:'chain-'+i,title:'Spotkanie '+i,location:'Miejsce '+i,date:'2026-11-07',time:clock(9*60+i*step),endTime:clock(9*60+i*step+30)}));
w.tasks=records(60);w.$=id=>d.getElementById(id);w.matchMedia=()=>({matches:true});w.plannerLocation=t=>t.location||'';w.plannerLocationKey=s=>s.trim().toLowerCase();w.phoneMinutes=s=>Number(s.slice(0,2))*60+Number(s.slice(3));w.plannerApiRequest=async()=>({route:{available:true,durationMinutes:minutes}});
Object.defineProperties(w.HTMLElement.prototype,{clientWidth:{get(){return width}},scrollHeight:{get(){return 900}},offsetWidth:{get(){return this.classList.contains('okti-route-badge')?44:244}},offsetHeight:{get(){return 44}}});
w.HTMLElement.prototype.getBoundingClientRect=function(){const i=w.tasks.findIndex(t=>String(t.id)===this.dataset.eventId),left=i>=0?70:parseFloat(this.style.left)||0,top=i>=0?(positions?.[i]??100+i*spacing):parseFloat(this.style.top)||0,height=i>=0?48:44,right=i>=0?width-65:left+44;return {x:left,y:top,left,top,right,bottom:top+height,width:right-left,height}};
const timeline=d.querySelector('.phone-timeline');
function render(){timeline.replaceChildren(...w.tasks.map(t=>{const n=d.createElement('button');n.className='phone-event';n.dataset.eventId=t.id;return n}));w.dispatchEvent(new w.Event('resize'))}
render();w.eval(fs.readFileSync('travel-routes.js','utf8'));
const until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error('Route chain did not settle')};
// Verify the rendered connection graph independently of its internal merger.
function verifyNoDuplicateStrokes(){
 const segments=[...d.querySelectorAll('.okti-route-lines path')].map(path=>{
  const match=path.getAttribute('d').match(/^M ([\d.]+) ([\d.]+) ([HV]) ([\d.]+)$/);assert.ok(match,'Each drawn stroke is an orthogonal segment');
  const [,x,y,axis,end]=match;return {axis,fixed:Number(axis==='H'?y:x),from:Number(axis==='H'?x:y),to:Number(end)};
 });
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
  const a=segments[i],b=segments[j];if(a.axis!==b.axis||Math.abs(a.fixed-b.fixed)>.01)continue;
  assert.ok(Math.min(a.to,b.to)<=Math.max(a.from,b.from)+.01,'Collinear strokes never repaint one another or fill the dash gaps');
 }
}
(async()=>{try{
 for(const mobileWidth of [320,390,430])for(const adjacent of [false,true]){
  width=mobileWidth-25;spacing=adjacent?50:95;w.tasks=records(adjacent?30:60);const before=JSON.stringify(w.tasks);render();
  await until(()=>d.querySelectorAll('.okti-route-badge:not(:disabled)').length===4);
  const svg=d.querySelector('.okti-route-lines'),spokes=[...d.querySelectorAll('.okti-route-spoke')],badges=[...d.querySelectorAll('.okti-route-badge')];
  assert.equal(d.querySelectorAll('.okti-route-lines').length,1,'One shared drawing layer');assert.equal(svg.dataset.anchorCount,'5');
  assert.equal(spokes.length,5,'Five meetings have five connections, not eight separate endpoints');
  assert.deepEqual(spokes.map(n=>n.dataset.eventIds).sort(),w.tasks.map(t=>t.id).sort());
  assert.equal(d.querySelectorAll('.okti-route-rail').length,1,'Adjacent legs share one dashed rail');
  assert.equal(d.querySelectorAll('.okti-route-lines circle,.okti-route-nodes').length,0,'No duplicate decorative circles');
  verifyNoDuplicateStrokes();
  for(const path of svg.querySelectorAll('path')){assert.equal(path.getAttribute('stroke-dasharray'),'3 4');assert.ok(Number.isFinite(Number(path.getAttribute('stroke-dashoffset'))))}
  for(let i=0;i<badges.length;i++){
   const r=badges[i].getBoundingClientRect();assert.ok(r.left>=width-65&&r.right<=width,'Touch targets remain outside event cards');
   const center=r.top+r.height/2;assert.ok(center>100+i*spacing+24&&center<100+(i+1)*spacing+24,'The icon remains between its two meetings');
   if(i)assert.ok(r.top>=badges[i-1].getBoundingClientRect().bottom,'Adjacent events keep separate touch targets');
   assert.equal(badges[i].textContent.replace(/!/g,''),'','Minutes and hours are hidden on the collapsed button');assert.equal(badges[i].querySelectorAll('.okti-route-clock').length,0);
  }
  for(let i=0;i<3;i++)w.flushPlannerRouteLayout();assert.equal(d.querySelectorAll('.okti-route-spoke').length,5);assert.equal(d.querySelectorAll('.okti-route-rail').length,1);assert.equal(JSON.stringify(w.tasks),before,'Event times and duration are preserved');
 }
 minutes=73;w.tasks=records(30).map(t=>({...t,id:'long-'+t.id}));render();await until(()=>d.querySelectorAll('.okti-route-badge:not(:disabled)').length===4);
 assert.equal(d.querySelectorAll('.okti-side-warning').length,4,'Insufficient time receives a yellow warning');
 for(const badge of d.querySelectorAll('.okti-route-badge'))assert.equal(badge.textContent,'!','Even an hour-long trip has no visible duration until tapped');
 d.querySelector('.okti-route-badge').click();const menu=d.querySelector('.okti-route-menu');assert.equal(menu.querySelector('.okti-route-detail-duration').textContent,'1 h 13 min');assert.equal(menu.querySelectorAll('[role=radio]').length,4);
 assert.equal(menu.querySelectorAll('[data-mode=walk] svg circle').length,10,'The walking icon has two sets of five toes');
 menu.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 positions=[100,100,150,150,200];w.tasks=records(30).map(t=>({...t,id:'overlap-'+t.id}));render();await until(()=>d.querySelectorAll('.okti-route-badge:not(:disabled)').length===4);
 assert.equal(d.querySelector('.okti-route-lines').dataset.anchorCount,'5');assert.equal(d.querySelectorAll('.okti-route-spoke').length,3,'Coincident event rows share their horizontal stroke too');assert.equal(d.querySelectorAll('.okti-route-rail').length,1);verifyNoDuplicateStrokes();
 const ids=[...d.querySelectorAll('.okti-route-spoke')].flatMap(n=>n.dataset.eventIds.split(','));assert.equal(new Set(ids).size,5,'Merged strokes retain all five event associations');
 console.log('Route chains: 320/390/430px, gaps and adjacent events, one shared dashed connection per event, overlapping stroke union, separate icon-only touch targets, footprint toes, yellow warnings, tap-only 1 h 13 min and unchanged times passed (DOM geometry/routes fixtures).');
}finally{dom.window.close()}})().catch(e=>{console.error(e);process.exitCode=1});
