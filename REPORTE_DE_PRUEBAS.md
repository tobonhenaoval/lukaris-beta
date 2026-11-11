# LK ONE 1.13.6 · Reporte de pruebas

**Fecha:** 2026-11-11 · **Comando:** `npm test` · **Entorno:** Node 18+.

**Resultado:** 60 pruebas totales · 51 aprobadas · 0 fallidas · 9 omitidas.

Las nueve pruebas omitidas requieren Playwright para ejecutar flujos reales en navegador. No se declara aprobada la prueba visual ni la navegación end-to-end en esta ejecución.

## Cobertura verificada en 1.13.6
- Sintaxis JavaScript de todos los módulos.
- Coherencia de versión entre core, paquete, documentación e interfaz.
- Selectores compartidos: búsqueda escrita para filtrar opciones y desplegable visible para elegirlas, aplicados a la interfaz general y a LK POS.
- Presencia del Dashboard configurable en Resumen, con métricas, actividad, próximas citas y alertas.
- Migraciones y pruebas de lógica de negocio, clientes por documento, personal, jornadas, citas, inventario, ventas, POS, permisos, servidor y respaldos.

## Límites de verificación
- No se ejecutaron pruebas reales de navegador por ausencia de Playwright.
- No se declara verificado visualmente cada tamaño de pantalla.
- No se conectó WhatsApp Business API: los mensajes se generan en la bandeja interna y WhatsApp se abre con texto preparado; la persona debe confirmar el envío.
- La beta local no sincroniza entre dispositivos y no ejecuta tareas con la aplicación cerrada.
