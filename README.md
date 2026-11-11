# LK ONE — Versión 1.12 (beta con backend local)

Plataforma de gestión configurable para negocios de distintos sectores y países. La estrategia es un núcleo común más plantillas por industria, no una app distinta por oficio.

## Preparar una demostración comercial
Consulta `GUIA_DEMO_CLIENTES.md`. En Configuración puedes cargar un escenario ficticio completo para enseñar los módulos sin usar datos reales.

## Ejecutar
```bash
npm start        # http://localhost:3000  ·  datos en ./data/
```
Con el servidor los datos se guardan en `data/lukaris.json` (escritura atómica, 14 copias diarias en `data/backups/`) y los adjuntos en `data/uploads/`. También se copian en el navegador, así que si el servidor se detiene la app sigue funcionando y se resincroniza al volver.

Sin servidor: abre `index.html` directamente (Chrome, Edge o Safari). Funciona igual, guardando todo en el navegador (`localStorage` + IndexedDB para adjuntos).

Variables opcionales: `PORT` (3000), `DATA_DIR` (`./data`), `HOST` (`127.0.0.1`; no lo cambies sin autenticación).

## Probar
```bash
npm test
```
Requiere Node 18 o superior. No hay dependencias que instalar. `npm test` ejecuta pruebas de lógica (`core.js`), de la API (`server.js`) y, si Playwright con Chromium está instalado, pruebas de navegador que usan la app con clics reales (se omiten solas si no lo está; en CI solo corren las dos primeras).

## Estructura
| Archivo | Contenido |
|---|---|
| `server.js` | Backend local sin dependencias: API de datos y adjuntos, y sitio estático |
| `catalog.js` | Actividades, módulos, países, monedas, roles/permisos y hash de PIN (UMD) |
| `pos-core.js` | Motor de LK POS: mesas, pedidos, cocina, pagos, caja, reportes (UMD, sin DOM) |
| `automation-core.js` | Recordatorios, cola de mensajes, asignación de profesionales (UMD) |
| `pos-ui.js` | Interfaz de LK POS |
| `core.js` | Lógica pura y reglas de negocio (validación, ventas, inventario, adjuntos, migración); usada por navegador, servidor y pruebas |
| `index.html`, `styles.css`, `app.js` | Interfaz y capa de guardado (servidor con respaldo en navegador) |
| `tests/` | `core`, `pos`, `server`, `project`, `e2e` y `e2e-pos` (navegador real) |
| `docs/DECISIONS.md` | Decisiones y reglas de negocio (fuente única) |
| `ROADMAP.md`, `CHANGELOG.md` | Plan y cambios |
| `AGENTS.md`, `CLAUDE.md`, `CODEX.md` | Instrucciones para agentes de código |

## Núcleo común
CRM (clientes y ficha), agenda opcional, cotizaciones, ventas, abonos y cuentas por cobrar, catálogo, inventario, operaciones y configuración internacional. Pendientes: equipo y permisos, suscripciones, automatizaciones conectadas y reportes avanzados.

## Novedades de la 1.12
LK POS para gastronomía, multisector con 51 actividades, roles y PIN, calendario de citas, cola de WhatsApp y esquema 5. Detalle en `CHANGELOG.md`; uso en `GUIA_DE_USO.md`; pruebas en `REPORTE_DE_PRUEBAS.md`; pendientes en `PENDIENTES.md`; arquitectura en `RESUMEN_TECNICO.md`.

## Novedades de la 1.11
Backend local con persistencia en archivo, formularios con validación y edición/eliminación en todos los módulos, adjuntos de archivos en clientes y citas, filtros, respaldo con adjuntos y pruebas de navegador. Corrige un fallo de la 1.05 por el que los formularios no guardaban. Detalle en `CHANGELOG.md`.

## Limitaciones
Un solo negocio. El PIN de usuario es protección local básica (no autenticación de servidor): el servidor solo escucha en `127.0.0.1` y rechaza otros orígenes. No es multiempresa ni multiusuario real, no procesa pagos ni impuestos por país y no es un sistema contable certificado. **No usar en producción ni guardar información sensible.** Los adjuntos no están cifrados. Exporta un respaldo JSON (incluye adjuntos) con regularidad.

## Principio de arquitectura
Separar: núcleo universal, módulos opcionales, plantillas por sector, configuración por país/idioma/moneda/zona horaria, y planes comerciales del SaaS.
