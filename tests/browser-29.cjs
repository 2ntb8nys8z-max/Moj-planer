const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',async route=>{const u=route.request().url();if(u.startsWith('http://127.0.0.1:8080'))return route.continue();if(u.endsWith('/api-info'))return route.fulfill({contentType:'application/json',body:JSON.stringify({requiresAccess:true,protocolVersion:2,apiVersion:'2026.10.06.29'})});return route.abort();});
 await page.goto('http://127.0.0.1:8080/');await page.waitForFunction(()=>typeof PlannerSyncCore!=='undefined'&&typeof preparePlannerSave==='function');
 await page.evaluate(()=>{
  tasks=[{id:123,title:'Test przeglądarki',date:'2026-10-06',time:'13:00',endTime:'13:15',notes:'',location:''}];saveTasks();renderAll();openEventActions(tasks[0]);
 });
 assert.match(await page.locator('#actionTitle').innerText(),/Test przeglądarki/);
 await page.evaluate(()=>processEventVoiceResult({transcription:'do 15:00',item:{...voiceEventSnapshot(tasks[0]),endTime:'15:00',changedFields:['endTime']}},123));
 assert.equal(await page.evaluate(()=>tasks[0].endTime),'15:00');assert.equal(await page.evaluate(()=>tasks[0].title),'Test przeglądarki');
 await page.evaluate(()=>processEventVoiceResult({transcription:'całodniowe',item:{...voiceEventSnapshot(tasks[0]),startTime:'',endTime:'',changedFields:['startTime','endTime']}},123));
 assert.equal(await page.evaluate(()=>tasks[0].time),'');assert.equal(await page.evaluate(()=>tasks[0].endDate),'2026-10-07');
 // Verify conflict title is inert HTML, using the actual browser DOM.
 await page.evaluate(()=>{
  window.xssExecuted=false;
  saveGoogleDeleteQueue([{googleEventId:'fake',state:'conflict',localSnapshot:{title:'<img src=x onerror="window.xssExecuted=true">'}}]);renderGoogleDeleteConflicts();
 });
 assert.equal(await page.locator('#googleDeleteConflicts img').count(),0);assert.equal(await page.evaluate(()=>window.xssExecuted),false);
 await page.reload();await page.waitForFunction(()=>typeof tasks!=='undefined'&&tasks.length===1);
 assert.equal(await page.evaluate(()=>tasks[0].title),'Test przeglądarki');assert.equal(await page.evaluate(()=>tasks[0].endDate),'2026-10-07');
 assert.deepEqual(errors,[]);console.log('Browser: load, voice edit, all-day conversion, persisted reload, conflict XSS passed.');
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
