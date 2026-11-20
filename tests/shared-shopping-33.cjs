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
 const installed=page('index.html','');
 installed("ideas=[normalizeIdea({text:'Moje dotychczasowe zakupy',list:{type:'shopping',items:['masło']}})];saveIdeas();window.closeCount=0;document.body.append(shoppingDeviceActivation(()=>++window.closeCount));window.prompt=()=>location.href.replace(/#.*$/,'')+'#lista-roberta=test-only-shopping-owner';$('shoppingActivateDevice').click()");
 await wait(()=>installed('shoppingOwner && window.closeCount===1'));
 assert.equal(installed("$('shoppingCreateShared').hidden"),false);
 assert.match(installed("$('shoppingSummaryRows').textContent"),/masło/);
 assert.equal(installed("shoppingStore('id')"),null);
 assert.equal(installed("$('shoppingActivateDevice').hidden"),true);
 const id=o("shoppingStore('id')"), g=page('wspolne-zakupy.html','#'+id);
 await wait(()=>g('revision')===1);
 const subtitle=session=>session("$('shoppingSharedLabel').textContent");
 await o('syncSharedShopping()');
 assert.equal(subtitle(o),'Listę udostępnia Robert');assert.equal(subtitle(g),subtitle(o));
 g("identity.showModal=()=>{};document.querySelector('#pending button').click();nick.value='Jaga';identity.returnValue='ok';identity.dispatchEvent(new Event('close'))");
 await wait(()=>g("document.querySelector('#bought').textContent.includes('(Jaga)')"));
 await o('syncSharedShopping()');assert.match(o("$('shoppingSummaryPurchased').textContent"),/mleko \(Jaga\)/);
 assert.equal(subtitle(o),'Razem kupują: Robert i Jaga');assert.equal(subtitle(g),subtitle(o));
 assert.equal((await g("request('read',{})")).participantNames,undefined);
 await assert.rejects(o("shoppingRequest('read',{id:shoppingStore('id')},'incorrect')"),e=>e.status===403);
 o("shoppingSummary.groups.find(g=>g.text==='chleb').checked=true;updateShoppingSources()");
 await wait(()=>JSON.parse(db.prepare('SELECT content FROM shared_shopping').get().content).rows.some(r=>r.by==='Robert'));await g('refresh()');assert.match(g("$('bought').textContent"),/chleb\(Robert\)/);
 assert.equal(g("document.querySelector('#shoppingOwnerActions')"),null);
 const rejected=await worker.fetch(new Request('https://example.test/shopping/publish',{method:'POST',body:'{}'}),env);assert.equal(rejected.status,403);
 const g2=page('wspolne-zakupy.html','#'+id);await wait(()=>g2('revision')>0);assert.match(g2("$('bought').textContent"),/Jaga/);
 // Rename an existing link without changing its rows. A recipient cannot edit the title.
 assert.equal(g("document.getElementById('shoppingNameEdit')"),null);
 o("$('shoppingNameEdit').click();$('shoppingNameInput').value='Zakupy na sobotę';$('shoppingNameSave').click()");
 await wait(()=>JSON.parse(db.prepare('SELECT content FROM shared_shopping').get().content).title==='Zakupy na sobotę');
 await g('refresh()');assert.equal(g("$('listTitle').textContent"),'Zakupy na sobotę');
 o("closeShoppingSummary(true);openShoppingSummary()");
 assert.equal(o("$('shoppingNameText').textContent"),'Zakupy na sobotę');
 // The same display name from a second browser cannot undo the first buyer's mark.
 const owned=(guest,label)=>guest("[...$('bought').children].find(b=>b.querySelector('span').textContent==="+JSON.stringify(label)+").disabled");
 assert.equal(owned(g,'mleko'),false);assert.equal(owned(g,'chleb'),true);
 assert.equal(owned(g2,'mleko'),true);assert.equal(owned(g2,'chleb'),true);
 await g2('refresh()');
 g2("identity.showModal=()=>{};document.querySelector('#pending button').click();nick.value='Jaga';identity.returnValue='ok';identity.dispatchEvent(new Event('close'))");
 await wait(()=>g2("$('bought').textContent.includes('ser(Jaga)')"));
 await g('refresh()');
 assert.equal(owned(g2,'ser'),false);assert.equal(owned(g,'ser'),true);
 const state=await g("request('read',{})"),milk=state.rows.find(r=>r.text==='mleko').key, bread=state.rows.find(r=>r.text==='chleb').key;
 assert.ok(state.rows.every(r=>!('buyer' in r)));
 await assert.rejects(g("request('mark',{...person,keys:"+JSON.stringify([milk,bread])+",done:false,revision})"),e=>e.status===403);
 assert.equal((await g("request('read',{})")).revision,state.revision);
 g("$('bought').querySelector('button:not(:disabled)').click()");
 await wait(()=>g("$('pending').textContent.includes('mleko')"));await o('syncSharedShopping()');
 assert.ok(o("$('shoppingSummaryRows').textContent.includes('mleko')"));
 await g2('refresh()');g2("$('bought').querySelector('button:not(:disabled)').click()");
 await wait(()=>g2("$('pending').textContent.includes('ser')"));
 await o('syncSharedShopping()');
 assert.equal(subtitle(o),'Razem kupują: Robert, Jaga i Jaga','two guest identities remain after both undo their purchases');
 // Previously stored signatures are recovered only when the existing identity is unambiguous.
 const legacy=JSON.parse(db.prepare('SELECT content FROM shared_shopping').get().content);
 delete legacy.buyerVersion;
 const oldId=require('node:crypto').randomUUID(),oldActor=require('node:crypto').randomUUID();
 legacy.participants[require('node:crypto').createHash('sha256').update(oldActor).digest('hex')]='Ela';
 legacy.rows=['Ela','Jaga','Robert',''].map((by,i)=>({key:String(i),text:'Produkt '+i,done:true,by}));
 db.prepare('INSERT INTO shared_shopping VALUES (?,1,?)').run(oldId,JSON.stringify(legacy));
 async function legacyRead(actor){const response=await worker.fetch(new Request('https://example.test/shopping/read',{method:'POST',body:JSON.stringify({id:oldId,actor})}),env);return (await response.json()).rows}
 assert.deepEqual((await legacyRead(oldActor)).map(r=>r.canRestore),[true,false,false,false]);
 assert.ok((await legacyRead(g('person.actor'))).every(r=>!r.canRestore));
 o("$('shoppingNameEdit').click();$('shoppingNameInput').value='Porzucona nazwa';$('shoppingNameCancel').click()");
 assert.equal(o("shoppingStore('title')"),'Zakupy na sobotę');
 // Exercise start/stop, isolated transcription, draft preview, correction and save.
 o(`window.stoppedTracks=0;window.transcriptions=0;
   navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop(){stoppedTracks++}}]})};
   window.MediaRecorder=class{state='inactive';mimeType='audio/mp4';start(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['sample'])});this.onstop()}};
   plannerAudioPayload=async()=>({type:'audio/mp4',base64:'c2FtcGxl'});
   plannerApiRequest=async(path,opts)=>{if(JSON.parse(opts.body).operation!=='transcribe_audio')throw Error('wrong operation');transcriptions++;return {transcription:'Dla Zosi'}};
   $('shoppingNameEdit').click();$('shoppingNameVoice').click();`);
 await wait(()=>o("titleRecording?.recorder?.state==='recording'"));
 o("$('shoppingNameVoice').click()");await wait(()=>o("titleRecording===null"));
 assert.equal(o("$('shoppingNameInput').value"),'Dla Zosi');assert.equal(o('transcriptions'),1);
 assert.ok(o('stoppedTracks')>=1);assert.equal(o("shoppingStore('title')"),'Zakupy na sobotę');
 o("$('shoppingNameInput').value='Dla Zosi i Roberta';$('shoppingNameSave').click()");
 await wait(()=>JSON.parse(db.prepare('SELECT content FROM shared_shopping').get().content).title==='Dla Zosi i Roberta');
 // Only completion of native sharing launches the folding close.
 o("navigator.share=async()=>{throw new DOMException('cancelled','AbortError')}");
 await o('sendShoppingLink()');assert.ok(o('!!shoppingSummary && !shoppingPaperMotion?.closing'));
 o("navigator.share=undefined;navigator.clipboard={writeText:async url=>window.copied=url}");
 await o('sendShoppingLink()');assert.ok(o('!!shoppingSummary'));assert.ok(o('copied').endsWith('#'+id));
 o("navigator.share=()=>new Promise(resolve=>window.completeShare=resolve);window.launchCount=0;startShoppingPaper=(closing,plane)=>{if(closing&&plane)launchCount++;finishShoppingSummaryClose()}");
 const sharing=o('sendShoppingLink()');await o('sendShoppingLink()');assert.equal(o('launchCount'),0);o('completeShare()');await sharing;
 assert.equal(o('launchCount'),1);assert.equal(o('shoppingSummary'),null);
 // A second send of the existing sheet gives the third person the same list and title.
 const host=installed;
 host("ideas=[normalizeIdea({text:'Wyjazd',list:{type:'shopping',items:['woda','sok']}})];saveIdeas();openShoppingSummary();$('shoppingCreateShared').click()");
 await wait(()=>host('shoppingCreated'));
 host("$('shoppingNameEdit').click();$('shoppingNameInput').value='Na wyjazd';$('shoppingNameSave').click()");
 await wait(()=>!host('shoppingSyncBusy'));
 host("navigator.share=undefined;navigator.clipboard={writeText:async url=>window.sharedLink=url}");
 await host('sendShoppingLink()');
 const invite=host('sharedLink');
 const zosia=page('wspolne-zakupy.html',new URL(invite).hash);
 async function join(session,nick){
   session("identity.showModal=()=>{};document.querySelector('#pending button').click();$('nick').value="+JSON.stringify(nick)+";identity.returnValue='ok';identity.dispatchEvent(new Event('close'))");
   await wait(()=>session('!busy'));
 }
 await wait(()=>zosia('revision')>0);
 assert.equal(subtitle(zosia),'Listę udostępnia Robert');assert.equal(zosia("$('listTitle').textContent"),'Na wyjazd');
 await join(zosia,'Zosia');await host('syncSharedShopping()');
 assert.equal(subtitle(zosia),'Razem kupują: Robert i Zosia');assert.equal(subtitle(host),subtitle(zosia));
 await host('sendShoppingLink()');assert.equal(host('sharedLink'),invite);
 const ania=page('wspolne-zakupy.html',new URL(host('sharedLink')).hash);
 await wait(()=>ania('revision')>0);assert.equal(subtitle(ania),subtitle(zosia));
 await join(ania,'Ania');await zosia('refresh()');await host('syncSharedShopping()');
 for(const session of [host,zosia,ania])assert.equal(subtitle(session),'Razem kupują: Robert, Zosia i Ania');
 assert.equal(ania("$('listTitle').textContent"),'Na wyjazd');
 assert.equal(host("$('shoppingSharedLabel').closest('header')!==null && !$('shoppingSharedLabel').hidden"),true);
 // Exercise the ink → confirmed move → landing sequence with a visible row.
 const moving=page('wspolne-zakupy.html','#'+id);
 await wait(()=>moving('revision')>0);
 moving(`person={actor:crypto.randomUUID(),nick:'Gość'};
   const realRequest=request;
   const pendingRow=$('pending').querySelector('button');
   pendingRow.getClientRects=()=>[{}];
   Object.defineProperty(HTMLElement.prototype,'getBoundingClientRect',{value:function(){
     const y=this.closest('#bought')?300:100;
     return {left:18,top:y,bottom:y+46,width:300,height:46};
   }});
   request=(action,body)=>action==='mark'
     ? new Promise((resolve,reject)=>{window.confirmPurchase=()=>realRequest(action,body).then(resolve,reject)})
     : realRequest(action,body);
   pendingRow.click();`);
 assert.equal(moving("pendingRow.classList.contains('is-marking')"),true);
 assert.equal(moving("document.querySelector('.item-flight')"),null);
 await new Promise(r=>setTimeout(r,360));
 assert.equal(moving("pendingRow.isConnected && !document.querySelector('details').open"),true,'await a successful save even after the tick finishes');
 await moving('confirmPurchase()');
 await wait(()=>moving("!!document.querySelector('.item-flight')"));
 assert.equal(moving("document.querySelector('details').open && !!$('bought').querySelector('.landing')"),true);
 assert.equal(moving("document.querySelector('.item-flight').matches('span') && !document.querySelector('.item-flight').childElementCount"),true);
 assert.equal(moving("document.querySelector('.item-flight').textContent"),moving("pendingRow.querySelector('.item-name').textContent"));
 assert.equal(moving("document.querySelector('.item-flight').style.top"),'100px');
 await wait(()=>moving('!busy'));
 assert.equal(moving("document.querySelector('.item-flight,.landing')"),null);
 // Reverse the same purchase. The signed row stays put until the save succeeds.
 moving(`const restored=$('bought').querySelector('button:not(:disabled)');restored.getClientRects=()=>[{}];restored.click()`);
 assert.equal(moving("restored.classList.contains('is-unmarking')"),true);
 assert.equal(moving("restored.isConnected && !document.querySelector('.item-flight')"),true);
 await moving('confirmPurchase()');
 await wait(()=>moving("!!$('pending').querySelector('.landing')"));
 assert.equal(moving("document.querySelector('.item-flight').style.top"),'300px');
 assert.equal(moving("document.querySelector('.item-flight').textContent"),moving("restored.querySelector('.item-name').textContent"));
 assert.equal(moving("document.querySelector('.item-flight').childElementCount"),0);
 await wait(()=>moving('!busy'));
 assert.equal(moving("document.querySelector('.item-flight,.landing')"),null);
 assert.equal(moving("$('pending').textContent.includes(restored.querySelector('.item-name').textContent)"),true);
 moving(`request=async()=>{throw new Error('Brak połączenia')};$('pending').querySelector('button').click()`);
 await wait(()=>moving('!busy'));
 assert.equal(moving("$('pending').querySelector('.is-marking')"),null);
 assert.equal(moving("$('status').textContent"),'Brak połączenia');
 // Exercise actual taps on the installed owner sheet, including sync and reverse moves.
 const phone=page('index.html','#lista-roberta='+token);
 await wait(()=>phone('shoppingOwner'));
 phone(`ideas=[normalizeIdea({text:'Zakupy',list:{type:'shopping',items:['Gruszki 2 kg','Kawa']}})];
   saveIdeas();openShoppingSummary();cancelShoppingPaper();$('shoppingCreateShared').click();`);
 await wait(()=>phone('shoppingCreated && !shoppingSyncBusy'));
 const recipient=page('wspolne-zakupy.html','#'+phone("shoppingStore('id')"));
 await wait(()=>recipient('revision')>0);
 phone(`HTMLElement.prototype.getBoundingClientRect=function(){
   const y=this.closest('#shoppingSummaryPurchased')?400:120;
   return {left:65,top:y,bottom:y+28,width:160,height:28};
 };
 HTMLElement.prototype.getClientRects=function(){return [this.getBoundingClientRect()]};
 document.querySelector('#shoppingSummaryRows input').click()`);
 assert.equal(phone("!!document.querySelector('#shoppingSummaryRows .is-marking')"),true);
 await wait(()=>phone("!!document.querySelector('#shoppingSummaryPurchased .landing')"));
 assert.equal(phone("document.querySelector('.item-flight').textContent"),'Gruszki');
 await wait(()=>phone('!shoppingInkBusy && !shoppingSyncBusy'));
 await recipient('refresh()');
 assert.equal(recipient("document.querySelector('#bought button').disabled"),true);
 assert.match(recipient("$('bought').textContent"),/Gruszki 2 kg\(Robert\)/);
 phone("document.querySelector('#shoppingSummaryPurchased input').click()");
 await wait(()=>phone("!!document.querySelector('#shoppingSummaryRows .landing')"));
 assert.equal(phone("document.querySelector('.item-flight').style.top"),'400px');
 await wait(()=>phone('!shoppingInkBusy && !shoppingSyncBusy'));
 await recipient('refresh()');
 assert.ok(recipient("$('pending').textContent.includes('Gruszki 2 kg')"));
 await join(recipient,'Zosia');
 const incoming=phone('syncSharedShopping()');
 await wait(()=>phone("!!document.querySelector('#shoppingSummaryPurchased .landing')"));
 await incoming;
 assert.match(phone("$('shoppingSummaryPurchased').textContent"),/Zosia/);
 recipient("document.querySelector('#bought button:not(:disabled)').click()");
 await wait(()=>recipient('!busy'));
 const undo=phone('syncSharedShopping()');
 await wait(()=>phone("!!document.querySelector('#shoppingSummaryRows .landing')"));
 await undo;
 assert.equal(phone("document.querySelector('.item-flight,.landing')"),null);
 // An undo can arrive while the first publish response is still on its way back.
 phone(`const transport=shoppingRequest;let delayOne=true;
   shoppingRequest=async(...args)=>{
     const response=await transport(...args);
     if(args[0]==='publish'&&delayOne){delayOne=false;await new Promise(r=>window.releasePublish=r)}
     return response;
   };
   document.querySelector('#shoppingSummaryRows input').click()`);
 await wait(()=>phone('!!window.releasePublish && !shoppingInkBusy'));
 phone("document.querySelector('#shoppingSummaryPurchased input').click();releasePublish()");
 await wait(()=>phone('!shoppingInkBusy && !shoppingSyncBusy'));
 await recipient('refresh()');
 assert.ok(recipient("$('pending').textContent.includes('Gruszki 2 kg')"));
 assert.ok(phone("!ideas[0].list.items[0].done"));
 console.log('Both sessions, membership, shared link, owner-only controls and durable signatures passed.');
}finally{windows.forEach(w=>w.close())}
})().catch(e=>{console.error(e);process.exitCode=1});
