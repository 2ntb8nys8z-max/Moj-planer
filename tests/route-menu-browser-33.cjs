const {chromium,webkit}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const kind=process.env.PLANNER_BROWSER||'chromium',engine=kind==='webkit'?webkit:chromium,live=process.env.PLANNER_LIVE_URL,origin=live?new URL(live).origin:'https://planner.test';
const out=process.env.PLANNER_ROUTE_OUTPUT||'test-results/route-menu-'+kind;
const mime={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf','.mp4':'video/mp4','.json':'application/json'};
const expected={DRIVE:'26 min',WALK:'105 h 27 min',BICYCLE:'10 h 18 min',TRANSIT:'1 h'},minutes={DRIVE:26,WALK:6327,BICYCLE:618,TRANSIT:60};
const key=page=>page.locator('#taskList .okti-route-badge');
async function openMenu(page){
 // The existing Okti dock floats above the calendar. Scroll the real key to
 // its exposed top row before tapping, just as a user can do on a short phone.
 await key(page).evaluate(n=>{const scroller=document.getElementById('taskList'),bounds=scroller.getBoundingClientRect();scroller.scrollTop+=n.getBoundingClientRect().top-bounds.top-12});
 await key(page).tap();await page.locator('.okti-route-menu[data-state=open]').waitFor();
}
async function closeMenu(page){await page.locator('.okti-route-menu[data-state=open] .okti-route-close').tap();await page.locator('.okti-route-menu').waitFor({state:'detached'});assert.equal(await page.locator('.okti-route-focus').count(),0)}
async function seed(page){await page.evaluate(()=>{today=()=>new Date('2026-11-07T00:00:00');selected=today();monthCursor=selected;tasks=[{id:'route-from',title:'Pierwsze spotkanie',date:'2026-11-07',time:'10:00',endTime:'11:00',location:'Berlin'},{id:'route-to',title:'Warsztaty między światłem a cieniem',date:'2026-11-07',time:'13:00',endTime:'14:00',location:'Dresden'}];renderAll();document.querySelector('.app').inert=false;});await page.locator('#taskList .okti-route-badge:not(:disabled)').waitFor();}
async function routing(page,requests=[]){await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===origin){if(live)return route.continue();const file=path.resolve(u.pathname.slice(1)||'index.html');if(file.startsWith(process.cwd()+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:mime[path.extname(file)]||'application/octet-stream'});}
 if(route.request().resourceType()==='script')return route.fulfill({body:'',contentType:'application/javascript'});
 if(u.pathname.endsWith('/routes/compute')){const body=route.request().postDataJSON();requests.push(body.mode);await new Promise(resolve=>setTimeout(resolve,300));return route.fulfill({json:{success:true,route:{available:true,mode:body.mode,durationMinutes:minutes[body.mode],distanceMeters:120000}}});}
 return route.fulfill({json:{success:true,requiresAccess:false}});
});}
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await engine.launch({headless:true,...(engine===chromium?{args:['--no-sandbox'],...(process.env.PLANNER_CHROMIUM?{executablePath:process.env.PLANNER_CHROMIUM}:{})}: {})});const errors=[];
try{for(const [width,height] of [[320,568],[355,768],[390,844],[430,932],[844,390]]){
 const label=width+'x'+height,context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'no-preference',timezoneId:'Europe/Berlin',recordVideo:{dir:path.join(out,'video'),size:{width,height}}}),page=await context.newPage(),requests=[];
 page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(label+': '+e.message));await routing(page,requests);
 await page.goto(live||'https://planner.test');await page.evaluate(()=>document.fonts.ready);await seed(page);assert.equal(await key(page).getAttribute('data-route-duration'),expected.DRIVE);
 assert.equal((await key(page).textContent()).trim(),'');assert.equal(await page.locator('.okti-route-duration').textContent(),'26 min','Time is separate from the icon');assert.equal(await key(page).evaluate(n=>n.offsetWidth),48);
 assert.equal(await page.locator('.okti-route-lines,.okti-route-focus-lines').count(),0,'There are no permanent route lines');
 assert.equal(await key(page).evaluate(n=>{const r=n.parentElement.getBoundingClientRect(),card=document.querySelector('[data-event-id="route-to"]').getBoundingClientRect();return r.left>=card.left&&r.right<=card.right&&r.top>=card.top&&r.bottom<=card.bottom}),true,label+': icon and time fit inside their event');
 if(width===390)await page.screenshot({path:path.join(out,label+'-drive.png')});
 for(const [mode,name] of [['BICYCLE','Rower'],['WALK','Pieszo'],['TRANSIT','Komunikacja']]){
  await openMenu(page);const menu=page.locator('.okti-route-menu[data-state=open]');assert.equal(await menu.getByRole('radio').count(),4);assert.equal(await key(page).getAttribute('aria-expanded'),'true');
  assert.equal(await menu.evaluate(n=>n.parentElement===document.body),true);assert.equal(await page.locator('.app').evaluate(n=>n.inert),true);
  const bounds=await menu.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.y>=0&&bounds.y+bounds.height<=height,JSON.stringify({label,bounds}));
  const pair=await page.locator('.okti-route-focus').evaluate(n=>{const cards=[...document.querySelectorAll('#taskList .phone-event')].map(c=>c.getBoundingClientRect()),a=cards[0],b=cards[1];return {copies:n.querySelectorAll('.phone-event').length,path:n.querySelector('.okti-route-focus-lines path').getAttribute('d'),expected:`M ${a.left+a.width/2} ${a.top+a.height/2} L ${b.left+b.width/2} ${b.top+b.height/2}`,dots:n.querySelectorAll('.okti-route-focus-lines circle').length,background:n.getAttribute('aria-hidden')}});
  assert.equal(pair.copies,2);assert.equal(pair.path,pair.expected,'One straight line connects the real card centers');assert.equal(pair.dots,2);assert.equal(pair.background,'true');
  await menu.getByRole('radio',{name,exact:true}).tap();assert.equal(await page.locator('.okti-route-menu[data-state=open]').count(),1);await menu.locator('.okti-route-detail-duration').filter({hasText:expected[mode]}).waitFor();
  assert.equal(await key(page).getAttribute('data-route-duration'),expected[mode]);assert.equal(await menu.getByRole('radio',{name,exact:true}).getAttribute('aria-checked'),'true');
  assert.equal(await menu.locator('.okti-route-detail-duration').evaluate(n=>n.scrollWidth<=n.clientWidth),true,label+': complete duration fits');
  assert.equal(await key(page).evaluate(n=>{const glyph=n.querySelector(':scope > svg').getBoundingClientRect(),r=n.getBoundingClientRect();return glyph.width===26&&glyph.height===26&&glyph.left>=r.left+3&&glyph.right<=r.right-3}),true);
  assert.equal((await key(page).textContent()).trim(),'');if(mode==='WALK')assert.equal(await key(page).locator('svg circle').count(),10,'Walking retains the two detailed footprints');
  if(width===390)await page.screenshot({path:path.join(out,label+'-'+mode.toLowerCase()+'.png')});
  await page.touchscreen.tap(5,5);await page.locator('.okti-route-menu').waitFor({state:'detached'});assert.equal(await page.locator('.app').evaluate(n=>n.inert),false);
 }
 assert.deepEqual(requests,['DRIVE','BICYCLE','WALK','TRANSIT']);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('okti-route-modes-v1'))['route-from→route-to']),'transit');
 if(width===390){
  await openMenu(page);
  for(const t of [0,100,240]){const state=await page.locator('.okti-route-menu[data-state=open]').evaluate((n,t)=>{const a=n.getAnimations()[0];a.pause();a.currentTime=t;return {opacity:+getComputedStyle(n).opacity}},t);if(t===100)assert.ok(state.opacity>0&&state.opacity<1);await page.screenshot({path:path.join(out,'menu-open-'+t+'.png')});}
  await page.locator('.okti-route-menu').getByRole('radio',{name:'Komunikacja',exact:true}).press('Escape');
  const closing=page.locator('.okti-route-menu[data-state=closing]');assert.equal(await closing.evaluate(n=>n.inert&&getComputedStyle(n).pointerEvents==='none'),true);
  for(const t of [0,85]){const opacity=await closing.evaluate((n,t)=>{const a=n.getAnimations()[0];a.pause();a.currentTime=t;return +getComputedStyle(n).opacity},t);if(t===85)assert.ok(opacity>0&&opacity<1);}
  await closing.evaluate(n=>n.getAnimations()[0].finish());await closing.waitFor({state:'detached'});
 }
 await openMenu(page);await page.locator('.okti-route-close').press('Escape');await page.locator('.okti-route-menu').waitFor({state:'detached'});assert.equal(await key(page).getAttribute('aria-expanded'),'false');
 for(let i=0;i<3;i++){await openMenu(page);await closeMenu(page)}assert.equal(await page.locator('.okti-route-focus').count(),0);
 assert.deepEqual(await page.evaluate(()=>tasks.map(t=>[t.id,t.time,t.location])),[['route-from','10:00','Berlin'],['route-to','13:00','Dresden']]);
 if(width===390){
  await page.evaluate(()=>{tasks=[{id:'risk-first',title:'Spotkanie poranne',date:'2026-11-07',time:'08:00',endTime:'09:00',location:'Berlin'},{id:'risk-second',title:'Warsztaty',date:'2026-11-07',time:'10:00',endTime:'11:00',location:'Dresden'},{id:'risk-third',title:'Kawa i rozmowa',date:'2026-11-07',time:'11:35',endTime:'12:00',location:'Leipzig'},{id:'risk-fourth',title:'Spotkanie popołudniowe',date:'2026-11-07',time:'12:15',endTime:'12:45',location:'Chemnitz'}];renderAll()});
  await page.waitForFunction(()=>document.querySelectorAll('#taskList .okti-route-badge:not(:disabled)').length===3);assert.deepEqual(await key(page).evaluateAll(nodes=>nodes.map(n=>n.dataset.risk)),['safe','tight','late']);assert.equal(await page.locator('.okti-route-lines,.okti-route-focus-lines').count(),0);
  await page.screenshot({path:path.join(out,'risk-times.png')});
  await page.evaluate(()=>{tasks=Array.from({length:9},(_,i)=>({id:'dense-'+i,title:'Wydarzenie',date:'2026-11-07',time:'12:'+String(i*5).padStart(2,'0'),endTime:'12:'+String(i*5+5).padStart(2,'0'),location:['Berlin','Dresden','Leipzig'][i%3]}));renderAll()});
  await page.waitForFunction(()=>document.querySelectorAll('#taskList .okti-route-badge:not(:disabled)').length===8);
  assert.equal(await key(page).evaluateAll(nodes=>nodes.every(n=>{const r=n.parentElement.getBoundingClientRect(),card=document.querySelector(`[data-event-id="${n.dataset.destinationEventId}"]`).getBoundingClientRect();return n.getBoundingClientRect().width===48&&r.left>=card.left&&r.right<=card.right&&r.top>=card.top&&r.bottom<=card.bottom})),true,'Dense events keep their controls inside the correct destination card');await page.screenshot({path:path.join(out,'dense-inline.png')});
 }
 // Open with the last card near the bottom. The panel must scroll into room
 // BELOW that card instead of switching to the top of the focused pair.
 await seed(page);await key(page).evaluate(n=>{const card=document.querySelector('[data-event-id="route-to"]'),scroller=document.getElementById('taskList');scroller.scrollTop+=card.getBoundingClientRect().bottom-(window.innerHeight-25);n.focus({preventScroll:true})});
 await page.keyboard.press('Enter');await page.locator('.okti-route-menu[data-state=open]').waitFor();
 const below=await page.locator('.okti-route-menu[data-state=open]').evaluate(n=>{const r=n.getBoundingClientRect(),card=document.querySelector('[data-event-id="route-to"]').getBoundingClientRect();return {top:r.top,bottom:r.bottom,cardBottom:card.bottom}});assert.ok(Math.abs(below.top-below.cardBottom-10)<1,label+': travel details always appear below their event');assert.ok(below.bottom<=height-9,label+': the lower panel remains visible');await closeMenu(page);
 await context.close();console.log(kind+' '+label+': inline time, four modes, sharp pair and center line, bounded white panel, animation, outside/Escape/close, risk, persistence and data preservation passed.');
 }
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage();await routing(page);await page.goto(live||'https://planner.test');await seed(page);await openMenu(page);assert.equal(await page.locator('.okti-route-menu').evaluate(n=>n.getAnimations().length),0);await closeMenu(page);await context.close();assert.deepEqual(errors,[]);
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
