// Owner-side cards. Only selected product labels cross from the planner
// into this store. Existing shared-list sessions and credentials live separately.
function setupShoppingCards() {
  const panel = $('shoppingCardPanel');
  const scroll = panel.parentElement;
  const message = $('shoppingCardMessage');
  const content = $('shoppingCardContent');
  const actions = $('shoppingCardButtons');
  let opening = null;
  let page = 0;
  let saving = false;
  let opener = null;

  function database() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open('okti-shopping-cards-v1:' + shoppingPrivatePrefix, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('cards', {keyPath:'id'});
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); opening = null; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch(error => { opening = null; throw error; });
    return opening;
  }

  async function transaction(mode, start) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cards', mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || Error('Zapis został przerwany.'));
      start(tx.objectStore('cards'), value => { result = value; });
    });
  }

  function addCard(texts) {
    const card = {id:crypto.randomUUID(), title:'Lista wspólna', createdAt:new Date().toISOString(),
      items:texts.map(text => ({id:crypto.randomUUID(), text, done:false}))};
    return transaction('readwrite', (store, finish) => { store.add(card); finish(card); });
  }

  function editCard(id, change) {
    // A read and its update share one IndexedDB transaction across tabs.
    return transaction('readwrite', (store, finish) => {
      const get = store.get(id);
      get.onsuccess = () => {
        const latest = get.result;
        if (!latest) { store.transaction.abort(); return; }
        change(latest);
        store.put(latest);
        finish(latest);
      };
    });
  }

  function privateItems() {
    PlannerData.assertWritable();
    const result = new Map();
    for (const idea of ideas) {
      if (idea.list?.type !== 'shopping') continue;
      const repeats = new Map();
      for (const item of idea.list.items) {
        if (!item || item.shoppingGuestKey || typeof item.text !== 'string' || !item.text.trim()) continue;
        const identity = JSON.stringify([idea.id, item.id ?? item.text]);
        const occurrence = repeats.get(identity) || 0;
        repeats.set(identity, occurrence + 1);
        result.set(JSON.stringify([identity, occurrence]), {
          text:item.text, done:!!item.done, source:idea.title || ''
        });
      }
    }
    return result;
  }

  function close() {
    clearInterval(refreshTimer);
    page++;
    saving = false;
    actions.inert = content.inert = false;
    panel.hidden = true;
    $('shoppingModal').setAttribute('aria-labelledby','shoppingNameText');
    scroll.classList.remove('show-shopping-cards');
    content.replaceChildren();
    actions.replaceChildren();
    if (opener?.isConnected && !opener.hidden) opener.focus({preventScroll:true});
    opener = null;
  }

  function view(title) {
    clearInterval(refreshTimer);
    if (panel.hidden) opener = document.activeElement;
    page++;
    panel.hidden = false;
    $('shoppingModal').setAttribute('aria-labelledby','shoppingCardTitle');
    scroll.classList.add('show-shopping-cards');
    $('shoppingCardTitle').textContent = title;
    content.replaceChildren();
    actions.replaceChildren();
    message.textContent = '';
    $('shoppingCardPrivate').hidden = false;
    content.scrollTop = 0;
    $('shoppingCardTitle').focus({preventScroll:true});
    return page;
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function button(parent, text, handler) {
    const control = element('button', text);
    control.type = 'button';
    control.onclick = handler;
    parent.append(control);
    return control;
  }

  async function commit(operation) {
    if (saving) return;
    saving = operation;
    const expectedPage = page;
    actions.inert = content.inert = true;
    try {
      const card = await operation();
      if (page === expectedPage) showCard(card);
    } catch (error) {
      if (page === expectedPage) message.textContent = error instanceof Error ? error.message : 'Nie udało się zapisać kartki. Spróbuj ponownie.';
    } finally {
      if (saving === operation) {
        actions.inert = content.inert = false;
        saving = false;
      }
    }
  }

  function ask() {
    view('Czy chcesz dodać produkty ze swojej listy?');
    $('shoppingCardPrivate').hidden = true;
    button(actions, 'Tak, wybiorę produkty', selectItems);
    button(actions, 'Nie, utwórz pustą listę', () => commit(() => addCard([])));
    button(actions, 'Anuluj', close);
  }

  function selectItems() {
    let snapshot;
    try { snapshot = privateItems(); }
    catch { message.textContent = 'Nie można odczytać prywatnej listy. Odśwież Okti i spróbuj ponownie.'; return; }
    view('Wybierz produkty do skopiowania');
    $('shoppingCardPrivate').hidden = true;
    const selected = new Set();
    const duplicates = new Set(), names = new Set();
    for (const {text} of snapshot.values()) { if (names.has(text)) duplicates.add(text); names.add(text); }
    const copy = button(actions, 'Skopiuj zaznaczone', () => {
      if (!selected.size) return;
      let latest;
      try { latest = privateItems(); }
      catch { message.textContent = 'Prywatna lista zmieniła się. Odśwież Okti i spróbuj ponownie.'; return; }
      const texts = [];
      for (const [key, item] of snapshot) {
        if (!selected.has(key)) continue;
        const now = latest.get(key);
        if (!now || now.text !== item.text || now.done !== item.done) {
          selectItems();
          message.textContent = 'Prywatna lista zmieniła się. Zaznacz produkty ponownie.';
          return;
        }
        texts.push(item.text);
      }
      commit(() => addCard(texts));
    });
    copy.disabled = true;
    for (const bought of [false, true]) {
      const group = bought ? element('details') : content;
      if (bought) group.append(element('summary', 'Kupione na prywatnej liście'));
      for (const [key, item] of snapshot) {
        if (item.done !== bought) continue;
        const label = element('label'), check = element('input'), name = element('span',item.text);
        check.type = 'checkbox';
        check.onchange = () => {
          if (check.checked) selected.add(key); else selected.delete(key);
          copy.disabled = !selected.size;
          copy.textContent = selected.size ? 'Skopiuj zaznaczone (' + selected.size + ')' : 'Skopiuj zaznaczone';
        };
        if (duplicates.has(item.text) && item.source) name.append(element('small',item.source));
        label.append(check,name);
        group.append(label);
      }
      if (bought && group.childElementCount > 1) content.append(group);
    }
    if (!snapshot.size) {
      content.append(element('p','Twoja prywatna lista jest pusta.'));
      button(actions, 'Utwórz pustą listę', () => commit(() => addCard([])));
    }
    button(actions, 'Wstecz', ask);
    button(actions, 'Anuluj', close);
  }

  async function catalog() {
    const expectedPage = view('Moje listy wspólne');
    try {
      const cards = await transaction('readonly', (store, finish) => {
        const request = store.getAll();
        request.onsuccess = () => finish(request.result);
      });
      if (page !== expectedPage) return;
      cards.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
      for (const card of cards) {
        const entry = button(content, card.title, () => showCard(card));
        entry.append(element('small', 'Do kupienia: ' + card.items.filter(item => !item.done).length));
      }
      if (!cards.length) content.append(element('p','Nie masz jeszcze nowych wspólnych kartek.'));
    } catch {
      if (page === expectedPage) message.textContent = 'Nie udało się wczytać kartek z tego urządzenia.';
    }
    if (page === expectedPage) button(actions, 'Utwórz listę wspólną', ask);
  }

  function inputForm(label, initial, max, saveText, onSubmit) {
    const form = element('form'), input = element('input'), save = element('button',saveText);
    input.type = 'text'; input.maxLength = max; input.required = true; input.value = initial;
    input.setAttribute('aria-label',label); input.placeholder = label;
    save.type = 'submit'; form.append(input,save); content.prepend(form);
    form.onsubmit = event => {
      event.preventDefault();
      if (input.value.trim()) onSubmit(input.value.trim());
    };
    input.focus();
  }

  const productionPlanner = location.origin === 'https://2ntb8nys8z-max.github.io' &&
    /^\/Moj-planer\/(?:index\.html)?$/.test(location.pathname);
  const guestOrigin = productionPlanner
    ? 'https://okti-wspolne-zakupy.oakgait2.chatgpt.site'
    : 'https://okti-zaproszenie-zakupy.oakgait2.chatgpt.site';
  let refreshTimer = null;
  let refreshing = false;
  async function api(action,card,data={}) {
    const response=await fetch(guestOrigin+'/shopping/'+action,{method:'POST',credentials:'omit',cache:'no-store',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+card.share.owner},
      body:JSON.stringify({id:card.id,...data})});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||'Nie udało się połączyć z listą.');
    return result;
  }
  function remember(id,remote,finish) {
    return editCard(id,latest=>{
      if(!latest.share)return;
      if(finish)finish(latest.share);
      if((latest.share.revision||0)>remote.revision)return;
      latest.title=remote.title;
      latest.items=remote.rows;
      Object.assign(latest.share,{ready:true,revision:remote.revision,generation:remote.generation,
        used:remote.used,active:remote.active,remaining:remote.remaining,open:remote.open,members:remote.members});
    });
  }
  async function refreshCard(card,expectedPage) {
    if(refreshing||saving||page!==expectedPage||document.hidden||content.querySelector('form')||shoppingPaperMotion?.closing)return;
    refreshing=true;
    try{
      const result=await api('owner-read',card);
      if(page!==expectedPage||saving||content.querySelector('form'))return;
      // Cards cached before full author names need the read even at the same revision.
      if(result.revision<card.share.revision ||
         (result.revision===card.share.revision && card.items.every(item=>item.authorName))){
        if(message.textContent==='Brak połączenia. Spróbuję ponownie.')message.textContent=shoppers(card);
        return;
      }
      const updated=await remember(card.id,result);
      if(page!==expectedPage||saving||content.querySelector('form'))return;
      const newMember=updated.share.members.find(m=>!card.share.members.some(old=>old.id===m.id));
      showCard(updated);
      if(newMember)message.textContent=newMember.nick+' dołącza do zakupów.';
    }catch{if(page===expectedPage)message.textContent='Brak połączenia. Spróbuję ponownie.';}
    finally{refreshing=false;}
  }
  async function changeProduct(id,change) {
    const latest=await editCard(id,card=>{
      if(card.share)return;
      if(change.type==='add')card.items.push({id:change.id,text:change.text,done:false});
      if(change.type==='rename')card.title=change.title;
      if(change.type==='mark'){const row=card.items.find(i=>i.id===change.id);if(row)row.done=change.done;}
    });
    if(!latest.share)return latest;
    if(!latest.share.ready)throw Error('Dokończ przygotowanie zaproszenia przed zmianą kartki.');
    return remember(id,await api('edit',latest,{change}));
  }
  function runShare(task,next) {
    if(saving)return;
    const here=page;
    saving=task;
    actions.inert=content.inert=true;
    message.textContent='Łączenie z listą…';
    Promise.resolve().then(task).then(card=>{
      if(page!==here||saving!==task)return;
      saving=false;
      actions.inert=content.inert=false;
      next(card);
    }).catch(error=>{
      if(page===here)message.textContent=error instanceof TypeError?'Brak połączenia z listą. Spróbuj ponownie.':error.message;
    }).finally(()=>{if(saving===task){saving=false;actions.inert=content.inert=false;}});
  }
  async function prepareFirst(id,seats) {
    const card=await editCard(id,current=>{
      if(!current.share)current.share={owner:crypto.randomUUID(),invite:crypto.randomUUID(),seats,ready:false};
    });
    if(card.share.ready)return card;
    const {owner,invite}=card.share;
    if(!owner||!invite)throw Error('Nie można odczytać zaproszenia na tym urządzeniu.');
    const result=await api('create',card,{invite,seats:card.share.seats,title:card.title,
      items:card.items.map(({id,text,done})=>({id,text,done}))});
    return remember(id,result);
  }
  async function extend(card,seats) {
    const current=await editCard(card.id,latest=>{
      if(!latest.share.next)latest.share.next={invite:crypto.randomUUID(),previous:latest.share.open?latest.share.invite:null,
        generation:latest.share.generation,seats};
    });
    const next=current.share.next;
    const result=await api('rotate',current,next);
    return remember(card.id,result,share=>{
      if(share.next?.invite===next.invite){share.invite=next.invite;delete share.next;}
    });
  }
  function countPeople(card,additional=false) {
    const share=card.share;
    const ready=!!share?.ready;
    const remaining=ready&&share.open ? share.remaining : 0;
    const adding=ready&&(additional||remaining===0);
    const pending=share?.next || (share&&!ready ? share : null);
    view(adding?'Ile kolejnych osób chcesz zaprosić?':'Ile osób chcesz zaprosić?');
    if(ready){
      content.append(element('p','Zajęte miejsca: '+share.used+' · Wolne miejsca: '+share.remaining));
    }
    let count=pending?.seats ?? (adding?1:ready?Math.min(3,remaining):3);
    const counter=element('div',undefined,'shopping-card-counter');
    const minus=button(counter,'−',()=>change(-1)),value=element('output');
    counter.append(value);
    const plus=button(counter,'+',()=>change(1));
    minus.setAttribute('aria-label','Mniej osób');
    plus.setAttribute('aria-label','Więcej osób');
    value.setAttribute('aria-live','polite');
    const notice=element('p');
    content.append(counter,notice);
    const extraSeats=()=>adding?count:Math.max(0,count-remaining);
    const send=button(actions,'Wyślij zaproszenie',()=>{
      if(!ready)runShare(()=>prepareFirst(card.id,count),deliver);
      else if(extraSeats()>0)runShare(()=>extend(card,extraSeats()),deliver);
      else deliver(card);
    });
    function change(delta){
      count=Math.max(1,Math.min(200,count+delta));
      value.textContent=String(count);
      minus.disabled=!!pending||count===1;
      plus.disabled=!!pending||count===200;
      if(!ready)notice.textContent=pending?'Dokończ wysyłkę z wcześniej wybraną liczbą osób.':'';
      else if(!extraSeats())notice.textContent='Wyślesz ten sam link. Liczba dostępnych miejsc się nie zmieni.';
      else {
        notice.textContent='Dodatkowe miejsca: '+extraSeats()+'.';
        if(remaining>0)notice.textContent+=' Poprzedni link przestanie działać dla nowych osób. Wyślij nowy link również tym, którzy jeszcze nie dołączyli.';
      }
      send.textContent=ready&&extraSeats()>0?'Dodaj miejsca i wyślij':'Wyślij zaproszenie';
    }
    change(0);
    button(actions,'Anuluj',()=>showCard(card));
  }

  function inviteUrl(card) {
    const link=new URL('/',guestOrigin);
    link.hash=new URLSearchParams({lista:card.id,zaproszenie:card.share.invite}).toString();
    return link.href;
  }

  function deliveryOptions(card,retry) {
    view('Wyślij zaproszenie');
    if(retry)button(actions,'Wyślij zaproszenie',()=>deliver(card,true));
    const url=inviteUrl(card);
    const field=element('input');
    field.type='text';field.readOnly=true;field.value=url;
    field.setAttribute('aria-label','Link do tej listy');
    field.onclick=()=>field.select();
    field.hidden=retry;
    content.append(field);
    button(actions,'Kopiuj link',async()=>{
      try{await navigator.clipboard.writeText(url);message.textContent='Link skopiowany.';}
      catch{field.hidden=false;field.focus();field.select();message.textContent='Zaznaczony link możesz skopiować ręcznie.';}
    });
    button(actions,'Wróć do kartki',()=>showCard(card));
  }

  async function deliver(card,retried=false) {
    if(saving)return;
    if(!card.share?.open||card.share.next||!card.share.remaining){participants(card);return;}
    if(typeof navigator.share!=='function'){deliveryOptions(card,false);return;}
    const here=page,lock={};
    saving=lock;
    try{
      await navigator.share({title:card.title,url:inviteUrl(card)});
      if(page!==here)return;
      showCard(card);
      try{
        if(localStorage.getItem('okti.shopping.animationSounds')!=='off'){
          const audio=new Audio('shopping-flyby-glide.m4a');audio.play().catch(()=>{});
        }
      }catch{}
      $('shoppingModal').classList.add('shopping-modal-closing');startShoppingPaper(true,true);
    }catch(error){
      if(page!==here)return;
      if(error.name==='AbortError'){showCard(card);return;}
      // Some browsers require a fresh tap after the server creates an invitation.
      deliveryOptions(card,error.name==='NotAllowedError'&&!retried);
    }finally{if(saving===lock)saving=false;}
  }
  function participants(card) {
    view('Uczestnicy');
    const s=card.share;
    content.append(element('p','Aktywni goście: '+s.active+' · Zajęte miejsca: '+s.used+' · Wolne: '+s.remaining));
    for(const member of s.members){
      const row=element('div',undefined,'shopping-card-member');
      row.append(element('span',member.nick+(member.revoked?' · dostęp odebrany':'')));
      button(row,member.revoked?'Przywróć dostęp':'Odbierz dostęp',()=>{
        if(!member.revoked&&!confirm('Odebrać dostęp osobie '+member.nick+'?'))return;
        runShare(async()=>remember(card.id,await api(member.revoked?'restore-access':'revoke',card,{member:member.id})),participants);
      });content.append(row);
    }
    button(actions,s.next?'Dokończ wysyłkę':'Zaproś kolejne osoby',()=>countPeople(card,true));
    if(s.open&&!s.next)button(actions,'Zablokuj dołączanie',()=>{
      if(confirm('Zablokować dołączanie nowych osób przez ten link?'))runShare(async()=>remember(card.id,await api('close-joining',card)),participants);
    });
    button(actions,'Wróć do kartki',()=>showCard(card));
  }
  function startSharing(card) {
    if(!card.share?.ready){countPeople(card);return;}
    runShare(async()=>remember(card.id,await api('owner-read',card)),
      fresh=>countPeople(fresh,!!fresh.share.next));
  }

  function shoppers(card) {
    const names=card.share.members.filter(m=>!m.revoked).map(m=>m.nick);
    return names.length?'Razem kupują: '+new Intl.ListFormat('pl').format(['Robert',...names]):'Listę udostępnia Robert';
  }

  function showCard(card) {
    view(card.title);
    if(card.share?.ready){
      message.textContent=shoppers(card);
      const here=page;
      refreshTimer=setInterval(()=>refreshCard(card,here),4000);
      if(card.items.some(item=>!item.authorName))refreshCard(card,here);
    }else message.textContent=card.share?'Zaproszenie wymaga dokończenia.':'Kartka zapisana na tym urządzeniu.';
    const update = change => commit(() => changeProduct(card.id,change));
    for (const bought of [false,true]) {
      const items = card.items.filter(item => item.done === bought);
      if (bought && items.length) content.append(element('h3','Kupione'));
      for (const item of items) {
        const label = element('label'), check = element('input');
        check.type = 'checkbox'; check.checked = bought; check.disabled=bought&&item.canUndo===false;
        check.onchange = () => {
          const done = check.checked;
          check.checked = bought;
          update({type:'mark',id:item.id,done});
        };
        label.append(check,element(bought ? 's' : 'span',item.text));
        // Before sharing, every product on this device's card was added by its owner.
        const authorName=item.authorName || (!card.share?.ready ? 'Robert' : '');
        if(authorName)label.append(shoppingAuthorNote(authorName));
        const buyerName=bought && (item.by || (!card.share?.ready ? 'Robert' : ''));
        if(buyerName){
          const signature=element('em','('+buyerName+')','shopping-buyer');
          signature.title='Kupuje '+buyerName;
          label.append(signature);
        }
        content.append(label);
      }
    }
    if (!card.items.length) content.append(element('p','Lista jest pusta.'));
    const add = button(actions, 'Dodaj produkt', () => {
      if (content.querySelector('form')) return;
      inputForm('Nazwa produktu','',160,'Dodaj',text => update({type:'add',id:crypto.randomUUID(),text}));
    });
    add.className = 'shopping-card-add';
    add.setAttribute('aria-label','Dodaj produkt');
    button(actions, 'Zmień nazwę', () => {
      if (content.querySelector('form')) return;
      inputForm('Nazwa listy',card.title,80,'Zapisz',title => update({type:'rename',title}));
    });
    button(actions,'Udostępnij',()=>startSharing(card));
    if(card.share?.ready)button(actions,'Uczestnicy',()=>runShare(async()=>remember(card.id,await api('owner-read',card)),participants));
    button(actions, 'Moje listy wspólne', catalog);
  }

  $('shoppingCardPrivate').onclick = () => { if (!saving) close(); };
  $('shoppingCreateShared').onclick = ask;
  $('shoppingCardCatalog').onclick = catalog;
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!saving) close(); }
  });
  return {close};
}
