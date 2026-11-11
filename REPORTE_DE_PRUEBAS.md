# LK ONE 1.12 · Reporte de pruebas

**Fecha:** 2026-11-10 · **Entorno:** Node (sin dependencias) + Chromium real vía Playwright · **Comando:** `npm test`
**Resultado final: 53 pruebas, 53 aprobadas, 0 fallidas, 0 omitidas.**

| Suite | Pruebas | Qué cubre |
|---|---|---|
| `core.test.js` | lógica general | validaciones, ventas, abonos, inventario, migración, CSV, respaldos |
| `pos.test.js` | 15 | SHA-256/PIN, actividades, mesas, pedidos, cocina, totales, pagos, dividir/mover/unir, caja, anulaciones, reportes, domicilio, roles, migración 1.11→1.12, automatización |
| `server.test.js` | API | revisión/409, escritura atómica, adjuntos, orígenes |
| `project.test.js` | proyecto | coherencia de versión, sin `on*=` inline, archivos |
| `e2e.test.js` | navegador | flujo completo con persistencia, dos pestañas, `file://`, barrido de todos los botones de todas las pantallas |
| `e2e-pos.test.js` | 4 | multisector/calendario, flujo POS completo y recarga, roles/PIN, móvil sin desbordamiento |

## Escenarios obligatorios del documento maestro
Cubiertos por las pruebas anteriores: cambio de actividad sin perder datos, módulos ocultos por actividad, país/moneda/formatos, mesa → pedido → cocina → cobro, inventario descontado una vez, pago parcial y mixto, división de cuenta, cierre de caja con diferencia, cancelación con motivo, reembolso, roles y permisos, PIN, persistencia tras recarga, sincronización entre pestañas, citas con choque y reprogramación, recordatorios idempotentes, liberación solo tras envío real, migración desde 1.11, vista móvil.

## Errores encontrados y corregidos
1. Indicador «Guardado» mostrado antes de terminar el sync (condición de carrera, ya existía en 1.11).
2. Avisos emergentes que interceptaban clics.
3. Pedido abierto visible tras cambiar de usuario.
4. Actividad mal derivada al migrar perfiles antiguos.
5. Turnos liberados seguían bloqueando la agenda.
6. Barrido de botones agotaba el tiempo: los botones de WhatsApp abren wa.me y el entorno no tiene red; la prueba ahora bloquea red externa y cierra pestañas externas (10 s en lugar de >180 s).

## No probado / limitaciones de la verificación
- Solo Chromium; no se probó Safari/Firefox ni dispositivos físicos.
- Sin WhatsApp real, impresoras, pasarelas de pago ni fiscalidad (no existen en esta versión).
- Multipantalla (cocina en otro dispositivo) funciona por sondeo cada 6 s, probado con dos pestañas, no en red.
- Sin pruebas de carga ni seguridad de servidor (no hay autenticación de servidor).
