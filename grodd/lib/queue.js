'use strict';
// In-memory approval queue. Approving only SIMULATES publishing – nothing ever leaves this process.
const { cleanText, redactEmails, stripMarkup } = require('./safety');
const { CHANNELS } = require('./knowledge');

const MAX_ITEMS = 300;
const items = []; // newest first

const newId = () => globalThis.crypto.randomUUID();

// Make room for one new item: evict the oldest DECIDED item. Never evict pending work –
// if everything is pending, refuse the new item instead.
function makeRoom() {
  if (items.length < MAX_ITEMS) return true;
  for (let i = items.length - 1; i >= 0; i--) if (items[i].status !== 'pending') { items.splice(i, 1); return true; }
  return false;
}
const QUEUE_FULL = { ok: false, error: 'queue_full: approve or reject pending items first' };
const clean = (s, max) => redactEmails(stripMarkup(cleanText(s, max))).trim();

// QueueItem contract: {id, type, channel, title, content, status, route, created_at, decided_at, published_at}
function publicView(it) {
  const { id, type, channel, title, content, status, route, created_at, decided_at, published_at } = it;
  return { id, type, channel, title, content, status, route, created_at, decided_at, published_at };
}

// Returns {ok, item} or {ok:false, error}
function addDraft({ channel, title, content, route, dedupeKey }) {
  if (!CHANNELS.includes(channel)) return { ok: false, error: `channel must be one of: ${CHANNELS.join(', ')}` };
  const t = clean(title, 300);
  const c = clean(content, 12000);
  if (!t) return { ok: false, error: 'title is required' };
  if (!c) return { ok: false, error: 'content is required' };
  if (t.length > 200) return { ok: false, error: 'title too long (max 200 characters)' };
  if (c.length > 8000) return { ok: false, error: 'content too long (max 8000 characters)' };
  if (dedupeKey) {
    const existing = items.find((i) => i.dedupe_key === dedupeKey && i.status === 'pending');
    if (existing) return { ok: true, item: publicView(existing), deduped: true };
  }
  if (!makeRoom()) return QUEUE_FULL;
  const item = {
    id: newId(), type: 'draft', channel, title: t, content: c,
    status: 'pending', route: route || null, created_at: new Date().toISOString(),
    decided_at: null, published_at: null, dedupe_key: dedupeKey || null,
  };
  items.unshift(item);
  return { ok: true, item: publicView(item) };
}

function addEscalation({ reason, route }) {
  const r = clean(reason, 600) || 'Needs a human';
  if (!makeRoom()) return QUEUE_FULL;
  const item = {
    id: newId(), type: 'escalation', channel: 'team', title: 'Behöver en människa / Needs a human',
    content: r, status: 'pending', route: route || 'escalate', created_at: new Date().toISOString(),
    decided_at: null, published_at: null, dedupe_key: null,
  };
  items.unshift(item);
  return { ok: true, item: publicView(item) };
}

function list() {
  return items.map(publicView);
}

// action: 'approve' | 'reject'
function decide(id, action) {
  const it = items.find((i) => i.id === id);
  if (!it) return { ok: false, status: 404, error: 'not_found' };
  if (it.status !== 'pending') return { ok: false, status: 409, error: `already ${it.status}` };
  const now = new Date().toISOString();
  it.decided_at = now;
  if (action === 'approve') {
    if (it.type === 'escalation') it.status = 'handed to team (simulated)';
    else { it.status = 'published (simulated)'; it.published_at = now; }
  } else {
    it.status = 'rejected';
  }
  return { ok: true, item: publicView(it) };
}

// Roll back items created by a failed live attempt (before the demo fallback re-creates them).
function remove(ids) {
  const set = new Set(ids);
  for (let i = items.length - 1; i >= 0; i--) if (set.has(items[i].id) && items[i].status === 'pending') items.splice(i, 1);
}

function clear() {
  items.length = 0;
}

module.exports = { addDraft, addEscalation, list, decide, remove, clear };
