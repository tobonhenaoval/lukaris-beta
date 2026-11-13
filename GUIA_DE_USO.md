# LK ONE 1.13.7 · Guía de uso

## 1. Arrancar
`npm start` y abrir http://localhost:3000 (Node 18+, sin instalar nada). También funciona abriendo `index.html` (guarda en el navegador).

## 2. Configurar el negocio (Configuración)
1. **Perfil**: nombre, país (buscador), moneda, zona horaria, idioma, logo, tema.
2. **Actividad**: busca la tuya (51 opciones). LK ONE recomienda módulos; «Aplicar recomendados» o personaliza. Ocultar un módulo **nunca borra datos**.
3. **Equipo**: crea usuarios con nombre, apellido, celular, área/estación y rol (administrador, gerente, empleado, mesero, cajero, cocina). «Activar inicio de sesión» pide PIN; cada rol ve solo lo que le corresponde.
4. En Operaciones configura días laborales, entrada/salida, pausa y vacaciones de cada empleado. También registra cierres de la empresa. Las citas futuras afectadas se reasignan si hay personal libre o quedan pendientes de reprogramación.
4. **Cargar ejemplo**: datos ficticios para demostrar a clientes.

## 3. LK POS (restaurantes, bares, cafeterías, comida rápida, heladerías)
- **Mesas**: crea mesas por zona; el estado (libre/ocupada/por cobrar) cambia solo. Toca una mesa para abrir cuenta.
- **Pedido**: agrega platos del menú, cantidades y notas; «Enviar a cocina» descuenta inventario una sola vez. También hay pedidos para llevar y domicilio.
- **Cocina**: tablero por estación (Pendiente → En preparación → Listo → Entregado); el mesero recibe aviso.
- **Cobro**: requiere caja abierta. Pagos parciales o mixtos, propina, impuesto, descuento (con autorización). Al saldar, se cierra la cuenta y se crean venta y pagos en Comercial/Finanzas.
- **Cuentas**: dividir, mover de mesa, unir. Cancelar o reembolsar exige motivo y permiso.
- **Caja**: abrir con fondo, retiros, cierre con arqueo y diferencia. Un turno abierto a la vez.
- **Menú e inventario**: platos, categorías, recetas/insumos, mermas, alertas de stock bajo.
- **Reportes**: ventas, productos, meseros, métodos de pago, propinas, caja y mermas.

## 4. Módulos generales
Clientes (CRM con ficha y adjuntos), Citas (lista y calendario, reprogramar, asignación equilibrada de profesionales), Comercial (cotizaciones y ventas), Caja/Finanzas (abonos, historial), Servicios, Inventario, Operaciones.

## 5. Mensajes de pedidos y WhatsApp
LK POS genera avisos internos al equipo cuando un pedido se envía a preparación y cuando queda listo. Configura si se dirige al personal de la estación, a todo el equipo o a una persona. Los encargos de Operaciones también preparan mensajes de cambio de estado para el cliente. Hay una **cola de mensajes** (recordatorios 24 h y 4 h, turno liberado). El botón «Enviar manual» abre wa.me con el texto listo; no se envía solo. El envío automático requiere un proveedor (ver PENDIENTES.md).

## 6. Respaldos
Configuración → Exportar respaldo (JSON con adjuntos). Con servidor: `data/lukaris.json` y 14 copias diarias en `data/backups/`.

## 7. Límites a tener en cuenta
El PIN es protección local; no pongas el servidor en Internet sin autenticación real. Un solo negocio; sin facturación fiscal.
