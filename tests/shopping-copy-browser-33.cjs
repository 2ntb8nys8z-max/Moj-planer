const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require(process.env.PLANNER_PLAYWRIGHT || 'playwright');
const {dismissInitialPermissions} = require('./permission-fixture.cjs');

async function check() {
  const browser = await chromium.launch(process.env.PLANNER_CHROMIUM ? {executablePath:process.env.PLANNER_CHROMIUM} : {});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const remoteShopping = [];
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === 'https://planner.test') return route.fulfill({path:path.resolve('.'+url.pathname)});
      if (url.pathname.startsWith('/shopping/')) remoteShopping.push(url.pathname);
      return route.fulfill({json:{}});
    });
    await page.goto('https://planner.test/index.html');
    await dismissInitialPermissions(page);
    await page.evaluate(() => {
      ideas = [
        normalizeIdea({id:'home', title:'Dom',text:'Prywatna notatka',list:{type:'shopping',items:[
          {id:'milk',text:'Mleko 2 l',done:false}, {id:'tea',text:'Herbata',done:false},
          {id:'bread',text:'Chleb',done:true,shoppingBuyer:'Robert'}]}}),
        normalizeIdea({id:'shared-shopping-old',title:'Wyjazd',text:'Stary wpis',list:{type:'shopping',items:[
          {id:'tea2',text:'Herbata',done:false},
          {id:'guest',text:'Zakup gościa',done:false,shoppingGuestKey:'old'}]}})
      ];
      saveIdeas();
    });
    const original = await page.evaluate(() => JSON.stringify(PlannerData.snapshot()));
    const panel = page.locator('#shoppingCardPanel');
    const button = name => panel.getByRole('button',{name,exact:true});
    const title = name => panel.getByRole('heading',{name,exact:true}).waitFor();
    const ask = async () => {
      await page.locator('#shoppingCreateShared').click();
      await title('Czy chcesz dodać produkty ze swojej listy?');
    };
    const privateList = () => button('Wróć do zakupów').click();
    const openPrivate = () => page.locator('#phoneShopping').click();

    await openPrivate();
    await ask();
    await button('Tak, wybiorę produkty').click();
    assert.equal(await panel.locator('input:checked').count(),0);
    assert.equal(await button('Skopiuj zaznaczone').isDisabled(),true);
    assert.equal(await panel.getByText('Zakup gościa').count(),0);
    await panel.getByLabel('Mleko 2 l',{exact:true}).check();
    await button('Anuluj').click();
    await page.locator('#shoppingCardCatalog').click();
    await panel.getByText('Nie masz jeszcze nowych wspólnych kartek.').waitFor();
    await privateList();

    await ask();
    await button('Tak, wybiorę produkty').click();
    await panel.getByLabel('Mleko 2 l',{exact:true}).check();
    await panel.getByLabel(/Herbata.*Wyjazd/).check();
    await panel.locator('summary').click();
    await panel.getByLabel('Chleb',{exact:true}).check();
    await button('Skopiuj zaznaczone (3)').click();
    await title('Lista wspólna');
    assert.equal(await panel.locator('input[type=checkbox]').count(),3);
    assert.equal(await panel.locator('input:checked').count(),0);
    await button('Zmień nazwę').click();
    await panel.getByRole('textbox',{name:'Nazwa listy'}).fill('Zakupy na sobotę');
    await button('Zapisz').click();
    await title('Zakupy na sobotę');
    await panel.getByLabel('Mleko 2 l').click();
    await panel.locator('s',{hasText:'Mleko 2 l'}).waitFor();
    await privateList();
    assert.equal(await page.evaluate(()=>JSON.stringify(PlannerData.snapshot())),original);

    await ask();
    await button('Nie, utwórz pustą listę').click();
    await panel.getByText('Lista jest pusta.').waitFor();
    await button('Dodaj produkt').click();
    await panel.getByRole('textbox',{name:'Nazwa produktu'}).fill('Jabłka');
    await button('Dodaj').click();
    await panel.getByLabel('Jabłka').waitFor();
    await page.reload();
    await dismissInitialPermissions(page);
    await openPrivate();
    await page.locator('#shoppingCardCatalog').click();
    await panel.getByRole('button',{name:/Zakupy na sobotę/}).click();
    await title('Zakupy na sobotę');
    assert.equal(await panel.getByLabel('Mleko 2 l').isChecked(),true);
    assert.equal(await panel.getByText('Jabłka').count(),0);
    assert.equal(await page.evaluate(()=>JSON.stringify(PlannerData.snapshot())),original);
    assert.deepEqual(remoteShopping,[]);
    console.log('Private → choose/cancel/empty/selected copy → independent marks, duplicate labels, purchased source, rename and reopen passed.');
  } finally { await browser.close(); }
}
check().catch(error => { console.error(error); process.exitCode=1; });
