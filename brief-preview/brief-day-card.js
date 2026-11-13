// A read-only view of the dated workbook entries. Never derives medical advice
// or modifies the calendar. Source excerpts use textContent, including titles.
window.OktiYagaCard=(()=>{
 const style=document.createElement('style');style.textContent=`
 .yaga-card{color:#293b48;overflow-wrap:anywhere}.yaga-source{margin:0 0 18px;font-size:14px;line-height:1.5;color:#6e766e}
 .yaga-moon{display:flex;align-items:center;gap:18px;padding:22px 20px;border:1px solid #dfe5df;border-radius:22px;background:linear-gradient(145deg,#f7f8f1,#edf3f4)}
 .yaga-moon-symbol{flex:none;font-size:54px;line-height:1.2}.yaga-moon h3{margin:0 0 8px;font-size:23px;line-height:1.3}.yaga-moon p{margin:0;font-size:17px;line-height:1.5;color:#53666b}
 .yaga-countdowns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.yaga-countdown{padding:15px;border:1px solid #e6e5db;border-radius:17px;background:#fcfaf5}.yaga-countdown span{display:block;font-size:13px;line-height:1.5;color:#70766b}.yaga-countdown strong{display:block;margin:3px 0 0;font-size:21px;line-height:1.4;color:#455a5f}
 .yaga-field{margin-top:23px}.yaga-field h3{margin:0 0 8px;font-size:19px;line-height:1.4;color:#3e5962}.yaga-field p{margin:0;font-size:18px;line-height:1.65;white-space:pre-line}.yaga-field[data-yaga-good]{padding:18px;border-left:3px solid #9cae8c;border-radius:0 14px 14px 0;background:#f6f8f2}.yaga-footnote{margin:24px 0 0;font-size:13px;line-height:1.6;color:#747d7b}
 @media(max-width:360px){.yaga-moon{padding:18px 15px;gap:12px}.yaga-moon-symbol{font-size:42px}.yaga-moon h3{font-size:21px}.yaga-countdown{padding:13px}.yaga-countdown strong{font-size:19px}}
 `;document.head.append(style);
 function render(value){
  const box=document.createElement('section');box.className='yaga-card';box.dataset.yagaDate=value.date;
  const d=value.detail||{},source=document.createElement('p');source.className='yaga-source';source.textContent='Źródło: Księga Yagi · Zofia Rende';box.append(source);
  const moon=document.createElement('div');moon.className='yaga-moon';const symbol=document.createElement('span');symbol.className='yaga-moon-symbol';symbol.setAttribute('aria-hidden','true');
  const phase=d.phase||value.phase;symbol.textContent=/^nów/iu.test(phase)?'🌑':/^pełnia/iu.test(phase)?'🌕':/III kwadra/iu.test(phase)?'🌗':/I kwadra/iu.test(phase)?'🌓':/ubywający/iu.test(phase)?'🌘':'🌒';
  const body=document.createElement('div'),title=document.createElement('h3');title.textContent=phase;body.append(title);if(Number.isFinite(d.illumination)){const p=document.createElement('p');p.textContent='Oświetlenie: '+d.illumination+'%';body.append(p)}moon.append(symbol,body);box.append(moon);
  const counts=document.createElement('div');counts.className='yaga-countdowns';
  for(const [label,event] of [['Nów',d.nextNewMoon],['Pełnia',d.nextFullMoon]])if(event){const item=document.createElement('div');item.className='yaga-countdown';const name=document.createElement('span'),count=document.createElement('strong');name.textContent=label+' · '+new Date(event.date+'T12:00:00').toLocaleDateString('pl-PL',{day:'numeric',month:'long'});count.textContent=event.days===0?'Dzisiaj':event.days===1?'Za 1 dzień':'Za '+event.days+' dni';item.append(name,count);counts.append(item)}
  if(counts.childElementCount)box.append(counts);else if(d.nextPhase){const p=document.createElement('p');p.className='yaga-source';p.textContent=d.nextPhase;box.append(p)}
  const field=(label,text,key)=>{if(!text)return;const item=document.createElement('section');item.className='yaga-field';item.dataset[key]='';const h=document.createElement('h3'),p=document.createElement('p');h.textContent=label;p.textContent=text;item.append(h,p);box.append(item)};
  const moonParts=String(d.moonAndBiodynamic||value.moon||'').split(' · ');
  field('Księżyc w znaku',moonParts.filter(s=>!/^dzień /iu.test(s)).join(' · '),'yagaMoon');field('Dzień biodynamiczny',moonParts.find(s=>/^dzień /iu.test(s)),'yagaBiodynamic');
  field('Dobry dzień na…',String(d.goodFor||'').replace(/^dobry dzień na\s*/iu,''),'yagaGood');field('Energia dnia',d.energy,'yagaEnergy');field('Tranzyty i wydarzenia na niebie',d.transits||'Brak osobnego wpisu na ten dzień w Księdze Yagi.','yagaTransits');
  const note=document.createElement('p');note.className='yaga-footnote';note.textContent='Astrologiczne i biodynamiczne interpretacje z Księgi Yagi. Godziny według czasu polskiego.';box.append(note);return box;
 }
 return {render};
})();
