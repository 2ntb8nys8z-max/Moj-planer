import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildShoppingService } from '../scripts/build-shopping-service.mjs';

export async function shoppingFixture() {
  const folder = await mkdtemp(path.join(os.tmpdir(),'okti-shopping-'));
  const filename = path.join(folder,'service.mjs');
  await buildShoppingService(filename);
  const {default:worker} = await import(pathToFileURL(filename));
  const db = new DatabaseSync(':memory:');
  db.exec(await readFile(new URL('../shopping-service/schema.sql',import.meta.url),'utf8'));
  function prepare(sql, values = []) {
    const statement = db.prepare(sql);
    return {
      bind: (...params) => prepare(sql,params),
      first: async () => statement.get(...values),
      run: async () => ({meta:statement.run(...values)})
    };
  }
  return {
    fetch: req => worker.fetch(req,{DB:{prepare}}),
    async close() { db.close(); await rm(folder,{recursive:true,force:true}); }
  };
}
