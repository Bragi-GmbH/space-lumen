#!/usr/bin/env node
// managed-by: space-ci packet (packet-manifest.json records the exact
// rollout_revision + per-file sha256 this file was provisioned at).
//
// THIS FILE IS PACKET-MANAGED — see ../workflows/space-build.yml's header
// for what that means (SP-21 D-18c: hand-edits are "managed_file_modified"
// drift, never silently overwritten, remediated by a bot PR).
//
// SP-21 slice 3 REAL integration check (space-ci/1 shipped a v1 skeleton
// that only asserted a package.json existed — this replaces it). Runs
// standalone: `node checks/integration-check.mjs <spaceDir>`. Exits 0 with
// every check green, exits 1 printing one actionable, per-failure message
// per problem found (never stops at the first failure) — the Portal's
// Overview-tab "what-is-missing" guidance (D-19 item 3) consumes exactly
// these messages.
//
// rollout_revision 5: fixes a real bug in 1/2/3/4's manifest step.
// `bragi.space.json` is an AUTHORED source file — this is proven by this
// very check's own next paragraph, which rejects `bundle`/`release_id` as
// "build-side fields the release pipeline fills in" (only meaningful if the
// file under test is authored, not released) — yet 1-4 validated it against
// @bragi-gmbh/space-sdk's `SpaceManifestSchema`, which describes the
// RELEASED/registered shape: it REQUIRES `version` + a `space_role` drawn
// from a 7-role enum, and knows nothing about `space_kind`. Two real Spaces
// failed for exactly this reason: `space_kind: 'single_space_v1_1'` Spaces
// (e.g. Bragi-GmbH/space-bose-legacy) are roleless BY DESIGN
// (products/portal/lib/actions/space-actions.ts: `space_role: kind ===
// 'single_space_v1_1' ? null : role`) and correctly omit `version` — rejected
// as "version — Required / space_role — Required". A role-space carrying the
// `bragi-ai` role (Bragi-GmbH/space-bragi-ai) is authored-valid per the
// authored schema's own role enum but was rejected by SpaceManifestSchema's
// narrower 7-role enum. `space-sdk@0.3.0` (PR #3113) ships the fix as a
// dedicated authored-side validator, `validateAuthoredManifest()` +
// `AuthoredSpaceManifestSchema` (packages/space-sdk/src/validation/
// authored-manifest.ts) — this step now calls that instead. The explicit
// `bundle`/`release_id` rejection below is UNCHANGED: it is this check's own
// authored-side strictness, deliberately left out of the SDK's Zod mirror
// (see authored-manifest.ts's own header comment) because a byte-faithful
// `additionalProperties: false` there would reject legacy role-space files
// that still carry `version` pending the manifest-first pipeline migration.
//
// rollout_revision 9 (this file) adds four independent checks, none of
// which change the behavior of any check from a prior revision:
//
//   a. bragi.areas.json becomes OPTIONAL for `space_kind: 'single_space_v1_1'`
//      Spaces WHEN THE FILE IS ABSENT. Every prior revision's
//      `readJsonFile(spaceDir, 'bragi.areas.json')` call used the default
//      `required: true`, so a `single_space_v1_1` Space — roleless AND
//      area-less by the same design cited above — could never pass this
//      check without authoring a placeholder area registry it has no use
//      for. `runIntegrationCheck` now reads `bragi.space.json` once up
//      front (rather than leaving that read encapsulated inside
//      `checkSpaceManifest`, as every prior revision did) specifically so
//      it can know `space_kind` before deciding whether the area registry
//      is required. If a `single_space_v1_1` Space DOES author
//      `bragi.areas.json` anyway, it is validated exactly as before — this
//      is an exemption from a requirement, not a ban.
//   b. checkNoTelemetryNetwork — ports scripts/check-space-no-telemetry-
//      network.mjs's per-Space sink scan (navigator.sendBeacon, WebSocket,
//      XMLHttpRequest, EventSource, and telemetry-endpoint string literals)
//      into the packet itself, scoped to `<space>/src/**` + `<space>/dist/**`
//      only. The standalone script ALSO scans the monorepo's own
//      products/sdk/src/space-telemetry.ts + dist chunks and imposes a
//      total `fetch(` ban on that one file — both dropped here as
//      redundant per-Space: the SDK is centrally authored and audited once,
//      not per fleet repo, and no fleet repo's checked-out tree contains
//      that path to scan in the first place. The standalone script's own
//      `test:publish-gate` wiring (docs/human/_shared/templates/space/
//      package.json) uses a monorepo-relative path
//      (`../../../../scripts/check-space-no-telemetry-network.mjs`) that
//      literally cannot resolve from a standalone fleet repo — this check
//      is what actually gates every provisioned Space repo, since this
//      file (unlike that path) is provisioned into every one of them.
//   c. checkTelemetryEmissionConsistency — a Space's own `bragi.telemetry.json`
//      declarations are cross-checked against what its own source actually
//      emits through the free-text escape hatch `emitSpaceTelemetry(name,
//      params)` (products/sdk/src/space-telemetry.ts). The SDK ALSO
//      auto-emits a fixed set of framework-lifecycle events
//      (SDK_FIXED_LIFECYCLE_EVENTS below) purely as a side effect of
//      `initSpaceTelemetry()`/`reportRenderHealth()` — never through a Space
//      calling `emitSpaceTelemetry()` itself — so those names are excluded
//      from BOTH directions of this cross-check: a Space is never required
//      to declare them (it does not control whether they fire), and never
//      flagged as "declared but never emitted" for omitting an
//      `emitSpaceTelemetry()` call site that could not exist. This is a
//      static, best-effort scan (a literal-string first argument to
//      `emitSpaceTelemetry(`) — a dynamically-computed event name cannot be
//      resolved without executing the Space's code, and is silently not
//      counted rather than guessed at.
//   d. checkConsumerLockDigest — `bragi.consumer.lock.json` (provisioned at
//      the Space repo's root by platform/cloud/lib/space-provisioning/
//      render.ts, described in that file's own comment as "wholly managed:
//      hand edits are replaced on the next run") records a `record_digest`
//      for the pinned `@bragi-gmbh/space-sdk` dependency. Until now, the
//      only thing ever checked about that value — by @bragi/space-verifier's
//      own `checkConsumerLock` (packages/space-verifier/src/index.ts) — was
//      its FORMAT (64-char lowercase hex), never its correctness. This
//      check recomputes the digest the same way the provisioning pipeline
//      itself computes it (`resolveSpaceSdkRecordDigestFromDisk()` in
//      trigger-runtime.ts: `sha256(readFileSync('packages/space-sdk/
//      package.json'))`, hashing the MONOREPO's own manifest bytes at
//      provisioning time) — except here it hashes the Space repo's own
//      ALREADY-INSTALLED `node_modules/@bragi-gmbh/space-sdk/package.json`,
//      which is the same file's bytes as published (release-package-space-
//      sdk.yml uses plain `npm publish --ignore-scripts`, never `pnpm
//      publish`'s `workspace:*` rewrite) — and reports a mismatch as an
//      actionable, non-fatal-to-other-checks issue rather than trusting the
//      lock file's own unverified claim.
//
// What it validates, in order:
//   1. bragi.space.json      — structurally, against @bragi-gmbh/space-sdk's
//                              validateAuthoredManifest()
//                              (AuthoredSpaceManifestSchema) — the AUTHORED
//                              counterpart of the released-shape
//                              SpaceManifestSchema — PLUS source-authored-only
//                              expectations the SDK schema deliberately
//                              leaves to this check: `bundle`/`release_id`
//                              are build-side fields a dev cannot set in a
//                              checked-in source manifest (docs/agentic/
//                              schemas/space-manifest.schema.json's own field
//                              descriptions).
//   2. bragi.areas.json      — the area registry, via @bragi-gmbh/space-sdk's
//                              validateAreaRegistry() (ajv structural pass,
//                              including the closed `capability_type`
//                              enum, PLUS the cross-cutting duplicate-id
//                              check ajv alone can't express). OPTIONAL when
//                              absent for `space_kind: 'single_space_v1_1'`
//                              (rollout_revision 9, item a above).
//   3. bragi.telemetry.json  — telemetry-declaration BLOCK PRESENCE (D-19
//                              item 3: "telemetry is part of the
//                              contract"). No formal schema exists for
//                              this yet (it is not part of the
//                              space-manifest.schema.json contract as of
//                              this packet revision) — this check is
//                              deliberately scoped to PRESENCE plus a
//                              minimal shape, not full validation.
//   4. bragi.area-assignments.json — cross-checked against the area
//                              registry from step 2: every assignment
//                              references a real area id, no duplicate
//                              area assignments, every `required: true`
//                              area has exactly one assignment entry, and
//                              every entry is an internally consistent
//                              "assigned" (names a populating app) or
//                              "unassigned" (carries a non-empty explicit
//                              placeholder label — D-19 item 4: unassigned
//                              areas render as explicit placeholders,
//                              never a silent gap). Same optionality as
//                              step 2, and for the same reason.
//   5. no-telemetry-network  — item b above.
//   6. telemetry emission consistency — item c above.
//   7. consumer-lock digest  — item d above.
//
// File-naming convention: this packet revision is the FIRST to define
// bragi.areas.json / bragi.telemetry.json / bragi.area-assignments.json —
// SP-21 slice 12 (area/template registry) shipped the schemas and
// validators in @bragi-gmbh/space-sdk but did not itself fix a per-space file
// naming convention for a provisioned repo. The names chosen here follow
// the existing `bragi.<x>.json` pattern (bragi.space.json,
// bragi.audioapp.json) and are considered part of THIS packet's contract
// with a Space repo until/unless a later slice (5/6, registration +
// provisioning) supersedes them.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const AREA_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TELEMETRY_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

// See item c above: names the SDK emits itself as a side effect of
// initSpaceTelemetry()/reportRenderHealth() — never through a Space's own
// emitSpaceTelemetry() call — cross-verified directly against
// products/sdk/src/space-telemetry.ts's internal emit(...) call sites at
// the time this revision was authored: space_session_start/_end,
// space_load_mark (both the 'first_paint'/'bundle_ready' marks from
// observeFirstPaint()/the bundle-ready path, and the 'space_boot' mark from
// reportRenderHealth()), space_js_error (emitSpaceJsError), space_render_failed
// (emitSpaceRenderFailed), composition_resolved/composition_unavailable
// (emitCompositionResolved/emitCompositionUnavailable), and app_tile_opened
// (emitAppTileOpened).
const SDK_FIXED_LIFECYCLE_EVENTS = new Set([
  'space_load_mark',
  'space_session_start',
  'space_session_end',
  'space_js_error',
  'space_render_failed',
  'composition_resolved',
  'composition_unavailable',
  'app_tile_opened',
]);

// item b above: telemetry sinks + non-fetch transports, ported from
// scripts/check-space-no-telemetry-network.mjs's SINK_PATTERNS (that
// script's own total `fetch(` ban on products/sdk/src/space-telemetry.ts is
// deliberately NOT ported — see this file's header).
const TELEMETRY_SINK_PATTERNS = [
  { pattern: /navigator\.sendBeacon/, label: 'navigator.sendBeacon' },
  { pattern: /new WebSocket\(/, label: 'new WebSocket(' },
  { pattern: /new XMLHttpRequest\(/, label: 'new XMLHttpRequest(' },
  { pattern: /\bEventSource\(/, label: 'EventSource(' },
  { pattern: /\/v1\/host-telemetry/, label: '/v1/host-telemetry' },
  { pattern: /\/v1\/events/, label: '/v1/events' },
  { pattern: /posthog/i, label: 'posthog' },
  { pattern: /sentry\.io/i, label: 'sentry.io' },
  { pattern: /\bingest\./i, label: 'ingest.' },
];
const NO_TELEMETRY_NETWORK_SRC_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.html', '.css']);
const NO_TELEMETRY_NETWORK_DIST_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.html', '.css']);

// item c above: a literal string first argument to emitSpaceTelemetry(...).
// Matches both quote styles; deliberately does not attempt to resolve a
// non-literal (variable/template) first argument — see this file's header.
const EMIT_SPACE_TELEMETRY_CALL_PATTERN = /\bemitSpaceTelemetry\(\s*(['"])([a-z][a-z0-9_]*)\1/g;
const EMISSION_SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

export class IntegrationCheckError extends Error {
  constructor(failures) {
    super(`integration check failed with ${failures.length} issue(s):\n  - ${failures.join('\n  - ')}`);
    this.name = 'IntegrationCheckError';
    this.failures = failures;
  }
}

/** NFC-normalized, lowercased collision key — mirrors @bragi-gmbh/space-sdk's own
 * validateAreaRegistry() duplicate-id convention (case- and
 * Unicode-normalization collisions count as duplicates), reproduced here
 * because the assignments cross-check below is this packet's own logic,
 * not part of the SDK's exported surface. */
function collisionKey(id) {
  return String(id).normalize('NFC').toLowerCase();
}

function readJsonFile(spaceDir, relPath, { required = true } = {}) {
  const abs = path.join(spaceDir, relPath);
  if (!existsSync(abs)) {
    if (required) {
      throw new IntegrationCheckError([
        `missing required file: ${relPath} (expected at ${abs})`,
      ]);
    }
    return undefined;
  }
  let raw;
  try {
    raw = readFileSync(abs, 'utf8');
  } catch (err) {
    throw new IntegrationCheckError([`cannot read ${relPath}: ${err.message}`]);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new IntegrationCheckError([`${relPath} is not valid JSON: ${err.message}`]);
  }
}

/** All files under dir (recursive) with an allowed extension. Returns []
 * (not a throw) for a nonexistent dir — callers decide whether that's
 * itself an issue. */
function collectFiles(dir, extensions) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(full, extensions));
      continue;
    }
    if (extensions.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

/**
 * @param {import('@bragi-gmbh/space-sdk')} sdk
 * @param {unknown} manifest — the already-parsed bragi.space.json (rollout_revision
 *   9: read once by runIntegrationCheck, not re-read here — see this file's
 *   header, item a).
 */
export function checkSpaceManifest(sdk, manifest) {
  const issues = [];
  // rollout_revision 5: validateAuthoredManifest() (space-sdk@0.3.0+) is the
  // AUTHORED-shape counterpart of SpaceManifestSchema — see this file's
  // header comment and packages/space-sdk/src/validation/authored-manifest.ts
  // for why the RELEASED-shape SpaceManifestSchema (used by 1/2/3/4) was
  // wrong here. Same {valid, issues} shape as checkAreaRegistry's
  // validateAreaRegistry() below, mapped into this check's own
  // "file: path [code] message" issue-reporting format for style parity.
  const { valid, issues: authoredIssues } = sdk.validateAuthoredManifest(manifest);
  if (!valid) {
    for (const issue of authoredIssues) {
      issues.push(`bragi.space.json: ${issue.path} [${issue.code}] ${issue.message}`);
    }
  }
  // Authored-manifest expectations even the AUTHORED schema does not itself
  // express (docs/agentic/schemas/space-manifest.schema.json: "bundle" /
  // "release_id" are "Build-side provenance — CI fills these; the dev cannot
  // set them" / "absent in source bragi.space.json files") — deliberately
  // left to this check rather than the SDK's Zod mirror (see
  // authored-manifest.ts's header: a byte-faithful `additionalProperties:
  // false` there would also reject legacy role-space files that still carry
  // `version` pending the manifest-first pipeline migration). UNCHANGED from
  // rollout_revision 4.
  if (manifest && typeof manifest === 'object' && !Array.isArray(manifest)) {
    if ('bundle' in manifest) {
      issues.push(
        'bragi.space.json: "bundle" is a build-side field the release pipeline fills in — a checked-in ' +
          'source manifest must not declare it.',
      );
    }
    if ('release_id' in manifest) {
      issues.push(
        'bragi.space.json: "release_id" is a build-side field the release pipeline fills in — a checked-in ' +
          'source manifest must not declare it.',
      );
    }
  }
  return issues;
}

/**
 * @param {import('@bragi-gmbh/space-sdk')} sdk
 * @param {{required?: boolean}} opts — rollout_revision 9: `required: false`
 *   lets the caller exempt `space_kind: 'single_space_v1_1'` Spaces that
 *   have not authored an area registry (this file's header, item a). When
 *   the file IS present, it is always validated regardless of `required`.
 * @returns {{issues: string[], registry: object|null}}
 */
export function checkAreaRegistry(sdk, spaceDir, { required = true } = {}) {
  const doc = readJsonFile(spaceDir, 'bragi.areas.json', { required });
  if (doc === undefined) {
    return { issues: [], registry: null };
  }
  const { valid, issues } = sdk.validateAreaRegistry(doc);
  if (valid) {
    return { issues: [], registry: doc };
  }
  return {
    issues: issues.map((issue) => `bragi.areas.json: ${issue.path} [${issue.code}] ${issue.message}`),
    registry: null,
  };
}

export function checkTelemetryDeclarations(spaceDir) {
  const doc = readJsonFile(spaceDir, 'bragi.telemetry.json');
  const issues = [];
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    issues.push('bragi.telemetry.json: must be a JSON object with a "declarations" array.');
    return issues;
  }
  if (!Array.isArray(doc.declarations) || doc.declarations.length === 0) {
    issues.push(
      'bragi.telemetry.json: "declarations" must be a non-empty array — declare every telemetry event ' +
        'name this Space\'s release commits to emitting (SP-21 D-19 item 3: telemetry is part of the contract).',
    );
    return issues;
  }
  doc.declarations.forEach((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      issues.push(`bragi.telemetry.json: declarations[${index}] must be an object.`);
      return;
    }
    if (typeof entry.name !== 'string' || !TELEMETRY_NAME_PATTERN.test(entry.name)) {
      issues.push(
        `bragi.telemetry.json: declarations[${index}].name must be a lower_snake_case event name (got ${JSON.stringify(entry.name)}).`,
      );
    }
    if (entry.producer_type !== undefined && entry.producer_type !== 'space') {
      issues.push(
        `bragi.telemetry.json: declarations[${index}].producer_type must be "space" when present (a Space only declares events it itself emits).`,
      );
    }
  });
  return issues;
}

/**
 * @param {{required?: boolean}} opts — see checkAreaRegistry's own doc; same
 *   flag, same reason (rollout_revision 9).
 */
export function checkAreaAssignments(spaceDir, registry, { required = true } = {}) {
  const doc = readJsonFile(spaceDir, 'bragi.area-assignments.json', { required });
  if (doc === undefined) {
    return [];
  }
  const issues = [];
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc) || !Array.isArray(doc.assignments)) {
    issues.push('bragi.area-assignments.json: must be a JSON object with an "assignments" array.');
    return issues;
  }
  if (!registry) {
    // The area registry itself already failed and reported its own
    // issues above — cross-checking against an unknown registry would
    // only produce noise, not actionable guidance.
    return issues;
  }
  const areas = Array.isArray(registry.areas) ? registry.areas : [];
  const areaIdByKey = new Map(
    areas.filter((a) => typeof a?.id === 'string').map((a) => [collisionKey(a.id), a.id]),
  );
  const seenAssignmentKeys = new Set();
  const coveredKeys = new Set();

  doc.assignments.forEach((entry, index) => {
    const at = `bragi.area-assignments.json: assignments[${index}]`;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      issues.push(`${at} must be an object.`);
      return;
    }
    if (typeof entry.area_id !== 'string' || !AREA_ID_PATTERN.test(entry.area_id)) {
      issues.push(`${at}.area_id must be a kebab-case area id (got ${JSON.stringify(entry.area_id)}).`);
      return;
    }
    const key = collisionKey(entry.area_id);
    if (!areaIdByKey.has(key)) {
      issues.push(`${at}.area_id ("${entry.area_id}") does not match any area declared in bragi.areas.json.`);
      return;
    }
    if (seenAssignmentKeys.has(key)) {
      issues.push(`${at}.area_id ("${entry.area_id}") is assigned more than once.`);
      return;
    }
    seenAssignmentKeys.add(key);
    coveredKeys.add(key);

    if (entry.status === 'assigned') {
      if (typeof entry.app_slug !== 'string' || entry.app_slug.length === 0) {
        issues.push(`${at}: status "assigned" requires a non-empty "app_slug" naming the populating audio app.`);
      }
      if (entry.placeholder_label !== undefined) {
        issues.push(`${at}: status "assigned" must not carry "placeholder_label" (that is the unassigned case).`);
      }
    } else if (entry.status === 'unassigned') {
      if (typeof entry.placeholder_label !== 'string' || entry.placeholder_label.length === 0) {
        issues.push(
          `${at}: status "unassigned" requires a non-empty "placeholder_label" — unassigned areas render as an ` +
            'explicit placeholder (e.g. "assigned in the host app"), never a silent gap (SP-21 D-19 item 4).',
        );
      }
      if (entry.app_slug !== undefined) {
        issues.push(`${at}: status "unassigned" must not carry "app_slug".`);
      }
    } else {
      issues.push(`${at}.status must be "assigned" or "unassigned" (got ${JSON.stringify(entry.status)}).`);
    }
  });

  for (const area of areas) {
    if (area?.required !== true || typeof area.id !== 'string') continue;
    const key = collisionKey(area.id);
    if (!coveredKeys.has(key)) {
      issues.push(
        `bragi.area-assignments.json: required area "${area.id}" has no assignment entry — every required area ` +
          'must be present as either "assigned" or an explicit "unassigned" placeholder.',
      );
    }
  }

  return issues;
}

/** item b above (rollout_revision 9): telemetry sinks + non-fetch
 * transports, scoped to this Space's own src/ + dist/. Non-throwing —
 * a missing src/ or dist/ at the point this check runs (after the
 * workflow's own "Build Space"/"Verify static export shape" steps) would
 * be a genuine anomaly, reported as an issue rather than crashing the rest
 * of the check suite. */
export function checkNoTelemetryNetwork(spaceDir) {
  const issues = [];
  const srcDir = path.join(spaceDir, 'src');
  const distDir = path.join(spaceDir, 'dist');
  if (!existsSync(srcDir)) {
    issues.push(`no-telemetry-network: no src/ under ${spaceDir} — run from a Space package root.`);
    return issues;
  }
  if (!existsSync(distDir)) {
    issues.push(`no-telemetry-network: no dist/ under ${spaceDir} — this check runs after the build step and expects the shipped artifact.`);
    return issues;
  }
  const files = [
    ...collectFiles(srcDir, NO_TELEMETRY_NETWORK_SRC_EXTENSIONS),
    ...collectFiles(distDir, NO_TELEMETRY_NETWORK_DIST_EXTENSIONS),
  ];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const { pattern, label } of TELEMETRY_SINK_PATTERNS) {
      if (!pattern.test(content)) continue;
      const lines = [];
      content.split('\n').forEach((line, i) => {
        if (pattern.test(line)) lines.push(i + 1);
      });
      issues.push(
        `no-telemetry-network: ${path.relative(spaceDir, file)}:${lines.length > 0 ? lines.join(',') : '?'} — ` +
          `${label} — a Space has no direct network access for telemetry; emission is exclusively the ` +
          'window.bragi.reportTelemetry bridge.',
      );
    }
  }
  return issues;
}

/** item c above (rollout_revision 9): cross-checks bragi.telemetry.json's
 * declarations against this Space's own emitSpaceTelemetry(...) call sites
 * under src/. Non-throwing; a malformed bragi.telemetry.json is already
 * reported by checkTelemetryDeclarations, so this function quietly no-ops
 * on a shape it cannot make sense of rather than duplicating that noise. */
export function checkTelemetryEmissionConsistency(spaceDir) {
  const issues = [];
  const doc = readJsonFile(spaceDir, 'bragi.telemetry.json', { required: false });
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || !Array.isArray(doc.declarations)) {
    return issues;
  }
  const declared = new Set(
    doc.declarations
      .map((entry) => (entry && typeof entry === 'object' ? entry.name : undefined))
      .filter((name) => typeof name === 'string' && TELEMETRY_NAME_PATTERN.test(name)),
  );

  const srcDir = path.join(spaceDir, 'src');
  if (!existsSync(srcDir)) {
    return issues;
  }
  const emitted = new Set();
  for (const file of collectFiles(srcDir, EMISSION_SCAN_EXTENSIONS)) {
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(EMIT_SPACE_TELEMETRY_CALL_PATTERN)) {
      emitted.add(match[2]);
    }
  }

  for (const name of emitted) {
    if (SDK_FIXED_LIFECYCLE_EVENTS.has(name)) continue;
    if (!declared.has(name)) {
      issues.push(
        `bragi.telemetry.json: "${name}" is emitted via emitSpaceTelemetry(...) in src/ but not declared in ` +
          '"declarations" — declare every event this Space\'s release commits to emitting (SP-21 D-19 item 3).',
      );
    }
  }
  for (const name of declared) {
    if (SDK_FIXED_LIFECYCLE_EVENTS.has(name)) continue;
    if (!emitted.has(name)) {
      issues.push(
        `bragi.telemetry.json: "${name}" is declared but no emitSpaceTelemetry("${name}", ...) call site was ` +
          'found under src/ — remove the stale declaration, or add the emission (a dynamically-computed event ' +
          'name cannot be verified by this static scan and is never flagged here).',
      );
    }
  }
  return issues;
}

/** item d above (rollout_revision 9): recomputes bragi.consumer.lock.json's
 * record_digest the same way platform/cloud/lib/space-provisioning/
 * trigger-runtime.ts's resolveSpaceSdkRecordDigestFromDisk() computes it —
 * sha256 of the pinned package's own package.json bytes — except against
 * THIS repo's already-installed copy, and reports a mismatch instead of
 * trusting the lock file's self-reported digest (which
 * @bragi/space-verifier's checkConsumerLock only ever validates the FORMAT
 * of, never the correctness). Non-throwing. */
export function checkConsumerLockDigest(spaceDir) {
  const issues = [];
  const lock = readJsonFile(spaceDir, 'bragi.consumer.lock.json');
  if (lock && typeof lock === 'object' && lock.lock_version !== '1') {
    issues.push(`bragi.consumer.lock.json: lock_version must be "1" (got ${JSON.stringify(lock.lock_version)}).`);
  }
  const record = lock && typeof lock === 'object' ? lock.packages?.['@bragi-gmbh/space-sdk'] : undefined;
  if (!record || typeof record.record_digest !== 'string') {
    issues.push(
      'bragi.consumer.lock.json: missing packages["@bragi-gmbh/space-sdk"].record_digest — this file is wholly ' +
        'managed by the provisioning pipeline (hand edits are replaced on the next run); wait for/trigger a ' +
        'provisioning or drift-remediation PR.',
    );
    return issues;
  }
  const installedPackageJsonPath = path.join(spaceDir, 'node_modules', '@bragi-gmbh', 'space-sdk', 'package.json');
  if (!existsSync(installedPackageJsonPath)) {
    issues.push(
      `bragi.consumer.lock.json: cannot verify record_digest — no installed package.json found at ` +
        `${installedPackageJsonPath} (dependencies not installed?).`,
    );
    return issues;
  }
  const actualDigest = createHash('sha256').update(readFileSync(installedPackageJsonPath)).digest('hex');
  if (actualDigest !== record.record_digest) {
    issues.push(
      `bragi.consumer.lock.json: record_digest (${record.record_digest}) does not match the sha256 of the ` +
        `currently installed @bragi-gmbh/space-sdk/package.json (${actualDigest}) — the lock file is stale. It ` +
        'is wholly managed by platform/cloud/lib/space-provisioning/render.ts (hand edits are replaced on the ' +
        'next run) — wait for/trigger a provisioning or drift-remediation PR to refresh it.',
    );
  }
  return issues;
}

/** Loads @bragi-gmbh/space-sdk with an actionable error if it cannot resolve —
 * a provisioned Space repo depends on it as a real npm package (SP-21
 * D-18f layer 1: "Contracts = a published package dependency, never a
 * vendored folder"), so an unresolved import here means the repo's own
 * dependency setup is broken, not this check.
 *
 * rollout_revision 5 ALSO requires the resolved package to actually export
 * `validateAuthoredManifest` — that export only exists from
 * @bragi-gmbh/space-sdk@0.3.0 onward (PR #3113). The packet-manifest schema
 * (manifest_schema_version 1, see scripts/managed-packets/publish.mjs's
 * validateManifestShape) has no field for declaring a minimum dependency
 * version, so this is the only place that requirement can be encoded: fail
 * closed with a clear upgrade instruction instead of letting a Space repo
 * pinned to an older space-sdk hit an opaque `sdk.validateAuthoredManifest
 * is not a function` TypeError deep inside checkSpaceManifest. */
async function loadSpaceSdk() {
  let sdk;
  try {
    sdk = await import('@bragi-gmbh/space-sdk');
  } catch (err) {
    throw new IntegrationCheckError([
      `cannot resolve "@bragi-gmbh/space-sdk" (${err.message}) — a provisioned Space repo must declare it as a ` +
        'real dependency (run your package manager\'s install, e.g. `npm ci`, `pnpm install`, or `yarn install`).',
    ]);
  }
  if (typeof sdk.validateAuthoredManifest !== 'function') {
    throw new IntegrationCheckError([
      'the installed "@bragi-gmbh/space-sdk" does not export validateAuthoredManifest(...) — this space-ci ' +
        'packet revision (5) validates bragi.space.json as an AUTHORED manifest and requires that export. ' +
        'Upgrade @bragi-gmbh/space-sdk to >=0.3.0 (run your package manager\'s update/install for ' +
        '"@bragi-gmbh/space-sdk", e.g. `npm install @bragi-gmbh/space-sdk@latest`, `pnpm add ' +
        '@bragi-gmbh/space-sdk@latest`, or `yarn add @bragi-gmbh/space-sdk@latest`).',
    ]);
  }
  return sdk;
}

export async function runIntegrationCheck(spaceDir) {
  const sdk = await loadSpaceSdk();
  const failures = [];

  // rollout_revision 9: read once, up front — see this file's header,
  // item a, for why (space_kind must be known before deciding whether
  // bragi.areas.json is required).
  const manifest = readJsonFile(spaceDir, 'bragi.space.json');
  failures.push(...checkSpaceManifest(sdk, manifest));

  const spaceKind = manifest && typeof manifest === 'object' && !Array.isArray(manifest) ? manifest.space_kind : undefined;
  const areasFileExists = existsSync(path.join(spaceDir, 'bragi.areas.json'));
  const areasRequired = !(spaceKind === 'single_space_v1_1' && !areasFileExists);

  const { issues: areaIssues, registry } = checkAreaRegistry(sdk, spaceDir, { required: areasRequired });
  failures.push(...areaIssues);
  failures.push(...checkTelemetryDeclarations(spaceDir));
  failures.push(...checkAreaAssignments(spaceDir, registry, { required: areasRequired }));
  failures.push(...checkNoTelemetryNetwork(spaceDir));
  failures.push(...checkTelemetryEmissionConsistency(spaceDir));
  failures.push(...checkConsumerLockDigest(spaceDir));
  return failures;
}

async function main() {
  const spaceDir = process.argv[2];
  if (!spaceDir) {
    console.error('usage: node checks/integration-check.mjs <spaceDir>');
    process.exitCode = 2;
    return;
  }
  if (!existsSync(spaceDir)) {
    console.error(`integration-check: no such directory: ${spaceDir}`);
    process.exitCode = 1;
    return;
  }
  try {
    const failures = await runIntegrationCheck(spaceDir);
    if (failures.length > 0) {
      for (const failure of failures) {
        console.error(`integration-check: ✗ ${failure}`);
      }
      console.error(`\nintegration-check: ${failures.length} issue(s) found.`);
      process.exitCode = 1;
      return;
    }
    console.log(
      'integration-check: OK — manifest, area registry, telemetry declarations, area-assignment consistency, ' +
        'no-telemetry-network, telemetry emission consistency, and consumer-lock digest are all valid (space-ci packet).',
    );
  } catch (err) {
    if (err instanceof IntegrationCheckError) {
      for (const failure of err.failures) {
        console.error(`integration-check: ✗ ${failure}`);
      }
      process.exitCode = 1;
      return;
    }
    console.error(`integration-check: unexpected error: ${err.stack ?? err.message}`);
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  main();
}
