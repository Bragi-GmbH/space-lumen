#!/usr/bin/env node
/**
 * build-space-bundle.mjs — THE Space bundle recipe (space-ci packet,
 * rollout_revision 8): run the Space's production build and package the
 * static export into the deterministic tar.gz whose sha256 IS the release
 * candidate's `bundleDigest` (SP-21 D-18a "dual-run builds": the digest the
 * repo's own CI attests, and the digest the central publisher's independent
 * exact-SHA rebuild must reproduce byte-for-byte before anything is signed
 * or registered).
 *
 * WHY ONE SHARED SCRIPT (rollout_revision 8's reason to exist): candidate
 * b32831be-dee8-4056-bd47-76009f66e93b (space com.bragi.space.navigation,
 * commit d5cad9b16) was refused by the central publisher's D-18a gate even
 * though both pipelines ran textually identical install/build/tar steps on
 * the same node/npm/vite versions. Root cause — proven by per-file rebuild
 * comparison, not tar metadata: the two pipelines fed the build DIFFERENT
 * INPUT TREES. Tailwind CSS v4's automatic content detection scans the
 * whole project tree (including `.github/` and `.bragi/`, and honoring
 * `.gitignore`) for class candidates, so the emitted CSS — and through the
 * bundler's content-hash cascade, the JS chunk — is a function of every
 * file SITTING NEXT TO the source, not just `src/`. The packet workflow
 * builds in a real git checkout; the publisher rebuilt from an
 * actions/upload-artifact v4 directory round-trip, which since v4.4
 * silently EXCLUDES HIDDEN FILES by default — no dotfiles, different
 * Tailwind scan set, different CSS bytes, different digest. The packet's
 * own same-workspace build-twice check can never catch this class: within
 * one workspace the input tree is constant.
 *
 * The publisher's transport is fixed separately (it now ships the exact
 * checkout as a tarball, dotfiles included). THIS script is the
 * drift-proofing: from rollout_revision 8 on, the bundle recipe exists
 * exactly ONCE — vendored into every provisioned Space repo at
 * `.bragi/managed/space-ci/checks/build-space-bundle.mjs` (sha256-recorded
 * in packet-manifest.json, drift-gated by D-18c) and executed by the
 * central publisher from its OWN monorepo checkout of this same packet
 * revision directory (`managed-packets/space-ci/<revision>/checks/`), which
 * is byte-identical by construction (publish.mjs refuses a release whose
 * files don't match their recorded sha256). Neither side can drift without
 * the other refusing.
 *
 * CONTRACT — the resulting digest is a pure function of
 * (committed source tree, installed lockfile-pinned dependencies, this
 * recipe):
 *   - Dependencies are ALREADY INSTALLED by the caller. Install stays a
 *     workflow-authored step because it is the only step that may hold
 *     NODE_AUTH_TOKEN, and the packet's token posture (--ignore-scripts,
 *     workflow-authored .npmrc, token absent from the build) is job/step
 *     scoping this script must not absorb.
 *   - `.npmrc` is DELETED before the build on every path (registry auth is
 *     an install-time concern; deleting it here makes the at-build tree
 *     identical across pipelines regardless of which .npmrc — committed,
 *     or workflow-authored for install — was present a moment earlier, and
 *     guarantees no registry token literal is ever readable by the build).
 *   - The build output directory is removed before building (a fresh build
 *     every time, never an incremental residue).
 *   - The build runs WITHOUT NODE_AUTH_TOKEN in its environment even if
 *     the caller leaked it (defense in depth on top of step-level env
 *     scoping).
 *   - Packaging pins every archive-level source of variance, unchanged
 *     from the revision-7 recipe (digest-continuous with it): GNU tar
 *     `--sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0
 *     --numeric-owner --format=gnu` over the CONTENTS of the build output
 *     directory, piped through `gzip -n`, with LC_ALL=C and TZ=UTC pinned
 *     on the tar invocation so name sorting and time handling cannot vary
 *     with runner locale. GNU tar is REQUIRED (both pipelines run
 *     ubuntu-latest); this script fails closed with an actionable message
 *     on bsdtar/macOS rather than producing a differently-shaped archive.
 *   - KNOWN, ACCEPTED asymmetry: the packet workflow builds in a checkout
 *     that still contains `.git/`; the publisher's staged tree does not.
 *     Tailwind v4 (and every mainstream bundler) never scans `.git/`
 *     (verified empirically for this incident: identical output with and
 *     without it). A space whose build DID read `.git` would diverge and
 *     be refused by D-18a — fail closed, which is the correct outcome for
 *     a checkout-dependent build.
 *
 * Usage:
 *   node build-space-bundle.mjs --out <bundle.tar.gz> \
 *     [--source <dir>] [--build-out <dir>]        (defaults: cwd, dist)
 *
 * Prints `bundle_digest=<hex>` and `bundle_path=<path>` to stdout. Never
 * writes $GITHUB_OUTPUT itself — digests that feed job outputs stay
 * workflow-authored (the calling step re-hashes the bundle file), matching
 * the packet's "outputs are mapped only from workflow-authored steps"
 * posture.
 *
 * Exit codes: 0 success, 1 build/packaging failure, 2 usage error.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function fail(message, code = 1) {
  console.error(`::error::${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--source') args.source = argv[++i];
    else if (argv[i] === '--build-out') args.buildOut = argv[++i];
    else fail(`unknown argument: ${argv[i]} (usage: node build-space-bundle.mjs --out <bundle.tar.gz> [--source <dir>] [--build-out <dir>])`, 2);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.out) {
  fail('missing required --out <bundle.tar.gz> (usage: node build-space-bundle.mjs --out <bundle.tar.gz> [--source <dir>] [--build-out <dir>])', 2);
}
const outPath = path.resolve(args.out);
const sourceDir = path.resolve(args.source ?? '.');
const buildOut = args.buildOut ?? 'dist';
// The build-out is always a simple directory name inside the source tree —
// never a path that could escape it or alias the archive root.
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(buildOut)) {
  fail(`--build-out must be a plain directory name inside the source tree (got ${JSON.stringify(buildOut)})`, 2);
}

if (!existsSync(sourceDir)) fail(`source directory does not exist: ${sourceDir}`, 2);
process.chdir(sourceDir);
if (!existsSync('package.json')) {
  fail(`no package.json at the source root (${sourceDir}) — a provisioned Space repo is the Space (D-19), its package.json lives at the repo root.`);
}

// Same package-manager detection rules as the packet workflows (rev 3+):
// npm and pnpm supported, yarn fails closed, ambiguity fails closed.
const hasPnpm = existsSync('pnpm-lock.yaml');
const hasNpm = existsSync('package-lock.json');
const hasYarn = existsSync('yarn.lock');
if (hasYarn) {
  fail('yarn Spaces are not supported by the managed CI packet (see the packet workflow header) — use npm (package-lock.json) or pnpm (pnpm-lock.yaml).');
}
if (hasPnpm && hasNpm) {
  fail('multiple lockfiles present at the repo root — ambiguous package manager. Keep exactly one of pnpm-lock.yaml / package-lock.json.');
}
if (!hasPnpm && !hasNpm) {
  fail('no recognized lockfile (pnpm-lock.yaml or package-lock.json) at the repo root — cannot determine which package manager to use.');
}
const manager = hasPnpm ? 'pnpm' : 'npm';

// See CONTRACT above: registry/auth config is install-time-only; the tree
// the build sees is identical across pipelines with it gone, and no token
// literal survives into build scope.
rmSync('.npmrc', { force: true });
rmSync(buildOut, { recursive: true, force: true });

const buildEnv = { ...process.env };
delete buildEnv.NODE_AUTH_TOKEN;
const build = spawnSync(
  manager === 'pnpm' ? 'pnpm' : 'npm',
  manager === 'pnpm' ? ['build'] : ['run', 'build'],
  { stdio: 'inherit', env: buildEnv },
);
if (build.error) fail(`could not spawn ${manager}: ${build.error.message}`);
if (build.status !== 0) fail(`Space build failed (${manager} build exited ${build.status}).`);

if (!existsSync(path.join(buildOut, 'index.html'))) {
  fail(`Space build did not produce ${buildOut}/index.html — check the space's vite build config.`);
}

// The archive recipe requires GNU tar's determinism flags; bsdtar has no
// --sort/--owner equivalents that produce the same bytes. Both pipelines
// run ubuntu-latest where GNU tar is the system tar.
let tarVersion = '';
try {
  tarVersion = execFileSync('tar', ['--version'], { encoding: 'utf8' });
} catch (error) {
  fail(`could not run tar --version: ${error.message}`);
}
if (!tarVersion.includes('GNU tar')) {
  fail('the deterministic bundle recipe requires GNU tar (--sort=name/--owner/--mtime); this system tar is not GNU tar. On CI this never happens (ubuntu-latest ships GNU tar); locally, install gnu-tar and expose it as `tar`, or run inside a Linux container.');
}

const tmpDir = mkdtempSync(path.join(tmpdir(), 'space-bundle-'));
const tmpTar = path.join(tmpDir, 'bundle.tar');
try {
  execFileSync(
    'tar',
    [
      '--sort=name',
      '--mtime=UTC 1970-01-01',
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      '--format=gnu',
      '-cf', tmpTar,
      '-C', buildOut,
      '.',
    ],
    { env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' }, stdio: ['ignore', 'inherit', 'inherit'] },
  );
  // `gzip -n` omits the original name and stores mtime 0 — byte-identical
  // to the revision-7 `tar ... | gzip -n` pipeline for the same tar bytes.
  const gzipped = execFileSync('gzip', ['-n', '-c', tmpTar], { maxBuffer: 1024 * 1024 * 1024 });
  writeFileSync(outPath, gzipped);
  const digest = createHash('sha256').update(readFileSync(outPath)).digest('hex');
  console.log(`bundle_digest=${digest}`);
  console.log(`bundle_path=${outPath}`);
  console.log(`bundle_size_bytes=${gzipped.length}`);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
