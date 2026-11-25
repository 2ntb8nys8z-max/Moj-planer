// Owner-side, unshared cards. Only selected product labels cross from the planner
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
    } catch {
      if (page === expectedPage) message.textContent = 'Nie udało się zapisać kartki na urządzeniu. Spróbuj ponownie.';
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

  function showCard(card) {
    view(card.title);
    message.textContent = 'Kartka zapisana na tym urządzeniu.';
    const update = change => commit(() => editCard(card.id,change));
    for (const bought of [false,true]) {
      const items = card.items.filter(item => item.done === bought);
      if (bought && items.length) content.append(element('h3','Kupione'));
      for (const item of items) {
        const label = element('label'), check = element('input');
        check.type = 'checkbox'; check.checked = bought;
        check.onchange = () => {
          const done = check.checked;
          check.checked = bought;
          update(latest => { const product=latest.items.find(row=>row.id===item.id); if (product) product.done=done; });
        };
        label.append(check,element(bought ? 's' : 'span',item.text));
        content.append(label);
      }
    }
    if (!card.items.length) content.append(element('p','Lista jest pusta.'));
    const add = button(actions, 'Dodaj produkt', () => {
      if (content.querySelector('form')) return;
      inputForm('Nazwa produktu','',160,'Dodaj',text => update(latest => latest.items.push({id:crypto.randomUUID(),text,done:false})));
    });
    add.className = 'shopping-card-add';
    add.setAttribute('aria-label','Dodaj produkt');
    button(actions, 'Zmień nazwę', () => {
      if (content.querySelector('form')) return;
      inputForm('Nazwa listy',card.title,80,'Zapisz',title => update(latest => { latest.title=title; }));
    });
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
