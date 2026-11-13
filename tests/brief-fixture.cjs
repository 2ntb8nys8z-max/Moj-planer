// Synthetic model responses for the structured writer contract. The fixture
// writes its own sentences from values, and never executes source text.
function context(data){
 if(data.schemaVersion!==2)return data;
 return {...data,facts:data.facts.map(f=>{const v=f.values;let text='';
  if(f.kind==='count')text=v.meetings?(data.mode==='review'?'W kalendarzu zaplanowano ':data.relativeDay==='tomorrow'?'Masz jutro ':'Masz dziś jeszcze ')+v.meetings+' '+(v.meetings===1?'spotkanie.':v.meetings<5?'spotkania.':'spotkań.'):data.relativeDay==='tomorrow'?'Nie masz jutro zaplanowanych spotkań.':'Na dziś nie masz już zaplanowanych spotkań.';
  else if(f.kind==='weather'){text=v.temperatureMax-v.temperatureMin>=6?'Wieczorem ochłodzi się z '+v.temperatureMax+' do '+v.temperatureMin+'°C.':(data.relativeDay==='tomorrow'?'Jutro':'Dzisiaj')+' w ciągu dnia będzie chłodno, od '+v.temperatureMin+' do '+v.temperatureMax+'°C.';if(v.rain){const day=new Date(v.rain.at.slice(0,10)+'T12:00:00').getDay(),night='w nocy z '+['soboty','niedzieli','poniedziałku','wtorku','środy','czwartku','piątku'][day]+' na '+['niedzielę','poniedziałek','wtorek','środę','czwartek','piątek','sobotę'][day];text+=' Możliwe opady '+(v.rain.at.slice(11,13)==='00'?night:'wieczorem')+'.';}}
  else if(f.kind==='warning')text=(v.risk==='overlap'?'Nakładają się terminy spotkań ':'Ryzyko spóźnienia na spotkanie ')+v.events.map(e=>'„'+e.title+'”').join(' i ')+'.';
  else if(f.kind==='activity')text=v.title;
  else if(f.kind==='travel')text='Dojazd do „'+v.to+'” zajmie około '+v.minutes+' minut.';
  else if(f.kind==='inspiration')text='Według Księgi Yagi: '+v.phase+'. '+v.goodFor+'.';
  return {...f,text};})};
}
function response(data,answer){const c=context(data),weather=c.facts.find(f=>f.id==='weather');
 if(data.schemaVersion===2)for(const f of c.facts.filter(f=>f.kind==='warning'&&f.priority===3))if(![answer.intro,...answer.insights].filter(Boolean).some(s=>s.factIds.includes(f.id)))answer.insights.push({text:f.text,factIds:[f.id]});
 if(data.schemaVersion===2&&weather){answer.weather={text:weather.text,factIds:['weather']};answer.spoken=[answer.weather,...answer.spoken.filter(s=>!s.factIds.includes('weather'))]}
 const route=data.schemaVersion===2&&data.facts.find(f=>f.kind==='travel'&&f.values.current);
 if(route){const v=route.values,sentence={text:(v.gpsUpdated?'Sprawdziłem aktualną lokalizację. ':'')+'Dojazd do „'+v.to+'” zajmie około '+v.minutes+' minut.'+(v.leaveAt?' Wyjedź około '+v.leaveAt+'.':''),factIds:[route.id]};answer.insights.push(sentence);answer.spoken.push(sentence)}
 const yaga=c.facts.find(f=>f.id==='inspiration');if(yaga&&answer.inspiration==null){answer.inspiration={text:yaga.text,factIds:['inspiration']};const sentence={text:'Księga Yagi: '+(yaga.values?.phase||'inspiracja dnia')+'.',factIds:['inspiration']};if([...answer.spoken,sentence].map(s=>s.text).join(' ').split(/\s+/).length<=data.wordBudget)answer.spoken.push(sentence)}
 return Response.json({choices:[{message:{content:JSON.stringify(answer)}}]});
}
module.exports={context,response};
