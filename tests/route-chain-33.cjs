const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<main class="app"><div id="taskList"><div class="phone-timeline"></div></div></main>',{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
let spacing=140,width=350,columns=1,minutes=18;
const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
const records=step=>Array.from({length:5},(_,i)=>({id:'chain-'+i,title:'Spotkanie '+i,location:'Miejsce '+i,date:'2026-11-07',time:clock(9*60+i*step),endTime:clock(9*60+i*step+30)}));
w.tasks=records(60);w.$=id=>d.getElementById(id);w.matchMedia=()=>({matches:true});w.plannerLocation=t=>t.location||'';w.plannerLocationKey=s=>s.trim().toLowerCase();w.phoneMinutes=s=>Number(s.slice(0,2))*60+Number(s.slice(3));w.plannerApiRequest=async()=>({route:{available:true,durationMinutes:minutes}});
Object.defineProperties(w.HTMLElement.prototype,{clientWidth:{get(){return width}},scrollHeight:{get(){return 1400}},offsetWidth:{get(){return this.classList.contains('okti-route-badge')?48:244}},offsetHeight:{get(){return this.classList.contains('okti-route-menu')?126:44}}});
w.HTMLElement.prototype.getBoundingClientRect=function(){
 const i=w.tasks.findIndex(t=>String(t.id)===this.dataset.eventId),cardWidth=(width-66)/columns-4;
 const left=i>=0?70+(i%columns)*(width-66)/columns:parseFloat(this.style.left)||0,top=i>=0?100+Math.floor(i/columns)*spacing:parseFloat(this.style.top)||0,height=i>=0?(columns===1?182:columns===2?192:224):this.offsetHeight,rectWidth=i>=0?cardWidth:parseFloat(this.style.width)||this.offsetWidth;
 return {x:left,y:top,left,top,right:left+rectWidth,bottom:top+height,width:rectWidth,height};
};
const timeline=d.querySelector('.phone-timeline');
function render(){timeline.replaceChildren(...w.tasks.map(t=>{const n=d.createElement('button');n.className='phone-event okti-calendar-card';n.dataset.eventId=t.id;return n}));w.dispatchEvent(new w.Event('resize'))}
render();w.eval(fs.readFileSync('travel-routes.js','utf8'));
const until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error('Route chain did not settle')};
(async()=>{try{
 for(const mobileWidth of [320,390,430])for(const laneCount of [1,2,3]){
  width=mobileWidth-25;columns=laneCount;spacing=laneCount===1?90:180;w.tasks=records(30);const before=JSON.stringify(w.tasks);render();
  await until(()=>d.querySelectorAll('#taskList .okti-route-badge:not(:disabled)').length===4);
  assert.equal(d.querySelectorAll('.okti-route-lines,.okti-route-focus-lines').length,0,'Idle calendar has no route strokes');
  const controls=[...d.querySelectorAll('#taskList .okti-route-controls')];assert.equal(controls.length,4);
  for(let i=0;i<controls.length;i++){
   const control=controls[i],destination=w.tasks[i+1],card=d.querySelector(`[data-event-id="${destination.id}"]`).getBoundingClientRect(),box=control.getBoundingClientRect(),badge=control.querySelector('.okti-route-badge'),time=control.querySelector('.okti-route-duration');
   assert.equal(control.dataset.destinationEventId,destination.id);assert.equal(badge.textContent,'');assert.equal(time.textContent,'18 min');assert.equal(badge.offsetWidth,48);
   assert.ok(box.left>=card.left-.01&&box.right<=card.right+.01&&box.top>=card.top-.01&&box.bottom<=card.bottom+.01,'Icon and separate time remain within their destination card');
   assert.match(badge.getAttribute('aria-label'),new RegExp('Dojazd z Spotkanie '+i+' do Spotkanie '+(i+1)));
  }
  // Inspect one leg: only its real origin/destination are sharp, with one center-to-center line.
  controls[1].querySelector('.okti-route-duration').click();const panel=d.querySelector('.okti-route-menu[data-state=open]'),focus=d.querySelector('.okti-route-focus');assert(panel&&focus);assert.equal(d.querySelector('.app').inert,true);
  const a=d.querySelector('[data-event-id="chain-1"]').getBoundingClientRect(),b=d.querySelector('[data-event-id="chain-2"]').getBoundingClientRect();
  assert.equal(focus.querySelectorAll('.phone-event').length,2);assert.equal(focus.querySelectorAll('.okti-route-focus-lines path').length,1);assert.equal(focus.querySelectorAll('.okti-route-focus-lines circle').length,2);
  assert.equal(focus.querySelector('.okti-route-focus-lines path').getAttribute('d'),`M ${a.left+a.width/2} ${a.top+a.height/2} L ${b.left+b.width/2} ${b.top+b.height/2}`);
  assert.equal(panel.querySelectorAll('[role=radio]').length,4);assert.equal(panel.querySelector('.okti-route-detail-duration').textContent,'18 min');assert.equal(panel.querySelector('.okti-route-detail-mode'),null);
  panel.querySelector('.okti-route-close').click();assert.equal(d.querySelector('.okti-route-focus'),null);assert.equal(!!d.querySelector('.app').inert,false);
  for(let i=0;i<3;i++)w.flushPlannerRouteLayout();assert.equal(d.querySelectorAll('#taskList .okti-route-controls').length,4);assert.equal(JSON.stringify(w.tasks),before,'Times, durations and itinerary are unchanged');
 }
 minutes=73;columns=1;w.tasks=records(30).map(t=>({...t,id:'late-'+t.id}));render();await until(()=>d.querySelectorAll('.okti-route-badge:not(:disabled)').length===4);
 for(const control of d.querySelectorAll('.okti-route-controls')){assert.equal(control.dataset.risk,'late');assert.equal(control.querySelector('.okti-route-duration').textContent,'1 h 13 min')}
 // A new opening while the prior focus is fading must not leak layers or leave the app inert.
 w.matchMedia=()=>({matches:false});d.querySelector('.okti-route-badge').click();d.querySelector('.okti-route-close').click();d.querySelectorAll('#taskList .okti-route-badge')[1].click();assert.equal(d.querySelectorAll('.okti-route-focus').length,1);w.flushPlannerRouteLayout();assert.equal(d.querySelectorAll('.okti-route-focus,.okti-route-menu').length,0);assert.equal(!!d.querySelector('.app').inert,false);
 console.log('Travel focus: 320/390/430px, 1/2/3 columns, controls inside destination cards, separate duration, exact source/destination center line, four modes, inert/focus cleanup, late status and unchanged event data passed (simulated geometry/provider).');
}finally{dom.window.close()}})().catch(e=>{console.error(e);process.exitCode=1});
