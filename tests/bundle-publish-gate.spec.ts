/**
 * C1 — Playwright publish gate
 *
 * Checks that must pass before any bundle is published.
 * These run in CI against the built dist/; run `pnpm build` first
 * (and `pnpm --filter @bragi/sdk build` — the bundle inlines the sdk dist).
 *
 * C1a: Zero failed asset requests (network failures + 4xx/5xx responses) under hash-keyed origin
 * C1b: Bundle renders shell without network access AND calls reportRenderHealth('bundle_render_ok')
 * C1c: Built files contain no absolute path refs or service-worker registration
 * C1d: G1a embedded telemetry liveness — boot marks + session_start cross the
 *      window.bragi.reportTelemetry bridge within the same 3s window; every
 *      envelope validates against @bragi-gmbh/space-sdk's runtime schema; seq
 *      strictly increasing; zero telemetry-shaped network egress attempted
 * C1e: G1a error path — window error + unhandledrejection produce
 *      space_js_error envelopes carrying a hash ONLY (message text never
 *      crosses the bridge)
 *
 * A bundle that stops emitting (init removed, module tree-shaken, bridge call
 * renamed) times out C1d — telemetry is a release gate, not a convention.
 * The static half of the no-network gate is
 * scripts/check-space-no-telemetry-network.mjs, wired before this suite in
 * `test:publish-gate`.
 */

import { test, expect } from '@playwright/test'
import { createServer } from 'http'
import { createReadStream, existsSync, readdirSync, readFileSync } from 'fs'
import { extname, join, resolve as resolvePath, sep } from 'path'
import { fileURLToPath } from 'url'
import { AddressInfo } from 'net'
import { spaceTelemetryEnvelopeSchema } from '@bragi-gmbh/space-sdk'
import type { SpaceTelemetryEnvelope } from '@bragi-gmbh/space-sdk'
import {
  blockAndRecordNonBundleRequests,
  installMockBridge,
  telemetryShapedUrls,
} from './helpers/mock-bridge'

const DIST_DIR = join(fileURLToPath(import.meta.url), '../../dist')
const BUNDLE_HASH = 'test-bundle-0000'   // stable test slug — production uses real SHA-256
// Canonical space slug (U3 identity): every envelope must assert exactly this
// — the space's own identity, never a host/org/brand claim. Filled by the
// scaffold; must match the initSpaceTelemetry({ spaceSlug }) in src/main.tsx.
const SPACE_SLUG = 'com.bragi.space.lumen'

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
}

// Starts a static server that serves dist/ at /<bundleHash>/
async function startHashKeyedServer(): Promise<{ url: string; bundlePrefix: string; close: () => void }> {
  const server = createServer((req, res) => {
    const prefix = `/${BUNDLE_HASH}`
    const pathname = req.url?.split('?')[0] ?? '/'
    if (!pathname.startsWith(prefix)) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    const relative = pathname.slice(prefix.length) || '/index.html'
    const filePath = resolvePath(DIST_DIR, '.' + (relative === '/' ? '/index.html' : relative))
    // Containment check: a `../` in the URL must never escape dist/. Test-only
    // server, but the pattern gets copied — keep it safe by construction.
    if (!filePath.startsWith(resolvePath(DIST_DIR) + sep)) {
      res.writeHead(403)
      res.end('forbidden')
      return
    }
    if (!existsSync(filePath)) {
      res.writeHead(404)
      res.end(`not found: ${relative}`)
      return
    }
    const ext = extname(filePath)
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
    createReadStream(filePath).pipe(res)
  })

  await new Promise<void>((resolve) => server.listen(0, resolve))
  const port = (server.address() as AddressInfo).port
  const bundlePrefix = `http://localhost:${port}/${BUNDLE_HASH}/`
  return {
    url: `${bundlePrefix}index.html`,
    bundlePrefix,
    close: () => server.close(),
  }
}

// ── C1a ───────────────────────────────────────────────────────────────────────
test('C1a: zero asset failures under hash-keyed origin', async ({ page }) => {
  const { url, close } = await startHashKeyedServer()
  try {
    const failed: string[] = []
    // Network-level failures (DNS, connection refused, timeout)
    page.on('requestfailed', (r) => failed.push(`FAILED ${r.url()}`))
    // HTTP 4xx/5xx responses — these are successful network requests but broken assets
    page.on('response', (r) => {
      if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`)
    })
    await page.goto(url)
    await page.waitForLoadState('networkidle')
    expect(failed, `Failed or error responses: ${failed.join(', ')}`).toEqual([])
  } finally {
    close()
  }
})

// ── C1b ───────────────────────────────────────────────────────────────────────
test('C1b: bundle renders shell without network (degraded-offline premise)', async ({ page }) => {
  const { url, bundlePrefix, close } = await startHashKeyedServer()
  try {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    // Block all requests that are NOT under the exact bundle hash path AND
    // record every blocked URL (runtime layer of the no-network gate).
    const blocked = await blockAndRecordNonBundleRequests(page, bundlePrefix)

    // Inject the mock bragi bridge before page load so the bundle can call reportRenderHealth
    await installMockBridge(page)

    await page.goto(url)

    // Bundle must call reportRenderHealth({ type: 'bundle_render_ok' }) within 3s (appkit contract)
    await page.waitForFunction(
      () => {
        const calls = (window as Window & { __healthCalls?: unknown[] }).__healthCalls
        return Array.isArray(calls) && calls.length > 0
      },
      { timeout: 3000 },
    )

    const calls = await page.evaluate(
      () => (window as Window & { __healthCalls?: unknown[] }).__healthCalls,
    )
    expect(calls?.[0]).toMatchObject({ type: 'bundle_render_ok' })
    expect(errors, `Page JS errors: ${errors.join(', ')}`).toEqual([])

    // No-network gate (runtime layer): nothing telemetry-shaped was even attempted
    const shaped = telemetryShapedUrls(blocked)
    expect(shaped, `telemetry-shaped egress attempted: ${shaped.join(', ')}`).toEqual([])
  } finally {
    close()
  }
})

// ── C1d ───────────────────────────────────────────────────────────────────────
test('C1d: embedded telemetry set crosses the bridge within 3s (release-gate liveness)', async ({ page }) => {
  const { url, bundlePrefix, close } = await startHashKeyedServer()
  try {
    const blocked = await blockAndRecordNonBundleRequests(page, bundlePrefix)
    await installMockBridge(page)
    await page.goto(url)

    // Deterministic embedded set only (first_paint / anything endpoint-timed is
    // deliberately NOT asserted — it would make the release gate flaky and
    // pressure someone to weaken it). A bundle that stops emitting times out here.
    await page.waitForFunction(
      (slug) => {
        const calls = (window as Window & {
          __telemetryCalls?: Array<{ name?: string; producer_slug?: string; params?: Record<string, unknown> }>
        }).__telemetryCalls
        if (!Array.isArray(calls)) return false
        const hasMark = (m: string) =>
          calls.some((c) => c?.name === 'space_load_mark' && c?.params?.mark === m)
        const hasSessionStart = calls.some(
          (c) =>
            c?.name === 'space_session_start' &&
            c?.producer_slug === slug &&
            typeof c?.params?.session_id === 'string' &&
            (c.params.session_id as string).length > 0,
        )
        return hasMark('bundle_ready') && hasMark('space_boot') && hasSessionStart
      },
      SPACE_SLUG,
      { timeout: 3000 },
    )

    const envelopes =
      ((await page.evaluate(
        () => (window as Window & { __telemetryCalls?: unknown[] }).__telemetryCalls,
      )) ?? []) as unknown[]
    expect(envelopes.length).toBeGreaterThan(0)

    // Every recorded envelope validates against the @bragi/contract runtime
    // schema — drift between the sdk module (build-time inlined type) and the
    // contract turns this gate red.
    for (const envelope of envelopes) {
      const parsed = spaceTelemetryEnvelopeSchema.safeParse(envelope)
      expect(
        parsed.success,
        `envelope failed contract schema: ${JSON.stringify(envelope)}\n${parsed.success ? '' : parsed.error.message}`,
      ).toBe(true)
    }

    const typed = envelopes as SpaceTelemetryEnvelope[]

    // U3: every envelope asserts SPACE identity only — the canonical slug
    for (const e of typed) {
      expect(e.producer_type).toBe('space')
      expect(e.producer_slug).toBe(SPACE_SLUG)
    }

    // seq strictly increasing (a gap/duplicate corrupts the host's loss signal)
    for (let i = 1; i < typed.length; i++) {
      expect(typed[i].seq, `seq not strictly increasing at index ${i}`).toBeGreaterThan(typed[i - 1].seq)
    }

    // No-network gate (runtime layer, strongest form): emission demonstrably
    // happened while zero telemetry-shaped network egress was even attempted.
    const shaped = telemetryShapedUrls(blocked)
    expect(shaped, `telemetry-shaped egress attempted: ${shaped.join(', ')}`).toEqual([])
  } finally {
    close()
  }
})

// ── C1e ───────────────────────────────────────────────────────────────────────
test('C1e: error path — space_js_error crosses the bridge hash-only', async ({ page }) => {
  const { url, bundlePrefix, close } = await startHashKeyedServer()
  try {
    await blockAndRecordNonBundleRequests(page, bundlePrefix)
    await installMockBridge(page)
    await page.goto(url)

    // Wait for boot so initSpaceTelemetry's global handlers are installed.
    await page.waitForFunction(
      () => {
        const calls = (window as Window & { __telemetryCalls?: Array<{ name?: string }> }).__telemetryCalls
        return Array.isArray(calls) && calls.some((c) => c?.name === 'space_session_start')
      },
      { timeout: 3000 },
    )

    // Non-React error surfaces: a window ErrorEvent and an unhandled rejection.
    // The secret marker must NEVER appear in any envelope (hash-only identity).
    await page.evaluate(() => {
      window.dispatchEvent(new ErrorEvent('error', { error: new Error('gate-c1e-secret') }))
      void Promise.reject(new Error('gate-c1e-secret-rejection'))
    })

    await page.waitForFunction(
      () => {
        const calls =
          (window as Window & { __telemetryCalls?: Array<{ name?: string; params?: Record<string, unknown> }> })
            .__telemetryCalls ?? []
        const hasKind = (k: string) =>
          calls.some((c) => c?.name === 'space_js_error' && c?.params?.kind === k)
        return hasKind('error') && hasKind('unhandledrejection')
      },
      { timeout: 3000 },
    )

    const envelopes =
      (((await page.evaluate(
        () => (window as Window & { __telemetryCalls?: unknown[] }).__telemetryCalls,
      )) ?? []) as SpaceTelemetryEnvelope[])

    const jsErrors = envelopes.filter((e) => e.name === 'space_js_error')
    expect(jsErrors.length).toBeGreaterThanOrEqual(2)
    for (const e of jsErrors) {
      expect(typeof e.params.error_hash).toBe('string')
      expect((e.params.error_hash as string).length).toBeGreaterThan(0)
    }

    // Hash-only falsifier: error message text never crosses the bridge.
    for (const e of envelopes) {
      expect(JSON.stringify(e)).not.toContain('gate-c1e-secret')
    }
  } finally {
    close()
  }
})

// ── C1c ───────────────────────────────────────────────────────────────────────
test('C1c: no absolute path refs or service-worker registration in built bundle', () => {
  const ABSOLUTE_PATTERNS = [
    { pattern: /src=["']\//, label: 'src="/' },
    { pattern: /href=["']\/(?!\/|http)/, label: 'href="/' },
    // srcset is comma-separated candidates — an absolute URL may be the first
    // candidate OR follow any comma (the optional greedy prefix backtracks
    // through every comma, so any candidate position is checked)
    { pattern: /srcset=["'](?:[^"']*,)?\s*\/(?!\/)/, label: 'srcset="/' },
    { pattern: /poster=["']\//, label: 'poster="/' },
    // CSS url( with absolute path — allow data: and http: URLs; cover both quoted and unquoted forms
    { pattern: /url\(["']?\/(?!\/|https?:)/, label: 'url(/' },
    // CSS @import with a bare string (the url() form is caught above)
    { pattern: /@import\s+["']\/(?!\/)/, label: '@import "/' },
    // URL-bearing object keys (webmanifest icons/screenshots, JS object literals
    // in built chunks — minified keys are UNQUOTED, so quotes are optional; the
    // lookbehind stops partial-identifier matches like mysrc:) — an absolute
    // value in any of these escapes the bundle prefix
    { pattern: /(?<![\w$])["']?(?:src|href|url|icon|image|poster)["']?\s*:\s*["']\/(?!\/)/, label: 'src|href|url|…: "/' },
    { pattern: /navigator\.serviceWorker\.register\(/, label: 'navigator.serviceWorker.register(' },
  ]

  function scanDir(dir: string): { file: string; matches: string[] }[] {
    const findings: { file: string; matches: string[] }[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        findings.push(...scanDir(full))
        continue
      }
      const ext = extname(entry.name)
      if (!['.js', '.mjs', '.html', '.css', '.svg', '.json', '.webmanifest', '.xml'].includes(ext)) continue
      const content = readFileSync(full, 'utf8')
      const matches = ABSOLUTE_PATTERNS
        .filter(({ pattern }) => pattern.test(content))
        .map(({ label }) => label)
      if (matches.length > 0) findings.push({ file: full.replace(DIST_DIR + '/', ''), matches })
    }
    return findings
  }

  const findings = scanDir(DIST_DIR)
  expect(
    findings,
    `Absolute path refs found:\n${findings.map((f) => `  ${f.file}: ${f.matches.join(', ')}`).join('\n')}`,
  ).toEqual([])
})
