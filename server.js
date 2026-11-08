// Düşen Ahbaplar - online oda sunucusu (bağımlılık yok, sadece Node.js)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const INDEX = path.join(__dirname, 'index.html');
const rooms = new Map(); // oda adı -> Map(id -> { p: presence, res: SSE bağlantısı })

function room(name) {
  let r = rooms.get(name);
  if (!r) { r = new Map(); rooms.set(name, r); }
  return r;
}

function send(res, obj) {
  try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (e) {}
}

function broadcast(name, exceptId, obj) {
  const r = rooms.get(name);
  if (!r) return;
  for (const [id, c] of r) if (id !== exceptId && c.res) send(c.res, obj);
}

function drop(name, id) {
  const r = rooms.get(name);
  if (!r || !r.has(id)) return;
  const c = r.get(id);
  r.delete(id);
  try { c.res && c.res.end(); } catch (e) {}
  broadcast(name, id, { t: 'l', id });
  if (r.size === 0) rooms.delete(name);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const name = (url.searchParams.get('room') || '').slice(0, 40);
  const id = (url.searchParams.get('id') || '').slice(0, 40);

  if (url.pathname === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('dp');
  }

  if (url.pathname === '/sse' && name && id) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    const r = room(name);
    const snap = {};
    for (const [k, c] of r) snap[k] = c.p;
    r.set(id, { p: {}, res });
    send(res, { t: 'snap', p: snap });
    const ka = setInterval(() => { try { res.write(': k\n\n'); } catch (e) {} }, 15000);
    req.on('close', () => { clearInterval(ka); const rr = rooms.get(name); if (rr && rr.get(id) && rr.get(id).res === res) drop(name, id); });
    return;
  }

  if (url.pathname === '/msg' && req.method === 'POST' && name && id) {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 65536) req.destroy(); });
    req.on('end', () => {
      try {
        const p = JSON.parse(body || '{}');
        const r = room(name);
        const c = r.get(id);
        if (c) c.p = p; else r.set(id, { p, res: null });
        broadcast(name, id, { t: 'p', id, p });
      } catch (e) {}
      res.writeHead(204); res.end();
    });
    return;
  }

  if (url.pathname === '/leave' && name && id) {
    drop(name, id);
    res.writeHead(204); return res.end();
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    fs.readFile(INDEX, (err, data) => {
      if (err) { res.writeHead(500); return res.end('index.html bulunamadi'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  res.writeHead(404); res.end('yok');
});

server.listen(PORT, () => console.log('Dusen Ahbaplar sunucusu calisiyor, port ' + PORT));
