# LK ONE — Versión 1.13.7 (beta local, sin backend obligatorio)

Plataforma de gestión configurable para negocios de distintos sectores y países. Esta entrega prioriza una interfaz más clara, una navegación más natural, un Dashboard configurable y controles de selección unificados, con una sola lista por campo y sin barras de escritura duplicadas.

## Abrir la beta

1. Descomprime el ZIP.
2. Abre `index.html` en Chrome, Edge o Safari.
3. Los datos se guardan en el navegador (`localStorage` + IndexedDB para adjuntos).
4. Exporta respaldos JSON con regularidad desde Configuración.

No es necesario ejecutar `npm start` ni instalar dependencias para probar la modalidad local. `server.js` se conserva como herramienta opcional del proyecto; esta entrega puede probarse abriendo `index.html`.

## Novedades de 1.13.7

- Interfaz más fluida: jerarquía visual, espaciado, controles, transiciones suaves y estados de foco más claros.
- Dashboard dentro de Resumen con métricas, tendencias, actividad reciente, próximas citas y alertas operativas.
- Dashboard personalizable por usuario: cada persona puede elegir qué widgets mostrar en su Resumen.
- Selectores simplificados: una sola lista desplegable por campo; actividad, país y zona horaria se eligen de opciones predefinidas.
- Los campos de texto libre siguen permitiendo escribir datos nuevos cuando el tipo de información lo permite; los campos relacionales (por ejemplo, cliente, profesional o producto) siguen requiriendo seleccionar un registro existente para preservar la integridad de los datos.
- Diseño adaptable a escritorio y móvil, con respeto a la preferencia de movimiento reducido del sistema.
- Se conservan las mejoras anteriores: ficha de clientes por documento, equipo, horarios, vacaciones, avisos de pedidos y funciones de LK POS.

## Límites importantes

Esta versión funciona sin backend, pero el almacenamiento es local a ese navegador y dispositivo. No hay sincronización multi-dispositivo. El PIN/contraseña local es demostrativo y no sustituye autenticación segura de producción.

WhatsApp automático, tasas oficiales en tiempo real, facturación electrónica fiscal, pagos en línea, automatizaciones en segundo plano y autenticación centralizada requieren servicios externos y/o backend. No se presentan como funciones activas.

## Probar el código

```bash
npm test
```

Requiere Node 18 o superior. Las pruebas de navegador se omiten si Playwright/Chromium no está instalado.

## Estructura

- `index.html`, `styles.css`, `app.js`: interfaz y persistencia local.
- `catalog.js`: actividades, países, monedas, roles y permisos.
- `core.js`: validaciones, operaciones, inventario y migraciones.
- `pos-core.js`, `pos-ui.js`: motor e interfaz del POS.
- `automation-core.js`: planificación local de avisos y cola manual (sin envío automático).
- `tests/`: pruebas automatizadas.
