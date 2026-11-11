# LK ONE 1.12 · Resumen técnico

## Stack
JavaScript puro, sin dependencias, Node ≥18 para el backend local. No se migró el stack (regla del proyecto).

## Módulos
- UMD sin DOM (navegador, servidor y pruebas): `catalog.js`, `core.js`, `pos-core.js`, `automation-core.js`.
- Scripts clásicos de interfaz: `app.js`, `pos-ui.js` (comparten ámbito global; el arranque ocurre en DOMContentLoaded).
- `server.js`: API `GET/PUT /api/db` con `baseRev` (409 en conflicto), escritura atómica, 14 copias diarias, adjuntos, solo 127.0.0.1.

## Datos
Un documento `db` (esquema 7) con migración desde esquemas anteriores. Ids por `meta.nextId`. Espejo en `localStorage` (`lukaris-beta-v02`) e IndexedDB para adjuntos sin servidor. Sondeo `Store.pull()` cada 6 s en la pantalla POS.

## Reglas clave del POS
Stock descontado una vez por línea al enviar a cocina (`stockDone`); venta y pagos creados al cerrar; reembolso crea pagos negativos y anula la venta; impuesto y propina fijados por pedido; un turno de caja abierto; permisos verificados en `pos-core` mediante `actor`.

## Seguridad
Escapado `esc()` de todo dato pintado, CSP estricta, sin `on*=`, CSV neutralizado. PIN con sal y SHA-256 iterado: protección local, no autenticación de servidor.

## Propuesta de arquitectura para producción
API con autenticación (sesiones/JWT), PostgreSQL con `tenant_id`, tablas por entidad en vez de documento único, WebSocket/SSE para cocina, cola de trabajos para WhatsApp (Cloud API + webhook), almacenamiento de objetos para adjuntos. La lógica pura de los módulos UMD se reutiliza en el servidor.
