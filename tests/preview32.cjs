const {JSDOM}=require('jsdom'),fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
const html=fs.readFileSync('preview32/index.html','utf8');
const dom=new JSDOM(html,{url:'https://2ntb8nys8z-max.github.io/Moj-planer/preview32/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,ctx=dom.getInternalVMContext();
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,confirm:()=>true,alert(){},fetch:async()=>{throw Error('Unexpected network access')}});
w.HTMLElement.prototype.scrollIntoView=function(){};
w.localStorage.setItem('moj-planer-data-v1','production-data-do-not-read');w.localStorage.setItem('moj-planer-google-connected','1');w.localStorage.setItem('moj-planer-tasks','[{"id":1,"title":"PRIVATE"}]');
const before=Object.fromEntries(Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)]));
for(const script of w.document.querySelectorAll('script'))if(!script.src)vm.runInContext(script.textContent,ctx);
vm.runInContext(fs.readFileSync('preview32/sync-core.js','utf8'),ctx);vm.runInContext(fs.readFileSync('preview32/google-calendar.js','utf8'),ctx);
assert.equal(vm.runInContext('tasks.length',ctx),0);assert.equal(vm.runInContext('initGoogleTokenClient()',ctx),false);assert.equal(w.document.getElementById('googleConnect').disabled,true);assert.equal(w.document.querySelector('script[src*="accounts.google"]'),null);
vm.runInContext("addTask('Test izolacji','2026-10-09','13:00','13:30');",ctx);
assert.equal(vm.runInContext('tasks.length',ctx),1);
for(const [key,value] of Object.entries(before))assert.equal(w.localStorage.getItem(key),value);
assert.ok(w.localStorage.getItem('planner-preview-32:moj-planer-data-v1'));
w.dispatchEvent(new w.StorageEvent('storage',{key:'moj-planer-data-v1',newValue:'other production change'}));assert.equal(vm.runInContext('PlannerData.isLocked()',ctx),false);
await assert.rejects(()=>w.plannerGoogleFetch('https://www.googleapis.com/calendar/v3/calendars/primary/events'),/wyłączona/);
w.dispatchEvent(new w.StorageEvent('storage',{key:'planner-preview-32:moj-planer-data-v1',newValue:'other preview change'}));assert.equal(vm.runInContext('PlannerData.isLocked()',ctx),true);
assert.match(html,/conversationEngine:3/);assert.match(fs.readFileSync('preview32/worker.txt','utf8'),/conversationEngines:\[2,3\]/);

const worker32=fs.readFileSync('preview32/worker.txt','utf8');
assert.match(worker32,/semantycznie potwierdzać wcześniej uzgodniony szkic/);
assert.match(worker32,/Przygotowałem zmianę\. Sprawdź ją i potwierdź\./);
assert.match(worker32,/Niczego jeszcze nie zapisano\./);

console.log('Preview32: complete scripts load; production data untouched; preview data persists; storage events isolated; Google connection and HTTP disabled; matching Worker bundled.');dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1});

assert.match(worker32,/instrukcję znakową/);
assert.match(worker32,/zamień u na ó/);
assert.match(worker32,/dodaję\|zapisuję\|zmieniam\|ustawiam/);
