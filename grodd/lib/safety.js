'use strict';
// Deterministic safety layer. Runs in BOTH demo and live mode, before and after the model.

// --- Member-data export / contact-detail requests ---------------------------------------
const EXPORT_PATTERNS = [
  // verb … member list/data/emails  (sv + en)
  /\b(export\w*|dump\w*|download\w*|ladda\s+(ner|hem)|send|skicka|give|ge|list\w*|show|visa|share|dela|copy|kopiera|print|skriv\s+ut|get|hämta|extract|plocka\s+ut|reveal|avslöja|leak|paste|klistra)\b[^.?!\n]{0,60}\b(members?|medlem\w*)[\s-]*(list\w*|register\w*|registry|database|databas\w*|data|e-?mails?|e-?post\w*|mejl\w*|contacts?|kontakt\w*|details|uppgifter|adress\w*|address\w*|phones?|telefon\w*|csv|excel|spreadsheet)\b/i,
  /\b(member|medlems)[\s-]?(list|lista|listan|register|registret|registry|database|databas|databasen)\b/i,
  /\b(all|alla|every|varje)\s+(the\s+|of\s+the\s+)?(members?|medlem\w*)('s|s)?\s+(e-?mails?|e-?post\w*|mejl\w*|contacts?|kontakt\w*|address\w*|adress\w*|phones?|telefon\w*|details|uppgifter|personnummer)\b/i,
  /\b(e-?mail\s*address\w*|e-?postadress\w*|mejladress\w*|phone\s*numbers?|telefonnummer|kontaktuppgifter|contact\s+(details|info\w*)|home\s+address\w*|hemadress\w*)\s+(to|till|för|for|of|på|from|från)\s+(all\s+|alla\s+|every\s+|varje\s+|the\s+|our\s+|våra\s+)?(members?|medlem\w*)\b/i,
  // a specific person's contact details: "Kanel Bullesson's email", "Kanels mejladress"
  /(?<![A-Za-zÅÄÖåäöÉé])(?!(?:Gro|Grodd|Gros|Let|What|That|It|Here|There|Who|Where|How|Members|Medlems|Medlemmars|Events|Partners|Startups)(?:'s|’s)?\b)[A-ZÅÄÖ][a-zåäö]+(?:'s|’s|s)\s+(e-?mail(\s*address)?|e-?postadress|mejladress|mejl|phone(\s*number)?|telefonnummer|nummer|kontaktuppgifter|contact\s+details|home\s+address|hemadress)\b/,
  /\b(contact\s+details|kontaktuppgifter|e-?mail\s+address|e-?postadress|mejladress|phone\s+number|telefonnummer)\s+(of|to|for|för|till|på|åt)\s+(?!Gro\b|Grodd\b|the\s+team|teamet)[A-ZÅÄÖ][a-zåäö]+/,
  /\bpersonnummer\b/i,
  /medlemmarnas\s+(e-?post\w*|mejl\w*|kontakt\w*|adress\w*|telefon\w*|nummer)/i,
  /\bmembers?'?\s+e-?mails?\b/i,
  /\bmembers?'?\s+(e-?mail\s+)?(addresses|contact\s+details|phone\s+numbers)\b/i,
  // list/show/give … (all) members … emails/contacts
  /\b(list\w*|show|give|send|share|print|visa|lista|ge|skicka|dela)\b[^.\n]{0,30}\b(members?|medlem\w*)\b[^.\n]{0,40}\b(e-?mails?|e-?post\w*|mejl\w*|contacts?|kontakt\w*|phones?|telefon\w*|address\w*|adress\w*)\b/i,
  // "email|phone|address of <Name>"
  /\b(e-?mail(\s*address)?|e-?post(adress)?|mejl(adress)?|telefon(nummer)?|phone(\s*number)?|mobil(nummer)?|home\s+address|hemadress|adress|address)\s+(of|to|for|för|till|på|åt)\s+(?!(?:Gro|Grodd|the\s+team|teamet|info|Frö|Sign|Castellum)\b)[A-ZÅÄÖ][a-zåäöé]+/,
  // export … members / CSV dumps / one row per member
  /\b(export\w*|dump\w*|download\w*|ladda\s+(ner|hem)|extract\w*|scrape\w*)\b[^.\n]{0,40}\b(members?|medlem\w*|guests?|gäst\w*)\b/i,
  /\b(members?|medlemmar|medlemmarna)\b[^.\n]{0,30}\b(as|som|to|till|i|in)\s+(a\s+)?(csv|excel|xlsx|spreadsheet|kalkylark|json)\b/i,
  /\b(members|luma_guests|medlemmar|guests)\.(csv|json|xlsx)\b/i,
  /\b(one|a|en)\s+(row|line|rad)\s+(per|for\s+each|för\s+varje)\s+(member|medlem|guest|gäst)\b/i,
  /\b(full|entire|whole|complete|hela|kompletta?)\s+(the\s+)?(member|medlems?)[\s-]?(list|lista|listan|register|registret|database|databasen)\b/i,
];

// --- Prompt-injection markers -------------------------------------------------------------
const INJECTION_PATTERNS = [
  /\b(ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(rules?|instructions?|guidelines?|system\s*prompt|previous|above|safety|policy|policies)\b/i,
  /(ignorera|strunta\s+i|glöm|åsidosätt|kringgå)[^.\n]{0,40}\b(regler\w*|instruktion\w*|riktlinjer\w*|systemprompt\w*|tidigare|ovan|säkerhet\w*)\b/i,
  /\b(system\s*prompt|systemprompt|developer\s+mode|jailbreak|DAN\s+(mode|prompt)|you\s+are\s+now|du\s+är\s+nu|act\s+as\s+(an?\s+)?(admin|root|developer|system)|reveal\s+your\s+(prompt|instructions)|visa\s+(din|dina)\s+(prompt|instruktioner))/i,
  /<\/?\s*(system|untrusted_data|user_message|instructions?)\s*>/i,
  /\[\s*(assistant|system|developer|admin|grodd)\s*:/i,
  /(^|\n)\s*(system|assistant|developer|admin)\s*(override)?\s*:/i,
  /\bsystem\s+override\b/i,
  /\b(reply|respond|answer|output|svara|skriv)\s+(only|just|exactly|bara|enbart|endast)\s+(with|med)\b/i,
  /\byou\s+are\s+DAN\b|\bDAN,\s/,
  /\b(ignore|disregard|forget|bypass|override)\s+((all|any|your|the|previous|prior|above|earlier|my|these|of)\s+){0,4}(rules|instructions|guidelines|prompts?|guardrails)\b/i,
  /(ignorera|strunta\s+i|glöm|åsidosätt|kringgå)\s+((alla|dina|tidigare|ovanstående|era|de)\s+){0,3}(regler\w*|instruktion\w*|riktlinjer\w*)/i,
  /\b(approve|publish|post|godkänn|publicera)\b[^.\n]{0,30}\b(without|utan)\s+(approval|review|godkännande|granskning)\b/i,
];

function detectExport(text) {
  const t = normalizeForScan(text);
  return EXPORT_PATTERNS.some((re) => re.test(t));
}
function detectInjection(text) {
  const t = normalizeForScan(text);
  return INJECTION_PATTERNS.some((re) => re.test(t));
}

// --- Email masking / DLP --------------------------------------------------------------------
const EMAIL_RE = /[\p{L}\p{N}\p{M}._%+-]{1,64}@[\p{L}\p{N}\p{M}.-]{1,253}\.\p{L}{2,}/gu;
const ALLOWED_EMAILS = new Set(['info@grocommunity.se']); // exact public address only

function maskEmail(email) {
  const e = String(email).trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return '***';
  const local = e.slice(0, at), domain = e.slice(at + 1);
  if ([...local].length <= 2) return `***@${domain}`;
  return `${[...local][0]}***@${domain}`;
}

// Masks every email address except Gro's public info@ address. Applied to every reply and draft.
function redactEmails(text) {
  return String(text).replace(EMAIL_RE, (m) => (ALLOWED_EMAILS.has(m.toLowerCase()) ? m : maskEmail(m)));
}

// --- Text hygiene -----------------------------------------------------------------------------
// Strip control characters (keep \n and \t), normalise newlines, cap length.
function cleanText(s, max) {
  let t = String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\xAD\u{61C}\u{180E}\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2060}-\u{2064}\u{2066}-\u{2069}\u{FEFF}]/gu, '');
  if (max && t.length > max) t = t.slice(0, max);
  return t;
}

// Canonical form used before every safety scan: NFKC folds look-alikes (fullwidth letters,
// ligatures) and cleanText removes zero-width / soft-hyphen / bidi tricks.
function normalizeForScan(s) {
  return cleanText(String(s ?? '').normalize('NFKC'));
}

// Neutralise our own delimiter tags inside untrusted text so it cannot "close" a data block.
function neutraliseTags(s) {
  return String(s).replace(/<\s*(\/?)\s*(untrusted_data|user_message|system|lang|route|today|guard_flags)\b/gi, '‹$1$2');
}

// Display-safe name from external data (Luma registrations are attacker-controllable).
function safeName(s, max = 40) {
  const raw = String(s ?? '');
  if (raw.includes('@')) return 'Okänd'; // never let an email address survive as a "name"
  return cleanText(raw, 200).replace(/[^\p{L}\p{M}\s'’.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max).trim() || 'Okänd';
}

// --- Fixed refusal wording for every blocked member-data request ----------------------------
const DATA_REFUSAL = {
  sv: 'Jag delar aldrig medlemmars kontaktuppgifter eller medlemslistan (GDPR). Jag har skickat frågan vidare till teamet.',
  en: "I never share members' contact details or the member list (GDPR). I've passed your request to the team.",
};

// --- Output hygiene (defence in depth; the frontend also renders as text) -----------------------
// Strips HTML tags, inline event handlers, script URLs and Markdown links/images to external URLs.
function stripMarkup(s) {
  let t = String(s ?? '');
  for (let i = 0; i < 3; i++) { // repeat: nested/obfuscated tags
    const before = t;
    t = t
      .replace(/<!--[\s\S]{0,2000}?-->/g, '')
      .replace(/<\/?[A-Za-z!?][^<>]{0,1000}>/g, '')
      .replace(/\bon[a-z]{2,20}\s*=/gi, '')
      .replace(/\b(javascript|vbscript|livescript)\s*:/gi, '')
      .replace(/!\[([^\]\n]{0,200})\]\([^)\n]{0,500}\)/g, '$1')
      .replace(/\[([^\]\n]{0,200})\]\(\s*[^)\n]{0,500}\)/g, '$1');
    if (t === before) break;
  }
  return t;
}

// Replace instructions embedded in user/member-written text before it is echoed back.
const PLACEHOLDER = { sv: '[instruktion borttagen]', en: '[instruction removed]' };
function scrubInstructions(s, lang = 'sv') {
  const ph = PLACEHOLDER[lang === 'en' ? 'en' : 'sv'];
  let t = String(s ?? '').replace(/\[[^\]]{0,400}\]|\([^)]{0,400}\)|\{[^}]{0,400}\}|<[^>]{0,400}>/g, (m) =>
    (detectInjection(m) || /\b(assistant|system|developer|grodd|admin)\s*:/i.test(m) || /\bPWNED\b/i.test(m) ? ph : m));
  if (detectInjection(t) || detectExport(t)) {
    t = t.split(/(?<=[.!?\n])\s+|\s+(?=PS\b)/).map((seg) => (detectInjection(seg) || detectExport(seg) ? ph : seg)).join(' ');
  }
  return t;
}

// --- Language detection (demo + fallback for the router) ----------------------------------
const SV_WORDS = /\b(och|jag|vad|är|för|med|skapa|varje|onsdag|hur|kan|att|inte|vi|medlem\w*|vår|våra|kostar|frukost|tema|gratis|hej|tack|ska|vilka|har|på|en|ett|som|till|nästa|regn|veckan|missat|påminnelse|skriv|granska)\b/gi;
const EN_WORDS = /\b(the|and|what|is|for|with|create|every|wednesday|how|can|our|should|fix|first|members?|free|hi|hello|thanks|who|has|on|a|an|that|to|next|raining|week|missed|write|audit|before|kind)\b/gi;

function detectLang(text, hint) {
  const t = String(text);
  let sv = (t.match(SV_WORDS) || []).length + (t.match(/[åäö]/gi) || []).length * 0.5;
  let en = (t.match(EN_WORDS) || []).length;
  if (sv === en) return hint === 'en' ? 'en' : hint === 'sv' ? 'sv' : 'sv';
  return sv > en ? 'sv' : 'en';
}

// Display-safe short label (ticket types, event names, refs) from external data.
function safeLabel(s, max = 60) {
  return cleanText(s, 300).replace(/[^\p{L}\p{M}\p{N}\s()&:,./–-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

module.exports = {
  DATA_REFUSAL,
  stripMarkup,
  scrubInstructions,
  normalizeForScan,
  safeLabel,
  detectExport,
  detectInjection,
  maskEmail,
  redactEmails,
  cleanText,
  neutraliseTags,
  safeName,
  detectLang,
};
