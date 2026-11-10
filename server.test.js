const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { createServer } = require('../server.js'), C = require('../core.js');

async function boot(dir) { const app = createServer({ dataDir: dir || fs.mkdtempSync(path.join(os.tmpdir(), 'lk-')) }); const port = await app.listen(0); return { app, port, base: 'http://127.0.0.1:' + port }; }
const put = (base, body) => fetch(base + '/api/db', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const upload = (base, id, name, bytes, type = 'application/pdf') => fetch(base + '/api/files', { method: 'POST', headers: { 'x-file-id': String(id), 'x-file-name': encodeURIComponent(name), 'Content-Type': type }, body: bytes });
// fetch no permite fijar Host/Origin arbitrarios: usamos http.request
const raw = (port, opts) => new Promise((res, rej) => { const r = http.request({ host: '127.0.0.1', port, ...opts }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res({ status: x.statusCode, body: b, headers: x.headers })); }); r.on('error', rej); r.end(opts.body); });

test('sirve la app con CSP y solo los archivos permitidos', async () => {
  const { app, base } = await boot();
  const r = await fetch(base + '/'); assert.strictEqual(r.status, 200); assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  for (const f of ['/app.js', '/core.js', '/styles.css']) assert.strictEqual((await fetch(base + f)).status, 200, f);
  for (const f of ['/server.js', '/package.json', '/data/lukaris.json', '/../server.js', '/.git/config']) assert.strictEqual((await fetch(base + f)).status, 404, f);
  await app.close();
});
test('GET /api/db vacío → guardar → leer → revisión incrementa', async () => {
  const { app, base } = await boot();
  let j = await (await fetch(base + '/api/db')).json(); assert.strictEqual(j.data, null); assert.strictEqual(j.rev, 0);
  const db = C.defaultDb(); const r = await put(base, { baseRev: 0, data: db }); assert.strictEqual(r.status, 200); assert.strictEqual((await r.json()).rev, 1);
  j = await (await fetch(base + '/api/db')).json(); assert.strictEqual(j.rev, 1); assert.strictEqual(j.data.clients.length, 2);
  await app.close();
});
test('los datos sobreviven a un reinicio del servidor', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lk-')); let s = await boot(dir);
  const db = C.defaultDb(); db.clients.push({ id: 50, name: 'Persistente', phone: '12345' }); await put(s.base, { baseRev: 0, data: db }); await s.app.close();
  s = await boot(dir); const j = await (await fetch(s.base + '/api/db')).json(); assert.strictEqual(j.rev, 1); assert.ok(j.data.clients.some(c => c.name === 'Persistente')); await s.app.close();
});
test('conflicto de revisión devuelve 409 con los datos vigentes; force lo sobrescribe', async () => {
  const { app, base } = await boot(); const db = C.defaultDb();
  await put(base, { baseRev: 0, data: db });
  const stale = await put(base, { baseRev: 0, data: db }); assert.strictEqual(stale.status, 409); const j = await stale.json(); assert.strictEqual(j.rev, 1); assert.ok(j.data);
  assert.strictEqual((await put(base, { baseRev: 0, force: true, data: db })).status, 200); await app.close();
});
test('rechaza JSON inválido, estructura ajena y esquema más nuevo; el archivo no se corrompe', async () => {
  const { app, base } = await boot(); const db = C.defaultDb(); await put(base, { baseRev: 0, data: db });
  assert.strictEqual((await fetch(base + '/api/db', { method: 'PUT', body: '{no json' })).status, 400);
  assert.strictEqual((await put(base, { baseRev: 1, data: { hola: 1 } })).status, 400);
  assert.strictEqual((await put(base, { baseRev: 1, data: { ...db, meta: { schemaVersion: 99 } } })).status, 400);
  assert.strictEqual((await (await fetch(base + '/api/db')).json()).rev, 1); await app.close();
});
test('copia de respaldo diaria al guardar', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lk-')); const { app, base } = await boot(dir); const db = C.defaultDb();
  await put(base, { baseRev: 0, data: db }); await put(base, { baseRev: 1, data: db });
  assert.ok(fs.readdirSync(path.join(dir, 'backups')).some(n => /^lukaris-\d{4}-\d{2}-\d{2}\.json$/.test(n))); await app.close();
});
test('adjuntos: subir, descargar, tipos seguros, borrar', async () => {
  const { app, base } = await boot(); const bytes = Buffer.from('%PDF-1.4 contenido');
  let r = await upload(base, 1234, 'récipe médica.pdf', bytes); assert.strictEqual(r.status, 201);
  r = await fetch(base + '/api/files/1234'); assert.strictEqual(r.status, 200); assert.strictEqual(r.headers.get('content-type'), 'application/pdf');
  assert.match(r.headers.get('content-disposition'), /^inline; filename\*=UTF-8''r%C3%A9cipe/); assert.strictEqual(r.headers.get('content-security-policy'), 'sandbox'); assert.ok(Buffer.from(await r.arrayBuffer()).equals(bytes));
  await upload(base, 5, 'datos.xlsx', Buffer.from('x'), 'text/html'); r = await fetch(base + '/api/files/5');
  assert.strictEqual(r.headers.get('content-type'), 'application/octet-stream', 'html declarado nunca se sirve como html'); assert.match(r.headers.get('content-disposition'), /^attachment/);
  r = await fetch(base + '/api/files/1234?download=1'); assert.match(r.headers.get('content-disposition'), /^attachment/);
  assert.strictEqual((await fetch(base + '/api/files/1234', { method: 'DELETE' })).status, 200); assert.strictEqual((await fetch(base + '/api/files/1234')).status, 404); await app.close();
});
test('adjuntos: rechaza extensión peligrosa, vacío, demasiado grande, id y nombre maliciosos', async () => {
  const { app, base } = await boot(); const dir = app.dataDir;
  assert.strictEqual((await upload(base, 1, 'virus.exe', Buffer.from('MZ'))).status, 400);
  assert.strictEqual((await upload(base, 2, 'página.html', Buffer.from('<script>'))).status, 400);
  assert.strictEqual((await upload(base, 3, 'vacio.pdf', Buffer.alloc(0))).status, 400);
  assert.strictEqual((await upload(base, 4, 'grande.pdf', Buffer.alloc(C.MAX_FILE_BYTES + 10))).status, 413);
  assert.strictEqual((await upload(base, '../../etc', 'a.pdf', Buffer.from('x'))).status, 400);
  assert.strictEqual((await fetch(base + '/api/files/..%2F..%2Fserver.js')).status, 400);
  assert.strictEqual((await upload(base, 7, '../../../evil.pdf', Buffer.from('x'))).status, 201);
  assert.ok(fs.existsSync(path.join(dir, 'uploads', '7.meta.json')) && !fs.existsSync(path.join(dir, '..', 'evil.pdf')));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'uploads', '7.meta.json'))).name, 'evil.pdf'); await app.close();
});
test('protección: Host ajeno (DNS rebinding) y Origin cruzado se bloquean', async () => {
  const { app, port } = await boot();
  assert.strictEqual((await raw(port, { path: '/api/health', headers: { Host: 'evil.example.com' } })).status, 403);
  const body = JSON.stringify({ baseRev: 0, data: C.defaultDb() });
  assert.strictEqual((await raw(port, { method: 'PUT', path: '/api/db', body, headers: { Origin: 'http://evil.example.com', 'Content-Type': 'application/json' } })).status, 403);
  assert.strictEqual((await raw(port, { method: 'PUT', path: '/api/db', body, headers: { Origin: 'http://127.0.0.1:' + port, 'Content-Type': 'application/json' } })).status, 200); await app.close();
});
