'use strict';
// Shared plumbing for the integration SPIKE stubs (circle.js, luma.js, brevo.js).
//
// NOT WIRED IN: nothing in server.js / lib/ requires this folder. Every exported API
// function throws NotConfiguredError until its env vars are set, and every WRITE
// function additionally throws WriteDisabledError until GRODD_INTEGRATIONS_WRITE=1.
//
// Zero dependencies. Uses the global fetch (Node 18+). Never logs; secrets are only
// ever placed in request headers and are scrubbed from any error text we produce.

class NotConfiguredError extends Error {
  /** @param {string} system @param {string[]} missing env var names */
  constructor(system, missing) {
    super(`${system} integration not configured: set ${missing.join(', ')}`);
    this.name = 'NotConfiguredError';
    this.code = 'NOT_CONFIGURED';
    this.system = system;
    this.missing = missing;
  }
}

class WriteDisabledError extends Error {
  constructor(system, op) {
    super(`${system}.${op} is a write operation and is disabled: set GRODD_INTEGRATIONS_WRITE=1 (drafts only; a human approves in the Grodd queue first)`);
    this.name = 'WriteDisabledError';
    this.code = 'WRITE_DISABLED';
    this.system = system;
  }
}

class ApiError extends Error {
  constructor(message, { system, status, retryAfter, body } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = 'API_ERROR';
    this.system = system;
    this.status = status;
    this.retryAfter = retryAfter; // seconds, set on 429 when the server sends Retry-After
    this.body = body;
  }
}

/** Read an env var; empty/whitespace counts as unset. */
function env(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : '';
}

/** Throw NotConfiguredError unless every named env var is set; returns {NAME: value}. */
function requireEnv(system, names) {
  const missing = names.filter((n) => !env(n));
  if (missing.length) throw new NotConfiguredError(system, missing);
  const out = {};
  for (const n of names) out[n] = env(n);
  return out;
}

/** Non-throwing readiness report for a status panel. Never returns secret values. */
function readiness(system, requiredNames, optionalNames = []) {
  const missing = requiredNames.filter((n) => !env(n));
  return {
    system,
    configured: missing.length === 0,
    missing,
    optionalSet: optionalNames.filter((n) => !!env(n)),
    writesEnabled: env('GRODD_INTEGRATIONS_WRITE') === '1',
  };
}

function assertWritesEnabled(system, op) {
  if (env('GRODD_INTEGRATIONS_WRITE') !== '1') throw new WriteDisabledError(system, op);
}

/** Normalise a base URL: https only (localhost excepted, for offline tests), no trailing slash. */
function resolveBase(raw, fallback) {
  const base = String(raw || fallback).replace(/\/+$/, '');
  let u;
  try { u = new URL(base); } catch { throw new Error(`invalid base URL: ${base}`); }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  if (u.protocol !== 'https:' && !local) throw new Error('refusing to send credentials over non-https base URL');
  return base;
}

function buildUrl(base, path, query) {
  const url = new URL(base + path);
  for (const [k, v] of Object.entries(query || {})) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, String(x)));
    else url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function scrub(text, secrets) {
  let out = String(text == null ? '' : text);
  for (const s of secrets || []) if (s) out = out.split(s).join('[redacted]');
  return out;
}

/**
 * One JSON request. Throws ApiError on network failure or non-2xx.
 * @param {object} o
 * @param {string} o.system   label used in errors ("circle" | "luma" | "brevo")
 * @param {string} [o.method] default GET
 * @param {string} o.base     already-resolved base URL
 * @param {string} o.path     starts with "/"
 * @param {object} [o.query]  undefined/empty values are dropped; arrays repeat the key
 * @param {object} [o.headers] auth headers go here (never logged)
 * @param {*}      [o.body]   JSON-serialisable
 * @param {string[]} [o.secrets] strings scrubbed from error messages
 * @param {number} [o.timeoutMs] default 15000
 */
async function request(o) {
  if (typeof fetch !== 'function') throw new Error('global fetch is unavailable (Node 18+ required)');
  const { system, method = 'GET', base, path, query, headers = {}, body, secrets = [], timeoutMs = 15000 } = o;
  const url = buildUrl(base, path, query);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: { accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new ApiError(`${system} ${method} ${path} failed: ${scrub(e && e.message, secrets)}`, { system });
    }
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }
    if (!res.ok) {
      const ra = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
      const snippet = scrub(typeof data === 'string' ? data : JSON.stringify(data), secrets).slice(0, 300);
      throw new ApiError(`${system} ${method} ${path} -> HTTP ${res.status}${snippet ? ': ' + snippet : ''}`, {
        system,
        status: res.status,
        retryAfter: Number.isFinite(ra) && ra > 0 ? ra : undefined,
        body: data,
      });
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  NotConfiguredError,
  WriteDisabledError,
  ApiError,
  env,
  requireEnv,
  readiness,
  assertWritesEnabled,
  resolveBase,
  request,
};
