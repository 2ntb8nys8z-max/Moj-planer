const {chromium}=require(process.env.PLANNER_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<=1,`${message}: ${a} vs ${b}`);
const apart=(a,b)=>a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLANNER_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 for(const [width,height] of [[320,568],[390,844],[430,932],[844,390]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin==='https://planner.test'){const file=path.resolve(url.pathname==='/'?'index.html':url.pathname.slice(1));if(fs.existsSync(file)&&fs.statSync(file).isFile()){const types={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.woff2':'font/woff2','.png':'image/png'};return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/json'})}}return route.fulfill({body:route.request().resourceType()==='script'?'':'{}',contentType:route.request().resourceType()==='script'?'application/javascript':'application/json'})});
  await page.goto('https://planner.test');await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{today=()=>new Date('2026-10-18T12:00:00');selected=today();monthCursor=new Date(2026,9,1);tasks=[{id:'navigation-test',title:'Test',date:'2026-10-17',time:'22:00',endTime:'23:30'}];ideas=[];renderAll();showView('day')});
  const read=()=>page.evaluate(()=>{const r=el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height}};const bar=document.querySelector('#dayView .daybar');return {prev:r(document.getElementById('prev')),next:r(document.getElementById('next')),title:r(document.getElementById('dayTitle')),app:r(document.querySelector('.app')),bubble:r(document.getElementById('todayBtn')),tab:r(document.getElementById('tabDay')),weekday:document.querySelector('.phone-day-weekday').textContent,date:document.querySelector('.phone-day-date').textContent,side:document.getElementById('todayBtn').dataset.side,overflow:document.documentElement.scrollWidth>innerWidth,barHeight:bar.getBoundingClientRect().height,taskHeight:document.getElementById('taskList').clientHeight}});
  const baseline=await read();assert.equal(baseline.weekday,'niedziela');assert.equal(baseline.date,'18 października');assert.ok(baseline.taskHeight>=40,'calendar keeps a usable scrolling region');assert.ok(baseline.barHeight<=66,'date and arrows use a compact row without the former large spacer');
  const stable=async label=>{const m=await read();assert.equal(m.overflow,false);for(const id of ['prev','next'])for(const key of ['left','top','width','height'])near(m[id][key],baseline[id][key],`${width}: ${id}.${key} stays fixed ${label} `+JSON.stringify({baseline,m}));const center=(m.app.left+m.app.right)/2,shift=m.side==='right'?-1:1;near((m.title.left+m.title.right)/2,center+(label==='away from today'?shift*(width<360?26:30):0),`${width}: date makes room for the bubble ${label}`);return m};
  await stable('on today');
  for(const [id,side] of [['next','right'],['prev','left']]){
   await page.locator('#'+id).click();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const m=await stable('away from today');assert.equal(m.side,side);assert.ok(m.bubble.width>=48);assert.ok(apart(m.bubble,m.prev)&&apart(m.bubble,m.next),'return bubble never covers either arrow target');assert.ok(apart(m.bubble,m.tab),'bubble does not cover calendar mode controls '+JSON.stringify({width,height,side,bubble:m.bubble,tab:m.tab}));
   const hit=await page.evaluate(()=>{const b=document.getElementById('todayBtn'),r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))});assert.equal(hit,true,'bubble is clickable even where it extends above the scroll region');
   if(process.env.PLANNER_EVENT_SCREENSHOT){fs.mkdirSync(process.env.PLANNER_EVENT_SCREENSHOT,{recursive:true});await page.screenshot({path:path.join(process.env.PLANNER_EVENT_SCREENSHOT,`calendar-33-95-${width}-${side}.png`)})}
   await page.locator('#todayBtn').click();await stable('after returning');assert.equal(await page.locator('#todayBtn').isVisible(),false);
  }
  for(const view of ['week','month']){
   await page.locator(view==='week'?'#tabWeek':'#tabMonth').click();const next=page.locator('#'+view+'Next'),before=await next.boundingBox();await next.click();const after=await next.boundingBox();near(after.x,before.x,`${view} arrow stays fixed`);near(after.y,before.y,`${view} arrow stays fixed vertically`);assert.equal(await page.locator('#todayBtn').isVisible(),true);await page.locator('#todayBtn').click();assert.equal(await page.locator('#todayBtn').isVisible(),false);
  }
  await page.locator('#tabDay').click();await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#next').click();
  const titleTransition=await page.locator('#dayTitle').evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration));assert.ok(titleTransition>=.6,'date slides smoothly to make room');
  const motion=await page.locator('#todayBtn .today-drop').evaluate(el=>({duration:parseFloat(getComputedStyle(el).animationDuration),color:getComputedStyle(el).backgroundImage}));assert.ok(motion.duration>=1);assert.match(motion.color,/radial-gradient/);
  await page.waitForTimeout(400);await page.locator('#todayBtn').click();await page.waitForTimeout(600);
  assert.equal(await page.locator('.phone-today-pop').count(),1,'burst remains visible after 600ms');assert.ok(await page.locator('.phone-today-pop .today-pop-bead').count()>=8);
  if(process.env.PLANNER_EVENT_SCREENSHOT)await page.screenshot({path:path.join(process.env.PLANNER_EVENT_SCREENSHOT,`calendar-33-95-${width}-burst.png`)});
  await page.waitForTimeout(1100);assert.equal(await page.locator('.phone-today-pop').count(),0,'burst cleans up after its slower animation');assert.deepEqual(errors,[]);console.log(`Navigation ${width}x${height}: stable arrows, centered date, separate clickable bubble, week/month return, longer animation passed`);await page.close();
 }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
