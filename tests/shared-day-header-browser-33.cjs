const {chromium,webkit}=require('playwright');
const name=process.env.PLANNER_BROWSER||'chromium',engine=name==='webkit'?webkit:chromium;
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const types={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf','.mp4':'video/mp4','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
(async()=>{
 const browser=await engine.launch({headless:true,...(engine===chromium?{args:['--no-sandbox'],...(process.env.PLANNER_CHROMIUM?{executablePath:process.env.PLANNER_CHROMIUM}:{})}:{})});
 const errors=[];fs.mkdirSync('test-results/shared-header-'+name,{recursive:true});
 try{
  for(const width of [320,390,430]){
   const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,timezoneId:'Europe/Berlin'}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin==='https://planner.test'){const file=path.resolve(url.pathname.slice(1)||'index.html');if(file.startsWith(process.cwd()+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/octet-stream'});}
    return route.request().resourceType()==='script'?route.fulfill({body:'',contentType:'application/javascript'}):route.fulfill({json:{requiresAccess:false}});
   });
   await page.goto('https://planner.test');await require('./permission-fixture.cjs').dismissInitialPermissions(page);await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(()=>{
    today=()=>new Date('2026-11-06T12:00:00');selected=today();tasks=[{id:'header-check',title:'Wyjście do lasu',date:'2026-11-06',time:'17:00',endTime:'18:00'}];ideas=[];
    OktiLocalWeather.get=()=>({temperature:4,code:3,label:'Pochmurno',isDay:true});
    OktiLocalWeather.snapshot=()=>({enabled:true,busy:false,place:{label:'Warszawa'}});
    OktiLocalWeather.details=date=>({place:'Warszawa',timezone:'Europe/Warsaw',at:Date.now(),rows:Array.from({length:24},(_,h)=>({time:String(h).padStart(2,'0')+':00',temperature:4,code:3,isDay:h>6&&h<17,rain:10,wind:5}))});
    OktiLocalWeather.refresh=async()=>{};showView('day');renderAll();document.querySelector('.app').inert=false;
   });
   await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
   const panel=page.locator('#dayTitle'),date=page.locator('#phoneDateButton'),weather=page.locator('#phoneWeatherButton');
   assert.equal(await panel.locator('button').count(),2,width+': one frame has two native controls');assert.equal(await page.locator('.phone-day-speaker').count(),0);
   for(const target of [date,weather]){const r=await target.boundingBox();assert(r.height>=44&&r.width>=44,width+': separate accessible touch areas');}
   const dr=await date.boundingBox(),wr=await weather.boundingBox();assert(Math.abs(dr.x+dr.width-wr.x)<2,width+': two halves share a divider');
   const fit=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,date:document.querySelector('.phone-day-number').scrollWidth<=document.querySelector('.phone-day-number').clientWidth,top:document.querySelector('#taskList').getBoundingClientRect().top,art:getComputedStyle(document.querySelector('.phone-sky-header'),'::before').display,white:getComputedStyle(document.querySelector('#taskList')).backgroundColor}));
   assert.equal(fit.overflow,false);assert.equal(fit.date,true,width+': full day/month fits');assert(fit.top<250,width+': compact header recovers calendar height');assert.equal(fit.art,'none');assert.equal(fit.white,'rgb(255, 255, 255)');
   await page.screenshot({path:'test-results/shared-header-'+name+'/'+width+'-calendar.png'});
   async function motionSamples(label,times){
    return page.evaluate(({label,times})=>{
     const key=document.querySelector(label==='date'?'#phoneDateButton':'#phoneWeatherButton'),glass=document.querySelector('.phone-day-glass-'+label),nodes=[key,glass],animations=nodes.flatMap(n=>n.getAnimations());
     for(const a of animations)a.pause();
     const samples=times.map(time=>{for(const a of animations)a.currentTime=time;return nodes.map(n=>{const r=n.getBoundingClientRect();return {height:r.height,center:r.y+r.height/2}})});
     for(const a of animations)a.play();
     return samples;
    },{label,times});
   }
   async function pressOpen(target,opposite,label){
    const rest=await target.boundingBox(),still=await opposite.boundingBox(),face=page.locator('.phone-day-glass-'+label),otherFace=page.locator('.phone-day-glass-'+(label==='date'?'weather':'date')),faceRest=await face.boundingBox(),otherFaceRest=await otherFace.boundingBox();
    await page.mouse.move(rest.x+rest.width/2,rest.y+rest.height/2);await page.mouse.down();
    const down=await motionSamples(label,[0,80,160,280]);
    for(let n=0;n<2;n++){
     assert(Math.abs(down[0][n].height-rest.height)<.2,width+': pressure starts at rest');
     for(let i=1;i<down.length;i++)assert(down[i-1][n].height>down[i][n].height+.2,width+': glass and label depress progressively rather than jumping');
    }
    await target.evaluate(n=>Promise.all(n.getAnimations().map(a=>a.finished.catch(()=>{}))));
    await face.evaluate(n=>Promise.all(n.getAnimations().map(a=>a.finished.catch(()=>{}))));
    const held=await target.boundingBox(),glassHeld=await face.boundingBox();
    assert(glassHeld.height<faceRest.height-2,width+': the optical rim itself compresses');
    for(const key of ['x','y','width','height'])assert(Math.abs(glassHeld[key]-held[key])<.2,width+': glass and label bend as one surface ('+key+')');
    assert.deepEqual(await otherFace.boundingBox(),otherFaceRest,width+': the other glass surface stays still');
    assert(held.height<rest.height-2,width+': '+label+' visibly compresses under a held pointer');
    assert(held.y+held.height/2>rest.y+rest.height/2+1,width+': '+label+' sinks into the frame');
    assert.deepEqual(await opposite.boundingBox(),still,width+': the other half stays still');
    assert.equal(await page.locator('#phoneDateModal').evaluate(n=>n.open),false,'Holding never opens the date selector');
    assert.equal(await page.locator('#dayWeatherModal').evaluate(n=>n.open),false,'Holding never opens the forecast');
    if(width===390)await page.screenshot({path:'test-results/shared-header-'+name+'/'+width+'-'+label+'-pressed.png'});
    await page.mouse.up();
    const up=await motionSamples(label,[0,100,200,320]);
    for(let n=0;n<2;n++){
     for(let i=1;i<up.length;i++)assert(up[i][n].height>up[i-1][n].height+.05,width+': release rises smoothly without rebound');
     assert(Math.abs(up.at(-1)[n].height-rest.height)<.2,width+': release returns to the original geometry');
    }
   }
   const saved=await page.evaluate(()=>JSON.stringify(tasks));await pressOpen(date,weather,'date');await page.locator('#phoneDateModal').waitFor({state:'visible'});assert.equal(await page.locator('#dayWeatherModal').evaluate(n=>n.open),false);assert.equal(await date.getAttribute('aria-expanded'),'true');
   await page.locator('.phone-date-prev').click();await page.locator('.phone-date-grid [data-date="2026-10-10"]').click();
   await page.locator('#phoneDateModal').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>iso(selected)),'2026-10-10');assert.equal(await page.locator('#date').inputValue(),'2026-10-10');assert.equal(await page.evaluate(()=>document.activeElement.id),'phoneDateButton');assert.equal(await page.evaluate(()=>document.querySelector('.app').inert),false);
   await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
   await pressOpen(weather,date,'weather');await page.locator('#dayWeatherModal').waitFor({state:'visible'});assert.equal(await page.locator('#phoneDateModal').evaluate(n=>n.open),false);assert.equal(await weather.getAttribute('aria-expanded'),'true');assert.equal(await date.getAttribute('aria-expanded'),'false');
   assert.equal(await date.locator('.phone-day-weekday').evaluate(n=>getComputedStyle(n).visibility),'visible','The date stays outside the weather flight');
   await page.keyboard.press('Escape');await page.locator('#dayWeatherModal').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.activeElement.id),'phoneWeatherButton');
   await date.focus();await page.keyboard.press('Space');await page.locator('#phoneDateModal').waitFor({state:'visible'});await page.locator('.phone-date-card').evaluate(n=>Promise.all(n.getAnimations().map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:'test-results/shared-header-'+name+'/'+width+'-date-picker.png'});await page.keyboard.press('Escape');await page.locator('#phoneDateModal').waitFor({state:'hidden'});
   const actualToday=await page.evaluate(()=>iso(new Date()));await date.click();await page.locator('.phone-date-today').click();assert.equal(await page.evaluate(()=>iso(selected)),actualToday,'Today follows the real local date rather than the fixture date');assert.equal(await page.evaluate(()=>JSON.stringify(tasks)),saved,'Header controls never mutate event data');
   await page.evaluate(()=>{selected=new Date('2026-11-30T12:00:00');renderDay()});
   const weekdayFits=await page.locator('#phoneDateButton .phone-day-weekday').evaluate(n=>({text:n.textContent,fits:n.scrollWidth<=n.clientWidth}));assert.equal(weekdayFits.fits,true,width+': '+weekdayFits.text+' fits the left half');
   if(width===390){
    await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
    await page.emulateMedia({reducedMotion:'reduce'});
    const rest=await date.boundingBox(),shadow=await date.evaluate(n=>getComputedStyle(n).boxShadow);
    await page.mouse.move(rest.x+rest.width/2,rest.y+rest.height/2);await page.mouse.down();
    assert.deepEqual(await date.boundingBox(),rest,'Reduced motion keeps the key still');
    assert.notEqual(await date.evaluate(n=>getComputedStyle(n).boxShadow),shadow,'Reduced motion retains visible pressure feedback');
    await page.mouse.move(2,800);await page.mouse.up();
    assert.equal(await date.evaluate(n=>n.classList.contains('is-header-pressed')),false,'Releasing outside cancels the pressed appearance');
    assert.equal(await page.locator('#phoneDateModal').evaluate(n=>n.open),false,'A cancelled press never opens a dialog');
    assert.equal(await page.locator('#dayWeatherModal').evaluate(n=>n.open),false);
    assert.equal(await page.evaluate(()=>JSON.stringify(tasks)),saved);
    await page.emulateMedia({reducedMotion:'no-preference'});
    if(name==='chromium'){
     const cdp=await context.newCDPSession(page),face=page.locator('.phone-day-glass-date'),faceRest=await face.boundingBox(),r=await date.boundingBox();
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width/2,y:r.y+r.height/2}]});
     assert.equal(await date.evaluate(n=>n.classList.contains('is-header-pressed')),true,'A real touch press immediately activates the key');
     await face.evaluate(n=>Promise.all(n.getAnimations().map(a=>a.finished.catch(()=>{}))));
     assert((await face.boundingBox()).height<faceRest.height-2,'A held touch bends the glass rim');
     await page.screenshot({path:'test-results/shared-header-'+name+'/'+width+'-touch-pressed.png'});
     await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
     await face.evaluate(n=>Promise.all(n.getAnimations().map(a=>a.finished.catch(()=>{}))));
     assert.equal(await date.evaluate(n=>n.classList.contains('is-header-pressed')),false,'Touch cancellation releases the key');
     assert.equal(await page.locator('#phoneDateModal').evaluate(n=>n.open),false,'Touch cancellation cannot open a dialog');
     assert(Math.abs((await face.boundingBox()).height-faceRest.height)<.2,'Touch cancellation restores the glass');
     await cdp.detach();
    }
    for(const [target,id] of [[date,'#phoneDateModal'],[weather,'#dayWeatherModal']]){
     const r=await target.boundingBox();await page.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);
     await page.locator(id).waitFor({state:'visible'});await page.keyboard.press('Escape');await page.locator(id).waitFor({state:'hidden'});
     await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
    }
   }
   await context.close();
  }
  assert.deepEqual(errors,[]);console.log('Shared header: progressive depression and smooth return, optical surfaces and labels bend together, real touch taps and cancellation, independent held presses, release and cancellation, reduced motion, separate date/weather dialogs, focus restoration, month selection, Today, independent weather motion, compact 320/390/430 px layout, white calendar and unchanged event data passed (forecast mocked).');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
