'use strict';
/* LK POS · lógica pura del punto de venta (sin DOM, sin red). Muta `db.pos` y las listas comunes (clients, sales,
   payments, inventoryMovements, products) de forma consistente. Cada operación devuelve { ok, ... } o { ok:false, error }.
   Se usa en el navegador (global LKPOS), en el servidor/pruebas (require) y es independiente de la interfaz. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.LKPOS = factory(root.LukarisCore);
})(typeof self !== 'undefined' ? self : globalThis, function (C) {

const Cat = C.Cat, { r2, r3 } = C;
const STATIONS = ['Cocina', 'Bebidas', 'Postres', 'Barra'];
const KINDS = ['Comida', 'Bebida', 'Postre', 'Complemento'];
const ORDER_TYPES = ['Mesa', 'Para llevar', 'Domicilio'];
const LINE_SENT = ['Pendiente', 'En preparación', 'Listo', 'Entregado'];
const BASE_METHODS = ['Efectivo', 'Tarjeta', 'Transferencia'];
const NEXT = { 'Pendiente': 'En preparación', 'En preparación': 'Listo', 'Listo': 'Entregado' };
const PREV = { 'En preparación': 'Pendiente', 'Listo': 'En preparación' };

let clock = () => new Date();
const setClock = fn => { clock = fn || (() => new Date()); };
const pad = n => String(n).padStart(2, '0');
const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fail = error => ({ ok: false, error });
const A = a => a || C.ADMIN_ACTOR;
const need = (a, perm) => Cat.can(A(a), perm) ? null : fail(`No tienes permiso para ${Cat.PERM_LABELS[perm] || perm}.`);
const methods = db => [...BASE_METHODS, ...(db.pos.settings.extraMethods || [])];
const findOrder = (db, id) => db.pos.orders.find(o => o.id === +id);
const findTable = (db, id) => db.pos.tables.find(t => t.id === +id);
const findItem = (db, id) => db.pos.menu.find(m => m.id === +id);
const openShift_ = db => db.pos.shifts.find(s => s.status === 'Abierto') || null;
const hist = (o, a, text) => { (o.history = o.history || []).push({ at: clock().toISOString(), by: A(a).name, text }); };
const activeLines = o => (o.lines || []).filter(l => l.status !== 'Anulado');

// ---------- validación ----------
function V(raw) {
  const errors = {}, value = {};
  const text = (k, { req = false, max = 200 } = {}) => { const s = String(raw[k] ?? '').trim(); if (req && !s) errors[k] = 'Obligatorio.'; else if (s.length > max) errors[k] = `Máximo ${max} caracteres.`; value[k] = s; return s; };
  const num = (k, { min = 0, max = 1e12, int = false, req = true } = {}) => {
    const s = String(raw[k] ?? '').trim(); if (s === '') { if (req) errors[k] = 'Obligatorio.'; value[k] = 0; return 0; }
    const n = Number(s); if (!Number.isFinite(n)) errors[k] = 'Número inválido.'; else if (int && !Number.isInteger(n)) errors[k] = 'Debe ser entero.'; else if (n < min) errors[k] = `Debe ser al menos ${min}.`; else if (n > max) errors[k] = 'Valor demasiado grande.';
    value[k] = n; return n;
  };
  const one = (k, list) => { const s = String(raw[k] ?? ''); if (!list.includes(s)) errors[k] = 'Opción inválida.'; value[k] = s; return s; };
  return { errors, value, text, num, one, res: () => ({ ok: !Object.keys(errors).length, errors, value }) };
}
function validate(type, raw, db, ctx = {}) {
  const v = V(raw), { errors, value } = v;
  switch (type) {
    case 'pos-table': {
      const n = v.text('name', { req: true, max: 40 }); v.num('capacity', { min: 1, max: 99, int: true }); v.text('zone', { max: 40 });
      if (n && db.pos.tables.some(t => t.name.toLowerCase() === n.toLowerCase() && t.id !== ctx.editId)) errors.name = 'Ya existe una mesa con ese nombre.';
      const w = String(raw.waiterId ?? ''); value.waiterId = w ? Number(w) : null; if (w && !db.users.some(u => u.id === value.waiterId && u.active !== false)) errors.waiterId = 'Mesero inexistente.';
      break;
    }
    case 'pos-category': {
      const n = v.text('name', { req: true, max: 60 }); v.one('kind', KINDS); v.one('station', STATIONS);
      if (n && db.pos.categories.some(c => c.name.toLowerCase() === n.toLowerCase() && c.id !== ctx.editId)) errors.name = 'Ya existe una categoría con ese nombre.';
      break;
    }
    case 'pos-item': {
      const n = v.text('name', { req: true, max: 100 }); v.text('note', { max: 200 }); v.num('price', { min: 0 }); v.num('cost', { req: false });
      const cat = db.pos.categories.find(c => c.id === Number(raw.categoryId)); if (!cat) errors.categoryId = 'Selecciona una categoría.'; value.categoryId = cat ? cat.id : null;
      v.one('station', STATIONS); value.available = raw.available !== 'no';
      if (n && db.pos.menu.some(m => m.name.toLowerCase() === n.toLowerCase() && m.id !== ctx.editId)) errors.name = 'Ya existe un producto con ese nombre.';
      const recipe = [], seen = new Set();
      for (let i = 1; i <= 8; i++) {
        const pid = String(raw['ing' + i] ?? ''), q = String(raw['qty' + i] ?? '').trim(); if (!pid && !q) continue;
        const p = db.products.find(x => x.id === Number(pid)); const qn = Number(q);
        if (!p) { errors['ing' + i] = 'Selecciona un ingrediente.'; continue; } if (!(qn > 0) || !Number.isFinite(qn)) { errors['qty' + i] = 'Cantidad mayor que 0.'; continue; }
        if (seen.has(p.id)) { errors['ing' + i] = 'Ingrediente repetido.'; continue; } seen.add(p.id); recipe.push({ productId: p.id, qty: r3(qn) });
      }
      value.recipe = recipe; break;
    }
    case 'pos-order': {
      v.one('type', ORDER_TYPES);
      if (value.type === 'Mesa') { const t = findTable(db, raw.tableId); if (!t) errors.tableId = 'Selecciona una mesa.'; value.tableId = t ? t.id : null; v.num('guests', { min: 1, max: 99, int: true, req: false }); }
      if (value.type === 'Domicilio') { v.text('customerName', { req: true, max: 100 }); v.text('customerPhone', { req: true, max: 40 }); v.text('address', { req: true, max: 200 }); v.num('fee', { req: false }); }
      const w = String(raw.waiterId ?? ''); value.waiterId = w ? Number(w) : null; if (w && !db.users.some(u => u.id === value.waiterId && u.active !== false)) errors.waiterId = 'Responsable inexistente.';
      const c = String(raw.clientId ?? ''); value.clientId = c ? Number(c) : null; if (c && !db.clients.some(x => x.id === value.clientId)) errors.clientId = 'Cliente inexistente.';
      v.text('notes', { max: 300 }); break;
    }
    case 'pos-discount': { const t = v.one('type', ['pct', 'amt']); const n = v.num('value', { min: 0 }); if (t === 'pct' && n > 100) errors.value = 'Máximo 100 %.'; v.text('reason', { req: n > 0, max: 200 }); break; }
    case 'pos-tip': { v.one('mode', ['pct', 'amt']); v.num('value', { min: 0, req: false }); break; }
    case 'pos-pay': { v.one('method', methods(db)); v.num('amount', { min: 0.01 }); v.num('tendered', { req: false }); v.text('reference', { max: 80 }); break; }
    case 'pos-open-shift': { v.num('openingCash', { min: 0 }); v.text('notes', { max: 200 }); break; }
    case 'pos-close-shift': { v.num('countedCash', { min: 0 }); v.text('notes', { max: 300 }); break; }
    case 'pos-cashmove': { v.one('type', ['Ingreso', 'Retiro']); v.num('amount', { min: 0.01 }); v.text('reason', { req: true, max: 200 }); break; }
    case 'pos-reserve': { v.text('name', { req: true, max: 80 }); const t = String(raw.time ?? ''); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) errors.time = 'Hora inválida.'; value.time = t; v.num('guests', { min: 1, max: 99, int: true, req: false }); v.text('note', { max: 200 }); break; }
    case 'pos-reason': { v.text('reason', { req: true, max: 200 }); value.restock = raw.restock === 'yes'; break; }
    case 'pos-settings': {
      v.num('taxRate', { min: 0, max: 100 }); value.taxIncluded = raw.taxIncluded === 'yes'; v.num('tipPercent', { min: 0, max: 100 }); value.allowNegativeStock = raw.allowNegativeStock === 'yes';
      const ex = String(raw.extraMethods ?? '').split(',').map(s => s.trim()).filter(Boolean); if (ex.some(x => x.length > 30) || ex.length > 8) errors.extraMethods = 'Hasta 8 medios, 30 caracteres cada uno.';
      if (ex.some(x => BASE_METHODS.some(b => b.toLowerCase() === x.toLowerCase()))) errors.extraMethods = 'No repitas los medios básicos.'; value.extraMethods = [...new Set(ex)]; value.notifyPhone = String(raw.notifyPhone || '').replace(/[^0-9+]/g, '').slice(0, 20); value.notifyChannel = ['app','whatsapp','both'].includes(raw.notifyChannel) ? raw.notifyChannel : 'both'; value.notifyAudience = ['assigned','team','single'].includes(raw.notifyAudience) ? raw.notifyAudience : 'assigned'; value.notifySingleUserId = raw.notifySingleUserId ? +raw.notifySingleUserId : ''; if (value.notifyAudience === 'single' && !db.users.some(u => u.id === value.notifySingleUserId && u.active !== false && u.role !== 'admin')) errors.notifySingleUserId = 'Selecciona una persona activa del equipo.'; break;
    }
    case 'pos-waste': {
      const p = db.products.find(x => x.id === Number(raw.productId)); if (!p) errors.productId = 'Selecciona un producto.'; value.productId = p ? p.id : null;
      const q = v.num('quantity', { min: 0.001 }); if (p && !errors.quantity && q > p.stock) errors.quantity = `Solo hay ${p.stock} en existencias.`; v.text('reason', { req: true, max: 200 }); break;
    }
    default: errors._ = 'Tipo desconocido.';
  }
  return v.res();
}

// ---------- mesas ----------
function saveTable(db, v, editId = null, actor) {
  const d = need(actor, 'pos.menu'); if (d) return d;
  if (editId) { const t = findTable(db, editId); if (!t) return fail('La mesa ya no existe.'); Object.assign(t, { name: v.name, capacity: v.capacity, zone: v.zone, waiterId: v.waiterId }); return { ok: true, id: t.id }; }
  const t = { id: C.nextId(db), name: v.name, capacity: v.capacity, zone: v.zone || '', waiterId: v.waiterId || null, reservation: null }; db.pos.tables.push(t); return { ok: true, id: t.id };
}
function removeTable(db, id, actor) {
  const d = need(actor, 'pos.menu'); if (d) return d; const t = findTable(db, id); if (!t) return fail('La mesa ya no existe.');
  if (db.pos.orders.some(o => o.status === 'Abierta' && o.tableId === t.id)) return fail('La mesa tiene una cuenta abierta. Ciérrala o muévela antes de eliminar la mesa.');
  db.pos.tables = db.pos.tables.filter(x => x.id !== t.id); return { ok: true };
}
function tableStatus(db, t) {
  const open = db.pos.orders.filter(o => o.status === 'Abierta' && o.tableId === t.id);
  if (open.length) { const since = open.map(o => o.openedAt).sort()[0]; return { status: 'Ocupada', since, minutes: Math.max(0, Math.floor((clock() - new Date(since)) / 60000)), orders: open }; }
  if (t.reservation) return { status: 'Reservada', reservation: t.reservation, orders: [] };
  return { status: 'Libre', orders: [] };
}
function reserveTable(db, id, v, actor) {
  const d = need(actor, 'pos.orders'); if (d) return d; const t = findTable(db, id); if (!t) return fail('La mesa no existe.');
  if (tableStatus(db, t).status === 'Ocupada') return fail('La mesa está ocupada.');
  t.reservation = v ? { name: v.name, time: v.time, guests: v.guests || 0, note: v.note || '' } : null; return { ok: true };
}
function assignWaiter(db, tableId, userId, actor) {
  const d = need(actor, 'pos.menu'); if (d) return d; const t = findTable(db, tableId); if (!t) return fail('La mesa no existe.');
  if (userId && !db.users.some(u => u.id === +userId && u.active !== false)) return fail('Mesero inexistente.'); t.waiterId = userId ? +userId : null; return { ok: true };
}

// ---------- menú ----------
const recipeCost = (db, recipe) => r2((recipe || []).reduce((s, r) => s + r.qty * (+(db.products.find(p => p.id === r.productId) || {}).cost || 0), 0));
const itemCost = (db, m) => m.cost > 0 ? +m.cost : recipeCost(db, m.recipe);
function saveCategory(db, v, editId = null, actor) {
  const d = need(actor, 'pos.menu'); if (d) return d;
  if (editId) { const c = db.pos.categories.find(x => x.id === editId); if (!c) return fail('La categoría ya no existe.'); Object.assign(c, { name: v.name, kind: v.kind, station: v.station }); return { ok: true, id: c.id }; }
  const c = { id: C.nextId(db), name: v.name, kind: v.kind, station: v.station }; db.pos.categories.push(c); return { ok: true, id: c.id };
}
function removeCategory(db, id, actor) {
  const d = need(actor, 'pos.menu'); if (d) return d; if (db.pos.menu.some(m => m.categoryId === id)) return fail('La categoría tiene productos. Muévelos o elimínalos primero.');
  const n = db.pos.categories.length; db.pos.categories = db.pos.categories.filter(c => c.id !== id); return db.pos.categories.length < n ? { ok: true } : fail('La categoría ya no existe.');
}
function saveItem(db, v, editId = null, actor) {
  const d = need(actor, 'pos.menu'); if (d) return d;
  const data = { name: v.name, categoryId: v.categoryId, price: v.price, cost: v.cost || 0, station: v.station, available: v.available, recipe: v.recipe, note: v.note || '' };
  if (editId) { const m = findItem(db, editId); if (!m) return fail('El producto ya no existe.'); Object.assign(m, data); return { ok: true, id: m.id }; }
  const m = { id: C.nextId(db), ...data }; db.pos.menu.push(m); return { ok: true, id: m.id };
}
function removeItem(db, id, actor) {
  const d = need(actor, 'pos.menu'); if (d) return d; const m = findItem(db, id); if (!m) return fail('El producto ya no existe.');
  if (db.pos.orders.some(o => o.lines.some(l => l.itemId === id))) return fail('El producto tiene historial de ventas. Márcalo como no disponible en lugar de eliminarlo.');
  db.pos.menu = db.pos.menu.filter(x => x.id !== id); return { ok: true };
}
function stockShortage(db, wants) { // wants: [{ recipe, qty }] → faltantes agregados
  const need_ = new Map(); for (const w of wants) for (const r of w.recipe || []) need_.set(r.productId, (need_.get(r.productId) || 0) + r.qty * w.qty);
  const out = []; for (const [pid, q] of need_) { const p = db.products.find(x => x.id === pid); if (!p) out.push({ productId: pid, name: '(ingrediente eliminado)', need: r3(q), have: 0 }); else if (p.stock + 1e-9 < q) out.push({ productId: pid, name: p.name, unit: p.unit || 'und', need: r3(q), have: p.stock }); }
  return out;
}
const canMake = (db, m) => !stockShortage(db, [{ recipe: m.recipe, qty: 1 }]).length;

// ---------- pedidos ----------
function newOrder(db, v, actor) {
  const d = need(actor, 'pos.orders'); if (d) return d;
  let table = null; if (v.type === 'Mesa') { table = findTable(db, v.tableId); if (!table) return fail('La mesa no existe.'); }
  const st = db.pos.settings, number = ++db.pos.counters.order, now = clock().toISOString();
  const o = { id: C.nextId(db), number, type: v.type, tableId: table ? table.id : null, tableName: table ? table.name : '', guests: v.guests || 0, waiterId: v.waiterId || (table && table.waiterId) || (A(actor).role === 'waiter' ? A(actor).id : null), clientId: v.clientId || null, status: 'Abierta', openedAt: now, date: isoLocal(clock()), openedBy: A(actor).id, openedByName: A(actor).name, lines: [], payments: [], discount: null, tipMode: 'amt', tipValue: 0, fee: v.type === 'Domicilio' ? r2(v.fee) : 0, taxRate: +st.taxRate || 0, taxIncluded: !!st.taxIncluded, notes: v.notes || '', delivery: v.type === 'Domicilio' ? { name: v.customerName, phone: v.customerPhone, address: v.address } : null, history: [] };
  const w = o.waiterId && db.users.find(u => u.id === o.waiterId); o.waiterName = w ? w.name : '';
  if (table) table.reservation = null; db.pos.orders.push(o); hist(o, actor, 'Cuenta abierta'); return { ok: true, id: o.id, number };
}
function totals(db, o) {
  const rate = +o.taxRate || 0, lines = activeLines(o);
  const subtotal = r2(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0));
  const discount = o.discount ? (o.discount.type === 'pct' ? r2(subtotal * o.discount.value / 100) : Math.min(subtotal, r2(o.discount.value))) : 0;
  const base = r2(subtotal - discount);
  const tax = o.taxIncluded ? r2(base - base / (1 + rate / 100)) : r2(base * rate / 100);
  const net = o.taxIncluded ? r2(base - tax) : base, fee = r2(o.fee), tip = o.tipMode === 'pct' ? r2(base * (+o.tipValue || 0) / 100) : r2(o.tipValue);
  const total = r2((o.taxIncluded ? base : base + tax) + fee + tip), paid = r2((o.payments || []).reduce((s, p) => s + p.amount, 0));
  return { subtotal, discount, net, tax, fee, tip, total, paid, balance: r2(Math.max(0, total - paid)), count: lines.length };
}
const editable = o => !o ? fail('La cuenta no existe.') : o.status !== 'Abierta' ? fail(`La cuenta está ${o.status.toLowerCase()} y no se puede modificar.`) : null;
function addLine(db, orderId, { itemId, qty = 1, notes = '' }, actor) {
  const d = need(actor, 'pos.orders'); if (d) return d; const o = findOrder(db, orderId), e = editable(o); if (e) return e;
  const m = findItem(db, itemId); if (!m) return fail('El producto no existe.'); if (!m.available) return fail('El producto no está disponible.');
  qty = +qty; if (!Number.isInteger(qty) || qty < 1 || qty > 999) return fail('Cantidad inválida.'); notes = String(notes || '').trim().slice(0, 200);
  const same = o.lines.find(l => l.status === 'Borrador' && l.itemId === m.id && l.notes === notes);
  if (same) { same.qty += qty; return { ok: true, id: same.id }; }
  const cat = db.pos.categories.find(c => c.id === m.categoryId);
  const l = { id: C.nextId(db), itemId: m.id, name: m.name, categoryId: m.categoryId, categoryName: cat ? cat.name : '', qty, unitPrice: r2(m.price), unitCost: r2(itemCost(db, m)), station: m.station, notes, recipe: (m.recipe || []).map(r => ({ ...r })), status: 'Borrador', stockDone: false };
  o.lines.push(l); return { ok: true, id: l.id };
}
function setLineQty(db, orderId, lineId, qty, actor) {
  const d = need(actor, 'pos.orders'); if (d) return d; const o = findOrder(db, orderId), e = editable(o); if (e) return e;
  const l = o.lines.find(x => x.id === +lineId); if (!l) return fail('El producto ya no está en la cuenta.'); if (l.status !== 'Borrador') return fail('El producto ya se envió a cocina: agrega otra línea o anúlalo con autorización.');
  qty = +qty; if (qty === 0) { o.lines = o.lines.filter(x => x !== l); return { ok: true }; } if (!Number.isInteger(qty) || qty < 1 || qty > 999) return fail('Cantidad inválida.'); l.qty = qty; return { ok: true };
}
function setLineNotes(db, orderId, lineId, notes, actor) {
  const d = need(actor, 'pos.orders'); if (d) return d; const o = findOrder(db, orderId), e = editable(o); if (e) return e;
  const l = o.lines.find(x => x.id === +lineId); if (!l) return fail('El producto ya no está en la cuenta.'); if (l.status !== 'Borrador') return fail('El producto ya se envió a cocina.'); l.notes = String(notes || '').trim().slice(0, 200); return { ok: true };
}
function removeDraftLine(db, orderId, lineId, actor) { return setLineQty(db, orderId, lineId, 0, actor); }

function consume(db, o, l, sign, reason) { // sign -1 descuenta, +1 devuelve
  for (const r of l.recipe || []) {
    const p = db.products.find(x => x.id === r.productId); if (!p) continue; const q = r3(r.qty * l.qty);
    p.stock = r3(p.stock + sign * q);
    db.inventoryMovements.push({ id: C.nextId(db), productId: p.id, type: sign < 0 ? 'Salida' : 'Entrada', quantity: q, date: isoLocal(clock()), reason, posOrderId: o.id, lineId: l.id });
  }
}
function sendToKitchen(db, orderId, actor) {
  const d = need(actor, 'pos.orders'); if (d) return d; const o = findOrder(db, orderId), e = editable(o); if (e) return e;
  const drafts = o.lines.filter(l => l.status === 'Borrador'); if (!drafts.length) return fail('No hay productos nuevos para enviar.');
  if (!db.pos.settings.allowNegativeStock) {
    const sh = stockShortage(db, drafts.map(l => ({ recipe: l.recipe, qty: l.qty }))); if (sh.length) return { ok: false, error: 'Inventario insuficiente: ' + sh.map(x => `${x.name} (necesita ${x.need}, hay ${x.have})`).join('; ') + '.', shortage: sh };
  }
  const now = clock().toISOString(); o.batches = (o.batches || 0) + 1;
  for (const l of drafts) { if (!l.stockDone) { consume(db, o, l, -1, `POS #${o.number}`); l.stockDone = true; } l.status = 'Pendiente'; l.sentAt = now; l.batch = o.batches; }
  hist(o, actor, `Enviado a preparación (${drafts.length} línea${drafts.length > 1 ? 's' : ''})`); return { ok: true, sent: drafts.length };
}
function notify(db, o, text) { db.pos.notifications.push({ id: C.nextId(db), orderId: o.id, tableName: o.tableName || o.type, waiterId: o.waiterId || null, text, createdAt: clock().toISOString(), read: false }); if (db.pos.notifications.length > 200) db.pos.notifications.splice(0, db.pos.notifications.length - 200); }
function setLineStatus(db, orderId, lineId, status, actor) {
  const o = findOrder(db, orderId); if (!o) return fail('La cuenta no existe.'); const l = o.lines.find(x => x.id === +lineId); if (!l) return fail('El producto no existe.');
  if (!LINE_SENT.includes(l.status)) return fail('El producto no está en preparación.'); if (!LINE_SENT.includes(status)) return fail('Estado inválido.');
  const fwd = NEXT[l.status] === status, back = PREV[l.status] === status;
  if (!fwd && !back && !(l.status === 'Pendiente' && status === 'Listo')) return fail(`No se puede pasar de ${l.status} a ${status}.`);
  const perm = status === 'Entregado' ? (Cat.can(A(actor), 'pos.orders') || Cat.can(A(actor), 'pos.kitchen')) : Cat.can(A(actor), 'pos.kitchen'); if (!perm) return fail('No tienes permiso para cambiar el estado de preparación.');
  if (o.status !== 'Abierta' && !(o.status === 'Pagada' && status === 'Entregado')) return fail('La cuenta ya no está abierta.');
  l.status = status; const now = clock().toISOString(); if (status === 'En preparación') l.startedAt = now; if (status === 'Listo') { l.readyAt = now; notify(db, o, `Listo: ${l.qty}× ${l.name} — ${o.tableName ? 'Mesa ' + o.tableName : o.type + ' #' + o.number}`); } if (status === 'Entregado') l.deliveredAt = now; return { ok: true };
}
function markNotificationRead(db, id) { const n = db.pos.notifications.find(x => x.id === +id); if (n) n.read = true; return { ok: true }; }
function kitchenLines(db, { station = '', includeDelivered = false } = {}) {
  const out = []; const today = isoLocal(clock());
  for (const o of db.pos.orders) { if (o.status === 'Cancelada' || o.status === 'Unida') continue;
    for (const l of o.lines) { if (!LINE_SENT.includes(l.status)) continue; if (station && l.station !== station) continue;
      if (l.status === 'Entregado' && (!includeDelivered || (l.deliveredAt || '').slice(0, 10) < today)) continue;
      if (o.status !== 'Abierta' && l.status !== 'Entregado' && o.status !== 'Pagada') continue;
      out.push({ orderId: o.id, number: o.number, type: o.type, tableName: o.tableName, waiterName: o.waiterName, line: l, minutes: Math.max(0, Math.floor((clock() - new Date(l.sentAt)) / 60000)) }); } }
  return out.sort((a, b) => a.line.sentAt.localeCompare(b.line.sentAt));
}
function voidLine(db, orderId, lineId, { reason, restock = false } = {}, actor) {
  const o = findOrder(db, orderId), e = editable(o); if (e) return e; const l = o.lines.find(x => x.id === +lineId); if (!l) return fail('El producto no existe.');
  if (l.status === 'Borrador') return removeDraftLine(db, orderId, lineId, actor); if (l.status === 'Anulado') return fail('El producto ya está anulado.');
  const d = need(actor, 'pos.void'); if (d) return d; if (!String(reason || '').trim()) return fail('Indica el motivo de la anulación.');
  const status = l.status; l.status = 'Anulado'; const t = totals(db, o); if (t.paid > t.total + 0.001) { l.status = status; return fail('La cuenta ya tiene pagos por más del nuevo total. Gestiona un reembolso.'); }
  l.voidReason = String(reason).trim().slice(0, 200); l.voidBy = A(actor).name; l.voidAt = clock().toISOString();
  if (l.stockDone) { if (restock) { consume(db, o, l, +1, `Anulación POS #${o.number}`); l.stockDone = false; l.restocked = true; } else db.pos.waste.push({ id: C.nextId(db), date: isoLocal(clock()), orderId: o.id, lineId: l.id, name: l.name, qty: l.qty, cost: r2(l.unitCost * l.qty), reason: l.voidReason }); }
  hist(o, actor, `Anulado ${l.qty}× ${l.name}: ${l.voidReason}`); return { ok: true };
}
function applyDiscount(db, orderId, v, actor) {
  const d = need(actor, 'pos.discount'); if (d) return d; const o = findOrder(db, orderId), e = editable(o); if (e) return e;
  const prev = o.discount; o.discount = v && v.value > 0 ? { type: v.type, value: +v.value, reason: v.reason, by: A(actor).name } : null;
  const t = totals(db, o); if (t.paid > t.total + 0.001) { o.discount = prev; return fail('Ya hay pagos por más del nuevo total.'); }
  hist(o, actor, o.discount ? `Descuento ${v.type === 'pct' ? v.value + ' %' : v.value}: ${v.reason}` : 'Descuento retirado'); return { ok: true };
}
function setTip(db, orderId, { mode, value }, actor) {
  const d = need(actor, 'pos.orders'); if (d) return d; const o = findOrder(db, orderId), e = editable(o); if (e) return e;
  const pm = o.tipMode, pv = o.tipValue; o.tipMode = mode === 'pct' ? 'pct' : 'amt'; o.tipValue = Math.max(0, +value || 0); if (o.tipMode === 'pct' && o.tipValue > 100) { o.tipMode = pm; o.tipValue = pv; return fail('Máximo 100 %.'); }
  const t = totals(db, o); if (t.paid > t.total + 0.001) { o.tipMode = pm; o.tipValue = pv; return fail('Ya hay pagos por más del nuevo total.'); } return { ok: true };
}

// ---------- pagos y cierre ----------
function pay(db, orderId, { method, amount, tendered, reference = '' }, actor) {
  const d = need(actor, 'pos.pay'); if (d) return d; const o = findOrder(db, orderId); if (!o) return fail('La cuenta no existe.');
  if (o.status !== 'Abierta') return fail(o.status === 'Pagada' ? 'La cuenta ya está pagada.' : `La cuenta está ${o.status.toLowerCase()}.`);
  const sh = openShift_(db); if (!sh) return fail('Abre la caja antes de registrar pagos.');
  if (o.lines.some(l => l.status === 'Borrador')) return fail('Hay productos sin enviar. Envíalos a preparación o quítalos antes de cobrar.');
  if (!activeLines(o).length) return fail('La cuenta no tiene productos.'); if (!methods(db).includes(method)) return fail('Medio de pago inválido.');
  amount = r2(amount); const t = totals(db, o); if (!(amount > 0)) return fail('El valor debe ser mayor que cero.');
  if (amount > t.balance + 0.001) return fail(`El pago (${amount}) supera el saldo pendiente (${t.balance}). Para devolver dinero usa un reembolso.`);
  let change = 0; if (method === 'Efectivo' && tendered !== undefined && tendered !== '' && tendered !== null) { tendered = r2(tendered); if (tendered + 0.001 < amount) return fail('El efectivo recibido es menor que el pago.'); change = r2(tendered - amount); }
  const p = { id: C.nextId(db), method, amount, tendered: method === 'Efectivo' && tendered ? tendered : amount, change, reference: String(reference || '').slice(0, 80), shiftId: sh.id, at: clock().toISOString(), by: A(actor).id, byName: A(actor).name };
  o.payments.push(p); hist(o, actor, `Pago ${method} ${amount}`);
  const left = r2(t.balance - amount); let closed = false; if (left <= 0.001) { const r = closeOrder(db, o.id, actor); if (!r.ok) { o.payments.pop(); return r; } closed = true; }
  return { ok: true, paymentId: p.id, balance: left, change, closed };
}
function ensureWalkIn(db) {
  let c = db.clients.find(x => x.system === 'pos-walkin'); if (c) return c;
  c = { id: C.nextId(db), name: 'Consumidor final', phone: '', email: '', notes: 'Cliente genérico creado por LK POS para ventas sin cliente identificado.', system: 'pos-walkin', createdAt: clock().toISOString() }; db.clients.push(c); return c;
}
function closeOrder(db, orderId, actor) {
  const o = findOrder(db, orderId); if (!o) return fail('La cuenta no existe.'); if (o.status !== 'Abierta') return fail('La cuenta ya fue cerrada.');
  if (o.lines.some(l => l.status === 'Borrador')) return fail('Hay productos sin enviar.'); if (!activeLines(o).length) return fail('La cuenta no tiene productos.');
  const t = totals(db, o); if (t.balance > 0.001) return fail(`Falta pagar ${t.balance}.`);
  if (db.sales.some(s => s.posOrderId === o.id)) return fail('La venta de esta cuenta ya fue registrada.');
  const client = (o.clientId && db.clients.find(c => c.id === o.clientId)) || ensureWalkIn(db); o.clientId = client.id;
  const date = isoLocal(clock()), sid = C.nextId(db), label = o.type === 'Mesa' ? `Mesa ${o.tableName}` : o.type;
  db.sales.push({ id: sid, clientId: client.id, description: `LK POS · Orden #${o.number} (${label})`, total: t.total, paid: t.total, date, posOrderId: o.id, tip: t.tip, source: 'pos', createdAt: clock().toISOString() });
  for (const p of o.payments) db.payments.push({ id: C.nextId(db), clientId: client.id, saleId: sid, posOrderId: o.id, posPaymentId: p.id, shiftId: p.shiftId, description: `LK POS #${o.number} · ${p.method}`, amount: p.amount, date: p.at ? isoLocal(new Date(p.at)) : date, method: p.method === 'Tarjeta' || p.method === 'Efectivo' || p.method === 'Transferencia' ? p.method : 'Otro' });
  o.status = 'Pagada'; o.closedAt = clock().toISOString(); o.closedDate = date; o.saleId = sid; hist(o, actor, 'Cuenta cerrada'); return { ok: true, saleId: sid };
}
function cancelOrder(db, orderId, { reason = '', restock = true } = {}, actor) {
  const d = need(actor, 'pos.orders'); if (d) return d; const o = findOrder(db, orderId), e = editable(o); if (e) return e;
  if (o.payments.length) return fail('La cuenta tiene pagos registrados. Cobra el saldo o usa un reembolso.');
  const sent = o.lines.filter(l => l.status !== 'Borrador' && l.status !== 'Anulado');
  if (sent.length) { const p = need(actor, 'pos.void'); if (p) return p; if (!String(reason).trim()) return fail('Indica el motivo de la cancelación.'); }
  for (const l of sent) { if (l.stockDone) { if (restock) { consume(db, o, l, +1, `Cancelación POS #${o.number}`); l.stockDone = false; l.restocked = true; } else db.pos.waste.push({ id: C.nextId(db), date: isoLocal(clock()), orderId: o.id, lineId: l.id, name: l.name, qty: l.qty, cost: r2(l.unitCost * l.qty), reason: String(reason).trim() }); } l.status = 'Anulado'; l.voidReason = String(reason).trim() || 'Cuenta cancelada'; }
  o.status = 'Cancelada'; o.cancelReason = String(reason).trim(); o.closedAt = clock().toISOString(); hist(o, actor, 'Cuenta cancelada' + (reason ? ': ' + reason : '')); return { ok: true };
}
function refundOrder(db, orderId, { reason, restock = false } = {}, actor) {
  const d = need(actor, 'pos.refund'); if (d) return d; const o = findOrder(db, orderId); if (!o) return fail('La cuenta no existe.');
  if (o.status === 'Reembolsada') return fail('La cuenta ya fue reembolsada.'); if (o.status !== 'Pagada') return fail('Solo se reembolsan cuentas pagadas.'); if (!String(reason || '').trim()) return fail('Indica el motivo del reembolso.');
  const sh = openShift_(db); if (!sh) return fail('Abre la caja para registrar la devolución del dinero.');
  const sale = db.sales.find(s => s.posOrderId === o.id); const byMethod = {}, date = isoLocal(clock());
  for (const p of o.payments) { byMethod[p.method] = r2((byMethod[p.method] || 0) + p.amount); db.payments.push({ id: C.nextId(db), clientId: o.clientId, saleId: sale ? sale.id : null, posOrderId: o.id, refundOf: p.id, shiftId: sh.id, description: `Reembolso LK POS #${o.number} · ${p.method}`, amount: -p.amount, date, method: p.method === 'Tarjeta' || p.method === 'Efectivo' || p.method === 'Transferencia' ? p.method : 'Otro' }); }
  if (sale) { sale.voided = true; sale.voidedAt = clock().toISOString(); sale.voidReason = String(reason).trim(); }
  if (restock) for (const l of activeLines(o)) if (l.stockDone) { consume(db, o, l, +1, `Reembolso POS #${o.number}`); l.restocked = true; }
  o.status = 'Reembolsada'; o.refund = { at: clock().toISOString(), by: A(actor).name, reason: String(reason).trim(), byMethod, shiftId: sh.id, restock: !!restock }; hist(o, actor, 'Reembolso: ' + o.refund.reason); return { ok: true, byMethod };
}
function moveOrder(db, orderId, toTableId, actor) {
  const d = need(actor, 'pos.orders'); if (d) return d; const o = findOrder(db, orderId), e = editable(o); if (e) return e; if (o.type !== 'Mesa') return fail('Solo se mueven cuentas de mesa.');
  const t = findTable(db, toTableId); if (!t) return fail('La mesa destino no existe.'); if (t.id === o.tableId) return fail('La cuenta ya está en esa mesa.');
  if (tableStatus(db, t).status === 'Ocupada') return fail('La mesa destino está ocupada. Usa «Unir cuentas» para combinarlas.');
  const from = o.tableName; o.tableId = t.id; o.tableName = t.name; t.reservation = null; hist(o, actor, `Movida de mesa ${from} a ${t.name}`); return { ok: true };
}
function mergeOrders(db, fromId, intoId, actor) {
  const d = need(actor, 'pos.orders'); if (d) return d; const a = findOrder(db, fromId), b = findOrder(db, intoId); const e = editable(a) || editable(b); if (e) return e;
  if (a.id === b.id) return fail('Selecciona dos cuentas distintas.'); if (a.payments.length) return fail('La cuenta que se une ya tiene pagos.'); if (a.discount || a.tipValue) return fail('Quita el descuento y la propina de la cuenta que se une.');
  if (a.type !== b.type || a.tableId !== b.tableId) return fail('Solo se unen cuentas de la misma mesa.');
  b.lines.push(...a.lines); a.lines = []; a.status = 'Unida'; a.mergedInto = b.id; a.closedAt = clock().toISOString(); hist(a, actor, `Unida a la cuenta #${b.number}`); hist(b, actor, `Se unió la cuenta #${a.number}`); return { ok: true };
}
function splitOrder(db, orderId, picks, actor) { // picks: [{ lineId, qty }]
  const d = need(actor, 'pos.orders'); if (d) return d; const o = findOrder(db, orderId), e = editable(o); if (e) return e;
  const list = (picks || []).filter(p => +p.qty > 0); if (!list.length) return fail('Selecciona los productos que irán a la nueva cuenta.');
  const move = []; for (const p of list) { const l = o.lines.find(x => x.id === +p.lineId && x.status !== 'Anulado'); if (!l) return fail('Producto inválido.'); const q = +p.qty; if (!Number.isInteger(q) || q < 1 || q > l.qty) return fail(`Cantidad inválida para ${l.name}.`); move.push({ l, q }); }
  const remain = activeLines(o).reduce((s, l) => s + l.qty, 0) - move.reduce((s, m) => s + m.q, 0); if (remain <= 0) return fail('Debe quedar al menos un producto en la cuenta original.');
  const snapshot = JSON.stringify(o.lines); const n = { ...o, id: C.nextId(db), number: ++db.pos.counters.order, lines: [], payments: [], discount: null, tipMode: 'amt', tipValue: 0, fee: 0, history: [], splitFrom: o.id, openedAt: clock().toISOString() };
  for (const { l, q } of move) { if (q === l.qty) { o.lines = o.lines.filter(x => x !== l); n.lines.push(l); } else { l.qty -= q; n.lines.push({ ...l, id: C.nextId(db), qty: q, recipe: l.recipe.map(r => ({ ...r })) }); } }
  const t = totals(db, o); if (t.paid > t.total + 0.001) { o.lines = JSON.parse(snapshot); db.pos.counters.order--; return fail('La cuenta original ya tiene pagos por más del nuevo total.'); }
  db.pos.orders.push(n); hist(o, actor, `Dividida: nueva cuenta #${n.number}`); hist(n, actor, `Creada al dividir la cuenta #${o.number}`); return { ok: true, id: n.id, number: n.number };
}

// ---------- caja ----------
function openShift(db, { openingCash, notes = '' }, actor) {
  const d = need(actor, 'pos.shift'); if (d) return d; if (openShift_(db)) return fail('Ya hay un turno de caja abierto.'); openingCash = r2(openingCash); if (openingCash < 0) return fail('El efectivo inicial no puede ser negativo.');
  const s = { id: C.nextId(db), number: ++db.pos.counters.shift, status: 'Abierto', openedAt: clock().toISOString(), openedBy: A(actor).id, openedByName: A(actor).name, openingCash, notes: String(notes).slice(0, 200), movements: [] }; db.pos.shifts.push(s); return { ok: true, id: s.id };
}
function shiftSummary(db, shift) {
  const byMethod = {}; let cashSales = 0, sales = 0, count = 0, refundsCash = 0, refunds = 0;
  for (const o of db.pos.orders) { for (const p of o.payments) if (p.shiftId === shift.id) { byMethod[p.method] = r2((byMethod[p.method] || 0) + p.amount); sales = r2(sales + p.amount); if (p.method === 'Efectivo') cashSales = r2(cashSales + p.amount); }
    if (o.status === 'Pagada' && o.payments.some(p => p.shiftId === shift.id)) count++;
    if (o.refund && o.refund.shiftId === shift.id) { refunds = r2(refunds + Object.values(o.refund.byMethod).reduce((a, b) => a + b, 0)); refundsCash = r2(refundsCash + (o.refund.byMethod['Efectivo'] || 0)); } }
  const ingresos = r2(shift.movements.filter(m => m.type === 'Ingreso').reduce((s, m) => s + m.amount, 0)), retiros = r2(shift.movements.filter(m => m.type === 'Retiro').reduce((s, m) => s + m.amount, 0));
  return { byMethod, sales, cashSales, ingresos, retiros, refunds, refundsCash, orders: count, expectedCash: r2(shift.openingCash + cashSales + ingresos - retiros - refundsCash) };
}
function cashMove(db, { type, amount, reason }, actor) {
  const d = need(actor, 'pos.shift'); if (d) return d; const sh = openShift_(db); if (!sh) return fail('No hay un turno de caja abierto.'); amount = r2(amount); if (!(amount > 0)) return fail('El valor debe ser mayor que cero.');
  if (!['Ingreso', 'Retiro'].includes(type)) return fail('Tipo inválido.'); if (!String(reason || '').trim()) return fail('Indica el motivo.');
  if (type === 'Retiro' && amount > shiftSummary(db, sh).expectedCash + 0.001) return fail('El retiro supera el efectivo esperado en caja.');
  sh.movements.push({ id: C.nextId(db), type, amount, reason: String(reason).trim().slice(0, 200), at: clock().toISOString(), by: A(actor).name }); return { ok: true };
}
function closeShift(db, { countedCash, notes = '' }, actor) {
  const d = need(actor, 'pos.shift'); if (d) return d; const sh = openShift_(db); if (!sh) return fail('No hay un turno de caja abierto.'); countedCash = r2(countedCash); if (!(countedCash >= 0)) return fail('El efectivo contado es inválido.');
  const sum = shiftSummary(db, sh), openOrders = db.pos.orders.filter(o => o.status === 'Abierta').length;
  sh.status = 'Cerrado'; sh.closedAt = clock().toISOString(); sh.closedBy = A(actor).id; sh.closedByName = A(actor).name; sh.closing = { ...sum, countedCash, difference: r2(countedCash - sum.expectedCash), notes: String(notes).slice(0, 300), openOrders };
  return { ok: true, closing: sh.closing, warnings: openOrders ? [`Quedan ${openOrders} cuenta(s) abiertas; sus próximos pagos entrarán al siguiente turno.`] : [] };
}

// ---------- reportes (se calculan solo con operaciones registradas) ----------
function report(db, { from = '', to = '' } = {}) {
  const inR = d => (!from || d >= from) && (!to || d <= to);
  const paid = db.pos.orders.filter(o => o.status === 'Pagada' && inR(o.closedDate)), refunded = db.pos.orders.filter(o => o.status === 'Reembolsada' && inR(o.closedDate || (o.refund.at || '').slice(0, 10)));
  const add = (m, k, o) => { const r = m[k] || (m[k] = { key: k, sales: 0, qty: 0, count: 0, cost: 0 }); for (const [a, b] of Object.entries(o)) r[a] = r2(r[a] + b); };
  const byDay = {}, byProduct = {}, byCategory = {}, byWaiter = {}, byMethod = {}, ing = {}; let sales = 0, net = 0, cost = 0, tips = 0, discounts = 0, tax = 0;
  for (const o of paid) {
    const t = totals(db, o); sales = r2(sales + t.total); net = r2(net + t.net); tips = r2(tips + t.tip); discounts = r2(discounts + t.discount); tax = r2(tax + t.tax);
    add(byDay, o.closedDate, { sales: t.total, count: 1 }); add(byWaiter, o.waiterName || 'Sin asignar', { sales: t.total, count: 1 });
    for (const p of o.payments) add(byMethod, p.method, { sales: p.amount, count: 1 });
    for (const l of activeLines(o)) { const rev = r2(l.qty * l.unitPrice), c = r2(l.qty * l.unitCost); cost = r2(cost + c);
      add(byProduct, l.name, { sales: rev, qty: l.qty, cost: c }); add(byCategory, l.categoryName || 'Sin categoría', { sales: rev, qty: l.qty, cost: c });
      if (l.stockDone) for (const r of l.recipe || []) { const p = db.products.find(x => x.id === r.productId); const k = p ? p.name : '(eliminado)'; const row = ing[k] || (ing[k] = { name: k, unit: p ? p.unit || 'und' : '', qty: 0, cost: 0 }); row.qty = r3(row.qty + r.qty * l.qty); row.cost = r2(row.cost + r.qty * l.qty * (p ? +p.cost || 0 : 0)); } } }
  const shifts = db.pos.shifts.filter(s => inR(s.openedAt.slice(0, 10))).map(s => { const sum = s.closing || shiftSummary(db, s); return { id: s.id, number: s.number, openedAt: s.openedAt, status: s.status, openedByName: s.openedByName, sales: sum.sales, expectedCash: sum.expectedCash, countedCash: s.closing ? s.closing.countedCash : null, difference: s.closing ? s.closing.difference : null }; });
  const sorted = (m, f = 'sales') => Object.values(m).sort((a, b) => b[f] - a[f]);
  const waste = db.pos.waste.filter(w => inR(w.date)), mermas = db.inventoryMovements.filter(m => m.type === 'Merma' && inR(m.date));
  return { orders: paid.length, sales, net, tax, tips, discounts, avgTicket: paid.length ? r2(sales / paid.length) : 0, cost, margin: r2(net - cost), marginPct: net > 0 ? r2((net - cost) / net * 100) : 0,
    byDay: Object.values(byDay).sort((a, b) => a.key.localeCompare(b.key)), byProduct: sorted(byProduct), topProducts: sorted(byProduct, 'qty').slice(0, 10), byCategory: sorted(byCategory), byWaiter: sorted(byWaiter), byMethod: sorted(byMethod), ingredients: Object.values(ing).sort((a, b) => b.cost - a.cost), shifts,
    cashDifferences: r2(shifts.reduce((s, x) => s + (x.difference || 0), 0)), refunds: { count: refunded.length, total: r2(refunded.reduce((s, o) => s + totals(db, o).total, 0)) }, wasteCost: r2(waste.reduce((s, w) => s + w.cost, 0) + mermas.reduce((s, m) => s + m.quantity * ((db.products.find(p => p.id === m.productId) || {}).cost || 0), 0)) };
}
function registerWaste(db, v, actor) {
  const d = need(actor, 'inventory.edit'); if (d) return d; return C.commit(db, 'movement', { productId: v.productId, type: 'Merma', quantity: v.quantity, date: isoLocal(clock()), reason: 'Merma: ' + v.reason });
}
function inventoryAlerts(db) {
  const used = new Set(db.pos.menu.flatMap(m => (m.recipe || []).map(r => r.productId)));
  return db.products.filter(p => used.has(p.id) && p.stock <= (p.minStock > 0 ? p.minStock : 3)).map(p => ({ id: p.id, name: p.name, stock: p.stock, unit: p.unit || 'und', min: p.minStock > 0 ? p.minStock : 3 }));
}
function saveSettings(db, v, actor) { const d = need(actor, 'pos.settings'); if (d) return d; Object.assign(db.pos.settings, { taxRate: v.taxRate, taxIncluded: v.taxIncluded, tipPercent: v.tipPercent, allowNegativeStock: v.allowNegativeStock, extraMethods: v.extraMethods, notifyPhone: v.notifyPhone || '', notifyChannel: v.notifyChannel || 'both', notifyAudience: v.notifyAudience || 'assigned', notifySingleUserId: v.notifySingleUserId || '' }); return { ok: true }; }

// ---------- menú de ejemplo (solo cuando el usuario lo pide) ----------
function seedExample(db, actor) {
  const d = need(actor, 'pos.menu'); if (d) return d; if (db.pos.menu.length || db.pos.categories.length) return fail('Ya hay un menú configurado.');
  const prod = (name, sku, unit, stock, cost) => { let p = db.products.find(x => x.sku === sku); if (!p) { p = { id: C.nextId(db), name, sku, unit, stock, cost, price: 0, minStock: 0, createdAt: clock().toISOString() }; db.products.push(p); db.inventoryMovements.push({ id: C.nextId(db), productId: p.id, type: 'Entrada', quantity: stock, date: isoLocal(clock()), reason: 'Inventario inicial (ejemplo LK POS)' }); } return p; };
  const pan = prod('Pan de hamburguesa', 'ING-PAN', 'und', 60, 900), carne = prod('Carne de res 150 g', 'ING-CARNE', 'und', 50, 4200), queso = prod('Queso en lonchas', 'ING-QUESO', 'und', 80, 600), papa = prod('Papa', 'ING-PAPA', 'kg', 20, 2500), cafe = prod('Café molido', 'ING-CAFE', 'kg', 5, 38000), leche = prod('Leche', 'ING-LECHE', 'l', 20, 3200), limon = prod('Limón', 'ING-LIMON', 'kg', 8, 4000), gaseosa = prod('Gaseosa 350 ml', 'BEB-GAS', 'und', 48, 1500);
  const cc = (name, kind, station) => { const c = { id: C.nextId(db), name, kind, station }; db.pos.categories.push(c); return c; };
  const c1 = cc('Platos fuertes', 'Comida', 'Cocina'), c2 = cc('Bebidas', 'Bebida', 'Bebidas'), c3 = cc('Acompañamientos', 'Complemento', 'Cocina'), c4 = cc('Cafetería', 'Bebida', 'Barra');
  const it = (name, cat, price, recipe) => db.pos.menu.push({ id: C.nextId(db), name, categoryId: cat.id, price, cost: 0, station: cat.station, available: true, recipe: recipe.map(([p, q]) => ({ productId: p.id, qty: q })), note: '' });
  it('Hamburguesa clásica', c1, 24000, [[pan, 1], [carne, 1], [queso, 1]]); it('Papas fritas', c3, 9000, [[papa, 0.25]]); it('Limonada natural', c2, 7000, [[limon, 0.15]]); it('Gaseosa', c2, 5000, [[gaseosa, 1]]); it('Café con leche', c4, 6500, [[cafe, 0.018], [leche, 0.2]]);
  for (const [n, cap, z] of [['1', 4, 'Salón'], ['2', 4, 'Salón'], ['3', 6, 'Salón'], ['4', 2, 'Terraza'], ['5', 2, 'Terraza']]) db.pos.tables.push({ id: C.nextId(db), name: n, capacity: cap, zone: z, waiterId: null, reservation: null });
  return { ok: true };
}

return { STATIONS, KINDS, ORDER_TYPES, LINE_SENT, BASE_METHODS, setClock, isoLocal, validate, methods, findOrder, findTable, findItem, openShift_: openShift_, activeLines,
  saveTable, removeTable, tableStatus, reserveTable, assignWaiter, saveCategory, removeCategory, saveItem, removeItem, recipeCost, itemCost, stockShortage, canMake,
  newOrder, totals, addLine, setLineQty, setLineNotes, removeDraftLine, sendToKitchen, setLineStatus, markNotificationRead, kitchenLines, voidLine, applyDiscount, setTip,
  pay, closeOrder, cancelOrder, refundOrder, moveOrder, mergeOrders, splitOrder, openShift, shiftSummary, cashMove, closeShift, report, registerWaste, inventoryAlerts, saveSettings, seedExample };
});
