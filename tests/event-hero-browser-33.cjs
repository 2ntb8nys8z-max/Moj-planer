const {chromium,webkit}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const engineName=process.env.PLANNER_BROWSER||'chromium',engine=engineName==='webkit'?webkit:chromium;
const output=process.env.PLANNER_HERO_OUTPUT||'test-results/event-hero-'+engineName;
const live=process.env.PLANNER_LIVE_URL,origin=live?new URL(live).origin:'https://planner.test';
const mime={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf','.mp4':'video/mp4','.json':'application/json'};
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1.5,`${label}: ${a} vs ${b}`);
async function box(page,selector){return page.locator(selector).evaluate(n=>n.getBoundingClientRect().toJSON())}
async function clean(page){await page.waitForFunction(()=>!window.OktiEventMotion.getState());assert.equal(await page.locator('.okti-event-flight-panel,.okti-event-flight-label,.okti-event-flight-time').count(),0);assert.equal(await page.locator('body.okti-event-transitioning').count(),0);}
async function snapshot(page,name){await page.screenshot({path:path.join(output,name+'.png')});}
async function frame(page,time){return page.evaluate(time=>{const modal=$('eventModal');for(const animation of modal.getAnimations({subtree:true})){animation.pause();animation.currentTime=time;}const panel=modal.querySelector('.okti-event-flight-panel'),band=modal.querySelector('.okti-event-flight-band'),art=modal.querySelector('.okti-event-header-art');return {panel:panel?.getBoundingClientRect().toJSON(),band:band?.getBoundingClientRect().toJSON(),art:getComputedStyle(art).visibility,rowBackground:getComputedStyle(modal.querySelector('.event-header-top')).backgroundImage,bandBackground:band&&getComputedStyle(band).backgroundImage,state:OktiEventMotion.getState()};},time)}
async function open(page,index=1,inspect=false){await page.evaluate(({index,inspect})=>{
 const tile=[...$('taskList').querySelectorAll('[data-event-id]')].find(n=>n.dataset.eventId===tasks[index].id);tile?.scrollIntoView({block:'center'});
 // Pause the watchdog only for deterministic frame screenshots, then restore it.
 const timer=window.setTimeout;if(inspect)window.setTimeout=(fn,ms,...args)=>String(fn).includes('token.finish()')?0:timer(fn,ms,...args);
 openEventActions(tasks[index]);window.setTimeout=timer;
 },{index,inspect});}
(async()=>{fs.mkdirSync(output,{recursive:true});const browser=await engine.launch({headless:true,...(engine===chromium?{args:['--no-sandbox'],...(process.env.PLANNER_CHROMIUM?{executablePath:process.env.PLANNER_CHROMIUM}:{})}:{})});const errors=[];
try{
 for(const [width,height] of [[320,568],[355,768],[390,844],[430,932],[844,390]]){
  const label=width+'x'+height,context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,timezoneId:'Europe/Berlin',reducedMotion:'no-preference',recordVideo:{dir:path.join(output,'video'),size:{width,height}}}),page=await context.newPage();
  page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(20000);console.log(engineName+' '+label+': starting');
  page.on('pageerror',e=>errors.push(label+': '+e.message));
  await page.route('**/*',async route=>{const u=new URL(route.request().url());
   if(u.origin===origin){if(live)return route.continue();const file=path.resolve(u.pathname.slice(1)||'index.html');if(file.startsWith(process.cwd()+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:mime[path.extname(file)]||'application/octet-stream'});}
   if(u.hostname==='geocoding-api.open-meteo.com')return route.fulfill({json:{results:[{id:1,name:'Dresden',country:'Deutschland',country_code:'DE',admin1:'Sachsen',latitude:51.05,longitude:13.74,timezone:'Europe/Berlin'}]}});
   if(u.hostname==='api.open-meteo.com'){await new Promise(resolve=>setTimeout(resolve,600));return route.fulfill({json:{timezone:'Europe/Berlin',hourly:{time:Array.from({length:24},(_,h)=>'2026-11-07T'+String(h).padStart(2,'0')+':00'),temperature_2m:Array(24).fill(14),precipitation_probability:Array(24).fill(10),wind_speed_10m:Array(24).fill(8),weather_code:Array(24).fill(2)}}});}
   if(route.request().resourceType()==='script')return route.fulfill({body:'',contentType:'application/javascript'});
   return route.fulfill({json:{success:true,requiresAccess:false,route:{available:true,durationMinutes:135,distanceMeters:140000}}});
  });
  await page.goto(live||'https://planner.test/');await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{today=()=>new Date('2026-11-07T00:00:00');selected=today();monthCursor=selected;tasks=[
   {id:'hero-origin',title:'Poprzednie spotkanie',date:'2026-11-07',time:'09:00',endTime:'10:00',location:'Berlin'},
   {id:'hero-main',title:'Warsztaty między światłem a cieniem',date:'2026-11-07',time:'12:00',endTime:'14:00',location:'Dresden',notes:'Przynieść aparat. Ustalenia dotyczące warsztatów.',reminder:{minutesBefore:15}},
   {id:'hero-long',title:'Warsztaty między światłem a cieniem — rozmowa o fotografii, wspólne ćwiczenia w plenerze i omówienie wszystkich przygotowanych zdjęć',date:'2026-11-07',time:'16:00',endTime:'17:00'},
   {id:'hero-short',title:'Kawa',date:'2026-11-07',time:''}
  ];renderAll();document.querySelector('.app').inert=false;});
  console.log(label+': loaded and seeded');await open(page,1,true);const initial=await box(page,'.event-sheet');
  for(const t of [0,120,640,1280,2200]){const f=await frame(page,t);assert.ok(f.panel,`${label}: flight exists at ${t}`);assert.equal(f.art,'hidden',`${label}: real decoration is hidden during flight`);assert.equal(f.rowBackground,'none',`${label}: fixed top row never paints above the flying surface`);assert.match(f.bandBackground,/radial-gradient/);if(t===1280)near(f.band.height,(await box(page,'#eventHeader')).height,'band measures the whole header');if(width===390||t===640)await snapshot(page,label+'-open-'+t);}
  await page.locator('#eventHeaderWeather').filter({hasText:'14°C'}).waitFor();await page.locator('#eventTravelSummary').filter({hasText:'2 godz. 15 min'}).waitFor();const afterWeather=await box(page,'.event-sheet');near(afterWeather.height,initial.height,`${label}: delayed weather preserves panel height`);near(afterWeather.top,initial.top,`${label}: delayed weather preserves panel position`);
  await page.evaluate(()=>OktiEventMotion.stop());await clean(page);await snapshot(page,label+'-open-settled');
  const header=await box(page,'#eventHeader'),title=await box(page,'#actionTitle'),actions=await box(page,'#eventHeaderActions'),weather=await box(page,'#eventHeaderWeather'),meta=await box(page,'#eventHeaderMeta');
  assert.ok(header.height>=230||height<500,`${label}: approved header height`);assert.ok(title.top>=actions.bottom-1,`${label}: title is below controls`);assert.ok(meta.top>=title.bottom-1,`${label}: metadata follows title in normal flow`);assert.ok(weather.left>=meta.right-1,`${label}: weather and metadata do not overlap`);
  const contentHeight=await page.locator('#eventContent').evaluate(n=>n.scrollHeight);assert.ok((await box(page,'.event-sheet')).height<=header.height+contentHeight+8,`${label}: no empty space is reserved for the hidden forecast`);assert.equal(await page.locator('#eventWeather').isVisible(),false);assert.equal(await page.locator('#eventHeaderActions button').count(),2);assert.ok((await box(page,'#eventLocationRow')).top>=header.bottom-1);assert.match(await page.locator('#eventNotesCards').textContent(),/Przynieść aparat/);
  console.log(label+': visual frames and geometry passed');const nav=page.waitForEvent('popup',{timeout:10000});await page.locator('#navigateBtn').tap();const popup=await nav;await popup.waitForURL(/google.com\/maps/);assert.match(popup.url(),/google.com\/maps/);await popup.close();console.log(label+': navigation passed');
  // Real touch closes the sheet; automatic completion must clean every ghost.
  await page.locator('#closeEvent').tap();await clean(page);assert.equal(await page.locator('#eventModal').isVisible(),false);
  // Natural, unpaused open and close, including the final handoff to the real header.
  await open(page);await clean(page);const target=await box(page,'.event-sheet');await snapshot(page,label+'-natural');
  await page.locator('#eventActionsToggle').tap();await page.locator('#actionEdit').tap();assert.equal(await page.locator('#eventEditBox').isVisible(),true);await page.locator('#eventActionsToggle').tap();await page.locator('#actionTimer').tap();assert.equal(await page.locator('#timerBox').isVisible(),true);
  await page.locator('#closeEvent').tap();await clean(page);
  // Closing during opening resumes from the current panel rather than its destination.
  await open(page,1,true);const beforeClose=await frame(page,300);const interrupted=await box(page,'.okti-event-flight-panel');
  await page.evaluate(()=>{const timer=window.setTimeout;window.setTimeout=(fn,ms,...args)=>String(fn).includes('token.finish()')?0:timer(fn,ms,...args);closeEventActions();window.setTimeout=timer;});const resumed=await frame(page,0);near(resumed.band.height,beforeClose.band.height,`${label}: interrupted band stays stable`);near(resumed.panel.width,interrupted.width,`${label}: interruption preserves width`);near(resumed.panel.top,interrupted.top,`${label}: interruption preserves top`);await snapshot(page,label+'-interrupted');
  // Reopen a different event before its preceding close finishes.
  await open(page,2);await clean(page);const longHeader=await box(page,'#eventHeader');assert.ok(longHeader.height>header.height,`${label}: long title grows naturally`);await snapshot(page,label+'-long');const titleMetrics=await page.locator('#actionTitle').evaluate(n=>{const r=document.createRange();r.selectNodeContents(n);return {glyphBottom:r.getBoundingClientRect().bottom,boxBottom:n.getBoundingClientRect().bottom,overflow:getComputedStyle(n).overflow}});assert.equal(titleMetrics.overflow,'visible');assert.ok(titleMetrics.glyphBottom<=titleMetrics.boxBottom+4,JSON.stringify({label,titleMetrics}));await page.locator('#closeEvent').tap();await clean(page);
  await open(page,3);await clean(page);assert.equal(await page.locator('#eventTime').textContent(),'Cały dzień');assert.equal(await page.locator('#eventHeaderWeather').textContent(),'');assert.equal(await page.locator('#eventLocationRow').isVisible(),false);await page.locator('#closeEvent').tap();await clean(page);
  // Backgrounding an active transition must restore held calendar elements.
  await open(page,1,true);await frame(page,100);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await clean(page);assert.equal(await page.locator('[data-event-id="hero-main"]').evaluate(n=>getComputedStyle(n).visibility),'visible');
  console.log(label+': all actions passed, closing context');await context.close();console.log(engineName+' '+label+': header, visual flight frames, delayed weather, touch/navigation, reopen, interrupt, long/all-day titles passed.');
 }
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage();await page.route('**/*',r=>{const u=new URL(r.request().url()),file=path.resolve(u.pathname.slice(1)||'index.html');if(u.origin===origin){if(live)return r.continue();if(fs.existsSync(file)&&fs.statSync(file).isFile())return r.fulfill({body:fs.readFileSync(file),contentType:mime[path.extname(file)]||'application/octet-stream'});}if(r.request().resourceType()==='script')return r.fulfill({body:'',contentType:'application/javascript'});return r.fulfill({json:{}})});await page.goto(live||'https://planner.test');await page.evaluate(()=>{showPlannerWeather=async()=>{};tasks=[{id:'reduced',title:'Kawa',date:'2026-11-07'}];openEventActions(tasks[0]);});await clean(page);assert.equal(await page.locator('.okti-event-header-art').evaluate(n=>getComputedStyle(n).visibility),'visible');await page.locator('#closeEvent').click();await clean(page);await context.close();assert.deepEqual(errors,[]);
 console.log('Event hero regression passed. Weather and route services use deterministic fixtures; real UI, layout, Web Animations and touch handlers are exercised.');
}finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
