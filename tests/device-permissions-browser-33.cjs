const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const kind=process.env.PLANNER_BROWSER||'chromium',engine=kind==='webkit'?webkit:chromium,live=process.env.PLANNER_LIVE_URL,origin=live?new URL(live).origin:'https://2ntb8nys8z-max.github.io';
const output='test-results/device-permissions-'+kind+(live?'-deployed':''),mime={'.html':'text/html','.js':'application/javascript','.json':'application/json','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf','.mp4':'video/mp4'};
(async()=>{
 fs.mkdirSync(output,{recursive:true});const browser=await engine.launch({headless:true});
 try{
  for(const [width,deny] of [[320,false],[390,false],[430,false],[390,true]]){
   const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,timezoneId:'Europe/Berlin'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(deny=>{
    const stored=JSON.parse(localStorage.getItem('okti-device-permissions-v1')||'{}'),permissions={geolocation:stored.location==='ready'?'granted':'prompt',microphone:stored.microphone==='ready'?'granted':'prompt'};
    window.deviceTest={geo:0,mic:0,stops:0,recorders:0,logins:0};window.addEventListener('okti-authenticated',()=>deviceTest.logins++);
    Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:async({name})=>({state:permissions[name]||'prompt'})}});
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok,fail){deviceTest.geo++;if(deny){permissions.geolocation='denied';fail({code:1});return}permissions.geolocation='granted';ok({coords:{latitude:52.23,longitude:21.01,accuracy:20}})}}});
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async options=>{if(options.video)throw Error('Camera must not be requested');deviceTest.mic++;if(deny){permissions.microphone='denied';throw new DOMException('Denied','NotAllowedError')}permissions.microphone='granted';return{getTracks:()=>[{stop(){deviceTest.stops++}}]}}}});
    if(window.MediaRecorder)window.MediaRecorder=new Proxy(window.MediaRecorder,{construct(t,args){deviceTest.recorders++;return Reflect.construct(t,args)}});
   },deny);
   const day=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Berlin'}),hours=Array.from({length:24},(_,h)=>day+'T'+String(h).padStart(2,'0')+':00');
   const forecast={timezone:'Europe/Berlin',current:{time:day+'T12:00',temperature_2m:12,weather_code:0,is_day:1},hourly:{time:hours,temperature_2m:hours.map(()=>12),weather_code:hours.map(()=>0)},daily:{time:[day],sunrise:[day+'T07:00'],sunset:[day+'T17:00']}};
   await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===origin){if(live)return route.continue();const file=path.resolve(url.pathname.slice(1)||'index.html');if(file.startsWith(process.cwd()+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:mime[path.extname(file)]||'application/octet-stream'});}
    if(url.hostname==='api.bigdatacloud.net')return route.fulfill({json:{city:'Warszawa',countryCode:'PL',countryName:'Polska'}});
    if(url.hostname==='api.open-meteo.com')return route.fulfill({json:forecast});
    if(request.resourceType()==='script')return route.fulfill({body:'',contentType:'application/javascript'});return route.fulfill({json:{}});
   });
   await page.goto(live||origin);const dialog=page.locator('#oktiPermissionsDialog');await dialog.waitFor({state:'visible'});
   const before=await page.evaluate(()=>JSON.stringify(PlannerData.snapshot()));assert.deepEqual(await page.evaluate(()=>deviceTest),{geo:0,mic:0,stops:0,recorders:0,logins:0});
   const rect=await dialog.evaluate(n=>{const r=n.getBoundingClientRect();return{x:r.x,right:r.right,top:r.top,bottom:r.bottom}});assert.ok(rect.x>=0&&rect.right<=width&&rect.top>=0&&rect.bottom<=844,'The permission card fits the phone');
   await page.screenshot({path:path.join(output,width+(deny?'-denied':'-first-entry')+'.png')});
   await page.locator('#oktiAllowLocation').tap();await page.waitForFunction(()=>!OktiPermissions.getState().locationBusy);assert.equal(await page.evaluate(()=>OktiPermissions.getState().location),deny?'denied':'ready');
   await page.locator('#oktiAllowMicrophone').tap();await page.waitForFunction(()=>!OktiPermissions.getState().micBusy);assert.equal(await page.evaluate(()=>OktiPermissions.getState().microphone),deny?'denied':'ready');
   assert.equal(await page.evaluate(()=>deviceTest.mic),1);assert.equal(await page.evaluate(()=>deviceTest.stops),deny?0:1);assert.equal(await page.evaluate(()=>deviceTest.recorders),0,'Onboarding never starts a recording');
   await page.locator('#oktiFinishPermissions').tap();await dialog.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>JSON.stringify(PlannerData.snapshot())),before);
   // Exercise the real code-entry completion event, not a test-only login hook.
   await page.evaluate(()=>{window.permissionLogin=askApiAccess(true)});await page.locator('#apiAccessInput').fill('test-only-code-12345678901234567890');await page.locator('#apiAccessSave').tap();await page.evaluate(()=>permissionLogin);assert.equal(await page.evaluate(()=>deviceTest.logins),1);assert.equal(await dialog.isVisible(),false);
   // Exercise the actual Google success callback while OAuth itself is a fixture.
   await page.evaluate(()=>{window.google={accounts:{oauth2:{initTokenClient(options){return{requestAccessToken(){options.callback({access_token:'permission-oauth-fixture'})}}}}}};connectGoogleCalendar()});assert.equal(await page.evaluate(()=>deviceTest.logins),2);assert.equal(await dialog.isVisible(),false);
   await page.reload();await page.waitForFunction(()=>!!window.OktiPermissions);await page.evaluate(()=>OktiPermissions.afterLogin());assert.equal(await dialog.isVisible(),false);assert.equal(await page.evaluate(()=>deviceTest.mic),0,'Reload does not open the microphone');
   await page.evaluate(()=>OktiPermissions.open());await dialog.waitFor({state:'visible'});await page.locator('#oktiFinishPermissions').tap();
   assert.deepEqual(errors,[]);await context.close();console.log(kind+' '+width+(deny?' denied':' granted')+': first-entry setup before recording, separate touch requests, immediately released mic, no capture/save, real code/Google login completion and remembered decisions passed (device/OAuth/weather fixtures).');
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
