import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {connect} from './database.mjs';
import {assert,num,text,date,get,movement,createAppointment,sale,packageSale,packagePayment,complete} from './domain.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
export const hash=p=>{const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(p,salt,64).toString('hex');};
function verify(p,h){const [s,v]=h.split(':');const a=Buffer.from(v,'hex'),b=scryptSync(p,s,64);return a.length===b.length&&timingSafeEqual(a,b);}
export async function createApp(db,{demo=false}={}){
 const existing=(await db.query('SELECT id FROM users LIMIT 1')).rows.length;
 if(!existing){const pw=process.env.ADMIN_PASSWORD||(demo?'SpaDemo-2026!':null);assert(pw&&pw.length>=12,'Configurá ADMIN_PASSWORD (mínimo 12 caracteres)');await db.query('INSERT INTO users(email,password_hash) VALUES($1,$2)',[process.env.ADMIN_EMAIL||(demo?'demo@localhost':'admin@localhost'),hash(pw)]);}
 const attempts=new Map();
 return http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),p=url.pathname,q=url.searchParams;
  const send=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v));};
  try{
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
   if(!p.startsWith('/api/')){assert(['GET','HEAD'].includes(req.method),'Método inválido',405);const rel=p.startsWith('/assets/')||p==='/app.js'||p==='/app.css'?p.slice(1):'index.html';const file=path.resolve(root,'public',rel);assert(file.startsWith(path.resolve(root,'public')+path.sep),'Ruta inválida',404);const data=await readFile(file);res.setHeader('Content-Type',({'html':'text/html; charset=utf-8','css':'text/css; charset=utf-8','js':'text/javascript; charset=utf-8','webp':'image/webp','svg':'image/svg+xml'})[path.extname(file).slice(1)]||'application/octet-stream');res.end(data);return;}
   let b={};if(!['GET','HEAD'].includes(req.method)){if(req.headers.origin)assert(req.headers.origin===`http://${req.headers.host}`,'Origen inválido',403);let body='';for await(const chunk of req){body+=chunk;assert(body.length<100000,'Solicitud demasiado grande',413);}b=body?JSON.parse(body):{};}
   const cookie=(req.headers.cookie||'').match(/(?:^|;\s*)spa_session=([a-f0-9]+)/)?.[1];
   if(p==='/api/login'&&req.method==='POST'){
    const key=req.socket.remoteAddress,entry=attempts.get(key)||{n:0,t:Date.now()};if(Date.now()-entry.t>600000){entry.n=0;entry.t=Date.now();}assert(entry.n<20,'Demasiados intentos. Esperá 10 minutos.',429);entry.n++;attempts.set(key,entry);
    const user=(await db.query('SELECT * FROM users WHERE email=$1',[b.email])).rows[0];assert(user&&typeof b.password==='string'&&verify(b.password,user.password_hash),'Email o contraseña incorrectos',401);attempts.delete(key);
    const token=randomBytes(32).toString('hex');await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '12 hours')",[token,user.id]);res.setHeader('Set-Cookie',`spa_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);send({ok:true});return;
   }
   const user=cookie?(await db.query('SELECT u.id,u.email,u.role FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=$1 AND s.expires_at>now()',[cookie])).rows[0]:null;assert(user,'Iniciá sesión',401);
   if(p==='/api/me'){send({...user,demo});return;}
   if(p==='/api/logout'&&req.method==='POST'){await db.query('DELETE FROM sessions WHERE token=$1',[cookie]);res.setHeader('Set-Cookie','spa_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');send({ok:true});return;}
   if(p==='/api/password'&&req.method==='POST'){const u=await get(db,'users',user.id);assert(typeof b.current==='string'&&verify(b.current,u.password_hash),'Contraseña actual incorrecta');assert(typeof b.password==='string'&&b.password.length>=12,'Mínimo 12 caracteres');await db.transaction(async c=>{await c.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hash(b.password),u.id]);await c.query('DELETE FROM sessions WHERE user_id=$1 AND token<>$2',[u.id,cookie]);});send({ok:true});return;}
   if(req.method==='GET'){
    if(p==='/api/catalogs'){const out={};for(const name of ['professionals','services','products','payment_methods','package_templates'])out[name]=(await db.query(`SELECT * FROM ${name} ORDER BY ${name==='payment_methods'?'name':'id'}`)).rows;out.clients=(await db.query('SELECT id,name,ruc,phone,email FROM clients WHERE active=true ORDER BY name')).rows;send(out);return;}
    if(p==='/api/dashboard'){send((await db.query("SELECT (SELECT count(*) FROM appointments WHERE date=$1 AND status<>'cancelada') AS appointments,(SELECT COALESCE(sum(CASE WHEN type='egreso' THEN -net ELSE net END),0) FROM movements) AS balance,(SELECT count(*) FROM clients WHERE active=true) AS clients,(SELECT count(*) FROM professionals WHERE active=true) AS professionals",[date(q.get('date'))])).rows[0]);return;}
    if(p==='/api/clients'){const search='%'+(q.get('search')||'')+'%',page=Math.max(1,Number(q.get('page'))||1);const params=[search];const where='active=true AND (name ILIKE $1 OR phone ILIKE $1 OR ruc ILIKE $1)';const total=(await db.query(`SELECT count(*) FROM clients WHERE ${where}`,params)).rows[0].count;send({total,page,rows:(await db.query(`SELECT * FROM clients WHERE ${where} ORDER BY name,id LIMIT 50 OFFSET $2`,[search,(page-1)*50])).rows});return;}
    if(p==='/api/appointments'){send((await db.query('SELECT a.*,COALESCE(c.name,a.source_client_name) client,c.phone,s.name service,s.category,p.name professional,p.color,COALESCE((SELECT string_agg(pm.name,\' · \') FROM movements m JOIN payment_methods pm ON pm.id=m.method WHERE m.appointment_id=a.id),a.source_payment) payment FROM appointments a LEFT JOIN clients c ON c.id=a.client_id JOIN services s ON s.id=a.service_id JOIN professionals p ON p.id=a.professional_id WHERE a.date BETWEEN $1 AND $2 ORDER BY a.date,a.time,a.id',[date(q.get('from')),date(q.get('to'))])).rows);return;}
    if(p==='/api/packages'){send((await db.query('SELECT cp.*,c.name client,t.name package,s.name service,t.service_id FROM client_packages cp JOIN clients c ON c.id=cp.client_id JOIN package_templates t ON t.id=cp.template_id JOIN services s ON s.id=t.service_id ORDER BY cp.id DESC')).rows);return;}
    if(p==='/api/movements'){send((await db.query('SELECT m.*,pm.name method_name FROM (SELECT *,sum(CASE WHEN type=\'egreso\' THEN -net ELSE net END) OVER (ORDER BY date,id) balance FROM movements) m JOIN payment_methods pm ON pm.id=m.method WHERE date BETWEEN $1 AND $2 ORDER BY date,id',[date(q.get('from')),date(q.get('to'))])).rows);return;}
    if(p==='/api/reports'||p==='/api/export.xlsx'){
     const params=[date(q.get('from')),date(q.get('to'))];
     const total=(await db.query("SELECT count(*) AS count,count(*) FILTER (WHERE commission IS NULL) AS unverified,COALESCE(sum(commission),0) AS commission FROM appointments WHERE date BETWEEN $1 AND $2 AND status='completada'",params)).rows[0];
     const professionals=(await db.query("SELECT p.name,count(*) count,count(*) FILTER (WHERE a.commission IS NULL) unverified,sum(a.commission) commission FROM appointments a JOIN professionals p ON p.id=a.professional_id WHERE a.date BETWEEN $1 AND $2 AND a.status='completada' GROUP BY p.id,p.name ORDER BY count(*) DESC",params)).rows;
     const services=(await db.query("SELECT s.name,s.category,count(*) count,count(*) FILTER (WHERE a.commission IS NULL) unverified,sum(a.commission) commission FROM appointments a JOIN services s ON s.id=a.service_id WHERE a.date BETWEEN $1 AND $2 AND a.status='completada' GROUP BY s.id,s.name,s.category ORDER BY count(*) DESC",params)).rows;
     if(p.endsWith('.xlsx')){const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();book.creator='Cielo y Tierra Spa';for(const [name,rows] of [['Resumen',[total]],['Profesionales',professionals],['Servicios',services]]){const sh=book.addWorksheet(name);if(rows.length){sh.columns=Object.keys(rows[0]).map(k=>({header:k,key:k,width:k==='name'?50:24}));sh.addRows(rows);sh.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sh.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF6E4A9A'}};}}res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition','attachment; filename="reportes.xlsx"');res.end(Buffer.from(await book.xlsx.writeBuffer()));return;}send({total,professionals,services});return;
    }
   }
   const parts=p.split('/'),id=parts[3];
   const result=await db.transaction(async c=>{
    let r;
    if(p==='/api/clients'&&req.method==='POST'||parts[2]==='clients'&&id&&req.method==='PUT'){
     const name=text(b.name,'Nombre');assert(!b.ruc||/^\d+(?:-\d)?$/.test(b.ruc),'RUC inválido');assert(!b.email||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email),'Email inválido');
     const vals=[name,b.ruc||null,b.phone||null,b.email||null,b.birth_date||null,b.notes||null];
     r=id?(await c.query('UPDATE clients SET name=$1,ruc=$2,phone=$3,email=$4,birth_date=$5,notes=$6 WHERE id=$7 RETURNING *',[...vals,num(id,'ID',1)])).rows[0]:(await c.query('INSERT INTO clients(name,ruc,phone,email,birth_date,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',vals)).rows[0];
    }else if(parts[2]==='clients'&&id&&req.method==='DELETE'){await get(c,'clients',id);await c.query('UPDATE clients SET active=false WHERE id=$1',[id]);r={ok:true};}
    else if(parts[2]==='products'&&id&&req.method==='PUT'){await get(c,'products',id);r=(await c.query('UPDATE products SET name=$1,type=$2,stock=$3,minimum=$4,price=$5,commission_percent=$6 WHERE id=$7 RETURNING *',[text(b.name,'Nombre'),b.type||'',num(b.stock,'Stock'),num(b.minimum,'Mínimo'),num(b.price,'Precio'),num(b.commission_percent,'Comisión'),id])).rows[0];}
    else if(parts[2]==='products'&&parts[4]==='stock'&&req.method==='POST'){const product=(await c.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[id])).rows[0];assert(product,'Producto inexistente');assert([-1,1].includes(b.delta),'Ajuste inválido');assert(product.stock+b.delta>=0,'Stock insuficiente');await c.query('UPDATE products SET stock=stock+$1 WHERE id=$2',[b.delta,id]);await c.query('INSERT INTO stock_movements(product_id,delta,reason) VALUES($1,$2,$3)',[id,b.delta,'Ajuste manual']);r={ok:true};}
    else if(p==='/api/appointments'&&req.method==='POST')r=await createAppointment(c,b);
    else if(parts[2]==='appointments'&&id&&parts[4]==='complete'&&req.method==='POST')r=await complete(c,id,b);
    else if(parts[2]==='appointments'&&id&&parts[4]==='incident'&&req.method==='POST'){r=(await c.query('INSERT INTO incidents(appointment_id,description,user_id) VALUES($1,$2,$3) RETURNING *',[id,text(b.description,'Descripción'),user.id])).rows[0];}
    else if(parts[2]==='appointments'&&id&&req.method==='PUT'){const a=await get(c,'appointments',id);assert(!['completada','cancelada'].includes(a.status),'La cita ya finalizó');if(b.status){assert(['confirmada','cancelada'].includes(b.status),'Estado inválido');await c.query('UPDATE appointments SET status=$1 WHERE id=$2',[b.status,id]);}else{assert(/^([01]\d|20):(00|30)$/.test(b.time)&&b.time>='08:00'&&b.time<='20:00','Hora inválida');await c.query('UPDATE appointments SET date=$1,time=$2 WHERE id=$3',[date(b.date),b.time,id]);}r={ok:true};}
    else if(parts[2]==='appointments'&&id&&req.method==='DELETE'){const a=await get(c,'appointments',id);assert(a.status!=='completada','No se elimina una cita completada');await c.query('DELETE FROM incidents WHERE appointment_id=$1',[id]);await c.query('DELETE FROM appointments WHERE id=$1',[id]);r={ok:true};}
    else if(p==='/api/movements'&&req.method==='POST'){assert(['ingreso','egreso'].includes(b.type),'Tipo inválido');r=await movement(c,b);}
    else if(p==='/api/sales'&&req.method==='POST')r=await sale(c,b);
    else if(p==='/api/packages'&&req.method==='POST')r=await packageSale(c,b);
    else if(p==='/api/package-payments'&&req.method==='POST')r=await packagePayment(c,b);
    else throw Object.assign(Error('Ruta no encontrada'),{status:404});
    await c.query('INSERT INTO audit_log(user_id,action,entity,entity_id) VALUES($1,$2,$3,$4)',[user.id,req.method,parts[2],id?Number(id):r?.id||null]);return r;
   });send(result);
  }catch(e){const code=e.code==='23505'?409:e.code?.startsWith('23')?400:e.status||500;const message=e.code==='23505'?'Ya existe una cita para este profesional en ese horario.':e.code?.startsWith('23')?'El registro no cumple las restricciones de la base.':code===500?'No se pudo completar la operación. Revisá el registro del servidor.':e.message;if(code===500)console.error(e);send({error:message},code);}
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const demo=process.argv.includes('--demo');const db=await connect({demo});if(demo){const {importObserved}=await import('./db/import-observed.mjs');await importObserved(db);}const app=await createApp(db,{demo});const port=Number(process.env.PORT)||3000;app.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Cielo y Tierra Spa: http://localhost:${port}${demo?' | Demo: demo@localhost / SpaDemo-2026!':''}`));
}
