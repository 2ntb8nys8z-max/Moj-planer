const fs=require('node:fs');
const {createHash}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');

exports.legacyShoppingWorker=async()=>{
  const token='test-only-shopping-owner';
  const digest=createHash('sha256').update('Bearer '+token).digest('hex');
  const source=fs.readFileSync('worker.js','utf8').replace(/const SHOP_OWNER_DIGEST = '[a-f0-9]{64}'/,"const SHOP_OWNER_DIGEST = '"+digest+"'");
  const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
  const db=new DatabaseSync(':memory:');
  function prepare(sql,args=[]){
    const stmt=db.prepare(sql);
    return {bind:(...values)=>prepare(sql,values),first:async()=>stmt.get(...args),
      all:async()=>({results:stmt.all(...args)}),run:async()=>({meta:stmt.run(...args)})};
  }
  return {token,worker,db,env:{API_LIMITS_DB:{prepare}}};
};
