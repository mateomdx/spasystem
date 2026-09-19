import {readFile,mkdir} from 'node:fs/promises';
import {seed} from './db/seed.mjs';
export async function connect({demo=false,memory=false}={}) {
 let db;
 if(demo||memory) {if(!memory)await mkdir('./data',{recursive:true});const {PGlite}=await import('@electric-sql/pglite');db=new PGlite(memory?undefined:'./data/demo');await db.waitReady;}
 else {const {Pool}=await import('pg');if(!process.env.DATABASE_URL)throw Error('Configura DATABASE_URL en .env o ejecuta npm run demo.');db=new Pool({connectionString:process.env.DATABASE_URL});}
 const schema=await readFile(new URL('./db/schema.sql',import.meta.url),'utf8');
 if(db.exec) await db.exec(schema); else await db.query(schema);
 await seed(db);
 let queue=Promise.resolve();
 return {query:(...args)=>db.query(...args),close:()=>db.close?db.close():db.end(),transaction:async(fn)=>{
  // A dedicated connection pins PostgreSQL transactions. PGlite serializes transactions.
  if(db.connect){const c=await db.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
  const run=queue.then(()=>db.transaction(fn));queue=run.catch(()=>{});return run;
 }};
}
