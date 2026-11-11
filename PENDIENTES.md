# LK ONE 1.13.6 · Pendientes y límites transparentes

## Funciones que requieren infraestructura o proveedor
- WhatsApp automático: proveedor oficial, credenciales, webhooks y tareas programadas.
- Autenticación segura: backend, sesiones seguras, recuperación de contraseña, hash robusto en servidor y aislamiento por empresa.
- Sincronización entre dispositivos, usuarios simultáneos y sucursales con datos aislados.
- Tasas oficiales en vivo: proveedor/fuente oficial por país, fecha de consulta y política de actualización.
- Facturación electrónica fiscal: integración con autoridad tributaria/proveedor autorizado de cada país.
- Pagos en línea, datáfonos y conciliación con proveedores de pago.
- Alertas y automatizaciones que funcionen con la aplicación cerrada.
- Asistencia fiable y automática en segundo plano, incluyendo ausencias, tolerancias y correcciones auditables.
- Motor de turnos avanzado: jornadas rotativas, múltiples pausas, horas extra, festivos por país, reglas de convenio y aprobaciones.

## Siguientes desarrollos funcionales
- POS especializado completo por vertical: barbería (sillas, barberos, servicios y turnos), restaurantes (mesas, cocina y comandas), retail (lector de códigos, caja rápida y devoluciones), spa (cabinas y tratamientos).
- Temporizadores de servicio/pedido configurables y métricas históricas.
- Inventario asignado por empleado, solicitudes de reposición y aprobación.
- Lista de espera, asignación/reasignación automática de citas y reglas de confirmación verificables.
- Número de WhatsApp operativo configurable y notificaciones por etapas; envío real solo tras integrar proveedor.
- Mensajería automática real a clientes y equipos; esta beta solo genera avisos internos y abre WhatsApp manualmente.
- Exportación PDF/CSV ampliada para cierres, facturación e informes.
- Modalidades comerciales de licencia completa y POS independiente con control de suscripción.

## Reglas de seguridad
La modalidad sin backend es solo local y demostrativa. Los PIN y contraseñas se almacenan como hashes con sal en datos locales, pero cualquier persona con acceso al navegador o archivo puede manipularlos. No usar para información sensible ni despliegue público.
