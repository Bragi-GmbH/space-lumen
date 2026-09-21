---
title: "Lumen Space — Briefing"
owner: com.bragi.person.claude-rebase
created_by:
  - com.bragi.person.claude-rebase
team_slug: com.bragi.team.platform
canonical_slug: com.bragi.space.lumen
last_reviewed: 2026-09-21
---

# Lumen Space — Briefing

## What is this?

<DESCRIPTION>

## Who is it for?

End users of the host app — when the host loads this Space's `lumen` surface (a role slot in the host's nav for v2 role-spaces; the host's entire web UI for `single_space_v1_1`), this Space is what renders.

## Why does it exist?

Spaces are the OTA-deployable web-UI components the host app is composed of (PR #220 / AAP-15). The `lumen` Space exists because: <fill-in-one-paragraph-about-why-this-particular-role-exists>.

## How does it fit into the Bragi platform?

This Space is loaded by AppKit at runtime via a manifest fetched from Bragi Cloud (`GET /v1/spaces/com.bragi.space.lumen`). The manifest points to a signed bundle on the Supabase Storage CDN; AppKit verifies the bundle signature against `BRAGI_TRUSTED_BUNDLE_KEYS` before rendering. This Space communicates with the host app via `@bragi/sdk` postMessage.

Upstream dependencies: `@bragi/sdk`, AppKit's WebView host.
Downstream dependents: AppKit (and indirectly, every host app build that composes this Space).

## Status at a glance

| Aspect | State |
|--------|-------|
| Maturity | Experimental |
| Public surface | No (loaded only by AppKit) |
| Primary deploy target | Supabase Storage CDN (via `.github/workflows/release-space-bragi-lumen.yml`) |
| Docs up to date? | 2026-09-21 |

## Where to go next

- `docs/agentic/ground.yaml` — machine-readable metadata
- `bragi.space.json` — manifest source
- `AGENTS.md` — rules for AI agents working in this directory
- [`/docs/human/_shared/_grounding/naming-and-slugs.md`](/docs/human/_shared/_grounding/naming-and-slugs.md) §Spaces
