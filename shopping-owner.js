'use strict';
const $ = id=>document.getElementById(id);
const data = window.parent.ownerPaperData;
const box='<svg class="box" viewBox="0 0 28 28" aria-hidden="true"><path stroke-width="1.4" d="M4 5.4 21.8 5l.3 18-18.6.5Z"/><path class="tick" stroke-width="2.7" d="M6.8 14.6Q9 15.6 12.3 20.2Q15.3 14.8 18.7 10.7T25.2 4.1"/></svg>';
let lists=[], active=0, busy=false, refreshing=false, changeVersion=0, toastTimer;
const card=()=>lists[active];
const node=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n};
function notice(txt){$('notice').textContent=txt;$('notice').className='on';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('notice').className='',4800);}
function close(){if($('panel').open)$('panel').close();}
function panel(title){$('body').onchange=null;$('dialogTitle').textContent=title;$('body').replaceChildren();if(!$('panel').open)$('panel').showModal();return $('body');}
function action(label,fn,{sub='',tail='',danger=false}={}){
  const b=node('button',undefined,'choice'+(danger?' danger':'')),t=node('span',label);
  if(sub)t.append(node('small',sub));b.append(t);if(tail)b.append(node('span',tail));b.onclick=fn;$('body').append(b);return b;
}
function peopleLabel(c){
  if(c.private)return 'Lista prywatna';
  const names=(c.members||[]).filter(p=>!p.revoked).map(p=>p.nick);
  return names.length?'Razem kupują: '+new Intl.ListFormat('pl').format(['Robert',...names]):'Lista wspólna · Robert';
}
async function run(fn){
  if(busy)return;
  changeVersion++;busy=true;document.body.setAttribute('aria-busy','true');
  try{await fn();}catch(error){notice(error.message||'Nie udało się zapisać zmiany.');}
  finally{busy=false;document.body.removeAttribute('aria-busy');}
}
function update(next){
  const id=card()?.id,order=stackOrder.map(i=>lists[i]?.id);
  const tilt=new Map(lists.filter(c=>c.tilt!==undefined).map(c=>[c.id,c.tilt]));
  lists=next;
  for(const c of lists)if(tilt.has(c.id))c.tilt=tilt.get(c.id);
  active=Math.max(0,lists.findIndex(c=>c.id===id));
  const indices=order.map(key=>lists.findIndex(c=>c.id===key)).filter(i=>i>=0);
  stackOrder=[...new Set([...indices,...lists.map((_,i)=>i)])];
}
async function reload(){
  update(await data.list());render();layers();
}
async function mutate(change){
  const id=card().id;
  await data.change(id,change);
  close();await reload();
}
async function markItem(c,item,button){
  const label=button.querySelector('.name'),start=label.getBoundingClientRect();
  await data.change(c.id,{type:'mark',id:item.id,done:!item.done,fingerprint:item.fingerprint});
  if(card().id!==c.id)return;
  if(!reducedMotion.matches && typeof label.animate==='function'){
    label.classList.toggle('inking',!item.done);
    await label.animate([{opacity:1},{opacity:.45}],{duration:170}).finished.catch(()=>{});
  }
  await reload();
  if(card().id!==c.id||reducedMotion.matches||typeof label.animate!=='function')return;
  const dest=[...$(item.done?'rows':'bought').children].find(row=>row.dataset.rowId===item.id);
  const landing=dest?.getBoundingClientRect().height?dest.querySelector('.name'):$('boughtLabel');
  const end=landing.getBoundingClientRect(),fly=node('span',item.text,'flying-product');
  Object.assign(fly.style,{left:start.left+'px',top:start.top+'px',width:start.width+'px'});
  document.body.append(fly);
  const animation=fly.animate([{transform:'translate(0,0)',opacity:.85},
    {transform:'translate('+(end.left-start.left)+'px,'+(end.top-start.top)+'px)',opacity:.05}],
    {duration:440,easing:'ease-in-out'});
  animation.finished.finally(()=>fly.remove()).catch(()=>{});
}
function render(){
  const c=card();
  $('title').textContent=c.title;$('people').textContent=peopleLabel(c);$('people').disabled=c.private||c.archived;
  $('rows').replaceChildren();$('bought').replaceChildren();let count=0;
  for(const item of c.items){
    const b=node('button',undefined,'row'+(item.done?' done':''));
    b.innerHTML=box;b.append(node('span',item.text,'name'));b.setAttribute('aria-pressed',String(item.done));
    b.disabled=c.archived||(item.done&&item.canUndo===false);
    if(!c.private){
      const author=item.authorName||(!c.shared?'Robert':'');
      if(author){
        const sig=node('span','('+author+')','sig');sig.title='Dodaje '+author;b.append(sig);
      }
      if(item.done){
        const buyer=item.by||(!c.shared?'Robert':'');
        if(buyer){const sig=node('span','('+buyer+')','sig buyer');sig.title='Kupuje '+buyer;b.append(sig);}
      }
    }
    b.dataset.rowId=item.id;
    b.onclick=()=>run(()=>markItem(c,item,b));
    (item.done?$('bought'):$('rows')).append(b);if(item.done)count++;
  }
  if(!c.items.length)$('rows').append(node('p','Lista jest pusta.','blank'));
  $('boughtLabel').textContent='Kupione ('+count+')';$('foot').hidden=!!c.archived;$('closed').hidden=!c.archived;
}
const deck = $('deck');
const sheet = $('sheet');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let motion = [];
let transitionNumber = 0;
let stackOrder = lists.map((_, index) => index);
// Each list keeps its own resting angle when it changes position in the pile.
const restingAngles = [-0.7, 1.6, -1.9, 0.95, -1.35, 1.85];
function restingAngle(index) {
  return lists[index].tilt ?? restingAngles[index % restingAngles.length];
}

function paperPose(index, depth = 0) {
  const x = 7 * depth + [0, -2, 2, -1, 1][index % 5];
  const y = 9 * depth + [0, 1, -1][index % 3];
  return `translate(${x}px,${y}px) rotate(${restingAngle(index)}deg)`;
}

function settle() {
  ++transitionNumber;
  for (const animation of motion) animation.cancel();
  motion = [];
  deck.querySelector('.departing')?.remove();
  deck.inert = false;
}

function layers() {
  // An archived sheet is read on its own, outside the stack of active cards.
  stackOrder = [active, ...stackOrder.filter(index => index !== active)];
  const underneath = card().archived ? [] : stackOrder.slice(1).filter(index => !lists[index].archived);
  const count = underneath.length;
  const fan = count ? Math.min(1, 2 / count) : 0;
  sheet.style.transform = paperPose(active);
  $('cornerGrip').hidden = count === 0;
  $('underlays').replaceChildren();
  for (let depth=count; depth>0; depth--) {
    const layer = node('div', undefined, 'underlay');
    const distance = depth * fan;
    const index = underneath[depth-1];
    layer.dataset.listIndex = index;
    layer.style.transform = paperPose(index, distance);
    layer.style.setProperty('--paper-shade', Math.max(.81, .97-.037*distance));
    $('underlays').append(layer);
  }
  $('choose').setAttribute('aria-label','Wybierz listę. Otwarte listy: '+lists.filter(c => !c.archived).length);
}

function move(element, frames, duration, delay=0) {
  const animation = element.animate(frames, {duration,delay,fill:'both',easing:'cubic-bezier(.23,.74,.24,1)'});
  motion.push(animation);
  return animation;
}

async function whenSettled(number) {
  await Promise.allSettled(motion.map(a => a.finished));
  if (number === transitionNumber) settle();
}

function arrive() {
  layers();
  if (reducedMotion.matches || typeof sheet.animate !== 'function') return;
  const displayed = [...$('underlays').children, sheet];
  displayed.forEach((layer, index) => {
    const target = layer.style.transform || 'translate(0,0) rotate(0deg)';
    const extra = (displayed.length-1-index) / Math.max(1,displayed.length-1);
    move(layer, [
      {transform:'translate(-105vw,-24vh) rotate(-9deg) '+target},
      {transform:'translate(6px,1px) rotate(.6deg) '+target,offset:.82},
      {transform:target}
    ], 570, Math.round(125*(1-extra)));
  });
  whenSettled(transitionNumber);
}

function takeSnapshot() {
  const copy = sheet.cloneNode(true);
  copy.removeAttribute('id');
  copy.classList.add('departing');
  copy.setAttribute('aria-hidden','true');
  copy.inert = true;
  for (const child of copy.querySelectorAll('[id]')) {
    child.classList.add('snapshot-'+child.id);
    child.removeAttribute('id');
  }
  return copy;
}

function select(index, placingNew=false, interactive=false) {
  close();
  if (index === active) return;
  settle();
  const number = transitionNumber;
  const animate = !reducedMotion.matches && typeof sheet.animate === 'function';
  const oldIndex = active;
  const startingPose = sheet.style.transform;
  const raisedFrom = $('underlays').querySelector('[data-list-index="'+index+'"]')?.style.transform;
  if (placingNew && Math.sign(restingAngle(index)) === Math.sign(restingAngle(active))) {
    lists[index].tilt = -restingAngle(index);
  }
  const previous = animate ? takeSnapshot() : null;
  const content = $('paperContent');
  const previousScroll = content.scrollTop;
  const wasExpanded = $('finished').open;
  const previousOrder = stackOrder;
  active = index;
  $('finished').open = false;
  render();
  layers();
  content.scrollTop = 0;
  window.scrollTo(0,0);
  if (!animate) return;
  deck.append(previous);
  previous.querySelector('.paper-content').scrollTop = previousScroll;
  deck.inert = true;
  const target = sheet.style.transform;
  if (placingNew) {
    const tucked = $('underlays').querySelector('[data-list-index="'+oldIndex+'"]')?.style.transform || startingPose;
    previous.classList.add('under-new');
    move(previous,[{transform:startingPose},{transform:tucked}],510);
    move(sheet,[
      {transform:'translate(-106vw,-19vh) rotate(-10deg) '+target},
      {transform:'translate(5px,2px) rotate(.6deg) '+target,offset:.82},
      {transform:target}
    ],640);
  } else {
    const duration = 940;
    move(sheet,[{transform:raisedFrom || target},{transform:target}],duration);
    motion.push(...makePageTurn(previous, startingPose, duration));
    if (interactive) {
      const animations = motion.slice();
      for (const animation of animations) {
        animation.pause();
        animation.currentTime = 0;
      }
      return {
        drag(progress) {
          for (const animation of animations) animation.currentTime = progress * duration;
        },
        async release(commit) {
          for (const animation of animations) {
            animation.playbackRate = commit ? 1.45 : -2.2;
            animation.play();
          }
          await Promise.allSettled(animations.map(a => a.finished));
          if (number !== transitionNumber) return;
          if (commit) {
            render();
          } else {
            active = oldIndex;
            stackOrder = previousOrder;
            render();
            layers();
            $('finished').open = wasExpanded;
            content.scrollTop = previousScroll;
          }
          settle();
        }
      };
    }
  }
  whenSettled(number);
}

// Only the corner is a drag target. The rest of the sheet keeps native
// vertical scrolling, and switching by name remains available in the menu.
let pull = null;
$('cornerGrip').addEventListener('pointerdown', event => {
  if (pull || deck.inert || !event.isPrimary || event.button !== 0) return;
  const next = stackOrder.find(i => i !== active && !lists[i].archived);
  if (next === undefined) return;
  event.preventDefault();
  document.body.setPointerCapture(event.pointerId);
  pull = {id:event.pointerId, x:event.clientX, y:event.clientY, next,
    distance:.84*sheet.clientWidth+.14*sheet.clientHeight, progress:0, turn:null};
});
function trackPull(event) {
  if (!pull || event.pointerId !== pull.id) return;
  const travel = .82*(event.clientX-pull.x)+.57*(pull.y-event.clientY);
  pull.progress = Math.max(0,Math.min(.99,travel/pull.distance));
  if (!pull.turn && travel>5 && !reducedMotion.matches && typeof sheet.animate==='function') {
    pull.turn = select(pull.next,false,true);
  }
  pull.turn?.drag(pull.progress);
}
function releasePull(event) {
  if (!pull || event.pointerId !== pull.id) return;
  if (event.type==='pointerup') trackPull(event);
  const ending = pull;
  pull = null;
  const commit = event.type==='pointerup' && ending.progress>=.22;
  if (ending.turn) ending.turn.release(commit);
  else if (commit) select(ending.next);
  if (document.body.hasPointerCapture(ending.id)) document.body.releasePointerCapture(ending.id);
}
window.addEventListener('pointermove',trackPull);
window.addEventListener('pointerup',releasePull);
window.addEventListener('pointercancel',releasePull);
document.body.addEventListener('lostpointercapture',releasePull);

function choose(archived=false){
  panel(archived?'Archiwum':'Wybierz listę');
  if(archived&&!lists.some(c=>c.archived))$('body').append(node('p','Archiwum jest puste.','note'));
  lists.forEach((c,i)=>{
    if(!!c.archived!==archived)return;
    action(c.title,()=>select(i),{sub:c.private?'Prywatna':c.archived?'Zamknięta':peopleLabel(c),tail:i===active?'✓':''});
  });
  if(archived){action('Wybierz listę',()=>choose());return;}
  action('＋ Nowa lista wspólna',create);
  if(data.legacyAvailable())action('Dotychczasowa lista wspólna',()=>data.source(true));
  action('Archiwum',()=>choose(true));
}
function form(title,label,initial,accept,max,onSubmit){
  panel(title);
  const f=node('form'),wrap=node('div',undefined,'formline'),input=node('input');
  input.placeholder=label;input.setAttribute('aria-label',label);input.value=initial;input.required=true;input.maxLength=max;
  wrap.append(input);f.append(wrap);const ok=node('button',accept,'choice');ok.type='submit';f.append(ok);$('body').append(f);
  f.onsubmit=e=>{e.preventDefault();const value=input.value.trim();if(value)run(()=>onSubmit(value));};input.focus();
}
function create(){
  form('Nowa lista wspólna','Nazwa listy','','Dalej',80,title=>{
    const choices=data.choices(),selected=new Set();
    panel('Skopiować produkty?');
    for(const item of choices){
      const label=node('label',undefined,'check'),cb=node('input');cb.type='checkbox';
      cb.onchange=()=>cb.checked?selected.add(item):selected.delete(item);
      label.append(cb,node('span',item.text+(item.source?' · '+item.source:'')+(item.done?' · kupione':'')));$('body').append(label);
    }
    async function finish(items){
      const id=await data.create(title,items);
      update(await data.list());select(lists.findIndex(c=>c.id===id),true);
    }
    if(choices.length){
      const copy=action('Utwórz z zaznaczonymi',()=>run(()=>finish([...selected])));copy.disabled=true;
      $('body').onchange=()=>{copy.disabled=!selected.size;};
    }
    action('Utwórz pustą listę',()=>run(()=>finish([])));
  });
}
function share(){
  if(!card().private){run(()=>data.controls(card().id,'share'));return;}
  panel('Udostępnij zakupy');
  $('body').append(node('p','Utwórz wspólną kartkę i wybierz, które produkty chcesz skopiować.','note'));
  action('Utwórz listę wspólną',create);
}
function members(){
  const c=card();
  if(c.shared){run(()=>data.controls(c.id,'members'));return;}
  panel('Uczestnicy');$('body').append(node('p','Robert · właściciel','note'));action('Zaproś osoby',share);
}
function more(){
  const c=card();panel('Opcje listy');
  if(c.archived){action('Wybierz listę',()=>choose());return;}
  action('Zmień nazwę',()=>form('Zmień nazwę','Nazwa listy',c.title,'Zapisz',80,title=>mutate({type:'rename',title})));
  if(!c.private)action('Uczestnicy',members);
  action('Usuń produkt',()=>{
    panel('Usuń produkt');if(!c.items.length)$('body').append(node('p','Lista jest pusta.','note'));
    for(const item of c.items)action(item.text,()=>run(()=>mutate({type:'remove',id:item.id,fingerprint:item.fingerprint})));
  });
  if(c.private)action('Zestawienie list źródłowych',()=>data.source(false));
  else action('Zamknij listę',()=>{
    panel('Zamknąć listę?');
    $('body').append(node('p','Zakupy i podpisy trafią do archiwum. Zaproszenia wygasną, a uczestnicy zakończą zakupy na tej liście.','note'));
    action('Zamknij i przenieś do archiwum',()=>run(async()=>{
      await data.change(c.id,{type:'archive'});update(await data.list());select(0);notice('Kartka przeniesiona do archiwum.');
    }));
    action('Wróć do kartki',close);
  },{danger:true});
}
async function refresh(){
  if(refreshing||busy||!card()||document.hidden||deck.inert||pull||$('panel').open)return;
  const before=JSON.stringify(lists,(key,value)=>key==='tilt'?undefined:value);
  const id=card().id,version=changeVersion;
  refreshing=true;
  try{
    if(card().shared&&!card().archived)await data.refresh(id);
    const fresh=await data.list();
    if(version===changeVersion&&!busy&&!pull&&!deck.inert&&!$('panel').open&&card().id===id&&JSON.stringify(fresh)!==before){
      const old=card().members||[];
      update(fresh);render();layers();
      const joined=(card().members||[]).find(m=>!old.some(prior=>prior.id===m.id));
      if(joined)notice(joined.nick+' dołącza do zakupów.');
    }
  }catch{if(card()?.shared)notice('Brak połączenia. Spróbuję ponownie.');}
  finally{refreshing=false;}
}
$('choose').onclick=()=>choose();$('more').onclick=more;$('people').onclick=members;
$('share').onclick=share;$('exit').onclick=()=>data.close();$('add').onclick=()=>form('Dodaj produkt','Nazwa produktu','','Dodaj',160,text=>mutate({type:'add',id:crypto.randomUUID(),text}));
$('dismiss').onclick=close;$('panel').addEventListener('click',e=>{if(e.target===$('panel'))close();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('panel').open){e.preventDefault();data.close();}});
async function start(){
  try{
    update(await data.list());
    active=Math.max(0,lists.findIndex(c=>c.id===window.frameElement.dataset.initialId));
    render();arrive();sheet.focus({preventScroll:true});
    setInterval(refresh,4000);if(card().shared)refresh();
  } catch {
    panel('Nie udało się wczytać kartek');
    action('Spróbuj ponownie',()=>{close();start();});
    if(data)action('Otwórz zestawienie zakupów',()=>data.source(false));
  }
}
start();
