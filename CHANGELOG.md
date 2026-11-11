# Changelog

## [1.12] - 2026-11-10
### Añadido
- **LK POS** (nuevo módulo para restaurantes, gastrobares, cafeterías, bares, comida rápida y heladerías): mesas con estados automáticos, pedidos con notas/cantidades, tablero de cocina por estación, pedidos para llevar y domicilio, pagos parciales y mixtos, propina e impuesto configurables, descuentos con autorización, dividir/mover/unir cuentas, cancelación y reembolso con motivo, caja con apertura, retiros, arqueo y diferencias, menú con recetas/inventario, mermas, alertas de stock y reportes (ventas, productos, meseros, métodos de pago, propinas, caja, mermas).
- **Conexión entre módulos**: al cerrar una cuenta se crean la venta y los pagos en Comercial/Finanzas, se descuenta el inventario (una sola vez al enviar a cocina) y se registra el cliente si se asignó. Las ventas y pagos del POS están protegidos contra edición en otros módulos.
- **Multisector real**: 51 actividades con buscador, módulos recomendados por actividad, ocultar módulos no aplicables sin borrar datos, cambio de actividad con modo recomendado/personalizado.
- **Internacional**: buscador de países y monedas, formatos de fecha/hora/moneda por perfil, impuestos configurables por negocio.
- **Equipo y permisos**: roles (administrador, gerente, empleado, mesero, cajero, cocina), inicio de sesión opcional con PIN (hash con sal), menús y acciones según rol.
- **Citas**: vista de calendario, reprogramación, asignación equilibrada de profesionales y control de choques.
- **Cola de WhatsApp** (sin proveedor): recordatorios 24 h y 4 h, liberación de turno a los 30 min solo tras un envío real, apertura manual vía wa.me. No hay envío automático (ver PENDIENTES.md).
- Logo del negocio, temas ámbar e índigo, tema POS propio.
- Esquema de datos 5 con migración desde 1.11 sin pérdida de datos.
- 24 pruebas nuevas (15 de lógica POS/automatización, 4 de navegador, más ajustes).

### Corregido
- Condición de carrera del indicador «Guardado» (podía mostrarse antes de terminar de sincronizar).
- Avisos emergentes que tapaban botones y perdían clics.
- Pedido abierto de un usuario visible al cambiar de usuario.
- Actividad del perfil mal derivada al migrar perfiles antiguos.
- Turnos liberados seguían generando choques de agenda.
- Marca visible: «LK ONE».
- Pruebas de navegador: se bloquea la red externa y se cierran pestañas externas (wa.me).

### Alcance y transparencia
- Beta local de un solo negocio. El inicio con PIN es protección local básica, **no** autenticación de servidor.
- No hay WhatsApp real, facturación fiscal, pagos en línea ni multiempresa. Ver PENDIENTES.md.

## [1.11] - 2026-11-10
### Añadido
- Marca visible de la aplicación actualizada a **LK ONE**.
- Nueva actividad adaptable: belleza, peluquerías, barberías y spas, con módulos recomendados para agenda, CRM, servicios, finanzas, marketing e informes.
- Personalización visual guardada en el perfil: cinco temas de color, cuatro opciones tipográficas, tres tamaños de texto y tres estilos de bordes.
- Migración compatible de perfiles anteriores con valores visuales predeterminados.

# Changelog

## [1.10] - 2026-11-10
### Añadido
- Centro de automatizaciones con cinco flujos configurables: recordatorios de citas, seguimiento posventa, cumpleaños, alertas de inventario y bienvenida a nuevos clientes.
- Activación/desactivación de reglas persistida en la base de datos y pruebas simuladas que no contactan clientes.
- Acceso directo a WhatsApp desde la ficha/listado de clientes con mensaje inicial prellenado (apertura manual; no es envío automático ni integración API).
- Módulo de reportes con ventas, recaudo, cartera, valor de inventario, atención de citas y servicios más solicitados.
- Accesos rápidos a automatizaciones y reportes desde el panel.
- Migración compatible: preferencias de automatización se agregan al perfil de datos existente.

### Alcance y transparencia
- La versión sigue siendo una beta local de demostración. No incorpora todavía autenticación, multi-tenant real, roles, envío automático WhatsApp, pagos en línea ni sincronización externa.
- Los indicadores son operativos y no constituyen contabilidad o reportes fiscales certificados.

## [1.06] - 2026-11-04
### Añadido
- **Backend local** (`server.js`, sin dependencias): API `GET/PUT /api/db` con control de revisión (detecta dos pestañas editando), escritura atómica en `data/lukaris.json`, 14 copias diarias, y API de adjuntos `/api/files`. Solo escucha en localhost y valida Host/Origin; CSP estricta.
- **Guardado**: indicador en la barra superior, copia en el navegador, reintento automático sin conexión y migración de los datos locales existentes al servidor la primera vez. Sin servidor la app sigue funcionando en modo navegador.
- **Adjuntos en clientes y citas** (jpg, png, gif, webp, pdf, Office, csv, txt; 10 MB): al crear/editar, desde la ficha, abrir, descargar y quitar. La ficha del cliente muestra también los archivos de sus citas. Se borran junto con el cliente o la cita.
- **Formularios nuevos**: validación en línea con mensajes por campo, aviso de choque de horarios, precio automático por servicio, saldo precargado en abonos, menú «Nuevo registro».
- **Editar y eliminar** en clientes, citas, servicios, productos, operaciones, cotizaciones pendientes, ventas, pagos y empresas/sucursales, con confirmación y protección de registros con historial. Ventas se **anulan** (devuelven stock) en vez de borrarse.
- Fichas de cita y de cliente (con citas, cambio rápido de estado y accesos «+ Cita/+ Cotización/+ Venta»); filtros por texto, estado y fecha; CSV de citas y productos.
- Respaldo JSON con adjuntos incluidos; importación valida y restaura también los archivos. Restablecer datos exige escribir BORRAR.
- `core.js` con la lógica pura y esquema de datos 4 (migra 0.4 y 1.05).
- Pruebas: lógica, API, y navegador real (flujo completo, dos pestañas, modo sin servidor, barrido de todos los botones).
### Corregido
- **Los formularios no guardaban**: `onsubmit="submit(...)"` en línea se resolvía como `form.submit`. Ahora todo usa eventos delegados (sin manejadores en línea).
- Botones con clase inexistente (`btn small`) sin estilo; fechas calculadas en UTC (cambiaban de día por la tarde en zonas con UTC negativo); ids basados en `Date.now()` que podían repetirse; `prompt()/alert()` reemplazados por formularios y avisos.
- El primer arranque con servidor ya no deja la app sin los datos de demostración.
### Sin cambios (a propósito)
- Misma clave de `localStorage` (`lukaris-beta-v02`); los datos de 1.05 se migran automáticamente.

## [1.05] - 2026-11-02
### Añadido
- Ficha de cliente: cotizaciones, ventas, pagos y saldo por cliente.
- Búsqueda de clientes por nombre, teléfono o correo.
- Exportación CSV de clientes, ventas y pagos (compatible con Excel, con protección contra inyección de fórmulas).
- Aviso de respaldo en el resumen cuando nunca se respaldó o pasaron 7 días; se registra la fecha del último respaldo.
- Solicitud de almacenamiento persistente al navegador para reducir el riesgo de borrado.
- Respaldos con `appVersion` y `schemaVersion` 3; se rechazan respaldos de una versión más nueva.
- Proyecto separado en `index.html`, `styles.css` y `app.js`; pruebas automáticas (`npm test`) y CI en GitHub Actions.
### Corregido
- Nombres de cliente y servicio se escapan al mostrarse en listas (evita HTML inyectado desde datos guardados o importados).
- El guardado en `localStorage` ya no rompe la app si el navegador lo bloquea.
- Al cargar, el perfil guardado ya no se sobrescribe con idioma, tipo de cuenta y zona horaria por defecto (`Object.assign` copiaba el perfil sobre sí mismo).
- El formato de moneda usa el idioma y la moneda del perfil en vez de `es-CO` fijo; admite decimales.
### Sin cambios (a propósito)
- Misma clave de `localStorage` (`lukaris-beta-v02`): los datos de la beta 0.4 siguen funcionando.
- Sigue siendo un prototipo local de un solo perfil, sin backend.

## [0.4] - Núcleo comercial y financiero
Cotizaciones, ventas, abonos, cuentas por cobrar, movimientos de inventario y descuento automático de stock.

## [0.3]
Onboarding adaptativo, configuración internacional, empresas/sucursales locales, planes de referencia y respaldo JSON.
