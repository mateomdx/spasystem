# Cielo y Tierra Spa — reconstrucción local

Proyecto ejecutable de los siete módulos visibles del perfil **Prof. Avanzado**, preparado a partir de la interfaz de `spa.cieloytierra.com.py` observada el 19 de septiembre de 2026.

**No es el código fuente original ni una réplica 1:1 certificada.** Incluye una implementación funcional, PostgreSQL, el logo y CSS originales, datos visibles importables y referencias HTML del sistema. Las reglas internas, permisos de otros perfiles y campos no expuestos por la interfaz no pudieron recuperarse. El detalle está en `docs/ALCANCE-Y-DIFERENCIAS.md`.

## Probar en Windows

1. Extraer el ZIP completo.
2. Tener Node.js 22 o posterior instalado.
3. Abrir `INICIAR-DEMO.cmd`. La primera ejecución instala las dependencias con `npm ci`.
4. Entrar en **http://localhost:3000**.
5. Usuario: **demo@localhost**. Contraseña: **SpaDemo-2026!**.

La demo importa automáticamente los datos observados en una base PostgreSQL embebida PGlite ubicada en `data/demo`. No se conecta al sistema original. Sus cambios persisten entre ejecuciones. Para detenerla: Ctrl+C en la consola.

Alternativa desde terminal:

```sh
npm ci
npm run demo
```

## PostgreSQL local

1. Crear una **base nueva**, por ejemplo `spa_replica`, y un usuario con acceso a ella. No apuntar a la base original: el arranque ejecuta el esquema de esta reconstrucción.
2. Copiar `.env.example` a `.env`.
3. Configurar `DATABASE_URL`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` (mínimo 12 caracteres). El email y la contraseña de la aplicación original no fueron copiados.
4. Ejecutar:

```sh
npm ci
node --env-file=.env db/import-observed.mjs
npm start
```

El importador crea las tablas y carga lo observado; requiere que clientes y caja estén vacíos. Es transaccional y registra una marca para evitar repetir la importación. Si se desea empezar sin históricos, omitir el comando de importación y ejecutar solamente `npm start`.

También se incluye `compose.yaml` para iniciar PostgreSQL mediante Docker. Definir `POSTGRES_PASSWORD` en `.env`, ejecutar `docker compose up -d` y usar esa misma contraseña en `DATABASE_URL`.

## Contenido

- **Inicio:** citas de hoy, saldo de caja, clientes activos y profesionales.
- **Agenda:** día por hora/profesional, semana, lista, alta, estados, reprogramación, incidencias, cobro y enlace de recordatorio por WhatsApp.
- **Clientes:** búsqueda, paginación de 50, alta, edición y baja lógica.
- **Caja:** movimientos diarios, resumen mensual, ingresos/egresos, métodos de pago, ventas de productos y cobros de paquetes.
- **Inventario:** existencias, mínimos, alertas, ajustes y edición de precios/comisiones.
- **Paquetes:** estados, cuotas, ventas, sesiones y detalle reconstruido.
- **Reportes:** períodos, citas completadas, comisiones verificables, Excel real `.xlsx` e impresión/guardar como PDF.
- **Cuenta:** inicio/cierre de sesión, cambio de contraseña local y tema claro/oscuro.

## Datos conservados

| Dato | Cobertura |
| --- | --- |
| Clientes | 336 filas del listado: nombre, RUC, teléfono y email visibles |
| Citas | 120 citas de septiembre: 115 completadas, 3 canceladas y 2 pendientes |
| Movimientos | 150 filas de caja del 1 al 19 de septiembre, con bruto/real literal |
| Profesionales | 4 nombres visibles |
| Tratamientos | 54 nombres por categoría; precios visibles cuando existían |
| Productos | 9 productos con valores visibles |
| Paquetes | Listado original vacío |
| Referencias visuales | 10 pantallas HTML con el CSS original |

Las notas y fechas de nacimiento de los clientes no se extrajeron individualmente. Las comisiones por cita no eran visibles: el programa las muestra como pendientes de verificar cuando faltan. El informe original con sus totales conocidos está conservado en `docs/reference/reportes.html` y en `observed.json`; no se inventaron tarifas individuales para forzar esos totales.

## Configurar datos internos pendientes

La cuenta observada no exponía administración de servicios, profesionales ni plantillas de paquetes. Estas tablas se pueden mantener en PostgreSQL mediante el gestor de base de datos que utilices. Ejemplos orientativos, para adaptar con los valores reales:

```sql
SELECT id, name, category, price, commission FROM services ORDER BY category,name;
-- Reemplazar los valores y el identificador por los confirmados:
-- UPDATE services SET price = 200000, commission = 60000 WHERE id = ...;

SELECT * FROM payment_methods;
-- Las tasas iniciales de débito 2,2% y crédito 3,3% se infieren de ejemplos visibles.
-- Existen movimientos originales sin deducción: revisar las excepciones originales.

SELECT * FROM package_templates;
-- INSERT INTO package_templates(name,service_id,sessions,price)
-- VALUES ('Nombre real', ID_SERVICIO, NUMERO_SESIONES, PRECIO_TOTAL);
```

## Verificación

```sh
npm test
```

Se prueban autenticación, validaciones, clientes, bloqueo de un mismo horario, cobros divididos, no duplicar cobros, stock, cuotas, sesiones, incidencias, consultas y Excel. Otra prueba importa los datos observados y concilia cantidades y caja. Las pruebas usan el motor PostgreSQL embebido PGlite. No había un servicio PostgreSQL nativo disponible en este equipo para probar una conexión externa real.

Totales conciliados: saldo **Gs. 20.046.362**, ingresos del mes **Gs. 19.714.950**, egresos **Gs. 8.699.122**, balance del mes **Gs. 11.015.828**.

## Estructura

```text
server.mjs                   Servidor HTTP, autenticación y API
domain.mjs                   Operaciones transaccionales
database.mjs                 Adaptadores PostgreSQL/PGlite
db/schema.sql                Esquema reconstruido
db/seed.mjs                  Catálogos observados
db/import-observed.mjs       Importación del relevamiento
public/                     Interfaz y recursos visuales
docs/RELEVAMIENTO.md         Especificación funcional y visual
docs/ALCANCE-Y-DIFERENCIAS.md Brechas y decisiones pendientes
docs/reference/index.html   Galería de pantallas originales observadas
docs/reference/observed.json Datos de referencia conservados
tests/                      Pruebas reproducibles
```

El servidor escucha únicamente en localhost por defecto. Esta entrega contiene datos reales visibles del sistema solicitado. Las referencias son capturas estáticas; la aplicación funcional se inicia con Node.js.
