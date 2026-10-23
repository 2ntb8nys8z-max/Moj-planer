// Pure dialogue state helpers, embedded into the deployable Worker by build.mjs.
const DIALOGUE_FIELDS=['title','date','startTime','endTime','notes','location','reminder','recurrence'];
function dialogueFollowupFieldExplicit(field,text,state){
  if(state?.pendingField===field)return true;
  const t=String(text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l');
  if(field==='title')return /\b(nazw|tytul|zmienic nazwe|zmien nazwe|zatytuluj)\b/.test(t);
  if(field==='date')return /\b(dzis|dzisiaj|jutro|pojutrze|poniedzial|wtorek|srode|czwartek|piatek|sobote|niedziele|stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|wrzesnia|pazdziernika|listopada|grudnia|dzien|date)\b/.test(t)||/\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/.test(t);
  if(field==='startTime')return /\b(od|poczatek|rozpoczn|start|godzine rozpoczecia)\b/.test(t)||state?.pendingField==='startTime';
  if(field==='endTime')return /\b(do|koniec|zakonczen|potrwac|trwac|dlugosc|czas trwania|minut|kwadrans|pol godziny)\b/.test(t)||state?.pendingField==='endTime';
  if(field==='notes')return /\b(notatk|dopisz|tekst|tresc)\b/.test(t);
  if(field==='location')return /\b(lokalizac|adres|miejsce)\b/.test(t);
  if(field==='allDay')return /\b(caly dzien|calodniow|bez godzin)\b/.test(t);
  return false;
}
function dialogueProtectCreateDraft(state,text,operations){
  if(state?.mode!=='create'&&!state?.pendingField)return operations;
  const previous=state?.draft||{};
  return operations.filter(op=>{
    if(!op||!DIALOGUE_FIELDS.includes(op.field))return true;
    const existing=previous[op.field];
    if(existing==null||existing===''||existing===false)return true;
    return dialogueFollowupFieldExplicit(op.field,text,state);
  });
}
function dialogueReduce(original,state,operations){
  const draft={...(original||{}),...(state?.draft||{}),type:'event'};
  for(const op of operations||[]){
    if(!op||!DIALOGUE_FIELDS.includes(op.field)||!['set','clear','revert'].includes(op.op))throw new PlannerApiError('Nieprawidłowa operacja AI.',502,'invalid_operation','interpretation');
    if(op.field==='notes'){draft.notesAction='replace';delete draft.notesAddition;}
    draft[op.field]=op.op==='revert'?(original?.[op.field]??(['reminder','recurrence'].includes(op.field)?null:'')):op.op==='clear'?(['reminder','recurrence'].includes(op.field)?null:''):op.value;
  }
  if((operations||[]).some(x=>x.field==='startTime')&&!(operations||[]).some(x=>x.field==='endTime')){
    const previous=state?.draft||original;
    if(!draft.startTime)draft.endTime='';
    else if(previous?.startTime&&previous?.endTime)draft.endTime=plannerClock(plannerMinutes(draft.startTime)+(plannerMinutes(previous.endTime)-plannerMinutes(previous.startTime)+1440)%1440);
  }
  draft.changedFields=original?.type==='event'?DIALOGUE_FIELDS.filter(k=>JSON.stringify(draft[k]??null)!==JSON.stringify(original[k]??null)):[];
  return draft;
}
function dialogueNeed(draft,original,state){
  if(draft.type!=='event')return null;
  if(original?.type!=='event'&&!state.defaultTitle&&(!draft.title||/^(?:nowe )?(wydarzenie|spotkanie)$/i.test(draft.title.trim())))return {kind:'title',question:TITLE_QUESTION};
  if(!draft.date)return {kind:'date',question:'W jakim dniu ma odbyć się wydarzenie?'};
  if(!draft.startTime&&!state.allDay)return {kind:'start',question:DIALOGUE_TEXT.start};
  if(draft.startTime&&!draft.endTime)return {kind:'duration',question:EVENT_END_QUESTION};
  return null;
}
function dialogueClockMentions(text,pending){
  let t=String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l');
  if(/notatk|nazwij|tytul|nazwa|lokalizac|adres/.test(t))return [];
  if(!/godzin|spotkani|wydarzeni|(?:^|\s)(?:od|do|o|na)\s/.test(t)&&!['start','duration','hour'].includes(pending?.kind))return [];
  t=t.split(/(?:\bnie[, .]+|\bpoprawka[, .]+|\btylko\s+)/).at(-1);
  const stems=['pierwsz','drug','trzec','czwart','piat','szost','siodm','osm','dziewiat','dziesiat','jedenast','dwunast','trzynast','czternast','pietnast','szesnast','siedemnast','osiemnast','dziewietnast','dwudziest'];
  const token='(?:dwudziest\\w*\\s+(?:pierwsz|drug|trzec)\\w*|'+stems.map(x=>x+'\\w*').join('|')+'|(?:[01]?\\d|2[0-3])(?::[0-5]\\d)?)';
  const regex=new RegExp('(?:^|\\s)(?:(od|do|o|na)\\s+)?(?:godzin\\w*\\s+)?('+token+')(?![\\w:])','g');
  const out=[];
  for(const m of t.matchAll(regex)){
    if(!m[1]&&!m[2].includes(':')&&!['start','duration','hour'].includes(pending?.kind))continue;
    const raw=m[2];let hour,minute=0,explicit=raw.includes(':');
    if(/^\d/.test(raw)){const parts=raw.split(':');hour=Number(parts[0]);minute=Number(parts[1]||0)}
    else {hour=stems.findIndex(x=>raw.startsWith(x))+1;if(hour===20&&raw.includes(' '))hour+=stems.findIndex(x=>raw.split(' ')[1].startsWith(x))+1;}
    if(hour<0||hour>23)continue;
    const tail=t.slice(m.index+m[0].length).match(/^\s+((?:dwadzie[a-z]*|trzydziesci|czterdziesci|piecdziesiat|[a-z]+)(?:\s+[a-z]+)?)/);
    if(tail){const n=plannerDuration(tail[1].replace(/dwadziescia/g,'dwadzieścia').replace(/trzydziesci/g,'trzydzieści').replace(/czterdziesci/g,'czterdzieści').replace(/piecdziesiat/g,'pięćdziesiąt').replace(/piec/g,'pięć').replace(/szesc/g,'sześć').replace(/siedem/g,'siedem').replace(/dziewiec/g,'dziewięć')+' minut');if(n&&n<60)minute=n;}
    if(/po poludniu|wieczor/.test(t)){hour=hour%12+12;explicit=true}
    if(/rano|w nocy|nad ranem/.test(t)){hour=hour%12;explicit=true}
    const field=m[1]==='do'?'endTime':m[1]||pending?.kind==='start'?'startTime':pending?.kind==='duration'?'endTime':pending?.field||'startTime';
    const time=plannerClock(hour*60+minute);
    out.push({field,time,ambiguous:!explicit&&hour>=1&&hour<=12,choices:[plannerClock(hour%12*60+minute),plannerClock((hour%12+12)*60+minute)]});
  }
  return out;
}
function dialogueResolveHour(text,pending){
  const t=String(text).toLowerCase();
  if(/po południu|po poludniu|wieczor/.test(t))return pending.choices[1];
  if(/rano|w nocy|nad ranem/.test(t))return pending.choices[0];
  const mentions=dialogueClockMentions(text,{kind:'hour',field:pending.field});
  const exact=mentions.filter(m=>!m.ambiguous).map(m=>m.time);
  if(exact.length&&exact.every(x=>x===exact[0])&&pending.choices.includes(exact[0]))return exact[0];
  return null;
}
function dialogueHourQuestion(mention){return {kind:'hour',field:mention.field,choices:mention.choices,question:`Czy chodzi o ${mention.choices[0]} w nocy/rano, czy ${mention.choices[1]} po południu/wieczorem?`}}
