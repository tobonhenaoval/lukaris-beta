# Changelog

## [1.13.6] - 2026-11-11
### Interfaz y experiencia de uso
- Se suaviza la interfaz con mejor jerarquía visual, espacios, controles, transiciones y estados de foco.
- Dashboard dentro de Resumen con métricas, tendencias, actividad, próximas citas y alertas; sus widgets se pueden personalizar por usuario.
- Todos los selectores compartidos por la interfaz de negocio y LK POS incluyen un campo de búsqueda que filtra las opciones y conservan el desplegable para elegir directamente.
- Los campos relacionales continúan guardando identificadores de registros existentes; los campos de texto libre siguen permitiendo escritura manual cuando corresponde.
- Se mantiene el diseño adaptable y se respeta `prefers-reduced-motion`.

## [1.13.5] - 2026-11-11
### Conservado de la iteración anterior
- Ficha de clientes con tipo y número de documento: CC, CE, NIT, pasaporte u otro.
- Registro por documento sin exigir celular ni correo; búsqueda y bloqueo de duplicados normalizando puntos, guiones y espacios.

### Añadido
- Perfil de personal con nombre, apellido, celular y área/estación de trabajo.
- Horario semanal configurable por empleado: días laborales, hora de entrada/salida y pausa.
- Registro de vacaciones y permisos individuales, además de cierres y vacaciones de la empresa.
- La disponibilidad laboral se aplica a la asignación manual y automática de citas; las citas futuras afectadas por una ausencia se reasignan a personal disponible o pasan a «Pendiente de reprogramación».
- Avisos dentro de LK POS al enviar pedidos a preparación y al marcar productos como listos. Los mensajes incluyen los datos del pedido y se dirigen al personal por estación, a todo el equipo o a una persona seleccionada.
- Mensajes de actualización al cliente en los cambios de estado de pedidos y encargos de Operaciones, preparados en la cola de salida.
- Bandeja de avisos con opción de abrir WhatsApp para cada destinatario. El envío se confirma manualmente; no se simula automatización externa.
- El resumen distribuye cinco indicadores en una cuadrícula equilibrada para evitar espacios vacíos.
- Migración al esquema 8 sin eliminar los datos anteriores.

### Límites
- WhatsApp sigue siendo manual mediante `wa.me`; para envío automático, entrega fiable y mensajes con la aplicación cerrada se requiere proveedor oficial, backend y webhooks.
- La disponibilidad y reasignación se ejecutan al guardar cambios mientras LK ONE está abierto. No existe un motor en segundo plano ni sincronización multi-dispositivo en esta beta local.

## [1.13] - 2026-11-11
### Añadido
- **Acceso local por tipo de usuario**: administradores con correo y contraseña; empleados no administradores con PIN personal. Se mantiene la matriz de permisos por rol y el bloqueo temporal tras intentos fallidos.
- **Modo oscuro** persistente, accesible desde la barra superior y desde Personalización. Mantiene los temas corporativos existentes.
- Selector demostrativo de modalidad comercial: suite completa o solo POS (sin pasarela de suscripción ni cobro integrado).
- **Nueva pantalla de inicio de LK POS** con accesos operativos, estados de caja y avisos. La interfaz POS usa una distribución propia y conserva la paleta elegida para LK ONE.
- **POS contextual**: nomenclatura adaptada para barberías/peluquerías (sillas y profesionales) y spas (cabinas y especialistas). Se amplía la recomendación del POS a comercios minoristas.
- **Nuevas actividades**: abarrotes/tienda de barrio, tienda de conveniencia, carnicería, papelería y floristería.
- Campo de cliente renombrado a **Celular (opcional)**.
- Migración a esquema 6 compatible, con campos locales de correo y hash de contraseña para usuarios.

### Ajustado
- El acceso de administrador requiere correo y contraseña de al menos 8 caracteres al activar autenticación local. El personal utiliza PIN.
- Se aclara en la interfaz y documentación que este acceso local no sustituye autenticación de servidor ni proporciona seguridad para despliegue público.

### Límites explícitos de esta entrega
- Sin backend obligatorio: abrir `index.html` y guardar en el navegador. No hay sincronización entre dispositivos ni ejecución de automatizaciones con el navegador cerrado.
- WhatsApp automático, tasas oficiales en vivo, facturación fiscal electrónica, reloj de asistencia fiable en segundo plano, pagos en línea y seguridad multiempresa requieren integraciones/infraestructura y no se simulan.
- El POS contextual 1.13 incorpora estructura de interfaz y términos por actividad; los flujos especializados completos de cocina, barbería, tienda y spa continúan siendo trabajo de siguientes iteraciones.

## [1.12] - 2026-11-10
### Añadido
- LK POS para restaurantes, gastronomía, mesas, pedidos, cocina, caja, inventario y reportes.
- 51 actividades con módulos recomendados, configuración internacional, roles y PIN, calendario y cola de WhatsApp sin proveedor.
- Esquema de datos 5 y mejoras de persistencia local/servidor opcional.
