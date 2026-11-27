import assert from 'node:assert/strict';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import fixture from './legacy-shopping-worker-fixture.cjs';
import permissions from './permission-fixture.cjs';

const {worker,db,env,token}=await fixture.legacyShoppingWorker();
const base='https://2ntb8nys8z-max.github.io/Moj-planer/';
const id=crypto.randomUUID(),invite=crypto.randomUUID(),actor=crypto.randomUUID();
const engine=process.env.PLANNER_BROWSER==='webkit'?webkit:chromium;
const exe=engine===webkit?process.env.PLANNER_WEBKIT:process.env.PLANNER_CHROMIUM;
const browser=await engine.launch(exe?{executablePath:exe}:{});
try{
  async function api(action,body,owner=false){
    const res=await worker.fetch(new Request('https://example.test/shopping/'+action,{method:'POST',
      headers:{'Content-Type':'application/json',...(owner?{Authorization:'Bearer '+token}:{})},
      body:JSON.stringify({id,...body})}),env);
    const data=await res.json();
    assert.ok(res.ok,action+': '+(data.error||res.status));return data;
  }
  // The installation has a saved ID and title, but no local copy of the older server rows.
  await api('publish',{revision:0,title:'Zakupy rodzinne',inviteOnly:true,rows:[
    {key:'bread',text:'Chleb',done:false,by:''},{key:'tea',text:'Herbata',done:false,by:''}
  ]},true);
  await api('invite',{invite,seats:2,canAdd:true},true);
  const joined=await api('join',{actor,invite,nick:'Zosia'});
  await api('mark',{actor,keys:['tea'],done:true,revision:joined.revision});
  await api('add',{actor,itemId:crypto.randomUUID(),text:'Masło'});
  const initial=await api('read',{},true);
  const owner=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
  const actions=[];
  await owner.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.pathname.startsWith('/shopping/')){
      actions.push(url.pathname);
      const result=await worker.fetch(new Request(url,{method:request.method(),headers:await request.allHeaders(),body:request.postDataBuffer()}),env);
      return route.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body:Buffer.from(await result.arrayBuffer())});
    }
    if(url.href.startsWith(base))return route.fulfill({path:path.resolve(url.pathname.slice('/Moj-planer/'.length)||'index.html')});
    return route.fulfill({json:{}});
  });
  const page=await owner.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await permissions.dismissInitialPermissions(page);
  await page.evaluate(async({token,id})=>{
    saveShopping('id',id);saveShopping('title','Zakupy rodzinne');await setupShoppingOwner(token);
    addIdea({text:'Moje produkty',list:{type:'shopping',items:['Tylko prywatne']}});
  },{token,id});
  const paper=page.frameLocator('#ownerPaperDialog iframe');
  const sheet=paper.locator('#sheet');
  const size=()=>sheet.evaluate(el=>[el.offsetWidth,el.offsetHeight]);
  const button=name=>paper.getByRole('button',{name,exact:true});
  await page.locator('#phoneShopping').tap();
  await paper.locator('#rows').getByText('Tylko prywatne').waitFor();
  const privateSize=await size();
  assert.equal(await paper.locator('.underlay').count(),1);
  await paper.locator('#choose').tap();
  await paper.getByRole('button',{name:/Zakupy rodzinne.*Dotychczasowa/}).tap();
  await paper.locator('#people').getByText(/Zosia/).waitFor();
  assert.ok(await page.locator('#shoppingModal').isHidden());
  assert.deepEqual(await size(),privateSize);
  assert.ok(await paper.locator('#rows .row').filter({hasText:'Masło'}).getByText('(Zosia)').isVisible());
  assert.ok(await paper.locator('#bought .row').filter({hasText:'Herbata'}).isDisabled());
  assert.equal((await api('read',{},true)).revision,initial.revision,'merely opening the sheet must not republish it');
  await button('Dodaj').tap();await paper.getByLabel('Nazwa produktu').fill('Oliwa');await paper.locator('form button').tap();
  await paper.locator('#rows').getByText('Oliwa').waitFor();
  await paper.locator('#rows').getByText('Chleb').tap();
  await paper.locator('#bought .row').filter({hasText:'Chleb'}).waitFor();
  await page.waitForFunction(()=>!legacyPaperDirty&&!shoppingSyncBusy);
  const guestView=await api('read',{actor});
  assert.equal(guestView.rows.find(row=>row.key==='bread').by,'Robert');
  assert.ok(guestView.rows.some(row=>row.text==='Oliwa'));
  assert.ok(!guestView.rows.some(row=>row.text==='Tylko prywatne'));
  const oil=guestView.rows.find(row=>row.text==='Oliwa');
  await api('mark',{actor,keys:[oil.key],done:true,revision:guestView.revision});
  await paper.locator('#bought .row').filter({hasText:'Oliwa'}).getByText('(Zosia)').waitFor();
  await paper.locator('#more').tap();await button('Usuń produkt').tap();await button('Masło').tap();
  await paper.locator('#rows .row').filter({hasText:'Masło'}).waitFor({state:'detached'});
  await page.waitForFunction(()=>!legacyPaperDirty&&!shoppingSyncBusy);
  assert.ok(!(await api('read',{actor})).rows.some(row=>row.text==='Masło'));
  await paper.locator('#more').tap();await button('Zmień nazwę').tap();
  await paper.getByLabel('Nazwa listy').fill('Dom i ogród');await button('Zapisz').tap();
  await paper.getByRole('heading',{name:'Dom i ogród'}).waitFor();
  await page.waitForFunction(()=>!legacyPaperDirty&&!shoppingSyncBusy);
  assert.equal((await api('read',{actor})).title,'Dom i ogród');
  assert.equal((await api('invite-info',{invite})).available,true,'existing unspent seat survives');
  await paper.locator('#people').tap();await page.locator('#shoppingAccessDialog[open]').getByText('Zosia',{exact:true}).waitFor();
  await page.locator('#shoppingAccessDone').tap();
  await button('Udostępnij').tap();await page.locator('#shoppingInviteDialog[open]').waitFor();
  await page.locator('#shoppingInviteClose').tap();
  assert.ok(await paper.getByRole('heading',{name:'Dom i ogród'}).isVisible());
  await button('Zamknij zakupy').tap();
  assert.deepEqual(await page.evaluate(()=>ideas.flatMap(i=>i.list?.items||[]).map(i=>i.text)),['Tylko prywatne']);
  await page.reload();await permissions.dismissInitialPermissions(page);
  await page.locator('#phoneShopping').tap();await paper.locator('#more').tap();await button('Zestawienie list źródłowych').tap();
  await page.locator('#shoppingResumeLegacy').tap();await paper.getByRole('heading',{name:'Dom i ogród'}).waitFor();
  assert.ok(await page.locator('#shoppingModal').isHidden());
  assert.ok(await paper.locator('#bought').getByText('Herbata').isVisible());
  assert.ok(!actions.includes('/shopping/create'));
  assert.deepEqual(errors,[]);
  console.log('Legacy list: stack, real server read without republishing, owner and guest purchases, signatures, existing invitation, members, native invitation controls, cached reopen and source shortcut verified.');
}finally{await browser.close();db.close();}
