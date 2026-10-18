const {chromium}=require(process.env.PLANNER_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const epsilon=.8;
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<=epsilon,`${label}: ${a} ≈ ${b}`);
const apart=(a,b)=>a.right<=b.left+epsilon||b.right<=a.left+epsilon||a.bottom<=b.top+epsilon||b.bottom<=a.top+epsilon;
const within=(a,b,label)=>assert.ok(a.left>=b.left-epsilon&&a.right<=b.right+epsilon&&a.top>=b.top-epsilon&&a.bottom<=b.bottom+epsilon,`${label}: ${JSON.stringify({a,b})}`);
const events=[
 {id:'anchor',title:'Duże wydarzenie',date:'2026-10-12',time:'10:00',endTime:'15:00'},
 {id:'a',title:'Konsultacja A',date:'2026-10-12',time:'12:00',endTime:'12:20',location:'Rynek 1, Dresden',reminder:{minutesBefore:15},notes:'Starsza notatka',createdAt:'2026-10-11T09:05:00.000Z'},
 {id:'b',title:'Spotkanie B',date:'2026-10-12',time:'12:10',endTime:'12:35',reminder:{minutesBefore:5}},
 {id:'c',title:'Rozmowa C',date:'2026-10-12',time:'12:20',endTime:'12:45',location:'Rynek 2',reminder:{minutesBefore:0}},
 {id:'d',title:'Konsultacja D',date:'2026-10-12',time:'14:00',endTime:'14:30'},
 {id:'solo',title:'Osobne wydarzenie',date:'2026-10-12',time:'16:00',endTime:'16:25'}
];

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLANNER_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
 const errors=[],dialogs=[];
 try{
  for(const width of [320,390,430]){
   const height=844,prefix=`${width}px`,page=await browser.newPage({viewport:{width,height},timezoneId:'Europe/Berlin',deviceScaleFactor:1,reducedMotion:'reduce'});
   page.on('pageerror',error=>errors.push(`${prefix}: ${error.message}`));
   page.on('dialog',async dialog=>{dialogs.push(`${prefix}: ${dialog.message()}`);await dialog.dismiss()});
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url()),name=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(url.origin==='https://planner.test'&&fs.existsSync(path.resolve(name))&&fs.statSync(path.resolve(name)).isFile())return route.fulfill({body:fs.readFileSync(path.resolve(name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.woff2')?'font/woff2':name.endsWith('.webp')?'image/webp':'application/javascript'});
    if(route.request().resourceType()==='script')return route.fulfill({body:'',contentType:'application/javascript'});
    return route.fulfill({json:{requiresAccess:false,protocolVersion:2,apiVersion:'2026.10.12.33.36-test'}});
   });
   await page.goto('https://planner.test');await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(fixture=>{
    showPlannerWeather=async()=>{};today=()=>new Date('2026-10-12T00:00:00');selected=new Date('2026-10-12T12:00:00');tasks=fixture;
    ideas=[{id:'gutter-reminder',title:'Przypomnienie',text:'Przypomnienie',alarm:{date:'2026-10-12',time:'12:15',message:'Przypomnienie'}}];
    window.testNoteCopies=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.testNoteCopies.push(text)},configurable:true});
    renderAll();showView('day');
   },events);
   await page.locator('.phone-event[data-event-id="solo"]').waitFor();
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const tiles=await page.evaluate(()=>{
    const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const rangeRects=node=>{const result=[],walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text;while(text=walker.nextNode())if(text.textContent.trim()){const r=document.createRange();r.selectNodeContents(text);for(const b of r.getClientRects())if(b.width>0&&b.height>0)result.push({left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height})}return result};
    const clipped=(a,b)=>({left:Math.max(a.left,b.left),right:Math.min(a.right,b.right),top:Math.max(a.top,b.top),bottom:Math.min(a.bottom,b.bottom),width:Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)),height:Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))});
    return {timeline:rect(document.querySelector('.phone-timeline')),gutter:[...document.querySelectorAll('.phone-reminder-segment')].map(rect),bell:rect(document.querySelector('.phone-bell')),events:[...document.querySelectorAll('.phone-event')].map(card=>{const title=card.nextElementSibling,time=title.querySelector('.phone-event-time'),pin=time.querySelector('.phone-event-location-icon'),bell=time.querySelector('.phone-event-reminder-icon');return {id:card.dataset.eventId,card:rect(card),title:rect(title),heading:clipped(rect(title.querySelector('.phone-event-title-text')),rect(title)),time:rect(time),ranges:rangeRects(time.querySelector('.phone-event-time-range')),rangeText:time.querySelector('.phone-event-time-range').textContent,pin:pin?rect(pin):null,bell:bell?rect(bell):null}})};
   });
   const byId=Object.fromEntries(tiles.events.map(event=>[event.id,event]));
   near(byId.a.card.left,byId.c.card.left,`${prefix}: C reuses A's position exactly when A ends`);
   near(byId.d.card.left,byId.anchor.card.left+16,`${prefix}: D uses the first wide inset position`);
   near(byId.solo.card.left,byId.anchor.card.left,`${prefix}: standalone event starts normally at the left`);
   assert.ok(apart(byId.a.card,byId.b.card)&&apart(byId.c.card,byId.b.card),`${prefix}: reminder bells preserve separate short-card columns`);
   for(const event of tiles.events){
    assert.ok(event.card.right<=tiles.timeline.right-56+epsilon,`${prefix}: ${event.id} preserves the reminder gutter`);
    assert.ok(event.card.right<=tiles.bell.left-12+epsilon,`${prefix}: ${event.id} leaves space beside the day reminder bell`);
    within(event.time,event.card,`${prefix}: ${event.id} time row stays inside the card`);
    assert.equal(event.rangeText,events.find(x=>x.id===event.id).time+'–'+events.find(x=>x.id===event.id).endTime,`${prefix}: ${event.id} retains its full time range`);
    assert.ok(event.ranges.length>0,`${prefix}: ${event.id} has painted hour digits`);
    for(const range of event.ranges){within(range,event.time,`${prefix}: ${event.id} all hour digits remain visible`);assert.ok(apart(range,event.heading),`${prefix}: ${event.id} title and time stay on separate rows`)}
    const icons=[event.pin,event.bell].filter(Boolean);
    for(const icon of icons){assert.ok(icon.width>=8&&icon.height>=8,`${prefix}: ${event.id} icon remains readable`);within(icon,event.time,`${prefix}: ${event.id} icon fits the time row`);for(const range of event.ranges)assert.ok(apart(icon,range),`${prefix}: ${event.id} icon does not cover hour digits`)}
    if(icons.length===2)assert.ok(apart(icons[0],icons[1]),`${prefix}: location and reminder icons do not cover each other`);
    assert.equal(!!event.bell,events.find(x=>x.id===event.id).reminder!=null,`${prefix}: reminder icon appears only for assigned reminders, including zero minutes`);
    assert.equal(!!event.pin,!!events.find(x=>x.id===event.id).location,`${prefix}: pin appears only for existing location`);
    if(event.id!=='anchor')assert.ok(event.card.height>=48-epsilon,`${prefix}: short event retains 48px minimum height`);
    for(const segment of tiles.gutter)assert.ok(apart(event.card,segment),`${prefix}: ${event.id} never covers the reminder connector`);
   }
   for(let i=0;i<tiles.events.length;i++)for(let j=i+1;j<tiles.events.length;j++){
    const a=tiles.events[i],b=tiles.events[j];
    for(const ar of [a.heading,...a.ranges,a.pin,a.bell].filter(Boolean))for(const br of [b.heading,...b.ranges,b.pin,b.bell].filter(Boolean))assert.ok(apart(ar,br),`${prefix}: ${a.id}/${b.id} visible titles, times and icons never intersect`);
   }

   await page.evaluate(()=>openEventActions(tasks.find(task=>task.id==='a')));
   await page.locator('#eventReminderBadge').waitFor({state:'visible'});
   const measure=()=>page.evaluate(()=>{
    const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const ids=['eventHeader','eventHeaderMeta','eventHistory','closeEvent','eventReminderBadge','eventContent','eventMainRegion','eventActionsToggle','eventConversationPanel','eventConversationBody','eventFooter'];
    return {nodes:Object.fromEntries(ids.map(id=>[id,rect(document.getElementById(id))])),contentScroll:document.getElementById('eventContent').scrollTop,conversationScroll:document.getElementById('eventConversationBody').scrollTop,contentOverflow:document.getElementById('eventContent').scrollHeight>document.getElementById('eventContent').clientHeight,conversationOverflow:document.getElementById('eventConversationBody').scrollHeight>document.getElementById('eventConversationBody').clientHeight,pageOverflow:document.documentElement.scrollWidth>innerWidth};
   });
   let initial=await measure();
   assert.equal(initial.pageOverflow,false,`${prefix}: event details have no horizontal overflow`);
   near(initial.nodes.eventHeader.top,0,`${prefix}: event header stays at the viewport top`);
   near(initial.nodes.eventHeader.left,0,`${prefix}: header starts at the left edge`);near(initial.nodes.eventHeader.right,width,`${prefix}: header spans the viewport`);
   near(initial.nodes.eventFooter.bottom,height,`${prefix}: footer stays at the viewport bottom`);near(initial.nodes.eventFooter.left,0,`${prefix}: footer starts at the left edge`);near(initial.nodes.eventFooter.right,width,`${prefix}: footer spans the viewport`);
   assert.equal(await page.locator('#eventHeaderActions button').count(),2,`${prefix}: only more and close remain in the header`);
   assert.ok(initial.nodes.eventReminderBadge.height>=32,`${prefix}: the assigned reminder has a large readable detail badge`);
   assert.match(await page.locator('#eventHeaderMeta').textContent(),/12 października 2026.*12:00.*12:20/);
   assert.match(await page.locator('#eventReminderBadge').textContent(),/15/);
   await page.locator('#eventActionsToggle').click();await page.locator('#eventHistory').click();await page.locator('#historyModal').waitFor({state:'visible'});await page.locator('#closeHistory').click();
   await page.locator('#eventNotesCards .event-note-copy').click();assert.equal(await page.evaluate(()=>testNoteCopies.at(-1)),'Starsza notatka');

   await page.evaluate(()=>{window.testInlineNote=processEventVoiceResult({transcription:'Dopisz notatkę: Nowa transkrypcja',item:{type:'event',changedFields:['notes'],notesAction:'append',notesAddition:'Nowa transkrypcja'}},activeTask.id)});
   await page.locator('#eventChangePreview').waitFor({state:'visible'});
   assert.equal(await page.locator('#eventModal').isVisible(),true,`${prefix}: note confirmation stays in the open event`);
   assert.equal(await page.locator('#eventRecurrencePreview').isVisible(),false,`${prefix}: ordinary notes do not open the old recurrence dialog`);
   await page.locator('#eventChangeConfirm').click();await page.evaluate(()=>testInlineNote);
   const added=page.locator('#eventNotesCards .event-note-item').filter({has:page.locator('.event-note-text',{hasText:'Nowa transkrypcja'})});
   assert.equal(await page.locator('#eventNotesCards .event-note-card').count(),1,`${prefix}: all note additions share one rounded glass card`);
   assert.equal(await added.count(),1,`${prefix}: new transcription is a separated entry inside the shared card`);
   assert.match(await added.locator('.event-note-date').textContent(),/\d{1,2}[:.]\d{2}/,`${prefix}: the card has a readable added time`);
   assert.ok(await page.locator('#eventNotesCards .event-note-card').evaluate(node=>parseFloat(getComputedStyle(node).borderRadius)>=8),`${prefix}: the shared note container uses the rounded-card style`);
   await page.locator('#eventNotesCards .event-note-copy').click();assert.equal(await page.evaluate(()=>testNoteCopies.at(-1)),'Starsza notatka\n\nNowa transkrypcja');
   await page.evaluate(()=>{
    activeTask.noteCards=Array.from({length:24},(_,i)=>({text:`Notatka ${i+1}: szczegóły spotkania oraz ustalenia do realizacji.`,createdAt:'2026-10-12T09:05:00.000Z'}));activeTask.notes=activeTask.noteCards.map(note=>note.text).join('\n');openEventActions(activeTask);
    window.testEventSession=beginVoiceDialogue('event',activeTask.id,voiceDialogueCurrent('event',activeTask.id));testEventSession.history=Array.from({length:30},(_,i)=>({role:i%2?'assistant':'user',content:`Wiadomość ${i+1}: ustalenia wydarzenia, notatek oraz godziny spotkania.`}));showVoiceClarification(testEventSession,'Ile minut przed wydarzeniem mam przypomnieć?');
   });
   await page.locator('#eventConversationPanel').waitFor({state:'visible'});await page.locator('#eventConversationTools .reply-keyboard:not(.hidden)').click();await page.locator('#eventClarification input').fill('30 minut');
   initial=await measure();assert.ok(initial.contentOverflow&&initial.conversationOverflow,`${prefix}: notes and conversation have independent scrollable content`);
   within(initial.nodes.eventActionsToggle,initial.nodes.eventHeader,`${prefix}: secondary actions remain in the header more button`);assert.ok(apart(initial.nodes.eventActionsToggle,initial.nodes.eventConversationPanel)&&apart(initial.nodes.eventActionsToggle,initial.nodes.eventFooter),`${prefix}: header actions cover neither conversation nor footer`);
   await page.locator('#eventContent').evaluate(node=>node.scrollTop=node.scrollHeight);let scrolled=await measure();assert.ok(scrolled.contentScroll>0,`${prefix}: note cards actually scroll`);
   for(const id of ['eventHeader','eventFooter']){near(scrolled.nodes[id].top,initial.nodes[id].top,`${prefix}: ${id} stays fixed while notes scroll`);near(scrolled.nodes[id].bottom,initial.nodes[id].bottom,`${prefix}: ${id} keeps its bounds`)}
   await page.locator('#eventConversationBody').evaluate(node=>{node.scrollTop=0;node.scrollTop=node.scrollHeight});const both=await measure();assert.ok(both.conversationScroll>0,`${prefix}: conversation actually scrolls`);near(both.contentScroll,scrolled.contentScroll,`${prefix}: conversation scroll preserves note scroll`);
   await page.locator('#closeEventConversation').click();assert.equal(await page.locator('#eventConversationPanel').isVisible(),false);await page.locator('#eventActionsToggle').click();await page.locator('#eventConversationToggle').click();assert.equal(await page.locator('#eventClarification input').inputValue(),'30 minut',`${prefix}: collapsing conversation preserves the unsent reply`);
   await page.evaluate(async()=>{clearVoiceDialogue('event');const session=beginVoiceDialogue('event',activeTask.id,voiceDialogueCurrent('event',activeTask.id));await applyVoiceUiAction(session,{type:'remove_event_reminder'})});
   assert.equal(await page.locator('#eventReminderBadge').isVisible(),false,`${prefix}: removing a reminder hides the detail bell`);
   assert.equal(await page.locator('.phone-event[data-event-id="a"] + .phone-event-title .phone-event-reminder-icon').count(),0,`${prefix}: removing a reminder hides its day-card bell`);
   if(process.env.PLANNER_EVENT_SCREENSHOT){fs.mkdirSync(process.env.PLANNER_EVENT_SCREENSHOT,{recursive:true});await page.screenshot({path:path.resolve(process.env.PLANNER_EVENT_SCREENSHOT,`event-reminder-33-${width}.png`)});}
   await page.close();
  }
  assert.deepEqual(errors,[],'No event reminder browser JavaScript errors');assert.deepEqual(dialogs,[],'Event reminder and ordinary note changes use no native confirmation dialogs');
  console.log('Event reminder browser 33.57: Chromium 320/390/430px; full event hours and conditional reminder/location icons without collisions, 33.55 tile positions/gutter, header history and large bell, modern dated copyable note cards, inline confirmation, fixed viewport footer/header and independent note/conversation scrolling passed.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
