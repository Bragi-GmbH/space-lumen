# Lumen Space — Agent Rules

## Scope

- `products/spaces/bragi/lumen/**` — everything in this directory only. Do not cross into sibling Spaces, products, platform, or packages without explicit human approval.
- **Write access:** `com.bragi.team.platform`. Visiting agents from downstream repos: read-only (see [`/docs/human/_shared/_grounding/contributing.md`](/docs/human/_shared/_grounding/contributing.md) §"For a visiting agent").

## Identity

- **Canonical slug:** `com.bragi.space.lumen`
- **Category:** space
- **Package name:** `@bragi/space-lumen` — workspace packages are `@bragi`-scoped; the owner lives in the canonical slug only. Consequence: a slug suffix is globally unique across owners (two owners reusing one suffix would collide on the workspace package name — `pnpm install` fails loudly); pick a distinct suffix instead.
- **Team slug:** `com.bragi.team.platform`
- **Space kind:** `single_space_v1_1` — one bundle with internal routing; it does not occupy a role slot.

## Preflight checklist

Before writing any code here, read in order:

1. `docs/agentic/ground.yaml` — canonical metadata
2. `docs/human/briefing.md` — what this Space is and why it exists
3. `docs/agentic/open-questions.yaml` — unresolved decisions that may affect scope
4. `docs/agentic/status.yaml` — current deploy state
5. `bragi.space.json` — manifest source (don't edit `canonical_slug` — that's stable across renames)

## Reference rules (live elsewhere)

- **Canonical slugs / role catalog** → [`/docs/human/_shared/_grounding/naming-and-slugs.md`](/docs/human/_shared/_grounding/naming-and-slugs.md) §Spaces
- **Spaces architectural lock** → [PR #220](https://github.com/philippsonnleitner/bragi-platform-pm/pull/220) (AAP-15 / Invariant 6)
- **Manifest schema** → [`/docs/agentic/schemas/space-manifest.schema.json`](/docs/agentic/schemas/space-manifest.schema.json)
- **AppKit / SDK package boundaries** → [`/docs/agentic/platform/platform_rules.md`](/docs/agentic/platform/platform_rules.md) §6
- **Session-start rules (nerve system, person slugs, typed output)** → [`/AGENTS.md`](/AGENTS.md) Section A

## Invariants specific to this Space

- **No agents.** Spaces are UI-only. The `bragi.space.json` manifest forbids an `agents[]` field. If this Space needs to invoke an agent, dispatch through `@bragi/sdk` to an Audio App.
- **Foreground-only.** Spaces render when the user is actively looking at the phone. Logic that needs to run while the screen is locked belongs in an Audio App.
- **No hardcoded URLs.** This Space's bundle is loaded by AppKit via Cloud-served release records. Don't embed Vercel URLs or other absolute paths to Bragi-hosted content; use `@bragi/sdk` for any cross-Space communication.
- **Bundle-side signing.** This Space's release tarball is signed in CI. Do not introduce code that signs anything client-side or fetches verification keys at runtime — verification is AppKit's job.

## Build + release

- Local dev: `pnpm dev` — Vite dev server on a free port
- Commit-zero check: `pnpm check --json` — schema-only verifier with agent-readable findings
- Build: `pnpm build` — produces `dist/` static export
- Typecheck: `pnpm typecheck`
- Test: `pnpm test:run`
- Release: triggered via `.github/workflows/release-space-bragi-lumen.yml` (the workflow signs + uploads + registers automatically; do not run a release manually unless you have authorization)
