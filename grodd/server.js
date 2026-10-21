'use strict';
// Grodd 🌱 – zero-dependency Node server (node:http + node:fs + global fetch).
// Binds to 127.0.0.1 only. Run:  node grodd/server.js   (or ANTHROPIC_API_KEY=… node grodd/server.js)
const http = require('node:http');
const fs = require('node:fs');
const agent = require('./lib/agent');
const queue = require('./lib/queue');

const HOST = '127.0.0.1';
const PORT = Number(process.env.GRODD_PORT) || 8787;
const MAX_BODY = 64 * 1024;
// Resolved lazily: the server must not crash if public/ is missing (it is created by the frontend).
let PUBLIC_DIR = null;
function publicDir() {
  if (PUBLIC_DIR) return PUBLIC_DIR;
  try { PUBLIC_DIR = fs.realpathSync(__dirname + '/public'); } catch { PUBLIC_DIR = null; }
  return PUBLIC_DIR;
}
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`]);
const ALLOWED_ORIGINS = new Set([...ALLOWED_HOSTS].map((h) => `http://${h}`));

const MIME = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  ico: 'image/x-icon', webp: 'image/webp', json: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8',
  webmanifest: 'application/manifest+json', woff2: 'font/woff2',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

// ------------------------------------------------------------------ helpers
class HttpError extends Error {
  constructor(status, code, extraHeaders) { super(code); this.status = status; this.code = code; this.extraHeaders = extraHeaders; }
}

function send(res, status, body, headers = {}) {
  if (res.headersSent) return;
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': payload.length, 'Cache-Control': 'no-store', ...headers });
  res.end(res.req.method === 'HEAD' ? undefined : payload);
}

function readJson(req, { optional = false } = {}) {
  return new Promise((resolve, reject) => {
    const len = Number(req.headers['content-length'] || 0);
    if (len > MAX_BODY) return reject(new HttpError(413, 'payload_too_large'));
    const chunks = [];
    let size = 0, done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > MAX_BODY) { done = true; reject(new HttpError(413, 'payload_too_large')); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return optional ? resolve({}) : reject(new HttpError(400, 'body_required'));
      const ct = String(req.headers['content-type'] || '').toLowerCase();
      if (!ct.startsWith('application/json')) return reject(new HttpError(415, 'content_type_must_be_application_json'));
      let data;
      try { data = JSON.parse(raw); } catch { return reject(new HttpError(400, 'invalid_json')); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return reject(new HttpError(400, 'body_must_be_a_json_object'));
      resolve(data);
    });
    req.on('error', () => { if (!done) { done = true; reject(new HttpError(400, 'bad_request')); } });
  });
}

// Simple fixed-window rate limiter per client address.
const buckets = new Map();
function rateLimit(req, key, limit, windowMs = 60_000) {
  const id = `${key}:${req.socket.remoteAddress}`;
  const now = Date.now();
  let b = buckets.get(id);
  if (!b || now - b.start > windowMs) { b = { start: now, count: 0 }; buckets.set(id, b); }
  if (++b.count > limit) throw new HttpError(429, 'rate_limited', { 'Retry-After': String(Math.ceil((b.start + windowMs - now) / 1000)) });
  if (buckets.size > 5000) buckets.clear();
}

let liveInFlight = 0;

// ------------------------------------------------------------------ validation
function validateChat(body) {
  const { message, history, lang } = body;
  if (typeof message !== 'string' || !message.trim()) throw new HttpError(400, 'message must be a non-empty string');
  if (message.length > 4000) throw new HttpError(400, 'message too long (max 4000 characters)');
  if (lang !== undefined && lang !== null && lang !== 'sv' && lang !== 'en') throw new HttpError(400, "lang must be 'sv' or 'en'");
  let hist = [];
  if (history !== undefined && history !== null) {
    if (!Array.isArray(history)) throw new HttpError(400, 'history must be an array');
    if (history.length > 30) throw new HttpError(400, 'history too long (max 30 items)');
    hist = history.map((h, i) => {
      if (!h || typeof h !== 'object' || (h.role !== 'user' && h.role !== 'assistant') || typeof h.content !== 'string')
        throw new HttpError(400, `history[${i}] must be {role:'user'|'assistant', content:string}`);
      if (h.content.length > 8000) throw new HttpError(400, `history[${i}].content too long (max 8000 characters)`);
      return { role: h.role, content: h.content };
    });
  }
  return { message: message.trim(), history: hist, lang: lang || undefined };
}

// ------------------------------------------------------------------ routes
async function handleApi(req, res, pathname) {
  const m = req.method;
  if (pathname === '/api/health') {
    if (m !== 'GET' && m !== 'HEAD') throw new HttpError(405, 'method_not_allowed', { Allow: 'GET, HEAD' });
    return send(res, 200, { ok: true, mode: agent.MODE, models: { router: agent.MODELS.router, worker: agent.MODELS.worker } });
  }
  if (pathname === '/api/chat') {
    if (m !== 'POST') throw new HttpError(405, 'method_not_allowed', { Allow: 'POST' });
    rateLimit(req, 'chat', 30);
    const input = validateChat(await readJson(req));
    if (agent.MODE === 'live' && liveInFlight >= 4) throw new HttpError(503, 'busy_try_again');
    liveInFlight++;
    try { return send(res, 200, await agent.handleChat(input)); }
    finally { liveInFlight--; }
  }
  if (pathname === '/api/member-check') {
    if (m !== 'POST') throw new HttpError(405, 'method_not_allowed', { Allow: 'POST' });
    rateLimit(req, 'member', 30);
    const body = await readJson(req, { optional: true });
    if (body.lang !== undefined && body.lang !== null && body.lang !== 'sv' && body.lang !== 'en') throw new HttpError(400, "lang must be 'sv' or 'en'");
    if (body.event_name !== undefined && body.event_name !== null && (typeof body.event_name !== 'string' || body.event_name.length > 120))
      throw new HttpError(400, 'event_name must be a string (max 120 characters)');
    return send(res, 200, agent.memberCheck({ lang: body.lang || 'sv', event_name: body.event_name || undefined }));
  }
  if (pathname === '/api/approvals') {
    if (m !== 'GET' && m !== 'HEAD') throw new HttpError(405, 'method_not_allowed', { Allow: 'GET, HEAD' });
    return send(res, 200, { items: queue.list() });
  }
  const am = pathname.match(/^\/api\/approvals\/([^/]+)\/(approve|reject)$/);
  if (am) {
    if (m !== 'POST') throw new HttpError(405, 'method_not_allowed', { Allow: 'POST' });
    rateLimit(req, 'decide', 120);
    await readJson(req, { optional: true }); // drain/validate any body
    const id = am[1];
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, 'not_found');
    const r = queue.decide(id, am[2]);
    if (!r.ok) throw new HttpError(r.status, r.error);
    return send(res, 200, { ok: true, item: r.item });
  }
  if (pathname === '/api/reset') {
    if (m !== 'POST') throw new HttpError(405, 'method_not_allowed', { Allow: 'POST' });
    rateLimit(req, 'reset', 20);
    await readJson(req, { optional: true });
    queue.clear();
    return send(res, 200, { ok: true });
  }
  throw new HttpError(404, 'not_found');
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method_not_allowed', { Allow: 'GET, HEAD' });
  let name;
  try { name = decodeURIComponent(pathname === '/' ? '/index.html' : pathname).slice(1); } catch { throw new HttpError(400, 'bad_path'); }
  // single path segment, no dotfiles, no traversal, known extension only
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)*\.[A-Za-z0-9]{1,12}$/.test(name)) throw new HttpError(404, 'not_found');
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (!MIME[ext]) throw new HttpError(404, 'not_found');
  const root = publicDir();
  if (!root) throw new HttpError(404, 'not_found');
  let file;
  try { file = fs.realpathSync(root + '/' + name); } catch { throw new HttpError(404, 'not_found'); }
  if (!file.startsWith(root + '/')) throw new HttpError(404, 'not_found');
  let stat;
  try { stat = fs.statSync(file); } catch { throw new HttpError(404, 'not_found'); }
  if (!stat.isFile()) throw new HttpError(404, 'not_found');
  const data = fs.readFileSync(file);
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME[ext], 'Content-Length': data.length, 'Cache-Control': 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : data);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let pathname = '/';
  res.on('finish', () => console.log(`${req.method} ${pathname.slice(0, 120)} ${res.statusCode} ${Date.now() - started}ms`));
  try {
    // DNS-rebinding / CSRF protection: only accept our own Host and Origin.
    const host = String(req.headers.host || '').toLowerCase();
    if (!ALLOWED_HOSTS.has(host)) throw new HttpError(421, 'misdirected_request');
    const origin = req.headers.origin;
    if (origin && !ALLOWED_ORIGINS.has(String(origin).toLowerCase())) throw new HttpError(403, 'forbidden_origin');
    const site = req.headers['sec-fetch-site'];
    if (req.method !== 'GET' && req.method !== 'HEAD' && site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'forbidden_cross_site');

    const qi = (req.url || '/').indexOf('?');
    pathname = qi === -1 ? (req.url || '/') : req.url.slice(0, qi);
    if (pathname.length > 512) throw new HttpError(414, 'uri_too_long');
    if (pathname === '/api' || pathname.startsWith('/api/')) await handleApi(req, res, pathname);
    else serveStatic(req, res, pathname);
  } catch (e) {
    if (e instanceof HttpError) {
      const close = e.status === 413 ? { Connection: 'close' } : {};
      send(res, e.status, { error: e.code }, { ...(e.extraHeaders || {}), ...close });
      if (e.status === 413) req.resume();
    } else {
      console.error('[grodd] internal error:', e && e.message ? e.message.slice(0, 200) : 'unknown');
      send(res, 500, { error: 'internal_error' });
    }
  }
});

server.headersTimeout = 20_000;
server.requestTimeout = 60_000;
server.maxHeadersCount = 50;
server.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{"error":"bad_request"}');
  else socket.destroy();
});

server.listen(PORT, HOST, () => {
  if (!publicDir()) console.warn('[grodd] public/ not found – API works, static files will 404 until it exists.');
  console.log(`🌱 Grodd running on http://${HOST}:${PORT}  ·  mode: ${agent.MODE.toUpperCase()}${agent.MODE === 'demo' ? ' (no ANTHROPIC_API_KEY – canned outputs)' : ` (router ${agent.MODELS.router}, worker ${agent.MODELS.worker})`}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); process.exit(0); });
