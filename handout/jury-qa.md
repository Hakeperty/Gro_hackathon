# Grodd: jury Q&A

Sources: **kit** = `grodd-hackathon-kit.md`; **brief** = `gro-community-agent-brief.md` (section numbers as given).

## 1. Is it safe with member data?

Grodd only drafts: a human approves anything public, money-related, a membership decision, an introduction or a personal-data export. Text inside pasted emails or posts is treated as data, not instructions, each worker gets least-privilege tools, and there are no bulk export tools.

*Sources: brief §8.5, §10; kit §2, §5.*

## 2. Is it GDPR-compliant?

Not fully yet, and we say so: matching is opt-in only, under-18s are never profiled or matched, and a human always decides on membership changes. Before launch we still need to sign DPAs with the processors, publish an AI notice, and replace Circle's generic US terms with Gro's own privacy notice.

*Sources: brief §9.1, §10; kit §2 (known issues).*

## 3. What does it cost to run?

Haiku handles routing and Sonnet only writes the drafts, so each step uses the model it needs. We have not put a running-cost figure on it yet; confirming the Circle and Luma plans and API access is the first MVP step.

*Sources: brief §1, §9.1.*

## 4. Is it really connected to Circle?

Not yet: the demo runs in a Claude Project, and hooking it into Circle's official API is the next step. We will integrate only through Circle's official API, webhooks or Zapier, because Circle's terms ban bots and scrapers.

*Sources: kit §4, §5; brief §10.*

## 5. What is real and what is simulated?

The drafts are live Claude output from the demo prompts, run on fake member data only. The publish step is simulated, because the demo is a Claude Project that is not yet connected to Circle.

*Sources: kit §1, §3, §4, §5.*

## 6. How much time does it save?

Each week one event is set up once instead of four or five times, cloned posts go to zero, and FAQ answers come off the operator's desk. The target is at least a 50% cut in event setup time, with the baseline to be measured in week 1.

*Sources: kit §5; brief §9.1.*

## 7. Does it work in Swedish?

Yes: Grodd replies in the user's language, Swedish or English, and its LinkedIn event posts come in both. The first demo prompt is in Swedish, so the jury can see it working.

*Sources: kit §2, §3; brief §9.0.*

## 8. What's next?

After the 2-week MVP, the plan is Circle API plus Luma webhooks, a member-ticket check (free Luma member tickets are not verified today), and a monthly board and funder report.

*Sources: kit §5; brief §9.1–9.2.*
