const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=path.resolve('.');
async function routeFiles(page){await page.route('**/*',route=>{
 const url=new URL(route.request().url());let file=path.resolve(base,url.pathname.slice(1));
 if(url.pathname.endsWith('/qa-octi-listening.html'))file=path.join(base,'tests/fixtures/octi-listening.html');
 if(url.origin!=='https://planner.test'||!file.startsWith(base+'/')||!fs.existsSync(file))return route.fulfill({status:404,body:'missing'});
 const bytes=fs.readFileSync(file),types={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.mp4':'video/mp4'};
 if(file.endsWith('.mp4')){const range=route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;return route.fulfill({status:206,body:bytes.subarray(start,end+1),contentType:'video/mp4',headers:{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${bytes.length}`,'content-length':String(end-start+1)}})}}
 return route.fulfill({body:bytes,contentType:types[path.extname(file)]||'application/octet-stream'});
})}
const state=page=>page.locator('#state').innerText().then(JSON.parse);
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLANNER_CHROMIUM?{executablePath:process.env.PLANNER_CHROMIUM}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  for(const width of [320,390,430]){
   const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await routeFiles(page);await page.goto('https://planner.test/preview33/qa-octi-listening.html');await require('./permission-fixture.cjs').dismissInitialPermissions(page);
   await page.getByRole('button',{name:'Rozpocznij słuchanie',exact:true}).click();
   await page.waitForFunction(()=>{const s=JSON.parse(document.querySelector('#state').textContent||'{}');return s.rendering&&s.approach===1&&s.gesture===1},null,{timeout:15000});
   assert.equal((await state(page)).fallback,false,'The real GLSL renderer must run, rather than silently using its fallback');
   const pixels=await page.locator('.octi-listening-canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl'),pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let blue=0,white=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i+2]-pixels[i]>70&&pixels[i+1]>55)blue++;if(pixels[i]>235&&pixels[i+1]>235&&pixels[i+2]>235)white++}return {blue,white,width:canvas.getBoundingClientRect().width}});
   assert.ok(pixels.blue>1000&&pixels.white>50,'Actual rendered pixels contain the blue Okti and bright microphone marks');assert.ok(pixels.width<=180,'Phone test uses the actual small icon rather than an enlarged movie');
   if(width===390){await page.waitForTimeout(6200);assert.equal((await state(page)).approach,1,'Recording longer than the preview remains listening');}
   await page.getByRole('button',{name:'Zakończ słuchanie',exact:true}).click();await page.waitForTimeout(250);assert.ok((await state(page)).approach>0&&(await state(page)).approach<1);
   await page.waitForFunction(()=>{const layer=document.querySelector('.octi-listening-media'),opacity=Number(getComputedStyle(layer).opacity);return layer.classList.contains('is-rendered')&&opacity>.9});
   assert.equal(await page.locator('.octi-listening-canvas').evaluate(canvas=>getComputedStyle(canvas).opacity),'1','The rendered canvas remains visible throughout the dissolve');
   await page.waitForFunction(()=>{const s=JSON.parse(document.querySelector('#state').textContent);return s.rendering&&s.approach===0});
   await page.getByRole('button',{name:'Szybki start i stop',exact:true}).click();await page.waitForTimeout(1200);assert.equal((await state(page)).approach,0,'A short recording returns without getting stuck');
   await page.getByRole('button',{name:'Ogranicz ruch',exact:true}).click();await page.getByRole('button',{name:'Rozpocznij słuchanie',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.octi-listening-media.is-fallback'));assert.match(await page.locator('.octi-listening-fallback').getAttribute('src'),/poster/);
   await page.getByRole('button',{name:'Ukryj kontekst',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.octi-listening-media.is-active'));assert.deepEqual(errors,[]);await page.close();console.log(`Okti listening ${width}px: actual GPU pixels, held recording, smooth return and reduced motion passed.`);
  }
  for(const failure of ['no-webgl','blocked-autoplay','hanging-autoplay']){
   const page=await browser.newPage({viewport:{width:390,height:844}});
   await page.addInitScript(failure=>{if(failure==='no-webgl'){const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:original.call(this,type,...args)}}else HTMLMediaElement.prototype.play=function(){return failure==='hanging-autoplay'?new Promise(()=>{}):Promise.reject(new DOMException('Autoplay denied','NotAllowedError'))}},failure);
   await routeFiles(page);await page.goto('https://planner.test/preview33/qa-octi-listening.html');await require('./permission-fixture.cjs').dismissInitialPermissions(page);await page.getByRole('button',{name:'Rozpocznij słuchanie',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.octi-listening-media.is-fallback'),null,{timeout:10000});assert.match(await page.locator('.octi-listening-fallback').getAttribute('src'),/octi-actor-idle/);await page.getByRole('button',{name:'Zakończ słuchanie',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.octi-listening-media.is-active.is-fallback'));await page.getByRole('button',{name:'Ukryj kontekst',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.octi-listening-media.is-active'));await page.close();console.log('Okti listening fallback passed: '+failure);
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
