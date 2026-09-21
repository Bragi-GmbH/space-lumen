# Lumen Space

Create a new Space with the sanctioned generator (per the seven canonical roles in [`/docs/human/_shared/_grounding/naming-and-slugs.md`](/docs/human/_shared/_grounding/naming-and-slugs.md) §Spaces). The generator copies this template, substitutes owner-specific identity values, and emits the managed workflow and integrity metadata.

```bash
# From the repo root:
pnpm scaffold:space "Your Display Name" --owner bragi --role your-role
```

The generator substitutes the identity placeholders below. Replace `<DESCRIPTION>` manually after generation. Do not use a broad shell replacement: it can corrupt nested owner placeholders and the exact command syntax differs between GNU and BSD `sed`.

| Placeholder | Example | Where it appears |
|---|---|---|
| `bragi` | `bragi`, `skullcandy`, `bose` | `bragi.space.json`, `package.json`, AGENTS.md, all `docs/agentic/*.yaml` |
| `lumen` | `audio-apps`, `brand`, `shortcut` | Same files as `bragi` |
| `<SPACE>` | `audio-apps`, `wla-home`, `audio-apps-legacy` | Final directory name under `products/spaces/bragi/`; used in the generated `release-space-<owner>-<space>.yml` filename |
| `Lumen` | `Audio Apps`, `Brand Space`, `Shortcut Space` | AGENTS.md, briefing.md |
| `com.bragi.team.platform` | `com.bragi.team.platform` | AGENTS.md, all `docs/agentic/*.yaml` |
| `com.bragi.person.claude-rebase` | `com.bragi.person.claude-rebase` | `docs/agentic/ground.yaml` |
| `<DESCRIPTION>` | One-paragraph "what is this Space" | `docs/agentic/ground.yaml`, briefing.md |
| `2026-09-21` | `2026-04-26` | All `docs/agentic/*.yaml`, briefing.md `last_reviewed` |

Then:

1. Replace `<DESCRIPTION>` manually in `docs/agentic/ground.yaml` and `docs/human/briefing.md` (paragraph-level prose, doesn't sed cleanly).
2. Add the slug to `/docs/human/_shared/_grounding/naming-and-slugs.md` §Spaces if the role/owner combination is new.
3. The sanctioned generator emits the managed workflow at `.github/workflows/release-space-bragi-<SPACE>.yml`; `<SPACE>` is the final directory name under `products/spaces/bragi/`. Review that generated file and do not hand-edit it. Only add a shared matrix entry when the repository explicitly uses a matrix workflow instead of the per-Space managed workflow.
4. From the repo root: `pnpm install` to register the new workspace package.
5. From the new Space's directory: `pnpm check --json` to run the schema-only verifier.
6. From the new Space's directory: `pnpm dev` to verify the local Vite dev server boots.

## What ships in a Space sub-area

| File | Purpose |
|------|---------|
| `AGENTS.md` | Agent rules scoped to this Space's directory |
| `bragi.space.json` | Manifest source — `canonical_slug`, `version`, `space_role`, `capability_requirements`. CI reads this when registering releases. |
| `package.json` | Workspace package — Vite + React + `@bragi/sdk` |
| `vite.config.ts` | Build config; `base` is CDN-relative for OTA loading |
| `tsconfig.json` | Extends root tsconfig |
| `index.html` | Vite entry HTML |
| `src/main.tsx` | React mount point |
| `src/App.tsx` | Root component (replace with the Space's UI) |
| `@bragi/space-verifier` | Publishable schema-only `bragi space check` CLI used at commit zero |
| `docs/agentic/ground.yaml` | Machine-readable identity |
| `docs/agentic/status.yaml` | Maturity, health, deployments |
| `docs/agentic/open-questions.yaml` | Unresolved decisions |
| `docs/agentic/tasks.yaml` | Concrete actionable work |
| `docs/human/briefing.md` | What this Space is, for whom, why |

## Reference

- [PR #220](https://github.com/philippsonnleitner/bragi-platform-pm/pull/220) — Spaces architectural lock (AAP-15 / Invariant 6)
- [`/docs/human/_shared/_grounding/naming-and-slugs.md`](/docs/human/_shared/_grounding/naming-and-slugs.md) §Spaces — canonical role catalog
- [`/docs/agentic/schemas/space-manifest.schema.json`](/docs/agentic/schemas/space-manifest.schema.json) — the manifest schema
- [`/products/spaces/AGENTS.md`](/products/spaces/AGENTS.md) — sub-area rules
