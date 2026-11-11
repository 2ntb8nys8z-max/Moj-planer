const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const source=fs.readFileSync('device-permissions.js','utf8');
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve()};
function setup({stored={},geo='prompt',mic='prompt',enabled=false,unsupported=false,permissionApi=true,deny=false,delay=false}={}){
 const dom=new JSDOM('<!doctype html><head></head><body><div id="localWeatherSettings"></div></body>',{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.localStorage.setItem('okti-device-permissions-v1',JSON.stringify(stored));
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'))};
 const counts={geo:0,mic:0,stop:0},permission={geolocation:geo,microphone:mic},weather={enabled,place:null,error:''};let resolveMic;
 const stream=()=>({getTracks:()=>[{stop(){counts.stop++}},{stop(){counts.stop++}}]});
 Object.defineProperty(w.navigator,'geolocation',{configurable:true,value:unsupported?undefined:{}});
 Object.defineProperty(w.navigator,'permissions',{configurable:true,value:permissionApi?{query:async({name})=>({state:permission[name]})}:undefined});
 Object.defineProperty(w.navigator,'mediaDevices',{configurable:true,value:unsupported?undefined:{getUserMedia:async constraints=>{
  assert.deepEqual(JSON.parse(JSON.stringify(constraints)),{audio:true});counts.mic++;
  if(deny)throw Object.assign(new Error('Denied'),{name:'NotAllowedError'});
  if(delay)return new Promise(resolve=>{resolveMic=()=>{permission.microphone='granted';resolve(stream())}});
  permission.microphone='granted';return stream();
 }}});
 w.OktiLocalWeather={snapshot:()=>({...weather}),enable:async()=>{counts.geo++;weather.enabled=true;if(deny){permission.geolocation='denied';weather.error='Brak zgody na lokalizację.';return}permission.geolocation='granted';weather.place={checkedAt:Date.now()}}};
 vm.runInContext(source,dom.getInternalVMContext());
 return {w,dom,counts,permission,weather,get:id=>w.document.getElementById(id),resolveMic:()=>resolveMic()};
}
(async()=>{
 let c=setup();await flush();assert.equal(c.get('oktiPermissionsDialog').open,true,'First entry offers both permissions before recording');assert.deepEqual(c.counts,{geo:0,mic:0,stop:0},'Displaying setup asks for no device data');
 c.get('oktiAllowLocation').click();await flush();assert.equal(c.counts.geo,1);assert.equal(c.w.OktiPermissions.getState().location,'ready');
 c.get('oktiAllowMicrophone').click();c.get('oktiAllowMicrophone').click();await flush();assert.equal(c.counts.mic,1);assert.equal(c.counts.stop,2,'Every track obtained for permission is released immediately');assert.equal(c.w.OktiPermissions.getState().microphone,'ready');
 c.get('oktiFinishPermissions').click();assert.equal(c.get('oktiPermissionsDialog').open,false);c.w.dispatchEvent(new c.w.Event('okti-authenticated'));await flush();assert.equal(c.get('oktiPermissionsDialog').open,false,'Login does not repeat completed setup');assert.equal(c.counts.mic,1);
 const ready=JSON.parse(c.w.localStorage.getItem('okti-device-permissions-v1'));c.dom.window.close();
 c=setup({stored:ready,geo:'granted',mic:'granted',enabled:true});await flush();assert.equal(c.get('oktiPermissionsDialog').open,false);assert.equal(c.counts.mic,0,'Reload never opens a granted microphone');c.dom.window.close();
 c=setup({stored:ready,geo:'granted',mic:'prompt',enabled:true});await flush();assert.equal(c.get('oktiPermissionsDialog').open,true,'A browser-reset grant is requested at entry again');assert.equal(c.w.OktiPermissions.getState().microphone,'unknown');c.dom.window.close();
 c=setup({deny:true});await flush();c.get('oktiAllowLocation').click();c.get('oktiAllowMicrophone').click();await flush();assert.equal(c.w.OktiPermissions.getState().location,'denied');assert.equal(c.w.OktiPermissions.getState().microphone,'denied');assert.match(c.get('oktiMicrophonePermissionStatus').textContent,/ustawieniach witryny/);c.get('oktiFinishPermissions').click();assert.equal(c.get('oktiPermissionsDialog').open,false,'Denial does not prevent entering the planner');c.dom.window.close();
 c=setup({delay:true});await flush();c.get('oktiAllowMicrophone').click();c.w.OktiPermissions.close();c.resolveMic();await flush();assert.equal(c.counts.stop,2,'A late grant after leaving setup also releases the microphone');assert.equal(c.get('oktiPermissionsDialog').open,false);c.dom.window.close();
 c=setup({unsupported:true});await flush();assert.equal(c.get('oktiAllowLocation').disabled,true);assert.equal(c.get('oktiAllowMicrophone').disabled,true);c.w.OktiPermissions.close();c.dom.window.close();
 c=setup({permissionApi:false});await flush();assert.equal(c.get('oktiPermissionsDialog').open,true,'Unsupported Permissions API still allows a direct user request');c.get('oktiAllowMicrophone').click();await flush();assert.equal(c.w.OktiPermissions.getState().microphone,'ready');assert.equal(c.counts.stop,2);c.get('oktiManagePermissions').click();await flush();c.w.OktiPermissions.close();c.dom.window.close();
 console.log('Device setup: first entry, explicit opt-in, separate grants, immediate release of every microphone track, duplicate/late requests, denied/unsupported permissions, revisit/login, revoked grants and missing Permissions API passed (device fixtures).');
})().catch(error=>{console.error(error);process.exitCode=1});
