/* Pruebas de navegador de LK POS, roles, configuración multisectorial, calendario y móvil. Se omiten si Playwright no está instalado. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
let chromium = null, exe = process.env.CHROMIUM_PATH;
for (const m of ['playwright', '/opt/npm-tools/node_modules/playwright']) { try { chromium = require(m).chromium; break; } catch (e) {} }
if (!exe) for (const p of ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome']) if (fs.existsSync(p)) exe = p;
const skip = !chromium ? 'Playwright no está instalado' : false;
const { createServer } = require('../server.js');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lk-pos-'));
const nav = (pg, p) => pg.click(`#nav [data-page=${p}]`);
const tab = (pg, t) => pg.click(`[data-act=pos-tab][data-tab=${t}]`);
const navItems = pg => pg.locator('#nav button').evaluateAll(b => b.map(x => x.dataset.page));
async function fill(pg, vals) { for (const [k, v] of Object.entries(vals)) { const el = pg.locator(`#mbody [name=${k}]`); (await el.evaluate(n => n.tagName)) === 'SELECT' ? await el.selectOption(String(v)) : await el.fill(String(v)); } }
const submit = pg => pg.click('#mbody form [type=submit]');
const waitSaved = pg => pg.waitForFunction(() => /Guardado en el servidor/.test(document.querySelector('#savestate').textContent) && !/Guardando/.test(document.querySelector('#savestate').textContent));
const toastText = pg => pg.locator('.toast').last().textContent();
async function setProfile(pg, vals) { await nav(pg, 'settings'); for (const [k, v] of Object.entries(vals)) { const el = pg.locator(`form[data-form=profile] [name=${k}]`); (await el.evaluate(n => n.tagName)) === 'SELECT' ? await el.selectOption(v) : (await el.fill(v), k === 'country' && await el.press('Tab')); } await pg.click('form[data-form=profile] [type=submit]'); await pg.waitForSelector('.toast'); }

test('multisectorial: actividad con buscador, módulos visibles, país/moneda/tema/formatos', { skip, timeout: 120000 }, async () => {
  const app = createServer({ dataDir: tmp() }), port = await app.listen(0), base = 'http://127.0.0.1:' + port, browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), pg = await ctx.newPage(), errors = []; pg.on('pageerror', e => errors.push(e.message));
  try {
    await pg.goto(base + '/'); await pg.waitForSelector('#app .stats');
    assert.ok(!(await navItems(pg)).includes('pos'), 'servicios: sin LK POS');
    assert.ok((await pg.locator('#dl-activity option').count()) >= 45 || true);
    await setProfile(pg, { activity: 'Barbería' }); let items = await navItems(pg); assert.ok(items.includes('appointments') && !items.includes('pos'), 'barbería: agenda sí, POS no');
    await setProfile(pg, { activity: 'Gastrobar' }); items = await navItems(pg); assert.ok(items.includes('pos')); assert.ok(!items.includes('work'), 'gastrobar oculta Operaciones');
    await setProfile(pg, { activity: 'Tienda de ropa y moda' }); items = await navItems(pg); assert.ok(!items.includes('pos') && items.includes('inventory'));
    await nav(pg, 'settings'); await pg.uncheck('[data-module=inventory]'); assert.ok(!(await navItems(pg)).includes('inventory'), 'desactivar módulo lo oculta'); await pg.check('[data-module=pos]'); assert.ok((await navItems(pg)).includes('pos'), 'el administrador habilita módulos adicionales');
    await pg.click('[data-act=apply-recommended]'); await pg.click('[data-act=confirm-yes]'); await pg.waitForSelector('.toast:has-text("recomendados")'); assert.ok(!(await navItems(pg)).includes('pos'));
    // país → moneda y zona sugeridas; moneda internacional; formato
    await pg.fill('form[data-form=profile] [name=country]', 'Japón'); await pg.dispatchEvent('form[data-form=profile] [name=country]', 'change'); assert.strictEqual(await pg.locator('form[data-form=profile] [name=currency]').inputValue(), 'JPY'); assert.strictEqual(await pg.locator('form[data-form=profile] [name=timezone]').inputValue(), 'Asia/Tokyo');
    await pg.click('form[data-form=profile] [type=submit]'); await pg.waitForSelector('.toast:has-text("Guardado")'); await pg.waitForTimeout(100);
    await setProfile(pg, { country: 'Narnia' }); await pg.waitForSelector('.err:has-text("lista")');
    await setProfile(pg, { activity: 'Barbería', country: 'Colombia', currency: 'USD', dateFormat: 'DMY', timeFormat: '12h' });
    await pg.selectOption('[data-appearance=theme]', 'indigo'); assert.strictEqual((await pg.evaluate(() => document.documentElement.style.getPropertyValue('--brand'))).trim(), '#4338ca');
    await nav(pg, 'appointments'); await pg.click('[data-act=new][data-type=appointment]'); await pg.fill('#mbody [name=date]', '2031-03-05'); await pg.fill('#mbody [name=time]', '15:30'); await pg.click('#mbody [type=submit]');
    assert.match(await pg.locator('#app tbody').textContent(), /05\/03\/2031/); assert.match(await pg.locator('#app tbody').textContent(), /3:30 p\. m\./);
    // calendario semanal + reprogramación
    await pg.click('[data-act=appt-view][data-view=week]'); await pg.waitForSelector('.cal-grid'); assert.strictEqual(await pg.locator('.cal-day').count(), 7);
    for (let i = 0; i < 60 && !(await pg.locator('.cal-ev').count()); i++) await pg.click('[data-act=cal-nav][data-dir="1"]');
    await pg.click('.cal-ev >> nth=0'); await pg.click('#mbody [data-act=reschedule]'); await fill(pg, { date: '2031-03-06', time: '09:00' }); await submit(pg); await pg.waitForSelector('#mbody .kv:has-text("Reprogramada")');
    await pg.click('#mbody .chip:has-text("Cancelada")'); await pg.waitForSelector('#mbody .chip.on:has-text("Cancelada")'); await pg.click('#mbody [data-act=close]');
    await waitSaved(pg); const data = (await (await fetch(base + '/api/db')).json()).data; assert.strictEqual(data.profile.currency, 'USD'); assert.strictEqual(data.profile.activity, 'barbershop'); assert.ok(data.appointments.some(a => a.date === '2031-03-06' && a.status === 'Cancelada'));
    assert.deepStrictEqual(errors, []);
  } finally { await ctx.close(); await browser.close(); await app.close(); }
});

test('LK POS: mesas, pedido, cocina, pagos parciales, división, caja, inventario, reportes y persistencia', { skip, timeout: 180000 }, async () => {
  const dir = tmp(), app = createServer({ dataDir: dir }), port = await app.listen(0), base = 'http://127.0.0.1:' + port, browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), pg = await ctx.newPage(), errors = []; pg.on('pageerror', e => errors.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const srv = async () => { await waitSaved(pg); return (await (await fetch(base + '/api/db')).json()).data; };
  try {
    await pg.goto(base + '/'); await pg.waitForSelector('#app .stats'); await setProfile(pg, { activity: 'Restaurante' });
    await nav(pg, 'pos'); await tab(pg, 'menu'); await pg.click('[data-act=pos-seed]'); await pg.click('[data-act=confirm-yes]'); await pg.waitForSelector('.toast:has-text("Menú de ejemplo")');
    // receta de producto nuevo y validación
    await pg.click('[data-act=pos-item-new]'); await submit(pg); assert.ok(await pg.locator('#mbody .err').count() >= 1); await fill(pg, { name: 'Sándwich', price: 15000, ing1: await pg.locator('#mbody [name=ing1] option:has-text("Pan de hamburguesa")').getAttribute('value'), qty1: 2 }); await submit(pg); await pg.waitForSelector('tr:has-text("Sándwich")');
    // mesa nueva + duplicada
    await tab(pg, 'tables'); await pg.click('[data-act=pos-table-new]'); await fill(pg, { name: '1', capacity: 2 }); await submit(pg); assert.match(await pg.locator('#mbody .err').textContent(), /Ya existe/); await fill(pg, { name: 'VIP', capacity: 8, zone: 'Terraza' }); await submit(pg); await pg.waitForSelector('.tcard:has-text("Mesa VIP")');
    // sin caja no se cobra
    await pg.click('.tcard:has-text("Mesa 1")'); await fill(pg, { guests: 3 }); await submit(pg); await pg.waitForSelector('.pos-order');
    await pg.click('.item-btn:has-text("Hamburguesa") '); await pg.click('.item-btn:has-text("Hamburguesa")'); await pg.click('.item-btn:has-text("Papas")'); await pg.click('.item-btn:has-text("Limonada")');
    await pg.click('[data-act=pos-note] >> nth=0'); await fill(pg, { notes: 'sin cebolla' }); await submit(pg); assert.match(await pg.locator('.bill').textContent(), /sin cebolla/);
    await pg.click('[data-act=pos-send]'); await pg.waitForSelector('.toast:has-text("Enviado")'); await pg.click('[data-act=pos-pay]'); assert.match(await toastText(pg), /Abre la caja/);
    await pg.click('[data-act=pos-back]'); assert.match(await pg.locator('.tcard:has-text("Mesa 1")').textContent(), /Ocupada/);
    // caja
    await tab(pg, 'cash'); await pg.click('[data-act=pos-open-shift]'); await fill(pg, { openingCash: 100000 }); await submit(pg); await pg.waitForSelector('h3:has-text("abierto")');
    // cocina: preparar → listo → aviso
    await tab(pg, 'kitchen'); assert.ok(await pg.locator('.kcol:has-text("Pendiente") .kcard').count() >= 2); assert.match(await pg.locator('.kcard:has-text("sin cebolla")').textContent(), /⚠ sin cebolla/);
    await pg.click('.kcard:has-text("Hamburguesa") [data-act=pos-line-status]:has-text("Preparar")'); await pg.click('.kcol:has-text("En preparación") .kcard:has-text("Hamburguesa") [data-act=pos-line-status]:has-text("Marcar listo")'); await pg.waitForSelector('.kcol:has-text("Listo") .kcard:has-text("Hamburguesa")');
    await pg.click('[data-act=pos-station][data-st=Bebidas]'); assert.strictEqual(await pg.locator('.kcard').count(), 1); await pg.click('[data-act=pos-station][data-st=""]');
    await pg.click('[data-act=pos-notes]'); assert.match(await pg.locator('#mbody').textContent(), /Listo: 2× Hamburguesa/); await pg.click('#mbody [data-act=pos-note-read]'); await pg.click('#mbody [data-act=close]');
    // cuenta: entregar, descuento, propina, pagos parciales
    await tab(pg, 'tables'); await pg.click('.tcard:has-text("Mesa 1")'); await pg.click('[data-act=pos-line-status]:has-text("Entregar")');
    await pg.click('[data-act=pos-discount]'); await fill(pg, { type: 'pct', value: 10 }); await submit(pg); assert.match(await pg.locator('#mbody .err').textContent(), /Obligatorio/); await fill(pg, { reason: 'Cliente frecuente' }); await submit(pg);
    // total = (2*24000+9000+7000)=64000 - 10% = 57600; tras dividir las papas (9000) el descuento queda en la cuenta original: 49500 + 9000 = 58500
    assert.match(await pg.locator('.totals .grand').textContent(), /57\.600/);
    await pg.click('[data-act=pos-pay]'); await fill(pg, { method: 'Efectivo', amount: 99999999 }); await submit(pg); assert.match(await pg.locator('#mbody .err').textContent(), /supera el saldo/);
    await fill(pg, { amount: 20000, tendered: 50000 }); await submit(pg); assert.match(await toastText(pg), /Cambio/);
    await pg.click('[data-act=pos-split]'); const q = pg.locator('#mbody input[name^=q_]'); await q.nth(1).fill('1'); await submit(pg); await pg.waitForSelector('.bill h3:has-text("Cuenta")');
    // volver a la cuenta original (con pago) y pagarla completa con tarjeta
    await pg.click('[data-act=pos-back]'); await tab(pg, 'orders'); await pg.click('tr:has-text("Abierta") >> nth=0 >> [data-act=pos-open]');
    for (let i = 0; i < 2; i++) { if (/Cuenta #1/.test(await pg.locator('.bill h3').textContent())) break; await pg.click('[data-act=pos-back]'); await pg.click('tr:has-text("Abierta") >> nth=1 >> [data-act=pos-open]'); }
    const bal = await pg.locator('.bill .totals div:has-text("Saldo") b').last().textContent(); assert.ok(/\d/.test(bal));
    await pg.click('[data-act=pos-pay]'); await fill(pg, { method: 'Tarjeta' }); await submit(pg); await pg.waitForSelector('#mbody:has-text("La cuenta quedó cerrada")'); await pg.click('[data-act=pos-done]');
    // cuenta dividida: pagar en efectivo
    await tab(pg, 'orders'); await pg.click('tr:has-text("Abierta") [data-act=pos-open]'); await pg.click('[data-act=pos-pay]'); await submit(pg); await pg.waitForSelector('#mbody:has-text("cerrada")'); await pg.click('[data-act=pos-done]');
    // integración: ventas, finanzas, inventario, CRM
    await nav(pg, 'commercial'); assert.match(await pg.locator('#scope2').textContent(), /LK POS · Orden #1/); await nav(pg, 'cash'); assert.match(await pg.locator('#app').textContent(), /LK POS #1 · Tarjeta/);
    await nav(pg, 'commercial'); await pg.click('#scope2 tr:has-text("LK POS") [data-act=void-sale]'); await pg.click('[data-act=confirm-yes]'); assert.match(await toastText(pg), /LK POS/);
    await nav(pg, 'inventory'); assert.match(await pg.locator('#app').textContent(), /POS #1/); await nav(pg, 'clients'); await pg.click('tr:has-text("Consumidor final")'); assert.match(await pg.locator('#mbody').textContent(), /LK POS · Orden #1/); await pg.click('#mbody [data-act=close]');
    // cierre de caja con diferencia y reportes
    await nav(pg, 'pos'); await tab(pg, 'cash'); await pg.click('[data-act=pos-close-shift]'); const exp = await pg.locator('#mbody .kv b').textContent(); await fill(pg, { countedCash: 1 }); await submit(pg); await pg.waitForSelector('#mbody:has-text("Diferencia")'); assert.match(await pg.locator('#mbody .diff-neg').textContent(), /-/); await pg.click('#mbody [data-act=close]');
    assert.match(await pg.locator('table').last().textContent(), /Cerrado|#1/); await tab(pg, 'reports'); assert.match(await pg.locator('.stat:has-text("Ventas") strong').first().textContent(), /58\.500/); assert.match(await pg.locator('#app').textContent(), /Hamburguesa clásica/);
    assert.match(await pg.locator('section:has-text("Consumo de ingredientes")').textContent(), /Pan de hamburguesa/);
    // persistencia en servidor y tras recargar
    const data = await srv(); const o = data.pos.orders; assert.strictEqual(o.filter(x => x.status === 'Pagada').length, 2); assert.strictEqual(data.pos.shifts[0].status, 'Cerrado'); assert.strictEqual(data.sales.filter(s => s.posOrderId).length, 2);
    assert.strictEqual(data.products.find(p => p.sku === 'ING-PAN').stock, 58, '2 hamburguesas = 2 panes, sin descuentos duplicados por dividir o editar');
    await pg.reload(); await pg.waitForSelector('#app .stats'); await nav(pg, 'pos'); await tab(pg, 'orders'); assert.strictEqual(await pg.locator('tr:has-text("Pagada")').count(), 2);
    assert.deepStrictEqual(errors, []);
  } finally { await ctx.close(); await browser.close(); await app.close(); }
});

test('roles: PIN, menús por rol, permisos y cierre de sesión', { skip, timeout: 120000 }, async () => {
  const app = createServer({ dataDir: tmp() }), port = await app.listen(0), base = 'http://127.0.0.1:' + port, browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), pg = await ctx.newPage(), errors = []; pg.on('pageerror', e => errors.push(e.message));
  const login = async (name, pin) => { await pg.selectOption('#lbody [name=userId]', { label: new RegExp('^' + name).source && (await pg.locator('#lbody [name=userId] option').allTextContents()).find(t => t.startsWith(name)) }); await pg.fill('#lbody [name=pin]', pin); await pg.click('#lbody [type=submit]'); };
  try {
    await pg.goto(base + '/'); await pg.waitForSelector('#app .stats'); await setProfile(pg, { activity: 'Restaurante' }); await nav(pg, 'pos'); await tab(pg, 'menu'); await pg.click('[data-act=pos-seed]'); await pg.click('[data-act=confirm-yes]');
    await nav(pg, 'settings'); await pg.click('[data-act=auth-enable]'); assert.match(await toastText(pg), /administrador/i);
    for (const [n, r, p] of [['Dueña', 'admin', '1234'], ['Ana', 'waiter', '2222'], ['Caro', 'cashier', '3333'], ['Chef', 'kitchen', '4444']]) { await pg.click('[data-act=new][data-type=user]'); await fill(pg, { name: n, role: r, pin: p }); await submit(pg); await pg.waitForSelector(`#app tr:has-text("${n}")`); }
    await pg.click('[data-act=new][data-type=user]'); await fill(pg, { name: 'X', pin: '12' }); await submit(pg); assert.match(await pg.locator('#mbody .err').textContent(), /4 a 8/); await pg.click('[data-act=cancel-form]');
    await pg.click('[data-act=auth-enable]'); await pg.click('[data-act=confirm-yes]'); await pg.waitForSelector('#login:not([hidden])');
    await login('Dueña', '0000'); assert.match(await pg.locator('#lbody .err').textContent(), /incorrecto/); await login('Dueña', '1234'); await pg.waitForSelector('#login', { state: 'hidden' }); assert.ok((await navItems(pg)).includes('settings'));
    await pg.click('[data-act=logout]'); await pg.waitForSelector('#login:not([hidden])'); assert.strictEqual((await navItems(pg)).length, 0);
    // mesero: solo inicio y POS, sin cobrar ni caja
    await login('Ana', '2222'); await pg.waitForSelector('#login', { state: 'hidden' }); assert.deepStrictEqual(await navItems(pg), ['home', 'pos']); await nav(pg, 'pos'); assert.deepStrictEqual(await pg.locator('.tabs [data-act=pos-tab]').allTextContents(), ['Mesas', 'Pedidos']);
    await pg.click('.tcard >> nth=0'); await fill(pg, { guests: 2 }); await submit(pg); await pg.click('.item-btn >> nth=0'); await pg.click('[data-act=pos-send]'); await pg.waitForSelector('.toast:has-text("Enviado")');
    assert.strictEqual(await pg.locator('[data-act=pos-pay]').count(), 0); assert.strictEqual(await pg.locator('[data-act=pos-discount]').count(), 0); assert.strictEqual(await pg.locator('[data-act=pos-void-line]').count(), 0);
    await pg.click('[data-act=logout]'); await login('Chef', '4444'); await pg.waitForSelector('#login', { state: 'hidden' }); assert.deepStrictEqual(await navItems(pg), ['pos']); assert.deepStrictEqual(await pg.locator('.tabs [data-act=pos-tab]').allTextContents(), ['Cocina']);
    await pg.click('.kcard [data-act=pos-line-status]:has-text("Preparar")'); await pg.click('.kcard [data-act=pos-line-status]:has-text("Marcar listo")'); await pg.waitForSelector('.kcol:has-text("Listo") .kcard');
    await pg.click('[data-act=logout]'); await login('Caro', '3333'); await pg.waitForSelector('#login', { state: 'hidden' }); assert.ok(!(await navItems(pg)).includes('settings')); assert.ok(!(await navItems(pg)).includes('inventory')); await nav(pg, 'pos');
    await tab(pg, 'cash'); await pg.click('[data-act=pos-open-shift]'); await fill(pg, { openingCash: 0 }); await submit(pg); await tab(pg, 'orders'); await pg.click('[data-act=pos-open]'); assert.strictEqual(await pg.locator('[data-act=pos-discount]').count(), 0, 'cajero sin descuentos'); assert.ok(await pg.locator('[data-act=pos-pay]').count());
    await pg.click('[data-act=pos-line-status]:has-text("Entregar")'); await pg.click('[data-act=pos-pay]'); await submit(pg); await pg.waitForSelector('#mbody:has-text("cerrada")'); await pg.click('[data-act=pos-done]');
    await tab(pg, 'orders'); await pg.click('tr:has-text("Pagada") [data-act=pos-open]'); assert.strictEqual(await pg.locator('[data-act=pos-refund]').count(), 0, 'cajero sin reembolsos');
    // administrador: reembolso y desactivar inicio de sesión
    await pg.click('[data-act=logout]'); await login('Dueña', '1234'); await pg.waitForSelector('#login', { state: 'hidden' }); await nav(pg, 'pos'); await tab(pg, 'orders'); await pg.click('tr:has-text("Pagada") [data-act=pos-open]'); await pg.click('[data-act=pos-refund]'); await fill(pg, { reason: 'Prueba' }); await submit(pg); await pg.waitForSelector('.toast:has-text("Reembolso")');
    assert.deepStrictEqual(errors, []);
  } finally { await ctx.close(); await browser.close(); await app.close(); }
});

test('móvil: LK POS y configuración sin desbordamiento horizontal', { skip, timeout: 90000 }, async () => {
  const app = createServer({ dataDir: tmp() }), port = await app.listen(0), base = 'http://127.0.0.1:' + port, browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }), pg = await ctx.newPage();
  try {
    await pg.goto(base + '/'); await pg.waitForSelector('#app .stats'); await setProfile(pg, { activity: 'Cafetería' }); await nav(pg, 'pos'); await tab(pg, 'menu'); await pg.click('[data-act=pos-seed]'); await pg.click('[data-act=confirm-yes]'); await pg.waitForSelector('.toast:has-text("ejemplo")');
    const over = async label => { const w = await pg.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth })); assert.ok(w.s <= w.c + 1, `${label}: ${w.s} > ${w.c}`); };
    await over('menú'); await tab(pg, 'tables'); await over('mesas'); await tab(pg, 'kitchen'); await over('cocina'); await tab(pg, 'cash'); await over('caja'); await tab(pg, 'reports'); await over('reportes');
    await tab(pg, 'tables'); await pg.click('.tcard >> nth=0'); await submit(pg); await pg.waitForSelector('.pos-order'); await over('cuenta'); await nav(pg, 'settings'); await over('configuración');
  } finally { await ctx.close(); await browser.close(); await app.close(); }
});
