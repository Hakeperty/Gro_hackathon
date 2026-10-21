/* Grodd 🌱 front end.
 * Security rule of this file: every string that comes from the server or a model is rendered with
 * createElement + textContent / createTextNode only. No HTML-string APIs are used anywhere, there
 * is no dynamic code evaluation and there are no inline handlers. Markdown is rendered by a tiny
 * escape-by-construction renderer that builds DOM nodes (see renderMarkdown). */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ config */
  const POLL_MS = 4000;
  const HEALTH_MS = 30000;
  const API_TIMEOUT = 15000;
  const CHAT_TIMEOUT = 90000;
  const HISTORY_MAX = 10;       // last 10 turns (messages) are sent as history
  const HISTORY_CLIP = 2000;    // keep payloads small
  const MAX_RENDER = 30000;     // never render more than this many chars of one string
  const LS_LANG = 'grodd.lang';

  /* -------------------------------------------------------------------- i18n */
  const I18N = {
    sv: {
      skip: 'Hoppa till innehållet',
      tagline: 'Gro Communitys AI-assistent',
      'tab.chat': 'Chatt',
      'tab.queue': 'Godkännandekö',
      'chat.title': 'Chatta med Grodd',
      'chat.sub': 'Svenska eller engelska. Allt som blir publikt kräver Gro-teamets godkännande.',
      'chat.log': 'Konversation',
      'quick.title': 'Snabbval',
      'input.label': 'Meddelande till Grodd',
      'input.placeholder': 'Skriv till Grodd…',
      'input.hint': 'Enter skickar · Shift+Enter ny rad',
      send: 'Skicka',
      you: 'Du',
      grodd: 'Grodd',
      welcome: 'Hej! Jag är **Grodd** 🌱, Gro Communitys AI-assistent.\n\nJag kan:\n- skapa ett helt event för alla kanaler\n- granska sajten och ge en fix-lista\n- coacha ett Gro Pulse\n- kolla Luma-gäster mot medlemsregistret\n\n**Allt som blir publikt är utkast** och kräver att Gro-teamet godkänner. Prova en snabbknapp nedan eller skriv en fråga.',
      typing: 'Grodd skriver…',
      slow: 'Jobbar på det…',
      'err.network': 'Kunde inte nå servern. Kolla anslutningen och försök igen.',
      'err.timeout': 'Det tog för lång tid. Försök igen om en stund.',
      'err.429': 'Lite för många förfrågningar just nu. Vänta en liten stund.',
      'err.413': 'Meddelandet är för långt.',
      'err.bad': 'Servern svarade oväntat. Försök igen.',
      'err.http': 'Något gick fel ({status}).',
      'err.empty': '(Grodd gav ett tomt svar.)',
      retry: 'Försök igen',
      'drafts.1': '1 utkast väntar i godkännandekön',
      'drafts.n': '{n} utkast väntar i godkännandekön',
      'drafts.open': 'Öppna kön',
      'queue.title': 'Godkännandekö',
      'queue.sub': 'Inget publiceras på riktigt. Att godkänna simulerar bara publiceringen.',
      'queue.pending': '{n} väntar',
      'queue.empty': 'Kön är tom. Be Grodd skapa ett utkast, till exempel med ett snabbval.',
      'queue.emptyPending': 'Inget väntar på godkännande just nu 🎉',
      'queue.offline': 'Ingen kontakt med servern. Försöker igen…',
      'filter.label': 'Filter',
      'filter.all': 'Alla',
      'filter.pending': 'Väntar',
      approve: 'Godkänn',
      reject: 'Avvisa',
      handle: 'Markera hanterad',
      dismiss: 'Avfärda',
      copy: 'Kopiera',
      copied: 'Kopierat ✓',
      more: 'Visa mer',
      less: 'Visa mindre',
      'status.pending': 'Väntar',
      'status.published (simulated)': 'Publicerad (simulerad)',
      'status.handed to team (simulated)': 'Överlämnad till teamet (simulerad)',
      'status.rejected': 'Avvisad',
      created: 'Skapad',
      decided: 'Beslut',
      untitled: '(utan titel)',
      'tag.escalation': 'Eskalering',
      'channel.circle': 'Circle',
      'channel.luma': 'Luma',
      'channel.linkedin': 'LinkedIn',
      'channel.instagram': 'Instagram',
      'channel.newsletter': 'Nyhetsbrev',
      'channel.email': 'E-post',
      'channel.team': 'Team',
      'toast.approved': 'Godkänd ✅ Publiceringen är simulerad.',
      'toast.handled': 'Markerad som hanterad ✅',
      'toast.rejected': 'Avvisad.',
      'toast.dismissed': 'Avfärdad.',
      'toast.copyFail': 'Kunde inte kopiera. Markera texten och kopiera manuellt.',
      'toast.offline': 'Tappade kontakten med servern. Försöker igen automatiskt.',
      'toast.online': 'Kontakten är tillbaka 🌱',
      'qa.event.title': 'Event → överallt',
      'qa.event.hint': 'En mening in, alla kanaler ut',
      'qa.audit.title': 'Sajtens fix-lista',
      'qa.audit.hint': 'Vad ska fixas först?',
      'qa.pulse.title': 'Gro Pulse-coach',
      'qa.pulse.hint': 'Insight, Focus, Blockers',
      'qa.member.title': 'Medlemskoll',
      'qa.member.hint': 'Luma-gäster mot medlemmar',
      'qa.fika.title': 'Fika Forecast',
      'qa.fika.hint': 'Kanelbullar med konfidensintervall',
      'mc.user': '🎫 Kolla Luma-gästerna mot medlemsregistret',
      'mc.intro': 'Klart! Jag jämförde gästlistan med medlemsregistret (fake demo-data, inget skickas).',
      'mc.stats': '{g} gäster kontrollerade · {v} medlemsbiljetter verifierade',
      'mc.none': 'Inga avvikelser. Alla medlemsbiljetter stämmer ✅',
      'mc.caption': 'Gäster att titta närmare på',
      'mc.col.guest': 'Gäst',
      'mc.col.email': 'E-post (maskerad)',
      'mc.col.issue': 'Problem',
      'mc.col.action': 'Föreslagen åtgärd',
      'mc.more': '…och {n} till (visar de första {m}).',
      'issue.not_a_member': 'Ej medlem',
      'issue.near_miss': 'Nära träff',
      'issue.member_on_paid_ticket': 'Medlem på betald biljett',
      'conf.high': 'säkerhet: hög',
      'conf.medium': 'säkerhet: medel',
      'conf.low': 'säkerhet: låg',
      'mc.drafts.1': '1 utkast till gästerna ligger i godkännandekön. Inget skickas utan godkännande.',
      'mc.drafts.n': '{n} utkast till gästerna ligger i godkännandekön. Inget skickas utan godkännande.',
      'trace.label': 'Verktyg',
      footer: 'AI-assistent · Utkast kräver godkännande · Fake demo data',
    },
    en: {
      skip: 'Skip to content',
      tagline: "Gro Community's AI assistant",
      'tab.chat': 'Chat',
      'tab.queue': 'Approval queue',
      'chat.title': 'Chat with Grodd',
      'chat.sub': 'Swedish or English. Anything public needs the Gro team to approve it.',
      'chat.log': 'Conversation',
      'quick.title': 'Quick actions',
      'input.label': 'Message to Grodd',
      'input.placeholder': 'Message Grodd…',
      'input.hint': 'Enter sends · Shift+Enter for a new line',
      send: 'Send',
      you: 'You',
      grodd: 'Grodd',
      welcome: "Hi! I'm **Grodd** 🌱, Gro Community's AI assistant.\n\nI can:\n- turn one sentence into a full event for every channel\n- audit the website and give a fix-list\n- coach a Gro Pulse\n- check Luma guests against the member register\n\n**Everything public is a draft** and needs the Gro team's approval. Try a quick action below or ask a question.",
      typing: 'Grodd is typing…',
      slow: 'Working on it…',
      'err.network': "Couldn't reach the server. Check your connection and try again.",
      'err.timeout': 'That took too long. Please try again in a moment.',
      'err.429': 'Too many requests right now. Wait a moment.',
      'err.413': 'That message is too long.',
      'err.bad': 'The server answered unexpectedly. Please try again.',
      'err.http': 'Something went wrong ({status}).',
      'err.empty': '(Grodd gave an empty reply.)',
      retry: 'Try again',
      'drafts.1': '1 draft waiting in the approval queue',
      'drafts.n': '{n} drafts waiting in the approval queue',
      'drafts.open': 'Open queue',
      'queue.title': 'Approval queue',
      'queue.sub': 'Nothing is really published. Approving only simulates it.',
      'queue.pending': '{n} pending',
      'queue.empty': 'The queue is empty. Ask Grodd for a draft, for example with a quick action.',
      'queue.emptyPending': 'Nothing is waiting for approval right now 🎉',
      'queue.offline': 'No contact with the server. Retrying…',
      'filter.label': 'Filter',
      'filter.all': 'All',
      'filter.pending': 'Pending',
      approve: 'Approve',
      reject: 'Reject',
      handle: 'Mark handled',
      dismiss: 'Dismiss',
      copy: 'Copy',
      copied: 'Copied ✓',
      more: 'Show more',
      less: 'Show less',
      'status.pending': 'Pending',
      'status.published (simulated)': 'Published (simulated)',
      'status.handed to team (simulated)': 'Handed to team (simulated)',
      'status.rejected': 'Rejected',
      created: 'Created',
      decided: 'Decided',
      untitled: '(untitled)',
      'tag.escalation': 'Escalation',
      'channel.circle': 'Circle',
      'channel.luma': 'Luma',
      'channel.linkedin': 'LinkedIn',
      'channel.instagram': 'Instagram',
      'channel.newsletter': 'Newsletter',
      'channel.email': 'Email',
      'channel.team': 'Team',
      'toast.approved': 'Approved ✅ Publishing is simulated.',
      'toast.handled': 'Marked as handled ✅',
      'toast.rejected': 'Rejected.',
      'toast.dismissed': 'Dismissed.',
      'toast.copyFail': "Couldn't copy. Select the text and copy it manually.",
      'toast.offline': 'Lost contact with the server. Retrying automatically.',
      'toast.online': 'Back online 🌱',
      'qa.event.title': 'Event → everywhere',
      'qa.event.hint': 'One sentence in, every channel out',
      'qa.audit.title': 'Site fix-list',
      'qa.audit.hint': 'What to fix first?',
      'qa.pulse.title': 'Gro Pulse coach',
      'qa.pulse.hint': 'Insight, Focus, Blockers',
      'qa.member.title': 'Member check',
      'qa.member.hint': 'Luma guests vs members',
      'qa.fika.title': 'Fika Forecast',
      'qa.fika.hint': 'Cinnamon buns with confidence intervals',
      'mc.user': '🎫 Check the Luma guests against the member register',
      'mc.intro': 'Done! I compared the guest list with the member register (fake demo data, nothing is sent).',
      'mc.stats': '{g} guests checked · {v} member tickets verified',
      'mc.none': 'No mismatches. All member tickets check out ✅',
      'mc.caption': 'Guests to look at',
      'mc.col.guest': 'Guest',
      'mc.col.email': 'Email (masked)',
      'mc.col.issue': 'Issue',
      'mc.col.action': 'Suggested action',
      'mc.more': '…and {n} more (showing the first {m}).',
      'issue.not_a_member': 'Not a member',
      'issue.near_miss': 'Near miss',
      'issue.member_on_paid_ticket': 'Member on paid ticket',
      'conf.high': 'confidence: high',
      'conf.medium': 'confidence: medium',
      'conf.low': 'confidence: low',
      'mc.drafts.1': '1 draft for the guests is in the approval queue. Nothing is sent without approval.',
      'mc.drafts.n': '{n} drafts for the guests are in the approval queue. Nothing is sent without approval.',
      'trace.label': 'Tools',
      footer: 'AI assistant · Drafts need approval · Fake demo data',
    },
  };

  const QUICK = [
    {
      id: 'event', icon: '🗓', kind: 'chat',
      prompt: {
        sv: "Skapa Gro Breakfast varje onsdag 08:30–09:30 i Workshop Area, tema 'AI för bokföring' med Spiris, medlemmar gratis.",
        en: "Create Gro Breakfast every Wednesday 08:30–09:30 in the Workshop Area, theme 'AI for bookkeeping' with Spiris, members free.",
      },
    },
    {
      id: 'audit', icon: '🔍', kind: 'chat',
      prompt: { sv: 'Granska vår sajt – vad ska fixas först?', en: 'Audit our site: what should we fix first?' },
    },
    {
      id: 'pulse', icon: '💬', kind: 'chat',
      prompt: {
        sv: 'Gro Pulse – Insight: första betalande kunden! Focus: prissidan. Blockers: vet inte hur man gör moms på SaaS, känner mig ensam.',
        en: 'Insight: first paying customer! Focus: pricing page. Blockers: no idea how to do VAT on SaaS, feel alone.',
      },
    },
    { id: 'member', icon: '🎫', kind: 'member' },
    {
      id: 'fika', icon: '☕', kind: 'chat',
      prompt: {
        sv: 'Fika Forecast för nästa onsdag: 23 anmälda, regn, veckan före lön.',
        en: 'Fika Forecast for next Wednesday: 23 RSVPs, rain, week before payday.',
      },
    },
  ];

  const CHANNEL_ICONS = {
    circle: '🌀', luma: '🎟️', linkedin: '💼', instagram: '📸', newsletter: '📰', email: '✉️', team: '🙋',
  };

  /* ------------------------------------------------------------------- state */
  let lang = 'sv';
  try {
    const saved = localStorage.getItem(LS_LANG);
    if (saved === 'sv' || saved === 'en') lang = saved;
  } catch (_) { /* storage may be blocked */ }

  const state = {
    busy: false,
    history: [],        // [{role, content}] – in memory only, never persisted
    items: [],          // normalized queue items
    filter: 'all',
    queueOffline: false,
    queueLoaded: false,
  };

  /* ----------------------------------------------------------------- helpers */
  const $ = (id) => document.getElementById(id);
  const mqMobile = window.matchMedia('(max-width: 820px)');
  const mqReduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function t(key, vars) {
    const table = I18N[lang] || I18N.sv;
    let s = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : (I18N.sv[key] ?? key);
    if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
    return s;
  }
  function tn(base, n, vars) {
    return t(n === 1 ? base + '.1' : base + '.n', Object.assign({ n }, vars || {}));
  }

  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function button(className, text, onClick) {
    const b = el('button', className, text);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  function str(v, max) {
    const limit = max || MAX_RENDER;
    let s = '';
    if (typeof v === 'string') s = v;
    else if (typeof v === 'number' || typeof v === 'boolean') s = String(v);
    return s.length > limit ? s.slice(0, limit) : s;
  }
  const clearNode = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
  // Only touch the DOM when the text really changed (keeps text selection + live regions calm while polling).
  function setText(node, text) { if (node.textContent !== text) node.textContent = text; }

  function scrollIntoViewSafe(node, block) {
    try { node.scrollIntoView({ block, behavior: mqReduced.matches ? 'auto' : 'smooth' }); } catch (_) { /* ignore */ }
  }

  // Desktop: scroll only the message box (never the page). Mobile: the page scrolls.
  function scrollMessage(node, where) {
    if (mqMobile.matches) { scrollIntoViewSafe(node, where === 'start' ? 'start' : 'end'); return; }
    const box = messagesEl;
    const nr = node.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    const top = where === 'start'
      ? box.scrollTop + (nr.top - br.top) - 8
      : box.scrollTop + (nr.bottom - br.bottom) + 12;
    try { box.scrollTo({ top: Math.max(0, top), behavior: mqReduced.matches ? 'auto' : 'smooth' }); } catch (_) { box.scrollTop = Math.max(0, top); }
  }

  /* ------------------------------------------------------------------- toasts */
  const toastBox = $('toasts');
  function toast(kind, text, ms) {
    while (toastBox.children.length >= 4) toastBox.removeChild(toastBox.firstChild);
    const box = el('div', 'toast toast-' + kind);
    box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    box.appendChild(el('span', 'toast-text', text));
    const close = button('toast-close', '×', () => dismiss());
    close.setAttribute('aria-label', lang === 'sv' ? 'Stäng' : 'Close');
    box.appendChild(close);
    toastBox.appendChild(box);
    let timer = setTimeout(dismiss, ms || (kind === 'error' ? 7000 : 4000));
    function dismiss() { clearTimeout(timer); if (box.parentNode) box.parentNode.removeChild(box); }
  }

  /* --------------------------------------------------------------------- API */
  class ApiError extends Error {
    constructor(kind, status, detail) {
      super(kind);
      this.kind = kind;      // 'network' | 'timeout' | 'http' | 'bad'
      this.status = status || 0;
      this.detail = detail || '';
    }
  }

  async function api(path, opts) {
    const o = opts || {};
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), o.timeout || API_TIMEOUT);
    const headers = { Accept: 'application/json' };
    const init = { method: o.method || 'GET', headers, signal: ctrl.signal, cache: 'no-store', credentials: 'same-origin' };
    if (init.method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(o.body === undefined ? {} : o.body);
    }
    try {
      let res;
      try {
        res = await fetch(path, init);
      } catch (e) {
        throw new ApiError(e && e.name === 'AbortError' ? 'timeout' : 'network');
      }
      let data = null;
      try { data = await res.json(); } catch (_) { data = null; }
      if (!res.ok) {
        throw new ApiError('http', res.status, isObj(data) && typeof data.error === 'string' ? data.error.slice(0, 200) : '');
      }
      if (data === null || typeof data !== 'object') throw new ApiError('bad');
      return data;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(e && e.name === 'AbortError' ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
  }

  function errorText(e) {
    if (!(e instanceof ApiError)) return t('err.network');
    if (e.kind === 'timeout') return t('err.timeout');
    if (e.kind === 'network') return t('err.network');
    if (e.kind === 'bad') return t('err.bad');
    if (e.status === 429) return t('err.429');
    if (e.status === 413) return t('err.413');
    const base = t('err.http', { status: e.status });
    return e.detail ? base + ' ' + e.detail : base;
  }

  /* -------------------------------------------------------- safe Markdown -> DOM */
  // Escapes by construction: text only ever reaches the DOM via createTextNode/textContent.
  // Supports: headings, **bold**, `code`, bullet + numbered lists (one nested level),
  // pipe tables, blockquotes, horizontal rules. No links, no HTML, no images.
  function renderInline(parent, text) {
    let buf = '';
    const flush = () => { if (buf) { parent.appendChild(document.createTextNode(buf)); buf = ''; } };
    let i = 0;
    while (i < text.length) {
      if (text.startsWith('**', i)) {
        const end = text.indexOf('**', i + 2);
        if (end > i + 2) {
          flush();
          const s = document.createElement('strong');
          renderInline(s, text.slice(i + 2, end));
          parent.appendChild(s);
          i = end + 2;
          continue;
        }
      }
      if (text[i] === '`') {
        const end = text.indexOf('`', i + 1);
        if (end > i + 1) {
          flush();
          parent.appendChild(el('code', null, text.slice(i + 1, end)));
          i = end + 1;
          continue;
        }
      }
      buf += text[i];
      i += 1;
    }
    flush();
  }

  function splitRow(line) {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    const cells = [];
    let cur = '';
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; }
      else if (s[i] === '|') { cells.push(cur.trim()); cur = ''; }
      else cur += s[i];
    }
    cells.push(cur.trim());
    return cells;
  }
  function isSepRow(line) {
    if (!line || line.indexOf('-') === -1 || line.indexOf('|') === -1) return false;
    const cells = splitRow(line);
    return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));
  }

  function buildTable(headCells, aligns, rows) {
    const wrap = el('div', 'table-wrap');
    const table = el('table', 'tbl');
    const thead = el('thead');
    const hr = el('tr');
    headCells.forEach((h, idx) => {
      const th = el('th');
      th.scope = 'col';
      if (aligns[idx]) th.className = 'al-' + aligns[idx];
      renderInline(th, h);
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = el('tbody');
    rows.forEach((r) => {
      const tr = el('tr');
      for (let idx = 0; idx < headCells.length; idx++) {
        const td = el('td');
        td.setAttribute('data-label', headCells[idx].replace(/\*\*/g, '').slice(0, 60));
        if (aligns[idx]) td.className = 'al-' + aligns[idx];
        renderInline(td, r[idx] || '');
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function renderBlocks(parent, lines, depth) {
    let para = null;   // current <p>
    let list = null;   // { el, kind }
    let sub = null;    // nested list { el, kind }
    let lastLi = null;
    let i = 0;

    const reset = () => { para = null; list = null; sub = null; lastLi = null; };

    while (i < lines.length) {
      const line = lines[i].replace(/\s+$/, '');
      let m;

      if (!line.trim()) { reset(); i++; continue; }

      // table: header row, separator row, body rows
      if (line.indexOf('|') !== -1 && i + 1 < lines.length && isSepRow(lines[i + 1])) {
        const head = splitRow(line);
        const sep = splitRow(lines[i + 1]);
        if (head.length === sep.length && head.length > 0 && head.length <= 12) {
          const aligns = sep.map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''));
          const rows = [];
          let j = i + 2;
          while (j < lines.length && lines[j].trim() && lines[j].indexOf('|') !== -1 && rows.length < 200) {
            rows.push(splitRow(lines[j]));
            j++;
          }
          reset();
          parent.appendChild(buildTable(head, aligns, rows));
          i = j;
          continue;
        }
      }

      // blockquote
      if (depth < 3 && /^\s{0,3}>/.test(line)) {
        const inner = [];
        let j = i;
        while (j < lines.length && /^\s{0,3}>/.test(lines[j])) {
          inner.push(lines[j].replace(/^\s{0,3}>\s?/, ''));
          j++;
        }
        reset();
        const bq = el('blockquote');
        renderBlocks(bq, inner, depth + 1);
        parent.appendChild(bq);
        i = j;
        continue;
      }

      // heading
      if ((m = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line))) {
        reset();
        const h = el('p', 'md-h md-h' + Math.min(m[1].length, 3));
        renderInline(h, m[2].replace(/\s+#+\s*$/, ''));
        parent.appendChild(h);
        i++;
        continue;
      }

      // horizontal rule
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
        reset();
        parent.appendChild(el('hr'));
        i++;
        continue;
      }

      // list items
      let kind = null;
      let body = '';
      let start = 1;
      if ((m = /^(\s*)[-*•]\s+(.*)$/.exec(line))) { kind = 'ul'; body = m[2]; }
      else if ((m = /^(\s*)(\d{1,4})[.)]\s+(.*)$/.exec(line))) { kind = 'ol'; body = m[3]; start = parseInt(m[2], 10) || 1; }
      if (kind) {
        const indent = m[1].replace(/\t/g, '    ').length;
        if (indent >= 2 && list && lastLi) {
          if (!sub || sub.kind !== kind) {
            sub = { el: el(kind), kind };
            if (kind === 'ol') sub.el.setAttribute('start', String(start));
            lastLi.appendChild(sub.el);
          }
          const li = el('li');
          renderInline(li, body);
          sub.el.appendChild(li);
        } else {
          para = null;
          sub = null;
          if (!list || list.kind !== kind) {
            list = { el: el(kind), kind };
            if (kind === 'ol' && start !== 1) list.el.setAttribute('start', String(start));
            parent.appendChild(list.el);
          }
          lastLi = el('li');
          renderInline(lastLi, body);
          list.el.appendChild(lastLi);
        }
        i++;
        continue;
      }

      // indented continuation of a list item
      if (list && lastLi && /^\s{2,}\S/.test(lines[i])) {
        lastLi.appendChild(document.createElement('br'));
        renderInline(lastLi, line.trim());
        i++;
        continue;
      }

      // paragraph (single newlines become <br>)
      list = null; sub = null; lastLi = null;
      if (para) para.appendChild(document.createElement('br'));
      else { para = el('p'); parent.appendChild(para); }
      renderInline(para, line.trim());
      i++;
    }
  }

  function renderMarkdown(text) {
    const root = el('div', 'md');
    const lines = str(text, MAX_RENDER).replace(/\r\n?/g, '\n').split('\n');
    renderBlocks(root, lines, 0);
    return root;
  }

  /* ------------------------------------------------------------ mode / health */
  const modeBadge = $('mode-badge');
  function setMode(mode, models) {
    modeBadge.classList.remove('mode-demo', 'mode-live', 'mode-offline', 'mode-unknown');
    let tip = '';
    if (mode === 'demo') { modeBadge.classList.add('mode-demo'); modeBadge.textContent = 'DEMO MODE'; }
    else if (mode === 'live') { modeBadge.classList.add('mode-live'); modeBadge.textContent = 'LIVE'; }
    else if (mode === 'offline') { modeBadge.classList.add('mode-offline'); modeBadge.textContent = 'OFFLINE'; }
    else { modeBadge.classList.add('mode-unknown'); modeBadge.textContent = '…'; }
    if (isObj(models)) {
      const r = str(models.router, 60);
      const w = str(models.worker, 60);
      if (r || w) tip = 'router: ' + (r || '–') + ' · worker: ' + (w || '–');
    }
    if (tip) modeBadge.title = tip; else modeBadge.removeAttribute('title');
  }

  async function loadHealth() {
    try {
      const d = await api('/api/health', { timeout: 8000 });
      if (d.ok === false) throw new ApiError('bad');
      setMode(d.mode === 'live' ? 'live' : 'demo', d.models);
    } catch (_) {
      setMode('offline');
    }
  }

  /* ------------------------------------------------------------------- chat UI */
  const messagesEl = $('messages');
  const input = $('msg-input');
  const sendBtn = $('send-btn');
  const composer = $('composer');
  const quickGrid = $('quick-grid');
  let welcomeBody = null;

  function messageShell(role, wide) {
    const root = el('div', 'msg msg-' + role + (wide ? ' msg-wide' : ''));
    const who = el('div', 'msg-who');
    who.appendChild(el('span', null, role === 'user' ? t('you') : t('grodd') + ' 🌱'));
    const bubble = el('div', 'bubble');
    root.appendChild(who);
    root.appendChild(bubble);
    messagesEl.appendChild(root);
    return { root, who, bubble };
  }

  function addUserMessage(text) {
    const m = messageShell('user');
    m.bubble.textContent = text;
    scrollMessage(m.root, 'end');
    return m;
  }

  function prettyModel(v) {
    const s = str(v, 60);
    const low = s.toLowerCase();
    for (const fam of ['haiku', 'sonnet', 'opus']) {
      if (low.indexOf(fam) !== -1) return fam.charAt(0).toUpperCase() + fam.slice(1);
    }
    return s.replace(/\s*\([^)]*\)\s*/g, ' ').trim().slice(0, 28);
  }

  function addChip(parent, text, cls) {
    const c = el('span', 'chip' + (cls ? ' ' + cls : ''), text);
    parent.appendChild(c);
    return c;
  }

  function addDraftsBar(bubble, count, textKey) {
    if (!count) return;
    const bar = el('div', 'bubble-actions');
    bar.appendChild(el('span', 'bubble-note', '📥 ' + tn(textKey, count)));
    bar.appendChild(button('btn btn-ghost btn-small', t('drafts.open'), openQueue));
    bubble.appendChild(bar);
  }

  function addAssistantReply(data) {
    const m = messageShell('assistant');
    const reply = str(data.reply, MAX_RENDER).trim();
    m.bubble.appendChild(renderMarkdown(reply || t('err.empty')));
    if (m.bubble.querySelector('table')) m.root.classList.add('msg-wide');

    // route + models chip
    const route = str(data.route, 40).replace(/_/g, ' ');
    const models = [];
    if (Array.isArray(data.models_used)) {
      data.models_used.forEach((x) => {
        const p = prettyModel(x);
        if (p && models.indexOf(p) === -1) models.push(p);
      });
    }
    const chipText = [route, models.join(' + ')].filter(Boolean).join(' · ');
    if (chipText) addChip(m.who, chipText);
    if (data.mode === 'demo') addChip(m.who, 'demo', 'chip-mode');

    // optional notice (e.g. "live call failed, used demo output")
    const notice = str(data.notice, 400).trim();
    if (notice) {
      const n = el('div', 'notice', '⚠ ' + notice);
      n.setAttribute('role', 'note');
      m.bubble.appendChild(n);
    }

    // optional tool trace chips
    if (Array.isArray(data.trace) && data.trace.length) {
      const ul = el('ul', 'trace');
      ul.setAttribute('aria-label', t('trace.label'));
      data.trace.slice(0, 12).forEach((tr) => {
        if (!isObj(tr)) return;
        const name = str(tr.tool, 40);
        if (!name) return;
        const li = el('li', 'chip chip-tool' + (tr.ok === false ? ' is-bad' : ''), (tr.ok === false ? '✗ ' : '✓ ') + name);
        ul.appendChild(li);
      });
      if (ul.children.length) m.bubble.appendChild(ul);
    }

    const draftCount = Array.isArray(data.drafts) ? data.drafts.filter(isObj).length : 0;
    addDraftsBar(m.bubble, draftCount, 'drafts');
    scrollMessage(m.root, 'start');
    return m;
  }

  function addTyping() {
    const m = messageShell('assistant');
    m.root.classList.add('typing');
    m.bubble.appendChild(el('span', 'sr-only', t('typing')));
    const dots = el('span', 'typing-dots');
    dots.setAttribute('aria-hidden', 'true');
    dots.appendChild(el('i'));
    dots.appendChild(el('i'));
    dots.appendChild(el('i'));
    m.bubble.appendChild(dots);
    const slow = el('span', 'typing-slow');
    slow.setAttribute('aria-hidden', 'true');
    m.bubble.appendChild(slow);
    const timer = setTimeout(() => { slow.textContent = t('slow'); }, 5000);
    scrollMessage(m.root, 'end');
    return { remove() { clearTimeout(timer); if (m.root.parentNode) m.root.parentNode.removeChild(m.root); } };
  }

  function addErrorMessage(e, retryFn) {
    const m = messageShell('assistant');
    m.root.classList.add('msg-error');
    m.bubble.setAttribute('role', 'alert');
    m.bubble.appendChild(el('p', null, '⚠ ' + errorText(e)));
    if (retryFn) {
      const bar = el('div', 'bubble-actions');
      bar.appendChild(button('btn btn-ghost btn-small', t('retry'), () => {
        if (m.root.parentNode) m.root.parentNode.removeChild(m.root);
        retryFn();
      }));
      m.bubble.appendChild(bar);
    }
    scrollMessage(m.root, 'end');
  }

  function showWelcome() {
    const m = messageShell('assistant');
    welcomeBody = m.bubble;
    m.bubble.appendChild(renderMarkdown(t('welcome')));
  }

  function setBusy(b) {
    state.busy = b;
    sendBtn.disabled = b;
    messagesEl.setAttribute('aria-busy', b ? 'true' : 'false');
    quickGrid.querySelectorAll('button').forEach((x) => { x.disabled = b; });
  }

  function refocusInput() {
    let fine = false;
    try { fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (_) { /* ignore */ }
    const a = document.activeElement;
    if (fine && (!a || a === document.body || a.disabled)) input.focus({ preventScroll: true });
  }

  function clip(s) { return s.length > HISTORY_CLIP ? s.slice(0, HISTORY_CLIP) : s; }

  async function sendChat(text, opts) {
    const message = text.trim();
    if (!message || state.busy) return;
    const retry = !!(opts && opts.retry);
    setBusy(true);
    if (!retry) addUserMessage(message);
    const typing = addTyping();
    try {
      const data = await api('/api/chat', {
        method: 'POST',
        timeout: CHAT_TIMEOUT,
        body: { message, history: state.history.slice(-HISTORY_MAX), lang },
      });
      typing.remove();
      addAssistantReply(data);
      const reply = str(data.reply, MAX_RENDER);
      state.history.push({ role: 'user', content: clip(message) }, { role: 'assistant', content: clip(reply) });
      state.history = state.history.slice(-HISTORY_MAX);
      if (data.mode === 'demo' || data.mode === 'live') setMode(data.mode, null);
      refreshApprovals();
    } catch (e) {
      typing.remove();
      addErrorMessage(e, () => sendChat(message, { retry: true }));
      toast('error', errorText(e));
    } finally {
      setBusy(false);
      refocusInput();
    }
  }

  /* ------------------------------------------------------------- member check */
  const ISSUE_KEYS = ['not_a_member', 'near_miss', 'member_on_paid_ticket'];

  function issueLabel(key) {
    return ISSUE_KEYS.indexOf(key) !== -1 ? t('issue.' + key) : str(key, 40).replace(/_/g, ' ');
  }

  function renderMemberCheck(data) {
    const m = messageShell('assistant', true);
    m.bubble.classList.add('mc');
    addChip(m.who, 'member check');
    if (data.mode === 'demo') addChip(m.who, 'demo', 'chip-mode');

    m.bubble.appendChild(el('p', 'mc-intro', t('mc.intro')));

    const flagged = Array.isArray(data.flagged) ? data.flagged.filter(isObj) : [];
    const shown = flagged.slice(0, 60);

    // stats line (optional fields)
    const g = Number(data.guests_checked);
    const v = Number(data.member_tickets_verified);
    if (Number.isFinite(g) && Number.isFinite(v)) m.bubble.appendChild(el('p', 'mc-stats', t('mc.stats', { g, v })));

    // counts (use server counts, fall back to counting flagged)
    const counts = {};
    if (isObj(data.counts)) {
      Object.keys(data.counts).forEach((k) => {
        const n = Number(data.counts[k]);
        if (Number.isFinite(n)) counts[k] = n;
      });
    } else {
      flagged.forEach((f) => { const k = str(f.issue, 40) || 'other'; counts[k] = (counts[k] || 0) + 1; });
    }
    ISSUE_KEYS.forEach((k) => { if (!(k in counts)) counts[k] = flagged.filter((f) => f.issue === k).length; });
    const ul = el('ul', 'count-chips');
    const keys = ISSUE_KEYS.concat(Object.keys(counts).filter((k) => ISSUE_KEYS.indexOf(k) === -1).slice(0, 6));
    keys.forEach((k) => {
      const li = el('li', 'count-chip' + (counts[k] ? '' : ' is-zero'));
      li.appendChild(el('span', 'count-num', counts[k]));
      li.appendChild(el('span', null, issueLabel(k)));
      ul.appendChild(li);
    });
    m.bubble.appendChild(ul);

    if (!shown.length) {
      m.bubble.appendChild(el('p', null, t('mc.none')));
    } else {
      const wrap = el('div', 'table-wrap');
      const table = el('table', 'tbl tbl-members');
      const cap = el('caption', 'sr-only', t('mc.caption'));
      table.appendChild(cap);
      const heads = [t('mc.col.guest'), t('mc.col.email'), t('mc.col.issue'), t('mc.col.action')];
      const thead = el('thead');
      const hr = el('tr');
      heads.forEach((h) => { const th = el('th', null, h); th.scope = 'col'; hr.appendChild(th); });
      thead.appendChild(hr);
      table.appendChild(thead);
      const tbody = el('tbody');
      shown.forEach((f) => {
        const tr = el('tr');
        // guest
        const tdName = el('td');
        tdName.setAttribute('data-label', heads[0]);
        const name = str(f.name, 80) || str(f.display_name, 80) || str(f.first_name, 80) || '?';
        tdName.appendChild(el('strong', null, name));
        const ticket = str(f.ticket_type, 60) || str(f.ticket, 60);
        if (ticket) tdName.appendChild(el('span', 'cell-sub', ticket));
        tr.appendChild(tdName);
        // email
        const tdMail = el('td', 'cell-mono', str(f.email_masked, 120) || '–');
        tdMail.setAttribute('data-label', heads[1]);
        tr.appendChild(tdMail);
        // issue
        const tdIssue = el('td');
        tdIssue.setAttribute('data-label', heads[2]);
        const ik = ISSUE_KEYS.indexOf(f.issue) !== -1 ? f.issue : 'other';
        const badge = el('span', 'issue issue-' + ik, issueLabel(str(f.issue, 40)));
        const detail = str(f.detail, 300);
        if (detail) badge.title = detail;
        tdIssue.appendChild(badge);
        const conf = str(f.confidence, 12).toLowerCase();
        if (conf) tdIssue.appendChild(el('span', 'cell-sub', ['high', 'medium', 'low'].indexOf(conf) !== -1 ? t('conf.' + conf) : conf));
        tr.appendChild(tdIssue);
        // action
        const tdAct = el('td', null, str(f.suggested_action, 400) || '–');
        tdAct.setAttribute('data-label', heads[3]);
        tr.appendChild(tdAct);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      m.bubble.appendChild(wrap);
      if (flagged.length > shown.length) {
        m.bubble.appendChild(el('p', 'mc-stats', t('mc.more', { n: flagged.length - shown.length, m: shown.length })));
      }
    }

    const note = str(data.note, 400).trim();
    if (note) m.bubble.appendChild(el('p', 'mc-stats', note));
    const draftCount = Array.isArray(data.drafts) ? data.drafts.filter(isObj).length : 0;
    addDraftsBar(m.bubble, draftCount, 'mc.drafts');
    scrollMessage(m.root, 'start');
  }

  async function runMemberCheck(opts) {
    if (state.busy) return;
    const retry = !!(opts && opts.retry);
    setBusy(true);
    if (!retry) addUserMessage(t('mc.user'));
    const typing = addTyping();
    try {
      const data = await api('/api/member-check', { method: 'POST', timeout: 45000, body: { lang } });
      typing.remove();
      renderMemberCheck(data);
      refreshApprovals();
    } catch (e) {
      typing.remove();
      addErrorMessage(e, () => runMemberCheck({ retry: true }));
      toast('error', errorText(e));
    } finally {
      setBusy(false);
      refocusInput();
    }
  }

  /* ------------------------------------------------------------- quick actions */
  const quickRefs = [];
  function buildQuick() {
    QUICK.forEach((q) => {
      const b = el('button', 'qa');
      b.type = 'button';
      const icon = el('span', 'qa-icon', q.icon);
      icon.setAttribute('aria-hidden', 'true');
      const txt = el('span', 'qa-text');
      const title = el('span', 'qa-title');
      const hint = el('span', 'qa-hint');
      txt.appendChild(title);
      txt.appendChild(hint);
      b.appendChild(icon);
      b.appendChild(txt);
      b.addEventListener('click', () => {
        if (state.busy) return;
        if (q.kind === 'member') runMemberCheck();
        else sendChat(q.prompt[lang] || q.prompt.sv);
      });
      quickGrid.appendChild(b);
      quickRefs.push({ q, title, hint });
    });
    applyQuickLabels();
  }
  function applyQuickLabels() {
    quickRefs.forEach((r) => {
      r.title.textContent = t('qa.' + r.q.id + '.title');
      r.hint.textContent = t('qa.' + r.q.id + '.hint');
    });
  }

  /* ----------------------------------------------------------------- composer */
  function autosize() {
    input.style.height = 'auto';
    const h = input.scrollHeight;
    input.style.height = Math.min(Math.max(h, 46), 160) + 'px';
    input.style.overflowY = h > 160 ? 'auto' : 'hidden';
  }
  function submitInput() {
    const text = input.value;
    if (!text.trim()) { input.focus(); return; }
    if (state.busy) return;
    input.value = '';
    autosize();
    sendChat(text);
  }
  composer.addEventListener('submit', (e) => { e.preventDefault(); submitInput(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      submitInput();
    }
  });
  input.addEventListener('input', autosize);

  /* --------------------------------------------------------------- view tabs */
  const mainEl = $('main');
  const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
  function setView(view) {
    mainEl.setAttribute('data-view', view);
    tabButtons.forEach((b) => b.setAttribute('aria-pressed', b.getAttribute('data-view') === view ? 'true' : 'false'));
    if (mqMobile.matches) window.scrollTo({ top: 0, behavior: 'auto' });
  }
  tabButtons.forEach((b) => b.addEventListener('click', () => setView(b.getAttribute('data-view'))));

  function openQueue() {
    const title = $('queue-title');
    if (mqMobile.matches) {
      setView('queue');
      title.focus({ preventScroll: true });
    } else {
      title.focus({ preventScroll: true });
      scrollIntoViewSafe($('queue-panel'), 'nearest');
    }
  }

  /* ------------------------------------------------------------ approval queue */
  const listEl = $('queue-list');
  const emptyEl = $('queue-empty');
  const countEl = $('queue-count');
  const tabCountEl = $('tab-count');
  const tabCountSr = $('tab-count-sr');
  const offlineEl = $('queue-offline');
  const filterAllN = $('filter-all-n');
  const filterPendingN = $('filter-pending-n');
  const filterButtons = Array.from(document.querySelectorAll('.filter-btn'));

  const cards = new Map(); // id -> card refs
  let cardSeq = 0;
  let seq = 0;
  let inflight = false;
  let firstRender = true;

  function normalizeItem(r) {
    if (!isObj(r)) return null;
    const id = typeof r.id === 'string' || typeof r.id === 'number' ? String(r.id) : '';
    if (!id) return null;
    return {
      id,
      type: r.type === 'escalation' ? 'escalation' : 'draft',
      channel: str(r.channel, 30).toLowerCase(),
      title: str(r.title, 300),
      content: str(r.content, MAX_RENDER),
      status: str(r.status, 80) || 'pending',
      route: str(r.route, 40),
      created_at: str(r.created_at, 40),
      decided_at: str(r.decided_at, 40),
      published_at: str(r.published_at, 40),
    };
  }
  function asItems(data) {
    if (Array.isArray(data)) return data;
    if (isObj(data) && Array.isArray(data.items)) return data.items;
    return [];
  }

  function statusKind(status) {
    const s = status.toLowerCase();
    if (s === 'pending') return 'pending';
    if (s.startsWith('published')) return 'published';
    if (s.startsWith('handed')) return 'handed';
    if (s === 'rejected') return 'rejected';
    return 'other';
  }
  function statusLabel(status) {
    const key = 'status.' + status.toLowerCase();
    const table = I18N[lang];
    return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : status;
  }
  function channelLabel(ch) {
    const key = 'channel.' + ch;
    const table = I18N[lang];
    if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
    return ch ? ch.charAt(0).toUpperCase() + ch.slice(1) : '?';
  }
  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    try {
      return new Intl.DateTimeFormat(lang === 'sv' ? 'sv-SE' : 'en-GB', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      }).format(d);
    } catch (_) {
      return d.toLocaleString();
    }
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) { /* fall through to legacy path */ }
    const prevFocus = document.activeElement;
    try {
      const ta = el('textarea', 'offscreen');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.setAttribute('aria-hidden', 'true');
      ta.tabIndex = -1;
      document.body.appendChild(ta);
      ta.focus({ preventScroll: true });
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      ta.remove();
      if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus({ preventScroll: true });
      return !!ok;
    } catch (_) {
      return false;
    }
  }

  function measure(c) {
    if (c.expanded) return;
    const node = c.content;
    if (!node.clientWidth) return; // hidden (other tab) – measured again when shown
    const over = node.scrollHeight > node.clientHeight + 1;
    node.classList.toggle('overflowing', over);
    c.toggle.hidden = !over;
  }

  function createCard(item) {
    const uid = 'card' + (++cardSeq);
    const c = { id: item.id, uid, item, status: null, expanded: false, busy: false, copyTimer: 0 };

    const li = el('li', 'card');
    if (!firstRender) li.classList.add('enter');
    li.addEventListener('animationend', (e) => { if (e.target === li) li.classList.remove('enter'); });

    const head = el('div', 'card-head');
    const channel = el('span', 'channel');
    c.icon = el('span', 'channel-icon');
    c.icon.setAttribute('aria-hidden', 'true');
    c.channelLabel = el('span', 'channel-label');
    channel.appendChild(c.icon);
    channel.appendChild(c.channelLabel);
    c.tag = el('span', 'tag');
    c.pill = el('span', 'pill');
    c.pill.addEventListener('animationend', () => c.pill.classList.remove('flash'));
    head.appendChild(channel);
    head.appendChild(c.tag);
    head.appendChild(c.pill);

    c.title = el('h3', 'card-title');
    c.title.id = uid + '-t';

    c.content = el('div', 'card-content');
    c.content.id = uid + '-c';
    c.toggle = button('link-btn', '', () => {
      c.expanded = !c.expanded;
      c.content.classList.toggle('expanded', c.expanded);
      c.toggle.setAttribute('aria-expanded', c.expanded ? 'true' : 'false');
      c.toggle.textContent = c.expanded ? t('less') : t('more');
      if (c.expanded) c.content.classList.remove('overflowing');
      else { measure(c); scrollIntoViewSafe(li, 'nearest'); }
    });
    c.toggle.setAttribute('aria-expanded', 'false');
    c.toggle.setAttribute('aria-controls', c.content.id);
    c.toggle.hidden = true;

    c.meta = el('p', 'card-meta');
    c.created = el('span');
    c.decided = el('span');
    c.route = el('span', 'route-chip');
    c.meta.appendChild(c.created);
    c.meta.appendChild(c.decided);
    c.meta.appendChild(c.route);

    const actions = el('div', 'card-actions');
    c.approve = button('btn btn-approve btn-small', '', () => decide(c, 'approve'));
    c.reject = button('btn btn-reject btn-small', '', () => decide(c, 'reject'));
    c.copy = button('btn btn-ghost btn-small', '', async () => {
      const ok = await copyText(c.item.content);
      clearTimeout(c.copyTimer);
      if (ok) {
        c.copy.textContent = t('copied');
        c.copyTimer = setTimeout(() => { c.copyTimer = 0; c.copy.textContent = t('copy'); }, 1600);
      } else {
        toast('error', t('toast.copyFail'));
      }
    });
    actions.appendChild(c.approve);
    actions.appendChild(c.reject);
    actions.appendChild(c.copy);

    li.appendChild(head);
    li.appendChild(c.title);
    li.appendChild(c.content);
    li.appendChild(c.toggle);
    li.appendChild(c.meta);
    li.appendChild(actions);
    c.li = li;

    if (typeof ResizeObserver === 'function') {
      c.ro = new ResizeObserver(() => measure(c));
      c.ro.observe(c.content);
    }
    return c;
  }

  function setStamp(holder, labelKey, iso) {
    const shown = fmtTime(iso);
    const key = shown + '|' + lang;
    if (holder._key === key) return;
    holder._key = key;
    holder.hidden = !shown;
    clearNode(holder);
    if (shown) {
      holder.appendChild(document.createTextNode(t(labelKey) + ' '));
      const tm = el('time', null, shown);
      tm.setAttribute('datetime', iso);
      holder.appendChild(tm);
    }
  }

  function updateCard(c, item) {
    c.item = item;
    const kind = statusKind(item.status);
    const esc = item.type === 'escalation';

    c.li.setAttribute('data-state', kind);
    setText(c.icon, CHANNEL_ICONS[item.channel] || (esc ? CHANNEL_ICONS.team : '📄'));
    setText(c.channelLabel, channelLabel(item.channel));
    c.tag.hidden = !esc;
    if (esc) setText(c.tag, t('tag.escalation'));

    if (c.kind !== kind) {
      c.pill.className = 'pill pill-' + kind;
      c.kind = kind;
    }
    setText(c.pill, statusLabel(item.status));
    c.pill.title = item.status;
    if (c.status !== null && c.status !== item.status) {
      c.pill.classList.remove('flash');
      void c.pill.offsetWidth; // restart the animation
      c.pill.classList.add('flash');
    }
    c.status = item.status;

    setText(c.title, item.title || t('untitled'));
    if (c.shownContent !== item.content) {
      c.shownContent = item.content;
      c.content.textContent = item.content;
      c.content.classList.remove('overflowing');
      requestAnimationFrame(() => measure(c));
    }
    setText(c.toggle, c.expanded ? t('less') : t('more'));

    setStamp(c.created, 'created', item.created_at);
    setStamp(c.decided, 'decided', item.decided_at);
    c.route.hidden = !item.route;
    setText(c.route, item.route);

    const pending = kind === 'pending';
    c.approve.hidden = !pending;
    c.reject.hidden = !pending;
    const approveText = esc ? t('handle') : t('approve');
    const rejectText = esc ? t('dismiss') : t('reject');
    setText(c.approve, approveText);
    setText(c.reject, rejectText);
    const label = item.title || t('untitled');
    c.approve.setAttribute('aria-label', approveText + ': ' + label);
    c.reject.setAttribute('aria-label', rejectText + ': ' + label);
    c.copy.setAttribute('aria-label', t('copy') + ': ' + label);
    if (!c.copyTimer) setText(c.copy, t('copy'));
    c.approve.disabled = c.busy;
    c.reject.disabled = c.busy;
  }

  function setCardBusy(c, b) {
    c.busy = b;
    c.approve.disabled = b;
    c.reject.disabled = b;
    c.li.setAttribute('aria-busy', b ? 'true' : 'false');
  }

  async function decide(c, action) {
    if (c.busy) return;
    const esc = c.item.type === 'escalation';
    setCardBusy(c, true);
    try {
      await api('/api/approvals/' + encodeURIComponent(c.id) + '/' + action, { method: 'POST', body: {} });
      toast('success', t(action === 'approve' ? (esc ? 'toast.handled' : 'toast.approved') : (esc ? 'toast.dismissed' : 'toast.rejected')));
    } catch (e) {
      toast('error', errorText(e));
    }
    setCardBusy(c, false);
    await refreshApprovals();
    const a = document.activeElement;
    if ((!a || a === document.body || a.hidden || a.disabled) && cards.get(c.id)) c.copy.focus({ preventScroll: true });
  }

  function renderQueue() {
    const items = state.items;
    const pendingN = items.filter((i) => statusKind(i.status) === 'pending').length;
    const visible = state.filter === 'pending' ? items.filter((i) => statusKind(i.status) === 'pending') : items;

    const seen = new Set();
    let prev = null;
    visible.forEach((item) => {
      let c = cards.get(item.id);
      if (!c) { c = createCard(item); cards.set(item.id, c); }
      updateCard(c, item);
      seen.add(item.id);
      const ref = prev ? prev.li.nextSibling : listEl.firstChild;
      if (c.li !== ref) listEl.insertBefore(c.li, ref);
      prev = c;
    });
    Array.from(cards.keys()).forEach((id) => {
      if (seen.has(id)) return;
      const c = cards.get(id);
      if (c.ro) c.ro.disconnect();
      if (c.li.parentNode) c.li.parentNode.removeChild(c.li);
      cards.delete(id);
    });
    if (state.queueLoaded) firstRender = false;

    // counts + empty state
    setText(countEl, t('queue.pending', { n: pendingN }));
    countEl.classList.toggle('is-zero', pendingN === 0);
    setText(tabCountEl, String(pendingN));
    tabCountEl.classList.toggle('is-zero', pendingN === 0);
    setText(tabCountSr, t('queue.pending', { n: pendingN }));
    setText(filterAllN, String(items.length));
    setText(filterPendingN, String(pendingN));
    if (!visible.length) {
      emptyEl.hidden = false;
      setText(emptyEl, items.length ? t('queue.emptyPending') : t('queue.empty'));
    } else {
      emptyEl.hidden = true;
    }
  }

  function setQueueOffline(off) {
    if (state.queueOffline === off) return;
    const was = state.queueOffline;
    state.queueOffline = off;
    offlineEl.hidden = !off;
    offlineEl.textContent = off ? t('queue.offline') : '';
    if (off) toast('error', t('toast.offline'));
    else if (was) toast('success', t('toast.online'));
  }

  async function refreshApprovals() {
    const mine = ++seq;
    try {
      const data = await api('/api/approvals', { timeout: 8000 });
      if (mine !== seq) return;
      state.items = asItems(data).map(normalizeItem).filter(Boolean);
      state.queueLoaded = true;
      setQueueOffline(false);
      renderQueue();
    } catch (_) {
      if (mine !== seq) return;
      setQueueOffline(true);
      if (!state.queueLoaded) renderQueue();
    }
  }

  async function poll() {
    if (document.hidden || inflight) return;
    inflight = true;
    try { await refreshApprovals(); } finally { inflight = false; }
  }

  filterButtons.forEach((b) => b.addEventListener('click', () => {
    state.filter = b.getAttribute('data-filter') === 'pending' ? 'pending' : 'all';
    filterButtons.forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    renderQueue();
  }));

  /* ----------------------------------------------------------------- language */
  function applyStatic() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.getAttribute('data-i18n')); });
    document.querySelectorAll('[data-i18n-attr]').forEach((n) => {
      n.getAttribute('data-i18n-attr').split(';').forEach((pair) => {
        const idx = pair.indexOf(':');
        if (idx > 0) n.setAttribute(pair.slice(0, idx), t(pair.slice(idx + 1)));
      });
    });
    document.querySelectorAll('.lang-btn').forEach((b) => {
      b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false');
    });
  }

  function setLang(next) {
    if (next !== 'sv' && next !== 'en') return;
    lang = next;
    try { localStorage.setItem(LS_LANG, lang); } catch (_) { /* ignore */ }
    applyStatic();
    applyQuickLabels();
    if (welcomeBody && welcomeBody.parentNode) {
      clearNode(welcomeBody);
      welcomeBody.appendChild(renderMarkdown(t('welcome')));
    }
    if (state.queueLoaded) { cards.forEach((c) => updateCard(c, c.item)); renderQueue(); }
    else renderQueue();
    if (state.queueOffline) offlineEl.textContent = t('queue.offline');
  }
  document.querySelectorAll('.lang-btn').forEach((b) => b.addEventListener('click', () => setLang(b.getAttribute('data-lang'))));

  /* --------------------------------------------------------------------- init */
  applyStatic();
  buildQuick();
  showWelcome();
  autosize();
  renderQueue();
  loadHealth();
  refreshApprovals();
  setInterval(poll, POLL_MS);
  setInterval(loadHealth, HEALTH_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { poll(); loadHealth(); } });
  window.addEventListener('online', () => { poll(); loadHealth(); });
})();
