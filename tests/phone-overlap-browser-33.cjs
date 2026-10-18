const {chromium}=require(process.env.PLANNER_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

const records=[
 {id:'anchor',title:'Duże wydarzenie',date:'2026-10-12',time:'10:00',endTime:'15:00'},
 {id:'a',title:'Konsultacja A',date:'2026-10-12',time:'12:00',endTime:'12:20',location:'Rynek 1'},
 {id:'b',title:'Spotkanie B',date:'2026-10-12',time:'12:10',endTime:'12:35'},
 {id:'c',title:'Rozmowa C',date:'2026-10-12',time:'12:20',endTime:'12:45'},
 {id:'d',title:'Konsultacja D',date:'2026-10-12',time:'14:00',endTime:'14:30'},
 {id:'solo',title:'Osobne wydarzenie',date:'2026-10-12',time:'16:00',endTime:'16:25'}
];
const epsilon=.6;
const intersects=(a,b)=>a.left<b.right-epsilon&&b.left<a.right-epsilon&&a.top<b.bottom-epsilon&&b.top<a.bottom-epsilon;
const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<=epsilon,`${message}: ${actual} ≈ ${expected}`);
const within=(inner,outer,message)=>assert.ok(inner.left>=outer.left-epsilon&&inner.right<=outer.right+epsilon&&inner.top>=outer.top-epsilon&&inner.bottom<=outer.bottom+epsilon,`${message}: ${JSON.stringify({inner,outer})}`);

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLANNER_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
 const errors=[];
 try{
  for(const width of [320,390,430]){
   const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1,timezoneId:'Europe/Berlin',reducedMotion:'reduce'});
   page.on('pageerror',error=>errors.push(`${width}px: ${error.message}`));
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin==='https://planner.test'){
     const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
     const file=path.resolve(name),types={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.woff2':'font/woff2','.png':'image/png'};
     if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/json'});
    }
    if(route.request().resourceType()==='script')return route.fulfill({body:'',contentType:'application/javascript'});
    return route.fulfill({json:{requiresAccess:false,protocolVersion:2,apiVersion:'2026.10.08.33.14-test'}});
   });
   await page.goto('https://planner.test');await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(fixture=>{
    selected=new Date('2026-10-12T12:00:00');tasks=fixture;
    ideas=[{id:'reminder',title:'Przypomnienie',text:'Przypomnienie',alarm:{date:'2026-10-12',time:'12:15',message:'Przypomnienie'}}];
    renderAll();showView('day');
   },records);
   await page.locator('.phone-event[data-event-id="solo"]').waitFor();
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const measureRendered=()=>page.evaluate(()=>{
    const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const clip=(a,b)=>({left:Math.max(a.left,b.left),right:Math.min(a.right,b.right),top:Math.max(a.top,b.top),bottom:Math.min(a.bottom,b.bottom),width:Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)),height:Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))});
    const events=[...document.querySelectorAll('.phone-event')].map(card=>{
     const title=card.nextElementSibling,heading=title.querySelector('.phone-event-title-text'),time=title.querySelector('.phone-event-time'),pin=time.querySelector('.phone-event-location-icon');
     const headingPaint=clip(rect(heading),rect(title));
     const timeNodes=[],walker=document.createTreeWalker(time,NodeFilter.SHOW_TEXT);let node;
     while(node=walker.nextNode())if(node.textContent.trim())timeNodes.push(node);
     const times=timeNodes.flatMap(node=>{const range=document.createRange();range.selectNodeContents(node);return [...range.getClientRects()].filter(r=>r.width>0&&r.height>0).map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}))});
     const titleStyle=getComputedStyle(title),timeStyle=getComputedStyle(time),headingStyle=getComputedStyle(heading);
     return {id:card.dataset.eventId,card:rect(card),title:rect(title),heading:headingPaint,headingText:heading.textContent,time:rect(time),times,timeText:time.textContent,pin:pin?rect(pin):null,z:Number(getComputedStyle(card).zIndex),titleZ:Number(titleStyle.zIndex),headingVisible:headingStyle.visibility!=='hidden'&&headingStyle.display!=='none',timeVisible:timeStyle.visibility!=='hidden'&&timeStyle.display!=='none'};
    });
    const bell=document.querySelector('.phone-bell');
    return {events,timeline:rect(document.querySelector('.phone-timeline')),bell:bell?rect(bell):null,segments:[...document.querySelectorAll('.phone-reminder-segment')].map(rect),overflow:document.documentElement.scrollWidth>innerWidth};
   });
   const measured=await measureRendered();
   const byId=Object.fromEntries(measured.events.map(event=>[event.id,event]));
   const prefix=`${width}px`;
   assert.equal(measured.overflow,false,`${prefix}: no horizontal page overflow`);
   assert.equal(measured.events.length,records.length);
   assert.ok(measured.segments.some(segment=>segment.width>=11&&segment.left>=measured.timeline.right-56-epsilon&&segment.right<=measured.bell.left+epsilon),`${prefix}: the reminder connector retains visible space beside the bell`);
   for(const segment of measured.segments)for(const event of measured.events)assert.ok(!intersects(segment,event.card),`${prefix}: reminder connector stays clear of ${event.id}'s card`);
   near(byId.a.card.left,byId.c.card.left,`${prefix}: C immediately reuses A's left position at 12:20`);
   near(byId.a.card.width,byId.c.card.width,`${prefix}: the reused position retains its width`);
   assert.ok(!intersects(byId.a.card,byId.b.card),`${prefix}: simultaneous A/B cards do not cover each other`);
   assert.ok(!intersects(byId.c.card,byId.b.card),`${prefix}: simultaneous C/B cards do not cover each other`);
   near(byId.d.card.left,byId.anchor.card.left+16,`${prefix}: D uses the first inset position inside the long event`);
   assert.ok(byId.d.card.width>byId.a.card.width+20,`${prefix}: D takes the wider available position`);
   near(byId.solo.card.left,byId.anchor.card.left,`${prefix}: the isolated short event starts normally at the left`);
   near(byId.solo.card.width,byId.anchor.card.width,`${prefix}: the isolated short event uses standard width`);
   for(const id of ['a','b','c','d'])assert.ok(byId[id].card.left>=byId.anchor.card.left+16-epsilon,`${prefix}: ${id} keeps 16px from the long event's purple left edge`);
   for(const event of measured.events){
    assert.ok(event.card.right<=measured.timeline.right-56+epsilon,`${prefix}: ${event.id} leaves the reminder gutter free`);
    assert.ok(event.card.right<=measured.bell.left-12+epsilon,`${prefix}: ${event.id} leaves room beside the bell`);
    assert.ok(event.headingVisible&&event.heading.width>0&&event.heading.height>=15,`${prefix}: ${event.id} has a visible title row`);
    assert.ok(event.timeVisible&&event.time.width>0&&event.time.height>=10,`${prefix}: ${event.id} has a visible time row`);
    assert.ok(event.times.length>=1,`${prefix}: ${event.id} has a complete time range`);
    within(event.title,event.card,`${prefix}: ${event.id} title container stays inside its card`);
    within(event.heading,event.card,`${prefix}: ${event.id} painted title stays inside its card`);
    within(event.time,event.card,`${prefix}: ${event.id} time row stays inside its card`);
    for(const timeRect of event.times){
     within(timeRect,event.time,`${prefix}: ${event.id} entire hour range remains readable`);
     assert.ok(!intersects(event.heading,timeRect),`${prefix}: ${event.id} title and hours use separate rows`);
    }
    if(event.id!=='anchor')assert.ok(event.card.height>=48-epsilon,`${prefix}: ${event.id} is at least 48px high`);
    if(event.pin){
     assert.ok(event.pin.width>=9&&event.pin.height>=9,`${prefix}: location icon is visible`);
     within(event.pin,event.time,`${prefix}: location icon fits in the time row`);
     for(const timeRect of event.times)assert.ok(!intersects(event.pin,timeRect),`${prefix}: location icon and hours do not overlap`);
    }
   }
   assert.ok(byId.a.pin,`${prefix}: A renders its location icon`);
   assert.equal(byId.a.timeText,'12:00–12:20');
   assert.equal(byId.b.timeText,'12:10–12:35');
   assert.equal(byId.c.timeText,'12:20–12:45');
   // Test the rendered text areas, including unequal event durations and exact-end reuse.
   // A higher foreground card must never conceal any part of another event's painted text.
   for(let i=0;i<measured.events.length;i++)for(let j=i+1;j<measured.events.length;j++){
    const a=measured.events[i],b=measured.events[j];
    const aText=[a.heading,...a.times,...(a.pin?[a.pin]:[])],bText=[b.heading,...b.times,...(b.pin?[b.pin]:[])];
    for(const aRect of aText)for(const bRect of bText)assert.ok(!intersects(aRect,bRect),`${prefix}: ${a.id}/${b.id} visible title, hours and icon rectangles do not intersect`);
   }
   for(const event of measured.events)for(const other of measured.events){
    if(event.id===other.id||other.z<=event.titleZ)continue;
    for(const textRect of [event.heading,...event.times,...(event.pin?[event.pin]:[])])assert.ok(!intersects(textRect,other.card),`${prefix}: higher card ${other.id} cannot hide ${event.id}'s visible text`);
   }
   if(process.env.PLANNER_PHONE_SCREENSHOT){
    await page.locator('#taskList').evaluate(node=>node.scrollTop=120);
    await page.screenshot({path:path.resolve(process.env.PLANNER_PHONE_SCREENSHOT,`phone-overlap-33-${width}.png`)});
   }
   // A long card with no safe header gap falls back to ordinary columns. Check
   // actual glyph widths in the tight three-column case, not estimated metrics.
   await page.evaluate(()=>{
    tasks=[{id:'dense-large',title:'Duże wydarzenie',date:'2026-10-12',time:'10:00',endTime:'11:01'},
     {id:'dense-a',title:'Konsultacja A',date:'2026-10-12',time:'10:00',endTime:'10:30',location:'Rynek 1'},
     {id:'dense-b',title:'Spotkanie B',date:'2026-10-12',time:'10:25',endTime:'10:55'},
     {id:'dense-c',title:'Rozmowa C',date:'2026-10-12',time:'10:55',endTime:'11:00'}];
    ideas=[];renderAll();showView('day');
   });
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const dense=await measureRendered();
   for(const event of dense.events){
    assert.ok(event.headingVisible&&event.heading.width>0&&event.heading.height>=15,`${prefix}: dense ${event.id} has visible title text`);
    assert.ok(event.times.length>0,`${prefix}: dense ${event.id} has visible hours`);
    within(event.title,event.card,`${prefix}: dense ${event.id} title wrapper stays inside its card`);
    for(const timeRect of event.times)within(timeRect,event.time,`${prefix}: dense ${event.id} complete hour fragments remain readable`);
    if(event.pin){within(event.pin,event.time,`${prefix}: dense location icon fits its row`);for(const timeRect of event.times)assert.ok(!intersects(event.pin,timeRect),`${prefix}: dense location icon and hours remain separate`)}
    assert.ok(event.card.right<=dense.timeline.right-56+epsilon,`${prefix}: dense ${event.id} preserves the reminder gutter`);
   }
   assert.ok(dense.events.find(event=>event.id==='dense-a').pin,`${prefix}: dense A has its location icon`);
   for(let i=0;i<dense.events.length;i++)for(let j=i+1;j<dense.events.length;j++){
    const a=dense.events[i],b=dense.events[j];
    assert.ok(!intersects(a.title,b.title),`${prefix}: dense ${a.id}/${b.id} text wrappers remain separate`);
    assert.ok(!intersects(a.title,b.card)&&!intersects(b.title,a.card),`${prefix}: dense ${a.id}/${b.id} cards cannot conceal text`);
   }
   await page.close();
  }
  assert.deepEqual(errors,[],'No browser JavaScript errors');
  console.log('Phone overlap browser: 320px, 390px, 430px; actual card/text rectangles, full time ranges and location icon including dense three-column fallback, left-slot reuse, normal standalone width, 16px anchor inset, 48px minimum height and reminder gutter passed.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
