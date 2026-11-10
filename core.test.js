const test = require('node:test'), assert = require('node:assert');
const C = require('../core.js');
const fresh = () => C.defaultDb();
const ok = (db, type, raw, editId) => { const v = C.validate(type, raw, db, { editId }); assert.ok(v.ok, JSON.stringify(v.errors)); const r = C.commit(db, type, v.value, editId); assert.ok(r.ok, r.error); return r; };

test('migrar datos de 1.05 / 0.4 sin perder nada y fijar esquema 4', () => {
  const legacy = { profile: { name: 'Viejo', currency: 'USD' }, clients: [{ id: 7, name: 'A', phone: '1' }], services: [], appointments: [{ id: 3, clientId: 7, serviceId: 1, date: '2026-01-01', time: '09:00' }], payments: [], products: [], orders: [] };
  const db = C.migrate(legacy);
  assert.strictEqual(db.meta.schemaVersion, 4); assert.strictEqual(db.profile.name, 'Viejo'); assert.strictEqual(db.clients[0].id, 7);
  assert.deepStrictEqual(db.attachments, []); assert.strictEqual(db.appointments[0].status, 'Pendiente'); assert.ok(db.meta.nextId > 7);
  assert.strictEqual(legacy.profile.language, undefined, 'no muta la entrada');
  assert.ok(C.migrate(null).organizationUnits.length === 1);
});
test('ids nunca se repiten', () => { const db = fresh(); const a = C.nextId(db), b = C.nextId(db); assert.notStrictEqual(a, b); assert.ok(a > 2); });
test('saldo, estado y venta anulada', () => {
  assert.strictEqual(C.saleBalance({ total: 100, paid: 30 }), 70); assert.strictEqual(C.saleBalance({ total: 100, paid: 150 }), 0);
  assert.strictEqual(C.saleStatus({ total: 100, paid: 100 }), 'Pagada'); assert.strictEqual(C.saleStatus({ total: 100, paid: 10 }), 'Abono parcial');
  assert.strictEqual(C.saleStatus({ total: 100, paid: 0, voided: true }), 'Anulada'); assert.strictEqual(C.saleBalance({ total: 100, paid: 0, voided: true }), 0);
});
test('esc y CSV neutralizan HTML y fórmulas', () => {
  assert.strictEqual(C.esc('<img onerror=x>'), '&lt;img onerror=x&gt;');
  assert.strictEqual(C.csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`); assert.strictEqual(C.csvCell(-5), '-5');
});
test('fechas usan la zona local, no UTC', () => { const d = new Date(); assert.strictEqual(C.today(), `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); });

test('validación de cliente: obligatorios, correo, teléfono', () => {
  const db = fresh();
  assert.ok(C.validate('client', { name: '' , phone: '123456' }, db).errors.name);
  assert.ok(C.validate('client', { name: 'X', phone: 'abc' }, db).errors.phone);
  assert.ok(C.validate('client', { name: 'X', email: 'no-es-correo' }, db).errors.email);
  assert.ok(C.validate('client', { name: 'X' }, db).errors.phone, 'requiere teléfono o correo');
  assert.ok(C.validate('client', { name: 'X', email: 'x@y.co' }, db).ok);
});
test('CRUD de cliente: crear, editar, bloquear borrado con historial, borrar', () => {
  const db = fresh(); const { id } = ok(db, 'client', { name: ' Ana ', phone: '300 123 4567' });
  assert.strictEqual(db.clients.at(-1).name, 'Ana');
  ok(db, 'client', { name: 'Ana P', phone: '300 123 4567' }, id); assert.strictEqual(db.clients.at(-1).name, 'Ana P');
  assert.match(C.remove(db, 'client', 1).error, /tiene/);
  assert.ok(C.remove(db, 'client', id).ok); assert.ok(!db.clients.some(c => c.id === id));
});
test('cita: validaciones, conflicto de horario y estados', () => {
  const db = fresh();
  assert.ok(C.validate('appointment', { clientId: 999, serviceId: 2, date: '2026-02-30', time: '25:00', status: 'X', price: -1 }, db).errors.clientId);
  const e = C.validate('appointment', { clientId: 1, serviceId: 2, date: '2026-02-30', time: '25:00', status: 'X', price: -1 }, db).errors;
  assert.ok(e.date && e.time && e.status && e.price);
  const d = C.today(); // cita existente: hoy 10:00, servicio de 50 min
  assert.strictEqual(C.appointmentConflicts(db, { date: d, time: '10:30', serviceId: 1 }).length, 1);
  assert.strictEqual(C.appointmentConflicts(db, { date: d, time: '10:50', serviceId: 1 }).length, 0);
  assert.strictEqual(C.appointmentConflicts(db, { date: d, time: '10:30', serviceId: 1 }, 1).length, 0, 'ignora la propia cita al editar');
  db.appointments[0].status = 'Cancelada'; assert.strictEqual(C.appointmentConflicts(db, { date: d, time: '10:00', serviceId: 1 }).length, 0);
});
test('venta con producto descuenta stock, registra pago y se puede anular solo sin pagos', () => {
  const db = fresh();
  const { id } = ok(db, 'sale', { clientId: 1, description: 'V', total: 100, paid: 0, date: C.today(), method: 'Efectivo', productId: 1, quantity: 3 });
  assert.strictEqual(db.products[0].stock, 5); assert.strictEqual(db.inventoryMovements.at(-1).type, 'Salida');
  assert.ok(C.voidSale(db, id).ok); assert.strictEqual(db.products[0].stock, 8); assert.strictEqual(C.activeSales(db).length, 0);
  const s2 = ok(db, 'sale', { clientId: 1, description: 'W', total: 100, paid: 40, date: C.today(), method: 'Efectivo', productId: '' }).id;
  assert.match(C.voidSale(db, s2).error, /pagos/);
  const pay = db.payments.find(p => p.saleId === s2); assert.ok(C.remove(db, 'payment', pay.id).ok); assert.strictEqual(db.sales.find(s => s.id === s2).paid, 0);
  assert.ok(C.voidSale(db, s2).ok);
});
test('venta: pago inicial > total y stock insuficiente se rechazan', () => {
  const db = fresh();
  assert.ok(C.validate('sale', { clientId: 1, description: 'x', total: 10, paid: 20, date: C.today(), method: 'Efectivo' }, db).errors.paid);
  assert.ok(C.validate('sale', { clientId: 1, description: 'x', total: 10, paid: 0, date: C.today(), method: 'Efectivo', productId: 1, quantity: 99 }, db).errors.quantity);
});
test('cotización → venta → abonos con límites', () => {
  const db = fresh(); const q = ok(db, 'quote', { clientId: 2, description: 'Q', amount: 200, date: C.today(), validUntil: C.addDays(5) }).id;
  assert.ok(C.validate('quote', { clientId: 2, description: 'Q', amount: 5, date: '2026-05-10', validUntil: '2026-05-01' }, db).errors.validUntil);
  const sid = C.convertQuote(db, q).id; assert.strictEqual(db.quotes[0].status, 'Convertida'); assert.ok(!C.convertQuote(db, q).ok);
  assert.match(C.remove(db, 'quote', q).error, /pendientes/);
  assert.ok(C.validate('receivable', { saleId: sid, amount: 250, date: C.today(), method: 'Efectivo' }, db).errors.amount);
  ok(db, 'receivable', { saleId: sid, amount: 80, date: C.today(), method: 'Efectivo' }); assert.strictEqual(C.saleBalance(db.sales[0]), 120);
  assert.ok(C.validate('sale', { clientId: 2, description: 'x', total: 50, date: C.today() }, db, { editId: sid }).errors.total, 'total < pagado');
});
test('inventario: movimientos, SKU único y borrado protegido', () => {
  const db = fresh();
  ok(db, 'movement', { productId: 1, type: 'Entrada', quantity: 5, date: C.today() }); assert.strictEqual(db.products[0].stock, 13);
  ok(db, 'movement', { productId: 1, type: 'Ajuste', quantity: 2, date: C.today() }); assert.strictEqual(db.products[0].stock, 2);
  assert.ok(C.validate('movement', { productId: 1, type: 'Salida', quantity: 5, date: C.today() }, db).errors.quantity);
  assert.ok(C.validate('product', { name: 'Otro', sku: 'sku-001', stock: 1 }, db).errors.sku);
  const p = ok(db, 'product', { name: 'Nuevo', sku: 'N1', stock: 4, cost: 1, price: 2 }).id;
  ok(db, 'product', { name: 'Nuevo 2', sku: 'N1', cost: 1, price: 3 }, p); assert.strictEqual(db.products.at(-1).stock, 4, 'editar no cambia el stock');
  assert.ok(C.remove(db, 'product', p).ok); assert.match(C.remove(db, 'product', 1).error, /movimientos/);
});
test('servicios y operaciones: crear, editar, borrar', () => {
  const db = fresh(); const s = ok(db, 'service', { name: 'Corte', price: 1000, duration: 20 }).id;
  assert.ok(C.validate('service', { name: 'x', price: 1, duration: 2 }, db).errors.duration);
  assert.match(C.remove(db, 'service', 2).error, /citas/); assert.ok(C.remove(db, 'service', s).ok);
  const o = ok(db, 'order', { clientId: 1, vehicle: 'R', detail: 'D', date: C.today(), amount: 5, status: 'Recibido' }).id; assert.ok(C.remove(db, 'order', o).ok);
});
test('adjuntos: validación de tipo/tamaño, alta, baja y limpieza al borrar el dueño', () => {
  const db = fresh();
  assert.ok(C.validateFile({ name: 'x.exe', size: 5 })); assert.ok(C.validateFile({ name: 'x.html', size: 5 })); assert.ok(C.validateFile({ name: 'x.pdf', size: 0 }));
  assert.ok(C.validateFile({ name: 'x.pdf', size: C.MAX_FILE_BYTES + 1 })); assert.strictEqual(C.validateFile({ name: 'foto.JPG', size: 10 }), null);
  const a = C.nextId(db); assert.ok(C.addAttachment(db, { id: a, ownerType: 'appointment', ownerId: 1, name: 'receta.pdf', size: 100, mime: 'application/pdf' }).ok);
  assert.ok(!C.addAttachment(db, { id: 99, ownerType: 'sale', ownerId: 1, name: 'a.pdf', size: 1 }).ok); assert.ok(!C.addAttachment(db, { id: 98, ownerType: 'client', ownerId: 555, name: 'a.pdf', size: 1 }).ok);
  assert.strictEqual(C.attachmentsOf(db, 'appointment', 1).length, 1);
  const r = C.remove(db, 'appointment', 1); assert.deepStrictEqual(r.removedFiles, [a]); assert.strictEqual(db.attachments.length, 0);
  const c = ok(db, 'client', { name: 'Z', phone: '12345' }).id; const b = C.nextId(db); C.addAttachment(db, { id: b, ownerType: 'client', ownerId: c, name: 'a.png', size: 1 });
  assert.deepStrictEqual(C.remove(db, 'client', c).removedFiles, [b]);
  const d = C.nextId(db); C.addAttachment(db, { id: d, ownerType: 'client', ownerId: 1, name: 'a.png', size: 1 }); assert.ok(C.removeAttachment(db, d).ok); assert.ok(!C.removeAttachment(db, d).ok);
});
test('empresas y sucursales', () => {
  const db = fresh(); const e = ok(db, 'unit', { name: 'Sede', kind: 'branch', parentId: 1 }).id;
  assert.ok(C.validate('unit', { name: 'S', kind: 'branch', parentId: '' }, db).errors.parentId);
  assert.match(C.remove(db, 'unit', 1).error, /sucursales/); assert.ok(C.remove(db, 'unit', e).ok); assert.match(C.remove(db, 'unit', 1).error, /al menos/);
});
test('perfil: zona horaria inválida se rechaza', () => {
  const db = fresh(); const base = { name: 'N', country: '', type: 'retail', currency: 'USD', language: 'en', accountMode: 'both', timezone: 'America/Bogota' };
  assert.ok(C.validate('profile', base, db).ok); assert.ok(C.validate('profile', { ...base, timezone: 'Marte/Olimpo' }, db).errors.timezone);
});
test('resumen: citas de hoy, próximas y por cobrar', () => {
  const db = fresh(); ok(db, 'sale', { clientId: 1, description: 'x', total: 100, paid: 10, date: C.today(), method: 'Efectivo', productId: '' });
  const s = C.summary(db); assert.strictEqual(s.todayApps, 1); assert.strictEqual(s.outstanding, 90); assert.strictEqual(s.upcoming.length, 1);
});
