// Public holidays are supplied by Nager.Date, never guessed by the language model.
window.OktiBriefHolidays=(()=>{
 const cache=new Map(),ttl=24*60*60*1000;
 function select(rows,date,country,region){
  if(!Array.isArray(rows)||rows.length>1000||rows.some(h=>!h||typeof h.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(h.date)||h.countryCode!==country||!Array.isArray(h.types)||typeof h.global!=='boolean'||typeof h.localName!=='string'))throw Error('Nieprawidłowy kalendarz świąt.');
  return rows.filter(h=>h.date===date&&h.types.includes('Public')&&(h.global||region&&Array.isArray(h.counties)&&h.counties.includes(region))).map(h=>({date:h.date,localName:h.localName.slice(0,150),global:h.global}));
 }
 async function get(date,place,{signal}={}){
  const country=String(place?.countryCode||'').toUpperCase(),rawRegion=String(place?.regionCode||'').toUpperCase(),region=/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(rawRegion)&&rawRegion.startsWith(country+'-')?rawRegion:'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||! /^[A-Z]{2}$/.test(country))return {available:false,items:[]};
  const key=date.slice(0,4)+'/'+country,source='https://date.nager.at/api/v3/PublicHolidays/'+key;
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,5000);
  try{
   if(signal?.aborted)throw Error('Anulowano.');
   let saved=cache.get(key);
   if(!saved||Date.now()-saved.at>=ttl){const response=await fetch(source,{signal:controller.signal});if(!response.ok)throw Error('Brak kalendarza świąt.');const rows=await response.json();select(rows,date,country,region);saved={rows,at:Date.now()};cache.set(key,saved)}
   let countryLabel=country;try{countryLabel=new Intl.DisplayNames(['pl'],{type:'region'}).of(country)}catch(_){}
   return {available:true,items:select(saved.rows,date,country,region),countryCode:country,countryLabel,regionCode:region,regionalUnknown:!region&&saved.rows.some(h=>!h.global&&h.types.includes('Public')),source,at:saved.at};
  }catch(_){return {available:false,items:[],countryCode:country}}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
 }
 return {get,select};
})();
