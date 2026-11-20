// Shared by the installed planner and the recipient page. Inlined at build time.
const shoppingInk=(()=>{
  const reduced=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function draw(button,restoring){
    button.classList.add(restoring?'is-unmarking':'is-marking');
    if(reduced()||!button.getClientRects().length)return Promise.resolve();
    return new Promise(resolve=>setTimeout(resolve,restoring?240:350));
  }
  function capture(label,text=label.textContent){
    const style=getComputedStyle(label);
    return {rect:label.getBoundingClientRect(),text,font:style.font,color:style.color,shadow:style.textShadow};
  }
  async function fly(start,target,landing,restoring,scrollBox,duration=470){
    const end=target.getBoundingClientRect(),skip=reduced()||document.hidden||!start.rect.height;
    if(!end.height)return;
    const bounds=scrollBox?.getBoundingClientRect();
    const below=end.bottom>(bounds?Math.min(innerHeight,bounds.bottom):innerHeight-8);
    const above=end.top<(bounds?Math.max(0,bounds.top):0);
    if(above||below)landing.scrollIntoView({block:'nearest',behavior:skip?'instant':'smooth'});
    if(skip)return;
    const ghost=document.createElement('span'),r=start.rect;
    ghost.textContent=start.text;ghost.className='item-flight';ghost.setAttribute('aria-hidden','true');
    Object.assign(ghost.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',font:start.font,color:start.color,textShadow:start.shadow});
    document.body.append(ghost);landing.classList.add('landing');
    try{
      await new Promise(resolve=>{
        const begin=performance.now(),direction=restoring?-1:1;
        function frame(now){
          const t=Math.min(1,(now-begin)/duration),end=target.getBoundingClientRect();
          if(t>=1||!end.height||document.hidden||reduced()){resolve();return}
          const ease=t*t*(3-2*t),arc=Math.sin(Math.PI*t);
          const x=(end.left-r.left)*ease+9*arc*direction,y=(end.top-r.top)*ease-5*arc;
          ghost.style.transform='translate3d('+x+'px,'+y+'px,0) rotate('+(-2.7*arc*direction)+'deg)';
          ghost.style.width=(r.width+(end.width-r.width)*ease)+'px';
          requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
    }finally{landing.classList.remove('landing');ghost.remove()}
  }
  return {draw,capture,fly};
})();

// Put product options beside the purchase control so each gesture has one action.
const shoppingRowOptions=(()=>{
  let activeBin=null,timer=0;
  function close(){
    clearTimeout(timer);
    if(activeBin)activeBin.hidden=true;
    activeBin=null;
  }
  function attach(row,text,remove){
    const options=document.createElement('button'),bin=document.createElement('button');
    row.classList.add('shopping-has-options');
    options.type=bin.type='button';
    options.className='shopping-item-options';bin.className='shopping-item-trash';bin.hidden=true;
    options.setAttribute('aria-label','Opcje produktu: '+text);
    bin.setAttribute('aria-label','Usuń produkt: '+text);
    bin.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 6.5 15.6-.5m-11.4.1.7-2.4 5.6-.2 1 2.5M6.2 7.2l1.1 13 10 .2 1.5-13.6M10 10l.4 7.5m3.9-7.8-.5 7.6"/></svg>';
    options.onclick=()=>{
      close();bin.hidden=false;activeBin=bin;
      timer=setTimeout(close,2500);
    };
    bin.onclick=()=>{close();return remove()};
    row.append(options,bin);
  }
  return {attach,close};
})();
function shoppingAuthorNote(mark,name){
  const note=document.createElement('sup');
  note.className='shopping-author';note.textContent='('+mark+')';
  note.title='Produkt dopisuje '+name;note.setAttribute('aria-label',note.title);
  return note;
}
