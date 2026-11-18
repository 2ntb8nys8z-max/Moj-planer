const {webkit,devices}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await webkit.launch();let problems=[];
try{for(const mode of ['normal','native','encoded-blocked','smil-blocked','reduced']){
 const ctx=await browser.newContext({...devices['iPhone 13'],reducedMotion:mode==='reduced'?'reduce':'no-preference'}),p=await ctx.newPage();
 const errors=[],assets=[];p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(/octi-(pressure\.js|listening\.js|water-idle|water-head|water-shell|listening-body)/.test(r.url()))assets.push([r.status(),r.url()])});
 await p.addInitScript(mode=>{
  if(mode==='native'){const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...args){if(t==='webgl')return null;return get.call(this,t,...args)}}
  if(mode==='encoded-blocked')HTMLCanvasElement.prototype.toDataURL=function(){throw new DOMException('canvas export blocked','SecurityError')};
  if(mode==='smil-blocked'&&window.SVGAnimationElement)SVGAnimationElement.prototype.beginElement=function(){throw Error('SMIL unavailable')};
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});
  window.MediaRecorder=class{static isTypeSupported(){return true}state='inactive';start(){this.state='recording';this.onstart?.()}stop(){this.state='inactive';this.onstop?.()}};
 },mode);
 const url=process.env.PUBLIC_URL;fs.mkdirSync('capture/'+mode,{recursive:true});
 try{await p.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await p.waitForTimeout(500);
 await require('./permission-fixture.cjs').dismissInitialPermissions(p);
 for(const ch of (['normal','native'].includes(mode)?['main','event']:['main'])){
  if(ch==='event')await p.evaluate(()=>{tasks=[{id:'press-qa',title:'Test',date:iso(selected),time:'17:00',endTime:'18:00'}];renderAll();openEventActions(tasks[0])});
  const r=p.locator('.octi-dock[data-channel='+ch+']'),v=r.locator('.voice');await v.waitFor({timeout:5000});
  await p.waitForFunction(ch=>!!document.querySelector('.octi-dock[data-channel='+ch+']')?.octiPressure,ch,{timeout:4500});
  await p.waitForTimeout(1100);const box=await v.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2,clip={x:Math.floor(cx-78),y:Math.floor(cy-78),width:156,height:156};
  const snap=async name=>{const state=await r.evaluate(r=>({pose:r.octiPressure?.getState(),render:r.octiListening?.getState(),rec:r.dataset.mode,rect:r.querySelector('.octi-motion-media').getBoundingClientRect().width,at:[...r.querySelectorAll('img.octi-listening-fallback')].map(i=>[i.complete,i.currentSrc])}));await p.screenshot({path:'capture/'+mode+'/'+ch+'-'+name+'.png',clip});console.log('FRAME',mode,ch,name,JSON.stringify(state))};
  await snap('idle0');await p.waitForTimeout(225);await snap('idle1');
  await v.tap();await p.waitForTimeout(180);await snap('tap');await p.waitForTimeout(470);await snap('peak');
  if(['normal','native'].includes(mode)){await p.waitForFunction(ch=>plannerRecordings[ch]?.mode==='recording',ch,{timeout:3500});await p.waitForTimeout(250);await snap('record');await p.waitForTimeout(300);await snap('record2');for(let n=0;n<3;n++){await p.waitForTimeout(115);await snap('loop'+n)}await p.waitForTimeout(1750);await snap('settled');await p.waitForTimeout(190);await snap('settled2');await p.evaluate(ch=>{if(plannerRecordings[ch]){plannerRecordings[ch].mode='cancelled';delete plannerRecordings[ch]}},ch)}
 }
 }catch(e){problems.push(mode+' '+e.message);console.log('MODEFAIL',mode,e.message)}
 if(errors.length)problems.push(mode+': '+errors.join('; '));
 console.log('OUTCOME',mode,JSON.stringify({errors,assets}));await ctx.close();
}}finally{await browser.close()}console.log('SUMMARY',problems);if(problems.length)process.exitCode=1})().catch(e=>{console.error(e);process.exitCode=1});
