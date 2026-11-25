const fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom'),{DatabaseSync}=require('node:sqlite'),assert=require('node:assert/strict');
(async()=>{
const token='test-only-shopping-owner';
const digest=require('node:crypto').createHash('sha256').update('Bearer '+token).digest('hex');
const source=fs.readFileSync('worker.js','utf8').replace(/const SHOP_OWNER_DIGEST = '[a-f0-9]{64}'/, "const SHOP_OWNER_DIGEST = '"+digest+"'");
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const db=new DatabaseSync(':memory:');
function query(sql,args=[]){const stmt=db.prepare(sql);return{bind:(...x)=>query(sql,x),first:async()=>stmt.get(...args),all:async()=>({results:stmt.all(...args)}),run:async()=>({meta:stmt.run(...args)})}}
const env={API_LIMITS_DB:{prepare:query}},site='https://2ntb8nys8z-max.github.io/Moj-planer/';
const windows=[];
function page(file,hash,stored){
 const dom=new JSDOM(fs.readFileSync(file,'utf8'),{url:site+file+hash,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,run=s=>vm.runInContext(s,dom.getInternalVMContext());
 windows.push(w);
 if(stored)for(const [key,value] of Object.entries(stored))w.localStorage.setItem(key,value);
 Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,confirm:()=>true,alert(){},fetch:async(url,options)=>String(url).includes('/shopping/')?worker.fetch(new Request(url,options),env):new Response('{}')});
 w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
 for(const s of w.document.querySelectorAll('script'))if(!s.src)run(s.textContent);
 return run;
}
async function wait(f){for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,30))}throw Error('condition failed: '+f)}
async function seedLegacyList(owner,products,{inviteOnly=false}={}){
 const id=require('node:crypto').randomUUID();
 await owner("shoppingRequest('publish',"+JSON.stringify({id,revision:0,inviteOnly,rows:products.map(text=>({key:crypto.randomUUID(),text,done:false,by:''}))})+",shoppingStore('owner'))");
 owner("saveShopping('id',"+JSON.stringify(id)+")");
}
try{
 const o=page('index.html','#lista-roberta='+token);
 await wait(()=>o('shoppingOwner'));await seedLegacyList(o,['mleko','chleb','ser']);
 o("ideas=[normalizeIdea({title:'Lista',text:'Lista',list:{type:'shopping',items:['Produkt prywatny']}})];saveIdeas();openShoppingSummary();document.getElementById('shoppingResumeLegacy').click()");
 await wait(()=>o('shoppingCreated'));
 assert.equal(o('shoppingLocalRows().size'),3);
 assert.deepEqual(JSON.parse(o('JSON.stringify(ideas[0].list.items.map(item=>item.text))')),['Produkt prywatny']);
 const stored=JSON.parse(o('JSON.stringify(localStorage)'));
 // An installed 33.370 planner already has owner credentials, an ID and a published baseline.
 delete stored[o("shoppingPrivatePrefix+'legacy-cache:'+shoppingStore('id')")];
 stored[o("shoppingPrivatePrefix+'base'")]=o('JSON.stringify(legacyShoppingBase)');
 const upgraded=page('index.html','',stored);
 await wait(()=>upgraded('shoppingOwner'));
 await upgraded("openShoppingSummary();addIdea({text:'Nowe zakupy',list:{type:'shopping',items:['Tylko dla mnie']}});syncSharedShopping()");
 assert.match(upgraded("$('shoppingSummaryRows').textContent"),/Produkt prywatny/);
 assert.doesNotMatch(upgraded("$('shoppingSummaryRows').textContent"),/mleko/);
 const remoteBefore=await upgraded("shoppingRequest('read',{id:shoppingStore('id')},shoppingStore('owner'))");
 assert.deepEqual(Array.from(remoteBefore.rows,r=>r.text),['mleko','chleb','ser']);
 const installed=page('index.html','');
 installed("ideas=[normalizeIdea({text:'Moje dotychczasowe zakupy',list:{type:'shopping',items:['masło']}})];saveIdeas();window.closeCount=0;document.body.append(shoppingDeviceActivation(()=>++window.closeCount));window.prompt=()=>location.href.replace(/#.*$/,'')+'#lista-roberta=test-only-shopping-owner';$('shoppingActivateDevice').click()");
 await wait(()=>installed('shoppingOwner && window.closeCount===1'));
 assert.equal(installed("$('shoppingCreateShared').hidden"),false);
 assert.match(installed("$('shoppingSummaryRows').textContent"),/masło/);
 assert.equal(installed("shoppingStore('id')"),null);
 assert.equal(installed("$('shoppingActivateDevice').hidden"),true);
 const id=o("shoppingStore('id')"), g=page('wspolne-zakupy.html','#'+id);
 await wait(()=>g('revision')>=1);
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
 o("closeShoppingSummary(true);openLegacyShopping()");
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
 await o('prepareShoppingInvite()');await o('sendShoppingLink()');assert.ok(o('!!shoppingSummary && !shoppingPaperMotion?.closing'));
 o("navigator.share=undefined;navigator.clipboard={writeText:async url=>window.copied=url}");
 await o('sendShoppingLink()');assert.ok(o('!!shoppingSummary'));assert.equal(new URLSearchParams(new URL(o('copied')).hash.slice(1)).get('lista'),id);
 o("navigator.share=()=>new Promise(resolve=>window.completeShare=resolve);window.launchCount=0;startShoppingPaper=(closing,plane)=>{if(closing&&plane)launchCount++;finishShoppingSummaryClose()}");
 await o('prepareShoppingInvite()');const sharing=o('sendShoppingLink()');await o('sendShoppingLink()');assert.equal(o('launchCount'),0);o('completeShare()');await sharing;
 assert.equal(o('launchCount'),1);assert.equal(o('shoppingSummary'),null);
 // Each invitation is independent, with a browser-bound membership and per-person write permissions.
 const host=installed;
 // Resume a previously allocated invitation-only list, as a 33.370 installation would.
 await seedLegacyList(host,['woda','sok'],{inviteOnly:true});
 assert.equal(host("$('shoppingLimitInvite')"),null);
 host("ideas=[normalizeIdea({text:'Wyjazd',list:{type:'shopping',items:['woda','sok']}})];saveIdeas();openShoppingSummary();$('shoppingResumeLegacy').click()");
 await wait(()=>host('shoppingCreated'));
 assert.ok(host('shoppingInviteState.inviteOnly'));
 await assert.rejects(host("shoppingRequest('read',{id:shoppingStore('id')})"),e=>e.status===403);
 host("$('shoppingNameEdit').click();$('shoppingNameInput').value='Na wyjazd';$('shoppingNameSave').click()");
 await wait(()=>!host('shoppingSyncBusy'));
 host("navigator.share=undefined;navigator.clipboard={writeText:async url=>window.sharedLink=url}");
 // Previously issued single-use links still have their original semantics.
 const listId=host("shoppingStore('id')");
 async function oldInvitation(seats){
   const token=crypto.randomUUID();
   assert.equal((await shop('invite',{invite:token,canAdd:true,seats},true)).status,200);
   return site+'wspolne-zakupy.html#'+new URLSearchParams({lista:listId,zaproszenie:token});
 }
 const invite=await oldInvitation(1);
 const zosia=page('wspolne-zakupy.html',new URL(invite).hash);
 async function join(session,nick){
   session("identity.showModal=()=>{};document.querySelector('#pending button').click();$('nick').value="+JSON.stringify(nick)+";identity.returnValue='ok';identity.dispatchEvent(new Event('close'))");
   await wait(()=>session('!busy'));
 }
 async function accept(session,nick){
   await wait(()=>session("!$('joinForm').hidden && !$('joinForm').querySelector('button').disabled"));
   await session("$('joinNick').value="+JSON.stringify(nick)+";$('joinForm').onsubmit({preventDefault(){}})");
   assert.ok(session("revision>0&&!gated"));
 }
 await wait(()=>zosia("!$('joinForm').hidden && !$('joinForm').querySelector('button').disabled"));
 assert.equal(zosia("document.querySelector('main').hidden && !$('pending').children.length"),true);
 assert.equal(zosia("$('joinNick').placeholder"),'Wpisz swoje imię (nick)');
 assert.equal(zosia("$('joinNick').getAttribute('aria-label')"),'Wpisz swoje imię (nick)');
 assert.equal(zosia("$('joinForm').querySelector('[type=submit]').textContent"),'Zatwierdź');
 assert.equal(zosia("$('animationSounds').getAttribute('aria-checked')"),'true');
 zosia("$('animationSounds').click()");
 assert.equal(zosia("$('flightSound').muted"),true);
 assert.equal(zosia("$('flightReplay')"),null);
 assert.equal(zosia("$('openAddProduct').textContent"),'Dodaj');
 assert.equal(zosia("$('joinMessage').textContent"),'');
 await accept(zosia,'Zosia');await host('syncSharedShopping()');
 assert.equal(subtitle(zosia),'Razem kupują: Robert i Zosia');assert.equal(subtitle(host),subtitle(zosia));
 assert.equal(zosia("$('listTitle').textContent"),'Na wyjazd');
 const forwarded=page('wspolne-zakupy.html',new URL(invite).hash);
 await wait(()=>forwarded("$('joinMessage').textContent.includes('wykorzystane')"));
 assert.ok(forwarded("gated && $('pending').childElementCount===0"));
 const returning=page('wspolne-zakupy.html',new URL(invite).hash,JSON.parse(zosia('JSON.stringify(localStorage)')));
 await wait(()=>returning('revision>0'));assert.equal(subtitle(returning),subtitle(zosia));
 assert.equal(returning("$('animationSounds').getAttribute('aria-checked')"),'false');
 assert.equal(returning("$('flightSound').muted"),true);
 await assert.rejects(forwarded("request('read',{})"),e=>e.status===403);
 await assert.rejects(forwarded("request('mark',{...person,keys:[],done:true,revision})"),e=>e.status===403);
 assert.equal(zosia("$('addProductForm').hidden"),false);
 assert.equal(zosia("$('newProduct').hidden"),true);
 zosia("$('openAddProduct').click()");
 assert.equal(zosia("$('newProduct').hidden"),false);
 assert.equal(zosia("$('openAddProduct').closest('[hidden]')"),null);
 await zosia('refresh()');
 assert.equal(zosia("$('newProduct').hidden"),false);
 zosia("$('openAddProduct').click()");
 assert.equal(zosia("$('newProduct').hidden"),true);
 await zosia("$('openAddProduct').click();$('newProduct').value='Marchew 2 kg';$('addProductForm').onsubmit({preventDefault(){}})");
 await host('syncSharedShopping()');assert.match(host("$('shoppingSummaryRows').textContent"),/Marchew/);
 assert.equal(host("shoppingLocalRows().size"),3);
 host("$('shoppingInviteAdd').checked=false");
 await host('prepareShoppingInvite()');await host('sendShoppingLink()');assert.notEqual(host('sharedLink'),invite);
 const ania=page('wspolne-zakupy.html',new URL(host('sharedLink')).hash);
 await accept(ania,'Ania');await zosia('refresh()');await host('syncSharedShopping()');
 for(const session of [host,zosia,ania])assert.equal(subtitle(session),'Razem kupują: Robert, Zosia i Ania');
 assert.match(ania("$('pending').textContent"),/Marchew 2 kg/);
 assert.equal(ania("$('addProductForm').hidden"),true);
 await assert.rejects(ania("request('add',{text:'Produkt',itemId:crypto.randomUUID()})"),e=>e.status===403);
 assert.equal(ania("$('listTitle').textContent"),'Na wyjazd');
 assert.equal(host("$('shoppingSharedLabel').closest('header')!==null && !$('shoppingSharedLabel').hidden"),true);
 // Authorship, purchases and deletion belong to independent identities.
 const carrot=(await zosia("request('read',{})")).rows.find(row=>row.text==='Marchew 2 kg');
 assert.equal(carrot.authorMark,'Z');assert.equal(carrot.canDelete,true);
 assert.equal(host("document.querySelector('.shopping-author').textContent"),'(Zosia)');
 assert.ok(zosia("document.querySelector('.item-name .shopping-author').textContent==='(Zosia)'"));
 assert.equal((await zosia("request('read',{})")).rows.find(r=>r.text==='woda').authorMark,undefined);
 const ownBin=zosia("document.querySelector('.shopping-item-trash')");
 zosia("document.querySelector('.shopping-item-options').click()");
 assert.equal(ownBin.hidden,false);
 await wait(()=>ownBin.hidden);assert.ok(!carrot.done);
 await assert.rejects(ania("request('remove',{key:"+JSON.stringify(carrot.key)+"})"),e=>e.status===403);
 await ania("request('mark',{keys:["+JSON.stringify(carrot.key)+"],done:true,revision})");
 await zosia('refresh()');await host('syncSharedShopping()');
 const signed=(await zosia("request('read',{})")).rows.find(r=>r.key===carrot.key);
 assert.equal(signed.by,'Ania');assert.equal(signed.authorName,'Zosia');
 assert.equal(signed.canRestore,false);assert.equal(signed.canDelete,true);
 const staleCopy=(await host("shoppingRequest('read',{id:shoppingStore('id')},shoppingStore('owner'))")).rows;
 await zosia("document.querySelector('#bought .shopping-item-options').click();document.querySelector('#bought .shopping-item-trash').onclick()");
 await host('syncSharedShopping()');await ania('refresh()');
 assert.equal(host("shoppingLocalRows().size"),2);assert.doesNotMatch(ania("$('bought').textContent"),/Marchew/);
 const staleRevision=(await host("shoppingRequest('read',{id:shoppingStore('id')},shoppingStore('owner'))")).revision;
 const latePublish=await host("shoppingRequest('publish',{id:shoppingStore('id'),revision:"+staleRevision+",rows:"+JSON.stringify(staleCopy)+"},shoppingStore('owner'))");
 assert.ok(!latePublish.rows.some(r=>r.key===carrot.key));
 await zosia('refresh()');
 await zosia("request('mark',{keys:[...document.querySelectorAll('#pending .item')].find(b=>b.shoppingGroup.text==='woda').shoppingGroup.keys,done:true,revision})");
 await host('syncSharedShopping()');
 await wait(()=>host('!shoppingSyncBusy'));
 // A poll sent before revocation can arrive after the access panel confirms it.
 const previousAccess=await host("shoppingRequest('read',{id:shoppingStore('id')},shoppingStore('owner'))");
 host("window.normalShoppingRequest=shoppingRequest;window.delayedShoppingRead="+JSON.stringify(previousAccess));
 host("shoppingRequest=(action,...args)=>action==='read'?Promise.resolve(window.delayedShoppingRead):normalShoppingRequest(action,...args)");
 host("$('shoppingInviteMembers').querySelector('li button').onclick()");
 await host("$('shoppingConfirmRevoke').onclick()");
 await zosia('refresh()');assert.ok(zosia("gated && document.querySelector('main').hidden"));
 assert.equal(subtitle(host),'Razem kupują: Robert i Ania','a stale poll cannot reinstate a revoked name');
 host("shoppingRequest=window.normalShoppingRequest");
 await ania('refresh()');
 assert.equal(subtitle(ania),subtitle(host));
 assert.match(ania("$('bought').textContent"),/woda\(Zosia\)/);
 host(`document.querySelector('[aria-label="Usuń dostęp: Ania"]').click()`);
 await host("$('shoppingConfirmRevoke').onclick()");
 assert.equal(subtitle(host),'Listę udostępnia Robert');
 host(`document.querySelector('[aria-label="Przywróć dostęp: Ania"]').click()`);
 await wait(()=>subtitle(host)==='Razem kupują: Robert i Ania');
 await assert.rejects(returning("request('read',{})"),e=>e.status===403);
 assert.match((await ania("request('read',{})")).shoppersLabel,/Robert i Ania/);
 // A preview does not claim a slot. Two simultaneous acceptances yield only one membership.
 const raceLink=require('node:crypto').randomUUID();
 async function shop(action,body,owner=false){
   const headers=owner?{Authorization:'Bearer '+token}:{};
   const response=await worker.fetch(new Request('https://planner.test/shopping/'+action,{method:'POST',headers,body:JSON.stringify({id:listId,...body})}),env);
   return {status:response.status,data:await response.json()};
 }
 // Upgrade an old open link with a signed-in guest and outstanding bounded invitations.
 const oldSheet=crypto.randomUUID(),oldOpen=crypto.randomUUID(),oldLimited=crypto.randomUUID(),keep=crypto.randomUUID();
 const legacyCall=(action,data,owner=false)=>shop(action,{id:oldSheet,...data},owner);
 await legacyCall('publish',{revision:0,rows:[{key:'milk',text:'Mleko',done:false,by:''}]},true);
 await legacyCall('open-invite',{invite:oldOpen,canAdd:true},true);
 await legacyCall('join',{invite:oldOpen,actor:keep,nick:'Maja'});
 await legacyCall('invite',{invite:oldLimited,seats:2,canAdd:true},true);
 const replacement={invite:crypto.randomUUID(),seats:1,canAdd:true,additional:true,generation:0};
 assert.equal((await legacyCall('counted-invite',replacement)).status,403);
 const issued=await legacyCall('counted-invite',replacement,true);
 assert.equal(issued.data.inviteSeats,3);
 assert.equal((await legacyCall('counted-invite',replacement,true)).data.revision,issued.data.revision);
 assert.equal((await legacyCall('counted-invite',{...replacement,invite:crypto.randomUUID()},true)).status,409);
 for(const invite of [oldOpen,oldLimited])assert.equal((await legacyCall('invite-info',{invite})).data.available,false);
 assert.equal((await legacyCall('read',{actor:keep})).data.rows[0].text,'Mleko');
 assert.equal((await legacyCall('invite-info',{invite:replacement.invite})).data.available,true);
 const limitedClaims=await Promise.all(['A','B','C','D'].map(nick=>legacyCall('join',{invite:replacement.invite,nick,actor:crypto.randomUUID()})));
 assert.deepEqual(limitedClaims.map(r=>r.status).sort(),[200,200,200,403]);
 await shop('invite',{invite:raceLink,canAdd:true},true);
 assert.deepEqual((await shop('invite-info',{invite:raceLink})).data,{available:true,used:false});
 const claims=['Ola','Iga'].map(nick=>({actor:require('node:crypto').randomUUID(),nick,invite:raceLink}));
 const accepted=await Promise.all(claims.map(c=>shop('join',c)));
 assert.equal(accepted.filter(r=>r.status===200).length,1);
 const winner=claims[accepted.findIndex(r=>r.status===200)],other=claims[accepted.findIndex(r=>r.status!==200)];
 assert.equal((await shop('join',other)).status,403);
 assert.equal((await shop('read',other)).status,403);
 assert.equal((await shop('join',winner)).status,200);
 const add={actor:winner.actor,itemId:require('node:crypto').randomUUID(),text:'Ogórek'};
 await shop('add',add);await shop('add',add);
 let snapshot=(await shop('read',{},true)).data;
 const fresh=snapshot.rows.find(r=>r.text==='Ogórek');assert.ok(fresh.addedId);
 assert.equal(snapshot.rows.filter(r=>r.text==='Ogórek').length,1);
 const publish={rows:snapshot.rows.filter(r=>r.key!==fresh.key),revision:snapshot.revision};
 snapshot=(await shop('publish',publish,true)).data;
 assert.ok(snapshot.rows.some(r=>r.key===fresh.key),'older owner must not discard unimported products');
 snapshot=(await shop('publish',{...publish,revision:snapshot.revision,removed:[fresh.key]},true)).data;
 assert.ok(!snapshot.rows.some(r=>r.key===fresh.key),'honour an intentional owner deletion');
 assert.equal((await shop('revoke',{key:snapshot.invitations[0].key})).status,403);
 // Equal names, shared prefixes, separately added identical products, and owner moderation.
 async function contributor(nick){
   const invite=crypto.randomUUID(),actor=crypto.randomUUID();
   await shop('invite',{invite,canAdd:true},true);
   assert.equal((await shop('join',{invite,actor,nick})).status,200);
   const itemId=crypto.randomUUID();
   await shop('add',{actor,itemId,text:'Gruszki'});
   return {actor,itemId};
 }
 const zofia=await contributor('Zofia'),zosia2=await contributor('Zosia'),zosia3=await contributor('Zosia');
 snapshot=(await shop('read',{},true)).data;
 const keys=id=>snapshot.rows.find(r=>r.addedId===id);
 assert.equal(keys(zofia.itemId).authorMark,'Zof');
 assert.equal(keys(zosia2.itemId).authorMark,'Zosia 2');assert.equal(keys(zosia3.itemId).authorMark,'Zosia 3');
 assert.equal((await shop('remove',{actor:zosia3.actor,key:keys(zosia2.itemId).key})).status,403);
 await host('syncSharedShopping()');assert.equal(host("document.querySelectorAll('#shoppingSummaryRows [data-guest-key^=\"[\"] .shopping-item-trash').length"),3);
 host("document.querySelector('#shoppingSummaryRows [data-guest-key^=\"[\"] .shopping-item-options').click()");
 await host("document.querySelector('#shoppingSummaryRows [data-guest-key^=\"[\"] .shopping-item-trash').onclick()");
 const afterOwner=(await shop('read',{},true)).data;
 assert.equal(afterOwner.rows.filter(r=>r.text==='Gruszki').length,2);
 await host("document.querySelector('[data-product=woda] .shopping-item-options').click();document.querySelector('[data-product=woda] .shopping-item-trash').onclick()");
 assert.ok(!(await shop('read',{},true)).data.rows.some(row=>row.text==='woda'));
 // A group invitation created before 33.365 retains its original capacity.
 const groupHash=new URL(await oldInvitation(2)).hash;
 const groupInvite=new URLSearchParams(groupHash.slice(1)).get('zaproszenie');
 const twoGuests=['Dorota','Ewa'].map(nick=>({nick,page:page('wspolne-zakupy.html',groupHash)}));
 for(const guest of twoGuests)await wait(()=>guest.page("!$('joinForm').hidden && !$('joinForm').querySelector('button').disabled"));
 assert.equal((await shop('invite-info',{invite:groupInvite})).data.available,true);
 await Promise.all(twoGuests.map(guest=>accept(guest.page,guest.nick)));
 await host('syncSharedShopping()');
 assert.match(host("$('shoppingInviteMembers').textContent"),/zajęte miejsca 2\/2/);
 for(const guest of twoGuests){
   const existing=(await guest.page("request('read',{})"));
   assert.match(existing.shoppersLabel,/Dorota/);assert.match(existing.shoppersLabel,/Ewa/);
   const reopened=await guest.page("request('join',{invite,nick:person.nick})");
   assert.equal(reopened.revision,existing.revision);
   const again=page('wspolne-zakupy.html',groupHash,JSON.parse(guest.page('JSON.stringify(localStorage)')));
   await wait(()=>again('revision>0&&!gated'));
 }
 const third=page('wspolne-zakupy.html',groupHash);
 await wait(()=>third("$('joinMessage').textContent.includes('wykorzystane')"));
 assert.ok(third("gated && $('joinForm').hidden && !$('pending').childElementCount"));
 const blocked={actor:crypto.randomUUID(),nick:'Trzecia osoba',invite:groupInvite};
 assert.equal((await shop('join',blocked)).status,403);
 const member=(await shop('read',{},true)).data.invitations.find(s=>s.nick==='Ewa');
 await shop('revoke',{key:member.key},true);
 assert.equal((await shop('join',blocked)).status,403);
 await assert.rejects(twoGuests[1].page("request('read',{})"),e=>e.status===403);
 assert.ok((await twoGuests[0].page("request('read',{})")).canAdd);
 // Race three separate claims for two seats and retry after a lost CAS. No overbooking.
 const secondLink=crypto.randomUUID();
 assert.equal((await shop('invite',{invite:secondLink,canAdd:false,seats:2},true)).data.inviteSeats,2);
 const racers=Array.from({length:3},(_,i)=>({invite:secondLink,actor:crypto.randomUUID(),nick:'Gość '+i}));
 const attempts=await Promise.all(racers.map(guest=>shop('join',guest)));
 assert.deepEqual(attempts.map(r=>r.status).sort(),[200,200,403]);
 assert.ok(attempts.filter(r=>r.status===200).every(r=>r.data.canAdd===false));
 for(const seats of [0,-1,1.5,201]){
   assert.equal((await shop('invite',{canAdd:true,seats,invite:crypto.randomUUID()},true)).status,400);
 }
 // The default link admits multiple named guests and reports each committed join exactly once.
 host("$('shoppingInviteAdd').checked=true");
 await host('prepareShoppingInvite()');await host('sendShoppingLink()');
 const openHash=new URL(host('sharedLink')).hash;
 const openToken=new URLSearchParams(openHash.slice(1)).get('zaproszenie');
 const supplier=page('wspolne-zakupy.html',openHash);
 const observer=page('wspolne-zakupy.html',openHash);
 await accept(supplier,'Hania');await accept(observer,'Marek');await host('syncSharedShopping()');
 assert.ok(host("!$('shoppingAccess').hidden && !$('shoppingJoinAlert').hidden"));
 assert.match(host("$('shoppingJoinAlert').textContent"),/Marek/);
 const history=await shop('read',{},true);
 const marek=history.data.invitations.find(seat=>seat.nick==='Marek');
 assert.equal(history.data.joinEvents.filter(e=>e.key===marek.key).length,1);
 await observer("request('join',{invite,nick:person.nick})");
 assert.equal((await shop('read',{},true)).data.revision,history.data.revision);
 host("$('shoppingAccessDialog').showModal=function(){this.open=true};$('shoppingJoinAlert').click()");
 assert.ok(host("$('shoppingAccessDialog').open && $('shoppingJoinAlert').hidden"));
 assert.equal(host("$('shoppingInviteMembers').querySelector('li.is-new span').textContent"),'Marek');
 assert.ok(!host("$('shoppingSummaryInfo').closest('dialog')"));
 await observer("$('openAddProduct').click();$('newProduct').value='Daktyle';$('addProductForm').onsubmit({preventDefault(){}})");
 await supplier('refresh()');
 assert.match(supplier("[...document.querySelectorAll('.item-name')].find(n=>n.textContent.startsWith('Daktyle')).textContent"),/^Daktyle\(M/);
 assert.equal(supplier("document.querySelector('.item-name .shopping-author[title$=Robert]')"),null);
 host("document.querySelector('[aria-label=\"Usuń dostęp: Marek\"]').click()");
 await host("$('shoppingConfirmRevoke').onclick()");
 await observer('refresh()');assert.ok(observer("gated && document.querySelector('main').hidden"));
 await assert.rejects(observer("request('join',{invite,nick:person.nick})"),e=>e.status===403);
 assert.equal((await shop('invite-info',{invite:openToken})).data.available,true);
 host("document.querySelector('[aria-label=\"Usuń dostęp: Hania\"]').click()");
 await host("$('shoppingRevokeClose').onclick()");
 assert.equal((await shop('invite-info',{invite:openToken})).data.available,false);
 assert.equal((await shop('join',{invite:openToken,actor:crypto.randomUUID(),nick:'Nowa osoba'})).status,403);
 assert.equal((await shop('read',{},true)).data.rows.find(r=>r.text==='Daktyle').authorName,'Marek');
 assert.equal((await twoGuests[0].page("request('read',{})")).canAdd,true);
 // Restore the original credential, including its add/purchase rights, with joining still closed.
 assert.equal(host("document.querySelector('[aria-label=\"Przywróć dostęp: Marek\"]').parentElement.querySelector('s').textContent"),'Marek');
 const former=(await shop('read',{},true)).data.removedParticipants.find(p=>p.nick==='Marek');
 assert.equal((await shop('restore-access',{key:former.key})).status,403);
 assert.equal((await twoGuests[0].page("request('read',{})")).removedParticipants,undefined);
 const restoreRevision=(await shop('read',{},true)).data.joinEvents.length;
 await host("document.querySelector('[aria-label=\"Przywróć dostęp: Marek\"]').onclick()");
 await observer('refresh()');
 assert.ok(observer("!gated && !document.querySelector('main').hidden && !$('addProductForm').hidden"));
 const sameLink=page('wspolne-zakupy.html',openHash,JSON.parse(observer('JSON.stringify(localStorage)')));
 await wait(()=>sameLink('revision>0 && !gated'));
 assert.equal((await sameLink("request('read',{})")).rows.find(r=>r.text==='Daktyle').canDelete,true);
 const restored=(await shop('read',{},true)).data;
 assert.equal(restored.joiningOpen,false);
 assert.equal(restored.joinEvents.length,restoreRevision);
 assert.equal(restored.invitations.filter(p=>p.nick==='Marek').length,1);
 assert.equal((await shop('restore-access',{key:former.key},true)).data.revision,restored.revision);
 assert.equal((await shop('invite-info',{invite:openToken})).data.available,false);
 await assert.rejects(supplier("request('read',{})"),e=>e.status===403);
 // 33.364 persisted a bare blocked flag, sometimes without a surviving seat.
 const saved=JSON.parse(db.prepare('SELECT content FROM shared_shopping WHERE id=?').get(listId).content);
 const legacyKey=restored.removedParticipants.find(p=>p.nick==='Hania').key;
 saved.blocked[legacyKey]=true;
 db.prepare('UPDATE shared_shopping SET content=? WHERE id=?').run(JSON.stringify(saved),listId);
 await host("document.querySelector('[aria-label=\"Przywróć dostęp: Hania\"]').onclick()");
 await supplier('refresh()');
 assert.equal((await supplier("request('read',{})")).canAdd,false);
 await assert.rejects(supplier("request('add',{itemId:crypto.randomUUID(),text:'Test'})"),e=>e.status===403);
 // Verify signing, independent decryption, idempotency and stale-device removal with a local push receiver.
 const nodeCrypto=require('node:crypto'),receiver=nodeCrypto.createECDH('prime256v1');
 const pub=receiver.generateKeys(),auth=nodeCrypto.randomBytes(16);
 const subscription={endpoint:'https://web.push.apple.com/test-fixture',keys:{p256dh:pub.toString('base64url'),auth:auth.toString('base64url')}};
 assert.equal((await shop('push-key',{})).status,403);
 const pushKey=(await shop('push-key',{},true)).data;
 assert.equal(pushKey.publicKey,(await shop('push-key',{},true)).data.publicKey);
 assert.deepEqual(Object.keys(pushKey),['publicKey']);
 assert.equal((await shop('push-on',{subscription:{...subscription,endpoint:'https://example.org/test'}},true)).status,400);
 assert.equal((await shop('push-on',{subscription},true)).status,200);
 const messages=[],nativeFetch=globalThis.fetch,linkForPush=crypto.randomUUID();
 try{
   globalThis.fetch=async(url,options)=>{
     assert.equal(url,subscription.endpoint);messages.push(options);return new Response(null,{status:201});
   };
   assert.equal((await shop('open-invite',{invite:linkForPush,canAdd:true},true)).status,409);
   assert.equal((await shop('invite',{invite:linkForPush,seats:2,canAdd:true},true)).status,200);
   const guest={invite:linkForPush,nick:'Lena',actor:crypto.randomUUID()};
   assert.equal((await shop('join',guest)).status,200);await shop('join',guest);
   assert.equal(messages.length,1);
   const request=messages[0],body=Buffer.from(request.body),salt=body.subarray(0,16),serverPub=body.subarray(21,86);
   const derive=(secret,salt,info,length)=>Buffer.from(nodeCrypto.hkdfSync('sha256',secret,salt,info,length));
   const ikm=derive(receiver.computeSecret(serverPub),auth,Buffer.concat([Buffer.from('WebPush: info\0'),pub,serverPub]),32);
   const decrypt=nodeCrypto.createDecipheriv('aes-128-gcm',derive(ikm,salt,'Content-Encoding: aes128gcm\0',16),derive(ikm,salt,'Content-Encoding: nonce\0',12));
   decrypt.setAuthTag(body.subarray(-16));
   const plaintext=Buffer.concat([decrypt.update(body.subarray(86,-16)),decrypt.final()]);
   const event=JSON.parse(plaintext.subarray(0,plaintext.lastIndexOf(2)).toString());
   assert.equal(event.nick,'Lena');assert.equal(event.id,listId);
   const jwt=request.headers.authorization.match(/^vapid t=([^,]+), k=(.+)$/);
   assert.equal(jwt[2],pushKey.publicKey);
   const raw=Buffer.from(jwt[2],'base64url'),parts=jwt[1].split('.');
   const verification=nodeCrypto.createPublicKey({format:'jwk',key:{kty:'EC',crv:'P-256',x:raw.subarray(1,33).toString('base64url'),y:raw.subarray(33).toString('base64url')}});
   assert.ok(nodeCrypto.verify('sha256',Buffer.from(parts.slice(0,2).join('.')),{key:verification,dsaEncoding:'ieee-p1363'},Buffer.from(parts[2],'base64url')));
   const handlers={},shown=[],opened=[];
   const sw={registration:{scope:site,showNotification:async(title,opts)=>shown.push({title,...opts})},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)},addEventListener:(type,fn)=>handlers[type]=fn};
   vm.runInNewContext(fs.readFileSync('shopping-access-sw.js','utf8'),{self:sw,URL,URLSearchParams});
   let job;handlers.push({data:{json:()=>event},waitUntil:p=>job=p});await job;
   assert.match(shown[0].body,/Lena/);
   handlers.notificationclick({notification:{...shown[0],close(){}},waitUntil:p=>job=p});await job;
   assert.equal(new URLSearchParams(new URL(opened[0]).hash.slice(1)).get('osoba'),event.key);
   globalThis.fetch=async()=>new Response(null,{status:410});
   await shop('join',{...guest,actor:crypto.randomUUID(),nick:'Ala'});
   assert.equal(db.prepare('SELECT count(*) AS n FROM shopping_push_devices WHERE list_id=?').get(listId).n,0);
 }finally{globalThis.fetch=nativeFetch}
 // Exercise the ink → confirmed move → landing sequence with a visible row.
 const motionId=require('node:crypto').randomUUID();
 await o("shoppingRequest('publish',"+JSON.stringify({id:motionId,revision:0,rows:[{key:'move',text:'Jabłka',done:false,by:''}]})+",shoppingStore('owner'))");
 const moving=page('wspolne-zakupy.html','#'+motionId);
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
 await wait(()=>phone('shoppingOwner'));await seedLegacyList(phone,['Gruszki 2 kg','Kawa']);
 phone(`ideas=[normalizeIdea({text:'Zakupy',list:{type:'shopping',items:['Gruszki 2 kg','Kawa']}})];
   saveIdeas();openShoppingSummary();cancelShoppingPaper();$('shoppingResumeLegacy').click();`);
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
 assert.ok(phone("!ideas[0].list.items[0].done && !legacyShoppingRecords[0].list.items[0].done"));
 console.log('Independent invitations, forwarding, browser return, guest additions, permissions, revocation, legacy lists and signed purchases passed.');
}finally{windows.forEach(w=>w.close())}
})().catch(e=>{console.error(e);process.exitCode=1});
