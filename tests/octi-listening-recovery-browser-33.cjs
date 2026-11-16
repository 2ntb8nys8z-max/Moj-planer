const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const engines=require('playwright'),kind=process.env.PLANNER_BROWSER||'chromium',base=path.resolve('.');
async function fixture(browser,{noGL=false,blocked=false,missingHead=false,app=false,width=390,height=844}={}){
 const page=await browser.newPage({viewport:{width,height}});const errors=[];let headBlocked=missingHead;page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({noGL,blocked})=>{window.qaBlocked=blocked;if(noGL){const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:get.call(this,type,...args)}}const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){return window.qaBlocked?Promise.reject(new DOMException('Autoplay denied','NotAllowedError')):play.call(this)}},{noGL,blocked});
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());let file=path.resolve(base,url.pathname.slice(1));if(url.pathname==='/qa-listening.html')file=path.join(base,'tests/fixtures/octi-listening.html');
  if(url.origin!=='https://planner.test')return route.fulfill({body:route.request().resourceType()==='script'?'':'{}',contentType:route.request().resourceType()==='script'?'application/javascript':'application/json'});
  if(!file.startsWith(base+'/')||!fs.existsSync(file))return route.fulfill({status:404,body:'missing'});
  if(headBlocked&&file.endsWith('octi-listening-head.webp'))return route.fulfill({status:404,body:'temporary image error',headers:{'cache-control':'no-store'}});
  const bytes=fs.readFileSync(file),type={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.mp4':'video/mp4','.woff2':'font/woff2','.ttf':'font/ttf'}[path.extname(file)]||'application/json';
  if(file.endsWith('.mp4')){const range=route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;return route.fulfill({status:206,body:bytes.subarray(start,end+1),contentType:type,headers:{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${bytes.length}`}})}}
  return route.fulfill({body:bytes,contentType:type});
 });
 await page.goto(app?'https://planner.test/preview33/index.html':'https://planner.test/qa-listening.html');
 if(app)await require('./permission-fixture.cjs').dismissInitialPermissions(page);
 return {page,errors,allowHead(){headBlocked=false;}};
}
const state=page=>page.locator('#state').innerText().then(JSON.parse);
const rendered=page=>page.waitForFunction(()=>{const s=JSON.parse(document.querySelector('#state').textContent||'{}');return s.rendering&&s.ready;},null,{timeout:15000});
// Compare body pixels outside both head silhouettes: the enlarged head can
// occlude inner arms without moving them. The 55px capsule includes a margin
// around the original 49px head, its small 3D turn and idle breathing.
async function pixels(page){return page.locator('.octi-listening-canvas').evaluate(canvas=>{
 const s=JSON.parse(document.querySelector('#state').textContent),n=canvas.width,p=new Uint8Array(n*n*4),gpu=s.renderer==='webgl';
 if(gpu)canvas.getContext('webgl').readPixels(0,0,n,n,6408,5121,p);else p.set(canvas.getContext('2d').getImageData(0,0,n,n).data);
 const distance=(x,y)=>Math.hypot(x-272,y-Math.max(205,Math.min(251,y))),angle=(gpu?1:-1)*11*Math.PI/180,c=Math.cos(angle),sn=Math.sin(angle);
 let blue=0,white=0,armBlue=0;const arm=[];
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const q=(y*n+x)*4,isBlue=p[q+3]>100&&p[q+2]-p[q]>70;if(isBlue)blue++;if(p[q+3]>100&&p[q]>235&&p[q+1]>235&&p[q+2]>235)white++;
  const px=(x+.5)*544/n,py=(gpu?1-(y+.5)/n:(y+.5)/n)*544,dx=px-310,dy=py-432,hx=(c*dx-sn*dy)/2.65+272,hy=(sn*dx+c*dy)/2.16+298;
  if(distance(px,py)>55&&distance(hx,hy)>55){arm.push(...p.slice(q,q+4));if(isBlue)armBlue++;}
 }
 return {n,blue,white,armBlue,arm};
 });}

(async()=>{
 const browser=await engines[kind].launch({headless:true,...(kind==='chromium'&&process.env.PLANNER_CHROMIUM?{executablePath:process.env.PLANNER_CHROMIUM}:{}),...(kind==='chromium'?{args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{} )});
 fs.mkdirSync('test-results/okti-listening',{recursive:true});
 try{
  for(const noGL of [false,true]){
   const {page,errors}=await fixture(browser,{noGL});try{
    await rendered(page);const renderer=(await state(page)).renderer;if(noGL)assert.equal(renderer,'canvas2d');
    await page.locator('.octi-listening-source').evaluate(v=>v.pause());await page.waitForTimeout(150);const idle=await pixels(page);await page.screenshot({path:`test-results/okti-listening/${kind}-${renderer}-idle.png`});
    await page.getByRole('button',{name:'Rozpocznij słuchanie',exact:true}).click();await page.waitForFunction(()=>JSON.parse(document.querySelector('#state').textContent).approach===1);
    const listening=await pixels(page);await page.screenshot({path:`test-results/okti-listening/${kind}-${renderer}-head-only.png`});assert.ok(listening.blue>idle.blue*1.15,'The separate head visibly approaches in the actual small button');assert.ok(listening.white>10,'Microphone marks remain visible');
    assert.equal(idle.arm.length,listening.arm.length);const difference=idle.arm.reduce((sum,v,i)=>sum+Math.abs(v-listening.arm[i]),0)/idle.arm.length;console.log(JSON.stringify({kind,renderer,idleBlue:idle.blue,listeningBlue:listening.blue,armBlue:idle.armBlue,armDifference:difference}));assert.ok(idle.armBlue>10,'The stationary comparison contains visible blue arm tips');assert.ok(difference<.1,`Tentacles retain their original size and position (${difference})`);
    assert.equal(await page.locator('.octi-listening-canvas').evaluate(c=>c.getBoundingClientRect().width),160,'The check uses the real button size');
    await page.screenshot({path:`test-results/okti-listening/${kind}-${renderer}-head-only.png`});
    await page.getByRole('button',{name:'Zakończ słuchanie',exact:true}).click();await page.waitForFunction(()=>JSON.parse(document.querySelector('#state').textContent).approach===0);
    assert.deepEqual(errors,[]);
   }finally{await page.close();}
  }
  const blocked=await fixture(browser,{blocked:true});try{
   await rendered(blocked.page);assert.equal((await state(blocked.page)).renderer,'canvas2d');await blocked.page.getByRole('button',{name:'Rozpocznij słuchanie',exact:true}).click();await blocked.page.waitForFunction(()=>JSON.parse(document.querySelector('#state').textContent).approach===1);
   assert.ok((await pixels(blocked.page)).blue>1000,'Autoplay failure retains a real animated head, not a scaled idle image');
   await blocked.page.evaluate(()=>window.qaBlocked=false);await blocked.page.getByRole('button',{name:'Zakończ słuchanie',exact:true}).click();await blocked.page.getByRole('button',{name:'Rozpocznij słuchanie',exact:true}).click();await blocked.page.waitForFunction(()=>!document.querySelector('.octi-listening-source').paused);
   assert.ok((await state(blocked.page)).lastError,'The original failure is retained for diagnosis');assert.deepEqual(blocked.errors,[]);
  }finally{await blocked.page.close();}
  const network=await fixture(browser,{missingHead:true});try{
   await network.page.waitForFunction(()=>JSON.parse(document.querySelector('#state').textContent||'{}').lastError?.stage==='artwork-init');
   await network.page.getByRole('button',{name:'Rozpocznij słuchanie',exact:true}).click();assert.equal(await network.page.locator('.octi-listening-fallback').evaluate(img=>new DOMMatrix(getComputedStyle(img).transform).a),1,'The last-resort image never enlarges the whole actor');network.allowHead();await rendered(network.page);assert.deepEqual(network.errors,[]);
  }finally{await network.page.close();}
  if(kind==='chromium'){
   const lost=await fixture(browser);try{await rendered(lost.page);assert.equal((await state(lost.page)).renderer,'webgl');await lost.page.locator('canvas').evaluate(c=>c.getContext('webgl').getExtension('WEBGL_lose_context').loseContext());await lost.page.waitForFunction(()=>{const s=JSON.parse(document.querySelector('#state').textContent);return s.renderer==='canvas2d'&&s.rendering;});assert.equal((await state(lost.page)).lastError.stage,'context-lost');await lost.page.getByRole('button',{name:'Ukryj kontekst',exact:true}).click();await lost.page.getByRole('button',{name:'Pokaż kontekst',exact:true}).click();await rendered(lost.page);assert.deepEqual(lost.errors,[]);}finally{await lost.page.close();}
  }
  for(const [width,height] of [[320,568],[390,844],[430,932]]){
   const event=await fixture(browser,{app:true,width,height});const {page}=event;
   try{
    await page.waitForFunction(()=>document.querySelector('.octi-dock[data-channel=main]')?.octiListening?.getState().rendering);
    await page.evaluate(()=>{showPlannerWeather=async()=>{};tasks=[{id:'layer-check',title:'Kontrola wydarzenia',date:iso(selected),time:'13:00',endTime:'14:00'}];renderAll();});
    for(let attempt=0;attempt<2;attempt++){
     await page.evaluate(()=>openEventActions(tasks[0]));
     await page.waitForFunction(()=>!window.OktiEventMotion.getState()&&document.querySelector('.octi-dock[data-channel=event]')?.octiListening?.getState().rendering);
     const layers=await page.evaluate(()=>{const main=document.querySelector('.octi-dock[data-channel=main]'),event=document.querySelector('.octi-dock[data-channel=event]'),actor=event.querySelector('.octi-listening-media'),glass=event.querySelector('.octi-motion-media'),mic=document.querySelector('#eventVoice'),rect=mic.getBoundingClientRect(),a=actor.getBoundingClientRect(),g=glass.getBoundingClientRect();return {mainPlaying:main.octiListening.getState().rendering,mainPainted:main.querySelector('.water-float').getClientRects().length>0,actorInEvent:actor.closest('#eventModal')===glass.closest('#eventModal')&&!!actor.closest('#eventModal'),sameHost:actor.parentElement===glass.parentElement,centre:Math.hypot(a.x+a.width/2-g.x-g.width/2,a.y+a.height/2-g.y-g.height/2),hit:mic.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)),filter:getComputedStyle(actor).filter};});
     assert.equal(layers.mainPlaying,false,'The background calendar does not render a second actor');assert.equal(layers.mainPainted,false,'The background actor and glass are both absent below the event shade');assert.equal(layers.actorInEvent,true);assert.equal(layers.sameHost,true,'Glass and mascot share the foreground event coordinate space');assert.ok(layers.centre<1,'Glass cannot drift away from the mascot');assert.equal(layers.hit,true);assert.equal(layers.filter,'none');
     await page.evaluate(()=>plannerRecordings.event={mode:'recording',deadline:Date.now()+RECORDING_SECONDS*1000,chunks:[]});await page.waitForFunction(()=>document.querySelector('.octi-dock[data-channel=event]').octiListening.getState().approach===1);
     await page.screenshot({path:`test-results/okti-listening/${kind}-event-${width}-${attempt}.png`});
     await page.evaluate(()=>plannerRecordings.event=null);await page.locator('#closeEvent').click();await page.waitForFunction(()=>!document.body.classList.contains('okti-event-transitioning')&&document.querySelector('.octi-dock[data-channel=main]').octiListening.getState().rendering);
    }
    assert.deepEqual(event.errors,[]);
   }finally{await page.close();}
  }
  console.log(`Okti listening ${kind}: real head-only pixels, fixed tentacles, GPU loss, autoplay recovery and transient asset failures passed.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
