const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const html=fs.readFileSync('index.html','utf8'),source=fs.readFileSync('event-weather.js','utf8');
const dom=new JSDOM(html,{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,ctx=dom.getInternalVMContext(),run=s=>vm.runInContext(s,ctx);
let now=Date.parse('2026-11-08T12:00:00Z'),requests=[],offline=false,delay=null;
const rows={time:['2026-11-07T09:00','2026-11-08T09:00','2026-11-08T15:00','2026-11-08T21:00','2026-11-09T09:00'],temperature_2m:[5,7,13,-2,9],weather_code:[3,2,0,0,61],is_day:[1,1,1,0,1]};
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,matchMedia:()=>({matches:true}),alert(){},confirm:()=>true,fetch:async url=>{
 requests.push(String(url));if(delay)await delay;if(offline)throw Error('offline');
 if(String(url).includes('/v1/forecast'))return Response.json({hourly:rows});
 if(String(url).includes('/v1/search'))return Response.json({results:[]});return Response.json({});
}});w.Date.now=()=>now;w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};
try{
 for(const script of w.document.scripts)if(!script.src)run(script.textContent);
 run("today=()=>new Date('2026-11-08T00:00:00');selected=today();showPlannerWeather=async()=>{};ideas=[]");
 w.Element.prototype.getBoundingClientRect=function(){return {left:70,top:100,right:300,bottom:168,width:this.dataset.testWidth?+this.dataset.testWidth:230,height:68}};
 run(source);
 const seed=records=>{w.records=records;run('tasks=records;renderAll()')};
 const place=location=>({location,latitude:52.23,longitude:21.01,name:'Warszawa'});
 const task=(id,time,date='2026-11-08')=>({id,title:'Wydarzenie '+id,date,time,endTime:String(+time.slice(0,2)+1).padStart(2,'0')+':00',location:'Warszawa',weatherPlace:place('Warszawa')});
 const refresh=()=>run('OktiEventWeather.refresh()');
 (async()=>{try{
  const records=[task('morning','09:00'),task('afternoon','15:00'),task('night','21:00')];seed(records);const before=JSON.stringify(records);
  await Promise.all([refresh(),refresh()]);
  assert.equal(requests.filter(url=>url.includes('/v1/forecast')).length,1,'One request serves all events and concurrent renders at one place');
  assert.equal(run('OktiEventWeather.get(tasks[0]).temperature'),7);assert.equal(run('OktiEventWeather.get(tasks[1]).temperature'),13);assert.equal(run('OktiEventWeather.get(tasks[2]).temperature'),-2);
  const morning=w.document.querySelector('[data-event-id=morning] .okti-event-card-weather'),night=w.document.querySelector('[data-event-id=night] .okti-event-card-weather');
  assert.equal(morning.textContent,'7°');assert.match(night.innerHTML,/weather-moon/,'A clear night uses the approved moon');
  assert.match(w.document.querySelector('[data-event-id=afternoon]').getAttribute('aria-label'),/13°C/);
  assert.equal(w.document.querySelector('[data-event-id=morning]').nextElementSibling.classList.contains('has-card-weather'),true);
  assert.equal(JSON.stringify(records),before,'Weather never changes stored event fields');
  const clone=run('OktiEventWeather.copyBadge(document.querySelector(".okti-event-card-weather"))');assert.equal(clone.textContent,morning.textContent);assert.notEqual(clone.querySelector('clipPath').id,morning.querySelector('clipPath').id,'Flight artwork has independent clip IDs');
  const narrow=w.document.querySelector('[data-event-id=morning]');narrow.dataset.testWidth='55';await refresh();assert.equal(narrow.querySelector('.okti-event-card-weather'),null,'Tiny columns keep all available room for their title and hours');assert.equal(narrow.nextElementSibling.classList.contains('has-card-weather'),false);
  narrow.dataset.testWidth='145';await refresh();assert.equal(narrow.querySelector('.okti-event-card-weather').dataset.layout,'compact');
  const past=task('yesterday','09:00','2026-11-07'),next=task('tomorrow','09:00','2026-11-09');seed([past,next]);await refresh();assert.equal(run('OktiEventWeather.get(tasks[0]).temperature'),5);assert.equal(run('OktiEventWeather.get(tasks[1]).temperature'),9,'A different date uses that date, not today');
  const far=task('far','09:00','2026-12-08');seed([far]);const count=requests.length;await refresh();assert.equal(requests.length,count);assert.equal(run('OktiEventWeather.get(tasks[0])'),null,'Outside the forecast horizon no weather is invented');
  const changed={...task('changed','09:00'),location:'Nieznane miejsce'};seed([changed]);await refresh();assert.equal(run('OktiEventWeather.get(tasks[0])'),null,'Coordinates from the previous address are rejected');
  const local={id:'local',title:'Bez adresu',date:'2026-11-08',time:'15:30',endTime:'16:30'};seed([local]);run("OktiLocalWeather.details=()=>({place:'Poznań',at:Date.now(),rows:[{time:'15:00',temperature:11,code:61,isDay:true}]})");const prior=requests.length;await refresh();assert.equal(run('OktiEventWeather.get(tasks[0]).temperature'),11);assert.equal(requests.length,prior,'An unlocated event reuses already enabled local data without GPS or extra requests');
  // An old response may warm its own cache, but cannot paint a changed address.
  let release;delay=new Promise(resolve=>release=resolve);const waitingTask={...task('moving','09:00'),weatherPlace:{...place('Warszawa'),latitude:50.1}};seed([waitingTask]);const pending=refresh();await new Promise(resolve=>setTimeout(resolve,10));waitingTask.location='Inne miejsce';release();delay=null;await pending;assert.equal(w.document.querySelector('[data-event-id=moving] .okti-event-card-weather'),null);
  now+=3*60*60*1000;offline=true;seed([task('offline','09:00')]);await refresh();assert.equal(run('OktiEventWeather.get(tasks[0]).stale'),true);assert.match(w.document.querySelector('[data-event-id=offline]').getAttribute('aria-label'),/zapisana prognoza/);
  Object.defineProperty(w.document,'visibilityState',{value:'hidden',configurable:true});seed([{...task('hidden','09:00'),weatherPlace:{...place('Warszawa'),latitude:49.1}}]);const hiddenCount=requests.length;await refresh();assert.equal(requests.length,hiddenCount,'Background calendars do not fetch weather');
  console.log('Event card weather: place/date/hour, night, shared cache, concurrent renders, local reuse, changed addresses, unavailable dates, compact columns, offline and hidden state passed (providers mocked).');
 }finally{dom.window.close()}})().catch(e=>{console.error(e);process.exitCode=1});
}catch(e){dom.window.close();throw e}
