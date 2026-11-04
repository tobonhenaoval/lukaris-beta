# LUKARIS — Beta global (prototipo local)

## Visión de producto
LUKARIS no se limita a barberías ni a una región. Es una plataforma de gestión configurable para negocios de distintos sectores y países. La estrategia es construir un núcleo común y sumar plantillas de industria, no desarrollar una aplicación separada por cada oficio.

## Núcleo común
- CRM: clientes, contactos, historial y seguimiento.
- Agenda: citas, reservas, reuniones, turnos y disponibilidad.
- Ventas y caja: cotizaciones, ventas, pagos, abonos y cuentas por cobrar.
- Catálogo: productos y servicios.
- Inventario: existencias, costos y movimientos.
- Operaciones: órdenes, proyectos, pedidos, tareas o solicitudes.
- Equipo: empleados, roles, comisiones y permisos (pendiente).
- Suscripciones: planes recurrentes de los clientes del negocio y del propio SaaS (pendiente).
- Reportes y automatizaciones (pendiente).

## Sectores objetivo
Comercio/retail; servicios profesionales y personales; alimentos/restaurantes; salud/bienestar; educación/formación; construcción/instalaciones; automoción/mantenimiento; logística/transporte; turismo/alojamiento; servicios digitales/suscripciones; y otros negocios.

No todos los sectores necesitan todos los módulos. La configuración y las plantillas deben activar únicamente los flujos relevantes.

## Ejecución local
Abre `index.html` en Chrome, Edge o Safari. No requiere instalación ni internet.

## Decisiones confirmadas
- Mantener por ahora la beta simple, sin migrar el stack.
- Diseñar para múltiples sectores y una audiencia internacional.
- Trabajar localmente en el computador durante esta etapa.

## Limitaciones de la beta
Es una demostración frontend con `localStorage`; no es todavía multiempresa ni multiusuario real. No tiene sincronización, autenticación, backups, mensajería, pagos online, impuestos por país, traducciones completas ni soporte de zonas horarias. No usar como sistema de producción ni almacenar información sensible.

## Principio de arquitectura
Separar:
1. Núcleo universal.
2. Módulos opcionales.
3. Plantillas por sector.
4. Configuración por país/idioma/moneda/zona horaria.
5. Planes y límites comerciales del SaaS.


## Beta 0.3
Incluye onboarding adaptativo con módulos recomendados por actividad, configuración inicial internacional (país, moneda, idioma y zona horaria), estructura local de empresas/sucursales, planes globales de referencia y respaldo JSON exportable/importable.

**Importante:** los planes y precios son una propuesta de producto, no una pasarela de cobro activa. La estructura multiempresa es una representación local; el aislamiento de datos y los permisos reales requieren backend.
