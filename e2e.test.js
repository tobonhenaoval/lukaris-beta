/* Prueba de extremo a extremo en un Chromium real: usa la app como un usuario (clics, formularios,
   archivos). Se omite sola si Playwright/Chromium no están instalados (p. ej. en CI). */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
let chromium = null, exe = process.env.CHROMIUM_PATH;
for (const m of ['playwright', '/opt/npm-tools/node_modules/playwright']) { try { chromium = require(m).chromium; break; } catch (e) {} }
if (!exe) for (const p of ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome']) if (fs.existsSync(p)) exe = p;
const skip = !chromium ? 'Playwright no está instalado' : false;
const { createServer } = require('../server.js');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lk-e2e-'));
const PAGES = ['home', 'appointments', 'clients', 'commercial', 'cash', 'services', 'inventory', 'work', 'settings'];

async function launch() { return chromium.launch(exe ? { executablePath: exe } : {}); }
async function open(browser, url) {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } }), pg = await ctx.newPage(), errors = [];
  pg.on('pageerror', e => errors.push('pageerror: ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await pg.goto(url); await pg.waitForSelector('#app .stats'); return { ctx, pg, errors };
}
const nav = (pg, p) => pg.click(`#nav [data-page=${p}]`);
const closed = pg => pg.waitForFunction(() => !document.querySelector('#back').classList.contains('show'));
const modal = pg => pg.locator('#back.show');
const toast = pg => pg.locator('.toast').last();
async function fill(pg, vals) { for (const [k, v] of Object.entries(vals)) { const el = pg.locator(`#mbody [name=${k}]`); (await el.evaluate(n => n.tagName)) === 'SELECT' ? await el.selectOption(String(v)) : await el.fill(String(v)); } }
const submit = pg => pg.click('#mbody form [type=submit]');
const waitSaved = pg => pg.waitForFunction(() => /Guardado en el servidor/.test(document.querySelector('#savestate').textContent) && !/Guardando/.test(document.querySelector('#savestate').textContent));
const serverDb = async base => (await (await fetch(base + '/api/db')).json()).data;
const pdf = (dir, name = 'receta.pdf', body = '%PDF-1.4 prueba') => { const f = path.join(dir, name); fs.writeFileSync(f, body); return f; };

test('servidor: flujo completo con clics reales, adjuntos y persistencia', { skip, timeout: 120000 }, async () => {
  const dir = tmp(), files = tmp(), app = createServer({ dataDir: dir }), port = await app.listen(0), base = 'http://127.0.0.1:' + port, browser = await launch();
  let { ctx, pg, errors } = await open(browser, base + '/');
  try {
    // 1. todas las pantallas cargan
    for (const p of PAGES) { await nav(pg, p); await pg.waitForSelector('#app .heading'); }
    await nav(pg, 'home');
    // 2. cliente: validación y alta con adjunto
    await nav(pg, 'clients'); await pg.click('[data-act=new][data-type=client]');
    await submit(pg); assert.ok(await pg.locator('#mbody .err').count() >= 2, 'muestra errores de validación'); assert.ok(await modal(pg).count());
    await fill(pg, { name: 'Laura Gómez', phone: '3001234567', email: 'no-valido' }); await submit(pg); assert.match(await pg.locator('#mbody .err').first().textContent(), /Correo inválido/);
    await fill(pg, { email: 'laura@example.com' }); await pg.setInputFiles('#mbody input[type=file]', pdf(files, 'historia.pdf')); await submit(pg);
    await closed(pg); assert.match(await pg.locator('#app').textContent(), /Laura Gómez/); assert.match(await pg.locator('#app').textContent(), /📎 1/);
    // búsqueda
    await pg.fill('[data-filter=q]', 'laura'); assert.strictEqual(await pg.locator('#app tbody tr[data-q]:visible').count(), 1);
    await pg.fill('[data-filter=q]', 'zzz'); assert.strictEqual(await pg.locator('#app .noresults').count(), 1); await pg.fill('[data-filter=q]', '');
    // 3. ficha del cliente: adjuntar otro, abrir, descargar, quitar
    await pg.click('tr:has-text("Laura Gómez")'); await pg.waitForSelector('#mbody .attach');
    await pg.setInputFiles('#mbody input[data-attach]', [pdf(files, 'examen.pdf'), pdf(files, 'foto.png', 'PNG')]); await pg.waitForFunction(() => document.querySelectorAll('#mbody .file').length === 3);
    const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#mbody [data-act=file-download] >> nth=0')]); assert.strictEqual(dl.suggestedFilename(), 'historia.pdf'); assert.strictEqual(fs.readFileSync(await dl.path(), 'utf8'), '%PDF-1.4 prueba');
    const [pop] = await Promise.all([ctx.waitForEvent('page'), pg.click('#mbody [data-act=file-open] >> nth=0')]); await pop.close();
    await pg.click('#mbody [data-act=file-delete] >> nth=2'); await pg.click('[data-act=confirm-yes]'); await pg.waitForFunction(() => document.querySelectorAll('#mbody .file').length === 2);
    // tipo no permitido
    fs.writeFileSync(path.join(files, 'virus.exe'), 'MZ'); await pg.setInputFiles('#mbody input[data-attach]', path.join(files, 'virus.exe')); await pg.waitForSelector('.toast.err'); assert.match(await toast(pg).textContent(), /tipo no permitido/);
    // 4. cita con adjunto desde la ficha del cliente (+ Cita) y conflicto de horario
    await pg.click('#mbody [data-act=new][data-type=appointment]'); assert.strictEqual(await pg.locator('#mbody [name=clientId]').inputValue() !== '', true);
    await fill(pg, { date: '2030-05-10', time: '09:00' }); await pg.setInputFiles('#mbody input[type=file]', pdf(files, 'orden.pdf')); await submit(pg);
    await pg.waitForSelector('#mbody h3:has-text("Citas (1)")', { timeout: 5000 });
    await pg.click('#mbody [data-act=close] >> nth=-1'); await nav(pg, 'appointments');
    await pg.click('[data-act=new][data-type=appointment]'); await fill(pg, { clientId: await pg.locator('#mbody [name=clientId] option').nth(0).getAttribute('value'), date: '2030-05-10', time: '09:10' }); await submit(pg);
    assert.match(await pg.locator('#conflict').textContent(), /Ya hay una cita/); await pg.click('[data-act=cancel-form]');
    // 5. detalle de la cita: estado, adjuntar y editar
    await pg.click('tr:has-text("2030-05-10")'); await pg.waitForSelector('#mbody .attach'); assert.match(await pg.locator('#mbody .attach h3').textContent(), /\(1\)/);
    await pg.setInputFiles('#mbody input[data-attach]', pdf(files, 'consentimiento.pdf')); await pg.waitForFunction(() => /\(2\)/.test(document.querySelector('#mbody .attach h3').textContent));
    await pg.click('#mbody .chip:has-text("Atendida")'); await pg.waitForSelector('#mbody .chip.on:has-text("Atendida")');
    await pg.click('#mbody [data-act=edit]'); await fill(pg, { time: '11:30', notes: 'Traer examen' }); await submit(pg); await pg.waitForSelector('#mbody .kv'); assert.match(await pg.locator('#mbody .kv').textContent(), /Traer examen/);
    await pg.click('#mbody [data-act=close]'); assert.match(await pg.locator('#app').textContent(), /11:30/);
    // filtros de agenda
    await pg.selectOption('[data-filter=status]', 'Atendida'); assert.strictEqual(await pg.locator('#app tbody tr[data-q]:visible').count(), 1); await pg.selectOption('[data-filter=status]', '');
    // 6. servicios, productos, inventario y operaciones: alta, edición y borrado
    await nav(pg, 'services'); await pg.click('[data-act=new][data-type=service]'); await fill(pg, { name: 'Consulta', price: 80000, duration: 40 }); await submit(pg); assert.match(await pg.locator('#app').textContent(), /Consulta/);
    await pg.click('tr:has-text("Consulta") [data-act=edit]'); await fill(pg, { price: 90000 }); await submit(pg); assert.match(await pg.locator('#app').textContent(), /90/);
    await pg.click('tr:has-text("Servicio estándar") [data-act=delete]'); await pg.click('[data-act=confirm-yes]'); assert.match(await toast(pg).textContent(), /lo usan/); // protegido
    await pg.click('tr:has-text("Consulta") [data-act=delete]'); await pg.click('[data-act=confirm-yes]'); await pg.waitForFunction(() => !/Consulta/.test(document.querySelector('#app').textContent));
    await nav(pg, 'inventory'); await pg.click('[data-act=new][data-type=product]'); await fill(pg, { name: 'Crema', sku: 'CR-1', stock: 10, cost: 5000, price: 9000 }); await submit(pg);
    await pg.click('[data-act=new][data-type=product]'); await fill(pg, { name: 'Otra', sku: 'cr-1' }); await submit(pg); assert.match(await pg.locator('#mbody .err').textContent(), /SKU/); await pg.click('[data-act=cancel-form]');
    await pg.click('tr:has-text("Crema") [data-act=new][data-type=movement]'); await fill(pg, { type: 'Salida', quantity: 99 }); await submit(pg); assert.match(await pg.locator('#mbody .err').textContent(), /existencias/);
    await fill(pg, { quantity: 4, reason: 'Uso' }); await submit(pg); assert.match(await pg.locator('tr:has-text("Crema")').first().textContent(), /6/);
    await nav(pg, 'work'); await pg.click('[data-act=new][data-type=order]'); await fill(pg, { vehicle: 'REF-9', detail: 'Instalar', amount: 120000, status: 'En proceso' }); await submit(pg); assert.match(await pg.locator('#app').textContent(), /REF-9/);
    await pg.click('tr:has-text("REF-9") [data-act=edit]'); await fill(pg, { status: 'Entregado' }); await submit(pg); assert.match(await pg.locator('tr:has-text("REF-9")').textContent(), /Entregado/);
    await pg.click('tr:has-text("REF-9") [data-act=delete]'); await pg.click('[data-act=confirm-yes]'); await pg.waitForFunction(() => !/REF-9/.test(document.querySelector('#app').textContent));
    // 7. comercial: cotización → venta → abono → anular
    await nav(pg, 'commercial'); await pg.click('[data-act=new][data-type=quote]'); await fill(pg, { description: 'Proyecto web', amount: 500000 }); await submit(pg); assert.match(await pg.locator('#app').textContent(), /Proyecto web/);
    await pg.click('tr:has-text("Proyecto web") [data-act=edit]'); await fill(pg, { amount: 400000 }); await submit(pg);
    await pg.click('tr:has-text("Proyecto web") [data-act=convert-quote]'); await pg.click('[data-act=confirm-yes]'); await pg.waitForSelector('#scope2 tr:has-text("Proyecto web")');
    await pg.click('#scope2 tr:has-text("Proyecto web") [data-act=pay-sale]'); assert.strictEqual(await pg.locator('#mbody [name=amount]').inputValue(), '400000'); await fill(pg, { amount: 500000 }); await submit(pg); assert.match(await pg.locator('#mbody .err').textContent(), /saldo/);
    await fill(pg, { amount: 150000, method: 'Transferencia' }); await submit(pg); assert.match(await pg.locator('#scope2 tr:has-text("Proyecto web")').textContent(), /Abono parcial/);
    await pg.click('#scope2 tr:has-text("Proyecto web") [data-act=void-sale]'); await pg.click('[data-act=confirm-yes]'); assert.match(await toast(pg).textContent(), /pagos/);
    await pg.click('[data-act=new][data-type=sale]'); await fill(pg, { description: 'Crema x2', total: 18000, paid: 18000, productId: await pg.locator('#mbody [name=productId] option:has-text("Crema")').getAttribute('value'), quantity: 2 }); await submit(pg);
    await nav(pg, 'cash'); assert.match(await pg.locator('#app').textContent(), /Crema x2/);
    await pg.click('tr:has-text("Abono: Proyecto web") [data-act=delete]'); await pg.click('[data-act=confirm-yes]'); await pg.waitForFunction(() => !/Abono: Proyecto web/.test(document.querySelector('#app').textContent));
    await nav(pg, 'commercial'); await pg.click('#scope2 tr:has-text("Proyecto web") [data-act=void-sale]'); await pg.click('[data-act=confirm-yes]'); await pg.waitForSelector('#scope2 tr.void');
    // 8. persistencia en el servidor + recarga
    await waitSaved(pg); let data = await serverDb(base);
    assert.ok(data.clients.some(c => c.name === 'Laura Gómez')); assert.ok(data.appointments.some(a => a.date === '2030-05-10' && a.status === 'Atendida' && a.time === '11:30'));
    assert.strictEqual(data.attachments.length, 4); assert.strictEqual(data.products.find(p => p.name === 'Crema').stock, 4); assert.ok(data.sales.find(s => s.description === 'Proyecto web').voided);
    for (const a of data.attachments) assert.strictEqual((await fetch(`${base}/api/files/${a.id}`)).status, 200, 'archivo ' + a.name);
    await pg.reload(); await pg.waitForSelector('#app .stats'); await nav(pg, 'clients'); assert.match(await pg.locator('#app').textContent(), /Laura Gómez/);
    // 9. borrar cita elimina sus archivos del servidor; borrar cliente con historial está protegido
    await nav(pg, 'appointments'); const ids = data.attachments.filter(a => a.ownerType === 'appointment').map(a => a.id);
    await pg.click('tr:has-text("2030-05-10") [data-act=delete]'); await pg.click('[data-act=confirm-yes]'); await pg.waitForFunction(() => !/2030-05-10/.test(document.querySelector('#app').textContent));
    await waitSaved(pg); for (const id of ids) assert.strictEqual((await fetch(`${base}/api/files/${id}`)).status, 404);
    await nav(pg, 'clients'); await pg.click('tr:has-text("Alex Rivera") [data-act=delete]'); await pg.click('[data-act=confirm-yes]'); assert.match(await toast(pg).textContent(), /No se puede eliminar/);
    // 10. configuración: perfil, módulos, unidades, CSV, respaldo e importación
    await nav(pg, 'settings'); await pg.fill('#app form[data-form=profile] [name=name]', 'Clínica Luna'); await pg.fill('#app form[data-form=profile] [name=timezone]', 'Marte/Olimpo'); await pg.click('#app form[data-form=profile] [type=submit]'); assert.match(await pg.locator('#app .err').textContent(), /Zona horaria/);
    await pg.fill('#app form[data-form=profile] [name=timezone]', 'America/Bogota'); await pg.selectOption('#app form[data-form=profile] [name=currency]', 'USD'); await pg.click('#app form[data-form=profile] [type=submit]'); assert.match(await pg.locator('#topbiz').textContent(), /Clínica Luna/);
    await pg.uncheck('[data-module=reports]'); assert.strictEqual(await pg.locator('[data-module=reports]').isChecked(), false);
    await pg.click('[data-act=new][data-type=unit]'); await fill(pg, { name: 'Sede Norte', kind: 'branch', parentId: '1' }); await submit(pg); assert.match(await pg.locator('#app').textContent(), /Sucursal de Clínica Luna/);
    await pg.click('.unit-row:has-text("Sede Norte") [data-act=delete]'); await pg.click('[data-act=confirm-yes]'); await pg.waitForFunction(() => !/Sede Norte/.test(document.querySelector('#app').textContent));
    for (const k of ['clients', 'appointments', 'sales', 'payments', 'products']) { const [d] = await Promise.all([pg.waitForEvent('download'), pg.click(`[data-act=export-csv][data-kind=${k}]`)]); assert.match(d.suggestedFilename(), /^lukaris-.*\.csv$/); }
    const [bk] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-act=export-backup]')]); const bkFile = path.join(files, 'backup.json'); await bk.saveAs(bkFile);
    const backup = JSON.parse(fs.readFileSync(bkFile, 'utf8')); assert.strictEqual(backup.schemaVersion, 4); assert.strictEqual(Object.keys(backup.files).length, backup.data.attachments.length);
    await pg.click('tr:has-text("Alex Rivera")').catch(() => {});
    // importar: primero un archivo ajeno (rechazo), luego el respaldo tras cambiar datos
    fs.writeFileSync(path.join(files, 'malo.json'), '{"x":1}'); await pg.setInputFiles('[data-import]', path.join(files, 'malo.json')); await pg.waitForSelector('.toast.err:has-text("estructura")');
    await nav(pg, 'services'); await pg.click('[data-act=new][data-type=service]'); await fill(pg, { name: 'Temporal', price: 1, duration: 5 }); await submit(pg); await nav(pg, 'settings');
    await pg.setInputFiles('[data-import]', bkFile); await pg.click('[data-act=confirm-yes]'); await pg.waitForSelector('.toast:has-text("Respaldo restaurado")'); await nav(pg, 'services'); assert.ok(!/Temporal/.test(await pg.locator('#app').textContent()));
    // 11. restablecer exige escribir BORRAR
    await nav(pg, 'settings'); await pg.click('[data-act=reset-data]'); await pg.click('[data-act=confirm-yes]'); assert.ok(await modal(pg).count(), 'no restablece sin escribir BORRAR');
    await pg.fill('#confirmText', 'BORRAR'); await pg.click('[data-act=confirm-yes]'); await pg.waitForSelector('.toast:has-text("Datos restablecidos")'); await waitSaved(pg); data = await serverDb(base); assert.strictEqual(data.attachments.length, 0); assert.strictEqual(data.clients.length, 2);
    assert.deepStrictEqual(errors, []);
  } finally { await ctx.close(); await browser.close(); await app.close(); }
});

test('servidor: dos pestañas, la segunda detecta el conflicto y recarga lo último', { skip, timeout: 60000 }, async () => {
  const app = createServer({ dataDir: tmp() }), port = await app.listen(0), base = 'http://127.0.0.1:' + port, browser = await launch();
  const A = await open(browser, base + '/'), B = await open(browser, base + '/');
  try {
    await waitSaved(A.pg); await waitSaved(B.pg);
    await A.pg.click('#nav [data-page=services]'); await A.pg.click('[data-act=new][data-type=service]'); await fill(A.pg, { name: 'Desde A', price: 1, duration: 5 }); await submit(A.pg); await waitSaved(A.pg);
    await B.pg.click('#nav [data-page=services]'); await B.pg.click('[data-act=new][data-type=service]'); await fill(B.pg, { name: 'Desde B', price: 2, duration: 5 }); await submit(B.pg);
    await B.pg.waitForSelector('.toast.err:has-text("otra pestaña")'); assert.match(await B.pg.locator('#app').textContent(), /Desde A/);
  } finally { await A.ctx.close(); await B.ctx.close(); await browser.close(); await app.close(); }
});

test('sin servidor (file://): guarda en el navegador y los adjuntos persisten', { skip, timeout: 60000 }, async () => {
  const browser = await launch(), files = tmp(), url = 'file://' + path.join(__dirname, '..', 'index.html');
  const ctx = await browser.newContext({ acceptDownloads: true }), pg = await ctx.newPage(), errors = []; pg.on('pageerror', e => errors.push(e.message));
  try {
    await pg.goto(url); await pg.waitForSelector('#app .stats'); assert.match(await pg.locator('#savestate').textContent(), /navegador/);
    await nav(pg, 'clients'); await pg.click('[data-act=new][data-type=client]'); await fill(pg, { name: 'Local Cliente', phone: '3000000000' }); await pg.setInputFiles('#mbody input[type=file]', pdf(files, 'nota.pdf')); await submit(pg);
    await closed(pg); await pg.reload(); await pg.waitForSelector('#app .stats'); await nav(pg, 'clients'); assert.match(await pg.locator('#app').textContent(), /Local Cliente/);
    await pg.click('tr:has-text("Local Cliente")'); await pg.waitForSelector('#mbody .file');
    const [d] = await Promise.all([pg.waitForEvent('download'), pg.click('#mbody [data-act=file-download]')]); assert.strictEqual(fs.readFileSync(await d.path(), 'utf8'), '%PDF-1.4 prueba');
    assert.deepStrictEqual(errors, []);
  } finally { await ctx.close(); await browser.close(); }
});

test('barrido: cada botón visible de cada pantalla responde sin errores', { skip, timeout: 180000 }, async () => {
  const app = createServer({ dataDir: tmp() }), port = await app.listen(0), base = 'http://127.0.0.1:' + port, browser = await launch();
  const { ctx, pg, errors } = await open(browser, base + '/');
  const SAFE_DOWNLOADS = /^(export-csv|export-backup)$/; let clicked = 0;
  try {
    // dejar datos para que existan botones de fila (venta con saldo, cotización pendiente, adjunto)
    await pg.evaluate(async () => {}); await nav(pg, 'commercial');
    await pg.click('[data-act=new][data-type=quote]'); await fill(pg, { description: 'Q', amount: 10 }); await submit(pg);
    await pg.click('[data-act=new][data-type=sale]'); await fill(pg, { description: 'S', total: 100, paid: 10 }); await submit(pg);
    for (const p of PAGES) {
      await nav(pg, p); const n = await pg.locator('#app [data-act], #app button, #app label.btn').count();
      for (let i = 0; i < n; i++) {
        await nav(pg, p); const el = pg.locator('#app [data-act], #app button').nth(i); if (!(await el.isVisible())) continue;
        const act = await el.getAttribute('data-act'); if (act === 'reset-data') { /* se abre la confirmación; se cancela abajo */ }
        if (SAFE_DOWNLOADS.test(act || '')) await Promise.all([pg.waitForEvent('download'), el.click()]); else await el.click(); clicked++;
        // cerrar lo que se haya abierto sin ejecutar acciones destructivas
        for (let k = 0; k < 3 && await modal(pg).count(); k++) { const no = pg.locator('[data-act=confirm-no]'); if (await no.count()) await no.click(); else await pg.keyboard.press('Escape'); }
      }
    }
    assert.ok(clicked > 40, 'se pulsaron ' + clicked + ' botones');
    assert.deepStrictEqual(errors.filter(e => !/Failed to load resource/.test(e)), []);
  } finally { await ctx.close(); await browser.close(); await app.close(); }
});

test('migración: datos de la 1.05 en el navegador pasan al servidor la primera vez', { skip, timeout: 60000 }, async () => {
  const app = createServer({ dataDir: tmp() }), port = await app.listen(0), base = 'http://127.0.0.1:' + port, browser = await launch();
  const legacy = { profile: { name: 'Negocio viejo', type: 'retail', currency: 'USD', language: 'en', modules: [] }, clients: [{ id: 1, name: 'Cliente 1.05', phone: '3001112233' }], services: [{ id: 1, name: 'S', price: 5, duration: 10 }], appointments: [{ id: 1, clientId: 1, serviceId: 1, date: '2026-11-04', time: '09:00', status: 'Confirmada', price: 5 }], payments: [], products: [], orders: [], quotes: [], sales: [{ id: 4, clientId: 1, description: 'Vieja', total: 100, paid: 30, date: '2026-11-01' }], inventoryMovements: [] };
  const ctx = await browser.newContext(), pg = await ctx.newPage();
  await pg.addInitScript(d => { if (!localStorage.getItem('lukaris-beta-v02')) localStorage.setItem('lukaris-beta-v02', d); }, JSON.stringify(legacy));
  try {
    await pg.goto(base + '/'); await pg.waitForSelector('#app .stats'); await waitSaved(pg);
    const data = await serverDb(base); assert.strictEqual(data.profile.name, 'Negocio viejo'); assert.strictEqual(data.meta.schemaVersion, 4);
    assert.strictEqual(data.sales[0].paid, 30); assert.deepStrictEqual(data.attachments, []); assert.match(await pg.locator('#topbiz').textContent(), /Negocio viejo/);
  } finally { await ctx.close(); await browser.close(); await app.close(); }
});
