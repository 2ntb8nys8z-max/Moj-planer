const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const kind=process.env.PLANNER_BROWSER||'chromium',engine=kind==='webkit'?webkit:chromium,live=process.env.PLANNER_LIVE_URL,origin=live?new URL(live).origin:'https://2ntb8nys8z-max.github.io';
const output='test-results/speech-button-'+kind+(live?'-deployed':''),mime={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf','.mp4':'video/mp4','.json':'application/json'};
(async()=>{
 fs.mkdirSync(output,{recursive:true});let browser;
 try{
  browser=await engine.launch({headless:true,...(kind==='chromium'?{args:['--no-sandbox'],...(process.env.PLANNER_CHROMIUM?{executablePath:process.env.PLANNER_CHROMIUM}:{})}: {})});
  for(const width of [320,390,430]){
   const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'no-preference'}),page=await context.newPage(),errors=[];
   page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{
    window.speechFixture={calls:[],denied:0,resumes:0,utterance:null,click:null,noStart:false,failNext:false};
    document.addEventListener('click',event=>{speechFixture.click=event},true);
    window.SpeechSynthesisUtterance=function(text){this.text=text};
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{paused:false,getVoices(){return []},resume(){speechFixture.resumes++;this.paused=false},cancel(){const old=speechFixture.utterance;speechFixture.utterance=null;old?.onerror?.({error:'canceled'})},speak(u){
     // Model the iOS first-read restriction using the actual trusted event
     // dispatch, so a delayed synthetic click fails even in desktop WebKit.
     const trusted=!!speechFixture.click?.isTrusted&&speechFixture.click.eventPhase!==0;
     speechFixture.calls.push({text:u.text,lang:u.lang,trusted});if(!trusted){speechFixture.denied++;u.onerror?.({error:'not-allowed'});return}
     speechFixture.utterance=u;
     if(speechFixture.failNext){speechFixture.failNext=false;queueMicrotask(()=>u.onerror?.({error:'synthesis-failed'}));return}
     if(!speechFixture.noStart)u.onstart?.();
    }}});
   });
   await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===origin){if(live)return route.continue();const file=path.resolve(url.pathname.slice(1)||'index.html');if(file.startsWith(process.cwd()+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:mime[path.extname(file)]||'application/octet-stream'});}
    if(request.resourceType()==='script')return route.fulfill({body:'',contentType:'application/javascript'});return route.fulfill({json:{}});
   });
   await page.goto(live||origin);await require('./permission-fixture.cjs').dismissInitialPermissions(page);await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(()=>{window.speechBefore=JSON.stringify(PlannerData.snapshot());OktiCommunication.showActions('main','Masz jeszcze trzy spotkania.',[],()=>true)});
   const read=page.locator('[data-speech-read]');await read.tap();assert.equal(await page.evaluate(()=>speechFixture.calls.length),1);assert.equal(await read.getAttribute('aria-label'),'Zatrzymaj czytanie');assert.equal(await read.getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>speechFixture.calls[0].trusted),true);assert.equal(await page.evaluate(()=>speechFixture.calls[0].lang),'pl-PL');
   await page.waitForTimeout(650);assert.equal(await page.evaluate(()=>speechFixture.calls.length),1,'The key animation cannot replay the speech request');await page.screenshot({path:path.join(output,width+'-reading.png')});
   await read.tap();assert.equal(await read.getAttribute('aria-pressed'),'false');assert.equal(await page.evaluate(()=>speechFixture.calls.length),1,'A second tap stops rather than adding another utterance');
   // Native keyboard activation must retain the same trusted call stack.
   await read.focus();await page.keyboard.press('Space');assert.equal(await read.getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>speechFixture.calls.at(-1).trusted),true);await read.tap();
   await page.evaluate(()=>{speechSynthesis.paused=true});await read.tap();assert.equal(await page.evaluate(()=>speechFixture.resumes),1);assert.equal(await read.getAttribute('aria-pressed'),'true');await read.tap();
   await page.evaluate(()=>{speechFixture.failNext=true});await read.tap();await page.waitForFunction(()=>document.querySelector('.okti-decision-speech-status').textContent.includes('Nie udało się'));assert.equal(await read.getAttribute('aria-pressed'),'false');await page.screenshot({path:path.join(output,width+'-retry.png')});await read.tap();assert.equal(await read.getAttribute('aria-pressed'),'true');await read.tap();
   if(width===390){
    await page.evaluate(()=>{speechFixture.noStart=true});await read.tap();const count=await page.evaluate(()=>speechFixture.calls.length);await page.waitForFunction(()=>document.querySelector('.okti-decision-speech-status').textContent.includes('nie wystartowało'));assert.equal(await page.evaluate(()=>speechFixture.calls.length),count,'A timeout reports the problem without an out-of-gesture retry');await page.evaluate(()=>{speechFixture.noStart=false});await read.tap();assert.equal(await read.getAttribute('aria-pressed'),'true');await read.tap();
   }
   const geometry=await page.locator('.okti-decision-card').evaluate(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}});assert.ok(geometry.left>=0&&geometry.right<=width&&geometry.top>=0&&geometry.bottom<=844);
   await page.getByRole('button',{name:'Zamknij pytanie',exact:true}).tap();await page.waitForFunction(()=>document.getElementById('oktiDecision').hidden);assert.equal(await page.evaluate(()=>speechFixture.denied),0);assert.equal(await page.evaluate(()=>JSON.stringify(PlannerData.snapshot())===speechBefore),true);assert.deepEqual(errors,[]);
   await context.close();console.log(kind+' '+width+': native touch/keyboard → synchronous trusted speech, no duplicate, stop, paused queue, error/retry, silent-start feedback and unchanged planner passed (speech output simulated).');
  }
 }finally{await browser?.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
