# LUKARIS ONE 1.10 — Guía rápida para demostraciones

## Qué mostrar
LUKARIS ONE es una plataforma de gestión adaptable a negocios de servicios, comercio, alimentos, salud y bienestar, educación, construcción, logística, turismo y negocios digitales.

### Recorrido recomendado (8–12 minutos)
1. **Resumen:** muestra las métricas, próximas citas, operaciones y accesos rápidos.
2. **Clientes:** crea un cliente, abre su ficha y prueba el acceso a WhatsApp con mensaje prellenado.
3. **Agenda:** crea una cita, elige cliente y servicio, revisa la duración, el precio y el control de cruces de horario.
4. **Comercial:** crea cotizaciones y conviértelas en ventas.
5. **Finanzas:** registra ventas, pagos y abonos; consulta saldos pendientes.
6. **Servicios e inventario:** crea servicios y productos, registra entradas/salidas y prueba la protección de existencias.
7. **Operaciones:** crea y actualiza órdenes, tareas o trabajos.
8. **Automatizaciones:** activa reglas, revisa ejemplos y ejecuta una prueba simulada.
9. **Reportes:** enseña ventas registradas, pagos, cartera, inventario y actividad de agenda.
10. **Configuración:** cambia actividad, país, moneda, idioma, zona horaria, módulos y estructura de empresas/sucursales.

## Preparar datos de presentación
1. Ejecuta `npm start`.
2. Abre `http://localhost:3000`.
3. Entra en **Configuración**.
4. Pulsa **Cargar escenario comercial completo** y confirma.
5. Vuelve a **Resumen**. Se cargarán datos ficticios de clientes, citas, servicios, productos, ventas, pagos, cotizaciones, operaciones, una sucursal y flujos de automatización activos.

Los datos de demostración son ficticios. No se envían mensajes a esos teléfonos.

## Ejecutar
Requiere Node.js 18 o superior:
```bash
npm start
```
Para verificar la lógica y la API:
```bash
npm test
```

## Funciones disponibles en esta beta
- CRM básico: clientes, fichas, búsqueda, notas y adjuntos.
- Agenda: citas, estados, validación y prevención de solapamientos.
- Comercial: cotizaciones, ventas, abonos y cuentas por cobrar.
- Finanzas: registro de pagos y saldos derivados.
- Catálogo: servicios y productos.
- Inventario: existencias, movimientos y descuento al vender.
- Operaciones: órdenes y seguimiento de estado.
- Empresas/sucursales como estructura de configuración.
- Configuración por actividad, país, moneda, idioma y zona horaria.
- Exportación CSV, respaldo/restauración JSON y adjuntos.
- Reportes operativos y centro de automatizaciones demostrables.
- Acceso a WhatsApp mediante enlace con mensaje prellenado que el usuario debe enviar manualmente.

## Límites que deben explicarse con honestidad
Esta es una beta local para validación y demostración, no el SaaS público listo para producción. Todavía no incluye:
- autenticación, recuperación de contraseña ni multiempresa real con aislamiento de datos;
- usuarios, roles, permisos, turnos o comisiones;
- envío automático de WhatsApp Business API, correo o SMS;
- sincronización real con Google Calendar u otros calendarios;
- pasarela de pagos, suscripciones SaaS o facturación electrónica;
- impuestos y documentos fiscales configurados por país;
- contabilidad certificada ni cierres de caja completos;
- infraestructura cloud, alta disponibilidad, cifrado de adjuntos ni monitoreo productivo.

No introduzcas información personal, financiera o clínica real de clientes en esta beta. Antes de comercializar el acceso a clientes reales hay que implementar seguridad, autenticación, aislamiento multi-tenant, privacidad, infraestructura y pruebas de aceptación.
