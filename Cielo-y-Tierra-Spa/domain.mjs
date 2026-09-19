export function assert(ok,message,status=400){if(!ok){const e=Error(message);e.status=status;throw e;}}
export const num=(v,label,min=0)=>{const n=Number(v);assert(Number.isSafeInteger(n)&&n>=min,`${label}: valor inválido`);return n;};
export const text=(v,label)=>{assert(typeof v==='string'&&v.trim().length>0&&v.length<=10000,`${label} es obligatorio`);return v.trim();};
export const date=v=>{assert(/^\d{4}-\d{2}-\d{2}$/.test(v||'')&&!Number.isNaN(Date.parse(v)), 'Fecha inválida');return v;};
export async function get(db,table,id){const r=(await db.query(`SELECT * FROM ${table} WHERE id=$1`,[num(id,'ID',1)])).rows[0];assert(r,'Registro no encontrado',404);return r;}
export async function movement(db,b){
 const method=(await db.query('SELECT * FROM payment_methods WHERE id=$1',[b.method])).rows[0];assert(method,'Método de pago inválido');
 const requested=num(b.gross,'Monto'),gross=b.method==='voucher'?0:requested;const net=b.type==='egreso'?gross:Math.round(gross*(1-Number(method.fee_percent)/100));
 return (await db.query('INSERT INTO movements(date,type,description,method,gross,net,client_id,professional_id,appointment_id,package_id,product_id,quantity,commission) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',[date(b.date),b.type,b.description||'',b.method,gross,net,b.client_id||null,b.professional_id||null,b.appointment_id||null,b.package_id||null,b.product_id||null,b.quantity||null,b.commission||0])).rows[0];
}
export async function createAppointment(db,b){
 const client=await get(db,'clients',b.client_id);assert(client.active,'Cliente inactivo');
 await get(db,'professionals',b.professional_id);
 const service=await get(db,'services',b.service_id);assert(service.price!==null,'Precio del tratamiento pendiente de configurar en la base local');
 assert(/^([01]\d|20):(00|30)$/.test(b.time)&&b.time>='08:00'&&b.time<='20:00','Hora fuera del horario 08:00–20:00');
 let packageId=null;
 if(b.package_id){const p=(await db.query('SELECT * FROM client_packages WHERE id=$1 FOR UPDATE',[b.package_id])).rows[0];assert(p&&!p.cancelled&&String(p.client_id)===String(b.client_id),'Paquete inválido');const tpl=await get(db,'package_templates',p.template_id);assert(String(tpl.service_id)===String(service.id),'Tratamiento incompatible con el paquete');const reserved=(await db.query("SELECT count(*)::int n FROM appointments WHERE package_id=$1 AND status IN ('pendiente','confirmada')",[p.id])).rows[0].n;assert(Number(p.sessions_used)+reserved<Number(p.sessions_total),'No quedan sesiones disponibles');packageId=p.id;}
 return (await db.query('INSERT INTO appointments(client_id,professional_id,service_id,package_id,date,time,price,commission) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[b.client_id,b.professional_id,service.id,packageId,date(b.date),b.time,service.price,service.commission])).rows[0];
}
export async function sale(db,b){
 const product=(await db.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[b.product_id])).rows[0];assert(product,'Producto no encontrado');
 const quantity=num(b.quantity,'Cantidad',1),price=num(b.price,'Precio');assert(product.stock>=quantity,'Stock insuficiente');
 await db.query('UPDATE products SET stock=stock-$1 WHERE id=$2',[quantity,product.id]);
 await db.query('INSERT INTO stock_movements(product_id,delta,reason) VALUES($1,$2,$3)',[product.id,-quantity,'Venta']);
 return movement(db,{...b,type:'venta_producto',gross:quantity*price,description:product.name,quantity,commission:b.professional_id?Math.round(quantity*price*Number(product.commission_percent)/100):0});
}
export async function packageSale(db,b){
 const t=await get(db,'package_templates',b.template_id);assert(t.active,'Paquete inactivo');await get(db,'clients',b.client_id);
 const total=Number(t.price),paid=b.prepaid?total:num(b.paid,'Pago inicial');assert(paid<=total,'El pago supera el total');
 const p=(await db.query('INSERT INTO client_packages(client_id,template_id,total,paid,sessions_total,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[b.client_id,t.id,total,paid,t.sessions,b.notes||''])).rows[0];
 if(paid&&!b.prepaid)await movement(db,{...b,type:'paquete',gross:paid,package_id:p.id,description:`Paquete ${t.name}`});return p;
}
export async function packagePayment(db,b){
 const p=(await db.query('SELECT * FROM client_packages WHERE id=$1 FOR UPDATE',[b.package_id])).rows[0];assert(p&&!p.cancelled,'Paquete inválido');const amount=num(b.gross,'Pago',1);assert(amount<=Number(p.total)-Number(p.paid),'El pago supera el saldo pendiente');
 await db.query('UPDATE client_packages SET paid=paid+$1 WHERE id=$2',[amount,p.id]);return movement(db,{...b,type:'paquete',client_id:p.client_id,description:'Cuota de paquete'});
}
export async function complete(db,id,b){
 const a=(await db.query('SELECT * FROM appointments WHERE id=$1 FOR UPDATE',[id])).rows[0];assert(a&&a.status==='confirmada','Solo se completa una cita confirmada');
 if(a.package_id){await db.query('UPDATE client_packages SET sessions_used=sessions_used+1 WHERE id=$1',[a.package_id]);}
 else {assert(Array.isArray(b.payments)&&b.payments.length>0,'Seleccioná un pago');assert(b.payments.reduce((s,p)=>s+num(p.gross,'Monto'),0)===Number(a.price),'Los pagos deben sumar el precio de la cita');for(const p of b.payments)await movement(db,{...p,date:a.date instanceof Date?a.date.toISOString().slice(0,10):a.date,type:'servicio',description:'Cobro de servicio',client_id:a.client_id,professional_id:a.professional_id,appointment_id:a.id,commission:0});}
 await db.query("UPDATE appointments SET status='completada' WHERE id=$1",[id]);return {ok:true};
}
