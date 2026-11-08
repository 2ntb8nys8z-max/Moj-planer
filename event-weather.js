// Calendar weather is presentation only. It never edits event dates, locations or durations.
window.OktiEventWeather=(()=>{
 const storeKey=(typeof PREVIEW33_PREFIX==='string'?PREVIEW33_PREFIX:'')+'okti-event-weather-v1';
 const maxAge=2*60*60*1000,placeAge=24*60*60*1000,retryAge=60*1000;
 let saved={places:{},forecasts:{}};
 try{const value=JSON.parse(localStorage.getItem(storeKey)||'null');if(value?.places&&value?.forecasts)saved=value}catch(_){}
 const pending=new Map(),failures=new Map();let running=0,frame=0;const waiting=[];
 const valid=p=>p&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180;
 const coordinateKey=p=>p.latitude.toFixed(4)+','+p.longitude.toFixed(4);
 const hourKey=task=>task.date+'T'+(task.time||'12:00').slice(0,2)+':00';
 const locationKey=task=>plannerLocationKey(plannerLocation(task));
 const daysAway=task=>(new Date(task.date+'T12:00:00')-new Date(iso(today())+'T12:00:00'))/86400000;
 function persist(){
  for(const [name,limit] of [['places',32],['forecasts',8]]){
   saved[name]=Object.fromEntries(Object.entries(saved[name]).sort((a,b)=>(b[1]?.at||0)-(a[1]?.at||0)).slice(0,limit));
  }
  try{localStorage.setItem(storeKey,JSON.stringify(saved))}catch(_){}
 }
 function normalise(row,place,at,isDay){
  if(!Number.isFinite(row?.temperature)||!Number.isFinite(row?.code))return null;
  return {temperature:Math.round(row.temperature),code:row.code,isDay:isDay??row.isDay??true,place,at,stale:Date.now()-at>=maxAge};
 }
 function resolved(task){
  const location=plannerLocation(task),google=plannerGooglePlace(task),weather=task.weatherPlace;
  if(google)return google;
  if(weather?.location===location&&valid(weather))return weather;
  const cached=saved.places[locationKey(task)];
  return cached&&Date.now()-cached.at<placeAge&&valid(cached.place)?cached.place:null;
 }
 function read(task){
  const location=plannerLocation(task),key=hourKey(task),hour=Number(key.slice(11,13));
  if(!location){
   const details=OktiLocalWeather.details(new Date(task.date+'T12:00:00'));
   const row=details?.rows.find(row=>row.time===key.slice(11));
   return row?normalise(row,details.place,details.at,row.isDay):null;
  }
  const place=resolved(task);if(!place)return null;
  const forecast=saved.forecasts[coordinateKey(place)];
  const row=forecast?.rows?.find(row=>row.key===key);
  if(row&&Date.now()-forecast.at<maxAge)return normalise(row,location,forecast.at,row.isDay);
  const stored=task.weatherForecast;
  if(stored?.key===plannerWeatherForecastKey(task,place)){
   const row=stored.rows?.find(row=>row.key===key&&row.index>=0);
   const at=Date.parse(stored.fetchedAt||'');
   if(row&&Number.isFinite(at))return normalise(row,location,at,row.isDay??(hour>=6&&hour<18));
  }
  return row?normalise(row,location,forecast.at,row.isDay):null;
 }
 async function request(url){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('Weather unavailable');return await response.json()}
  finally{clearTimeout(timer)}
 }
 function schedule(key,work){
  if(pending.has(key))return pending.get(key);
  if(Date.now()-(failures.get(key)||0)<retryAge)return Promise.resolve(null);
  const promise=new Promise(resolve=>{waiting.push(async()=>{
   try{resolve(await work());failures.delete(key)}catch(_){failures.set(key,Date.now());resolve(null)}
   finally{running--;pending.delete(key);drain()}
  });drain()});
  pending.set(key,promise);return promise;
 }
 function drain(){while(running<2&&waiting.length){running++;waiting.shift()()}}
 async function resolvePlace(task){
  const ready=resolved(task);if(ready)return ready;
  const location=plannerLocation(task),key=locationKey(task);if(!location)return null;
  const cached=saved.places[key];if(cached&&Date.now()-cached.at<placeAge)return null;
  if(task.locationUnresolved===location&&Date.now()-Date.parse(task.locationUnresolvedAt||0)<60*60*1000)return null;
  return schedule('place:'+key,async()=>{
   const hints=plannerWeatherHints(location),terms=hints.postcode?[hints.postcode]:plannerWeatherCityQueries(location).slice(0,2);
   let candidates=[];
   for(const term of terms){
    const query=new URLSearchParams({name:term,count:'10',language:'pl',format:'json'});if(hints.countryCode)query.set('countryCode',hints.countryCode);
    const url='https://geocoding-api.open-meteo.com/v1/search?'+query;
    const cached=plannerWeatherCache.get(url),data=cached&&Date.now()-cached.at<placeAge?cached.data:await request(url);
    candidates=plannerWeatherFilterPlaces((data.results||[]).filter(p=>p.id!=null&&valid(p)),hints);if(candidates.length)break;
   }
   const exact=candidates.filter(p=>plannerWeatherNameKey(p.name)===plannerWeatherNameKey(hints.city)).sort((a,b)=>(Number(b.population)||0)-(Number(a.population)||0));
   const top=exact[0],next=exact[1],clear=top&&(exact.length===1||Number(top.population)>=Math.max(1,Number(next.population)||0)*5);
   const place=clear?top:candidates.length===1?candidates[0]:null;
   saved.places[key]={at:Date.now(),place};persist();return place;
  });
 }
 async function ensure(task){
  if(!plannerLocation(task)||daysAway(task)<-7||daysAway(task)>15)return;
  const existing=read(task);if(existing&&!existing.stale)return;
  const place=await resolvePlace(task);if(!place)return;
  const key=coordinateKey(place),cached=saved.forecasts[key];
  if(cached&&Date.now()-cached.at<maxAge&&cached.rows?.some(row=>row.key===hourKey(task)))return;
  await schedule('forecast:'+key,async()=>{
   const query=new URLSearchParams({latitude:String(place.latitude),longitude:String(place.longitude),hourly:'temperature_2m,weather_code,is_day',timezone:'auto',forecast_days:'16',past_days:'7'});
   const data=await request('https://api.open-meteo.com/v1/forecast?'+query),h=data.hourly;
   if(!Array.isArray(h?.time)||!Array.isArray(h.temperature_2m)||!Array.isArray(h.weather_code))throw Error('Incomplete forecast');
   saved.forecasts[key]={at:Date.now(),rows:h.time.map((key,i)=>({key,temperature:h.temperature_2m[i],code:h.weather_code[i],isDay:h.is_day?.[i]!==0}))};persist();
  });
 }
 const style=document.createElement('style');style.textContent=`
 .okti-event-card-weather{position:absolute;top:24px;right:17px;display:flex;align-items:center;gap:2px;max-width:53px;height:20px;pointer-events:none;color:#315271;font:800 12px/1 var(--okti-font,sans-serif);white-space:nowrap}
 .okti-event-card-weather-icon{width:20px;height:20px;display:block;flex:none;transform:scale(1.1);transform-origin:right center}.okti-event-card-weather-icon svg{display:block;width:100%;height:100%}
 .okti-event-card-weather[data-layout=compact]{right:15px;gap:1px;height:18px;font-size:10px}.okti-event-card-weather[data-layout=compact] .okti-event-card-weather-icon{width:17px;height:17px}
 .phone-layout .phone-event-title.has-card-weather .phone-event-time{max-width:calc(100% - var(--event-weather-space,60px))}
 `;document.head.append(style);
 function badge(weather,layout){
  const node=document.createElement('span');node.className='okti-event-card-weather';node.dataset.layout=layout;
  node.dataset.weatherCode=String(weather.code);node.dataset.weatherTemperature=String(weather.temperature);node.dataset.weatherIsDay=String(weather.isDay);
  node.setAttribute('aria-hidden','true');
  const icon=document.createElement('span');icon.className='okti-event-card-weather-icon';icon.innerHTML=oktiWeatherArtwork(plannerWeatherSymbol(weather.code).kind,weather.isDay);
  const temperature=document.createElement('span');temperature.textContent=weather.temperature+'°';node.append(icon,temperature);return node;
 }
 function cards(){return [...document.querySelectorAll('#taskList .phone-event[data-event-id]')]}
 function paint(){
  for(const card of cards()){
   const task=tasks.find(task=>String(task.id)===card.dataset.eventId),copy=card.nextElementSibling;
   if(!task||!copy?.classList.contains('phone-event-title'))continue;
   const width=card.getBoundingClientRect().width,layout=width>=170?'normal':width>=125?'compact':'hidden',weather=read(task);
   const show=weather&&layout!=='hidden',signature=show?[weather.temperature,weather.code,weather.isDay,layout,weather.stale].join('|'):'';
   copy.classList.toggle('has-card-weather',!!show);copy.dataset.weatherLayout=layout;
   const base=card.getAttribute('aria-label')?.split(' · Prognoza:')[0]||task.title;
   const reserve=()=>{const node=card.querySelector('.okti-event-card-weather');if(node){copy.style.setProperty('--event-weather-space',((node.offsetWidth||(layout==='compact'?40:53))+(layout==='compact'?15:17)+6)+'px');const clock=copy.querySelector('.phone-event-time'),bounds=card.getBoundingClientRect();node.style.top=Math.max(5,Math.min(bounds.height-(layout==='compact'?18:20)-4,clock.getBoundingClientRect().top-bounds.top))+'px'}else copy.style.removeProperty('--event-weather-space')};
   if(card.dataset.weatherSignature===signature){reserve();continue}
   card.dataset.weatherSignature=signature;card.querySelector('.okti-event-card-weather')?.remove();
   if(show){
    card.append(badge(weather,layout));const label=plannerWeatherSymbol(weather.code).label;
    card.setAttribute('aria-label',base+' · Prognoza: '+label+', '+weather.temperature+'°C'+(weather.stale?' (zapisana prognoza)':''));
   }else card.setAttribute('aria-label',base);
   reserve();
  }
 }
 async function refresh(){
  paint();if(document.visibilityState==='hidden')return;
  const visible=cards().map(card=>tasks.find(task=>String(task.id)===card.dataset.eventId)).filter(Boolean);
  await Promise.all(visible.map(async task=>{await ensure(task);paint()}));
 }
 function queue(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=0;refresh()})}
 const observer=new MutationObserver(records=>{if(records.some(record=>[...record.addedNodes].some(node=>node.classList?.contains('phone-timeline-scroll'))))queue()});
 observer.observe(document.getElementById('taskList'),{childList:true,subtree:true});
 window.addEventListener('okti-local-weather',queue);window.addEventListener('pageshow',queue);window.addEventListener('resize',queue);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')queue()});
 setInterval(()=>{if(document.visibilityState==='visible')queue()},15*60*1000);queue();
 return {get:read,refresh,copyBadge:node=>{const copy=badge({temperature:Number(node.dataset.weatherTemperature),code:Number(node.dataset.weatherCode),isDay:node.dataset.weatherIsDay!=='false'},node.dataset.layout);copy.style.top=node.style.top;return copy}};
})();
