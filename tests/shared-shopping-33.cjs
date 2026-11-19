const fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom'),{DatabaseSync}=require('node:sqlite'),assert=require('node:assert/strict');
(async()=>{
const token='test-only-shopping-owner';
const digest=require('node:crypto').createHash('sha256').update('Bearer '+token).digest('hex');
const source=fs.readFileSync('worker.js','utf8').replace(/const SHOP_OWNER_DIGEST = '[a-f0-9]{64}'/, "const SHOP_OWNER_DIGEST = '"+digest+"'");
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const db=new DatabaseSync(':memory:');
function query(sql,args=[]){const stmt=db.prepare(sql);return{bind:(...x)=>query(sql,x),first:async()=>stmt.get(...args),run:async()=>({meta:stmt.run(...args)})}}
const env={API_LIMITS_DB:{prepare:query}},site='https://2ntb8nys8z-max.github.io/Moj-planer/';
const windows=[];
function page(file,hash){
 const dom=new JSDOM(fs.readFileSync(file,'utf8'),{url:site+file+hash,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,run=s=>vm.runInContext(s,dom.getInternalVMContext());
 windows.push(w);
 Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,confirm:()=>true,alert(){},fetch:async(url,options)=>String(url).includes('/shopping/')?worker.fetch(new Request(url,options),env):new Response('{}')});
 w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
 for(const s of w.document.querySelectorAll('script'))if(!s.src)run(s.textContent);
 return run;
}
async function wait(f){for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,30))}throw Error('condition failed: '+f)}
try{
 const o=page('index.html','#lista-roberta='+token);
 await wait(()=>o('shoppingOwner'));
 o("ideas=[normalizeIdea({title:'Lista',text:'Lista',list:{type:'shopping',items:['mleko','chleb','ser']}})];saveIdeas();openShoppingSummary();document.getElementById('shoppingCreateShared').click()");
 await wait(()=>o('shoppingCreated'));
 const id=o("shoppingStore('id')"), g=page('wspolne-zakupy.html','#'+id);
 await wait(()=>g('revision')===1);
 g("identity.showModal=()=>{};document.querySelector('#pending button').click();nick.value='Jaga';identity.returnValue='ok';identity.dispatchEvent(new Event('close'))");
 await wait(()=>g("document.querySelector('#bought').textContent.includes('(Jaga)')"));
 await o('syncSharedShopping()');assert.match(o("$('shoppingSummaryPurchased').textContent"),/mleko \(Jaga\)/);
 o("shoppingSummary.groups.find(g=>g.text==='chleb').checked=true;updateShoppingSources()");
 await wait(()=>JSON.parse(db.prepare('SELECT content FROM shared_shopping').get().content).rows.some(r=>r.by==='Robert'));await g('refresh()');assert.match(g("$('bought').textContent"),/chleb\(Robert\)/);
 assert.equal(g("document.querySelector('#shoppingOwnerActions')"),null);
 const rejected=await worker.fetch(new Request('https://example.test/shopping/publish',{method:'POST',body:'{}'}),env);assert.equal(rejected.status,403);
 const g2=page('wspolne-zakupy.html','#'+id);await wait(()=>g2('revision')>0);assert.match(g2("$('bought').textContent"),/Jaga/);
 console.log('Both sessions, membership, shared link, owner-only controls and durable signatures passed.');
}finally{windows.forEach(w=>w.close())}
})().catch(e=>{console.error(e);process.exitCode=1});
