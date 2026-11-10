# Roadmap global de LUKARIS

## Hecho
- [x] 0.4: cotizaciones, ventas, abonos, cuentas por cobrar, inventario con movimientos
- [x] 1.05: ficha de cliente, búsqueda de clientes, CSV (clientes, ventas, pagos), aviso de respaldo, pruebas y CI

- [x] 1.06: backend local con persistencia, edición/eliminación en todos los módulos, adjuntos en clientes y citas, validación de formularios, pruebas de navegador
- [x] 1.10: centro de automatizaciones de demostración, reportes operativos y acceso a WhatsApp con mensaje prellenado

## Próximas mejoras del núcleo
- [ ] Venta con múltiples productos y servicios por línea
- [ ] Descuentos, impuestos (configurables por negocio), gastos y devoluciones
- [ ] Auditoría de transacciones (edición y anulación ya existen)
- [ ] Búsqueda y filtros en ventas, pagos e inventario; exportación PDF
- [ ] Cuentas por pagar y proveedores
- [ ] Caja por turnos, apertura y cierre

## Núcleo universal
- [ ] CRM: etiquetas y seguimiento
- [ ] Agenda configurable: citas, reservas, turnos y reuniones
- [ ] Catálogo mixto de productos y servicios
- [ ] Operaciones: tareas, proyectos, órdenes y entregas
- [ ] Equipo, roles, permisos y comisiones
- [ ] Reportes configurables
- [ ] Plantillas por sector y traducciones completas

## Plataforma global y SaaS real (requiere backend)
- [ ] Autenticación y multi-tenant; aislamiento entre empresas y sucursales
- [ ] Suscripción y facturación global del SaaS
- [ ] Impuestos y documentos fiscales por país
- [ ] Proveedores de pago por mercado
- [ ] Integraciones: correo, WhatsApp/SMS, calendarios y pagos
- [ ] API, webhooks, auditoría y backups automáticos

## Restricciones vigentes
- Desarrollo simple y local durante la beta (backend local sin dependencias aprobado en 1.06).
- No cambiar el stack ni activar infraestructura externa sin aprobación.
- Producto multi-sector e internacional.
