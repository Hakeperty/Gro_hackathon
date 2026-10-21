'use strict';
/**
 * Circle.so Admin API v2 client STUB (spike, NOT WIRED IN).
 *
 * Gro runs Circle on a custom domain, but the Admin API is always served from
 * https://app.circle.so/api/admin/v2 (base URL = OpenAPI `servers` default host app.circle.so
 * + the /api/admin/v2 path prefix; Quick start example uses the same prefix).
 *
 * Plan: Admin API + Headless Member API + Workflows are Business ($199/mo annual) or higher.
 *   Business = 5,000 Admin API requests / month (Circle MCP calls count too); Scale = 30,000.
 *   Hard limit: 2,000 requests / 5 min per IP.   -> cache aggressively, cap pagination.
 *
 * Auth: Settings -> Developers -> Tokens, token type "Admin V2".
 *   Quick start says `Authorization: Bearer <token>`; the OpenAPI securityScheme says
 *   `Authorization: Token <token>`.  VERIFY which one your community accepts; set
 *   CIRCLE_AUTH_SCHEME=Token to switch (default Bearer, per the Quick start).
 *   Tokens have no documented per-endpoint scopes, so read-only vs write is enforced HERE
 *   (GRODD_INTEGRATIONS_WRITE) and by the Grodd human-approval queue.
 *
 * Docs:
 *   Overview   https://api.circle.so/apis/admin-api
 *   Quick start https://api.circle.so/apis/admin-api/quick-start
 *   Limits     https://api.circle.so/apis/admin-api/usage-and-limits
 *   OpenAPI    https://api-headless.circle.so/api/admin/v2/swagger.yaml
 *   Reference  https://api-headless.circle.so/?urls.primaryName=Admin+API+V2
 *   Pricing    https://circle.so/pricing
 *
 * ToS: use only the official API/MCP. Never scrape or drive the web UI with a bot.
 *
 * Env: CIRCLE_API_TOKEN (required), CIRCLE_BASE_URL (optional override),
 *      CIRCLE_AUTH_SCHEME (optional: Bearer | Token), GRODD_INTEGRATIONS_WRITE=1 for writes.
 *
 * Every function throws NotConfiguredError ("... integration not configured ...") until
 * CIRCLE_API_TOKEN is set. No function here has ever been run against the live API.
 */

const { requireEnv, readiness, assertWritesEnabled, resolveBase, request, env } = require('./_http');

const SYSTEM = 'circle';
const DEFAULT_BASE = 'https://app.circle.so/api/admin/v2';
const MAX_PER_PAGE = 100; // Overview page: per_page maximum 100

function cfg() {
  const e = requireEnv(SYSTEM, ['CIRCLE_API_TOKEN']);
  const scheme = env('CIRCLE_AUTH_SCHEME') || 'Bearer'; // VERIFY Bearer vs Token (see header)
  return {
    base: resolveBase(env('CIRCLE_BASE_URL'), DEFAULT_BASE),
    token: e.CIRCLE_API_TOKEN,
    headers: { authorization: `${scheme} ${e.CIRCLE_API_TOKEN}` },
  };
}

function call(opts) {
  const c = cfg();
  return request({ system: SYSTEM, base: c.base, headers: c.headers, secrets: [c.token], ...opts });
}

/** "not configured" must win over "write disabled" and over argument errors. */
function guardWrite(op) {
  cfg();
  assertWritesEnabled(SYSTEM, op);
}

const clampPer = (n) => Math.min(Math.max(Number(n) || 30, 1), MAX_PER_PAGE);

/** Readiness report for a status panel. Never throws, never returns the token. */
function status() {
  return readiness(SYSTEM, ['CIRCLE_API_TOKEN'], ['CIRCLE_BASE_URL', 'CIRCLE_AUTH_SCHEME']);
}

/**
 * Page through any list endpoint that returns {records, has_next_page}. Bounded by maxPages
 * because the Business plan only includes 5,000 requests per month.
 * @template T
 * @param {(page:number)=>Promise<{records:T[], has_next_page:boolean}>} fetchPage
 * @param {number} [maxPages=5]
 * @returns {Promise<T[]>}
 */
async function collect(fetchPage, maxPages = 5) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetchPage(page);
    out.push(...((res && res.records) || []));
    if (!res || !res.has_next_page) break;
  }
  return out;
}

// ------------------------------------------------------------------ READ

/**
 * List community members (one page).
 * GET /community_members  (query: page, per_page, status = active|inactive|all, member_tag_ids)
 * Doc: https://api-headless.circle.so/api/admin/v2/swagger.yaml  (path /api/admin/v2/community_members)
 * @param {{page?:number, perPage?:number, status?:'active'|'inactive'|'all', memberTagIds?:number[]}} [o]
 * @returns {Promise<{page:number, per_page:number, has_next_page:boolean, count:number, page_count:number, records:object[]}>}
 */
async function listMembers(o = {}) {
  return call({
    path: '/community_members',
    query: {
      page: o.page || 1,
      per_page: clampPer(o.perPage),
      status: o.status,
      member_tag_ids: o.memberTagIds && o.memberTagIds.join(','), // VERIFY: comma-separated per the OpenAPI note on tagged_members; not confirmed for this endpoint
    },
  });
}

/** Convenience: all members, bounded by maxPages (default 5 x 100). */
function listAllMembers(o = {}) {
  return collect((page) => listMembers({ ...o, page, perPage: MAX_PER_PAGE }), o.maxPages);
}

/**
 * Find one member by exact email (powers Grodd's member-check skill).
 * GET /community_members/search?email=  (email is required)
 * Doc: https://api-headless.circle.so/api/admin/v2/swagger.yaml  (path /api/admin/v2/community_members/search)
 * Response shape for a miss (404 vs empty) is not documented: VERIFY.
 * @param {string} email
 */
async function findMemberByEmail(email) {
  cfg();
  if (!email) throw new Error('email is required');
  return call({ path: '/community_members/search', query: { email } });
}

/**
 * List spaces (one page).  GET /spaces  (query: page, per_page, sort)
 * Doc: https://api-headless.circle.so/api/admin/v2/swagger.yaml  (path /api/admin/v2/spaces)
 */
async function listSpaces(o = {}) {
  return call({ path: '/spaces', query: { page: o.page || 1, per_page: clampPer(o.perPage), sort: o.sort } });
}

/**
 * List posts (one page).
 * GET /posts  (query: page, per_page, space_id, space_group_id, status = draft|published|scheduled|all, search_text, sort)
 * Doc: https://api.circle.so/apis/admin-api/quick-start  and the OpenAPI above.
 */
async function listPosts(o = {}) {
  return call({
    path: '/posts',
    query: {
      page: o.page || 1,
      per_page: clampPer(o.perPage),
      space_id: o.spaceId,
      space_group_id: o.spaceGroupId,
      status: o.status,
      search_text: o.searchText,
      sort: o.sort,
    },
  });
}

/**
 * List events (one page).
 * GET /events  (query: page, per_page, space_id, filter_date[start_date], filter_date[end_date] as YYYY-MM-DD,
 *               sort = oldest|start_date|start_date_desc)
 * Doc: https://api-headless.circle.so/api/admin/v2/swagger.yaml  (path /api/admin/v2/events)
 * @param {{spaceId?:number, startDate?:string, endDate?:string, sort?:string, page?:number, perPage?:number}} [o]
 */
async function listEvents(o = {}) {
  return call({
    path: '/events',
    query: {
      page: o.page || 1,
      per_page: clampPer(o.perPage),
      space_id: o.spaceId,
      'filter_date[start_date]': o.startDate,
      'filter_date[end_date]': o.endDate,
      sort: o.sort,
    },
  });
}

/**
 * List RSVPs for a Circle event.
 * GET /event_attendees?event_id=  (event_id required; page, per_page)
 * Doc: https://api-headless.circle.so/api/admin/v2/swagger.yaml  (path /api/admin/v2/event_attendees)
 * @param {string|number} eventId
 */
async function listEventAttendees(eventId, o = {}) {
  cfg();
  if (!eventId) throw new Error('eventId is required');
  return call({
    path: '/event_attendees',
    query: { event_id: eventId, page: o.page || 1, per_page: clampPer(o.perPage) },
  });
}

/**
 * List Circle Workflows (read-only; used to check whether a "Send to webhook" automation exists).
 * GET /workflows  (query: query, status = draft|active|inactive|archived|all, workflow_type = dynamic|bulk_action|scheduled, page, per_page<=100)
 * Doc: https://api-headless.circle.so/api/admin/v2/swagger.yaml  (path /api/admin/v2/workflows)
 * NOTE: the Admin API v2 spec has NO webhook-management endpoints; outbound webhooks are configured as a
 * "Send to webhook" workflow action in the Circle admin UI (https://help.circle.so/p/workflows/workflow-setup/workflows-roadmap).
 */
async function listWorkflows(o = {}) {
  return call({
    path: '/workflows',
    query: {
      query: o.query,
      status: o.status,
      workflow_type: o.workflowType,
      page: o.page || 1,
      per_page: clampPer(o.perPage),
    },
  });
}

// ------------------------------------------------------------------ WRITE (drafts only, gated)

/**
 * Create a DRAFT post (not visible to members until published).
 * POST /posts  body: {space_id (required), name (required), status: 'draft', user_email, internal_custom_html | tiptap_body, topics, ...}
 * Doc: https://api-headless.circle.so/api/admin/v2/swagger.yaml  (path /api/admin/v2/posts, "Create Basic Post")
 * VERIFY: the spec offers both `tiptap_body` (rich JSON) and `internal_custom_html` (string); which one renders as a
 * normal post body is not stated. Test on a throwaway space before demoing.
 * @param {{spaceId:number, name:string, html?:string, tiptapBody?:object, userEmail?:string, topics?:number[]}} o
 */
async function createPostDraft(o) {
  guardWrite('createPostDraft');
  if (!o || !o.spaceId || !o.name) throw new Error('spaceId and name are required');
  return call({
    method: 'POST',
    path: '/posts',
    body: {
      space_id: o.spaceId,
      name: o.name,
      status: 'draft', // hard-coded: Grodd never publishes without a human
      skip_notifications: true,
      ...(o.userEmail ? { user_email: o.userEmail } : {}),
      ...(o.tiptapBody ? { tiptap_body: o.tiptapBody } : {}),
      ...(o.html && !o.tiptapBody ? { internal_custom_html: o.html } : {}),
      ...(o.topics ? { topics: o.topics } : {}),
    },
  });
}

/**
 * Create a DRAFT event in a Circle events space.
 * POST /events  body: {space_id, event: {name, space_id, status: 'draft', body, event_setting_attributes: {starts_at,
 *   duration_in_seconds, location_type, virtual_location_url, in_person_location, rsvp_limit_enabled, rsvp_limit, ...}}}
 * The spec lists `event` and `space_id` as required at the top level and `name`, `space_id`, `status` (draft|published)
 * inside `event`. Doc: https://api-headless.circle.so/api/admin/v2/swagger.yaml  (path /api/admin/v2/events)
 * VERIFY: whether `body` is HTML or plain text, and whether space_id is really needed at both levels (we send both).
 * There is no end time field; use durationInSeconds.
 * @param {{spaceId:number, name:string, bodyHtml?:string, startsAt?:string, durationInSeconds?:number,
 *          locationType?:'virtual'|'in_person'|'tbd'|'live_stream'|'live_room', virtualLocationUrl?:string,
 *          rsvpLimit?:number}} o  startsAt is ISO 8601
 */
async function createEventDraft(o) {
  guardWrite('createEventDraft');
  if (!o || !o.spaceId || !o.name) throw new Error('spaceId and name are required');
  const setting = {
    ...(o.startsAt ? { starts_at: o.startsAt } : {}),
    ...(o.durationInSeconds ? { duration_in_seconds: o.durationInSeconds } : {}),
    ...(o.locationType ? { location_type: o.locationType } : {}),
    ...(o.virtualLocationUrl ? { virtual_location_url: o.virtualLocationUrl } : {}),
    ...(o.rsvpLimit ? { rsvp_limit_enabled: true, rsvp_limit: o.rsvpLimit } : {}),
    send_email_confirmation: false,
    send_publish_email: false,
  };
  return call({
    method: 'POST',
    path: '/events',
    body: {
      space_id: o.spaceId,
      event: {
        name: o.name,
        space_id: o.spaceId,
        status: 'draft', // hard-coded: publishing is a separate, human-approved step
        ...(o.bodyHtml ? { body: o.bodyHtml } : {}),
        event_setting_attributes: setting,
      },
    },
  });
}

module.exports = {
  status,
  listMembers,
  listAllMembers,
  findMemberByEmail,
  listSpaces,
  listPosts,
  listEvents,
  listEventAttendees,
  listWorkflows,
  createPostDraft,
  createEventDraft,
};
