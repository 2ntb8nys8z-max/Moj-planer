// Dated source excerpts, with explicit review and provenance. No astronomical inference.
(function(root,factory){const node=typeof module==='object'&&module.exports,api=factory(node?require('./brief-guidance-data.js'):root.OktiYagaGuidanceData);if(node)module.exports=api;else root.OktiYagaGuidance=api;})(globalThis,meta=>{
 const clock='(?:[01]\\d|2[0-3]):[0-5]\\d',space=s=>String(s||'').replace(/\s+/gu,' ').trim(),upper=s=>s?s[0].toLocaleUpperCase('pl-PL')+s.slice(1):'',norm=s=>space(s).toLocaleLowerCase('pl-PL').replace(/[.!?]+$/u,'');
 const health=/lek(?:ów|ami|ar|i\b)|ciąży|ciężarn|chorob|nerek|nerkow|wątrob|leczeni|napar|wywar|dawk|przeciwkrzepliw|toksycz|trując|trując|truj[ąa]|alergen|uczul|padaczk|neuropati|warfaryn|nasercow|nadciśn|ciśnieni|fitoterap/iu;
 const money=/pieni[ąę]dz|finans|inwest|oszczędnoś|płatnoś|zakup|budżet|umow|negocjac|drobny druk/iu;
 const ritual=/zaklę|zamow|zamów|rytua|pod wycieraczk|gałązkę jałow|szczyptę soli|świec|gromnic|zapal|spal|płomie|wosk|nitk|sup[łł]|amulet|wróż|trzy razy|szept|intencj|pełni|nowiu|poduszk/iu;
 const dependent=/(?<![\p{L}\p{N}_])(?:go|ją|je|im|ich|nim|nią|nimi|niej|nich|niego|niemu|jego|jej|resztę|tę|ten|ta|te|tych|to|tego|temu|tym|wtedy|potem|następnie|tam|stamtąd)(?![\p{L}\p{N}_])/iu;
 const historical=/wierzono|dawniej|nie pożyczano|zakazywano|mawia[łl]|przysłowie|mia[łl][ao]? chronić|wróży[łl]/iu;
 const safeAction=/^(?:Sprawdź|Przewietrz|Wywietrz|Zabezpiecz|Wyłącz|Zadzwoń|Zaproś|Odwiedź|Podziękuj|Uporządkuj|Posprzątaj|Wyczyść|Zakończ|Dokończ|Zaplanuj|Zostaw w kalendarzu|Umyj|Otwórz okno|Dowiedz się|Poczytaj|Opowiedz|Napisz komuś|Zapisz trzy rzeczy|Zapisz godzinę|Odłóż pracę|Idź dziś wcześniej spać|Zrób porządek|Podziel się|Zadbaj dziś o ciepło|Jeśli jedziesz|Jeśli zapowiad|Okryj rośliny|Nie wchodź do wody|Nie wychodź w burzę|Nie wrzucaj do rzeki|Nie pal|Świec[aeę]|Ognisko|Myj jagody|Po lesie sprawdź|Gorący wosk|Zwierzęta źle znoszą)/iu;
 const adviceLike=/^(?:Nie |Unikaj |Uważaj |Jeśli |Gdy |Przy |Po |Przed |Zrób |Zapisz |Wybierz |Weź |Zjedz |Wypij |Zaparz |Dodaj |Zbierz |Zawieś |Pomyśl |Zastanów |Wyjdź |Poszukaj |Sprawdź |Przewietrz |Zaplanuj |Zostaw |Otwórz |Umyj |Zadzwoń |Napisz |Zaproś |Podziękuj |Odłóż |Warto |Można )/iu;
 const units=text=>String(text||'').includes('•')?String(text).split(/\n|•/u).map(s=>s.trim()).filter(Boolean):String(text||'').split(/(?<=[.!?])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ])/u).map(s=>s.trim()).filter(Boolean);
 const transitMarkers=/Rada:\s*|Uwaga:\s*|(?<=\.\s)Uważaj\s+/gu;
 const favorLead=/^(?:Dobry dzień na|Dobry moment na|Sprzyja|Można (?:je wykorzystać|wykorzystać układ planet) na)\s+/iu;
 const adviceKey=(text,kind)=>norm(kind==='favor'?space(text).replace(favorLead,''):text);
 function standaloneText(text){return upper(space(text).replace(/^Można je wykorzystać na\s+/iu,'Można wykorzystać układ planet na '))}
 function dependency(text,time={}){
  // Relative clauses and calendar expressions identify their own subject/time.
  // Other pronouns and follow-up steps need the omitted source context.
  let value=space(text).replace(/(?<![\p{L}])(?:to|tego|temu|tym)[,\s]+(?:co|że|kto|jak)(?![\p{L}])/giu,' ')
   .replace(/(?<![\p{L}])po to[,\s]+(?:by|aby|żeby)(?![\p{L}])/giu,' ')
   .replace(/(?<![\p{L}])(?:w tym|z tego|tego|w tych|ten|ta|tę)\s+(?:rok|roku|miesiąc|miesiącu|tydzień|tygodniu|dzień|dniu|dniach|zim[ayę]|wiosn[ayę]|lat[ao]|jesień|jesieni)(?![\p{L}])/giu,' ')
   .replace(/(?<![\p{L}])to\s+(?=(?:czas|okazja|moment|pora|dzień|dobry|dobra|dobre)(?![\p{L}]))/giu,' ');
  // Only explicit antecedents in the selected sentence can resolve a reference.
  // A noun in an omitted practice step or another sentence cannot authorize it.
  for(const [noun,reference] of [['list','go'],['wiadomość','ją'],['święta','je'],['zwierzęta','nimi|nich|im'],['wodę','niej']]){
   value=value.replace(new RegExp('(?<![\\p{L}])('+noun+')(?![\\p{L}])([^.!?]*?)(?<![\\p{L}])(?:'+reference+')(?![\\p{L}])','giu'),'$1$2 ');
  }
  if(['explicit_window','explicit_all_day','until_time_start_unspecified'].includes(time.scope)||/jeśli|jeżeli|gdy/iu.test(value))value=value.replace(/(?<![\p{L}])wtedy(?![\p{L}])/giu,' ');
  return value.match(dependent)?.[0]||null;
 }
 function transitDescription(text){const first=[...String(text||'').matchAll(transitMarkers)][0];return first?text.slice(0,first.index).trim():String(text||'').trim()}
 const actionClause=text=>favorLead.test(space(text))||adviceLike.test(space(text))||safeAction.test(space(text));
 const id=text=>{let h=2166136261;for(const c of text){h^=c.codePointAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(16)};
 function validity(text,context=''){
  const original=String(text||''),v={scope:'dated_entry_no_hours',originalText:null,start:null,end:null,timeZone:'Europe/Warsaw'};
  let m=original.match(new RegExp('od ('+clock+') do ('+clock+'|nocy)','iu'));
  if(m)return {...v,scope:'explicit_window',originalText:m[0],start:{localTime:m[1],precision:'minute'},end:m[2]==='nocy'?{localTime:null,label:'do nocy',precision:'verbal'}:{localTime:m[2],precision:'minute'}};
  m=original.match(new RegExp('(?:^|\\s)do ('+clock+')','iu'));
  if(m)return {...v,scope:'until_time_start_unspecified',originalText:m[0].trim(),end:{localTime:m[1],precision:'minute'}};
  if(/cały dzień|przez cały dzień/iu.test(original))return {...v,scope:'explicit_all_day',originalText:original.match(/(?:przez )?cały dzień/iu)[0]};
  m=original.match(/między (\d{1,2}) a (\d{1,2})/iu);
  if(m&&Number(m[1])<24&&Number(m[2])<24)return {...v,scope:'explicit_window',originalText:m[0],start:{localTime:m[1].padStart(2,'0')+':00',precision:'hour'},end:{localTime:m[2].padStart(2,'0')+':00',precision:'hour'}};
  m=(original+' '+context).match(/(?:przez|na) (?:około )?(?:(?:trzy|kilka|cztery|pięć|dwa[,–-]?\s*trzy|dwa|dwanaście|ten księżycowy) )?(?:tydzień|tygodnie|tygodni|dni|miesiące|miesiąc|miesięcy|rok)(?=\s|[.,:;]|$)|(?:dwa, trzy|dwa–trzy) dni zapasu|przed sezonem grzewczym|przed snem|po zmroku|w południe|wieczorem|jutro rano/iu);
  if(m)return {...v,scope:/przed sezonem|przed snem/iu.test(m[0])?'conditional_activity':'relative_or_verbal_period',originalText:m[0]};
  if(/jeśli|jeżeli|gdy|zanim|przy /iu.test(original))return {...v,scope:'conditional_activity',originalText:original};
  return v;
 }
 function build(date,detail,chapter,sky,{favors=null,care=null,lookup=()=>null}={}){
  const raw=detail.sourceText||{},metadata=meta?.calendar?.[date],row=metadata?.row||detail.sourceRow,bookRow=meta?.chapters?.[date]?.row;
  const sourceFile={name:meta?.fileName||'Czaromarownik_dane_XI2026-XII2027.xlsx',sha256:meta?.sha256||null,author:'Zofia Rende'},items=[],conflicts=[],coverage=[];
  const fields={F:detail.phase||'',Z:detail.energy||'',AA:detail.transits||'',P:raw.story||'',Q:raw.practice||'',S:raw.extra||'',U:raw.caution||''};
  const source=(column,sheet='Kalendarz')=>sheet==='Kalendarz'?({C:metadata?.observance,D:metadata?.sunrise,E:metadata?.sunset,...fields}[column]||''):({D:chapter?.text,E:chapter?.caution,F:chapter?.quote}[column]||'');
  function evidence(column,quote,sheet='Kalendarz',atDate=date,sourceText=null,atRow=null){
   const text=sourceText??source(column,sheet),start=text.indexOf(quote),r=atRow||(sheet==='Kalendarz'?row:bookRow);if(start<0||!r)throw Error('Niepotwierdzony fragment Yagi: '+atDate+' '+column);
   return {fileName:sourceFile.name,fileSha256:sourceFile.sha256,sheet,cell:column+r,column,row:r,date:atDate,quote,span:{start:[...text.slice(0,start)].length,endExclusive:[...text.slice(0,start+quote.length)].length,unit:'unicode_code_point'}};
  }
  function add(column,quote,kind,options={}){
   if(!quote||!row)return null;const sheet=options.sheet||'Kalendarz',ev=evidence(column,quote,sheet),baseText=options.text||standaloneText(quote),time=validity(options.period||quote,options.context||''),text=time.originalText&&(time.scope==='relative_or_verbal_period'||time.scope==='conditional_activity'&&time.originalText!==quote)&&!norm(baseText).includes(norm(time.originalText))?upper(time.originalText)+': '+baseText:baseText;
   const related=[];if(options.context&&source(column,sheet).includes(options.context)&&options.context!==quote)related.push(evidence(column,options.context,sheet));
   const item={id:'yaga-'+date+'-'+id(ev.cell+'|'+ev.span.start+'|'+kind+'|'+text),date,text,kind,subject:options.subject||(sheet==='Kalendarz'&&['P','Q','S','U'].includes(column)?raw.title:'Wskazówka astrologiczna'),interpretationDomain:['Z','AA'].includes(column)?'astrology':'source_practice',attribution:'Księga Yagi · Zofia Rende',validity:time,conditions:/jeśli|jeżeli|gdy|zanim|przy |po |przed /iu.test(quote)?[quote]:[],prohibitions:/\bnie\b|unikaj|uważaj/iu.test(quote)?[quote]:[],transformation:norm(text)!==norm(quote)?'safe_paraphrase':'verbatim',evidence:[ev,...related],origin:options.origin||column,priority:options.priority??(kind==='attention'?70:30),placement:options.expanded?'expanded':kind==='favor'?'main_favor':'main_attention',review:{status:options.status||'approved',method:options.method||'source_rule',reason:options.reason||null},conflictIds:[],relatedGuidanceIds:[],...(options.period?{period:options.period,body:options.body}:{} )};
   const duplicate=items.find(i=>i.kind===kind&&i.review.status===item.review.status&&((i.evidence[0].sheet===sheet&&i.evidence[0].cell===ev.cell&&i.evidence[0].quote===quote&&(JSON.stringify(i.validity)===JSON.stringify(time)||i.validity.scope==='dated_entry_no_hours'||time.scope==='dated_entry_no_hours'))||(adviceKey(i.text,kind)===adviceKey(text,kind)&&JSON.stringify(i.validity)===JSON.stringify(time))));
   if(duplicate){if(duplicate.validity.scope==='dated_entry_no_hours'&&time.scope!=='dated_entry_no_hours'){duplicate.validity=time;if(time.originalText&&(time.scope==='relative_or_verbal_period'||time.scope==='conditional_activity'&&time.originalText!==quote)&&!norm(duplicate.text).includes(norm(time.originalText)))duplicate.text=upper(time.originalText)+': '+duplicate.text}for(const e of item.evidence)if(!duplicate.evidence.some(x=>x.cell===e.cell&&x.sheet===e.sheet&&x.quote===e.quote))duplicate.evidence.push(e);return duplicate}
   items.push(item);return item;
  }
  function classify(text,column,context=''){
   if(health.test(text))return {status:'needs_domain_review',reason:'Zioła, zdrowie lub przeciwwskazania wymagają przeglądu dziedzinowego.'};
   if(['U','E'].includes(column)&&/niepaln|nigdy bez nadzoru|z dala od (?:firan|dzieci)|czujnik|kaloryfer|wosk.*parzy/iu.test(text))return {status:'approved'};
   if(money.test(text)&&!(column==='AA'&&/nie podpisuj/iu.test(text)))return {status:'needs_domain_review',reason:'Treść dotycząca pieniędzy lub umów wymaga przeglądu redakcyjnego.'};
   if(dependency(standaloneText(text))||/patrz uwaga/iu.test(text))return {status:'needs_author_review',reason:'Fragment wymaga rozwiązania odniesienia do osoby, przedmiotu, wcześniejszego kroku lub innego wpisu.'};
   if(historical.test(text)||ritual.test(text)||/bez latarki|prosto z krz|patrz.*(?:w |na )słońce/iu.test(text))return {status:'needs_author_review',reason:'Kontekst kulturowy, rytuał lub niejednoznaczna praktyka. Pozostaje w pełnym materiale.'};
   if(column==='AA'||safeAction.test(text))return {status:'approved'};
   return {status:'needs_author_review',reason:'Kandydat wymaga oceny sensu i samodzielności wskazówki.'};
  }
  const positive=fields.Z.match(/Dobry dzień na ([^.]+)\./u),negative=fields.Z.match(/Unikaj ([^.]+)\./u);
  if(positive)add('Z',positive[0],'favor',{text:favors||positive[0],origin:'energy_favor',priority:50});
  if(negative)add('Z',negative[0],'attention',{text:care||negative[0],origin:'energy_care',priority:45});
  const voidPattern=new RegExp('Księżyc bez kursu ((?:od '+clock+' do (?:'+clock+'|nocy)|do '+clock+')):\\s*([^.!?]+[.!?]?)|Cały dzień Księżyc jest bez kursu:\\s*([^.!?]+[.!?]?)','gu');
  for(const m of fields.Z.matchAll(voidPattern)){const period=m[3]?'Cały dzień':upper(m[1]),body=upper(m[3]||m[2]);add('Z',m[0],'attention',{text:period+': '+body,period,body,origin:'void',priority:100})}
  for(const m of fields.Z.matchAll(/Merkury jest retro:\s*([^.!?]+[.!?]?)/gu))add('Z',m[0],'attention',{text:upper(m[1]),origin:'retro',priority:65});
  // Curated audit excerpts supplement the general rules; they do not define dates' layouts.
  for(const selected of meta?.excerpts||[]){
   if(selected.date!==date)continue;const sheet=selected.sheet,column=selected.column;if(!source(column,sheet).includes(selected.quote))continue;
   const held=selected.transformation==='H',rule=classify(selected.quote,column),status=held?(rule.status==='needs_domain_review'?'needs_domain_review':'needs_author_review'):'approved';
   const existing=items.find(i=>i.evidence.some(e=>e.sheet===sheet&&e.cell===selected.cell&&e.quote===selected.quote));if(existing&&!held)continue;
   add(column,selected.quote,selected.placement==='Sprzyja'?'favor':'attention',{sheet,text:held?upper(space(selected.quote)):selected.text,status,reason:held?selected.note||rule.reason:null,expanded:selected.placement==='Rozwinięcie'||selected.placement.includes('rozwinięciu'),context:dependent.test(selected.quote)?source(column,sheet):'',origin:'audit_excerpt',method:held?'audit_hold':'audit_source_selection',priority:column==='U'?90:55});
  }
  for(const line of fields.AA.split('\n').filter(Boolean)){
   const event=line.match(/^(.*?) \((\d\d:\d\d)\):\s*([\s\S]*)$/u);if(!event)continue;const body=event[3],markers=[...body.matchAll(transitMarkers)];
   for(let i=0;i<markers.length;i++){
    const m=markers[i],isAttention=/Uwaga|Uważaj/u.test(m[0]),start=m.index+(/Uważaj/u.test(m[0])?0:m[0].length),end=markers[i+1]?.index??body.length,quote=body.slice(start,end).trim();
    if(!quote)continue;const kind=isAttention||/^nie\b/iu.test(quote)?'attention':'favor';add('AA',quote,kind,{...classify(quote,'AA'),context:line,origin:'transit_advice',priority:kind==='attention'?75:40});
   }
   const description=body.slice(0,markers[0]?.index??body.length);
   for(const sentence of units(description))if(/^(?:Dobry dzień na|Sprzyja |Można je wykorzystać na|Dobry moment na)/u.test(sentence))add('AA',sentence,'favor',{...classify(sentence,'AA'),context:line,origin:'transit_favor',priority:35});
  }
  for(const [sheet,column,text] of [...['P','Q','S','U'].map(c=>['Kalendarz',c,fields[c]]),...['D','E','F'].map(c=>['Księga Jagi',c,source(c,'Księga Jagi')])]){
   if(!text){coverage.push({sheet,column,disposition:'empty',units:0});continue}
   let found=0;
   for(const quote of (column==='Q'&&/jeśli|jeżeli|gdy|zanim/iu.test(text)?[text]:units(text))){
    const clean=quote.replace(/^[-•]\s*/u,'');if(!adviceLike.test(clean)&&!safeAction.test(clean)&&column!=='U'&&column!=='E')continue;found++;
    if(items.some(i=>i.evidence.some(e=>e.sheet===sheet&&e.cell===column+(sheet==='Kalendarz'?row:bookRow)&&e.quote.includes(clean))))continue;
    const check=classify(clean,column),kind=column==='U'||column==='E'||/^(?:Nie |Unikaj |Uważaj |Sprawdź|Jeśli jedziesz|Okryj|Myj |Po lesie|Zabezpiecz|Świec|Ognisko)/iu.test(clean)?'attention':'favor';
    if(sheet==='Księga Jagi'&&['D','F'].includes(column)&&check.status==='approved'&&!safeAction.test(clean))Object.assign(check,{status:'needs_author_review',reason:'Praktyka lub pytanie z rozdziału wymaga kontekstu.'});
    add(column,clean,kind,{sheet,...check,origin:sheet==='Księga Jagi'?'chapter':column,priority:column==='U'||column==='E'?90:25});
   }
   coverage.push({sheet,column,disposition:found?'classified':'expanded_source',units:found});
  }
  for(const selected of meta?.storyReviewCandidates||[]){
   if(selected.date!==date)continue;const column=selected.cell.match(/^[A-Z]+/u)[0];if(!fields[column]?.includes(selected.text))continue;
   if(items.some(i=>i.evidence.some(e=>e.cell===selected.cell&&e.quote.includes(selected.text))))continue;
   add(column,selected.text,/\bnie\b|unikaj/iu.test(selected.text)?'attention':'favor',{status:'needs_author_review',reason:'Kandydat P/S wskazany w audycie; nie jest zatwierdzoną poradą.',origin:'audit_story_queue'});
  }
  for(const item of items){
   const fragment=dependency(item.text,item.validity);if(!fragment)continue;
   item.contextIssue={fragment,reason:'Samodzielna wskazówka nie wskazuje jednoznacznie odbiorcy, przedmiotu lub wcześniejszego kroku.'};
   const primary=item.evidence[0],context=source(primary.column,primary.sheet);
   if(context!==primary.quote&&!item.evidence.some(e=>e.sheet===primary.sheet&&e.cell===primary.cell&&e.quote===context))item.evidence.push(evidence(primary.column,context,primary.sheet));
   if(item.review.status==='approved'){item.review.status='needs_author_review';item.review.reason=item.contextIssue.reason}
  }
  for(const item of items.filter(i=>i.review.status==='approved'&&i.review.method==='source_rule'&&i.evidence[0].column==='Q'&&i.evidence[0].quote.includes('•'))){
   const excerpt=items.find(i=>i!==item&&i.review.status==='approved'&&i.review.method==='audit_source_selection'&&i.evidence[0].sheet===item.evidence[0].sheet&&i.evidence[0].cell===item.evidence[0].cell&&item.evidence[0].quote.includes(i.evidence[0].quote));
   if(excerpt){item.placement='expanded';item.relatedGuidanceIds.push(excerpt.id);item.displayOmission={reason:'audited_practice_excerpt',guidanceId:excerpt.id}}
  }
  function conflict(kind,excerpts,reason){const key='conflict-'+date+'-'+id(kind+reason);const ev=excerpts.flatMap(x=>x.evidence||[]);conflicts.push({id:key,date,kind,reason,status:'needs_author_review',guidanceIds:excerpts.map(x=>x.id),evidence:ev});for(const item of excerpts)item.conflictIds.push(key);return key}
  const voidItems=items.filter(i=>i.origin==='void'),contractWarning=voidItems.find(i=>i.validity.scope==='explicit_all_day');
  for(const item of items.filter(i=>i.kind==='favor'&&['Z','AA'].includes(i.evidence[0].column))){
   if((contractWarning&&/umow|podpis/iu.test(item.evidence[0].quote))||(voidItems.length&&/nowe początki|zacznij|zaczynaj|rozpocznij/iu.test(item.evidence[0].quote))){
    conflict('competing_astrology',[contractWarning||voidItems[0],item],'Zachęta wymaga uzgodnienia z ograniczeniem zapisanym dla tej samej daty.');item.review.status='needs_author_review';item.review.reason='Nie publikujemy samodzielnej zachęty sprzecznej z powiązanym ograniczeniem.';
   }
  }
  if(/prosto z krz/iu.test(fields.Q)&&/myj|umyj/iu.test(fields.U)){
   const a=items.find(i=>i.evidence.some(e=>e.column==='Q'&&/prosto z krz/iu.test(e.quote)))||add('Q',fields.Q,'favor',{status:'needs_author_review'}),b=items.find(i=>i.evidence.some(e=>e.column==='U'))||add('U',fields.U,'attention');
   conflict('food_preparation',[a,b],'Praktyka zachęca do jedzenia owoców z krzaka, a uwaga nakazuje ich mycie.');a.review.status='needs_author_review';
  }
  const ref=fields.U.match(/Patrz uwaga przy (.+?) \((\d{1,2}) ([IVX]+)\)/u);
  if(ref){const months={I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10,XI:11,XII:12},target=date.slice(0,4)+'-'+String(months[ref[3]]||0).padStart(2,'0')+'-'+ref[2].padStart(2,'0'),d=lookup(target),caution=d?.sourceText?.caution;
   const item=items.find(i=>i.evidence.some(e=>e.column==='U'))||add('U',fields.U,'attention',{status:'needs_author_review'});
   if(caution&&d.sourceText.title.toLocaleLowerCase('pl-PL').includes(ref[1].slice(0,5).toLocaleLowerCase('pl-PL'))){item.evidence.push(evidence('U',caution,'Kalendarz',target,caution,meta.calendar[target].row));item.reference={date:target,cell:'U'+meta.calendar[target].row,text:caution};item.review.status='needs_domain_review';item.review.reason='Jawne odesłanie rozwiązane; uwaga zielarska pozostaje do przeglądu.';}else item.review.reason='Nierozwiązane odesłanie w źródle.';
  }
  const explained=new Set(),events=(sky?.events||[]).map(event=>{
   const rawBody=transitDescription(event.interpretation),sentences=units(rawBody),observations=sentences.filter(s=>!actionClause(s)),safe=observations.filter(s=>!health.test(s)&&!money.test(s)&&!(contractWarning&&/umow|podpis/iu.test(s))&&!dependency(s));
   const explanation=safe.filter(s=>{const key=norm(s);if(explained.has(key))return false;explained.add(key);return true}).join(' ');
   const evidenceList=[evidence('AA',event.original)];let issue=null;
   if(event.time!==event.originalTime){evidenceList.push(evidence('F',detail.phase));issue='Godzina fazy w F różni się od godziny wydarzenia w AA. Obie wartości zachowano.'}
   if(safe.length!==observations.length)issue=issue||'Część objaśnienia wymaga przeglądu; główny widok pomija samodzielną zachętę lub treść wrażliwą.';
   return {...event,explanation,evidence:evidenceList,review:{status:issue?'needs_author_review':'approved',reason:issue},showEventTimeInMain:false};
  });
  const sourceIssues=[];
  for(const event of events)if(event.time!==event.originalTime)sourceIssues.push({date,kind:'phase_time_difference',status:'needs_author_review',reason:event.review.reason,evidence:event.evidence});
  const seasonalTime=metadata?.observance?.match(/\b(\d\d:\d\d)\b/u)?.[1],solar=events.find(e=>/^Słońce wchodzi/u.test(e.title));
  if(seasonalTime&&solar&&/równonoc|przesilenie/iu.test(metadata.observance)&&seasonalTime!==solar.originalTime)sourceIssues.push({date,kind:'season_time_difference',status:'needs_author_review',reason:'Godzina równonocy lub przesilenia w C różni się od AA.',evidence:[evidence('C',metadata.observance),...solar.evidence]});
  const bookSunset=chapter?.text?.match(/po zachodzie słońca \(dziś (\d\d:\d\d)\)/u);
  if(bookSunset&&metadata?.sunset&&bookSunset[1]!==metadata.sunset)sourceIssues.push({date,kind:'sunset_time_difference',status:'needs_author_review',reason:'Godzina zachodu w rozdziale różni się od kalendarza (godziny kalendarza opisano dla Wrocławia).',evidence:[evidence('D',bookSunset[0],'Księga Jagi'),evidence('E',metadata.sunset)]});
  const eclipse=events.find(e=>/zaćmienie Słońca/iu.test(e.title));
  if(eclipse&&seasonalTime&&seasonalTime!==eclipse.originalTime)sourceIssues.push({date,kind:'eclipse_time_scope',status:'needs_author_review',reason:'Godzina lokalnego maksimum w C/Q i godzina zdarzenia w F/AA mogą opisywać różne momenty. Zachowano oba źródła bez korekty.',evidence:[evidence('C',metadata.observance),evidence('Q',fields.Q),evidence('F',detail.phase),...eclipse.evidence]});
  for(const item of items)if(item.review.status!=='approved')item.placement='review';
  items.sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
  return {schemaVersion:2,date,sourceFile,timeZone:'Europe/Warsaw',metadata,events,guidance:items,conflicts,coverage,sourceIssues,review:items.filter(i=>i.review.status!=='approved'),referenceWarnings:items.filter(i=>i.reference).map(i=>i.reference)};
 }
 return {build,validity,dependency,adviceKey,sourceMetadata:meta};
});
