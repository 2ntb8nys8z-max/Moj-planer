import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { shoppingFixture } from './shopping-card-service-fixture.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLANNER_PLAYWRIGHT || 'playwright');
const {dismissInitialPermissions} = require('./permission-fixture.cjs');
const ownerOrigin='https://okti-wybierz-produkty.oakgait2.chatgpt.site';
const guestOrigin='https://okti-zaproszenie-zakupy.oakgait2.chatgpt.site';
const service=await shoppingFixture();
const browser=await chromium.launch(process.env.PLANNER_CHROMIUM?{executablePath:process.env.PLANNER_CHROMIUM}:{});
const mobile={viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'};
async function serve(route) {
  const req=route.request(),url=new URL(req.url());
  if(url.origin===guestOrigin){
    const response=await service.fetch(new Request(url,{method:req.method(),headers:await req.allHeaders(),body:req.postDataBuffer()}));
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  } else if(url.origin===ownerOrigin){
    await route.fulfill({path:path.resolve('.'+url.pathname)});
  } else await route.fulfill({json:{}});
}
try {
  const owner=await browser.newContext(mobile);
  await owner.route('**/*',serve);
  const page=await owner.newPage();
  await page.goto(ownerOrigin+'/index.html');
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
  assert.equal(await panel.locator('output').textContent(),'3');
  await button('Przygotuj link').click();
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
  await gp.getByLabel('Wpisz swoje imię (nick)').fill('Zosia');
  await gp.getByRole('button',{name:'Zatwierdź'}).click();
  await gp.getByRole('heading',{name:'Wyjazd'}).waitFor();
  await gp.locator('#pending').getByText('Herbata',{exact:true}).click();
  await gp.locator('#bought').getByText('Herbata',{exact:true}).waitFor({state:'attached'});
  await gp.locator('#openAddProduct').click();
  await gp.locator('#newProduct').fill('Cytryny');
  await gp.locator('#openAddProduct').click();
  await gp.locator('#pending').getByRole('button',{name:'Oznacz jako kupione: Cytryny'}).waitFor();
  await panel.getByText('Cytryny',{exact:true}).waitFor();
  assert.equal(await panel.getByText('(Zosia)',{exact:true}).count(),1);
  await gp.reload();
  await gp.getByRole('heading',{name:'Wyjazd'}).waitFor();
  assert.equal(await gp.locator('#joinNick').isVisible(),false);
  await button('Uczestnicy').click();
  await panel.getByText(/Aktywni goście: 1.*Zajęte miejsca: 1.*Wolne: 2/).waitFor();
  await button('Zaproś kolejne osoby').click();
  await panel.getByText(/Poprzedni link przestanie działać/).waitFor();
  await button('Zwiększ liczbę miejsc i utwórz link').click();
  await field.waitFor();
  assert.notEqual(await field.inputValue(),url);
  await button('Wróć do kartki').click();
  await button('Moje listy wspólne').click();
  await button('Utwórz listę wspólną').click();
  await button('Nie, utwórz pustą listę').click();
  await button('Udostępnij').click();
  await button('Przygotuj link').click();
  await field.waitFor();
  await gp.goto(await field.inputValue());
  await gp.locator('#joinNick').waitFor();
  assert.equal(await gp.locator('#joinNick').inputValue(),'');
  assert.equal(await gp.locator('#pending').textContent(),'');
  console.log('Mobile browser: saved 33.371 card → invitation → separate guest joins, shops and returns; owner sees changes, rotates link; new list asks for a blank nickname.');
} finally { await browser.close(); await service.close(); }
