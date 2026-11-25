import assert from 'node:assert/strict';
import { shoppingFixture } from './shopping-card-service-fixture.mjs';

const service = await shoppingFixture();
const uid = () => crypto.randomUUID();
const ownerOrigin = 'https://okti-wybierz-produkty.oakgait2.chatgpt.site';
const id=uid(), owner=uid(), invite=uid(), row=uid(), guest=uid();
async function call(action, body={}, key, status=200) {
  const headers={'Content-Type':'application/json',Origin:ownerOrigin};
  if (key) headers.Authorization='Bearer '+key;
  const response=await service.fetch(new Request('https://guest.test/shopping/'+action,{
    method:'POST',headers,body:JSON.stringify({id,...body})
  }));
  const result=await response.json();
  assert.equal(response.status,status,action+' '+(result.error||''));
  return result;
}
try {
  const initial={invite,seats:3,title:'Wspólna kartka',items:[{id:row,text:'Herbata',done:false}]};
  assert.equal((await call('create',initial,owner)).remaining,3);
  assert.equal((await call('create',initial,owner)).revision,1);
  assert.deepEqual(await call('invite-info',{invite}),{available:true,used:false});
  assert.equal((await call('owner-read',{},owner)).used,0);
  await call('read',{actor:uid()},undefined,403);
  const first=await call('join',{invite,actor:guest,nick:'  Zośka  '});
  assert.equal(first.rows[0].text,'Herbata');
  const duplicate=await call('join',{invite,actor:uid(),nick:'ＺＯＳ\u0301ＫＡ'},undefined,409);
  assert.match(duplicate.error,/Zośka/);
  const {members}=await call('owner-read',{},owner);
  const mark=await call('mark',{actor:guest,keys:[row],done:true,revision:first.revision});
  assert.equal(mark.rows[0].by,'Zośka');
  await call('edit',{change:{type:'mark',id:row,done:false}},owner,403);
  const revoked=await call('revoke',{member:members[0].id},owner);
  assert.equal(revoked.remaining,2);
  assert.equal(revoked.active,0);
  await call('read',{actor:guest},undefined,403);
  await call('join',{invite,actor:uid(),nick:'zośka'},undefined,409);
  await call('restore-access',{member:members[0].id},owner);
  assert.equal((await call('read',{actor:guest})).canAdd,true);
  const next=uid(), rotation={previous:invite,invite:next,generation:0,seats:1};
  assert.equal((await call('rotate',rotation,owner)).remaining,3);
  assert.equal((await call('rotate',rotation,owner)).remaining,3);
  await call('join',{actor:uid(),nick:'Jan',invite},undefined,403);
  assert.equal((await call('read',{actor:guest})).rows[0].by,'Zośka');
  const others=await Promise.all(['Jan','Ada','Ola','Piotr'].map(async nick=>{
    const res=await service.fetch(new Request('https://guest.test/shopping/join',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,actor:uid(),nick,invite:next})
    }));
    return res.status;
  }));
  assert.deepEqual(others.sort(),[200,200,200,403]);
  assert.equal((await call('owner-read',{},owner)).used,4);
  const id2=uid(),owner2=uid(),invite2=uid();
  await call('create',{id:id2,...initial,invite:invite2},owner2);
  await call('owner-read',{id:id2},owner,403);
  await call('read',{id:id2,actor:guest},undefined,403);
  const pair=await Promise.all(['Kasia',' kasia '].map(async nick=>(await service.fetch(new Request('https://guest.test/shopping/join',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id2,invite:invite2,actor:uid(),nick})
  }))).status));
  assert.deepEqual(pair.sort(),[200,409]);
  await call('close-joining',{id:id2},owner2);
  await call('join',{id:id2,invite:invite2,actor:uid(),nick:'Borys'},undefined,403);
  console.log('Invitations: owner credential, independent cards, pre-join privacy, Unicode names, capacity under concurrency, reserved seats, rotation and member access passed.');
} finally { await service.close(); }
