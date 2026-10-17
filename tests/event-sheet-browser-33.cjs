const {chromium}=require(process.env.PLANNER_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const epsilon=1;
const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<=epsilon,`${message}: ${actual} ≈ ${expected}`);
const within=(inner,outer,message)=>assert.ok(inner.left>=outer.left-epsilon&&inner.right<=outer.right+epsilon&&inner.top>=outer.top-epsilon&&inner.bottom<=outer.bottom+epsilon,`${message}: ${JSON.stringify({inner,outer})}`);
const apart=(a,b)=>a.right<=b.left+epsilon||b.right<=a.left+epsilon||a.bottom<=b.top+epsilon||b.bottom<=a.top+epsilon;

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLANNER_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
 const errors=[];
 try{
  for(const [width,height] of [[320,568],[390,844],[844,390]]){
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,timezoneId:'Europe/Berlin',reducedMotion:'reduce'});
   const prefix=`${width}×${height}`;
   page.on('pageerror',error=>errors.push(`${prefix}: ${error.message}`));
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin==='https://planner.test'){
     const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
     if(['index.html','sync-core.js','google-calendar.js'].includes(name))return route.fulfill({body:fs.readFileSync(path.resolve(name)),contentType:name.endsWith('.html')?'text/html':'application/javascript'});
    }
    if(url.hostname==='geocoding-api.open-meteo.com')return route.fulfill({json:{results:[{id:1,name:'Dresden',admin1:'Sachsen',country:'Deutschland',country_code:'DE',latitude:51.05,longitude:13.74,timezone:'Europe/Berlin'}]}});
    if(url.hostname==='api.open-meteo.com')return route.fulfill({json:{timezone:'Europe/Berlin',hourly:{time:['2026-10-12T11:00','2026-10-12T12:00','2026-10-12T13:00','2026-10-12T14:00'],temperature_2m:[13,14,15,15],precipitation_probability:[10,20,20,15],wind_speed_10m:[8,9,9,8],weather_code:[2,2,3,3]}}});
    if(route.request().resourceType()==='script')return route.fulfill({body:'',contentType:'application/javascript'});
    return route.fulfill({json:{requiresAccess:false,protocolVersion:2,apiVersion:'2026.10.08.33.14-test'}});
   });
   await page.goto('https://planner.test');
   await page.evaluate(()=>{
    today=()=>new Date('2026-10-12T00:00:00');
    tasks=[{id:'event-sheet',title:'Spotkanie projektowe',date:'2026-10-12',time:'12:00',endTime:'13:00',location:'Rynek 1, Dresden',notes:'Omówienie projektu i kolejnych zadań.'}];
    window.eventSheetMaps=[];window.open=(...args)=>window.eventSheetMaps.push(args);
    renderAll();openEventActions(tasks[0]);
   });
   await page.locator('#eventWeather .weather-strip').waitFor();
   const measure=()=>page.evaluate(()=>{
    const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const get=id=>document.getElementById(id),content=get('eventContent'),style=getComputedStyle(content);
    const nodes=Object.fromEntries(['eventHeader','eventHeaderMeta','actionTitle','eventMainRegion','eventContent','eventWeather','navigateBtn','eventActionsToggle','eventActionsMenu','eventConversationPanel','eventConversationBody','eventFooter','eventVoice','eventReplyDock'].map(id=>[id,rect(get(id))]));
    return {nodes,contentInsets:{left:parseFloat(style.paddingLeft)||0,right:parseFloat(style.paddingRight)||0},contentScroll:content.scrollTop,contentClientWidth:content.clientWidth,contentClientHeight:content.clientHeight,contentScrollHeight:content.scrollHeight,conversationScroll:get('eventConversationBody').scrollTop,conversationClientHeight:get('eventConversationBody').clientHeight,conversationScrollHeight:get('eventConversationBody').scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth,footerVisible:!get('eventFooter').classList.contains('hidden'),plusStyle:{background:getComputedStyle(get('eventActionsToggle')).backgroundColor,position:getComputedStyle(get('eventActionsToggle')).position}};
   });
   let initial=await measure();
   assert.equal(initial.overflow,false,`${prefix}: the mobile event sheet has no horizontal page overflow`);
   near(initial.nodes.eventHeader.left,0,`${prefix}: header starts at the left viewport edge`);
   near(initial.nodes.eventHeader.right,width,`${prefix}: header spans the mobile viewport`);
   near(initial.nodes.eventHeader.top,0,`${prefix}: header stays at the top viewport edge`);
   near(initial.nodes.eventFooter.left,0,`${prefix}: communication footer starts at the left viewport edge`);
   near(initial.nodes.eventFooter.right,width,`${prefix}: communication footer spans the viewport`);
   near(initial.nodes.eventFooter.bottom,height,`${prefix}: communication footer stays at the bottom viewport edge`);
   assert.ok(initial.nodes.eventMainRegion.height>20,`${prefix}: main event content remains usable`);
   within(initial.nodes.eventActionsToggle,initial.nodes.eventMainRegion,`${prefix}: the floating plus belongs only to the main content region`);
   assert.ok(apart(initial.nodes.eventActionsToggle,initial.nodes.eventFooter),`${prefix}: the floating plus does not cover communication controls`);
   assert.equal(initial.plusStyle.position,'absolute',`${prefix}: the plus is anchored inside the event content region`);
   assert.ok(['rgba(0, 0, 0, 0)','transparent'].includes(initial.plusStyle.background),`${prefix}: the plus button has a transparent background`);
   near(initial.nodes.eventWeather.width,initial.contentClientWidth-initial.contentInsets.left-initial.contentInsets.right,`${prefix}: weather uses the whole available event content width`);
   if(process.env.PLANNER_EVENT_SCREENSHOT){fs.mkdirSync(process.env.PLANNER_EVENT_SCREENSHOT,{recursive:true});await page.screenshot({path:path.resolve(process.env.PLANNER_EVENT_SCREENSHOT,`event-sheet-overview-33-${width}x${height}.png`)});}
   await page.locator('#navigateBtn').click();
   assert.equal(await page.evaluate(()=>eventSheetMaps[0][0]),'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent('Rynek 1, Dresden'),`${prefix}: the original navigation handler is preserved`);

   // Use actual event detail paragraphs to force the event body's own scroll area.
   await page.locator('#actionMeta').evaluate(node=>{for(let i=0;i<24;i++){const paragraph=document.createElement('p');paragraph.textContent=`Szczegół ${i+1}: omówienie harmonogramu, notatek i realizacji wydarzenia.`;node.appendChild(paragraph)}});
   initial=await measure();
   assert.ok(initial.contentScrollHeight>initial.contentClientHeight,`${prefix}: event details scroll independently`);
   await page.locator('#eventContent').evaluate(node=>node.scrollTop=node.scrollHeight);
   let scrolled=await measure();
   assert.ok(scrolled.contentScroll>0,`${prefix}: event content actually scrolls`);
   for(const id of ['eventHeader','eventFooter']){
    near(scrolled.nodes[id].top,initial.nodes[id].top,`${prefix}: ${id} top stays stationary when event details scroll`);
    near(scrolled.nodes[id].bottom,initial.nodes[id].bottom,`${prefix}: ${id} bottom stays stationary when event details scroll`);
   }
   await page.locator('#eventActionsToggle').click();
   assert.equal(await page.locator('#eventActionsToggle').getAttribute('aria-expanded'),'true');
   const actionRects=await page.locator('#eventActionsMenu').evaluate(menu=>[...menu.querySelectorAll('button')].map(button=>{const r=button.getBoundingClientRect();return {id:button.id,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}}));
   assert.deepEqual(actionRects.map(action=>action.id).filter(id=>['actionDone','actionEdit','actionTimer','actionDelete'].includes(id)),['actionDone','actionEdit','actionTimer','actionDelete'],`${prefix}: the vertical menu contains all original action buttons`);
   for(let i=1;i<actionRects.length;i++)assert.ok(actionRects[i].top>=actionRects[i-1].bottom-epsilon,`${prefix}: action menu buttons are arranged vertically`);
   await page.locator('#actionEdit').click();
   assert.equal(await page.locator('#eventEditBox').isVisible(),true,`${prefix}: the original edit action opens the editor`);
   await page.locator('#eventActionsToggle').click();
   await page.locator('#actionTimer').click();
   assert.equal(await page.locator('#timerBox').isVisible(),true,`${prefix}: the original timer action opens the timer`);
   assert.equal(await page.locator('#eventEditBox').isVisible(),false);

   await page.evaluate(()=>{
    window.eventSheetSession=beginVoiceDialogue('event',activeTask.id,voiceDialogueCurrent('event',activeTask.id));
    eventSheetSession.history=Array.from({length:30},(_,index)=>({role:index%2?'assistant':'user',content:`Wiadomość ${index+1}: ustalenia dotyczące godziny, notatek i zakresu wydarzenia.`}));
    eventSheetSession.dialogueState={engine:3,draft:{title:'Spotkanie projektowe',time:'14:30'}};
    showVoiceClarification(eventSheetSession,'Na którą godzinę przesunąć spotkanie?');
    window.eventSheetHistory=eventSheetSession.history;window.eventSheetDraft=eventSheetSession.dialogueState;window.eventSheetConversation=document.getElementById('eventConversation');window.eventSheetReply=document.getElementById('eventClarification');
   });
   await page.locator('#eventConversationPanel').waitFor({state:'visible'});
   await page.locator('#eventConversationTools .reply-keyboard:not(.hidden)').click();await page.locator('#eventClarification input').fill('O 14:30');
   initial=await measure();
   near(initial.nodes.eventFooter.bottom,height,`${prefix}: the communication footer remains at the viewport bottom with a reply`);
   within(initial.nodes.eventVoice,{left:0,right:width,top:0,bottom:height},`${prefix}: the microphone remains usable with conversation and reply controls`);
   within(initial.nodes.eventReplyDock,initial.nodes.eventConversationPanel,`${prefix}: reply and controls stay inside the glass conversation frame`);
   assert.ok(initial.nodes.eventContent.height>20,`${prefix}: event details remain usable with the conversation open`);
   assert.ok(initial.nodes.eventConversationBody.height>15,`${prefix}: the conversation keeps an independent usable scroll area`);
   assert.ok(initial.conversationScrollHeight>initial.conversationClientHeight,`${prefix}: the conversation has enough history to scroll`);
   within(initial.nodes.eventActionsToggle,initial.nodes.eventMainRegion,`${prefix}: the floating plus stays in event content while conversation is open`);
   assert.ok(apart(initial.nodes.eventActionsToggle,initial.nodes.eventConversationPanel),`${prefix}: the floating plus never covers the conversation`);
   assert.ok(apart(initial.nodes.eventActionsToggle,initial.nodes.eventFooter),`${prefix}: the floating plus never covers the reply/footer`);
   await page.locator('#eventConversationBody').evaluate(node=>node.scrollTop=0);
   await page.locator('#eventConversationBody').evaluate(node=>node.scrollTop=node.scrollHeight);
   scrolled=await measure();
   assert.ok(scrolled.conversationScroll>0,`${prefix}: conversation history actually scrolls`);
   near(scrolled.contentScroll,initial.contentScroll,`${prefix}: scrolling the conversation preserves the event body's scroll position`);
   for(const id of ['eventHeader','eventContent','eventFooter']){
    near(scrolled.nodes[id].top,initial.nodes[id].top,`${prefix}: ${id} stays stationary during conversation scroll`);
    near(scrolled.nodes[id].bottom,initial.nodes[id].bottom,`${prefix}: ${id} retains its bounds during conversation scroll`);
   }
   await page.locator('#closeEventConversation').click();
   assert.equal(await page.locator('#eventConversationPanel').isVisible(),false);
   const preserved=await page.evaluate(()=>({session:voiceDialogues.event===eventSheetSession,history:voiceDialogues.event.history===eventSheetHistory,draft:voiceDialogues.event.dialogueState===eventSheetDraft,conversation:document.getElementById('eventConversation')===eventSheetConversation,reply:document.getElementById('eventClarification')===eventSheetReply,input:document.querySelector('#eventClarification input').value}));
   assert.deepEqual(preserved,{session:true,history:true,draft:true,conversation:true,reply:true,input:'O 14:30'},`${prefix}: collapsing conversation preserves the same dialogue, history, draft, generated nodes and unsent reply`);
   await page.locator('#eventConversationToggle').click();
   assert.equal(await page.locator('#eventConversationPanel').isVisible(),true);
   assert.equal(await page.locator('#eventClarification input').inputValue(),'O 14:30');
   await page.locator('#closeEventConversation').click();
   await page.evaluate(()=>{eventSheetSession.history.push({role:'assistant',content:'Nowa wiadomość po zamknięciu panelu.'});renderVoiceConversation(eventSheetSession)});
   await page.locator('#eventConversationPanel').waitFor({state:'visible'});
   assert.match(await page.locator('#eventConversation').textContent(),/Nowa wiadomość po zamknięciu panelu/);
   if(process.env.PLANNER_EVENT_SCREENSHOT){fs.mkdirSync(process.env.PLANNER_EVENT_SCREENSHOT,{recursive:true});await page.screenshot({path:path.resolve(process.env.PLANNER_EVENT_SCREENSHOT,`event-sheet-33-${width}x${height}.png`)});}

   await page.locator('#closeEvent').click();
   assert.equal(await page.locator('#eventModal').isVisible(),false);
   assert.equal(await page.evaluate(()=>voiceDialogues.event),null);
   await page.evaluate(()=>openEventActions(tasks[0]));
   await page.locator('#eventActionsToggle').click();await page.locator('#actionDone').click();
   assert.equal(await page.evaluate(()=>tasks[0].done),true,`${prefix}: the original completed action still runs`);
   await page.evaluate(()=>openEventActions(tasks[0]));
   page.once('dialog',dialog=>dialog.accept());
   await page.locator('#eventActionsToggle').click();await page.locator('#actionDelete').click();
   assert.equal(await page.evaluate(()=>tasks.length),0,`${prefix}: the original delete action still runs`);
   await page.evaluate(()=>{tasks=[{id:'google-task',title:'Zadanie Google',date:'2026-10-12',time:'12:00',endTime:'13:00',notes:'https://tasks.google.com/task/example'}];openEventActions(tasks[0]);});
   assert.equal(await page.locator('#eventFooter').isVisible(),false,`${prefix}: communication stays hidden for a read-only Google task`);
   assert.equal(await page.locator('#eventActionsToggle').isVisible(),false,`${prefix}: read-only editing actions remain hidden`);assert.equal(await page.locator('#eventHeader #eventHistory').isVisible(),true,`${prefix}: original history is directly reachable in the header`);await page.locator('#eventHistory').click();assert.equal(await page.locator('#historyModal').isVisible(),true,`${prefix}: original history handler still runs for read-only Google tasks`);
   assert.equal(await page.locator('#eventConversationPanel').isVisible(),false);
   for(const id of ['actionDone','actionEdit','actionTimer','actionDelete'])assert.equal(await page.locator('#'+id).isVisible(),false,`${prefix}: ${id} stays hidden for a read-only Google task`);
   await page.close();
  }
  assert.deepEqual(errors,[],'No event sheet browser JavaScript errors');
  console.log('Event sheet browser 33.56: 320×568, 390×844, 844×390; viewport-wide fixed header/footer, independent event/conversation scroll, full-width weather, original navigation and action handlers, transparent main-content plus with vertical menu, same-node dialogue/reply preservation and read-only Google task protections passed.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
