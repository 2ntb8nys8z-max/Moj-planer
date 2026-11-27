import assert from 'node:assert/strict';
import path from 'node:path';
import {chromium} from 'playwright';
import {shoppingFixture} from './shopping-card-service-fixture.mjs';
import permissions from './permission-fixture.cjs';
const service=await shoppingFixture();
const browser=await chromium.launch(process.env.PLANNER_CHROMIUM?{executablePath:process.env.PLANNER_CHROMIUM}:{});
const origin='https://2ntb8nys8z-max.github.io';
const guest='https://okti-wspolne-zakupy.oakgait2.chatgpt.site';
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
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
  await page.locator('#phoneShopping').tap();await paper.locator('#rows').getByText('Herbata').waitFor();
  const focused=()=>sheet.evaluate(el=>el.ownerDocument.activeElement.id);
  async function checkKeyboardIndicator(id){
    await page.keyboard.press('Tab');
    assert.equal(await focused(),id);
    const style=await paper.locator('#'+id).evaluate(el=>{
      const css=getComputedStyle(el);
      return [css.outlineStyle,css.textDecorationLine];
    });
    assert.deepEqual(style,['none','underline']);
  }
  assert.equal(await focused(),'sheet');
  await checkKeyboardIndicator('choose');
  await page.keyboard.press('Tab');
  await checkKeyboardIndicator('exit');
  await paper.locator('#choose').tap();
  assert.equal(await focused(),'dialogTitle');
  await checkKeyboardIndicator('dismiss');
  await paper.locator('#dismiss').tap();
  assert.ok(await paper.locator('#panel').isHidden());
  const size=await sheet.evaluate(e=>[e.offsetWidth,e.offsetHeight]);
  assert.ok(size[1]>size[0]);assert.equal(await paper.locator('.underlay').count(),0);
  await button('Dodaj').click();await paper.getByLabel('Nazwa produktu').fill('Mleko');await paper.locator('form button').click();
  await paper.locator('#rows').getByText('Mleko').click();
  await paper.locator('#bought .row').waitFor({state:'attached'});
  assert.equal(await paper.locator('#bought').getByText('Mleko').isVisible(),true,'first purchase is shown automatically');
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
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>{
    const items=Array.from({length:24},(_,i)=>({id:crypto.randomUUID(),text:'Produkt '+(i+1),done:true}));
    ideas=[normalizeIdea({title:'Dom',text:'Zakupy',list:{type:'shopping',items}})];saveIdeas();
  });
  await page.locator('#phoneShopping').tap();
  await paper.locator('#bought').getByText('Produkt 1',{exact:true}).waitFor();
  const visibleBought=()=>paper.locator('#paperContent').evaluate(el=>{
    const view=el.getBoundingClientRect();
    return [...el.querySelectorAll('#bought .row')].filter(row=>{
      const rect=row.getBoundingClientRect();
      return rect.height>0 && rect.top>=view.top && rect.bottom<=view.bottom;
    }).length;
  });
  const initiallyVisible=await visibleBought();
  assert.ok(initiallyVisible>3 && initiallyVisible<24,'long bought-only list uses the available space');
  const last=paper.locator('#bought .row').last();
  await last.scrollIntoViewIfNeeded();
  assert.ok(await last.evaluate(row=>row.getBoundingClientRect().bottom<=document.getElementById('paperContent').getBoundingClientRect().bottom+2));
  await paper.locator('#paperContent').evaluate(el=>el.scrollTop=0);
  for(let i=1;i<=3;i++){
    await paper.locator('#bought').getByText('Produkt '+i,{exact:true}).click();
    await paper.locator('#rows').getByText('Produkt '+i,{exact:true}).waitFor();
  }
  const mixedVisible=await visibleBought();
  assert.equal(mixedVisible,initiallyVisible-3,'three pending rows take the space of three purchased rows');
  assert.equal(await paper.locator('#boughtLabel').textContent(),'Kupione (21)');
  await page.setViewportSize({width:390,height:650});
  assert.ok(await visibleBought()<mixedVisible,'shorter viewport shows fewer bought rows');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await visibleBought(),mixedVisible);
  await paper.locator('#boughtLabel').click();
  await paper.locator('#rows').getByText('Produkt 1',{exact:true}).click();
  await paper.locator('#boughtLabel').getByText('Kupione (22)').waitFor();
  assert.ok(await paper.locator('#bought').isHidden(),'manual fold survives a mixed-list update');
  for(let i=2;i<=3;i++)await paper.locator('#rows').getByText('Produkt '+i,{exact:true}).click();
  await paper.locator('#boughtLabel').getByText('Kupione (24)').waitFor();
  assert.equal(await visibleBought(),initiallyVisible,'finishing the last pending row shows purchases again');
  assert.deepEqual(await sheet.evaluate(e=>[e.offsetWidth,e.offsetHeight]),size);
  assert.deepEqual(errors,[]);
  console.log('Owner shopping sheet: private writes, selected copy, fixed portrait dimensions, layers, menu and pointer page turn, real invitation handler, archive and reload passed.');
} finally{await browser.close();await service.close();}
