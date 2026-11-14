// Names and calendar observances are always available, without astrology or GPS.
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./brief-calendar-data.js'):root.OktiCalendarData);if(typeof module==='object'&&module.exports)module.exports=api;else root.OktiCalendarDay=api;})(globalThis,data=>{
 const plain=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').replace(/ł/g,'l').toLocaleLowerCase('pl-PL').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const aliases={
  'swieto trzech kroli':'trzech kroli','drugi dzien wielkanocy':'drugi dzien wielkiej nocy','wniebowziecie najswietszej maryi panny':'wniebowziecie nmp','matki boskiej zielnej':'wniebowziecie nmp',
  'boze narodzenie pierwszy dzien':'boze narodzenie','drugi dzien bozego narodzenia sw szczepana':'drugi dzien bozego narodzenia','boze narodzenie drugi dzien':'drugi dzien bozego narodzenia','drugi dzien swiat bozego narodzenia':'drugi dzien bozego narodzenia',
  'zeslanie ducha swietego zielone swiatki':'zielone swiatki','zielone swiatki zeslanie ducha swietego':'zielone swiatki','poniedzialek wielkanocny':'drugi dzien wielkiej nocy','swieto konstytucji 3 maja':'swieto narodowe trzeciego maja','swieto pracy':'swieto panstwowe'
 };
 const key=name=>{const value=plain(name);return aliases[value]||value};
 function get(date,holidays=null,events=[]){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Nieprawidłowa data kalendarza.');
  const d=new Date(date+'T12:00:00');if(!Number.isFinite(+d)||d.getFullYear()!==Number(date.slice(0,4))||d.getMonth()+1!==Number(date.slice(5,7))||d.getDate()!==Number(date.slice(8)))throw Error('Nieprawidłowa data kalendarza.');
  const items=[],seen=new Set(),add=(name,source,kind='observance',country=null)=>{if(!String(name||'').trim())return;const id=key(name)+(country&&country!=='PL'?' '+country:'');if(seen.has(id)){if(kind==='public'){const previous=items.find(i=>key(i.name)+(i.country&&i.country!=='PL'?' '+i.country:'')===id);if(previous){previous.kind=kind;previous.source=source}}return}seen.add(id);items.push({name:String(name).trim(),source,kind,...(country?{country}:{})})};
  for(const name of data.dated[date]||[])add(name,data.sources.calendar,'calendar','PL');
  for(const name of data.public[date]||[])add(name,'https://date.nager.at/api/v3/PublicHolidays/'+date.slice(0,4)+'/PL','public','PL');
  for(const entry of data.fixed)if(entry.day===date.slice(5))add(entry.name,entry.source);
  for(const [month,weekday,ordinal,name,source] of data.rules){
   if(d.getMonth()+1!==month||d.getDay()!==weekday)continue;
   const rank=Math.floor((d.getDate()-1)/7)+1,last=new Date(d.getFullYear(),month,0).getDate();if(ordinal===rank||ordinal===-1&&d.getDate()+7>last)add(name,source);
  }
  for(const h of holidays?.items||[])add(h.localName,holidays.source,'public',holidays.countryCode||'PL');
  for(const event of events){
   const marked=event.type==='holiday'||['swieto','swieta'].includes(plain(event.category))||/#holiday@group\.v\.calendar\.google\.com$/i.test(event.googleData?.calendarId||event.calendarId||'');
   if(marked&&event.date<=date&&(event.endDate?event.endDate>date:event.date===date))add(event.title||event.text,'Twój kalendarz','calendar');
  }
  return {date,namedays:data.namedays[date.slice(5)]||null,items,sources:[...new Set(items.map(i=>i.source))]};
 }
 return {get};
});
