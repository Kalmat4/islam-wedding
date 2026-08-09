/*
  Мини-сервер для анкеты (RSVP).
  Запуск:  node rsvp-server.js
  Открыть: http://localhost:8787/index.html      — сама страница приглашения
           http://localhost:8787/rsvp-admin.html — таблица с ответами

  Ответы сохраняются в rsvp-data.json рядом с этим файлом.
  Зависимостей нет — только встроенные модули Node.js.
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'rsvp-data.json');
const PORT = process.env.PORT || 8787;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml'
};

function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function writeData(list) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function serveFile(req, res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const range = req.headers.range;

    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
      if (isNaN(start) || isNaN(end) || start > end || end >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes'
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/rsvp' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(body); }
      catch { return sendJson(res, 400, { error: 'bad json' }); }

      const name = String(payload.name || '').trim().slice(0, 200);
      const answer = String(payload.answer || '').trim().slice(0, 200);
      const company = payload.company ? String(payload.company).trim().slice(0, 200) : null;
      if (!name || !answer) return sendJson(res, 400, { error: 'name and answer are required' });

      const entry = {
        id: crypto.randomUUID(),
        name,
        answer,
        company,
        createdAt: new Date().toISOString()
      };
      const list = readData();
      list.push(entry);
      writeData(list);
      sendJson(res, 200, { ok: true, entry });
    });
    return;
  }

  if (url.pathname === '/api/rsvp' && req.method === 'GET') {
    return sendJson(res, 200, readData());
  }

  if (url.pathname === '/api/rsvp' && req.method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!id) return sendJson(res, 400, { error: 'id is required' });
    const list = readData();
    const next = list.filter(entry => entry.id !== id);
    writeData(next);
    return sendJson(res, 200, { ok: true, removed: list.length - next.length });
  }

  if (req.method === 'GET') {
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filePath = path.join(ROOT, rel);
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
    return serveFile(req, res, filePath);
  }

  res.writeHead(405);
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`RSVP-сервер запущен: http://localhost:${PORT}/index.html`);
  console.log(`Таблица ответов:     http://localhost:${PORT}/rsvp-admin.html`);
});
