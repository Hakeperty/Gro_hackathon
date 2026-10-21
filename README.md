# Grodd 🌱: an AI teammate for Gro Community

Grodd (Swedish for *sprout*) is a bilingual Swedish/English operations assistant for Gro Community, a non-profit startup community in Växjö. It drafts, checks and suggests. A human approves everything.

Built at the **Gro to the Future** Automation mini-hackathon, Växjö, 2026-10-21.

## What's in the repo

- [`gro-community-agent-brief.md`](gro-community-agent-brief.md): research and development brief, with sourced facts (§12.3)
- [`grodd-hackathon-kit.md`](grodd-hackathon-kit.md): Claude Project kit: instructions, demo script and pitch
- [`grodd/`](grodd/): the working demo app
- [`presentation/`](presentation/): pitch deck and runbook
- [`handout/`](handout/): one-page handout

## Quick start

```bash
node grodd/server.js
```

Then open **http://127.0.0.1:8787**.

- No install. Node 18+ is enough, and the app has no npm dependencies.
- Demo mode runs without an API key.
- For live mode, set `ANTHROPIC_API_KEY`, either in your shell or in `grodd/.env` (copy `grodd/.env.example`). Never commit `.env`.

## Architecture

1. **Haiku router** reads each request and picks a skill.
2. **Sonnet skills** write the drafts, in a bounded tool-use loop.
3. **Approval queue** holds every draft until a person approves it.
4. **Simulated publish** marks approved items as published. Nothing leaves the process.

Demo mode uses a keyword router and canned outputs, so it runs offline.

## Skills

- **Event → everywhere:** one sentence becomes a recurring Circle event series, plus Luma, LinkedIn (sv/en), Instagram and newsletter drafts, with a consistency check.
- **Site fix-list:** audits the site against known issues and returns a prioritised fix list with exact fix text.
- **Gro Pulse coach** (Impact tier): summarises weekly member Pulses, suggests one next step and one resource, and drafts kind nudges for members who missed pulses.
- **Member check:** compares the Luma guest list with the member register and flags guests to check. Read-only, with masked emails.
- **Fika Forecast ☕:** estimates Wednesday breakfast attendance and drafts a kanelbulle order, with a risk register. Just for fun.

## Safety & privacy

- **Fake demo data only.** The data in `grodd/data/` is fictional.
- **Draft-only.** Grodd cannot publish, send, approve, pay or change memberships.
- **Human approval.** Anything public, money-related or member-facing waits in the approval queue for a person.
- **Emails masked.** Addresses appear masked (for example `f***@example.com`) in replies and drafts.
- **No real member data.** No tool returns the member list.
- Before any push, run `./scripts/secret-scan.sh`.

## Sources

Research facts are sourced in the [brief](gro-community-agent-brief.md) (§12.3 Source list).

## Credits

Built with Claude (Anthropic).
