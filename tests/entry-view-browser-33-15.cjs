const {chromium}=require(process.env.PLANNER_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const errors=[];
 try{
  for(const [width,height] of [[390,844],[320,568],[844,390]]){
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin==='https://planner.test'){const name=url.pathname==='/'?'index.html':url.pathname.slice(1);if(['index.html','sync-core.js','google-calendar.js'].includes(name))return route.fulfill({body:fs.readFileSync(path.resolve(name)),contentType:name.endsWith('.html')?'text/html':'application/javascript'});}if(route.request().resourceType()==='script')return route.fulfill({body:'',contentType:'application/javascript'});return route.fulfill({json:{requiresAccess:false,protocolVersion:2,apiVersion:'2026.10.08.33.14-test'}})});
   await page.goto('https://planner.test');
   await page.evaluate(async()=>{
    ideas=[{id:'demo',title:'Plan na ogród przy tarasie',text:'Plan na ogród przy tarasie',createdAt:'2026-10-09T12:15:00Z',location:'Großenhain · ogród przy domu',history:[{at:'2026-10-09T12:15:00Z',summary:'Utworzono wpis',kind:'created'}],additions:[],attachments:[{id:'demo-audio',type:'audio',name:'Nagranie głosowe 1',duration:48,transcript:'Potrzebuję dwóch worków ziemi ogrodowej do dużych donic. Sprawdzę też rośliny na taras.'},{id:'demo-photo',type:'image',name:'Zdjęcie notatki',ocrText:'2 worki ziemi ogrodowej\n2 duże donice'}]}];
    const canvas=document.createElement('canvas');canvas.width=360;canvas.height=240;const c=canvas.getContext('2d');c.fillStyle='#e8e2d6';c.fillRect(0,0,360,240);c.fillStyle='#fffdf5';c.fillRect(50,24,250,185);c.fillStyle='#5d604f';c.font='18px sans-serif';c.fillText('Ziemia ogrodowa',75,80);c.fillText('Duże donice',75,115);await saveVoiceMemo('demo-photo',await new Promise(r=>canvas.toBlob(r)));
    saveIdeas();renderIdeas();openIdeaActions(ideas[0]);
   });
   await page.locator('#entryTitle').waitFor();await page.waitForTimeout(400);
   const before=await page.evaluate(()=>({head:document.querySelector('.entry-header').getBoundingClientRect().top,foot:document.querySelector('.entry-footer').getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth,scroll:document.getElementById('entryScroll').scrollHeight>document.getElementById('entryScroll').clientHeight}));
   assert.equal(before.overflow,false,`horizontal overflow at ${width}`);assert.ok(before.foot<=height+1,`footer visible at ${width}`);assert.ok(before.scroll);
   await page.locator('#entryScroll').evaluate(e=>e.scrollTop=e.scrollHeight);
   const after=await page.evaluate(()=>({head:document.querySelector('.entry-header').getBoundingClientRect().top,foot:document.querySelector('.entry-footer').getBoundingClientRect().bottom}));
   assert.equal(after.head,before.head);assert.equal(after.foot,before.foot);
   await page.locator('#entryManual').click();await page.locator('#entryEditTitle').fill('Ogród — aktualny plan');await page.locator('#entrySave').click();assert.equal(await page.locator('#entryTitle').textContent(),'Ogród — aktualny plan');
   await page.locator('#ideaHistory').click();assert.equal(await page.locator('#ideaHistory').getAttribute('aria-expanded'),'true');await page.locator('#ideaHistory').click();assert.equal(await page.locator('#entryHistoryPanel').isVisible(),false);
   await page.locator('#entryScroll').evaluate(e=>e.scrollTop=0);await page.waitForTimeout(100);
   if(width===390)await page.screenshot({path:'/tmp/entry-view-phone.png'});
   await page.locator('#closeIdea').click();assert.equal(await page.locator('#ideaModal').isVisible(),false);assert.equal(await page.evaluate(()=>document.querySelector('.app').inert),false);
   await page.close();
  }
  assert.deepEqual(errors,[]);console.log('Entry view browser: 390×844, 320×568, 844×390; no horizontal overflow, fixed header/footer, scrolling, manual save, history toggle, close and no JS errors passed.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
