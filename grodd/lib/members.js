'use strict';
// Deterministic member-ticket check: Luma guests vs members (FAKE data only).
// Privacy by design: nothing here ever returns the member list or a full email address.
const fs = require('node:fs');
const { maskEmail, safeName, safeLabel } = require('./safety');

const DATA_DIR = __dirname + '/../data/';

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

function loadCsv(name) {
  return parseCsv(fs.readFileSync(DATA_DIR + name, 'utf8'));
}

const normName = (s) => String(s).normalize('NFD').replace(/[\u{300}-\u{36F}]/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
function normEmail(s) {
  const e = String(s).trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return e;
  const local = e.slice(0, at).split('+')[0]; // ignore +tags (name+luma@…)
  return `${local}@${e.slice(at + 1)}`;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const NON_MEMBER_RE = /non[-\s]?member|icke[-\s]?medlem/i;
const isPaidNonMemberTicket = (t) => NON_MEMBER_RE.test(t);
const isMemberTicket = (t) => /member|medlem/i.test(t) && !NON_MEMBER_RE.test(t);

function displayName(name) {
  const parts = safeName(name).split(' ').filter(Boolean);
  if (!parts.length) return 'Okänd';
  return parts.length > 1 ? `${parts[0]} ${[...parts[parts.length - 1]][0]}.` : parts[0];
}
const firstName = (name) => safeName(name).split(' ').filter(Boolean)[0] || 'Okänd';

function runMemberCheck() {
  const members = loadCsv('members.csv');
  const guests = loadCsv('luma_guests.csv');
  const byEmail = new Map(members.map((m) => [normEmail(m.email), m]));
  const byName = new Map(members.map((m) => [normName(m.name), m]));

  const flagged = [];
  let verified = 0;
  for (const g of guests) {
    const email = normEmail(g.email);
    const name = normName(g.name);
    const exact = byEmail.get(email);
    const base = {
      guest_ref: String(g.guest_id).replace(/[^A-Za-z0-9-]/g, '').slice(0, 12) || 'G-?',
      display_name: displayName(g.name),
      first_name: firstName(g.name),
      email_masked: maskEmail(g.email),
      ticket: safeLabel(g.ticket_type, 40) || 'unknown',
    };
    if (isMemberTicket(g.ticket_type)) {
      if (exact) { verified++; continue; }
      const nameHit = byName.get(name);
      if (nameHit) {
        flagged.push({ ...base, issue: 'near_miss', confidence: 'medium', // name-only evidence
          detail: 'Name matches a member record but the email differs.',
          suggested_action: 'Ask the guest to confirm which email their membership uses (no upsell).' });
        continue;
      }
      // fuzzy: email typo on same domain, or name within edit distance 2
      const [loc, dom] = email.split('@');
      // email rule only on the SAME domain; name-only fuzzy hits are low confidence
      let emailClose = false, nameClose = false;
      for (const m of members) {
        const [mloc, mdom] = normEmail(m.email).split('@');
        if (dom && dom === mdom && loc.length >= 4 && levenshtein(loc, mloc) <= 2) emailClose = true;
        if (name.length >= 6 && levenshtein(name, normName(m.name)) <= 2) nameClose = true;
        if (emailClose) break;
      }
      if (emailClose || nameClose) {
        flagged.push({ ...base, issue: 'near_miss', confidence: emailClose ? 'medium' : 'low',
          detail: emailClose ? 'Email is 1–2 characters from a member record on the same domain – probably a typo.' : 'Name is 1–2 characters from a member record – could be a typo.',
          suggested_action: 'Ask the guest to confirm their membership email; fix the Luma record if it is a typo.' });
        continue;
      }
      flagged.push({ ...base, issue: 'not_a_member', confidence: 'high',
        detail: 'Member (free) ticket, but no matching member found.',
        suggested_action: 'Send a friendly note: join (Basic 395 kr/yr or 49 kr/mo) to keep the free ticket, or switch to a non-member ticket.' });
    } else if (isPaidNonMemberTicket(g.ticket_type) && exact) {
      flagged.push({ ...base, issue: 'member_on_paid_ticket', confidence: 'high',
        detail: 'Matches a member record but bought a non-member ticket.',
        suggested_action: 'Money-related: the Gro team decides whether to offer a refund or a free member ticket.' });
    }
  }
  const counts = flagged.reduce((acc, f) => ((acc[f.issue] = (acc[f.issue] || 0) + 1), acc), {});
  return {
    event: safeLabel(guests[0]?.event || 'Luma event', 60),
    guests_checked: guests.length,
    member_tickets_verified: verified,
    counts: { not_a_member: counts.not_a_member || 0, near_miss: counts.near_miss || 0, member_on_paid_ticket: counts.member_on_paid_ticket || 0 },
    flagged,
    note: 'Fiktiv demodata – inga riktiga personer. / Fictional demo data – no real people. Read-only check: emails are masked, the member list is never returned, nothing is sent.',
  };
}

// Friendly note for a flagged guest. Never contains the full email address.
function memberNoteDraft(item, lang, eventName) {
  const n = item.first_name;
  if (item.issue === 'not_a_member') {
    return lang === 'en'
      ? { title: `Member-ticket note: ${item.display_name} (${item.guest_ref})`,
          content: `To: ${item.email_masked} (operator resolves the address at send time)\nSubject: Your ticket for ${eventName} 🌱\n\nHi ${n}!\n\nSo happy you're coming to ${eventName}! Quick heads-up: the free ticket is for Gro members, and we couldn't find you in our member register.\n\nTwo easy options:\n1) Become a member – Basic is 395 kr/year (or 49 kr/month) and you keep the free ticket.\n2) Switch to a regular non-member ticket on Luma.\n\nAlready a member with another email? Just reply and we'll sort it out.\n\nWarm regards,\nThe Gro team\n(Drafted by Grodd, Gro's AI assistant – reviewed by a human before sending)` }
      : { title: `Medlemsbiljett: ${item.display_name} (${item.guest_ref})`,
          content: `Till: ${item.email_masked} (operatören fyller i adressen vid utskick)\nÄmne: Din biljett till ${eventName} 🌱\n\nHej ${n}!\n\nVad kul att du kommer på ${eventName}! En liten grej bara: gratisbiljetten är för Gro-medlemmar, och vi hittar dig inte i medlemsregistret.\n\nTvå enkla vägar:\n1) Bli medlem – Basic kostar 395 kr/år (eller 49 kr/mån) och då behåller du gratisbiljetten.\n2) Byt till en vanlig icke-medlemsbiljett på Luma.\n\nÄr du redan medlem med en annan e-post? Svara bara på mejlet så fixar vi det.\n\nVarma hälsningar,\nGro-teamet\n(Utkast av Grodd, Gros AI-assistent – granskas av en människa före utskick)` };
  }
  return lang === 'en'
    ? { title: `Check membership email: ${item.display_name} (${item.guest_ref})`,
        content: `To: ${item.email_masked} (operator resolves the address at send time)\nSubject: Quick check before ${eventName} 🌱\n\nHi ${n}!\n\nLooking forward to seeing you at ${eventName}. We think you're a member, but the email on your Luma ticket doesn't quite match our register. Could you reply with the email you use for your Gro membership? Then your free ticket is all set.\n\nThanks!\nThe Gro team\n(Drafted by Grodd, Gro's AI assistant – reviewed by a human before sending)` }
    : { title: `Kontrollera medlemsmejl: ${item.display_name} (${item.guest_ref})`,
        content: `Till: ${item.email_masked} (operatören fyller i adressen vid utskick)\nÄmne: Snabb koll inför ${eventName} 🌱\n\nHej ${n}!\n\nVi ses på ${eventName}! Vi tror att du är medlem, men e-posten på din Luma-biljett matchar inte riktigt vårt register. Kan du svara med den e-post du använder för ditt Gro-medlemskap? Då är gratisbiljetten klar.\n\nTack!\nGro-teamet\n(Utkast av Grodd, Gros AI-assistent – granskas av en människa före utskick)` };
}

// True when the text names a known member/guest (full name, any case/diacritics) together with a
// contact-detail word – e.g. "what is the email of kanel bullesson". Names are never returned.
let knownNames = null;
const CONTACT_WORD_RE = /(e-?mail|e-?post|mejl|phone|telefon|mobil|nummer|number|address|adress|kontakt|contact|personnummer|lives|bor\b|linkedin|instagram)/i;
function mentionsKnownPersonContact(text) {
  if (!CONTACT_WORD_RE.test(text)) return false;
  if (!knownNames) {
    try { knownNames = [...loadCsv('members.csv'), ...loadCsv('luma_guests.csv')].map((r) => normName(r.name)).filter((n) => n.includes(' ')); }
    catch { knownNames = []; }
  }
  const t = normName(String(text).replace(/['’]s\b/g, ''));
  return knownNames.some((n) => t.includes(n));
}

function loadPulses() {
  return JSON.parse(fs.readFileSync(DATA_DIR + 'pulses.json', 'utf8'));
}

module.exports = { mentionsKnownPersonContact, runMemberCheck, memberNoteDraft, loadPulses, parseCsv, levenshtein };
