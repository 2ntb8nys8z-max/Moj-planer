const {chromium,webkit}=require(process.env.PLANNER_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

// Real hit testing matters here: DOM click() alone ignores covering layers.
// Run with PLANNER_BROWSER=webkit for Safari's engine when installed.
(async()=>{
 const engine=process.env.PLANNER_BROWSER==='webkit'?webkit:chromium;
 const browser=await engine.launch({headless:true,...(engine===chromium&&process.env.PLANNER_CHROMIUM?{executablePath:process.env.PLANNER_CHROMIUM}:{}),...(engine===chromium?{args:['--no-sandbox','--disable-dev-shm-usage']}: {})});
 try{for(const [width,height] of [[320,568],[355,768],[390,844],[430,932],[844,390]]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:true,isMobile:true,reducedMotion:'no-preference'});
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin==='https://planner.test'){
    const file=path.resolve(url.pathname.slice(1)||'preview33/index.html');
    if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf','.mp4':'video/mp4'})[path.extname(file)]||'application/json'});
   }
   return route.fulfill({body:'{}',contentType:'application/json'});
  });
  await page.addInitScript(()=>{
   window.noteMicStarts=0;
   Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>{window.noteMicStarts++;return {getTracks:()=>[{stop(){}}]}}}});
   window.MediaRecorder=class{
    static isTypeSupported(){return true}state='inactive';
    start(){this.state='recording';this.onstart?.()}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['audio'],{type:'audio/mp4'})});this.onstop?.()}
   };
  });
  await page.goto('https://planner.test/preview33/index.html');await require('./permission-fixture.cjs').dismissInitialPermissions(page);
  await page.evaluate(()=>{
   showPlannerWeather=async()=>{};plannerAudioPayload=async()=>({base64:'YXVkaW8=',type:'audio/mp4'});
   // Provider response is controlled; the complete recorder/save/UI flow is real.
   plannerApiRequest=async()=>({engine:3,transcription:'Dodaj notatkę: Test kodu po zapisaniu notatki.',item:{...voiceEventSnapshot(activeTask),type:'event',notes:'Test kodu po zapisaniu notatki.',changedFields:['notes']}});
   tasks=[{id:'note-one',title:'Pierwsze',date:'2026-11-05',time:'14:00',endTime:'15:00',notes:''},{id:'note-two',title:'Drugie',date:'2026-11-05',time:'16:00',endTime:'17:00',notes:''}];
  });
  for(let i=0;i<2;i++){
   await page.evaluate(i=>openEventActions(tasks[i]),i);
   const mic=page.locator('#eventVoice'),plus=page.locator('.octi-dock[data-channel=event] .action-bubble');
   await mic.tap();await page.waitForFunction(()=>plannerRecordings.event?.mode==='recording');
   await mic.tap();await page.locator('#eventChangeConfirm').tap();
   await page.waitForFunction(()=>!plannerRecordings.event&&!voiceDialogues.event?.busy&&activeTask.notes==='Test kodu po zapisaniu notatki.');
   const geometry=await page.evaluate(()=>{
    const mic=$('eventVoice'),r=mic.getBoundingClientRect(),footer=$('eventFooter'),panel=$('eventConversationPanel');
    return {hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===mic,disabled:mic.disabled,footerZ:+getComputedStyle(footer).zIndex,panelZ:+getComputedStyle(panel).zIndex};
   });
   assert.equal(geometry.hit,true,JSON.stringify({width,height,geometry}));assert.equal(geometry.disabled,false);assert.ok(geometry.footerZ>geometry.panelZ);
   const starts=await page.evaluate(()=>window.noteMicStarts);
   await mic.tap();await page.waitForFunction(()=>plannerRecordings.event?.mode==='recording');
   assert.equal(await page.evaluate(()=>window.noteMicStarts),starts+1,'A real touch requests the microphone again');
   await plus.tap();await page.waitForFunction(()=>!plannerRecordings.event);
   await plus.tap();assert.equal(await plus.getAttribute('aria-expanded'),'true');await plus.tap();
   await page.locator('#closeEvent').tap();assert.equal(await page.locator('#eventModal').isVisible(),false);
  }
  await page.close();
 }
 console.log('Event voice note browser regression: save -> hit test -> second touch recording, plus/cancel/X on five mobile viewports passed (microphone and provider response mocked).');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
