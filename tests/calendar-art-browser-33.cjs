const {chromium,webkit}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const name=process.env.PLANNER_BROWSER||'chromium',engine=name==='webkit'?webkit:chromium;
const live=process.env.PLANNER_LIVE_URL,origin=live?new URL(live).origin:'https://planner.test';
const output=process.env.PLANNER_ART_OUTPUT||'test-results/calendar-art-'+name;
const fixture=[
 {id:'meeting',title:'Spotkanie projektowe',date:'2026-11-07',time:'09:00',endTime:'10:00',location:'Berlin'},
 {id:'workshop',title:'Warsztaty między światłem a cieniem',date:'2026-11-07',time:'12:00',endTime:'14:00',notes:'Przynieść aparat.',reminder:{minutesBefore:15}},
 {id:'coffee',title:'Kawa i rozmowa',date:'2026-11-07',time:'14:30',endTime:'14:45'},
 {id:'health',title:'Wizyta u fizjoterapeuty — omówienie ćwiczeń i dalszego planu rehabilitacji',date:'2026-11-07',time:'16:00',endTime:'17:00',location:'Dresden'},
 {id:'all-day',title:'Urodziny',date:'2026-11-07',time:''}
];
const types={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf','.mp4':'video/mp4','.json':'application/json','.png':'image/png'};
async function clean(page){await page.waitForFunction(()=>!window.OktiEventKey?.getState()&&!OktiEventMotion.getState());assert.equal(await page.locator('.okti-event-flight-panel,.okti-event-flight-tile-art').count(),0);}
async function frame(page,time){return page.evaluate(time=>{for(const a of $('eventModal').getAnimations({subtree:true})){a.pause();a.currentTime=time;}const n=$('eventModal').querySelector('.okti-event-flight-tile-art'),stripe=n?.querySelector('.okti-event-flight-stripe');return n?{background:getComputedStyle(n).backgroundImage,opacity:Number(getComputedStyle(n).opacity),shadow:getComputedStyle(n.parentElement).boxShadow,weather:n.querySelectorAll('.okti-event-card-weather').length,stripes:n.querySelectorAll('.okti-event-flight-stripe').length,stripe:stripe?{background:getComputedStyle(stripe).backgroundImage,left:getComputedStyle(stripe).left,width:getComputedStyle(stripe).width}:null}:null;},time);}
async function open(page){await page.evaluate(()=>{const timer=window.setTimeout;window.setTimeout=(fn,ms,...args)=>String(fn).includes('token.finish()')?0:timer(fn,ms,...args);openEventActions(tasks.find(t=>t.id==='workshop'));window.setTimeout=timer;});}
async function geometry(page){return page.evaluate(()=>{
 const rect=n=>{const r=n.getBoundingClientRect();return [r.x,r.y,r.width,r.height]};
 return {events:[...document.querySelectorAll('#taskList .phone-event,#taskList .phone-event-title,#taskList .entry-deadline-row')].map(n=>({id:n.dataset.eventId||n.className,rect:rect(n)})),dock:[...document.querySelectorAll('.voice-area .stage,.voice-area #voice,.voice-area .menu-toggle,.phone-bottom-bar,.phone-sky-header')].map(rect)};
});}
(async()=>{
 fs.mkdirSync(output,{recursive:true});const errors=[];
 const browser=await engine.launch({headless:true,...(engine===chromium?{args:['--no-sandbox'],...(process.env.PLANNER_CHROMIUM?{executablePath:process.env.PLANNER_CHROMIUM}:{})}:{})});
 try{
  for(const width of [320,390,430]){
   const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,timezoneId:'Europe/Berlin'}),page=await context.newPage();
   page.on('pageerror',e=>errors.push(e.message));let images=0;
   page.on('request',r=>{if(/\/assets\/(?:event-backgrounds|calendar-art)\//.test(r.url())&&r.resourceType()==='image')images++;});
   await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin){if(live)return route.continue();const file=path.resolve(url.pathname.slice(1)||'index.html');if(file.startsWith(process.cwd()+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/octet-stream'});}
    if(route.request().resourceType()==='script')return route.fulfill({body:'',contentType:'application/javascript'});
    return route.fulfill({json:{requiresAccess:false}});
   });
   await page.goto(live||origin);await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(records=>{showPlannerWeather=async()=>{};selected=new Date('2026-11-07T12:00:00');tasks=records;const task=tasks.find(t=>t.id==='workshop');task.location='Warszawa';task.weatherPlace={location:task.location,latitude:52.23,longitude:21.01};task.weatherForecast={key:plannerWeatherForecastKey(task,task.weatherPlace),fetchedAt:new Date().toISOString(),rows:[{key:task.date+'T12:00',index:0,temperature:7,code:2,isDay:true}]};ideas=[];renderAll();document.querySelector('.app').inert=false;},fixture);
   await page.locator('.phone-event[data-event-id="workshop"]').waitFor();
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   // WebKit can still be finishing the existing day-entry translation. Compare
   // the two surfaces at rest, rather than sampling different animation frames.
   await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
   // Check the actual painted canvas: no inherited cream/blue gradient may
   // survive on a surface beneath the calendar, including Safari on iPhone.
   const canvas=await page.locator('html,body,.app,#dayView,#taskList,.phone-timeline-scroll,.phone-timeline').evaluateAll(nodes=>nodes.map(n=>({surface:n.id||n.className||n.tagName,colour:getComputedStyle(n).backgroundColor,image:getComputedStyle(n).backgroundImage})));
   assert.ok(canvas.length>=7,width+': all calendar canvas layers are present');
   for(const surface of canvas){assert.equal(surface.colour,'rgb(255, 255, 255)',width+': '+surface.surface+' is pure white');assert.equal(surface.image,'none',width+': '+surface.surface+' has no blue or cream background gradient');}
   // Compare actual rendered geometry with the decorative rules switched off.
   // The same cards, text, Octopus, navigation and header must not move.
   const decorated=await geometry(page);
   await page.evaluate(()=>document.getElementById('okti-calendar-art-33-247').sheet.disabled=true);
   const plain=await geometry(page);assert.deepEqual(decorated,plain,width+': decoration does not change layout');
   await page.evaluate(()=>document.getElementById('okti-calendar-art-33-247').sheet.disabled=false);
   await page.evaluate(()=>OktiEventWeather.refresh());
   const weather=page.locator('[data-event-id="workshop"] .okti-event-card-weather');
   assert.equal(await weather.textContent(),'7°','The card shows weather for the event hour');
   const weatherClear=await weather.evaluate(n=>{const clock=n.parentElement.nextElementSibling.querySelector('.phone-event-time').getBoundingClientRect(),r=n.getBoundingClientRect(),tile=n.parentElement.getBoundingClientRect();return r.top>=clock.bottom+1&&r.left>=tile.left+5&&r.right<=tile.right-5&&r.bottom<=tile.bottom-3});
   assert.equal(weatherClear,true,width+': weather sits below the time, inside the event card');
   const dataBefore=await page.evaluate(()=>JSON.stringify(tasks));
   assert.equal(new Set(await page.locator('.okti-calendar-card').evaluateAll(nodes=>nodes.map(n=>n.dataset.eventArtwork))).size,fixture.length,'Every event has a different motif in this group');
   await page.evaluate(async()=>{await Promise.all([...document.querySelectorAll('.okti-calendar-card')].map(n=>{const url=n.style.getPropertyValue('--calendar-art').match(/url\("(.*?)"\)/)?.[1];return url?new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=()=>reject(Error('Artwork failed: '+url));image.src=url;}):Promise.resolve();}));});
   await page.screenshot({path:path.join(output,width+'-calendar.png')});
   // The reference uses one rounded bar INSIDE a neutral glass rim. Its light
   // and the independent title must not produce a second stripe or overlap.
   const palettePaints=await page.locator('[data-event-id="workshop"]').evaluate(n=>{
    const original=n.dataset.eventPalette,paints=[];
    for(const palette of ['blue','sage','sand','rose']){
     n.dataset.eventPalette=palette;const s=getComputedStyle(n),bar=getComputedStyle(n,'::before');
     paints.push({palette,edge:s.borderLeftColor,width:s.borderLeftWidth,top:s.borderTopWidth,
      rim:s.borderRightColor,face:s.backgroundImage,before:bar.content,bar:bar.backgroundImage,
      barLeft:bar.left,barTop:bar.top,barBottom:bar.bottom,barWidth:bar.width,barRadius:bar.borderRadius,
      rimColour:s.getPropertyValue('--key-rim').trim(),titlePadding:getComputedStyle(n.nextElementSibling).paddingLeft,
      reflection:getComputedStyle(n,'::after').content});
    }
    n.dataset.eventPalette=original;return paints;
   });
   const colours=['#54858b','#6f927c','#b18a59','#ab7e85'];
   for(const [i,paint] of palettePaints.entries()){
    assert.equal(paint.rimColour,colours[i],paint.palette+': stripe uses the event palette');
    assert.equal(paint.width,'1px');assert.equal(paint.top,'1px');
    assert.equal(paint.before,'""');assert.equal(paint.barLeft,'6px');assert.equal(paint.barTop,'8px');assert.equal(paint.barBottom,'8px');
    assert.equal(paint.barWidth,'4px');assert.equal(paint.barRadius,'999px');
    assert.equal(paint.rim,paint.edge,paint.palette+': no coloured outer left border');
    assert.ok(parseFloat(paint.titlePadding)>parseFloat(paint.barLeft)+parseFloat(paint.barWidth)+1,'Text clears the inset bar');
    assert.match(paint.face,/linear-gradient/);assert.equal(paint.reflection,'""','The existing lower glass reflection is preserved');
   }
   assert.equal(new Set(palettePaints.map(p=>p.face)).size,4,'Every stripe casts its own palette glow');
   assert.equal(new Set(palettePaints.map(p=>p.edge)).size,1,'The glass rim is neutral across all palettes');
   assert.equal(new Set(palettePaints.map(p=>p.bar)).size,4,'Only the inset bar changes colour');
   const tilePaint=await page.locator('[data-event-id="workshop"]').evaluate(n=>getComputedStyle(n).backgroundImage);
   assert.match(tilePaint,/linear-gradient/);assert.doesNotMatch(tilePaint,/url\(/,width+': accepted keys have white faces, not calendar illustrations');
   assert.doesNotMatch(await page.locator('[data-event-id="all-day"]').evaluate(n=>getComputedStyle(n).backgroundImage),/url\(/);
   assert.ok(await page.locator('[data-event-id="workshop"]').evaluate(n=>getComputedStyle(n).backgroundColor==='rgb(255, 255, 255)'),width+': key face stays white');
   await page.locator('[data-event-id="workshop"]').scrollIntoViewIfNeeded();
   const stripePaint=await page.locator('[data-event-id="workshop"]').evaluate(n=>getComputedStyle(n,'::before').backgroundImage);
   await open(page);const first=await frame(page,0);assert.equal(first.background,tilePaint);assert.equal(first.opacity,1);assert.equal(first.weather,1,'Weather follows the existing flight and fades with its glass surface');assert.equal(first.stripes,1);assert.equal(first.stripe.background,stripePaint,'The same single inset bar follows the flight surface');assert.equal(first.stripe.left,'6px');assert.equal(first.stripe.width,'4px');const later=await frame(page,280);assert.equal(later.opacity,0);assert.notEqual(later.shadow,first.shadow,width+': elevation interpolates instead of jumping between incompatible shadow lists');
   await page.screenshot({path:path.join(output,width+'-opening.png')});
   // Close during opening: keep the interrupted decoration, then settle cleanly.
   await page.evaluate(()=>closeEventActions());await clean(page);
   const beforeReopenImages=images;
   if(width===390){
    const key=page.locator('.phone-event[data-event-id="workshop"]');await key.scrollIntoViewIfNeeded();
    const restingShadow=await key.evaluate(n=>getComputedStyle(n).boxShadow),box=await key.boundingBox();
    // The wider key's centre can sit behind the existing floating Okti dock.
    // Press its exposed upper-left face and verify the real hit target first.
    const point={x:box.x+Math.min(24,box.width/2),y:box.y+Math.min(14,box.height/2)};
    const hit=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('.phone-event')?.dataset.eventId,point);
    assert.equal(hit,'workshop','The physical pointer hits the exposed event key');
    await page.mouse.move(point.x,point.y);await page.mouse.down();
    // WebKit may defer the first style update after the interrupted flight.
    // Flush that update and await the actual CSS press transitions, then check
    // both depth and shadow rather than sampling an arbitrary 190ms timer.
    await key.evaluate(async n=>{
     await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
     await Promise.all(n.getAnimations().map(a=>a.finished.catch(()=>{})));
    });
    assert.equal(await key.evaluate(n=>n.classList.contains('okti-key-pressed')),true);
    assert.equal(await key.evaluate(n=>n.nextElementSibling.classList.contains('okti-key-pressed')),true,'Independent title follows the button');
    assert.notEqual(await key.evaluate(n=>getComputedStyle(n).boxShadow),restingShadow);
    assert.ok(await key.evaluate(n=>Math.abs(new DOMMatrix(getComputedStyle(n).transform).m42-4)<.05),'The pressed glass key moves down by 4px');
    assert.equal(await page.locator('#eventModal').isVisible(),false,'Holding only depresses the key');
    await page.screenshot({path:path.join(output,'390-pressed.png')});
    await page.mouse.up();await page.waitForTimeout(110);
    assert.equal(await page.locator('#eventModal').isVisible(),false,'Release rebound is visible before the event opens');
    assert.equal(await page.evaluate(()=>OktiEventKey.getState()?.phase),'releasing');
    await page.screenshot({path:path.join(output,'390-releasing.png')});
    await clean(page);assert.equal(await page.locator('.okti-key-pressed,.okti-key-moving').count(),0);
    await page.locator('#closeEvent').tap();await clean(page);
   }
   await page.locator('[data-event-id="workshop"]').tap();await clean(page);
   assert.match(await page.locator('#eventNotesCards').textContent(),/Przynieść aparat/);
   await page.locator('#closeEvent').tap();await clean(page);
   assert.equal(images,beforeReopenImages,width+': reopening reuses the already loaded header artwork');
   assert.equal(await page.evaluate(()=>JSON.stringify(tasks)),dataBefore,width+': decoration does not modify events');
   // Existing overlap layout and tiny event cards remain usable with art enabled.
   await page.evaluate(()=>{tasks=[...tasks,{id:'overlap',title:'Konsultacja w pracy',date:'2026-11-07',time:'12:30',endTime:'13:00'}];renderAll();});
   const overlaps=await page.locator('.phone-event[data-lanes]:not([data-lanes="1"])').count();assert.ok(overlaps>0);
   await page.screenshot({path:path.join(output,width+'-overlap.png')});
   // A missing/offline image retains a light surface and fully functional event.
   await page.route('**/assets/calendar-art/**',r=>r.abort());
   await page.locator('[data-event-id="coffee"]').evaluate(n=>n.style.setProperty('--calendar-art','url("assets/calendar-art/unavailable.webp")'));
   await page.locator('[data-event-id="coffee"]').tap();await clean(page);assert.equal(await page.locator('#actionTitle').textContent(),'Kawa i rozmowa');
   await page.locator('#closeEvent').tap();await clean(page);
   assert.ok(await page.locator('.phone-event[data-event-id="coffee"]').evaluate(n=>getComputedStyle(n).backgroundColor.match(/\d+/g).slice(0,3).every(v=>Number(v)>=240)),width+': offline fallback stays light');
   // Reproduce the reported iPhone case: many independent events all named
   // Wydarzenie. Their identity, rather than their repeated title, chooses art.
   await page.unroute('**/assets/calendar-art/**');
   await page.evaluate(()=>{tasks=Array.from({length:12},(_,i)=>{const start=18*60+i*30,clock=minute=>String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');return{id:'same-title-'+i,title:'Wydarzenie',date:'2026-11-06',time:clock(start),endTime:clock(start+15)}});selected=new Date('2026-11-06T12:00:00');renderAll();});
   await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
   const repeated=()=>page.locator('.phone-event').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.eventId,art:n.dataset.eventArtwork})));
   const assignment=await repeated();assert.equal(new Set(assignment.slice(0,10).map(n=>n.art)).size,10);
   for(let i=1;i<assignment.length;i++)assert.notEqual(assignment[i].art,assignment[i-1].art);
   await page.evaluate(()=>renderAll());assert.deepEqual(await repeated(),assignment,'Rerendering leaves every visible motif stable');
   await page.evaluate(async()=>{await Promise.all([...document.querySelectorAll('.phone-event')].map(n=>new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=reject;image.src=n.style.getPropertyValue('--calendar-art').match(/url\("(.*?)"\)/)[1];})));const card=document.querySelector('.phone-event'),scroll=card.closest('.phone-timeline-scroll');scroll.scrollTop=Math.max(0,card.offsetTop-12);});
   await page.screenshot({path:path.join(output,width+'-repeated-titles.png')});
   await context.close();console.log(name+' '+width+': artwork variety, stable repeated titles, unchanged geometry/Octopus, open/close/interruption, cache reuse, overlap and image failure passed.');
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
