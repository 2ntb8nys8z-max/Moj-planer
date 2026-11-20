const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,webkit}=require(process.env.PLANNER_PLAYWRIGHT||'playwright');
const {dismissInitialPermissions}=require('./permission-fixture.cjs');

async function checkTapStyles(page,selector){
  const styles=await page.locator(selector).evaluateAll(nodes=>nodes.map(node=>({
    target:node.tagName+' '+node.className,
    highlight:getComputedStyle(node).getPropertyValue('-webkit-tap-highlight-color')
  })));
  assert.ok(styles.length>0,selector);
  for(const {target,highlight} of styles){
    // Desktop WebKit builds can omit this iOS-only property.
    if(highlight)assert.match(highlight,/^(transparent|rgba\(0, 0, 0, 0\))$/,target);
  }
}

async function pixels(page,png){
  return page.evaluate(async encoded=>{
    const image=new Image();
    image.src='data:image/png;base64,'+encoded;
    await image.decode();
    const canvas=document.createElement('canvas');
    canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(image,0,0);
    return [...ctx.getImageData(0,0,canvas.width,canvas.height).data];
  },png.toString('base64'));
}

async function check(engine){
  const browser=await engine.launch(engine===chromium&&process.env.PLANNER_CHROMIUM?{executablePath:process.env.PLANNER_CHROMIUM}:{});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const list={revision:1,canAdd:true,rows:[{key:'a',text:'Chleb',done:false,canDelete:true}]};
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin==='https://planner.test')return route.fulfill({path:path.resolve('.'+url.pathname)});
      const headers={'Access-Control-Allow-Origin':'https://planner.test','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
      if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
      if(url.pathname==='/shopping/invite-info')return route.fulfill({headers,json:{available:true}});
      if(url.pathname==='/shopping/join'||url.pathname==='/shopping/read')return route.fulfill({headers,json:list});
      if(url.pathname==='/shopping/add'){
        const {itemId,text}=route.request().postDataJSON();
        list.rows.push({key:itemId,text,done:false,canDelete:true});list.revision++;
        return route.fulfill({headers,json:list});
      }
      return route.fulfill({json:{}});
    });
    const invitation=new URLSearchParams({lista:crypto.randomUUID(),zaproszenie:crypto.randomUUID()});
    await page.goto('https://planner.test/wspolne-zakupy.html#'+invitation);
    await page.getByLabel('Wpisz swoje imię (nick)').fill('Test');
    await page.getByRole('button',{name:'Zatwierdź'}).tap();
    const options=page.locator('.shopping-item-options');
    await options.waitFor();
    await page.evaluate(()=>document.fonts.ready);
    await checkTapStyles(page,'main, .item, .item-name, .shopping-item-options, summary, #openAddProduct img');
    assert.equal(await page.locator('main').evaluate(el=>getComputedStyle(el).filter),'none');
    // Sample bare paper in the middle of the transparent action while it is held.
    const box=await options.boundingBox();
    const clip={x:Math.floor(box.x+box.width*.65),y:Math.floor(box.y+box.height/2),width:16,height:6};
    const before=await pixels(page,await page.screenshot({clip}));
    await page.mouse.move(clip.x,clip.y);
    await page.mouse.down();
    assert.equal(await options.evaluate(el=>el.matches(':active')),true);
    const pressed=await pixels(page,await page.screenshot({clip}));
    await page.mouse.up();
    assert.deepEqual(pressed,before,'press painted over blank paper');
    await page.locator('.shopping-item-trash').waitFor({state:'visible'});
    assert.equal(await page.locator('#newProduct').isHidden(),true);
    assert.equal(await page.getByText('Produkt i ilość',{exact:true}).count(),0);
    await page.locator('#openAddProduct').tap();
    assert.equal(await page.locator('#openAddProduct').isVisible(),true);
    assert.equal(await page.locator('#newProduct').evaluate(el=>document.activeElement===el),true);
    assert.equal(await page.locator('#newProduct').isVisible(),true);
    await page.locator('#newProduct').fill('Mleko');
    await page.locator('#newProduct').press('Enter');
    await page.getByText('Mleko',{exact:true}).waitFor();
    assert.equal(await page.locator('#newProduct').isHidden(),true);
    assert.equal(await page.locator('#openAddProduct').isVisible(),true);
    assert.equal(list.rows.length,2);

    await page.goto('https://planner.test/index.html');
    await dismissInitialPermissions(page);
    await page.evaluate(()=>{
      ideas=[{id:'touch',title:'Zakupy',list:{type:'shopping',items:[{id:'a',text:'Chleb',done:false}]}}];
      openShoppingSummary();
    });
    const row=page.locator('#shoppingSummaryRows label').first();
    await row.waitFor();
    await checkTapStyles(page,'#shoppingModal, #shoppingSummaryRows label, #shoppingSummaryRows input, #shoppingSummaryRows svg, #shoppingPurchasedToggle, #shoppingSummaryInfo');
    await page.locator('#shoppingSummaryInfo').tap();
    assert.equal(await page.locator('#shoppingSummaryHelp').isVisible(),true);
    console.log(engine.name()+': shopping row press preserves paper pixels; guest and planner touch controls passed.');
  }finally{await browser.close()}
}
(async()=>{
  await check(chromium);
  if(fs.existsSync(webkit.executablePath()))await check(webkit);
})().catch(error=>{console.error(error);process.exitCode=1});
