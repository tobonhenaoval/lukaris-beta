'use strict';
/* LK ONE 1.13.7 · interfaz. La lógica de negocio vive en core.js; el guardado, en Store. */
const C = LukarisCore, Cat = C.Cat;
const { esc, saleBalance, saleStatus, today, formatBytes } = C;
let db, page = 'home', apptView = 'list', calStart = null;
const money = n => C.money(n, db.profile);
const dashboardConfig = () => { const u=currentUser(); return u?.preferences?.dashboard || db.profile.dashboard || {widgets:['income','appointments','clients','sales','outstanding','inventory','orders','activity','trend','upcoming','alerts']}; };
const $ = s => document.querySelector(s);
const byId = (list, id) => db[list].find(x => x.id === id);
const clientName = id => byId('clients', id)?.name || 'Cliente eliminado';
const serviceName = id => byId('services', id)?.name || 'Servicio eliminado';
const T = { pos: 'LK POS', home: 'Resumen', appointments: 'Agenda', clients: 'Clientes', commercial: 'Comercial', cash: 'Finanzas', services: 'Servicios', inventory: 'Inventario', work: 'Operaciones', automations: 'Automatizaciones', reports: 'Reportes', settings: 'Configuración' };

// ================= Sesión, permisos y navegación =================
const SESSION_KEY = 'lkone-session'; let loginFails = 0, lockUntil = 0;
const authOn = () => !!(db && db.auth && db.auth.enabled);
function currentUser() {
  if (!authOn()) return C.ADMIN_ACTOR;
  let id = null; try { id = +sessionStorage.getItem(SESSION_KEY); } catch (e) {}
  const u = db.users.find(x => x.id === id && x.active !== false); return u ? { id: u.id, name: [u.name,u.lastName].filter(Boolean).join(' '), role: u.role } : null;
}
const globalNotifications = () => { const u = currentUser(); return db.pos.notifications.filter(n => !n.read && (n.recipientUserId ? (!authOn() || n.recipientUserId === u?.id || u?.role === 'admin' || u?.role === 'manager') : (!n.waiterId || !authOn() || n.waiterId === u?.id || u?.role === 'admin' || u?.role === 'manager'))); };
const can = perm => { const u = currentUser(); return !!u && C.can(u, perm); };
const actor = () => currentUser() || { id: -1, name: 'Sin sesión', role: 'none' };
const NAV = [['home', '⌂', 'Resumen'], ['pos', '◈', 'LK POS'], ['appointments', '▦', 'Agenda'], ['clients', '♙', 'Clientes'], ['commercial', '▣', 'Comercial'], ['cash', '$', 'Finanzas'], ['services', '✦', 'Servicios'], ['inventory', '▤', 'Inventario'], ['work', '▧', 'Operaciones'], ['automations', '✧', 'Automatizaciones'], ['reports', '▥', 'Reportes'], ['settings', '⚙', 'Configuración']];
function pageVisible(p) {
  if (p === 'settings') return can('page.settings');
  if (db && db.profile && db.profile.productMode === 'pos') return p === 'pos' ? can('page.pos') : false;
  if (p === 'home') return can('page.home');
  const m = Cat.PAGE_MODULE[p]; return (!m || activeModules().has(m)) && can('page.' + p);
}
const firstPage = () => (NAV.find(([p]) => pageVisible(p)) || ['home'])[0];
function buildNav() { $('#nav').innerHTML = NAV.filter(([p]) => pageVisible(p)).map(([p, i, l]) => `<button type="button" data-page="${p}" class="${p === page ? 'active' : ''}">${i} ${l}</button>`).join(''); }
function showLogin() {
  if (!$('#login').hidden) return;
  const employees = db.users.filter(u => u.active !== false && u.role !== 'admin' && u.pinHash);
  $('#login').hidden = false;
  $('#lbody').innerHTML = `<div class="login-tabs"><button type="button" class="chip on" data-login-mode="admin">Administrador</button><button type="button" class="chip" data-login-mode="staff">Empleado · PIN</button></div><form data-form="login" data-mode="admin" novalidate><div class="formgrid">${fld('Correo electrónico', 'email', { type: 'email', req: true, full: true, attrs: 'autocomplete="username"' })}${fld('Contraseña', 'password', { type: 'password', req: true, full: true, attrs: 'autocomplete="current-password"' })}</div><div class="actions"><button type="submit" class="btn primary">Ingresar como administrador</button></div></form><form data-form="login" data-mode="staff" hidden novalidate>${sel('Empleado', 'userId', employees.map(u => [u.id, `${[u.name,u.lastName].filter(Boolean).join(' ')} · ${Cat.ROLES[u.role]}`]), employees[0]?.id, true)}${fld('PIN personal', 'pin', { type: 'password', req: true, full: true, attrs: 'autocomplete="off" inputmode="numeric"' })}<div class="actions"><button type="submit" class="btn primary">Ingresar como empleado</button></div></form><p class="desc" style="margin:12px 0 0">Acceso local de demostración. No sustituye autenticación segura en servidor.</p>`;
  $('#lbody [name=email]')?.focus();
}
const hideLogin = () => { $('#login').hidden = true; $('#lbody').innerHTML = ''; };
function doLogin(form, raw) {
  const now = Date.now(); if (now < lockUntil) return toast(`Demasiados intentos. Espera ${Math.ceil((lockUntil - now) / 1000)} s.`, 'err');
  const mode = form.dataset.mode || 'staff';
  const u = mode === 'admin' ? db.users.find(x => x.active !== false && x.role === 'admin' && (x.email || '').toLowerCase() === String(raw.email || '').trim().toLowerCase() && x.passwordHash && Cat.hashPin(String(raw.password || ''), x.passwordSalt) === x.passwordHash) : db.users.find(x => x.id === +raw.userId && x.active !== false && x.role !== 'admin' && x.pinHash && Cat.hashPin(String(raw.pin || ''), x.salt) === x.pinHash);
  if (!u) { loginFails++; if (loginFails >= 5) { lockUntil = now + 30000; loginFails = 0; } return showErrors(form, mode === 'admin' ? { password: 'Correo o contraseña incorrectos.' } : { pin: 'PIN incorrecto.' }); }
  loginFails = 0; try { sessionStorage.setItem(SESSION_KEY, String(u.id)); } catch (e) {}
  hideLogin(); resetPos(); page = firstPage(); render(); toast('Bienvenido, ' + u.name + '.');
}
const resetPos = () => { try { PosUI.S.orderId = null; PosUI.S.tab = ''; PosUI.S.cat = 0; } catch (e) {} };
function logout() { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {} closeModal(); resetPos(); render(); }
const FORM_PERM = { client: 'edit.records', service: 'edit.records', appointment: 'edit.records', quote: 'edit.records', sale: 'edit.records', order: 'edit.records', receivable: 'edit.records', reschedule: 'edit.records', product: 'inventory.edit', movement: 'inventory.edit', unit: 'settings.profile', user: 'users.manage', profile: 'settings.profile' };
const ACTION_PERM = { delete: 'delete.records', 'void-sale': 'finance.edit', 'convert-quote': 'edit.records', 'appt-status': 'edit.records', 'export-backup': 'backup', 'load-showcase': 'backup', 'reset-data': 'backup', 'toggle-automation': 'settings.profile', 'auth-enable': 'users.manage', 'auth-disable': 'users.manage', 'apply-recommended': 'settings.profile', 'wa-plan': 'edit.records', 'wa-release': 'edit.records', 'wa-manual': 'edit.records', 'reschedule': 'edit.records', 'staff-schedule': 'users.manage', 'staff-vacation': 'users.manage', 'business-closure': 'users.manage', 'remove-timeoff': 'users.manage' };
const deny = perm => toast('No tienes permiso para esta acción' + (Cat.PERM_LABELS[perm] ? ' (' + Cat.PERM_LABELS[perm] + ')' : '') + '.', 'err');

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
    if (this.mode === 'server') { this.dirty = true; this.setPending(true); this.schedule(); }
    else this.setState(ok ? '' : 'error', ok ? 'Guardado en este navegador' : 'No se pudo guardar: almacenamiento lleno o bloqueado');
    if (!ok) toast('No se pudo guardar en el navegador (almacenamiento lleno o bloqueado).', 'err');
  },
  schedule(ms = 200) { this.setState('saving', 'Guardando…'); clearTimeout(this.timer); this.timer = setTimeout(() => this.sync(), ms); },
  async sync() {
    if (this.inflight) { this.again = true; return; }
    this.inflight = true; this.again = false; this.dirty = false; const force = this.force;
    try {
      const r = await this.api('/api/db', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRev: this.rev, force, data: db }) });
      if (r.status === 409) {
        const cur = await r.json(); try { localStorage.setItem('lukaris-conflict-' + Date.now(), JSON.stringify(db)); } catch (e) {}
        db = C.migrate(cur.data); this.rev = cur.rev; this.writeLocal(); this.setPending(false); this.setState('saved', 'Actualizado desde el servidor'); closeModal(); render();
        toast('Los datos cambiaron en otra pestaña; se cargó la versión más reciente.', 'err'); return;
      }
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Error ' + r.status);
      const j = await r.json(); this.rev = j.rev; this.force = false; this.lastSaved = j.savedAt;
      if (!this.again && !this.dirty) { this.setPending(false); this.setState('saved', 'Guardado en el servidor · ' + new Date(j.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })); }
    } catch (e) {
      this.setState('offline', 'Sin conexión: guardado en este navegador'); clearTimeout(this.retry); this.retry = setTimeout(() => this.sync(), 5000);
    } finally { this.inflight = false; if (this.again) { this.again = false; this.schedule(50); } }
  },
  async pull(force) {
    if (this.mode !== 'server' || this.pending || this.inflight || (!force && modalOpen())) return;
    try { const r = await this.api('/api/db', { timeout: 3000 }); if (!r.ok) return; const j = await r.json(); if (j.data && j.rev !== this.rev && !this.pending && !this.inflight) { db = C.migrate(j.data); this.rev = j.rev; this.writeLocal(); render(); } else if (force) render(); } catch (e) {}
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
const fmtDate = s => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return s || ''; const [y, m, d] = s.split('-'), f = db.profile.dateFormat; return f === 'DMY' ? `${d}/${m}/${y}` : f === 'MDY' ? `${m}/${d}/${y}` : s; };
const fmtTime = t => { if (!/^\d{2}:\d{2}$/.test(String(t || '')) || db.profile.timeFormat !== '12h') return t || ''; const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`; };
const fmtStamp = iso => { const d = new Date(iso); return isNaN(d) ? '' : fmtDate(C.isoDate(d)) + ' ' + fmtTime(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')); };
const pill = (t, c = '') => `<span class="pill ${c}">${esc(t)}</span>`;
const apptPill = s => pill(s, s === 'Confirmada' || s === 'Atendida' ? 'ok' : s === 'Cancelada' ? 'bad' : 'wait');
const workerName = id => { const u = db.users.find(u => u.id === id); return u ? [u.name, u.lastName].filter(Boolean).join(' ') : ''; };
const workers = () => db.users.filter(u => u.active !== false && ['employee', 'manager'].includes(u.role));
const attCount = (type, id) => { const n = C.attachmentsOf(db, type, id).length; return n ? `📎 ${n}` : '—'; };

function go(p) { if (!pageVisible(p)) p = firstPage(); page = p; $('#crumb').textContent = T[p]; render(); window.scrollTo(0, 0); }
function render() {
  applyAppearance(); $('#topbiz').textContent = db.profile.name; document.title = 'LK ONE · ' + db.profile.name;
  $('#logo').innerHTML = (db.profile.logo && /^data:image\//.test(db.profile.logo) ? `<img src="${esc(db.profile.logo)}" alt="Logotipo">` : '') + 'LK ONE';
  if (authOn() && !currentUser()) { buildNav(); $('#userbox').innerHTML = ''; $app().innerHTML = ''; showLogin(); return; }
  if (!pageVisible(page)) page = firstPage();
  const u = currentUser(), unread = globalNotifications().length, bell = `<button type="button" class="btn small" data-act="team-notifications">🔔 ${unread ? `Avisos (${unread})` : 'Avisos'}</button>`; $('#userbox').innerHTML = authOn() ? `<b>${esc(u.name)}</b> · ${esc(Cat.ROLES[u.role])} ${bell} <button type="button" class="btn small" data-act="theme-toggle">${(db.profile.appearance || {}).mode === 'dark' ? '☀ Claro' : '☾ Oscuro'}</button> <button type="button" class="btn small" data-act="logout">Salir</button>` : `${bell} <button type="button" class="btn small" data-act="theme-toggle">${(db.profile.appearance || {}).mode === 'dark' ? '☀ Claro' : '☾ Oscuro'}</button>`;
  document.body.classList.toggle('pos-mode', page === 'pos'); $('#crumb').textContent = T[page]; buildNav();
  PAGES[page](); if (page === 'home') backupBanner(); document.querySelectorAll('tr.rowlink').forEach(r => r.tabIndex = 0);
}

// ================= Páginas =================
const $app = () => $('#app');
function posHomeCard() {
  if (!pageVisible('pos')) return ''; const P = LKPOS, d = today(), rep_ = P.report(db, { from: d, to: d }), sh = P.openShift_(db), occ = db.pos.tables.filter(t => P.tableStatus(db, t).status === 'Ocupada').length;
  return `<section class="card pos-hero"><div class="eyebrow">LK POS · HOY</div><div class="stats" style="margin:10px 0 0"><div class="stat" style="background:#fff2"><small style="color:#cfeeee">Ventas de hoy</small><strong>${money(rep_.sales)}</strong></div><div class="stat" style="background:#fff2"><small style="color:#cfeeee">Cuentas pagadas</small><strong>${rep_.orders}</strong></div><div class="stat" style="background:#fff2"><small style="color:#cfeeee">Mesas ocupadas</small><strong>${occ}/${db.pos.tables.length}</strong></div><div class="stat" style="background:#fff2"><small style="color:#cfeeee">Caja</small><strong>${sh ? 'Abierta' : 'Cerrada'}</strong></div></div><div class="inline-actions"><button class="btn" data-act="go" data-page="pos">Ir a LK POS</button></div></section>`;
}
const PAGES = {
  home() {
    const s = C.summary(db), cfg = dashboardConfig(), widgets = cfg.widgets || [];
    const now = today(), since = C.addDays(-6), sales = C.activeSales(db), paid7 = db.payments.filter(p => p.date >= since && p.date <= now).reduce((n,p) => n + (+p.amount || 0), 0);
    const activeOrders = db.orders.filter(o => !['Entregado','Cancelado'].includes(o.status));
    const lowStock = db.products.filter(p => +p.stock <= +p.minStock && +p.minStock > 0);
    const metrics = {
      income: ['Ingresos de hoy', money(s.income), 'Pagos recibidos hoy', '↗', 'cash'],
      appointments: ['Citas de hoy', String(s.todayApps), 'Reservas programadas', '▦', 'appointments'],
      clients: ['Clientes', String(db.clients.length), 'Personas registradas', '♙', 'clients'],
      sales: ['Ventas activas', String(sales.length), 'Operaciones comerciales', '▣', 'commercial'],
      outstanding: ['Por cobrar', money(s.outstanding), 'Saldos pendientes', '$', 'commercial'],
      inventory: ['Productos', String(db.products.length), lowStock.length ? `${lowStock.length} con stock bajo` : 'Inventario registrado', '▤', 'inventory'],
      orders: ['Encargos activos', String(activeOrders.length), 'Pendientes de entrega', '▧', 'work']
    };
    const metricCards = Object.entries(metrics).filter(([k]) => widgets.includes(k) && pageVisible(metrics[k][4])).map(([k,m]) => `<button class="metric-card" type="button" data-act="go" data-page="${m[4]}"><span class="metric-icon">${m[3]}</span><span class="metric-label">${m[0]}</span><strong>${m[1]}</strong><small>${m[2]}</small></button>`).join('');
    const days = Array.from({length:7},(_,i)=>C.addDays(i-6));
    const trendMax = Math.max(1,...days.map(d=>db.payments.filter(p=>p.date===d).reduce((n,p)=>n+(+p.amount||0),0)));
    const trend = days.map(d=>{const v=db.payments.filter(p=>p.date===d).reduce((n,p)=>n+(+p.amount||0),0);return `<div class="trend-col" title="${fmtDate(d)} · ${money(v)}"><div class="trend-bar" style="height:${Math.max(4,Math.round(v/trendMax*100))}%"></div><small>${d.slice(8)}</small></div>`;}).join('');
    const activity = [];
    db.payments.forEach(x=>activity.push({date:x.date||now,time:x.createdAt||'',title:'Pago registrado',detail:`${x.description||'Pago'} · ${money(x.amount)}`,page:'cash'}));
    db.appointments.forEach(x=>activity.push({date:x.date||now,time:x.createdAt||'',title:'Cita · '+(x.status||'Pendiente'),detail:`${clientName(x.clientId)} · ${serviceName(x.serviceId)} · ${x.time||''}`,page:'appointments'}));
    db.sales.forEach(x=>activity.push({date:x.date||now,time:x.createdAt||'',title:'Venta registrada',detail:`${clientName(x.clientId)} · ${money(x.total)}`,page:'commercial'}));
    db.orders.forEach(x=>activity.push({date:x.date||now,time:x.updatedAt||x.createdAt||'',title:'Encargo · '+(x.status||'Recibido'),detail:`${x.vehicle||'Pedido'} · ${clientName(x.clientId)}`,page:'work'}));
    db.inventoryMovements.forEach(x=>activity.push({date:x.date||now,time:x.createdAt||'',title:'Movimiento de inventario',detail:`${byId('products',x.productId)?.name||'Producto'} · ${x.type||''} ${x.quantity||''}`,page:'inventory'}));
    activity.sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
    const activityHtml = activity.slice(0,10).map(x=>`<button type="button" class="activity-item" data-act="go" data-page="${x.page}"><span class="activity-dot"></span><span><b>${esc(x.title)}</b><small>${esc(x.detail)}</small></span><time>${fmtDate(x.date)}</time></button>`).join('') || '<p class="empty-state">Todavía no hay movimientos. Cuando registres citas, ventas o pagos, aparecerán aquí.</p>';
    const next = s.upcoming.slice(0,5);
    $app().innerHTML = head('Tu negocio, de un vistazo', 'Resumen', 'Lo importante para hoy, organizado en un solo lugar.', `<button class="btn" data-act="dashboard-customize">Personalizar panel</button> ${can('edit.records') ? btn('+ Crear', 'new-menu', {}, 'primary') : ''}`) +
      `<section class="welcome-strip"><div><span class="eyebrow">${esc(db.profile.name)} · PANEL DE CONTROL</span><h2>Hola${currentUser()?.name ? ', '+esc(currentUser().name.split(' ')[0]) : ''}. ¿Qué está pasando hoy?</h2><p>Consulta el estado del negocio y entra directamente a lo que necesitas.</p></div><div class="welcome-actions">${can('edit.records')?btn('+ Nueva cita','new',{type:'appointment'},'primary'):''}${can('edit.records')?btn('+ Registrar venta','new',{type:'sale'}):''}</div></section>
      <div class="dashboard-grid">${metricCards || '<section class="card empty-state">No hay indicadores visibles. Personaliza tu panel para elegir qué quieres consultar.</section>'}</div>
      <div class="dashboard-lower">${widgets.includes('trend') ? `<section class="card dashboard-card"><div class="section-title"><div><h3>Actividad de ingresos</h3><p class="desc">Pagos recibidos durante los últimos 7 días</p></div><b class="trend-total">${money(paid7)}</b></div><div class="trend-chart">${trend}</div></section>` : ''}
      ${widgets.includes('activity') ? `<section class="card dashboard-card"><div class="section-title"><div><h3>Registro de actividad</h3><p class="desc">Últimos movimientos de tu negocio</p></div><span class="soft-tag">${activity.length} registros</span></div><div class="activity-list">${activityHtml}</div></section>` : ''}</div>
      <div class="dashboard-lower secondary-lower">${widgets.includes('upcoming') ? `<section class="card dashboard-card"><div class="section-title"><div><h3>Próximas citas</h3><p class="desc">Reservas próximas</p></div>${btn('Ver agenda','go',{page:'appointments'},'small')}</div>${table(['Fecha','Hora','Cliente','Servicio','Estado'],next.map(a=>tr([fmtDate(a.date),fmtTime(a.time),esc(clientName(a.clientId)),esc(serviceName(a.serviceId)),apptPill(a.status)],{act:'appt-detail',id:a.id})).join(''))}</section>`:''}
      ${widgets.includes('alerts') ? `<section class="card dashboard-card"><div class="section-title"><div><h3>Atención necesaria</h3><p class="desc">Elementos que conviene revisar</p></div></div><div class="alert-stack">${lowStock.length?`<button class="alert-line" data-act="go" data-page="inventory">⚠ ${lowStock.length} productos con stock bajo</button>`:''}${s.outstanding>0?`<button class="alert-line" data-act="go" data-page="commercial">$ ${money(s.outstanding)} pendientes por cobrar</button>`:''}${activeOrders.length?`<button class="alert-line" data-act="go" data-page="work">▧ ${activeOrders.length} encargos en proceso</button>`:''}${!lowStock.length&&!s.outstanding&&!activeOrders.length?'<p class="empty-state">Todo está al día por ahora.</p>':''}</div></section>`:''}</div>`;
  },
  appointments() {
    const tabs = `<div class="tabs"><button type="button" class="chip ${apptView === 'list' ? 'on' : ''}" data-act="appt-view" data-view="list">Lista</button><button type="button" class="chip ${apptView === 'week' ? 'on' : ''}" data-act="appt-view" data-view="week">Calendario semanal</button></div>`;
    const headHtml = head('Programación', 'Agenda', 'Citas, reservas y reuniones. Toca una cita para ver su ficha, reprogramarla o adjuntar archivos.', can('edit.records') ? btn('+ Nueva cita', 'new', { type: 'appointment' }, 'primary') : '');
    if (apptView === 'week') return void ($app().innerHTML = headHtml + tabs + calendarHtml());
    const rows = db.appointments.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map(a => tr([fmtDate(a.date), fmtTime(a.time), esc(clientName(a.clientId)), esc(serviceName(a.serviceId)) + (a.workerId ? `<br><small>${esc(workerName(a.workerId))}</small>` : ''), money(a.price), apptPill(a.status), attCount('appointment', a.id), can('edit.records') ? acts('appointment', a.id) : ''], { act: 'appt-detail', id: a.id, status: a.status, date: a.date, cls: a.date === today() ? 'today' : '' })).join('');
    $app().innerHTML = headHtml + tabs + `<section class="card" id="scope">${filterBar({ status: C.APPT_STATUS, range: true })}${table(['Fecha', 'Hora', 'Cliente', 'Servicio', 'Valor', 'Estado', 'Adjuntos', ''], rows)}</section>`;
  },
  clients() {
    const rows = db.clients.map(c => tr([`<b>${esc(c.name)}</b>`, esc(c.documentNumber ? `${c.documentType || 'ID'} · ${c.documentNumber}` : '—'), esc(c.phone || '—'), esc(c.email || '—'), attCount('client', c.id), acts('client', c.id, c.phone ? btn('WhatsApp', 'whatsapp-client', {id:c.id}, 'small') : '')], { act: 'client-detail', id: c.id, q: [c.name, c.documentType, c.documentNumber, c.phone, c.email].join(' ') })).join('');
    $app().innerHTML = head('Relaciones', 'Clientes', 'Base central de clientes. Toca un cliente para ver su ficha, citas y adjuntos.', btn('+ Nuevo cliente', 'new', { type: 'client' }, 'primary')) + `<section class="card" id="scope">${filterBar()}${table(['Nombre', 'Documento', 'Teléfono', 'Correo', 'Adjuntos', ''], rows)}</section>`;
  },
  commercial() {
    const act = C.activeSales(db);
    const qr = db.quotes.map(q => tr([fmtDate(q.date), esc(clientName(q.clientId)), esc(q.description), money(q.amount), `<span class="tagquote">${esc(q.status)}</span>`, q.status === 'Pendiente' ? `<div class="rowactions">${btn('Crear venta', 'convert-quote', { id: q.id }, 'small')}${btn('Editar', 'edit', { type: 'quote', id: q.id }, 'small')}${btn('Eliminar', 'delete', { type: 'quote', id: q.id }, 'small danger')}</div>` : '—'], { status: q.status })).join('');
    const sr = db.sales.map(s => tr([fmtDate(s.date), esc(clientName(s.clientId)), esc(s.description), money(s.total), money(s.paid), money(saleBalance(s)), `<span class="${s.voided ? 'pill bad' : saleBalance(s) > 0 ? 'tagdue' : 'tagpaid'}">${saleStatus(s)}</span>`, s.voided ? '—' : `<div class="rowactions">${saleBalance(s) > 0 ? btn('Abonar', 'pay-sale', { id: s.id }, 'small') : ''}${btn('Editar', 'edit', { type: 'sale', id: s.id }, 'small')}${btn('Anular', 'void-sale', { id: s.id }, 'small danger')}</div>`], { cls: s.voided ? 'void' : '', status: saleStatus(s) })).join('');
    $app().innerHTML = head('Actividad comercial', 'Cotizaciones y ventas', 'Crea propuestas, registra ventas y convierte cotizaciones en operaciones cobrables.', btn('+ Cotización', 'new', { type: 'quote' }) + btn('+ Nueva venta', 'new', { type: 'sale' }, 'primary')) +
      `<div class="stats"><div class="stat"><small>Cotizaciones abiertas</small><strong>${db.quotes.filter(q => q.status === 'Pendiente').length}</strong></div><div class="stat"><small>Ventas registradas</small><strong>${act.length}</strong></div><div class="stat"><small>Valor vendido</small><strong>${money(act.reduce((a, s) => a + (+s.total || 0), 0))}</strong></div><div class="stat"><small>Por cobrar</small><strong>${money(act.reduce((a, s) => a + saleBalance(s), 0))}</strong></div></div>
<section class="card" id="scope"><h3>Cotizaciones</h3><p class="desc">Propuestas pendientes o convertidas en venta.</p>${filterBar({ status: ['Pendiente', 'Convertida'] })}${table(['Fecha', 'Cliente', 'Concepto', 'Valor', 'Estado', 'Acción'], qr)}</section>
<section class="card" id="scope2"><h3>Ventas</h3><p class="desc">Cada venta conserva su total, pagos recibidos y saldo.</p>${filterBar({ status: ['Pagada', 'Abono parcial', 'Pendiente', 'Anulada'] })}${table(['Fecha', 'Cliente', 'Concepto', 'Total', 'Pagado', 'Saldo', 'Estado', 'Acción'], sr)}</section>`;
  },
  cash() {
    const sum = db.payments.reduce((s, p) => s + (+p.amount || 0), 0), open = C.activeSales(db).filter(s => saleBalance(s) > 0);
    const pr = db.payments.slice().sort((a, b) => b.date.localeCompare(a.date)).map(p => tr([fmtDate(p.date), esc(clientName(p.clientId)), esc(p.description), esc(p.method || '—'), money(p.amount), btn('Eliminar', 'delete', { type: 'payment', id: p.id }, 'small danger')])).join('');
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
    const mv = db.inventoryMovements.slice().reverse().slice(0, 15).map(m => tr([fmtDate(m.date), esc(byId('products', m.productId)?.name || 'Producto'), esc(m.type), m.quantity, esc(m.reason || '—')])).join('');
    $app().innerHTML = head('Productos', 'Inventario', 'Consulta existencias y registra entradas, salidas o ajustes con trazabilidad.', btn('+ Agregar producto', 'new', { type: 'product' }, 'primary') + btn('+ Movimiento', 'new', { type: 'movement' })) +
      `<section class="card" id="scope"><h3>Existencias</h3>${filterBar()}${table(['Producto', 'SKU', 'Stock', 'Costo', 'Precio venta', ''], rows)}</section><section class="card"><h3>Últimos movimientos</h3><p class="desc">Cada movimiento actualiza las existencias del producto.</p>${table(['Fecha', 'Producto', 'Tipo', 'Cantidad', 'Motivo'], mv)}</section>`;
  },
  work() {
    const staff = db.users.filter(u => u.active !== false && u.role !== 'admin' && (!authOn() || can('users.manage') || u.id === currentUser()?.id));
    const days = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const staffRows = staff.map(u => { const sc = u.schedule || {}; const working = (sc.days || []).map(d => days[d]).join(', '); const off = (u.vacations || []).filter(v => v.end >= today()).length; return tr([`<b>${esc([u.name,u.lastName].filter(Boolean).join(' '))}</b>`, esc(u.phone || '—'), esc(u.station || 'General'), esc(working || 'Sin días'), esc(`${sc.start || '—'}–${sc.end || '—'}`), esc([sc.breakStart && sc.breakEnd ? `${sc.breakStart}–${sc.breakEnd}` : '', sc.break2Start && sc.break2End ? `${sc.break2Start}–${sc.break2End}` : ''].filter(Boolean).join(' / ') || '—'), off ? pill(`${off} permiso(s)`, 'wait') : '—', (can('users.manage') ? btn('Horario', 'staff-schedule', {id:u.id}, 'small') + btn('Vacaciones / permiso', 'staff-vacation', {id:u.id}, 'small') : '—')]); }).join('');
    const closures = (db.workforce.businessDaysOff || []).filter(v => v.end >= today());
    $app().innerHTML = head('Operaciones', 'Operaciones y jornadas', 'Administra los trabajos, horarios, pausas, vacaciones y disponibilidad del equipo.', btn('+ Nueva orden', 'new', { type: 'order' }, 'primary')) +
      `<section class="card"><h3>Horarios y trabajo del personal</h3><p class="desc">Configura los días y horas de cada empleado. La agenda utiliza esta disponibilidad para evitar asignar citas durante descansos, vacaciones o días no laborales.</p>${staff.length ? table(['Empleado','Celular','Área / estación','Días laborales','Horario','Pausa','Ausencias futuras',''], staffRows) : '<div class="empty">Agrega empleados desde Configuración → Equipo y permisos.</div>'}<div class="inline-actions">${can('users.manage') ? btn('＋ Registrar cierre o vacaciones de la empresa', 'business-closure', {}, 'primary') : ''}</div>${closures.length ? `<h3 style="margin-top:18px">Cierres y vacaciones de la empresa</h3>${table(['Desde','Hasta','Motivo',''], closures.map(v => tr([fmtDate(v.start),fmtDate(v.end),esc(v.reason || 'Cierre'),btn('Quitar','remove-timeoff',{id:v.id,scope:'business'},'small danger')])).join(''))}` : '<p class="desc" style="margin-top:12px">No hay cierres futuros registrados.</p>'}<div class="notice">Los cambios de disponibilidad se aplican a nuevas asignaciones. Las citas existentes no se borran: si coinciden con una ausencia, se muestran como conflicto para que el administrador decida su reprogramación.</div></section>
      <section class="card" id="scope"><h3>Trabajos y operaciones</h3>${filterBar({ status: C.ORDER_STATUS })}${table(['Fecha', 'Cliente', 'Referencia', 'Trabajo', 'Estado', 'Valor', ''], db.orders.map(o => tr([fmtDate(o.date), esc(clientName(o.clientId)), esc(o.vehicle), esc(o.detail), pill(o.status, o.status === 'Entregado' ? 'ok' : 'wait'), money(o.amount), acts('order', o.id)], { status: o.status })).join(''))}</section>`;
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
    $app().innerHTML = head('Productividad', 'Centro de automatizaciones', 'Reglas de recordatorio y confirmación de citas. El planificador prepara los mensajes; el envío automático real requiere conectar un proveedor de WhatsApp (ver requisitos abajo).', btn('Probar flujos', 'test-automations', {}, 'primary')) +
      `<div class="stats"><div class="stat"><small>Flujos disponibles</small><strong>${items.length}</strong></div><div class="stat"><small>Activos</small><strong>${enabled}</strong></div><div class="stat"><small>Canal preparado</small><strong>WhatsApp</strong></div><div class="stat"><small>Estado de conexión</small><strong>${esc(db.integrations.whatsapp.status)}</strong></div></div>
      <div class="automation-grid">${items.map(([id,name,desc,tag]) => `<section class="card automation-card"><div class="automation-top"><span class="automation-icon">✧</span>${db.automations[id] ? pill('Activo','ok') : pill('Inactivo')}</div><h3>${name}</h3><p class="desc">${desc}</p><small class="eyebrow">${tag}</small><div class="actions"><button class="btn ${db.automations[id] ? '' : 'primary'}" data-act="toggle-automation" data-id="${id}">${db.automations[id] ? 'Desactivar' : 'Activar flujo'}</button><button class="btn" data-act="preview-automation" data-id="${id}">Ver ejemplo</button></div></section>`).join('')}</div>
      ${waSection()}
      <section class="card"><h3>Cómo funcionaría en una cuenta conectada</h3><div class="steps"><div><b>1. Evento</b><p>Una cita se crea, una venta se completa o un producto llega al mínimo.</p></div><div><b>2. Regla</b><p>LK ONE revisa condiciones, horarios, preferencias y permisos.</p></div><div><b>3. Acción</b><p>Se ejecuta el mensaje, tarea o alerta mediante el canal conectado.</p></div><div><b>4. Registro</b><p>Queda historial del resultado para seguimiento y control.</p></div></div><div class="notice">Esta versión no envía mensajes automáticos ni está conectada a WhatsApp Business API, correo o calendarios externos. El envío manual abre WhatsApp con el mensaje prellenado.</div></section>`;
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

// ---------- calendario semanal ----------
const mondayOf = iso => { const d = new Date(iso + 'T12:00:00'), k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return C.isoDate(d); };
function calendarHtml() {
  calStart = calStart || mondayOf(today()); const days = [], d = new Date(calStart + 'T12:00:00');
  for (let i = 0; i < 7; i++) { days.push(C.isoDate(d)); d.setDate(d.getDate() + 1); }
  const names = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  return `<div class="cal-head"><div class="inline-actions" style="margin:0">${btn('‹ Semana anterior', 'cal-nav', { dir: -1 }, 'small')}${btn('Hoy', 'cal-nav', { dir: 0 }, 'small')}${btn('Semana siguiente ›', 'cal-nav', { dir: 1 }, 'small')}</div><b>${fmtDate(days[0])} — ${fmtDate(days[6])}</b></div><div class="cal-grid">${days.map((day, i) => {
    const ev = db.appointments.filter(a => a.date === day).sort((a, b) => a.time.localeCompare(b.time));
    return `<div class="cal-day ${day === today() ? 'today' : ''}"><h4><span>${names[i]} ${day.slice(8)}</span>${can('edit.records') ? `<button type="button" class="btn small" data-act="new" data-type="appointment" data-date="${day}" aria-label="Nueva cita el ${day}">+</button>` : ''}</h4>${ev.map(a => `<button type="button" class="cal-ev" data-st="${esc(a.status)}" data-act="appt-detail" data-id="${a.id}"><b>${fmtTime(a.time)}</b> ${esc(clientName(a.clientId))}<br><small>${esc(serviceName(a.serviceId))}${a.workerId ? ' · ' + esc(workerName(a.workerId)) : ''}</small></button>`).join('') || '<small class="desc">Sin citas</small>'}</div>`;
  }).join('')}</div>`;
}

// ---------- fichas ----------
function attachBlock(ownerType, ownerId, readonlyList = false) {
  const list = C.attachmentsOf(db, ownerType, ownerId);
  const icon = n => /^(jpe?g|png|gif|webp)$/.test(C.fileExt(n)) ? '🖼' : C.fileExt(n) === 'pdf' ? '📕' : '📄';
  const items = list.map(a => `<div class="file"><span class="fi">${icon(a.name)}</span><div class="fn"><b title="${esc(a.name)}">${esc(a.name)}</b><small>${formatBytes(a.size)} · ${esc((a.createdAt || '').slice(0, 10))}</small></div><div class="fa">${btn('Abrir', 'file-open', { id: a.id }, 'small')}${btn('Descargar', 'file-download', { id: a.id }, 'small')}${readonlyList ? '' : btn('Quitar', 'file-delete', { id: a.id }, 'small danger')}</div></div>`).join('');
  return `<div class="attach"><h3>Adjuntos (${list.length})</h3>${items || '<p class="desc" style="margin:0 0 8px">Sin archivos adjuntos.</p>'}${readonlyList ? '' : `<label class="btn small" style="display:inline-block">+ Adjuntar archivos<input type="file" multiple hidden data-attach="${ownerType}:${ownerId}" accept="${C.FILE_EXT.map(e => '.' + e).join(',')}"></label><p class="desc" style="margin:8px 0 0">Hasta ${formatBytes(C.MAX_FILE_BYTES)} por archivo · ${C.FILE_EXT.join(', ')}</p>`}</div>`;
}
function apptDetail(id) {
  const a = byId('appointments', id); if (!a) return;
  openModal('Cita · ' + fmtDate(a.date) + ' ' + fmtTime(a.time), `<dl class="kv"><dt>Cliente</dt><dd><a href="#" data-act="client-detail" data-id="${a.clientId}">${esc(clientName(a.clientId))}</a></dd><dt>Servicio</dt><dd>${esc(serviceName(a.serviceId))}</dd>${a.workerId ? `<dt>Profesional</dt><dd>${esc(workerName(a.workerId))}</dd>` : ''}${a.rescheduledFrom ? `<dt>Reprogramada</dt><dd>antes: ${esc(fmtDate(a.rescheduledFrom.date))} ${esc(fmtTime(a.rescheduledFrom.time))}</dd>` : ''}<dt>Valor</dt><dd>${money(a.price)}</dd><dt>Estado</dt><dd>${apptPill(a.status)}</dd>${a.notes ? `<dt>Notas</dt><dd>${esc(a.notes)}</dd>` : ''}</dl>
<b style="font-size:12px">Cambiar estado</b><div class="chips">${C.APPT_STATUS.map(s => `<button type="button" class="chip ${a.status === s ? 'on' : ''}" data-act="appt-status" data-id="${a.id}" data-status="${s}">${s}</button>`).join('')}</div>${attachBlock('appointment', a.id)}
<div class="actions">${can('delete.records') ? btn('Eliminar', 'delete', { type: 'appointment', id: a.id }, 'danger') : ''}${can('edit.records') ? btn('Reprogramar', 'reschedule', { id: a.id }) + btn('Editar', 'edit', { type: 'appointment', id: a.id }) : ''}${btn('Cerrar', 'close', {}, 'primary')}</div>`, 'appt:' + a.id);
}
function clientDetail(id) {
  const c = byId('clients', id); if (!c) return;
  const sales = db.sales.filter(s => s.clientId === id), act = sales.filter(s => !s.voided), pays = db.payments.filter(p => p.clientId === id), quotes = db.quotes.filter(q => q.clientId === id), apps = db.appointments.filter(a => a.clientId === id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const sold = act.reduce((a, s) => a + (+s.total || 0), 0), paid = act.reduce((a, s) => a + (+s.paid || 0), 0), due = act.reduce((a, s) => a + saleBalance(s), 0);
  const apptFiles = apps.flatMap(a => C.attachmentsOf(db, 'appointment', a.id).map(f => ({ ...f, when: a.date })));
  openModal(c.name, `<p class="desc">${c.documentNumber ? `${esc(c.documentType || 'Documento')}: ${esc(c.documentNumber)} · ` : ''}${esc(c.phone || 'Sin teléfono')} · ${esc(c.email || 'sin correo')}</p>${c.notes ? `<p class="desc">${esc(c.notes)}</p>` : ''}
<div class="inline-actions" style="margin:0 0 12px">${btn('+ Cita', 'new', { type: 'appointment', client: id, back: 'client:' + id }, 'small primary')}${btn('+ Cotización', 'new', { type: 'quote', client: id, back: 'client:' + id }, 'small')}${btn('+ Venta', 'new', { type: 'sale', client: id, back: 'client:' + id }, 'small')}${btn('Editar', 'edit', { type: 'client', id }, 'small')}${btn('Eliminar', 'delete', { type: 'client', id }, 'small danger')}</div>
<div class="stats" style="grid-template-columns:repeat(3,1fr)"><div class="stat"><small>Vendido</small><strong>${money(sold)}</strong></div><div class="stat"><small>Pagado</small><strong>${money(paid)}</strong></div><div class="stat"><small>Saldo</small><strong>${money(due)}</strong></div></div>
${attachBlock('client', id)}
<h3>Citas (${apps.length})</h3>${table(['Fecha', 'Hora', 'Servicio', 'Estado', 'Adj.'], apps.map(a => tr([fmtDate(a.date), fmtTime(a.time), esc(serviceName(a.serviceId)), apptPill(a.status), attCount('appointment', a.id)], { act: 'appt-detail', id: a.id })).join(''))}
${apptFiles.length ? `<div class="attach"><h3>Archivos de sus citas</h3>${apptFiles.map(f => `<div class="file"><span class="fi">📎</span><div class="fn"><b>${esc(f.name)}</b><small>Cita del ${esc(f.when)} · ${formatBytes(f.size)}</small></div><div class="fa">${btn('Abrir', 'file-open', { id: f.id }, 'small')}</div></div>`).join('')}</div>` : ''}
<h3>Cotizaciones</h3>${table(['Fecha', 'Concepto', 'Importe', 'Estado'], quotes.map(q => tr([esc(fmtDate(q.date)), esc(q.description), money(q.amount), esc(q.status)])).join(''))}
<h3>Ventas</h3>${table(['Fecha', 'Concepto', 'Total', 'Saldo', 'Estado'], sales.map(s => tr([esc(fmtDate(s.date)), esc(s.description), money(s.total), money(saleBalance(s)), saleStatus(s)])).join(''))}
<h3>Pagos</h3>${table(['Fecha', 'Concepto', 'Monto'], pays.map(p => tr([esc(fmtDate(p.date)), esc(p.description), money(p.amount)])).join(''))}<div class="actions">${btn('Cerrar', 'close', {}, 'primary')}</div>`, 'client:' + id);
}
function reopen(back) { const [k, id] = String(back || '').split(':'); if (k === 'client') clientDetail(+id); else if (k === 'appt') apptDetail(+id); }

// ================= Formularios =================
const fld = (label, name, o = {}) => `<label class="field ${o.full ? 'full' : ''}" data-name="${name}">${label}<input name="${name}" type="${o.type || 'text'}" value="${esc(o.value ?? '')}" ${o.req ? 'required' : ''} ${o.attrs || ''}></label>`;
const area = (label, name, value = '', full = true) => `<label class="field ${full ? 'full' : ''}" data-name="${name}">${label}<textarea name="${name}" rows="2">${esc(value)}</textarea></label>`;
let selectSearchSeq = 0;
const sel = (label, name, options, value, full = false) => {
  const id = `lk-choice-${++selectSearchSeq}`;
  const optionHtml = options.map(([v, l, x]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''} ${x || ''}>${esc(l)}</option>`).join('');
  return `<label class="field choice-field ${full ? 'full' : ''}" data-name="${name}"><span>${label}</span><select id="${id}" name="${name}" aria-label="${esc(String(label).replace(/<[^>]*>/g, ''))}">${optionHtml}</select></label>`;
};
const list = a => a.map(x => [x, x]);
const clientOpts = () => db.clients.map(c => [c.id, c.name]);
const NEEDS_CLIENT = ['appointment', 'quote', 'sale', 'order'];
const workerOpts = () => workers().length ? [['', 'Sin asignar'], ['auto', 'Asignar automáticamente (equilibrado)'], ...workers().map(u => [u.id, [u.name,u.lastName].filter(Boolean).join(' ')])] : null;
const fileField = (ownerType, id) => `<div class="attach" style="margin-top:14px"><label class="field" data-name="files">Adjuntar archivos (opcional)<input type="file" name="files" multiple accept="${C.FILE_EXT.map(e => '.' + e).join(',')}"></label>${id ? `<p class="desc" style="margin:8px 0 0">Ya adjuntos: ${C.attachmentsOf(db, ownerType, id).map(a => esc(a.name)).join(', ') || 'ninguno'}. Gestiona los existentes desde la ficha.</p>` : ''}</div>`;

function formSpec(type, o) {
  const LISTOF = { user: 'users', client: 'clients', service: 'services', appointment: 'appointments', product: 'products', order: 'orders', quote: 'quotes', sale: 'sales', unit: 'organizationUnits' };
  const rec = o.id && LISTOF[type] ? byId(LISTOF[type], o.id) : null;
  const r = rec || {}, edit = !!rec, d = today();
  switch (type) {
    case 'client': return [edit ? 'Editar cliente' : 'Nuevo cliente', `<div class="formgrid">${fld('Nombre completo / razón social', 'name', { value: r.name, req: true, full: true })}${sel('Tipo de documento', 'documentType', [['CC','Cédula de ciudadanía'],['CE','Cédula de extranjería'],['NIT','NIT'],['Pasaporte','Pasaporte'],['Otro','Otro']], r.documentType || 'CC')}${fld('Número de documento (opcional)', 'documentNumber', { value: r.documentNumber, attrs: 'autocomplete="off" inputmode="text" maxlength="30"' })}${fld('Celular (opcional)', 'phone', { value: r.phone, type: 'tel' })}${fld('Correo (opcional)', 'email', { value: r.email, type: 'email' })}${area('Notas', 'notes', r.notes)}</div><p class="desc">Puedes identificar al cliente por su cédula o documento. El sistema evita duplicados por número de documento. Si no registras documento, debes indicar celular o correo.</p>${fileField('client', r.id)}`, 'Guardar cliente'];
    case 'service': return [edit ? 'Editar servicio' : 'Nuevo servicio', `<div class="formgrid">${fld('Nombre', 'name', { value: r.name, req: true, full: true })}${fld('Precio', 'price', { value: r.price ?? '', type: 'number', attrs: 'min="0" step="any"', req: true })}${fld('Duración (min)', 'duration', { value: r.duration ?? 30, type: 'number', attrs: 'min="5" step="1"', req: true })}</div>`, 'Guardar servicio'];
    case 'appointment': {
      const sid = r.serviceId || db.services[0]?.id, price = edit ? r.price : (byId('services', sid)?.price || 0);
      return [edit ? 'Editar cita' : 'Nueva cita', `<div class="formgrid">${sel('Cliente', 'clientId', clientOpts(), r.clientId || o.client || db.clients[0]?.id, true)}${sel('Servicio', 'serviceId', db.services.map(s => [s.id, `${s.name} — ${money(s.price)}`]), sid, true)}${fld('Fecha', 'date', { type: 'date', value: r.date || o.date || d, req: true })}${fld('Hora', 'time', { type: 'time', value: r.time || '09:00', req: true })}${workerOpts() ? sel('Profesional', 'workerId', workerOpts(), r.workerId || '') : ''}${sel('Estado', 'status', list(C.APPT_STATUS), r.status || 'Confirmada')}${fld('Valor', 'price', { type: 'number', value: price, attrs: 'min="0" step="any"', req: true })}${area('Notas', 'notes', r.notes)}</div><div id="conflict"></div>${fileField('appointment', r.id)}`, 'Guardar cita'];
    }
    case 'product': return [edit ? 'Editar producto' : 'Agregar producto', `<div class="formgrid">${fld('Nombre', 'name', { value: r.name, req: true, full: true })}${fld('SKU / código', 'sku', { value: r.sku })}${edit ? `<label class="field">Existencias<input value="${r.stock}" disabled></label>` : fld('Existencias', 'stock', { type: 'number', value: 0, attrs: 'min="0" step="any"' })}${fld('Unidad (und, kg, l…)', 'unit', { value: r.unit || 'und' })}${fld('Alerta de stock mínimo', 'minStock', { type: 'number', value: r.minStock ?? 0, attrs: 'min="0" step="any"' })}${fld('Costo', 'cost', { type: 'number', value: r.cost ?? 0, attrs: 'min="0" step="any"' })}${fld('Precio venta', 'price', { type: 'number', value: r.price ?? 0, attrs: 'min="0" step="any"' })}</div>${edit ? '<p class="desc">Las existencias se cambian con movimientos de inventario para conservar la trazabilidad.</p>' : ''}`, 'Guardar producto'];
    case 'order': return [edit ? 'Editar operación' : 'Nueva operación', `<div class="formgrid">${sel('Cliente', 'clientId', clientOpts(), r.clientId || o.client, true)}${fld('Referencia / activo', 'vehicle', { value: r.vehicle, req: true, full: true, attrs: 'placeholder="Código, equipo, pedido o referencia"' })}${area('Trabajo solicitado', 'detail', r.detail)}${fld('Fecha', 'date', { type: 'date', value: r.date || d, req: true })}${fld('Valor estimado', 'amount', { type: 'number', value: r.amount ?? '', attrs: 'min="0" step="any"', req: true })}${sel('Estado', 'status', list(C.ORDER_STATUS), r.status || 'Recibido', true)}</div>`, 'Guardar operación'];
    case 'quote': return [edit ? 'Editar cotización' : 'Nueva cotización', `<div class="formgrid">${sel('Cliente', 'clientId', clientOpts(), r.clientId || o.client, true)}${fld('Concepto / propuesta', 'description', { value: r.description, req: true, full: true })}${fld('Valor cotizado', 'amount', { type: 'number', value: r.amount ?? '', attrs: 'min="0.01" step="any"', req: true })}${fld('Fecha', 'date', { type: 'date', value: r.date || d, req: true })}${fld('Válida hasta', 'validUntil', { type: 'date', value: r.validUntil || C.addDays(15) })}</div>`, 'Guardar cotización'];
    case 'sale': return edit
      ? ['Editar venta', `<div class="formgrid">${sel('Cliente', 'clientId', clientOpts(), r.clientId, true)}${fld('Concepto', 'description', { value: r.description, req: true, full: true })}${fld('Total de venta', 'total', { type: 'number', value: r.total, attrs: 'min="0.01" step="any"', req: true })}${fld('Fecha', 'date', { type: 'date', value: r.date, req: true })}</div><p class="desc">Pagado hasta ahora: ${money(r.paid)}. El producto y los pagos no se editan aquí.</p>`, 'Guardar venta']
      : ['Nueva venta', `<div class="formgrid">${sel('Cliente', 'clientId', clientOpts(), o.client || db.clients[0]?.id, true)}${fld('Concepto', 'description', { req: true, full: true, attrs: 'placeholder="Detalle de la venta"' })}${fld('Total de venta', 'total', { type: 'number', attrs: 'min="0.01" step="any"', req: true })}${fld('Pago recibido ahora', 'paid', { type: 'number', value: 0, attrs: 'min="0" step="any"' })}${fld('Fecha', 'date', { type: 'date', value: d, req: true })}${sel('Método de pago', 'method', list(C.METHODS), 'Efectivo')}${sel('Producto (opcional)', 'productId', [['', 'No asociar producto'], ...db.products.map(p => [p.id, `${p.name} · stock ${p.stock}`])], '', true)}${fld('Cantidad', 'quantity', { type: 'number', value: 1, attrs: 'min="1" step="1"' })}</div><p class="desc">Si asocias un producto, se descontará del inventario. El pago inicial no puede superar el total.</p>`, 'Registrar venta'];
    case 'receivable': {
      const open = C.activeSales(db).filter(s => saleBalance(s) > 0), pre = open.find(s => s.id === o.saleId) || open[0];
      return ['Registrar abono', open.length ? `<div class="formgrid">${sel('Venta pendiente', 'saleId', open.map(s => [s.id, `${clientName(s.clientId)} — ${s.description} · saldo ${money(saleBalance(s))}`, `data-balance="${saleBalance(s)}"`]), pre?.id, true)}${fld('Valor del abono', 'amount', { type: 'number', value: pre ? saleBalance(pre) : '', attrs: 'min="0.01" step="any"', req: true })}${fld('Fecha', 'date', { type: 'date', value: d, req: true })}${sel('Método', 'method', list(C.METHODS), 'Efectivo', true)}</div>` : '<p class="desc">No hay ventas con saldo pendiente.</p>', 'Guardar abono', !open.length];
    }
    case 'movement': return ['Movimiento de inventario', `<div class="formgrid">${sel('Producto', 'productId', db.products.map(p => [p.id, `${p.name} · stock ${p.stock}`]), o.id || db.products[0]?.id, true)}${sel('Tipo', 'type', list(C.MOVE_TYPES), 'Entrada')}${fld('Cantidad', 'quantity', { type: 'number', value: 1, attrs: 'min="0" step="any"', req: true })}${fld('Fecha', 'date', { type: 'date', value: d, req: true })}${fld('Motivo', 'reason', { full: true, attrs: 'placeholder="Compra, venta, devolución, corrección…"' })}</div><p class="desc">Entrada suma; salida y merma descuentan; ajuste establece el stock final indicado.</p>`, 'Guardar movimiento', !db.products.length];
    case 'user': return [edit ? 'Editar usuario' : 'Nuevo usuario', `<div class="formgrid">${fld('Nombre', 'name', { value: r.name, req: true })}${fld('Apellido', 'lastName', { value: r.lastName || '' })}${fld('Celular', 'phone', { value: r.phone || '', type: 'tel' })}${fld('Área / estación de trabajo', 'station', { value: r.station || '', attrs: 'placeholder="Ej. Cocina, bebidas, caja, barbería…"' })}${sel('Rol', 'role', Object.entries(Cat.ROLES), r.role || 'employee')}${fld('Correo del administrador (si aplica)', 'email', { value: r.email || '', type: 'email', full: true })}${sel('Estado', 'active', [['yes', 'Activo'], ['no', 'Inactivo']], r.active === false ? 'no' : 'yes')}${fld(edit ? 'Nueva contraseña (vacía = conservar)' : 'Contraseña administrador (mín. 8)', 'password', { type: 'password', full: true, attrs: 'autocomplete="new-password"' })}${fld(edit ? 'Nuevo PIN (vacío = conservar)' : 'PIN empleado (4 a 8 dígitos)', 'pin', { type: 'password', full: true, attrs: 'autocomplete="new-password" inputmode="numeric"' })}</div><p class="desc">Registra nombre, apellido y celular para que el equipo pueda recibir avisos. Administradores ingresan con correo y contraseña; empleados con PIN.</p>`, 'Guardar usuario'];
    case 'reschedule': { const a = byId('appointments', o.id); return ['Reprogramar cita', `<div class="formgrid">${fld('Nueva fecha', 'date', { type: 'date', value: a.date, req: true })}${fld('Nueva hora', 'time', { type: 'time', value: a.time, req: true })}${workerOpts() ? sel('Profesional', 'workerId', workerOpts(), a.workerId || '', true) : ''}</div><p class="desc">Se revisa que no haya choque de horario. Una cita cancelada o pendiente de reprogramación vuelve a Pendiente.</p>`, 'Reprogramar']; }
    case 'unit': {
      const parents = db.organizationUnits.filter(u => u.kind === 'business' && u.id !== r.id).map(u => [u.id, u.name]);
      return [edit ? 'Editar empresa o sucursal' : 'Agregar empresa o sucursal', `<div class="formgrid">${fld('Nombre', 'name', { value: r.name, req: true, full: true })}${sel('Tipo', 'kind', [['business', 'Empresa independiente'], ['branch', 'Sucursal de una empresa']], r.kind || 'business')}${sel('Empresa principal (solo sucursales)', 'parentId', [['', '—'], ...parents], r.parentId || '')}</div>`, 'Guardar'];
    }
  }
}
function openForm(type, o = {}) {
  const perm = FORM_PERM[type]; if (perm && !can(perm)) return deny(perm);
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
function reassignUnavailableAppointments(workerId, start = today(), end = '9999-12-31') {
  const affected = db.appointments.filter(a => a.workerId === +workerId && a.date >= start && a.date <= end && !['Atendida','Cancelada','Pendiente de reprogramación'].includes(a.status) && !C.workerAvailability(db, workerId, a.date, a.time, +(byId('services', a.serviceId)?.duration || 30)).ok);
  const result = { moved: 0, pending: 0 };
  for (const a of affected) {
    const duration = +(byId('services', a.serviceId)?.duration || 30);
    const replacement = LKAuto.pickWorker(db, { date: a.date, time: a.time, serviceId: a.serviceId }, a.id);
    if (replacement && C.workerAvailability(db, replacement, a.date, a.time, duration).ok) { a.reassignedFromWorkerId = a.workerId; a.workerId = replacement; a.reassignedAt = new Date().toISOString(); a.reassignmentNote = 'Reasignada por ausencia / cambio de disponibilidad'; result.moved++; }
    else { a.reassignedFromWorkerId = a.workerId; a.workerId = null; a.status = 'Pendiente de reprogramación'; a.reassignmentNote = 'No se encontró otro profesional disponible'; result.pending++; }
  }
  return result;
}

async function handleForm(form) {
  const type = form.dataset.form, editId = form.dataset.id ? +form.dataset.id : null, back = form.dataset.back || '';
  const raw = {}; for (const [k, v] of new FormData(form).entries()) if (typeof v === 'string') raw[k] = v;
  clearErrors(form);
  if (type === 'login') return doLogin(form, raw);
  if (type === 'dashboard-settings') { const selected=[...form.querySelectorAll('input[name=widgets]:checked')].map(x=>x.value); if (!selected.length) return toast('Selecciona al menos un elemento para tu resumen.', 'err'); const u=currentUser(); if(u){u.preferences={...(u.preferences||{}),dashboard:{...(u.preferences?.dashboard||{}),widgets:selected}};}else{db.profile.dashboard={...(db.profile.dashboard||{}),widgets:selected};} save(); closeModal(); render(); return toast('Tu panel se actualizó.'); }
  if (type === 'staff-schedule' || type === 'timeoff' || type === 'company-timeoff') { if (!can('users.manage')) return deny('users.manage'); }
  if (type === 'staff-schedule') {
    const u = byId('users', +raw.userId); if (!u) return toast('Empleado no encontrado.', 'err');
    const days = [...form.querySelectorAll('input[name="days"]:checked')].map(x => +x.value);
    const validTime = x => /^([01]\d|2[0-3]):[0-5]\d$/.test(x || '');
    const break2 = !!(raw.break2Start || raw.break2End);
    if (!days.length || !validTime(raw.start) || !validTime(raw.end) || raw.end <= raw.start || !validTime(raw.breakStart) || !validTime(raw.breakEnd) || raw.breakEnd <= raw.breakStart || raw.breakStart < raw.start || raw.breakEnd > raw.end || (break2 && (!validTime(raw.break2Start) || !validTime(raw.break2End) || raw.break2End <= raw.break2Start || raw.break2Start < raw.start || raw.break2End > raw.end || !(raw.break2End <= raw.breakStart || raw.break2Start >= raw.breakEnd)))) return toast('Revisa los días, el horario y las pausas (deben estar dentro de la jornada y no cruzarse).', 'err');
    u.schedule = { days, start: raw.start, end: raw.end, breakStart: raw.breakStart, breakEnd: raw.breakEnd, break2Start: raw.break2Start || '', break2End: raw.break2End || '' }; const moved = reassignUnavailableAppointments(u.id); save(); closeModal(); render(); return toast(`Horario actualizado. ${moved.moved} cita(s) reasignada(s) y ${moved.pending} pendiente(s) de reprogramación.`);
  }
  if (type === 'timeoff' || type === 'company-timeoff') {
    const wid = type === 'company-timeoff' ? 'business' : +raw.userId;
    const r = C.addTimeOff(db, wid, raw.start, raw.end, raw.reason || ''); if (!r.ok) return toast(r.error, 'err'); let moved = {moved:0,pending:0}; if (wid === 'business') { db.appointments.filter(a => a.date >= raw.start && a.date <= raw.end && !['Atendida','Cancelada'].includes(a.status)).forEach(a => { a.status = 'Pendiente de reprogramación'; a.reassignmentNote = 'Cierre de empresa'; moved.pending++; }); } else moved = reassignUnavailableAppointments(wid, raw.start, raw.end); save(); closeModal(); render(); return toast(`Ausencia registrada. ${moved.moved} cita(s) reasignada(s), ${moved.pending} pendiente(s) de reprogramación.`);
  }
  const need = FORM_PERM[type]; if (need && !can(need)) return deny(need);
  if (type.startsWith('pos-')) return PosUI.handleForm(form, raw, editId);
  if (type === 'reschedule') {
    const t = form.dataset.id ? +form.dataset.id : null, w = raw.workerId === undefined ? undefined : raw.workerId === 'auto' ? 'auto' : raw.workerId ? +raw.workerId : null, a = byId('appointments', t);
    let wid = w; if (w === 'auto' && a) { wid = LKAuto.pickWorker(db, { date: raw.date, time: raw.time, serviceId: a.serviceId }, a.id); if (!wid) return showErrors(form, { workerId: 'No hay profesionales libres en ese horario.' }); }
    if (wid && !C.workerAvailability(db, wid, raw.date, raw.time, +(byId('services', a.serviceId)?.duration || 30)).ok) return showErrors(form, { workerId: C.workerAvailability(db, wid, raw.date, raw.time, +(byId('services', a.serviceId)?.duration || 30)).reason });
    const r = C.rescheduleAppointment(db, t, { date: raw.date, time: raw.time, workerId: wid }); if (!r.ok) return showErrors(form, { time: r.error }); save(); closeModal(); render(); apptDetail(t); return toast('Cita reprogramada.');
  }
  const files = [...(form.querySelector('input[type=file]')?.files || [])];
  const r = C.validate(type, raw, db, { editId }), errs = { ...r.errors }, fe = files.map(C.validateFile).filter(Boolean);
  if (fe.length) errs.files = fe.join(' ');
  if (Object.keys(errs).length) return showErrors(form, errs);
  if (type === 'appointment' && r.value.workerId === 'auto') {
    const w = LKAuto.pickWorker(db, { date: r.value.date, time: r.value.time, serviceId: r.value.serviceId }, editId); if (!w) return showErrors(form, { workerId: 'No hay profesionales libres en ese horario.' }); r.value.workerId = w;
  }
  if (type === 'appointment' && r.value.workerId && r.value.workerId !== 'auto') { const av = C.workerAvailability(db, r.value.workerId, r.value.date, r.value.time, +(byId('services', r.value.serviceId)?.duration || 30)); if (!av.ok) return showErrors(form, { workerId: av.reason }); }
  if (type === 'appointment' && !form.dataset.force) {
    const cf = C.appointmentConflicts(db, r.value, editId);
    if (cf.length) { form.querySelector('#conflict').innerHTML = `<div class="notice warn" role="alert">Ya hay ${cf.length === 1 ? 'una cita' : cf.length + ' citas'} en ese horario (${cf.map(a => esc(clientName(a.clientId)) + ' ' + a.time).join(', ')}). Pulsa de nuevo para guardar de todas formas.</div>`; form.dataset.force = '1'; form.querySelector('[type=submit]').textContent = 'Guardar de todas formas'; return; }
  }
  const submitBtn = form.querySelector('[type=submit]'); submitBtn.disabled = true;
  const previousOrderStatus = type === 'order' && editId ? byId('orders', editId)?.status : null;
  const res = C.commit(db, type, r.value, editId);
  if (!res.ok) { toast(res.error, 'err'); submitBtn.disabled = false; return; }
  if (type === 'order' && (!previousOrderStatus || previousOrderStatus !== r.value.status)) {
    const op = byId('orders', res.id), client = op && byId('clients', op.clientId);
    const text = `Hola ${client?.name || 'te saludamos'}, el estado de tu encargo «${op?.vehicle || 'pedido'}» cambió a: ${op?.status}. ${op?.detail || ''} · ${db.profile.name}.`;
    if (client?.phone) db.outbox.push({ id: C.nextId(db), clientId: client.id, kind: 'Estado de pedido', text, status: 'Pendiente de envío', createdAt: new Date().toISOString() });
    const team = db.users.filter(u => u.active !== false && u.role !== 'admin');
    team.forEach(u => db.pos.notifications.push({ id: C.nextId(db), orderId: res.id, createdAt: new Date().toISOString(), text: `Encargo ${op?.vehicle || ''}: estado actualizado a ${op?.status}. ${op?.detail || ''}`, read: false, recipientUserId: u.id, targetName: [u.name,u.lastName].filter(Boolean).join(' '), kind: 'operaciones' }));
  }
  save();
  let msg = 'Guardado.';
  if (files.length && OWNER[type]) {
    const a = await attachFiles(type, editId || res.id, files);
    msg = a.ok ? `Guardado con ${a.ok} adjunto${a.ok > 1 ? 's' : ''}.` : msg; if (a.errs.length) toast(a.errs.join(' '), 'err');
  }
  closeModal(); render(); if (back) reopen(back); toast(msg);
}

// ================= Acciones (todos los botones pasan por aquí) =================
const LABEL = { user: 'este usuario', client: 'este cliente', service: 'este servicio', appointment: 'esta cita', product: 'este producto', order: 'esta operación', quote: 'esta cotización', payment: 'este pago', unit: 'esta empresa o sucursal' };
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
  d.profile = { ...d.profile, name: 'LK ONE Demo · Centro Integral', type: 'services', country: 'Colombia', currency: 'COP', language: 'es', timezone: 'America/Bogota', onboarded: true, modulesSet: false };
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
  d.organizationUnits = [{id:1,name:'LK ONE Demo · Centro Integral',kind:'business',parentId:null,country:'Colombia'},{id:2,name:'Sucursal Norte',kind:'branch',parentId:1,country:'Colombia'}];
  d.meta.nextId = 20;
  d.automations = {appointmentReminder:true,followup:true,birthday:false,lowStock:true,leadWelcome:true};
  return C.migrate(d);
}
const ACTIONS = {
  go: d => { closeModal(); go(d.page); },
  'dashboard-customize': () => { const all=[['income','Ingresos de hoy'],['appointments','Citas de hoy'],['clients','Clientes'],['sales','Ventas activas'],['outstanding','Por cobrar'],['inventory','Productos e inventario'],['orders','Encargos activos'],['trend','Gráfico de ingresos · 7 días'],['activity','Registro de actividad'],['upcoming','Próximas citas'],['alerts','Alertas y pendientes']]; const chosen=dashboardConfig().widgets||[]; openModal('Personaliza tu resumen', `<p class="desc">Elige qué información quieres ver al entrar. Puedes cambiarlo cuando quieras.</p><form data-form="dashboard-settings"><div class="dashboard-options">${all.map(([id,label])=>`<label><input type="checkbox" name="widgets" value="${id}" ${chosen.includes(id)?'checked':''}> <span>${label}</span></label>`).join('')}</div><div class="actions"><button type="button" class="btn" data-act="close">Cancelar</button><button type="submit" class="btn primary">Guardar mi panel</button></div></form>`); },
  'staff-schedule': d => { const u = byId('users', +d.id), sc = u.schedule || {days:[1,2,3,4,5,6],start:'09:00',end:'18:00',breakStart:'13:00',breakEnd:'14:00'}; const labels=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']; openModal('Horario laboral · ' + esc([u.name,u.lastName].filter(Boolean).join(' ')), `<form data-form="staff-schedule"><input type="hidden" name="userId" value="${u.id}"><p class="desc">Selecciona los días habituales y define la jornada y la pausa.</p><div class="daychecks">${labels.map((x,i)=>`<label><input type="checkbox" name="days" value="${i}" ${(sc.days||[]).includes(i)?'checked':''}> ${x}</label>`).join('')}</div><div class="formgrid">${fld('Entrada','start',{type:'time',value:sc.start})}${fld('Salida','end',{type:'time',value:sc.end})}${fld('Inicio de pausa','breakStart',{type:'time',value:sc.breakStart})}${fld('Fin de pausa','breakEnd',{type:'time',value:sc.breakEnd})}${fld('Inicio de segunda pausa (opcional)','break2Start',{type:'time',value:sc.break2Start || ''})}${fld('Fin de segunda pausa (opcional)','break2End',{type:'time',value:sc.break2End || ''})}</div><div class="actions"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar horario</button></div></form>`); },
  'staff-vacation': d => { const u = byId('users', +d.id); openModal('Vacaciones / permiso · ' + esc([u.name,u.lastName].filter(Boolean).join(' ')), `<form data-form="timeoff"><input type="hidden" name="userId" value="${u.id}"><div class="formgrid">${fld('Desde','start',{type:'date',value:today(),req:true})}${fld('Hasta','end',{type:'date',value:today(),req:true})}${fld('Motivo','reason',{full:true,attrs:'placeholder="Vacaciones, incapacidad, permiso…"'})}</div><div class="actions"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Registrar ausencia</button></div></form>${(u.vacations||[]).length ? `<h3 style="margin-top:18px">Ausencias registradas</h3>${table(['Desde','Hasta','Motivo',''],u.vacations.map(v=>tr([fmtDate(v.start),fmtDate(v.end),esc(v.reason||'Permiso'),btn('Quitar','remove-timeoff',{id:v.id,scope:'employee',userId:u.id},'small danger')])).join(''))}` : '<p class="desc" style="margin-top:14px">No hay ausencias registradas.</p>'}`); },
  'business-closure': () => openModal('Cierre o vacaciones de la empresa', `<form data-form="company-timeoff"><div class="formgrid">${fld('Desde','start',{type:'date',value:today(),req:true})}${fld('Hasta','end',{type:'date',value:today(),req:true})}${fld('Motivo','reason',{full:true,attrs:'placeholder="Festivo, vacaciones colectivas, cierre…"'})}</div><div class="actions"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar cierre</button></div></form>`),
  'remove-timeoff': d => { const arr = d.scope === 'business' ? db.workforce.businessDaysOff : (db.users.find(u => u.id === +d.userId)?.vacations || db.users.find(u => (u.vacations||[]).some(v=>v.id===+d.id))?.vacations || []); const i = arr.findIndex(v=>v.id===+d.id); if(i>=0){arr.splice(i,1);save();render();toast('Ausencia eliminada.');} },
  close: () => closeModal(),
  'team-notifications': () => { const items = globalNotifications().slice().reverse(); openModal('Centro de avisos', items.length ? items.map(n => `<section class="notice"><b>${esc(n.targetName || (n.kind === 'cliente' ? 'Cliente' : 'Equipo'))}</b><p style="white-space:pre-line">${esc(fmtStamp(n.createdAt))} · ${esc(n.text)}</p><div class="rowactions">${n.phone && n.allowWhatsApp !== false ? btn('Abrir WhatsApp', 'team-notification-whatsapp', {id:n.id}, 'small primary') : ''}${btn('Marcar leído', 'team-notification-read', {id:n.id}, 'small')}</div></section>`).join('') + `<div class="actions">${btn('Cerrar','close',{},'primary')}</div>` : `<p class="desc">No tienes avisos pendientes.</p><div class="actions">${btn('Cerrar','close',{},'primary')}</div>`); },
  'team-notification-read': d => { const n = db.pos.notifications.find(x => x.id === +d.id); if (n) n.read = true; save(); closeModal(); render(); },
  'team-notification-whatsapp': d => { const n = db.pos.notifications.find(x => x.id === +d.id); if (!n || !n.phone) return toast('No hay teléfono registrado para este destinatario.', 'err'); let phone = String(n.phone).replace(/\D/g,''); const ct = Cat.findCountry(db.profile.country); if (ct && ct[1] === 'CO' && phone.length === 10) phone = '57' + phone; if (!phone) return toast('Número de teléfono inválido.', 'err'); window.open(`https://wa.me/${phone}?text=${encodeURIComponent(n.text)}`, '_blank', 'noopener'); n.read = true; n.sentManuallyAt = new Date().toISOString(); save(); closeModal(); render(); toast('WhatsApp se abrió con el mensaje preparado; confirma el envío en la aplicación.'); },
  'cancel-form': () => { const back = $('#mbody form')?.dataset.back; closeModal(); if (back) reopen(back); },
  'new-menu': () => openModal('¿Qué quieres crear?', `<div class="menu-grid">${[['appointment', '▦ Cita', 'agenda'], ['client', '♙ Cliente', 'crm'], ['quote', '▣ Cotización', 'sales'], ['sale', '$ Venta', 'sales'], ['receivable', '$ Abono', 'cash'], ['product', '▤ Producto', 'inventory'], ['order', '▧ Operación', 'operations'], ['service', '✦ Servicio', 'services']].filter(([t, l, m]) => activeModules().has(m) && can(FORM_PERM[t])).map(([t, l]) => ([t, l]) => `<button type="button" data-act="new" data-type="${t}">${l}</button>`).join('')}</div>`),
  new: d => openForm(d.type, { id: d.type === 'movement' && d.id ? +d.id : null, client: d.client ? +d.client : null, back: d.back, date: d.date }),
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
  logout: () => logout(),
  'appt-view': d => { apptView = d.view === 'week' ? 'week' : 'list'; render(); },
  'cal-nav': d => { const n = +d.dir; calStart = n === 0 ? mondayOf(today()) : (() => { const x = new Date((calStart || mondayOf(today())) + 'T12:00:00'); x.setDate(x.getDate() + 7 * n); return C.isoDate(x); })(); render(); },
  reschedule: d => openForm('reschedule', { id: +d.id }),
  'auth-enable': async () => {
    const admins = db.users.filter(u => u.role === 'admin' && u.active !== false && u.email && u.passwordHash);
    if (!admins.length) return toast('Crea un administrador con correo y contraseña (mínimo 8 caracteres) antes de activar el acceso.', 'err');
    if (!await confirmBox({ title: 'Activar inicio de sesión', message: 'Administradores ingresarán con correo y contraseña; empleados con PIN personal. Cada rol verá las funciones autorizadas. Es protección local, no autenticación de servidor.', label: 'Activar' })) return;
    db.auth.enabled = true; try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {} save(); render(); toast('Inicio de sesión activado.');
  },
  'auth-disable': async () => { if (!await confirmBox({ title: 'Desactivar inicio de sesión', message: 'Cualquier persona con acceso al equipo podrá usar la aplicación con todos los permisos.', label: 'Desactivar', danger: true })) return; db.auth.enabled = false; save(); render(); toast('Inicio de sesión desactivado.'); },
  'apply-recommended': async () => { if (!await confirmBox({ title: 'Módulos recomendados', message: 'Se activarán los módulos recomendados para la actividad seleccionada. No se borra ningún dato; los módulos ocultos conservan su información.', label: 'Aplicar' })) return; db.profile.modulesSet = false; db.profile.modules = []; save(); render(); toast('Módulos recomendados aplicados.'); },
  'logo-remove': () => { db.profile.logo = ''; save(); render(); toast('Logotipo eliminado.'); },
  'wa-plan': () => { const made = LKAuto.planReminders(db); save(); render(); toast(made.length ? `${made.length} mensaje(s) quedaron en la cola «Pendiente de envío».` : 'No hay recordatorios nuevos por planificar.'); },
  'wa-release': () => { const r = LKAuto.releaseUnconfirmed(db); save(); render(); toast(r.length ? `${r.length} turno(s) liberado(s) por falta de confirmación.` : 'Ningún turno cumple la regla de liberación (30 min sin confirmar tras un envío real).'); },
  'wa-manual': d => { const m = db.outbox.find(x => x.id === +d.id), c = m && byId('clients', m.clientId); if (!m || !c || !c.phone) return toast('El cliente no tiene teléfono registrado.', 'err'); let phone = c.phone.replace(/\D/g, ''); const ct = Cat.findCountry(db.profile.country); if (ct && phone.length === 10 && ct[1] === 'CO') phone = '57' + phone; window.open(`https://wa.me/${phone}?text=${encodeURIComponent(m.text)}`, '_blank', 'noopener'); m.status = 'Enviado manualmente'; m.sentAt = new Date().toISOString(); save(); render(); toast('Marcado como enviado manualmente. Registra la respuesta del cliente en la cita.'); },
  'wa-discard': d => { const m = db.outbox.find(x => x.id === +d.id); if (m) { m.status = 'Cancelado'; save(); render(); } },
  'export-backup': () => exportBackup(),
  'export-csv': d => exportCSV(d.kind),
  'load-showcase': async () => {
    if (!await confirmBox({title:'Cargar escenario comercial',message:'Se reemplazarán los registros actuales por información ficticia preparada para presentar LK ONE. No se contactará a ningún cliente.',label:'Cargar demo',danger:true})) return;
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
const moduleCatalog = Cat.MODULES;
const recommendedModules = () => C.recommendedModules(db.profile);
const activeModules = () => new Set(db.profile.modulesSet ? db.profile.modules : recommendedModules());
function toggleModule(id, on) { if (!can('settings.profile')) { deny('settings.profile'); return render(); } const s = activeModules(); on ? s.add(id) : s.delete(id); db.profile.modules = [...s]; db.profile.modulesSet = true; save(); render(); }
function daysSinceBackup() { const t = Date.parse(db.meta.lastBackup || ''); return isNaN(t) ? null : Math.floor((Date.now() - t) / 864e5); }
function lastBackupText() { const d = daysSinceBackup(); return d === null ? 'nunca' : d === 0 ? 'hoy' : 'hace ' + d + (d === 1 ? ' día' : ' días'); }
function backupBanner() { const d = daysSinceBackup(); if (d !== null && d < 7) return; $app().insertAdjacentHTML('afterbegin', `<div class="notice">Último respaldo descargado: <b>${lastBackupText()}</b>. ${Store.mode === 'server' ? 'Tus datos están en el servidor local, pero conviene guardar una copia aparte.' : 'Tus datos viven solo en este navegador.'} <a href="#" data-act="go" data-page="settings">Exportar respaldo</a></div>`); }
function saveBlobAs(name, blob) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); }
function downloadCSV(name, headers, rows) { saveBlobAs('lkone-' + name + '-' + today() + '.csv', new Blob(['\ufeff' + [headers, ...rows].map(r => r.map(C.csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })); }
function exportCSV(kind) {
  const m = {
    clients: () => downloadCSV('clientes', ['Nombre', 'Tipo documento', 'Número documento', 'Teléfono', 'Correo'], db.clients.map(c => [c.name, c.documentType || '', c.documentNumber || '', c.phone, c.email || ''])),
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
  saveBlobAs('lkone-respaldo-' + today() + '.json', new Blob([JSON.stringify({ app: 'LK ONE', schemaVersion: C.SCHEMA_VERSION, appVersion: C.APP_VERSION, exportedAt: new Date().toISOString(), data: db, files }, null, 2)], { type: 'application/json' }));
  if (page === 'settings') render(); toast(`Respaldo exportado con ${n} archivo${n === 1 ? '' : 's'}.` + (missing ? ` ${missing} adjunto(s) no se pudieron leer.` : ''), missing ? 'err' : '');
}
async function importBackup(input) {
  const file = input.files && input.files[0]; if (!file) return;
  try {
    const parsed = JSON.parse(await file.text()), cand = parsed.data;
    if (+parsed.schemaVersion > C.SCHEMA_VERSION) throw new Error('El respaldo fue creado por una versión más nueva de LK ONE.');
    if (!['LUKARIS', 'LK ONE'].includes(parsed.app) || !C.isObj(cand) || !C.isObj(cand.profile) || !['clients', 'services', 'appointments', 'payments', 'products', 'orders'].every(k => Array.isArray(cand[k]))) throw new Error('El archivo no tiene la estructura de respaldo de LK ONE.');
    if (!await confirmBox({ title: 'Importar respaldo', message: 'Esto reemplazará todos los datos actuales por los del respaldo. ¿Continuar?', label: 'Reemplazar datos', danger: true })) return;
    const next = C.migrate(cand), files = C.isObj(parsed.files) ? parsed.files : {}, keep = new Set(); let lost = 0;
    next.attachments = next.attachments.filter(a => { if (files[a.id]) return true; lost++; return false; });
    for (const a of next.attachments) { await Store.putBlob(a.id, new File([b64ToBlob(files[a.id], a.mime)], a.name, { type: a.mime })); keep.add(a.id); }
    for (const a of db.attachments) if (!keep.has(a.id)) await Store.delBlob(a.id);
    db = next; Store.force = true; save(); render(); toast('Respaldo restaurado.' + (lost ? ` ${lost} adjunto(s) no venían en el archivo.` : ''));
  } catch (err) { toast('No se pudo importar el respaldo: ' + err.message, 'err'); } finally { input.value = ''; }
}
function uploadLogo(input) {
  const f = input.files && input.files[0]; input.value = ''; if (!f) return;
  if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return toast('El logotipo debe ser PNG, JPG o WebP.', 'err');
  if (f.size > 4 * 1048576) return toast('El logotipo supera 4 MB.', 'err');
  const img = new Image(), url = URL.createObjectURL(f);
  img.onload = () => { const k = Math.min(1, 220 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); db.profile.logo = c.toDataURL('image/png'); save(); render(); toast('Logotipo actualizado.'); };
  img.onerror = () => { URL.revokeObjectURL(url); toast('No se pudo leer la imagen.', 'err'); }; img.src = url;
}
function applyAppearance() {
  const a = db.profile.appearance || {}, root = document.documentElement;
  const themes = { emerald: ['#165d52','#e6f3ef','#122b2a'], ocean: ['#245b9b','#e8f1fb','#142b45'], violet: ['#6941a5','#f0eafb','#2b2040'], rose: ['#ad496d','#faeaf0','#442332'], slate: ['#475569','#edf0f4','#202936'], amber: ['#b45309','#fdf1e1','#3b2410'], indigo: ['#4338ca','#ecebfb','#1e1b4b'] };
  const t = themes[a.theme] || themes.emerald; root.style.setProperty('--brand', t[0]); root.style.setProperty('--soft', t[1]); root.style.setProperty('--side-bg', t[2]);
  const fonts = { system: 'system-ui,sans-serif', inter: 'Inter,system-ui,sans-serif', serif: 'Georgia,serif', mono: 'ui-monospace,monospace' };
  document.body.style.fontFamily = fonts[a.font] || fonts.system; document.body.style.fontSize = ({compact:'14px',normal:'15px',large:'17px'})[a.scale] || '15px';
  root.dataset.radius = a.radius || 'normal';
  document.body.classList.toggle('dark-mode', a.mode === 'dark');
}
function teamSection() {
  const permRows = [['page.pos', 'Ver LK POS'], ['pos.orders', 'Tomar pedidos'], ['pos.kitchen', 'Vista de cocina'], ['pos.pay', 'Registrar pagos'], ['pos.shift', 'Abrir y cerrar caja'], ['pos.discount', 'Aplicar descuentos'], ['pos.void', 'Anular / cancelar'], ['pos.refund', 'Reembolsos'], ['pos.menu', 'Menú y mesas'], ['pos.reports', 'Reportes POS'], ['inventory.edit', 'Cambiar inventario'], ['delete.records', 'Eliminar registros'], ['settings.profile', 'Configuración'], ['users.manage', 'Usuarios']];
  const roles = Object.keys(Cat.ROLES);
  return `<section class="card"><h3>4. Equipo y permisos</h3><p class="desc">Usuarios y roles. Con el inicio de sesión activado cada persona ve y modifica solo lo que su rol permite. Sin él, la lista sirve para asignar meseros y profesionales.</p>
${table(['Nombre', 'Celular', 'Área', 'Rol', 'Estado', 'PIN', ''], db.users.map(u => tr([`<b>${esc([u.name,u.lastName].filter(Boolean).join(' '))}</b>`, esc(u.phone || '—'), esc(u.station || '—'), esc(Cat.ROLES[u.role]), u.active === false ? pill('Inactivo', 'bad') : pill('Activo', 'ok'), (u.role === 'admin' ? (u.email && u.passwordHash ? 'Correo + contraseña' : 'Falta acceso') : (u.pinHash ? 'PIN definido' : 'Sin PIN')), acts('user', u.id)])).join(''))}
<div class="inline-actions">${btn('+ Usuario', 'new', { type: 'user' }, 'primary')}${authOn() ? btn('Desactivar inicio de sesión', 'auth-disable', {}, 'danger') : btn('Activar acceso por correo y PIN', 'auth-enable')}</div>
<div class="notice">${authOn() ? 'Inicio de sesión activo.' : 'Inicio de sesión desactivado: todos usan la aplicación como administrador.'} <b>Limitación:</b> los usuarios y PIN (cifrados con sal) viven en los datos del negocio; sin un backend con autenticación, quien tenga acceso al archivo o al navegador puede saltarse esta protección. Ver RESUMEN_TECNICO.md para la arquitectura de producción.</div>
<h3 style="margin-top:18px">Matriz de permisos por rol</h3><div class="tablewrap"><table><thead><tr><th>Permiso</th>${roles.map(r => `<th>${esc(Cat.ROLES[r])}</th>`).join('')}</tr></thead><tbody>${permRows.map(([k, l]) => `<tr><td>${l}</td>${roles.map(r => `<td>${C.can({ role: r }, k) ? '✓' : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
}
function waSection() {
  const out = db.outbox.filter(m => m.status !== 'Cancelado').slice(-30).reverse(), R = LKAuto.RULES;
  return `<section class="card" id="wa"><h3>Recordatorios y confirmación de citas por WhatsApp</h3><p class="desc">Estado del proveedor: <b>${esc(db.integrations.whatsapp.status)}</b>. ${LKAuto.connected(db) ? '' : 'Sin proveedor conectado, los mensajes se preparan en una cola y puedes enviarlos manualmente uno a uno.'}</p>
<div class="steps"><div><b>Recordatorio 1</b><p>${R.reminder1Hours} horas antes de la cita.</p></div><div><b>Recordatorio 2</b><p>${R.reminder2Hours} horas antes.</p></div><div><b>Liberación del turno</b><p>Si el cliente no confirma en ${R.confirmWaitMinutes} minutos tras un envío, la cita pasa a «Pendiente de reprogramación» y el horario queda libre.</p></div><div><b>Asignación equilibrada</b><p>Al elegir «Asignar automáticamente» en una cita se escoge al profesional con menos citas ese día, respetando la preferencia del cliente si está libre.</p></div></div>
<div class="inline-actions">${btn('Planificar recordatorios', 'wa-plan', {}, 'primary')}${btn('Aplicar regla de liberación', 'wa-release')}</div>
<h3 style="margin-top:16px">Cola de mensajes</h3><div class="tablewrap outbox">${table(['Creado', 'Cliente', 'Tipo', 'Mensaje', 'Estado', ''], out.map(m => tr([fmtStamp(m.createdAt), esc(clientName(m.clientId)), esc(m.kind), `<span class="msg">${esc(m.text)}</span>`, pill(m.status, m.sentAt ? 'ok' : 'wait'), m.sentAt ? '' : `<div class="rowactions">${btn('Enviar manualmente', 'wa-manual', { id: m.id }, 'small')}${btn('Descartar', 'wa-discard', { id: m.id }, 'small danger')}</div>`])).join(''))}</div>
<h3 style="margin-top:16px">Qué falta para el envío automático real</h3><ul>${LKAuto.REQUIREMENTS.map(r => `<li>${esc(r)}</li>`).join('')}</ul><div class="notice warn">LK ONE no guarda tokens de WhatsApp en el navegador ni simula una conexión. Detalle técnico en PENDIENTES.md.</div></section>`;
}
function settingsPage() {
  const rec = recommendedModules(), active = activeModules(), units = db.organizationUnits, P = db.profile;
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('');
  const filesTotal = db.attachments.reduce((s, a) => s + (+a.size || 0), 0);
  $app().innerHTML = head('Administración global', 'Configuración de LK ONE', 'Configura los datos principales de tu organización.') +
    `<section class="card"><h3>1. Perfil y configuración adaptativa del negocio</h3><p class="desc">LK ONE recomienda módulos según la actividad seleccionada. Selecciona cada opción de las listas.</p>
<form data-form="profile" novalidate><div class="formgrid">${fld('Nombre del negocio', 'name', { value: P.name, req: true })}
${sel('Actividad principal', 'activity', Cat.ACTIVITIES.map(x => [x.id, x.label]), (Cat.findActivity(P.activity) || {}).id || P.activity, true)}
${sel('País', 'country', [['', 'Selecciona un país'], ...Cat.COUNTRIES.map(x => [x[0], x[0]])], P.country || '', true)}
${sel('Moneda principal', 'currency', Cat.CURRENCIES.map(([c, n]) => [c, `${c} · ${n}`]), P.currency)}${sel('Idioma preferido', 'language', [['es', 'Español'], ['en', 'English'], ['pt', 'Português'], ['fr', 'Français']], P.language)}
${sel('Zona horaria', 'timezone', [...new Set(['UTC', 'America/Bogota', ...(Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [])])].map(z => [z, z]), P.timezone || 'UTC', true)}
${sel('Formato de fecha', 'dateFormat', [['auto', 'AAAA-MM-DD (predeterminado)'], ['DMY', 'DD/MM/AAAA'], ['MDY', 'MM/DD/AAAA'], ['YMD', 'AAAA-MM-DD']], P.dateFormat || 'auto')}${sel('Formato de hora', 'timeFormat', [['24h', '24 horas'], ['12h', '12 horas (a. m. / p. m.)']], P.timeFormat || '24h')}${sel('Estructura de administración', 'accountMode', [['single', 'Una empresa'], ['group', 'Grupo de empresas'], ['both', 'Ambas modalidades']], P.accountMode || 'both')}${sel('Producto contratado (modo demostración)', 'productMode', [['suite', 'LUKARIS ONE completo + POS'], ['pos', 'Solo LUKARIS POS']], P.productMode || 'suite')}</div><div class="actions"><button type="submit" class="btn primary">Guardar perfil</button></div></form>
<div style="margin-top:16px"><b style="font-size:13px">Logotipo</b><div class="inline-actions">${P.logo ? `<img src="${esc(P.logo)}" alt="Logotipo actual" style="height:44px;border:1px solid var(--line);border-radius:8px;padding:3px">` : '<span class="desc" style="margin:0">Sin logotipo.</span>'}<label class="btn">Subir logotipo<input type="file" hidden accept="image/png,image/jpeg,image/webp" data-logo></label>${P.logo ? btn('Quitar', 'logo-remove', {}, 'danger') : ''}</div></div>
<div style="margin-top:16px"><b style="font-size:13px">Módulos para esta actividad</b><div class="module-grid" style="margin-top:9px">${moduleCatalog.map(([id, l]) => `<label class="module-option"><input type="checkbox" data-module="${id}" ${active.has(id) ? 'checked' : ''}><span>${l}${rec.includes(id) ? ' <span class="pill ok">Recomendado</span>' : ''}</span></label>`).join('')}</div><div class="inline-actions">${btn('Aplicar módulos recomendados', 'apply-recommended')}</div>
${!active.has('pos') && (db.pos.tables.length || db.pos.orders.length || db.pos.menu.length) ? '<div class="notice">LK POS está oculto pero conserva sus datos. Actívalo arriba cuando lo necesites.</div>' : ''}<div class="notice">Ocultar un módulo no borra información: solo lo quita del menú. Cambiar la actividad tampoco elimina datos.</div></div></section>
<section class="card"><h3>2. Personalización visual</h3><p class="desc">Adapta la apariencia de LK ONE a la identidad de tu negocio. Los cambios se guardan en el perfil de esta instalación.</p>
<div class="formgrid">
<label class="field">Modo de interfaz<select data-appearance="mode"><option value="light">Claro</option><option value="dark">Oscuro</option></select></label>
<label class="field">Tema de color<select data-appearance="theme"><option value="emerald">Esmeralda</option><option value="ocean">Azul océano</option><option value="violet">Violeta</option><option value="rose">Rosa</option><option value="slate">Grafito</option><option value="amber">Ámbar</option><option value="indigo">Índigo</option></select></label>
<label class="field">Tipografía<select data-appearance="font"><option value="system">Moderna del sistema</option><option value="inter">Inter</option><option value="serif">Serif elegante</option><option value="mono">Monoespaciada</option></select></label>
<label class="field">Tamaño de texto<select data-appearance="scale"><option value="compact">Compacto</option><option value="normal">Normal</option><option value="large">Grande</option></select></label>
<label class="field">Estilo de bordes<select data-appearance="radius"><option value="sharp">Rectos</option><option value="normal">Redondeados</option><option value="soft">Muy redondeados</option></select></label>
</div><div class="notice">La personalización cambia colores, tipografía, escala de lectura y redondeo de componentes. No modifica los datos del negocio.</div></section>
<section class="card"><h3>3. Empresas y sucursales</h3><p class="desc">La cuenta puede operar una sola empresa o administrar un grupo con varias empresas y sucursales.</p>
${units.map(u => `<div class="unit-row"><div><b>${esc(u.name)}</b><div class="desc" style="margin:2px 0 0">${u.kind === 'branch' ? 'Sucursal de ' + esc(units.find(x => x.id === u.parentId)?.name || 'empresa') : 'Empresa independiente'}</div></div><div class="rowactions">${pill(u.kind === 'branch' ? 'Sucursal' : 'Empresa')}${btn('Editar', 'edit', { type: 'unit', id: u.id }, 'small')}${btn('Eliminar', 'delete', { type: 'unit', id: u.id }, 'small danger')}</div></div>`).join('')}
<div class="inline-actions">${can('settings.profile') ? btn('+ Agregar empresa o sucursal', 'new', { type: 'unit' }) : ''}</div><div class="notice">Las unidades son una estructura de referencia. El aislamiento de datos y los permisos por empresa requieren autenticación (aún no incluida).</div></section>
${can('users.manage') ? teamSection() : ''}
<section class="card"><h3>5. Almacenamiento y respaldo</h3><dl class="kv"><dt>Modo</dt><dd>${Store.mode === 'server' ? 'Servidor local (archivo <b>data/lukaris.json</b>) + copia en el navegador' : 'Solo navegador (abre con <b>npm start</b> para usar el servidor)'}</dd><dt>Revisión</dt><dd>${Store.mode === 'server' ? Store.rev : '—'}</dd><dt>Adjuntos</dt><dd>${db.attachments.length} archivo(s) · ${formatBytes(filesTotal)}</dd><dt>Último respaldo</dt><dd>${lastBackupText()}</dd></dl>
${can('backup') ? `<div class="inline-actions">${btn('↓ Exportar respaldo JSON (con adjuntos)', 'export-backup', {}, 'primary')}<label class="btn">↑ Importar respaldo JSON<input type="file" accept="application/json,.json" hidden data-import></label></div>` : ''}
<div class="inline-actions">${['clients:Clientes', 'appointments:Citas', 'sales:Ventas', 'payments:Pagos', 'products:Productos'].map(x => btn('↓ ' + x.split(':')[1] + ' CSV', 'export-csv', { kind: x.split(':')[0] })).join('')}</div>
<div class="notice">Importar reemplaza los datos actuales tras pedir confirmación. En modo servidor se guardan además 14 copias diarias en <b>data/backups/</b>.</div></section>
${can('backup') ? `<section class="card danger-zone"><h3>Zona de riesgo</h3><p class="desc">Vuelve a los datos de demostración y elimina todos los adjuntos.</p>${btn('Cargar escenario comercial completo', 'load-showcase', {}, 'primary')} ${btn('Restablecer datos básicos', 'reset-data', {}, 'danger')}</section>` : ''}`;
  document.querySelectorAll('[data-appearance]').forEach(el => { el.value = (P.appearance || {})[el.dataset.appearance] || ({theme:"emerald",mode:"light",font:"system",scale:"normal",radius:"normal"})[el.dataset.appearance]; });
}

// ================= Eventos y arranque =================
document.addEventListener('click', e => {
  if (e.target.id === 'back') return closeModal();
  const navBtn = e.target.closest('#nav button'); if (navBtn) { closeModal(); return go(navBtn.dataset.page); }
  const lm = e.target.closest('[data-login-mode]'); if (lm) { const mode = lm.dataset.loginMode; document.querySelectorAll('[data-login-mode]').forEach(b => b.classList.toggle('on', b === lm)); document.querySelectorAll('#lbody form[data-form=login]').forEach(f => f.hidden = f.dataset.mode !== mode); return; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACTIONS[el.dataset.act]; if (!fn) return;
  const need = ACTION_PERM[el.dataset.act]; if (need && !can(need)) { e.preventDefault(); return deny(need); }
  if (el.tagName === 'A') e.preventDefault();
  Promise.resolve(fn(el.dataset, el)).catch(err => { console.error(err); toast('Ocurrió un error: ' + err.message, 'err'); });
});
document.addEventListener('submit', e => { const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault(); handleForm(f).catch(err => { console.error(err); toast('Ocurrió un error: ' + err.message, 'err'); f.querySelector('[type=submit]')?.removeAttribute('disabled'); }); });
document.addEventListener('input', e => {
  const f = e.target.closest('[data-filter]'); if (f) applyFilters(f.closest('section') || document);
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.matches('[data-appearance]')) { db.profile.appearance = { ...(db.profile.appearance || {}), [t.dataset.appearance]: t.value }; save(); applyAppearance(); toast('Apariencia actualizada.'); return; }
  if (t.matches('[data-filter]')) return applyFilters(t.closest('section') || document);
  if (t.matches('[data-module]')) return toggleModule(t.dataset.module, t.checked);
  if (t.matches('[data-import]')) return importBackup(t);
  if (t.matches('[data-logo]')) return uploadLogo(t);
  if (t.matches('select[name=country]') && t.closest('form[data-form=profile]')) { const c = Cat.findCountry(t.value), f = t.closest('form'); if (c) { f.elements.currency.value = c[2]; f.elements.timezone.value = c[3]; toast(`Moneda (${c[2]}) y zona horaria (${c[3]}) sugeridas para ${c[0]}. Puedes cambiarlas.`); } return; }
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
async function boot() {
  await Store.init();
  $('#sidefoot').textContent = 'Versión ' + C.APP_VERSION + (Store.mode === 'server' ? ' · Servidor local' : ' · Modo local');
  page = pageVisible('home') || !authOn() ? 'home' : firstPage(); render();
  try { navigator.storage?.persist?.(); } catch (e) {}
  window.addEventListener('pagehide', () => Store.flush());
  window.addEventListener('online', () => Store.pending && Store.schedule(0));
  setInterval(() => { if (page === 'pos' && document.visibilityState === 'visible') Store.pull(); }, 6000);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
