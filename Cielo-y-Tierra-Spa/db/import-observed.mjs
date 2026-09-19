import {readFile} from 'node:fs/promises';
import {connect} from '../database.mjs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const amount=s=>Number(String(s).replace(/[^0-9-]/g,'')||0);
export async function importObserved(db){
 const data=JSON.parse(await readFile(new URL('../docs/reference/observed.json',import.meta.url),'utf8'));
 const exists=(await db.query("SELECT name FROM import_batches WHERE name='observed-2026-09'")).rows.length;if(exists)return {alreadyImported:true};
 if(Number((await db.query('SELECT count(*) n FROM clients')).rows[0].n)||Number((await db.query('SELECT count(*) n FROM movements')).rows[0].n))throw Error('La importación requiere clientes y caja vacíos para evitar duplicados. Usá una base NUEVA.');
 return db.transaction(async c=>{
 const clientMap=new Map(),professionals=(await c.query('SELECT * FROM professionals')).rows,services=(await c.query('SELECT * FROM services')).rows,methods=(await c.query('SELECT * FROM payment_methods')).rows;
 for(const row of data.clients){const [name,ruc,phone,email]=row.map(v=>v==='—'?null:v);const r=(await c.query('INSERT INTO clients(name,ruc,phone,email) VALUES($1,$2,$3,$4) RETURNING id',[name,ruc,phone,email])).rows[0];const list=clientMap.get(name.trim())||[];list.push(r.id);clientMap.set(name.trim(),list);}
 const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];let ambiguous=0;
 for(const a of data.appointments){const match=a.date.match(/, (\d+) de (\w+) de (\d+)/);if(!match)throw Error('Fecha no reconocida');const date=`${match[3]}-${String(months.indexOf(match[2])+1).padStart(2,'0')}-${match[1].padStart(2,'0')}`;const ids=clientMap.get(a.client.trim())||[],clientId=ids.length===1?ids[0]:null;if(!clientId)ambiguous++;
 const pro=professionals.find(p=>p.name===a.professional),service=services.find(s=>s.name===a.service&&s.category===a.category);if(!pro||!service)throw Error('Catálogo no encontrado');
 await c.query('INSERT INTO appointments(client_id,source_client_name,professional_id,service_id,date,time,status,price,commission,source_payment) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9)',[clientId,a.client,pro.id,service.id,date,a.time,a.status,amount(a.price),a.payment||null]);
 if(service.price===null){await c.query('UPDATE services SET price=$1 WHERE id=$2',[amount(a.price),service.id]);service.price=amount(a.price);}
 }
 for(const r of data.movements){const [kind,description,method,gross,net]=r.cells;const payment=methods.find(m=>m.name.toLowerCase()===method.toLowerCase());if(!payment)throw Error('Método no reconocido: '+method);
 const type=kind==='Apertura'?'apertura':kind==='Egreso'?'egreso':description.includes('— Venta:')?'venta_producto':description.includes(' / ')?'servicio':'ingreso';
 await c.query('INSERT INTO movements(date,type,description,method,gross,net) VALUES($1,$2,$3,$4,$5,$6)',[r.date,type,description,payment.id,amount(gross==='—'?'0':gross),amount(net)]);
 }
 await c.query("INSERT INTO import_batches(name) VALUES('observed-2026-09')");return {clients:data.clients.length,appointments:data.appointments.length,movements:data.movements.length,ambiguousClientLinks:ambiguous};
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const db=await connect({demo:process.argv.includes('--demo')});try{console.log(await importObserved(db));}finally{await db.close();}}
