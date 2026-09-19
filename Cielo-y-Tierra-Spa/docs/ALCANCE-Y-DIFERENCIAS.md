# Alcance y diferencias respecto del original

## Qué se pudo verificar

Se inspeccionaron Inicio, Agenda (día, semana y lista), Clientes, Caja (diaria y mensual), Inventario, Paquetes y Reportes. Se abrieron formularios de cliente, cita común, sesión de paquete, reprogramación, incidencia, movimiento, venta de producto, venta de paquete, pago de cuota y edición de producto. No se guardaron altas, ventas, cambios ni eliminaciones en el sistema original.

El logo y la hoja de estilos fueron descargados desde los recursos visibles de la propia aplicación. Las referencias HTML conservan el contenido renderizado del área principal. La aplicación funcional usa ese CSS y una estructura reconstruida; no se certifica igualdad píxel por píxel. Sus iconos y algunos controles, mensajes, fechas y disposiciones pueden diferir.

## Lo que impide certificar una copia exacta

| Área | Limitación concreta | Qué falta para cerrarla |
| --- | --- | --- |
| Código original | La navegación no entrega el backend ni los componentes fuente | Repositorio o copia de archivos de la aplicación |
| PostgreSQL original | No se accedió a tablas, índices, funciones, triggers o migraciones reales | Exportación de esquema y datos, preferiblemente `pg_dump` |
| Permisos | Solo fue visible «Prof. Avanzado» | Matriz de roles y pantallas de administrador/otros perfiles |
| Servicios | 54 nombres; solo se recuperaron precios visibles en citas | Tarifario completo, duraciones y comisión por profesional/servicio |
| Comisiones | Se observaron totales por profesional/servicio, no la comisión de cada cita | Reglas y detalle contable original |
| Paquetes | No había paquetes ni plantillas configuradas visibles | Ejemplos reales, vigencia, composición, cancelación y reglas de uso |
| Historial | Se copió septiembre visible; la apertura contiene saldo arrastrado de agosto | Historial completo anterior y cualquier otro período |
| Clientes | Solo columnas del listado; no se recorrió cada ficha de edición | Nacimiento, notas, identificadores originales y campos adicionales |
| Asociación de clientes | «Ana Simon» aparece dos veces | Identificador original para resolver tres citas ambiguas |
| Caja-cita | No se ve el identificador que relaciona cada movimiento y cita | Claves foráneas originales; importación conserva filas sin inventar asociaciones |
| Exportaciones | Excel nuevo y PDF mediante impresión | Archivos de ejemplo para reproducir exactamente sus plantillas |
| Autenticación | Implementación local nueva | Proveedor original, recuperación, roles y políticas completas |

## Decisiones de implementación explícitas

- El esquema SQL es reconstruido. Los nombres de tablas no se presentan como los originales.
- IDs nuevos locales. Tres citas con cliente homónimo conservan `source_client_name` y `client_id = NULL` hasta resolver la asociación.
- Los 150 movimientos conservan los importes brutos/netos observados. La apertura de Gs. 9.030.534 incrementa el saldo acumulado pero no los ingresos del mes.
- La clasificación «Servicio» usa el concepto visible con categoría/tratamiento; «Venta producto» usa el concepto «— Venta:». No se infieren vínculos a citas por nombre.
- Tarjetas: tasas iniciales inferidas de ejemplos de 2,2% y 3,3%. También existen movimientos sin descuento. La condición que exime comisiones no pudo verificarse. Esas excepciones deben adaptarse antes de sustituir el sistema original.
- Voucher: nuevos cobros registran caja con importe cero y mantienen el precio de la cita. Esa representación se observó en la caja original.
- La comisión de citas importadas queda nula; los reportes dinámicos muestran «Pendiente de verificar». La referencia estática conserva Gs. 8.295.000 y su desglose exacto observado.
- Alta de cita requiere un precio configurado. Los precios no vistos permanecen nulos, en lugar de inventarlos.
- Se bloquea el mismo profesional/fecha/hora. La prevención de solapamientos por duración, cabinas y recursos no fue verificable.
- Los estados operativos usados son pendiente, confirmada, completada y cancelada. Los efectos de completar/cancelar se reconstruyeron; no se probaron guardando en producción.
- Baja de clientes lógica. La forma exacta de eliminación del original no se verificó.
- Los paquetes se reconstruyeron con un tratamiento por plantilla. Si el original permite composiciones mixtas, se requiere ampliar el modelo.
- La interfaz administrativa para crear profesionales, tratamientos y plantillas no fue inventada como si hubiera sido observada; por ahora se configuran mediante SQL.
- Cambio de contraseña y login locales funcionan, pero sus formularios no son una copia certificada del flujo original.
- «PDF» abre impresión/guardar PDF del navegador. «Excel» genera `.xlsx` con los datos del período, sin afirmar igualdad con la plantilla original.

## Validación realizada

Dos pruebas integrales reproducibles en PGlite: operaciones y conciliación de importación. Lectura real de todas las páginas locales mediante el navegador; se comprobaron los contadores de inicio, 336 clientes, citas por fecha, alertas de inventario, filtros de paquetes y resúmenes de caja. Se cotejaron los importes mensuales y saldo contra lo visible en el original.

La captura de pantalla del navegador local falló por tiempo de espera; se verificó la estructura y contenido mediante DOM. No se afirma una comparación visual automatizada ni igualdad de píxeles. La conexión a un servicio PostgreSQL nativo debe probarse en el equipo de destino.

Esta entrega deja un proyecto funcional y evidencia concreta para completar la equivalencia. Para concluir una réplica exacta falta contrastar los elementos anteriores con el repositorio y la base originales.
