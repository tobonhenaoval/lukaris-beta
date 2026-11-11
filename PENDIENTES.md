# LK ONE 1.12 · Pendientes

## Requieren credenciales o infraestructura
- **WhatsApp real**: cuenta WhatsApp Business verificada, Phone Number ID, token permanente guardado en servidor, plantillas aprobadas por Meta, HTTPS público con webhook y un cron que ejecute `planReminders`/`releaseUnconfirmed`. La lógica y la cola están listas; falta el proveedor.
- **Autenticación de servidor y multiempresa**: sesiones, hash de contraseñas en servidor, base de datos (p. ej. PostgreSQL) con aislamiento por empresa. El PIN actual es solo local.
- **Facturación fiscal por país**: requiere reglas y proveedor de cada autoridad tributaria.
- **Pagos en línea / datáfonos**: pasarela y credenciales.

## Funcionalidad por construir
- Cocina en tiempo real entre dispositivos (WebSocket/SSE) en lugar de sondeo de 6 s.
- Sincronización por documentos o registros (hoy se sincroniza la base completa con control de revisión).
- Varias cajas simultáneas (hoy un turno abierto a la vez).
- Venta general con varias líneas (productos/servicios) fuera del POS.
- Impresión de comandas y tickets, lector de código de barras.
- Reservas de mesa, programa de lealtad y propinas repartidas por mesero.
- Plantillas de menú por tipo de local y recetas con costeo avanzado.
- Pruebas en más navegadores y dispositivos.
