'use strict';
/* LUKARIS 1.06 · interfaz. La lógica de negocio vive en core.js; el guardado, en Store. */
const C = LukarisCore;
const { esc, saleBalance, saleStatus, today, formatBytes } = C;
let db, page = 'home';
const money = n => C.money(n, db.profile);
const $ = s => document.querySelector(s);
const byId = (list, id) => db[list].find(x => x.id === id);
const clientName = id => byId('clients', id)?.name || 'Cliente eliminado';
const serviceName = id => byId('services', id)?.name || 'Servicio eliminado';
const T = { home: 'Resumen', appointments: 'Agenda', clients: 'Clientes', commercial: 'Comercial', cash: 'Finanzas', services: 'Servicios', inventory: 'Inventario', work: 'Operaciones', automations: 'Automatizaciones', reports: 'Reportes', settings: 'Configuración' };

// ================= Almacenamiento: servidor local con respaldo en el navegador =================
const SYNC_KEY = 'lukaris-sync';
const Store = {
  mode: 'local', rev: 0, pending: false, inflight: false, again: false, force: false, timer: null, retry: null, lastSaved: null, idbp: null,
  setState(kind, text) { const el = $('#savestate'); if (el) { el.className = 'savestate ' + kind; el.textContent = text; } },
  readLocal() { try { return JSON.parse(localStorage.getItem(C.KEY)); } catch (e) { return null; } },
  writeLocal() { try { localStorage.setItem(C.KEY, JSON.stringify(db)); return true; } catch (e) { return false; } },
  setPending(v) { this.pending = v; try { v ? localStorage.setItem(SYNC_KEY, JSON.stringify({ baseRev: this.rev })) : localStorage.removeItem(SYNC_KEY); } catch (e) {} },
  async api(path, opts = {}) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), opts.timeout || 8000);
    try { return await fetch(path, { ...opts, signal: ctl.signal }); } finally { clearTimeout(t); }
  },
  async init() {
    const local = this.readLocal();
    let remote = null;
    if (/^https?:$/.test(location.protocol)) { try { const r = await this.api('/api/db', { timeout: 2500 }); if (r.ok) remote = await r.json(); } catch (e) {} }
    if (!remote) { this.mode = 'local'; db = local ? C.migrate(local) : C.defaultDb(); this.setState('', 'Guardado en este navegador'); return; }
    this.mode = 'server'; this.rev = remote.rev;
    let sync = null; try { sync = JSON.parse(localStorage.getItem(SYNC_KEY)); } catch (e) {}
    if (remote.data) {
      if (local && sync && sync.baseRev === remote.rev) { db = C.migrate(local); this.pending = true; this.schedule(); }
      else { if (local && sync) try { localStorage.setItem('lukaris-conflict-' + Date.now(), JSON.stringify(local)); } catch (e) {} db = C.migrate(remote.data); this.writeLocal(); this.setState('saved', 'Guardado en el servidor'); this.lastSaved = remote.savedAt; }
    } else { db = local ? C.migrate(local) : C.defaultDb(); this.pending = true; this.schedule(0); }
  },
  save() {
    db.meta.updatedAt = new Date().toISOString();
    const ok = this.writeLocal();
    if (this.mode === 'server') { this.setPending(true); this.schedule(); }
    else this.setState(ok ? '' : 'error', ok ? 'Guardado en este navegador' : 'No se pudo guardar: almacenamiento lleno o bloqueado');
    if (!ok) toast('No se pudo guardar en el navegador (almacenamiento lleno o bloqueado).', 'err');
  },
  schedule(ms = 200) { this.setState('saving', 'Guardando…'); clearTimeout(this.timer); this.timer = setTimeout(() => this.sync(), ms); },
  async sync() {
    if (this.inflight) { this.again = true; return; }
    this.inflight = true; this.again = false; const force = this.force;
    try {
      const r = await this.api('/api/db', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRev: this.rev, force, data: db }) });
      if (r.status === 409) {
        const cur = await r.json(); try { localStorage.setItem('lukaris-conflict-' + Date.now(), JSON.stringify(db)); } catch (e) {}
        db = C.migrate(cur.data); this.rev = cur.rev; this.writeLocal(); this.setPending(false); this.setState('saved', 'Actualizado desde el servidor'); closeModal(); render();
        toast('Los datos cambiaron en otra pestaña; se cargó la versión más reciente.', 'err'); return;
      }
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Error ' + r.status);
      const j = await r.json(); this.rev = j.rev; this.force = false; this.lastSaved = j.savedAt;
      if (!this.again) { this.setPending(false); this.setState('saved', 'Guardado en el servidor · ' + new Date(j.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })); }
    } catch (e) {
      this.setState('offline', 'Sin conexión: guardado en este navegador'); clearTimeout(this.retry); this.retry = setTimeout(() => this.sync(), 5000);
    } finally { this.inflight = false; if (this.again) { this.again = false; this.schedule(50); } }
  },
  flush() { if (this.pending && this.mode === 'server') try { fetch('/api/db', { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRev: this.rev, force: this.force, data: db }) }); } catch (e) {} },
  // ---- archivos ----
  idb() { return this.idbp || (this.idbp = new Promise((res, rej) => { const q = indexedDB.open('lukaris-files', 1); q.onupgradeneeded = () => q.result.createObjectStore('blobs', { keyPath: 'id' }); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); })); },
  async idbDo(mode, fn) { const d = await this.idb(); return new Promise((res, rej) => { const tx = d.transaction('blobs', mode), st = tx.objectStore('blobs'), r = fn(st); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); }); },
  async putBlob(id, file) {
    if (this.mode === 'server') {
      const r = await this.api('/api/files', { method: 'POST', timeout: 60000, headers: { 'x-file-id': String(id), 'x-file-name': encodeURIComponent(file.name), 'Content-Type': file.type || 'application/octet-stream' }, body: file });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se pudo subir el archivo');
    } else await this.idbDo('readwrite', st => st.put({ id, type: file.type, blob: file }));
  },
  async getBlob(id) {
    if (this.mode === 'server') { const r = await this.api('/api/files/' + id + '?download=1', { timeout: 60000 }); if (!r.ok) throw new Error('Archivo no disponible'); return r.blob(); }
    const rec = await this.idbDo('readonly', st => st.get(id)); if (!rec) throw new Error('Archivo no disponible'); return rec.blob;
  },
  async delBlob(id) { try { if (this.mode === 'server') await this.api('/api/files/' + id, { method: 'DELETE' }); else await this.idbDo('readwrite', st => st.delete(id)); } catch (e) {} }
};
const save = () => Store.save();

// ================= UI base =================
function toast(msg, kind = '') { const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; $('#toasts').appendChild(t); setTimeout(() => t.remove(), kind ? 5500 : 3200); }
let lastFocus = null;
let currentDetail = '';
function openModal(title, html, detail = '') { currentDetail = detail; lastFocus = document.activeElement; $('#mtitle').textContent = title; $('#mbody').innerHTML = html; $('#back').classList.add('show'); const f = $('#mbody').querySelector('input:not([type=hidden]):not([type=file]),select,textarea'); if (f) f.focus(); }
function closeModal() { currentDetail = ''; $('#back').classList.remove('show'); $('#mbody').innerHTML = ''; if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {} }
const modalOpen = () => $('#back').classList.contains('show');
function confirmBox({ title = 'Confirmar', message, label = 'Confirmar', danger = false, requireText = '' }) {
  return new Promise(resolve => {
    openModal(title, `<p class="confirm-text">${esc(message)}</p>${requireText ? `<label class="field">Escribe <b>${esc(requireText)}</b> para continuar<input id="confirmText" autocomplete="off"></label>` : ''}<div class="actions"><button type="button" class="btn" data-act="confirm-no">Cancelar</button><button type="button" class="btn ${danger ? 'danger solid' : 'primary'}" data-act="confirm-yes">${esc(label)}</button></div>`);
    const done = v => { document.removeEventListener('click', h, true); resolve(v); };
    const h = e => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'confirm-yes') { if (requireText && $('#confirmText').value.trim() !== requireText) { e.stopPropagation(); toast('Escribe ' + requireText + ' para confirmar.', 'err'); return; } e.stopPropagation(); closeModal(); done(true); }
      else if (a === 'confirm-no' || a === 'close' || e.target.id === 'back') { e.stopPropagation(); closeModal(); done(false); }
    };
    document.addEventListener('click', h, true);
  });
}
const btn = (label, act, data = {}, cls = '') => `<button type="button" class="btn ${cls}" data-act="${act}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>${label}</button>`;
const head = (k, t, s, action = '') => `<div class="heading"><div><div class="eyebrow">${k}</div><h1 class="h1">${t}</h1><p class="sub">${s}</p></div><div class="inline-actions" style="margin:0">${action}</div></div>`;
const table = (headers, rows, id = '') => `<div class="tablewrap"><table ${id ? `id="${id}"` : ''}><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr class="emptyrow"><td colspan="${headers.length}" class="empty">Todavía no hay registros.</td></tr>`}</tbody></table></div>`;
const tr = (cells, o = {}) => `<tr class="${o.act ? 'rowlink ' : ''}${o.cls || ''}" ${o.act ? `data-act="${o.act}" data-id="${o.id}"` : ''} data-q="${esc((o.q || cells.join(' ').replace(/<button[\s\S]*?<\/button>/g, ' ')).replace(/<[^>]*>/g, ' ').toLowerCase())}" ${o.status ? `data-status="${esc(o.status)}"` : ''} ${o.date ? `data-date="${esc(o.date)}"` : ''}>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
const acts = (type, id, extra = '') => `<div class="rowactions">${extra}${btn('Editar', 'edit', { type, id }, 'small')}${btn('Eliminar', 'delete', { type, id }, 'small danger')}</div>`;
const filterBar = (opts = {}) => `<div class="filters"><input type="search" data-filter="q" placeholder="Buscar…" aria-label="Buscar">${opts.status ? `<select data-filter="status" aria-label="Estado"><option value="">Todos los estados</option>${opts.status.map(s => `<option>${esc(s)}</option>`).join('')}</select>` : ''}${opts.range ? `<select data-filter="range" aria-label="Periodo"><option value="">Todas las fechas</option><option value="today">Hoy</option><option value="upcoming">Próximas</option><option value="past">Pasadas</option></select>` : ''}</div>`;
function applyFilters(scope) {
  const q = (scope.querySelector('[data-filter=q]')?.value || '').trim().toLowerCase(), st = scope.querySelector('[data-filter=status]')?.value || '', rg = scope.querySelector('[data-filter=range]')?.value || '', d = today();
  let shown = 0; const body = scope.querySelector('tbody');
  scope.querySelectorAll('tbody tr[data-q]').forEach(r => {
    const dt = r.dataset.date || '', ok = (!q || r.dataset.q.includes(q)) && (!st || r.dataset.status === st) && (!rg || (rg === 'today' ? dt === d : rg === 'upcoming' ? dt >= d : dt < d));
    r.hidden = !ok; if (ok) shown++;
  });
  body.querySelector('.noresults')?.remove();
  if (!shown && scope.querySelector('tbody tr[data-q]')) body.insertAdjacentHTML('beforeend', `<tr class="noresults"><td colspan="20" class="empty">Sin resultados.</td></tr>`);
}
const pill = (t, c = '') => `<span class="pill ${c}">${esc(t)}</span>`;
const apptPill = s => pill(s, s === 'Confirmada' || s === 'Atendida' ? 'ok' : s === 'Cancelada' ? 'bad' : 'wait');
const attCount = (type, id) => { const n = C.attachmentsOf(db, type, id).length; return n ? `📎 ${n}` : '—'; };

function go(p) { page = p; document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.page === p)); $('#crumb').textContent = T[p]; render(); window.scrollTo(0, 0); }
function render() { $('#topbiz').textContent = db.profile.name; document.title = 'LUKARIS · ' + db.profile.name; PAGES[page](); if (page === 'home') backupBanner(); document.querySelectorAll('tr.rowlink').forEach(r => r.tabIndex = 0); }

// ================= Páginas =================
const $app = () => $('#app');
const PAGES = {
  home() {
    const s = C.summary(db), next = s.upcoming.slice(0, 5), active = db.orders.filter(o => o.status !== 'Entregado').slice(0, 4);
    $app().innerHTML = head('Panel de control', 'Bienvenido a LUKARIS', 'Vista general de la operación de tu negocio.', btn('+ Nuevo registro', 'new-menu', {}, 'primary')) +
      `<section class="card showcase-hero"><div><span class="eyebrow">LUKARIS ONE · PLATAFORMA MULTISECTORIAL</span><h2>Todo tu negocio, conectado en un solo lugar.</h2><p class="desc">Clientes, agenda, ventas, finanzas, inventario, operaciones y automatizaciones en una experiencia adaptable.</p></div><div class="inline-actions"><button class="btn" data-act="go" data-page="automations">Explorar automatizaciones</button><button class="btn primary" data-act="go" data-page="reports">Ver reportes</button></div></section><div class="stats"><div class="stat"><small>Citas de hoy</small><strong>${s.todayApps}</strong></div><div class="stat"><small>Ingresos de hoy</small><strong>${money(s.income)}</strong></div><div class="stat"><small>Clientes registrados</small><strong>${db.clients.length}</strong></div><div class="stat"><small>Productos en inventario</small><strong>${db.products.length}</strong></div><div class="stat"><small>Por cobrar</small><strong>${money(s.outstanding)}</strong></div></div>
<div class="grid2"><section class="card"><h3>Próximas citas</h3><p class="desc">Hoy y los días siguientes (toca una para ver su detalle)</p>${table(['Fecha', 'Hora', 'Cliente', 'Servicio', 'Estado'], next.map(a => tr([a.date, a.time, esc(clientName(a.clientId)), esc(serviceName(a.serviceId)), apptPill(a.status)], { act: 'appt-detail', id: a.id, cls: a.date === today() ? 'today' : '' })).join(''))}
<h3 style="margin-top:18px">Operaciones activas</h3>${table(['Fecha', 'Cliente', 'Detalle', 'Estado'], active.map(o => tr([o.date, esc(clientName(o.clientId)), esc(o.detail), pill(o.status, 'wait')], { act: 'edit-row', id: o.id })).join(''))}</section>
<section class="card"><h3>Módulos del sistema</h3><p class="desc">Un núcleo adaptable a distintas verticales</p><div class="quick">${[['appointments', '▦', 'Agenda'], ['cash', '$', 'Ventas y caja'], ['inventory', '▤', 'Inventario'], ['work', '▧', 'Operaciones'], ['clients', '♙', 'Clientes'], ['services', '✦', 'Servicios'], ['automations', '✧', 'Automatizaciones'], ['reports', '▥', 'Reportes']].map(([p, i, l]) => `<button type="button" data-act="go" data-page="${p}">${i}<b>${l}</b></button>`).join('')}</div>
<div class="notice">${Store.mode === 'server' ? 'Tus datos se guardan en el servidor local de LUKARIS (carpeta <b>data/</b>) y se copian en este navegador.' : 'Modo sin servidor: la información se guarda solo en este navegador. Ejecuta <b>npm start</b> para guardarla en un archivo.'}</div></section></div>`;
  },
  appointments() {
    const rows = db.appointments.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map(a => tr([a.date, a.time, esc(clientName(a.clientId)), esc(serviceName(a.serviceId)), money(a.price), apptPill(a.status), attCount('appointment', a.id), acts('appointment', a.id)], { act: 'appt-detail', id: a.id, status: a.status, date: a.date, cls: a.date === today() ? 'today' : '' })).join('');
    $app().innerHTML = head('Programación', 'Agenda', 'Citas, reservas y reuniones. Toca una cita para ver su ficha y adjuntar archivos.', btn('+ Nueva cita', 'new', { type: 'appointment' }, 'primary')) + `<section class="card" id="scope">${filterBar({ status: C.APPT_STATUS, range: true })}${table(['Fecha', 'Hora', 'Cliente', 'Servicio', 'Valor', 'Estado', 'Adjuntos', ''], rows)}</section>`;
  },
  clients() {
    const rows = db.clients.map(c => tr([`<b>${esc(c.name)}</b>`, esc(c.phone || '—'), esc(c.email || '—'), attCount('client', c.id), acts('client', c.id, c.phone ? btn('WhatsApp', 'whatsapp-client', {id:c.id}, 'small') : '')], { act: 'client-detail', id: c.id, q: [c.name, c.phone, c.email].join(' ') })).join('');
    $app().innerHTML = head('Relaciones', 'Clientes', 'Base central de clientes. Toca un cliente para ver su ficha, citas y adjuntos.', btn('+ Nuevo cliente', 'new', { type: 'client' }, 'primary')) + `<section class="card" id="scope">${filterBar()}${table(['Nombre', 'Teléfono', 'Correo', 'Adjuntos', ''], rows)}</section>`;
  },
  commercial() {
    const act = C.activeSales(db);
    const qr = db.quotes.map(q => tr([q.date, esc(clientName(q.clientId)), esc(q.description), money(q.amount), `<span class="tagquote">${esc(q.status)}</span>`, q.status === 'Pendiente' ? `<div class="rowactions">${btn('Crear venta', 'convert-quote', { id: q.id }, 'small')}${btn('Editar', 'edit', { type: 'quote', id: q.id }, 'small')}${btn('Eliminar', 'delete', { type: 'quote', id: q.id }, 'small danger')}</div>` : '—'], { status: q.status })).join('');
    const sr = db.sales.map(s => tr([s.date, esc(clientName(s.clientId)), esc(s.description), money(s.total), money(s.paid), money(saleBalance(s)), `<span class="${s.voided ? 'pill bad' : saleBalance(s) > 0 ? 'tagdue' : 'tagpaid'}">${saleStatus(s)}</span>`, s.voided ? '—' : `<div class="rowactions">${saleBalance(s) > 0 ? btn('Abonar', 'pay-sale', { id: s.id }, 'small') : ''}${btn('Editar', 'edit', { type: 'sale', id: s.id }, 'small')}${btn('Anular', 'void-sale', { id: s.id }, 'small danger')}</div>`], { cls: s.voided ? 'void' : '', status: saleStatus(s) })).join('');
    $app().innerHTML = head('Actividad comercial', 'Cotizaciones y ventas', 'Crea propuestas, registra ventas y convierte cotizaciones en operaciones cobrables.', btn('+ Cotización', 'new', { type: 'quote' }) + btn('+ Nueva venta', 'new', { type: 'sale' }, 'primary')) +
      `<div class="stats"><div class="stat"><small>Cotizaciones abiertas</small><strong>${db.quotes.filter(q => q.status === 'Pendiente').length}</strong></div><div class="stat"><small>Ventas registradas</small><strong>${act.length}</strong></div><div class="stat"><small>Valor vendido</small><strong>${money(act.reduce((a, s) => a + (+s.total || 0), 0))}</strong></div><div class="stat"><small>Por cobrar</small><strong>${money(act.reduce((a, s) => a + saleBalance(s), 0))}</strong></div></div>
<section class="card" id="scope"><h3>Cotizaciones</h3><p class="desc">Propuestas pendientes o convertidas en venta.</p>${filterBar({ status: ['Pendiente', 'Convertida'] })}${table(['Fecha', 'Cliente', 'Concepto', 'Valor', 'Estado', 'Acción'], qr)}</section>
<section class="card" id="scope2"><h3>Ventas</h3><p class="desc">Cada venta conserva su total, pagos recibidos y saldo.</p>${filterBar({ status: ['Pagada', 'Abono parcial', 'Pendiente', 'Anulada'] })}${table(['Fecha', 'Cliente', 'Concepto', 'Total', 'Pagado', 'Saldo', 'Estado', 'Acción'], sr)}</section>`;
  },
  cash() {
    const sum = db.payments.reduce((s, p) => s + (+p.amount || 0), 0), open = C.activeSales(db).filter(s => saleBalance(s) > 0);
    const pr = db.payments.slice().sort((a, b) => b.date.localeCompare(a.date)).map(p => tr([p.date, esc(clientName(p.clientId)), esc(p.description), esc(p.method || '—'), money(p.amount), btn('Eliminar', 'delete', { type: 'payment', id: p.id }, 'small danger')])).join('');
    const dr = open.map(s => tr([esc(clientName(s.clientId)), esc(s.description), money(s.total), money(s.paid), `<b>${money(saleBalance(s))}</b>`, btn('Registrar abono', 'pay-sale', { id: s.id }, 'small')])).join('');
    $app().innerHTML = head('Finanzas', 'Caja y cuentas por cobrar', 'Controla los ingresos reales, los pagos parciales y los saldos pendientes.', btn('+ Registrar abono', 'new', { type: 'receivable' }, 'primary')) +
      `<div class="stats"><div class="stat"><small>Ingresos recibidos</small><strong>${money(sum)}</strong></div><div class="stat"><small>Transacciones</small><strong>${db.payments.length}</strong></div><div class="stat"><small>Cuentas por cobrar</small><strong>${money(open.reduce((a, s) => a + saleBalance(s), 0))}</strong></div><div class="stat"><small>Ventas con saldo</small><strong>${open.length}</strong></div></div>
<section class="card"><h3>Saldos pendientes</h3><p class="desc">El saldo se calcula como total de la venta menos pagos registrados.</p>${table(['Cliente', 'Concepto', 'Total', 'Pagado', 'Saldo', 'Acción'], dr)}</section>
<section class="card" id="scope"><h3>Historial de pagos</h3><p class="desc">Eliminar un pago lo descuenta de la venta asociada.</p>${filterBar()}${table(['Fecha', 'Cliente', 'Concepto', 'Método', 'Valor recibido', ''], pr)}</section>`;
  },
  services() {
    $app().innerHTML = head('Catálogo', 'Servicios', 'Servicios que ofrece el negocio.', btn('+ Nuevo servicio', 'new', { type: 'service' }, 'primary')) + `<section class="card" id="scope">${filterBar()}${table(['Servicio', 'Duración', 'Precio', ''], db.services.map(s => tr([esc(s.name), s.duration + ' min', money(s.price), acts('service', s.id)])).join(''))}</section>`;
  },
  inventory() {
    const rows = db.products.map(p => tr([`<b>${esc(p.name)}</b>`, esc(p.sku || '—'), pill(p.stock, p.stock < 5 ? 'wait' : 'ok'), money(p.cost), money(p.price), acts('product', p.id, btn('Movimiento', 'new', { type: 'movement', id: p.id }, 'small'))])).join('');
    const mv = db.inventoryMovements.slice().reverse().slice(0, 15).map(m => tr([m.date, esc(byId('products', m.productId)?.name || 'Producto'), esc(m.type), m.quantity, esc(m.reason || '—')])).join('');
    $app().innerHTML = head('Productos', 'Inventario', 'Consulta existencias y registra entradas, salidas o ajustes con trazabilidad.', btn('+ Agregar producto', 'new', { type: 'product' }, 'primary') + btn('+ Movimiento', 'new', { type: 'movement' })) +
      `<section class="card" id="scope"><h3>Existencias</h3>${filterBar()}${table(['Producto', 'SKU', 'Stock', 'Costo', 'Precio venta', ''], rows)}</section><section class="card"><h3>Últimos movimientos</h3><p class="desc">Cada movimiento actualiza las existencias del producto.</p>${table(['Fecha', 'Producto', 'Tipo', 'Cantidad', 'Motivo'], mv)}</section>`;
  },
  work() {
    $app().innerHTML = head('Operaciones', 'Operaciones', 'Trabajos, proyectos, pedidos o solicitudes según tu actividad.', btn('+ Nueva orden', 'new', { type: 'order' }, 'primary')) + `<section class="card" id="scope">${filterBar({ status: C.ORDER_STATUS })}${table(['Fecha', 'Cliente', 'Referencia', 'Trabajo', 'Estado', 'Valor', ''], db.orders.map(o => tr([o.date, esc(clientName(o.clientId)), esc(o.vehicle), esc(o.detail), pill(o.status, o.status === 'Entregado' ? 'ok' : 'wait'), money(o.amount), acts('order', o.id)], { status: o.status })).join(''))}</section>`;
  },
  automations() {
    const items = [
      ['appointmentReminder','Recordatorios de citas','Envía avisos antes de cada cita y solicita confirmación.','Agenda · WhatsApp'],
      ['followup','Seguimiento posventa','Prepara un mensaje después de una compra o servicio.','CRM · Fidelización'],
      ['birthday','Cumpleaños de clientes','Detecta fechas especiales y prepara un saludo o beneficio.','CRM · Marketing'],
      ['lowStock','Alerta de inventario bajo','Identifica productos por debajo del mínimo configurado.','Inventario · Operaciones'],
      ['leadWelcome','Bienvenida a nuevos clientes','Prepara una respuesta inicial para nuevos contactos.','CRM · Atención']
    ];
    const enabled = items.filter(x => db.automations[x[0]]).length;
    $app().innerHTML = head('Productividad', 'Centro de automatizaciones', 'Configura flujos que reducen tareas repetitivas. En esta beta puedes activar reglas y probar simulaciones; los envíos automáticos reales requieren conectar proveedores.', btn('Probar flujos', 'test-automations', {}, 'primary')) +
      `<div class="stats"><div class="stat"><small>Flujos disponibles</small><strong>${items.length}</strong></div><div class="stat"><small>Activos</small><strong>${enabled}</strong></div><div class="stat"><small>Canal preparado</small><strong>WhatsApp</strong></div><div class="stat"><small>Estado de conexión</small><strong>Demo</strong></div></div>
      <div class="automation-grid">${items.map(([id,name,desc,tag]) => `<section class="card automation-card"><div class="automation-top"><span class="automation-icon">✧</span>${db.automations[id] ? pill('Activo','ok') : pill('Inactivo')}</div><h3>${name}</h3><p class="desc">${desc}</p><small class="eyebrow">${tag}</small><div class="actions"><button class="btn ${db.automations[id] ? '' : 'primary'}" data-act="toggle-automation" data-id="${id}">${db.automations[id] ? 'Desactivar' : 'Activar flujo'}</button><button class="btn" data-act="preview-automation" data-id="${id}">Ver ejemplo</button></div></section>`).join('')}</div>
      <section class="card"><h3>Cómo funcionaría en una cuenta conectada</h3><div class="steps"><div><b>1. Evento</b><p>Una cita se crea, una venta se completa o un producto llega al mínimo.</p></div><div><b>2. Regla</b><p>LUKARIS revisa condiciones, horarios, preferencias y permisos.</p></div><div><b>3. Acción</b><p>Se ejecuta el mensaje, tarea o alerta mediante el canal conectado.</p></div><div><b>4. Registro</b><p>Queda historial del resultado para seguimiento y control.</p></div></div><div class="notice">La beta no envía mensajes automáticos ni se conecta todavía a WhatsApp Business API, correo o calendarios externos. Los botones de prueba muestran el comportamiento esperado sin contactar clientes.</div></section>`;
  },
  reports() {
    const totalSales = C.activeSales(db).reduce((n,x)=>n+(+x.total||0),0), paid = db.payments.reduce((n,x)=>n+(+x.amount||0),0);
    const outstanding = C.activeSales(db).reduce((n,x)=>n+C.saleBalance(x),0);
    const stockValue = db.products.reduce((n,x)=>n+(+x.stock||0)*(+x.cost||0),0);
    const low = db.products.filter(x => (+x.stock||0) <= 3);
    const appts = db.appointments.filter(x => x.status !== 'Cancelada');
    const completed = appts.filter(x => x.status === 'Atendida').length;
    const rate = appts.length ? Math.round(completed/appts.length*100) : 0;
    const top = db.services.map(x => ({name:x.name,n:db.appointments.filter(a=>a.serviceId===x.id && a.status!=='Cancelada').length})).sort((a,b)=>b.n-a.n).slice(0,5);
    $app().innerHTML = head('Inteligencia del negocio', 'Reportes y analítica', 'Indicadores calculados con la información registrada en esta cuenta.', btn('Exportar ventas CSV', 'export-csv', {kind:'sales'}, 'primary')) +
      `<div class="stats"><div class="stat"><small>Ventas registradas</small><strong>${money(totalSales)}</strong></div><div class="stat"><small>Recaudado en pagos</small><strong>${money(paid)}</strong></div><div class="stat"><small>Cartera pendiente</small><strong>${money(outstanding)}</strong></div><div class="stat"><small>Valor del inventario</small><strong>${money(stockValue)}</strong></div></div>
      <div class="grid2"><section class="card"><h3>Actividad de agenda</h3><p class="desc">Citas no canceladas: ${appts.length}</p><div class="report-number">${rate}%</div><p class="desc">Porcentaje de citas marcadas como atendidas</p><div class="bar"><span style="width:${rate}%"></span></div><p class="desc">${completed} atendidas · ${appts.length-completed} pendientes o confirmadas</p></section>
      <section class="card"><h3>Inventario para revisar</h3><p class="desc">${low.length} producto(s) con 3 unidades o menos</p>${low.length ? table(['Producto','Existencias'],low.map(p=>tr([esc(p.name),`<b>${p.stock}</b>`])).join('')) : '<div class="empty">No hay alertas de stock bajo.</div>'}</section></div>
      <section class="card"><h3>Servicios más solicitados</h3>${top.length ? top.map(x=>`<div class="report-row"><span>${esc(x.name)}</span><b>${x.n} cita(s)</b></div>`).join('') : '<div class="empty">Registra servicios y citas para ver este reporte.</div>'}</section>
      <div class="notice">Los indicadores son operativos y se calculan sobre los registros disponibles. No representan estados financieros certificados ni sustituyen contabilidad o reportes fiscales.</div>`;
  },
  settings() { settingsPage(); }
};

// ---------- fichas ----------
function attachBlock(ownerType, ownerId, readonlyList = false) {
  const list = C.attachmentsOf(db, ownerType, ownerId);
  const icon = n => /^(jpe?g|png|gif|webp)$/.test(C.fileExt(n)) ? '🖼' : C.fileExt(n) === 'pdf' ? '📕' : '📄';
  const items = list.map(a => `<div class="file"><span class="fi">${icon(a.name)}</span><div class="fn"><b title="${esc(a.name)}">${esc(a.name)}</b><small>${formatBytes(a.size)} · ${esc((a.createdAt || '').slice(0, 10))}</small></div><div class="fa">${btn('Abrir', 'file-open', { id: a.id }, 'small')}${btn('Descargar', 'file-download', { id: a.id }, 'small')}${readonlyList ? '' : btn('Quitar', 'file-delete', { id: a.id }, 'small danger')}</div></div>`).join('');
  return `<div class="attach"><h3>Adjuntos (${list.length})</h3>${items || '<p class="desc" style="margin:0 0 8px">Sin archivos adjuntos.</p>'}${readonlyList ? '' : `<label class="btn small" style="display:inline-block">+ Adjuntar archivos<input type="file" multiple hidden data-attach="${ownerType}:${ownerId}" accept="${C.FILE_EXT.map(e => '.' + e).join(',')}"></label><p class="desc" style="margin:8px 0 0">Hasta ${formatBytes(C.MAX_FILE_BYTES)} por archivo · ${C.FILE_EXT.join(', ')}</p>`}</div>`;
}
function apptDetail(id) {
  const a = byId('appointments', id); if (!a) return;
  openModal('Cita · ' + a.date + ' ' + a.time, `<dl class="kv"><dt>Cliente</dt><dd><a href="#" data-act="client-detail" data-id="${a.clientId}">${esc(clientName(a.clientId))}</a></dd><dt>Servicio</dt><dd>${esc(serviceName(a.serviceId))}</dd><dt>Valor</dt><dd>${money(a.price)}</dd><dt>Estado</dt><dd>${apptPill(a.status)}</dd>${a.notes ? `<dt>Notas</dt><dd>${esc(a.notes)}</dd>` : ''}</dl>
<b style="font-size:12px">Cambiar estado</b><div class="chips">${C.APPT_STATUS.map(s => `<button type="button" class="chip ${a.status === s ? 'on' : ''}" data-act="appt-status" data-id="${a.id}" data-status="${s}">${s}</button>`).join('')}</div>${attachBlock('appointment', a.id)}
<div class="actions">${btn('Eliminar', 'delete', { type: 'appointment', id: a.id }, 'danger')}${btn('Editar', 'edit', { type: 'appointment', id: a.id })}${btn('Cerrar', 'close', {}, 'primary')}</div>`, 'appt:' + a.id);
}
function clientDetail(id) {
  const c = byId('clients', id); if (!c) return;
  const sales = db.sales.filter(s => s.clientId === id), act = sales.filter(s => !s.voided), pays = db.payments.filter(p => p.clientId === id), quotes = db.quotes.filter(q => q.clientId === id), apps = db.appointments.filter(a => a.clientId === id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const sold = act.reduce((a, s) => a + (+s.total || 0), 0), paid = act.reduce((a, s) => a + (+s.paid || 0), 0), due = act.reduce((a, s) => a + saleBalance(s), 0);
  const apptFiles = apps.flatMap(a => C.attachmentsOf(db, 'appointment', a.id).map(f => ({ ...f, when: a.date })));
  openModal(c.name, `<p class="desc">${esc(c.phone || 'Sin teléfono')} · ${esc(c.email || 'sin correo')}</p>${c.notes ? `<p class="desc">${esc(c.notes)}</p>` : ''}
<div class="inline-actions" style="margin:0 0 12px">${btn('+ Cita', 'new', { type: 'appointment', client: id, back: 'client:' + id }, 'small primary')}${btn('+ Cotización', 'new', { type: 'quote', client: id, back: 'client:' + id }, 'small')}${btn('+ Venta', 'new', { type: 'sale', client: id, back: 'client:' + id }, 'small')}${btn('Editar', 'edit', { type: 'client', id }, 'small')}${btn('Eliminar', 'delete', { type: 'client', id }, 'small danger')}</div>
<div class="stats" style="grid-template-columns:repeat(3,1fr)"><div class="stat"><small>Vendido</small><strong>${money(sold)}</strong></div><div class="stat"><small>Pagado</small><strong>${money(paid)}</strong></div><div class="stat"><small>Saldo</small><strong>${money(due)}</strong></div></div>
${attachBlock('client', id)}
<h3>Citas (${apps.length})</h3>${table(['Fecha', 'Hora', 'Servicio', 'Estado', 'Adj.'], apps.map(a => tr([a.date, a.time, esc(serviceName(a.serviceId)), apptPill(a.status), attCount('appointment', a.id)], { act: 'appt-detail', id: a.id })).join(''))}
${apptFiles.length ? `<div class="attach"><h3>Archivos de sus citas</h3>${apptFiles.map(f => `<div class="file"><span class="fi">📎</span><div class="fn"><b>${esc(f.name)}</b><small>Cita del ${esc(f.when)} · ${formatBytes(f.size)}</small></div><div class="fa">${btn('Abrir', 'file-open', { id: f.id }, 'small')}</div></div>`).join('')}</div>` : ''}
<h3>Cotizaciones</h3>${table(['Fecha', 'Concepto', 'Importe', 'Estado'], quotes.map(q => tr([esc(q.date), esc(q.description), money(q.amount), esc(q.status)])).join(''))}
<h3>Ventas</h3>${table(['Fecha', 'Concepto', 'Total', 'Saldo', 'Estado'], sales.map(s => tr([esc(s.date), esc(s.description), money(s.total), money(saleBalance(s)), saleStatus(s)])).join(''))}
<h3>Pagos</h3>${table(['Fecha', 'Concepto', 'Monto'], pays.map(p => tr([esc(p.date), esc(p.description), money(p.amount)])).join(''))}<div class="actions">${btn('Cerrar', 'close', {}, 'primary')}</div>`, 'client:' + id);
}
function reopen(back) { const [k, id] = String(back || '').split(':'); if (k === 'client') clientDetail(+id); else if (k === 'appt') apptDetail(+id); }

// ================= Formularios =================
const fld = (label, name, o = {}) => `<label class="field ${o.full ? 'full' : ''}" data-name="${name}">${label}<input name="${name}" type="${o.type || 'text'}" value="${esc(o.value ?? '')}" ${o.req ? 'required' : ''} ${o.attrs || ''}></label>`;
const area = (label, name, value = '', full = true) => `<label class="field ${full ? 'full' : ''}" data-name="${name}">${label}<textarea name="${name}" rows="2">${esc(value)}</textarea></label>`;
const sel = (label, name, options, value, full = false) => `<label class="field ${full ? 'full' : ''}" data-name="${name}">${label}<select name="${name}">${options.map(([v, l, x]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''} ${x || ''}>${esc(l)}</option>`).join('')}</select></label>`;
const list = a => a.map(x => [x, x]);
const clientOpts = () => db.clients.map(c => [c.id, c.name]);
const NEEDS_CLIENT = ['appointment', 'quote', 'sale', 'order'];
const fileField = (ownerType, id) => `<div class="attach" style="margin-top:14px"><label class="field" data-name="files">Adjuntar archivos (opcional)<input type="file" name="files" multiple accept="${C.FILE_EXT.map(e => '.' + e).join(',')}"></label>${id ? `<p class="desc" style="margin:8px 0 0">Ya adjuntos: ${C.attachmentsOf(db, ownerType, id).map(a => esc(a.name)).join(', ') || 'ninguno'}. Gestiona los existentes desde la ficha.</p>` : ''}</div>`;

function formSpec(type, o) {
  const LISTOF = { client: 'clients', service: 'services', appointment: 'appointments', product: 'products', order: 'orders', quote: 'quotes', sale: 'sales', unit: 'organizationUnits' };
  const rec = o.id && LISTOF[type] ? byId(LISTOF[type], o.id) : null;
  const r = rec || {}, edit = !!rec, d = today();
  switch (type) {
    case 'client': return [edit ? 'Editar cliente' : 'Nuevo cliente', `<div class="formgrid">${fld('Nombre', 'name', { value: r.name, req: true, full: true })}${fld('Teléfono', 'phone', { value: r.phone, type: 'tel' })}${fld('Correo', 'email', { value: r.email, type: 'email' })}${area('Notas', 'notes', r.notes)}</div>${fileField('client', r.id)}`, 'Guardar cliente'];
    case 'service': return [edit ? 'Editar servicio' : 'Nuevo servicio', `<div class="formgrid">${fld('Nombre', 'name', { value: r.name, req: true, full: true })}${fld('Precio', 'price', { value: r.price ?? '', type: 'number', attrs: 'min="0" step="any"', req: true })}${fld('Duración (min)', 'duration', { value: r.duration ?? 30, type: 'number', attrs: 'min="5" step="1"', req: true })}</div>`, 'Guardar servicio'];
    case 'appointment': {
      const sid = r.serviceId || db.services[0]?.id, price = edit ? r.price : (byId('services', sid)?.price || 0);
      return [edit ? 'Editar cita' : 'Nueva cita', `<div class="formgrid">${sel('Cliente', 'clientId', clientOpts(), r.clientId || o.client || db.clients[0]?.id, true)}${sel('Servicio', 'serviceId', db.services.map(s => [s.id, `${s.name} — ${money(s.price)}`]), sid, true)}${fld('Fecha', 'date', { type: 'date', value: r.date || d, req: true })}${fld('Hora', 'time', { type: 'time', value: r.time || '09:00', req: true })}${sel('Estado', 'status', list(C.APPT_STATUS), r.status || 'Confirmada')}${fld('Valor', 'price', { type: 'number', value: price, attrs: 'min="0" step="any"', req: true })}${area('Notas', 'notes', r.notes)}</div><div id="conflict"></div>${fileField('appointment', r.id)}`, 'Guardar cita'];
    }
    case 'product': return [edit ? 'Editar producto' : 'Agregar producto', `<div class="formgrid">${fld('Nombre', 'name', { value: r.name, req: true, full: true })}${fld('SKU / código', 'sku', { value: r.sku })}${edit ? `<label class="field">Existencias<input value="${r.stock}" disabled></label>` : fld('Existencias', 'stock', { type: 'number', value: 0, attrs: 'min="0" step="1"' })}${fld('Costo', 'cost', { type: 'number', value: r.cost ?? 0, attrs: 'min="0" step="any"' })}${fld('Precio venta', 'price', { type: 'number', value: r.price ?? 0, attrs: 'min="0" step="any"' })}</div>${edit ? '<p class="desc">Las existencias se cambian con movimientos de inventario para conservar la trazabilidad.</p>' : ''}`, 'Guardar producto'];
    case 'order': return [edit ? 'Editar operación' : 'Nueva operación', `<div class="formgrid">${sel('Cliente', 'clientId', clientOpts(), r.clientId || o.client, true)}${fld('Referencia / activo', 'vehicle', { value: r.vehicle, req: true, full: true, attrs: 'placeholder="Código, equipo, pedido o referencia"' })}${area('Trabajo solicitado', 'detail', r.detail)}${fld('Fecha', 'date', { type: 'date', value: r.date || d, req: true })}${fld('Valor estimado', 'amount', { type: 'number', value: r.amount ?? '', attrs: 'min="0" step="any"', req: true })}${sel('Estado', 'status', list(C.ORDER_STATUS), r.status || 'Recibido', true)}</div>`, 'Guardar operación'];
    case 'quote': return [edit ? 'Editar cotización' : 'Nueva cotización', `<div class="formgrid">${sel('Cliente', 'clientId', clientOpts(), r.clientId || o.client, true)}${fld('Concepto / propuesta', 'description', { value: r.description, req: true, full: true })}${fld('Valor cotizado', 'amount', { type: 'number', value: r.amount ?? '', attrs: 'min="0.01" step="any"', req: true })}${fld('Fecha', 'date', { type: 'date', value: r.date || d, req: true })}${fld('Válida hasta', 'validUntil', { type: 'date', value: r.validUntil || C.addDays(15) })}</div>`, 'Guardar cotización'];
    case 'sale': return edit
      ? ['Editar venta', `<div class="formgrid">${sel('Cliente', 'clientId', clientOpts(), r.clientId, true)}${fld('Concepto', 'description', { value: r.description, req: true, full: true })}${fld('Total de venta', 'total', { type: 'number', value: r.total, attrs: 'min="0.01" step="any"', req: true })}${fld('Fecha', 'date', { type: 'date', value: r.date, req: true })}</div><p class="desc">Pagado hasta ahora: ${money(r.paid)}. El producto y los pagos no se editan aquí.</p>`, 'Guardar venta']
      : ['Nueva venta', `<div class="formgrid">${sel('Cliente', 'clientId', clientOpts(), o.client || db.clients[0]?.id, true)}${fld('Concepto', 'description', { req: true, full: true, attrs: 'placeholder="Detalle de la venta"' })}${fld('Total de venta', 'total', { type: 'number', attrs: 'min="0.01" step="any"', req: true })}${fld('Pago recibido ahora', 'paid', { type: 'number', value: 0, attrs: 'min="0" step="any"' })}${fld('Fecha', 'date', { type: 'date', value: d, req: true })}${sel('Método de pago', 'method', list(C.METHODS), 'Efectivo')}${sel('Producto (opcional)', 'productId', [['', 'No asociar producto'], ...db.products.map(p => [p.id, `${p.name} · stock ${p.stock}`])], '', true)}${fld('Cantidad', 'quantity', { type: 'number', value: 1, attrs: 'min="1" step="1"' })}</div><p class="desc">Si asocias un producto, se descontará del inventario. El pago inicial no puede superar el total.</p>`, 'Registrar venta'];
    case 'receivable': {
      const open = C.activeSales(db).filter(s => saleBalance(s) > 0), pre = open.find(s => s.id === o.saleId) || open[0];
      return ['Registrar abono', open.length ? `<div class="formgrid">${sel('Venta pendiente', 'saleId', open.map(s => [s.id, `${clientName(s.clientId)} — ${s.description} · saldo ${money(saleBalance(s))}`, `data-balance="${saleBalance(s)}"`]), pre?.id, true)}${fld('Valor del abono', 'amount', { type: 'number', value: pre ? saleBalance(pre) : '', attrs: 'min="0.01" step="any"', req: true })}${fld('Fecha', 'date', { type: 'date', value: d, req: true })}${sel('Método', 'method', list(C.METHODS), 'Efectivo', true)}</div>` : '<p class="desc">No hay ventas con saldo pendiente.</p>', 'Guardar abono', !open.length];
    }
    case 'movement': return ['Movimiento de inventario', `<div class="formgrid">${sel('Producto', 'productId', db.products.map(p => [p.id, `${p.name} · stock ${p.stock}`]), o.id || db.products[0]?.id, true)}${sel('Tipo', 'type', list(C.MOVE_TYPES), 'Entrada')}${fld('Cantidad', 'quantity', { type: 'number', value: 1, attrs: 'min="0" step="1"', req: true })}${fld('Fecha', 'date', { type: 'date', value: d, req: true })}${fld('Motivo', 'reason', { full: true, attrs: 'placeholder="Compra, venta, devolución, corrección…"' })}</div><p class="desc">Entrada suma; salida descuenta; ajuste establece el stock final indicado.</p>`, 'Guardar movimiento', !db.products.length];
    case 'unit': {
      const parents = db.organizationUnits.filter(u => u.kind === 'business' && u.id !== r.id).map(u => [u.id, u.name]);
      return [edit ? 'Editar empresa o sucursal' : 'Agregar empresa o sucursal', `<div class="formgrid">${fld('Nombre', 'name', { value: r.name, req: true, full: true })}${sel('Tipo', 'kind', [['business', 'Empresa independiente'], ['branch', 'Sucursal de una empresa']], r.kind || 'business')}${sel('Empresa principal (solo sucursales)', 'parentId', [['', '—'], ...parents], r.parentId || '')}</div>`, 'Guardar'];
    }
  }
}
function openForm(type, o = {}) {
  if (NEEDS_CLIENT.includes(type) && !db.clients.length) { toast('Primero crea un cliente.', 'err'); return openForm('client', { back: o.back }); }
  if (type === 'appointment' && !db.services.length) { toast('Primero crea un servicio.', 'err'); return openForm('service'); }
  if (type === 'movement' && !db.products.length) { toast('Primero agrega un producto.', 'err'); return openForm('product'); }
  const [title, html, label, disabled] = formSpec(type, o);
  openModal(title, `<form data-form="${type}" data-id="${o.id && type !== 'movement' ? o.id : ''}" data-back="${esc(o.back || '')}" novalidate>${html}<div class="actions"><button type="button" class="btn" data-act="cancel-form">Cancelar</button><button type="submit" class="btn primary" ${disabled ? 'disabled' : ''}>${label}</button></div></form>`);
}
function clearErrors(form) { form.querySelectorAll('.invalid').forEach(l => l.classList.remove('invalid')); form.querySelectorAll('.err').forEach(e => e.remove()); }
function showErrors(form, errs) {
  let first = null;
  for (const [k, msg] of Object.entries(errs)) {
    const lab = form.querySelector(`[data-name="${k}"]`) || form.querySelector(`[name="${k}"]`)?.closest('label'); if (!lab) { toast(msg, 'err'); continue; }
    lab.classList.add('invalid'); lab.insertAdjacentHTML('beforeend', `<small class="err" role="alert">${esc(msg)}</small>`); first = first || lab;
  }
  first?.querySelector('input,select,textarea')?.focus();
}
async function attachFiles(ownerType, ownerId, files) {
  let ok = 0; const errs = [];
  for (const f of files) {
    const e = C.validateFile(f); if (e) { errs.push(e); continue; }
    const id = C.nextId(db);
    try {
      await Store.putBlob(id, f);
      const r = C.addAttachment(db, { id, ownerType, ownerId, name: f.name, size: f.size, mime: f.type });
      if (!r.ok) { await Store.delBlob(id); errs.push(r.error); continue; }
      ok++; save();
    } catch (err) { errs.push(`"${f.name}": ${err.message || 'no se pudo guardar'}`); }
  }
  return { ok, errs };
}
const OWNER = { client: 'client', appointment: 'appointment' };
async function handleForm(form) {
  const type = form.dataset.form, editId = form.dataset.id ? +form.dataset.id : null, back = form.dataset.back || '';
  const raw = {}; for (const [k, v] of new FormData(form).entries()) if (typeof v === 'string') raw[k] = v;
  clearErrors(form);
  const files = [...(form.querySelector('input[type=file]')?.files || [])];
  const r = C.validate(type, raw, db, { editId }), errs = { ...r.errors }, fe = files.map(C.validateFile).filter(Boolean);
  if (fe.length) errs.files = fe.join(' ');
  if (Object.keys(errs).length) return showErrors(form, errs);
  if (type === 'appointment' && !form.dataset.force) {
    const cf = C.appointmentConflicts(db, r.value, editId);
    if (cf.length) { form.querySelector('#conflict').innerHTML = `<div class="notice warn" role="alert">Ya hay ${cf.length === 1 ? 'una cita' : cf.length + ' citas'} en ese horario (${cf.map(a => esc(clientName(a.clientId)) + ' ' + a.time).join(', ')}). Pulsa de nuevo para guardar de todas formas.</div>`; form.dataset.force = '1'; form.querySelector('[type=submit]').textContent = 'Guardar de todas formas'; return; }
  }
  const submitBtn = form.querySelector('[type=submit]'); submitBtn.disabled = true;
  const res = C.commit(db, type, r.value, editId);
  if (!res.ok) { toast(res.error, 'err'); submitBtn.disabled = false; return; }
  save();
  let msg = 'Guardado.';
  if (files.length && OWNER[type]) {
    const a = await attachFiles(type, editId || res.id, files);
    msg = a.ok ? `Guardado con ${a.ok} adjunto${a.ok > 1 ? 's' : ''}.` : msg; if (a.errs.length) toast(a.errs.join(' '), 'err');
  }
  closeModal(); render(); if (back) reopen(back); toast(msg);
}

// ================= Acciones (todos los botones pasan por aquí) =================
const LABEL = { client: 'este cliente', service: 'este servicio', appointment: 'esta cita', product: 'este producto', order: 'esta operación', quote: 'esta cotización', payment: 'este pago', unit: 'esta empresa o sucursal' };
async function openFile(id, download) {
  const a = db.attachments.find(x => x.id === id); if (!a) return toast('El adjunto ya no existe.', 'err');
  try {
    if (Store.mode === 'server' && !download) { window.open('/api/files/' + id, '_blank', 'noopener'); return; }
    const url = URL.createObjectURL(await Store.getBlob(id));
    if (download) { const l = document.createElement('a'); l.href = url; l.download = a.name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); }
    else { window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); }
  } catch (e) { toast(e.message || 'No se pudo abrir el archivo.', 'err'); }
}

function loadShowcaseData() {
  const d = C.defaultDb(), day = C.today();
  d.profile = { ...d.profile, name: 'LUKARIS Demo · Centro Integral', type: 'services', country: 'Colombia', currency: 'COP', language: 'es', timezone: 'America/Bogota', onboarded: true, modulesSet: false };
  d.clients = [
    {id:1,name:'Alex Rivera',phone:'3005550101',email:'alex@example.com',notes:'Cliente frecuente'},
    {id:2,name:'María Torres',phone:'3105550182',email:'maria@example.com',notes:'Prefiere atención en la mañana'},
    {id:3,name:'Sofía Gómez',phone:'3155550123',email:'sofia@example.com',notes:'Solicitó cotización'},
    {id:4,name:'Carlos Méndez',phone:'3205550144',email:'carlos@example.com',notes:'Cliente nuevo'},
    {id:5,name:'Valentina Ruiz',phone:'3005550199',email:'vale@example.com',notes:'Seguimiento posventa'}
  ];
  d.services = [
    {id:1,name:'Consulta inicial',price:50000,duration:30},
    {id:2,name:'Servicio premium',price:120000,duration:60},
    {id:3,name:'Mantenimiento especializado',price:95000,duration:90},
    {id:4,name:'Asesoría empresarial',price:180000,duration:60},
    {id:5,name:'Tratamiento integral',price:150000,duration:75}
  ];
  d.appointments = [
    {id:1,clientId:1,serviceId:2,date:day,time:'09:00',status:'Confirmada',price:120000,notes:'Ejemplo de reserva confirmada'},
    {id:2,clientId:2,serviceId:1,date:C.addDays(1),time:'10:30',status:'Pendiente',price:50000,notes:'Pendiente de confirmación'},
    {id:3,clientId:3,serviceId:4,date:C.addDays(1),time:'14:00',status:'Confirmada',price:180000},
    {id:4,clientId:4,serviceId:3,date:C.addDays(2),time:'11:00',status:'Pendiente',price:95000},
    {id:5,clientId:5,serviceId:5,date:C.addDays(-1),time:'15:00',status:'Atendida',price:150000}
  ];
  d.products = [
    {id:1,name:'Kit de cuidado profesional',sku:'KIT-001',stock:12,cost:45000,price:79000},
    {id:2,name:'Producto especializado',sku:'PRD-002',stock:3,cost:28000,price:49000},
    {id:3,name:'Accesorio premium',sku:'ACC-003',stock:24,cost:12000,price:25000}
  ];
  d.sales = [
    {id:1,clientId:1,description:'Servicio premium',total:120000,paid:120000,date:day,createdAt:new Date().toISOString()},
    {id:2,clientId:2,description:'Kit de cuidado profesional',total:158000,paid:79000,date:day,productId:1,quantity:2,createdAt:new Date().toISOString()},
    {id:3,clientId:3,description:'Asesoría empresarial',total:180000,paid:50000,date:C.addDays(-2),createdAt:new Date().toISOString()}
  ];
  d.payments = [
    {id:1,clientId:1,saleId:1,description:'Pago completo',amount:120000,date:day,method:'Transferencia'},
    {id:2,clientId:2,saleId:2,description:'Abono inicial',amount:79000,date:day,method:'Tarjeta'},
    {id:3,clientId:3,saleId:3,description:'Abono',amount:50000,date:C.addDays(-2),method:'Efectivo'}
  ];
  d.quotes = [{id:1,clientId:4,description:'Paquete de servicios empresariales',amount:350000,date:day,validUntil:C.addDays(7),status:'Pendiente'}];
  d.orders = [
    {id:1,clientId:2,vehicle:'Orden #1001',detail:'Preparación de pedido y coordinación de entrega',date:day,status:'En proceso',amount:158000},
    {id:2,clientId:5,vehicle:'Proyecto #1002',detail:'Seguimiento de servicio y control de calidad',date:C.addDays(-1),status:'Listo para entregar',amount:150000}
  ];
  d.inventoryMovements = [{id:1,productId:1,type:'Entrada',quantity:12,date:day,reason:'Inventario inicial'},{id:2,productId:2,type:'Entrada',quantity:3,date:day,reason:'Inventario inicial'}];
  d.organizationUnits = [{id:1,name:'LUKARIS Demo · Centro Integral',kind:'business',parentId:null,country:'Colombia'},{id:2,name:'Sucursal Norte',kind:'branch',parentId:1,country:'Colombia'}];
  d.meta.nextId = 20;
  d.automations = {appointmentReminder:true,followup:true,birthday:false,lowStock:true,leadWelcome:true};
  return C.migrate(d);
}
const ACTIONS = {
  go: d => { closeModal(); go(d.page); },
  close: () => closeModal(),
  'cancel-form': () => { const back = $('#mbody form')?.dataset.back; closeModal(); if (back) reopen(back); },
  'new-menu': () => openModal('¿Qué quieres crear?', `<div class="menu-grid">${[['appointment', '▦ Cita'], ['client', '♙ Cliente'], ['quote', '▣ Cotización'], ['sale', '$ Venta'], ['receivable', '$ Abono'], ['product', '▤ Producto'], ['order', '▧ Operación'], ['service', '✦ Servicio']].map(([t, l]) => `<button type="button" data-act="new" data-type="${t}">${l}</button>`).join('')}</div>`),
  new: d => openForm(d.type, { id: d.type === 'movement' && d.id ? +d.id : null, client: d.client ? +d.client : null, back: d.back }),
  edit: d => { const id = +d.id, back = currentDetail === (d.type === 'client' ? 'client:' : 'appt:') + id ? currentDetail : ''; openForm(d.type, { id, back }); },
  'edit-row': d => openForm('order', { id: +d.id }),
  delete: async d => {
    const type = d.type, id = +d.id, back = currentDetail;
    if (!await confirmBox({ title: 'Eliminar', message: `¿Eliminar ${LABEL[type]}? Esta acción no se puede deshacer.`, label: 'Eliminar', danger: true })) { if (back) reopen(back); return; }
    const r = C.remove(db, type, id);
    if (!r.ok) { toast(r.error, 'err'); if (back) reopen(back); return; }
    save(); for (const f of r.removedFiles) await Store.delBlob(f);
    closeModal(); render(); toast('Eliminado.');
  },
  'appt-detail': d => apptDetail(+d.id),
  'client-detail': d => clientDetail(+d.id),
  'whatsapp-client': d => { const c = byId('clients',+d.id); if (!c || !c.phone) return toast('Este cliente no tiene teléfono registrado.','err'); let phone = c.phone.replace(/\D/g,''); if (String(db.profile.country || '').toLowerCase().includes('colombia') && phone.length === 10) phone = '57' + phone; const msg = encodeURIComponent(`Hola ${c.name}, te contactamos de parte de ${db.profile.name}. ¿En qué podemos ayudarte?`); window.open(`https://wa.me/${phone}?text=${msg}`,'_blank','noopener'); },
  'appt-status': d => { const a = byId('appointments', +d.id); if (!a || !C.APPT_STATUS.includes(d.status)) return; a.status = d.status; save(); render(); apptDetail(a.id); toast('Estado actualizado.'); },
  'convert-quote': async d => { if (!await confirmBox({ title: 'Crear venta', message: '¿Convertir esta cotización en una venta?', label: 'Crear venta' })) return; const r = C.convertQuote(db, +d.id); if (!r.ok) return toast(r.error, 'err'); save(); go('commercial'); toast('Venta creada.'); },
  'pay-sale': d => openForm('receivable', { saleId: +d.id }),
  'void-sale': async d => { if (!await confirmBox({ title: 'Anular venta', message: '¿Anular esta venta? Se devolverá el producto al inventario.', label: 'Anular', danger: true })) return; const r = C.voidSale(db, +d.id); if (!r.ok) return toast(r.error, 'err'); save(); render(); toast('Venta anulada.'); },
  'file-open': d => openFile(+d.id, false),
  'file-download': d => openFile(+d.id, true),
  'file-delete': async d => {
    const id = +d.id, back = currentDetail;
    if (!await confirmBox({ title: 'Quitar adjunto', message: '¿Quitar este archivo?', label: 'Quitar', danger: true })) { if (back) reopen(back); return; }
    if (C.removeAttachment(db, id).ok) { save(); await Store.delBlob(id); } render(); if (back) reopen(back); toast('Adjunto eliminado.');
  },
  'toggle-automation': d => { if (!Object.prototype.hasOwnProperty.call(db.automations,d.id)) return; db.automations[d.id] = !db.automations[d.id]; save(); render(); toast(db.automations[d.id] ? 'Flujo activado en modo de demostración.' : 'Flujo desactivado.'); },
  'preview-automation': d => { const labels = {appointmentReminder:'Ejemplo: 24 horas antes de la cita, preparar recordatorio y solicitud de confirmación.',followup:'Ejemplo: al marcar una venta como pagada, preparar un mensaje de agradecimiento.',birthday:'Ejemplo: detectar cumpleaños y preparar un saludo con beneficio.',lowStock:'Ejemplo: cuando el stock sea igual o menor al mínimo, generar una alerta al responsable.',leadWelcome:'Ejemplo: al registrar un cliente nuevo, preparar mensaje de bienvenida.'}; toast(labels[d.id] || 'Vista previa no disponible.'); },
  'test-automations': () => { const active = Object.values(db.automations).filter(Boolean).length; toast(`${active} flujo(s) activo(s). Prueba simulada completada; no se enviaron mensajes.`); },
  'export-backup': () => exportBackup(),
  'export-csv': d => exportCSV(d.kind),
  'load-showcase': async () => {
    if (!await confirmBox({title:'Cargar escenario comercial',message:'Se reemplazarán los registros actuales por información ficticia preparada para presentar LUKARIS ONE. No se contactará a ningún cliente.',label:'Cargar demo',danger:true})) return;
    for (const a of db.attachments) await Store.delBlob(a.id);
    db = loadShowcaseData(); Store.force = true; save(); go('home'); toast('Escenario comercial de demostración cargado.');
  },
  'reset-data': async () => {
    if (!await confirmBox({ title: 'Restablecer datos', message: 'Se borrarán TODOS los datos y archivos adjuntos y volverán los datos de demostración.', label: 'Restablecer', danger: true, requireText: 'BORRAR' })) return;
    for (const a of db.attachments) await Store.delBlob(a.id);
    db = C.defaultDb(); Store.force = true; save(); render(); toast('Datos restablecidos.');
  }
};
// ================= Configuración, respaldo y CSV =================
const moduleCatalog = [['crm', 'Clientes y CRM'], ['agenda', 'Agenda y reservas'], ['sales', 'Ventas y pedidos'], ['cash', 'Caja y finanzas'], ['inventory', 'Inventario'], ['services', 'Productos y servicios'], ['operations', 'Operaciones y proyectos'], ['team', 'Equipo y permisos'], ['subscriptions', 'Suscripciones'], ['marketing', 'Marketing y fidelización'], ['reports', 'Reportes y analítica']];
const recommendedByType = { retail: ['crm', 'sales', 'cash', 'inventory', 'reports'], services: ['crm', 'agenda', 'services', 'cash', 'reports'], food: ['crm', 'agenda', 'sales', 'cash', 'inventory', 'reports'], health: ['crm', 'agenda', 'services', 'cash', 'reports'], education: ['crm', 'agenda', 'services', 'cash', 'reports'], construction: ['crm', 'sales', 'cash', 'inventory', 'operations', 'team', 'reports'], automotive: ['crm', 'agenda', 'services', 'cash', 'inventory', 'operations', 'reports'], logistics: ['crm', 'sales', 'inventory', 'operations', 'team', 'reports'], hospitality: ['crm', 'agenda', 'sales', 'cash', 'operations', 'reports'], digital: ['crm', 'sales', 'subscriptions', 'marketing', 'reports'], other: ['crm', 'sales', 'cash', 'operations', 'reports'] };
const recommendedModules = () => recommendedByType[db.profile.type] || recommendedByType.other;
const activeModules = () => new Set(db.profile.modulesSet ? db.profile.modules : recommendedModules());
function toggleModule(id, on) { const s = activeModules(); on ? s.add(id) : s.delete(id); db.profile.modules = [...s]; db.profile.modulesSet = true; save(); render(); }
function daysSinceBackup() { const t = Date.parse(db.meta.lastBackup || ''); return isNaN(t) ? null : Math.floor((Date.now() - t) / 864e5); }
function lastBackupText() { const d = daysSinceBackup(); return d === null ? 'nunca' : d === 0 ? 'hoy' : 'hace ' + d + (d === 1 ? ' día' : ' días'); }
function backupBanner() { const d = daysSinceBackup(); if (d !== null && d < 7) return; $app().insertAdjacentHTML('afterbegin', `<div class="notice">Último respaldo descargado: <b>${lastBackupText()}</b>. ${Store.mode === 'server' ? 'Tus datos están en el servidor local, pero conviene guardar una copia aparte.' : 'Tus datos viven solo en este navegador.'} <a href="#" data-act="go" data-page="settings">Exportar respaldo</a></div>`); }
function saveBlobAs(name, blob) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); }
function downloadCSV(name, headers, rows) { saveBlobAs('lukaris-' + name + '-' + today() + '.csv', new Blob(['\ufeff' + [headers, ...rows].map(r => r.map(C.csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })); }
function exportCSV(kind) {
  const m = {
    clients: () => downloadCSV('clientes', ['Nombre', 'Teléfono', 'Correo'], db.clients.map(c => [c.name, c.phone, c.email || ''])),
    sales: () => downloadCSV('ventas', ['Fecha', 'Cliente', 'Concepto', 'Total', 'Pagado', 'Saldo', 'Estado'], db.sales.map(s => [s.date, clientName(s.clientId), s.description, +s.total || 0, +s.paid || 0, saleBalance(s), saleStatus(s)])),
    payments: () => downloadCSV('pagos', ['Fecha', 'Cliente', 'Concepto', 'Monto', 'Método'], db.payments.map(p => [p.date, clientName(p.clientId), p.description || '', +p.amount || 0, p.method || ''])),
    appointments: () => downloadCSV('citas', ['Fecha', 'Hora', 'Cliente', 'Servicio', 'Estado', 'Valor', 'Adjuntos'], db.appointments.map(a => [a.date, a.time, clientName(a.clientId), serviceName(a.serviceId), a.status, +a.price || 0, C.attachmentsOf(db, 'appointment', a.id).length])),
    products: () => downloadCSV('productos', ['Producto', 'SKU', 'Stock', 'Costo', 'Precio'], db.products.map(p => [p.name, p.sku || '', p.stock, +p.cost || 0, +p.price || 0]))
  }[kind]; if (m) { m(); toast('Archivo CSV generado.'); }
}
const blobToB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
const b64ToBlob = (b64, type) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: type || 'application/octet-stream' }); };
async function exportBackup() {
  const files = {}; let n = 0, missing = 0;
  for (const a of db.attachments) { try { files[a.id] = await blobToB64(await Store.getBlob(a.id)); n++; } catch (e) { missing++; } }
  db.meta.lastBackup = new Date().toISOString(); save();
  saveBlobAs('lukaris-respaldo-' + today() + '.json', new Blob([JSON.stringify({ app: 'LUKARIS', schemaVersion: C.SCHEMA_VERSION, appVersion: C.APP_VERSION, exportedAt: new Date().toISOString(), data: db, files }, null, 2)], { type: 'application/json' }));
  if (page === 'settings') render(); toast(`Respaldo exportado con ${n} archivo${n === 1 ? '' : 's'}.` + (missing ? ` ${missing} adjunto(s) no se pudieron leer.` : ''), missing ? 'err' : '');
}
async function importBackup(input) {
  const file = input.files && input.files[0]; if (!file) return;
  try {
    const parsed = JSON.parse(await file.text()), cand = parsed.data;
    if (+parsed.schemaVersion > C.SCHEMA_VERSION) throw new Error('El respaldo fue creado por una versión más nueva de LUKARIS.');
    if (parsed.app !== 'LUKARIS' || !C.isObj(cand) || !C.isObj(cand.profile) || !['clients', 'services', 'appointments', 'payments', 'products', 'orders'].every(k => Array.isArray(cand[k]))) throw new Error('El archivo no tiene la estructura de respaldo LUKARIS.');
    if (!await confirmBox({ title: 'Importar respaldo', message: 'Esto reemplazará todos los datos actuales por los del respaldo. ¿Continuar?', label: 'Reemplazar datos', danger: true })) return;
    const next = C.migrate(cand), files = C.isObj(parsed.files) ? parsed.files : {}, keep = new Set(); let lost = 0;
    next.attachments = next.attachments.filter(a => { if (files[a.id]) return true; lost++; return false; });
    for (const a of next.attachments) { await Store.putBlob(a.id, new File([b64ToBlob(files[a.id], a.mime)], a.name, { type: a.mime })); keep.add(a.id); }
    for (const a of db.attachments) if (!keep.has(a.id)) await Store.delBlob(a.id);
    db = next; Store.force = true; save(); render(); toast('Respaldo restaurado.' + (lost ? ` ${lost} adjunto(s) no venían en el archivo.` : ''));
  } catch (err) { toast('No se pudo importar el respaldo: ' + err.message, 'err'); } finally { input.value = ''; }
}
function settingsPage() {
  const rec = recommendedModules(), active = activeModules(), units = db.organizationUnits, P = db.profile;
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('');
  const filesTotal = db.attachments.reduce((s, a) => s + (+a.size || 0), 0);
  $app().innerHTML = head('Administración global', 'Configuración de LUKARIS', 'Adapta la plataforma a la actividad, estructura y mercado de cada organización.') +
    `<section class="card"><h3>1. Configuración adaptativa del negocio</h3><p class="desc">LUKARIS recomienda módulos según la actividad seleccionada. Puedes activar o desactivar cada módulo.</p>
<form data-form="profile" novalidate><div class="formgrid">${fld('Nombre del negocio', 'name', { value: P.name, req: true })}${sel('Actividad principal', 'type', [['retail', 'Comercio y retail'], ['services', 'Servicios profesionales'], ['food', 'Alimentos y restaurantes'], ['health', 'Salud y bienestar'], ['education', 'Educación'], ['construction', 'Construcción e instalaciones'], ['automotive', 'Automoción y mantenimiento'], ['logistics', 'Logística y transporte'], ['hospitality', 'Turismo y alojamiento'], ['digital', 'Negocios digitales y suscripciones'], ['other', 'Otra actividad']], P.type)}${fld('País', 'country', { value: P.country || '', attrs: 'placeholder="País de operación"' })}${sel('Moneda principal', 'currency', [['COP', 'COP · Peso colombiano'], ['USD', 'USD · Dólar estadounidense'], ['EUR', 'EUR · Euro'], ['GBP', 'GBP · Libra esterlina'], ['MXN', 'MXN · Peso mexicano'], ['PEN', 'PEN · Sol peruano'], ['CLP', 'CLP · Peso chileno'], ['ARS', 'ARS · Peso argentino'], ['BRL', 'BRL · Real brasileño']], P.currency)}${sel('Idioma preferido', 'language', [['es', 'Español'], ['en', 'English'], ['pt', 'Português'], ['fr', 'Français']], P.language)}${fld('Zona horaria', 'timezone', { value: P.timezone || 'UTC', attrs: 'placeholder="Ej. America/Bogota"' })}${sel('Estructura de administración', 'accountMode', [['single', 'Una empresa'], ['group', 'Grupo de empresas'], ['both', 'Ambas modalidades']], P.accountMode || 'both')}</div><div class="actions"><button type="submit" class="btn primary">Guardar perfil</button></div></form>
<div style="margin-top:16px"><b style="font-size:13px">Módulos para esta actividad</b><div class="module-grid" style="margin-top:9px">${moduleCatalog.map(([id, l]) => `<label class="module-option"><input type="checkbox" data-module="${id}" ${active.has(id) ? 'checked' : ''}><span>${l}${rec.includes(id) ? ' <span class="pill ok">Recomendado</span>' : ''}</span></label>`).join('')}</div></div></section>
<section class="card"><h3>2. Empresas y sucursales</h3><p class="desc">La cuenta puede operar una sola empresa o administrar un grupo con varias empresas y sucursales.</p>
${units.map(u => `<div class="unit-row"><div><b>${esc(u.name)}</b><div class="desc" style="margin:2px 0 0">${u.kind === 'branch' ? 'Sucursal de ' + esc(units.find(x => x.id === u.parentId)?.name || 'empresa') : 'Empresa independiente'}</div></div><div class="rowactions">${pill(u.kind === 'branch' ? 'Sucursal' : 'Empresa')}${btn('Editar', 'edit', { type: 'unit', id: u.id }, 'small')}${btn('Eliminar', 'delete', { type: 'unit', id: u.id }, 'small danger')}</div></div>`).join('')}
<div class="inline-actions">${btn('+ Agregar empresa o sucursal', 'new', { type: 'unit' })}</div><div class="notice">Las unidades son una estructura de referencia. El aislamiento de datos y los permisos por empresa requieren autenticación (aún no incluida).</div></section>
<section class="card"><h3>3. Almacenamiento y respaldo</h3><dl class="kv"><dt>Modo</dt><dd>${Store.mode === 'server' ? 'Servidor local (archivo <b>data/lukaris.json</b>) + copia en el navegador' : 'Solo navegador (abre con <b>npm start</b> para usar el servidor)'}</dd><dt>Revisión</dt><dd>${Store.mode === 'server' ? Store.rev : '—'}</dd><dt>Adjuntos</dt><dd>${db.attachments.length} archivo(s) · ${formatBytes(filesTotal)}</dd><dt>Último respaldo</dt><dd>${lastBackupText()}</dd></dl>
<div class="inline-actions">${btn('↓ Exportar respaldo JSON (con adjuntos)', 'export-backup', {}, 'primary')}<label class="btn">↑ Importar respaldo JSON<input type="file" accept="application/json,.json" hidden data-import></label></div>
<div class="inline-actions">${['clients:Clientes', 'appointments:Citas', 'sales:Ventas', 'payments:Pagos', 'products:Productos'].map(x => btn('↓ ' + x.split(':')[1] + ' CSV', 'export-csv', { kind: x.split(':')[0] })).join('')}</div>
<div class="notice">Importar reemplaza los datos actuales tras pedir confirmación. En modo servidor se guardan además 14 copias diarias en <b>data/backups/</b>.</div></section>
<section class="card danger-zone"><h3>Zona de riesgo</h3><p class="desc">Vuelve a los datos de demostración y elimina todos los adjuntos.</p>${btn('Cargar escenario comercial completo', 'load-showcase', {}, 'primary')} ${btn('Restablecer datos básicos', 'reset-data', {}, 'danger')}</section>`;
}

// ================= Eventos y arranque =================
document.addEventListener('click', e => {
  if (e.target.id === 'back') return closeModal();
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACTIONS[el.dataset.act]; if (!fn) return;
  if (el.tagName === 'A') e.preventDefault();
  Promise.resolve(fn(el.dataset, el)).catch(err => { console.error(err); toast('Ocurrió un error: ' + err.message, 'err'); });
});
document.addEventListener('submit', e => { const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault(); handleForm(f).catch(err => { console.error(err); toast('Ocurrió un error: ' + err.message, 'err'); f.querySelector('[type=submit]')?.removeAttribute('disabled'); }); });
document.addEventListener('input', e => { const f = e.target.closest('[data-filter]'); if (f) applyFilters(f.closest('section') || document); });
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.matches('[data-filter]')) return applyFilters(t.closest('section') || document);
  if (t.matches('[data-module]')) return toggleModule(t.dataset.module, t.checked);
  if (t.matches('[data-import]')) return importBackup(t);
  if (t.matches('input[data-attach]')) {
    const [ot, oid] = t.dataset.attach.split(':'), files = [...t.files]; t.value = ''; if (!files.length) return;
    const r = await attachFiles(ot, +oid, files); render(); ot === 'client' ? clientDetail(+oid) : apptDetail(+oid);
    if (r.ok) toast(`${r.ok} archivo${r.ok > 1 ? 's' : ''} adjuntado${r.ok > 1 ? 's' : ''}.`); if (r.errs.length) toast(r.errs.join(' '), 'err'); return;
  }
  const form = t.closest('form[data-form]');
  if (form?.dataset.form === 'appointment' && t.name === 'serviceId') { const s = byId('services', +t.value); if (s) form.elements.price.value = s.price; }
  if (form?.dataset.form === 'receivable' && t.name === 'saleId') form.elements.amount.value = t.selectedOptions[0]?.dataset.balance || '';
  if (form?.dataset.form === 'appointment' && ['date', 'time', 'serviceId'].includes(t.name) && form.dataset.force) { delete form.dataset.force; form.querySelector('#conflict').innerHTML = ''; form.querySelector('[type=submit]').textContent = 'Guardar cita'; }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modalOpen()) { const no = $('[data-act=confirm-no]'); no ? no.click() : closeModal(); }
  if (e.key === 'Enter' && e.target.matches?.('tr.rowlink')) e.target.click();
});
document.querySelectorAll('#nav button').forEach(b => b.addEventListener('click', () => { closeModal(); go(b.dataset.page); }));
(async function boot() {
  await Store.init();
  $('#sidefoot').textContent = 'Versión ' + C.APP_VERSION + (Store.mode === 'server' ? ' · Servidor local' : ' · Modo local');
  render();
  try { navigator.storage?.persist?.(); } catch (e) {}
  window.addEventListener('pagehide', () => Store.flush());
  window.addEventListener('online', () => Store.pending && Store.schedule(0));
})();
