// The subscription store and the application signing key are only used server-side.
async function shoppingPushKeys(db){
  await db.prepare('CREATE TABLE IF NOT EXISTS shopping_push_identity (id INTEGER PRIMARY KEY, identity TEXT NOT NULL)').run();
  const read=()=>db.prepare('SELECT identity FROM shopping_push_identity WHERE id=1').first();
  let row=await read();
  if(!row){
    const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
    const raw=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
    const privateJwk=await crypto.subtle.exportKey('jwk',pair.privateKey);
    const identity={publicKey:btoa(String.fromCharCode(...raw)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),privateKey:privateJwk.d,subject:'https://github.com/2ntb8nys8z-max/Moj-planer'};
    await db.prepare('INSERT OR IGNORE INTO shopping_push_identity(id,identity) VALUES (1,?)').bind(JSON.stringify(identity)).run();
    row=await read();
  }
  return JSON.parse(row.identity);
}
async function shoppingPushTable(db){
  await db.prepare('CREATE TABLE IF NOT EXISTS shopping_push_devices (list_id TEXT, endpoint TEXT, subscription TEXT NOT NULL, PRIMARY KEY(list_id,endpoint))').run();
}
function validShoppingPushEndpoint(value){
  try{
    const u=new URL(value),host=u.hostname;
    return typeof value==='string' && value.length<=2048 && u.protocol==='https:' && !u.port && !u.username && !u.password && !u.hash &&
      (host.endsWith('.push.apple.com') || host==='fcm.googleapis.com' || host==='updates.push.services.mozilla.com' || host.endsWith('.notify.windows.com'));
  }catch{return false}
}
async function manageShoppingPush(action,body,db,json){
  if(action==='push-key')return json({publicKey:(await shoppingPushKeys(db)).publicKey});
  const sub=body.subscription,endpoint=sub?.endpoint;
  if(!validShoppingPushEndpoint(endpoint))return json({error:'Nieprawidłowy adres powiadomień.'},400);
  await shoppingPushTable(db);
  if(action==='push-off'){
    await db.prepare('DELETE FROM shopping_push_devices WHERE list_id=? AND endpoint=?').bind(body.id,endpoint).run();
  }else{
    if(!/^[A-Za-z0-9_-]{87}$/.test(sub.keys?.p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(sub.keys?.auth))
      return json({error:'Nieprawidłowy klucz urządzenia.'},400);
    const record={endpoint,keys:{auth:sub.keys.auth,p256dh:sub.keys.p256dh}};
    await db.prepare('INSERT OR REPLACE INTO shopping_push_devices(list_id,endpoint,subscription) VALUES (?,?,?)').bind(body.id,endpoint,JSON.stringify(record)).run();
  }
  return json({enabled:action==='push-on'});
}
async function sendShoppingJoinPush(db,id,event){
  await shoppingPushTable(db);
  const {results}=await db.prepare('SELECT subscription FROM shopping_push_devices WHERE list_id=?').bind(id).all();
  if(!results.length)return;
  const identity=await shoppingPushKeys(db);
  await Promise.all(results.map(async({subscription})=>{
    const sub=JSON.parse(subscription);
    const payload=await shoppingPushLib().buildPushPayload({data:{id,nick:event.nick,key:event.key,revision:event.revision},options:{ttl:3600,urgency:'high'}},sub,identity);
    for(let attempt=0;attempt<2;attempt++){
      try{
        const res=await fetch(sub.endpoint,{...payload,redirect:'error',signal:AbortSignal.timeout(6000)});
        if(res.status===404 || res.status===410){
          await db.prepare('DELETE FROM shopping_push_devices WHERE list_id=? AND endpoint=? AND subscription=?').bind(id,sub.endpoint,subscription).run();
          return;
        }
        if(res.ok)return;
        if(res.status<500 || attempt)throw Error('Push '+res.status);
      }catch(error){if(attempt)throw error}
    }
  }));
}
