'use strict';
/**
 * Luma (luma.com) Public API client STUB (spike, NOT WIRED IN).
 *
 * Base URL: https://public-api.luma.com   (current docs; older posts show api.lu.ma - ignore)
 * Auth:     header `x-luma-api-key: <key>`. Create at https://luma.com/calendar/manage/api-keys
 *           (keys are scoped to ONE calendar; org-level keys live under Settings -> Developer).
 * Plan:     REQUIRES Luma Plus ($59/mo billed annually). Gro is on the FREE plan, so the API and
 *           webhooks are NOT available to Gro today. Free-plan options that need no API key:
 *             1) Luma MCP server https://mcp.luma.com (OAuth as the signed-in user, free, read+write)
 *             2) CSV export of guests from the Luma dashboard (included in Free) -> data/luma_guests.csv shape
 * Limits:   200 req/min per calendar key, 500 req/min per organization key; 429 + Retry-After on excess.
 * Conventions: GET for reads, POST for every write; cursor pagination
 *           (`pagination_cursor` / `pagination_limit` in, `entries` / `has_more` / `next_cursor` out).
 *
 * Docs:
 *   Getting started https://docs.luma.com/reference/getting-started-with-your-api
 *   Rate limits     https://docs.luma.com/reference/rate-limits
 *   Index of pages  https://docs.luma.com/llms.txt
 *   Webhooks (UI)   https://help.luma.com/p/webhooks
 *   API access/plan https://help.luma.com/p/luma-api   and   https://luma.com/pricing
 *   Luma MCP        https://help.luma.com/p/mcp
 *
 * Env: LUMA_API_KEY (required), LUMA_BASE_URL (optional), GRODD_INTEGRATIONS_WRITE=1 for writes,
 *      LUMA_WEBHOOK_SECRET (only for verifyWebhookSignature).
 *
 * Every API function throws NotConfiguredError ("... integration not configured ...") until LUMA_API_KEY is set.
 * No function here has ever been run against the live API.
 */

const crypto = require('node:crypto');
const { requireEnv, readiness, assertWritesEnabled, resolveBase, request, env } = require('./_http');

const SYSTEM = 'luma';
const DEFAULT_BASE = 'https://public-api.luma.com';

function cfg() {
  const e = requireEnv(SYSTEM, ['LUMA_API_KEY']);
  return {
    base: resolveBase(env('LUMA_BASE_URL'), DEFAULT_BASE),
    key: e.LUMA_API_KEY,
    headers: { 'x-luma-api-key': e.LUMA_API_KEY },
  };
}

function call(opts) {
  const c = cfg();
  return request({ system: SYSTEM, base: c.base, headers: c.headers, secrets: [c.key], ...opts });
}

/** "not configured" must win over "write disabled" and over argument errors. */
function guardWrite(op) {
  cfg();
  assertWritesEnabled(SYSTEM, op);
}

/** Readiness report for a status panel. Never throws, never returns the key. */
function status() {
  return readiness(SYSTEM, ['LUMA_API_KEY'], ['LUMA_BASE_URL', 'LUMA_WEBHOOK_SECRET']);
}

/**
 * Follow `next_cursor` until `has_more` is false or maxPages is hit (200 req/min budget).
 * @template T
 * @param {(cursor?:string)=>Promise<{entries:T[], has_more:boolean, next_cursor?:string}>} fetchPage
 * @param {number} [maxPages=10]
 * @returns {Promise<T[]>}
 */
async function collect(fetchPage, maxPages = 10) {
  const out = [];
  let cursor;
  for (let i = 0; i < maxPages; i++) {
    const res = await fetchPage(cursor);
    out.push(...((res && res.entries) || []));
    if (!res || !res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return out;
}

// ------------------------------------------------------------------ READ

/**
 * Cheapest "is my key valid" call.  GET /v1/users/get-self -> {id, name, email, ...}
 * Doc: https://docs.luma.com/reference/get_v1-users-get-self
 */
async function getSelf() {
  return call({ path: '/v1/users/get-self' });
}

/**
 * Get one event.  GET /v1/events/get?event_id=evt-...
 * Returns EventDetail; with access "manage" it includes `guest_counts` (counts by status), handy for Grodd's fika forecast.
 * Doc: https://docs.luma.com/reference/get_v1-events-get
 * @param {string} eventId usually starts with "evt-"
 */
async function getEvent(eventId) {
  cfg();
  if (!eventId) throw new Error('eventId is required');
  return call({ path: '/v1/events/get', query: { event_id: eventId } });
}

/**
 * List the calendar's events (one page).
 * GET /v1/calendars/events/list  (query: after, before [ISO 8601], pagination_cursor, pagination_limit,
 *   sort_column=start_at, sort_direction=asc|desc|"asc nulls last"|"desc nulls last", status=approved|pending, access=manage|view, platforms=luma|external)
 * Doc: https://docs.luma.com/reference/get_v1-calendars-events-list
 * @param {{after?:string, before?:string, cursor?:string, limit?:number, sortDirection?:string, status?:'approved'|'pending'}} [o]
 * @returns {Promise<{entries:object[], has_more:boolean, next_cursor?:string}>}
 */
async function listEvents(o = {}) {
  return call({
    path: '/v1/calendars/events/list',
    query: {
      after: o.after,
      before: o.before,
      pagination_cursor: o.cursor,
      pagination_limit: o.limit,
      sort_column: o.sortDirection ? 'start_at' : undefined,
      sort_direction: o.sortDirection,
      status: o.status,
    },
  });
}

/** All events in a window, bounded by maxPages. */
function listAllEvents(o = {}) {
  return collect((cursor) => listEvents({ ...o, cursor }), o.maxPages);
}

/**
 * List guests of an event (one page). Powers member-check and the fika headcount forecast.
 * GET /v1/events/guests/list  (query: event_id [required], approval_status=approved|session|pending_approval|invited|declined|waitlist,
 *   pagination_cursor, pagination_limit, sort_column=name|email|created_at|registered_at|checked_in_at, sort_direction)
 * Entry fields include id, user_email, user_name, approval_status, registered_at, event_tickets[]; NOT event_ticket_orders.
 * Doc: https://docs.luma.com/reference/get_v1-events-guests-list
 * @param {string} eventId
 * @param {{approvalStatus?:string, cursor?:string, limit?:number, sortColumn?:string, sortDirection?:string}} [o]
 * @returns {Promise<{entries:object[], has_more:boolean, next_cursor?:string}>}
 */
async function listGuests(eventId, o = {}) {
  cfg();
  if (!eventId) throw new Error('eventId is required');
  return call({
    path: '/v1/events/guests/list',
    query: {
      event_id: eventId,
      approval_status: o.approvalStatus,
      pagination_cursor: o.cursor,
      pagination_limit: o.limit,
      sort_column: o.sortColumn,
      sort_direction: o.sortDirection,
    },
  });
}

/** All guests of an event, bounded by maxPages (default 10). */
function listAllGuests(eventId, o = {}) {
  return collect((cursor) => listGuests(eventId, { ...o, cursor }), o.maxPages);
}

/**
 * Get a single guest.  GET /v1/events/guests/get?event_id=&id=
 * `id` accepts a guest id (gst-...), ticket key, guest key (g-...) or the guest's email.
 * Doc: https://docs.luma.com/reference/get_v1-events-guests-get
 */
async function getGuest(eventId, idOrEmail) {
  cfg();
  if (!eventId || !idOrEmail) throw new Error('eventId and idOrEmail are required');
  return call({ path: '/v1/events/guests/get', query: { event_id: eventId, id: idOrEmail } });
}

/**
 * Read one webhook (includes its `secret`; treat the response as sensitive, do not log it).
 * GET /v2/webhooks/get?id=      Doc: https://docs.luma.com/reference/get_v2-webhooks-get
 */
async function getWebhook(id) {
  cfg();
  if (!id) throw new Error('id is required');
  return call({ path: '/v2/webhooks/get', query: { id } });
}

// ------------------------------------------------------------------ WRITE (gated)

/**
 * Create an event that is NOT publicly bookable yet ("draft").
 * POST /v1/events/create  body: {name, start_at (ISO 8601), timezone (IANA) [required]; end_at, description_md,
 *   visibility = public|members-only|private, geo_address_json, meeting_url, max_capacity, registration_open, ticket_types, ...}
 * Response: {id}.   Doc: https://docs.luma.com/reference/post_v1-events-create
 *
 * VERIFY: the create endpoint documents NO draft/status field. As the closest safe equivalent this sends
 * visibility "private" and registration_open false. Confirm on a test calendar that such an event is not
 * discoverable, and which call (events/update, path inferred, not read) makes it public/open later.
 * Paid tickets need a Stripe account connected to the calendar; Swish is not mentioned anywhere in the API docs.
 * @param {{name:string, startAt:string, timezone:string, endAt?:string, descriptionMd?:string,
 *          meetingUrl?:string, address?:string, maxCapacity?:number}} o
 */
async function createEventDraft(o) {
  guardWrite('createEventDraft');
  if (!o || !o.name || !o.startAt || !o.timezone) throw new Error('name, startAt and timezone are required');
  return call({
    method: 'POST',
    path: '/v1/events/create',
    body: {
      name: o.name,
      start_at: o.startAt,
      timezone: o.timezone,
      visibility: 'private',
      registration_open: false,
      ...(o.endAt ? { end_at: o.endAt } : {}),
      ...(o.descriptionMd ? { description_md: o.descriptionMd } : {}),
      ...(o.meetingUrl ? { meeting_url: o.meetingUrl } : {}),
      ...(o.address ? { geo_address_json: { type: 'manual', address: o.address } } : {}),
      ...(o.maxCapacity ? { max_capacity: o.maxCapacity } : {}),
    },
  });
}

/**
 * Register our receiver for push events instead of polling.
 * POST /v2/webhooks/create  body: {url (^http.*), event_types[]} -> {id, url, event_types, status, secret, created_at}
 * Allowed event_types: *, event.created, event.updated, event.canceled, guest.registered, guest.updated,
 *   guest.refunded, ticket.registered, calendar.event.added, calendar.event.submitted,
 *   calendar.person.subscribed, calendar.person.unsubscribed.
 * Doc: https://docs.luma.com/reference/post_v2-webhooks-create   (requires Luma Plus: https://help.luma.com/p/webhooks)
 * Store the returned `secret` (whsec_...) in LUMA_WEBHOOK_SECRET; this function does not print it.
 * @param {{url:string, eventTypes:string[]}} o
 */
async function createWebhook(o) {
  guardWrite('createWebhook');
  if (!o || !o.url || !Array.isArray(o.eventTypes) || !o.eventTypes.length) throw new Error('url and eventTypes[] are required');
  return call({ method: 'POST', path: '/v2/webhooks/create', body: { url: o.url, event_types: o.eventTypes } });
}

// ------------------------------------------------------------------ WEBHOOK RECEIVER HELPER (offline, no network)

/**
 * Verify a Luma webhook delivery. Pure local crypto; it never calls the API and needs no API key.
 * Per https://help.luma.com/p/webhooks : headers Webhook-Signature ("t=<timestamp>,v1=<signature>"), Webhook-Id,
 * Webhook-Timestamp; signed payload "{timestamp}.{raw_request_body}"; HMAC-SHA256 hex digest compared to v1 in
 * constant time; secret starts with "whsec_"; reject stale timestamps; respond 2xx within ~5 s; handlers must be
 * idempotent (retries: 3, backoff 1/2/4 min; HTTP 410 pauses the webhook).
 *
 * VERIFY on a real delivery: (a) the HMAC key is the secret string used as-is (we assume yes; Svix-style
 * schemes base64-decode the part after "whsec_"), (b) the timestamp unit (we accept seconds or milliseconds).
 *
 * @param {{rawBody:string|Buffer, headers:Record<string,string|string[]|undefined>, secret?:string, toleranceSeconds?:number, now?:number}} o
 *        rawBody MUST be the unparsed body bytes. Header names are matched case-insensitively.
 * @returns {{ok:boolean, reason?:string, webhookId?:string}}
 */
function verifyWebhookSignature(o) {
  const secret = o.secret || env('LUMA_WEBHOOK_SECRET');
  if (!secret) return { ok: false, reason: 'not configured: LUMA_WEBHOOK_SECRET' };
  const h = {};
  for (const [k, v] of Object.entries(o.headers || {})) h[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
  const sigHeader = h['webhook-signature'];
  if (!sigHeader) return { ok: false, reason: 'missing Webhook-Signature header' };
  const parts = Object.fromEntries(
    String(sigHeader).split(',').map((p) => { const i = p.indexOf('='); return i < 0 ? [p.trim(), ''] : [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }),
  );
  const t = parts.t || h['webhook-timestamp'];
  if (!t || !parts.v1) return { ok: false, reason: 'malformed Webhook-Signature header' };
  const tsNum = Number(t);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: 'bad timestamp' };
  const tsSec = tsNum > 1e12 ? tsNum / 1000 : tsNum; // VERIFY unit
  const nowSec = (o.now || Date.now()) / 1000;
  const tol = o.toleranceSeconds || 300;
  if (Math.abs(nowSec - tsSec) > tol) return { ok: false, reason: 'stale timestamp' };
  const body = Buffer.isBuffer(o.rawBody) ? o.rawBody.toString('utf8') : String(o.rawBody);
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(parts.v1), 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'signature mismatch' };
  return { ok: true, webhookId: h['webhook-id'] };
}

module.exports = {
  status,
  getSelf,
  getEvent,
  listEvents,
  listAllEvents,
  listGuests,
  listAllGuests,
  getGuest,
  getWebhook,
  createEventDraft,
  createWebhook,
  verifyWebhookSignature,
};
