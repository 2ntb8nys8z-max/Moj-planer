import {shoppingUuid, shoppingOwnerKey, SHOP_OWNER_NAME, boundedRequestBody, parseApiJson,
  applySharedShoppingAction} from 'planner-shopping-core';
import {guestPage, assets} from 'shopping-guest-assets';

const ownerOrigins = new Set(['https://okti-wybierz-produkty.oakgait2.chatgpt.site','https://2ntb8nys8z-max.github.io']);
const ownerActions = new Set(['create','owner-read','edit','rotate','close-joining','revoke','restore-access']);
const guestActions = new Set(['invite-info','join','read','mark','add','remove']);
const deny = () => fail('Brak dostępu do tej listy.',403);
function fail(message,status=400) { throw Object.assign(new Error(message),{status}); }
function validText(value,max) { return typeof value==='string' && !!value.trim() && value.length<=max; }
function displayNick(value) {
  return typeof value==='string' ? value.normalize('NFKC').replace(/\p{Default_Ignorable_Code_Point}/gu,'').trim().replace(/\s+/gu,' ') : '';
}
const nickKey = nick => displayNick(nick).toUpperCase().toLowerCase().normalize('NFKC');
function countSeats(state) {
  const used=Object.keys(state.participants).length;
  return {used,active:Object.values(state.invites).filter(s=>!s.revoked).length,remaining:state.limit-used,limit:state.limit,open:!!state.invite};
}
function ownerView(state,revision) {
  return {revision,archived:!!state.archived,generation:state.generation||0,title:state.title, ...countSeats(state),
    members:Object.entries(state.invites).map(([id,s])=>({id,nick:state.participants[s.actor],revoked:state.archived ? !!s.revokedBeforeArchive : !!s.revoked})),
    rows:state.rows.map(({key,text,done,by,buyer})=>({
      id:key,text,done,by,authorName:state.participants[state.authors?.[key]] ?? SHOP_OWNER_NAME,
      canUndo:!done||buyer==='owner'
    }))};
}
async function limitRequest(db, request, action) {
  const minute=Math.floor(Date.now()/60000);
  const key=await shoppingOwnerKey(action+':'+(request.headers.get('CF-Connecting-IP')||'unknown'));
  const row=await db.prepare('INSERT INTO shopping_rate(id,minute,attempts) VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET minute=excluded.minute, attempts=CASE WHEN shopping_rate.minute=excluded.minute THEN attempts+1 ELSE 1 END RETURNING attempts').bind(key,minute).first();
  if(row.attempts>30)fail('Zbyt wiele prób. Spróbuj ponownie za minutę.',429);
  await db.prepare('DELETE FROM shopping_rate WHERE minute < ?').bind(minute-60).run();
}
function validateSeats(value) {
  if(!Number.isSafeInteger(value)||value<1||value>200)fail('Wybierz od 1 do 200 osób na jedno zaproszenie.');
}
function edit(state,body) {
  const op=body.change;
  if(op?.type==='archive'){
    state.archived=true;
    state.invite=null;
    for(const member of Object.values(state.invites)){
      member.revokedBeforeArchive=!!member.revoked;
      member.revoked=true;
    }
    return;
  }
  if(op?.type==='remove' && typeof op.id==='string'){
    state.rows=state.rows.filter(row=>row.key!==op.id);
    if(state.authors)delete state.authors[op.id];
    return;
  }
  if(op?.type==='rename' && validText(op.title,80)){state.title=op.title.trim();return;}
  if(op?.type==='add' && shoppingUuid(op.id) && validText(op.text,160)){
    if(state.rows.some(row=>row.key===op.id))return;
    if(state.rows.length>=1500)fail('Lista jest pełna.');
    state.rows.push({key:op.id,text:op.text.trim(),done:false,by:''});return;
  }
  if(op?.type==='mark' && typeof op.id==='string' && typeof op.done==='boolean'){
    const row=state.rows.find(row=>row.key===op.id);
    if(!row)fail('Produkt został usunięty.',409);
    if(!op.done && row.done && row.buyer!=='owner')fail('Możesz przywrócić tylko swoje zakupy.',403);
    if(row.done!==op.done)Object.assign(row,{done:op.done,by:op.done?SHOP_OWNER_NAME:'',buyer:op.done?'owner':null});
    return;
  }
  fail('Niepoprawna zmiana kartki.');
}
async function handle(request,env,action,json) {
  const db=env.DB;
  if(action==='join'||action==='create')await limitRequest(db,request,action);
  const body=parseApiJson(new TextDecoder().decode(await boundedRequestBody(request,250000)));
  if(!shoppingUuid(body?.id))fail('Niepoprawny identyfikator listy.');
  const owner=ownerActions.has(action);
  let ownerHash;
  if(owner){
    const raw=request.headers.get('Authorization')?.match(/^Bearer ([0-9a-f-]+)$/)?.[1];
    if(!shoppingUuid(raw))deny();
    ownerHash=await shoppingOwnerKey(raw);
  }
  const actor=shoppingUuid(body.actor)?await shoppingOwnerKey(body.actor):null;
  const invitation=shoppingUuid(body.invite)?await shoppingOwnerKey(body.invite):null;
  const previous=shoppingUuid(body.previous)?await shoppingOwnerKey(body.previous):null;
  if(action==='create'){
    validateSeats(body.seats);
    if(!invitation||!validText(body.title,80)||!Array.isArray(body.items)||body.items.length>1500||
      !body.items.every(i=>shoppingUuid(i?.id)&&validText(i.text,1400)&&typeof i.done==='boolean')||
      new Set(body.items.map(i=>i.id)).size!==body.items.length)fail('Niepoprawna zawartość kartki.');
    const state={title:body.title.trim(),buyerVersion:1,participants:{},invites:{},invite:invitation,limit:body.seats,
      rows:body.items.map(i=>({key:i.id,text:i.text,done:i.done,by:i.done?SHOP_OWNER_NAME:'',buyer:i.done?'owner':null}))};
    await db.prepare('INSERT INTO shared_shopping(id,owner_hash,revision,content) VALUES(?,?,1,?) ON CONFLICT(id) DO NOTHING').bind(body.id,ownerHash,JSON.stringify(state)).run();
  }
  // In this database guest additions always have an author. Other rows came from the owner.
  function guestJson(data,status){
    for(const row of data.rows || []){
      row.authorName ??= SHOP_OWNER_NAME;
      row.authorMark = row.authorName;
    }
    return json(data,status);
  }
  for(let attempt=0;attempt<6;attempt++){
    const record=await db.prepare('SELECT revision,content,owner_hash FROM shared_shopping WHERE id=?').bind(body.id).first();
    if(!record||owner&&record.owner_hash!==ownerHash)deny();
    const state=JSON.parse(record.content);
    const revision=record.revision;
    const readGuest=()=>applySharedShoppingAction({action:'read',body,owner:false,db,json:guestJson});
    if(action==='owner-read'||action==='create')return json(ownerView(state,revision));
    if(state.archived){
      if(action==='invite-info')return json({available:false,used:true});
      if(owner && action==='edit' && body.change?.type==='archive')return json(ownerView(state,revision));
      fail('Ta lista została zamknięta.',403);
    }
    if(action==='invite-info')return json({available:!!invitation&&invitation===state.invite&&countSeats(state).remaining>0&&!(actor&&Object.values(state.invites).some(s=>s.actor===actor&&s.revoked)),used:!!invitation&&invitation===state.invite&&countSeats(state).remaining===0});
    if(action==='join'){
      if(!actor)deny();
      if(Object.hasOwn(state.participants,actor))return readGuest();
      if(!invitation||invitation!==state.invite)deny();
      if(countSeats(state).remaining<=0)fail('Wszystkie miejsca w zaproszeniu są już zajęte.',403);
      const nick=displayNick(body.nick);
      if(!validText(nick,60))fail('Podaj nick od 1 do 60 znaków.');
      const existing=[SHOP_OWNER_NAME,...Object.values(state.participants)].find(n=>nickKey(n)===nickKey(nick));
      if(existing)fail('Na tej liście jest już osoba o imieniu '+existing+'. Wpisz inne imię lub dodaj pierwszą literę nazwiska.',409);
      const memberId=crypto.randomUUID();
      state.invites[memberId]={actor,canAdd:true};
      state.participants[actor]=nick;
    } else if(action==='rotate'){
      validateSeats(body.seats);
      if(!invitation)fail('Niepoprawne zaproszenie.');
      if(state.invite===invitation)return json(ownerView(state,revision));
      if(!Number.isInteger(body.generation)||body.generation!==(state.generation||0)||previous!==state.invite)
        fail('Zaproszenie zmieniło się. Otwórz panel ponownie.',409);
      state.invite=invitation;
      state.limit+=body.seats;
      state.generation=(state.generation||0)+1;
    } else if(action==='close-joining'){
      if(state.invite){state.invite=null;state.generation=(state.generation||0)+1;}
    } else if(action==='revoke'||action==='restore-access'){
      if(!shoppingUuid(body.member)||!Object.hasOwn(state.invites,body.member))fail('Nie znaleziono uczestnika.',404);
      state.invites[body.member].revoked=action==='revoke';
    } else if(action==='edit')edit(state,body);
    else return applySharedShoppingAction({action,body,db,json:guestJson,owner:false});
    const saved=await db.prepare('UPDATE shared_shopping SET revision=revision+1, content=? WHERE id=? AND revision=?').bind(JSON.stringify(state),body.id,revision).run();
    if(saved.meta.changes)return action==='join'?readGuest():json(ownerView(state,revision+1));
  }
  fail('Kilka osób zmieniło listę naraz. Spróbuj ponownie.',409);
}
export default {async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get('Origin');
  const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  const json=(data,status=200)=>Response.json(data,{status,headers});
  if(url.protocol!=='https:')return json({error:'Wymagane jest HTTPS.'},400);
  if(url.pathname.startsWith('/shopping/')){
    const action=url.pathname.slice('/shopping/'.length);
    if(!ownerActions.has(action)&&!guestActions.has(action))return json({error:'Nieznana operacja.'},404);
    const production = url.origin === 'https://okti-wspolne-zakupy.oakgait2.chatgpt.site';
    const allowedOwner = production ? origin === 'https://2ntb8nys8z-max.github.io' : ownerOrigins.has(origin);
    if(origin && origin!==url.origin && !allowedOwner)return json({error:'Niedozwolone pochodzenie.'},403);
    if(origin)headers['Access-Control-Allow-Origin']=origin;
    headers['Access-Control-Allow-Methods']='POST, OPTIONS';
    headers['Access-Control-Allow-Headers']='Content-Type, Authorization';
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST')return json({error:'Wymagane jest POST.'},405);
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Wymagany jest JSON.'},415);
    try{return await handle(request,env,action,json);}
    catch(e){const status=Number.isInteger(e.status)&&e.status>=400&&e.status<500?e.status:503;return json({error:status===503?'Nie udało się połączyć z bazą zakupów. Spróbuj ponownie.':e.message},status);}
  }
  if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'Nieznana operacja.'},405);
  if(url.pathname==='/'||url.pathname==='/wspolne-zakupy.html'){
    headers['Content-Type']='text/html; charset=utf-8';
    headers['Permissions-Policy']='geolocation=(), camera=(), microphone=()';
    headers['Content-Security-Policy']="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
    return new Response(request.method==='HEAD'?null:guestPage,{headers});
  }
  const asset=Object.hasOwn(assets,url.pathname)?assets[url.pathname]:null;
  if(!asset)return new Response(null,{status:404,headers});
  return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0)),{headers:{...headers,'Content-Type':asset.type,'Cache-Control':'public,max-age=86400'}});
}};
