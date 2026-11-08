const {chromium,webkit}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const kind=process.env.PLANNER_BROWSER||'chromium',engine=kind==='webkit'?webkit:chromium,live=process.env.PLANNER_LIVE_URL,origin=live?new URL(live).origin:'https://planner.test';
const out=process.env.PLANNER_ROUTE_OUTPUT||'test-results/route-menu-'+kind;
const mime={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf','.mp4':'video/mp4','.json':'application/json'};
const expected={DRIVE:'26 min',WALK:'105 h 27 min',BICYCLE:'10 h 18 min',TRANSIT:'1 h'},minutes={DRIVE:26,WALK:6327,BICYCLE:618,TRANSIT:60};
const openMenu=page=>page.locator('.okti-route-badge').tap();
async function seed(page){await page.evaluate(()=>{today=()=>new Date('2026-11-07T00:00:00');selected=today();monthCursor=selected;tasks=[{id:'route-from',title:'Pierwsze spotkanie',date:'2026-11-07',time:'10:00',endTime:'11:00',location:'Berlin'},{id:'route-to',title:'Warsztaty między światłem a cieniem',date:'2026-11-07',time:'13:00',endTime:'14:00',location:'Dresden'}];renderAll();document.querySelector('.app').inert=false;});await page.locator('.okti-route-badge:not(:disabled)').waitFor();await page.locator('.okti-route-badge').scrollIntoViewIfNeeded();}
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await engine.launch({headless:true,...(engine===chromium?{args:['--no-sandbox']}: {})});const errors=[];
try{for(const [width,height] of [[320,568],[355,768],[390,844],[430,932],[844,390]]){
 const label=width+'x'+height,context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'no-preference',timezoneId:'Europe/Berlin',recordVideo:{dir:path.join(out,'video'),size:{width,height}}}),page=await context.newPage(),requests=[];
 page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(label+': '+e.message));
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===origin){if(live)return route.continue();const file=path.resolve(u.pathname.slice(1)||'index.html');if(file.startsWith(process.cwd()+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:mime[path.extname(file)]||'application/octet-stream'});}
  if(route.request().resourceType()==='script')return route.fulfill({body:'',contentType:'application/javascript'});
  if(u.pathname.endsWith('/routes/compute')){const body=route.request().postDataJSON();requests.push(body.mode);await new Promise(resolve=>setTimeout(resolve,300));return route.fulfill({json:{success:true,route:{available:true,mode:body.mode,durationMinutes:minutes[body.mode],distanceMeters:120000}}});}
  return route.fulfill({json:{success:true,requiresAccess:false}});
 });
 await page.goto(live||'https://planner.test');await page.evaluate(()=>document.fonts.ready);await seed(page);assert.equal(await page.locator('.okti-route-badge').textContent(),expected.DRIVE);
 if(width===390)await page.screenshot({path:path.join(out,label+'-drive.png')});
 for(const [mode,name] of [['BICYCLE','Rower'],['WALK','Pieszo'],['TRANSIT','Komunikacja miejska']]){
  await openMenu(page);const menu=page.locator('.okti-route-menu[data-state=open]');await menu.waitFor();assert.equal(await menu.getByRole('radio').count(),4);assert.equal(await page.locator('.okti-route-badge').getAttribute('aria-expanded'),'true');
  const bounds=await menu.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.y>=0&&bounds.y+bounds.height<=height,JSON.stringify({label,bounds}));
  await menu.getByRole('radio',{name,exact:true}).tap();assert.equal(await page.locator('.okti-route-menu[data-state=open]').count(),0);await page.locator('.okti-route-menu').waitFor({state:'detached'});await page.locator('.okti-route-badge').filter({hasText:expected[mode]}).waitFor();
  assert.equal(await page.locator('.okti-route-badge').evaluate(n=>n.scrollWidth<=n.clientWidth),true,`${label}: complete duration fits`);
  const badge=await page.locator('.okti-route-badge').boundingBox();assert.ok(badge.x>=0&&badge.x+badge.width<=width,`${label}: long duration stays within the screen`);
  if(width===390)await page.screenshot({path:path.join(out,label+'-'+mode.toLowerCase()+'.png')});
 }
 assert.deepEqual(requests,['DRIVE','BICYCLE','WALK','TRANSIT']);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('okti-route-modes-v1'))['route-from→route-to']),'transit');
 // Sample the actual open and close animations; the browser still runs their real WAAPI effects.
 if(width===390){
  await openMenu(page);
  for(const t of [0,100,240]){const state=await page.locator('.okti-route-menu[data-state=open]').evaluate((n,t)=>{const a=n.getAnimations()[0];a.pause();a.currentTime=t;return {opacity:+getComputedStyle(n).opacity,scale:getComputedStyle(n).transform}},t);if(t===100)assert.ok(state.opacity>0&&state.opacity<1);await page.screenshot({path:path.join(out,'menu-open-'+t+'.png')});}
  await page.locator('.okti-route-menu').getByRole('radio',{name:'Komunikacja miejska',exact:true}).press('Escape');
  const closing=page.locator('.okti-route-menu[data-state=closing]');assert.equal(await closing.evaluate(n=>n.inert&&getComputedStyle(n).pointerEvents==='none'),true);
  for(const t of [0,85]){const opacity=await closing.evaluate((n,t)=>{const a=n.getAnimations()[0];a.pause();a.currentTime=t;return +getComputedStyle(n).opacity},t);if(t===85)assert.ok(opacity>0&&opacity<1);await page.screenshot({path:path.join(out,'menu-close-'+t+'.png')});}
  await closing.evaluate(n=>n.getAnimations()[0].finish());await closing.waitFor({state:'detached'});
 }
 await openMenu(page);await page.touchscreen.tap(5,5);await page.locator('.okti-route-menu').waitFor({state:'detached'});
 await openMenu(page);await page.locator('.okti-route-menu').getByRole('radio',{name:'Samochód',exact:true}).press('Escape');await page.locator('.okti-route-menu').waitFor({state:'detached'});assert.equal(await page.locator('.okti-route-badge').getAttribute('aria-expanded'),'false');
 // Repeated tapping must toggle cleanly without leaving an invisible interactive layer.
 for(let i=0;i<6;i++)await openMenu(page);await page.waitForFunction(()=>!document.querySelector('.okti-route-menu'));assert.equal(await page.locator('.okti-route-badge').getAttribute('aria-expanded'),'false');
 // Changing only the presentation preserves all event data.
 assert.deepEqual(await page.evaluate(()=>tasks.map(t=>[t.id,t.time,t.location])),[['route-from','10:00','Berlin'],['route-to','13:00','Dresden']]);
 if(width===390){
  // Review the softened indicators together while preserving their real risk
  // calculation: the same 26-minute drive has ample, tight and insufficient gaps.
  await page.evaluate(()=>{tasks=[
   {id:'risk-first',title:'Spotkanie poranne',date:'2026-11-07',time:'08:00',endTime:'09:00',location:'Berlin'},
   {id:'risk-second',title:'Warsztaty',date:'2026-11-07',time:'10:00',endTime:'11:00',location:'Dresden'},
   {id:'risk-third',title:'Kawa i rozmowa',date:'2026-11-07',time:'11:35',endTime:'12:00',location:'Leipzig'},
   {id:'risk-fourth',title:'Spotkanie popołudniowe',date:'2026-11-07',time:'12:15',endTime:'12:45',location:'Chemnitz'}
  ];renderAll();});
  await page.waitForFunction(()=>document.querySelectorAll('.okti-route-badge:not(:disabled)').length===3);
  assert.deepEqual(await page.locator('.okti-route-badge').evaluateAll(nodes=>nodes.map(n=>n.dataset.risk)),['safe','tight','late']);
  assert.deepEqual(await page.locator('.okti-route-lines').evaluateAll(nodes=>nodes.map(n=>n.dataset.risk)),['safe','tight','late']);
  await page.screenshot({path:path.join(out,'risk-palette.png')});
 }
 await context.close();console.log(kind+' '+label+': four transport modes, compact durations, menu bounds, real open/close motion, outside/Escape/rapid close and persistence passed.');
 }
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage();await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin){if(live)return r.continue();const f=path.resolve(u.pathname.slice(1)||'index.html');if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({body:fs.readFileSync(f),contentType:mime[path.extname(f)]||'application/octet-stream'});}if(r.request().resourceType()==='script')return r.fulfill({body:'',contentType:'application/javascript'});return r.fulfill({json:{success:true,requiresAccess:false,route:{available:true,durationMinutes:26}}})});await page.goto(live||'https://planner.test');await seed(page);await openMenu(page);assert.equal(await page.locator('.okti-route-menu').evaluate(n=>n.getAnimations().length),0);await page.locator('.okti-route-menu').getByRole('radio',{name:'Rower',exact:true}).press('Escape');assert.equal(await page.locator('.okti-route-menu').count(),0);await context.close();assert.deepEqual(errors,[]);
 console.log('Route menu browser regression passed (route service uses deterministic fixtures; real UI, touch, persistence and animations).');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
