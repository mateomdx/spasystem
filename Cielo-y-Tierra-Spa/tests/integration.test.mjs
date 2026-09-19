import test from 'node:test';
import assert from 'node:assert/strict';
import {connect} from '../database.mjs';
import {createApp} from '../server.mjs';
import {importObserved} from '../db/import-observed.mjs';
test('PostgreSQL: autenticación, clientes, citas, caja, stock, paquetes y exportación',async()=>{
 const db=await connect({memory:true}),app=await createApp(db,{demo:true});await new Promise(r=>app.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.address().port}/api`;let cookie='';
 const request=async(p,method='GET',body)=>{const r=await fetch(base+p,{method,headers:{'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});if(p==='/login'&&r.ok)cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};};
 try{
 assert.equal((await request('/me')).status,401);
 assert.equal((await request('/login','POST',{email:'demo@localhost',password:'incorrecta'})).status,401);
 assert.equal((await request('/login','POST',{email:'demo@localhost',password:'SpaDemo-2026!'})).status,200);
 const client=(await request('/clients','POST',{name:'Cliente de prueba',ruc:'1234567-8',email:'prueba@example.com'})).data;assert.ok(client.id);
 const catalog=(await request('/catalogs')).data;assert.equal(catalog.services.length,54);assert.equal(catalog.professionals.length,4);assert.equal(catalog.products.length,9);
 const service=catalog.services.find(s=>s.name==='Masaje Relajante'&&s.category==='Damas');const appointment={client_id:client.id,professional_id:catalog.professionals[0].id,service_id:service.id,date:'2026-09-19',time:'10:00'};
 const a=(await request('/appointments','POST',appointment)).data;assert.ok(a.id);
 const listing=await request('/appointments?from=2026-09-01&to=2026-09-30');assert.equal(listing.status,200);assert.equal(listing.data.length,1);
 assert.equal((await request('/appointments','POST',appointment)).status,409);
 assert.equal((await request('/appointments/'+a.id,'PUT',{status:'confirmada'})).status,200);
 assert.equal((await request('/appointments/'+a.id+'/complete','POST',{payments:[{method:'efectivo',gross:1}]})).status,400);
 assert.equal((await request('/appointments/'+a.id+'/complete','POST',{payments:[{method:'efectivo',gross:100000},{method:'transferencia',gross:50000}]})).status,200);
 assert.equal((await request('/appointments/'+a.id+'/complete','POST',{payments:[{method:'efectivo',gross:150000}]})).status,400);
 const product=catalog.products.find(p=>p.stock===3);const sales={date:'2026-09-19',product_id:product.id,quantity:2,price:100000,method:'efectivo'};
 assert.equal((await request('/sales','POST',sales)).status,200);
 assert.equal((await request('/sales','POST',sales)).status,400);
 assert.equal(Number((await db.query('SELECT stock FROM products WHERE id=$1',[product.id])).rows[0].stock),1);
 const tpl=(await db.query('INSERT INTO package_templates(name,service_id,sessions,price) VALUES($1,$2,$3,$4) RETURNING *',['Prueba',service.id,2,250000])).rows[0];
 const pkg=(await request('/packages','POST',{template_id:tpl.id,client_id:client.id,paid:100000,date:'2026-09-19',method:'efectivo'})).data;assert.ok(pkg.id);
 assert.equal((await request('/package-payments','POST',{package_id:pkg.id,gross:200000,date:'2026-09-19',method:'efectivo'})).status,400);
 assert.equal((await request('/package-payments','POST',{package_id:pkg.id,gross:150000,date:'2026-09-19',method:'efectivo'})).status,200);
 const pa=(await request('/appointments','POST',{...appointment,time:'12:00',package_id:pkg.id})).data;assert.ok(pa.id);
 await request('/appointments/'+pa.id,'PUT',{status:'confirmada'});assert.equal((await request('/appointments/'+pa.id+'/complete','POST',{})).status,200);
 const packages=(await request('/packages')).data;assert.equal(Number(packages[0].sessions_used),1);
 assert.equal((await request('/appointments/'+a.id+'/incident','POST',{description:'Incidencia de prueba'})).status,200);
 const k=(await request('/dashboard?date=2026-09-19')).data;assert.equal(Number(k.balance),600000);assert.equal(Number(k.clients),1);
 assert.equal((await request('/movements?from=2026-09-01&to=2026-09-30')).status,200);
 const report=(await request('/reports?from=2026-09-01&to=2026-09-30')).data;assert.equal(Number(report.total.count),2);
 const x=await fetch(base+'/export.xlsx?from=2026-09-01&to=2026-09-30',{headers:{Cookie:cookie}});assert.equal(x.status,200);assert.ok((await x.arrayBuffer()).byteLength>3000);
 assert.equal((await request('/clients/'+client.id,'DELETE')).status,200);assert.equal(Number((await request('/clients')).data.total),0);
 }finally{await new Promise(r=>app.close(r));await db.close();}
});
test('Importación observada: 336 clientes, 120 citas, 150 movimientos y saldo conciliado',async()=>{
 const db=await connect({memory:true});try{
 const result=await importObserved(db);assert.equal(result.clients,336);assert.equal(result.appointments,120);assert.equal(result.movements,150);assert.equal(result.ambiguousClientLinks,3);
 assert.equal((await importObserved(db)).alreadyImported,true);
 const k=(await db.query("SELECT sum(CASE WHEN type='egreso' THEN -net ELSE net END) balance,sum(net) FILTER (WHERE type NOT IN ('egreso','apertura')) income,sum(net) FILTER (WHERE type='egreso') expenses FROM movements")).rows[0];
 assert.equal(Number(k.balance),20046362);assert.equal(Number(k.income),19714950);assert.equal(Number(k.expenses),8699122);
 assert.equal(Number((await db.query("SELECT count(*) n FROM appointments WHERE status='completada'")).rows[0].n),115);
 assert.equal(Number((await db.query("SELECT count(*) n FROM movements WHERE type='venta_producto'")).rows[0].n),2);
 assert.equal(Number((await db.query('SELECT count(*) n FROM appointments WHERE client_id IS NULL')).rows[0].n),3);
 }finally{await db.close();}
});
