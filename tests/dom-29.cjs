const {JSDOM}=require('jsdom');const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');
(async()=>{
 const html=fs.readFileSync('index.html','utf8');const dom=new JSDOM(html,{url:'https://planner.test/',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,ctx=dom.getInternalVMContext();
 Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,confirm:()=>true,alert(){},fetch:async()=>new Response(JSON.stringify({requiresAccess:true,protocolVersion:2,apiVersion:'2026.10.06.29'}))});
 w.HTMLElement.prototype.scrollIntoView=function(){};
 for(const script of w.document.querySelectorAll('script'))if(!script.src)vm.runInContext(script.textContent,ctx);
 vm.runInContext(fs.readFileSync('sync-core.js','utf8'),ctx);vm.runInContext(fs.readFileSync('google-calendar.js','utf8'),ctx);
 vm.runInContext("tasks=[{id:123,title:'Test DOM',date:'2026-10-06',time:'13:00',endTime:'13:15',notes:'',location:''}];saveTasks();renderAll();openEventActions(tasks[0]);",ctx);
 assert.equal(w.document.getElementById('actionTitle').textContent,'Test DOM');
 await vm.runInContext("processEventVoiceResult({transcription:'do 15:00',item:{...voiceEventSnapshot(tasks[0]),endTime:'15:00',changedFields:['endTime']}},123)",ctx);
 assert.equal(vm.runInContext('tasks[0].endTime',ctx),'15:00');assert.equal(vm.runInContext('tasks[0].title',ctx),'Test DOM');
 await vm.runInContext("processEventVoiceResult({transcription:'całodniowe',item:{...voiceEventSnapshot(tasks[0]),startTime:'',endTime:'',changedFields:['startTime','endTime']}},123)",ctx);
 assert.equal(vm.runInContext('tasks[0].time',ctx),'');assert.equal(vm.runInContext('tasks[0].endDate',ctx),'2026-10-07');
 vm.runInContext(`saveGoogleDeleteQueue([{googleEventId:'fake',state:'conflict',localSnapshot:{title:'<img src=x onerror="window.xssExecuted=true">'}}]);renderGoogleDeleteConflicts();`,ctx);
 assert.equal(w.document.querySelectorAll('#googleDeleteConflicts img').length,0);assert.match(w.document.getElementById('googleDeleteConflicts').textContent,/<img/);
 const record=JSON.parse(w.localStorage.getItem('moj-planer-data-v1'));assert.equal(record.data.tasks[0].endDate,'2026-10-07');
 console.log('DOM: complete scripts initialize; event edits/all-day persist; conflict HTML remains text.');dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1});
