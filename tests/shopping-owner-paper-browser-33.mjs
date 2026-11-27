import assert from 'node:assert/strict';
import path from 'node:path';
import {chromium} from 'playwright';
import {shoppingFixture} from './shopping-card-service-fixture.mjs';
import permissions from './permission-fixture.cjs';
const service=await shoppingFixture();
const browser=await chromium.launch(process.env.PLANNER_CHROMIUM?{executablePath:process.env.PLANNER_CHROMIUM}:{});
const origin='https://2ntb8nys8z-max.github.io';
const guest='https://okti-wspolne-zakupy.oakgait2.chatgpt.site';
const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===guest){
    const result=await service.fetch(new Request(url,{method:req.method(),headers:await req.allHeaders(),body:req.postDataBuffer()}));
    return route.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body:Buffer.from(await result.arrayBuffer())});
  }
  if(url.origin===origin)return route.fulfill({path:path.resolve(url.pathname.slice('/Moj-planer/'.length)||'index.html')});
  return route.fulfill({json:{}});
});
try{
  await page.addInitScript(()=>Object.defineProperty(navigator,'share',{configurable:true,value:undefined}));
  await page.goto(origin+'/Moj-planer/');await permissions.dismissInitialPermissions(page);
  await page.evaluate(()=>{
    addIdea({text:'Dom',list:{type:'shopping',items:['Herbata']}});
  });
  const paper=page.frameLocator('#ownerPaperDialog iframe'),button=name=>paper.getByRole('button',{name,exact:true});
  const sheet=paper.locator('#sheet'),menu=()=>paper.locator('#choose').click();
  const more=()=>paper.locator('#more').click();
  await page.locator('#phoneShopping').click();await paper.locator('#rows').getByText('Herbata').waitFor();
  const size=await sheet.evaluate(e=>[e.offsetWidth,e.offsetHeight]);
  assert.ok(size[1]>size[0]);assert.equal(await paper.locator('.underlay').count(),0);
  await button('Dodaj').click();await paper.getByLabel('Nazwa produktu').fill('Mleko');await paper.locator('form button').click();
  await paper.locator('#rows').getByText('Mleko').click();await paper.locator('#boughtLabel').click();await paper.locator('#bought').getByText('Mleko').waitFor();
  await menu();await button('＋ Nowa lista wspólna').click();await paper.getByLabel('Nazwa listy').fill('Na weekend');
  await button('Dalej').click();await paper.getByLabel(/Herbata/).check();await button('Utwórz z zaznaczonymi').click();
  await paper.getByRole('heading',{name:'Na weekend'}).waitFor();
  assert.deepEqual(await sheet.evaluate(e=>[e.offsetWidth,e.offsetHeight]),size);
  assert.equal(await paper.locator('.underlay').count(),1);
  assert.equal(await paper.locator('#rows .row').count(),1);
  await button('Udostępnij').click();
  const panel=page.locator('#shoppingCardPanel');
  await panel.getByRole('heading',{name:'Ile osób chcesz zaprosić?'}).waitFor();
  await panel.getByLabel('Mniej osób').click();
  await panel.getByRole('button',{name:'Wyślij zaproszenie'}).click();
  const link=await panel.getByLabel('Link do tej listy').inputValue();
  assert.equal(new URL(link).origin,guest);
  await panel.getByRole('button',{name:'Wróć do kartki'}).click();
  await paper.getByRole('heading',{name:'Na weekend'}).waitFor();
  await page.emulateMedia({reducedMotion:'no-preference'});await menu();
  await paper.getByRole('button',{name:/Moja lista.*Prywatna/}).click();
  await paper.locator('.paper-turn').waitFor({state:'attached'});await paper.locator('.paper-turn').waitFor({state:'detached'});
  await paper.getByRole('heading',{name:'Moja lista'}).waitFor();
  const grip=await paper.locator('#cornerGrip').boundingBox();
  const x=grip.x+5,y=grip.y+grip.height-6;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+175,y-120,{steps:14});await page.mouse.up();
  await paper.getByRole('heading',{name:'Na weekend'}).waitFor();await paper.locator('.paper-turn').waitFor({state:'detached'});
  await more();await button('Usuń produkt').click();await button('Herbata').click();await paper.getByText('Lista jest pusta.').waitFor();
  await more();await button('Zamknij listę').click();await button('Zamknij i przenieś do archiwum').click();
  await paper.getByRole('heading',{name:'Moja lista'}).waitFor();await paper.locator('.paper-turn').waitFor({state:'detached'});
  assert.equal(await paper.locator('.underlay').count(),0);
  await page.reload();await permissions.dismissInitialPermissions(page);await page.locator('#phoneShopping').click();
  await menu();await button('Archiwum').click();await paper.getByRole('button',{name:/Na weekend.*Zamknięta/}).click();
  await paper.locator('#closed').waitFor();
  assert.ok(await paper.locator('#add').isHidden());
  await button('Zamknij zakupy').click();assert.ok(await page.locator('#ownerPaperDialog').isHidden());
  assert.deepEqual(errors,[]);
  console.log('Owner shopping sheet: private writes, selected copy, fixed portrait dimensions, layers, menu and pointer page turn, real invitation handler, archive and reload passed.');
} finally{await browser.close();await service.close();}
