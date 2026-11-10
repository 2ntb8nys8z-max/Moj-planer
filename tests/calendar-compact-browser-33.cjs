const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const kind=process.env.PLANNER_BROWSER||'chromium',engine=kind==='webkit'?webkit:chromium,live=process.env.PLANNER_LIVE_URL,origin=live?new URL(live).origin:'https://planner.test';
const output='test-results/calendar-compact-'+kind+(live?'-deployed':'');
const types={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf','.mp4':'video/mp4','.json':'application/json'};
const intersects=(a,b)=>a.left<b.right-.5&&b.left<a.right-.5&&a.top<b.bottom-.5&&b.top<a.bottom-.5;
(async()=>{fs.mkdirSync(output,{recursive:true});const browser=await engine.launch({headless:true,...(kind==='chromium'?{args:['--no-sandbox']}: {})});try{
 for(const width of [320,390,430]){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Europe/Berlin'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin){if(live)return route.continue();const f=path.resolve(u.pathname.slice(1)||'index.html');if(f.startsWith(process.cwd()+path.sep)&&fs.existsSync(f)&&fs.statSync(f).isFile())return route.fulfill({body:fs.readFileSync(f),contentType:types[path.extname(f)]||'application/octet-stream'});}if(route.request().resourceType()==='script')return route.fulfill({body:'',contentType:'application/javascript'});return route.fulfill({json:{requiresAccess:false,success:true,route:{available:true,durationMinutes:121,distanceMeters:5000}}});});
  await page.goto(live||origin);await page.evaluate(()=>document.fonts.ready);
  async function seed(lanes){await page.evaluate(lanes=>{
   selected=new Date('2026-11-07T12:00:00');today=()=>new Date('2026-11-07T12:00:00');showPlannerWeather=async()=>{};ideas=[];
   tasks=[{id:'first',title:'Wizyta u mechanika',date:'2026-11-07',time:lanes===1?'14:00':'09:00',endTime:lanes===1?'15:00':'09:30',location:'Berlin'},...Array.from({length:lanes},(_,i)=>({id:'target-'+i,title:lanes===1?'Zrobienie zakupów':i?'Spotkanie projektowe':'Warsztaty fotografii w mieście',date:'2026-11-07',time:lanes===1?'15:00':'10:00',endTime:lanes===1?'16:00':'10:30',location:['Warszawa','Dresden','Leipzig'][i%3]}))];
   for(const task of tasks){task.weatherPlace={location:task.location,latitude:52.23,longitude:21.01};task.weatherForecast={key:plannerWeatherForecastKey(task,task.weatherPlace),fetchedAt:new Date().toISOString(),rows:[{key:task.date+'T'+task.time.slice(0,2)+':00',index:0,temperature:7,code:2,isDay:true}]};}
   saveTasks();renderAll();document.querySelector('.app').inert=false;
  },lanes);await page.waitForFunction(lanes=>document.querySelectorAll('#taskList .okti-route-badge:not(:disabled)').length===lanes,lanes);await page.evaluate(()=>OktiEventWeather.refresh());}
  for(const lanes of [1,2,3,4]){
   await seed(lanes);
   const measured=await page.evaluate(()=>{
    const rect=n=>n.getBoundingClientRect().toJSON();return [...document.querySelectorAll('#taskList .phone-event')].map(card=>{
     const copy=card.nextElementSibling,title=copy.querySelector('.phone-event-title-text'),time=copy.querySelector('.phone-event-time'),weather=card.querySelector('.okti-event-card-weather'),controls=document.querySelector('.okti-route-controls[data-destination-event-id="'+card.dataset.eventId+'"]');
     const hours=[...time.querySelector('.phone-event-time-range').childNodes].filter(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim()).flatMap(n=>{const r=document.createRange();r.selectNodeContents(n);return [...r.getClientRects()].map(b=>b.toJSON())});
     return {layout:copy.dataset.cardLayout,hours,id:card.dataset.eventId,card:rect(card),copy:rect(copy),title:rect(title),time:rect(time),font:parseFloat(getComputedStyle(copy).fontSize),padding:parseFloat(getComputedStyle(copy).paddingTop),weather:weather&&rect(weather),controls:controls&&rect(controls),button:controls&&rect(controls.querySelector('.okti-route-badge')),icon:controls&&rect(controls.querySelector('.okti-route-badge>svg'))};
    });
   });
   await page.locator('[data-event-id="target-0"]').evaluate(n=>n.scrollIntoView({block:'center'}));await page.screenshot({path:path.join(output,width+'-'+lanes+'-columns.png')});
   for(const item of measured){
    assert.equal(item.font,16);assert.ok(item.padding>=6&&item.title.top>=item.card.top+5,'Title has breathing room above');assert.ok(item.time.bottom<=item.copy.bottom+1,'Hours fit the reserved header');
    for(const r of item.hours)assert.ok(r.left>=item.time.left-1&&r.right<=item.time.right+1&&r.top>=item.time.top-1&&r.bottom<=item.time.bottom+1,'Complete hour fragments stay readable');
    if(item.controls){assert.ok(item.button.width===44&&item.icon.width===22,'Smaller transport face preserves a 44px touch target');assert.ok(item.controls.left>=item.card.left&&item.controls.right<=item.card.right&&item.controls.bottom<=item.card.bottom,'Controls fit their destination');}
    if(item.weather){assert.ok(item.weather.right<=item.card.right-5&&item.weather.left>=item.card.left,'Weather fits at the right');if(item.controls)assert.ok(item.weather.bottom<=item.controls.top+1,'Weather stays above transport');assert.ok(!intersects(item.weather,item.title)&&!intersects(item.weather,item.time),'Weather and text do not overlap');}
    if(lanes===1){const extra=item.title.height>25?20:0;assert.ok(item.card.height<=(item.id==='first'?58:74)+extra,'Screenshot events size to their title and metadata, not a 100px floor');if(width>=390)assert.ok(item.title.height<=21,'The screenshot titles fit one line on an iPhone-sized screen');if(item.controls)assert.ok(Math.abs(item.time.top+item.time.height/2-item.controls.top-item.controls.height/2)<1,'Hours and transport share the same row');}
   }
   await page.locator('[data-event-id="target-0"]').evaluate(n=>n.scrollIntoView({block:'center'}));await page.screenshot({path:path.join(output,width+'-'+lanes+'-columns.png')});
   if(lanes===1){const key=page.locator('#taskList .okti-route-badge').first();await key.tap();await page.locator('.okti-route-menu[data-state=open]').waitFor();assert.equal(await page.locator('.okti-route-menu [role=radio]').count(),4);await page.locator('.okti-route-close').tap();await page.locator('.okti-route-menu').waitFor({state:'detached'});
    // Empty space between the two travel buttons belongs to the event card.
    const point=await page.locator('.okti-route-controls').first().evaluate(n=>{const icon=n.querySelector('.okti-route-badge').getBoundingClientRect(),label=n.querySelector('.okti-route-duration').getBoundingClientRect();return{x:(label.right+icon.left)/2,y:icon.top+icon.height/2}});
    assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.closest('.phone-event')?.dataset.eventId,point),'target-0','Transparent gaps must not become dead touch areas');await page.touchscreen.tap(point.x,point.y);await page.waitForFunction(()=>!document.getElementById('eventModal').classList.contains('hidden')&&!OktiEventMotion.getState()&&!OktiEventKey.getState());assert.equal(await page.locator('#actionTitle').textContent(),'Zrobienie zakupów');await page.locator('#closeEvent').tap();await page.waitForFunction(()=>document.getElementById('eventModal').classList.contains('hidden'));
   }
  }
  await seed(1);await page.evaluate(()=>{tasks[1].title='Spotkanie projektowe i omówienie wszystkich zaplanowanych działań na przyszły tydzień';renderAll()});await page.waitForFunction(()=>!!document.querySelector('.okti-route-badge:not(:disabled)'));await page.evaluate(()=>OktiEventWeather.refresh());
  const long=await page.locator('[data-event-id="target-0"]').evaluate(n=>({height:n.getBoundingClientRect().height,title:n.nextElementSibling.querySelector('.phone-event-title-text').getBoundingClientRect().height}));assert.ok(long.height<=94&&long.height>74&&long.title===40,'A long title gets two lines without restoring the old empty 100px tile');await page.screenshot({path:path.join(output,width+'-long-title.png')});
  assert.deepEqual(errors,[]);await context.close();console.log(kind+' '+width+': 16px title, top inset, shorter cards, upper-right weather above 44px transport, readable hours, no text collisions in 1/2/3/4 columns, existing route menu passed.');
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
