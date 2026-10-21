# REA report: Grodd

Base: `/Users/harryoscarsson/Documents/Hackathon/grodd/`. Line refs are relative to it.

**Snapshot note.** The tree changed during the run. `server.js` appeared at 17:48 and `lib/agent.js`/`lib/demo.js` changed at 17:47. Analysis A (digest `1382ed58…`, parent `ev_d82cd79c…`) predates `server.js`. Analysis B (digest `6ee6a435…`, parent `ev_84f18127…`, summary receipt `ev_088c87e6…`) is current. Findings below cite B unless marked A.

**Phase 2 status: BLOCKED, not pending.** The server was up (`/api/health` ok, mode `demo`), but `public/` is empty.

## Answers

- **(a) Secrets:** No hard-coded key. A grep for `sk-ant`, `x-api-key` and `Bearer` over the whole tree found nothing. The key is read from the env or `../.env` (`lib/agent.js:19-38`). It goes only in the `x-api-key` header to `API_URL` (`lib/agent.js:151,155`; REA endpoint row in `ev_864cf7c9…`). `public/` has no key-related code because it is empty.
- **(b) Routes:** `GET /api/health`, `POST /api/chat`, `POST /api/member-check`, `GET /api/approvals`, `POST /api/approvals/:id/{approve,reject}`, `POST /api/reset`, and static GET/HEAD for everything else (`server.js:107-172`). Binds 127.0.0.1 only (`server.js:213`). The only outbound destination is `api.anthropic.com/v1/messages` (`lib/agent.js:13`). The `https://mailto:…` string in `lib/knowledge.js:44` is text, not a request.
- **(c) DOM sinks:** None in `lib/` or `server.js`. Client-side sinks cannot be assessed because `public/` is empty.
- **(d) Process/FS:** No `child_process`, FS writes, or dynamic `require`/`import`. FS reads use fixed paths: `members.js:34,72-73,149`, `agent.js:23`, `server.js:12,165-170`.
- **(e) Traversal:** Protected. `server.js:159-166` applies a single-segment regex, an extension allowlist and a realpath containment check.
- **(f) Full emails or member list:** Neither is returned. `email_masked` comes from `maskEmail` (`members.js` base object). The `memberCheck` output maps to masked fields (`agent.js:333-352`). `queue.js:29-30` and `agent.js:315` redact drafts and replies. No export returns the member table (`members.js:152`).

## Findings

| Finding | Severity | Observed/Inferred | Evidence / file:line | Suggested fix |
|---|---|---|---|---|
| `public/` is empty, so `GET /` returns 404 JSON. The UI that Phase 2 drives does not exist. | High (demo) | Observed | `public/`; runtime curl; `server.js:156-172` | Add `public/index.html` with the quick-action buttons and chat input, then re-run Phase 2. |
| Browser scenario timed out after the schema was fixed. No DOM, console, network or storage captured. Likely cause is missing elements, which is inferred. | — | Observed (tool error) | `capture_browser_scenario` | Re-run once `public/` has the UI. |
| Unauthenticated local API: approve/reject, reset and member-check (which creates drafts) need no token. `GET /api/approvals` returned 35 items. | Low | Observed (GET); risk inferred | `server.js:107-155` | Acceptable on localhost. Add a per-run token if the port is ever exposed. |
| Host, Origin and Sec-Fetch-Site guards work. Spoofed Host gets 421, cross-origin POST gets 403. Guards apply only when headers are present, so a non-browser local client passes. | Info / Low | Observed (runtime); inferred for the gap | `server.js:13,181-186` | None required. |
| Traversal probes (`/../.env`, `%2e%2e%2f`) return 404. Not yet tested against a real file, because `public/` is empty. | Info | Observed (runtime) | `server.js:159-166` | Re-test after `public/` has files. |
| `fs.realpathSync` runs at module load. The server crashes at startup if `public/` is missing. | Low | Observed (code) | `server.js:12` | Create the directory or guard the call. |
| No DOM sinks, process spawning or FS writes in server-side code. | Info | Observed (grep) | `lib/`, `server.js` | None. |
| Full emails and member list not returned. Masking is applied at source and again on drafts and replies. Runtime scan of 35 approvals found 0 unmasked addresses and 0 key-shaped strings. | Info | Observed | `members.js` base; `agent.js:315,333-352`; `queue.js:29-30`; `ev_d2cb1d31…` | None. |
| `maskEmail` keeps the first character and full domain. Guest display names appear in member-check and approvals output. Acceptable only while data is fake (all addresses use `example.com`/`.org`). | Low | Observed | `safety.js:37-42`; `agent.js:340-348` | Keep fake data for the demo. |
| Demo mode is active, so the live LLM path and prompt-injection defences (`<untrusted_data>` wrap) are untested. | Unknown | Observed (mode); untested | `agent.js:86,130`; `knowledge.js:83` | Test the live path with a test key before claiming it. |
| `send()` sets Content-Length from a Buffer, so the byte count is correct for multi-byte text. | Info (cleared) | Observed (code) | `server.js:36-40` | None. |

## Coverage and limitations

- REA static analysis ran on both snapshots. The summary reports 45 findings and 2129 semantic unknowns (status unknown). I could not page the findings list: the view accepts only `modules` with `references`, plus `javascript-facts`. Endpoint and module facts came from `javascript-facts`.
- Static claims come from REA plus grep. Nothing was executed.
- Not tested: the POST routes (they mutate queue state, so I avoided them), live mode, the browser UI, browser XSS, and rate limiting.
- Browser scenario schema, learned from validation errors: `browser {mode:"launch", executable_path}`. Each action needs `step_id` and an `action` discriminator. Locators are `css` (`selector`), `role` (`role` plus a non-empty `name`) or `test_id`. `fill` value is `{source:"literal", value}`. `wait_for_timeout` takes `duration_ms`. Browser cleanup status is unknown.

## Phase 2, round 2 (test server 8788, coordinator GO)

This section supersedes the Phase 2 status above.

**Browser scenario did not complete.** It timed out twice. The first run hit 8787 before the UI existed. The second was the GO run on 8788 with real selectors. I did not retry, because the brief said ONE run and a retry could duplicate chat messages and drafts. Browser DOM, accessibility, console, network, storage and `inspect_web_event_listeners` evidence is therefore missing. The items below use static and HTTP evidence and are labelled as such.

Selectors, from `index.html` and `app.js`: Event `#quick-grid button.qa:nth-child(1)`, Member `:nth-child(4)`, input `#msg-input`, send `#send-btn`, approve `#queue-list .btn-approve:not([hidden])`.

- **(a) Payload rendering: inferred safe, not browser-observed.** `app.js` creates only `div`, `span`, `p`, `table`, `tr`, `td`, `th`, `strong`, `code`, `br`, `li`, `ul`, `h3`, `hr`, `blockquote`, `time`, `textarea` and `button`. It never creates `img`, `script`, `iframe`, `svg` or `object`. It sets no `src`, `href` or `on*` attributes. Text goes through `createTextNode` and `textContent` (`app.js:394-430`). A grep for `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function` and `href`/`src` assignment returned nothing.
- **(b) Request origins: static only.** The only external string in `public/` is the SVG namespace at `public/index.html:10`. Client fetches are relative: `/api/health`, `/api/chat`, `/api/member-check`, `/api/approvals` and `/api/approvals/:id/...`. HTTP 200 on 8788 for `/`, `/app.js` and `/styles.css`.
- **(c) Console errors and CSP violations: unknown.** The `/` response carries `script-src 'self'`, `style-src 'self'` and no `unsafe-inline`. `index.html` has one external `defer` script and no inline handlers or `style=` attributes, so no CSP violation is expected from markup. Nothing was observed in a browser.
- **(d) Storage keys: static.** Only `localStorage` is used, with one key, `grodd.lang` (`app.js:17`, read at 257, written at 1391 inside try/catch). No `sessionStorage`, IndexedDB or cookies appear in `public/`.
- **(e) Full emails or key strings: HTTP only.** `GET /api/approvals` on 8788 returned 57 items (56 pending, 1 published). It contained 0 unmasked addresses and 0 key-shaped strings. DOM text was not checked.
- **(f) Approve changed the DOM: not verified.** One item reads `published (simulated)`: `d6cc5f76-…`, created 15:58:09Z, decided 15:59:10Z, route `event`. The newest draft was created at 16:00:37Z. I cannot tell whether the timed-out scenario or the coordinator produced these. The server log would settle it, or a re-run once the browser works.

Evidence: REA re-analysis, snapshot C (digest `ec6ccccf…`), parent `ev_864c847b…`, summary receipt `ev_2e288592…`. It reports 128 findings over 19 files and 14 parsed JS files, application coverage partial. The static claims above rest on this plus grep.

**To close Phase 2:** when a re-run is approved, run one `capture_browser_scenario` against 8788, or open a Chrome with remote debugging so `list_browser_targets` and `inspect_web_page` can read it without actions.
