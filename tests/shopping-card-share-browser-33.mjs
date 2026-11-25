import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { shoppingFixture } from './shopping-card-service-fixture.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLANNER_PLAYWRIGHT || 'playwright');
const {dismissInitialPermissions} = require('./permission-fixture.cjs');
const ownerOrigin='https://2ntb8nys8z-max.github.io';
const plannerPath='/Moj-planer/';
const guestOrigin='https://okti-wspolne-zakupy.oakgait2.chatgpt.site';
const service=await shoppingFixture();
const browser=await chromium.launch(process.env.PLANNER_CHROMIUM?{executablePath:process.env.PLANNER_CHROMIUM}:{});
const mobile={viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'};
let pausedSeatRead;
async function serve(route) {
  const req=route.request(),url=new URL(req.url());
  if(url.origin===guestOrigin){
    if(pausedSeatRead&&url.pathname==='/shopping/owner-read')await pausedSeatRead;
    const response=await service.fetch(new Request(url,{method:req.method(),headers:await req.allHeaders(),body:req.postDataBuffer()}));
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  } else if(url.origin===ownerOrigin && url.pathname.startsWith(plannerPath)){
    await route.fulfill({path:path.resolve(url.pathname.slice(plannerPath.length)||'index.html')});
  } else await route.fulfill({json:{}});
}
try {
  const owner=await browser.newContext(mobile);
  await owner.route('**/*',serve);
  await owner.addInitScript(()=>Object.defineProperty(navigator,'share',{configurable:true,value:undefined}));
  const page=await owner.newPage();
  await page.goto(ownerOrigin+plannerPath);
  await dismissInitialPermissions(page);
  await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const req=indexedDB.open('okti-shopping-cards-v1:'+shoppingPrivatePrefix,1);
      req.onupgradeneeded=()=>req.result.createObjectStore('cards',{keyPath:'id'});
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    // Saved card in the exact shape used before invitations were available.
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('cards','readwrite');
      tx.objectStore('cards').add({id:crypto.randomUUID(),title:'Wyjazd',createdAt:new Date().toISOString(),
        items:[{id:crypto.randomUUID(),text:'Herbata',done:false}]});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await dismissInitialPermissions(page);
  await page.locator('#phoneShopping').click();
  await page.locator('#shoppingCardCatalog').click();
  const panel=page.locator('#shoppingCardPanel');
  const button=name=>panel.getByRole('button',{name,exact:true});
  await panel.getByRole('button',{name:/Wyjazd/}).click();
  await button('Udostępnij').click();
  await panel.getByRole('heading',{name:'Ile osób chcesz zaprosić?'}).waitFor();
  assert.equal(await panel.locator('output').textContent(),'3');
  await button('Więcej osób').click();
  assert.equal(await panel.locator('output').textContent(),'4');
  await button('Mniej osób').click();
  await button('Wyślij zaproszenie').click();
  const field=panel.getByRole('textbox',{name:'Link do tej listy'});
  await field.waitFor();
  const url=await field.inputValue();
  assert.equal(new URL(url).origin,guestOrigin);
  assert.equal(new URL(url).search,'');
  assert.deepEqual([...new URLSearchParams(new URL(url).hash.slice(1)).keys()],['lista','zaproszenie']);
  await button('Wróć do kartki').click();
  const guest=await browser.newContext(mobile);
  await guest.route('**/*',serve);
  const gp=await guest.newPage();
  await gp.goto(url);
  await gp.locator('#joinNick').waitFor();
  assert.equal(await gp.locator('#joinNick').inputValue(),'');
  assert.equal(await gp.getByText('Herbata').count(),0);
  await gp.getByLabel('Wpisz swoje imię (nick)').fill('Robert 1');
  await gp.getByRole('button',{name:'Zatwierdź'}).click();
  await gp.getByRole('heading',{name:'Wyjazd'}).waitFor();
  const tea=gp.locator('.item').filter({hasText:'Herbata'});
  assert.equal(await tea.locator('.shopping-author').textContent(),'(Robert)');
  await tea.click();
  await gp.locator('#bought .item em').filter({hasText:'(Robert 1)'}).waitFor({state:'attached'});
  await gp.locator('#openAddProduct').click();
  await gp.locator('#newProduct').fill('Cytryny');
  await gp.locator('#openAddProduct').click();
  await gp.locator('#pending').getByRole('button',{name:'Oznacz jako kupione: Cytryny'}).waitFor();
  await panel.getByText('Cytryny',{exact:true}).waitFor();
  const lemons=gp.locator('.item').filter({hasText:'Cytryny'});
  assert.equal(await lemons.locator('.shopping-author').textContent(),'(Robert 1)');
  const ownerRow=name=>panel.locator('label').filter({hasText:name});
  assert.equal(await ownerRow('Herbata').locator('.shopping-author').textContent(),'(Robert)');
  assert.equal(await ownerRow('Herbata').locator('.shopping-buyer').textContent(),'(Robert 1)');
  assert.equal(await ownerRow('Cytryny').locator('.shopping-author').textContent(),'(Robert 1)');
  // On guest additions the label opens product options; the left checkbox marks a purchase.
  await lemons.click({position:{x:16,y:20}});
  await lemons.locator('em').waitFor({state:'attached'});
  assert.equal(await lemons.locator('em').textContent(),'(Robert 1)');
  assert.equal(await lemons.locator('.shopping-author').textContent(),'(Robert 1)');
  await gp.reload();
  await gp.getByRole('heading',{name:'Wyjazd'}).waitFor();
  assert.equal(await gp.locator('#joinNick').isVisible(),false);
  // Keep the network read pending while the user adjusts an already shared card.
  let resumeSeatRead;
  pausedSeatRead=new Promise(resolve=>{resumeSeatRead=resolve;});
  await button('Udostępnij').click();
  await panel.getByRole('heading',{name:'Ile osób chcesz zaprosić?'}).waitFor();
  assert.equal(await panel.locator('output').textContent(),'2');
  await button('Więcej osób').click();
  await panel.getByText(/Dodatkowe miejsca: 1.*Poprzedni link przestanie działać/).waitFor();
  assert.equal(await button('Dodaj miejsca i wyślij').isDisabled(),true);
  resumeSeatRead();
  pausedSeatRead=null;
  await button('Mniej osób').click();
  await button('Mniej osób').click();
  assert.equal(await button('Mniej osób').isDisabled(),true);
  await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{
    window.sentUrl=data.url;
  }}));
  await button('Wyślij zaproszenie').click();
  await page.waitForFunction(()=>document.getElementById('shoppingModal').classList.contains('hidden'));
  assert.equal(await page.evaluate(()=>window.sentUrl),url);
  await page.locator('#phoneShopping').click();
  await page.locator('#shoppingCardCatalog').click();
  await panel.getByRole('button',{name:/Wyjazd/}).click();
  await button('Uczestnicy').click();
  await panel.getByText(/Aktywni goście: 1.*Zajęte miejsca: 1.*Wolne: 2/).waitFor();
  await button('Zaproś kolejne osoby').click();
  await panel.getByText(/Poprzedni link przestanie działać/).waitFor();
  await panel.getByRole('heading',{name:'Ile kolejnych osób chcesz zaprosić?'}).waitFor();
  assert.equal(await panel.locator('output').textContent(),'1');
  // The share sheet may disallow an async call, or be unavailable even after a fresh tap.
  await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{
    throw new DOMException('Share unavailable','NotAllowedError');
  }}));
  await button('Dodaj miejsca i wyślij').click();
  await button('Wyślij zaproszenie').waitFor();
  assert.equal(await field.isVisible(),false);
  await button('Wyślij zaproszenie').click();
  await field.waitFor();
  const expandedLink=await field.inputValue();
  assert.notEqual(expandedLink,url);
  await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:undefined}));
  await button('Wróć do kartki').click();
  await button('Udostępnij').click();
  await panel.getByRole('heading',{name:'Ile osób chcesz zaprosić?'}).waitFor();
  assert.equal(await panel.locator('output').textContent(),'3');
  await button('Więcej osób').click();
  await button('Dodaj miejsca i wyślij').click();
  await field.waitFor();
  assert.notEqual(await field.inputValue(),expandedLink);
  await button('Wróć do kartki').click();
  await button('Uczestnicy').click();
  await panel.getByText(/Zajęte miejsca: 1.*Wolne: 4/).waitFor();
  await button('Wróć do kartki').click();
  await button('Moje listy wspólne').click();
  await button('Utwórz listę wspólną').click();
  await button('Nie, utwórz pustą listę').click();
  await button('Udostępnij').click();
  await panel.getByRole('heading',{name:'Ile osób chcesz zaprosić?'}).waitFor();
  await button('Mniej osób').click();
  await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{
    window.newInvite=data.url;
    throw new DOMException('Dismissed','AbortError');
  }}));
  await button('Wyślij zaproszenie').click();
  await panel.getByRole('heading',{name:'Lista wspólna'}).waitFor();
  assert.equal(await field.count(),0);
  await button('Uczestnicy').click();
  await panel.getByText(/Zajęte miejsca: 0.*Wolne: 2/).waitFor();
  await gp.goto(await page.evaluate(()=>window.newInvite));
  await gp.locator('#joinNick').waitFor();
  assert.equal(await gp.locator('#joinNick').inputValue(),'');
  assert.equal(await gp.locator('#pending').textContent(),'');
  console.log('Mobile browser: saved 33.371 card → invitation → separate guest joins, shops and returns; owner sees changes, rotates link; first send honours the selected count, resending uses free places and expansion adds only the difference; each card has a separate guest identity.');
} finally { await browser.close(); await service.close(); }
