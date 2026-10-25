// Reproduce the approved logo media from its editable artwork and periodic rig.
// Requires the existing Playwright dependency, Chromium and ffmpeg.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),art=path.join(root,'artwork/okti-motion'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'okti-motion-'));
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLANNER_CHROMIUM?{executablePath:process.env.PLANNER_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:500,height:500}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const u=new URL(route.request().url()),file=path.resolve(art,u.pathname==='/'?'scene.html':u.pathname.slice(1));if(u.origin!=='https://okti-art.test'||!file.startsWith(art+'/'))return route.abort();return route.fulfill({body:fs.readFileSync(file),contentType:{'.html':'text/html','.js':'application/javascript','.json':'application/json','.webp':'image/webp'}[path.extname(file)]});});
  await page.goto('https://okti-art.test/');await page.waitForFunction(()=>window.ready||window.failed);assert.equal(await page.evaluate(()=>window.failed),undefined);
  const seam=await page.evaluate(()=>{rig.draw(0);const start=rig.positions();rig.draw(rig.period);return Math.max(...rig.positions().map((v,i)=>Math.abs(v-start[i])))});assert.ok(seam<.001,'The continuous phase must close without a reversed segment');
  const fps=60,count=288;
  for(let i=0;i<count;i++){await page.evaluate(t=>render(t),i/fps);const bytes=await page.locator('#result').evaluate(c=>c.toDataURL('image/png').split(',')[1]);fs.writeFileSync(path.join(temp,'frame-'+String(i).padStart(3,'0')+'.png'),Buffer.from(bytes,'base64'));}
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
 try{
  const video=path.join(temp,'motion.mp4'),poster=path.join(temp,'poster.webp'),fallback=path.join(temp,'motion.webp');
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-framerate','60','-i',path.join(temp,'frame-%03d.png'),'-vf','scale=544:544','-an','-c:v','libx264','-profile:v','baseline','-level','3.1','-pix_fmt','yuv420p','-preset','slow','-crf','21','-movflags','+faststart','-y',video]);
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-i',path.join(temp,'frame-000.png'),'-vf','scale=544:544','-frames:v','1','-c:v','libwebp','-quality','92','-y',poster]);
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-framerate','60','-i',path.join(temp,'frame-%03d.png'),'-vf','scale=320:320','-an','-c:v','libwebp_anim','-quality','84','-loop','0','-y',fallback]);
  fs.copyFileSync(video,path.join(root,'octi-water-motion.mp4'));fs.copyFileSync(poster,path.join(root,'octi-water-motion-poster.webp'));
  fs.copyFileSync(fallback,path.join(root,'octi-water-motion.webp'));
  console.log('Rendered continuous Okti motion: 4.8 seconds, 60 fps, forward phase only; stable microphone-shaped head.');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{fs.rmSync(temp,{recursive:true,force:true});console.error(error);process.exitCode=1});
