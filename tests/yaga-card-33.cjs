const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom'),source=require('../brief-inspiration.js'),data=require('../brief-inspiration-data.js'),core=require('../day-briefing.js'),narrator=require('../brief-narrative.js');
process.env.TZ='Europe/Warsaw';
const dom=new JSDOM('<head></head><body></body>',{runScripts:'outside-only'});dom.window.OktiDayBriefing=core;dom.window.eval(fs.readFileSync('brief-day-card.js','utf8'));
try{
 assert.equal(data.days.length,426);assert.equal(new Set(data.days.map(r=>r[0])).size,426);assert.equal(data.sourceFileSha256,'e8051e845ed880e37b4d1404acbcdba1ff79024872a3b6a2240dcd41990e8cae');assert.equal(Object.keys(data.chapters).length,16);
 let emptySky=0,allEvents=0,largest=0;const whispers=new Set();
 for(let i=0;i<data.days.length;i++){
  const row=data.days[i],day=source.day(row[0]),raw=day.detail.sourceText;whispers.add(day.text);if(i)assert.equal(Date.parse(row[0])-Date.parse(data.days[i-1][0]),86400000);
  assert.equal(day.editorial.inspiration,raw.whisper);assert.ok(day.detail.energy.includes(day.editorial.evidence.favors.text));assert.ok(day.detail.energy.includes(day.editorial.evidence.care.text));assert.ok(day.editorial.care);assert.ok(raw.namedays);assert.ok(raw.story);assert.ok(raw.practice);
  for(const next of [day.detail.nextFullMoon,day.detail.nextNewMoon]){assert.ok(next,'Both countdowns cover the entire requested range');assert.equal(next.days,(Date.parse(next.date)-Date.parse(day.date))/86400000);assert.ok(next.days>=0)}
  const card=dom.window.OktiYagaCard.render(day);assert.equal(card.dataset.yagaDate,day.date);assert.equal(card.querySelector('[data-yaga-story] p').textContent,raw.story);assert.equal(card.querySelector('[data-yaga-energy] p').textContent,day.detail.energy);assert.equal(card.querySelector('[data-yaga-original]').open,false);assert.equal(card.querySelectorAll('img').length,0,'Daily artwork is never fetched/generated');assert.ok(card.querySelector('svg'));
  if(!day.detail.transits){emptySky++;assert.equal(card.querySelector('[data-yaga-transits]'),null);assert.doesNotMatch(card.textContent,/Brak osobnego|brak.*tranzyt/iu)}
  const times=day.sky.events.map(e=>e.time);assert.deepEqual(times,[...times].sort());allEvents+=times.length;
  for(const e of day.sky.events){assert.ok(day.detail.transits.includes(e.original));if(/^Nów|^Pełnia/u.test(e.title))assert.equal(e.time,day.detail.phase.match(/o (\d\d:\d\d)/)[1])}
  if(day.chapter)assert.equal(card.querySelector('[data-yaga-chapter] p').textContent,day.chapter.text);
  const model={date:day.date,now:new Date('2026-11-01T08:00:00+01:00'),mode:'plan',records:[],inspiration:day,presentation:{kind:'full',includeYaga:true}};const context=narrator.context(model,core.summary(model));narrator.input(context);largest=Math.max(largest,context.facts.find(f=>f.id==='inspiration').text.length);
 }
 assert.equal(whispers.size,426);assert.equal(emptySky,169);assert.equal(allEvents,326);assert.ok(largest<6000);
 const friday=source.day('2026-11-13'),saturday=source.day('2026-11-14');assert.notEqual(friday.text,saturday.text);assert.equal(friday.editorial.favors,saturday.editorial.favors);assert.equal(friday.sky.events[0].time,'16:53');assert.equal(saturday.sky.events[0].time,'01:27');assert.equal(source.day('2027-02-08').sky.events.length,3);assert.ok(source.day('2027-02-08').sky.week);assert.equal(source.day('2026-12-09').sky.events.find(e=>/^Nów/.test(e.title)).time,'01:52');assert.equal(source.day('2027-12-31').detail.nextFullMoon.date,'2028-01-12');assert.equal(source.day('2027-12-31').detail.nextNewMoon.date,'2028-01-26');assert.equal(source.day('2028-01-01'),null);
 const missing=source.editorial({energy:'Nie ma tu porady do wyodrębnienia.',sourceText:{}});assert.equal(missing.care,null);assert.equal(missing.favors,null);const card=dom.window.OktiYagaCard.render({date:'2026-11-13',phase:'nów',detail:{},editorial:missing});assert.equal(card.querySelector('[data-yaga-care],[data-yaga-good],[data-yaga-inspiration]'),null);
 const unsafe=dom.window.OktiYagaCard.render({...friday,editorial:{inspiration:'<img src=x onerror=alert(1)>'}});assert.equal(unsafe.querySelector('img'),null);assert.match(unsafe.textContent,/<img/);
 console.log('Yaga card: all 426 dates, exact original text and evidence, stable dated inspiration, all 16 chapters, namedays, optional advice, 169 omitted empty skies, 326 sorted timed events, canonical phase hours, boundary countdowns, no per-day images, XSS and writer fact limits passed.');
}finally{dom.window.close()}
