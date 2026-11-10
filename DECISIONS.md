# Decisiones y reglas de negocio (fuente única)

`AGENTS.md`, `CLAUDE.md` y `CODEX.md` apuntan a este archivo. Edita aquí, no en los tres.

## Decisiones estratégicas aprobadas
- Onboarding adaptativo: recomendar módulos según la actividad y permitir personalización.
- Administración dual: cuenta individual o grupo de empresas/sucursales.
- Modelo comercial global: planes por niveles y complementos, con localización por mercado.
- Mantener el desarrollo simple y local durante esta beta; no migrar el stack sin aprobación.
- Producto multi-sector e internacional; no limitarlo a barberías ni a un país.
- La marca del producto es LUKARIS.

## Reglas de negocio implementadas
- Las cotizaciones se crean con cliente, concepto, importe y vigencia; solo las pendientes pueden convertirse en venta.
- Una venta registra total, pago inicial, cliente y fecha. El pago inicial no puede superar el total.
- El saldo se deriva como `max(0, total - paid)`.
- Los abonos deben ser positivos y no superar el saldo pendiente.
- Los pagos registrados quedan en el historial de caja.
- Si una venta se asocia a un producto, el stock se descuenta y se registra un movimiento de salida.
- Los movimientos de inventario son Entrada, Salida o Ajuste; no se permiten salidas por encima del stock.
- La clave de `localStorage` (`lukaris-beta-v02`) no cambia: se preserva la compatibilidad con datos existentes.

## Reglas añadidas en 1.05
- Todo dato de usuario que se pinta en HTML pasa por `esc()` (incluye nombres de cliente y servicio).
- Los respaldos llevan `schemaVersion`; un respaldo de esquema más nuevo se rechaza.
- Los CSV neutralizan celdas que empiezan por `=`, `+`, `-` o `@` (inyección de fórmulas).
- El formato de moneda usa el idioma y la moneda del perfil, no constantes de un país.
- Cambios de versión: actualizar `APP_VERSION` en `app.js`, `README.md` y `CHANGELOG.md` (lo verifica `npm test`).

## Reglas añadidas en 1.06
- Backend local aprobado por el responsable del proyecto: Node sin dependencias, un negocio, sin autenticación, solo `127.0.0.1`. Multiempresa y usuarios siguen pendientes.
- Los datos se guardan primero en el navegador y se sincronizan con el servidor con control de revisión (`baseRev`); ante conflicto gana el servidor y la copia local queda en `lukaris-conflict-*`.
- Adjuntos solo para clientes y citas; lista blanca de extensiones, 10 MB por archivo, servidos con `nosniff` y `sandbox`; solo PDF, imágenes raster y texto se muestran en línea.
- Borrado: clientes, servicios y productos con historial no se eliminan. Ventas con pagos no se anulan hasta eliminar esos pagos; anular devuelve el stock. Eliminar un pago lo descuenta de la venta.
- Las existencias solo cambian por movimientos o ventas (la edición de producto no toca el stock).
- Fechas en zona horaria local del navegador, no UTC. Ids con contador `meta.nextId`.
- Sin manejadores `on*=` en línea (lo verifica `npm test`); toda acción pasa por `data-act`.
