# Instrucciones para Codex y Claude Code

Lee README.md, ROADMAP.md y docs/DECISIONS.md antes de trabajar.

## Visión aprobada
LUKARIS se diseña para negocios de distintos sectores y países, no solo barberías ni una región. El producto debe ser un núcleo universal configurable con módulos opcionales y plantillas por industria.

## Principios técnicos
1. No asumir que todos los negocios trabajan con citas: agenda debe ser opcional/configurable.
2. Diferenciar productos, servicios, operaciones, ventas y pagos.
3. No codificar una moneda, país, impuesto, idioma o zona horaria global como constante.
4. La moneda y el perfil actuales son solo una demostración; preparar configuración por negocio.
5. No afirmar que existe multiempresa real: el almacenamiento es un servidor local de un solo negocio y sin autenticación.
6. Mantener compatibilidad con `index.html` sin servidor (localStorage/IndexedDB) y con la clave `lukaris-beta-v02`; la lógica va en `core.js`, nunca manejadores `on*=` en línea.
7. Una tarea pequeña por iteración; no reescribir el sistema completo.
8. No integrar servicios externos ni manejar datos sensibles sin aprobación.
9. Después de cada cambio, informar archivos, pruebas, riesgos y limitaciones.
10. Ejecutar `npm test` antes de entregar cambios.

## Siguiente tarea recomendada
Ver PENDIENTES.md. Candidatas: cocina en tiempo real, venta general con varias líneas, varias cajas.
