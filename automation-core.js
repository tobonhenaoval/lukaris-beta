'use strict';
/* LK ONE · lógica de automatización de citas y WhatsApp (sin DOM, sin red).
   IMPORTANTE: este módulo NO envía mensajes. Planifica qué mensajes corresponden y los deja en una cola (`db.outbox`)
   con estado «Pendiente de envío». El envío real exige conectar un proveedor (WhatsApp Business Cloud API u otro),
   lo que requiere credenciales y un servidor con acceso a Internet. Ver PENDIENTES.md. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.LKAuto = factory(root.LukarisCore);
})(typeof self !== 'undefined' ? self : globalThis, function (C) {

const RULES = { reminder1Hours: 24, reminder2Hours: 4, confirmWaitMinutes: 30 };
const apptStart = a => new Date(a.date + 'T' + a.time + ':00'); // hora local del servidor/navegador
const connected = db => db.integrations.whatsapp.status === 'Conectado' && db.integrations.whatsapp.provider !== 'none';
const queueHas = (db, apptId, kind) => db.outbox.some(m => m.appointmentId === apptId && m.kind === kind && m.status !== 'Cancelado');

function messageFor(db, a, kind) {
  const c = db.clients.find(x => x.id === a.clientId) || { name: '' }, s = db.services.find(x => x.id === a.serviceId) || { name: 'tu cita' };
  const when = `${a.date} a las ${a.time}`;
  const t = { reminder1: `Hola ${c.name}, te recordamos tu cita de ${s.name} el ${when} en ${db.profile.name}. Responde 1 para confirmar, 2 para reprogramar o 3 para cancelar.`,
    reminder2: `Hola ${c.name}, tu cita de ${s.name} es hoy a las ${a.time} en ${db.profile.name}. Responde 1 para confirmar. Si no confirmas, el turno podrá liberarse.`,
    released: `Hola ${c.name}, no recibimos confirmación y liberamos tu turno del ${when}. Responde para elegir un nuevo horario.` };
  return t[kind];
}
const enqueue = (db, a, kind, now) => { const m = { id: C.nextId(db), appointmentId: a.id, clientId: a.clientId, channel: 'whatsapp', kind, text: messageFor(db, a, kind), status: 'Pendiente de envío', createdAt: now.toISOString(), sentAt: null }; db.outbox.push(m); return m; };

/* Planifica recordatorios: 24 h y 4 h antes de cada cita Confirmada/Pendiente futura. Idempotente. */
function planReminders(db, now = new Date()) {
  const made = [];
  for (const a of db.appointments) {
    if (!['Confirmada', 'Pendiente'].includes(a.status)) continue;
    const h = (apptStart(a) - now) / 36e5; if (h <= 0) continue;
    if (h <= RULES.reminder1Hours && h > RULES.reminder2Hours && !queueHas(db, a.id, 'reminder1')) made.push(enqueue(db, a, 'reminder1', now));
    if (h <= RULES.reminder2Hours && !queueHas(db, a.id, 'reminder2')) made.push(enqueue(db, a, 'reminder2', now));
  }
  return made;
}

/* Libera turnos sin confirmación: solo aplica a citas cuyo mensaje de recordatorio ya fue ENVIADO de verdad (sentAt)
   y que llevan 30 min o más sin respuesta. Sin proveedor conectado nunca hay mensajes enviados, por lo que no libera nada. */
function releaseUnconfirmed(db, now = new Date()) {
  const released = [];
  for (const a of db.appointments) {
    if (a.status !== 'Pendiente' || a.confirmedAt) continue;
    const sent = db.outbox.filter(m => m.appointmentId === a.id && m.sentAt && (m.kind === 'reminder1' || m.kind === 'reminder2' || m.kind === 'confirm-request')).sort((x, y) => y.sentAt.localeCompare(x.sentAt))[0];
    if (!sent || (now - new Date(sent.sentAt)) / 60000 < RULES.confirmWaitMinutes) continue;
    a.status = 'Pendiente de reprogramación'; a.releasedAt = now.toISOString(); released.push(a);
    if (!queueHas(db, a.id, 'released')) enqueue(db, a, 'released', now);
  }
  return released;
}

/* Procesa una respuesta del cliente: 1 confirmar, 2 reprogramar, 3 cancelar. Para usarse desde un webhook futuro. */
function handleReply(db, apptId, reply, now = new Date()) {
  const a = db.appointments.find(x => x.id === apptId); if (!a) return { ok: false, error: 'La cita no existe.' };
  const r = String(reply).trim();
  if (r === '1') { a.status = 'Confirmada'; a.confirmedAt = now.toISOString(); return { ok: true, status: a.status }; }
  if (r === '2') { a.status = 'Pendiente de reprogramación'; return { ok: true, status: a.status }; }
  if (r === '3') { a.status = 'Cancelada'; return { ok: true, status: a.status }; }
  return { ok: false, error: 'Respuesta no reconocida (usa 1, 2 o 3).' };
}

/* Asignación equilibrada: elige al profesional activo (rol empleado/gerente) con menos citas ese día, sin choques.
   Si el cliente prefiere a alguien y está libre, se respeta la preferencia. */
function pickWorker(db, { date, time, serviceId, preferredId = null }, ignoreId = null) {
  const workers = db.users.filter(u => u.active !== false && ['employee', 'manager'].includes(u.role));
  if (!workers.length) return null;
  const free = workers.filter(w => !C.appointmentConflicts(db, { date, time, serviceId, workerId: w.id }, ignoreId).some(x => x.workerId === w.id));
  if (!free.length) return null;
  if (preferredId && free.some(w => w.id === +preferredId)) return +preferredId;
  const load = w => db.appointments.filter(a => a.workerId === w.id && a.date === date && a.status !== 'Cancelada' && a.id !== ignoreId).length;
  return free.slice().sort((a, b) => load(a) - load(b) || a.id - b.id)[0].id;
}

/* Disponibilidad: franjas libres de 30 min entre open y close para un servicio, opcionalmente por profesional. */
function availability(db, { date, serviceId, workerId = null, open = '08:00', close = '18:00', step = 30 }) {
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; }, slots = [];
  const dur = +(db.services.find(s => s.id === +serviceId) || {}).duration || 30;
  for (let m = toMin(open); m + dur <= toMin(close); m += step) {
    const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const busy = C.appointmentConflicts(db, { date, time: t, serviceId, workerId: workerId || undefined });
    const hasWorkers = db.users.some(u => u.active !== false && ['employee', 'manager'].includes(u.role));
    if (workerId ? !busy.length : (!hasWorkers ? !busy.length : pickWorker(db, { date, time: t, serviceId }) !== null)) slots.push(t);
  }
  return slots;
}

const REQUIREMENTS = ['Cuenta de WhatsApp Business verificada (Meta Business Manager).', 'Número de teléfono dedicado y su Phone Number ID.', 'Token de acceso permanente de la API de WhatsApp Business Cloud (guardado en el servidor, nunca en el navegador).', 'Plantillas de mensaje aprobadas por Meta para recordatorios y confirmaciones.', 'Un servidor con HTTPS público que reciba el webhook de respuestas de los clientes.', 'Un programador (cron) en el servidor que ejecute planReminders/releaseUnconfirmed cada pocos minutos.'];

return { RULES, planReminders, releaseUnconfirmed, handleReply, pickWorker, availability, connected, messageFor, REQUIREMENTS };
});
