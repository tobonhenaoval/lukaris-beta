const test = require('node:test'), assert = require('node:assert'), crypto = require('crypto');
const C = require('../core.js'), P = require('../pos-core.js'), K = require('../catalog.js'), A = require('../automation-core.js');
const waiter = { id: 901, name: 'Ana', role: 'waiter' }, cashier = { id: 902, name: 'Caja', role: 'cashier' }, kitchen = { id: 903, name: 'Chef', role: 'kitchen' }, manager = { id: 904, name: 'Gerente', role: 'manager' };
const prod = (db, sku) => db.products.find(p => p.sku === sku);
function setup() {
  const db = C.defaultDb(); P.seedExample(db); db.users.push({ id: 901, name: 'Ana', role: 'waiter', active: true }, { id: 902, name: 'Caja', role: 'cashier', active: true });
  const t = db.pos.tables[0], burger = db.pos.menu.find(m => m.name === 'Hamburguesa clásica'), fries = db.pos.menu.find(m => m.name === 'Papas fritas'), lemon = db.pos.menu.find(m => m.name === 'Limonada natural');
  return { db, t, burger, fries, lemon };
}
const openOrder = (db, t, actor) => P.newOrder(db, { type: 'Mesa', tableId: t.id }, actor).id;

test('SHA-256 propio coincide con crypto y el PIN no se guarda en claro', () => {
  for (const s of ['', 'abc', 'ñandú 😀'.repeat(30), 'a'.repeat(56)]) assert.strictEqual(K.sha256(s), crypto.createHash('sha256').update(s).digest('hex'));
  const salt = K.newSalt(), h = K.hashPin('1234', salt); assert.notStrictEqual(h, K.hashPin('1235', salt)); assert.ok(!h.includes('1234')); assert.strictEqual(h, K.hashPin('1234', salt));
});
test('actividades: LK POS solo se recomienda en gastronomía; buscador de países y monedas', () => {
  const food = K.ACTIVITIES.filter(a => a.sector === 'food'); assert.ok(food.length >= 15); assert.ok(food.every(a => a.modules.includes('pos')));
  for (const id of ['barbershop', 'clothing', 'realestate', 'hardware', 'clinic']) assert.ok(!K.findActivity(id).modules.includes('pos'), id);
  assert.strictEqual(K.findActivity('gastrobar').sector, 'food'); assert.strictEqual(K.findActivity('Heladería').id, 'icecream');
  assert.strictEqual(K.findCountry('colombia')[2], 'COP'); assert.ok(K.CURRENCIES.length >= 40);
  const db = C.defaultDb(); const r = C.validate('profile', { name: 'X', activity: 'Pizzería', country: 'México', currency: 'MXN', language: 'es', timezone: 'America/Mexico_City', accountMode: 'both' }, db);
  assert.ok(r.ok, JSON.stringify(r.errors)); assert.strictEqual(r.value.type, 'food'); assert.strictEqual(r.value.country, 'México');
  assert.ok(C.validate('profile', { name: 'X', activity: 'inexistente', currency: 'USD', language: 'es', timezone: 'UTC', accountMode: 'both' }, db).errors.activity);
  const before = JSON.stringify(db.clients); C.commit(db, 'profile', r.value); assert.strictEqual(JSON.stringify(db.clients), before, 'cambiar actividad no borra datos'); assert.ok(C.recommendedModules(db.profile).includes('pos'));
});
test('mesas: crear, editar, estados automáticos y eliminación protegida', () => {
  const { db, t } = setup(); assert.strictEqual(P.tableStatus(db, t).status, 'Libre');
  const v = P.validate('pos-table', { name: '1', capacity: 4 }, db); assert.ok(v.errors.name, 'nombre duplicado');
  const nv = P.validate('pos-table', { name: 'VIP', capacity: 8, zone: 'Salón' }, db); assert.ok(nv.ok); const id = P.saveTable(db, nv.value).id; assert.ok(P.findTable(db, id));
  assert.ok(P.saveTable(db, { ...nv.value, capacity: 10 }, id).ok); assert.strictEqual(P.findTable(db, id).capacity, 10);
  assert.ok(P.reserveTable(db, t.id, { name: 'Pérez', time: '20:00' }).ok); assert.strictEqual(P.tableStatus(db, t).status, 'Reservada');
  const o = openOrder(db, t); assert.strictEqual(P.tableStatus(db, t).status, 'Ocupada'); assert.strictEqual(t.reservation, null);
  assert.match(P.removeTable(db, t.id).error, /cuenta abierta/); P.cancelOrder(db, o, { reason: '' }); assert.strictEqual(P.tableStatus(db, t).status, 'Libre'); assert.ok(P.removeTable(db, t.id).ok);
});
test('pedido: líneas, notas, cantidades, envío a cocina y descuento de inventario sin duplicar', () => {
  const { db, t, burger, fries } = setup(), o = openOrder(db, t, waiter), ord = () => P.findOrder(db, o);
  const l1 = P.addLine(db, o, { itemId: burger.id, qty: 2, notes: 'sin cebolla' }, waiter).id; assert.ok(P.addLine(db, o, { itemId: fries.id }, waiter).ok);
  assert.strictEqual(P.addLine(db, o, { itemId: burger.id, qty: 1, notes: 'sin cebolla' }, waiter).id, l1, 'agrupa líneas iguales'); assert.strictEqual(ord().lines[0].qty, 3);
  assert.ok(P.setLineQty(db, o, l1, 2, waiter).ok); const pan = prod(db, 'ING-PAN'), papa = prod(db, 'ING-PAPA'); assert.strictEqual(pan.stock, 60, 'borrador no descuenta');
  assert.ok(P.sendToKitchen(db, o, waiter).ok); assert.strictEqual(pan.stock, 58); assert.strictEqual(papa.stock, 19.75); assert.strictEqual(prod(db, 'ING-CARNE').stock, 48);
  assert.match(P.setLineQty(db, o, l1, 5, waiter).error, /ya se envió/); assert.ok(!P.sendToKitchen(db, o, waiter).ok, 'nada nuevo que enviar');
  P.addLine(db, o, { itemId: burger.id }, waiter); P.sendToKitchen(db, o, waiter); assert.strictEqual(pan.stock, 57, 'solo la línea nueva descuenta');
  const mv = db.inventoryMovements.filter(m => m.posOrderId === o); assert.ok(mv.every(m => m.type === 'Salida' && /POS #/.test(m.reason))); assert.strictEqual(mv.length, 7, '3 ingredientes×hamburguesa + 1 papa + 3 de la nueva hamburguesa');
  db.products.forEach(p => { if (p.sku === 'ING-QUESO') p.stock = 1; }); P.addLine(db, o, { itemId: burger.id, qty: 3 }, waiter); const r = P.sendToKitchen(db, o, waiter); assert.ok(!r.ok); assert.match(r.error, /Inventario insuficiente/); assert.strictEqual(pan.stock, 57, 'rechazo no descuenta nada');
});
test('cocina: estados, notificación al mesero y permisos', () => {
  const { db, t, burger } = setup(), o = openOrder(db, t, waiter); const lid = P.addLine(db, o, { itemId: burger.id }, waiter).id; P.sendToKitchen(db, o, waiter);
  assert.strictEqual(P.kitchenLines(db, { station: 'Cocina' }).length, 1); assert.strictEqual(P.kitchenLines(db, { station: 'Bebidas' }).length, 0);
  assert.match(P.setLineStatus(db, o, lid, 'En preparación', waiter).error, /permiso/); assert.ok(P.setLineStatus(db, o, lid, 'En preparación', kitchen).ok); assert.ok(P.setLineStatus(db, o, lid, 'Listo', kitchen).ok);
  assert.strictEqual(db.pos.notifications.length, 1); assert.match(db.pos.notifications[0].text, /Listo: 1× Hamburguesa/); assert.ok(P.setLineStatus(db, o, lid, 'Entregado', waiter).ok);
  assert.ok(!P.setLineStatus(db, o, lid, 'Pendiente', kitchen).ok);
});
test('totales: impuesto (sumado e incluido), descuento autorizado y propina', () => {
  const { db, t, burger } = setup(); db.pos.settings.taxRate = 19; let o = openOrder(db, t); P.addLine(db, o, { itemId: burger.id, qty: 2 }); let tt = P.totals(db, P.findOrder(db, o)); assert.strictEqual(tt.subtotal, 48000); assert.strictEqual(tt.tax, 9120); assert.strictEqual(tt.total, 57120);
  assert.match(P.applyDiscount(db, o, { type: 'pct', value: 10, reason: 'cortesía' }, waiter).error, /permiso/); assert.ok(P.applyDiscount(db, o, { type: 'pct', value: 10, reason: 'cortesía' }, manager).ok);
  tt = P.totals(db, P.findOrder(db, o)); assert.strictEqual(tt.discount, 4800); assert.strictEqual(tt.total, 51408); assert.ok(P.setTip(db, o, { mode: 'pct', value: 10 }, waiter).ok); assert.strictEqual(P.totals(db, P.findOrder(db, o)).tip, 4320);
  db.pos.settings.taxIncluded = true; const o2 = openOrder(db, db.pos.tables[1]); P.addLine(db, o2, { itemId: burger.id }); tt = P.totals(db, P.findOrder(db, o2)); assert.strictEqual(tt.total, 24000); assert.strictEqual(tt.tax, 3831.93); assert.strictEqual(P.totals(db, P.findOrder(db, o)).total, 51408 + 4320, 'la cuenta abierta conserva su configuración');
});
test('pagos: exigen caja, no superan el saldo, parciales, cierre único y registros consistentes', () => {
  const { db, t, burger, lemon } = setup(), o = openOrder(db, t, waiter); P.addLine(db, o, { itemId: burger.id }); P.addLine(db, o, { itemId: lemon.id }); const ord = () => P.findOrder(db, o);
  P.sendToKitchen(db, o); assert.match(P.pay(db, o, { method: 'Efectivo', amount: 1000 }, cashier).error, /Abre la caja/); assert.match(P.openShift(db, { openingCash: 0 }, waiter).error, /permiso/); assert.ok(P.openShift(db, { openingCash: 50000 }, cashier).ok);
  const dr = P.addLine(db, o, { itemId: burger.id }).id; assert.match(P.pay(db, o, { method: 'Efectivo', amount: 1000 }, cashier).error, /sin enviar/i); P.setLineQty(db, o, dr, 0); assert.match(P.openShift(db, { openingCash: 1 }, cashier).error, /Ya hay/);
  assert.match(P.pay(db, o, { method: 'Efectivo', amount: 1000 }, waiter).error, /permiso/); assert.match(P.pay(db, o, { method: 'Efectivo', amount: 40000 }, cashier).error, /supera el saldo/); assert.match(P.pay(db, o, { method: 'Bitcoin', amount: 100 }, cashier).error, /inválido/);
  assert.match(P.pay(db, o, { method: 'Efectivo', amount: 1000, tendered: 500 }, cashier).error, /menor/);
  let r = P.pay(db, o, { method: 'Efectivo', amount: 11000, tendered: 20000 }, cashier); assert.ok(r.ok && !r.closed); assert.strictEqual(r.change, 9000); assert.strictEqual(r.balance, 20000); assert.strictEqual(db.sales.length, 0, 'aún no hay venta');
  r = P.pay(db, o, { method: 'Tarjeta', amount: 20000 }, cashier); assert.ok(r.closed); assert.strictEqual(ord().status, 'Pagada');
  assert.match(P.pay(db, o, { method: 'Efectivo', amount: 1 }, cashier).error, /ya está pagada/); assert.ok(!P.closeOrder(db, o).ok);
  assert.strictEqual(db.sales.length, 1); const s = db.sales[0]; assert.strictEqual(s.total, 31000); assert.strictEqual(s.paid, 31000); assert.strictEqual(C.saleBalance(s), 0); assert.strictEqual(db.payments.filter(p => p.posOrderId).length, 2);
  assert.strictEqual(db.payments.filter(p => p.posOrderId).reduce((a, p) => a + p.amount, 0), 31000); assert.strictEqual(db.clients.find(c => c.id === s.clientId).name, 'Consumidor final');
  assert.match(C.voidSale(db, s.id).error, /LK POS/); assert.match(C.remove(db, 'payment', db.payments.find(p => p.posOrderId).id).error, /LK POS/); assert.match(C.commit(db, 'sale', { clientId: 1, description: 'x', date: '2026-01-01', total: 99999 }, s.id).error, /LK POS/);
  assert.match(C.remove(db, 'client', s.clientId).error, /No se puede eliminar/);
});
test('dividir, mover y unir cuentas sin duplicar inventario ni pagos', () => {
  const { db, t, burger, fries } = setup(), o = openOrder(db, t); const l = P.addLine(db, o, { itemId: burger.id, qty: 3 }).id; P.addLine(db, o, { itemId: fries.id, qty: 1 }); P.sendToKitchen(db, o); const pan = prod(db, 'ING-PAN').stock;
  const sp = P.splitOrder(db, o, [{ lineId: l, qty: 1 }]); assert.ok(sp.ok); assert.strictEqual(prod(db, 'ING-PAN').stock, pan, 'dividir no vuelve a descontar'); assert.strictEqual(P.totals(db, P.findOrder(db, o)).subtotal, 2 * 24000 + 9000); assert.strictEqual(P.totals(db, P.findOrder(db, sp.id)).subtotal, 24000);
  assert.ok(!P.splitOrder(db, o, [{ lineId: l, qty: 9 }]).ok); assert.strictEqual(P.tableStatus(db, t).orders.length, 2);
  assert.ok(P.mergeOrders(db, sp.id, o).ok); assert.strictEqual(P.findOrder(db, sp.id).status, 'Unida'); assert.strictEqual(P.totals(db, P.findOrder(db, o)).subtotal, 3 * 24000 + 9000);
  const t2 = db.pos.tables[1]; assert.ok(P.moveOrder(db, o, t2.id).ok); assert.strictEqual(P.tableStatus(db, t).status, 'Libre'); assert.strictEqual(P.tableStatus(db, t2).status, 'Ocupada'); const o3 = openOrder(db, t); assert.match(P.moveOrder(db, o3, t2.id).error, /ocupada/);
});
test('caja: esperado, retiros, arqueo y diferencias; reembolso controlado', () => {
  const { db, t, burger } = setup(); P.openShift(db, { openingCash: 100000 }, cashier); const o = openOrder(db, t); P.addLine(db, o, { itemId: burger.id }); P.sendToKitchen(db, o);
  P.pay(db, o, { method: 'Efectivo', amount: 24000 }, cashier); const sh = P.openShift_(db); assert.strictEqual(P.shiftSummary(db, sh).expectedCash, 124000);
  assert.ok(P.cashMove(db, { type: 'Ingreso', amount: 5000, reason: 'Cambio' }, cashier).ok); assert.ok(P.cashMove(db, { type: 'Retiro', amount: 20000, reason: 'Proveedor' }, cashier).ok); assert.ok(!P.cashMove(db, { type: 'Retiro', amount: 999999, reason: 'x' }, cashier).ok); assert.ok(!P.cashMove(db, { type: 'Retiro', amount: 1, reason: '' }, cashier).ok);
  assert.strictEqual(P.shiftSummary(db, sh).expectedCash, 109000);
  const pan = prod(db, 'ING-PAN').stock; assert.match(P.refundOrder(db, o, { reason: 'x' }, cashier).error, /permiso/); const rf = P.refundOrder(db, o, { reason: 'Cliente insatisfecho', restock: true }, manager); assert.ok(rf.ok);
  assert.strictEqual(P.findOrder(db, o).status, 'Reembolsada'); assert.ok(db.sales[0].voided); assert.strictEqual(db.payments.filter(p => p.posOrderId === o).reduce((a, p) => a + p.amount, 0), 0, 'ledger neto en cero'); assert.strictEqual(prod(db, 'ING-PAN').stock, pan + 1);
  assert.match(P.refundOrder(db, o, { reason: 'otra vez' }, manager).error, /ya fue reembolsada/); assert.strictEqual(P.shiftSummary(db, sh).expectedCash, 85000);
  const c = P.closeShift(db, { countedCash: 84000 }, cashier); assert.ok(c.ok); assert.strictEqual(c.closing.difference, -1000); assert.strictEqual(sh.status, 'Cerrado'); assert.ok(!P.closeShift(db, { countedCash: 1 }, cashier).ok);
  assert.strictEqual(P.report(db).cashDifferences, -1000); assert.strictEqual(P.report(db).orders, 0, 'reembolsada no cuenta como venta'); assert.strictEqual(P.report(db).refunds.count, 1);
});
test('anular y cancelar: permisos, motivo, reposición o merma', () => {
  const { db, t, burger } = setup(), o = openOrder(db, t, waiter); const l = P.addLine(db, o, { itemId: burger.id }, waiter).id; P.sendToKitchen(db, o, waiter); const pan = prod(db, 'ING-PAN');
  assert.match(P.voidLine(db, o, l, { reason: 'x' }, waiter).error, /permiso/); assert.match(P.voidLine(db, o, l, { reason: '' }, manager).error, /motivo/); assert.match(P.cancelOrder(db, o, { reason: 'x' }, waiter).error, /permiso/);
  assert.ok(P.voidLine(db, o, l, { reason: 'Error de mesero', restock: false }, manager).ok); assert.strictEqual(pan.stock, 59, 'sin reposición queda como pérdida'); assert.strictEqual(db.pos.waste.length, 1); assert.strictEqual(P.totals(db, P.findOrder(db, o)).total, 0);
  const o2 = openOrder(db, db.pos.tables[1]); const l2 = P.addLine(db, o2, { itemId: burger.id }).id; P.sendToKitchen(db, o2); assert.ok(P.cancelOrder(db, o2, { reason: 'Se fue el cliente', restock: true }, manager).ok); assert.strictEqual(pan.stock, 59); assert.strictEqual(P.findOrder(db, o2).status, 'Cancelada');
});
test('reportes: se calculan desde operaciones reales', () => {
  const { db, t, burger, fries, lemon } = setup(); P.openShift(db, { openingCash: 0 }, cashier);
  const sell = (tb, lines, w, method = 'Efectivo') => { const o = openOrder(db, tb); P.findOrder(db, o).waiterName = w; for (const [i, q] of lines) P.addLine(db, o, { itemId: i.id, qty: q }); P.sendToKitchen(db, o); P.pay(db, o, { method, amount: P.totals(db, P.findOrder(db, o)).total }, cashier); };
  sell(t, [[burger, 2], [fries, 1]], 'Ana'); sell(db.pos.tables[1], [[lemon, 3]], 'Luis', 'Tarjeta');
  const r = P.report(db); assert.strictEqual(r.orders, 2); assert.strictEqual(r.sales, 57000 + 21000); assert.strictEqual(r.avgTicket, 39000); assert.strictEqual(r.byProduct.find(x => x.key === 'Hamburguesa clásica').qty, 2);
  assert.deepStrictEqual(r.byMethod.map(x => [x.key, x.sales]).sort(), [['Efectivo', 57000], ['Tarjeta', 21000]]); assert.strictEqual(r.byWaiter.length, 2); assert.strictEqual(r.topProducts[0].key, 'Limonada natural');
  assert.strictEqual(r.cost, 2 * (900 + 4200 + 600) + 2500 * 0.25 + 3 * 4000 * 0.15); assert.strictEqual(r.margin, r.net - r.cost); assert.strictEqual(r.ingredients.find(x => x.name === 'Pan de hamburguesa').qty, 2); assert.strictEqual(r.byDay.length, 1); assert.strictEqual(r.byCategory.length, 3);
  assert.strictEqual(P.report(db, { from: '2000-01-01', to: '2000-01-02' }).sales, 0);
});
test('domicilio y para llevar; menú: borrado con historial protegido; mermas y decimales', () => {
  const { db, burger } = setup(); assert.ok(P.validate('pos-order', { type: 'Domicilio', customerName: '', customerPhone: '', address: '' }, db).errors.address);
  const d = P.newOrder(db, { type: 'Domicilio', customerName: 'Luz', customerPhone: '300', address: 'Calle 1', fee: 5000 }); P.addLine(db, d.id, { itemId: burger.id }); assert.strictEqual(P.totals(db, P.findOrder(db, d.id)).total, 29000);
  P.sendToKitchen(db, d.id); assert.match(P.removeItem(db, burger.id).error, /historial/); assert.match(C.remove(db, 'product', prod(db, 'ING-PAN').id).error, /recetas/);
  const leche = prod(db, 'ING-LECHE'); const v = C.validate('movement', { productId: leche.id, type: 'Merma', quantity: '0.5', date: '2026-01-01' }, db); assert.ok(v.ok); C.commit(db, 'movement', v.value); assert.strictEqual(leche.stock, 19.5);
  assert.ok(P.registerWaste(db, { productId: leche.id, quantity: 1, reason: 'Vencida' }, manager).ok); assert.strictEqual(leche.stock, 18.5); assert.match(P.registerWaste(db, { productId: leche.id, quantity: 1, reason: 'x' }, waiter).error, /permiso/);
  const item = P.validate('pos-item', { name: 'Combo', categoryId: db.pos.categories[0].id, station: 'Cocina', price: '30000', ing1: prod(db, 'ING-PAN').id, qty1: '1', ing2: prod(db, 'ING-PAN').id, qty2: '1' }, db); assert.ok(item.errors.ing2, 'ingrediente repetido');
});
test('roles y permisos', () => {
  const can = (r, p) => K.can({ role: r }, p);
  assert.ok(can('admin', 'users.manage') && !can('manager', 'users.manage')); assert.ok(can('manager', 'pos.refund') && !can('cashier', 'pos.refund') && !can('waiter', 'pos.refund'));
  assert.ok(can('cashier', 'pos.pay') && can('cashier', 'pos.shift') && !can('cashier', 'pos.discount')); assert.ok(can('waiter', 'pos.orders') && !can('waiter', 'pos.pay') && !can('waiter', 'pos.shift'));
  assert.ok(can('kitchen', 'pos.kitchen') && !can('kitchen', 'pos.orders') && !can('kitchen', 'page.clients')); assert.ok(!can('employee', 'page.pos') && !can('employee', 'inventory.edit') && !can('waiter', 'page.cash'));
  const db = C.defaultDb(); const mk = (n, role, pin, e) => { const v = C.validate('user', { name: n, role, pin, active: 'yes' }, db, { editId: e }); assert.ok(v.ok, JSON.stringify(v.errors)); return C.commit(db, 'user', v.value, e); };
  const a = mk('Dueño', 'admin', '1234'); const u = db.users[0]; assert.ok(u.pinHash && !JSON.stringify(u).includes('"1234"')); assert.ok(C.validate('user', { name: 'dueño', role: 'admin', pin: '12' }, db).errors.pin && C.validate('user', { name: 'dueño', role: 'admin', pin: '5678' }, db).errors.name);
  assert.match(C.commit(db, 'user', { name: 'Dueño', role: 'waiter', active: true, pin: '' }, a.id).error, /administrador/); assert.match(C.remove(db, 'user', a.id).error, /administrador/);
});
test('migración desde 1.11: añade LK POS, usuarios e integraciones sin perder datos', () => {
  const old = JSON.parse(JSON.stringify(require('fs').readFileSync(__dirname + '/../tests/fixture-1.11.json', 'utf8') ? JSON.parse(require('fs').readFileSync(__dirname + '/../tests/fixture-1.11.json', 'utf8')) : {}));
  const db = C.migrate(old); assert.strictEqual(db.meta.schemaVersion, 5); assert.ok(db.pos && Array.isArray(db.pos.orders) && db.users && db.outbox && db.integrations.whatsapp.status === 'No conectado'); assert.strictEqual(db.clients.length, old.clients.length); assert.strictEqual(db.profile.activity, 'barbershop'); assert.ok(db.meta.nextId > 50);
  assert.ok(db.profile.modules.includes('automations'));
});
test('automatización: recordatorios idempotentes, liberación a 30 min solo tras envío real, asignación equilibrada', () => {
  const db = C.defaultDb(); db.users.push({ id: 801, name: 'P1', role: 'employee', active: true }, { id: 802, name: 'P2', role: 'employee', active: true }); db.meta.nextId = 1000;
  const now = new Date('2030-06-10T08:00:00'), at = (d, t) => db.appointments.push({ id: C.nextId(db), clientId: 1, serviceId: 1, date: d, time: t, status: 'Pendiente', price: 1, workerId: null });
  db.appointments.length = 0; at('2030-06-11', '07:00'); at('2030-06-10', '11:00'); at('2030-06-20', '10:00');
  assert.strictEqual(A.planReminders(db, now).length, 2); assert.strictEqual(A.planReminders(db, now).length, 0, 'idempotente'); assert.deepStrictEqual(db.outbox.map(m => m.kind).sort(), ['reminder1', 'reminder2']); assert.ok(db.outbox.every(m => m.status === 'Pendiente de envío' && !m.sentAt));
  assert.strictEqual(A.releaseUnconfirmed(db, new Date('2030-06-10T12:00:00')).length, 0, 'sin envío real no libera'); assert.strictEqual(A.connected(db), false);
  const m = db.outbox.find(x => x.kind === 'reminder2'); m.status = 'Enviado manualmente'; m.sentAt = '2030-06-10T08:00:00.000Z'; const ap = db.appointments[1];
  assert.strictEqual(A.releaseUnconfirmed(db, new Date(new Date(m.sentAt).getTime() + 29 * 60000)).length, 0); const rel = A.releaseUnconfirmed(db, new Date(new Date(m.sentAt).getTime() + 31 * 60000)); assert.strictEqual(rel.length, 1); assert.strictEqual(ap.status, 'Pendiente de reprogramación');
  assert.ok(C.appointmentConflicts(db, { date: ap.date, time: ap.time, serviceId: 1 }).length === 0, 'el turno liberado ya no bloquea'); assert.ok(C.rescheduleAppointment(db, ap.id, { date: '2030-06-12', time: '09:00' }).ok); assert.strictEqual(ap.status, 'Pendiente');
  const d = '2030-07-01'; const picks = []; for (let i = 0; i < 4; i++) { const w = A.pickWorker(db, { date: d, time: `${9 + i}:00`.padStart(5, '0'), serviceId: 1 }); picks.push(w); db.appointments.push({ id: C.nextId(db), clientId: 1, serviceId: 1, date: d, time: `${9 + i}:00`.padStart(5, '0'), status: 'Confirmada', price: 1, workerId: w }); }
  assert.deepStrictEqual(picks, [801, 802, 801, 802], 'equilibra por día'); assert.strictEqual(A.pickWorker(db, { date: d, time: '09:00', serviceId: 1, preferredId: 802 }), 802, 'respeta preferencia si está libre'); assert.strictEqual(A.pickWorker(db, { date: d, time: '09:00', serviceId: 1, preferredId: 801 }), 802, 'preferido ocupado → otro');
  assert.strictEqual(A.handleReply(db, ap.id, '1').ok, true); assert.strictEqual(ap.status, 'Confirmada'); assert.strictEqual(A.handleReply(db, ap.id, '3').ok, true); assert.strictEqual(ap.status, 'Cancelada'); assert.ok(!A.handleReply(db, ap.id, 'hola').ok);
});
