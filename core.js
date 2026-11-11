'use strict';
/* LUKARIS core: lógica pura (sin DOM, sin red). Se usa en el navegador (global LukarisCore),
   en el servidor (require) y en las pruebas. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LukarisCore = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {

const Cat = typeof module === 'object' && module.exports ? require('./catalog.js') : globalThis.LKCatalog;
const APP_VERSION = '1.12', SCHEMA_VERSION = 5, KEY = 'lukaris-beta-v02';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FILE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'ppt', 'pptx', 'odt', 'ods'];
const APPT_STATUS = ['Confirmada', 'Pendiente', 'Atendida', 'Cancelada', 'Pendiente de reprogramación'];
const ORDER_STATUS = ['Recibido', 'En proceso', 'Esperando repuesto', 'Listo para entregar', 'Entregado'];
const METHODS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Otro'];
const MOVE_TYPES = ['Entrada', 'Salida', 'Ajuste', 'Merma'];
const OWNER_TYPES = ['client', 'appointment'];
const LISTS = ['clients', 'services', 'appointments', 'payments', 'products', 'orders', 'quotes', 'sales', 'inventoryMovements', 'attachments', 'users', 'outbox'];
const r2 = n => Math.round((+n || 0) * 100) / 100, r3 = n => Math.round((+n || 0) * 1000) / 1000;

// ---------- utilidades ----------
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // fecha LOCAL (no UTC)
const today = () => isoDate(new Date());
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const clone = v => JSON.parse(JSON.stringify(v));
const money = (n, p = {}) => {
  try { return new Intl.NumberFormat(p.language || undefined, { style: 'currency', currency: p.currency || 'COP', maximumFractionDigits: 2 }).format(+n || 0); }
  catch (e) { return (p.currency || '') + ' ' + (+n || 0); }
};
const formatBytes = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const csvCell = v => {
  let s = String(v ?? '');
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const fileExt = name => { const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
const validateFile = f => {
  if (!f || !f.name) return 'Archivo inválido.';
  if (!FILE_EXT.includes(fileExt(f.name))) return `"${f.name}": tipo no permitido (usa ${FILE_EXT.join(', ')}).`;
  if (!(f.size > 0)) return `"${f.name}": el archivo está vacío.`;
  if (f.size > MAX_FILE_BYTES) return `"${f.name}": supera ${formatBytes(MAX_FILE_BYTES)}.`;
  return null;
};

// ---------- ventas ----------
const saleBalance = s => s.voided ? 0 : Math.max(0, (+s.total || 0) - (+s.paid || 0));
const saleStatus = s => s.voided ? 'Anulada' : saleBalance(s) <= 0 ? 'Pagada' : (+s.paid > 0 ? 'Abono parcial' : 'Pendiente');
const activeSales = db => db.sales.filter(s => !s.voided);

// ---------- datos iniciales y migración ----------
function defaultProfile() {
  let tz = 'UTC'; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) {}
  return { name: 'Mi negocio', type: 'services', activity: 'professional_services', currency: 'COP', country: '', language: 'es', timezone: tz, dateFormat: 'auto', timeFormat: '24h', logo: '', accountMode: 'both', onboarded: false, modules: [], appearance: { theme: 'emerald', font: 'system', scale: 'normal', radius: 'normal' } };
}
function defaultPos() {
  return { settings: { taxRate: 0, taxIncluded: false, tipPercent: 10, allowNegativeStock: false, extraMethods: [], stations: ['Cocina', 'Bebidas', 'Postres', 'Barra'] }, counters: { order: 0, shift: 0 }, tables: [], categories: [], menu: [], orders: [], shifts: [], waste: [], notifications: [] };
}
const recommendedModules = profile => { const a = Cat.findActivity(profile && profile.activity); return a ? a.modules.slice() : (Cat.findActivity(Cat.SECTOR_DEFAULT_ACTIVITY[profile && profile.type]) || Cat.findActivity('other')).modules.slice(); };
function defaultDb() {
  const d = today();
  return migrate({
    profile: defaultProfile(),
    clients: [{ id: 1, name: 'Alex Rivera', phone: '300 555 0101', email: 'alex@example.com' }, { id: 2, name: 'María Torres', phone: '310 555 0182', email: 'maria@example.com' }],
    services: [{ id: 1, name: 'Servicio inicial', price: 30000, duration: 30 }, { id: 2, name: 'Servicio estándar', price: 45000, duration: 50 }],
    appointments: [{ id: 1, clientId: 1, serviceId: 2, date: d, time: '10:00', status: 'Confirmada', price: 45000 }],
    payments: [{ id: 1, clientId: 1, description: 'Servicio estándar', amount: 45000, date: d, method: 'Efectivo' }],
    products: [{ id: 1, name: 'Producto de muestra', sku: 'SKU-001', stock: 8, cost: 12000, price: 22000 }],
    orders: [{ id: 1, clientId: 2, vehicle: 'Pedido #1001', detail: 'Preparación y entrega de pedido', date: d, status: 'En proceso', amount: 85000 }]
  });
}
/* Normaliza cualquier versión anterior (0.4, 1.05) al esquema 4. Devuelve una copia nueva. */
function migrate(raw) {
  const db = isObj(raw) ? clone(raw) : {};
  db.meta = isObj(db.meta) ? db.meta : {};
  { const rp = isObj(db.profile) ? db.profile : {}; db.profile = { ...defaultProfile(), ...rp, ...(rp.activity ? {} : { activity: Cat.SECTOR_DEFAULT_ACTIVITY[rp.type] || 'professional_services' }) }; }
  if (!Array.isArray(db.profile.modules)) db.profile.modules = [];
  db.profile.appearance = { theme: 'emerald', font: 'system', scale: 'normal', radius: 'normal', ...(isObj(db.profile.appearance) ? db.profile.appearance : {}) };
  if (!Cat.findActivity(db.profile.activity)) db.profile.activity = Cat.SECTOR_DEFAULT_ACTIVITY[db.profile.type] || 'other';
  if (db.profile.modulesSet && !db.profile.modules.includes('automations') && !db.meta.modAutoMigrated) { db.profile.modules.push('automations'); db.meta.modAutoMigrated = true; }
  db.pos = isObj(db.pos) ? db.pos : {}; { const d = defaultPos(); db.pos.settings = { ...d.settings, ...(isObj(db.pos.settings) ? db.pos.settings : {}) }; db.pos.counters = { ...d.counters, ...(isObj(db.pos.counters) ? db.pos.counters : {}) }; for (const k of ['tables', 'categories', 'menu', 'orders', 'shifts', 'waste', 'notifications']) if (!Array.isArray(db.pos[k])) db.pos[k] = []; }
  db.auth = { enabled: false, ...(isObj(db.auth) ? db.auth : {}) };
  db.integrations = { whatsapp: { provider: 'none', status: 'No conectado', phoneNumberId: '', businessAccountId: '', ...(isObj(db.integrations && db.integrations.whatsapp) ? db.integrations.whatsapp : {}) } };
  db.automations = isObj(db.automations) ? db.automations : { appointmentReminder: false, followup: false, birthday: false, lowStock: false, leadWelcome: false };
  for (const k of LISTS) if (!Array.isArray(db[k])) db[k] = [];
  if (!Array.isArray(db.organizationUnits) || !db.organizationUnits.length)
    db.organizationUnits = [{ id: 1, name: db.profile.name || 'Mi negocio', kind: 'business', parentId: null, country: db.profile.country || '' }];
  for (const a of db.appointments) { a.status = APPT_STATUS.includes(a.status) ? a.status : 'Pendiente'; a.price = +a.price || 0; a.notes = a.notes || ''; if (a.workerId == null) a.workerId = null; }
  for (const c of db.clients) { c.phone = c.phone || ''; c.email = c.email || ''; c.notes = c.notes || ''; }
  let max = 0;
  const seen = r => { const n = +(r && r.id); if (Number.isFinite(n) && n > max) max = n; };
  for (const k of [...LISTS, 'organizationUnits']) for (const r of db[k]) seen(r);
  for (const k of ['tables', 'categories', 'menu', 'waste', 'notifications']) for (const r of db.pos[k]) seen(r);
  for (const o of db.pos.orders) { seen(o); for (const l of o.lines || []) seen(l); for (const x of o.payments || []) seen(x); }
  for (const sh of db.pos.shifts) { seen(sh); for (const m of sh.movements || []) seen(m); }
  db.meta.nextId = Math.max(+db.meta.nextId || 0, max + 1);
  db.meta.schemaVersion = SCHEMA_VERSION;
  for (const u of db.users) { u.active = u.active !== false; u.role = Cat.ROLES[u.role] ? u.role : 'employee'; }
  db.meta.appVersion = APP_VERSION;
  return db;
}
const nextId = db => db.meta.nextId++;

// ---------- validación ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/, EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, PHONE_RE = /^[0-9+()\-\s.]{5,40}$/;
const validDate = s => DATE_RE.test(s) && isoDate(new Date(s + 'T12:00:00')) === s;

function validate(type, raw, db, ctx = {}) {
  const errors = {}, value = {};
  const get = k => raw[k];
  const text = (k, { req = false, max = 200 } = {}) => {
    const s = String(get(k) ?? '').trim();
    if (req && !s) errors[k] = 'Obligatorio.'; else if (s.length > max) errors[k] = `Máximo ${max} caracteres.`;
    value[k] = s; return s;
  };
  const number = (k, { min = 0, max = 1e12, int = false, req = true } = {}) => {
    const s = String(get(k) ?? '').trim();
    if (s === '') { if (req) errors[k] = 'Obligatorio.'; value[k] = 0; return 0; }
    const n = Number(s);
    if (!Number.isFinite(n)) errors[k] = 'Número inválido.';
    else if (int && !Number.isInteger(n)) errors[k] = 'Debe ser un número entero.';
    else if (n < min) errors[k] = `Debe ser al menos ${min}.`;
    else if (n > max) errors[k] = 'Valor demasiado grande.';
    value[k] = n; return n;
  };
  const date = (k, req = true) => {
    const s = String(get(k) ?? '').trim();
    if (!s) { if (req) errors[k] = 'Obligatorio.'; } else if (!validDate(s)) errors[k] = 'Fecha inválida.';
    value[k] = s; return s;
  };
  const oneOf = (k, list) => { const s = String(get(k) ?? ''); if (!list.includes(s)) errors[k] = 'Opción inválida.'; value[k] = s; return s; };
  const ref = (k, list, msg) => { const n = Number(get(k)); const r = list.find(x => x.id === n); if (!r) errors[k] = msg; value[k] = n; return r; };

  switch (type) {
    case 'client': {
      text('name', { req: true, max: 120 }); const ph = text('phone', { max: 40 }), em = text('email', { max: 120 }); text('notes', { max: 500 });
      if (ph && !PHONE_RE.test(ph)) errors.phone = 'Teléfono inválido.';
      if (em && !EMAIL_RE.test(em)) errors.email = 'Correo inválido.';
      if (!ph && !em && !errors.phone && !errors.email) errors.phone = 'Indica teléfono o correo.';
      break;
    }
    case 'service':
      text('name', { req: true, max: 120 }); number('price'); number('duration', { min: 5, max: 1440, int: true }); break;
    case 'appointment':
      ref('clientId', db.clients, 'Selecciona un cliente.'); ref('serviceId', db.services, 'Selecciona un servicio.');
      date('date'); { const t = String(get('time') ?? ''); if (!TIME_RE.test(t)) errors.time = 'Hora inválida.'; value.time = t; }
      oneOf('status', APPT_STATUS); number('price'); text('notes', { max: 500 });
      { const w = String(get('workerId') ?? ''); if (!w) value.workerId = null; else if (w === 'auto') value.workerId = 'auto'; else { const u = db.users.find(x => x.id === Number(w) && x.active !== false); if (!u) errors.workerId = 'Profesional inexistente.'; value.workerId = u ? u.id : null; } }
      break;
    case 'product': {
      text('name', { req: true, max: 120 }); const sku = text('sku', { max: 40 });
      if (sku && db.products.some(p => p.sku && p.sku.toLowerCase() === sku.toLowerCase() && p.id !== ctx.editId)) errors.sku = 'Ya existe un producto con ese SKU.';
      if (!ctx.editId) number('stock', { req: false });
      { const u = text('unit', { max: 12 }); if (!u) value.unit = 'und'; }
      number('cost', { req: false }); number('price', { req: false }); number('minStock', { req: false }); break;
    }
    case 'order':
      ref('clientId', db.clients, 'Selecciona un cliente.'); text('vehicle', { req: true, max: 120 }); text('detail', { req: true, max: 500 });
      date('date'); number('amount'); oneOf('status', ORDER_STATUS); break;
    case 'quote': {
      ref('clientId', db.clients, 'Selecciona un cliente.'); text('description', { req: true, max: 200 }); number('amount', { min: 0.01 });
      const d = date('date'), vu = date('validUntil', false);
      if (d && vu && !errors.date && !errors.validUntil && vu < d) errors.validUntil = 'No puede ser anterior a la fecha.';
      break;
    }
    case 'sale': {
      const editing = ctx.editId ? db.sales.find(s => s.id === ctx.editId) : null;
      ref('clientId', db.clients, 'Selecciona un cliente.'); text('description', { req: true, max: 200 }); date('date');
      const total = number('total', { min: 0.01 });
      if (editing) { if (!errors.total && total < (+editing.paid || 0)) errors.total = 'No puede ser menor que lo ya pagado.'; break; }
      const paid = number('paid', { req: false });
      if (!errors.total && !errors.paid && paid > total) errors.paid = 'El pago inicial no puede superar el total.';
      oneOf('method', METHODS);
      const pid = String(get('productId') ?? '');
      if (pid) {
        const p = ref('productId', db.products, 'Producto inexistente.'); const q = number('quantity', { min: 1, int: true });
        if (p && !errors.quantity && q > p.stock) errors.quantity = `Solo hay ${p.stock} en existencias.`;
      } else { value.productId = null; value.quantity = 1; }
      break;
    }
    case 'receivable': {
      const sale = ref('saleId', db.sales.filter(s => saleBalance(s) > 0), 'Selecciona una venta con saldo.');
      const a = number('amount', { min: 0.01 });
      if (sale && !errors.amount && a > saleBalance(sale)) errors.amount = `No puede superar el saldo (${saleBalance(sale)}).`;
      date('date'); oneOf('method', METHODS); break;
    }
    case 'movement': {
      const p = ref('productId', db.products, 'Selecciona un producto.'); oneOf('type', MOVE_TYPES);
      const q = number('quantity', { min: value.type === 'Ajuste' ? 0 : 0.001 });
      if (p && !errors.quantity && (value.type === 'Salida' || value.type === 'Merma') && q > p.stock) errors.quantity = `Solo hay ${p.stock} en existencias.`;
      date('date'); text('reason', { max: 200 }); break;
    }
    case 'unit': {
      text('name', { req: true, max: 120 }); oneOf('kind', ['business', 'branch']);
      if (value.kind === 'branch') {
        const par = db.organizationUnits.find(u => u.id === Number(get('parentId')) && u.kind === 'business' && u.id !== ctx.editId);
        if (!par) errors.parentId = 'Selecciona la empresa principal.'; value.parentId = par ? par.id : null;
      } else value.parentId = null;
      break;
    }
    case 'profile': {
      text('name', { req: true, max: 120 });
      { const cs = text('country', { max: 60 }); if (cs) { const c = Cat.findCountry(cs); if (!c) errors.country = 'Selecciona un país de la lista.'; else value.country = c[0]; } }
      if (get('activity') != null && String(get('activity')).trim() !== '') { const a = Cat.findActivity(get('activity')); if (!a) errors.activity = 'Selecciona una actividad de la lista.'; else { value.activity = a.id; value.type = a.sector; } }
      else oneOf('type', Cat.SECTORS);
      oneOf('currency', Cat.CURRENCY_CODES); oneOf('language', ['es', 'en', 'pt', 'fr']);
      if (get('dateFormat') != null) oneOf('dateFormat', ['auto', 'DMY', 'MDY', 'YMD']); if (get('timeFormat') != null) oneOf('timeFormat', ['24h', '12h']);
      oneOf('accountMode', ['single', 'group', 'both']);
      const tz = text('timezone', { req: true, max: 60 });
      if (tz && !errors.timezone) { try { new Intl.DateTimeFormat('es', { timeZone: tz }); } catch (e) { errors.timezone = 'Zona horaria inválida (ej. America/Bogota).'; } }
      break;
    }
    case 'user': {
      text('name', { req: true, max: 80 }); oneOf('role', Object.keys(Cat.ROLES));
      if (db.users.some(u => u.name.toLowerCase() === value.name.toLowerCase() && u.id !== ctx.editId)) errors.name = 'Ya existe un usuario con ese nombre.';
      const pin = String(get('pin') ?? '').trim();
      if (pin && !/^\d{4,8}$/.test(pin)) errors.pin = 'El PIN debe tener de 4 a 8 dígitos.';
      if (!pin && !ctx.editId && db.auth.enabled) errors.pin = 'Indica un PIN (4 a 8 dígitos).';
      value.pin = pin; value.active = get('active') !== 'no'; break;
    }
    default: errors._ = 'Tipo desconocido.';
  }
  return { ok: !Object.keys(errors).length, errors, value };
}

// ---------- agenda ----------
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
function appointmentConflicts(db, { date, time, serviceId, workerId }, ignoreId = null) {
  const dur = id => +(db.services.find(s => s.id === +id)?.duration) || 30;
  const s1 = toMin(time), e1 = s1 + dur(serviceId);
  return db.appointments.filter(a => a.id !== ignoreId && a.date === date && a.status !== 'Cancelada' && a.status !== 'Pendiente de reprogramación' && !(workerId && workerId !== 'auto' && a.workerId && a.workerId !== workerId) && (() => {
    const s2 = toMin(a.time), e2 = s2 + dur(a.serviceId); return s1 < e2 && s2 < e1;
  })());
}

// ---------- operaciones (mutan db; devuelven {ok,...}) ----------
const fail = error => ({ ok: false, error });
const COLLECTION = { client: 'clients', service: 'services', appointment: 'appointments', product: 'products', order: 'orders', quote: 'quotes', unit: 'organizationUnits' };

function commit(db, type, v, editId = null) {
  const now = new Date().toISOString();
  if (type === 'user') {
    const apply = r => { r.name = v.name; r.role = v.role; r.active = v.active; if (v.pin) { r.salt = Cat.newSalt(); r.pinHash = Cat.hashPin(v.pin, r.salt); } };
    if (editId) { const r = db.users.find(x => x.id === editId); if (!r) return fail('El usuario ya no existe.'); if ((r.role === 'admin' && (v.role !== 'admin' || !v.active)) && !db.users.some(u => u.id !== r.id && u.role === 'admin' && u.active)) return fail('Debe quedar al menos un administrador activo.'); apply(r); r.updatedAt = now; return { ok: true, id: r.id }; }
    const r = { id: nextId(db), createdAt: now }; apply(r); db.users.push(r); return { ok: true, id: r.id };
  }
  if (type === 'profile') {
    db.profile = { ...db.profile, ...v, onboarded: true };
    if (db.organizationUnits.length === 1 && db.organizationUnits[0].kind === 'business') db.organizationUnits[0].name = v.name;
    return { ok: true };
  }
  const list = COLLECTION[type];
  if (list) {
    if (editId) {
      const r = db[list].find(x => x.id === editId); if (!r) return fail('El registro ya no existe.');
      if (type === 'quote' && r.status !== 'Pendiente') return fail('Solo se pueden editar cotizaciones pendientes.');
      Object.assign(r, v); r.updatedAt = now; return { ok: true, id: r.id };
    }
    const rec = { id: nextId(db), ...v, createdAt: now }; if (type === 'quote') rec.status = 'Pendiente';
    if (type === 'unit') rec.country = db.profile.country || '';
    db[list].push(rec); return { ok: true, id: rec.id };
  }
  if (type === 'sale') {
    if (editId) {
      const s = db.sales.find(x => x.id === editId); if (!s) return fail('La venta ya no existe.'); if (s.voided) return fail('La venta está anulada.');
      if (s.posOrderId) return fail('Esta venta viene de LK POS: no se edita aquí.');
      Object.assign(s, { clientId: v.clientId, description: v.description, date: v.date, total: v.total, updatedAt: now });
      for (const p of db.payments) if (p.saleId === s.id) p.clientId = s.clientId;
      return { ok: true, id: s.id };
    }
    const product = v.productId ? db.products.find(p => p.id === v.productId) : null;
    if (product && product.stock < v.quantity) return fail('No hay existencias suficientes para esta venta.');
    const id = nextId(db);
    db.sales.push({ id, clientId: v.clientId, description: v.description, total: v.total, paid: v.paid, date: v.date, productId: product ? product.id : null, quantity: product ? v.quantity : 1, createdAt: now });
    if (product) { product.stock -= v.quantity; db.inventoryMovements.push({ id: nextId(db), productId: product.id, type: 'Salida', quantity: v.quantity, date: v.date, reason: 'Venta ' + id }); }
    if (v.paid > 0) db.payments.push({ id: nextId(db), clientId: v.clientId, saleId: id, description: 'Abono inicial: ' + v.description, amount: v.paid, date: v.date, method: v.method });
    return { ok: true, id };
  }
  if (type === 'receivable') {
    const s = db.sales.find(x => x.id === v.saleId); if (!s || v.amount > saleBalance(s) || v.amount <= 0) return fail('El abono debe ser mayor que cero y no superar el saldo.');
    s.paid = (+s.paid || 0) + v.amount; const id = nextId(db);
    db.payments.push({ id, clientId: s.clientId, saleId: s.id, description: 'Abono: ' + s.description, amount: v.amount, date: v.date, method: v.method }); return { ok: true, id };
  }
  if (type === 'movement') {
    const p = db.products.find(x => x.id === v.productId); if (!p) return fail('Producto inexistente.');
    if ((v.type === 'Salida' || v.type === 'Merma') && p.stock < v.quantity) return fail('No hay existencias suficientes.');
    if (v.type === 'Entrada') p.stock = r3(p.stock + v.quantity); if (v.type === 'Salida' || v.type === 'Merma') p.stock = r3(p.stock - v.quantity); if (v.type === 'Ajuste') p.stock = r3(v.quantity);
    const id = nextId(db); db.inventoryMovements.push({ id, productId: p.id, type: v.type, quantity: v.quantity, date: v.date, reason: v.reason || '' }); return { ok: true, id };
  }
  return fail('Tipo desconocido.');
}

function convertQuote(db, id) {
  const q = db.quotes.find(x => x.id === id); if (!q) return fail('La cotización no existe.'); if (q.status !== 'Pendiente') return fail('Solo las cotizaciones pendientes se convierten en venta.');
  const sid = nextId(db); db.sales.push({ id: sid, quoteId: q.id, clientId: q.clientId, description: q.description, total: +q.amount, paid: 0, date: today(), createdAt: new Date().toISOString() });
  q.status = 'Convertida'; return { ok: true, id: sid };
}
function voidSale(db, id) {
  const s = db.sales.find(x => x.id === id); if (!s) return fail('La venta no existe.'); if (s.voided) return fail('La venta ya está anulada.');
  if (s.posOrderId) return fail('Esta venta viene de LK POS: usa el reembolso desde LK POS.');
  if ((+s.paid || 0) > 0) return fail('La venta tiene pagos registrados. Elimina primero esos pagos en Finanzas.');
  s.voided = true; s.voidedAt = new Date().toISOString();
  const p = s.productId && db.products.find(x => x.id === s.productId);
  if (p) { p.stock += +s.quantity || 1; db.inventoryMovements.push({ id: nextId(db), productId: p.id, type: 'Entrada', quantity: +s.quantity || 1, date: today(), reason: 'Anulación de venta ' + s.id }); }
  const q = s.quoteId && db.quotes.find(x => x.id === s.quoteId); if (q) q.status = 'Pendiente';
  return { ok: true };
}
function rescheduleAppointment(db, id, { date, time, workerId }) {
  const a = db.appointments.find(x => x.id === id); if (!a) return fail('La cita ya no existe.');
  if (!validDate(date)) return fail('Fecha inválida.'); if (!TIME_RE.test(String(time))) return fail('Hora inválida.');
  if (a.status === 'Atendida') return fail('Una cita atendida no se reprograma.');
  const w = workerId === undefined ? a.workerId : workerId;
  const cf = appointmentConflicts(db, { date, time, serviceId: a.serviceId, workerId: w }, a.id); if (cf.length) return { ok: false, error: 'Ya hay una cita en ese horario.', conflicts: cf };
  a.rescheduledFrom = { date: a.date, time: a.time }; a.date = date; a.time = time; a.workerId = w; if (a.status === 'Cancelada' || a.status === 'Pendiente de reprogramación') a.status = 'Pendiente'; a.updatedAt = new Date().toISOString(); return { ok: true };
}
const usage = (db, key, id) => ({
  client: () => ({ citas: db.appointments.filter(x => x.clientId === id).length, cotizaciones: db.quotes.filter(x => x.clientId === id).length, ventas: db.sales.filter(x => x.clientId === id).length, pagos: db.payments.filter(x => x.clientId === id).length, operaciones: db.orders.filter(x => x.clientId === id).length, 'pedidos POS': db.pos.orders.filter(x => x.clientId === id).length }),
  service: () => ({ citas: db.appointments.filter(x => x.serviceId === id).length }),
  product: () => ({ ventas: db.sales.filter(x => x.productId === id).length, movimientos: db.inventoryMovements.filter(x => x.productId === id).length, 'recetas de LK POS': db.pos.menu.filter(m => (m.recipe || []).some(r => r.productId === id)).length })
}[key]());
const usageText = u => Object.entries(u).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ');

function remove(db, type, id) {
  const removedFiles = [];
  const dropFiles = (ot, oid) => { db.attachments = db.attachments.filter(a => { const hit = a.ownerType === ot && a.ownerId === oid; if (hit) removedFiles.push(a.id); return !hit; }); };
  const take = (list) => { const i = db[list].findIndex(x => x.id === id); if (i < 0) return false; db[list].splice(i, 1); return true; };
  if (type === 'client') {
    const u = usage(db, 'client', id), t = usageText(u); if (t) return fail(`No se puede eliminar: tiene ${t}. Elimina o reasigna esos registros primero.`);
    if (!take('clients')) return fail('El cliente ya no existe.'); dropFiles('client', id); return { ok: true, removedFiles };
  }
  if (type === 'service') { const t = usageText(usage(db, 'service', id)); if (t) return fail(`No se puede eliminar: lo usan ${t}.`); return take('services') ? { ok: true, removedFiles } : fail('El servicio ya no existe.'); }
  if (type === 'product') { const t = usageText(usage(db, 'product', id)); if (t) return fail(`No se puede eliminar: tiene ${t}. Déjalo en 0 con un ajuste de inventario.`); return take('products') ? { ok: true, removedFiles } : fail('El producto ya no existe.'); }
  if (type === 'appointment') { if (!take('appointments')) return fail('La cita ya no existe.'); dropFiles('appointment', id); return { ok: true, removedFiles }; }
  if (type === 'order') return take('orders') ? { ok: true, removedFiles } : fail('La operación ya no existe.');
  if (type === 'quote') {
    const q = db.quotes.find(x => x.id === id); if (!q) return fail('La cotización ya no existe.');
    if (q.status !== 'Pendiente') return fail('Solo se pueden eliminar cotizaciones pendientes.'); take('quotes'); return { ok: true, removedFiles };
  }
  if (type === 'payment') {
    const p = db.payments.find(x => x.id === id); if (!p) return fail('El pago ya no existe.');
    if (p.posOrderId) return fail('Este pago viene de LK POS: usa el reembolso desde LK POS.');
    if (p.saleId) { const s = db.sales.find(x => x.id === p.saleId); if (s) s.paid = Math.max(0, (+s.paid || 0) - (+p.amount || 0)); }
    take('payments'); return { ok: true, removedFiles };
  }
  if (type === 'user') {
    const u = db.users.find(x => x.id === id); if (!u) return fail('El usuario ya no existe.');
    if (u.role === 'admin' && !db.users.some(x => x.id !== id && x.role === 'admin' && x.active)) return fail('Debe quedar al menos un administrador activo.');
    const used = db.pos.orders.some(o => o.waiterId === id || o.openedBy === id) || db.pos.shifts.some(sh => sh.openedBy === id) || db.appointments.some(a => a.workerId === id) || db.pos.tables.some(t => t.waiterId === id);
    if (used) return fail('Tiene historial o asignaciones. Desactívalo en lugar de eliminarlo.');
    take('users'); return { ok: true, removedFiles };
  }
  if (type === 'unit') {
    const u = db.organizationUnits.find(x => x.id === id); if (!u) return fail('La unidad ya no existe.');
    if (db.organizationUnits.length <= 1) return fail('Debe existir al menos una empresa.');
    if (db.organizationUnits.some(x => x.parentId === id)) return fail('Tiene sucursales. Elimínalas primero.');
    take('organizationUnits'); return { ok: true, removedFiles };
  }
  return fail('Tipo desconocido.');
}

// ---------- adjuntos ----------
function addAttachment(db, { id, ownerType, ownerId, name, size, mime }) {
  if (!OWNER_TYPES.includes(ownerType)) return fail('Los adjuntos solo se permiten en clientes y citas.');
  const owner = db[ownerType === 'client' ? 'clients' : 'appointments'].find(x => x.id === ownerId); if (!owner) return fail('El registro destino no existe.');
  const err = validateFile({ name, size }); if (err) return fail(err);
  const att = { id, ownerType, ownerId, name: String(name).slice(0, 160), size, mime: mime || 'application/octet-stream', createdAt: new Date().toISOString() };
  db.attachments.push(att); return { ok: true, att };
}
function removeAttachment(db, id) { const i = db.attachments.findIndex(a => a.id === id); if (i < 0) return fail('El adjunto ya no existe.'); db.attachments.splice(i, 1); return { ok: true }; }
const attachmentsOf = (db, ownerType, ownerId) => db.attachments.filter(a => a.ownerType === ownerType && a.ownerId === ownerId);

// ---------- resumen ----------
function summary(db, d = today()) {
  const upcoming = db.appointments.filter(a => a.status !== 'Cancelada' && a.date >= d).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return {
    todayApps: db.appointments.filter(a => a.date === d && a.status !== 'Cancelada').length,
    income: db.payments.filter(p => p.date === d).reduce((s, p) => s + (+p.amount || 0), 0),
    outstanding: activeSales(db).reduce((s, x) => s + saleBalance(x), 0),
    upcoming
  };
}

return { APP_VERSION, SCHEMA_VERSION, KEY, MAX_FILE_BYTES, FILE_EXT, APPT_STATUS, ORDER_STATUS, METHODS, MOVE_TYPES,
  today, addDays, isoDate, esc, money, formatBytes, csvCell, fileExt, validateFile, saleBalance, saleStatus, activeSales,
  r2, r3, Cat, can: Cat.can, ROLES: Cat.ROLES, defaultPos, recommendedModules, rescheduleAppointment, ADMIN_ACTOR: Cat.ADMIN_ACTOR,
  defaultDb, defaultProfile, migrate, nextId, validate, appointmentConflicts, commit, convertQuote, voidSale, remove, usage, usageText,
  addAttachment, removeAttachment, attachmentsOf, summary, clone, isObj };
});
