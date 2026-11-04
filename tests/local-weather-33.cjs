const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
(async()=>{
 const html=fs.readFileSync('index.html','utf8'),dom=new JSDOM(html,{url:'https://planner.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,ctx=dom.getInternalVMContext(),run=code=>vm.runInContext(code,ctx);
 const requests=[];let fixes=0,denied=false,failForecast=false,coords={latitude:52.4064,longitude:16.9252,accuracy:20},now=Date.now();w.Date.now=()=>now;
 const date=new Date(),tomorrow=new Date(date);tomorrow.setDate(date.getDate()+1);const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,day=iso(date),next=iso(tomorrow);
 const hourly={time:[day+'T12:00',next+'T12:00',next+'T14:00',next+'T15:00',next+'T16:00'],temperature_2m:[9,10,17,18,16],weather_code:[2,3,2,2,3],precipitation_probability:[10,20,10,10,20],wind_speed_10m:[5,6,7,8,9]};
 Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,matchMedia:()=>({matches:true}),confirm:()=>true,alert(){},fetch:async value=>{
  const url=String(value);requests.push(url);
  if(url.includes('api.bigdatacloud.net'))return new Response(JSON.stringify({city:coords.latitude<53?'Poznań':'Gdańsk',countryName:'Polska'}));
  if(url.includes('geocoding-api.open-meteo.com'))return new Response(JSON.stringify({results:[{id:1,name:'Warszawa',country:'Polska',country_code:'PL',latitude:52.23,longitude:21.01,population:1800000,timezone:'Europe/Warsaw'}]}));
  if(url.includes('api.open-meteo.com/v1/forecast')){if(failForecast)throw Error('offline');return new Response(JSON.stringify({timezone:'Europe/Warsaw',current:{time:day+'T10:00',temperature_2m:7.2,weather_code:3,is_day:1},hourly,daily:{time:[day,next],sunrise:[day+'T06:35',next+'T06:37'],sunset:[day+'T16:02',next+'T16:00']}}))}
  return new Response('{}');
 }});
 Object.defineProperty(w.navigator,'geolocation',{value:{getCurrentPosition(ok,error){fixes++;denied?error({code:1}):ok({coords})}}});w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};
 try{
  for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);
  assert.equal(fixes,0,'No location prompt before the user enables location');assert.equal(requests.filter(u=>u.includes('meteo')||u.includes('bigdatacloud')).length,0);
  assert.equal(w.document.querySelector('.phone-day-temperature'),null,'No fabricated preview weather');
  await run('OktiLocalWeather.enable()');assert.equal(fixes,1);assert.equal(w.document.querySelector('.phone-day-temperature').textContent,'7°');assert.equal(w.document.querySelector('#phoneLocalWeather'),null,'No location controls on the main screen');assert.ok(w.document.querySelector('#phoneSettingsModal #enableLocalWeather'),'Location is configured only in settings');assert.match(w.document.querySelector('#localWeatherStatus').textContent,/Poznań/);assert.match(w.document.querySelector('#localWeatherStatus').textContent,/52\.406, 16\.925/);
  const count=()=>requests.filter(u=>u.includes('api.open-meteo.com/v1/forecast')).length;assert.equal(count(),1);
  w.document.querySelector('#dayTitle').click();
  assert.ok(w.document.querySelector('#dayWeatherModal').open);
  assert.match(w.document.querySelector('#dayWeatherBody').textContent,/Poznań/);
  assert.match(w.document.querySelector('#dayWeatherBody').textContent,/12:00/);
  assert.equal(w.document.querySelector('#dayWeatherBody .okti-weather-hour strong').textContent,'9°');
  assert.match(w.document.querySelector('.okti-weather-astronomy').textContent,/06:35/);
  assert.match(w.document.querySelector('.okti-weather-astronomy').textContent,/16:02/);
  assert.equal(w.document.querySelector('.okti-weather-hero strong').textContent,'7°','Header and detail use the same current value');
  const normalizeArt=n=>n.innerHTML.replace(/okti-weather-art-\d+/g,'art');
  assert.equal(normalizeArt(w.document.querySelector('.phone-day-weather .weather-icon')),normalizeArt(w.document.querySelector('.okti-weather-hero .okti-weather-icon')),'Header and detail share identical weather artwork');
  assert.match(run('oktiSunHorizonArtwork(true)'),/M40 18v49/,'Sunset arrow starts at ray level and ends beneath horizon');
  assert.ok(run("oktiMoonPhase('2026-11-24').fraction")>.9,'Astronomical moon phase near full moon');
  assert.equal(count(),1,'Opening day details reuses downloaded weather');
  w.document.querySelector('#dayWeatherModal button').click();
  assert.equal(w.document.querySelector('.app')?.inert||false,false);
  await Promise.all([run('OktiLocalWeather.refresh(true)'),run('OktiLocalWeather.refresh(true)')]);assert.equal(count(),1,'Repeated location refresh reuses a fresh forecast');
  run(`tasks=[{id:'warsaw',title:'Spotkanie',location:'Warszawa',date:'${next}',time:'15:00',endTime:'16:00'}];renderAll()`);
  assert.equal(count(),1,'Adding/rendering an event never fetches event weather');
  await run('activeTask=tasks[0];showPlannerWeather(tasks[0])');assert.equal(count(),2);assert.match(w.document.querySelector('#eventWeather').textContent,/Warszawa/);assert.match(w.document.querySelector('#eventWeather').textContent,/18°C/);assert.equal(w.document.querySelector('.phone-day-temperature').textContent,'7°','Event weather never replaces local header weather');
  await run('showPlannerWeather(tasks[0])');assert.equal(count(),2,'Reopening event uses its two-hour cache');
  run("selected=new Date('"+next+"T12:00:00');renderDay()");assert.equal(count(),2,'Browsing dates does not fetch other cities');assert.equal(w.document.querySelector('.phone-day-temperature').textContent,'10°');
  w.document.querySelector('#dayTitle').click();
  assert.equal(w.document.querySelectorAll('#dayWeatherBody .okti-weather-hour').length,4,'Details use the selected date');
  assert.match(w.document.querySelector('#dayWeatherBody').textContent,/15:00/);
  w.document.querySelector('#dayWeatherModal button').click();
  Object.defineProperty(w.document,'visibilityState',{value:'hidden',configurable:true});now+=3*60*60*1000;const before=fixes;await run('OktiLocalWeather.refresh()');assert.equal(fixes,before,'No location/weather polling while hidden');
  Object.defineProperty(w.document,'visibilityState',{value:'visible',configurable:true});await run('OktiLocalWeather.refresh()');assert.equal(count(),3,'Fresh foreground fix refreshes expired local weather');
  denied=true;await run('OktiLocalWeather.refresh(true)');assert.match(w.document.querySelector('#localWeatherStatus').textContent,/Brak zgody/);assert.equal(count(),3,'Denied location does not send a new forecast request');
  denied=false;coords={latitude:54.352,longitude:18.6466,accuracy:20};failForecast=true;await run('OktiLocalWeather.refresh(true)');assert.equal(w.document.querySelector('.phone-day-temperature'),null,'Forecast from the old city is hidden if fetching for new location fails');assert.match(w.document.querySelector('#localWeatherStatus').textContent,/Gdańsk/);
  run('OktiLocalWeather.disable()');assert.equal(w.document.querySelector('.phone-day-temperature'),null);assert.equal(run('OktiLocalWeather.snapshot().place'),undefined);assert.equal(run('OktiLocalWeather.snapshot().enabled'),false);
  console.log('Local weather: explicit location consent, real source isolation, per-location two-hour cache, no event preload, event date/hour, foreground-only refresh, denied/offline handling and disable verified (GPS and providers mocked).');
 }finally{w.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
