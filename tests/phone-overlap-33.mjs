import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,context=dom.getInternalVMContext(),run=source=>vm.runInContext(source,context);
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,matchMedia:()=>({matches:true}),confirm:()=>true,alert(){},fetch:async()=>new Response('{}')});
w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};

// Independently evaluate the rendered inline CSS. Do not call phoneEventGeometry,
// phoneTrackPosition or phoneTrackWidth, and do not infer correctness from slots.
function pixels(value,reference){
 const expression=value.replace(/^calc\((.*)\)$/,'$1').trim();
 let sum=0,consumed='',match;
 const terms=/([+-]?)\s*(\d+(?:\.\d+)?)\s*(px|%)/g;
 while((match=terms.exec(expression))){sum+=(match[1]==='-'?-1:1)*Number(match[2])*(match[3]==='%'?reference/100:1);consumed+=match[0]}
 assert.equal(consumed.replace(/\s/g,''),expression.replace(/\s/g,''),`Unsupported inline CSS length: ${value}`);
 return sum;
}
const epsilon=.01;
const overlaps=(a,b)=>a.left<b.right-epsilon&&b.left<a.right-epsilon&&a.top<b.bottom-epsilon&&b.top<a.bottom-epsilon;
const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<epsilon,`${message}: ${actual} ≈ ${expected}`);
const inside=(inner,outer,message)=>assert.ok(inner.left>=outer.left-epsilon&&inner.right<=outer.right+epsilon&&inner.top>=outer.top-epsilon&&inner.bottom<=outer.bottom+epsilon,`${message}: ${JSON.stringify({inner,outer})}`);
const rectangle=(left,top,width,height)=>({left,right:left+width,top,bottom:top+height,width,height});
const day='2026-10-12';
const task=(id,time,endTime,extra={})=>({id,title:`Wydarzenie ${id}`,date:day,time,endTime,...extra});
const minute=value=>{const [hour,minute]=value.split(':').map(Number);return hour*60+minute};
const fixture=[task('anchor','10:00','15:00'),task('a','12:00','12:20',{location:'Rynek 1'}),task('b','12:10','12:35'),task('c','12:20','12:45'),task('d','14:00','14:30'),task('solo','16:00','16:25')];

function render(records,reminder=false){
 w.fixture=records;
 run(`selected=new Date('${day}T12:00:00');tasks=fixture;ideas=${reminder?"[{id:'alarm',title:'Przypomnienie',text:'Przypomnienie',alarm:{date:'2026-10-12',time:'12:15',message:'Przypomnienie'}}]":'[]'};renderAll();showView('day')`);
}
function measure(records,width){
 const measured=[];
 for(const cardNode of w.document.querySelectorAll('.phone-event')){
  const record=records.find(record=>record.id===cardNode.dataset.eventId),titleNode=cardNode.nextElementSibling;
  const headingNode=titleNode.querySelector('.phone-event-title-text'),timeNode=titleNode.querySelector('.phone-event-time'),rangeNode=timeNode.querySelector('.phone-event-time-range'),pinNode=timeNode.querySelector('.phone-event-location-icon');
  const card=rectangle(pixels(cardNode.style.left,width),pixels(cardNode.style.top,width),pixels(cardNode.style.width,width),pixels(cardNode.style.height,width));
  const title=rectangle(pixels(titleNode.style.left,width),pixels(titleNode.style.top,width),pixels(titleNode.style.width,width),pixels(titleNode.style.height,width));
  const titleStyle=w.getComputedStyle(titleNode),headingStyle=w.getComputedStyle(headingNode),timeStyle=w.getComputedStyle(timeNode),rangeStyle=w.getComputedStyle(rangeNode);
  const content=rectangle(title.left+parseFloat(titleStyle.paddingLeft),title.top+parseFloat(titleStyle.paddingTop),title.width-parseFloat(titleStyle.paddingLeft)-parseFloat(titleStyle.paddingRight),title.height-parseFloat(titleStyle.paddingTop)-parseFloat(titleStyle.paddingBottom));
  const lineHeight=parseFloat(headingStyle.lineHeight)||parseFloat(titleStyle.lineHeight),lines=titleNode.classList.contains('single-line')?1:titleNode.classList.contains('lines-3')?3:2;
  const headingHeight=titleNode.classList.contains('single-line')?parseFloat(headingStyle.height):Math.min(lines*lineHeight,pixels(headingStyle.maxHeight,content.height));
  const heading=rectangle(content.left,content.top,content.width,headingHeight);
  // Reserve both possible time lines independently of the layout's lane count.
  // A <wbr> between the two hours keeps each complete HH:MM fragment together.
  assert.equal(rangeNode.textContent,`${record.time}–${record.endTime}`);
  assert.equal(rangeNode.querySelectorAll('wbr').length,1,'The time range has a safe wrapping boundary');
  assert.equal(rangeStyle.whiteSpace,'normal','Narrow columns may wrap the complete time range');
  const rowGap=parseFloat(titleStyle.gap)||0,pinSize=pinNode?parseFloat(w.getComputedStyle(pinNode.querySelector('svg')).width):0,stacked=timeStyle.flexDirection==='column';
  const timeHeight=2*parseFloat(timeStyle.lineHeight)+(stacked&&pinSize?pinSize+parseFloat(timeStyle.gap):0);
  const time=rectangle(content.left,heading.bottom+rowGap,content.width,timeHeight),pin=pinNode?rectangle(time.left,time.top,pinSize,pinSize):null;
  const range=stacked?rectangle(time.left,time.top+(pin?pinSize+parseFloat(timeStyle.gap):0),time.width,2*parseFloat(timeStyle.lineHeight)):rectangle(time.left+(pin?pinSize+parseFloat(timeStyle.gap):0),time.top,time.width-(pin?pinSize+parseFloat(timeStyle.gap):0),time.height);
  measured.push({id:record.id,record,card,title,heading,time,pin,range,fontSize:parseFloat(timeStyle.fontSize),cardZ:Number(cardNode.style.zIndex),titleZ:Number(titleNode.style.zIndex)});
 }
 return measured;
}
function assertReadable(events,width,label){
 for(const event of events){
  assert.ok(event.card.width>0&&event.card.right<=width-56+epsilon,`${label}: ${event.id} retains the reminder gutter`);
  inside(event.title,event.card,`${label}: ${event.id} title wrapper fits its card`);
  inside(event.heading,event.title,`${label}: ${event.id} reserved title area fits its wrapper`);
  inside(event.time,event.title,`${label}: ${event.id} reserved hours area fits its wrapper`);
  assert.ok(event.range.width>=3*event.fontSize,`${label}: ${event.id} leaves visible width for complete time fragments`);
  assert.ok(!overlaps(event.heading,event.time),`${label}: ${event.id} title and hour rows remain separate`);
  if(minute(event.record.endTime)-minute(event.record.time)<=30)assert.ok(event.card.height>=48,`${label}: short ${event.id} is at least48px high`);
  if(event.pin){inside(event.pin,event.time,`${label}: location icon stays in its row`);assert.ok(event.pin.width>=9,`${label}: location icon remains visible`);assert.ok(!overlaps(event.pin,event.range),`${label}: location icon and hours remain separate`)}
 }
 for(let i=0;i<events.length;i++)for(let j=i+1;j<events.length;j++){
  const first=events[i],second=events[j];
  assert.ok(!overlaps(first.title,second.title),`${label}: ${first.id}/${second.id} rendered text wrappers never intersect`);
  for(const a of [first.heading,first.time])for(const b of [second.heading,second.time])assert.ok(!overlaps(a,b),`${label}: ${first.id}/${second.id} title and hour areas never intersect`);
 }
 for(const event of events)for(const other of events){
  if(event===other)continue;
  const background=minute(other.record.endTime)-minute(other.record.time)>30&&minute(other.record.time)<=minute(event.record.time)&&minute(other.record.endTime)>=minute(event.record.endTime)&&other.cardZ<event.titleZ;
  if(background)continue;
  assert.ok(!overlaps(event.title,other.card),`${label}: card ${other.id} does not conceal ${event.id}'s text wrapper`);
 }
}

try{
 for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);
 for(const viewport of [320,390,430]){
  // Real mobile content width: 12px app padding per side and1px timeline scroll padding.
  const width=viewport-25,label=`${viewport}px`;
  render(fixture,true);const events=measure(fixture,width),byId=Object.fromEntries(events.map(event=>[event.id,event]));
  assertReadable(events,width,label);
  assert.ok(!overlaps(byId.a.card,byId.b.card),`${label}: A/B occupy distinct cards`);
  assert.ok(!overlaps(byId.c.card,byId.b.card),`${label}: C/B occupy distinct cards`);
  near(byId.a.card.left,byId.c.card.left,`${label}: C reuses A's left position at the exact end`);
  near(byId.a.card.width,byId.c.card.width,`${label}: C keeps A's available width`);
  assert.ok(byId.a.card.bottom<=byId.c.card.top,`${label}: A/C remain vertically separate after exact-end reuse`);
  near(byId.d.card.left,byId.anchor.card.left+16,`${label}: D uses the first inset position`);
  assert.ok(byId.d.card.width>byId.a.card.width+20,`${label}: D uses the wider available area`);
  near(byId.solo.card.left,byId.anchor.card.left,`${label}: unconflicted short event starts normally left`);
  near(byId.solo.card.width,byId.anchor.card.width,`${label}: unconflicted short event retains standard width`);
  for(const id of ['a','b','c','d'])assert.ok(byId[id].card.left>=byId.anchor.card.left+16-epsilon,`${label}: ${id} remains16px from the purple left edge`);
  assert.ok(byId.a.pin,'A includes its location icon');

  const sameStart=[task('large','10:00','15:00'),task('same-start','10:00','10:20',{location:'Rynek 1'})];
  render(sameStart);const same=measure(sameStart,width);assertReadable(same,width,`${label} same-start`);
  assert.ok(same[0].title.top>=same[1].card.bottom,`${label}: large-event header moves to free vertical space`);

  const covered=[task('covered','10:00','11:00'),task('first-half','10:00','10:30'),task('second-half','10:30','11:00')];
  render(covered);const fallback=measure(covered,width);assertReadable(fallback,width,`${label} covered-header`);
  for(const event of fallback.slice(1))assert.ok(!overlaps(fallback[0].card,event.card),`${label}: an entirely covered header uses separate columns`);

  const dense=[task('dense-large','10:00','11:01'),task('dense-a','10:00','10:30',{location:'Rynek 1'}),task('dense-b','10:25','10:55'),task('dense-c','10:55','11:00')];
  render(dense);const crowded=measure(dense,width);assertReadable(crowded,width,`${label} dense-fallback`);
  assert.ok(crowded[1].pin,`${label}: dense fallback preserves the location icon`);
  for(const event of crowded.slice(1))assert.ok(!overlaps(crowded[0].card,event.card),`${label}: dense fallback cards preserve the long-event header`);

  const four=[task('four-large','10:00','15:00'),task('four-a','12:00','12:20',{location:'Rynek 1'}),task('four-b','12:00','12:20'),task('four-c','12:00','12:20'),task('four-d','12:00','12:20')];
  render(four);const fourColumns=measure(four,width);assertReadable(fourColumns,width,`${label} four-columns`);
  for(const event of fourColumns.slice(1))assert.ok(event.card.height>=60,`${label}: four narrow columns reserve an extra row for the location icon`);

  const adjacent=[task('five-a','12:00','12:05'),task('five-b','12:05','12:10')];
  render(adjacent);const short=measure(adjacent,width);assertReadable(short,width,`${label} five-minute-adjacent`);
  near(short[0].card.left,short[1].card.left,`${label}: five-minute exact-end adjacency does not create a false overlap`);
  near(short[0].card.width,short[1].card.width,`${label}: five-minute adjacency keeps full width`);
  assert.ok(short[0].card.bottom<=short[1].card.top,`${label}: short visual expansion does not cover the next event`);
 }
 console.log('Phone overlap geometry: independently evaluated rendered CSS at 320px, 390px, 430px; disjoint text areas, readable reserved hour/icon rows, exact-end reuse including 5min events, anchor inset, wide standalone/D cards, same-start safe headers, covered-header fallback and reminder gutter passed.');
}finally{dom.window.close()}
