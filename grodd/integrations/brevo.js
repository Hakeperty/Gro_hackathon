'use strict';
/**
 * Brevo (ex-Sendinblue) API v3 client STUB (spike, NOT WIRED IN).
 *
 * Gro already has Brevo configured. Grodd would use it for (a) transactional mail (escalation notices to the
 * Gro team, member-check follow-ups) and (b) newsletter/announcement DRAFTS that a human reviews in Brevo.
 *
 * Base URL: https://api.brevo.com/v3
 * Auth:     header `api-key: xkeysib-...`  (NOT Authorization: Bearer). Create under SMTP & API -> API keys;
 *           the value is shown once. Keys have no documented scopes (all-access), so least privilege must be
 *           enforced in our code (GRODD_INTEGRATIONS_WRITE + approval queue) and by using a dedicated key
 *           (optionally IP-restricted in Brevo's security settings).
 * Plan:     API access is on every plan incl. Free (vendor says 300 emails/day on Free: VERIFY on the live pricing page).
 *           The sender address/domain must be registered and verified in Brevo (Gro's Google Workspace domain: add Brevo
 *           DKIM/DMARC DNS records, else mail is rejected or lands in spam).
 * Limits:   POST /v3/smtp/email 1,000 req/s (General); most other endpoints, incl. campaigns, fall under the
 *           100 requests/hour "all other endpoints" row (inferred, VERIFY). 429 on excess.
 *
 * Docs:
 *   Key concepts / auth  https://developers.brevo.com/docs/api-key-authentication
 *   Send transactional   https://developers.brevo.com/docs/send-a-transactional-email
 *   Create campaign      https://developers.brevo.com/reference/create-email-campaign
 *   Rate limits          https://developers.brevo.com/docs/api-limits
 *
 * Env: BREVO_API_KEY (required), BREVO_SENDER_EMAIL (+ optional BREVO_SENDER_NAME) as default sender,
 *      BREVO_BASE_URL (optional), GRODD_INTEGRATIONS_WRITE=1 for ANY send/create call.
 *
 * Every function throws NotConfiguredError ("... integration not configured ...") until BREVO_API_KEY is set.
 * No function here has ever been run against the live API.
 */

const { requireEnv, readiness, assertWritesEnabled, resolveBase, request, env } = require('./_http');

const SYSTEM = 'brevo';
const DEFAULT_BASE = 'https://api.brevo.com/v3';

function cfg() {
  const e = requireEnv(SYSTEM, ['BREVO_API_KEY']);
  return {
    base: resolveBase(env('BREVO_BASE_URL'), DEFAULT_BASE),
    key: e.BREVO_API_KEY,
    headers: { 'api-key': e.BREVO_API_KEY },
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

function defaultSender(sender) {
  if (sender && sender.email) return sender;
  const email = env('BREVO_SENDER_EMAIL');
  if (!email) throw new Error('sender.email or BREVO_SENDER_EMAIL is required (must be a verified Brevo sender)');
  return { email, ...(env('BREVO_SENDER_NAME') ? { name: env('BREVO_SENDER_NAME') } : {}) };
}

function oneBody(o) {
  const set = ['htmlContent', 'textContent', 'templateId'].filter((k) => o[k] !== undefined && o[k] !== null && o[k] !== '');
  if (set.length !== 1) throw new Error('provide exactly one of htmlContent, textContent, templateId');
  return { [set[0]]: o[set[0]] };
}

/** Readiness report for a status panel. Never throws, never returns the key. */
function status() {
  return readiness(SYSTEM, ['BREVO_API_KEY'], ['BREVO_SENDER_EMAIL', 'BREVO_SENDER_NAME', 'BREVO_BASE_URL']);
}

/**
 * Smoke test for the key: GET /v3/account -> 200 with account details means the key is valid.
 * Doc: https://developers.brevo.com/docs/api-key-authentication
 */
async function getAccount() {
  return call({ path: '/account' });
}

/**
 * Send ONE transactional email.
 * POST /v3/smtp/email  body: {sender{email,name}, to[{email,name}], subject, one of htmlContent|textContent|templateId,
 *   params{}, replyTo{email,name}, tags[]}  ->  201 {messageId}
 * Doc: https://developers.brevo.com/docs/send-a-transactional-email
 * Only one body type per request. `replyTo` is shown in the cURL example but not defined in the prose: VERIFY.
 * Grodd rule: only call this AFTER a human approves the draft in the queue; recipients must be opted in.
 * @param {{to:{email:string,name?:string}[], subject:string, htmlContent?:string, textContent?:string, templateId?:number,
 *          params?:object, sender?:{email:string,name?:string}, replyTo?:{email:string,name?:string}, tags?:string[]}} o
 * @returns {Promise<{messageId:string}>}
 */
async function sendTransactional(o) {
  guardWrite('sendTransactional');
  if (!o || !Array.isArray(o.to) || !o.to.length || !o.subject) throw new Error('to[] and subject are required');
  return call({
    method: 'POST',
    path: '/smtp/email',
    body: {
      sender: defaultSender(o.sender),
      to: o.to,
      subject: o.subject,
      ...oneBody(o),
      ...(o.params ? { params: o.params } : {}),
      ...(o.replyTo ? { replyTo: o.replyTo } : {}),
      ...(o.tags ? { tags: o.tags } : {}),
    },
  });
}

/**
 * Create a campaign as a DRAFT for a human to review and send from the Brevo UI.
 * POST /v3/emailCampaigns  body: {name, sender{email|id,name}, subject, one of htmlContent|htmlUrl|templateId,
 *   recipients{listIds[]|segmentIds[]}}  ->  201 {id}.  "The campaign is created in draft status by default":
 * so we deliberately NEVER send `scheduledAt` (setting it would queue a send).
 * Doc: https://developers.brevo.com/reference/create-email-campaign
 * VERIFY: that page lists both an `api-key` header and an OAuth `Authorization: Bearer` header as "required";
 * the Quick Start only uses `api-key`, so we send only `api-key`. Confirm with one test call on a throwaway list.
 * @param {{name:string, subject:string, htmlContent?:string, templateId?:number, sender?:{email:string,name?:string},
 *          listIds?:number[]}} o
 * @returns {Promise<{id:number}>}
 */
async function createCampaignDraft(o) {
  guardWrite('createCampaignDraft');
  if (!o || !o.name || !o.subject) throw new Error('name and subject are required');
  const content = o.templateId !== undefined && o.templateId !== null
    ? { templateId: o.templateId }
    : { htmlContent: o.htmlContent };
  if (!content.templateId && !content.htmlContent) throw new Error('provide htmlContent or templateId');
  return call({
    method: 'POST',
    path: '/emailCampaigns',
    body: {
      name: o.name,
      subject: o.subject,
      sender: defaultSender(o.sender),
      ...content,
      ...(o.listIds && o.listIds.length ? { recipients: { listIds: o.listIds } } : {}),
    },
  });
}

module.exports = { status, getAccount, sendTransactional, createCampaignDraft };
