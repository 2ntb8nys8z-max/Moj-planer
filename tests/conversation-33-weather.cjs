const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');

(async()=>{
  const html=fs.readFileSync('index.html','utf8');
  const dom=new JSDOM(html,{url:'https://planner.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,ctx=dom.getInternalVMContext();
  let geocodingUrl='';
  Object.assign(w,{
    structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,
    confirm:()=>true,alert(){},
    fetch:async url=>{
      const value=String(url);
      if(value.includes('geocoding-api.open-meteo.com')){
        geocodingUrl=value;
        return new Response(JSON.stringify({results:[
          {id:101,name:'Wola Kosowska',admin1:'Województwo mazowieckie',admin2:'Powiat piaseczyński',country:'Polska',country_code:'PL',latitude:52.05683,longitude:20.84012,population:1200,timezone:'Europe/Warsaw'}
        ]}),{status:200});
      }
      if(value.includes('api.open-meteo.com/v1/forecast'))return new Response(JSON.stringify({timezone:'Europe/Warsaw',hourly:{
        time:['2026-10-08T14:00','2026-10-08T15:00','2026-10-08T16:00'],temperature_2m:[12,13,12],precipitation_probability:[10,20,15],wind_speed_10m:[8,9,8],weather_code:[2,2,3]
      }}),{status:200});
      throw new Error(`Unexpected request: ${value}`);
    }
  });
  w.HTMLElement.prototype.scrollIntoView=function(){};
  for(const script of w.document.querySelectorAll('script'))if(!script.src)vm.runInContext(script.textContent,ctx);

  const hints=vm.runInContext("plannerWeatherHints('Wólka Kosowska pod Warszawą')",ctx);
  assert.equal(hints.city,'Wólka Kosowska');
  assert.equal(hints.nearby,'Warszawą');

  await vm.runInContext(`
    // Keep the forecast fixture in the future regardless of the test execution date.
    today=()=>new Date('2026-10-08T00:00:00');
    testWeatherTask={id:77,title:'Spotkanie',date:'2026-10-08',time:'15:00',endTime:'15:45',location:'Wólka Kosowska pod Warszawą'};
    tasks=[testWeatherTask];activeTask=testWeatherTask;showPlannerWeather(testWeatherTask)
  `,ctx);

  assert.match(geocodingUrl,/name=W%[0-9A-F]{2}lka\+Kosowska|name=W%C3%B3lka\+Kosowska/i);
  assert.doesNotMatch(geocodingUrl,/Warszaw/);
  assert.equal(vm.runInContext('testWeatherTask.weatherPlace.id',ctx),101);
  assert.equal(vm.runInContext('testWeatherTask.location',ctx),'Wólka Kosowska pod Warszawą');
  assert.match(w.document.getElementById('eventWeather').textContent,/Pogoda dla: Wola Kosowska, Województwo mazowieckie/);

  console.log('Conversation 33 weather: the sole Open-Meteo place supplies coordinates without replacing the user location label.');
  dom.window.close();
})().catch(error=>{console.error(error);process.exitCode=1});
