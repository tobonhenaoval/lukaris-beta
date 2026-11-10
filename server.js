#!/usr/bin/env node
'use strict';
/* Backend local de LUKARIS (sin dependencias).
   - GET/PUT /api/db        datos del negocio (JSON, escritura atómica, control de revisión)
   - POST/GET/DELETE /api/files/:id   adjuntos de clientes y citas
   - Sirve index.html, app.js, core.js y styles.css
   Uso: node server.js   (PORT=3000, DATA_DIR=./data, HOST=127.0.0.1) */
const http = require('http'), fs = require('fs'), path = require('path');
const Core = require('./core.js');

const STATIC = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/core.js': 'core.js', '/styles.css': 'styles.css' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const INLINE_OK = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/plain)$/;
const MAX_DB = 25 * 1024 * 1024;
const CSP = "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function createServer({ dataDir = path.join(__dirname, 'data'), host = '127.0.0.1' } = {}) {
  const uploads = path.join(dataDir, 'uploads'), backups = path.join(dataDir, 'backups'), dbFile = path.join(dataDir, 'lukaris.json');
  fs.mkdirSync(uploads, { recursive: true }); fs.mkdirSync(backups, { recursive: true });

  const atomicWrite = (file, content) => { const tmp = file + '.tmp-' + process.pid; fs.writeFileSync(tmp, content); fs.renameSync(tmp, file); };
  let state = { rev: 0, savedAt: null, data: null };
  if (fs.existsSync(dbFile)) { try { state = JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch (e) { fs.copyFileSync(dbFile, dbFile + '.corrupt-' + Date.now()); } }

  function dailyBackup() {
    if (!fs.existsSync(dbFile)) return;
    const f = path.join(backups, 'lukaris-' + Core.today() + '.json');
    if (!fs.existsSync(f)) fs.copyFileSync(dbFile, f);
    const all = fs.readdirSync(backups).filter(n => /^lukaris-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
    for (const old of all.slice(0, Math.max(0, all.length - 14))) fs.unlinkSync(path.join(backups, old));
  }

  const send = (res, status, body, headers = {}) => {
    const isJson = typeof body === 'object' && !Buffer.isBuffer(body);
    res.writeHead(status, { 'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
    res.end(isJson ? JSON.stringify(body) : body);
  };
  const readBody = (req, limit) => new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n <= limit) chunks.push(c); }); // si se excede, se descarta y se responde 413 al terminar
    req.on('end', () => n > limit ? reject(new HttpError(413, 'El contenido supera el tamaño permitido.')) : resolve(Buffer.concat(chunks))); req.on('error', reject);
  });
  const fileId = s => { if (!/^\d{1,16}$/.test(s || '')) throw new HttpError(400, 'Identificador de archivo inválido.'); return s; };

  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
  function guard(req) {
    const h = req.headers.host || '';
    if ((host === '127.0.0.1' || host === 'localhost') && !localHost.test(h)) throw new HttpError(403, 'Host no permitido.');
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin) {
      let o; try { o = new URL(req.headers.origin).host; } catch (e) { throw new HttpError(403, 'Origen inválido.'); }
      if (o !== h) throw new HttpError(403, 'Origen no permitido.');
    }
  }

  async function api(req, res, url) {
    const p = url.pathname;
    if (p === '/api/health' && req.method === 'GET') return send(res, 200, { ok: true, version: Core.APP_VERSION, rev: state.rev, hasData: !!state.data });
    if (p === '/api/db') {
      if (req.method === 'GET') return send(res, 200, { rev: state.rev, savedAt: state.savedAt, data: state.data });
      if (req.method === 'PUT') {
        let body; try { body = JSON.parse((await readBody(req, MAX_DB)).toString('utf8')); } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, 'JSON inválido.'); }
        if (!body || !Core.isObj(body.data) || !Array.isArray(body.data.clients) || !Core.isObj(body.data.profile)) throw new HttpError(400, 'Los datos no tienen la estructura de LUKARIS.');
        if (+body.data.meta?.schemaVersion > Core.SCHEMA_VERSION) throw new HttpError(400, 'Los datos son de una versión más nueva de LUKARIS.');
        if (!body.force && body.baseRev !== state.rev) return send(res, 409, { error: 'conflict', rev: state.rev, savedAt: state.savedAt, data: state.data });
        dailyBackup();
        state = { rev: state.rev + 1, savedAt: new Date().toISOString(), data: body.data };
        atomicWrite(dbFile, JSON.stringify(state));
        return send(res, 200, { rev: state.rev, savedAt: state.savedAt });
      }
    }
    const m = /^\/api\/files\/([^/]+)$/.exec(p);
    if (p === '/api/files' && req.method === 'POST') {
      const id = fileId(req.headers['x-file-id']);
      let name = ''; try { name = decodeURIComponent(req.headers['x-file-name'] || ''); } catch (e) { throw new HttpError(400, 'Nombre inválido.'); }
      name = path.basename(name).replace(/[\u0000-\u001f]/g, '').slice(0, 160);
      const buf = await readBody(req, Core.MAX_FILE_BYTES);
      const err = Core.validateFile({ name, size: buf.length }); if (err) throw new HttpError(400, err);
      const type = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim().toLowerCase();
      atomicWrite(path.join(uploads, id), buf); atomicWrite(path.join(uploads, id + '.meta.json'), JSON.stringify({ name, type, size: buf.length }));
      return send(res, 201, { id: +id, name, size: buf.length });
    }
    if (m) {
      const id = fileId(m[1]), f = path.join(uploads, id), meta = path.join(uploads, id + '.meta.json');
      if (req.method === 'GET') {
        if (!fs.existsSync(f) || !fs.existsSync(meta)) throw new HttpError(404, 'Archivo no encontrado.');
        const info = JSON.parse(fs.readFileSync(meta, 'utf8')), inline = INLINE_OK.test(info.type) && url.searchParams.get('download') !== '1';
        res.writeHead(200, { 'Content-Type': inline ? info.type : 'application/octet-stream', 'Content-Length': info.size, 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(info.name)}`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': 'sandbox', 'Cache-Control': 'private, max-age=0' });
        return fs.createReadStream(f).pipe(res);
      }
      if (req.method === 'DELETE') { for (const x of [f, meta]) if (fs.existsSync(x)) fs.unlinkSync(x); return send(res, 200, { ok: true }); }
    }
    throw new HttpError(404, 'Ruta no encontrada.');
  }

  const server = http.createServer(async (req, res) => {
    try {
      guard(req);
      const url = new URL(req.url, 'http://x');
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      const rel = STATIC[url.pathname];
      if (!rel || (req.method !== 'GET' && req.method !== 'HEAD')) throw new HttpError(404, 'No encontrado.');
      const body = fs.readFileSync(path.join(__dirname, rel));
      res.writeHead(200, { 'Content-Type': MIME[path.extname(rel)], 'Cache-Control': 'no-cache', 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (e) {
      if (res.headersSent) return res.destroy();
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e); send(res, 500, { error: 'Error interno del servidor.' });
    }
  });
  return {
    server, dataDir,
    listen: (port = 0) => new Promise(r => server.listen(port, host, () => r(server.address().port))),
    close: () => new Promise(r => { server.close(() => r()); server.closeAllConnections?.(); })
  };
}

module.exports = { createServer };

if (require.main === module) {
  const port = +process.env.PORT || 3000, host = process.env.HOST || '127.0.0.1';
  const app = createServer({ dataDir: process.env.DATA_DIR || path.join(__dirname, 'data'), host });
  app.listen(port).then(p => console.log(`LUKARIS ${Core.APP_VERSION} → http://${host === '0.0.0.0' ? 'localhost' : host}:${p}\nDatos en: ${app.dataDir}`));
}
