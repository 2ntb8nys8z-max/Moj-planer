// One dated, read-only card. Every displayed excerpt belongs to the same source row.
window.OktiYagaCard=(()=>{
 let cardId=0;
 const style=document.createElement('style');style.textContent=`
 .yaga-card{box-sizing:border-box;padding:20px 18px 0;border:1px solid #adc3d5;border-radius:16px;background:#f5f9fd;box-shadow:0 4px 12px #1e4c7010;color:#182e3c;overflow-wrap:anywhere}.yaga-card *{box-sizing:border-box;color:inherit}.yaga-card>.yaga-title{margin:0!important;font-size:20px!important;line-height:1.4!important;font-weight:750;color:#07539b}
 .yaga-transits{margin-top:19px}.yaga-sky-list{list-style:none;margin:0;padding:0}.yaga-sky-event+.yaga-sky-event{margin-top:20px;padding-top:17px;border-top:1px solid #bdcfde}.yaga-sky-event h4{margin:0 0 7px;font-size:17px;line-height:1.4;font-weight:750}.yaga-sky-event p,.yaga-transits>p{margin:7px 0 0!important;font-size:16px!important;line-height:1.55!important}
 .yaga-guides{margin-top:20px}.yaga-guide+.yaga-guide{margin-top:20px}.yaga-guide h4{position:relative;padding-left:18px;margin:0 0 7px;font-size:18px;line-height:1.4;font-weight:750;color:#146449}.yaga-guide h4:before{content:'';position:absolute;left:0;top:9px;width:8px;height:8px;border-radius:50%;background:#146449}.yaga-guide[data-yaga-care] h4{color:#875100}.yaga-guide[data-yaga-care] h4:before{background:#875100}.yaga-guide p{padding-left:18px;margin:0!important;font-size:17px!important;line-height:1.55!important}
 .yaga-guide p+p{margin-top:12px!important}.yaga-practical strong{display:block;color:#78500b;font-weight:750}
 .yaga-original[hidden]{display:none}.yaga-field{margin-top:22px}.yaga-field h4{margin:0 0 8px;font-size:16px;line-height:1.4;font-weight:750}.yaga-field p{margin:0!important;font-size:16px!important;line-height:1.55!important;white-space:pre-line}.yaga-inspiration p{padding-left:13px;border-left:3px solid #075caa;font-size:18px!important}.yaga-author-caution{padding:13px;border-radius:10px;background:#fff8e8}.yaga-source{margin:22px 0 0!important;padding-top:15px;border-top:1px solid #cedbe5;font-size:13px!important;line-height:1.5!important;color:#3b4f5e}.yaga-source a{color:inherit;text-decoration:underline}
 #entryResultsModal.is-day-brief button.yaga-toggle{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:60px;margin:20px 0 0;padding:17px 0;border:0;border-top:1px solid #bdcfde;border-radius:0;background:transparent;box-shadow:none;color:#064f93;font-family:inherit;font-size:15px;font-weight:750;line-height:1.4;text-align:left;touch-action:manipulation}.yaga-toggle:before{display:none!important}.yaga-toggle:after{content:'⌄';font-size:23px;line-height:1;transition:transform .2s}.yaga-toggle[aria-expanded=true]:after{transform:rotate(180deg)}.yaga-toggle:active{background:#e7f0f9!important}.yaga-toggle:focus-visible{outline:3px solid #567889;outline-offset:3px}
 @media(prefers-reduced-motion:reduce){.yaga-toggle:after{transition:none}}
 `;document.head.append(style);
 function field(parent,label,text,key,options={}){
  if(text==null||!String(text).trim())return null;
  const item=document.createElement('section');item.className=options.className||'yaga-field';if(key)item.dataset[key]='';if(options.column)item.dataset.sourceColumn=options.column;
  const h=document.createElement('h4'),p=document.createElement('p');h.textContent=label;p.textContent=text;item.append(h,p);parent.append(item);return item;
 }
 function render(value,{inspirationText=null,expanded=false,onToggle=null}={}){
  const box=document.createElement('section');box.className='yaga-card';box.dataset.yagaDate=value.date;
  const d=value.detail||{},raw=d.sourceText||{},guide=value.editorial||{};if(d.sourceRow)box.dataset.sourceRow=d.sourceRow;
  const heading=document.createElement('h3');heading.className='yaga-title';heading.textContent='Z Księgi Yagi';box.append(heading);
  if(value.sky?.events?.length||value.sky?.other?.length){
   const sky=document.createElement('section');sky.className='yaga-transits';sky.dataset.yagaTransits='';
   const events=document.createElement('ol');events.className='yaga-sky-list';
   for(const event of value.sky.events||[]){const li=document.createElement('li');li.className='yaga-sky-event';const title=document.createElement('h4'),p=document.createElement('p');title.textContent=event.title;p.textContent=event.explanation??event.interpretation;li.append(title);if(p.textContent)li.append(p);events.append(li)}
   if(events.childElementCount)sky.append(events);for(const text of value.sky.other||[]){const p=document.createElement('p');p.textContent=text;sky.append(p)}box.append(sky);
  }
  const guides=document.createElement('div');guides.className='yaga-guides';
  if(Array.isArray(value.guidance)){
   for(const [kind,label,key] of [['favor','Sprzyja','yagaGood'],['attention','Zwróć uwagę','yagaCare']]){
    const items=value.guidance.filter(i=>i.kind===kind&&i.review.status==='approved'&&i.placement.startsWith('main'));if(!items.length)continue;
    const section=document.createElement('section');section.className='yaga-guide';section.dataset[key]='';const h=document.createElement('h4');h.textContent=label;section.append(h);
    for(const item of items){const p=document.createElement('p');p.dataset.yagaGuidance=item.id;if(['void','retro'].includes(item.origin)){p.className='yaga-practical';p.dataset.yagaPractical=''}if(item.period){const period=document.createElement('strong');period.textContent=item.period;p.classList.add('yaga-practical');p.append(period)}p.append(document.createTextNode(item.body||item.text));section.append(p)}guides.append(section);
   }
  }else{
   field(guides,'Sprzyja',guide.favors,'yagaGood',{className:'yaga-guide',column:'Z'});
   if(guide.care||guide.attention?.length){const care=document.createElement('section');care.className='yaga-guide';care.dataset.yagaCare='';const h=document.createElement('h4');h.textContent='Zwróć uwagę';care.append(h);
    for(const advice of guide.attention||[]){const p=document.createElement('p');p.dataset.yagaPractical='';if(advice.period){const strong=document.createElement('strong');strong.textContent=advice.period;p.append(strong)}p.append(document.createTextNode(advice.text));care.append(p)}if(guide.care){const p=document.createElement('p');p.textContent=guide.care;care.append(p)}guides.append(care);
   }
  }if(guides.childElementCount)box.append(guides);
  const original=document.createElement('div');original.id='yaga-details-'+(++cardId);original.className='yaga-original';original.dataset.yagaOriginal='';original.hidden=!expanded;
  if(value.guidanceReview?.length||value.guidanceConflicts?.length)field(original,'Pełny materiał źródłowy','Poniżej zachowano oryginalne teksty autorki, także symbolikę, rytuały i fragmenty wymagające uzgodnienia. Sprzeczne oraz niejednoznaczne zalecenia nie są samodzielnymi wskazówkami w głównym widoku. Treści zielarskie nie są indywidualną poradą medyczną.','yagaReviewNote');
  for(const issue of value.sourceIssues||[])field(original,'Rozbieżność w materiale źródłowym',issue.reason,'yagaSourceIssue');
  for(const conflict of value.guidanceConflicts||[])field(original,'Do uzgodnienia z autorką',conflict.reason,'yagaConflict');
  for(const ref of value.referenceWarnings||[])field(original,'Powiązana uwaga autorki · '+ref.date,ref.text,'yagaReferenceWarning');
  if(value.sky?.week)field(original,'Tydzień pod niebem',value.sky.week,'yagaWeek');
  field(original,'Inspiracja dnia',Array.isArray(value.guidance)?guide.inspiration:(inspirationText||guide.inspiration),'yagaInspiration',{className:'yaga-field yaga-inspiration',column:'T'});
  if(value.biodynamic)field(original,'Dzień biodynamiczny','Dzień '+value.biodynamic.kind+'. '+value.biodynamic.description,'yagaBiodynamic');
  field(original,'Podtytuł',raw.subtitle,'yagaSubtitle',{column:'O'});
  for(const [label,text,column,key] of [[raw.title||'Tekst Yagi',raw.story,'P','yagaStory'],['Praktyka dnia',raw.practice,'Q','yagaPractice'],[raw.extraTitle||'Z Księgi Yagi',raw.extra,'S',null],['Uwagi autorki',raw.caution,'U',null],['Księżyc',[d.phase,d.nextPhase].filter(Boolean).join(' · '),'F',null],['Księżyc w znaku i dzień biodynamiczny',d.moonAndBiodynamic,'X',null],['Dobry dzień na…',d.goodFor,'Y',null],['Energia dnia',d.energy,'Z','yagaEnergy'],['Tranzyty i wydarzenia na niebie',d.transits,'AA',null],['Materiały źródłowe',raw.bibliography,'V',null]]){const item=field(original,label,text,key,{column});if(column==='U'&&item)item.classList.add('yaga-author-caution')}
  field(original,'Oświetlenie Księżyca',d.illumination,null,{column:'H'});
  if(value.chapter){const c=value.chapter;field(original,c.title,c.text,'yagaChapter');field(original,'Podtytuł hasła',c.subtitle,null);field(original,'Cytat',c.quote,'yagaChapterQuote');field(original,'Uwagi do hasła',c.caution,null);field(original,'Źródła hasła',c.bibliography,null)}
  const source=document.createElement('p');source.className='yaga-source';source.textContent='Księga Yagi · Zofia Rende · '+new Date(value.date+'T12:00:00').toLocaleDateString('pl-PL',{day:'numeric',month:'long',year:'numeric'})+'. Godziny dla Polski.';original.append(source);box.append(original);
  const toggle=document.createElement('button');toggle.type='button';toggle.className='yaga-toggle';toggle.dataset.yagaToggle='';toggle.setAttribute('aria-controls',original.id);
  const sync=()=>{toggle.setAttribute('aria-expanded',String(!original.hidden));toggle.textContent=original.hidden?'Rozwiń Księgę Yagi':'Zwiń Księgę Yagi'};sync();toggle.onclick=()=>{original.hidden=!original.hidden;sync();onToggle?.(!original.hidden)};box.append(toggle);
  return box;
 }
 return {render};
})();
